import type { SessionRoomResult } from "@comba/domain/session/room-result";
import type {
  BenchOutcome,
  CompletedSession,
  CompletedSessionMutation,
  LiveSession,
  TeamId,
} from "@comba/domain/session/model";

export interface StartRoomCommand {
  channelId: string;
  creatorUserId: string;
  id: string;
  now: string;
  workspaceId: string;
}

export interface JoinRoomCommand {
  now: string;
  position: number;
  sessionId: string;
  teamId: string;
  userId: string;
}

export interface CompleteRoomCommand {
  now: string;
  gameScores: TeamId[];
  sessionId: string;
  userId: string;
}

export interface SessionRoomPort {
  abandon(
    workspaceId: string,
    channelId: string,
    sessionId: string,
  ): Promise<void>;
  amendPending(
    workspaceId: string,
    channelId: string,
    sessionId: string,
    userId: string,
    gameScores: TeamId[],
    now: string,
  ): Promise<SessionRoomResult<CompletedSessionMutation>>;
  attachMessage(
    workspaceId: string,
    channelId: string,
    sessionId: string,
    messageTs: string,
  ): Promise<SessionRoomResult<LiveSession>>;
  bench(
    workspaceId: string,
    channelId: string,
    sessionId: string,
    userId: string,
  ): Promise<SessionRoomResult<BenchOutcome>>;
  cancelActive(
    workspaceId: string,
    channelId: string,
  ): Promise<SessionRoomResult<LiveSession>>;
  complete(
    workspaceId: string,
    channelId: string,
    command: CompleteRoomCommand,
  ): Promise<SessionRoomResult<CompletedSession>>;
  join(
    workspaceId: string,
    channelId: string,
    command: JoinRoomCommand,
  ): Promise<SessionRoomResult<LiveSession>>;
  prepareResult(
    workspaceId: string,
    channelId: string,
    sessionId: string,
    userId: string,
  ): Promise<SessionRoomResult<LiveSession>>;
  start(command: StartRoomCommand): Promise<SessionRoomResult<LiveSession>>;
}
