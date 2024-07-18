import {
  AnySlashCommandBuilder,
  RecipleClient,
  RecipleModuleLoadData,
  RecipleModuleStartData,
} from "reciple";
import { BaseModule } from "../BaseModule.js";
import { PrismaClient } from "@prisma/client";
import { setTimeout } from "timers/promises";
import {
  ColorResolvable,
  Guild,
  Message,
  SlashCommandSubcommandBuilder,
  SlashCommandBuilder,
  inlineCode,
  GuildMember,
  ButtonStyle,
  ButtonBuilder,
} from "discord.js";
import {
  ActionRowResolvable,
  ButtonPaginationControllerResolavable,
  disableComponents,
} from "@thenorthsolution/djs-pagination";
import {
  getMentionId,
  isValidSnowflake,
  resolveEnvProtocol,
} from "@reciple/utils";
import dotenv from "dotenv";

export enum ModerationMemberActionError {
  DifferentGuild = 1,
  SelfAction,
  ModeratorRoleNotHighEnough,
  BotRoleNotHighEnough,
  OwnerAction,
}

export class Utility extends BaseModule {
  public prisma: PrismaClient = new PrismaClient();
  public client!: RecipleClient<true>;
  public embedThumbnailURL: string | null = null;
  public embedColor: ColorResolvable = "#a50009";

  public async onStart({ client }: RecipleModuleStartData): Promise<boolean> {
    this.client = client as RecipleClient<true>;
    return true;
  }

  public async onLoad(data: RecipleModuleLoadData): Promise<string | void> {
    this.client.rest.on("rateLimited", async (info) =>
      this.client.logger?.warn(`Ratelimited!`, info)
    );
  }

  public async getPrefix(data?: {
    message?: Message;
    guild?: Guild | null;
  }): Promise<string> {
    if (!this.client.config.commands?.messageCommand?.prefix) return "!";

    return typeof this.client.config.commands?.messageCommand?.prefix ===
      "function"
      ? this.client.config.commands?.messageCommand?.prefix({
          client: this.client,
          ...data,
        })
      : this.client.config.commands?.messageCommand?.prefix;
  }

  public createErrorMessage(message: string): string {
    return this.createLabel(message, "❌");
  }

  public createSuccessMessage(message: string): string {
    return this.createLabel(message, "✅");
  }

  public createWarningMessage(message: string): string {
    return this.createLabel(message, "⚠️");
  }

  public createLabel(message: string, emoji: string): string {
    return `${inlineCode(emoji)} ${message}`;
  }

  public validateUserResolvable(user: string): boolean {
    const id = getMentionId(user);
    if (id != user) return true;
    return isValidSnowflake(id);
  }

  public resolveEnvValues<T extends Record<any, any> | string | Array<any>>(
    object: T,
    envFile?: string
  ): T {
    if (envFile) dotenv.config({ path: envFile, override: true });
    if (typeof object !== "object")
      return (
        typeof object === "string"
          ? resolveEnvProtocol(object) ?? object
          : object
      ) as T;
    if (Array.isArray(object))
      return object.map((v) => resolveEnvProtocol(v) ?? v) as T;

    const keys = object ? Object.keys(object) : [];
    const values = Object.values(object!);

    let newObject = {};
    let i = 0;

    for (const value of values) {
      newObject = {
        ...newObject,
        [keys[i]]:
          typeof value === "string" || typeof value === "object"
            ? this.resolveEnvValues(value)
            : value,
      };

      i++;
    }

    return newObject as T;
  }

  public getModerationMemberActionError(
    member: GuildMember,
    moderator: GuildMember
  ): ModerationMemberActionError | undefined {
    if (member.guild.id !== moderator.guild.id)
      return ModerationMemberActionError.DifferentGuild;
    if (member.id === moderator.id)
      return ModerationMemberActionError.SelfAction;

    const guild = member.guild;
    const botMember = guild.members.me;

    if (member.id === guild.ownerId)
      return ModerationMemberActionError.OwnerAction;
    if (
      guild.ownerId !== moderator.id &&
      member.roles.highest.position >= moderator.roles.highest.position
    )
      return ModerationMemberActionError.ModeratorRoleNotHighEnough;
    if (
      member.roles.highest.position >= (botMember?.roles.highest.position ?? 0)
    )
      return ModerationMemberActionError.BotRoleNotHighEnough;
  }

  public createModerationActionErrorMessage(
    actionError: ModerationMemberActionError
  ): string {
    switch (actionError) {
      case ModerationMemberActionError.SelfAction:
        return this.createErrorMessage("You cannot moderate yourself");
      case ModerationMemberActionError.OwnerAction:
      case ModerationMemberActionError.ModeratorRoleNotHighEnough:
        return this.createErrorMessage("You cannot moderate this user");
      case ModerationMemberActionError.BotRoleNotHighEnough:
        return this.createErrorMessage(
          "The bot doesn't have permissions to moderate this user"
        );
      case ModerationMemberActionError.DifferentGuild:
        return this.createErrorMessage("This user is not a valid guild member");
    }
  }

  public commonSlashCommandOptions<
    T extends SlashCommandSubcommandBuilder | AnySlashCommandBuilder
  >(builder: T, options?: { target?: boolean; hide?: boolean }): T {
    const b = (<unknown>builder) as SlashCommandBuilder;

    if (options?.target !== false) {
      b.addUserOption((target) =>
        target.setName("target").setDescription("User to mention")
      );
    }

    if (options?.hide !== false) {
      b.addBooleanOption((hide) =>
        hide.setName("hide").setDescription("Hide command response")
      );
    }

    return (<unknown>b) as T;
  }

  public paginationButtons(): ButtonPaginationControllerResolavable[] {
    return [
      {
        button: new ButtonBuilder()
          .setCustomId("prev")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary),
        type: "PreviousPage",
      },
      {
        button: new ButtonBuilder()
          .setCustomId("next")
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary),
        type: "NextPage",
      },
    ];
  }

  public async autoDeleteResponseMessage(message: Message): Promise<void> {
    if (
      message.author.id !== this.client.user?.id ||
      !message.content.startsWith(this.createErrorMessage(""))
    )
      return;

    const reference = message.reference?.messageId
      ? await message.channel.messages.fetch(message.reference.messageId)
      : null;

    await setTimeout(5000);
    await message.delete().catch(() => null);

    if (reference?.author.id !== message.author.id)
      await reference?.delete().catch(() => null);
  }
}

export default new Utility();
