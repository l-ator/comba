import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenSessionExistsError } from "@comba/application/session-errors";
import type { SessionWithParticipants } from "@comba/application/models/session-view";
import type { SlackClient } from "@comba/presentation/slack/slack-client";
import { CombaCommandHandler } from "@comba/presentation/slack/command-handler";
import type { CombaCommand } from "@comba/presentation/slack/schemas/command";

afterEach(() => vi.restoreAllMocks());

describe("CombaCommandHandler", () => {
  it("runs the hidden leaderboard List sync for an administrator", async () => {
    const { dependencies } = setup();
    const leaderboardLists = {
      sync: vi.fn(async () => ({
        created: true,
        listId: "F1",
        rows: 4,
        syncedAt: "2026-08-30T12:00:00Z",
      })),
    };
    const handler = new CombaCommandHandler(
      dependencies.sessionService as never,
      dependencies.statisticsService as never,
      dependencies.slackClient,
      leaderboardLists as never,
      new Set(["U-MARIO"]),
    );
    const response = await handler.handle(command({ text: "admin list sync" }));
    expect(leaderboardLists.sync).toHaveBeenCalledWith(
      "T-PERSONAL",
      "C-COMBA",
      "comba-testing",
    );
    await expect(response.json()).resolves.toMatchObject({
      text: expect.stringContaining("wrote 4 rows"),
    });
  });

  it("rejects hidden leaderboard List sync for other users", async () => {
    const { dependencies } = setup();
    const leaderboardLists = { sync: vi.fn() };
    const handler = new CombaCommandHandler(
      dependencies.sessionService as never,
      dependencies.statisticsService as never,
      dependencies.slackClient,
      leaderboardLists as never,
      new Set(),
    );
    const response = await handler.handle(command({ text: "admin list sync" }));
    expect(leaderboardLists.sync).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      text: expect.stringContaining("administrator"),
    });
  });

  it("aborts the running session in this channel for an administrator", async () => {
    const { dependencies } = setup();
    const response = await handleCombaCommand(
      command({ text: "admin cancel" }),
      dependencies,
      new Set(["U-MARIO"]),
    );
    expect(dependencies.sessionService.abortActive).toHaveBeenCalledWith(
      "T-PERSONAL",
      "C-COMBA",
    );
    await expect(response.json()).resolves.toMatchObject({
      text: expect.stringContaining("Cancelled the running Ċomba"),
    });
  });

  it("accepts 'admin abort' as an alias for cancel", async () => {
    const { dependencies } = setup();
    await handleCombaCommand(
      command({ text: "admin abort" }),
      dependencies,
      new Set(["U-MARIO"]),
    );
    expect(dependencies.sessionService.abortActive).toHaveBeenCalledWith(
      "T-PERSONAL",
      "C-COMBA",
    );
  });

  it("rejects aborting a session for other users", async () => {
    const { dependencies } = setup();
    const response = await handleCombaCommand(
      command({ text: "admin cancel" }),
      dependencies,
      new Set(),
    );
    expect(dependencies.sessionService.abortActive).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      text: expect.stringContaining("administrator"),
    });
  });

  it("reports when no session is running in the channel", async () => {
    const { dependencies } = setup();
    const { SessionNotFoundError } = await import(
      "@comba/application/session-errors"
    );
    dependencies.sessionService.abortActive.mockRejectedValueOnce(
      new SessionNotFoundError(),
    );
    const response = await handleCombaCommand(
      command({ text: "admin cancel" }),
      dependencies,
      new Set(["U-MARIO"]),
    );
    await expect(response.json()).resolves.toMatchObject({
      text: expect.stringContaining("no longer exists"),
    });
  });

  it("renders every player in the global leaderboard", async () => {
    const { dependencies, statisticsService } = setup();
    const response = await handleCombaCommand(
      command({ text: "leaderboard" }),
      dependencies,
    );
    const body = (await response.json()) as { text: string };
    expect(body.text).toContain("🥇 <@U-MARIO>");
    expect(body.text).toContain("Best win ratio");
    expect(statisticsService.getLeaderboard).toHaveBeenCalledWith("T-PERSONAL");
  });

  it("renders the caller's player statistics", async () => {
    const { dependencies, statisticsService } = setup();

    const response = await handleCombaCommand(
      command({ text: "stats" }),
      dependencies,
    );

    const body = (await response.json()) as { text: string };
    expect(body.text).toContain("<@U-MARIO>");
    expect(body.text).toContain("57.1%");
    expect(body.text).toContain("Best teammate: <@U-ALICE> (4 games together)");
    expect(body.text).toContain("Nemesis: <@U-BOB> (lost 2×)");
    expect(body.text).toContain("Victim: <@U-CHARLIE> (beaten 3×)");
    expect(statisticsService.getPlayerStats).toHaveBeenCalledWith(
      "T-PERSONAL",
      "U-MARIO",
    );
  });

  it("compares the caller against and alongside a mentioned player", async () => {
    const { dependencies, statisticsService } = setup();

    const response = await handleCombaCommand(
      command({ text: "h2h <@UBOB|bob>" }),
      dependencies,
    );

    const body = (await response.json()) as { text: string };
    expect(body.text).toContain("<@U-MARIO> vs <@UBOB>");
    expect(body.text).toContain("As teammates");
    expect(statisticsService.getHeadToHead).toHaveBeenCalledWith(
      "T-PERSONAL",
      "U-MARIO",
      "UBOB",
    );
  });

  it("compares two explicitly mentioned players", async () => {
    const { dependencies, statisticsService } = setup();

    const response = await handleCombaCommand(
      command({ text: "h2h <@UALICE|alice> <@UBOB|bob>" }),
      dependencies,
    );

    const body = (await response.json()) as { text: string };
    expect(body.text).toContain("<@UALICE> vs <@UBOB>");
    expect(statisticsService.getHeadToHead).toHaveBeenCalledWith(
      "T-PERSONAL",
      "UALICE",
      "UBOB",
    );
    expect(statisticsService.getTeammateStats).toHaveBeenCalledWith(
      "T-PERSONAL",
      "UALICE",
      "UBOB",
    );
  });

  it.each([
    { text: "h2h <@UMARIO>", user_id: "UMARIO" },
    { text: "h2h <@UBOB> <@UBOB>" },
  ])("rejects a comparison of the same player: $text", async (overrides) => {
    const { dependencies, statisticsService } = setup();

    const response = await handleCombaCommand(command(overrides), dependencies);

    await expect(response.json()).resolves.toMatchObject({
      text: expect.stringContaining("two different players"),
    });
    expect(statisticsService.getHeadToHead).not.toHaveBeenCalled();
  });

  it("returns help for unsupported command syntax", async () => {
    const { dependencies, repository } = setup();

    const response = await handleCombaCommand(
      command({ text: "wat" }),
      dependencies,
    );

    const body = (await response.json()) as { text: string };
    expect(body.text).toContain("Ċomba commands");
    expect(body.text).not.toContain("admin list sync");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("creates, posts, and attaches a lobby", async () => {
    const { dependencies, repository, slackClient } = setup();

    const response = await handleCombaCommand(command(), dependencies);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(repository.create).toHaveBeenCalledOnce();
    expect(slackClient.postMessage).toHaveBeenCalledWith(
      "C-COMBA",
      expect.objectContaining({ text: "⚽ Ċomba? 3 spots remaining." }),
    );
    expect(repository.setMessageTimestamp).toHaveBeenCalledWith(
      "session-1",
      "123.456",
      "T-PERSONAL",
      "C-COMBA",
    );
  });

  it("returns a channel-specific ephemeral response outside #comba", async () => {
    const { dependencies, repository, slackClient } = setup();

    const response = await handleCombaCommand(
      command({ channel_id: "C-GENERAL" }),
      dependencies,
    );

    await expect(response.json()).resolves.toEqual({
      response_type: "ephemeral",
      text: "Ċomba games live in <#C-COMBA>. Start one there.",
    });
    expect(repository.create).not.toHaveBeenCalled();
    expect(slackClient.postMessage).not.toHaveBeenCalled();
  });

  it("returns an ephemeral response when a lobby is already open", async () => {
    const { dependencies, repository } = setup();
    vi.mocked(repository.create).mockRejectedValueOnce(
      new OpenSessionExistsError(),
    );

    const response = await handleCombaCommand(command(), dependencies);

    await expect(response.json()).resolves.toMatchObject({
      response_type: "ephemeral",
      text: "There is already an open Ċomba lobby in this channel.",
    });
  });

  it("cancels the invisible session if posting fails", async () => {
    const logError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { dependencies, repository, slackClient } = setup();
    vi.mocked(slackClient.postMessage).mockRejectedValueOnce(
      new Error("Slack unavailable"),
    );

    const response = await handleCombaCommand(command(), dependencies);

    await expect(response.json()).resolves.toMatchObject({
      response_type: "ephemeral",
    });
    expect(repository.cancelUnpublished).toHaveBeenCalledWith(
      "session-1",
      "T-PERSONAL",
      "C-COMBA",
    );
    expect(slackClient.deleteMessage).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      "Failed to publish Ċomba lobby",
      expect.objectContaining({
        error: expect.objectContaining({
          message: "Slack unavailable",
          name: "Error",
        }),
      }),
    );
  });

  it("deletes the orphan message and cancels if timestamp attachment fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { dependencies, repository, slackClient } = setup();
    vi.mocked(repository.setMessageTimestamp).mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );

    const response = await handleCombaCommand(command(), dependencies);

    expect(response.status).toBe(200);
    expect(slackClient.deleteMessage).toHaveBeenCalledWith({
      channelId: "C-COMBA",
      timestamp: "123.456",
    });
    expect(repository.cancelUnpublished).toHaveBeenCalledWith(
      "session-1",
      "T-PERSONAL",
      "C-COMBA",
    );
  });
});

