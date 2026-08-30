import { describe, expect, it, vi } from "vitest";

import { LeaderboardListService } from "@comba/application/leaderboard-list-service";
import { runLeaderboardListSchedule } from "@worker/scheduled-handler";

describe("runLeaderboardListSchedule", () => {
  it("creates an invocation scope and synchronizes without an HTTP request", async () => {
    const failure = new Error("Slack unavailable");
    const service = {
      syncAll: vi.fn(async () => [
        { status: "fulfilled", value: {} },
        { reason: failure, status: "rejected" },
      ]),
    };
    const scope = { resolve: vi.fn(() => service) };
    const createScope = vi.fn(() => scope);
    let completion: Promise<unknown> | undefined;
    const ctx = {
      waitUntil: vi.fn((promise: Promise<unknown>) => {
        completion = promise;
      }),
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = {} as never;

    runLeaderboardListSchedule(env, ctx as never, createScope as never);
    await completion;

    expect(createScope).toHaveBeenCalledWith(env);
    expect(scope.resolve).toHaveBeenCalledWith(LeaderboardListService);
    expect(service.syncAll).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      "Failed to synchronize Ċomba leaderboard List",
      expect.objectContaining({
        error: expect.objectContaining({ message: "Slack unavailable" }),
        index: 1,
      }),
    );
  });
});
