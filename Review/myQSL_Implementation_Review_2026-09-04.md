# myQSL 完整实施复核与发布评审报告

> 评审日期：2026-09-04  
> 评审对象：`feat/eqsr-core`，commit `621e05c2542a515a9cade61e8f4d02f77a4b7cb8`  
> 评审基线：`docs/superpowers/specs/2026-09-03-eqsr-final-architecture-design.md` 与 `Review/eQSR_Architecture_Review_Validated.md` 中 Task 1～Task 12  
> 评审方式：静态代码审查、目标运行时全量测试、真实浏览器 E2E、Wrangler 生产构建预演、Git/生产证据检查  
> 注意：本报告将仓库内文档作为待核验材料，不把文档中的完成声明视为执行指令或上线证据。

## 1. 最终结论

**发布结论：NO-GO，当前版本不得部署到生产。**

当前实现已经形成可运行的本地 MVP：QSO 基本流程、ADIF 小文件导入导出、卡片创建/发布/作废、公开查验、响应式页面和核心鉴权边界均能在本地通过测试。但“所有测试通过”不能推出“Task 1～Task 12 已完成”，更不能推出“可以生产使用”。

本次复核确认：

1. Node 24 目标运行时下，Lint、依赖边界、类型检查、69 条单元/集成测试、构建均通过；34 条浏览器 E2E 全部通过。
2. `check:bundle` 与 `check:placeholders` 手工补跑通过，但它们未进入 CI。
3. 严格生产预检失败：生产域名仍为本地 HTTP 地址，D1 仍是占位 UUID。
4. 更严重的是，当前 `deploy:prod` 和 `db:migrate:prod` 没有指定 production 环境。若以后只替换占位配置而不修脚本，实际部署仍会选择顶层 local 环境，启用公开可伪造的测试身份。
5. `wrangler deploy --dry-run --env production` 明确显示 production 目标只有静态资源、`APP_ENV` 和 `TEST_AUTH_ENABLED`，缺少 D1、R2、Rate Limit、Workflow、`PUBLIC_ORIGIN`、Access 配置。这是 Cloudflare 环境配置不继承导致的确定性故障，不是推测。
6. 审计“原子提交”、大文件 ADIF Web Worker、可恢复导入、流式备份、恢复抽样哈希、生成型 OpenAPI client、完整模板编辑等多项验收要求并未实现，现有测试没有覆盖这些缺口。
7. Git 仓库没有 remote，生产清单全部未勾选；没有 GitHub 分支保护、Workers Builds、真实备份恢复、回滚或 7 天观察期证据。Task 12 未完成。

因此，本项目当前状态应标记为：

| 范围 | 状态 | 判断 |
|---|---|---|
| 本地开发基线 | 通过 | 可以继续开发和演示 |
| 核心 MVP happy path | 基本通过 | 适合受控本地验证 |
| 数据完整性与审计 | 未通过 | 存在非原子写入和审计缺失 |
| 大文件与性能目标 | 未通过 | Web Worker/进度/取消未接入 |
| 备份恢复 | 未通过 | 不能证明生产备份可恢复 |
| CI 发布门禁 | 部分通过 | 多项要求未加入 CI |
| GitHub × Cloudflare 生产交付 | 未完成 | 没有外部证据，配置本身不可用 |
| 生产发布 | **禁止** | 3 个 P0 和多个 P1 阻断项 |

## 2. 测试与验证证据

### 2.1 已通过项目

在项目声明的 Node `v24.19.0` 运行时下执行：

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 通过；147 个模块、315 条依赖，无边界违规 |
| `pnpm typecheck` | 5 个 workspace project 全部通过 |
| packages + scripts Vitest | 9 个文件、29 条测试通过 |
| Web Vitest | 10 个文件、12 条测试通过 |
| Worker Vitest | 15 个文件、28 条测试通过 |
| Web build | 通过；193 个模块 |
| `pnpm test:e2e` | 34/34 通过；Node 24 下耗时约 1.8 分钟 |
| `pnpm check:bundle` | 通过；首屏 JS gzip 124,323 bytes |
| `pnpm check:placeholders` | 通过；扫描 84 个文件 |