function setup() {
  const repository = {
    cancelUnpublished: vi.fn(async () => undefined),
    create: vi.fn(async (record: CreateSessionRecord) => state(record)),
    expireDue: vi.fn(async () => 0),
    findDirty: vi.fn(async () => []),
    get: vi.fn(async () => stateFromId("session-1")),
    join: vi.fn(async () => ({
      becameReady: false,
      state: stateFromId("session-1"),
    })),
    bench: vi.fn(async () => stateFromId("session-1")),
    markMessageSynced: vi.fn(async () => undefined),
    setMessageTimestamp: vi.fn(async () => undefined),
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
  const sessionService = {
    allowedChannelId: "C-COMBA",
    abandonUnpublished: repository.cancelUnpublished,
    abortActive: vi.fn(async () => undefined),
    attachMessage: repository.setMessageTimestamp,
    start: vi.fn(
      async (input: {
        channelId: string;
        creatorUserId: string;
        workspaceId: string;
      }) => {
        if (input.channelId !== "C-COMBA") {
          const { SessionChannelNotAllowedError } =
            await import("@comba/application/session-errors");
          throw new SessionChannelNotAllowedError();
        }
        return repository.create({
          ...input,
          createdAt: "2026-08-29T18:00:00.000Z",
          expiresAt: "2026-08-29T18:05:00.000Z",
          id: "session-1",
        });
      },
    ),
  };
  const statisticsService = {
    getLeaderboard: vi.fn(async () => {
      const player = {
        gameWinRate: 70,
        gamesLost: 3,
        gamesPlayed: 10,
        gamesWon: 7,
        playerId: "U-MARIO",
      };
      return {
        biggestLossRatio: player,
        biggestWinRatio: player,
        mostGames: player,
        players: [player],
      };
    }),
    getHeadToHead: vi.fn(async () => ({
      gamesAgainst: 7,
      playerAWins: 4,
      playerAWinRate: 400 / 7,
      playerBWins: 3,
    })),
    getPlayerStats: vi.fn(async () => ({
      gamesLost: 3,
      gamesPlayed: 7,
      gamesWon: 4,
      gameWinRate: 400 / 7,
      relational: {
        bestTeammate: "U-ALICE",
        gamesPlayedTogether: 4,
        nemesis: "U-BOB",
        nemesisCount: 2,
        victim: "U-CHARLIE",
        victimCount: 3,
      },
    })),
    getTeammateStats: vi.fn(async () => ({
      gamesLostTogether: 3,
      gamesPlayedTogether: 7,
      gamesWonTogether: 4,
      winRateTogether: 400 / 7,
    })),
  };

  return {
    dependencies: { sessionService, slackClient, statisticsService },
    repository,
    slackClient,
    statisticsService,
  };
}

interface CreateSessionRecord {
  channelId: string;
  createdAt: string;
  creatorUserId: string;
  expiresAt: string;
  id: string;
  workspaceId: string;
}

function command(overrides: Partial<CombaCommand> = {}): CombaCommand {
  return {
    api_app_id: "A123",
    channel_id: "C-COMBA",
    channel_name: "comba-testing",
    command: "/comba",
    response_url: "https://hooks.slack.test/commands/123",
    team_domain: "personal-workspace",
    team_id: "T-PERSONAL",
    text: "",
    trigger_id: "123.456",
    user_id: "U-MARIO",
    user_name: "mario",
    ...overrides,
  };
}

function handleCombaCommand(
  command: CombaCommand,
  dependencies: ReturnType<typeof setup>["dependencies"],
  adminUserIds: Set<string> = new Set(),
): Promise<Response> {
  return new CombaCommandHandler(
    dependencies.sessionService as never,
    dependencies.statisticsService as never,
    dependencies.slackClient,
    { sync: vi.fn() } as never,
    adminUserIds,
  ).handle(command);
}

function state(record: CreateSessionRecord): SessionWithParticipants {
  return {
    participants: [
      {
        joinedAt: record.createdAt,
        position: 1,
        sessionId: record.id,
        team: "A",
        userId: record.creatorUserId,
        workspaceId: record.workspaceId,
      },
    ],
    result: null,
    session: {
      channelId: record.channelId,
      completedAt: null,
      createdAt: record.createdAt,
      creatorUserId: record.creatorUserId,
      expiresAt: record.expiresAt,
      id: record.id,
      messageTs: null,
      readyAt: null,
      revision: 0,
      status: "OPEN",
      workspaceId: record.workspaceId,
    },
  };
}

function stateFromId(id: string): SessionWithParticipants {
  return state({
    channelId: "C-COMBA",
    createdAt: "2026-08-29T18:00:00.000Z",
    creatorUserId: "U-MARIO",
    expiresAt: "2026-08-29T18:05:00.000Z",
    id,
    workspaceId: "T-PERSONAL",
  });
}
