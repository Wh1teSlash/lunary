import {
  Collection,
  EmbedBuilder,
  GuildMember,
  User,
  bold,
  escapeInlineCode,
  inlineCode,
} from "discord.js";
import { MessageCommandBuilder, SlashCommandBuilder, cli } from "reciple";
import { createReadFile } from "fallout-utility";
import { fetchMentionOrId } from "@reciple/utils";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";
import { Warnings } from "@prisma/client";
import { writeFileSync } from "fs";
import lodash from "lodash";
import path from "path";
import yaml from "yaml";
import ms from "ms";

export interface WarnPunishmentData {
  punishment: WarnTimeoutPunishmentOptions | WarnBanPunishmentOptions | null;
  warns: number;
  punished: boolean;
}

export interface WarnConfig {
  punishments: Record<
    string,
    WarnTimeoutPunishmentOptions | WarnBanPunishmentOptions
  >;
}

export interface WarnTimeoutPunishmentOptions {
  type: "Тайм-аут";
  duration: number;
  reason?: string;
}

export interface WarnBanPunishmentOptions {
  type: "Бан";
  reason?: string;
  deleteMessageSeconds?: number;
}

export class Warn extends BaseModule {
  public static defaultConfig: WarnConfig = {
    punishments: {
      "3": {
        type: "Тайм-аут",
        duration: 60 * 1000 * 5,
      },
      "5": {
        type: "Бан",
      },
    },
  };

  public configFile: string = path.join(cli.cwd, "config/warns.yml");
  public config: WarnConfig = createReadFile(
    this.configFile,
    Warn.defaultConfig,
    {
      encodeFileData: (data) => yaml.stringify(data),
      formatReadData: (data) => {
        this.config = Utility.resolveEnvValues(
          lodash.defaultsDeep(
            Warn.defaultConfig,
            yaml.parse(data.toString())
          ) as WarnConfig
        );

        writeFileSync(this.configFile, yaml.stringify(this.config));

        return this.config;
      },
    }
  );

  public warningTimers: Collection<string, NodeJS.Timeout> = new Collection();
  public maxTimeoutMs = 2147483648;

  public async onStart(): Promise<boolean> {
    this.commands = [
      Utility.commonSlashCommandOptions(
        new SlashCommandBuilder()
          .setName("warn")
          .setDescription("Предупредить пользователя на этом сервере")
          .setRequiredMemberPermissions("KickMembers")
          .setDMPermission(false)
          .addUserOption((user) =>
            user
              .setName("user")
              .setDescription("Участник которого вы хотите предупредить")
              .setRequired(true)
          )
          .addStringOption((reason) =>
            reason
              .setName("reason")
              .setDescription("Причина предупреждения")
              .setRequired(true)
          )
          .addStringOption((duration) =>
            duration
              .setName("duration")
              .setDescription(
                "Длительность предупреждения (пример: 30m, 1h, 1d, 1w)"
              )
              .setRequired(false)
          ),
        { target: false }
      ).setExecute(async ({ interaction }) => {
        if (!interaction.inCachedGuild()) return;

        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const duration =
          ms(interaction.options.getString("duration") ?? "0") || undefined;
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

        await this.warnUser({
          userId: user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          moderatorId: interaction.user.id,
          duration,
          reason,
        });

        const punishment = await this.punishMember(member);

        const punishmentMessage = punishment.punishment
          ? punishment.punished
            ? `Применил наказание ${inlineCode(punishment.punishment.type)}`
            : `Невозможно применить наказание ${inlineCode(
                punishment.punishment.type
              )}`
          : null;

        await interaction.editReply({
          content:
            Utility.createLabel(
              `${moderator} предупредил ${user} ${
                reason
                  ? "по причине " + inlineCode(escapeInlineCode(reason))
                  : ""
              }`,
              "📝"
            ) + (punishmentMessage ? "\n>>> " + punishmentMessage : ""),
          allowedMentions: {
            parse: [],
          },
        });
      }),
      new MessageCommandBuilder()
        .setName("warn")
        .setDescription("Предупредить пользователя")
        .setRequiredMemberPermissions("KickMembers")
        .setDMPermission(false)
        .addOption((user) =>
          user
            .setName("user")
            .setDescription("Участник которого вы хотите предупредить")
            .setRequired(true)
            .setValidate(({ value }) => Utility.validateUserResolvable(value))
            .setResolveValue(({ value }) =>
              fetchMentionOrId({ client: Utility.client, user: value })
            )
        )
        .addOption((reason) =>
          reason.setName("reason").setDescription("Причина предупреждения")
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

          await this.warnUser({
            userId: user.id,
            guildId: message.guildId,
            channelId: message.channelId,
            moderatorId: message.author.id,
            reason,
          });

          const punishment = await this.punishMember(member);

          const punishmentMessage = punishment.punishment
            ? punishment.punished
              ? `Применил наказание ${inlineCode(punishment.punishment.type)}`
              : `Невозможно применить наказание ${inlineCode(
                  punishment.punishment.type
                )}`
            : null;

          await message.reply({
            content:
              Utility.createLabel(
                `${moderator} предупредил ${user} ${
                  reason
                    ? "по причине " + inlineCode(escapeInlineCode(reason))
                    : ""
                }`,
                "📝"
              ) + (punishmentMessage ? "\n>>> " + punishmentMessage : ""),
            allowedMentions: {
              parse: [],
            },
          });
        }),
      Utility.commonSlashCommandOptions(
        new SlashCommandBuilder()
          .setName("warn-punishments")
          .setDescription("Наказания за предупреждения"),
        { target: false }
      )
        .setDMPermission(false)
        .setExecute(async ({ interaction }) => {
          await interaction.reply({
            embeds: [this.createWarnPinishmentsEmbed()],
            ephemeral: interaction.options.getBoolean("hide") ?? true,
          });
        }),
      new MessageCommandBuilder()
        .setName("warn-punishments")
        .setAliases("punishments")
        .setDescription("Наказания за предупреждения")
        .setDMPermission(false)
        .setExecute(async ({ message }) => {
          await message.reply({ embeds: [this.createWarnPinishmentsEmbed()] });
        }),
    ];

