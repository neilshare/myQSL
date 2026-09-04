import { defineConfig, devices } from "@playwright/test";

import { existsSync } from "node:fs";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const hasChrome = process.platform === "darwin" && existsSync(chromePath);

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: hasChrome ? { executablePath: chromePath } : undefined
  },
  webServer: { command: "pnpm dev", url: "http://127.0.0.1:8787/healthz", reuseExistingServer: !process.env.CI, timeout: 120_000 }
});
