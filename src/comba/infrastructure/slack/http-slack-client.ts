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
import type {
  LeaderboardListColumns,
  LeaderboardListDefinition,
  LeaderboardListPort,
  LeaderboardListRow,
} from "@comba/application/ports/leaderboard-list";
import { LeaderboardListNotFoundError } from "@comba/application/ports/leaderboard-list";

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
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "SlackApiError";
    if (code)
      Object.defineProperty(this, "code", { enumerable: false, value: code });
  }
}

@scoped(Lifecycle.ContainerScoped)
export class HttpSlackClient implements SlackClient, LeaderboardListPort {
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

  async create(name: string): Promise<LeaderboardListDefinition> {
    const keys: Array<
      [keyof LeaderboardListColumns, string, string, boolean?]
    > = [
      ["standing", "standing", "Standing", true],
      ["player", "player", "Player"],
      ["rank", "rank", "Rank"],
      ["played", "played", "Played"],
      ["won", "won", "Won"],
      ["lost", "lost", "Lost"],
      ["winRate", "win_rate", "Win rate"],
      ["lastUpdated", "last_updated", "Last updated"],
      ["teammate", "teammate", "Best teammate"],
      ["nemesis", "nemesis", "Nemesis"],
      ["victim", "victim", "Victim"],
    ];
    const payload = await this.request("slackLists.create", {
      name,
      schema: keys.map(([property, key, name, primary]) => ({
        key,
        name,
        type:
          property === "player" ||
          property === "teammate" ||
          property === "nemesis" ||
          property === "victim"
            ? "user"
            : property === "lastUpdated"
              ? "date"
              : property === "rank" ||
                  property === "played" ||
                  property === "won" ||
                  property === "lost" ||
                  property === "winRate"
                ? "number"
                : "text",
        ...(primary ? { is_primary_column: true } : {}),
        ...(property === "player" ||
        property === "teammate" ||
        property === "nemesis" ||
        property === "victim"
          ? { options: { format: "single_entity" } }
          : {}),
        ...(property === "winRate" ? { options: { precision: 1 } } : {}),
      })),
    });
    const parsed = z
      .object({
        list_id: z.string(),
        list_metadata: z.object({
          schema: z.array(z.object({ id: z.string(), key: z.string() })),
        }),
        ok: z.literal(true),
      })
      .parse(payload);
    const byKey = Object.fromEntries(
      parsed.list_metadata.schema.map((column) => [column.key, column.id]),
    );
    return {
      listId: parsed.list_id,
      columns: {
        standing: requiredColumn(byKey, "standing"),
        player: requiredColumn(byKey, "player"),
        rank: requiredColumn(byKey, "rank"),
        played: requiredColumn(byKey, "played"),
        won: requiredColumn(byKey, "won"),
        lost: requiredColumn(byKey, "lost"),
        winRate: requiredColumn(byKey, "win_rate"),
        lastUpdated: requiredColumn(byKey, "last_updated"),
        teammate: requiredColumn(byKey, "teammate"),
        nemesis: requiredColumn(byKey, "nemesis"),
        victim: requiredColumn(byKey, "victim"),
      },
    };
  }

  async grantChannelReadAccess(
    listId: string,
    channelId: string,
  ): Promise<void> {
    await this.requestOk("slackLists.access.set", {
      access_level: "read",
      channel_ids: [channelId],
      list_id: listId,
    });
  }

  async listRowIds(listId: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      try {
        const payload = await this.request("slackLists.items.list", {
          list_id: listId,
          limit: 100,
          ...(cursor ? { cursor } : {}),
        });
        const parsed = z
          .object({
            items: z.array(z.object({ id: z.string() })),
            ok: z.literal(true),
            response_metadata: z
              .object({ next_cursor: z.string().optional() })
              .optional(),
          })
          .parse(payload);
        ids.push(...parsed.items.map((item) => item.id));
        cursor = parsed.response_metadata?.next_cursor || undefined;
      } catch (error) {
        if (error instanceof SlackApiError && error.code === "list_not_found")
          throw new LeaderboardListNotFoundError();
        throw error;
      }
    } while (cursor);
    return ids;
  }

  async deleteRows(listId: string, rowIds: string[]): Promise<void> {
    if (rowIds.length)
      await this.requestOk("slackLists.items.deleteMultiple", {
        ids: rowIds,
        list_id: listId,
      });
  }

  async writeSnapshot(
    definition: LeaderboardListDefinition,
    rows: LeaderboardListRow[],
  ): Promise<void> {
    for (const row of rows) {
      const fields = [
        {
          column_id: definition.columns.standing,
          rich_text: richText(row.standing),
        },
        { column_id: definition.columns.player, user: [row.playerId] },
        { column_id: definition.columns.rank, number: [row.rank] },
        { column_id: definition.columns.played, number: [row.gamesPlayed] },
        { column_id: definition.columns.won, number: [row.gamesWon] },
        { column_id: definition.columns.lost, number: [row.gamesLost] },
        { column_id: definition.columns.winRate, number: [row.gameWinRate] },
        { column_id: definition.columns.lastUpdated, date: [row.updatedOn] },
        ...(row.teammate
          ? [{ column_id: definition.columns.teammate, user: [row.teammate] }]
          : []),
        ...(row.nemesis
          ? [{ column_id: definition.columns.nemesis, user: [row.nemesis] }]
          : []),
        ...(row.victim
          ? [{ column_id: definition.columns.victim, user: [row.victim] }]
          : []),
      ];
      await this.requestOk("slackLists.items.create", {
        list_id: definition.listId,
        initial_fields: fields,
      });
    }
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
    method: string,
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
        slackError.data.error,
      );
    }

    return payload;
  }

  private async requestOk(
    method: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const payload = await this.request(method, body);
    if (!z.object({ ok: z.literal(true) }).safeParse(payload).success) {
      throw new SlackApiError(`Slack ${method} returned an invalid response`);
    }
  }
}

function requiredColumn(columns: Record<string, string>, key: string): string {
  const value = columns[key];
  if (!value)
    throw new SlackApiError(`Slack list response omitted ${key} column`);
  return value;
}

function richText(text: string) {
  return [
    {
      type: "rich_text",
      elements: [
        { type: "rich_text_section", elements: [{ type: "text", text }] },
      ],
    },
  ];
}

