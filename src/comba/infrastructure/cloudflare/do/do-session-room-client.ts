import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import type {
  CompleteRoomCommand,
  JoinRoomCommand,
  SessionRoomPort,
  StartRoomCommand,
} from "@comba/application/ports/session-room";
import type { CombaBindings } from "../bindings";
import type { DoSessionRoom } from "./do-session-room";

@scoped(Lifecycle.ContainerScoped)
export class DoSessionRoomClient implements SessionRoomPort {
  constructor(@inject(TOKENS.env) private readonly env: CombaBindings) {}

  room(workspaceId: string, channelId: string): DurableObjectStub<DoSessionRoom> {
    return this.env.SESSION_ROOMS.getByName(`${workspaceId}:${channelId}`);
  }

  start(command: StartRoomCommand) {
    return this.room(command.workspaceId, command.channelId).start(command);
  }

  attachMessage(
    workspaceId: string,
    channelId: string,
    sessionId: string,
    messageTs: string,
  ) {
    return this.room(workspaceId, channelId).attachMessage(
      sessionId,
      messageTs,
    );
  }

  abandon(workspaceId: string, channelId: string, sessionId: string) {
    return this.room(workspaceId, channelId).abandon(sessionId);
  }

  join(workspaceId: string, channelId: string, command: JoinRoomCommand) {
    return this.room(workspaceId, channelId).joinOrSwitch(command);
  }

  bench(
    workspaceId: string,
    channelId: string,
    sessionId: string,
    userId: string,
  ) {
    return this.room(workspaceId, channelId).bench(sessionId, userId);
  }

  cancelActive(workspaceId: string, channelId: string) {
    return this.room(workspaceId, channelId).cancelActive();
  }

  prepareResult(
    workspaceId: string,
    channelId: string,
    sessionId: string,
    userId: string,
  ) {
    return this.room(workspaceId, channelId).prepareResult(sessionId, userId);
  }

  complete(
    workspaceId: string,
    channelId: string,
    command: CompleteRoomCommand,
  ) {
    return this.room(workspaceId, channelId).complete(command);
  }

  amendPending(
    workspaceId: string,
    channelId: string,
    gameId: string,
    userId: string,
    scores: Record<string, number>,
    now: string,
  ) {
    return this.room(workspaceId, channelId).amendPending(
      gameId,
      userId,
      scores,
      now,
    );
  }
}
