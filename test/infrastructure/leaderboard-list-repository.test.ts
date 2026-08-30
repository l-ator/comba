import { describe, expect, it } from "vitest";

import { KVLeaderboardListRepository } from "@comba/infrastructure/cloudflare/kv/leaderboard-list-repository";
import type { StoredLeaderboardList } from "@comba/application/ports/leaderboard-list-repository";

describe("KVLeaderboardListRepository", () => {
  it("stores and finds a List under a workspace/channel key", async () => {
    const kv = new FakeKV();
    const repository = new KVLeaderboardListRepository(kv as never);
    const record = stored("T1", "C1");

    await repository.save(record);

    expect(await repository.find("T1", "C1")).toEqual(record);
    expect(kv.keys()).toEqual(["leaderboard:T1:C1"]);
  });

  it("returns null when no List is stored for a workspace/channel", async () => {
    const repository = new KVLeaderboardListRepository(
      new FakeKV() as never,
    );
    await expect(repository.find("T1", "C9")).resolves.toBeNull();
  });

  it("enumerates all stored Lists", async () => {
    const kv = new FakeKV();
    const repository = new KVLeaderboardListRepository(kv as never);
    const first = stored("T1", "C1");
    const second = stored("T1", "C2", "F2");
    await repository.save(first);
    await repository.save(second);

    await expect(repository.listAll()).resolves.toEqual([first, second]);
  });

  it("marks the sync timestamp without touching other fields", async () => {
    const repository = new KVLeaderboardListRepository(
      new FakeKV() as never,
    );
    await repository.save(stored("T1", "C1"));
    const at = "2026-08-30T13:00:00Z";

    await repository.markSynced("T1", "C1", at);

    const found = await repository.find("T1", "C1");
    expect(found?.lastSyncedAt).toBe(at);
    expect(found?.listId).toBe("F1");
  });

  it("ignores markSynced when no record exists", async () => {
    const repository = new KVLeaderboardListRepository(
      new FakeKV() as never,
    );
    await expect(
      repository.markSynced("T1", "C9", "2026-08-30T13:00:00Z"),
    ).resolves.toBeUndefined();
  });
});

function stored(
  workspaceId: string,
  channelId: string,
  listId = "F1",
): StoredLeaderboardList {
  return {
    channelId,
    columns: {
      lastUpdated: "last",
      lost: "lost",
      nemesis: "nemesis",
      played: "played",
      player: "player",
      rank: "rank",
      standing: "standing",
      teammate: "teammate",
      victim: "victim",
      winRate: "rate",
      won: "won",
    },
    createdAt: "2026-08-30T12:00:00Z",
    lastSyncedAt: null,
    listId,
    workspaceId,
  };
}

class FakeKV {
  private readonly values = new Map<string, string>();

  keys(): string[] {
    return [...this.values.keys()];
  }

  async get<T = unknown>(key: string, type: "json"): Promise<T | null> {
    const value = this.values.get(key);
    return value === undefined ? null : (JSON.parse(value) as T);
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async list(options: { prefix: string }): Promise<{ keys: Array<{ name: string }> }> {
    const keys = [...this.values.keys()]
      .filter((key) => key.startsWith(options.prefix))
      .map((name) => ({ name }));
    return { keys };
  }
}
