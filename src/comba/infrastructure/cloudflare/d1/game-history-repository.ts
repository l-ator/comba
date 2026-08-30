import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import type { CompletedGame } from "@comba/domain/session/model";
import type { CompletedGameMutation } from "@comba/domain/session/model";
import type { GameHistoryPort } from "@comba/application/ports/game-history";
import {
  ResultPermissionError,
  ResultSessionNotEligibleError,
} from "@comba/domain/result/errors";

interface GameRow {
  channel_id: string;
  completed_at: string;
  created_at: string;
  format_json: string;
  id: string;
  message_ts: string | null;
  ready_at: string | null;
  scores_json: string;
  submitted_by: string;
  teams_json: string;
  updated_at: string;
  updated_by: string;
  workspace_id: string;
}

@scoped(Lifecycle.ContainerScoped)
export class D1GameHistoryRepository implements GameHistoryPort {
  constructor(@inject(TOKENS.database) private readonly database: D1Database) {}

  async archive(game: CompletedGame): Promise<void> {
    const statements = [
      this.database
        .prepare(
          `INSERT INTO games (
             id, workspace_id, channel_id, message_ts, format_json, teams_json, scores_json,
             created_at, ready_at, completed_at, submitted_by, updated_at, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             scores_json = excluded.scores_json,
             updated_at = excluded.updated_at,
             updated_by = excluded.updated_by
           WHERE excluded.updated_at >= games.updated_at`,
        )
        .bind(
          game.id,
          game.workspaceId,
          game.channelId,
          game.messageTs ?? null,
          JSON.stringify(game.format),
          JSON.stringify(game.teams),
          JSON.stringify(game.scores),
          game.createdAt,
          game.readyAt ?? null,
          game.completedAt,
          game.submittedBy,
          game.updatedAt,
          game.updatedBy,
        ),
      ...game.teams.flatMap((team) =>
        team.players.map((player) =>
          this.database
            .prepare(
              `INSERT INTO game_participants (
                 game_id, workspace_id, user_id, team_id, player_order, joined_at
               ) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(game_id, user_id) DO NOTHING`,
            )
            .bind(
              game.id,
              game.workspaceId,
              player.userId,
              team.id,
              player.position - 1,
              player.joinedAt,
            ),
        ),
      ),
    ];

    await this.database.batch(statements);
  }

  async getEditable(
    gameId: string,
    workspaceId: string,
    userId: string,
  ): Promise<CompletedGame> {
    const game = await this.get(gameId, workspaceId);
    if (!game) throw new ResultSessionNotEligibleError();
    if (!isParticipant(game, userId)) throw new ResultPermissionError();
    return game;
  }

  async amend(
    gameId: string,
    workspaceId: string,
    userId: string,
    scores: Record<string, number>,
    at: string,
  ): Promise<CompletedGameMutation> {
    const previous = await this.getEditable(gameId, workspaceId, userId);
    if (sameScores(previous.scores, scores)) {
      return { current: previous, previous };
    }

    const result = await this.database
      .prepare(
        `UPDATE games
         SET scores_json = ?, updated_at = ?, updated_by = ?
         WHERE id = ? AND workspace_id = ?
           AND EXISTS (
             SELECT 1 FROM game_participants
             WHERE game_id = games.id AND user_id = ?
           )`,
      )
      .bind(JSON.stringify(scores), at, userId, gameId, workspaceId, userId)
      .run();
    if (result.meta.changes !== 1) throw new ResultSessionNotEligibleError();

    return {
      current: { ...previous, scores, updatedAt: at, updatedBy: userId },
      previous,
    };
  }

  async get(
    gameId: string,
    workspaceId: string,
  ): Promise<CompletedGame | null> {
    const row = await this.database
      .prepare(
        `SELECT id, workspace_id, channel_id, message_ts, format_json,
           teams_json, scores_json, created_at, ready_at, completed_at,
           submitted_by, updated_at, updated_by
         FROM games WHERE id = ? AND workspace_id = ?`,
      )
      .bind(gameId, workspaceId)
      .first<GameRow>();
    return row ? mapGame(row) : null;
  }
}

function mapGame(row: GameRow): CompletedGame {
  return {
    channelId: row.channel_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    format: JSON.parse(row.format_json),
    id: row.id,
    ...(row.message_ts ? { messageTs: row.message_ts } : {}),
    ...(row.ready_at ? { readyAt: row.ready_at } : {}),
    scores: JSON.parse(row.scores_json),
    submittedBy: row.submitted_by,
    teams: JSON.parse(row.teams_json),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    workspaceId: row.workspace_id,
  };
}

function isParticipant(game: CompletedGame, userId: string): boolean {
  return game.teams.some((team) =>
    team.players.some((player) => player.userId === userId),
  );
}

function sameScores(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}
