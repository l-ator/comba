export const SESSION_LIFETIME_MS = 5 * 60 * 1_000;

export type SessionStatus =
  | "OPEN"
  | "READY"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export type Team = "A" | "B";
export type TeamPosition = 1 | 2;

export interface Session {
  channelId: string;
  completedAt: string | null;
  createdAt: string;
  creatorUserId: string;
  expiresAt: string;
  id: string;
  messageTs: string | null;
  readyAt: string | null;
  revision: number;
  status: SessionStatus;
  workspaceId: string;
}

export interface SessionParticipant {
  joinedAt: string;
  position: TeamPosition;
  sessionId: string;
  team: Team;
  userId: string;
  workspaceId: string;
}

export interface SessionWithParticipants {
  participants: SessionParticipant[];
  result: SessionResult | null;
  session: Session;
}

export function liveSessionToView(
  session: LiveSession,
): SessionWithParticipants {
  return {
    participants: session.teams.flatMap((team) =>
      team.players.map((player) => ({
        joinedAt: player.joinedAt,
        position: player.position as TeamPosition,
        sessionId: session.id,
        team: team.id as Team,
        userId: player.userId,
        workspaceId: session.workspaceId,
      })),
    ),
    result: null,
    session: {
      channelId: session.channelId,
      completedAt: null,
      createdAt: session.createdAt,
      creatorUserId: session.creatorUserId,
      expiresAt: session.expiresAt,
      id: session.id,
      messageTs: session.messageTs ?? null,
      readyAt: session.readyAt ?? null,
      revision: session.revision,
      status: session.status,
      workspaceId: session.workspaceId,
    },
  };
}

export function completedGameToView(
  game: CompletedGame,
): SessionWithParticipants {
  const participants = game.teams.flatMap((team) =>
    team.players.map((player) => ({
      joinedAt: player.joinedAt,
      position: player.position as TeamPosition,
      sessionId: game.id,
      team: team.id as Team,
      userId: player.userId,
      workspaceId: game.workspaceId,
    })),
  );
  return {
    participants,
    result: {
      createdAt: game.completedAt,
      sessionId: game.id,
      submittedBy: game.submittedBy,
      teamAWins: game.scores.A ?? 0,
      teamBWins: game.scores.B ?? 0,
      updatedAt: game.updatedAt,
      updatedBy: game.updatedBy,
    },
    session: {
      channelId: game.channelId,
      completedAt: game.completedAt,
      createdAt: game.createdAt,
      creatorUserId: participants[0]?.userId ?? game.submittedBy,
      expiresAt: game.readyAt ?? game.completedAt,
      id: game.id,
      messageTs: game.messageTs ?? null,
      readyAt: game.readyAt ?? null,
      revision: 0,
      status: "COMPLETED",
      workspaceId: game.workspaceId,
    },
  };
}
import type { SessionResult } from "@comba/domain/result/model";
import type { CompletedGame, LiveSession } from "@comba/domain/session/model";
