import type { SlackMessageView, SlackModalView } from "./views/types";

export interface SlackMessageReference {
  channelId: string;
  timestamp: string;
}

export interface SlackPostMessageOptions {
  threadTimestamp?: string;
}

export interface SlackClient {
  deleteMessage(reference: SlackMessageReference): Promise<void>;
  postMessage(
    channelId: string,
    message: SlackMessageView,
    options?: SlackPostMessageOptions,
  ): Promise<SlackMessageReference>;
  openView(triggerId: string, view: SlackModalView): Promise<void>;
  sendEphemeralResponse(responseUrl: string, text: string): Promise<void>;
  updateMessage(
    reference: SlackMessageReference,
    message: SlackMessageView,
  ): Promise<void>;
}
