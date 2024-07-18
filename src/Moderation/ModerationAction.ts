import {
  bold,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Collection,
  ComponentType,
  EmbedBuilder,
  GuildMember,
  inlineCode,
  InteractionCollector,
  Message,
  ModalComponentData,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
  userMention,
} from "discord.js";
import { MessageURLData } from "@reciple/utils";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";
import { EventEmitter } from "events";
import Mute from "./Mute.js";
import Warn from "./Warn.js";
import Ban from "./Ban.js";
import ms from "ms";

export class ModerationAction extends BaseModule {
  public handlingRecord: Collection<string, string> = new Collection();

  public async onStart(): Promise<boolean> {
    return true;
  }

  public async handleModerationActionComponent(
    interaction: StringSelectMenuInteraction<"cached">,
    newSelectMenu: StringSelectMenuBuilder
  ) {
    await interaction.deferReply({ ephemeral: true });

    const message = interaction.message;
    const thread = interaction.message.channel as ThreadChannel;
    const [_, actionType, idResolvable, reportedById] =
      interaction.customId.split(" ") as [
        string,
        "message" | "user",
        string,
        string
      ];
    const [type, action] = interaction.values[0].split("-") as [
      "delete" | "false",
      "warn" | "ban" | "timeout" | undefined
    ];
    const reportedBy = await interaction.client.users.fetch(reportedById);
    const moderator =
      (await interaction.guild?.members.fetch(interaction.user.id)) ?? null;

    let reportedMember: GuildMember | null = null;
    let reportedMessage: Message | null = null;

    switch (actionType) {
      case "message":
        const [channelId, messageId] = idResolvable.split("/");

        reportedMessage = (
          await MessageURLData.fetch(
            `https://discord.com/channels/${interaction.guildId}/${channelId}/${messageId}`,
            interaction.client
          )
        ).message;
        reportedMember = reportedMessage.member;

        break;
      case "user":
        reportedMember =
          (await interaction.guild?.members.fetch(idResolvable)) ?? null;
    }

    if (!message || !reportedMember) {
      await interaction.editReply(
        Utility.createErrorMessage(
          "Невозможно получить исходную цель этого сообщения"
        )
      );
      return;
    }

    const reportUpdateEmbed = new EmbedBuilder()
      .setAuthor({ name: `Report Status` })
      .setThumbnail(Utility.embedThumbnailURL)
      .setColor(Utility.embedColor)
      .setTitle(
        `Обновление информации по представленному вами отчету о ${reportedMember.displayName}`
      )
      .setFields({
        name: `Проверено`,
        value: `${bold(moderator.user.displayName)} ${inlineCode(
          moderator.id
        )}`,
      })
      .setTimestamp();

    if (type === "false") {
      await message.edit({
        components: [
          {
            type: ComponentType.ActionRow,
            components: [newSelectMenu],
          },
        ],
        allowedMentions: { parse: [] },
      });

      await interaction.editReply(
        Utility.createSuccessMessage("Помечено как ложный репорт")
      );
      await thread.setArchived(true, `${interaction.user} | ${type}`);

      if (!reportedBy.bot)
        await reportedBy
          .send({
            embeds: [
              reportUpdateEmbed.setDescription(
                `Мы изучили ваш отчет и не нашли нарушений наших правил. Спасибо, что обратили наше внимание на этот случай. Если вы считаете, что произошла оплошность, подайте новый отчет и предоставьте доказательства по этому вопросу.`
              ),
            ],
          })
          .catch(() => null);

      return;
    }

    if (action && reportedMember) {
      const modActionError =
        reportedMember &&
        Utility.getModerationMemberActionError(reportedMember, moderator);
      const reason = `Действие предпринятое на основе сообщения`;

      if (modActionError) {
        await interaction.editReply(
          Utility.createModerationActionErrorMessage(modActionError)
        );
        return;
      }

      switch (action) {
        case "warn":
          const warnOptions = await this.createWarnConfirmMessage(interaction);
          if (!warnOptions) {
            await interaction.editReply(
              Utility.createErrorMessage("Сообщение истекло по времени")
            );
            return;
          }

          await Warn.warnUser({
            userId: reportedMember.id,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            moderatorId: interaction.user.id,
            reason,
            ...warnOptions,
          });

          await Warn.punishMember(reportedMember);
          break;
        case "ban":
          const banOptions = await this.createBanConfirmMessage(interaction);
          if (!banOptions) {
            await interaction.editReply(
              Utility.createErrorMessage("Сообщение истекло по времени")
            );
            return;
          }

          await Ban.banMember(reportedMember, moderator.user, {
            guild: interaction.guild,
            reason,
            ...banOptions,
          });
          break;
        case "timeout":
          const timeoutOptions = await this.createTimeoutConfirmMessage(
            interaction
          );
          if (!timeoutOptions) {
            await interaction.editReply(
              Utility.createErrorMessage("Сообщение истекло по времени")
            );
            return;
          }

          await Mute.timeoutMember(reportedMember, moderator.user, {
            guild: interaction.guild,
            duration: 1000 * 60 * 60,
            reason,
            ...timeoutOptions,
          });
      }
    }

    if (type === "delete") await reportedMessage?.delete().catch(() => null);

    await interaction.editReply({
      content: Utility.createSuccessMessage(`Приняты меры по модерации`),
      components: [],
    });

    await message.edit({
      content: `Меры по модерации были приняты ${interaction.user}`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [newSelectMenu],
        },
      ],
      allowedMentions: { parse: [] },
    });

    await thread.setArchived(true, `${interaction.user} | ${type}`);

    if (!reportedBy.bot)
      await reportedBy
        .send({
          embeds: [
            reportUpdateEmbed.setDescription(
              `Мы рассмотрели ваш репорт и приняли необходимые меры по отношению к участнику. Мы ценим ваше сотрудничество в поддержании уважительного и безопасного сообщества.`
            ),
          ],
        })
        .catch(() => null);
  }

  public async createWarnConfirmMessage(
    interaction: StringSelectMenuInteraction
  ): Promise<{ reason?: string; duration?: number } | null> {
    const handlerId = this.handlingRecord.get(interaction.message.id);
    if (handlerId && handlerId !== interaction.user.id) {
      await interaction.editReply(
        Utility.createErrorMessage(
          `Репорт в данный момент обрабатывается пользователем ${userMention(
            handlerId
          )}`
        )
      );
      return null;
    }

    const message = await interaction.editReply({
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            new ButtonBuilder()
              .setCustomId("confirm-warning")
              .setLabel("Подтвердите")
              .setStyle(ButtonStyle.Success),
          ],
        },
      ],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) =>
        i.customId === "confirm-warning" && i.user.id === interaction.user.id,
      time: 60000,
    });

    let data: { reason?: string; duration?: number } | null = null;

    await this.awaitModalConfirmation(collector, {
      id: interaction.message.id,
      modal: {
        customId: "warning-options",
        title: "Варн участника",
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Причина")
                .setStyle(TextInputStyle.Short)
                .setRequired(false),
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              new TextInputBuilder()
                .setCustomId("duration")
                .setLabel("Время")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("1m, 1h, 1d")
                .setRequired(false),
            ],
          },
        ],
      },
      handleInteraction: async (interaction) => {
        data = {
          reason: interaction.fields.getTextInputValue("reason") || undefined,
          duration: ms(interaction.fields.getTextInputValue("duration")),
        };
      },
    });
    return data;
  }

  public async createBanConfirmMessage(
    interaction: StringSelectMenuInteraction
  ): Promise<{ reason?: string } | null> {
    const handlerId = this.handlingRecord.get(interaction.message.id);
    if (handlerId && handlerId !== interaction.user.id) {
      await interaction.editReply(
        Utility.createErrorMessage(
          `Репорт в данный момент обрабатывается пользователем ${userMention(
            handlerId
          )}`
        )
      );
      return null;
    }

    const message = await interaction.editReply({
      content: `Нажмите кнопку для подтверждения`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            new ButtonBuilder()
              .setCustomId("confirm-ban")
              .setLabel("Confirm")
              .setStyle(ButtonStyle.Success),
          ],
        },
      ],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) =>
        i.customId === "confirm-ban" && i.user.id === interaction.user.id,
      time: 60000,
    });

    let data: { reason?: string } | null = null;

    await this.awaitModalConfirmation(collector, {
      id: interaction.message.id,
      modal: {
        customId: "ban-options",
        title: "Забанить участника",
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Причина")
                .setStyle(TextInputStyle.Short)
                .setRequired(false),
            ],
          },
        ],
      },
      handleInteraction: async (interaction) => {
        data = {
          reason: interaction.fields.getTextInputValue("reason") || undefined,
        };
      },
    });
    return data;
  }

  public async createKickConfirmMessage(
    interaction: StringSelectMenuInteraction
  ): Promise<{ reason?: string } | null> {
    const handlerId = this.handlingRecord.get(interaction.message.id);
    if (handlerId && handlerId !== interaction.user.id) {
      await interaction.editReply(
        Utility.createErrorMessage(
          `Репорт в данный момент обрабатывается пользователем ${userMention(
            handlerId
          )}`
        )
      );
      return null;
    }

    const message = await interaction.editReply({
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            new ButtonBuilder()
              .setCustomId("confirm-kick")
              .setLabel("Подтвердите")
              .setStyle(ButtonStyle.Success),
          ],
        },
      ],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) =>
        i.customId === "confirm-kick" && i.user.id === interaction.user.id,
      time: 60000,
    });

    let data: { reason?: string } | null = null;

    await this.awaitModalConfirmation(collector, {
      id: interaction.message.id,
      modal: {
        customId: "kick-options",
        title: "Кикнуть участника",
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Причина")
                .setStyle(TextInputStyle.Short)
                .setRequired(false),
            ],
          },
        ],
      },
      handleInteraction: async (interaction) => {
        data = {
          reason: interaction.fields.getTextInputValue("reason") || undefined,
        };
      },
    });
    return data;
  }

  public async createTimeoutConfirmMessage(
    interaction: StringSelectMenuInteraction
  ): Promise<{ reason?: string; duration?: number } | null> {
    const handlerId = this.handlingRecord.get(interaction.message.id);
    if (handlerId && handlerId !== interaction.user.id) {
      await interaction.editReply(
        Utility.createErrorMessage(
          `Репорт в данный момент обрабатывается пользователем ${userMention(
            handlerId
          )}`
        )
      );
      return null;
    }

    const message = await interaction.editReply({
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            new ButtonBuilder()
              .setCustomId("confirm-timeout")
              .setLabel("Подтвердите")
              .setStyle(ButtonStyle.Success),
          ],
        },
      ],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) =>
        i.customId === "confirm-timeout" && i.user.id === interaction.user.id,
      time: 60000,
    });

    let data: { reason?: string; duration?: number } | null = null;

    await this.awaitModalConfirmation(collector, {
      id: interaction.message.id,
      modal: {
        customId: "timeout-options",
        title: "Тайм-аут участника",
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Причина")
                .setStyle(TextInputStyle.Short)
                .setRequired(false),
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              new TextInputBuilder()
                .setCustomId("duration")
                .setLabel("Время")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("1m, 1h, 1d")
                .setRequired(true),
            ],
          },
        ],
      },
      handleInteraction: async (interaction) => {
        data = {
          reason: interaction.fields.getTextInputValue("reason") || undefined,
          duration: ms(interaction.fields.getTextInputValue("duration")),
        };
      },
    });

    return data;
  }

  public async awaitModalConfirmation(
    collector: InteractionCollector<ButtonInteraction>,
    options: {
      id: string;
      modal: ModalComponentData;
      handleInteraction: (i: ModalSubmitInteraction) => any;
    }
  ): Promise<void> {
    collector.on("collect", async (interaction) => {
      const handlerId = this.handlingRecord.get(options.id);

      if (handlerId && handlerId !== interaction.user.id) {
        await interaction.reply({
          content: Utility.createErrorMessage(
            `Репорт в данный момент обрабатывается пользователем ${userMention(
              handlerId
            )}`
          ),
          ephemeral: true,
        });
        return;
      }

      await interaction.showModal(options.modal);
      this.handlingRecord.set(options.id, interaction.user.id);

      collector.resetTimer();

      const modal = await interaction.awaitModalSubmit({ time: 60000 });

      await modal.reply({
        content: Utility.createSuccessMessage("Опции отправлены"),
        ephemeral: true,
      });
      await Promise.resolve(options.handleInteraction(modal));

      collector.stop();
    });

    await EventEmitter.once(collector, "end");
    this.handlingRecord.delete(options.id);
  }
}

export default new ModerationAction();
