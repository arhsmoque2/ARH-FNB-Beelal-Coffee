import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["worker.js", "billing-ledger/src/index.js"],
      exclude: ["_qa/**", "node_modules/**", "**/*.config.*"],
      thresholds: {
        lines: 80,
        functions: 85,
        branches: 75,
        statements: 80
      }
    }
  }
});
