import { DurableObject } from "cloudflare:workers";

import type { CombaBindings } from "../bindings";
import { errorDetails } from "@shared/observability/error-details";
import { HttpSlackClient } from "@comba/infrastructure/slack/http-slack-client";
import { renderSession } from "@comba/presentation/slack/views/lobby";
import { D1GameHistoryRepository } from "@comba/infrastructure/cloudflare/d1/game-history-repository";
import { D1StatisticsRepository } from "@comba/infrastructure/cloudflare/d1/statistics-repository";
import { KVLeaderboardListRepository } from "@comba/infrastructure/cloudflare/kv/leaderboard-list-repository";
import { StatisticsService } from "@comba/application/statistics-service";
import { LeaderboardListService } from "@comba/application/leaderboard-list-service";
import { liveSessionToView } from "@comba/application/models/session-view";
import type {
  CompleteRoomCommand,
  JoinRoomCommand,
  StartRoomCommand,
} from "@comba/application/ports/session-room";
import {
  failure,
  success,
  type SessionRoomResult,
} from "@comba/domain/session/room-result";
import {
  DEFAULT_GAME_FORMAT,
  SessionStatus,
  type CompletedGame,
  type CompletedGameMutation,
  type BenchOutcome,
  type LiveSession,
  type SessionRoomState,
} from "@comba/domain/session/model";
import { bench, hasPlayer, joinOrSwitch } from "@comba/domain/session/rules";

const STATE_KEY = "room";
const RETRY_DELAY_MS = 60_000;
const MAX_EXPECTED_PENDING_ARCHIVES = 25;

export class DoSessionRoom extends DurableObject<CombaBindings> {
  private readonly history: D1GameHistoryRepository;
  private readonly slack: HttpSlackClient;
  private readonly leaderboardLists: LeaderboardListService;

  constructor(ctx: DurableObjectState, env: CombaBindings) {
    super(ctx, env);
    this.history = new D1GameHistoryRepository(env.DB);
    this.slack = new HttpSlackClient(env.SLACK_BOT_TOKEN, (input, init) =>
      fetch(input, init),
    );
    this.leaderboardLists = new LeaderboardListService(
      new StatisticsService(new D1StatisticsRepository(env.DB)),
      this.slack,
      new KVLeaderboardListRepository(env.LEADERBOARD_LIST),
      () => new Date(),
    );
  }

  async start(
    command: StartRoomCommand,
  ): Promise<SessionRoomResult<LiveSession>> {
    const state = await this.expireOverdue(
      await this.load(),
      new Date(command.now).getTime(),
    );
    if (state.activeSession) {
      return failure(
        "ACTIVE_SESSION_EXISTS",
        "There is already an open Ċomba lobby in this channel.",
      );
    }

    const createdAt = command.now;
    const session: LiveSession = {
      channelId: command.channelId,
      createdAt,
      creatorUserId: command.creatorUserId,
      expiresAt: new Date(
        new Date(createdAt).getTime() + 5 * 60_000,
      ).toISOString(),
      format: structuredClone(DEFAULT_GAME_FORMAT),
      id: command.id,
      revision: 0,
      status: SessionStatus.OPEN,
      teams: [
        {
          id: "A",
          players: [
            { joinedAt: createdAt, position: 1, userId: command.creatorUserId },
          ],
        },
        { id: "B", players: [] },
      ],
      workspaceId: command.workspaceId,
    };
    await this.save({ ...state, activeSession: session });
    await this.ctx.storage.setAlarm(new Date(session.expiresAt).getTime());
    return success(session);
  }

  async attachMessage(
    sessionId: string,
    messageTs: string,
  ): Promise<SessionRoomResult<LiveSession>> {
    const state = await this.expireOverdue(await this.load(), Date.now());
    const session = this.match(state, sessionId);
    if (!session.ok) return session;
    const activeSession = {
      ...session.value,
      messageTs,
    };
    await this.save({ ...state, activeSession });
    return success(activeSession);
  }

  async abandon(sessionId: string): Promise<void> {
    const state = await this.expireOverdue(await this.load(), Date.now());
    if (
      state.activeSession?.id === sessionId &&
      !state.activeSession.messageTs
    ) {
      await this.save({ ...state, activeSession: null });
    }
  }

