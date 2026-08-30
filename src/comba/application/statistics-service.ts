import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import type {
  HeadToHeadStatistics,
  Leaderboard,
  PlayerStatistics,
  TeammateStatistics,
} from "@comba/domain/statistics/model";
import type { StatisticsRepository } from "./ports/statistics-repository";

@scoped(Lifecycle.ContainerScoped)
export class StatisticsService {
  constructor(
    @inject(TOKENS.statisticsRepository)
    private readonly repository: StatisticsRepository,
  ) {}

  async getPlayerStats(
    workspaceId: string,
    playerId: string,
  ): Promise<PlayerStatistics> {
    const totals = await this.repository.getPlayerStatistics(
      workspaceId,
      playerId,
    );

    return {
      ...totals,
      gameWinRate: percentage(totals.gamesWon, totals.gamesPlayed),
    };
  }

  async getLeaderboard(workspaceId: string): Promise<Leaderboard> {
    const players = (await this.repository.getLeaderboard(workspaceId))
      .map((player) => ({
        ...player,
        gameWinRate: percentage(player.gamesWon, player.gamesPlayed),
      }))
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
