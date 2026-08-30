import { describe, expect, it } from "vitest";

import type { SessionWithParticipants } from "@comba/application/models/session-view";
import {
  COMBA_INTERACTION_IDS,
  renderOpenLobby,
  renderSession,
} from "@comba/presentation/slack/views/lobby";

describe("renderOpenLobby", () => {
  it("renders compact teams, one join action per available team, and the deadline", () => {
    const view = renderOpenLobby(openLobby());

    expect(view.text).toBe("⚽ Ċomba? 3 spots remaining.");
    expect(JSON.stringify(view.blocks)).toContain("<@U-MARIO>");
    expect(JSON.stringify(view.blocks)).not.toContain("Available");
    expect(JSON.stringify(view.blocks)).toContain("<!date^1788026700^{time}|later today>");

    const serialized = JSON.stringify(view.blocks);
    for (const actionId of [
      COMBA_INTERACTION_IDS.joinA2,
      COMBA_INTERACTION_IDS.joinB1,
      COMBA_INTERACTION_IDS.bench,
    ]) {
      expect(serialized).toContain(actionId);
    }
    expect(serialized).toContain("session-1");
    expect(serialized).toContain("⚪ TEAM A");
    expect(serialized).toContain("🔴 TEAM B");
    expect(serialized).not.toContain("🟩");
    expect(serialized).not.toContain(COMBA_INTERACTION_IDS.joinB2);
    expect(serialized).toContain('"style":"danger"');
    expect(serialized).toContain("Bench me");
  });
});

describe("renderSession", () => {
  it("renders finalized teams without lobby controls when READY", () => {
    const state = openLobby();
    state.session.status = "READY";
    state.participants.push(
      participant("U-BOB", "B", 1),
      participant("U-CHARLIE", "B", 2),
    );

    const view = renderSession(state);
    const serialized = JSON.stringify(view.blocks);

    expect(view.text).toContain("🔥 Ċomba is on");
    expect(serialized).toContain("<@U-BOB>");
    expect(serialized).not.toContain(COMBA_INTERACTION_IDS.joinA1);
    expect(serialized).toContain('"style":"primary"');
  });

  it.each([
    ["CANCELLED", "❌ Ċomba cancelled"],
    ["EXPIRED", "⌛ Ċomba expired"],
  ] as const)("renders the %s terminal state", (status, expected) => {
    const state = openLobby();
    state.session.status = status;

    expect(renderSession(state).text).toContain(expected);
  });
});

function openLobby(): SessionWithParticipants {
  return {
    participants: [
      {
        joinedAt: "2026-08-29T18:00:00.000Z",
        position: 1,
        sessionId: "session-1",
        team: "A",
        userId: "U-MARIO",
        workspaceId: "T-PERSONAL",
      },
    ],
    result: null,
    session: {
      channelId: "C-COMBA",
      completedAt: null,
      createdAt: "2026-08-29T18:00:00.000Z",
      creatorUserId: "U-MARIO",
      expiresAt: "2026-08-29T18:05:00.000Z",
      id: "session-1",
      messageTs: null,
      readyAt: null,
      revision: 0,
      status: "OPEN",
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
