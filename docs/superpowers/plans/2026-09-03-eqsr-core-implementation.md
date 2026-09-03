# eQSR Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the single-owner eQSR core loop: QSO management, loss-preserving ADIF import/export, browser-rendered QSL cards, public verification, recoverable backups, and GitHub-to-Cloudflare continuous delivery.

**Architecture:** A modular TypeScript monolith is deployed as one Cloudflare Worker with Static Assets. React runs in the browser; CPU-heavy ADIF parsing and card rendering run in browser workers/Canvas; Hono modules persist authoritative metadata in D1 and immutable objects in private R2. Cloudflare Access protects owner routes, while opaque card IDs and rate limiting protect public routes.

**Tech Stack:** Node.js 24 LTS, pnpm 10, TypeScript 5.9, React 19, Vite 7, Tailwind CSS 4, Hono 4, Zod 4, Drizzle ORM 0.44, Wrangler 4.128 baseline, D1, R2, Workflows, Cloudflare Access, Vitest 4.1, Cloudflare Vitest plugin 1.1, Testing Library, Playwright.

## Global Constraints

- v1 is single-owner: no registration, application password, multi-tenant RBAC, email, external logbook sync, offline write queue, award engine, CAT, or WSJT-X gateway.
- Production is one Worker plus Static Assets on a Cloudflare custom domain; do not create a separate Pages project.
- D1 is authoritative for structured business data; R2 contains only versioned images and recoverable backups.
- Store all QSO time in UTC. Implement ADIF 3.1.7 strict ADI import/export. Preserve compliant unknown fields in `adif_extra_json`; semantic round-trip loss is a release blocker, and non-ASCII ADI data must produce an actionable validation error rather than silent replacement.
- ADIF client upload chunks contain at most 40 records; QSO list/export pages contain at most 200 records.
- Internal IDs are D1 integers. Public card IDs are 22-character cryptographically secure nanoids.
- Owner routes validate the `Cf-Access-Jwt-Assertion` signature, issuer, audience, and expiry inside the Worker.
- Mutable APIs validate `Origin` and require `X-EQSR-Request: 1`; errors use RFC 9457 Problem Details.
- Card uploads are PNG, at most 8 MiB, with MIME, length, and magic-byte validation. Template backgrounds are PNG or JPEG.
- Exact versions are lockfile-pinned. The initial Wrangler baseline is 4.128.0 so Workflow schedules are recognized; future upgrades may advance it, but must never fall below the Rate Limiting API minimum of 4.36.
- Schema migrations are append-only and use expand-contract compatibility. Production deployment never performs a down migration.
- Run every command below from `/Users/zhangneil/WorkBuddy/HAM/eqsr` unless a step states another directory.

---

## Locked File Map

```text
package.json                         root scripts and pinned toolchain
pnpm-workspace.yaml                  workspace membership
tsconfig.base.json                   shared strict TypeScript options
eslint.config.mjs                    lint rules, including no raw SQL outside repositories
dependency-cruiser.cjs               module boundary enforcement
wrangler.jsonc                       Worker, assets, D1, R2, rate limit, Workflow config
apps/worker/src/index.ts             Hono/fetch/Workflow composition root
apps/worker/src/env.ts               binding types
apps/worker/src/platform/            access, db, errors, audit, logger, R2, rate limit
apps/worker/src/modules/*/            routes/service/repository/mapper per business capability
apps/web/src/app/                    React shell and routes
apps/web/src/features/*/             feature-owned UI/API/state
apps/web/src/workers/adif.worker.ts   off-main-thread ADIF operations
packages/domain/src/                 schemas, types, normalization, dedupe, cursors
packages/adif-codec/src/             parser, serializer, fixtures
packages/card-renderer/src/          template schema and Canvas renderer
infra/migrations/                    immutable D1 SQL migrations
infra/seeds/                         fake local/test data only
scripts/                             architecture, smoke, backup verification scripts
tests/e2e/                           cross-layer browser paths
docs/adr/                            architecture decisions
docs/runbooks/                       deploy, rollback, backup, restore procedures
.github/workflows/ci.yml             PR and main quality gate
```

Do not move responsibilities between these paths without adding an ADR first.

---

### Task 1: Bootstrap the Monorepo and One-Worker Shell

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `dependency-cruiser.cjs`
- Create: `vitest.config.ts`
- Create: `apps/worker/vitest.config.ts`
- Create: `wrangler.jsonc`
- Create: `infra/migrations/.gitkeep`
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/env.ts`
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/test/apply-migrations.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/App.tsx`
- Create: `apps/web/vite.config.ts`
- Create: `packages/domain/package.json`
- Create: `packages/adif-codec/package.json`
- Create: `packages/card-renderer/package.json`
- Test: `apps/worker/test/health.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `Env`, a Worker exporting `fetch`, `GET /healthz`, and a React SPA fallback through Static Assets.

- [ ] **Step 1: Create the root workspace manifests**

```json
{
  "name": "eqsr",
  "private": true,
  "packageManager": "pnpm@10.15.0",
  "engines": { "node": ">=24 <25" },
  "scripts": {
    "build": "pnpm --filter @eqsr/web build",
    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm build",
    "ci": "pnpm check",
    "lint": "eslint . && depcruise apps packages --config dependency-cruiser.cjs",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "dev": "pnpm build && wrangler dev",
    "db:migrate:local": "wrangler d1 migrations apply DB --local",
    "db:migrate:prod": "wrangler d1 migrations apply DB --remote",
    "deploy:prod": "wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/vitest-plugin": "1.1.3",
    "@cloudflare/workers-types": "5.20260903.1",
    "@eslint/js": "9.35.0",
    "@playwright/test": "1.55.0",
    "@types/node": "24.13.3",
    "dependency-cruiser": "17.1.0",
    "eslint": "9.35.0",
    "globals": "17.7.0",
    "tsx": "4.20.5",
    "typescript": "5.9.2",
    "typescript-eslint": "8.42.0",
    "vitest": "4.1.0",
    "wrangler": "4.128.0"
  }
}
```

```yaml
packages:
  - apps/*
  - packages/*
```

Create each workspace manifest with `private: true`, `type: "module"`, and `typecheck: "tsc --noEmit"`. Runtime dependencies are fixed as follows:

| Workspace | Runtime dependencies | Test/build dependencies |
|---|---|---|
| `@eqsr/worker` | `@eqsr/domain: workspace:*`, `hono: 4.9.6`, `drizzle-orm: 0.44.5`, `jose: 6.1.0`, `nanoid: 5.1.5`, `zod: 4.1.5` | inherits root tooling |
| `@eqsr/web` | `@eqsr/domain: workspace:*`, `@eqsr/adif-codec: workspace:*`, `@eqsr/card-renderer: workspace:*`, `react: 19.1.1`, `react-dom: 19.1.1`, `react-router: 7.8.2` | `@types/react: 19.1.17`, `@types/react-dom: 19.1.9`, `@vitejs/plugin-react: 5.0.2`, `vite: 7.1.4`, `tailwindcss: 4.1.12`, `@tailwindcss/vite: 4.1.12`, `@testing-library/react: 16.3.0`, `@testing-library/user-event: 14.6.1`, `jsdom: 26.1.0` |
| `@eqsr/domain` | `zod: 4.1.5` | inherits root tooling |
| `@eqsr/adif-codec` | none | inherits root tooling |
| `@eqsr/card-renderer` | `@eqsr/domain: workspace:*`, `qrcode: 1.5.4` | `@types/qrcode: 1.5.5` |

All internal packages export only `./src/index.ts`. Package-specific `tsconfig.json` files extend `../../tsconfig.base.json`; browser workspaces include DOM libraries, while the Worker workspace includes `@cloudflare/workers-types` and must not enable Node globals.

- [ ] **Step 2: Create `wrangler.jsonc` with local-safe symbolic resource names**

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "eqsr",
  "main": "./apps/worker/src/index.ts",
  "compatibility_date": "2026-09-03",
  "assets": {
    "directory": "./apps/web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/healthz", "/readyz"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "eqsr-prod", "database_id": "00000000-0000-0000-0000-000000000001", "migrations_dir": "./infra/migrations" }
  ],
  "r2_buckets": [
    { "binding": "MEDIA", "bucket_name": "eqsr-media" }
  ],
  "ratelimits": [
    {
      "name": "PUBLIC_RATE_LIMITER",
      "namespace_id": "1001",
      "simple": { "limit": 60, "period": 60 }
    }
  ],
  "vars": {
    "APP_ENV": "local",
    "PUBLIC_ORIGIN": "http://localhost:8787",
    "ACCESS_TEAM_DOMAIN": "https://eqsr.cloudflareaccess.com",
    "ACCESS_AUD": "local-development-audience"
  },
  "observability": { "enabled": true }
}
```

The sentinel UUID is used only for local Miniflare/D1 development and must never be deployed. Task 12 replaces it with the ID returned by `wrangler d1 create eqsr-prod --location=apac` before the first production deploy.

Create three isolated test projects: pure package tests in Node, React tests in jsdom, and Worker integration tests in workerd.

```ts
// vitest.config.ts
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
      "./apps/web/vitest.config.ts",
      "./apps/worker/vitest.config.ts"
    ]
  }
});
```

```ts
// apps/web/vitest.config.ts
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

export default defineProject({
  root: path.join(import.meta.dirname, "../.."),
  plugins: [react()],
  test: {
    name: "web",
    environment: "jsdom",
    include: ["apps/web/**/*.test.{ts,tsx}"]
  }
});
```

```ts
// apps/worker/vitest.config.ts
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

