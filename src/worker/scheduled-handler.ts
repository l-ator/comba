import type { DependencyContainer } from "tsyringe";

import { LeaderboardListService } from "@comba/application/leaderboard-list-service";
import { errorDetails } from "@shared/observability/error-details";
import { createInvocationContainer } from "./container";
import type { Env } from "./env";

export function runLeaderboardListSchedule(
  env: Env,
  ctx: ExecutionContext,
  createScope: (env: Env) => DependencyContainer = createInvocationContainer,
): void {
  const scope = createScope(env);
  const service = scope.resolve(LeaderboardListService);
  ctx.waitUntil(
    service.syncAll().then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected")
          console.error("Failed to synchronize Ċomba leaderboard List", {
            error: errorDetails(result.reason),
            index,
          });
      });
    }),
  );
}
