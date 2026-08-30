import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("DoSessionRoom", () => {
  it("releases a channel when an overdue lobby is observed", async () => {
    const room = uniqueRoom();
    await room.start({
      ...startCommand("expired-session"),
      now: "2020-01-01T00:00:00.000Z",
    });

    await expect(
      room.start(startCommand("replacement-session")),
    ).resolves.toMatchObject({
      ok: true,
      value: { id: "replacement-session", status: "OPEN" },
    });
  });

  it("owns one live session and rejects stale interactions", async () => {
    const room = uniqueRoom();
    const started = await room.start(startCommand("session-1"));

    expect(started).toMatchObject({
      ok: true,
      value: { id: "session-1", status: "OPEN" },
    });
    await expect(room.start(startCommand("session-2"))).resolves.toMatchObject({
      error: { code: "ACTIVE_SESSION_EXISTS" },
      ok: false,
    });
    await expect(
      room.joinOrSwitch({
        now: "2026-08-29T18:01:00.000Z",
        position: 2,
        sessionId: "stale-session",
        teamId: "A",
        userId: "U-ALICE",
      }),
    ).resolves.toMatchObject({
      error: { code: "SESSION_NOT_FOUND" },
      ok: false,
    });
  });

  it("fills configured capacities and archives a completed game", async () => {
    const room = uniqueRoom();
    await room.start(startCommand("session-archive"));
    await room.attachMessage("session-archive", "123.456");
    await room.joinOrSwitch(joinCommand("U-ALICE", "A", 2));
    await room.joinOrSwitch(joinCommand("U-BOB", "B", 1));
    const ready = await room.joinOrSwitch(joinCommand("U-CHARLIE", "B", 2));
    expect(ready).toMatchObject({ ok: true, value: { status: "READY" } });

    const completed = await room.complete({
      now: "2099-08-29T18:10:00.000Z",
      gameScores: ["A", "A", "A", "A", "A", "A", "B", "B", "B", "B"],
      sessionId: "session-archive",
      userId: "U-MARIO",
    });

    expect(completed).toMatchObject({
      ok: true,
      value: {
        gameScores: ["A", "A", "A", "A", "A", "A", "B", "B", "B", "B"],
        id: "session-archive",
      },
    });
    await expect(room.inspect()).resolves.toMatchObject({
      activeSession: null,
    });

    await expect(
      env.DB!.prepare("SELECT game_scores FROM sessions WHERE id = ?")
        .bind("session-archive")
        .first("game_scores"),
    ).resolves.toBe('["A","A","A","A","A","A","B","B","B","B"]');
  });
});

function uniqueRoom() {
  return env.SESSION_ROOMS.getByName(`test-${crypto.randomUUID()}`);
}

function startCommand(id: string) {
  return {
    channelId: "C-COMBA",
    creatorUserId: "U-MARIO",
    id,
    now: "2099-08-29T18:00:00.000Z",
    workspaceId: "T-PERSONAL",
  };
}

function joinCommand(userId: string, teamId: string, position: number) {
  return {
    now: "2099-08-29T18:01:00.000Z",
    position,
    sessionId: "session-archive",
    teamId,
    userId,
  };
}
