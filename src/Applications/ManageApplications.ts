import { SlashCommandBuilder } from "reciple";
import { BaseModule } from "../BaseModule.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildTextBasedChannel,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { InteractionListenerType } from "reciple-interaction-events";
import Utility from "../Utils/Utility.js";

export class ManageApplications extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      new SlashCommandBuilder()
        .setName("manage-applications")
        .setDescription("Управлять наборами")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand((add) =>
          add.setName("add").setDescription("Добавить набор")
        )
        .addSubcommand((get) =>
          get.setName("get").setDescription("Получить все наборы")
        )
        .addSubcommand((remove) =>
          remove.setName("remove").setDescription("Удалить набор")
        )
        .setExecute(async ({ interaction }) => {
          if (!interaction.inCachedGuild()) return;

          const subcommand = interaction.options.getSubcommand() as
            | "add"
            | "set"
            | "remove";

          await interaction.deferReply();

          switch (subcommand) {
            case "add": {
              const reply = await interaction.editReply(
                Utility.createWarningMessage(
                  "Подождите, идёт подготовка для создания набора..."
                )
              );

              await Utility.prisma.application.create({
                data: {
                  guildId: interaction.guildId,
                  userId: interaction.user.id,
                  channelId: interaction.channelId,
                },
              });

              const components = this.CreateApplicationExampleMessage(reply.id);

              await interaction.editReply(components);
              break;
            }
          }
        }),
    ];

    this.interactionListeners = [
      {
        type: InteractionListenerType.Button,
        customId: (i) => i.customId.startsWith("add-btn-question"),
        execute: async (interaction) => {
          await interaction.showModal(
            this.createModal(true, interaction.user.id)
          );
        },
      },
      {
        type: InteractionListenerType.Button,
        customId: (i) => i.customId.startsWith("add-btn-name"),
        execute: async (interaction) => {
          await interaction.showModal(
            this.createModal(false, interaction.user.id)
          );
        },
      },
      {
        type: InteractionListenerType.ModalSubmit,
        customId: (i) => i.customId.startsWith("add-question-modal"),
        execute: async (interaction) => {
          await interaction.deferUpdate();

          const question =
            interaction.fields.getTextInputValue("question-text");
          const messageId = interaction.customId.split(" ")[1];

          const application = await Utility.prisma.application.findFirst({
            where: {
              guildId: interaction.guildId!,
              finished: false,
            },
            include: {
              questions: true,
            },
          });

          if (application?.questions.length! >= 5) {
            await interaction.followUp({
              content: Utility.createErrorMessage("Лимит вопросов достигнут!"),
            });
            return;
          }

          await Utility.prisma.question.create({
            data: {
              question,
              guildId: interaction.guildId!,
              applicationId: application!.id,
            },
          });

          const channel = interaction.guild!.channels.cache.get(
            application!.channelId!
          ) as GuildTextBasedChannel;

          const message = await channel.messages.fetch(messageId);

          const updatedApplication = await Utility.prisma.application.findFirst(
            {
              where: {
                guildId: interaction.guildId!,
                id: application!.id,
              },
              include: {
                questions: true,
              },
            }
          );

          const applicationQuestionsAmount =
            updatedApplication?.questions.length!;

          const embed = new EmbedBuilder()
            .setTitle("Создание примера набора")
            .setColor(Utility.embedColor)
            .setDescription(
              `> - \`${
                applicationQuestionsAmount <= 5 ? "⚠" : "✅"
              }\` Добавлено вопросов ${applicationQuestionsAmount}/5:${updatedApplication?.questions.join(
                "\n> "
              )}\n> - \`❌\` Название не добавлено`
            )
            .setTimestamp();

          await message.edit({
            embeds: [embed],
          });
        },
      },
      {
        type: InteractionListenerType.ModalSubmit,
        customId: (i) => i.customId.startsWith("add-name-modal"),
        execute: async (interaction) => {
          await interaction.deferUpdate();

          const name = interaction.fields.getTextInputValue("name-text");
          const messageId = interaction.customId.split(" ")[1];

          const application = await Utility.prisma.application.findFirst({
            where: {
              guildId: interaction.guildId!,
              finished: false,
            },
          });

          if (application) {
            await Utility.prisma.application.update({
              where: {
                id: application.id,
              },
              data: {
                name,
              },
            });

            const channel = (await interaction.guild!.channels.fetch(
              application.channelId!
            )) as GuildTextBasedChannel;

            const message = await channel.messages.fetch(messageId);

            const embed = new EmbedBuilder()
              .setTitle("Создание примера набора")
              .setColor(Utility.embedColor)
              .setDescription(
                `> - \`❌\` Добавлено вопросов 0/5\n> - \`✅\` Название добавлено:\n> ${name}`
              )
              .setTimestamp();

            await message.edit({
              embeds: [embed],
            });
          }
        },
      },
    ];

    return true;
  }

  public createModal(isQuestion: boolean, messageId: string) {
    const modal = new ModalBuilder()
      .setCustomId(`add-${isQuestion ? "question" : "name"}-modal ${messageId}`)
      .setTitle(isQuestion ? "Добавить вопрос" : "Добавить название");

    const Input = new TextInputBuilder()
      .setCustomId(isQuestion ? "question-text" : "name-text")
      .setLabel(isQuestion ? "Вопрос" : "Название")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(isQuestion ? 45 : 25);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(Input)
    );

    return modal;
  }

  public CreateApplicationExampleMessage(messageId: string) {
    const embed = new EmbedBuilder()
      .setTitle("Создание примера набора")
      .setColor(Utility.embedColor)
      .setDescription(
        "> - `❌` Добавлено вопросов 0/5\n> - `❌` Название не добавлено"
      )
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`add-btn-question ${messageId}`)
        .setLabel("Добавить вопрос")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`add-btn-name ${messageId}`)
        .setLabel("Добавить название")
        .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`add-btn-submit ${messageId}`)
        .setLabel("Создать набор")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`add-btn-cancel ${messageId}`)
        .setLabel("Отмена")
        .setStyle(ButtonStyle.Danger)
    );

    return {
      embeds: [embed],
      components: [row, row2],
      content: "",
    };
  }
}

export default new ManageApplications();
