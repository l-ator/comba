import type {
  CompletedGame,
  CompletedGameMutation,
} from "@comba/domain/session/model";

export interface GameHistoryPort {
  amend(
    gameId: string,
    workspaceId: string,
    userId: string,
    scores: Record<string, number>,
    at: string,
  ): Promise<CompletedGameMutation>;
  archive(game: CompletedGame): Promise<void>;
  getEditable(
    gameId: string,
    workspaceId: string,
    userId: string,
  ): Promise<CompletedGame>;
}
