import { describe, expect, it } from "vitest";

import { createInvocationContainer } from "@worker/container";
import { TOKENS } from "@shared/di/tokens";
import type { Env } from "@worker/env";
import { SessionService } from "@comba/application/session-service";
import { StatisticsService } from "@comba/application/statistics-service";
import { CombaCommandHandler } from "@comba/presentation/slack/command-handler";

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
    COMBA_CHANNEL_ID: "C-COMBA",
    DB: {} as D1Database,
    SESSION_ROOMS: {} as unknown as Env["SESSION_ROOMS"],
    SLACK_BOT_TOKEN: "xoxb-test",
    SLACK_SIGNING_SECRET: "signing-secret",
  };
}
