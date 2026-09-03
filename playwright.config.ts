import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: process.platform === "darwin" ? { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" } : undefined
  },
  webServer: { command: "pnpm dev", url: "http://127.0.0.1:8787/healthz", reuseExistingServer: !process.env.CI, timeout: 120_000 }
});
