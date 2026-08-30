import { z } from "zod";
import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import type {
  SlackClient,
  SlackMessageReference,
  SlackPostMessageOptions,
} from "@comba/presentation/slack/slack-client";
import type {
  SlackMessageView,
  SlackModalView,
} from "@comba/presentation/slack/views/types";

const slackMessageResponseSchema = z.object({
  channel: z.string().min(1),
  ok: z.literal(true),
  ts: z.string().min(1),
});

const slackErrorResponseSchema = z.object({
  error: z.string().min(1),
  ok: z.literal(false),
});

export class SlackApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackApiError";
  }
}

@scoped(Lifecycle.ContainerScoped)
export class HttpSlackClient implements SlackClient {
  constructor(
    @inject(TOKENS.slackBotToken) private readonly botToken: string,
    @inject(TOKENS.fetch)
    private readonly fetcher: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  async postMessage(
    channelId: string,
    message: SlackMessageView,
    options: SlackPostMessageOptions = {},
  ): Promise<SlackMessageReference> {
    const result = await this.call("chat.postMessage", {
      ...message,
      channel: channelId,
      ...(options.threadTimestamp
        ? { thread_ts: options.threadTimestamp }
        : {}),
    });

    return { channelId: result.channel, timestamp: result.ts };
  }

  async openView(triggerId: string, view: SlackModalView): Promise<void> {
    const payload = await this.request("views.open", {
      trigger_id: triggerId,
      view,
    });
    if (!z.object({ ok: z.literal(true) }).safeParse(payload).success) {
      throw new SlackApiError("Slack views.open returned an invalid response");
    }
  }

  async sendEphemeralResponse(
    responseUrl: string,
    text: string,
  ): Promise<void> {
    const response = await this.fetcher(responseUrl, {
      body: JSON.stringify({
        replace_original: false,
        response_type: "ephemeral",
        text,
      }),
      headers: { "content-type": "application/json; charset=utf-8" },
      method: "POST",
    });

    if (!response.ok) {
      throw new SlackApiError(
        `Slack response URL failed with HTTP ${response.status}`,
      );
    }
  }

  async deleteMessage(reference: SlackMessageReference): Promise<void> {
    await this.call("chat.delete", {
      channel: reference.channelId,
      ts: reference.timestamp,
    });
  }

  async updateMessage(
    reference: SlackMessageReference,
    message: SlackMessageView,
  ): Promise<void> {
    await this.call("chat.update", {
      ...message,
      channel: reference.channelId,
      ts: reference.timestamp,
    });
  }

  private async call(
    method: "chat.delete" | "chat.postMessage" | "chat.update",
    body: Record<string, unknown>,
  ): Promise<z.infer<typeof slackMessageResponseSchema>> {
    const payload = await this.request(method, body);
    const result = slackMessageResponseSchema.safeParse(payload);
    if (!result.success) {
      throw new SlackApiError(`Slack ${method} returned an invalid response`);
    }

    return result.data;
  }

  private async request(
    method: "chat.delete" | "chat.postMessage" | "chat.update" | "views.open",
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.fetcher(`https://slack.com/api/${method}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${this.botToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new SlackApiError(
        `Slack ${method} failed with HTTP ${response.status}`,
      );
    }

    const payload: unknown = await response.json();
    const slackError = slackErrorResponseSchema.safeParse(payload);
    if (slackError.success) {
      throw new SlackApiError(
        `Slack ${method} failed: ${slackError.data.error}`,
      );
    }

    return payload;
  }
}
