import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { D1StatisticsRepository } from "@comba/infrastructure/cloudflare/d1/statistics-repository";

describe("D1StatisticsRepository relational leaderboard", () => {
  const repository = () => new D1StatisticsRepository(env.DB!);

  async function seed(): Promise<void> {
    const games = [
      // 2v2, team A = [U1, U2], team B = [U3, U4]
      { id: "G1", scores: '{"A":6,"B":4}' },
      { id: "G2", scores: '{"A":6,"B":4}' },
      { id: "G3", scores: '{"A":6,"B":4}' },
      { id: "G4", scores: '{"A":3,"B":7}' },
      { id: "G5", scores: '{"A":3,"B":7}' },
      // 1v1
      { id: "G6", scores: '{"A":6,"B":4}' }, // team A U1, team B U3 -> U1 beats U3
      { id: "G7", scores: '{"A":3,"B":7}' }, // team A U1, team B U4 -> U4 beats U1
    ];
    const rows: Array<[string, string, "A" | "B", number]> = [
      ["G1", "U1", "A", 0],
      ["G1", "U2", "A", 1],
      ["G1", "U3", "B", 0],
      ["G1", "U4", "B", 1],
      ["G2", "U1", "A", 0],
      ["G2", "U2", "A", 1],
      ["G2", "U3", "B", 0],
      ["G2", "U4", "B", 1],
      ["G3", "U1", "A", 0],
      ["G3", "U2", "A", 1],
      ["G3", "U3", "B", 0],
      ["G3", "U4", "B", 1],
      ["G4", "U1", "A", 0],
      ["G4", "U2", "A", 1],
      ["G4", "U3", "B", 0],
      ["G4", "U4", "B", 1],
      ["G5", "U1", "A", 0],
      ["G5", "U2", "A", 1],
      ["G5", "U3", "B", 0],
      ["G5", "U4", "B", 1],
      ["G6", "U1", "A", 0],
      ["G6", "U3", "B", 0],
      ["G7", "U1", "A", 0],
      ["G7", "U4", "B", 0],
    ];
    for (const game of games) {
      await env.DB!.prepare(
        `INSERT INTO games
           (id, workspace_id, channel_id, message_ts, format_json, teams_json,
            scores_json, created_at, ready_at, completed_at, submitted_by,
            updated_at, updated_by)
         VALUES (?, ?, ?, NULL, '{}', '{}', ?, ?, NULL, ?, 'U-ADMIN', ?, 'U-ADMIN')`,
      )
        .bind(
          game.id,
          "T1",
          "C1",
          game.scores,
          "2026-08-30T00:00:00Z",
          "2026-08-30T00:00:01Z",
          "2026-08-30T00:00:01Z",
        )
        .run();
    }
    for (const [gameId, userId, teamId, order] of rows) {
      await env.DB!.prepare(
        `INSERT INTO game_participants
           (game_id, workspace_id, user_id, team_id, player_order, joined_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(gameId, "T1", userId, teamId, order, "2026-08-30T00:00:00Z")
        .run();
    }
  }

  it("derives best teammate, nemesis and victim per player", async () => {
    await seed();
    const byPlayer = new Map(
      (await repository().getRelationalLeaderboard("T1")).map((entry) => [
        entry.playerId,
        entry,
      ]),
    );

    const u1 = byPlayer.get("U1")!;
    expect(u1.bestTeammate).toEqual({
      gamesPlayedNeedle: 5,
      gamesWonWith: 3,
      partnerId: "U2",
    });
    // U1's team loses to U3 2x (2v2) + beats U3 4x; victim is most-beaten opponent
    expect(u1.victim).toEqual({ count: 4, opponentId: "U3" });
    // U1 loses to U3 2x, to U4 3x (2 in 2v2 + 1 in G7)
    expect(u1.nemesis).toEqual({ count: 3, opponentId: "U4" });

    const u2 = byPlayer.get("U2")!;
    expect(u2.bestTeammate).toEqual({
      gamesPlayedNeedle: 5,
      gamesWonWith: 3,
      partnerId: "U1",
    });
  });

  it("returns a player's most recent games newest-first", async () => {
    const games = [
      { id: "R1", scores: '{"A":6,"B":4}', at: "2026-07-01T12:00:00Z" }, // A wins
      { id: "R2", scores: '{"A":3,"B":7}', at: "2026-07-02T12:00:00Z" }, // B wins
      { id: "R3", scores: '{"A":6,"B":4}', at: "2026-07-03T12:00:00Z" }, // A wins
      { id: "R4", scores: '{"A":3,"B":7}', at: "2026-07-04T12:00:00Z" }, // B wins
      { id: "R5", scores: '{"A":6,"B":4}', at: "2026-07-05T12:00:00Z" }, // A wins
      { id: "R6", scores: '{"A":3,"B":7}', at: "2026-07-06T12:00:00Z" }, // B wins
    ];
    for (const game of games) {
      await env.DB!.prepare(
        `INSERT INTO games
           (id, workspace_id, channel_id, message_ts, format_json, teams_json,
            scores_json, created_at, ready_at, completed_at, submitted_by,
            updated_at, updated_by)
         VALUES (?, ?, ?, NULL, '{}', '{}', ?, ?, NULL, ?, 'U-ADMIN', ?, 'U-ADMIN')`,
      )
        .bind(game.id, "T1", "C1", game.scores, game.at, game.at, game.at)
        .run();
    }
    for (const [gameId, team] of [
      ["R1", "A"],
      ["R2", "A"],
      ["R3", "A"],
      ["R4", "A"],
      ["R5", "A"],
      ["R6", "A"],
    ] as const) {
      await env.DB!.prepare(
        `INSERT INTO game_participants
           (game_id, workspace_id, user_id, team_id, player_order, joined_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(gameId, "T1", "U-FORM", team, 0, "2026-07-01T00:00:00Z")
        .run();
    }

    const recent = await repository().getRecentGames("T1", "U-FORM", 5);

    expect(recent.map((game) => game.gameId)).toEqual([
      "R6",
      "R5",
      "R4",
      "R3",
      "R2",
    ]);
    expect(recent.map((game) => game.won)).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });
});
