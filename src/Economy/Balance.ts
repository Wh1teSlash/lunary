import { MessageCommandBuilder, SlashCommandBuilder } from "reciple";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";
import { EmbedBuilder, User, codeBlock } from "discord.js";
import { randomInt } from "fallout-utility";

export interface BalanceData {
  userId: string;
  money: number;
}

export class Balance extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      new SlashCommandBuilder()
        .setName("balance")
        .setDescription("Узнать баланс")
        .addUserOption((user) =>
          user.setName("user").setDescription("Пользователь")
        )
        .setExecute(async ({ interaction }) => {
          const user = interaction.options.getUser("user") || interaction.user;

          await interaction.deferReply();

          const balance = await Utility.prisma.economy.findUnique({
            where: { id: user.id },
            select: { money: true },
          });

          if (!balance) {
            await Utility.prisma.economy.create({
              data: {
                id: user.id,
                money: 0,
              },
            });

            const embed = new EmbedBuilder()
              .setColor(Utility.embedColor)
              .setThumbnail(user.displayAvatarURL())
              .setTimestamp()
              .setTitle(`Баланс пользователя ${user.displayName}`)
              .setFields({
                name: Utility.createLabel("Баланс", "💸"),
                value: `${codeBlock(`${0}`)}`,
              });

            await interaction.editReply({
              embeds: [embed],
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(Utility.embedColor)
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp()
            .setTitle(`Баланс пользователя ${user.displayName}`)
            .setFields({
              name: Utility.createLabel("Баланс", "💸"),
              value: `${codeBlock(`${balance.money}`)}`,
            });

          await interaction.editReply({
            embeds: [embed],
          });
        }),
    ];

    return true;
  }

  public getRandomMoney(options?: {
    min?: number;
    max?: number;
    negative?: boolean;
  }): number {
    let money = randomInt(options?.min ?? 1, options?.max ?? 100);
    return (money = money >= 0 ? (options?.negative ? money * -1 : money) : 0);
  }

  public async addMoney(
    userId: string,
    addedMoney: number
  ): Promise<BalanceData> {
    const userData = await Utility.prisma.economy.findUnique({
      where: { id: userId },
      select: { money: true },
    });

    await Utility.prisma.economy.upsert({
      where: { id: userId },
      update: { money: userData!.money + addedMoney },
      create: { id: userId, money: addedMoney },
    });

    return {
      userId,
      money: userData!.money + addedMoney,
    };
  }
}

export default new Balance();
