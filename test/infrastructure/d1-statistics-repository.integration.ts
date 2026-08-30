import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { D1StatisticsRepository } from "@comba/infrastructure/cloudflare/d1/statistics-repository";
import type { Team, TeamId } from "@comba/domain/session/model";

describe("D1StatisticsRepository", () => {
  const repository = () => new D1StatisticsRepository(env.DB!);

  it("derives per-game teammate, nemesis and victim statistics", async () => {
    const standardTeams = teams(["U1", "U2"], ["U3", "U4"]);
    await Promise.all([
      insertSession("G1", winners(6, 4), standardTeams),
      insertSession("G2", winners(6, 4), standardTeams),
      insertSession("G3", winners(6, 4), standardTeams),
      insertSession("G4", winners(3, 7), standardTeams),
      insertSession("G5", winners(3, 7), standardTeams),
      insertSession("G6", winners(6, 4), teams(["U1"], ["U3"])),
      insertSession("G7", winners(3, 7), teams(["U1"], ["U4"])),
    ]);

    const byPlayer = new Map(
      (await repository().getRelationalLeaderboard("T1")).map((entry) => [
        entry.playerId,
        entry,
      ]),
    );

    const u1 = byPlayer.get("U1")!;
    expect(u1.bestTeammate).toEqual({
      gamesPlayedNeedle: 50,
      gamesWonWith: 24,
      partnerId: "U2",
    });
    expect(u1.victim).toEqual({ count: 30, opponentId: "U3" });
    expect(u1.nemesis).toEqual({ count: 33, opponentId: "U4" });

    const u2 = byPlayer.get("U2")!;
    expect(u2.bestTeammate).toEqual({
      gamesPlayedNeedle: 50,
      gamesWonWith: 24,
      partnerId: "U1",
    });
  });

  it("returns individual games newest-first within and across sessions", async () => {
    await insertSession(
      "R1",
      ["A", "B"],
      teams(["U-FORM"], ["U-OTHER"]),
      "2026-07-01T12:00:00Z",
    );
    await insertSession(
      "R2",
      ["B", "A", "B"],
      teams(["U-FORM"], ["U-OTHER"]),
      "2026-07-02T12:00:00Z",
    );

    const recent = await repository().getRecentGames("T1", "U-FORM", 5);

    expect(recent.map(({ sessionId, gameIndex }) => [sessionId, gameIndex])).toEqual([
      ["R2", 2],
      ["R2", 1],
      ["R2", 0],
      ["R1", 1],
      ["R1", 0],
    ]);
    expect(recent.map((game) => game.won)).toEqual([
      false,
      true,
      false,
      false,
      true,
    ]);
  });
});

async function insertSession(
  id: string,
  gameScores: TeamId[],
  sessionTeams: Team[],
  completedAt = "2026-08-30T00:00:01Z",
): Promise<void> {
  await env.DB!.prepare(
    `INSERT INTO sessions
       (id, workspace_id, channel_id, message_ts, format_json, teams_json,
        game_scores, created_at, ready_at, completed_at, submitted_by,
        updated_at, updated_by)
     VALUES (?, 'T1', 'C1', NULL, '{}', ?, ?, ?, NULL, ?, 'U-ADMIN', ?, 'U-ADMIN')`,
  )
    .bind(
      id,
      JSON.stringify(sessionTeams),
      JSON.stringify(gameScores),
      completedAt,
      completedAt,
      completedAt,
    )
    .run();
}

function winners(teamAWins: number, teamBWins: number): TeamId[] {
  return [
    ...Array<TeamId>(teamAWins).fill("A"),
    ...Array<TeamId>(teamBWins).fill("B"),
  ];
}

function teams(teamA: string[], teamB: string[]): Team[] {
  return [
    {
      id: "A",
      players: teamA.map((userId, index) => ({
        joinedAt: "2026-08-30T00:00:00Z",
        position: index + 1,
        userId,
      })),
    },
    {
      id: "B",
      players: teamB.map((userId, index) => ({
        joinedAt: "2026-08-30T00:00:00Z",
        position: index + 1,
        userId,
      })),
    },
  ];
}