浏览器 E2E 覆盖了：

- ADIF 自定义字段的小文件往返；
- 卡片创建、图片上传、发布、公开查看、精确索卡与作废 410；
- QSO 创建、乐观锁 412、回收站和恢复；
- 3 种视口下 9 个页面的横向溢出检查；
- 未登录 Owner API 401、`/readyz`、draft/ready 卡片不可公开。

### 2.2 明确失败项目

`pnpm verify:production -- --strict --skip-secrets` 返回非零：

- `PUBLIC_ORIGIN=http://127.0.0.1:8787`，不是生产 HTTPS；
- D1 ID 为 `00000000-0000-0000-0000-000000000001`。

`wrangler deploy --dry-run --env production` 的实际绑定清单只有：

- Static Assets；
- `APP_ENV="production"`；
- `TEST_AUTH_ENABLED="0"`。

预演同时警告 production 环境缺少 `PUBLIC_ORIGIN`、`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、Workflow、R2、D1 和 Rate Limit。Cloudflare 官方文档也明确说明 `vars` 与各类 binding 属于环境不可继承项，必须在每个命名环境中重新声明：[Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)、[Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)。

不带 `--env production` 的默认预演则实际选择：

- `APP_ENV="local"`；
- `TEST_AUTH_ENABLED="1"`；
- 本地 Access audience；
- 占位 D1 ID 对应的顶层绑定。

### 2.3 为什么现有绿灯不能作为发布证据

现有测试主要证明本地 happy path，没有证明：

- Cloudflare production 命名环境具有完整绑定；
- 默认部署命令不会启用本地鉴权旁路；
- 业务写与审计写属于同一个 D1 batch；
- 10,000 条记录在真实浏览器中不会冻结 UI；
- 取消消息能中断 ADIF 解析；
- chunk 上传中断后可无副作用重放；
- 大型 D1 dump 不会超过 Worker 128 MB 内存；
- SQL dump 的业务记录数量与抽样内容正确；
- OpenAPI 与真实路由、前端类型不存在漂移；
- GitHub 分支保护和 Workers Builds 实际生效。

## 3. 问题清单

严重级别定义：P0 = 上线前绝对阻断；P1 = 首版完整性/可靠性阻断；P2 = 应尽快修复但不单独阻断受控本地演示。

### P0-1：生产命令选择 local 环境，可能直接开放测试身份绕过

**证据**

- [`package.json`](../package.json#L21) 的生产迁移和部署命令均未加 `--env production`。
- [`wrangler.jsonc`](../wrangler.jsonc#L28) 顶层配置为 `APP_ENV=local`、`TEST_AUTH_ENABLED=1`。
- [`access.ts`](../apps/worker/src/platform/access.ts#L14) 在 local 环境接受请求头测试身份和固定的 `Bearer local-e2e-owner`。
- 默认 Wrangler 预演确认部署目标实际携带上述 local 配置。
- 预检脚本读取的是合并后的 production 配置，而后续部署命令读取的是顶层配置；两者校验和部署的目标不是同一个环境。

**影响**

一旦真实 D1 ID/域名被补齐，预检可能通过，随后 `deploy:prod` 却部署顶层 local Worker。攻击者无需 Cloudflare Access JWT，只需构造公开已知的测试请求头或固定 bearer 即可访问 Owner API。这属于生产认证绕过。

**整改结论**

推荐不要把命名 `env.production` 作为补丁继续叠加。将顶层 Wrangler 配置定义为唯一生产目标，移除生产中的 `TEST_AUTH_ENABLED`，另建 `wrangler.test.jsonc` 或测试专用 Miniflare binding；所有本地 E2E 只使用测试配置。若坚持命名环境，则迁移、secret list、预检、deploy、dry-run 必须全部显式使用同一个 `--env production`，不能混用。

**验收标准**

- 生产 dry-run 清单中不存在 `TEST_AUTH_ENABLED=1`；
- production-like E2E 中两种测试身份均返回 401；
- 预检输出的目标名、D1 ID 与 deploy dry-run 完全一致；
- CI 新增静态断言：任一 `*:prod` 脚本遗漏生产目标时失败。

### P0-2：production 环境缺失关键绑定，部署后应用必然不可用

**证据**

- [`wrangler.jsonc`](../wrangler.jsonc#L44) 的 production 环境只声明两个变量。
- production dry-run 不包含 `DB`、`MEDIA`、`PUBLIC_RATE_LIMITER`、`D1_BACKUP_WORKFLOW`。
- production dry-run 也不包含 `PUBLIC_ORIGIN`、`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`。
- [`workflow.ts`](../apps/worker/src/modules/backup/workflow.ts#L20) 还要求 `CLOUDFLARE_ACCOUNT_ID` 和 `D1_DATABASE_ID` runtime 值；当前任何环境均未声明这两个值，备份启动后只会进入 `EXPORT_UNAVAILABLE`。
- [`verify-production-config.mts`](../scripts/verify-production-config.mts#L142) 会把顶层不可继承配置当作 production fallback，掩盖 production 实际缺失项。

**影响**

即使部署成功，Owner API 会因 DB binding 缺失而失败，卡片和模板对象无法访问 R2，公开索卡不能限流，备份 Workflow 不存在或必然失败，公开图片 URL 还可能拼出 `undefined/api/...`。

**整改结论**

必须让预检解析“Wrangler 对目标环境的有效配置”，禁止用顶层 fallback 模拟命名环境继承。预检应调用或解析 dry-run 结果，逐项验证 binding；备份所需 account/database runtime 配置也必须单独检查。

**验收标准**

- production dry-run 明确列出 DB、R2、Rate Limit、Workflow、生产域名和 Access 配置；
- 在 production-like 本地配置上完整运行 34 条 E2E；
- 备份 Workflow 的配置测试断言 account/database/token 缺一即阻断部署，而不是部署后记一条 failed run。

### P0-3：生产预检对 secret 检查采用 fail-open，不能充当安全门禁

**证据**

- [`verify-production-config.mts`](../scripts/verify-production-config.mts#L75) 只在 `existingSecrets.length > 0` 时检查缺失项；Cloudflare 返回空列表时反而判定无缺失。
- [`verify-production-config.mts`](../scripts/verify-production-config.mts#L112) 捕获所有 CLI 错误并返回 `null`。
- [`verify-production-config.mts`](../scripts/verify-production-config.mts#L160) 在未认证、超时或命令失败时打印“跳过”并继续，可能输出 `PRODUCTION_CONFIG_OK`。
- secret list 命令本身没有选择 production 环境。

**影响**

凭据未配置、登录状态失效或 Cloudflare 暂时不可达时，最需要阻断的场景会被当作可发布。缺少 `RATE_LIMIT_SALT` 时运行时代码还会退回公开的固定盐值。

**整改结论**

生产模式必须 fail-closed：无法读取 secret 名称列表即失败；空列表也必须逐项报错；secret list 与 deploy 使用完全相同的环境/Worker 目标。`--skip-secrets` 只能用于单元测试，生产构建命令禁止使用。

### P1-1：所谓“原子审计”没有实现，且多数写操作根本没有审计

**证据**

- [`write-unit.ts`](../apps/worker/src/platform/write-unit.ts#L4) 虽定义 `executeBatchWithAudit()`，但生产代码没有任何调用方。
- QSO/台站/卡片路由在业务 service 完成后才单独执行 `audit.append()`，例如 [`qsos/routes.ts`](../apps/worker/src/modules/qsos/routes.ts#L30)。两次数据库写不在同一个 batch。
- QSO patch/delete/restore、import create/chunk/complete、template create/background、card image、backup run/state更新均没有审计。
- 发布审计把完整 `public_id` 写入 detail，不符合“仅保存受限元数据/截断 checksum”的要求。
- [`readiness.test.ts`](../apps/worker/test/readiness.test.ts#L27) 虽把用例命名为 “atomically records”，实际只检查最终存在一条 audit，没有注入 audit 失败，也没有证明原子性。

**影响**

业务写成功而审计写失败时，API 会返回 500，但业务数据已经提交；客户端重试可能形成重复写，审计账本仍缺失。发生安全事件或数据争议时无法还原完整操作链。

**整改结论**

将 actor/requestId/audit metadata 下沉到 command/repository 写单元，所有纯 D1 业务写与 audit statement 一次 `DB.batch()`。R2 场景采用“内容寻址 R2 写成功 → D1 元数据 + audit 同 batch”，并为孤儿对象建立可回收策略。

**验收标准**

- 每类写操作恰好产生一条审计；
- 注入 audit SQL 失败时业务数据也不存在；
- 注入业务 SQL 失败时 audit 也不存在；
- 自动扫描 detail，禁止 JWT、原始 ADIF、comment、signed URL、完整 public token。

### P1-2：ADIF Web Worker、进度和取消没有接入，页面的“千万级”声明不成立

**证据**

- [`import-controller.ts`](../apps/web/src/features/imports/import-controller.ts#L19) 在主线程直接调用同步 `parseAdif()`，并且对同一文件调用两次 `file.text()`。
- [`adif.worker.ts`](../apps/web/src/workers/adif.worker.ts#L9) 仍调用同步解析；`cancelled` 集合只写不读，取消消息不会停止解析。
- `ImportPage` 没有实例化 Worker，没有进度 UI，没有取消按钮。
- 10,000 条测试是 Node 中的同步函数耗时测试，没有验证浏览器主线程响应性。
- [`ImportPage.tsx`](../apps/web/src/features/imports/ImportPage.tsx#L30) 宣称“支持千万级”，但实现会同时持有源文本、全部 record、全部 mapped record、全部 chunk 和全部 payload，内存随文件线性放大。

**影响**

较大日志会冻结页面；用户无法取消；移动端可能因内存压力崩溃。产品文字远超已验证能力。

**整改结论**

实现 `parseAdifIncremental()`，每固定标签数让出事件循环并检查取消标记；ImportPage 只通过 Worker 消息解析和接收进度。不要承诺“千万级”，在浏览器实测之前仅声明已验收的 10,000 条规模。

**验收标准**

- 真实 Chromium 解析 10,000 条时 UI 心跳持续响应；
- 进度单调递增至 100%；
- 解析中发送 cancel 后在限定时间内停止，且没有创建 import job；
- Playwright 记录耗时和最大文件规模。

### P1-3：导入 chunk 不是可恢复事务，幂等与 complete 状态可产生错误账本

**证据**

- [`imports/service.ts`](../apps/worker/src/modules/imports/service.ts#L38) 先逐条写 QSO，之后才分别保存 chunk 和更新计数，三部分不是同一事务。
- 服务端信任客户端传入的 checksum，没有对 canonical records 重新计算。
- 两个并发相同 idempotency key 请求都可能先查不到 replay，再各自写入部分 QSO；唯一约束冲突发生在业务写之后。
- [`imports/service.ts`](../apps/worker/src/modules/imports/service.ts#L59) 的 complete 不校验 chunk 数、记录分类总数或 job 当前状态；一个零 chunk 的 job 也可被标为 completed。

**影响**

网络中断、Worker 异常或并发重试可留下已写 QSO、缺失 chunk ledger、错误计数，随后重试把原成功记录分类为 duplicate；completed 也不代表所有记录已处理。

**整改结论**

先验证 job/chunk 状态和服务端 checksum，再将 chunk ledger、QSO inserts/classifications、job counts 放入一个 D1 batch；complete 必须校验 chunk index 连续、总分类数等于 `total_records`、没有未决 chunk。并发冲突后读取已提交 ledger，返回同一结果。

### P1-4：备份只完成了 polling 外形，仍无法证明安全、可恢复和可审计

**证据**

- [`backup/service.ts`](../apps/worker/src/modules/backup/service.ts#L98) 使用 `arrayBuffer()` 把整个 D1 dump 读入内存，再写 daily/monthly 两份；没有流式传输。Cloudflare Workers 当前单 isolate 内存限制为 128 MB，并明确建议大响应使用 stream：[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[Streams API](https://developers.cloudflare.com/workers/runtime-apis/streams/)。
- [`backup/service.ts`](../apps/worker/src/modules/backup/service.ts#L16) 发现已有 running 时直接把旧任务标为 `DUPLICATE_RUNNING` failed，然后创建新任务，与计划要求相反。
- [`backup/routes.ts`](../apps/worker/src/modules/backup/routes.ts#L14) 实现的是 `/api/v1/backups/latest` 且只返回 running；冻结契约要求 `GET /api/v1/backups` 返回最近各状态记录。
- [`verify-backup.mts`](../scripts/verify-backup.mts#L15) 只在内存 SQLite 建表和查询空表；`--database` 参数没有实际用途，没有校验 QSO count、最多 20 条 canonical hash，也不会回填 `content_sha256/verified_at`。
- [`configure-r2-lifecycle.mts`](../scripts/configure-r2-lifecycle.mts#L40) 缺凭据时以成功码“跳过”；PUT 后没有 GET/list 对比，无法证明远端规则生效。
- 生产配置没有 Workflow 所需 account/database runtime 值，生产备份必然失败。

**影响**

大库导出可能触发内存超限；重复调度会破坏仍在运行的账本；“RESTORE_VERIFIED”只能证明 SQL 语法和九张表存在，不能证明数据完整；生命周期可能从未真正配置。

**整改结论**

恢复严格的流式 R2 put；重复任务返回/复用已有 running，不修改旧任务；实现规范化备份列表接口；恢复验证必须在独立目标库执行并比较表数、行数和抽样业务哈希；生命周期设置后必须读回比对，远端不可达时失败。

### P1-5：OpenAPI 与前端“生成型 client”是手写副本，CI 也不检查漂移

**证据**

- domain package 只有 Zod，没有计划指定的 OpenAPI 生成依赖。
- [`openapi.ts`](../packages/domain/src/openapi.ts#L1) 是手写对象，不是共享 Zod schema 自动注册生成。
- [`generate-api-client.mts`](../scripts/generate-api-client.mts#L1) 把固定 TypeScript 字符串写入 `api-types.ts`，没有读取 OpenAPI，也没有生成请求 client。
- 类型已经漂移：前端 CardRow 定义 `image_sha256`，后端字段为 `content_sha256`。
- OpenAPI 缺少 imports、backup、公开卡片 metadata/image、station patch、template get/patch/background get 等真实接口。
- 仓库同时维护内容完全相同的 `eQSR-v1.yaml` 和 `myQSL-v1.yaml`。
- `.github/workflows/ci.yml` 没有 regenerate + `git diff --exit-code`，也没有 OpenAPI 测试。

**影响**

接口改动时类型检查仍可能全绿，前后端在运行时才发现字段或路径不一致。“生成型 API Client”当前名不副实。

**整改结论**

只保留一个品牌后的 OpenAPI 文件；由共享 schema 生成 spec，再由 spec 生成 types/client；CI 重生成并检查工作树无 diff。对所有真实路由建立 operationId 和 contract test。

### P1-6：模板/卡片管理仍是部分实现，现有 E2E 未覆盖承诺的编辑与渲染质量

**证据**

- 后端没有 template PATCH，`TemplateEditorPage` 也不读取 URL 中的 id；列表中的“编辑”链接实际会再次创建新模板。
- 前端声明了 `cards.get()`，后端没有 `GET /api/v1/cards/:id`。
- 模板背景和卡片图片路由仍同时接受 POST/PUT，没有按冻结契约移除旧方法。
- [`CanvasPreview.tsx`](../apps/web/src/features/templates/CanvasPreview.tsx#L28) 静默吞掉渲染错误，违反“失败必须可见且阻止后续上传”的要求；Canvas 尺寸固定为 1264×848，没有跟随模板尺寸。
- 制卡页面不计算并发送 `X-Content-SHA256`，组件测试也没有检查严格调用顺序或 hash mismatch。
- 卡片 E2E 只证明最终图片可访问，没有断言底图确实被绘制到输出像素。

**影响**

用户无法真正编辑模板；背景/字体渲染失败可能显示空白预览；E2E 仍可能发布没有正确底图的卡片。

### P1-7：CI 没有实现 Task 11 声明的完整发布门禁

**证据**

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml#L24) 只执行 migration、`check` 和 E2E。
- `check:bundle`、`check:placeholders`、OpenAPI/client drift 没有进入 CI。
- 文档要求的 required check 名为 `ci / check`，实际 job 名为 `ci / verify`。
- 没有 deliberate failing PR 的分支保护证据；仓库没有 remote。

**影响**

本地手工通过的体积/占位检查不会阻止 PR；分支保护若按文档配置将找不到实际 check；无法证明失败 PR 不能合并。

### P2-1：测试命名和断言造成完成度错觉

典型例子：

- “atomically records” 只断言 audit 最终存在；
- 安全 E2E 对 `/api/v1/backups` 只在未认证时断言 401，认证后该路径其实是 404；
- ADIF 性能测试只测 Node 同步解析速度，不测 UI 是否冻结；
- card E2E 名称声称背景设计，却不校验输出像素；
- production-like 鉴权只改了单个 env 值，没有使用与 deploy 完全一致的有效绑定集。

测试名称应描述真正被证明的性质；涉及原子性、性能、恢复和生产配置时必须注入失败或检查外部状态，不能只看最终 happy path。

### P2-2：运行手册与真实行为不一致

- deploy runbook 说 `/healthz` 返回 `{"status":"healthy"}`，代码返回 `{"status":"ok"}`。
- runbook 说 `/readyz` 验证 D1 与 R2，代码只执行 D1 `SELECT 1`。
- production checklist 要求 `ci / check`，实际是 `ci / verify`。
- 清单写“临时文件 7 天”，生命周期配置只有 daily 30 天和 monthly 365 天，没有临时 prefix 规则。
- README 描述“合并 main 后自动部署”，但没有 remote、外部连接或发布证据。

## 4. Task 1～Task 12 完成度复核

| Task | 结论 | 已完成 | 主要缺口 |
|---|---|---|---|
| 1 API 契约 | 部分完成 | 路径常量、部分 contract test | backup 路径/旧方法仍漂移，常量未成为所有路由唯一来源 |
| 2 公开卡片闭环 | 基本完成 | `/c`、lookup、状态矩阵、150ms、snapshot 查询 | 生产绑定缺失；migration 未回填旧数据；限流盐可退回固定值 |
| 3 背景与 Canvas | 部分完成 | R2 元数据持久化、背景绘制、字体等待 | Preview 吞错、尺寸固定、缺少像素级 E2E |
| 4 模板/卡片生命周期 | 部分完成 | card 状态机/list/void | template PATCH 缺失、card GET 缺失、旧 method alias 未删除 |
| 5 管理端 QSO/台站 | 基本完成 | QSO 筛选/编辑/回收站、台站 list/create | 台站编辑 UI 未闭环，审计不完整 |
| 6 ADIF | 部分完成 | extras 小样本往返、非 ASCII 阻断、complete 调用、导出 | 未用 Web Worker、无增量/进度/取消、导入事务不安全 |
| 7 D1 Workflow | 部分完成 | 官方 polling 请求外形、durable steps | dump 非流式、重复任务错误终止旧账本、查询接口不符 |
| 8 恢复与生命周期 | 未达到验收 | SQL 语法执行、daily/monthly key、规则文件 | 无业务数据核验、无独立库证据、规则未读回、无 hash 回填 |
| 9 鉴权/审计/readiness | 部分完成 | production 值时拒绝测试头、D1 readyz | local bypass 可被错误部署；审计非原子且覆盖严重不足 |
| 10 UI/OpenAPI | 部分完成 | 卡片创建 UI、模板创建与背景、手写类型 | 模板编辑缺失，API client 非真实生成，spec 不完整 |
| 11 E2E/门禁 | 部分完成 | 34 条本地 E2E，核心 happy path | CI 缺三类门禁；若干测试未证明其名称声称的性质 |
| 12 GitHub/Cloudflare | **未完成** | runbook 和预检脚本骨架 | 无 remote/分支保护/Workers Builds/真实部署/恢复/回滚/观察；生产配置不可用 |

## 5. 可直接执行的改进计划

以下顺序按风险依赖排列。后续 Luna Max 不应继续按“原 Task 已完成”增量打补丁，而应把每个阶段当作带失败测试和退出门禁的独立修复任务。任何 P0 未绿不得进入生产资源连接。

### Phase A：先封死生产误部署（P0，最高优先级）

**修改范围**

- `wrangler.jsonc`
- 新建 `wrangler.test.jsonc`
- `package.json`
- `apps/worker/vitest.config.ts`
- `playwright.config.ts`
- `scripts/verify-production-config.mts` 及测试
- `docs/runbooks/deploy.md`、`production-checklist.md`

**执行步骤**

1. 选择并锁定唯一部署模型：推荐顶层为生产、测试使用独立 config。
2. 从生产配置移除 TEST_AUTH binding；测试身份仅存在于 test config。
3. 生产配置完整声明 D1/R2/Rate Limit/Workflow、域名、Access、备份 account/database ID。
4. preflight 对 secret 查询和 dry-run 失败一律 fail-closed，并验证完整 binding 清单。
5. 增加 production-like 鉴权 E2E，覆盖测试 header 和固定 bearer。
6. 运行 production dry-run，保存可审计输出。

**退出门禁**

- production preflight 与 dry-run 都通过；
- 有效配置中无 local/test 值；
- production-like E2E 34 条及新增安全用例全绿。

### Phase B：修复数据原子性与审计（P1）

**修改范围**

- `platform/audit.ts`、`platform/write-unit.ts`
- stations/qsos/imports/templates/cards/backup 的 repository/service/routes
- 对应 Worker integration tests

**执行步骤**

1. 为每类写命令定义最小 audit event schema。
2. 将 D1 业务 statement 与 audit statement 放入同一个 batch。
3. 重写 import chunk 为单提交写单元；服务端计算 checksum。
4. complete 校验 chunk 连续性和总记录数。
5. 加入数据库错误注入测试，分别证明业务失败和 audit 失败都会整体回滚。

**退出门禁**

- 全部写操作 audit 覆盖矩阵 100%；
- 原子失败测试通过；
- chunk 并发重放的 QSO count、结果和 job count 均不变化。

### Phase C：完成 ADIF 真正的大文件边界（P1）

**修改范围**

- `packages/adif-codec/src/parser.ts`
- `apps/web/src/workers/adif.worker.ts`
- `import-controller.ts`、`ImportPage.tsx`
- codec/Web/Playwright tests

**执行步骤**

1. 抽出增量状态机，支持 progress 和 cancel。
2. ImportPage 实例化 Worker，主线程不再直接 parse。
3. 文件文本只读取一次，避免重复峰值内存。
4. UI 提供进度、取消、错误 line/offset。
5. 删除“千万级”表述，改为测试证据支持的边界。

**退出门禁**

- 10,000 条真实浏览器性能测试达标且无长任务冻结；
- cancel、non-ASCII、unknown-field roundtrip 全部 E2E 通过。

### Phase D：完成可恢复备份（P1）

**修改范围**

- backup service/workflow/repository/routes
- `verify-backup.mts`、`configure-r2-lifecycle.mts`
- backup tests 与 runbooks

**执行步骤**

1. signed URL response body 直接流式写 R2，测试 R2 接收的是 stream。
2. 修正 duplicate-running 语义，保证旧实例不被新实例误标失败。
3. 实现规范化 `GET /api/v1/backups`。
4. verifier 在独立目标库执行 dump，输出 tables、QSO count、抽样 hash、dump SHA-256。
5. 将验证 hash/verified_at 写回备份账本。
6. 生命周期 PUT 后 GET 对比；缺凭据或远端失败必须返回非零。

**退出门禁**

- 大于 128 MB 的模拟 stream 不发生整体缓冲；
- 从真实 R2 下载的生产 dump 在独立库恢复并核对数据；
- 生产备份和 lifecycle 证据写入清单。

### Phase E：收敛 API 契约并补齐管理端（P1）

**修改范围**

- domain schema/OpenAPI generator
- API client generator 与 web client
- template/card routes 和页面
- contract/component/E2E tests

**执行步骤**

1. 只保留 `openapi/myQSL-v1.yaml`。
2. 由共享 Zod schema 生成 OpenAPI，再由 OpenAPI 生成类型和 client。
3. 补齐所有真实接口；移除未实现 client 方法和 legacy method alias。
4. 实现 template GET/PATCH、编辑页面加载/乐观锁/保存。
5. Preview 显示错误并使用模板真实尺寸；制卡上传发送内容 hash。
6. E2E 对渲染图片做可重复的像素或摘要断言，证明背景被绘制。

**退出门禁**

- regenerate 后 `git diff --exit-code`；
- 真实路由与 OpenAPI operationId 双向覆盖；
- 模板创建、编辑、背景更新、制卡、发布全链路 E2E 通过。

### Phase F：完善 CI，再执行真实 Task 12（最终上线阶段）

**修改范围**

- `.github/workflows/ci.yml`
- production runbooks/checklist
- GitHub/Cloudflare 外部配置

**执行步骤**

1. CI 加入 bundle、placeholder、API drift 和 production config static checks。
2. 统一 required check 名称，文档和 GitHub 保护规则都使用 `ci / verify`。
3. 添加 GitHub remote，通过 PR 合并，不直接推 main。
4. 配置 Workers Builds 为唯一生产发布者，绑定 main。
5. 故意制造失败 PR，证明分支保护阻断合并。
6. 完成首次部署、smoke、真实 backup/restore、无害版本 rollback。
7. 记录 commit SHA、Worker version、migration、R2 key、恢复 count/hash、回滚结果。
8. 观察 7 天并记录 SLO、D1/R2 容量、错误率和三网可达性。

**最终签字条件**

- 所有 P0/P1 关闭；
- production checklist 每一项都有时间、版本或日志证据，不只是勾选；
- 7 天内无 P1 事件；
- 才能把项目状态改为“可生产使用”。

## 6. 建议新增的测试矩阵

| 类别 | 必须新增的失败场景 |
|---|---|
| Deploy | prod 脚本选错环境、任一 binding 缺失、secret list 空/超时、test auth 出现在有效配置 |
| Auth | production-like 下 test header、固定 bearer、伪造 JWT、错 audience、错 issuer |
| Audit | audit insert 失败、业务 SQL 失败、每种写操作 audit 数量、敏感字段扫描 |
| Import | chunk 写到一半失败、并发相同 idempotency、假 checksum、缺 chunk complete、重复 complete |
| ADIF | 10k 浏览器响应性、取消、进度、截断、非 ASCII、unknown APP_* 完整往返 |
| Card | 背景像素存在、字体失败不上传、hash mismatch、不合法状态、源 QSO/模板修改后快照不变 |
| Backup | polling 耗尽、duplicate running、stream 类型、大 dump、R2 写失败、monthly 写失败、真实恢复 hash |
| Contract | 每条 route 对应 OpenAPI、生成无 diff、legacy route/method 均 404/405 |
| CI | deliberate failing PR、required check 名称、Cloudflare 只接受 main 发布 |

## 7. 最终判断

其他 AI 完成的实现不是“全部错误”：本地核心业务闭环和测试基础明显优于初始版本，公开卡片状态保护、精确索卡、QSO 乐观锁、ADIF 自定义字段小样本往返、响应式页面等工作均可保留。

但它把多项“存在一个函数/脚本/测试”误当成“验收目标已经成立”，尤其在生产环境、原子审计、大文件 Web Worker、可恢复导入、流式备份、生成型 API client 和真实 GitHub/Cloudflare 交付上存在明显的完成度高估。commit 名称 `ops: complete production preflight, disaster recovery drill, and cd pipeline` 与实际证据不符，不应作为上线判断依据。

**明确建议：保留当前分支作为修复基线，先执行 Phase A～E；只有 Phase F 的真实外部证据完成后再发起生产发布。**
