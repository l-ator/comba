import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HttpSlackClient,
  SlackApiError,
} from "@comba/infrastructure/slack/http-slack-client";
import type { SlackMessageView } from "@comba/presentation/slack/views/types";

const message: SlackMessageView = { blocks: [], text: "⚽ Ċomba?" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HttpSlackClient", () => {
  it("creates the native leaderboard List schema", async () => {
    const keys = ["standing", "player", "rank", "played", "won", "lost", "win_rate", "last_updated", "teammate", "nemesis", "victim"];
    const fetcher = vi.fn(async () => Response.json({
      list_id: "F1",
      list_metadata: { schema: keys.map((key) => ({ id: `Col-${key}`, key })) },
      ok: true,
    }));
    const client = new HttpSlackClient("xoxb-secret", fetcher);
    await expect(client.create("Ċomba Leaderboard")).resolves.toMatchObject({
      listId: "F1",
    });
    const body = requestBody(fetcher, 0);
    expect(body).toMatchObject({ name: "Ċomba Leaderboard" });
    expect(body.schema).toHaveLength(11);
  });

  it("rewrites a leaderboard with delete and one items.create per row", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const client = new HttpSlackClient("xoxb-secret", fetcher);
    const definition = {
      listId: "F1",
      columns: { standing: "C1", player: "C2", rank: "C3", played: "C4", won: "C5", lost: "C6", winRate: "C7", lastUpdated: "C8", teammate: "C9", nemesis: "C10", victim: "C11" },
    };
    await client.deleteRows("F1", ["R1", "R2"]);
    await client.writeSnapshot(definition, [
      { gameWinRate: 75, gamesLost: 1, gamesPlayed: 4, gamesWon: 3, playerId: "U1", rank: 1, standing: "🥇", teammate: "UT", nemesis: "UN", victim: "", updatedOn: "2026-08-30" },
      { gameWinRate: 50, gamesLost: 2, gamesPlayed: 4, gamesWon: 2, playerId: "U2", rank: 2, standing: "🥈", teammate: "", nemesis: "", victim: "UV", updatedOn: "2026-08-30" },
    ]);
    expect(fetcher).toHaveBeenNthCalledWith(1, "https://slack.com/api/slackLists.items.deleteMultiple", expect.objectContaining({ body: expect.stringContaining('"ids":["R1","R2"]') }));
    const create1 = requestBody(fetcher, 1);
    const create2 = requestBody(fetcher, 2);
    expect(create1).toMatchObject({ list_id: "F1" });
    expect(create1.initial_fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_id: "C1",
          rich_text: expect.arrayContaining([
            expect.objectContaining({
              type: "rich_text",
              elements: expect.arrayContaining([
                expect.objectContaining({
                  type: "rich_text_section",
                  elements: expect.arrayContaining([
                    expect.objectContaining({ type: "text", text: "🥇" }),
                  ]),
                }),
              ]),
            }),
          ]),
        }),
        expect.objectContaining({ column_id: "C2", user: ["U1"] }),
        expect.objectContaining({ column_id: "C3", number: [1] }),
        expect.objectContaining({ column_id: "C7", number: [75] }),
        expect.objectContaining({ column_id: "C9", user: ["UT"] }),
        expect.objectContaining({ column_id: "C10", user: ["UN"] }),
      ]),
    );
    expect(create1.initial_fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ column_id: "C11" })]),
    );
    expect(create2.initial_fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_id: "C1",
          rich_text: expect.anything(),
        }),
        expect.objectContaining({ column_id: "C2", user: ["U2"] }),
        expect.objectContaining({ column_id: "C11", user: ["UV"] }),
      ]),
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("grants the channel read-only List access", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const client = new HttpSlackClient("xoxb-secret", fetcher);
    await client.grantChannelReadAccess("F1", "C1");
    expect(requestBody(fetcher, 0)).toEqual({
      access_level: "read",
      channel_ids: ["C1"],
      list_id: "F1",
    });
  });

  it("paginates every existing List row", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          items: [{ id: "R1" }],
          ok: true,
          response_metadata: { next_cursor: "next" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: "R2" }], ok: true }),
      );
    const client = new HttpSlackClient("xoxb-secret", fetcher);
    await expect(client.listRowIds("F1")).resolves.toEqual(["R1", "R2"]);
    expect(fetcher.mock.calls[1]![1]!.body).toContain('"cursor":"next"');
  });

  it("turns list_not_found into the application recreation signal", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: "list_not_found", ok: false }),
    );
    const client = new HttpSlackClient("xoxb-secret", fetcher);
    await expect(client.listRowIds("missing")).rejects.toMatchObject({
      name: "LeaderboardListNotFoundError",
    });
  });

  it("keeps Slack capability errors actionable", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: "lists_disabled_user_team", ok: false }),
    );
    const client = new HttpSlackClient("xoxb-secret", fetcher);
    await expect(client.create("Ċomba Leaderboard")).rejects.toMatchObject({
      code: "lists_disabled_user_team",
      message:
        "Slack slackLists.create failed: lists_disabled_user_team",
    });
  });

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

function requestBody(fetcher: { mock: { calls: unknown } }, index: number) {
  const calls = fetcher.mock.calls as Array<[string, RequestInit]>;
  return JSON.parse(calls[index]![1].body as string) as Record<string, any>;
}
