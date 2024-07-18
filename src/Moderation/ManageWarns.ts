import { SlashCommandBuilder } from "reciple";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";
import { bold } from "discord.js";

export class ManageWarns extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      new SlashCommandBuilder()
        .setName("manage-warns")
        .setDescription(
          "Управление предупреждениями пользователей на этом сервере"
        )
        .setRequiredMemberPermissions("KickMembers")
        .setDMPermission(false)
        .addSubcommand((remove) =>
          remove
            .setName("remove")
            .setDescription("Снять предупреждение с пользователя")
            .addUserOption((user) =>
              user
                .setName("user")
                .setDescription(
                  "Пользователь, с которого вы хотите снять предупреждения"
                )
                .setRequired(true)
            )
            .addStringOption((warning) =>
              warning
                .setName("warning")
                .setDescription(
                  "Предупреждение, которое вы хотите снять с пользователя"
                )
                .setRequired(true)
            )
        )
        .addSubcommand((clear) =>
          clear
            .setName("clear")
            .setDescription("Снять предупреждения с пользователя")
            .addUserOption((user) =>
              user
                .setName("user")
                .setDescription(
                  "Пользователь, с которого вы хотите снять предупреждения"
                )
                .setRequired(true)
            )
        )
        .setExecute(async ({ interaction }) => {
          if (!interaction.inCachedGuild()) return;

          const user = interaction.options.getUser("user", true);
          const subcommand = interaction.options.getSubcommand(true) as
            | "remove"
            | "clear";

          await interaction.deferReply({ ephemeral: true });

          switch (subcommand) {
            case "remove":
              const warningId = interaction.options.getString("warning", true);
              const warning = await Utility.prisma.warnings.findFirst({
                where: {
                  userId: user.id,
                  guildId: interaction.guildId,
                  id: warningId,
                },
              });

              if (!warning) {
                await interaction.editReply(
                  Utility.createErrorMessage("Unable to resolve user warning")
                );
                return;
              }

              await Utility.prisma.warnings.delete({
                where: { id: warning.id },
              });
              await interaction.editReply(
                Utility.createSuccessMessage(
                  `Удалено ${
                    warning.reason ? bold(warning.reason) + " " : ""
                  } предупреждение от ${user}`
                )
              );

              return;
            case "clear":
              const cleared = await Utility.prisma.warnings.deleteMany({
                where: { userId: user.id, guildId: interaction.guildId },
              });
              await interaction.editReply(
                Utility.createSuccessMessage(
                  `Удалено **${cleared.count}** предупреждений у ${user}`
                )
              );
              return;
          }
        }),
    ];

    return true;
  }
}

export default new ManageWarns();
