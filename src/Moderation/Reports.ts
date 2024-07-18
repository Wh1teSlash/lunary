import { ContextMenuCommandBuilder, RecipleModuleStartData } from "reciple";
import { BaseModule } from "../BaseModule.js";
import {
  APISelectMenuOption,
  APIStringSelectComponent,
  ComponentType,
  EmbedBuilder,
  Message,
  ModalComponentData,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
  ThreadOnlyChannel,
  User,
  UserContextMenuCommandInteraction,
  inlineCode,
  time,
} from "discord.js";
import ModerationAction from "./ModerationAction.js";
import Utility from "../Utils/Utility.js";
import { InteractionListenerType } from "reciple-interaction-events";

export class Reports extends BaseModule {
  public reportsChannelId = process.env.REPORTS_CHANNEL_ID;

  public async onStart(
    data: RecipleModuleStartData
  ): Promise<string | boolean> {
    if (!this.reportsChannelId) return "Env REPORTS_CHANNEL_ID is not defined";
    this.commands = [
      new ContextMenuCommandBuilder()
        .setName("Зарепортить Сообщение")
        .setType("Message"),
      new ContextMenuCommandBuilder()
        .setName("Зарепортить пользователя")
        .setType("User"),
    ];
    this.interactionListeners = [
      {
        type: InteractionListenerType.ContextMenu,
        commandName: (i) =>
          ["Зарепортить Сообщение", "Зарепортить пользователя"].includes(
            i.commandName
          ),
        execute: async (interaction) => {
          const target = interaction.isMessageContextMenuCommand()
            ? interaction.targetMessage
            : (interaction as UserContextMenuCommandInteraction<"cached">)
                .targetUser;
          const member = interaction.isMessageContextMenuCommand()
            ? interaction.targetMessage.member
            : (interaction as UserContextMenuCommandInteraction<"cached">)
                .targetMember;

          if (member) {
            if (member.user.bot) {
              await interaction.reply({
                content: Utility.createErrorMessage(
                  "Вы не можете зарепортить бота"
                ),
                ephemeral: true,
              });
              return;
            }
          }

          await interaction.showModal(this.createModal(target));
        },
      },
      {
        type: InteractionListenerType.ModalSubmit,
        customId: (i) => i.customId.startsWith("report"),
        execute: async (interaction) => {
          await interaction.deferReply({ ephemeral: true });

          const [_, type, id] = interaction.customId.split(" ") as [
            string,
            "message" | "user",
            string
          ];
          const reason = interaction.fields.getTextInputValue("reason");

          let thread: ThreadChannel | null = null;

          switch (type) {
            case "message":
              const message = await interaction.channel?.messages
                .fetch(id)
                .catch(() => null);

              if (!message) {
                await interaction.editReply(
                  Utility.createErrorMessage("Unable to resolve message")
                );
                return;
              }

              thread = await this.reportMessage(message, {
                reason,
                reportedBy: interaction.user,
              });
              break;
            case "user":
              const user = await Utility.client?.users
                .fetch(id)
                .catch(() => null);

              if (!user) {
                await interaction.editReply(
                  Utility.createErrorMessage("Unable to resolve user")
                );
                return;
              }

              thread = await this.reportUser(user, {
                reason,
                reportedBy: interaction.user,
              });
          }

          await interaction.editReply(
            thread
              ? Utility.createSuccessMessage("Report sent")
              : Utility.createErrorMessage("Unable to create your report")
          );
        },
      },
      {
        type: InteractionListenerType.SelectMenu,
        customId: (i) => i.customId.startsWith("report-action"),
        execute: async (interaction) => {
          if (!interaction.isStringSelectMenu() || !interaction.inCachedGuild())
            return;

          const [_, actionType] = interaction.customId.split(" ") as [
            string,
            "message" | "user"
          ];

          await ModerationAction.handleModerationActionComponent(
            interaction,
            actionType === "message"
              ? this.createMessageReportComponents(interaction.message, {
                  disabled: true,
                  selected: interaction.values[0],
                  options: (
                    interaction.message.components[0].components[0]
                      .data as APIStringSelectComponent
                  ).options,
                })
              : this.createUserReportComponents(interaction.user, {
                  disabled: true,
                  selected: interaction.values[0],
                  options: (
                    interaction.message.components[0].components[0]
                      .data as APIStringSelectComponent
                  ).options,
                })
          );
        },
      },
    ];

    return true;
  }

