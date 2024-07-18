import {
  Guild,
  GuildMember,
  User,
  bold,
  escapeInlineCode,
  inlineCode,
} from "discord.js";
import { MessageCommandBuilder, SlashCommandBuilder } from "reciple";
import { fetchMentionOrId } from "@reciple/utils";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";

export class Kick extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      Utility.commonSlashCommandOptions(
        new SlashCommandBuilder()
          .setName("kick")
          .setDescription("Кикнуть участника")
          .setRequiredMemberPermissions("KickMembers")
          .setRequiredBotPermissions("KickMembers")
          .setDMPermission(false)
          .addUserOption((user) =>
            user
              .setName("user")
              .setDescription("Участник, которого вы хотите кикнуть")
              .setRequired(true)
          )
          .addStringOption((reason) =>
            reason.setName("reason").setDescription("Причина для кика")
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

        await this.kickMember(member, moderator.user, {
          guild: interaction.guild,
          reason: `${moderator.displayName}: ${
            reason || "причина без причины"
          }`,
        });
        await interaction.editReply({
          content: Utility.createLabel(
            `${moderator} кикнул **@${
              member.user.username
            }** по причине ${inlineCode(
              escapeInlineCode(reason || "без причины")
            )}`,
            "🛫"
          ),
          allowedMentions: {
            parse: [],
          },
        });
      }),
      new MessageCommandBuilder()
        .setName("kick")
        .setDescription("Кикнуть участника")
        .setRequiredMemberPermissions("KickMembers")
        .setRequiredBotPermissions("KickMembers")
        .setDMPermission(false)
        .addOption((user) =>
          user
            .setName("user")
            .setDescription("Участник, которого вы хотите кикнуть")
            .setRequired(true)
            .setValidate(({ value }) => Utility.validateUserResolvable(value))
            .setResolveValue(({ value }) =>
              fetchMentionOrId({ client: Utility.client, user: value })
            )
        )
        .addOption((reason) =>
          reason.setName("reason").setDescription("Прчина для кика")
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

          await this.kickMember(member, moderator.user, {
            guild: message.guild,
            reason: `${moderator.displayName}: ${
              reason || "причина без причины"
            }`,
          });
          await message.reply({
            content: Utility.createLabel(
              `${moderator} кикнул **@${
                member.user.username
              }** по причине ${inlineCode(
                escapeInlineCode(reason || "без причины")
              )}`,
              "🛫"
            ),
            allowedMentions: {
              parse: [],
            },
          });
        }),
    ];

    return true;
  }

  public async kickMember(
    memberResolvable: GuildMember | string,
    moderator: User,
    options: { guild: Guild; reason?: string | null }
  ): Promise<boolean> {
    const member =
      typeof memberResolvable === "string"
        ? await options.guild.members
            .fetch(memberResolvable)
            .catch(() => memberResolvable)
        : memberResolvable;

    if (typeof member !== "string") {
      await member
        .send(
          Utility.createLabel(
            `Вы были кикнуты из ${bold(
              options.guild.name
            )} по причине ${inlineCode(
              options.reason ?? "причина без причины"
            )} модератором ${bold(moderator.displayName)}`,
            "🦶"
          )
        )
        .catch(() => null);
    }

    return options.guild.members
      .kick(
        member,
        options.reason ??
          `${moderator.displayName}: ${
            options?.reason || "Причина без причины"
          }`
      )
      .then(() => true)
      .catch(() => false);
  }
}

export default new Kick();
