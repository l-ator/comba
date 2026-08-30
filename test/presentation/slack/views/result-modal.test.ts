import { describe, expect, it } from "vitest";

import type { SessionWithParticipants } from "@comba/application/models/session-view";
import { renderResultModal } from "@comba/presentation/slack/views/result-modal";

describe("renderResultModal", () => {
  it("prefills scores when correcting an existing result", () => {
    const view = renderResultModal(completedState());

    expect(view.submit.text).toBe("Edit result");
    expect(view.blocks).toMatchObject([
      { element: { initial_value: "5" } },
      { element: { initial_value: "2" } },
    ]);
    expect(JSON.parse(view.private_metadata)).toEqual({
      channelId: "C-COMBA",
      sessionId: "session-1",
    });
  });
});

function completedState(): SessionWithParticipants {
  return {
    participants: [],
    result: {
      createdAt: "2026-08-29T19:00:00.000Z",
      sessionId: "session-1",
      submittedBy: "U-MARIO",
      teamAWins: 5,
      teamBWins: 2,
      updatedAt: "2026-08-29T19:00:00.000Z",
      updatedBy: "U-MARIO",
    },
    session: {
      channelId: "C-COMBA",
      completedAt: "2026-08-29T19:00:00.000Z",
      createdAt: "2026-08-29T18:00:00.000Z",
      creatorUserId: "U-MARIO",
      expiresAt: "2026-08-29T18:05:00.000Z",
      id: "session-1",
      messageTs: "123.456",
      readyAt: "2026-08-29T18:02:00.000Z",
      revision: 4,
      status: "COMPLETED",
      workspaceId: "T-PERSONAL",
    },
  };
}
