# eQSR 架构评审复核与可执行改进计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development`（推荐）或 `executing-plans`，严格按 Task 1 → Task 12 顺序执行。每个任务都必须先补失败测试、再实现、再运行该任务规定的验证命令；不得跳过验收条件。

**Goal:** 核验 `eQSR_Architecture_Review.md` 的每项结论，修正错误优先级，并给出可由后续 AI 直接执行的发布前改进计划。

**Architecture:** 保持“单个 Cloudflare Worker + Static Assets”的模块化单体，不引入新服务或付费组件。优先打通 QSO → ADIF → 模板/卡片 → 公开查验 → D1/R2 备份的真实纵向闭环，再完成安全、部署和生产验收。

**Tech Stack:** Node.js 24、pnpm 10、TypeScript 5.9、React 19、Vite 7、Hono 4、Zod 4、D1、R2、Cloudflare Workflows、Cloudflare Access、Vitest 4.1、Cloudflare Vitest Plugin 1.1.3、Playwright。

## Global Constraints

- 继续采用单 Worker + Static Assets，同域、同版本发布。
- 首版运行成本目标为 ¥0；不得引入 Durable Objects 或其他付费硬依赖。
- D1 是结构化数据权威源，R2 只保存版本化图片和灾备副本。
- 所有公开卡片只允许读取 `published` 状态；`void` 返回 410，其余状态返回 404。
- ADI 导出遇到非 ASCII 内容必须显式阻断，不得替换、截断或静默丢弃。
- `qsl_design_samples` 位于项目外，不加入本仓库、构建上下文或 Git 历史；系统不得依赖其本地路径。
- 未完成真实独立库恢复、GitHub 分支保护、Workers Builds 自动发布和回滚演练前，不得宣布可生产使用。

---

## 1. 复核范围、方法与证据

### 1.1 评审对象与代码快照

- 原评审：`Review/eQSR_Architecture_Review.md`
- 架构规范：`docs/superpowers/specs/2026-09-03-eqsr-final-architecture-design.md`
- 复核代码：分支 `feat/eqsr-core`，提交 `64ea037`
- 复核日期：2026-09-04
- Git 状态：`Review/` 为用户新放入的未跟踪目录；复核过程未修改业务代码。

### 1.2 判断方法

本次不把原评审中的命令或修改建议当作执行指令，而把每条意见作为待验证假设。判断顺序如下：

1. 对照最终架构规范确认“要求是否真实存在”；
2. 检查路由、服务、仓储、前端调用、测试和部署配置，确认“报告描述是否符合当前代码”；
3. 运行可重复的本地检查，区分“功能缺失”“测试缺失”“生产环境尚未配置”；
4. 对 Cloudflare 配额与 Workflows 能力只采用当前官方文档；
5. 按“发布阻断 P0 / 首版必补 P1 / 工程优化 P2 / 外部上线前置”重新定级。

### 1.3 已执行的验证

| 验证 | 实际结果 | 说明 |
|---|---|---|
| `pnpm run check` | 通过 | lint、依赖边界、全部 workspace typecheck、构建均通过；packages 6 文件/14 测试、web 4 文件/4 测试、Worker 13 文件/16 测试全部通过 |
| `pnpm exec tsc -b --pretty false` | 失败 | `TS5083: Cannot read file 'tsconfig.json'`；这不影响当前以 `pnpm -r typecheck` 为准的质量门禁 |
| `git remote -v` | 无输出 | 当前尚未连接 GitHub，G6 不能视为已完成 |
| `git ls-files \| rg qsl_design_samples` | 无输出 | 素材目录未进入 Git，符合用户要求 |
| 路由与调用引用检查 | 多处契约漂移 | 不止原报告指出的公开索卡路径，还包括模板、卡片图片、备份、作废和 `/readyz` |
| 备份实现静态检查 | 不符合官方轮询协议 | 轮询没有 bookmark、使用 GET、没有可持久等待；恢复脚本吞掉恢复失败 |

本地 Worker 测试过程中 Wrangler 尝试写入沙箱外日志目录并打印 `EPERM`，但测试进程本身成功退出且 16 个 Worker 测试全部通过。这是本地沙箱日志权限噪声，不是 `cloudflare:test-internal` 运行时崩溃。

## 2. 总体判断

原报告“暂不发布生产”的总方向合理，但“4 个 Blocker”的组成不准确：其中“Worker 测试工具链崩溃”已被当前代码和实测结果直接证伪；与此同时，原报告漏掉了 ADIF 数据丢失、背景上传未持久化、备份恢复假阳性、公开限流 key 错误、审计未接入、卡片作废接口缺失等问题。

对原报告 16 组主要结论的复核结果为：

- **合理：8 项**——公开查验闭环、Canvas 背景、管理端空壳、QSO 筛选、鉴权测试绕过风险、固定最小延迟、E2E 过浅、生产变量预检。
- **部分合理：6 项**——G1～G6 覆盖矩阵、单 Worker/计算下沉亮点、备份轮询、根 tsconfig、配额核算、可迁移性。
- **不合理或已过时：2 项**——Workflows 免费层兼容性判断及增加第二套 Cron 的建议、Worker 测试套件崩溃。

修正后的发布阻断域不是 4 个单点，而是 5 条纵向能力：

1. ADIF 语义保真与实际导入/导出闭环；
2. 模板背景、卡片生成、发布和公开查验闭环；
3. D1 Export → R2 → 独立恢复的可信灾备闭环；
4. 生产鉴权、环境隔离和公开接口防枚举；
5. GitHub/Cloudflare 真正联动及覆盖真实业务的发布门禁。

## 3. 逐条复核原评审结论

### 3.1 G1～G6 覆盖矩阵

**判断：部分合理，但整体偏乐观，且对 G6 的归因错误。**

| 能力 | 原报告 | 复核结论 | 代码依据 |
|---|---|---|---|
| G1 QSO 管理 | 后端 CRUD 完备、前端骨架 | 基本合理，但前端只实现新建和首次列表加载；筛选、编辑入口、删除/恢复、台站设置均未形成闭环 | `QsoListPage.tsx`、`QsoFilters.tsx`、`TrashPage.tsx`、`StationSettings.tsx` |
| G2 ADIF | 基本覆盖，仅缺非 ASCII 阻断 | 不合理地偏乐观 | `import-controller.ts:22` 放行 `NON_ASCII_ADI`；`:15` 把 `adif_extra` 强制清空；没有调用 complete；实际控制器未使用已有 Web Worker；导出未接 UI且没有正确展开 `adif_extra` |
| G3 QSL 卡片 | 后端快照完备、渲染漏底图 | 仅数据表和局部状态流转存在，离“完备”尚远 | 背景上传不写回模板行；缺卡片列表/作废接口；`public_url` 返回 `/cards/*` 而规范是 `/c/*`；前端生成页为空壳 |
| G4 公开查验 | 严重缺失 | 合理 | `/c/:publicId` 未注册，页面无数据加载，索卡无表单，API 路径漂移 |
| G5 备份恢复 | 严重阻塞 | 合理，但漏掉更多阻断 | 轮询协议错误；Workflow 重试被“返回失败行”短路；恢复脚本吞异常；无 monthly 副本与实际 lifecycle 配置 |
| G6 自动交付 | 测试崩溃导致阻塞 | 结论不成立，真正缺口是外部交付尚未配置 | 当前 `pnpm run check` 通过；但无 Git remote，无法证明分支保护、Workers Builds、生产迁移、部署与回滚 |

