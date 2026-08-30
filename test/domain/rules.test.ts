import { describe, expect, it } from "vitest";

import {
  DEFAULT_GAME_FORMAT,
  SessionStatus,
  type LiveSession,
} from "@comba/domain/session/model";
import { bench, joinOrSwitch } from "@comba/domain/session/rules";

describe("session rules", () => {
  it("switches teams atomically and preserves joinedAt", () => {
    const session = liveSession();
    const joined = joinOrSwitch(
      session,
      "U-ALICE",
      "A",
      2,
      "2026-08-29T18:01:00.000Z",
    );
    if (!joined.ok) throw new Error(joined.error.message);

    const switched = joinOrSwitch(
      joined.value,
      "U-ALICE",
      "B",
      1,
      "2026-08-29T18:02:00.000Z",
    );

    expect(switched).toMatchObject({
      ok: true,
      value: {
        teams: expect.arrayContaining([
          {
            id: "B",
            players: [
              {
                joinedAt: "2026-08-29T18:01:00.000Z",
                position: 1,
                userId: "U-ALICE",
              },
            ],
          },
        ]),
      },
    });
  });

  it("rejects stale slot actions", () => {
    expect(
      joinOrSwitch(
        liveSession(),
        "U-ALICE",
        "A",
        1,
        "2026-08-29T18:01:00.000Z",
      ),
    ).toMatchObject({ error: { code: "INVALID_POSITION" }, ok: false });
  });

  it("clears the session when its creator benches", () => {
    expect(bench(liveSession(), "U-MARIO")).toEqual({ ok: true, value: null });
  });

  it("keeps the other player's visual slot when a teammate benches", () => {
    const first = joinOrSwitch(
      liveSession(),
      "U-BOB",
      "B",
      1,
      "2026-08-29T18:01:00.000Z",
    );
    if (!first.ok) throw new Error(first.error.message);
    const second = joinOrSwitch(
      first.value,
      "U-CHARLIE",
      "B",
      2,
      "2026-08-29T18:02:00.000Z",
    );
    if (!second.ok) throw new Error(second.error.message);
    const result = bench(second.value, "U-BOB");
    if (!result.ok || !result.value)
      throw new Error("Expected an active lobby");
    expect(result.value.teams.find((team) => team.id === "B")?.players).toEqual(
      [expect.objectContaining({ position: 2, userId: "U-CHARLIE" })],
    );
  });
});

function liveSession(): LiveSession {
  return {
    channelId: "C-COMBA",
    createdAt: "2026-08-29T18:00:00.000Z",
    creatorUserId: "U-MARIO",
    expiresAt: "2026-08-29T18:05:00.000Z",
    format: structuredClone(DEFAULT_GAME_FORMAT),
    id: "session-1",
    revision: 0,
    status: SessionStatus.OPEN,
    teams: [
      {
        id: "A",
        players: [
          {
            joinedAt: "2026-08-29T18:00:00.000Z",
            position: 1,
            userId: "U-MARIO",
          },
        ],
      },
      { id: "B", players: [] },
    ],
    workspaceId: "T-PERSONAL",
  };
}
