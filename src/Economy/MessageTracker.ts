import { RecipleModuleLoadData } from "reciple";
import { BaseModule } from "../BaseModule.js";
import { Collection, Message } from "discord.js";
import Utility from "../Utils/Utility.js";
import { randomInt } from "fallout-utility";

export interface moneyCooldownCacheData {
  createdAt: Date;
}

export class MessageTracker extends BaseModule {
  public moneyCooldownCache: Collection<string, moneyCooldownCacheData> =
    new Collection();

  public async onStart(): Promise<boolean> {
    return true;
  }

  public async onLoad({ client }: RecipleModuleLoadData): Promise<void> {
    client.on("messageCreate", async (message) => {
      if (!message.inGuild() || message.author.bot) return;

      if (this.cooldownCheck(message)) {
        const randomAmount = randomInt(5, 10);

        await Utility.prisma.economy.upsert({
          where: { id: message.author.id },
          update: {
            money: {
              increment: randomAmount,
            },
          },
          create: {
            id: message.author.id,
            money: randomAmount,
          },
        });
      }
    });
  }

  public cooldownCheck(message: Message): boolean {
    const cached = this.moneyCooldownCache.get(message.author.id);
    const data = {
      createdAt: message.createdAt,
    };

    if (!cached) {
      this.moneyCooldownCache.set(message.author.id, data);
      return false;
    }

    const timeDiff = message.createdAt.getTime() - cached.createdAt.getTime();

    if (timeDiff < 1000 * 60 * 5) {
      this.moneyCooldownCache.delete(message.author.id);
      return true;
    }

    return false;
  }
}

export default new MessageTracker();
