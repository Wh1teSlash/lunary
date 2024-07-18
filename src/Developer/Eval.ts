import {
  BaseMessageOptions,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  Message,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  codeBlock,
  escapeCodeBlock,
} from "discord.js";
import { InteractionListenerType } from "reciple-interaction-events";
import { MessageCommandBuilder, SlashCommandBuilder } from "reciple";
import { InspectOptions, inspect } from "util";
import { BaseModule } from "../BaseModule.js";
import Utility from "../Utils/Utility.js";

export class Eval extends BaseModule {
  public async onStart(): Promise<boolean> {
    this.devCommands = [
      Utility.commonSlashCommandOptions(
        new SlashCommandBuilder()
          .setName("eval")
          .setDescription("Evaluate some javascript code")
          .addStringOption((code) =>
            code.setName("code").setDescription("Valid javascript code")
          ),
        { target: false }
      ).setExecute(async ({ interaction }) => {
        const code = interaction.options.getString("code");
        const hidden = interaction.options.getBoolean("hide") ?? true;

        if (code) {
          await interaction.deferReply({ ephemeral: hidden });
          await interaction.editReply(
            await this.createEvalMessageOptions(code, interaction)
          );
          return;
        }

        await interaction.showModal({
          title: `Eval`,
          custom_id: `eval ${hidden}`,
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                new TextInputBuilder()
                  .setCustomId(`code`)
                  .setLabel("Code")
                  .setRequired(true)
                  .setStyle(TextInputStyle.Paragraph)
                  .toJSON(),
              ],
            },
          ],
        });
      }),
      new MessageCommandBuilder()
        .setName("eval")
        .setDescription("Evaluate some javascript code")
        .setValidateOptions(true)
        .addOption((code) =>
          code
            .setName("code")
            .setDescription("Valid javascript code")
            .setRequired(true)
        )
        .setExecute(async ({ message, parserData }) => {
          const code = parserData.rawArgs;
          const reply = await message.reply(
            Utility.createLabel("Loading...", "⌚")
          );

          await reply.edit(await this.createEvalMessageOptions(code, message));
        }),
    ];

    this.interactionListeners = [
      {
        type: InteractionListenerType.ModalSubmit,
        customId: (i) => i.customId.startsWith("eval"),
        execute: async (interaction) => {
          const code = interaction.fields.getTextInputValue("code");
          const hidden = interaction.customId.split(" ")[1] === "true";

          await interaction.deferReply({ ephemeral: hidden });
          await interaction.editReply(
            await this.createEvalMessageOptions(code, interaction)
          );
        },
      },
    ];

    return true;
  }

  public async eval(
    code: string,
    context: ChatInputCommandInteraction | ModalSubmitInteraction | Message,
    options?: InspectOptions
  ): Promise<string> {
    let result: string;

    try {
      result = inspect(eval(code), options);
    } catch (err) {
      result = inspect(err, options);
    }

    result = this.maskString(result, Utility.client.token);
    result = process.env.DATABASE_URL
      ? this.maskString(result, process.env.DATABASE_URL)
      : result;
    result = process.env.SHADOW_DATABASE_URL
      ? this.maskString(result, process.env.SHADOW_DATABASE_URL)
      : result;
    result = process.env.TEST_TOKEN
      ? this.maskString(result, process.env.TEST_TOKEN)
      : result;
    result = process.env.TOKEN
      ? this.maskString(result, process.env.TOKEN)
      : result;

    return result;
  }

  public maskString(string: string, value: string, mask: string = "*"): string {
    string = string.replaceAll(value, mask.repeat(value.length));
    return string;
  }

  public async createEvalMessageOptions(
    code: string,
    context: ChatInputCommandInteraction | ModalSubmitInteraction | Message,
    options?: InspectOptions
  ): Promise<BaseMessageOptions> {
    const result = await this.eval(code, context, options);
    const embed = new EmbedBuilder()
      .setAuthor({
        name: `@${Utility.client.user.username}`,
        iconURL: Utility.client.user.displayAvatarURL(),
      })
      .setColor(Utility.embedColor)
      .setTimestamp();

    if (result.length > 1900) {
      embed.setDescription(codeBlock("js", escapeCodeBlock(code)));

      return {
        embeds: [embed],
        files: [
          {
            name: `result.txt`,
            attachment: Buffer.from(result),
          },
        ],
      };
    }

    embed.setDescription(codeBlock(escapeCodeBlock(result)));

    return { embeds: [embed] };
  }
}

export default new Eval();
