export enum SessionStatus {
  OPEN = "OPEN",
  READY = "READY",
}

export interface TeamDefinition {
  capacity: number;
  id: string;
}

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
  id: string;
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

export interface CompletedGame {
  channelId: string;
  completedAt: string;
  createdAt: string;
  format: GameFormat;
  id: string;
  messageTs?: string;
  readyAt?: string;
  scores: Record<string, number>;
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

export interface CompletedGameMutation {
  current: CompletedGame;
  previous: CompletedGame | null;
}

export interface SessionRoomState {
  activeSession: LiveSession | null;
  pendingArchives: Record<string, CompletedGame>;
  pendingExpirations: Record<string, LiveSession>;
}

export const DEFAULT_GAME_FORMAT: GameFormat = {
  id: "table-football-2v2",
  teams: [
    { capacity: 2, id: "A" },
    { capacity: 2, id: "B" },
  ],
};
