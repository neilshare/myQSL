import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "packages",
          environment: "node",
          include: ["packages/**/*.test.ts"]
        }
      },
      {
        test: {
          name: "scripts",
          environment: "node",
          include: ["scripts/**/*.test.ts"]
        }
      },
      "./apps/web/vitest.config.ts",
      "./apps/worker/vitest.config.ts"
    ]
  }
});
