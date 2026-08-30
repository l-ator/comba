import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import type {
  CompletedSession,
  CompletedSessionMutation,
  TeamId,
} from "@comba/domain/session/model";
import type { GameHistoryPort } from "@comba/application/ports/game-history";
import {
  ResultPermissionError,
  ResultSessionNotEligibleError,
} from "@comba/domain/result/errors";

interface SessionRow {
  channel_id: string;
  completed_at: string;
  created_at: string;
  format_json: string;
  game_scores: string;
  id: string;
  message_ts: string | null;
  ready_at: string | null;
  submitted_by: string;
  teams_json: string;
  updated_at: string;
  updated_by: string;
  workspace_id: string;
}

@scoped(Lifecycle.ContainerScoped)
export class D1GameHistoryRepository implements GameHistoryPort {
  constructor(@inject(TOKENS.database) private readonly database: D1Database) {}

  async archive(session: CompletedSession): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO sessions (
           id, workspace_id, channel_id, message_ts, format_json, teams_json,
           game_scores, created_at, ready_at, completed_at, submitted_by,
           updated_at, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           game_scores = excluded.game_scores,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by
         WHERE excluded.updated_at >= sessions.updated_at`,
      )
      .bind(
        session.id,
        session.workspaceId,
        session.channelId,
        session.messageTs ?? null,
        JSON.stringify(session.format),
        JSON.stringify(session.teams),
        JSON.stringify(session.gameScores),
        session.createdAt,
        session.readyAt ?? null,
        session.completedAt,
        session.submittedBy,
        session.updatedAt,
        session.updatedBy,
      )
      .run();
  }

  async getEditable(
    sessionId: string,
    workspaceId: string,
    userId: string,
  ): Promise<CompletedSession> {
    const session = await this.get(sessionId, workspaceId);
    if (!session) throw new ResultSessionNotEligibleError();
    if (!isParticipant(session, userId)) throw new ResultPermissionError();
    return session;
  }

  async amend(
    sessionId: string,
    workspaceId: string,
    userId: string,
    gameScores: TeamId[],
    at: string,
  ): Promise<CompletedSessionMutation> {
    const previous = await this.getEditable(sessionId, workspaceId, userId);
    if (sameGameScores(previous.gameScores, gameScores)) {
      return { current: previous, previous };
    }

    const result = await this.database
      .prepare(
        `UPDATE sessions
         SET game_scores = ?, updated_at = ?, updated_by = ?
         WHERE id = ? AND workspace_id = ?
           AND EXISTS (
             SELECT 1
             FROM json_each(sessions.teams_json) team
             JOIN json_each(team.value, '$.players') player
             WHERE json_extract(player.value, '$.userId') = ?
           )`,
      )
      .bind(
        JSON.stringify(gameScores),
        at,
        userId,
        sessionId,
        workspaceId,
        userId,
      )
      .run();
    if (result.meta.changes !== 1) throw new ResultSessionNotEligibleError();

    return {
      current: { ...previous, gameScores, updatedAt: at, updatedBy: userId },
      previous,
    };
  }

  async get(
    sessionId: string,
    workspaceId: string,
  ): Promise<CompletedSession | null> {
    const row = await this.database
      .prepare(
        `SELECT id, workspace_id, channel_id, message_ts, format_json,
           teams_json, game_scores, created_at, ready_at, completed_at,
           submitted_by, updated_at, updated_by
         FROM sessions WHERE id = ? AND workspace_id = ?`,
      )
      .bind(sessionId, workspaceId)
      .first<SessionRow>();
    return row ? mapSession(row) : null;
  }
}

function mapSession(row: SessionRow): CompletedSession {
  return {
    channelId: row.channel_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    format: JSON.parse(row.format_json),
    gameScores: JSON.parse(row.game_scores),
    id: row.id,
    ...(row.message_ts ? { messageTs: row.message_ts } : {}),
    ...(row.ready_at ? { readyAt: row.ready_at } : {}),
    submittedBy: row.submitted_by,
    teams: JSON.parse(row.teams_json),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    workspaceId: row.workspace_id,
  };
}

function isParticipant(session: CompletedSession, userId: string): boolean {
  return session.teams.some((team) =>
    team.players.some((player) => player.userId === userId),
  );
}

function sameGameScores(left: TeamId[], right: TeamId[]): boolean {
  return (
    left.length === right.length &&
    left.every((winner, index) => winner === right[index])
  );
}
