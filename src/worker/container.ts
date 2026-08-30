import { container, type DependencyContainer } from "tsyringe";

import type { StatisticsRepository } from "@comba/application/ports/statistics-repository";
import type { GameHistoryPort } from "@comba/application/ports/game-history";
import type { SessionRoomPort } from "@comba/application/ports/session-room";
import { TOKENS } from "@shared/di/tokens";
import { D1StatisticsRepository } from "@comba/infrastructure/cloudflare/d1/statistics-repository";
import { D1GameHistoryRepository } from "@comba/infrastructure/cloudflare/d1/game-history-repository";
import { DoSessionRoomClient } from "@comba/infrastructure/cloudflare/do/do-session-room-client";
import { HttpSlackClient } from "@comba/infrastructure/slack/http-slack-client";
import type { SlackClient } from "@comba/presentation/slack/slack-client";
import type { Env } from "./env";

export function createInvocationContainer(env: Env): DependencyContainer {
  const scope = container.createChildContainer();

  scope.register(TOKENS.env, { useValue: env });
  scope.register(TOKENS.database, { useValue: env.DB });
  scope.register(TOKENS.allowedChannelId, {
    useValue: env.COMBA_CHANNEL_ID,
  });
  scope.register(TOKENS.slackBotToken, { useValue: env.SLACK_BOT_TOKEN });
  scope.register(TOKENS.fetch, {
    useValue: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init),
  });
  scope.register(TOKENS.now, { useValue: () => new Date() });
  scope.register(TOKENS.createId, { useValue: () => crypto.randomUUID() });
  scope.register<StatisticsRepository>(TOKENS.statisticsRepository, {
    useClass: D1StatisticsRepository,
  });
  scope.register<GameHistoryPort>(TOKENS.gameHistory, {
    useClass: D1GameHistoryRepository,
  });
  scope.register<SessionRoomPort>(TOKENS.sessionRoom, {
    useClass: DoSessionRoomClient,
  });
  scope.register<SlackClient>(TOKENS.slackClient, {
    useClass: HttpSlackClient,
  });

  return scope;
}
