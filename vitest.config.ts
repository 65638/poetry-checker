import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["development"] },
  test: { include: ["packages/**/tests/**/*.test.ts", "apps/**/tests/**/*.test.ts", "apps/**/tests/**/*.test.tsx"], maxWorkers: 2 },
});
