import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import type {
  BestTeammateRecord,
  GameOutcomeRecord,
  HeadToHeadNeedleRecord,
  HeadToHeadRecord,
  LeaderboardRecord,
  PlayerStatisticsRecord,
  RelationalLeaderboardEntry,
  StatisticsRepository,
  TeammateRecord,
} from "@comba/application/ports/statistics-repository";

interface NumericRow {
  [key: string]: number;
}

interface TeammateNeedleRow {
  games: number;
  partnerId: string;
  playerId: string;
  wins: number;
}

interface NeedleRow {
  count: number;
  opponentId: string;
  playerId: string;
}

interface RecentGameRow {
  completedAt: string;
  gameIndex: number;
  sessionId: string;
  won: number;
}

const ATOMIC_GAMES_CTE = `WITH session_participants AS (
  SELECT s.id AS sessionId,
         s.workspace_id AS workspaceId,
         s.completed_at AS completedAt,
         s.game_scores AS gameScores,
         json_extract(team.value, '$.id') AS teamId,
         json_extract(player.value, '$.userId') AS userId
  FROM sessions s
  JOIN json_each(s.teams_json) team
  JOIN json_each(team.value, '$.players') player
),
atomic_games AS (
  SELECT participant.*,
         CAST(score.key AS INTEGER) AS gameIndex,
         CAST(score.value AS TEXT) AS winnerTeamId
  FROM session_participants participant
  JOIN json_each(participant.gameScores) score
)`;

@scoped(Lifecycle.ContainerScoped)
export class D1StatisticsRepository implements StatisticsRepository {
  constructor(@inject(TOKENS.database) private readonly database: D1Database) {}

  async getLeaderboard(workspaceId: string): Promise<LeaderboardRecord[]> {
    const result = await this.database
      .prepare(
        `${ATOMIC_GAMES_CTE}
         SELECT userId AS playerId,
                COUNT(*) AS gamesPlayed,
                SUM(winnerTeamId = teamId) AS gamesWon,
                SUM(winnerTeamId <> teamId) AS gamesLost
         FROM atomic_games
         WHERE workspaceId = ?
         GROUP BY userId`,
      )
      .bind(workspaceId)
      .all<LeaderboardRecord>();
    return result.results.map((row) => ({
      gamesLost: Number(row.gamesLost),
      gamesPlayed: Number(row.gamesPlayed),
      gamesWon: Number(row.gamesWon),
      playerId: row.playerId,
    }));
  }

  async getPlayerStatistics(
    workspaceId: string,
    playerId: string,
  ): Promise<PlayerStatisticsRecord> {
    const row = await this.database
      .prepare(
        `${ATOMIC_GAMES_CTE}
         SELECT COUNT(*) AS gamesPlayed,
                COALESCE(SUM(winnerTeamId = teamId), 0) AS gamesWon,
                COALESCE(SUM(winnerTeamId <> teamId), 0) AS gamesLost
         FROM atomic_games
         WHERE workspaceId = ? AND userId = ?`,
      )
      .bind(workspaceId, playerId)
      .first<NumericRow>();

    return numericRecord<PlayerStatisticsRecord>(row, [
      "gamesLost",
      "gamesPlayed",
      "gamesWon",
    ]);
  }

  async getHeadToHead(
    workspaceId: string,
    playerAId: string,
    playerBId: string,
  ): Promise<HeadToHeadRecord> {
    const row = await this.database
      .prepare(
        `${ATOMIC_GAMES_CTE}
         SELECT COUNT(*) AS gamesAgainst,
                COALESCE(SUM(game.winnerTeamId = game.teamId), 0) AS playerAWins,
                COALESCE(SUM(game.winnerTeamId <> game.teamId), 0) AS playerBWins
         FROM atomic_games game
         JOIN session_participants opponent
           ON opponent.sessionId = game.sessionId
          AND opponent.userId = ?
          AND opponent.teamId <> game.teamId
         WHERE game.workspaceId = ? AND game.userId = ?`,
      )
      .bind(playerBId, workspaceId, playerAId)
      .first<NumericRow>();

    return numericRecord<HeadToHeadRecord>(row, [
      "gamesAgainst",
      "playerAWins",
      "playerBWins",
    ]);
  }

  async getTeammateStatistics(
    workspaceId: string,
    playerAId: string,
    playerBId: string,
  ): Promise<TeammateRecord> {
    const row = await this.database
      .prepare(
        `${ATOMIC_GAMES_CTE}
         SELECT COUNT(*) AS gamesPlayedTogether,
                COALESCE(SUM(game.winnerTeamId = game.teamId), 0) AS gamesWonTogether,
                COALESCE(SUM(game.winnerTeamId <> game.teamId), 0) AS gamesLostTogether
         FROM atomic_games game
         JOIN session_participants teammate
           ON teammate.sessionId = game.sessionId
          AND teammate.userId = ?
          AND teammate.teamId = game.teamId
         WHERE game.workspaceId = ? AND game.userId = ?`,
      )
      .bind(playerBId, workspaceId, playerAId)
      .first<NumericRow>();

    return numericRecord<TeammateRecord>(row, [
      "gamesLostTogether",
      "gamesPlayedTogether",
      "gamesWonTogether",
    ]);
  }

