import { describe, expect, it } from "vitest";

import type { SessionWithParticipants } from "@comba/application/models/session-view";
import { renderResultAmendment } from "@comba/presentation/slack/views/result-amendment";

describe("renderResultAmendment", () => {
  it("shows the editor, score change, and every participant", () => {
    const state = completedState();
    const message = renderResultAmendment(
      state,
      {
        ...state.result!,
        teamAWins: 5,
        teamBWins: 2,
      },
      "U-EDITOR",
    );

    expect(message.text).toContain("<@U-EDITOR>");
    expect(message.text).toContain("5–2 → 4–3");
    expect(message.text).toContain(
      "Participants: <@U-MARIO> <@U-ALICE> <@U-BOB> <@U-CHARLIE>",
    );
    expect(message.text).not.toContain("slack.com/archives");
  });
});

function completedState(): SessionWithParticipants {
  return {
    participants: [
      participant("U-MARIO", "A", 1),
      participant("U-ALICE", "A", 2),
      participant("U-BOB", "B", 1),
      participant("U-CHARLIE", "B", 2),
    ],
    result: {
      createdAt: "2026-08-29T19:00:00.000Z",
      sessionId: "session-1",
      submittedBy: "U-MARIO",
      teamAWins: 4,
      teamBWins: 3,
      updatedAt: "2026-08-29T19:05:00.000Z",
      updatedBy: "U-EDITOR",
    },
    session: {
      channelId: "C-COMBA",
      completedAt: "2026-08-29T19:00:00.000Z",
      createdAt: "2026-08-29T18:00:00.000Z",
      creatorUserId: "U-MARIO",
      expiresAt: "2026-08-29T18:05:00.000Z",
      id: "session-1",
      messageTs: "123.456",
      readyAt: "2026-08-29T18:01:00.000Z",
      revision: 5,
      status: "COMPLETED",
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
