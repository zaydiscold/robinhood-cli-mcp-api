import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      enabled: false,
      include: ["src/**/*.ts"],
      thresholds: {
        statements: 80,
        branches: 70,
      },
    },
  },
});
