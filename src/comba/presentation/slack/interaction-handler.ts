import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import { SessionError } from "@comba/application/session-errors";
import { ResultError } from "@comba/domain/result/errors";
import type { ResultMutation } from "@comba/application/models/result-mutation";
import {
  MAX_GAMES_PER_SESSION,
  ResultService,
} from "@comba/application/result-service";
import { SessionService } from "@comba/application/session-service";
import type { SessionWithParticipants } from "@comba/application/models/session-view";
import { errorDetails } from "@shared/observability/error-details";
import type { SlackClient } from "./slack-client";
import type { CombaInteraction } from "./schemas/interaction";
import {
  COMBA_INTERACTION_IDS,
  joinTargetForAction,
  renderSession,
  sessionIdFromJoinValue,
} from "./views/lobby";
import { renderResultAmendment } from "./views/result-amendment";
import { renderResultModal, RESULT_MODAL } from "./views/result-modal";

@scoped(Lifecycle.ContainerScoped)
export class CombaInteractionHandler {
  constructor(
    @inject(ResultService) private readonly resultService: ResultService,
    @inject(SessionService) private readonly sessionService: SessionService,
    @inject(TOKENS.slackClient) private readonly slackClient: SlackClient,
  ) {}

  async handle(interaction: CombaInteraction): Promise<Response> {
    if (interaction.type !== "block_actions") {
      return this.handleViewSubmission(interaction);
    }

    const action = interaction.actions[0];
    if (!action?.value) {
      await this.sendEphemeral(
        interaction.response_url,
        "That Ċomba action is invalid. Please refresh Slack and try again.",
      );
      return acknowledgement();
    }

    const joinTarget = joinTargetForAction(action.action_id);
    const sessionId = joinTarget
      ? sessionIdFromJoinValue(action.value, joinTarget)
      : action.value;
    if (!sessionId) {
      await this.sendEphemeral(
        interaction.response_url,
        "That Ċomba position is invalid. Please use the latest lobby message.",
      );
      return acknowledgement();
    }

    const actor = {
      channelId: interaction.channel.id,
      sessionId,
      userId: interaction.user.id,
      workspaceId: interaction.team.id,
    };

    if (action.action_id === COMBA_INTERACTION_IDS.recordResult) {
      try {
        const state = await this.resultService.prepare(actor);
        await this.slackClient.openView(
          interaction.trigger_id,
          renderResultModal(state),
        );
      } catch (error) {
        if (error instanceof ResultError) {
          await this.sendEphemeral(interaction.response_url, error.message);
          return acknowledgement();
        }
        throw error;
      }

      return acknowledgement();
    }

    let state: SessionWithParticipants | undefined;
    try {
      if (joinTarget) {
        state = (
          await this.sessionService.join({
            ...actor,
            ...joinTarget,
          })
        ).state;
      } else if (action.action_id === COMBA_INTERACTION_IDS.bench) {
        state = await this.sessionService.bench(actor);
      } else {
        console.warn("Ignored unknown Ċomba interaction", {
          actionId: action.action_id,
        });
        return acknowledgement();
      }
    } catch (error) {
      if (error instanceof SessionError) {
        await this.sendEphemeral(interaction.response_url, error.message);
        return acknowledgement();
      }
      throw error;
    }

    await this.updateProjection(state, interaction.message.ts);

    return acknowledgement();
  }

  private async handleViewSubmission(
    interaction: Extract<CombaInteraction, { type: "view_submission" }>,
  ): Promise<Response> {
    if (interaction.view.callback_id !== RESULT_MODAL.callbackId) {
      return acknowledgement();
    }

    const parsed = parseSubmittedScores(interaction.view.state.values);
    if (!parsed.success) {
      return modalErrors(parsed.errors);
    }

    const metadata = parseResultMetadata(interaction.view.private_metadata);
    if (!metadata) {
      return modalErrors({
        [RESULT_MODAL.teamABlockId]:
          "This result form is invalid. Reopen it from the lobby.",
      });
    }

    let mutation: ResultMutation;
    try {
      mutation = await this.resultService.record({
        channelId: metadata.channelId,
        gameScores: parsed.gameScores,
        sessionId: metadata.sessionId,
        userId: interaction.user.id,
        workspaceId: interaction.team.id,
      });
    } catch (error) {
      if (error instanceof ResultError) {
        return modalErrors({ [RESULT_MODAL.teamABlockId]: error.message });
      }
      throw error;
    }

    await this.updateProjection(mutation.state);
    if (isAmendment(mutation)) {
      const threadTimestamp = mutation.state.session.messageTs;
      if (!threadTimestamp) {
        console.error(
          "Cannot publish Ċomba result amendment without a thread",
          {
            sessionId: mutation.state.session.id,
            workspaceId: mutation.state.session.workspaceId,
          },
        );
        return acknowledgement();
      }
      try {
        await this.slackClient.postMessage(
          mutation.state.session.channelId,
          renderResultAmendment(
            mutation.state,
            mutation.previousResult,
            interaction.user.id,
          ),
          { threadTimestamp },
        );
      } catch (error) {
        console.error("Failed to publish Ċomba result amendment", {
          error: errorDetails(error),
          sessionId: mutation.state.session.id,
          workspaceId: mutation.state.session.workspaceId,
        });
      }
    }
    return acknowledgement();
  }

