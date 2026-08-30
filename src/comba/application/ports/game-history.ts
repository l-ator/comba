import type {
  CompletedSession,
  CompletedSessionMutation,
  TeamId,
} from "@comba/domain/session/model";

export interface GameHistoryPort {
  amend(
    sessionId: string,
    workspaceId: string,
    userId: string,
    gameScores: TeamId[],
    at: string,
  ): Promise<CompletedSessionMutation>;
  archive(session: CompletedSession): Promise<void>;
  getEditable(
    sessionId: string,
    workspaceId: string,
    userId: string,
  ): Promise<CompletedSession>;
}