  async joinOrSwitch(
    command: JoinRoomCommand,
  ): Promise<SessionRoomResult<LiveSession>> {
    const state = await this.expireOverdue(
      await this.load(),
      new Date(command.now).getTime(),
    );
    const matched = this.match(state, command.sessionId);
    if (!matched.ok) return matched;
    const result = joinOrSwitch(
      matched.value,
      command.userId,
      command.teamId,
      command.position,
      command.now,
    );
    if (!result.ok) return result;
    if (result.value !== matched.value) {
      await this.save({ ...state, activeSession: result.value });
      if (result.value.status === SessionStatus.READY) {
        await this.ctx.storage.deleteAlarm();
      }
    }
    return result;
  }

  async bench(
    sessionId: string,
    userId: string,
  ): Promise<SessionRoomResult<BenchOutcome>> {
    const state = await this.expireOverdue(await this.load(), Date.now());
    const matched = this.match(state, sessionId);
    if (!matched.ok) return matched;
    const result = bench(matched.value, userId);
    if (!result.ok) return result;
    await this.save({ ...state, activeSession: result.value });
    if (result.value?.status === SessionStatus.OPEN) {
      await this.ctx.storage.setAlarm(
        Math.max(Date.now(), new Date(result.value.expiresAt).getTime()),
      );
    }
    if (!result.value) await this.scheduleArchiveRetryIfNeeded(state);
    return success({
      activeSession: result.value,
      previousSession: matched.value,
    });
  }

  async prepareResult(
    sessionId: string,
    userId: string,
  ): Promise<SessionRoomResult<LiveSession>> {
    const state = await this.expireOverdue(await this.load(), Date.now());
    const matched = this.match(state, sessionId);
    if (!matched.ok) return matched;
    if (!hasPlayer(matched.value, userId)) {
      return failure(
        "NOT_PARTICIPATING",
        "Only players from this Ċomba session can record its result.",
      );
    }
    if (matched.value.status !== SessionStatus.READY) {
      return failure(
        "SESSION_NOT_READY",
        "This Ċomba is not ready for a result.",
      );
    }
    return matched;
  }

  async complete(
    command: CompleteRoomCommand,
  ): Promise<SessionRoomResult<CompletedGame>> {
    const state = await this.load();
    const matched = this.match(state, command.sessionId);
    if (!matched.ok) return matched;
    if (!hasPlayer(matched.value, command.userId)) {
      return failure(
        "NOT_PARTICIPATING",
        "Only players from this Ċomba session can record its result.",
      );
    }
    if (matched.value.status !== SessionStatus.READY) {
      return failure(
        "SESSION_NOT_READY",
        "This Ċomba is not ready for a result.",
      );
    }

    const game: CompletedGame = {
      channelId: matched.value.channelId,
      completedAt: command.now,
      createdAt: matched.value.createdAt,
      format: matched.value.format,
      id: matched.value.id,
      ...(matched.value.messageTs
        ? { messageTs: matched.value.messageTs }
        : {}),
      ...(matched.value.readyAt ? { readyAt: matched.value.readyAt } : {}),
      scores: command.scores,
      submittedBy: command.userId,
      teams: matched.value.teams,
      updatedAt: command.now,
      updatedBy: command.userId,
      workspaceId: matched.value.workspaceId,
    };
    const pendingArchives = { ...state.pendingArchives, [game.id]: game };
    await this.save({ ...state, activeSession: null, pendingArchives });
    if (Object.keys(pendingArchives).length > MAX_EXPECTED_PENDING_ARCHIVES) {
      console.warn("Ċomba archive outbox is unexpectedly large", {
        count: Object.keys(pendingArchives).length,
        workspaceId: game.workspaceId,
      });
    }
    this.ctx.waitUntil(this.flushArchive(game.id));
    return success(game);
  }

  async amendPending(
    gameId: string,
    userId: string,
    scores: Record<string, number>,
    now: string,
  ): Promise<SessionRoomResult<CompletedGameMutation>> {
    const state = await this.load();
    const previous = state.pendingArchives[gameId];
    if (!previous) {
      return failure("SESSION_NOT_FOUND", "This game is not pending archival.");
    }
    if (
      !previous.teams.some((team) =>
        team.players.some((player) => player.userId === userId),
      )
    ) {
      return failure(
        "NOT_PARTICIPATING",
        "Only players from this Ċomba session can record its result.",
      );
    }
    const current = {
      ...previous,
      scores,
      updatedAt: now,
      updatedBy: userId,
    };
    await this.save({
      ...state,
      pendingArchives: { ...state.pendingArchives, [gameId]: current },
    });
    this.ctx.waitUntil(this.flushArchive(gameId));
    return success({ current, previous });
  }