  private async updateProjection(
    state: SessionWithParticipants,
    fallbackTimestamp?: string,
  ): Promise<void> {
    const timestamp = state.session.messageTs ?? fallbackTimestamp;
    if (!timestamp) {
      console.error(
        "Cannot update Ċomba projection without a message timestamp",
        {
          sessionId: state.session.id,
          workspaceId: state.session.workspaceId,
        },
      );
      return;
    }

    try {
      await this.slackClient.updateMessage(
        { channelId: state.session.channelId, timestamp },
        renderSession(state),
      );
    } catch (error) {
      console.error("Failed to update Ċomba lobby projection", {
        error: errorDetails(error),
        revision: state.session.revision,
        sessionId: state.session.id,
        workspaceId: state.session.workspaceId,
      });
    }
  }

  private async sendEphemeral(
    responseUrl: string,
    text: string,
  ): Promise<void> {
    try {
      await this.slackClient.sendEphemeralResponse(responseUrl, text);
    } catch (error) {
      console.error("Failed to send ephemeral Ċomba response", {
        error: errorDetails(error),
      });
    }
  }
}

function parseResultMetadata(
  value: string,
): { channelId: string; sessionId: string } | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "channelId" in parsed &&
      "sessionId" in parsed &&
      typeof parsed.channelId === "string" &&
      typeof parsed.sessionId === "string"
    ) {
      return { channelId: parsed.channelId, sessionId: parsed.sessionId };
    }
  } catch {
    // Old or malformed modal metadata cannot identify its Durable Object room.
  }
  return null;
}

function isAmendment(mutation: ResultMutation): mutation is ResultMutation & {
  previousResult: NonNullable<ResultMutation["previousResult"]>;
} {
  const current = mutation.state.result;
  return Boolean(
    mutation.previousResult &&
      current &&
      (mutation.previousResult.teamAWins !== current.teamAWins ||
        mutation.previousResult.teamBWins !== current.teamBWins),
  );
}

function parseSubmittedScores(
  values: Record<string, Record<string, unknown>>,
):
  | { errors: Record<string, string>; success: false }
  | { gameScores: Array<"A" | "B">; success: true } {
  const errors: Record<string, string> = {};
  const teamA = scoreFrom(values, RESULT_MODAL.teamABlockId);
  const teamB = scoreFrom(values, RESULT_MODAL.teamBBlockId);

  if (teamA === null) {
    errors[RESULT_MODAL.teamABlockId] =
      "Enter a whole number of wins (0 or more).";
  }
  if (teamB === null) {
    errors[RESULT_MODAL.teamBBlockId] =
      "Enter a whole number of wins (0 or more).";
  }
  if (teamA === 0 && teamB === 0) {
    errors[RESULT_MODAL.teamABlockId] =
      "A 0–0 result does not count as played.";
  }
  if (
    teamA !== null &&
    teamB !== null &&
    teamA + teamB > MAX_GAMES_PER_SESSION
  ) {
    errors[RESULT_MODAL.teamABlockId] =
      `A session can contain at most ${MAX_GAMES_PER_SESSION} games in total.`;
  }

  return Object.keys(errors).length > 0 || teamA === null || teamB === null
    ? { errors, success: false }
    : {
        gameScores: [
          ...Array<"A">(teamA).fill("A"),
          ...Array<"B">(teamB).fill("B"),
        ],
        success: true,
      };
}

function scoreFrom(
  values: Record<string, Record<string, unknown>>,
  blockId: string,
): number | null {
  const input = values[blockId]?.[RESULT_MODAL.scoreActionId];
  if (!input || typeof input !== "object" || !("value" in input)) {
    return null;
  }
  const value = input.value;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const score = Number(value);
  return Number.isSafeInteger(score) ? score : null;
}

function modalErrors(errors: Record<string, string>): Response {
  return Response.json({ errors, response_action: "errors" });
}

function acknowledgement(): Response {
  return new Response(null, { status: 200 });
}
