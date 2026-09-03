import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import type { Env as WorkerEnv } from "../src/env";

declare module "cloudflare:workers" {
  interface ProvidedEnv extends WorkerEnv {
    TEST_MIGRATIONS: D1Migration[];
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS ?? []);