### 3.2 1.1 公开查验与索卡前端闭环

**判断：合理，P0；但原建议不足以真正修复。**

原报告正确指出：

- `router.tsx` 没有 `/c/:publicId`；
- `CardLookupPage.tsx` 只有静态文案；
- Worker 使用 `/api/v1/public/lookup`，与规范 `/api/v1/public/card-lookup` 不一致。

还需同时处理以下遗漏：

- `PublicCardPage.tsx` 只能接收外部 `card` prop，没有根据 URL 参数请求公开 API；
- `CardService.createDraft()` 返回 `/cards/{public_id}`，路径同样错误；
- 图片接口只排除了 `draft`，会把 `ready` 卡片图片暴露给持有 token 的请求；规范要求只有 `published` 可公开；
- Rate Limit 中间件从 query string 读取 `call`，但实际索卡参数在 JSON body 中，所以所有请求都以空呼号参与 key 计算；
- 公开 POST 返回 `Cache-Control: public` 不合适，应为 `no-store`；
- 命中/未命中没有统一最小响应时间。

因此不能只“注册路由 + 加表单”，必须把路由、数据加载、状态语义、限流 key 和缓存策略作为一个纵向任务完成。

### 3.3 1.2 Canvas 渲染背景图

**判断：合理，P0；原报告只看到了渲染端的一半问题。**

`render.ts` 确实没有 `clearRect()`，也没有背景图加载和 `drawImage()`；`CanvasPreview.tsx` 也没有等待 `document.fonts.ready`。原建议方向正确。

但仅在 `renderCard()` 中读取 `template.background_r2_key` 不可直接落地，因为当前传入 renderer 的 `CardTemplateSchema` 只包含 layout，背景 key 位于模板数据库行和卡片快照外层。更重要的是，`TemplateService.uploadBackground()` 只把对象写入 R2并返回 key，完全没有更新 `card_templates.background_r2_key/background_sha256`。正确方案是：

1. 上传成功后原子更新模板背景元数据并递增版本；
2. 提供 Owner-only 背景读取 URL；
3. renderer 接收明确的 `{ layout, backgroundUrl }` 组合输入；
4. 先清理画布、加载并解码背景、再画文字和二维码；
5. 字体或背景失败时阻止导出，不静默生成缺层卡片。

### 3.4 1.3 管理端页面为空壳

**判断：合理，P0/P1。**

原报告点名的 `CardListPage`、`CardCreatePage`、`TrashPage`、`TemplateListPage`、`TemplateEditorPage` 均是静态文案。除此之外，`StationSettings` 也是空壳，`QsoFilters` 未接入 `QsoListPage`，导出控制器没有任何页面入口。

原报告称“后端卡片生成、回收站、模板管理 CRUD 完整”并不准确：

- 卡片缺 GET 列表和 void 路由；
- 模板缺 PATCH，背景上传方法与规范不一致且不持久化元数据；
- API client 目前只封装 QSO list/create/patch 和 import create/chunk。

因此前端接入前必须先补齐并冻结后端契约，否则会继续产生页面与接口的双向漂移。

### 3.5 1.4 QSO 列表过滤与分页上限

**判断：合理，P1。**

`listSchema` 仅支持 `call/include_deleted/cursor/limit`，`limit` 最大 50；规范要求全局最大 200，并要求 band、mode、日期范围筛选。仓储层同样只处理 call 和 cursor。修复时应保留默认 50，把最大值改为 200，并在 schema、service、repository、API client、UI 和集成测试中一次对齐。

30,000 条规模不需要过度索引。现有 `idx_qsos_time` 和 `idx_qsos_call_date` 可继续使用；只有通过 `EXPLAIN QUERY PLAN` 证实 band/mode 组合扫描成为瓶颈时，才增加组合索引。

### 3.6 2.1 单 Worker + Assets 与计算下沉

**判断：架构选择合理，但对当前落地状态描述不准确。**

单部署单元、同域和浏览器侧计算的方向符合约束，卡片表也确实保存了 QSO 与模板快照。不过：

- `adif.worker.ts` 虽存在，`runImport()` 仍在 UI 主线程直接调用 `parseAdif()`；“已下沉到 Web Worker”不成立；
- 卡片快照能保护已发布卡片内容，但公开索卡 SQL 仍 JOIN 当前 `qsos` 表；原 QSO 修改后，历史卡片可能无法按签发时呼号/日期被找到；
- `AuditWriter` 没有被任何业务模块调用，规范所述“QSO + audit 同批写入”并未实现。

因此该项应表述为“目标架构正确、骨架已建立、关键不变式尚未贯穿端到端”。

### 3.7 2.2 Workflows 免费层兼容性与 Cron 保底

**判断：主要结论不合理，建议会引入重复备份。**

截至 2026-09-04，Cloudflare 官方明确说明 Workflows 同时支持 Free 与 Paid；Free 包含每日 3,000 steps、1 GB 状态存储，并与 Workers 共享 100,000 次/日请求额度。官方也已支持直接在 Workflow binding 中配置 `schedules`，当前 `wrangler.jsonc` 的写法与官方 D1 备份示例一致。项目还固定了 Wrangler 4.128.0，不存在报告所说的“未锁定新版本”问题。

参考：

