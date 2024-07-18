import { SlashCommandBuilder } from "reciple";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";
import { PermissionFlagsBits } from "discord.js";

export class VerifyConfig extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      new SlashCommandBuilder()
        .setName("verify-config")
        .setDescription("Настройки верификации")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((set) =>
          set
            .setName("set")
            .setDescription("Установить настройки")
            .addRoleOption((role) =>
              role.setName("add-role").setDescription("Добавить роль")
            )
            .addRoleOption((role) =>
              role.setName("remove-role").setDescription("Удалить роль")
            )
            .addBooleanOption((enabled) =>
              enabled.setName("enabled").setDescription("Включить/выключить")
            )
        )
        .setExecute(async ({ interaction }) => {
          const addRole = interaction.options.getRole("add-role");
          const removeRole = interaction.options.getRole("remove-role");
          const enabled = interaction.options.getBoolean("enabled");

          await interaction.deferReply({ ephemeral: true });

          const config = await Utility.prisma.verifyConfig.findUnique({
            where: { guildId: interaction.guildId! },
          });

          let updatedRoles: string[];

          if (config) {
            updatedRoles = config.roles;
            if (addRole) {
              updatedRoles = [...new Set([...updatedRoles, addRole.id])];
            }
            if (removeRole) {
              updatedRoles = updatedRoles.filter((r) => r !== removeRole.id);
            }
          } else {
            updatedRoles = addRole ? [addRole.id] : [];
          }

          await Utility.prisma.verifyConfig.upsert({
            where: { guildId: interaction.guildId! },
            update: {
              roles: updatedRoles,
              enabled: enabled !== null ? enabled : config?.enabled ?? false,
            },
            create: {
              guildId: interaction.guildId!,
              roles: updatedRoles,
              enabled: enabled !== null ? enabled : false,
            },
          });

          await interaction.editReply({
            content: `${Utility.createSuccessMessage(
              "Настройки успешно обновлены"
            )}`,
          });
        }),
    ];

    return true;
  }
}

export default new VerifyConfig();
