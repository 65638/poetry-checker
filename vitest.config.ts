import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["development"] },
  test: { include: ["packages/**/tests/**/*.test.ts"], maxWorkers: 2 },
});
