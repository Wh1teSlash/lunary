import { MessageCommandBuilder, SlashCommandBuilder } from "reciple";
import { InteractionListenerType } from "reciple-interaction-events";
import { getMentionId, isValidSnowflake } from "@reciple/utils";
import { escapeInlineCode, inlineCode } from "discord.js";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";

export class Unban extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      Utility.commonSlashCommandOptions(
        new SlashCommandBuilder()
          .setName("unban")
          .setDMPermission(false)
          .setDescription("Разбанить участника")
          .setRequiredMemberPermissions("BanMembers")
          .setRequiredBotPermissions("BanMembers")
          .addStringOption((user) =>
            user
              .setName("user")
              .setDescription("Пользователь, которого вы хотите разбанить")
              .setAutocomplete(true)
              .setRequired(true)
          )
          .addStringOption((reason) =>
            reason.setName("reason").setDescription("Причина разбана")
          ),
        { target: false }
      ).setExecute(async ({ interaction }) => {
        if (!interaction.inCachedGuild()) return;

        const userId = interaction.options.getString("user", true);
        const reason = interaction.options.getString("reason");
        const hidden = interaction.options.getBoolean("hide") ?? false;

        await interaction.deferReply({ ephemeral: hidden });

        const bannedMember = await interaction.guild.bans
          .fetch(userId)
          .catch(() => null);

        if (!bannedMember) {
          await interaction.editReply(
            Utility.createErrorMessage(
              "Не удается найти забаненного пользователя"
            )
          );
          return;
        }

        await interaction.guild.bans.remove(
          bannedMember.user.id,
          `${interaction.user.displayName}: ${reason || "Причина не указана"}`
        );
        await interaction.editReply({
          content: Utility.createSuccessMessage(
            `${interaction.user} разбанил **@${
              bannedMember.user.username
            }** по причине ${inlineCode(
              escapeInlineCode(reason || "без причины")
            )}`
          ),
          allowedMentions: {
            parse: [],
          },
        });
      }),
      new MessageCommandBuilder()
        .setName("unban")
        .setDescription("Разбанить пользователя")
        .setDMPermission(false)
        .setRequiredMemberPermissions("BanMembers")
        .setRequiredBotPermissions("BanMembers")
        .addOption((user) =>
          user
            .setName("user")
            .setDescription("Пользователь, которого вы хотите разбанить")
            .setRequired(true)
            .setValidate(({ value }) => Utility.validateUserResolvable(value))
            .setResolveValue(({ value }) =>
              isValidSnowflake(value) ? value : getMentionId(value)
            )
        )
        .addOption((reason) =>
          reason.setName("reason").setDescription("Причина разбана")
        )
        .setExecute(async ({ options, message }) => {
          if (!message.inGuild()) return;

          const userId = await options.getOptionValue<string>("user", {
            required: true,
            resolveValue: true,
          });
          const reason = options.args.splice(1).join(" ") || null;

          const bannedMember = await message.guild.bans
            .fetch(userId)
            .catch(() => null);

          if (!bannedMember) {
            await message.reply(
              Utility.createErrorMessage(
                "Не удается найти забаненного пользователя"
              )
            );
            return;
          }

          await message.guild.bans.remove(
            bannedMember.user.id,
            `${message.author.displayName}: ${reason || "Причина не указана"}`
          );
          await message.reply({
            content: Utility.createSuccessMessage(
              `${message.author} разбанил **@${
                bannedMember.user.username
              }** по причине ${inlineCode(
                escapeInlineCode(reason || "без причины")
              )}`
            ),
            allowedMentions: {
              parse: [],
            },
          });
        }),
    ];

    this.interactionListeners = [
      {
        type: InteractionListenerType.Autocomplete,
        commandName: "unban",
        execute: async (interaction) => {
          const query = interaction.options.getFocused();
          const bans = await interaction.guild?.bans.fetch({ limit: 20 });

          await interaction
            .respond(
              bans
                ?.map((b) => ({
                  name: `@${b.user.username}`,
                  value: b.user.id,
                }))
                .filter(
                  (b) =>
                    b.name.toLowerCase().includes(query.toLowerCase()) ||
                    b.value === query
                ) ?? []
            )
            .catch(() => {});
        },
      },
    ];

    return true;
  }
}

export default new Unban();
