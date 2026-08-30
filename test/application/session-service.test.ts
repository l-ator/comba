import { describe, expect, it, vi } from "vitest";

import { SessionChannelNotAllowedError } from "@comba/application/session-errors";
import { SessionService } from "@comba/application/session-service";
import type { SessionRoomPort } from "@comba/application/ports/session-room";
import { SessionStatus, type LiveSession } from "@comba/domain/session/model";

const now = new Date("2026-08-29T18:00:00.000Z");

describe("SessionService", () => {
  it("creates a lobby through its request-scoped room gateway", async () => {
    const rooms = fakeRooms();
    const service = createService(rooms);

    const created = await service.start({
      channelId: "C-COMBA",
      creatorUserId: "U-MARIO",
      workspaceId: "T-PERSONAL",
    });

    expect(rooms.start).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "C-COMBA",
        id: "session-1",
        now: now.toISOString(),
      }),
    );
    expect(created.participants[0]).toMatchObject({
      team: "A",
      userId: "U-MARIO",
    });
  });

  it("rejects commands outside the configured channel without calling a room", async () => {
    const rooms = fakeRooms();
    const service = createService(rooms);

    await expect(
      service.start({
        channelId: "C-GENERAL",
        creatorUserId: "U-MARIO",
        workspaceId: "T-PERSONAL",
      }),
    ).rejects.toBeInstanceOf(SessionChannelNotAllowedError);
    expect(rooms.start).not.toHaveBeenCalled();
  });

  it("attaches the Slack timestamp using the workspace/channel room key", async () => {
    const rooms = fakeRooms();
    const service = createService(rooms);
    await service.attachMessage(
      "session-1",
      "1234.5678",
      "T-PERSONAL",
      "C-COMBA",
    );
    expect(rooms.attachMessage).toHaveBeenCalledWith(
      "T-PERSONAL",
      "C-COMBA",
      "session-1",
      "1234.5678",
    );
  });

  it("abandons only the matching unpublished lobby", async () => {
    const rooms = fakeRooms();
    const service = createService(rooms);
    await service.abandonUnpublished("session-1", "T-PERSONAL", "C-COMBA");
    expect(rooms.abandon).toHaveBeenCalledWith(
      "T-PERSONAL",
      "C-COMBA",
      "session-1",
    );
  });
});

function createService(rooms: ReturnType<typeof fakeRooms>): SessionService {
  return new SessionService(rooms as unknown as SessionRoomPort, {
    allowedChannelId: "C-COMBA",
    createId: () => "session-1",
    now: () => now,
  });
}

function fakeRooms() {
  return {
    abandon: vi.fn(async () => undefined),
    attachMessage: vi.fn(async () => ({
      ok: true as const,
      value: liveSession(),
    })),
    start: vi.fn(async () => ({ ok: true as const, value: liveSession() })),
  };
}

function liveSession(): LiveSession {
  return {
    channelId: "C-COMBA",
    createdAt: now.toISOString(),
    creatorUserId: "U-MARIO",
    expiresAt: "2026-08-29T18:05:00.000Z",
    format: {
      id: "table-football-2v2",
      teams: [
        { capacity: 2, id: "A" },
        { capacity: 2, id: "B" },
      ],
    },
    id: "session-1",
    revision: 0,
    status: SessionStatus.OPEN,
    teams: [
      {
        id: "A",
        players: [
          { joinedAt: now.toISOString(), position: 1, userId: "U-MARIO" },
        ],
      },
      { id: "B", players: [] },
    ],
    workspaceId: "T-PERSONAL",
  };
}
