import { describe, expect, it } from "vitest";

import type { SessionWithParticipants } from "@comba/application/models/session-view";
import { renderResultModal } from "@comba/presentation/slack/views/result-modal";

describe("renderResultModal", () => {
  it("clearly asks for games won and identifies both teams", () => {
    const state = completedState();
    state.participants = [
      participant("U-A1", "A", 1),
      participant("U-A2", "A", 2),
      participant("U-B1", "B", 1),
      participant("U-B2", "B", 2),
    ];
    const view = renderResultModal(state);

    expect(view.title.text).toBe("Record games won");
    expect(view.blocks[0]).toMatchObject({
      text: {
        text: expect.stringContaining(
          "*How many games did each team win?*",
        ),
      },
      type: "section",
    });
    expect(view.blocks[0]).toMatchObject({
      text: { text: expect.stringContaining("⚪ *Team A* · <@U-A1> + <@U-A2>") },
    });
    expect(view.blocks[0]).toMatchObject({
      text: { text: expect.stringContaining("🔴 *Team B* · <@U-B1> + <@U-B2>") },
    });
    expect(view.blocks.slice(1)).toMatchObject([
      { label: { text: "Team A — games won" } },
      { label: { text: "Team B — games won" } },
    ]);
  });

  it("prefills scores when correcting an existing result", () => {
    const view = renderResultModal(completedState());

    expect(view.submit.text).toBe("Edit result");
    expect(view.blocks.slice(1)).toMatchObject([
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

function participant(
  userId: string,
  team: "A" | "B",
  position: 1 | 2,
) {
  return {
    joinedAt: "2026-08-29T18:00:00.000Z",
    position,
    sessionId: "session-1",
    team,
    userId,
    workspaceId: "T-PERSONAL",
  };
}
