import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import { liveSessionToView } from "./models/session-view";
import type { SessionRoomPort } from "./ports/session-room";
import type { SessionRoomFailure } from "@comba/domain/session/room-result";
import type {
  Team,
  TeamPosition,
} from "@comba/application/models/session-view";
import {
  DuplicateParticipantError,
  OpenSessionExistsError,
  PositionOccupiedError,
  SessionChannelNotAllowedError,
  SessionNotFoundError,
  SessionNotOpenError,
  SessionParticipantNotFoundError,
  TeamFullError,
} from "./session-errors";

export interface StartSessionInput {
  channelId: string;
  creatorUserId: string;
  workspaceId: string;
}

export interface SessionActorInput {
  channelId: string;
  sessionId: string;
  userId: string;
  workspaceId: string;
}

export interface JoinSessionInput extends SessionActorInput {
  position: TeamPosition;
  team: Team;
}

export interface SessionServiceOptions {
  allowedChannelId: string;
  createId?: () => string;
  now?: () => Date;
}

@scoped(Lifecycle.ContainerScoped)
export class SessionService {
  private readonly allowed: string;
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    @inject(TOKENS.sessionRoom)
    private readonly rooms: SessionRoomPort,
    @inject(TOKENS.allowedChannelId)
    allowedChannelIdOrOptions: string | SessionServiceOptions,
    @inject(TOKENS.createId) injectedCreateId?: () => string,
    @inject(TOKENS.now) injectedNow?: () => Date,
  ) {
    const options =
      typeof allowedChannelIdOrOptions === "string"
        ? {
            allowedChannelId: allowedChannelIdOrOptions,
            createId: injectedCreateId,
            now: injectedNow,
          }
        : allowedChannelIdOrOptions;
    this.allowed = options.allowedChannelId;
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => new Date());
  }

  get allowedChannelId(): string {
    return this.allowed;
  }

  async start(input: StartSessionInput) {
    if (input.channelId !== this.allowed) {
      throw new SessionChannelNotAllowedError();
    }
    const result = await this.rooms.start({
      ...input,
      id: this.createId(),
      now: this.now().toISOString(),
    });
    if (!result.ok) throw mapFailure(result);
    return liveSessionToView(result.value);
  }

  async attachMessage(
    sessionId: string,
    messageTs: string,
    workspaceId: string,
    channelId: string,
  ): Promise<void> {
    const result = await this.rooms.attachMessage(
      workspaceId,
      channelId,
      sessionId,
      messageTs,
    );
    if (!result.ok) throw mapFailure(result);
  }

  abandonUnpublished(
    sessionId: string,
    workspaceId: string,
    channelId: string,
  ): Promise<void> {
    return this.rooms.abandon(workspaceId, channelId, sessionId);
  }

  async join(input: JoinSessionInput) {
    const result = await this.rooms.join(input.workspaceId, input.channelId, {
      now: this.now().toISOString(),
      position: input.position,
      sessionId: input.sessionId,
      teamId: input.team,
      userId: input.userId,
    });
    if (!result.ok) throw mapFailure(result);
    return {
      becameReady: result.value.status === "READY",
      state: liveSessionToView(result.value),
    };
  }

  async bench(input: SessionActorInput) {
    const result = await this.rooms.bench(
      input.workspaceId,
      input.channelId,
      input.sessionId,
      input.userId,
    );
    if (!result.ok) throw mapFailure(result);
    if (result.value.activeSession) {
      return liveSessionToView(result.value.activeSession);
    }
    const cancelled = liveSessionToView(result.value.previousSession);
    cancelled.session.status = "CANCELLED";
    return cancelled;
  }

  async abortActive(workspaceId: string, channelId: string): Promise<void> {
    const result = await this.rooms.cancelActive(workspaceId, channelId);
    if (!result.ok) throw mapFailure(result);
  }
}

function mapFailure(failure: SessionRoomFailure): Error {
  switch (failure.error.code) {
    case "ACTIVE_SESSION_EXISTS":
      return new OpenSessionExistsError();
    case "INVALID_POSITION":
      return new PositionOccupiedError();
    case "NOT_PARTICIPATING":
      return new SessionParticipantNotFoundError();
    case "SESSION_NOT_FOUND":
      return new SessionNotFoundError();
    case "TEAM_FULL":
      return new TeamFullError();
    case "SESSION_NOT_READY":
    case "TEAM_NOT_FOUND":
      return new SessionNotOpenError();
  }
}
