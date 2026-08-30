import { describe, expect, it } from "vitest";

import { createInvocationContainer } from "@worker/container";
import { TOKENS } from "@shared/di/tokens";
import type { Env } from "@worker/env";
import { SessionService } from "@comba/application/session-service";
import { StatisticsService } from "@comba/application/statistics-service";
import { CombaCommandHandler } from "@comba/presentation/slack/command-handler";
import { KVLeaderboardListRepository } from "@comba/infrastructure/cloudflare/kv/leaderboard-list-repository";
import type { LeaderboardListRepository } from "@comba/application/ports/leaderboard-list-repository";

describe("createInvocationContainer", () => {
  it("reuses container-scoped graphs within an invocation only", () => {
    const firstEnv = environment("development");
    const secondEnv = environment("test");
    const firstScope = createInvocationContainer(firstEnv);
    const secondScope = createInvocationContainer(secondEnv);

    expect(firstScope.resolve(CombaCommandHandler)).toBe(
      firstScope.resolve(CombaCommandHandler),
    );
    expect(secondScope.resolve(CombaCommandHandler)).not.toBe(
      firstScope.resolve(CombaCommandHandler),
    );
    expect(firstScope.resolve(TOKENS.env)).toBe(firstEnv);
    expect(secondScope.resolve(TOKENS.env)).toBe(secondEnv);
    expect(firstScope.resolve(TOKENS.slackClient)).toBe(
      firstScope.resolve(TOKENS.leaderboardList),
    );
    expect(firstScope.resolve<Set<string>>(TOKENS.adminUserIds)).toEqual(
      new Set(["U-ADMIN"]),
    );
    expect(
      firstScope.resolve<LeaderboardListRepository>(
        TOKENS.leaderboardListRepository,
      ),
    ).toBeInstanceOf(KVLeaderboardListRepository);

    const handler = firstScope.resolve(CombaCommandHandler) as unknown as {
      sessionService: SessionService;
      statisticsService: StatisticsService;
    };
    expect(handler.sessionService).toBeInstanceOf(SessionService);
    expect(handler.statisticsService).toBeInstanceOf(StatisticsService);
  });
});

function environment(appEnv: Env["APP_ENV"]): Env {
  return {
    APP_ENV: appEnv,
    COMBA_ADMIN_USER_IDS: "U-ADMIN",
    COMBA_CHANNEL_ID: "C-COMBA",
    DB: {} as D1Database,
    LEADERBOARD_LIST: {} as KVNamespace,
    SESSION_ROOMS: {} as unknown as Env["SESSION_ROOMS"],
    SLACK_BOT_TOKEN: "xoxb-test",
    SLACK_SIGNING_SECRET: "signing-secret",
  };
}
