import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HttpSlackClient,
  SlackApiError,
} from "@comba/infrastructure/slack/http-slack-client";
import type { SlackMessageView } from "@comba/presentation/slack/views/types";

const message: SlackMessageView = { blocks: [], text: "⚽ Ċomba?" };

afterEach(() => vi.unstubAllGlobals());

describe("HttpSlackClient", () => {
  it("calls the Workers fetch global without binding it to the client", async () => {
    const runtimeFetch = vi.fn(function (this: unknown) {
      if (this instanceof HttpSlackClient) {
        throw new TypeError("illegal invocation");
      }
      return Promise.resolve(
        Response.json({ channel: "C123", ok: true, ts: "123.456" }),
      );
    });
    vi.stubGlobal("fetch", runtimeFetch);

    const client = new HttpSlackClient("xoxb-secret");

    await expect(client.postMessage("C123", message)).resolves.toEqual({
      channelId: "C123",
      timestamp: "123.456",
    });
  });

  it("opens a Slack modal", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const client = new HttpSlackClient("xoxb-secret", fetcher);
    const view = {
      blocks: [],
      callback_id: "comba.result",
      close: {
        emoji: true as const,
        text: "Cancel",
        type: "plain_text" as const,
      },
      private_metadata: "session-1",
      submit: {
        emoji: true as const,
        text: "Save",
        type: "plain_text" as const,
      },
      title: {
        emoji: true as const,
        text: "Result",
        type: "plain_text" as const,
      },
      type: "modal" as const,
    };

    await client.openView("123.456", view);

    expect(fetcher).toHaveBeenCalledWith(
      "https://slack.com/api/views.open",
      expect.objectContaining({
        body: JSON.stringify({ trigger_id: "123.456", view }),
      }),
    );
  });

  it("deletes an existing message", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ channel: "C123", ok: true, ts: "123.456" }),
    );
    const client = new HttpSlackClient("xoxb-secret", fetcher);

    await client.deleteMessage({
      channelId: "C123",
      timestamp: "123.456",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://slack.com/api/chat.delete",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts messages as the bot and returns their reference", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ channel: "C123", ok: true, ts: "123.456" }),
    );
    const client = new HttpSlackClient("xoxb-secret", fetcher);

    await expect(client.postMessage("C123", message)).resolves.toEqual({
      channelId: "C123",
      timestamp: "123.456",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer xoxb-secret",
        }),
        method: "POST",
      }),
    );
  });

  it("posts a message as a reply in the requested thread", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ channel: "C123", ok: true, ts: "123.789" }),
    );
    const client = new HttpSlackClient("xoxb-secret", fetcher);

    await client.postMessage("C123", message, {
      threadTimestamp: "123.456",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        body: expect.stringContaining('"thread_ts":"123.456"'),
      }),
    );
  });

  it("surfaces Slack API errors", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: "channel_not_found", ok: false }),
    );
    const client = new HttpSlackClient("xoxb-secret", fetcher);

    await expect(client.postMessage("C123", message)).rejects.toThrow(
      new SlackApiError("Slack chat.postMessage failed: channel_not_found"),
    );
  });

  it("sends user-specific errors through a Slack response URL", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    const client = new HttpSlackClient("xoxb-secret", fetcher);

    await client.sendEphemeralResponse(
      "https://hooks.slack.test/actions/123",
      "That team is full.",
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://hooks.slack.test/actions/123",
      expect.objectContaining({
        body: JSON.stringify({
          replace_original: false,
          response_type: "ephemeral",
          text: "That team is full.",
        }),
        method: "POST",
      }),
    );
  });

  it("updates an existing message", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ channel: "C123", ok: true, ts: "123.456" }),
    );
    const client = new HttpSlackClient("xoxb-secret", fetcher);

    await client.updateMessage(
      { channelId: "C123", timestamp: "123.456" },
      message,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://slack.com/api/chat.update",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
