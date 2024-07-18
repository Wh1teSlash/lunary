import { RecipleModuleStartData, SlashCommandBuilder } from "reciple";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";
import { inlineCode } from "discord.js";
import { randomInt } from "fallout-utility";

export class Daily extends BaseModule {
  public async onStart(data: RecipleModuleStartData): Promise<boolean> {
    this.commands = [
      new SlashCommandBuilder()
        .setName("daily")
        .setDescription("Получить деньги за сегодня")
        .setExecute(async ({ interaction }) => {
          const user = interaction.user;

          await interaction.deferReply({
            ephemeral: true,
          });

          const userData = await Utility.prisma.economy.findUnique({
            where: {
              id: user.id,
            },
          });

          if (!userData) {
            await Utility.prisma.economy.create({
              data: {
                id: user.id,
                money: 0,
                claimedAt: null,
              },
            });
          }

          const claimedAt = userData!.claimedAt;

          if (claimedAt && claimedAt.getTime() > Date.now() - 86400000) {
            const futureTime = new Date(
              claimedAt.getTime() + 24 * 60 * 60 * 1000
            );

            await interaction.editReply({
              content: Utility.createErrorMessage(
                `Вы уже забрали монетки за сегодня, попробуйте снова через: <t:${Math.floor(
                  futureTime.getTime() / 1000
                )}:R>`
              ),
            });
          } else {
            const random = randomInt(150, 300);

            await Utility.prisma.economy.update({
              where: {
                id: user.id,
              },
              data: {
                money: userData!.money + random,
                claimedAt: new Date(),
              },
            });

            await interaction.editReply({
              content: Utility.createSuccessMessage(
                `Вы забрали ${inlineCode(random.toString())} монеток за сегодня`
              ),
            });
          }
        }),
    ];

    return true;
  }
}

export default new Daily();