export default defineProject({
  root: path.join(import.meta.dirname, "../.."),
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: path.join(import.meta.dirname, "../../wrangler.jsonc") },
      miniflare: {
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
```

```ts
// apps/worker/test/apply-migrations.ts
import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import type { Env as WorkerEnv } from "../src/env";

declare module "cloudflare:workers" {
  interface ProvidedEnv extends WorkerEnv {
    TEST_MIGRATIONS: D1Migration[];
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

- [ ] **Step 3: Write the failing health test**

```ts
import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("GET /healthz", () => {
  it("returns a cache-disabled health response", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request("http://example.test/healthz"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 4: Install and prove the test fails**

Run: `corepack enable && pnpm install --frozen-lockfile=false && pnpm test -- apps/worker/test/health.test.ts`
Expected: FAIL because `apps/worker/src/index.ts` does not yet export the Worker.

- [ ] **Step 5: Implement the minimum Worker and SPA**

```ts
// apps/worker/src/env.ts
export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  PUBLIC_RATE_LIMITER: RateLimit;
  APP_ENV: "local" | "staging" | "production";
  PUBLIC_ORIGIN: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  D1_REST_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  D1_DATABASE_ID?: string;
}
```

```ts
// apps/worker/src/index.ts
import { Hono } from "hono";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();
app.get("/healthz", (c) => c.json({ status: "ok" }, 200, { "Cache-Control": "no-store" }));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
```

```tsx
// apps/web/src/app/App.tsx
export function App() {
  return <main><h1>eQSR</h1><p>Electronic QSO &amp; QSL Record</p></main>;
}
```

- [ ] **Step 6: Verify the shell**

Run: `pnpm test -- apps/worker/test/health.test.ts && pnpm build && pnpm typecheck`
Expected: all commands exit 0 and `apps/web/dist/index.html` exists.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs dependency-cruiser.cjs vitest.config.ts wrangler.jsonc infra/migrations/.gitkeep apps packages
git commit -m "chore: bootstrap eqsr worker monorepo"
```

---

### Task 2: Implement Shared Domain Rules

**Files:**
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/qso.ts`
- Create: `packages/domain/src/station.ts`
- Create: `packages/domain/src/card.ts`
- Create: `packages/domain/src/normalization.ts`
- Create: `packages/domain/src/dedupe.ts`
- Create: `packages/domain/src/cursor.ts`
- Test: `packages/domain/test/qso.test.ts`
- Test: `packages/domain/test/dedupe.test.ts`
- Test: `packages/domain/test/cursor.test.ts`

**Interfaces:**
- Consumes: Web Crypto `subtle.digest` only.
- Produces: `QsoInputSchema`, `StationInputSchema`, `CardTemplateSchema`, `normalizeQso`, `makeDedupeKey`, `encodeCursor`, `decodeCursor`.

- [ ] **Step 1: Write failing normalization and dedupe tests**

```ts
import { describe, expect, it } from "vitest";
import { makeDedupeKey, normalizeQso } from "../src";

describe("QSO normalization", () => {
  it("uppercases calls and expands four-digit time without changing unknown ADIF", async () => {
    const qso = normalizeQso({
      station_callsign: " ba4rc ", call: "bg4yyy/p", qso_date: "20260903",
      time_on: "1430", band: "40m", mode: "ssb", submode: null,
      freq_mhz: "7.0500", rst_sent: "59", rst_rcvd: "59",
      adif_extra: { IOTA: "AS-136" }
    });
    expect(qso.call).toBe("BG4YYY/P");
    expect(qso.time_on).toBe("143000");
    expect(qso.freq_hz).toBe(7_050_000);
    expect(qso.adif_extra).toEqual({ IOTA: "AS-136" });
    expect(await makeDedupeKey(qso)).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 2: Run the tests and confirm missing exports**

Run: `pnpm test -- packages/domain/test`
Expected: FAIL with missing `normalizeQso` and `makeDedupeKey` exports.

- [ ] **Step 3: Implement schemas and pure functions**

```ts
// packages/domain/src/qso.ts
import { z } from "zod";

const Call = z.string().trim().min(3).max(16).regex(/^[A-Z0-9]+(?:\/[A-Z0-9]+)*$/i);
export const QsoInputSchema = z.object({
  station_id: z.number().int().positive().optional(),
  station_callsign: Call,
  call: Call,
  qso_date: z.string().regex(/^\d{8}$/),
  time_on: z.string().regex(/^\d{4}(?:\d{2})?$/),
  band: z.string().trim().min(1).max(10),
  mode: z.string().trim().min(1).max(16),
  submode: z.string().trim().max(16).nullable().default(null),
  freq_mhz: z.string().regex(/^\d{1,5}(?:\.\d{1,6})?$/).nullable().default(null),
  rst_sent: z.string().trim().max(8).nullable().default(null),
  rst_rcvd: z.string().trim().max(8).nullable().default(null),
  gridsquare: z.string().trim().max(8).nullable().default(null),
  name: z.string().trim().max(80).nullable().default(null),
  qth: z.string().trim().max(160).nullable().default(null),
  comment: z.string().max(2000).nullable().default(null),
  adif_extra: z.record(z.string(), z.string()).default({})
});
export type QsoInput = z.input<typeof QsoInputSchema>;
export type NormalizedQso = z.output<typeof QsoInputSchema> & { time_on: string; freq_hz: number | null };
```

```ts
// packages/domain/src/dedupe.ts
import type { NormalizedQso } from "./qso";

export async function makeDedupeKey(qso: NormalizedQso): Promise<string> {
  const canonical = [qso.station_callsign, qso.call, qso.qso_date, qso.time_on,
    qso.band.toUpperCase(), qso.mode.toUpperCase(), qso.submode?.toUpperCase() ?? ""].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
```

Cursor payload is exactly `{ "qso_at": number, "id": number }`; decoding rejects malformed base64, extra keys, negative IDs, and non-integer timestamps.

`packages/domain/src/card.ts` owns the v1 `CardTemplateSchema`: normalized coordinates in `[0,1]`, integer base width/height, a maximum of 40 text/QR elements, a closed list of printable QSO fields, safe font identifiers, and strict six-digit hex colors. Neither the renderer nor Worker routes may redefine this schema.

- [ ] **Step 4: Verify domain behavior**

Run: `pnpm test -- packages/domain/test && pnpm --filter @eqsr/domain typecheck`
Expected: all domain tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat: define qso domain contracts"
```

---

### Task 3: Create the D1 Schema and Platform Adapters

**Files:**
- Create: `infra/migrations/0001_core.sql`
- Create: `apps/worker/src/platform/schema.ts`
- Create: `apps/worker/src/platform/db.ts`
- Create: `apps/worker/src/platform/clock.ts`
- Create: `apps/worker/src/platform/ids.ts`
- Create: `apps/worker/src/platform/r2.ts`
- Test: `apps/worker/test/migrations.test.ts`
- Test: `apps/worker/test/platform/r2.test.ts`

**Interfaces:**
- Consumes: `Env.DB`, `Env.MEDIA`.
- Produces: `createDb(env.DB)`, `Clock.now()`, `Ids.publicId()`, `MediaStore.putImmutable()`, Drizzle table exports.

- [ ] **Step 1: Write the failing migration invariants test**

```ts
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("0001_core migration", () => {
  it("creates every v1 table and enforces QSO dedupe", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();
    expect(tables.results.map((row) => row.name)).toEqual(expect.arrayContaining([
      "app_settings", "audit_events", "backup_runs", "card_templates", "import_chunks",
      "import_jobs", "qsl_cards", "qsos", "stations"
    ]));
  });
});
```

- [ ] **Step 2: Run before applying a migration**

Run: `pnpm test -- apps/worker/test/migrations.test.ts`
Expected: FAIL because the tables do not exist.

- [ ] **Step 3: Add the complete first migration**

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  callsign TEXT NOT NULL COLLATE NOCASE,
  station_callsign TEXT,
  operator_callsign TEXT,
  grid_square TEXT,
  qth TEXT,
  rig TEXT,
  antenna TEXT,
  power_w INTEGER,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX uq_stations_one_default ON stations(is_default) WHERE is_default = 1;

CREATE TABLE qsos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  station_callsign TEXT NOT NULL COLLATE NOCASE,
  call TEXT NOT NULL COLLATE NOCASE,
  qso_date TEXT NOT NULL CHECK (length(qso_date) = 8),
  time_on TEXT NOT NULL CHECK (length(time_on) = 6),
  qso_at INTEGER NOT NULL,
  band TEXT NOT NULL,
  freq_hz INTEGER,
  mode TEXT NOT NULL,
  submode TEXT,
  rst_sent TEXT,
  rst_rcvd TEXT,
  gridsquare TEXT,
  name TEXT,
  qth TEXT,
  comment TEXT,
  my_grid TEXT,
  my_rig TEXT,
  my_antenna TEXT,
  my_power_w INTEGER,
  adif_extra_json TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT NOT NULL,
  duplicate_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_ordinal >= 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','adif','api')),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(dedupe_key, duplicate_ordinal)
);
CREATE INDEX idx_qsos_time ON qsos(qso_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_qsos_call_date ON qsos(call, qso_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_qsos_station ON qsos(station_id, qso_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  total_records INTEGER NOT NULL,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('created','running','completed','failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE import_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(job_id, chunk_index)
);

CREATE TABLE card_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  base_width INTEGER NOT NULL,
  base_height INTEGER NOT NULL,
  layout_json TEXT NOT NULL,
  background_r2_key TEXT,
  background_sha256 TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE qsl_cards (
  id TEXT PRIMARY KEY,
  qso_id INTEGER NOT NULL REFERENCES qsos(id),
  template_id INTEGER NOT NULL REFERENCES card_templates(id),
  public_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft','ready','published','void')),
  qso_snapshot_json TEXT NOT NULL,
  template_snapshot_json TEXT NOT NULL,
  render_version TEXT NOT NULL,
  image_r2_key TEXT,
  content_sha256 TEXT,
  published_at INTEGER,
  voided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_cards_qso ON qsl_cards(qso_id, created_at DESC);

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  request_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_time ON audit_events(created_at DESC);

CREATE TABLE backup_runs (
  id TEXT PRIMARY KEY,
  workflow_instance_id TEXT NOT NULL UNIQUE,
  export_bookmark TEXT,
  object_key TEXT,
  r2_etag TEXT,
  content_sha256 TEXT,
  size_bytes INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  error_code TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  verified_at INTEGER
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- [ ] **Step 4: Apply locally and verify adapters**

Run: `pnpm db:migrate:local && pnpm test -- apps/worker/test/migrations.test.ts apps/worker/test/platform`
Expected: migration applies once, a second apply reports no pending migrations, and tests pass.

- [ ] **Step 5: Commit**

```bash
git add infra/migrations apps/worker/src/platform apps/worker/test
git commit -m "feat: add core d1 schema and adapters"
```

---

### Task 4: Add HTTP Errors, Access Verification, Origin Guard, Logging, and Rate Limiting

**Files:**
- Create: `apps/worker/src/platform/problem.ts`
- Create: `apps/worker/src/platform/request-context.ts`
- Create: `apps/worker/src/platform/access.ts`
- Create: `apps/worker/src/platform/origin.ts`
- Create: `apps/worker/src/platform/rate-limit.ts`
- Create: `apps/worker/src/platform/audit.ts`
- Create: `apps/worker/src/platform/logger.ts`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/test/platform/access.test.ts`
- Test: `apps/worker/test/platform/origin.test.ts`
- Test: `apps/worker/test/platform/problem.test.ts`

**Interfaces:**
- Consumes: `Env.ACCESS_TEAM_DOMAIN`, `Env.ACCESS_AUD`, `Env.PUBLIC_ORIGIN`, `Env.PUBLIC_RATE_LIMITER`.
- Produces: `requireOwner`, `requireSameOrigin`, `enforcePublicLimit`, `problem()`, `AuditWriter.append()`.

- [ ] **Step 1: Write failing security tests**

```ts
import { exports } from "cloudflare:workers";

it("rejects an owner request when Access assertion is missing", async () => {
  const response = await exports.default.fetch("https://example.test/api/v1/qsos");
  expect(response.status).toBe(401);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
});

it("rejects a mutable cross-origin request", async () => {
  const response = await exports.default.fetch("https://example.test/api/v1/qsos", {
    method: "POST",
    headers: { Origin: "https://evil.example", "X-EQSR-Request": "1" },
    body: "{}"
  });
  expect(response.status).toBe(403);
});
```

- [ ] **Step 2: Confirm they fail**

Run: `pnpm test -- apps/worker/test/platform`
Expected: FAIL because protected routing and Problem Details do not exist.

- [ ] **Step 3: Implement the middleware contracts**

```ts
// apps/worker/src/platform/problem.ts
export function problem(status: number, type: string, title: string, detail: string, instance: string, ext = {}) {
  return new Response(JSON.stringify({ type, title, status, detail, instance, ...ext }), {
    status,
    headers: { "Content-Type": "application/problem+json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
```

```ts
// apps/worker/src/platform/access.ts
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { problem } from "./problem";

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export const requireOwner: MiddlewareHandler<{ Bindings: Env; Variables: { actor: string } }> = async (c, next) => {
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return problem(401, "https://eqsr.app/problems/auth-required", "Authentication required", "Cloudflare Access assertion is missing", c.req.path);
  const issuer = c.env.ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
  const jwks = jwksByTeam.get(issuer) ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  jwksByTeam.set(issuer, jwks);
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: c.env.ACCESS_AUD, algorithms: ["RS256"] });
    c.set("actor", String(payload.email ?? payload.sub ?? "access-owner"));
    await next();
  } catch {
    return problem(401, "https://eqsr.app/problems/auth-invalid", "Invalid authentication", "Cloudflare Access assertion is invalid", c.req.path);
  }
};
```

`requireSameOrigin` applies only to POST/PUT/PATCH/DELETE and returns 403 unless both the exact Origin and `X-EQSR-Request: 1` match. `enforcePublicLimit` hashes the caller IP and normalized lookup call before passing a key to the Rate Limiting binding; raw values are never logged.

- [ ] **Step 4: Wire protected and public route groups**

Create `/api/v1` groups so owner middleware cannot accidentally apply to `/api/v1/public/*`, and public routes cannot be registered inside the owner group. Add a test that enumerates route paths and verifies the matrix.

- [ ] **Step 5: Verify security behavior**

Run: `pnpm test -- apps/worker/test/platform && pnpm lint`
Expected: all tests pass; lint shows no raw token logging and no boundary violations.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/platform apps/worker/src/index.ts apps/worker/test/platform
git commit -m "feat: enforce worker security boundaries"
```

---

### Task 5: Implement Stations and QSO CRUD

**Files:**
- Create: `apps/worker/src/modules/stations/repository.ts`
- Create: `apps/worker/src/modules/stations/service.ts`
- Create: `apps/worker/src/modules/stations/routes.ts`
- Create: `apps/worker/src/modules/qsos/repository.ts`
- Create: `apps/worker/src/modules/qsos/service.ts`
- Create: `apps/worker/src/modules/qsos/routes.ts`
- Create: `apps/worker/src/modules/qsos/mapper.ts`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/test/modules/stations.test.ts`
- Test: `apps/worker/test/modules/qsos.test.ts`

**Interfaces:**
- Consumes: domain schemas, `createDb`, `AuditWriter`, owner middleware.
- Produces:
  - `StationService.create(input): Promise<Station>`
  - `StationService.update(id, version, input): Promise<Station>`
  - `QsoService.create(input, options): Promise<QsoCreateResult>`
  - `QsoService.list(filter, cursor, limit): Promise<CursorPage<Qso>>`
  - `QsoService.update(id, version, patch): Promise<Qso>`
  - `QsoService.trash(id, version): Promise<void>`
  - `QsoService.restore(id, version): Promise<Qso>`

- [ ] **Step 1: Write failing API tests for the critical invariants**

```ts
it("returns the existing QSO on a hard duplicate without inserting", async () => {
  const first = await ownerJson("/api/v1/qsos", { method: "POST", body: validQso });
  const second = await ownerJson("/api/v1/qsos", { method: "POST", body: validQso });
  expect(first.status).toBe(201);
  expect(second.status).toBe(409);
  expect((await second.json()).duplicate_of).toBe((await first.clone().json()).data.id);
});

it("prevents lost updates with If-Match", async () => {
  const created = await createQso();
  const stale = `W/\"qso-${created.id}-${created.version - 1}\"`;
  const response = await ownerJson(`/api/v1/qsos/${created.id}`, {
    method: "PATCH", headers: { "If-Match": stale }, body: { comment: "late write" }
  });
  expect(response.status).toBe(412);
});
```

Also test: only one default station, cursor order is stable for equal timestamps, DELETE hides but does not remove, restore reappears, and `include_deleted=true` is owner-only.

- [ ] **Step 2: Verify the route tests fail**

Run: `pnpm test -- apps/worker/test/modules/stations.test.ts apps/worker/test/modules/qsos.test.ts`
Expected: FAIL with 404 routes.

- [ ] **Step 3: Implement repository methods with explicit transaction boundaries**

```ts
export interface QsoRepository {
  findDuplicate(dedupeKey: string): Promise<{ id: number; duplicate_ordinal: number } | null>;
  nextDuplicateOrdinal(dedupeKey: string): Promise<number>;
  insert(qso: QsoInsert): Promise<QsoRow>;
  findById(id: number, includeDeleted?: boolean): Promise<QsoRow | null>;
  list(query: QsoListQuery): Promise<QsoRow[]>;
  updateIfVersion(id: number, expectedVersion: number, patch: QsoUpdate): Promise<QsoRow | null>;
}
```

`create()` defaults to rejecting a duplicate. Only `{ preserve_duplicate: true, duplicate_reason: string }` calls `nextDuplicateOrdinal`; blank reason returns 422. Every state change writes an audit event in the same D1 batch as the entity change.

- [ ] **Step 4: Implement RFC 9457 route mappings**

Status mapping is fixed: validation 422, duplicate 409, missing 404, stale `If-Match` 412, create 201, list/get/update 200, trash 204. Every entity response includes `ETag: W/"qso-{id}-{version}"`.

- [ ] **Step 5: Verify CRUD and query plans**

Run: `pnpm test -- apps/worker/test/modules && pnpm exec wrangler d1 execute DB --local --command "EXPLAIN QUERY PLAN SELECT * FROM qsos WHERE deleted_at IS NULL ORDER BY qso_at DESC, id DESC LIMIT 50"`
Expected: tests pass and query plan references `idx_qsos_time`, not a full table scan with a temporary sort.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/modules apps/worker/src/index.ts apps/worker/test/modules
git commit -m "feat: add station and qso management"
```

---

### Task 6: Build the ADIF Codec and Resumable Import Pipeline

**Files:**
- Create: `packages/adif-codec/src/index.ts`
- Create: `packages/adif-codec/src/parser.ts`
- Create: `packages/adif-codec/src/serializer.ts`
- Create: `packages/adif-codec/src/types.ts`
- Create: `packages/adif-codec/test/fixtures/minimal.adi`
- Create: `packages/adif-codec/test/fixtures/unknown-fields.adi`
- Create: `packages/adif-codec/test/fixtures/malformed.adi`
- Create: `packages/adif-codec/test/codec.test.ts`
- Create: `apps/worker/src/modules/imports/repository.ts`
- Create: `apps/worker/src/modules/imports/service.ts`
- Create: `apps/worker/src/modules/imports/routes.ts`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/test/modules/imports.test.ts`

**Interfaces:**
- Consumes: `QsoInputSchema`, `QsoService.create`, D1 import tables.
- Produces:
  - `parseAdif(source: string): AdifParseResult`
  - `serializeAdif(records: AdifRecord[], metadata: AdifMetadata): string`
  - `ImportService.createJob(command): Promise<ImportJob>`
  - `ImportService.acceptChunk(jobId, command): Promise<ImportChunkResult>`
  - `ImportService.complete(jobId): Promise<ImportSummary>`

- [ ] **Step 1: Add golden round-trip tests before the codec**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAdif, serializeAdif } from "../src";

it("preserves unknown fields semantically", () => {
  const source = readFileSync(new URL("./fixtures/unknown-fields.adi", import.meta.url), "utf8");
  const first = parseAdif(source);
  expect(first.errors).toEqual([]);
  expect(first.records[0].fields.IOTA).toBe("AS-136");
  expect(first.records[0].fields.APP_VENDOR_FLAG).toBe("PRESERVED-VALUE");
  const second = parseAdif(serializeAdif(first.records, { programId: "eQSR", adifVersion: "3.1.7" }));
  expect(second.records).toEqual(first.records);
});

it("reports a truncated length-prefixed value with line and offset", () => {
  const result = parseAdif("<CALL:8>BG4Y<EOR>");
  expect(result.errors[0]).toMatchObject({ code: "TRUNCATED_VALUE", offset: 0 });
});

it("refuses non-ASCII data instead of emitting an invalid ADI file", () => {
  expect(() => serializeAdif([{ fields: { NAME: "操作员" }, types: {} }], {
    programId: "eQSR", adifVersion: "3.1.7"
  })).toThrow(/NON_ASCII_ADI.*NAME/);
});
```

- [ ] **Step 2: Prove the codec tests fail**

Run: `pnpm test -- packages/adif-codec/test`
Expected: FAIL because parser and serializer exports do not exist.

- [ ] **Step 3: Implement a cursor-based parser, not a whole-file regex**

```ts
export type AdifRecord = { fields: Record<string, string>; types: Record<string, string | undefined> };
export type AdifError = { code: "INVALID_TAG" | "TRUNCATED_VALUE" | "MISSING_EOR" | "NON_ASCII_ADI"; offset: number; line: number; detail: string };
export type AdifParseResult = { header: AdifRecord | null; records: AdifRecord[]; errors: AdifError[] };

```

Implement `parseAdif` as a deterministic cursor state machine with the following transitions: scan to `<`; parse `NAME:LENGTH[:TYPE]>`; reject invalid/non-numeric or negative lengths; advance exactly `LENGTH` ASCII characters; normalize field names to uppercase; append `<EOH>` content to `header`; emit a record only on `<EOR>`; and report an unterminated final record as `MISSING_EOR`. It must accept CRLF/LF, optional header/EOH, case-insensitive control tags, zero-length values, and leading-zero lengths on import. Non-ASCII ADI content is preserved in the diagnostic but classified `NON_ASCII_ADI`; the serializer refuses it. The browser-worker caller yields or checks cancellation every 250 emitted records. Mandatory QSO-field validation remains in `@eqsr/domain`, not the codec.

- [ ] **Step 4: Write failing import idempotency tests**

```ts
it("replays the same chunk without writing QSO rows twice", async () => {
  const job = await createImportJob({ total_records: 1, file_sha256: "a".repeat(64) });
  const command = { chunk_index: 0, checksum: "b".repeat(64), records: [validQso] };
  const first = await postChunk(job.id, "idem-00000000-0000-4000-8000-000000000001", command);
  const replay = await postChunk(job.id, "idem-00000000-0000-4000-8000-000000000001", command);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(await first.clone().json());
  expect(await countRows("qsos")).toBe(1);
});

it("rejects a chunk containing more than 40 records", async () => {
  const response = await postChunk("job", "idem-limit", { chunk_index: 0, checksum: "c".repeat(64), records: Array(41).fill(validQso) });
  expect(response.status).toBe(422);
});
```

- [ ] **Step 5: Implement the four-bucket import service**

```ts
export type ImportClassification =
  | { index: number; bucket: "ready"; qso_id: number }
  | { index: number; bucket: "warning"; qso_id: number; warnings: string[] }
  | { index: number; bucket: "duplicate"; duplicate_of: number }
  | { index: number; bucket: "rejected"; issues: Array<{ path: string; message: string }> };

export interface ImportChunkCommand {
  chunk_index: number;
  checksum: string;
  idempotency_key: string;
  records: unknown[];
}
```

The service first checks `import_chunks.idempotency_key`; a checksum mismatch on a reused key returns 409. It validates at most 40 records, preloads matching dedupe keys in one query, inserts accepted rows, saves the exact result JSON, and updates job counters. A D1 batch must contain no more than 50 statements.

- [ ] **Step 6: Verify correctness and the 10,000-record budget**

Run: `pnpm test -- packages/adif-codec/test apps/worker/test/modules/imports.test.ts`
Expected: golden fixtures, malformed inputs, replay, duplicate and 40-record limit tests pass.

Run: `pnpm test -- packages/adif-codec/test/codec.test.ts -t "10000 records"`
Expected: completes under 10 seconds on the CI runner and the before/after `process.memoryUsage().heapUsed` delta stays below 128 MiB; record the actual duration and delta in test output to make regressions diagnosable.

- [ ] **Step 7: Commit**

```bash
git add packages/adif-codec apps/worker/src/modules/imports apps/worker/src/index.ts apps/worker/test/modules/imports.test.ts
git commit -m "feat: add loss-preserving adif import"
```

---

### Task 7: Build the Owner Web App, QSO Workflow, and ADIF Browser Worker

**Files:**
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/styles.css`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/features/stations/StationSettings.tsx`
- Create: `apps/web/src/features/qsos/QsoListPage.tsx`
- Create: `apps/web/src/features/qsos/QsoForm.tsx`
- Create: `apps/web/src/features/qsos/QsoFilters.tsx`
- Create: `apps/web/src/features/qsos/TrashPage.tsx`
- Create: `apps/web/src/features/imports/ImportPage.tsx`
- Create: `apps/web/src/features/imports/import-controller.ts`
- Create: `apps/web/src/features/exports/export-controller.ts`
- Create: `apps/web/src/workers/adif.worker.ts`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/src/features/qsos/QsoForm.test.tsx`
- Test: `apps/web/src/features/imports/import-controller.test.ts`
- Test: `apps/web/src/features/exports/export-controller.test.ts`

**Interfaces:**
- Consumes: generated OpenAPI client, `@eqsr/domain`, `@eqsr/adif-codec`, owner APIs.
- Produces: responsive `/admin/qsos`, `/admin/import`, `/admin/trash`, `/admin/settings/stations`; `runImport(file)`, `exportAdif(filters)`.

- [ ] **Step 1: Write failing UI behavior tests**

```tsx
it("submits UTC ADIF values and the current ETag", async () => {
  render(<QsoForm initial={existingQso} etag={'W/"qso-10-2"'} />);
  await userEvent.clear(screen.getByLabelText("对方呼号"));
  await userEvent.type(screen.getByLabelText("对方呼号"), "bg4yyy/p");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(api.qsos.patch).toHaveBeenCalledWith(10, expect.objectContaining({ call: "BG4YYY/P" }), 'W/"qso-10-2"');
});
```

```ts
it("resumes import from the first missing chunk with concurrency two", async () => {
  const result = await runImport(fakeFileWith(121), fakeApi, { chunkSize: 40, concurrency: 2 });
  expect(fakeApi.uploadedChunkIndexes).toEqual([0, 1, 2, 3]);
  expect(result.total).toBe(121);
});
```

- [ ] **Step 2: Confirm tests fail with missing components**

Run: `pnpm test -- apps/web/src/features`
Expected: FAIL with missing forms/controllers.

- [ ] **Step 3: Implement the typed API client**

```ts
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<{ data: T; etag: string | null }> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-EQSR-Request": "1", ...init.headers }
  });
  if (!response.ok) throw await ProblemError.fromResponse(response);
  return { data: response.status === 204 ? (undefined as T) : await response.json() as T, etag: response.headers.get("etag") };
}
```

The UI must show 409 duplicate, 412 stale edit, 422 validation, and offline/network errors as distinct actionable states. A 412 dialog offers “reload server version” and “copy my edits”; it never silently retries.

- [ ] **Step 4: Implement the ADIF worker message protocol**

```ts
type AdifWorkerRequest =
  | { id: string; kind: "parse"; text: string }
  | { id: string; kind: "serialize"; records: AdifRecord[]; metadata: AdifMetadata }
  | { id: string; kind: "cancel" };
type AdifWorkerResponse =
  | { id: string; kind: "progress"; completed: number }
  | { id: string; kind: "parsed"; result: AdifParseResult }
  | { id: string; kind: "serialized"; text: string }
  | { id: string; kind: "error"; code: string; detail: string };
```

Import computes SHA-256 before job creation, slices 40 records, uploads no more than two chunks concurrently, and persists `{job_id,file_sha256,last_confirmed_chunk}` in sessionStorage for reload recovery. Export reads 200 QSO rows per cursor page and serializes off-main-thread.

- [ ] **Step 5: Implement responsive owner routes**

At 360 px width all primary actions remain visible, fields use native input types where useful, UTC is shown beside any local display, and the QSO table becomes a card list rather than horizontal page overflow. Do not add maps or charts.

- [ ] **Step 6: Verify components and accessibility**

Run: `pnpm test -- apps/web/src/features && pnpm --filter @eqsr/web build`
Expected: tests pass, no React act warnings, and Vite build exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: add owner qso and adif workflows"
```

---

### Task 8: Implement Template Storage and Deterministic Canvas Rendering

**Files:**
- Create: `packages/card-renderer/src/index.ts`
- Create: `packages/card-renderer/src/render.ts`
- Create: `packages/card-renderer/src/format.ts`
- Create: `packages/card-renderer/test/render.test.ts`
- Create: `apps/worker/src/modules/templates/repository.ts`
- Create: `apps/worker/src/modules/templates/service.ts`
- Create: `apps/worker/src/modules/templates/routes.ts`
- Create: `apps/web/src/features/templates/TemplateListPage.tsx`
- Create: `apps/web/src/features/templates/TemplateEditorPage.tsx`
- Create: `apps/web/src/features/templates/CanvasPreview.tsx`
- Create: `infra/seeds/template-layouts.json`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/test/modules/templates.test.ts`

**Interfaces:**
- Consumes: shared `CardTemplateSchema`, R2 immutable media adapter, template D1 table, QSO presentation fields.
- Produces: `renderCard(canvas, template, qso)`, TemplateService CRUD and background upload.

- [ ] **Step 1: Write failing schema and deterministic rendering tests**

```ts
it("rejects absolute coordinates and unknown element types", () => {
  const result = CardTemplateSchema.safeParse({ schema_version: 1, base_width: 1264, base_height: 848,
    elements: [{ type: "text", x: 120, y: 0.5, field: "call" }] });
  expect(result.success).toBe(false);
});

it("scales normalized coordinates to the target canvas", async () => {
  const calls: unknown[] = [];
  await renderCard(fakeCanvas(2528, 1696, calls), templateAt(0.5, 0.25), qsoFixture);
  expect(calls).toContainEqual(["fillText", "BG4YYY", 1264, 424]);
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `pnpm test -- packages/card-renderer/test apps/worker/test/modules/templates.test.ts`
Expected: FAIL with missing schema, renderer and routes.

- [ ] **Step 3: Enforce the shared v1 template schema and implement rendering**

```ts
import { CardTemplateSchema, type CardTemplate } from "@eqsr/domain";

export function assertRenderableTemplate(input: unknown): CardTemplate {
  return CardTemplateSchema.parse(input);
}
```

`renderCard` calls `assertRenderableTemplate` once, scales every normalized coordinate from the actual target canvas dimensions, renders only the schema's closed element union, and throws a typed error if the required font is not loaded. Worker template routes import the same schema from `@eqsr/domain`.

- [ ] **Step 4: Implement immutable background upload**

Worker accepts at most 8 MiB, recognizes PNG/JPEG magic bytes, calculates SHA-256, and writes `templates/{template_id}/{sha256}.{ext}` only if absent. Updating a template increments `version`; it never overwrites an existing R2 object.

- [ ] **Step 5: Calibrate three external electronic templates without importing assets into Git**

During manual acceptance, upload these exact external sources through the admin UI:

- `/Users/zhangneil/WorkBuddy/HAM/qsl_design_samples/01_半马苏河_水岸夕照实景风_Suzhou_Creek_Twilight.jpg`
- `/Users/zhangneil/WorkBuddy/HAM/qsl_design_samples/09_长风公园_银洲揽胜铁臂山实景风_Changfeng_Summit_Lake.jpg`
- `/Users/zhangneil/WorkBuddy/HAM/qsl_design_samples/11_长风公园_银洲湖心星夜赛博风_Changfeng_Starry_Night.jpg`

Store only generic layout JSON in `infra/seeds/template-layouts.json`; do not store local asset paths, image bytes, symlinks, or checksums from the external library. Unit tests generate a minimal in-memory PNG/JPEG fixture. Production upload creates R2 keys. The UI labels outputs “电子高清 PNG”，not “印刷级 300 DPI”. Before committing, run `git status --short` and verify no path under `qsl_design_samples` appears.

- [ ] **Step 6: Verify renderer and template API**

Run: `pnpm test -- packages/card-renderer/test apps/worker/test/modules/templates.test.ts && pnpm build`
Expected: schema, coordinate, upload hash, immutable key and version tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/card-renderer apps/worker/src/modules/templates apps/worker/src/index.ts apps/worker/test/modules/templates.test.ts apps/web/src/features/templates infra/seeds/template-layouts.json
git commit -m "feat: add qsl template rendering"
```

---

### Task 9: Add Card Snapshots, R2 Publishing, and Public Verification

**Files:**
- Create: `apps/worker/src/modules/cards/repository.ts`
- Create: `apps/worker/src/modules/cards/service.ts`
- Create: `apps/worker/src/modules/cards/routes.ts`
- Create: `apps/worker/src/modules/public/routes.ts`
- Create: `apps/worker/src/modules/public/service.ts`
- Create: `apps/web/src/features/cards/CardCreatePage.tsx`
- Create: `apps/web/src/features/cards/CardListPage.tsx`
- Create: `apps/web/src/features/public/PublicCardPage.tsx`
- Create: `apps/web/src/features/public/CardLookupPage.tsx`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/test/modules/cards.test.ts`
- Test: `apps/worker/test/modules/public.test.ts`
- Test: `apps/web/src/features/public/PublicCardPage.test.tsx`

**Interfaces:**
- Consumes: QSO and template service public methods, renderer output, R2 adapter, public rate limiter.
- Produces:
  - `CardService.createDraft(qsoId, templateId): Promise<CardDraft>`
  - `CardService.attachImage(cardId, bytes, sha256): Promise<CardReady>`
  - `CardService.publish(cardId): Promise<PublishedCard>`
  - `PublicCardService.get(publicId): Promise<PublicCardProjection>`
  - `PublicCardService.lookup(call, qsoDate): Promise<PublicCardSummary[]>`

- [ ] **Step 1: Write failing snapshot and privacy tests**

```ts
it("keeps a published card stable after the source QSO changes", async () => {
  const card = await publishCard();
  await updateQso(card.qso_id, { call: "JA1ZZZ" });
  const publicView = await getPublicCard(card.public_id);
  expect(publicView.qso.call).toBe("BG4YYY");
});

it("never exposes internal or private QSO fields", async () => {
  const view = await getPublicCard((await publishCard()).public_id);
  expect(view).not.toHaveProperty("qso_id");
  expect(view.qso).not.toHaveProperty("comment");
  expect(JSON.stringify(view)).not.toContain("adif_extra_json");
});

it("does not support fuzzy public call lookup", async () => {
  const response = await publicLookup({ call: "BG4", qso_date: "20260903" });
  expect(response.status).toBe(422);
});
```

- [ ] **Step 2: Confirm the tests fail**

Run: `pnpm test -- apps/worker/test/modules/cards.test.ts apps/worker/test/modules/public.test.ts`
Expected: FAIL because card/public routes are missing.

- [ ] **Step 3: Implement immutable snapshot creation**

```ts
export interface CardSnapshot {
  qso: Pick<Qso, "call" | "station_callsign" | "qso_date" | "time_on" | "band" | "freq_mhz" | "mode" | "rst_sent" | "rst_rcvd" | "my_grid">;
  template: { schema_version: 1; version: number; base_width: number; base_height: number; layout: CardTemplate; background_r2_key: string; background_sha256: string };
}
```

`createDraft` reads both source entities once, creates `id = nanoid(16)` and `public_id = nanoid(22)`, stores canonical JSON snapshots, and returns the public URL so the Canvas QR can be rendered before image upload.

- [ ] **Step 4: Implement image attach and state transitions**

Allowed transitions are exactly `draft -> ready -> published -> void`. Repeating the same transition with the same content hash is idempotent. Any other transition returns 409. R2 key is `cards/{card_id}/canvas-v1/{sha256}.png`; attach verifies header hash equals computed body hash.

- [ ] **Step 5: Implement public routes and cache policy**

`GET /api/v1/public/cards/{public_id}` returns `Cache-Control: public, max-age=60, stale-while-revalidate=300`; image responses are `public, max-age=31536000, immutable` with ETag equal to content hash. Draft returns 404, void returns 410. Lookup uses POST JSON `{call,qso_date}` and only returns published cards.

- [ ] **Step 6: Verify the full card lifecycle**

Run: `pnpm test -- apps/worker/test/modules/cards.test.ts apps/worker/test/modules/public.test.ts apps/web/src/features/public`
Expected: lifecycle, privacy, exact lookup, rate-limit 429, cache headers, snapshot stability and void 410 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/modules/cards apps/worker/src/modules/public apps/worker/src/index.ts apps/worker/test/modules/cards.test.ts apps/worker/test/modules/public.test.ts apps/web/src/features/cards apps/web/src/features/public
git commit -m "feat: publish and verify qsl cards"
```

---

### Task 10: Implement D1 Export Workflow and Restore Verification

**Files:**
- Create: `apps/worker/src/modules/backup/workflow.ts`
- Create: `apps/worker/src/modules/backup/repository.ts`
- Create: `apps/worker/src/modules/backup/service.ts`
- Create: `apps/worker/src/modules/backup/routes.ts`
- Create: `scripts/verify-backup.mts`
- Create: `apps/worker/test/fixtures/backup.sql`
- Create: `docs/runbooks/backup.md`
- Create: `docs/runbooks/restore.md`
- Modify: `apps/worker/src/index.ts`
- Modify: `wrangler.jsonc`
- Test: `apps/worker/test/modules/backup.test.ts`

**Interfaces:**
- Consumes: D1 Export REST API, `Env.D1_REST_API_TOKEN`, `Env.CLOUDFLARE_ACCOUNT_ID`, `Env.D1_DATABASE_ID`, private R2.
- Produces: `D1BackupWorkflow`, `BackupService.startManual()`, backup status API, deterministic restore verification script.

- [ ] **Step 1: Write failing Workflow tests with a fake export API**

```ts
it("polls export completion and writes the SQL stream to a dated R2 key", async () => {
  exportApi.queue({ status: "active" }, { status: "complete", at_bookmark: "0001", signed_url: "https://download.test/dump" });
  downloadApi.respond("CREATE TABLE sample(id INTEGER);", { "content-length": "32" });
  const result = await runBackupWorkflow({ scheduled_at: "2026-09-03T20:00:00Z" });
  expect(result.object_key).toMatch(/^backups\/daily\/2026\/09\/03\/.*\.sql$/);
  expect(await env.MEDIA.head(result.object_key)).not.toBeNull();
  expect(await latestBackupRun()).toMatchObject({ status: "completed" });
});
```

Also test export API 429/503 retries, signed URL download failure, R2 failure, duplicate scheduled time, and final failed status without secrets in the error text.

- [ ] **Step 2: Confirm tests fail**

Run: `pnpm test -- apps/worker/test/modules/backup.test.ts`
Expected: FAIL because Workflow and backup tables adapters are not implemented.

- [ ] **Step 3: Implement the official export flow**

```ts
type BackupParams = { requested_at?: string };

export class D1BackupWorkflow extends WorkflowEntrypoint<Env, BackupParams> {
  async run(event: WorkflowEvent<BackupParams>, step: WorkflowStep) {
    const requestedAt = event.schedule
      ? new Date(event.schedule.scheduledTime).toISOString()
      : event.payload.requested_at ?? event.timestamp.toISOString();
    const run = await step.do("create backup run", () => this.createRun(event.instanceId, requestedAt));
    const exportJob = await step.do("start D1 export", { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" } }, () => this.startExport());
    const ready = await this.pollUntilReady(step, exportJob);
    const saved = await step.do("stream dump to R2", { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" } }, () => this.saveExport(run, ready));
    await step.do("complete backup run", () => this.completeRun(run.id, saved));
    return saved;
  }
}
```

Use `POST /accounts/{account_id}/d1/database/{database_id}/export`, then poll the same endpoint exactly as the Cloudflare D1 backup example specifies. Stream the signed download response directly to R2; do not load the dump into an ArrayBuffer. Record the export bookmark, returned R2 ETag and response size in `backup_runs`; do not attempt whole-file SHA-256 inside the Workflow. Schedule is `0 20 * * *`.

Extend `Env` with `D1_BACKUP_WORKFLOW: Workflow<BackupParams>` and export `D1BackupWorkflow` by name from `apps/worker/src/index.ts`. Manual runs pass `{ requested_at: new Date().toISOString() }`; scheduled runs use `event.schedule.scheduledTime`, not a payload field. Add this exact binding to `wrangler.jsonc`; no separate top-level cron trigger or `scheduled()` handler is allowed:

```jsonc
"workflows": [
  {
    "name": "eqsr-d1-backup",
    "binding": "D1_BACKUP_WORKFLOW",
    "class_name": "D1BackupWorkflow",
    "schedules": ["0 20 * * *"]
  }
]
```

- [ ] **Step 4: Add retention prefixes and operational endpoints**

Daily key: `backups/daily/YYYY/MM/DD/{workflow_instance_id}.sql`. On the first UTC day of a month, copy the completed object to `backups/monthly/YYYY/MM/{workflow_instance_id}.sql`. Configure daily lifecycle expiry at 30 days and monthly expiry at 365 days through Wrangler/Cloudflare setup documented in the runbook. `POST /api/v1/backups/run` refuses another running job with 409.

- [ ] **Step 5: Implement restore verification**

`scripts/verify-backup.mts` accepts an explicit SQL file and local D1 name, computes the dump SHA-256, applies it to a clean local database, then checks required tables, QSO row count, and canonical JSON hashes for up to 20 deterministic rows selected by `id % max(1,floor(count/20)) = 0 ORDER BY id LIMIT 20`. It exits non-zero on any mismatch. `apps/worker/test/fixtures/backup.sql` contains the nine-table schema plus deterministic station/QSO rows and its expected counts/hashes are committed beside the test.

- [ ] **Step 6: Verify Workflow and a real local restore**

Run: `pnpm test -- apps/worker/test/modules/backup.test.ts`
Expected: all success/retry/failure tests pass.

Run: `pnpm tsx scripts/verify-backup.mts --sql apps/worker/test/fixtures/backup.sql --database eqsr-restore-check`
Expected: prints `RESTORE_VERIFIED tables=9` and exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/modules/backup apps/worker/src/index.ts apps/worker/test/modules/backup.test.ts apps/worker/test/fixtures/backup.sql scripts/verify-backup.mts docs/runbooks/backup.md docs/runbooks/restore.md wrangler.jsonc
git commit -m "feat: add recoverable d1 backups"
```

---

### Task 11: Add PWA Shell, Security Headers, End-to-End Tests, and Budgets

**Files:**
- Create: `apps/web/public/manifest.webmanifest`
- Create: `apps/web/public/sw.js`
- Create: `apps/web/public/_headers`
- Create: `apps/web/src/pwa/register.ts`
- Create: `tests/e2e/qso-flow.spec.ts`
- Create: `tests/e2e/adif-flow.spec.ts`
- Create: `tests/e2e/card-flow.spec.ts`
- Create: `tests/e2e/security.spec.ts`
- Create: `playwright.config.ts`
- Create: `scripts/check-bundle.mts`
- Create: `scripts/check-placeholders.mts`
- Modify: `apps/web/src/main.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: completed v1 UI/API.
- Produces: installable static-shell PWA, security headers, browser acceptance suite, size/placeholder release gates.

- [ ] **Step 1: Write the failing owner-to-public browser path**

```ts
test("owner creates a QSO and publishes a stable public card", async ({ page, request }) => {
  await page.goto("/admin/qsos/new");
  await page.getByLabel("对方呼号").fill("BG4YYY");
  await page.getByLabel("UTC 日期").fill("2026-09-03");
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByRole("link", { name: "制作 QSL" }).click();
  await page.getByRole("button", { name: "生成并发布" }).click();
  const publicUrl = await page.getByLabel("公开链接").inputValue();
  await page.goto(publicUrl);
  await expect(page.getByText("BG4YYY")).toBeVisible();
  await expect(page.getByRole("img", { name: "QSL 卡片" })).toBeVisible();
});
```

- [ ] **Step 2: Confirm end-to-end tests fail before fixture/auth wiring**

Run: `pnpm test:e2e`
Expected: FAIL because the local Access test identity and complete routes are not wired.

- [ ] **Step 3: Add an explicit local-only Access verifier**

When `APP_ENV=local`, accept only `Authorization: Bearer local-e2e-owner` and set actor `e2e-owner`; production must reject this header path. Add a production-mode test proving the local token receives 401.

- [ ] **Step 4: Add the static-only service worker**

`sw.js` precaches versioned JS/CSS/icons and navigation shell. It must never cache `/api/*`, `/c/*` JSON, or mutation responses, and it must not implement a background write queue in v1.

- [ ] **Step 5: Add security headers**

```text
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

Worker-generated responses duplicate the applicable headers because `_headers` does not apply to Worker responses.

- [ ] **Step 6: Enforce budgets**

`scripts/check-bundle.mts` fails when initial compressed JS exceeds 250 KiB, any static file exceeds 5 MiB, or total non-design-sample build output exceeds 15 MiB. `scripts/check-placeholders.mts` scans implementation and runbooks for `TBD`, `TODO`, `FIXME`, `fill in`, and dummy domains outside tests.

- [ ] **Step 7: Run the release candidate suite**

Run: `pnpm ci && pnpm test:e2e && pnpm tsx scripts/check-bundle.mts && pnpm tsx scripts/check-placeholders.mts`
Expected: all commands exit 0; the three core e2e flows and unauthenticated-owner denial pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/public apps/web/src/pwa apps/web/src/main.tsx tests playwright.config.ts scripts package.json pnpm-lock.yaml
git commit -m "test: enforce eqsr release gates"
```

---

### Task 12: Connect GitHub, Cloudflare, Migrations, and Production Runbooks

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `scripts/smoke.mts`
- Create: `README.md`
- Create: `docs/adr/0001-modular-worker-monolith.md`
- Create: `docs/adr/0002-cloudflare-access-auth.md`
- Create: `docs/adr/0003-browser-rendering.md`
- Create: `docs/runbooks/deploy.md`
- Create: `docs/runbooks/rollback.md`
- Create: `docs/runbooks/access-paths.md`
- Create: `docs/runbooks/production-checklist.md`
- Modify: `wrangler.jsonc`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete repository and Cloudflare account.
- Produces: protected GitHub `main`, required CI check, production D1/R2/Access/Worker, Workers Builds automatic deployment.

- [ ] **Step 1: Add the GitHub quality workflow**

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate:local
      - run: pnpm ci
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
```

- [ ] **Step 2: Create production Cloudflare resources**

Run these exact commands while authenticated to the intended Cloudflare account:

```bash
pnpm exec wrangler d1 create eqsr-prod --location=apac
pnpm exec wrangler r2 bucket create eqsr-media
```

Copy the returned D1 UUID into `wrangler.jsonc` `database_id`; keep `database_name` exactly `eqsr-prod`. Add the D1 export token with:

```bash
pnpm exec wrangler secret put D1_REST_API_TOKEN
```

Set `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `PUBLIC_ORIGIN`, and `APP_ENV=production` as Worker runtime variables/secrets according to `docs/runbooks/production-checklist.md`. No actual secret value enters Git.

- [ ] **Step 3: Configure Cloudflare Access path applications**

Create owner applications for `/admin/*`, `/api/v1/stations*`, `/api/v1/qsos*`, `/api/v1/imports*`, `/api/v1/card-templates*`, `/api/v1/cards*`, `/api/v1/backups*`, and `/readyz`. Allow only the owner's exact identity. Create explicit public Bypass applications only for `/`, `/assets/*`, `/c/*`, `/api/v1/public/*`, and `/healthz`. Record each application AUD in the runbook and use the actual owner API AUD configured for `ACCESS_AUD`.

- [ ] **Step 4: Protect GitHub `main`**

Enable: pull request required, `ci / verify` required, stale approval dismissal, conversation resolution, force-push disabled, deletion disabled. If the GitHub plan does not expose an approval rule for a private personal repository, keep required status checks and still merge only through PR.

- [ ] **Step 5: Connect Workers Builds without duplicate CD**

In Cloudflare Workers Builds, connect the GitHub repository and production branch `main`. Use:

```text
Build command: corepack enable && pnpm install --frozen-lockfile && pnpm ci
Deploy command: pnpm db:migrate:prod && pnpm deploy:prod
Non-production branch deployments: disabled
Root directory: /
```

Use one custom least-privilege user token that can edit Workers Scripts, D1, R2, and the Worker custom-domain route. GitHub Actions must not contain a deploy job; this prevents two pipelines publishing the same commit.

- [ ] **Step 6: Perform the first production deployment and smoke test**

Merge a PR containing this task. Confirm Workers Builds applies `0001_core.sql`, deploys the Worker and assets, and reports the commit SHA. Implement `scripts/smoke.mts` to require a valid HTTPS `--origin` argument, request `/healthz`, `/`, and one owner API path without an Access assertion, and fail unless their status codes are `200`, `200`, and `401` respectively. It must print no response body, token, or secret. Then set the task-specific environment variable to the exact custom origin recorded in `PUBLIC_ORIGIN` and run:

```bash
EQSR_PRODUCTION_ORIGIN="https://<the-configured-eqsr-domain>"
pnpm tsx scripts/smoke.mts --origin "$EQSR_PRODUCTION_ORIGIN"
```

`<the-configured-eqsr-domain>` is an operator-supplied deployment value, not source-code content; `scripts/check-placeholders.mts` must still reject placeholder domains in committed implementation and runbook files. Expected output:

```text
SMOKE_OK health=200 public_shell=200 owner_without_access=401
```

- [ ] **Step 7: Exercise rollback and restore before release**

Deploy a harmless text change, roll back to the previous Worker version, and verify health/public card routes. Trigger a backup, download its SQL, restore it into `eqsr-restore-check`, and run `verify-backup.mts`. Record timestamps, version IDs, object key and verification output in `docs/runbooks/production-checklist.md` under a dated “First release evidence” section.

- [ ] **Step 8: Run the final definition of done**

Run: `pnpm ci && pnpm test:e2e && git status --short`
Expected: checks pass and the working tree is clean after the final documentation commit.

- [ ] **Step 9: Commit**

```bash
git add .github README.md docs/adr docs/runbooks scripts/smoke.mts wrangler.jsonc package.json pnpm-lock.yaml
git commit -m "docs: operationalize github cloudflare delivery"
```

---

## Required Review Gates

After each task, the executing agent must provide:

1. the commit SHA;
2. exact test commands and pass/fail counts;
3. any deviation from this plan and the ADR that authorizes it;
4. the list of files changed;
5. confirmation that unrelated files were not reverted.

Do not start the next task if the current task has a failing test, an unexplained Cloudflare limit warning, a schema/API naming mismatch, or an uncommitted working tree.

## Release Evidence Checklist

- [ ] CI required check blocks a deliberately failing PR.
- [ ] Production deploy is triggered only by Workers Builds after `main` merge.
- [ ] Owner API rejects missing, forged and wrong-audience Access JWTs.
- [ ] Public card route works without Access and never returns private fields.
- [ ] 10,000-record ADIF fixture preserves unknown fields after export.
- [ ] Import chunk replay does not change QSO count.
- [ ] Concurrent stale PATCH returns 412.
- [ ] Published card is unchanged after source QSO/template edits.
- [ ] Daily D1 export exists in R2 and a real independent restore passes.
- [ ] Rollback to the previous Worker version has been performed once.
- [ ] Shanghai mobile/Unicom/Telecom reachability evidence is recorded.
