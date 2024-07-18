import { SlashCommandBuilder } from "reciple";
import { BaseModule } from "../BaseModule.js";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import Utility from "../Utils/Utility.js";

class ApplicationsConfig extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      new SlashCommandBuilder()
        .setName("applications-config")
        .setDescription("Настроить наборы")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption((forum) =>
          forum
            .setName("forum")
            .setDescription("Форум для наборов")
            .addChannelTypes(ChannelType.GuildForum)
        )
        .addChannelOption((moderationForum) =>
          moderationForum
            .setName("moderation-forum")
            .setDescription("Форум для модерации наборов")
            .addChannelTypes(ChannelType.GuildForum)
        )
        .addRoleOption((role) =>
          role.setName("role").setDescription("Роль для модерации наборов")
        )
        .addBooleanOption((enabled) =>
          enabled
            .setName("enabled")
            .setDescription("Включить наборы")
            .setRequired(false)
        )
        .setExecute(async ({ interaction }) => {
          if (!interaction.inCachedGuild()) return;

          const forum =
            interaction.options.getChannel("forum", false, [
              ChannelType.GuildForum,
            ]) || undefined;
          const moderationForum =
            interaction.options.getChannel("moderation-forum", false, [
              ChannelType.GuildForum,
            ]) || undefined;
          const handlerRole = interaction.options.getRole("role") || undefined;
          const enabled =
            interaction.options.getBoolean("enabled") || undefined;

          await interaction.deferReply({ ephemeral: true });

          await Utility.prisma.applicationConfig.upsert({
            where: {
              guildId: interaction.guildId,
            },
            create: {
              guildId: interaction.guildId,
              forumId: forum?.id,
              moderationForumId: moderationForum?.id,
              roleId: handlerRole?.id,
              enabled,
            },
            update: {
              forumId: forum?.id,
              moderationForumId: moderationForum?.id,
              roleId: handlerRole?.id,
              enabled,
            },
          });

          await interaction.editReply(
            Utility.createSuccessMessage("Настройки наборов успешно изменены")
          );
        }),
    ];
    return true;
  }
}

export default new ApplicationsConfig();
