import type { DoSessionRoom } from "./do/do-session-room";

export interface CombaBindings {
  APP_ENV: "development" | "prod" | "test";
  COMBA_CHANNEL_ID: string;
  DB: D1Database;
  SESSION_ROOMS: DurableObjectNamespace<DoSessionRoom>;
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
}
