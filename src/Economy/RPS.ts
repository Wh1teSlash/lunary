import {
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  Message,
  User,
} from "discord.js";
import { BaseModule } from "../BaseModule.js";
import { SlashCommandBuilder } from "reciple";
import Utility from "../Utils/Utility.js";
import { ActionRowResolvable } from "@thenorthsolution/djs-pagination";
import Balance from "./Balance.js";

export interface RockPaperScissorsGameOptions {
  initialMessage: Message;
  player1: User;
  player2?: User;
  timeout?: number;
}

export interface RockPaperScissorsGamePlayer {
  user: User;
  choice?: RockPaperScissorsChoice;
}

export interface RockPaperScissorsGameResult {
  tie: boolean;
  winner: User | null;
  player1: Required<RockPaperScissorsGamePlayer>;
  player2: Required<RockPaperScissorsGamePlayer>;
  message: Message;
}

export enum RockPaperScissorsChoice {
  Rock = "камень",
  Paper = "бумага",
  Scissors = "ножницы",
}

export class RockPaperScissors extends BaseModule {
  public emojis: Record<RockPaperScissorsChoice, string> = {
    [RockPaperScissorsChoice.Rock]: "👊",
    [RockPaperScissorsChoice.Paper]: "📃",
    [RockPaperScissorsChoice.Scissors]: "✂",
  };

  public combinations = {
    [RockPaperScissorsChoice.Rock]: RockPaperScissorsChoice.Scissors,
    [RockPaperScissorsChoice.Scissors]: RockPaperScissorsChoice.Paper,
    [RockPaperScissorsChoice.Paper]: RockPaperScissorsChoice.Rock,
  };

  public async onStart(): Promise<boolean> {
    this.commands = [
      new SlashCommandBuilder()
        .setName("rps")
        .setCooldown(60000)
        .setDMPermission(false)
        .setDescription("Сыграть в Камень Ножницы Бумага")
        .addUserOption((opponent) =>
          opponent.setName("opponent").setDescription("Выбрать оппонента")
        )
        .setExecute(async ({ interaction }) => {
          const player1 = interaction.user;
          const player2 = interaction.options.getUser("opponent");

          if (player1.id === player2?.id) {
            await interaction.reply({
              content: Utility.createErrorMessage(
                "Вы не можете ставить себя на место противника"
              ),
              ephemeral: true,
            });
            return;
          }

          await interaction.reply(Utility.createLabel("Подготовка игры", "🎮"));
          const message = await interaction.fetchReply();

          await this.createGame({
            initialMessage: message,
            player1,
            player2: player2 ?? undefined,
          });
        }),
    ];

    return true;
  }

