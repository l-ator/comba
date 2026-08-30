import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import type {
  BestTeammateRecord,
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

  private async bestTeammates(
    workspaceId: string,
  ): Promise<Array<{ bestTeammate: BestTeammateRecord; playerId: string }>> {
    const result = await this.database
      .prepare(
        `WITH teammate_games AS (
           SELECT me.user_id AS playerId,
                  partner.user_id AS partnerId,
                  me.team_id AS teamId,
                  g.scores_json AS scores
           FROM game_participants me
           JOIN game_participants partner
             ON partner.game_id = me.game_id
            AND partner.user_id <> me.user_id
            AND partner.team_id = me.team_id
           JOIN games g ON g.id = me.game_id
           WHERE me.workspace_id = ?
         ),
         teammate_agg AS (
           SELECT playerId, partnerId,
                  COUNT(*) AS games,
                  SUM(CASE WHEN (teamId = 'A' AND json_extract(scores,'$.A') > json_extract(scores,'$.B'))
                            OR (teamId = 'B' AND json_extract(scores,'$.B') > json_extract(scores,'$.A'))
                           THEN 1 ELSE 0 END) AS wins
           FROM teammate_games
           GROUP BY playerId, partnerId
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
    const pick =
      mode === "wins"
        ? `CASE WHEN (teamId = 'A' AND json_extract(scores,'$.A') > json_extract(scores,'$.B'))
                 OR (teamId = 'B' AND json_extract(scores,'$.B') > json_extract(scores,'$.A'))
                THEN 1 ELSE 0 END`
        : `CASE WHEN (teamId = 'A' AND json_extract(scores,'$.A') < json_extract(scores,'$.B'))
                 OR (teamId = 'B' AND json_extract(scores,'$.B') < json_extract(scores,'$.A'))
                THEN 1 ELSE 0 END`;
    const result = await this.database
      .prepare(
        `WITH opponent_games AS (
           SELECT me.user_id AS playerId,
                  opponent.user_id AS opponentId,
                  me.team_id AS teamId,
                  g.scores_json AS scores
           FROM game_participants me
           JOIN game_participants opponent
             ON opponent.game_id = me.game_id
            AND opponent.user_id <> me.user_id
            AND opponent.team_id <> me.team_id
           JOIN games g ON g.id = me.game_id
           WHERE me.workspace_id = ?
         ),
         needle_agg AS (
           SELECT playerId, opponentId, SUM(${pick}) AS payload
           FROM opponent_games
           GROUP BY playerId, opponentId
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
