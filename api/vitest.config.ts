import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve @fh/shared to its TypeScript source, so tests don't need a build first.
  // Setting conditions replaces Vite's defaults, so they're listed again after "source".
  ssr: { resolve: { conditions: ["source", "module", "node", "development|production"] } },
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // Every file shares the test database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
