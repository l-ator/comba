import "reflect-metadata";

import { app } from "./app";
import type { Env } from "./env";

// Keep the deployed Durable Object binding name stable while naming the
// implementation explicitly inside the application.
export { DoSessionRoom as SessionRoom } from "@comba/infrastructure/cloudflare/do/do-session-room";

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
