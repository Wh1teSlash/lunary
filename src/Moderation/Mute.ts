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
import ms from "ms";

export class Mute extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.commands = [
      Utility.commonSlashCommandOptions(
        new SlashCommandBuilder()
          .setName("mute")
          .setDMPermission(false)
          .setDescription("Тайм-аут участника")
          .setRequiredMemberPermissions("ModerateMembers")
          .setRequiredBotPermissions("ModerateMembers")
          .addUserOption((user) =>
            user
              .setName("user")
              .setDescription("Участник, которого вы хотите замьютить")
              .setRequired(true)
          )
          .addStringOption((duration) =>
            duration
              .setName("duration")
              .setDescription("Как долго должен длиться тайм-аут?")
              .setRequired(true)
          )
          .addStringOption((reason) =>
            reason.setName("reason").setDescription("Причина тайм-аута")
          ),
        { target: false }
      ).setExecute(async ({ interaction }) => {
        if (!interaction.inCachedGuild()) return;

        const user = interaction.options.getUser("user", true);
        const duration = ms(interaction.options.getString("duration", true));
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

        if (!duration) {
          await interaction.editReply(
            Utility.createErrorMessage(
              "Указанная продолжительность недействительна"
            )
          );
          return;
        }

        await this.timeoutMember(member, moderator.user, {
          guild: interaction.guild,
          duration,
          reason: `${moderator.displayName}: ${reason || "без причины"}`,
        });
        await interaction.editReply({
          content: Utility.createLabel(
            `${moderator} замьютил ${member} по причине ${inlineCode(
              escapeInlineCode(reason || "без причины")
            )}`,
            "⌛"
          ),
          allowedMentions: {
            parse: [],
          },
        });
      }),
      new MessageCommandBuilder()
        .setName("mute")
        .setDescription("Тайм-аут участника")
        .setRequiredMemberPermissions("ModerateMembers")
        .setRequiredBotPermissions("ModerateMembers")
        .setDMPermission(false)
        .addOption((user) =>
          user
            .setName("user")
            .setDescription("Участник, которого вы хотите замьютить")
            .setRequired(true)
            .setValidate(({ value }) => Utility.validateUserResolvable(value))
            .setResolveValue(({ value }) =>
              fetchMentionOrId({ client: Utility.client, user: value })
            )
        )
        .addOption((duration) =>
          duration
            .setName("duration")
            .setDescription("Как долго должен длиться тайм-аут?")
            .setValidate(({ value }) => !!ms(value))
            .setResolveValue(({ value }) => ms(value))
            .setRequired(true)
        )
        .addOption((reason) =>
          reason.setName("reason").setDescription("Причина тайм-аута")
        )
        .setExecute(async ({ options, message }) => {
          if (!message.inGuild()) return;

          const user = await options.getOptionValue<User>("user", {
            required: true,
            resolveValue: true,
          });
          const duration = await options.getOptionValue<number>("duration", {
            required: true,
            resolveValue: true,
          });
          const reason = options.args.splice(2).join(" ") || null;

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

          await this.timeoutMember(member, moderator.user, {
            guild: message.guild,
            duration,
            reason: `${moderator.displayName}: ${reason || "без причины"}`,
          });
          await message.reply({
            content: Utility.createLabel(
              `${moderator} замьютил ${member} по причине ${inlineCode(
                escapeInlineCode(reason || "без причины")
              )}`,
              "⌛"
            ),
            allowedMentions: {
              parse: [],
            },
          });
        }),
    ];

    return true;
  }

  public async timeoutMember(
    memberResolvable: GuildMember | string,
    moderator: User,
    options: {
      duration: number;
      guild: Guild;
      reason?: string | null;
      deleteMessagesMs?: number;
    }
  ): Promise<boolean> {
    const member =
      typeof memberResolvable === "string"
        ? await options.guild.members
            .fetch(memberResolvable)
            .catch(() => memberResolvable)
        : memberResolvable;
    if (typeof member === "string") return false;

    await member
      .send(
        Utility.createLabel(
          `Вы были замьючены в ${bold(
            options.guild.name
          )} по причине ${inlineCode(
            options.reason ?? "без причины"
          )} модератором ${bold(moderator.displayName)}`,
          "⌚"
        )
      )
      .catch(() => null);

    return member
      .timeout(
        options.duration,
        options.reason ??
          `${moderator.displayName}: ${options?.reason || "без причины"}`
      )
      .then(() => true)
      .catch(() => false);
  }
}

export default new Mute();