  async alarm(): Promise<void> {
    await this.expireOverdue(await this.load(), Date.now());
    await this.flushExpirationProjections();
    await this.flushPendingArchives();
    const latest = await this.load();
    if (latest.activeSession?.status === SessionStatus.OPEN) {
      await this.ctx.storage.setAlarm(
        new Date(latest.activeSession.expiresAt).getTime(),
      );
    } else if (
      Object.keys(latest.pendingArchives).length > 0 ||
      Object.keys(latest.pendingExpirations).length > 0
    ) {
      await this.ctx.storage.setAlarm(Date.now() + RETRY_DELAY_MS);
    }
  }

  async inspect(): Promise<SessionRoomState> {
    return this.load();
  }

  private async flushPendingArchives(): Promise<void> {
    const state = await this.load();
    for (const gameId of Object.keys(state.pendingArchives)) {
      await this.flushArchive(gameId);
    }
  }

  private async expireOverdue(
    state: SessionRoomState,
    now: number,
  ): Promise<SessionRoomState> {
    const session = state.activeSession;
    if (
      !session ||
      session.status !== SessionStatus.OPEN ||
      new Date(session.expiresAt).getTime() > now
    ) {
      return state;
    }
    const expired = {
      ...state,
      activeSession: null,
      pendingExpirations: {
        ...state.pendingExpirations,
        [session.id]: session,
      },
    };
    await this.save(expired);
    this.ctx.waitUntil(this.flushExpirationProjection(session));
    return expired;
  }

  private async flushExpirationProjections(): Promise<void> {
    const state = await this.load();
    for (const session of Object.values(state.pendingExpirations)) {
      await this.flushExpirationProjection(session);
    }
  }

  private async flushExpirationProjection(session: LiveSession): Promise<void> {
    try {
      if (session.messageTs) {
        const expired = liveSessionToView(session);
        expired.session.status = "EXPIRED";
        await this.slack.updateMessage(
          { channelId: session.channelId, timestamp: session.messageTs },
          renderSession(expired),
        );
      }
      const latest = await this.load();
      if (latest.pendingExpirations[session.id]) {
        const pendingExpirations = { ...latest.pendingExpirations };
        delete pendingExpirations[session.id];
        await this.save({ ...latest, pendingExpirations });
      }
    } catch (error) {
      console.error("Failed to publish expired Ċomba lobby", {
        error: errorDetails(error),
        sessionId: session.id,
        workspaceId: session.workspaceId,
      });
      await this.ctx.storage.setAlarm(Date.now() + RETRY_DELAY_MS);
    }
  }

  private async flushArchive(gameId: string): Promise<void> {
    const state = await this.load();
    const game = state.pendingArchives[gameId];
    if (!game) return;
    try {
      await this.history.archive(game);
      try {
        await this.leaderboardLists.sync(game.workspaceId, game.channelId);
      } catch (error) {
        console.error("Failed to synchronize Ċomba leaderboard after archive", {
          error: errorDetails(error),
          gameId,
        });
      }
      const latest = await this.load();
      if (latest.pendingArchives[gameId]?.updatedAt === game.updatedAt) {
        const pendingArchives = { ...latest.pendingArchives };
        delete pendingArchives[gameId];
        await this.save({ ...latest, pendingArchives });
      }
    } catch (error) {
      console.error("Failed to archive completed Ċomba game", {
        error: errorDetails(error),
        gameId,
      });
      await this.ctx.storage.setAlarm(Date.now() + RETRY_DELAY_MS);
    }
  }

  private match(
    state: SessionRoomState,
    sessionId: string,
  ): SessionRoomResult<LiveSession> {
    return state.activeSession?.id === sessionId
      ? success(state.activeSession)
      : failure("SESSION_NOT_FOUND", "This Ċomba lobby is no longer active.");
  }

  private async load(): Promise<SessionRoomState> {
    const stored =
      await this.ctx.storage.get<Partial<SessionRoomState>>(STATE_KEY);
    return {
      activeSession: stored?.activeSession ?? null,
      pendingArchives: stored?.pendingArchives ?? {},
      pendingExpirations: stored?.pendingExpirations ?? {},
    };
  }

  private save(state: SessionRoomState): Promise<void> {
    return this.ctx.storage.put(STATE_KEY, state);
  }

  private async scheduleArchiveRetryIfNeeded(
    state: SessionRoomState,
  ): Promise<void> {
    if (Object.keys(state.pendingArchives).length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + RETRY_DELAY_MS);
    }
  }
}
