import type { D1Migration } from "cloudflare:test";
import type { DoSessionRoom } from "@comba/infrastructure/cloudflare/do/do-session-room";

declare global {
  namespace Cloudflare {
    interface Env {
      SESSION_ROOMS: DurableObjectNamespace<DoSessionRoom>;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
