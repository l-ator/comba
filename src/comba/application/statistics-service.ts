import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import { GameOutcome } from "@comba/domain/statistics/model";
import type {
  HeadToHeadStatistics,
  Leaderboard,
  PlayerStatistics,
  PlayerStats,
  RelationalStats,
  TeammateStatistics,
} from "@comba/domain/statistics/model";
import type {
  RelationalLeaderboardEntry,
  StatisticsRepository,
} from "./ports/statistics-repository";

@scoped(Lifecycle.ContainerScoped)
export class StatisticsService {
  constructor(
    @inject(TOKENS.statisticsRepository)
    private readonly repository: StatisticsRepository,
  ) {}

  async getPlayerStats(
    workspaceId: string,
    playerId: string,
  ): Promise<PlayerStats> {
    const [totals, relational] = await Promise.all([
      this.repository.getPlayerStatistics(workspaceId, playerId),
      this.repository.getRelationalLeaderboard(workspaceId),
    ]);
    const rel = relationalStats(
      relational.find((entry) => entry.playerId === playerId),
    );

    return {
      ...totals,
      gameWinRate: percentage(totals.gamesWon, totals.gamesPlayed),
      ...(rel ? { relational: rel } : {}),
    };
  }

  async getLeaderboard(workspaceId: string): Promise<Leaderboard> {
    const [rawPlayers, relational] = await Promise.all([
      this.repository.getLeaderboard(workspaceId),
      this.repository.getRelationalLeaderboard(workspaceId),
    ]);
    const relationalByPlayer = new Map(
      relational.map((entry) => [entry.playerId, entry]),
    );
    const players = rawPlayers
      .map((player) => {
        const rel = relationalStats(
          relationalByPlayer.get(player.playerId),
        );
        return {
          ...player,
          gameWinRate: percentage(player.gamesWon, player.gamesPlayed),
          ...(rel ? { relational: rel } : {}),
        };
      })
      .sort(
        (left, right) =>
          right.gamesWon - left.gamesWon ||
          right.gameWinRate - left.gameWinRate ||
          right.gamesPlayed - left.gamesPlayed ||
          left.playerId.localeCompare(right.playerId),
      );
    return {
      biggestLossRatio: extreme(players, (player) =>
        percentage(player.gamesLost, player.gamesPlayed),
      ),
      biggestWinRatio: extreme(players, (player) => player.gameWinRate),
      mostGames: extreme(players, (player) => player.gamesPlayed),
      players,
    };
  }

  async getPlayerStatsLegacy(
    workspaceId: string,
    playerId: string,
  ): Promise<PlayerStats> {
    const totals = await this.repository.getPlayerStatistics(
      workspaceId,
      playerId,
    );
    return {
      ...totals,
      gameWinRate: percentage(totals.gamesWon, totals.gamesPlayed),
    };
  }

  async getHeadToHead(
    workspaceId: string,
    playerAId: string,
    playerBId: string,
  ): Promise<HeadToHeadStatistics> {
    const totals = await this.repository.getHeadToHead(
      workspaceId,
      playerAId,
      playerBId,
    );

    return {
      ...totals,
      playerAWinRate: percentage(totals.playerAWins, totals.gamesAgainst),
    };
  }

  async getTeammateStats(
    workspaceId: string,
    playerAId: string,
    playerBId: string,
  ): Promise<TeammateStatistics> {
    const totals = await this.repository.getTeammateStatistics(
      workspaceId,
      playerAId,
      playerBId,
    );

    return {
      ...totals,
      winRateTogether: percentage(
        totals.gamesWonTogether,
        totals.gamesPlayedTogether,
      ),
    };
  }

  async getRecentOutcomes(
    workspaceId: string,
    playerId: string,
    limit = 5,
  ): Promise<GameOutcome[]> {
    const games = await this.repository.getRecentGames(
      workspaceId,
      playerId,
      limit,
    );
    return games.map((game) =>
      game.won ? GameOutcome.WON : GameOutcome.LOST,
    );
  }
}

function relationalStats(
  entry: RelationalLeaderboardEntry | undefined,
): RelationalStats | null {
  if (!entry) return null;
  return {
    bestTeammate: entry.bestTeammate?.partnerId ?? null,
    gamesPlayedTogether: entry.bestTeammate?.gamesPlayedNeedle ?? 0,
    nemesis: entry.nemesis?.opponentId ?? null,
    nemesisCount: entry.nemesis?.count ?? 0,
    victim: entry.victim?.opponentId ?? null,
    victimCount: entry.victim?.count ?? 0,
  };
}

function extreme<T>(values: T[], score: (value: T) => number): T | null {
  return values.reduce<T | null>(
    (best, value) =>
      best === null || score(value) > score(best) ? value : best,
    null,
  );
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}
