import {
  Guild,
  GuildBan,
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
import ms from "ms";

export class Ban extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      Utility.commonSlashCommandOptions(
        new SlashCommandBuilder()
          .setName("ban")
          .setDescription("Забанить участника")
          .setRequiredMemberPermissions("BanMembers")
          .setRequiredBotPermissions("BanMembers")
          .setDMPermission(false)
          .addUserOption((user) =>
            user
              .setName("user")
              .setDescription("Участник, которого вы хотите забанить")
              .setRequired(true)
          )
          .addStringOption((reason) =>
            reason.setName("reason").setDescription("Причина бана")
          )
          .addStringOption((deleteMessages) =>
            deleteMessages
              .setName("delete-messages")
              .setDescription(
                "Удалить сообщения с указанным временем (например: 1s, 1m, 1h и т.д.)"
              )
              .setAutocomplete(true)
          ),
        { target: false }
      ).setExecute(async ({ interaction }) => {
        if (!interaction.inCachedGuild()) return;

        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason");
        const hidden = interaction.options.getBoolean("hide") ?? false;
        const deleteMessagesMs =
          ms(interaction.options.getString("deleteMessages") ?? "0s") ||
          undefined;

        await interaction.deferReply({ ephemeral: hidden });

        const member = await interaction.guild.members
          .fetch(user.id)
          .catch(() => user.id);
        const moderator = interaction.member;
        const modActionError =
          typeof member !== "string"
            ? Utility.getModerationMemberActionError(member, moderator)
            : null;

        if (modActionError) {
          await interaction.editReply(
            Utility.createModerationActionErrorMessage(modActionError)
          );
          return;
        }

        const ban = await this.banMember(member, moderator.user, {
          deleteMessagesMs,
          reason,
          guild: moderator.guild,
        });

        await interaction.editReply({
          content: Utility.createLabel(
            `${moderator} забанил **@${ban.user.username}** ${
              reason ? "по причине " + inlineCode(escapeInlineCode(reason)) : ""
            }`,
            "🛫"
          ),
          allowedMentions: {
            parse: [],
          },
        });
      }),
      new MessageCommandBuilder()
        .setName("ban")
        .setDescription("Забанить участника")
        .setRequiredMemberPermissions("BanMembers")
        .setRequiredBotPermissions("BanMembers")
        .setDMPermission(false)
        .addOption((user) =>
          user
            .setName("user")
            .setDescription("Участник, которого вы хотите забанить")
            .setRequired(true)
            .setValidate(({ value }) => Utility.validateUserResolvable(value))
            .setResolveValue(({ value }) =>
              fetchMentionOrId({ client: Utility.client, user: value })
            )
        )
        .addOption((reason) =>
          reason.setName("reason").setDescription("Причина бана")
        )
        .setExecute(async ({ options, message }) => {
          if (!message.inGuild()) return;

          const user = await options.getOptionValue<User>("user", {
            required: true,
            resolveValue: true,
          });
          const reason = options.args.splice(1).join(" ") || null;

          const member = await message.guild.members
            .fetch(user.id)
            .catch(() => user.id);
          const moderator = await message.guild.members.fetch(
            message.author.id
          );
          const modActionError =
            typeof member !== "string"
              ? Utility.getModerationMemberActionError(member, moderator)
              : null;

          if (modActionError) {
            await message.reply(
              Utility.createModerationActionErrorMessage(modActionError)
            );
            return;
          }

          const ban = await this.banMember(member, moderator.user, {
            reason,
            guild: message.guild,
          });

          await message.reply({
            content: Utility.createLabel(
              `${moderator} забанил **@${
                ban.user.username
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

  public async banMember(
    memberResolvable: GuildMember | string,
    moderator: User,
    options: { guild: Guild; reason?: string | null; deleteMessagesMs?: number }
  ): Promise<GuildBan> {
    const member =
      typeof memberResolvable === "string"
        ? await options.guild.members
            .fetch(memberResolvable)
            .catch(() => memberResolvable)
        : memberResolvable;

    if (typeof member === "string") {
      await options.guild.bans.create(member, {
        reason:
          options.reason ??
          `${moderator.displayName}: ${
            options?.reason || "причина без причины"
          }`,
        deleteMessageSeconds: options.deleteMessagesMs,
      });

      return options.guild.bans.fetch(member);
    }

    const memberAge = Date.now() - (member.joinedTimestamp ?? 0);
    const deleteFrom = options?.deleteMessagesMs
      ? !memberAge || options.deleteMessagesMs <= memberAge
        ? options.deleteMessagesMs
        : memberAge
      : undefined;

    await member
      .send(
        Utility.createLabel(
          `Вы были забанены на ${bold(
            options.guild.name
          )} по причине ${inlineCode(
            options.reason ?? "без причины"
          )} модератором ${bold(moderator.displayName)}`,
          "🔨"
        )
      )
      .catch(() => null);

    return member.ban({
      reason: `${moderator.displayName}: ${
        options?.reason || "причина без причины"
      }`,
      deleteMessageSeconds:
        (deleteFrom && Math.floor(deleteFrom / 1000)) || undefined,
    });
  }
}

export default new Ban();