  public async createGame(
    options: RockPaperScissorsGameOptions
  ): Promise<RockPaperScissorsGameResult | null> {
    const message = options.initialMessage;

    let player: RockPaperScissorsGamePlayer = { user: options.player1 };
    let opponent: Required<RockPaperScissorsGamePlayer> | undefined =
      options.player2
        ? { user: options.player2, choice: RockPaperScissorsChoice.Rock }
        : undefined;

    const baseEmbed = new EmbedBuilder()
      .setAuthor({
        name: `Камень Ножницы Бумага`,
        iconURL: Utility.client.user.displayAvatarURL(),
      })
      .setFooter({
        text: `Ведущий(ая) ${player.user.displayName}`,
        iconURL: player.user.displayAvatarURL(),
      })
      .setColor(Utility.embedColor)
      .setTimestamp()
      .toJSON();

    await message.edit({
      content: " ",
      embeds: [
        new EmbedBuilder(baseEmbed).setDescription(
          Utility.createLabel(`очередь ${player.user}`, "⌛")
        ),
      ],
      components: this.createGameMessageComponents(),
      allowedMentions: {
        parse: [],
      },
    });

    const playerInteraction = await message
      .awaitMessageComponent({
        time: options.timeout ?? 60000,
        filter: (c) =>
          c.customId.startsWith("rps ") && c.user.id === player.user.id,
        componentType: ComponentType.Button,
      })
      .catch(() => null);

    await playerInteraction?.deferUpdate();
    if (!playerInteraction) {
      await message.edit({
        embeds: [
          new EmbedBuilder(baseEmbed).setDescription(
            Utility.createErrorMessage(`Игра вышла по таймеру`)
          ),
        ],
        components: this.createGameMessageComponents(true),
      });

      return null;
    }

    player.choice = playerInteraction.customId.split(
      " "
    )[1] as RockPaperScissorsChoice;

    await message.edit({
      embeds: [
        new EmbedBuilder(baseEmbed).setDescription(
          Utility.createLabel(
            opponent?.user ? `очередь ${opponent.user}` : `Ждет кого-то`,
            "⌛"
          )
        ),
      ],
      components: this.createGameMessageComponents(),
    });

    const opponentInteraction = await message
      .awaitMessageComponent({
        time: options.timeout ?? 60000,
        filter: (c) =>
          c.customId.startsWith("rps ") &&
          c.user.id !== player.user.id &&
          (!opponent?.user || opponent.user.id === c.user.id),
        componentType: ComponentType.Button,
      })
      .catch(() => null);

    await opponentInteraction?.deferUpdate();
    if (!opponentInteraction || !player.choice) {
      await message.edit({
        embeds: [
          new EmbedBuilder(baseEmbed).setDescription(
            Utility.createErrorMessage(`Игра вышла по таймеру`)
          ),
        ],
        components: this.createGameMessageComponents(true),
      });

      return null;
    }

    opponent = {
      user: opponentInteraction.user,
      choice: opponentInteraction.customId.split(
        " "
      )[1] as RockPaperScissorsChoice,
    };
    baseEmbed.title = `${player.user.displayName} vs ${opponent.user.displayName}`;

    const data: RockPaperScissorsGameResult = {
      player1: player as Required<RockPaperScissorsGamePlayer>,
      player2: opponent,
      message,
      tie: false,
      winner: null,
    };

    if (player.choice !== opponent.choice) {
      const loserChoice = this.combinations[player.choice];
      data.winner =
        opponent.choice === loserChoice ? player.user : opponent.user;
    } else {
      data.tie = true;
    }

    const winnerMoney = Balance.getRandomMoney({ max: 20 });
    const loserMoney = Balance.getRandomMoney({ max: 10, negative: true });

    let content: string = "";

    if (!data.tie && data.winner) {
      const loser =
        data.player1.user.id === data.winner.id
          ? data.player2.user
          : data.player1.user;

      let winnerLevelData = winnerMoney
        ? await Balance.addMoney(data.winner.id, winnerMoney).catch(() => null)
        : null;
      let loserLevelData = loserMoney
        ? await Balance.addMoney(loser.id, loserMoney).catch(() => null)
        : null;

      if (winnerLevelData)
        content += `> ${data.winner} +${winnerMoney} монет\n`;
      if (loserLevelData) content += `> ${loser} ${loserMoney} монет\n`;
    }

    await message.edit({
      content: content || " ",
      embeds: [
        new EmbedBuilder(baseEmbed)
          .setDescription(
            Utility.createLabel(
              data.tie ? `ничья` : `${data.winner} выйграл(а)!`,
              "🏆"
            )
          )
          .setFields(
            {
              name: player.user.displayName,
              value: Utility.createLabel(
                player.choice,
                this.emojis[player.choice]
              ),
            },
            {
              name: opponent.user.displayName,
              value: Utility.createLabel(
                opponent.choice,
                this.emojis[opponent.choice]
              ),
            }
          ),
      ],
      components: this.createGameMessageComponents(true),
    });

    return data;
  }

  public createGameMessageComponents(
    disabled: boolean = false
  ): ActionRowResolvable[] {
    return [
      {
        type: ComponentType.ActionRow,
        components: [
          new ButtonBuilder()
            .setCustomId("rps камень")
            .setEmoji("👊")
            .setLabel("Камень")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId("rps бумага")
            .setEmoji("📃")
            .setLabel("Бумага")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId("rps ножницы")
            .setEmoji("✂")
            .setLabel("Ножницы")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        ],
      },
    ];
  }
}

export default new RockPaperScissors();
