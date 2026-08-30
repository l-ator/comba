import { describe, expect, it, vi } from "vitest";

import { LeaderboardListService } from "@comba/application/leaderboard-list-service";
import { LeaderboardListNotFoundError } from "@comba/application/ports/leaderboard-list";
import { GameOutcome } from "@comba/domain/statistics/model";

const columns = {
  form: "form",
  nemesis: "nemesis",
  player: "player",
  rank: "rank",
  record: "record",
  teammate: "teammate",
  victim: "victim",
  winRate: "rate",
};

describe("LeaderboardListService", () => {
  it("creates and writes a complete leaderboard snapshot", async () => {
    const { service, lists, repository, statistics } = setup(null);
    const result = await service.sync("T1", "C1");
    expect(result).toMatchObject({ created: true, listId: "F1", rows: 1 });
    expect(statistics.getLeaderboard).toHaveBeenCalledWith("T1");
    expect(lists.grantChannelReadAccess).toHaveBeenCalledWith("F1", "C1");
    expect(lists.writeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ listId: "F1" }),
      [
        expect.objectContaining({
          playerId: "U1",
          rank: 1,
          recentOutcomes: [
            GameOutcome.WON,
            GameOutcome.WON,
            GameOutcome.LOST,
          ],
        }),
      ],
    );
    expect(repository.markSynced).toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ listId: "F1", lastSyncedAt: null }),
    );
  });

  it("bulk replaces rows in an existing List", async () => {
    const { service, lists } = setup(stored());
    await service.sync("T1", "C1");
    expect(lists.deleteRows).toHaveBeenCalledWith("F1", ["R1", "R2"]);
    expect(lists.grantChannelReadAccess).toHaveBeenCalledWith("F1", "C1");
    expect(lists.create).not.toHaveBeenCalled();
  });

  it("recreates a List that Slack no longer has", async () => {
    const fixture = setup(stored());
    fixture.lists.listRowIds.mockRejectedValueOnce(
      new LeaderboardListNotFoundError(),
    );
    await expect(fixture.service.sync("T1", "C1")).resolves.toMatchObject({
      created: true,
    });
    expect(fixture.lists.create).toHaveBeenCalled();
  });

  it("does not write rows for an empty leaderboard", async () => {
    const fixture = setup(stored(), []);
    await fixture.service.sync("T1", "C1");
    expect(fixture.lists.writeSnapshot).not.toHaveBeenCalled();
    expect(fixture.repository.markSynced).toHaveBeenCalled();
  });

  it("stores last_synced_at only after the replacement succeeds", async () => {
    const fixture = setup(stored());
    fixture.lists.writeSnapshot.mockRejectedValueOnce(new Error("Slack down"));
    await expect(fixture.service.sync("T1", "C1")).rejects.toThrow(
      "Slack down",
    );
    expect(fixture.repository.markSynced).not.toHaveBeenCalled();
  });

  it("repeated synchronization converges on the same List and snapshot", async () => {
    const fixture = setup(stored());
    await fixture.service.sync("T1", "C1");
    await fixture.service.sync("T1", "C1");
    expect(fixture.lists.create).not.toHaveBeenCalled();
    expect(fixture.lists.deleteRows).toHaveBeenCalledTimes(2);
    expect(fixture.lists.writeSnapshot).toHaveBeenCalledTimes(2);
    expect(fixture.lists.writeSnapshot.mock.calls[0]).toEqual(
      fixture.lists.writeSnapshot.mock.calls[1],
    );
  });

  it("isolates failures while synchronizing all configured Lists", async () => {
    const fixture = setup(stored());
    fixture.repository.listAll.mockResolvedValueOnce(
      [stored(), { ...stored(), channelId: "C2" }] as never,
    );
    fixture.repository.find
      .mockResolvedValueOnce(stored())
      .mockRejectedValueOnce(new Error("D1 unavailable"));
    const results = await fixture.service.syncAll();
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
  });
});

function setup(
  configuration: ReturnType<typeof stored> | null,
  players = [
    {
      gameWinRate: 75,
      gamesLost: 1,
      gamesPlayed: 4,
      gamesWon: 3,
      playerId: "U1",
    },
  ],
) {
  const statistics = {
    getLeaderboard: vi.fn(async () => ({
      biggestLossRatio: null,
      biggestWinRatio: null,
      mostGames: null,
      players,
    })),
    getRecentOutcomes: vi.fn(async () => [
      GameOutcome.WON,
      GameOutcome.WON,
      GameOutcome.LOST,
    ]),
  };
  const lists = {
    create: vi.fn(async () => ({ columns, listId: "F1" })),
    deleteRows: vi.fn(async () => undefined),
    grantChannelReadAccess: vi.fn(async () => undefined),
    listRowIds: vi.fn(async () => ["R1", "R2"]),
    writeSnapshot: vi.fn(async () => undefined),
  };
  const repository = {
    find: vi.fn(async () => configuration),
    listAll: vi.fn(async () => []),
    markSynced: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
  };
  return {
    lists,
    repository,
    statistics,
    service: new LeaderboardListService(
      statistics as never,
      lists,
      repository,
      () => new Date("2026-08-30T12:00:00Z"),
    ),
  };
}

function stored() {
  return {
    channelId: "C1",
    columns,
    createdAt: "2026-08-30T10:00:00Z",
    lastSyncedAt: null,
    listId: "F1",
    workspaceId: "T1",
  };
}
