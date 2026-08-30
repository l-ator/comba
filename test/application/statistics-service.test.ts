import { describe, expect, it } from "vitest";

import type { StatisticsRepository } from "@comba/application/ports/statistics-repository";
import { StatisticsService } from "@comba/application/statistics-service";

describe("StatisticsService", () => {
  it("calculates game win percentages", async () => {
    const service = new StatisticsService(repository());

    await expect(
      service.getPlayerStats("T-PERSONAL", "U-MARIO"),
    ).resolves.toMatchObject({ gameWinRate: 60 });
  });

  it("returns zero percentages when no games exist", async () => {
    const empty = repository();
    empty.getHeadToHead = async () => ({
      gamesAgainst: 0,
      playerAWins: 0,
      playerBWins: 0,
    });
    empty.getTeammateStatistics = async () => ({
      gamesLostTogether: 0,
      gamesPlayedTogether: 0,
      gamesWonTogether: 0,
    });
    const service = new StatisticsService(empty);

    await expect(service.getHeadToHead("T", "U1", "U2")).resolves.toMatchObject(
      { playerAWinRate: 0 },
    );
    await expect(
      service.getTeammateStats("T", "U1", "U2"),
    ).resolves.toMatchObject({ winRateTogether: 0 });
  });

  it("ranks all players and derives fun leaderboard extremes", async () => {
    const data = repository();
    data.getLeaderboard = async () => [
      { gamesLost: 8, gamesPlayed: 10, gamesWon: 2, playerId: "U-BOB" },
      { gamesLost: 2, gamesPlayed: 10, gamesWon: 8, playerId: "U-ALICE" },
      { gamesLost: 4, gamesPlayed: 10, gamesWon: 6, playerId: "U-MARIO" },
    ];
    data.getRelationalLeaderboard = async () => [
      {
        playerId: "U-ALICE",
        bestTeammate: { gamesPlayedNeedle: 4, gamesWonWith: 4, partnerId: "U-MARIO" },
        nemesis: { count: 2, opponentId: "U-BOB" },
        victim: { count: 3, opponentId: "U-MARIO" },
      },
    ];
    const leaderboard = await new StatisticsService(data).getLeaderboard("T");
    expect(leaderboard.players.map((player) => player.playerId)).toEqual([
      "U-ALICE",
      "U-MARIO",
      "U-BOB",
    ]);
    expect(leaderboard.biggestWinRatio?.playerId).toBe("U-ALICE");
    expect(leaderboard.biggestLossRatio?.playerId).toBe("U-BOB");
    expect(leaderboard.mostGames?.gamesPlayed).toBe(10);
    expect(leaderboard.players[0]!.relational).toEqual({
      bestTeammate: "U-MARIO",
      gamesPlayedTogether: 4,
      nemesis: "U-BOB",
      nemesisCount: 2,
      victim: "U-MARIO",
      victimCount: 3,
    });
    expect(leaderboard.players[1]!.relational).toBeUndefined();
  });

  it("expands each session into per-game win/loss circles newest-first", async () => {
    const data = repository();
    const teamA = (players: string[]) => ({
      id: "A",
      players: players.map((userId) => ({ joinedAt: "2026-08-30", position: 0, userId })),
    });
    data.getRecentGames = async () => [
      { completedAt: "2026-08-30", gameId: "g3", scores: { A: 2, B: 1 }, teams: [teamA(["U1"])], won: 0 },
      { completedAt: "2026-08-29", gameId: "g2", scores: { A: 0, B: 3 }, teams: [teamA(["U1"])], won: 1 },
      { completedAt: "2026-08-28", gameId: "g1", scores: { A: 1, B: 0 }, teams: [teamA(["U1"])], won: 1 },
    ];
    const service = new StatisticsService(data);

    await expect(service.getRecentForm("T", "U1")).resolves.toEqual([
      "red_circle",
      "large_green_circle",
      "large_green_circle",
      "red_circle",
      "red_circle",
    ]);
  });
});

function repository(): StatisticsRepository {
  return {
    getLeaderboard: async () => [],
    getHeadToHead: async () => ({
      gamesAgainst: 10,
      playerAWins: 6,
      playerBWins: 4,
    }),
    getPlayerStatistics: async () => ({
      gamesLost: 4,
      gamesPlayed: 10,
      gamesWon: 6,
    }),
    getRelationalLeaderboard: async () => [],
    getTeammateStatistics: async () => ({
      gamesLostTogether: 4,
      gamesPlayedTogether: 10,
      gamesWonTogether: 6,
    }),
    getRecentGames: async () => [],
  };
}
