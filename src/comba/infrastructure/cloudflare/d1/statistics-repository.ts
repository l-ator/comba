import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import type {
  HeadToHeadRecord,
  LeaderboardRecord,
  PlayerStatisticsRecord,
  StatisticsRepository,
  TeammateRecord,
} from "@comba/application/ports/statistics-repository";

interface NumericRow {
  [key: string]: number;
}

@scoped(Lifecycle.ContainerScoped)
export class D1StatisticsRepository implements StatisticsRepository {
  constructor(@inject(TOKENS.database) private readonly database: D1Database) {}

  async getLeaderboard(workspaceId: string): Promise<LeaderboardRecord[]> {
    const result = await this.database
      .prepare(
        `SELECT
         p.user_id AS playerId,
         SUM(json_extract(g.scores_json, '$.A') + json_extract(g.scores_json, '$.B')) AS gamesPlayed,
         SUM(CASE p.team_id WHEN 'A'
           THEN json_extract(g.scores_json, '$.A') ELSE json_extract(g.scores_json, '$.B') END) AS gamesWon,
         SUM(CASE p.team_id WHEN 'A'
           THEN json_extract(g.scores_json, '$.B') ELSE json_extract(g.scores_json, '$.A') END) AS gamesLost
       FROM game_participants p
       JOIN games g ON g.id = p.game_id
       WHERE p.workspace_id = ?
       GROUP BY p.user_id`,
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
        `SELECT
           COALESCE(SUM(json_extract(g.scores_json, '$.A') + json_extract(g.scores_json, '$.B')), 0) AS gamesPlayed,
           COALESCE(SUM(CASE p.team_id
             WHEN 'A' THEN json_extract(g.scores_json, '$.A') ELSE json_extract(g.scores_json, '$.B') END), 0) AS gamesWon,
           COALESCE(SUM(CASE p.team_id
             WHEN 'A' THEN json_extract(g.scores_json, '$.B') ELSE json_extract(g.scores_json, '$.A') END), 0) AS gamesLost
         FROM game_participants p
         JOIN games g ON g.id = p.game_id
         WHERE p.workspace_id = ? AND p.user_id = ?
        `,
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
        `SELECT
           COALESCE(SUM(json_extract(g.scores_json, '$.A') + json_extract(g.scores_json, '$.B')), 0) AS gamesAgainst,
           COALESCE(SUM(CASE a.team_id
             WHEN 'A' THEN json_extract(g.scores_json, '$.A') ELSE json_extract(g.scores_json, '$.B') END), 0) AS playerAWins,
           COALESCE(SUM(CASE a.team_id
             WHEN 'A' THEN json_extract(g.scores_json, '$.B') ELSE json_extract(g.scores_json, '$.A') END), 0) AS playerBWins
         FROM game_participants a
         JOIN game_participants b
           ON b.game_id = a.game_id AND b.user_id = ? AND b.team_id <> a.team_id
         JOIN games g ON g.id = a.game_id
         WHERE a.workspace_id = ? AND a.user_id = ?`,
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
        `SELECT
           COALESCE(SUM(json_extract(g.scores_json, '$.A') + json_extract(g.scores_json, '$.B')), 0) AS gamesPlayedTogether,
           COALESCE(SUM(CASE a.team_id
             WHEN 'A' THEN json_extract(g.scores_json, '$.A') ELSE json_extract(g.scores_json, '$.B') END), 0) AS gamesWonTogether,
           COALESCE(SUM(CASE a.team_id
             WHEN 'A' THEN json_extract(g.scores_json, '$.B') ELSE json_extract(g.scores_json, '$.A') END), 0) AS gamesLostTogether
         FROM game_participants a
         JOIN game_participants b
           ON b.game_id = a.game_id AND b.user_id = ? AND b.team_id = a.team_id
         JOIN games g ON g.id = a.game_id
         WHERE a.workspace_id = ? AND a.user_id = ?`,
      )
      .bind(playerBId, workspaceId, playerAId)
      .first<NumericRow>();

    return numericRecord<TeammateRecord>(row, [
      "gamesLostTogether",
      "gamesPlayedTogether",
      "gamesWonTogether",
    ]);
  }
}

function numericRecord<T>(row: NumericRow | null, keys: (keyof T)[]): T {
  return Object.fromEntries(
    keys.map((key) => [key, Number(row?.[String(key)] ?? 0)]),
  ) as T;
}
