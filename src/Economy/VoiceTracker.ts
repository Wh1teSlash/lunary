import { RecipleModuleLoadData } from "reciple";
import { BaseModule } from "../BaseModule.js";
import { ChannelType, Collection } from "discord.js";
import { randomInt } from "fallout-utility";
import Utility from "../Utils/Utility.js";

export interface VoiceTrackerData {
  joinTime: number;
}

export class VoiceTracker extends BaseModule {
  public userVoiceData: Collection<string, VoiceTrackerData> = new Collection();
  public async onStart(): Promise<boolean> {
    return true;
  }

  public async onLoad({ client }: RecipleModuleLoadData): Promise<void> {
    client.on("voiceStateUpdate", async (oldState, newState) => {
      if (oldState.channelId === newState.channelId) return;

      if (newState.channelId) {
        this.userVoiceData.set(newState.id, {
          joinTime: Date.now(),
        });
      }

      if (oldState.channelId && !newState.channelId) {
        const voiceData = this.userVoiceData.get(oldState.id);
        if (voiceData) {
          const timeSpent = Date.now() - voiceData.joinTime;
          const minutesSpent = Math.floor(timeSpent / 60000);
          const moneyEarned = minutesSpent * 50;

          let user = await Utility.prisma.economy.findUnique({
            where: { id: oldState.id },
          });

          if (!user) {
            user = await Utility.prisma.economy.create({
              data: {
                id: oldState.id,
                money: 0,
              },
            });
          } else {
            user = await Utility.prisma.economy.update({
              where: { id: oldState.id },
              data: { money: user.money + moneyEarned },
            });
          }

          console.log(
            `User ${oldState.id} spent ${minutesSpent} minutes in voice, earning ${moneyEarned} money.`
          );

          this.userVoiceData.delete(oldState.id);
        }
      }
    });
  }
}

export default new VoiceTracker();
