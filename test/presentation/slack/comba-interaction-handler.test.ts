import { afterEach, describe, expect, it, vi } from "vitest";

import { ResultPermissionError } from "@comba/domain/result/errors";
import type { SessionResult } from "@comba/domain/result/model";
import { TeamFullError } from "@comba/application/session-errors";
import type {
  SessionStatus,
  SessionWithParticipants,
} from "@comba/application/models/session-view";
import type { SlackClient } from "@comba/presentation/slack/slack-client";
import { CombaInteractionHandler } from "@comba/presentation/slack/interaction-handler";
import type { CombaInteraction } from "@comba/presentation/slack/schemas/interaction";
import {
  COMBA_INTERACTION_IDS,
  joinTargetForAction,
} from "@comba/presentation/slack/views/lobby";

afterEach(() => vi.restoreAllMocks());

describe("CombaInteractionHandler", () => {
  it("joins the selected team and updates the original message", async () => {
    const { dependencies, sessionService, slackClient } = setup();

    const response = await handleCombaInteraction(
      interaction(COMBA_INTERACTION_IDS.joinA2),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(sessionService.join).toHaveBeenCalledWith({
      channelId: "C-COMBA",
      sessionId: "session-1",
      position: 2,
      team: "A",
      userId: "U-ALICE",
      workspaceId: "T-PERSONAL",
    });
    expect(slackClient.updateMessage).toHaveBeenCalledWith(
      { channelId: "C-COMBA", timestamp: "123.456" },
      expect.objectContaining({ text: "⚽ Ċomba? 2 spots remaining." }),
    );
  });

  it("dispatches benching to the session service", async () => {
    const { dependencies, sessionService } = setup();

    await handleCombaInteraction(
      interaction(COMBA_INTERACTION_IDS.bench),
      dependencies,
    );

    expect(sessionService.bench).toHaveBeenCalledWith({
      channelId: "C-COMBA",
      sessionId: "session-1",
      userId: "U-ALICE",
      workspaceId: "T-PERSONAL",
    });
  });

  it("sends domain rejections only to the acting user", async () => {
    const { dependencies, sessionService, slackClient } = setup();
    sessionService.join.mockRejectedValueOnce(new TeamFullError());

    const response = await handleCombaInteraction(
      interaction(COMBA_INTERACTION_IDS.joinB1),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(slackClient.sendEphemeralResponse).toHaveBeenCalledWith(
      "https://hooks.slack.test/actions/123",
      "That team is already full.",
    );
    expect(slackClient.updateMessage).not.toHaveBeenCalled();
  });

  it("opens a result modal for a participating player", async () => {
    const { dependencies, resultService, slackClient } = setup();

    const response = await handleCombaInteraction(
      interaction(COMBA_INTERACTION_IDS.recordResult),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(resultService.prepare).toHaveBeenCalledWith({
      channelId: "C-COMBA",
      sessionId: "session-1",
      userId: "U-ALICE",
      workspaceId: "T-PERSONAL",
    });
    expect(slackClient.openView).toHaveBeenCalledWith(
      "987.654",
      expect.objectContaining({
        callback_id: "comba.result",
        private_metadata: JSON.stringify({
          channelId: "C-COMBA",
          sessionId: "session-1",
        }),
      }),
    );
  });

  it("does not open the result modal for a non-participant", async () => {
    const { dependencies, resultService, slackClient } = setup();
    resultService.prepare.mockRejectedValueOnce(new ResultPermissionError());

    const response = await handleCombaInteraction(
      interaction(COMBA_INTERACTION_IDS.recordResult),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(slackClient.openView).not.toHaveBeenCalled();
    expect(slackClient.sendEphemeralResponse).toHaveBeenCalledWith(
      "https://hooks.slack.test/actions/123",
      "Only players from this Ċomba session can record its result.",
    );
  });

  it("records a valid modal submission and renders the final result", async () => {
    const { dependencies, resultService, slackClient } = setup();

    const response = await handleCombaInteraction(
      resultSubmission("5", "2"),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(resultService.record).toHaveBeenCalledWith({
      channelId: "C-COMBA",
      sessionId: "session-1",
      teamAWins: 5,
      teamBWins: 2,
      userId: "U-ALICE",
      workspaceId: "T-PERSONAL",
    });
    expect(slackClient.updateMessage).toHaveBeenCalledWith(
      { channelId: "C-COMBA", timestamp: "123.456" },
      expect.objectContaining({ text: expect.stringContaining("5–2") }),
    );
    expect(slackClient.postMessage).not.toHaveBeenCalled();
  });

  it("publishes an audit notice when a result is amended", async () => {
    const { dependencies, resultService, slackClient } = setup();
    const amended = state("COMPLETED", 3);
    if (!amended.result) throw new Error("Expected completed result");
    amended.result.teamAWins = 4;
    amended.result.teamBWins = 3;
    resultService.record.mockResolvedValueOnce({
      previousResult: {
        ...amended.result,
        teamAWins: 5,
        teamBWins: 2,
      },
      state: amended,
    });

    await handleCombaInteraction(resultSubmission("4", "3"), dependencies);

    expect(slackClient.postMessage).toHaveBeenCalledWith(
      "C-COMBA",
      expect.objectContaining({
        text: expect.stringMatching(/<@U-ALICE>.*5–2 → 4–3/),
      }),
      { threadTimestamp: "123.456" },
    );
  });

  it("acknowledges a saved amendment if its audit notice fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { dependencies, resultService, slackClient } = setup();
    const amended = state("COMPLETED", 3);
    if (!amended.result) throw new Error("Expected completed result");
    amended.result.teamAWins = 4;
    amended.result.teamBWins = 3;
    resultService.record.mockResolvedValueOnce({
      previousResult: {
        ...amended.result,
        teamAWins: 5,
        teamBWins: 2,
      },
      state: amended,
    });
    vi.mocked(slackClient.postMessage).mockRejectedValueOnce(
      new Error("Slack unavailable"),
    );

    const response = await handleCombaInteraction(
      resultSubmission("4", "3"),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(slackClient.updateMessage).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "Failed to publish Ċomba result amendment",
      expect.objectContaining({ sessionId: "session-1" }),
    );
  });

  it("keeps the result modal open with inline validation errors", async () => {
    const { dependencies, resultService } = setup();

    const response = await handleCombaInteraction(
      resultSubmission("0", "0"),
      dependencies,
    );

    await expect(response.json()).resolves.toMatchObject({
      errors: { team_a_wins: expect.stringContaining("0–0") },
      response_action: "errors",
    });
    expect(resultService.record).not.toHaveBeenCalled();
  });

  it("rejects a result containing more than ten games", async () => {
    const { dependencies, resultService } = setup();

    const response = await handleCombaInteraction(
      resultSubmission("6", "5"),
      dependencies,
    );

    await expect(response.json()).resolves.toMatchObject({
      errors: { team_a_wins: expect.stringContaining("at most 10 games") },
      response_action: "errors",
    });
    expect(resultService.record).not.toHaveBeenCalled();
  });

  it("leaves a failed Slack projection dirty for reconciliation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { dependencies, sessionService, slackClient } = setup();
    vi.mocked(slackClient.updateMessage).mockRejectedValueOnce(
      new Error("Slack unavailable"),
    );

    await handleCombaInteraction(
      interaction(COMBA_INTERACTION_IDS.joinA2),
      dependencies,
    );
  });

  it("acknowledges unknown interaction IDs without mutating state", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { dependencies, sessionService, slackClient } = setup();

    const response = await handleCombaInteraction(
      interaction("comba.unknown"),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(sessionService.join).not.toHaveBeenCalled();
    expect(sessionService.bench).not.toHaveBeenCalled();
    expect(slackClient.updateMessage).not.toHaveBeenCalled();
  });
});

function setup() {
  const openState = state("OPEN", 1);
  const sessionService = {
    join: vi.fn(async () => ({ becameReady: false, state: openState })),
    bench: vi.fn(async () => openState),
  };
  const resultService = {
    prepare: vi.fn(async () => openState),
    record: vi.fn(async () => ({
      previousResult: null as SessionResult | null,
      state: state("COMPLETED", 2),
    })),
  };
  const slackClient: SlackClient = {
    deleteMessage: vi.fn(async () => undefined),
    openView: vi.fn(async () => undefined),
    postMessage: vi.fn(async () => ({
      channelId: "C-COMBA",
      timestamp: "123.456",
    })),
    sendEphemeralResponse: vi.fn(async () => undefined),
    updateMessage: vi.fn(async () => undefined),
  };

  return {
    dependencies: { resultService, sessionService, slackClient },
    resultService,
    sessionService,
    slackClient,
  };
}

function interaction(actionId: string): CombaInteraction {
  const target = joinTargetForAction(actionId);
  return {
    actions: [
      {
        action_id: actionId,
        action_ts: "123.456",
        block_id: "comba.lobby.join",
        value: target
          ? `session-1|${target.team}|${target.position}`
          : "session-1",
      },
    ],
    channel: { id: "C-COMBA" },
    message: { ts: "123.456" },
    response_url: "https://hooks.slack.test/actions/123",
    team: { id: "T-PERSONAL" },
    trigger_id: "987.654",
    type: "block_actions",
    user: { id: "U-ALICE" },
  };
}

function resultSubmission(
  teamAWins: string,
  teamBWins: string,
): CombaInteraction {
  return {
    team: { id: "T-PERSONAL" },
    trigger_id: "987.654",
    type: "view_submission",
    user: { id: "U-ALICE" },
    view: {
      callback_id: "comba.result",
      id: "V123",
      private_metadata: JSON.stringify({
        channelId: "C-COMBA",
        sessionId: "session-1",
      }),
      state: {
        values: {
          team_a_wins: { score: { value: teamAWins } },
          team_b_wins: { score: { value: teamBWins } },
        },
      },
    },
  };
}

function handleCombaInteraction(
  interaction: CombaInteraction,
  dependencies: ReturnType<typeof setup>["dependencies"],
): Promise<Response> {
  return new CombaInteractionHandler(
    dependencies.resultService as never,
    dependencies.sessionService as never,
    dependencies.slackClient,
  ).handle(interaction);
}

function state(
  status: SessionStatus,
  revision: number,
): SessionWithParticipants {
  return {
    participants: [
      participant("U-MARIO", "A", 1),
      participant("U-ALICE", "A", 2),
    ],
    result:
      status === "COMPLETED"
        ? {
            createdAt: "2026-08-29T19:00:00.000Z",
            sessionId: "session-1",
            submittedBy: "U-MARIO",
            teamAWins: 5,
            teamBWins: 2,
            updatedAt: "2026-08-29T19:00:00.000Z",
            updatedBy: "U-ALICE",
          }
        : null,
    session: {
      channelId: "C-COMBA",
      completedAt: null,
      createdAt: "2026-08-29T18:00:00.000Z",
      creatorUserId: "U-MARIO",
      expiresAt: "2026-08-29T18:05:00.000Z",
      id: "session-1",
      messageTs: "123.456",
      readyAt: null,
      revision,
      status,
      workspaceId: "T-PERSONAL",
    },
  };
}

function participant(userId: string, team: "A" | "B", position: 1 | 2) {
  return {
    joinedAt: "2026-08-29T18:00:00.000Z",
    position,
    sessionId: "session-1",
    team,
    userId,
    workspaceId: "T-PERSONAL",
  };
}
