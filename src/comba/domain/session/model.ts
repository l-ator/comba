export enum SessionStatus {
  OPEN = "OPEN",
  READY = "READY",
}

export interface TeamDefinition {
  capacity: number;
  id: TeamId;
}

export type TeamId = "A" | "B";

export interface GameFormat {
  id: string;
  teams: TeamDefinition[];
}

export interface Player {
  joinedAt: string;
  position: number;
  userId: string;
}

export interface Team {
  id: TeamId;
  players: Player[];
}

export interface LiveSession {
  channelId: string;
  createdAt: string;
  creatorUserId: string;
  expiresAt: string;
  format: GameFormat;
  id: string;
  messageTs?: string;
  readyAt?: string;
  revision: number;
  status: SessionStatus;
  teams: Team[];
  workspaceId: string;
}

export interface CompletedSession {
  channelId: string;
  completedAt: string;
  createdAt: string;
  format: GameFormat;
  id: string;
  messageTs?: string;
  readyAt?: string;
  gameScores: TeamId[];
  submittedBy: string;
  teams: Team[];
  updatedAt: string;
  updatedBy: string;
  workspaceId: string;
}

export interface BenchOutcome {
  activeSession: LiveSession | null;
  previousSession: LiveSession;
}

export interface CompletedSessionMutation {
  current: CompletedSession;
  previous: CompletedSession | null;
}

export interface SessionRoomState {
  activeSession: LiveSession | null;
  pendingArchives: Record<string, CompletedSession>;
  pendingExpirations: Record<string, LiveSession>;
}

export const DEFAULT_GAME_FORMAT: GameFormat = {
  id: "table-football-2v2",
  teams: [
    { capacity: 2, id: "A" },
    { capacity: 2, id: "B" },
  ],
};