  public async reportUser(
    user: User,
    options: { reason: string; reportedBy: User }
  ): Promise<ThreadChannel | null> {
    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${options.reportedBy.displayName} зарепортил пользователя`,
        iconURL: options.reportedBy.displayAvatarURL(),
      })
      .setColor(Utility.embedColor)
      .setTimestamp()
      .setTitle(user.displayName)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "Причина", value: options.reason, inline: false },
        {
          name: "Пользователь",
          value: `${user} ${inlineCode(user.id)}`,
          inline: true,
        },
        {
          name: "Аккаунт создан",
          value: `${time(user.createdAt, "R")}`,
          inline: true,
        }
      );

    const threads = await this.getChannel();
    const thread = await threads?.threads.create({
      name: `${options.reportedBy.displayName} Зарепортил ${user.displayName}`,
      message: {
        embeds: [embed],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [this.createUserReportComponents(user, options)],
          },
        ],
      },
    });

    return thread ?? null;
  }

  public async reportMessage(
    message: Message,
    options: { reason: string; reportedBy: User }
  ): Promise<ThreadChannel | null> {
    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${options.reportedBy.displayName} Зарепортил сообщение`,
        iconURL: options.reportedBy.displayAvatarURL(),
      })
      .setColor(Utility.embedColor)
      .setTimestamp()
      .setTitle(
        `Зарепорченое сообщение было отправлено ${message.author.displayName}`
      )
      .setThumbnail(message.author.displayAvatarURL())
      .addFields(
        { name: "Причина", value: options.reason, inline: false },
        { name: "Сообщение", value: `${message.url}`, inline: true },
        { name: "Канал", value: `${message.channel.url}`, inline: true },
        {
          name: "Отправлено",
          value: `${time(message.createdAt, "R")}`,
          inline: true,
        },
        {
          name: "Пользователь",
          value: `${message.author} ${inlineCode(message.author.id)}`,
          inline: true,
        },
        {
          name: "Аккаунт создан",
          value: `${time(message.author.createdAt, "R")}`,
          inline: true,
        }
      );

    const threads = await this.getChannel();
    const thread = await threads?.threads.create({
      name: `${options.reportedBy.displayName} зарепортил ${message.author.displayName}`,
      message: {
        embeds: [embed],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [this.createMessageReportComponents(message, options)],
          },
        ],
      },
    });

    return thread ?? null;
  }

  public async getChannel(): Promise<ThreadOnlyChannel | null> {
    const channel = await Utility.client.channels.fetch(this.reportsChannelId!);
    return channel?.isThreadOnly() ? channel : null;
  }

  public createModal(target: User | Message): ModalComponentData {
    return {
      title: `Report ${
        target instanceof Message
          ? target.author.displayName
          : target.displayName
      }`,
      customId: `report ${target instanceof Message ? "message" : "user"} ${
        target.id
      }`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            new TextInputBuilder()
              .setLabel("Причина")
              .setStyle(TextInputStyle.Paragraph)
              .setCustomId("reason")
              .setPlaceholder("Нарушение правил: 1.8 1.7 1.7 и т.д.")
              .setMinLength(50)
              .setRequired(true),
          ],
        },
      ],
    };
  }

  public createUserReportComponents(
    user: User,
    options?: {
      selected?: string;
      disabled?: boolean;
      reportedBy?: User;
      options?: APISelectMenuOption[];
    }
  ): StringSelectMenuBuilder {
    return new StringSelectMenuBuilder()
      .setCustomId(`report-action user ${user.id} ${options?.reportedBy?.id}`)
      .setPlaceholder(options?.selected ?? `Выберите действие`)
      .setOptions(
        (
          options?.options ?? [
            {
              emoji: "✅",
              label: `Пометить как ложный репорт`,
              value: "false",
            },
            {
              emoji: "📝",
              label: `Варн ${user.displayName}`,
              value: `delete-warn`,
            },
            {
              emoji: "🔨",
              label: `Бан ${user.displayName}`,
              value: `delete-ban`,
            },
            {
              emoji: "⌚",
              label: `Тайм-аут ${user.displayName}`,
              value: `delete-timeout`,
            },
          ]
        ).map((o) =>
          options?.selected && o.value === options.selected
            ? { ...o, default: true }
            : o
        )
      )
      .setDisabled(options?.disabled ?? false)
      .setMaxValues(1)
      .setMinValues(1);
  }

  public createMessageReportComponents(
    message: Message,
    options?: {
      selected?: string;
      disabled?: boolean;
      reportedBy?: User;
      options?: APISelectMenuOption[];
    }
  ): StringSelectMenuBuilder {
    return new StringSelectMenuBuilder()
      .setCustomId(
        `report-action message ${message.channel.id}/${message.id} ${options?.reportedBy?.id}`
      )
      .setPlaceholder(options?.selected ?? `Выберите действие`)
      .setOptions(
        (
          options?.options ?? [
            {
              emoji: "✅",
              label: `Пометить как ложный репорт`,
              value: "false",
            },
            { emoji: "🗑️", label: `Удалить сообщение`, value: "delete" },
            {
              emoji: "📝",
              label: `Варн ${message.author.displayName} & Удалить сообщение`,
              value: `delete-warn`,
            },
            {
              emoji: "🔨",
              label: `Бан ${message.author.displayName} & Удалить сообщение`,
              value: `delete-ban`,
            },
            {
              emoji: "⌚",
              label: `Тайм-аут ${message.author.displayName} & Удалить сообщение`,
              value: `delete-timeout`,
            },
          ]
        ).map((o) =>
          options?.selected && o.value === options.selected
            ? { ...o, default: true }
            : o
        )
      )
      .setDisabled(options?.disabled ?? false)
      .setMaxValues(1)
      .setMinValues(1);
  }
}

export default new Reports();