  async getRelationalLeaderboard(
    workspaceId: string,
  ): Promise<RelationalLeaderboardEntry[]> {
    const [teammates, nemeses, victims] = await Promise.all([
      this.bestTeammates(workspaceId),
      this.needles(workspaceId, "losses"),
      this.needles(workspaceId, "wins"),
    ]);
    const found = new Set<string>();
    for (const row of [...teammates, ...nemeses, ...victims]) {
      found.add(row.playerId);
    }
    return [...found].map((playerId) => ({
      playerId,
      bestTeammate:
        teammates.find((row) => row.playerId === playerId)?.bestTeammate ??
        null,
      nemesis: nemeses.find((row) => row.playerId === playerId)?.needle ?? null,
      victim: victims.find((row) => row.playerId === playerId)?.needle ?? null,
    }));
  }

  async getRecentGames(
    workspaceId: string,
    playerId: string,
    limit: number,
  ): Promise<GameOutcomeRecord[]> {
    const result = await this.database
      .prepare(
        `${ATOMIC_GAMES_CTE}
         SELECT sessionId,
                gameIndex,
                completedAt,
                winnerTeamId = teamId AS won
         FROM atomic_games
         WHERE workspaceId = ? AND userId = ?
         ORDER BY completedAt DESC, gameIndex DESC
         LIMIT ?`,
      )
      .bind(workspaceId, playerId, limit)
      .all<RecentGameRow>();

    return result.results.map((row) => ({
      completedAt: row.completedAt,
      gameIndex: Number(row.gameIndex),
      sessionId: row.sessionId,
      won: Boolean(row.won),
    }));
  }

  private async bestTeammates(
    workspaceId: string,
  ): Promise<Array<{ bestTeammate: BestTeammateRecord; playerId: string }>> {
    const result = await this.database
      .prepare(
        `${ATOMIC_GAMES_CTE},
         teammate_agg AS (
           SELECT game.userId AS playerId,
                  teammate.userId AS partnerId,
                  COUNT(*) AS games,
                  SUM(game.winnerTeamId = game.teamId) AS wins
           FROM atomic_games game
           JOIN session_participants teammate
             ON teammate.sessionId = game.sessionId
            AND teammate.userId <> game.userId
            AND teammate.teamId = game.teamId
           WHERE game.workspaceId = ?
           GROUP BY game.userId, teammate.userId
           HAVING games >= 3
         ),
         best AS (
           SELECT playerId, partnerId, games, wins,
                  ROW_NUMBER() OVER (
                    PARTITION BY playerId
                    ORDER BY wins * 1.0 / games DESC, games DESC, partnerId ASC
                  ) AS rn
           FROM teammate_agg
         )
         SELECT playerId, partnerId, games, wins
         FROM best WHERE rn = 1`,
      )
      .bind(workspaceId)
      .all<TeammateNeedleRow>();
    return result.results.map((row) => ({
      playerId: row.playerId,
      bestTeammate: {
        gamesPlayedNeedle: Number(row.games),
        gamesWonWith: Number(row.wins),
        partnerId: row.partnerId,
      },
    }));
  }

  private async needles(
    workspaceId: string,
    mode: "wins" | "losses",
  ): Promise<Array<{ needle: HeadToHeadNeedleRecord; playerId: string }>> {
    const outcome =
      mode === "wins"
        ? "game.winnerTeamId = game.teamId"
        : "game.winnerTeamId <> game.teamId";
    const result = await this.database
      .prepare(
        `${ATOMIC_GAMES_CTE},
         needle_agg AS (
           SELECT game.userId AS playerId,
                  opponent.userId AS opponentId,
                  SUM(${outcome}) AS payload
           FROM atomic_games game
           JOIN session_participants opponent
             ON opponent.sessionId = game.sessionId
            AND opponent.userId <> game.userId
            AND opponent.teamId <> game.teamId
           WHERE game.workspaceId = ?
           GROUP BY game.userId, opponent.userId
         ),
         ranked AS (
           SELECT playerId, opponentId, payload,
                  ROW_NUMBER() OVER (
                    PARTITION BY playerId
                    ORDER BY payload DESC, opponentId ASC
                  ) AS rn
           FROM needle_agg
         )
         SELECT playerId, opponentId, payload AS count
         FROM ranked WHERE rn = 1`,
      )
      .bind(workspaceId)
      .all<NeedleRow>();
    return result.results.map((row) => ({
      playerId: row.playerId,
      needle: { count: Number(row.count), opponentId: row.opponentId },
    }));
  }
}

function numericRecord<T>(row: NumericRow | null, keys: (keyof T)[]): T {
  return Object.fromEntries(
    keys.map((key) => [key, Number(row?.[String(key)] ?? 0)]),
  ) as T;
}
