import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@comba": path.resolve(import.meta.dirname, "src/comba"),
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
      "@worker": path.resolve(import.meta.dirname, "src/worker"),
    },
  },
  test: {
    coverage: {
      reporter: ["text", "html"],
    },
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/helpers/reflect-metadata.ts"],
  },
});
