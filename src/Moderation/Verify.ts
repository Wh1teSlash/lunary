import { SlashCommandBuilder } from "reciple";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";
import {
  ActionRowBuilder,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  User,
} from "discord.js";
import { InteractionListenerType } from "reciple-interaction-events";

export class Verify extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      new SlashCommandBuilder()
        .setName("verify")
        .setDescription("Верифицировать участника")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption((user) =>
          user
            .setName("user")
            .setDescription("Участник для верификации")
            .setRequired(true)
        )
        .setExecute(async ({ interaction }) => {
          const user = interaction.options.getUser("user");

          const config = await Utility.prisma.verifyConfig.findUnique({
            where: { guildId: interaction.guild!.id },
          });

          if (!config || !config.enabled) {
            await interaction.reply({
              content: Utility.createErrorMessage(
                "Верификация не настроена на этом сервере"
              ),
              ephemeral: true,
            });
            return;
          } else if (config.roles.length < 4) {
            await interaction.reply({
              content: Utility.createErrorMessage(
                "Верификация не может быть выполнена на этом сервере, так как добавлено менее 4 ролей"
              ),
              ephemeral: true,
            });
            return;
          }

          await interaction.deferReply({ ephemeral: true });

          await interaction.editReply(
            await this.createVerificationMessage(user!, interaction.guild!)
          );
        }),
    ];

    this.interactionListeners = [
      {
        type: InteractionListenerType.SelectMenu,
        customId: (i) => i.customId.startsWith("role-select"),
        execute: async (interaction) => {
          const [_, userId] = interaction.customId.split(" ");
          const user = await interaction.guild?.members.fetch(userId);

          const roles = interaction.values;

          for (const role of roles) {
            const fetchedRole = await interaction.guild?.roles.fetch(role);

            user!.roles.add(fetchedRole!);
          }

          await interaction.reply({
            content: Utility.createSuccessMessage("Вы успешно добавили роли"),
            ephemeral: true,
          });
        },
      },
    ];

    return true;
  }

  public async createVerificationMessage(user: User, guild: Guild) {
    const config = await Utility.prisma.verifyConfig.findUnique({
      where: { guildId: guild.id },
    });

    const roles = config?.roles;

    const fetchedRoles = [];

    for (const role of roles!) {
      const fetchedRole = await guild.roles.fetch(role);
      fetchedRoles.push(fetchedRole);
    }

    const embed = new EmbedBuilder()
      .setTitle("Верификация")
      .setAuthor({
        name: `${user.displayName}`,
        iconURL: user.displayAvatarURL(),
      })
      .setColor(Utility.embedColor)
      .setDescription(
        Utility.createLabel("Выберите роли ниже для этого участника.", "🎭")
      )
      .setTimestamp();

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`role-select ${user.id}`)
        .setPlaceholder("Выберите роли")
        .setMaxValues(4)
        .setMinValues(1)
        .addOptions(
          fetchedRoles.map((r) => ({
            label: r!.name,
            value: r!.id,
          }))
        )
    );

    return {
      embeds: [embed],
      components: [row],
    };
  }
}

export default new Verify();
