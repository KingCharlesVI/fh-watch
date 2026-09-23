import { defineConfig } from "vitest/config";

// Tests cover src/core, which is plain TypeScript; the React Native screens aren't run here.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
