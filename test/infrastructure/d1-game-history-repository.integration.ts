import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { D1GameHistoryRepository } from "@comba/infrastructure/cloudflare/d1/game-history-repository";
import { ResultPermissionError } from "@comba/domain/result/errors";
import type { CompletedSession } from "@comba/domain/session/model";

describe("D1GameHistoryRepository", () => {
  it("archives one session with embedded participants and atomic games", async () => {
    const repository = new D1GameHistoryRepository(env.DB!);
    const session = completedSession(`archive-${crypto.randomUUID()}`);

    await repository.archive(session);

    await expect(
      repository.getEditable(session.id, session.workspaceId, "U-A"),
    ).resolves.toEqual(session);
    await expect(
      repository.getEditable(session.id, session.workspaceId, "U-OUTSIDER"),
    ).rejects.toBeInstanceOf(ResultPermissionError);
  });

  it("returns the previous and current atomic game snapshots on amendment", async () => {
    const repository = new D1GameHistoryRepository(env.DB!);
    const session = completedSession(`amend-${crypto.randomUUID()}`);
    await repository.archive(session);

    const mutation = await repository.amend(
      session.id,
      session.workspaceId,
      "U-A",
      ["B", "B", "A"],
      "2026-08-30T13:00:00Z",
    );

    expect(mutation.previous?.gameScores).toEqual(["A", "A", "B"]);
    expect(mutation.current.gameScores).toEqual(["B", "B", "A"]);
    expect(mutation.current.updatedBy).toBe("U-A");
  });
});

function completedSession(id: string): CompletedSession {
  return {
    channelId: "C1",
    completedAt: "2026-08-30T12:00:00Z",
    createdAt: "2026-08-30T11:00:00Z",
    format: {
      id: "table-football-2v2",
      teams: [
        { capacity: 2, id: "A" },
        { capacity: 2, id: "B" },
      ],
    },
    gameScores: ["A", "A", "B"],
    id,
    messageTs: "123.456",
    readyAt: "2026-08-30T11:05:00Z",
    submittedBy: "U-A",
    teams: [
      {
        id: "A",
        players: [
          { joinedAt: "2026-08-30T11:00:00Z", position: 1, userId: "U-A" },
        ],
      },
      {
        id: "B",
        players: [
          { joinedAt: "2026-08-30T11:00:00Z", position: 1, userId: "U-B" },
        ],
      },
    ],
    updatedAt: "2026-08-30T12:00:00Z",
    updatedBy: "U-A",
    workspaceId: "T1",
  };
}
