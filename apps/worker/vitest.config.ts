import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

export default defineProject({
  root: path.join(import.meta.dirname, "../.."),
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: path.join(import.meta.dirname, "../../wrangler.test.jsonc") },
      miniflare: {
        compatibilityDate: "2026-09-03",
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "../../infra/migrations"))
        }
      }
    }))
  ],
  test: {
    name: "worker",
    include: ["apps/worker/test/**/*.test.ts"],
    setupFiles: ["./apps/worker/test/apply-migrations.ts"]
  }
});
