import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import { completedSessionToView, liveSessionToView } from "./models/session-view";
import type { SessionRoomPort } from "./ports/session-room";
import type { SessionRoomFailure } from "@comba/domain/session/room-result";
import type { CompletedSessionMutation } from "@comba/domain/session/model";
import type { TeamId } from "@comba/domain/session/model";
import type { GameHistoryPort } from "./ports/game-history";
import {
  InvalidResultError,
  ResultPermissionError,
  ResultSessionNotEligibleError,
} from "@comba/domain/result/errors";
import type { ResultMutation } from "./models/result-mutation";
import { LeaderboardListService } from "./leaderboard-list-service";
import { errorDetails } from "@shared/observability/error-details";

export interface ResultActorInput {
  channelId: string;
  sessionId: string;
  userId: string;
  workspaceId: string;
}

export interface RecordResultInput extends ResultActorInput {
  gameScores: TeamId[];
}

export const MAX_GAMES_PER_SESSION = 10;

@scoped(Lifecycle.ContainerScoped)
export class ResultService {
  constructor(
    @inject(TOKENS.sessionRoom)
    private readonly rooms: SessionRoomPort,
    @inject(TOKENS.gameHistory)
    private readonly history: GameHistoryPort,
    @inject(TOKENS.now) private readonly now: () => Date = () => new Date(),
    @inject(LeaderboardListService)
    private readonly leaderboardLists: LeaderboardListService,
  ) {}

  async prepare(input: ResultActorInput) {
    const live = await this.rooms.prepareResult(
      input.workspaceId,
      input.channelId,
      input.sessionId,
      input.userId,
    );
    if (live.ok) return liveSessionToView(live.value);
    if (live.error.code !== "SESSION_NOT_FOUND") throw mapFailure(live);
    return completedSessionToView(
      await this.history.getEditable(
        input.sessionId,
        input.workspaceId,
        input.userId,
      ),
    );
  }

  async record(input: RecordResultInput): Promise<ResultMutation> {
    validateGameScores(input.gameScores);
    const at = this.now().toISOString();

    const completed = await this.rooms.complete(
      input.workspaceId,
      input.channelId,
      {
        now: at,
        gameScores: input.gameScores,
        sessionId: input.sessionId,
        userId: input.userId,
      },
    );
    if (completed.ok) {
      return {
        previousResult: null,
        state: completedSessionToView(completed.value),
      };
    }
    if (completed.error.code !== "SESSION_NOT_FOUND")
      throw mapFailure(completed);

    const pending = await this.rooms.amendPending(
      input.workspaceId,
      input.channelId,
      input.sessionId,
      input.userId,
      input.gameScores,
      at,
    );
    if (pending.ok) return mutationToView(pending.value);
    if (pending.error.code !== "SESSION_NOT_FOUND") throw mapFailure(pending);

    const mutation = mutationToView(
      await this.history.amend(
        input.sessionId,
        input.workspaceId,
        input.userId,
        input.gameScores,
        at,
      ),
    );
    try {
      await this.leaderboardLists.sync(input.workspaceId, input.channelId);
    } catch (error) {
      console.error("Failed to synchronize Ċomba leaderboard after amendment", {
        error: errorDetails(error),
        sessionId: input.sessionId,
      });
    }
    return mutation;
  }
}

function mutationToView(mutation: CompletedSessionMutation): ResultMutation {
  const state = completedSessionToView(mutation.current);
  const previous = mutation.previous
    ? completedSessionToView(mutation.previous).result
    : null;
  return { previousResult: previous, state };
}

function mapFailure(failure: SessionRoomFailure): Error {
  if (failure.error.code === "NOT_PARTICIPATING")
    return new ResultPermissionError();
  return new ResultSessionNotEligibleError();
}

function validateGameScores(gameScores: TeamId[]): void {
  if (gameScores.length === 0) {
    throw new InvalidResultError(
      "A 0–0 result does not count as a played session.",
    );
  }
  if (gameScores.length > MAX_GAMES_PER_SESSION) {
    throw new InvalidResultError(
      `A session can contain at most ${MAX_GAMES_PER_SESSION} games.`,
    );
  }
  if (gameScores.some((winner) => winner !== "A" && winner !== "B")) {
    throw new InvalidResultError("Every game must be won by Team A or Team B.");
  }
}