    return true;
  }

  public async warnUser(
    options: Omit<
      Warnings,
      "endsAt" | "remainingDuration" | "createdAt" | "id"
    > & { duration?: number }
  ): Promise<Warnings> {
    const endsAt = options.duration
      ? new Date(Date.now() + options.duration)
      : null;
    const data = await Utility.prisma.warnings.create({
      data: {
        userId: options.userId,
        guildId: options.guildId,
        moderatorId: options.moderatorId,
        channelId: options.channelId,
        reason: options.reason,
        endsAt,
      },
    });

    if (endsAt) this.createTimer(endsAt, data.id);

    const user = await Utility.client.users
      .fetch(options.userId)
      .catch(() => null);
    const moderator = await Utility.client.users
      .fetch(options.moderatorId)
      .catch(() => null);
    const guild = await Utility.client.guilds
      .fetch(options.guildId)
      .catch(() => null);

    await user
      ?.send(
        Utility.createLabel(
          `Вас предупредили${
            guild ? " в " + bold(guild?.name) : ""
          } по причине ${inlineCode(options.reason ?? "без причины")} ${
            moderator ? "модератором " + bold(moderator?.displayName) : ""
          }`,
          "⚠️"
        )
      )
      .catch(() => null);

    return data;
  }

  public async unwarnUser(id: string): Promise<Warnings | null> {
    const timer = this.warningTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.warningTimers.delete(id);
    }

    return await Utility.prisma.warnings
      .delete({ where: { id } })
      .catch(() => null);
  }

  public createTimer(endsAt: number | Date, id: string): void {
    endsAt =
      typeof endsAt === "number" ? new Date(Date.now() + endsAt) : endsAt;

    if (endsAt.getTime() <= Date.now()) {
      this.unwarnUser(id);
      return;
    }

    let duration: number = endsAt.getTime() - Date.now();
    let timeout: NodeJS.Timeout;

    if (duration > this.maxTimeoutMs) {
      timeout = setTimeout(
        () => this.createTimer(duration - this.maxTimeoutMs, id),
        this.maxTimeoutMs
      ).unref();
    } else {
      timeout = setTimeout(
        () => this.unwarnUser(id).catch(() => null),
        duration
      ).unref();
    }

    this.warningTimers.set(id, timeout);
  }

  public createWarnPinishmentsEmbed(): EmbedBuilder {
    const keys = Object.keys(this.config.punishments);
    const embed = new EmbedBuilder()
      .setAuthor({
        name: Utility.client.user!.tag,
        iconURL: Utility.client.user?.displayAvatarURL(),
      })
      .setColor(Utility.embedColor)
      .setTitle(`Наказания за предупреждения`)
      .setDescription(
        keys
          .map(
            (k) =>
              `**${inlineCode(
                k + " предупрежден" + (Number(k) > 1 ? "ий" : "")
              )}** ${this.config.punishments[k].type}`
          )
          .join("\n") || "Нет наказаний"
      )
      .setTimestamp();

    return embed;
  }

  public async punishMember(member: GuildMember): Promise<WarnPunishmentData> {
    const data: WarnPunishmentData = {
      punishment: null,
      warns: await Utility.prisma.warnings.count({
        where: { userId: member.id },
      }),
      punished: false,
    };

    data.punishment = this.config.punishments[data.warns] ?? null;
    if (!data.punishment) return data;

    switch (data.punishment.type) {
      case "Тайм-аут":
        if (member.communicationDisabledUntil !== null) break;

        await member
          .timeout(data.punishment.duration, data.punishment.reason)
          .then(() => {
            data.punished = true;
          })
          .catch(() => null);

        break;
      case "Бан":
        if (member.bannable) break;

        await member
          .ban({
            reason: data.punishment.reason,
            deleteMessageSeconds: data.punishment.deleteMessageSeconds,
          })
          .then(() => {
            data.punished = true;
          })
          .catch(() => null);

        break;
    }

    return data;
  }
}

export default new Warn();