- [Cloudflare Workflows Pricing](https://developers.cloudflare.com/workflows/reference/pricing/)
- [Cloudflare D1 Backup Workflow Example](https://developers.cloudflare.com/workflows/examples/backup-d1/)
- [Workflow binding schedules](https://developers.cloudflare.com/changelog/post/2026-06-02-cron-workflows/)

当前也已经保留 `POST /api/v1/backups/run`。再增加传统 `triggers.crons` 和 scheduled handler 会形成第二个调度源，增加同一时刻重复运行和互相冲突的概率。正确动作是保留单一 Workflow schedule，修复其内部 step/retry/poll 协议，并在目标账户做一次真实激活验证。

### 3.8 3.1 Worker 测试工具链崩溃

**判断：已过时/不成立，不应列为 Blocker。**

当前锁定组合为 `@cloudflare/vitest-plugin 1.1.3`、Vitest 4.1.0、Wrangler 4.128.0、`@cloudflare/workers-types 5.20260903.1`，依赖树中的 Miniflare 版本一致。实际运行结果是 Worker 13 个测试文件、16 个测试全部通过，没有出现 `No such module "cloudflare:test-internal"`。

因此不应为了一个无法复现的旧错误盲目升级/降级，也不应引入 `better-sqlite3` 或 `sql.js` 复制一套与 D1 行为不同的测试环境。合理的质量动作是继续冻结 lockfile，在 CI 中执行 Worker integration tests；纯领域规则保留在不依赖 workerd 的 packages tests 中。

### 3.9 3.2 D1 备份轮询紧密循环

**判断：核心问题合理且为 P0，但“加 setTimeout”不是完整修复。**

当前 `poll()` 连续最多请求 5 次，没有等待，确实极易在导出完成前耗尽尝试。然而更严重的是：

- D1 官方 polling 模式需要初始 POST 返回 `at_bookmark`，后续继续 POST `{ current_bookmark }`；当前代码后续使用 GET，且没有传 bookmark；
- 整个 `BackupService.run()` 被包在一个 Workflow step 中，服务返回 failed row 而不是抛错，Workflow 会把它视为成功，配置的 step retry 不会启动；
- 直接在单个 step 内用普通 `setTimeout` 仍缺少可持久重试边界。应把 start、poll、download、R2 put、complete 拆为独立 `step.do`，未就绪时抛错让 Workflow 按延迟和指数退避重试，或使用 `step.sleep`；
- `scripts/verify-backup.mts` 捕获 `wrangler d1 execute` 的失败后继续输出 `RESTORE_VERIFIED`，会产生灾备验证假阳性；
- monthly 副本、daily/monthly lifecycle 和最新完成记录查询均未落地。

结论是“备份闭环不可用”合理，但修复范围必须覆盖官方协议、durable step、恢复验证和保留策略，而不是只加睡眠。

### 3.10 3.3 根目录缺少 tsconfig.json

**判断：事实正确，严重度偏高，建议不宜机械执行。**

`tsc -b` 确实报 TS5083；但本项目的权威类型检查是 `pnpm -r typecheck`，当前 5 个 workspace 均通过，IDE 也可以读取各子项目 tsconfig。把它列为“中风险”会掩盖真实业务缺口。

若后续确实需要 project references，应先为每个子项目设计 `composite/outDir/declaration`，不能只加一个带 references 的根文件，否则可能得到“引用项目禁止 noEmit”或在源码目录产生构建产物。该项降为 P2 工程体验优化，不进入首版发布阻断路径。

### 3.11 4.1 免费配额与容量核算

**判断：官方上限基本正确，业务占用和“100% 达标”未经实测。**

截至复核日，Workers Free 的 100,000 请求/日、10 ms CPU、128 MB，D1 Free 的单库 500 MB/账户 5 GB/每日 500 万 rows read/10 万 rows written，以及 R2 Standard 的 10 GB-month 免费额度均与官方资料一致：

- [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/)

但报告中的 `<500 次/日`、API `<3ms`、D1 60～120 MB、R2 2～3 GB 都是估算，不是当前仓库或生产指标。D1 rows written 还会包含索引更新，不能简单按业务记录数计算。R2 生命周期目前只有 runbook 文案，没有实际 bucket lifecycle 证据。因此只能判断“按当前规模有较大概率落在免费层”，不能判断“已经完全达标”。上线后必须采集 7～14 天真实指标并设置 60/70/80% 阈值。

### 3.12 4.2 本地鉴权绕过

**判断：合理，P0 安全前置。**

`APP_ENV === "local"` 时接受任意 `X-EQSR-Test-Actor` 或固定 Bearer token，功能上方便本地测试，但根 `wrangler.jsonc` 当前恰好把 `APP_ENV` 配为 local。若直接部署此配置，就会把本地绕过一并带到线上。

正确方案不是把 local 改名为 test 就结束，而是：

- 生产配置显式写 `APP_ENV=production`；
- test-only binding 只在 Vitest/本地配置注入，生产配置中不存在；
- 部署预检拒绝 local/test、HTTP origin、占位 D1 UUID 和占位 Access audience；
- 增加测试证明即使携带本地 header，只要不是 test binding 就返回 401。

### 3.13 4.2 公开索卡固定最小延迟

**判断：合理，P1；原报告还漏掉限流 key 和响应边界。**

代码没有固定最小延迟，确实不符合规范。应在解析完整呼号和日期后开始计时，查询完成后补足固定预算（建议首版 150 ms，并允许通过环境变量在 staging 调整），命中和未命中使用同一 200 envelope。与此同时把 key 改为 `route | daily-salted-ip-hash | normalized-call-hash`，并确保 lookup POST `Cache-Control: no-store`。

### 3.14 4.3 数据主权、ADIF 无损与可离场性

**判断：方向合理，当前落地结论不成立。**

数据库确有 `adif_extra_json`，codec 单测也证明未知字段在“直接 parse → serialize”时可往返；但真实导入控制器把 `adif_extra` 清空，真实导出控制器又会把整个 `adif_extra` 对象转成一个字符串字段，而不是把其中标签合并回 ADIF record。因此当前产品链路并不无损。

同样，D1 的 SQL 方言接近 SQLite、Hono 使用 Web API，有利于迁移；但 repositories 大量直接依赖 `D1Database.prepare()`，Drizzle adapter 基本未被业务调用。“只切换驱动即可无缝平移”不成立。更准确的判断是：迁移成本低于深度绑定专有查询的系统，但仍需要实现新的 repository adapter、R2 对象存储 adapter、鉴权 adapter 和部署配置。

### 3.15 5.1 E2E 测试覆盖过浅

**判断：合理，P0 发布门禁。**

现有 4 个 Playwright 用例仅检查三个标题和 `/healthz` 状态，不能验证录入、导入、卡片生成、公开查验、并发冲突、作废或备份。原报告建议的两条纵向链路正确，但还应增加 ADIF 未知字段往返和生产安全 header 拒绝用例。

本地 macOS 沙箱不能稳定启动系统 Chrome，不应因此降低测试目标。CI 已在 Ubuntu 安装 Playwright Chromium；关键是让 E2E 使用确定性种子/测试 API并验证真实状态，而不是只验证页面存在。

### 3.16 5.2 生产环境变量预检

**判断：合理，但应归类为“上线前置”，不是现有业务代码故障。**

占位 D1 UUID 是尚未创建生产资源的明确标志，仓库也没有 Git remote。此时发布应被拒绝。需要增加可在 Workers Builds 执行的非敏感配置检查，并用 Cloudflare dashboard/secret binding 检查敏感项。预检不能打印 token，只报告变量名和是否存在。

## 4. 原评审遗漏的关键问题

| 编号 | 新发现 | 级别 | 判断依据 |
|---|---|---:|---|
| O1 | ADIF 导入清空未知字段，导出不能正确展开 extras | P0 | `import-controller.ts:15`、`export-controller.ts:10` |
| O2 | Import UI 不调用 `/complete`，已有 Web Worker 未被使用 | P1 | `runImport()` 只 create/chunks；无 worker 引用 |
| O3 | 模板背景上传不更新数据库 | P0 | `uploadBackground()` 无 repository 更新；仓储无 background update |
| O4 | 卡片缺 list/void，公开 URL 路径错误 | P0 | `cards/routes.ts` 仅 create/image/publish；service 返回 `/cards/*` |
| O5 | 公开图片允许 `ready` 状态访问 | P0 | public image route 只排除 `draft` |
| O6 | 限流从 query 读取 call，但接口使用 JSON body | P1 | `rate-limit.ts:12` vs `public/routes.ts:14` |
| O7 | 公开索卡依赖当前 QSO，不依赖签发快照 | P1 | `CardRepository.lookup()` JOIN `qsos` |
| O8 | 恢复脚本吞掉恢复失败仍输出成功 | P0 | `verify-backup.mts` 的空 catch |
| O9 | 审计表和 AuditWriter 存在但无业务调用 | P1 | 全仓库无 `new AuditWriter` |
| O10 | `/readyz` 只在配置/文档出现，Worker 没有路由 | P1 | `index.ts` 仅实现 `/healthz` |
| O11 | OpenAPI 与生成型 client 未落地 | P1 | 仓库无 OpenAPI 文件或生成脚本，client 为手写局部封装 |
| O12 | GitHub/Cloudflare 联动尚未发生 | 外部 P0 | 无 Git remote；生产清单全未勾选 |

## 5. 修正后的优先级与发布判定

### P0：发布前必须完成

1. 修复 ADIF 非 ASCII 阻断、未知字段保留、导入完成与导出入口；
2. 修复模板背景持久化和 Canvas 合成，补齐卡片 list/publish/void；
3. 实现 `/c/:publicId` 与 `/lookup` 真实页面，统一公开 API，阻止 ready 图片访问；
4. 按 Cloudflare 官方 polling 协议重写备份 Workflow，恢复脚本失败即失败；
5. 隔离测试鉴权，加入生产配置预检；
6. 用真实 E2E 覆盖 QSO、ADIF、卡片公开链路；
7. 创建 GitHub remote、启用分支保护、连接 Workers Builds，并完成一次真实恢复与回滚。

### P1：首版完成标准

1. 补齐 QSO 筛选、编辑、回收站、台站、模板和卡片管理 UI；
2. 接入审计、`/readyz`、OpenAPI 3.1 与生成型 API client；
3. 完成公开接口固定延迟、正确限流 key 和安全缓存策略；
4. 配置 R2 daily/monthly 生命周期和容量告警；
5. 采集首周性能、D1 rows read/write、R2 占用和错误率。

### P2：不阻断首版的工程优化

1. 评估 TypeScript project references；只有需要统一 `tsc -b` 或增量构建时再引入；
2. 根据真实查询计划决定是否增加 band/mode 组合索引；
3. 在有生产指标后决定是否需要更细的 repository portability adapter。

## 6. Task 1 → Task 12 可执行改进计划

### Task 1: 冻结 API 契约与路径常量

**Files:**

- Create: `packages/domain/src/api-paths.ts`
- Create: `packages/domain/test/api-paths.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `apps/worker/test/contracts/api-contract.test.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/src/modules/public/routes.ts`
- Modify: `apps/worker/src/modules/templates/routes.ts`
- Modify: `apps/worker/src/modules/cards/routes.ts`
- Modify: `apps/worker/src/modules/cards/service.ts`
- Modify: `apps/worker/src/modules/backup/routes.ts`
- Modify: `apps/worker/test/modules/public.test.ts`
- Modify: `apps/worker/test/modules/templates.test.ts`
- Modify: `apps/worker/test/modules/cards.test.ts`
- Modify: `docs/runbooks/access-paths.md`

**Interfaces:**

- Produces: `API_PATHS`, `publicCardPath(publicId)`, `cardImagePath(cardId)`。
- Canonical paths: `/api/v1/card-templates`、`/api/v1/cards`、`/api/v1/public/card-lookup`、`/api/v1/backups`、`/c/:publicId`。

- [ ] **Step 1: 写路径单测并确认失败**

```ts
expect(API_PATHS.publicLookup).toBe("/api/v1/public/card-lookup");
expect(publicCardPath("abc")).toBe("/c/abc");
expect(cardImagePath("card-1")).toBe("/api/v1/cards/card-1/image");
```

Run: `pnpm vitest run --config vitest.config.ts --project packages packages/domain/test/api-paths.test.ts`
Expected: FAIL，因为 `api-paths.ts` 尚不存在。

- [ ] **Step 2: 添加唯一契约源**

```ts
export const API_PATHS = {
  qsos: "/api/v1/qsos",
  templates: "/api/v1/card-templates",
  cards: "/api/v1/cards",
  publicLookup: "/api/v1/public/card-lookup",
  backups: "/api/v1/backups"
} as const;
export const publicCardPath = (id: string) => `/c/${encodeURIComponent(id)}`;
export const cardImagePath = (id: string) => `${API_PATHS.cards}/${encodeURIComponent(id)}/image`;
```

- [ ] **Step 3: 添加契约测试，证明旧漂移路径不再作为正式接口**

对 `/api/v1/public/lookup`、`/api/v1/templates` 发请求应为 404；canonical public path 能进入校验并对非法 body 返回 422。Owner canonical path 未认证时应返回 401，而不是 404。

- [ ] **Step 4: 一次性迁移现有路由到 canonical path**

把模板前缀改为 `/api/v1/card-templates`、公开 lookup 改为 `/api/v1/public/card-lookup`、卡片图片上传改为 PUT、备份查询改为 `GET /api/v1/backups`，并把 draft 返回的公开 URL 改为 `/c/{public_id}`。同步更新现有 Worker 测试和 Access runbook；当前没有生产消费者，不保留旧别名。

- [ ] **Step 5: 运行包和 Worker 测试**

Run: `pnpm test`
Expected: 新旧测试全部通过。

- [ ] **Step 6: 提交**

```bash
git add packages/domain apps/worker/src apps/worker/test docs/runbooks/access-paths.md
git commit -m "refactor: freeze canonical api paths"
```

### Task 2: 打通公开卡片与精确索卡纵向闭环

**Files:**

- Modify: `apps/worker/src/modules/public/routes.ts`
- Modify: `apps/worker/src/modules/public/service.ts`
- Modify: `apps/worker/src/modules/cards/repository.ts`
- Modify: `apps/worker/src/modules/cards/service.ts`
- Modify: `apps/worker/src/platform/schema.ts`
- Modify: `apps/worker/src/platform/rate-limit.ts`
- Modify: `apps/worker/src/env.ts`
- Modify: `apps/worker/vitest.config.ts`
- Modify: `apps/worker/test/modules/public.test.ts`
- Modify: `apps/worker/test/modules/cards.test.ts`
- Create: `infra/migrations/0002_card_lookup_snapshot.sql`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/features/public/PublicCardPage.tsx`
- Modify: `apps/web/src/features/public/CardLookupPage.tsx`
- Create: `apps/web/src/features/public/public-api.ts`
- Create: `apps/web/src/features/public/CardLookupPage.test.tsx`

**Interfaces:**

- `POST /api/v1/public/card-lookup` body: `{ call: string; qso_date: YYYYMMDD }`。
- Success envelope for hit/miss: `{ data: PublicCardSummary[] }`，status 200，`Cache-Control: no-store`。
- `GET /api/v1/public/cards/:publicId` 仅 published 为 200，void 为 410，其余 404。
- `GET /api/v1/public/cards/:publicId/image` 使用相同状态规则。
- `qsl_cards.lookup_call/lookup_qso_date` 来自创建卡片时的 QSO 快照；索卡不得 JOIN 当前 QSO。

- [ ] **Step 1: 写失败测试**

覆盖 canonical lookup、旧路径 404、ready image 404、void 410、命中/未命中同 envelope、限流 key 含 normalized call。React 测试覆盖表单提交和 `/c/:publicId` 加载态/404/410。

- [ ] **Step 2: 把限流改为显式接收已解析呼号**

```ts
export async function enforceLookupLimit(c: Context<{ Bindings: Env }>, call: string): Promise<Response | null> {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const route = "/api/v1/public/card-lookup";
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = await digest(`${c.env.RATE_LIMIT_SALT}|${day}|${ip}`);
  const callHash = await digest(`${c.env.RATE_LIMIT_SALT}|${call.trim().toUpperCase()}`);
  const key = await digest(`${route}|${ipHash}|${callHash}`);
  return (await c.env.PUBLIC_RATE_LIMITER.limit({ key })).success
    ? null
    : problem(429, Problems.rateLimited, "Too many requests", "Public lookup rate limit exceeded", c.req.path);
}
```

- [ ] **Step 3: 统一状态、缓存和最小延迟**

在 route 中先 parse body，再限流；记录 `performance.now()`，查询结束后补足 150 ms。lookup 永远 `no-store`。图片和元数据只允许 `published`；void 返回 410。

新增 migration，为 `qsl_cards` 增加并回填 `lookup_call`、`lookup_qso_date`，建立仅覆盖 published 状态的组合索引。`createDraft()` 从 QSO 快照写入两列；`lookup()` 只查询卡片快照列，禁止继续 JOIN 可变的 `qsos`。Vitest 注入固定 `RATE_LIMIT_SALT`，生产值在 Task 12 以 secret 配置。

- [ ] **Step 4: 实现两个公开页面**

`PublicCardPage` 从 `useParams()` 获取 publicId 并调用公开 API；`CardLookupPage` 提供完整呼号、UTC 日期、提交/错误/空结果/卡片链接状态。不得要求 Cloudflare Access。

- [ ] **Step 5: 验证**

Run: `pnpm vitest run --config apps/web/vitest.config.ts && pnpm vitest run --config apps/worker/vitest.config.ts apps/worker/test/modules/public.test.ts`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add apps/worker/src/modules/public apps/worker/src/modules/cards apps/worker/src/platform apps/worker/src/env.ts apps/worker/vitest.config.ts apps/worker/test/modules/public.test.ts apps/worker/test/modules/cards.test.ts infra/migrations apps/web/src/app/router.tsx apps/web/src/features/public
git commit -m "feat: complete public card verification flow"
```

### Task 3: 修复模板背景持久化与确定性 Canvas 渲染

**Files:**

- Modify: `apps/worker/src/modules/templates/repository.ts`
- Modify: `apps/worker/src/modules/templates/service.ts`
- Modify: `apps/worker/src/modules/templates/routes.ts`
- Modify: `apps/worker/test/modules/templates.test.ts`
- Modify: `packages/card-renderer/src/render.ts`
- Modify: `packages/card-renderer/src/index.ts`
- Modify: `packages/card-renderer/test/render.test.ts`
- Modify: `apps/web/src/features/templates/CanvasPreview.tsx`

**Interfaces:**

- `TemplateRepository.setBackground(id, key, sha256, now): Promise<TemplateRow | null>`。
- `RenderInput = { layout: CardTemplate; backgroundUrl?: string | null }`。
- `renderCard(canvas, input, qso, publicUrl): Promise<void>` 在所有图片和字体完成后 resolve。

- [ ] **Step 1: 写失败测试**

模板上传测试必须重新 GET 模板并断言 background key/hash 已保存、version +1。Renderer fake canvas 必须断言调用顺序为 `clearRect → drawImage(background) → fillText/drawImage(qr)`；背景加载失败时 reject。

- [ ] **Step 2: 原子保存背景元数据**

```ts
async setBackground(id: number, key: string, sha256: string, now: number) {
  const result = await this.db.prepare(
    "UPDATE card_templates SET background_r2_key = ?, background_sha256 = ?, version = version + 1, updated_at = ? WHERE id = ?"
  ).bind(key, sha256, now, id).run();
  return result.meta.changes ? this.get(id) : null;
}
```

- [ ] **Step 3: 明确 renderer 输入并保证绘制顺序**

先设置 canvas 尺寸，再 `clearRect`；若有 backgroundUrl，使用 `Image.decode()` 或 onload promise，按完整画布尺寸绘制；之后渲染文字与二维码。禁止 catch 后静默吞掉渲染错误。

- [ ] **Step 4: 等待字体**

`CanvasPreview` 在调用 renderer 前执行 `await document.fonts.ready`，用取消标记避免卸载后更新状态，并显示明确错误。

- [ ] **Step 5: 验证与提交**

Run: `pnpm vitest run --config vitest.config.ts --project packages packages/card-renderer/test/render.test.ts && pnpm vitest run --config apps/worker/vitest.config.ts apps/worker/test/modules/templates.test.ts`
Expected: 全部通过。

```bash
git add apps/worker/src/modules/templates apps/worker/test/modules/templates.test.ts packages/card-renderer apps/web/src/features/templates/CanvasPreview.tsx
git commit -m "fix: persist and render template backgrounds"
```

### Task 4: 补齐模板与卡片后端生命周期

**Files:**

- Modify: `apps/worker/src/modules/templates/routes.ts`
- Modify: `apps/worker/src/modules/templates/service.ts`
- Modify: `apps/worker/src/modules/cards/routes.ts`
- Modify: `apps/worker/src/modules/cards/service.ts`
- Modify: `apps/worker/src/modules/cards/repository.ts`
- Modify: `apps/worker/test/modules/templates.test.ts`
- Modify: `apps/worker/test/modules/cards.test.ts`

**Interfaces:**

- Templates: GET/POST `/api/v1/card-templates`、PATCH `/api/v1/card-templates/:id`、PUT/GET background。
- Cards: GET/POST `/api/v1/cards`、PUT image、POST publish、POST void。
- `CardService.void(cardId): Promise<CardRow>`；重复 publish/void 具备明确幂等语义。

- [ ] **Step 1: 先写完整状态机测试**

覆盖 `draft → ready → published → void`，非法跳转 409，同一 hash 重放幂等，公开 URL 必须为 `/c/{public_id}`，卡片列表按 created_at/id 游标分页。

- [ ] **Step 2: 补齐 repository/service 方法**

所有状态更新 SQL 必须带当前状态条件；更新失败后读取当前行，只在已达到同一目标状态时视为幂等，否则抛 `CardStateError`。

- [ ] **Step 3: 对齐方法和路由**

将图片上传改为 PUT；增加 void、list、模板 PATCH 和背景 GET。因为尚未生产上线，不保留旧漂移路径，避免永久维护双契约。

- [ ] **Step 4: 验证与提交**

Run: `pnpm vitest run --config apps/worker/vitest.config.ts apps/worker/test/modules/cards.test.ts apps/worker/test/modules/templates.test.ts`
Expected: 全部通过。

```bash
git add apps/worker/src/modules/cards apps/worker/src/modules/templates apps/worker/test/modules/cards.test.ts apps/worker/test/modules/templates.test.ts
git commit -m "feat: complete card and template lifecycle"
```

### Task 5: 完成管理端 QSO、台站、回收站和筛选

**Files:**

- Modify: `apps/worker/src/modules/qsos/routes.ts`
- Modify: `apps/worker/src/modules/qsos/service.ts`
- Modify: `apps/worker/src/modules/qsos/repository.ts`
- Modify: `apps/worker/src/modules/qsos/mapper.ts`
- Modify: `apps/worker/test/modules/qsos.test.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/features/qsos/QsoListPage.tsx`
- Modify: `apps/web/src/features/qsos/QsoFilters.tsx`
- Modify: `apps/web/src/features/qsos/TrashPage.tsx`
- Modify: `apps/web/src/features/stations/StationSettings.tsx`
- Create: `apps/web/src/features/qsos/QsoListPage.test.tsx`

**Interfaces:**

- `QsoListFilter = { call?, band?, mode?, date_from?, date_to?, include_deleted?, cursor?, limit? }`。
- 默认 limit 50，允许范围 1～200。
- date_from/date_to 使用 `YYYYMMDD` 且 from ≤ to。
- 列表 response 包含 `deleted_at: number | null`，回收站据此过滤；该字段不是公开卡片字段。

- [ ] **Step 1: 写 Worker 失败测试**

建立跨 band/mode/date 的数据，证明组合过滤、游标稳定、最大 200、201/ETag、412、delete/restore 均符合契约。

- [ ] **Step 2: 扩展 schema 到 repository**

只使用参数化 SQL；日期边界使用 `qso_date >= ?`/`<= ?`。默认不含 deleted，回收站显式 `include_deleted=true` 后在 UI 仅显示 `deleted_at != null` 记录。

- [ ] **Step 3: 完成 UI**

筛选条件同步 URLSearchParams；QSO 保存后刷新当前页；详情编辑使用最新 ETag；删除进入回收站；恢复成功后从回收站移除。台站页支持 list/create/set-default。

- [ ] **Step 4: 查询计划检查**

Run: `pnpm exec wrangler d1 execute DB --local --command "EXPLAIN QUERY PLAN SELECT * FROM qsos WHERE deleted_at IS NULL AND band='40M' AND mode='SSB' ORDER BY qso_at DESC,id DESC LIMIT 50"`
Expected: 记录实际 plan；只有出现无法接受的全表扫描且基准超标，才新增 migration 索引。

- [ ] **Step 5: 验证与提交**

Run: `pnpm vitest run --config apps/worker/vitest.config.ts apps/worker/test/modules/qsos.test.ts && pnpm vitest run --config apps/web/vitest.config.ts`
Expected: 全部通过。

```bash
git add apps/worker/src/modules/qsos apps/worker/test/modules/qsos.test.ts apps/web/src/lib/api-client.ts apps/web/src/features/qsos apps/web/src/features/stations
git commit -m "feat: complete owner qso management"
```

### Task 6: 修复 ADIF 端到端语义保真与 Web Worker 接入

**Files:**

- Create: `apps/web/src/features/imports/adif-mapper.ts`
- Create: `apps/web/src/features/imports/adif-mapper.test.ts`
- Modify: `apps/web/src/features/imports/import-controller.ts`
- Modify: `apps/web/src/features/imports/ImportPage.tsx`
- Modify: `apps/web/src/features/exports/export-controller.ts`
- Create: `apps/web/src/features/exports/ExportButton.tsx`
- Modify: `apps/web/src/workers/adif.worker.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `packages/adif-codec/src/parser.ts`
- Modify: `packages/adif-codec/src/index.ts`
- Modify: `packages/adif-codec/test/codec.test.ts`

**Interfaces:**

- `recordToQso(record: AdifRecord): QsoInput` 将已知字段映射为核心字段，其余字段原名大写写入 `adif_extra`。
- `qsoToAdif(row): AdifRecord` 先写核心字段，再合并 extras；extras 不得覆盖核心字段。
- `runImport()` 在最后一个 chunk 成功后调用 `completeJob(jobId)`。
- `parseAdifIncremental(source, hooks): Promise<AdifParseResult>` 每 500 个标签让出事件循环，并调用 `onProgress(processed,total)`；`isCancelled()` 为 true 时抛出 `ADIF_PARSE_CANCELLED`。

- [ ] **Step 1: 写 unknown-field 和 non-ASCII 失败测试**

```ts
const qso = recordToQso({ fields: { CALL: "BG4YYY", QSO_DATE: "20260903", TIME_ON: "143000", BAND: "40M", MODE: "SSB", IOTA: "AS-136" }, types: {} });
expect(qso.adif_extra).toEqual({ IOTA: "AS-136" });
expect(() => serializeAdif(
  [{ fields: { NAME: "操作员" }, types: {} }],
  { programId: "eQSR", adifVersion: "3.1.7" }
)).toThrow(/NON_ASCII_ADI/);
```

再做 parse → import mapping → mock D1 response → export mapping → serialize → parse，断言 IOTA/APP_* 值仍存在。

- [ ] **Step 2: 修复 mapping**

定义固定 `CORE_ADIF_FIELDS` set。导入时仅从 extras 移除真正被映射的字段；导出时把 `adif_extra` 对象逐项合并，不生成名为 `ADIF_EXTRA` 的伪字段。

- [ ] **Step 3: 真正使用 Web Worker**

把现有状态机抽为可复用迭代器：同步 `parseAdif()` 继续供小输入和既有测试使用；新增 `parseAdifIncremental()` 每 500 个标签 `await new Promise(requestAnimationFrame)`（worker 中用 `setTimeout(resolve, 0)`），从而让 cancel message 可被处理并增量发送进度。`ImportPage` 通过 worker message 解析；主线程不再直接调用 `parseAdif()`。只要存在 `NON_ASCII_ADI` 或其他语法错误就阻止上传，并显示 line/offset。

- [ ] **Step 4: 完成 job 与导出入口**

API client 增加 `completeJob`；所有 chunk 成功后调用。QSO 页面加入 ExportButton，按 cursor 每页请求 `limit=200`，预检通过后生成 `.adi` Blob 下载。

- [ ] **Step 5: 验证与提交**

Run: `pnpm vitest run --config vitest.config.ts --project packages packages/adif-codec/test/codec.test.ts && pnpm vitest run --config apps/web/vitest.config.ts`
Expected: 未知字段往返、非 ASCII 阻断、complete 调用、40 条分块均通过。

```bash
git add apps/web/src/features/imports apps/web/src/features/exports apps/web/src/workers/adif.worker.ts apps/web/src/lib/api-client.ts packages/adif-codec/test
git commit -m "fix: preserve adif semantics end to end"
```

### Task 7: 按官方协议重构 D1 备份 Workflow

**Files:**

- Modify: `apps/worker/src/modules/backup/workflow.ts`
- Modify: `apps/worker/src/modules/backup/service.ts`
- Modify: `apps/worker/src/modules/backup/repository.ts`
- Modify: `apps/worker/src/modules/backup/routes.ts`
- Modify: `apps/worker/test/modules/backup.test.ts`

**Interfaces:**

- `startExport(): Promise<{ at_bookmark: string }>` 使用 POST `{ output_format: "polling" }`。
- `pollExport(bookmark): Promise<{ signed_url: string; filename?: string }>` 使用 POST `{ current_bookmark: bookmark }`。
- Workflow steps: create-run → start-export → poll-export → download-and-put → complete-run。

- [ ] **Step 1: 写协议级失败测试**

mock fetch 顺序必须断言：第一次 POST body 是 `output_format=polling`；第二次及重试 POST body 带 current_bookmark；未 ready 时抛错而不是返回 failed success；R2 body 保持 stream。

- [ ] **Step 2: 拆分 durable steps**

每个外部边界放在独立 `step.do`。poll step 使用 `{ retries: { limit: 8, delay: "2 seconds", backoff: "exponential" } }`，无 signed_url 时 throw。不要在同一个 step 中写 5 次紧循环。

- [ ] **Step 3: 保证账本状态正确**

首次创建 running；最终成功写 completed；所有 retry 耗尽后由 catch/final step 写 failed。重复 schedule 不得把已有 running 记录错误地标记 failed；手工 endpoint 继续返回 409。

- [ ] **Step 4: 修复查询接口**

`GET /api/v1/backups` 返回最新 completed/failed/running 记录，而不是只调用 `running()`。响应不得包含 token 或 signed URL。

- [ ] **Step 5: 验证与提交**

Run: `pnpm vitest run --config apps/worker/vitest.config.ts apps/worker/test/modules/backup.test.ts`
Expected: start/poll/retry/download/R2/duplicate/error-redaction 全部通过。

```bash
git add apps/worker/src/modules/backup apps/worker/test/modules/backup.test.ts
git commit -m "fix: make d1 backup workflow durable"
```

### Task 8: 让恢复验证、monthly 副本和生命周期真正可审计

**Files:**

- Modify: `scripts/verify-backup.mts`
- Modify: `apps/worker/test/fixtures/backup.sql`
- Create: `scripts/verify-backup.test.ts`
- Create: `scripts/configure-r2-lifecycle.mts`
- Modify: `apps/worker/src/modules/backup/workflow.ts`
- Modify: `apps/worker/src/modules/backup/service.ts`
- Modify: `apps/worker/test/modules/backup.test.ts`
- Modify: `docs/runbooks/backup.md`
- Modify: `docs/runbooks/restore.md`
- Modify: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**

- verifier 必须在临时本地数据库执行 SQL、查询 9 张表、QSO count 和最多 20 条 canonical hash；任一步失败 exit non-zero。
- daily prefix 30 天；monthly prefix 365 天；每月首日保留一份 monthly 对象。

- [ ] **Step 1: 先证明当前假阳性**

测试传入损坏 SQL，期望 process exitCode 非 0；当前实现会错误输出 `RESTORE_VERIFIED`，测试必须先失败。

- [ ] **Step 2: 删除空 catch**

使用明确的临时数据库名，执行失败直接抛错。验证器只能在 SQL 真正应用、查询结果符合 fixture 期望后打印 `RESTORE_VERIFIED tables=9 qsos=<n> sha256=<hash>`。

- [ ] **Step 3: 落地保留策略**

生命周期脚本调用 Wrangler/R2 API创建两个 prefix rule，并在执行后 list/compare；不把 account token 写入文件。monthly copy 在 Workflow 成功且 UTC day=1 时执行，key 为 `backups/monthly/YYYY/MM/{instance}.sql`。

- [ ] **Step 4: 验证与提交**

在根 Vitest 配置增加名为 `scripts` 的 Node project，并把它加入根 `test` script。

Run: `pnpm vitest run --config vitest.config.ts --project scripts && pnpm tsx scripts/verify-backup.mts --sql apps/worker/test/fixtures/backup.sql --database eqsr-restore-check`
Expected: 测试通过，fixture 输出真实 count/hash；损坏 SQL 返回非零。

```bash
git add scripts apps/worker/src/modules/backup apps/worker/test/modules/backup.test.ts apps/worker/test/fixtures/backup.sql docs/runbooks/backup.md docs/runbooks/restore.md vitest.config.ts package.json
git commit -m "test: verify recoverable backup retention"
```

### Task 9: 隔离测试鉴权并接入审计与 readiness

**Files:**

- Modify: `apps/worker/src/env.ts`
- Modify: `apps/worker/src/platform/access.ts`
- Modify: `apps/worker/src/platform/audit.ts`
- Create: `apps/worker/src/platform/write-unit.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/vitest.config.ts`
- Create: `wrangler.test.jsonc`
- Modify: `apps/worker/test/platform/access.test.ts`
- Create: `apps/worker/test/platform/audit.test.ts`
- Create: `apps/worker/test/readiness.test.ts`
- Modify: `apps/worker/src/modules/stations/repository.ts`
- Modify: `apps/worker/src/modules/qsos/repository.ts`
- Modify: `apps/worker/src/modules/imports/repository.ts`
- Modify: `apps/worker/src/modules/templates/repository.ts`
- Modify: `apps/worker/src/modules/cards/repository.ts`
- Modify: `apps/worker/src/modules/backup/repository.ts`

**Interfaces:**

- test bypass 同时要求 `APP_ENV === "test"` 和 `TEST_AUTH_ENABLED === "1"`；生产 Env 不提供该 binding。
- `GET /readyz` 受 Owner Access 保护，执行 `SELECT 1`；成功 200，D1 失败 503。
- `AuditWriter.prepare(event): D1PreparedStatement`；`commitWrite(db, businessStatements, auditStatement)` 用一次 `db.batch()` 提交业务写与审计写。
- 所有写操作写 audit；detail 仅允许数量、状态、实体 ID、checksum 前 12 位，不允许 JWT、原始 ADIF、comment、签名 URL 或完整 public token。

- [ ] **Step 1: 写生产拒绝测试**

即使请求携带 `X-EQSR-Test-Actor` 和固定 Bearer，只要 `APP_ENV=production` 或 test binding 不存在，必须 401。Vitest config 显式注入 test bindings。

- [ ] **Step 2: 重构 bypass 条件**

```ts
const allowTestIdentity = c.env.APP_ENV === "test" && c.env.TEST_AUTH_ENABLED === "1";
if (!token && allowTestIdentity) {
  // 仅接受测试 runner 注入的身份头
}
```

- [ ] **Step 3: 实现 readiness 和 audit 接入**

把 `AuditWriter` 改为生成参数化的 D1 statement，新增 `commitWrite()` 并在 station/QSO/import/template/card/backup repositories 中用 `db.batch([业务 statement..., audit statement])`。对 R2 上传采用“R2 内容寻址写入成功 → D1 元数据 + audit 同 batch”的顺序；若 D1 batch 失败，R2 对象保持为可回收孤儿，不删除旧对象。为每类写操作断言恰好一条 audit，并增加敏感字段扫描测试。

- [ ] **Step 4: 验证与提交**

Run: `pnpm vitest run --config apps/worker/vitest.config.ts apps/worker/test/platform apps/worker/test/readiness.test.ts`
Expected: 生产 header 绕过失败、JWT 边界保持、readyz 和 audit 测试通过。

```bash
git add apps/worker/src apps/worker/test apps/worker/vitest.config.ts
git commit -m "security: isolate test auth and audit writes"
```

### Task 10: 完成管理端模板/卡片 UI 与生成型 API Client

**Files:**

- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/features/templates/TemplateListPage.tsx`
- Modify: `apps/web/src/features/templates/TemplateEditorPage.tsx`
- Modify: `apps/web/src/features/cards/CardListPage.tsx`
- Modify: `apps/web/src/features/cards/CardCreatePage.tsx`
- Create: `apps/web/src/features/cards/CardCreatePage.test.tsx`
- Create: `openapi/eQSR-v1.yaml`
- Create: `scripts/generate-api-client.mts`
- Create: `packages/domain/src/openapi.ts`
- Create: `packages/domain/test/openapi.test.ts`
- Modify: `package.json`

**Interfaces:**

- `packages/domain/src/openapi.ts` 注册共享 Zod request/response schemas；`@asteasolutions/zod-to-openapi` 生成 committed OpenAPI 3.1，`openapi-typescript` 生成 client types。
- 页面禁止继续使用 `unknown[]` 和 `Record<string,string>` 作为主业务类型。
- 卡片生成顺序：选择 QSO/模板 → create draft → 等字体/背景 → Canvas → PNG hash → PUT image → publish → 展示 `/c/{public_id}`。

- [ ] **Step 1: 为完整生成链写组件失败测试**

mock API 并断言调用严格顺序、渲染失败时不上传、hash 不一致时显示错误、发布成功后出现公开链接和二维码。

- [ ] **Step 2: 生成 API 类型**

在 root devDependencies 固定 `@asteasolutions/zod-to-openapi` 与 `openapi-typescript` 版本。`pnpm generate:openapi` 从共享 Zod schemas 生成 `openapi/eQSR-v1.yaml`，`pnpm generate:api` 再生成 `apps/web/src/lib/generated-api.ts`。CI 依次执行两条命令并用 `git diff --exit-code` 防止契约漂移。

- [ ] **Step 3: 实现模板和卡片页面**

模板页支持 list/create/edit/background upload/preview；卡片页支持 list/status/publish/void；生成页完成上述严格顺序。错误必须显示可恢复动作，不能 `.catch(() => undefined)`。

- [ ] **Step 4: 验证与提交**

Run: `pnpm generate:openapi && pnpm generate:api && git diff --exit-code openapi/eQSR-v1.yaml apps/web/src/lib/generated-api.ts && pnpm vitest run --config apps/web/vitest.config.ts && pnpm build`
Expected: 生成文件无漂移，组件测试和 build 通过。

```bash
git add openapi scripts/generate-api-client.mts package.json apps/web/src
git commit -m "feat: complete card management experience"
```

### Task 11: 建立真实 E2E 与发布门禁

**Files:**

- Modify: `tests/e2e/qso-flow.spec.ts`
- Modify: `tests/e2e/adif-flow.spec.ts`
- Modify: `tests/e2e/card-flow.spec.ts`
- Modify: `tests/e2e/security.spec.ts`
- Create: `tests/e2e/fixtures.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- 每个 E2E 使用隔离的本地 D1 状态或唯一 callsign/date；不得依赖执行顺序。
- CI 门禁：install → migration → lint/typecheck/unit/worker → build → Playwright Chromium → E2E → bundle/placeholder/API drift checks。

- [ ] **Step 1: 重写 QSO E2E**

浏览器创建台站和 QSO、筛选命中、两个 API context 使用相同 ETag 更新并断言第二个 412、删除后在回收站恢复。

- [ ] **Step 2: 重写 ADIF E2E**

上传含 IOTA/APP_* 的 fixture，等待 job completed，导出并解析下载文件，断言未知字段仍在；上传非 ASCII ADI，断言 UI 阻断且没有创建 import job。

- [ ] **Step 3: 重写卡片公开 E2E**

上传测试生成的最小 PNG/JPEG 背景，创建模板和卡片，断言导出图发生 background draw，发布后打开 `/c/{id}`；精确索卡命中；作废后 API 与页面均显示 410。

- [ ] **Step 4: 扩展安全 E2E**

无身份访问 Owner API 为 401；本地测试 header 在 production-like 配置无效；ready image 404；公开 lookup hit/miss 状态和 envelope 一致；CSP 存在。

- [ ] **Step 5: 更新 CI 并验证**

Run: `CI=1 pnpm test:e2e && pnpm check:bundle && pnpm check:placeholders`
Expected: 全部通过；任一纵向闭环失败会阻止 PR 合并。

- [ ] **Step 6: 提交**

```bash
git add tests/e2e playwright.config.ts .github/workflows/ci.yml
git commit -m "test: gate release on real owner workflows"
```

### Task 12: GitHub × Cloudflare 上线、恢复和回滚验收

**Files:**

- Create: `scripts/verify-production-config.mts`
- Modify: `package.json`
- Modify: `wrangler.jsonc`
- Modify: `docs/runbooks/deploy.md`
- Modify: `docs/runbooks/production-checklist.md`
- Modify: `docs/runbooks/rollback.md`
- Modify: `docs/runbooks/access-paths.md`

**Interfaces:**

- `pnpm verify:production` 只检查非敏感配置和 secret 是否存在，不输出 secret 值。
- Workers Builds 是唯一生产发布者；GitHub Actions 不运行 `wrangler deploy`。
- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm run check`。
- Deploy command: `pnpm verify:production && pnpm db:migrate:prod && pnpm deploy:prod`。

- [ ] **Step 1: 编写预检测试与脚本**

脚本解析 `wrangler.jsonc` 并拒绝：占位 D1 UUID、`APP_ENV != production`、非 HTTPS PUBLIC_ORIGIN、本地 Access domain/audience、缺失 account/database ID。随后执行 `wrangler secret list`，只比较 `D1_REST_API_TOKEN` 与 `RATE_LIMIT_SALT` 两个名称是否存在，不读取或输出值。任何缺项 exit non-zero，输出只能是配置项名称和 PASS/FAIL。

- [ ] **Step 2: 建立 production 配置**

把本地/test binding 移出默认生产配置。填入创建后的真实 D1 UUID、R2 bucket、自定义域名、Access team domain/audience；secret 只通过 Cloudflare secret 配置。

- [ ] **Step 3: 连接 GitHub**

添加 GitHub remote，推送 feature branch；为 `main` 启用 required `ci / verify`、禁止直接 push/force push；创建 PR 并要求门禁全绿。此步骤需要仓库 URL 和用户 GitHub/Cloudflare 授权，不能由代码推断。

- [ ] **Step 4: 配置 Workers Builds**

只监听 `main`。使用最小权限 token。确认 GitHub Actions 内没有 deploy job，避免双重发布。

- [ ] **Step 5: 完成三项生产证据**

1. 合并后记录 commit SHA、Worker version、migration；
2. 触发 D1 备份，从 R2 下载 SQL，恢复到独立 dev D1，运行 verifier 并记录 count/hash；
3. 发布无害变更后回滚上一 Worker version，验证 `/healthz`、公开卡片、Owner API 拒绝边界。

- [ ] **Step 6: 观察 7 天再宣布首版完成**

记录 Workers 请求/CPU、D1 rows read/write/storage、R2 storage/Class A/B、p95、错误率和三网可达性。任何 P0 错误、恢复失败、公开未授权泄漏都阻止签字。

- [ ] **Step 7: 提交上线记录**

```bash
git add scripts/verify-production-config.mts package.json wrangler.jsonc docs/runbooks
git commit -m "ops: verify github cloudflare production release"
```

## 7. 风险控制、回滚与验收矩阵

| 风险 | 控制点 | 验收证据 | 回滚/处置 |
|---|---|---|---|
| API 改名导致前后端不一致 | Task 1 唯一路径源 + contract test | canonical 路径测试、生成 client 无 diff | 尚未生产，无需保留旧路径；同一提交原子发布 |
| ADIF 静默丢字段 | unknown-field round-trip E2E | IOTA/APP_* 导出仍存在 | 阻止发布；保留原始文件供用户重试 |
| 卡片缺背景或字体替换 | renderer 顺序和失败测试 | 预览/导出像素基准、字体 ready | 不上传、不发布 draft |
| ready/void 卡片泄漏 | 状态矩阵 integration test | ready=404、published=200、void=410 | 立即回滚 Worker；R2 保持私有 |
| 备份文件存在但不可恢复 | verifier 失败即非零 + 独立库演练 | 表/count/hash 和演练时间 | 暂停破坏性迁移；Time Travel/上次有效 dump |
| 本地鉴权误入生产 | test-only binding + preflight | production header 绕过测试为 401 | 回滚 Worker、撤销 token、检查审计 |
| 两套流水线重复部署 | Workers Builds 单一发布者 | GitHub Actions 无 deploy、CF build log | 暂停一条流水线，按 commit SHA回滚 |
| 免费配额估算错误 | 7/14 天真实指标 | Dashboard/日志趋势 | 先限流和归档；仍超限则 ADR 决定付费或迁移 |

## 8. 最终结论

1. **原报告“不立即发布”的结论成立**，但不是因为当前 Worker 测试崩溃，而是核心业务、灾备、安全和外部交付都未形成可验证闭环。
2. **原报告列出的公开路由、Canvas 背景、管理端空壳、QSO 筛选、备份轮询、鉴权绕过、E2E 过浅和生产预检问题基本成立**，应纳入计划。
3. **Workflows 不适配免费层、需要额外 Cron 保底、Worker 测试工具链已崩溃这三类判断不应执行**；前两者与当前 Cloudflare 官方能力冲突，后者被本地完整测试结果证伪。
4. **实际风险比原报告更集中在数据正确性与闭环完整性**：ADIF extras 丢失、背景元数据未保存、恢复验证假阳性和公开状态/限流边界必须优先修复。
5. 完成 Task 1～Task 11 只能说明“代码具备上线条件”；只有 Task 12 的真实 GitHub/Cloudflare 部署、独立恢复、回滚和观察期证据完成后，才可把首版状态从“不可发布”改为“可生产使用”。
