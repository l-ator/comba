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

export function completedSessionToView(
  completed: CompletedSession,
): SessionWithParticipants {
  const participants = completed.teams.flatMap((team) =>
    team.players.map((player) => ({
      joinedAt: player.joinedAt,
      position: player.position as TeamPosition,
      sessionId: completed.id,
      team: team.id as Team,
      userId: player.userId,
      workspaceId: completed.workspaceId,
    })),
  );
  return {
    participants,
    result: {
      createdAt: completed.completedAt,
      sessionId: completed.id,
      submittedBy: completed.submittedBy,
      teamAWins: completed.gameScores.filter((winner) => winner === "A").length,
      teamBWins: completed.gameScores.filter((winner) => winner === "B").length,
      updatedAt: completed.updatedAt,
      updatedBy: completed.updatedBy,
    },
    session: {
      channelId: completed.channelId,
      completedAt: completed.completedAt,
      createdAt: completed.createdAt,
      creatorUserId: participants[0]?.userId ?? completed.submittedBy,
      expiresAt: completed.readyAt ?? completed.completedAt,
      id: completed.id,
      messageTs: completed.messageTs ?? null,
      readyAt: completed.readyAt ?? null,
      revision: 0,
      status: "COMPLETED",
      workspaceId: completed.workspaceId,
    },
  };
}
import type { SessionResult } from "@comba/domain/result/model";
import type { CompletedSession, LiveSession } from "@comba/domain/session/model";
