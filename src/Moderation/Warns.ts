import {
  EmbedBuilder,
  channelMention,
  inlineCode,
  time,
  userMention,
} from "discord.js";
import { ButtonPaginationBuilder } from "@thenorthsolution/djs-pagination";
import { SlashCommandBuilder } from "reciple";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";
import { Warnings } from "@prisma/client";

export class Warns extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      new SlashCommandBuilder()
        .setName("warns")
        .setDMPermission(false)
        .setDescription("Проверка предупреждений пользователя на этом сервере")
        .addUserOption((user) =>
          user
            .setName("user")
            .setDescription("Пользователь для проверки предупреждений")
        )
        .setExecute(async ({ interaction }) => {
          if (!interaction.inCachedGuild()) return;

          const user = interaction.options.getUser("user") || interaction.user;

          await interaction.deferReply({ ephemeral: true });

          const pagination = await this.getWarningsPagination(
            user.id,
            interaction.guildId
          );

          await pagination.send({
            command: interaction,
            sendAs: "EditMessage",
          });
        }),
    ];

    return true;
  }

  public async getWarningsPagination(
    userId: string,
    guildId?: string
  ): Promise<ButtonPaginationBuilder> {
    const pagination = new ButtonPaginationBuilder();

    pagination.setEndTimer(20 * 1000);
    pagination.addButtons(Utility.paginationButtons());

    const warnings: Warnings[] = await Utility.prisma.warnings
      .findMany({
        where: { userId, guildId },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => []);

    if (!warnings.length) {
      pagination.addPages(
        Utility.createErrorMessage(
          "Для этого пользователя не найдено предупреждений"
        )
      );
      return pagination;
    }

    let currentPage: number = 1;

    for (const warning of warnings) {
      const page = new EmbedBuilder();
      const moderator = await Utility.client.users
        .fetch(warning.moderatorId)
        .catch(() => null);

      page.setAuthor({
        name: `Предупрежден модератером ${
          moderator ? "@" + moderator.username : "unknown"
        }`,
        iconURL: moderator?.displayAvatarURL(),
      });
      page.setColor(Utility.embedColor);
      page.setThumbnail(Utility.embedThumbnailURL);

      if (warning.reason)
        page.addFields({
          name: Utility.createLabel("Причина", "📝"),
          value: warning.reason,
        });
      if (warning.channelId)
        page.addFields({
          name: Utility.createLabel("Предупрежден в", "💭"),
          value: channelMention(warning.channelId),
        });

      page.addFields({
        name: Utility.createLabel("Предупрежден", "🕒"),
        value: `${time(warning.createdAt, "R")} (${time(warning.createdAt)})`,
      });
      page.addFields({
        name: Utility.createLabel("Участник", "👤"),
        value: `${userMention(warning.userId)} ${inlineCode(warning.userId)}`,
      });
      page.setFooter({
        text: `${warning.id} ● Страница ${currentPage}/${warnings.length}`,
      });

      if (warning.endsAt)
        page.addFields({
          name: Utility.createLabel("Заканчивается в", "⌛"),
          value: time(warning.endsAt, "R"),
        });

      pagination.addPages({
        content: `${userMention(warning.userId)} был предупрежден **${
          warnings.length
        } раз(а)**`,
        embeds: [page],
      });
      currentPage++;
    }

    return pagination;
  }
}

export default new Warns();
