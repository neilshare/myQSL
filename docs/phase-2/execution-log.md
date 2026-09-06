# 第二阶段执行日志

| 任务 | 状态 | HEAD/证据 | 备注 |
|---|---|---|---|
| T00 | partial | `feat/eqsr-phase2`; baseline and compatibility notes captured | Synthetic fixtures only; no four-platform/real-radio evidence yet |
| T01 | done | domain contracts, OpenAPI paths, radio/print/delivery schemas; package tests green | ADIF mapper extraction and generated client methods remain limited |
| T02 | done | migrations 0004–0007 and Drizzle schema; migration tests green | Production migration not applied |
| T03 | partial | agent bearer hash, device create/list/revoke/rotate routes | Cloudflare Access JWT issuer/audience verification and Owner email allow-list still require deployment configuration |
| T04 | done | WSJT-X/N1MM codec, bounded reader/XML budget, 11 codec tests | Fixtures are synthetic; WSJT type5 golden capture not yet verified on hardware |
| T05 | done | Node SQLite WAL/FULL outbox, restart recovery, capacity and uploader tests | No disk-full/Windows ACL test in this environment |
| T06 | partial | loopback UDP receiver, HTTPS uploader, CLI parser, diagnostics | Heartbeat reply and four-platform packaging are not hardware-validated |
| T07 | done | D1 ingest atomic batch, event hash/idempotency/source link and concurrency tests | Owner review inbox UI/API dismissal is not complete |
| T08 | partial | initial agent settings, printing and delivery pages/routes | UI is functional skeleton; no full inbox/selection/preview E2E |
| T09 | partial | GitHub agent release workflow and reproducible tar/SHA package script | Real WSJT-X/N1MM run and release upload not executed |
| T10 | done | print batch migration, immutable manifest service, asset allow-list route | R2 asset integration needs staging verification |
| T11 | partial | existing canvas renderer retained; PDF package has deterministic scene interpretation | Licensed embedded font manifest and static bundle budget not yet enforced |
| T12 | done | `@myqsl/card-pdf` vector text/QR renderer, A4/bleed profiles and preflight tests | Standard font fallback is used; CJK font embedding pending asset/license decision |
| T13 | partial | `verify:pdf` geometry/page-count checker and geometry test | Independent QR/text extraction and raster comparison still pending |
| T14 | partial | print page and cancellation-capable PDF renderer API | Browser worker preview/download flow not fully wired |
| T15 | partial | CI deployment workflow, migrations and generated OpenAPI checks | Staging feature flags, rollback drill and production smoke evidence pending |
| T16 | done | `single-bleed-v1` page/bleed geometry implemented and tested | Printer proof and TrimBox/BleedBox external check pending |
| T17 | done | card batch migration/service, snapshot/idempotency tests | Browser resumable renderer controller pending |
| T18 | partial | backend ordered draft batch and API client | Existing single-card UI still uses legacy per-card path |
| T19 | done | directory/delivery tables, AES-GCM PII, HMAC and quota reservation | Key rotation/restore drill pending |
| T20 | done | QRZ XML client, session single-flight/cache, stable error mapping | Real subscription/account test pending |
| T21 | done | asynchronous delivery preparation route, 15-minute preview and explicit send selection | Workflow binding not yet added; execution context relies on cron/repair path |
| T22 | done | Resend/Fake provider, attachment/HTML validation and fixed idempotency key | Real self-mail/SPF/DKIM/DMARC evidence pending |
| T23 | partial | D1 claim/lease/throttle dispatcher and minute cron branch | Workflow retry/recovery binding and full provider fault-injection tests pending |
| T24 | partial | raw Svix signature verification and webhook event idempotency storage | Delivered/bounce status reducer and suppression transition tests pending |
| T25 | partial | delivery page skeleton with explicit ready-item send | Full history/cancel/retry/resend UX and E2E pending |
| T26 | partial | deploy workflow, runbooks and release evidence structure | Production restore, real mail and print/agent acceptance not performed |

## 当前验证命令

- `pnpm lint`：通过。
- `pnpm typecheck`：通过（Node 26.8.1；项目声明 Node 24）。
- `pnpm exec vitest run --config vitest.config.ts --project packages`：43 tests passed。
- `pnpm exec vitest run --config apps/web/vitest.config.ts`：33 tests passed。
- `pnpm exec vitest run --config apps/worker/vitest.config.ts`：56 tests passed；Wrangler 日志目录 EPERM 和预期 backup `EXPORT_UNAVAILABLE` 日志不影响退出码。
- `pnpm --filter @myqsl/agent test`：4 tests passed。
- `pnpm generate:openapi && pnpm generate:api`：生成成功；OpenAPI 变更已纳入工作树。
- `pnpm exec tsx scripts/build-agent.mts`：生成 `dist/agent/myqsl-agent-v1.1.0.tar.gz` 与 `SHA256SUMS`。

## 发布阻塞项

1. 当前没有真实 WSJT-X/N1MM 数据包和四平台重启/断网证据。
2. 生产 Cloudflare Access Service Auth、QRZ 订阅、Resend 发件域/Secrets、PII key 备份尚未配置或验证。
3. PDF 仍使用标准 PDF 字体，中文受控字体、独立 QR 解码/印刷尺寸复核尚未完成。
4. Email Workflow/回执状态 reducer、Owner 收件箱和完整 E2E 尚未完成；邮件功能不得在当前状态直接宣称 v1.2 已发布。
