import { MessageCommandBuilder, SlashCommandBuilder } from "reciple";
import { User, escapeInlineCode, inlineCode } from "discord.js";
import { fetchMentionOrId } from "@reciple/utils";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";

export class Unmute extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      Utility.commonSlashCommandOptions(
        new SlashCommandBuilder()
          .setName("unmute")
          .setDMPermission(false)
          .setDescription("Размьютить участника")
          .setRequiredMemberPermissions("ModerateMembers")
          .setRequiredBotPermissions("ModerateMembers")
          .addUserOption((user) =>
            user
              .setName("user")
              .setDescription("Пользователь, которого нужно размьютить")
              .setRequired(true)
          )
          .addStringOption((reason) =>
            reason.setName("reason").setDescription("Причина размьюта")
          ),
        { target: false }
      ).setExecute(async ({ interaction }) => {
        if (!interaction.inCachedGuild()) return;

        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason");
        const hidden = interaction.options.getBoolean("hide") ?? false;

        await interaction.deferReply({ ephemeral: hidden });

        const member = await interaction.guild.members.fetch(user.id);
        const moderator = interaction.member;
        const modActionError = Utility.getModerationMemberActionError(
          member,
          moderator
        );

        if (modActionError) {
          await interaction.editReply(
            Utility.createModerationActionErrorMessage(modActionError)
          );
          return;
        }

        await member.timeout(
          null,
          `${interaction.user.displayName}: ${reason || "Причина не указана"}`
        );
        await interaction.editReply({
          content: Utility.createSuccessMessage(
            `${moderator} размьютил ${member} ${
              reason ? "по причине " + inlineCode(escapeInlineCode(reason)) : ""
            }`
          ),
          allowedMentions: {
            parse: [],
          },
        });
      }),
      new MessageCommandBuilder()
        .setName("unmute")
        .setDescription("Размьютить участника")
        .setRequiredMemberPermissions("ModerateMembers")
        .setRequiredBotPermissions("ModerateMembers")
        .setDMPermission(false)
        .addOption((user) =>
          user
            .setName("user")
            .setDescription("Пользователь, которого нужно размьютить")
            .setRequired(true)
            .setValidate(({ value }) => Utility.validateUserResolvable(value))
            .setResolveValue(({ value }) =>
              fetchMentionOrId({ client: Utility.client, user: value })
            )
        )
        .addOption((reason) =>
          reason.setName("reason").setDescription("Причина размьюта")
        )
        .setExecute(async ({ options, message }) => {
          if (!message.inGuild()) return;

          const user = await options.getOptionValue<User>("user", {
            required: true,
            resolveValue: true,
          });
          const reason = options.args.splice(1).join(" ") || null;

          const member = await message.guild.members.fetch(user.id);
          const moderator = await message.guild.members.fetch(
            message.author.id
          );
          const modActionError = Utility.getModerationMemberActionError(
            member,
            moderator
          );

          if (modActionError) {
            await message.reply(
              Utility.createModerationActionErrorMessage(modActionError)
            );
            return;
          }

          await member.timeout(
            null,
            `${moderator.displayName}: ${reason || "Причина не указана"}`
          );
          await message.reply({
            content: Utility.createSuccessMessage(
              `${moderator} размьютил ${member} по причине ${inlineCode(
                escapeInlineCode(reason || "без причины")
              )}`
            ),
            allowedMentions: {
              parse: [],
            },
          });
        }),
    ];

    return true;
  }
}

export default new Unmute();
