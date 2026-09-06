# PRD and README Synchronization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Synchronize the product PRD and repository README with the implemented v1.1/v1.2 capabilities and the actual local/GitHub/Cloudflare installation and deployment workflow.

**Architecture:** Keep the existing v1.0 product foundation, add the local radio agent, vector print pipeline, QRZ/Resend delivery pipeline, and review inbox as first-class modules. Document feature flags and external acceptance gates explicitly so the documents distinguish implemented code from production-ready functionality.

**Tech Stack:** Markdown, React/Vite, Hono/Cloudflare Workers, D1, R2, Workflows, Node.js 24, pnpm, Wrangler, GitHub Actions.

## Global Constraints

- Do not claim v1.1 or v1.2 production release until the external evidence listed in `docs/phase-2/execution-log.md` is complete.
- Keep the existing QSO/card/public lookup behavior and database identifiers backward compatible.
- Document `wrangler.jsonc` production flags as currently configured: print enabled, agent ingest and email delivery disabled.
- Use the repository's actual commands and paths; do not retain placeholder repository URLs or obsolete table names.

### Task 1: Rewrite PRD entry points and architecture

**Files:**
- Modify: `PRD.md`

- [ ] Update version/status, product scope, version matrix, architecture topology, v1.1/v1.2 requirements, data model, release gates, and roadmap to match implemented code.
- [ ] Replace obsolete `cards`/`spec_json` terminology with `qsl_cards`/`layout_json` and add phase-2 tables.
- [ ] Document explicit non-goals and external release blockers.

### Task 2: Rewrite README usage and deployment guide

**Files:**
- Modify: `README.md`

- [ ] Add accurate feature matrix and operator workflows for agent ingest, print batches, QRZ preview/send, webhook status, and review inbox.
- [ ] Provide local setup, agent installation/configuration, Cloudflare resource/secrets setup, GitHub Actions deployment, feature-flag rollout, rollback, and verification commands.
- [ ] Correct repository links, versions, test counts, and known limitations.

### Task 3: Validate documentation against the repository

**Files:**
- Test: `PRD.md`, `README.md`, `docs/phase-2/execution-log.md`, `.github/workflows/deploy.yml`, `wrangler.jsonc`

- [ ] Run Markdown/link/path searches for stale version, table, command, and placeholder references.
- [ ] Run `git diff --check`, the documentation generation commands, and the existing quality gate command without changing application code.
- [ ] Commit the documentation-only change.
