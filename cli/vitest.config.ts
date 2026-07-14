import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      enabled: false,
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        // V8 reports slightly different block boundaries across Node releases.
        // These floors use the lower Linux/Node 20 baseline from CI; the local
        // Node 22 result remains higher and neither environment may regress.
        statements: 52.7,
        branches: 44.7,
        functions: 56.8,
        lines: 54.6,
      },
    },
  },
});
