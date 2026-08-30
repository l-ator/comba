import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@comba": path.resolve(import.meta.dirname, "src/comba"),
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
      "@worker": path.resolve(import.meta.dirname, "src/worker"),
    },
  },
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(import.meta.dirname, "migrations"),
          ),
        },
      },
      wrangler: { configPath: "./wrangler.jsonc", environment: "dev" },
    })),
  ],
  test: {
    include: ["test/**/*.integration.ts"],
    setupFiles: [
      "./test/helpers/reflect-metadata.ts",
      "./test/helpers/apply-migrations.ts",
    ],
  },
});
