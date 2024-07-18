import { RecipleModuleStartData, SlashCommandBuilder } from "reciple";
import { BaseModule } from "../BaseModule.js";
import { randomInt } from "fallout-utility";
import Utility from "../Utils/Utility.js";
import { EmbedBuilder, inlineCode } from "discord.js";

export class CoinFlip extends BaseModule {
  public async onStart(data: RecipleModuleStartData): Promise<boolean> {
    this.commands = [
      new SlashCommandBuilder()
        .setName("coinflip")
        .setDescription("Подбросить монетку")
        .addStringOption((option) =>
          option
            .setName("coins")
            .setDescription("Количество монет")
            .setRequired(true)
        )
        .setExecute(async ({ interaction }) => {
          const coins = interaction.options.getString("coins");

          const result = randomInt(1, 100);

          await interaction.deferReply();

          const userData = await Utility.prisma.economy.findUnique({
            where: {
              id: interaction.user.id,
            },
          });

          if (!userData) {
            await Utility.prisma.economy.create({
              data: {
                id: interaction.user.id,
                money: 0,
              },
            });

            await interaction.editReply({
              content: Utility.createErrorMessage(
                "Недостаточно средств для выполнения этой команды"
              ),
            });
            return;
          }

          const userMoney = userData.money;
          const betAmount = Number(coins);

          if (userMoney < betAmount) {
            await interaction.editReply({
              content: Utility.createErrorMessage(
                "Недостаточно средств для выполнения этой команды"
              ),
            });
            return;
          }

          const isWin = result >= 50;
          const updatedMoney = isWin
            ? userMoney + betAmount
            : userMoney - betAmount;

          await Utility.prisma.economy.update({
            where: { id: interaction.user.id },
            data: { money: updatedMoney },
          });

          const embed = new EmbedBuilder()
            .setColor(isWin ? "Green" : "Red")
            .setTitle(isWin ? "Вы выиграли!" : "Вы проиграли")
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp()
            .setDescription(
              Utility.createLabel(
                `${isWin ? "Вы выиграли" : "Вы проиграли"} ${inlineCode(
                  `${coins}`
                )} монет. Ваш баланс: \`${updatedMoney}\``,
                "💸"
              )
            );

          await interaction.editReply({ embeds: [embed] });
        }),
    ];
    return true;
  }
}

export default new CoinFlip();
