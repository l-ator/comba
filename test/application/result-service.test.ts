import { describe, expect, it, vi } from "vitest";

import { InvalidResultError } from "@comba/domain/result/errors";
import { ResultService } from "@comba/application/result-service";
import type { SessionRoomPort } from "@comba/application/ports/session-room";
import type { GameHistoryPort } from "@comba/application/ports/game-history";

describe("ResultService", () => {
  it("submits an initial result through the session room", async () => {
    const rooms = {
      complete: vi.fn(async () => ({ ok: true as const, value: game() })),
    };
    const history = { amend: vi.fn() };
    const service = createService(rooms, history);

    await service.record(input(2, 2));

    expect(rooms.complete).toHaveBeenCalledWith(
      "T-PERSONAL",
      "C-COMBA",
      expect.objectContaining({ scores: { A: 2, B: 2 } }),
    );
    expect(history.amend).not.toHaveBeenCalled();
  });

  it("amends the DO outbox before falling back to archived D1 history", async () => {
    const previous = game();
    const current = {
      ...previous,
      scores: { A: 3, B: 1 },
      updatedAt: "2026-08-29T19:00:00.000Z",
    };
    const rooms = {
      amendPending: vi.fn(async () => ({
        ok: true as const,
        value: { current, previous },
      })),
      complete: vi.fn(async () => ({
        error: { code: "SESSION_NOT_FOUND" as const, message: "not active" },
        ok: false as const,
      })),
    };
    const history = { amend: vi.fn() };
    const service = createService(rooms, history);

    const mutation = await service.record(input(3, 1));

    expect(rooms.amendPending).toHaveBeenCalled();
    expect(history.amend).not.toHaveBeenCalled();
    expect(mutation.previousResult).toMatchObject({
      teamAWins: 2,
      teamBWins: 2,
    });
    expect(mutation.state.result).toMatchObject({ teamAWins: 3, teamBWins: 1 });
  });

  it("keeps a persisted historical amendment successful when List sync fails", async () => {
    const previous = game();
    const current = { ...previous, scores: { A: 3, B: 1 } };
    const missing = {
      error: { code: "SESSION_NOT_FOUND" as const, message: "not active" },
      ok: false as const,
    };
    const rooms = {
      amendPending: vi.fn(async () => missing),
      complete: vi.fn(async () => missing),
    };
    const history = {
      amend: vi.fn(async () => ({ current, previous })),
    };
    const leaderboardLists = {
      sync: vi.fn(async () => {
        throw new Error("lists_disabled_user_team");
      }),
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = new ResultService(
      rooms as unknown as SessionRoomPort,
      history as unknown as GameHistoryPort,
      () => new Date("2026-08-29T19:00:00.000Z"),
      leaderboardLists as never,
    );

    await expect(service.record(input(3, 1))).resolves.toMatchObject({
      state: { result: { teamAWins: 3, teamBWins: 1 } },
    });
    expect(leaderboardLists.sync).toHaveBeenCalledWith(
      "T-PERSONAL",
      "C-COMBA",
    );
    expect(error).toHaveBeenCalledWith(
      "Failed to synchronize Ċomba leaderboard after amendment",
      expect.objectContaining({
        error: expect.objectContaining({
          message: "lists_disabled_user_team",
        }),
      }),
    );
  });

  it.each([
    [-1, 2],
    [1.5, 2],
    [Number.NaN, 2],
    [0, 0],
    [6, 5],
  ])("rejects an invalid %s–%s score", async (teamAWins, teamBWins) => {
    const rooms = { complete: vi.fn() };
    const service = createService(rooms, { amend: vi.fn() });
    await expect(
      service.record(input(teamAWins, teamBWins)),
    ).rejects.toBeInstanceOf(InvalidResultError);
    expect(rooms.complete).not.toHaveBeenCalled();
  });
});

function createService(rooms: object, history: object): ResultService {
  return new ResultService(
    rooms as SessionRoomPort,
    history as GameHistoryPort,
    () => new Date("2026-08-29T19:00:00.000Z"),
    { sync: vi.fn(async () => undefined) } as never,
  );
}

function input(teamAWins: number, teamBWins: number) {
  return {
    channelId: "C-COMBA",
    sessionId: "session-1",
    teamAWins,
    teamBWins,
    userId: "U-MARIO",
    workspaceId: "T-PERSONAL",
  };
}

function game() {
  return {
    channelId: "C-COMBA",
    completedAt: "2026-08-29T19:00:00.000Z",
    createdAt: "2026-08-29T18:00:00.000Z",
    format: {
      id: "table-football-2v2",
      teams: [
        { capacity: 2, id: "A" },
        { capacity: 2, id: "B" },
      ],
    },
    id: "session-1",
    scores: { A: 2, B: 2 },
    submittedBy: "U-MARIO",
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
    updatedAt: "2026-08-29T19:00:00.000Z",
    updatedBy: "U-MARIO",
    workspaceId: "T-PERSONAL",
  };
}
