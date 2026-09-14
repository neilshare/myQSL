# QSO Entry Fields & Responsive Logbook Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test-first verification. Keep unrelated user-authored documentation changes out of the implementation commits.

**Goal:** Extend QSO entry with the missing operational fields from the reference interface, persist them end-to-end, and provide a responsive logbook layout that works on phone, tablet, and desktop.

**Architecture:** Preserve UTC as the canonical stored timestamp. Add first-class QSO fields for RST, QTH, power, rig, antenna, and counterpart power; keep station settings as the source of defaults for the operator-side fields. Keep the Worker API and domain schema as the source of truth, then render the same semantic form with responsive CSS grid breakpoints.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/Testing Library, Zod domain schemas, Cloudflare Workers/Hono, D1 SQL migrations, OpenAPI-generated API types.

## Global Constraints

- `CQ 分区` is intentionally excluded from this iteration.
- `BI4BVN` is the default station callsign fallback and the application author label.
- QSO timestamps remain UTC in storage; local/UTC is a display/input mode, never a second timestamp.
- Existing ADIF/API records and old migrations must remain readable.
- Do not stage or alter existing uncommitted handover/design files.

---

### Task 1: Extend the domain contract

**Files:**
- Modify: `packages/domain/src/qso.ts`
- Modify: `packages/domain/src/openapi.ts`
- Test: `packages/domain/test/qso.test.ts`

Add optional nullable fields `my_rig`, `my_antenna`, `my_power_w`, and `other_power_w` to QSO input/patch schemas. Keep existing `rst_sent`, `rst_rcvd`, `qth`, and `comment` contracts. Validate powers as non-negative integers capped at 100000 watts and normalize text fields by trimming. Update generated OpenAPI schema definitions and tests for acceptance, normalization, and invalid power rejection.

### Task 2: Add D1 persistence and Worker mapping

**Files:**
- Create: `infra/migrations/0010_qso_operating_details.sql`
- Modify: `apps/worker/src/modules/qsos/repository.ts`
- Modify: `apps/worker/src/modules/qsos/service.ts`
- Modify: `apps/worker/src/modules/qsos/mapper.ts`
- Modify: `apps/worker/src/modules/imports/repository.ts`
- Modify: `apps/worker/src/modules/imports/service.ts`
- Test: `apps/worker/test/modules/qsos.test.ts`

Add `other_power_w` to the QSO table. Wire `my_rig`, `my_antenna`, `my_power_w`, and `other_power_w` through insert, update, row mapping, and API responses. Preserve ADIF-imported operator fields instead of dropping them. Add regression tests that create, list, patch, and import records with the new values.

### Task 3: Regenerate API types and update client contracts

**Files:**
- Modify: `openapi/myQSL-v1.yaml`
- Modify: `openapi/eQSR-v1.yaml`
- Modify: `apps/web/src/lib/api-types.ts`
- Modify: `apps/web/src/lib/api-client.ts`

Regenerate OpenAPI and TypeScript API types after the domain changes. Ensure the QSO record/input types expose all persisted fields without hand-written drift.

### Task 4: Build the field-complete responsive QSO form

**Files:**
- Modify: `apps/web/src/features/qsos/QsoForm.tsx`
- Modify: `apps/web/src/features/qsos/QsoForm.test.tsx`
- Modify: `apps/web/src/app/styles.css`

Use explicit form state for RST sent/received, QTH, operator power/rig/antenna, and counterpart power. Add mode chips for SSB/FM/CW/AM/RTTY plus a custom mode input for FT8 and other modes. Add an explicit UTC/local display toggle while converting local input to UTC before submission. Load the default station profile once and prefill operator fields, while preserving `BI4BVN` fallback. Use semantic class names and CSS grid breakpoints: one column below 640px, two columns from 640–1023px, and four-column/field spans from 1024px upward. Keep controls keyboard accessible and touch-safe.

### Task 5: Improve the logbook surface and author identity

**Files:**
- Modify: `apps/web/src/features/qsos/QsoListPage.tsx`
- Modify: `apps/web/src/features/qsos/QsoListPage.test.tsx`
- Modify: `apps/web/src/app/AppLayout.tsx`
- Modify: `apps/web/src/lib/i18n.tsx`
- Modify: `apps/web/src/app/styles.css`

Add responsive summary cards for local time, UTC time, total QSOs, and published QSL count using existing APIs. Add a clear new-record action, compact filters, and readable QSO rows that expose the newly captured fields without breaking edit/delete. Change the footer author label to `BI4BVN` while keeping the product description. Add tests for summary rendering and new-field display.

### Task 6: Verify, self-review, and document the change

**Files:**
- Modify: `README.md`
- Modify: `PRD.md`

Document the new QSO fields, default callsign, timestamp rule, responsive behavior, and migration/deployment note. Run focused tests first, then the complete lint/typecheck/test/build/bundle/placeholder checks and `git diff --check`. Review the diff to confirm unrelated user-authored files remain untouched.
