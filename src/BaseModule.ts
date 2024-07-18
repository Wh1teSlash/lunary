import {
  AnyCommandResolvable,
  RecipleModuleLoadData,
  RecipleModuleStartData,
  RecipleModuleUnloadData,
} from "reciple";
import {
  AnyInteractionListener,
  RecipleInteractionListenerModule,
} from "reciple-interaction-events";

export abstract class BaseModule implements RecipleInteractionListenerModule {
  public versions: string = "latest";
  public commands: AnyCommandResolvable[] = [];
  public devCommands: AnyCommandResolvable[] = [];
  public interactionListeners: AnyInteractionListener[] = [];

  public abstract onStart(
    data: RecipleModuleStartData
  ): Promise<boolean | string>;

  public async onLoad(data: RecipleModuleLoadData): Promise<void | string> {}
  public async onUnload(
    data: RecipleModuleUnloadData
  ): Promise<void | string> {}
}
