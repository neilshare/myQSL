# eQSR 全量代码评审报告

评审日期：2026-09-05  
评审对象：`/Users/zhangneil/WorkBuddy/HAM/eqsr`  
评审视角：资深全栈技术评审 / 生产可用性审查

## 一、评审概览

### 1. 本次评审范围说明

本次评审覆盖项目中的业务源码、共享领域包、Worker API、Web 前端、数据库迁移、OpenAPI 与生成脚本、备份与部署脚本、CI 配置、单元/集成/E2E 测试、运行手册及生产配置。重点检查了以下主链路：

- QSO、Station、Template、Card 的创建、更新、发布、撤销、软删除和审计；
- ADIF 解析、前端导入分块、Worker 端校验、去重分类、提交和恢复；
- 卡片渲染、R2 媒体存储、公开卡片访问和缓存控制；
- D1 备份工作流、下载/上传、校验和状态机；
- OpenAPI、生成客户端、CI/CD、Cloudflare 配置和生产门禁。

### 2. 项目整体质量评级

**评级：待整改。**

项目具备清晰的模块化结构、完整的基础测试和较好的工程化雏形；在当前 Node 26 环境下，lint、类型检查、单元测试、Worker/Web 测试、构建、bundle 检查、占位符检查和备份 fixture 验证均通过。但是，生产就绪性仍未达标：

1. `pnpm audit --prod` 检出 57 项生产依赖漏洞，其中 17 项为高危，且包含直接依赖；
2. 导入批次写入存在并发状态竞态，可能造成“任务已完成但数据仍被追加”的一致性问题；
3. API 实际路由、OpenAPI、生成客户端三者存在明显缺口和漂移；
4. 多个资源写入与审计不是同一原子写单元；
5. 生产配置仍含占位 D1 ID，Git 仓库没有配置 remote，GitHub → Cloudflare 自动部署链路尚未具备；
6. E2E 在当前运行环境未形成有效绿灯：先出现 Wrangler 配置目录权限错误，改用临时配置目录后又出现 Chrome `SIGABRT`。这不能直接证明业务断言失败，但也不能作为上线验证依据。

### 3. 核心风险汇总（按严重程度排序）

| 等级 | 风险 | 影响 | 优先级 |
|---|---|---|---|
| 阻塞级 | 生产依赖存在高危漏洞 | 可能引发授权绕过、JWT 算法混淆、静态文件任意访问、SQL 注入等风险 | P0 |
| 阻塞级 | 导入批次与任务状态存在并发竞态 | 任务状态、QSO、chunk、审计和计数可能不一致，重复/脏数据难以恢复 | P0 |
| 阻塞级 | 生产部署链路未闭环 | 当前没有有效 GitHub remote，生产 D1 仍为占位符，无法证明可自动部署 | P0 |
| 严重级 | OpenAPI/真实路由/客户端不一致 | 客户端调用不存在的接口，接口变更无法可靠被 CI 发现 | P1 |
| 严重级 | 备份内存、并发创建和状态机缺陷 | 大备份可能超 Worker 内存；重复运行或错误状态覆盖会削弱灾备可信度 | P1 |
| 严重级 | QSO 台站身份、日期时间校验不足 | 可写入身份错配或非法日期，影响去重、统计、卡片和审计 | P1 |
| 严重级 | Station/Template/Card 写入与审计分离 | 业务数据已变更但审计失败，无法满足可追溯要求 | P1 |
| 严重级 | 导入恢复、并发参数与 UI 实际能力不一致 | 页面刷新不能真正续传；调用方调大并发会被服务端拒绝 | P1 |
| 一般级 | 大文件/候选查询无界 | 常见呼号或大型 ADIF 导入会放大 D1 返回量与内存/CPU | P2 |
| 一般级 | Card/Template 输入校验和渲染快照不完整 | 非法输入进入 SQL；生成卡片缺字段或 QR 内容为空 | P2 |
| 一般级 | 前端 `any`、对象 URL 未释放、错误兜底为 ready | 类型保护和用户可见状态不可靠 | P2 |

## 二、代码亮点与优秀实践

### 1. 编码规范与架构组织

- Worker 采用“平台层 → 领域包 → 业务模块”的结构，`apps/worker/src/modules` 下按 imports、qsos、stations、templates、cards、backup 等边界组织，优于把路由、SQL、业务规则混在单文件中。
- `packages/domain`、`packages/adif-codec`、`packages/card-renderer` 把校验、ADIF 编解码和渲染从运行时平台中抽离，便于复用和独立测试。
- 当前 ESLint、TypeScript 项目引用、dependency-cruiser 均无错误；依赖图检查到 154 个模块、337 条依赖关系，说明工程约束已经实际接入。

### 2. 功能逻辑与数据约束

- QSO patch 使用严格 schema 和字段白名单，避免任意字段写入；列表接口使用 cursor 分页和 prepared statements，方向正确。
- QSO/Station/Template 等更新使用 If-Match/版本号进行乐观锁控制，能降低并发编辑覆盖问题。
- ADIF 编解码器独立，导入过程具备规范化、checksum、四桶分类（ready/duplicate/conflict/invalid）和 chunk 校验，业务思路完整。
- `verify-backup` 能根据 SQL fixture、manifest、表数量和采样记录完成恢复后校验，本地验证结果为 `RESTORE_VERIFIED`，对灾备验收是有价值的基础能力。

### 3. 安全实践

- JWT 校验包含 issuer、audience 和 RS256 算法约束；同源中间件、Cloudflare Access 入口和管理 API 鉴权边界已经形成。
- 公开卡片接口先检查公开状态，再处理 ETag/条件响应；当前响应使用 `no-store`，避免撤销后的资源继续通过新请求缓存返回。
- 安全响应头、CSP、速率限制、请求上下文和审计写入均已有统一抽象。
- R2 媒体采用内容寻址/hash，且有竞态下的对象写入处理；这是避免重复媒体和篡改检测的正确方向。

### 4. 工程化与可交付性

- CI 已串联 lint、typecheck、测试、构建、OpenAPI/API 生成漂移检查、本地迁移、bundle 限制和占位符检查。
- 生产验证脚本在 `--strict` 模式下能正确阻止占位 D1 ID、缺失 `D1_REST_API_TOKEN`、缺失 `RATE_LIMIT_SALT`；说明“严格门禁”逻辑存在。
- 生产依赖使用 pnpm lockfile，GitHub Actions 使用固定 SHA 的 action，减少供应链漂移。
- `pnpm run check` 当前通过：11 个 package 测试文件 56 个用例、11 个 web 测试文件 19 个用例、17 个 Worker 测试文件 51 个用例均报告通过；构建产物 gzip 约 126.59 kB，bundle 检查也通过。

## 三、现存问题与风险评估

### A. 阻塞级问题

#### A-1. 生产依赖存在高危漏洞

- **位置**：`apps/worker/package.json`、`apps/web/package.json`、`pnpm-lock.yaml`。
- **证据**：`pnpm audit --prod` 报告 57 项漏洞（3 low、37 moderate、17 high）。直接依赖包括 `hono@4.9.6`、`drizzle-orm@0.44.5`、`nanoid@5.1.5`、`react-router@7.8.2`。
- **主要风险**：Hono 相关授权绕过、JWT 算法混淆和静态文件任意访问；Drizzle 相关 SQL 标识符注入；Nanoid 输入长度/整数溢出问题；React Router 的 XSS、开放重定向和 DoS 类问题。
- **负面影响**：即使当前调用路径未全部触发，也不能把含已知高危漏洞的生产依赖作为可上线版本。
- **根因**：依赖版本没有持续跟进安全修复，CI 没有把 production audit 作为阻断条件。

#### A-2. 导入批次写入与任务完成存在并发竞态

- **位置**：`apps/worker/src/modules/imports/repository.ts` 的 `executeChunkBatch`，以及 `apps/worker/src/modules/imports/service.ts` 的 chunk/complete 流程。
- **问题**：实现先插入 QSO、`import_chunks`，再执行带 `status IN ('created','running')` 条件的 job update。若另一个请求在此期间把任务置为 `completed`，前面的业务写入已经生效，但状态更新影响 0 行，后续计数/审计也可能被跳过。
- **负面影响**：出现“已完成任务仍追加数据”、chunk 记录与 job 计数不一致、审计缺失或重复导入；服务层预先检查状态不能消除这个 TOCTOU 竞态。
- **根因**：状态守卫不是写入事务的第一步，数据写入没有绑定一个不可过期的任务 lease/claim。

#### A-3. 生产发布闭环尚未成立

- **位置**：`apps/worker/wrangler.jsonc`、`.github/workflows/ci.yml`、仓库 Git 配置。
- **证据**：生产配置仍是 `00000000-0000-0000-0000-000000000001` 占位 D1 ID；`pnpm verify:production --strict` 正确退出 1；`git remote -v` 没有输出。
- **负面影响**：不能从当前目录直接完成 GitHub 推送、Cloudflare Builds 触发、生产 D1 绑定和 secrets 校验；`--dry-run` 退出 0 只表示脚本允许预览，不代表可部署。
- **根因**：仓库 remote、GitHub Actions/Cloudflare Builds、生产资源 ID、secret 管理和环境分层尚未真正接线。

### B. 严重级问题

#### B-1. OpenAPI、真实路由和前端客户端发生契约漂移

- **位置**：`openapi/myQSL-v1.yaml`、`packages/domain/src/openapi.ts`、`apps/worker/src/modules/*/routes.ts`、`apps/web/src/lib/api-client.ts`、`scripts/generate-api-client.mts`。
- **问题**：实际已有 imports 路由、public card detail/image、backups/latest 等能力，但 OpenAPI 没有完整描述；客户端暴露 `cards.get`，服务端没有对应的 `/api/v1/cards/:id` GET；客户端 imports 未暴露 `getJob`。
- **负面影响**：前端在运行时调用不存在的接口；SDK 生成结果不能代表服务真实能力；契约测试通过也不能说明所有实际路由被覆盖。
- **根因**：OpenAPI 主要从 schema 生成，路由注册不是单一事实源；契约测试只覆盖部分硬编码路径。

#### B-2. 导入恢复能力在后端存在、在实际 UI 中不可用

- **位置**：`apps/web/src/features/imports/import-controller.ts`、`apps/web/src/lib/api-client.ts`。
- **问题**：`runImport` 具备调用 `getJob` 的恢复逻辑，但 `api.imports` 只导出 `createJob`、`uploadChunk`、`completeJob`，没有 `getJob`。
- **负面影响**：页面刷新或客户端重启无法按设计续传，用户会重新选择/上传文件；大文件导入的核心可靠性承诺落空。
- **根因**：API 客户端与 controller 并行演进，没有由生成契约驱动完整方法集合。

#### B-3. 导入并发和 chunk 参数的协议互相矛盾

- **位置**：`apps/worker/src/modules/imports/service.ts`、`apps/web/src/features/imports/import-controller.ts`。
- **问题**：服务端要求顺序 chunk、固定 `job.chunk_size=40`；前端暴露 `options.concurrency` 并用 `Promise.all` 批量上传，也允许自定义 chunkSize。默认值为 1/40 时恰好可用，但调用方传入并发大于 1 或不同 chunkSize 会被 422 拒绝。
- **负面影响**：配置项给出错误能力预期，后续优化并发时会直接破坏导入；测试如果只覆盖默认值，无法发现协议风险。
- **根因**：服务端顺序协议和前端通用上传器没有统一成明确的能力声明。

#### B-4. QSO 台站身份可被请求体错配

- **位置**：`apps/worker/src/modules/qsos/service.ts` 的 `create`。
- **问题**：服务端按 `station_id` 解析 Station，却直接保存请求中的 `station_callsign`，没有验证二者一致或从 Station 派生 callsign。
- **负面影响**：同一 QSO 可被写成“Station A + callsign B”，影响去重、统计、卡片展示、权限审计和后续迁移。
- **根因**：请求字段同时承载了可派生字段，领域服务没有建立不可变身份来源。

#### B-5. 日期/时间只做格式校验，没有语义校验

- **位置**：`packages/domain/src/qso.ts` 的 `QsoInputSchema`、`packages/domain/src/dedupe.ts` 的 `parseQsoTimestamp`。
- **问题**：`qso_date` 只检查 8 位数字，`time_on` 只检查 4/6 位；`Date.UTC`/`Date.parse` 会把部分非法值规范化，例如日期溢出可被滚动到下个月。
- **负面影响**：非法 QSO 进入数据库，按时间窗口去重、排序、统计和 ADIF 导出均可能产生错误。
- **根因**：格式解析和领域语义校验没有合并，缺少“解析后再 round-trip 比较”的约束。

#### B-6. Station/Template/Card 业务写入与审计不是同一原子写单元

- **位置**：`apps/worker/src/modules/stations/routes.ts`、`apps/worker/src/modules/templates/routes.ts`、`apps/worker/src/modules/cards/routes.ts`。
- **问题**：多个路由先完成 repository mutation，再单独调用 `AuditWriter.append`；Card `attachImage` 没有审计；Template 背景上传可能先写 R2，再发现模板不存在；审计失败时业务修改不会回滚。
- **负面影响**：管理员看到业务状态已经变更，但审计链不完整；R2 可能产生孤儿对象，无法证明谁在何时完成了什么变更。
- **根因**：审计被当作“后置日志”而非业务写入的一部分；D1 与 R2 的跨存储流程没有补偿设计。

#### B-7. 备份下载一次性读入内存，且运行状态可重复创建/错误覆盖

- **位置**：`apps/worker/src/modules/backup/service.ts` 的 `downloadAndPut`、`createRun`；`apps/worker/src/modules/backup/repository.ts`；`apps/worker/src/workflows/d1-backup.ts`。
- **问题**：下载后调用 `arrayBuffer()` 再整体 hash，和大文件流式承诺不符；`running()` 检查和 `create()` 分离，两个并发工作流都可能创建 running；`complete`/`fail` 没有严格状态条件；工作流没有调用 `markVerified`，且审计错误被吞掉。
- **负面影响**：大备份可能触发 Worker 内存上限；并发运行造成重复备份；失败重试可把已完成记录改成 failed；“备份存在”不能等价于“已验证可恢复”。
- **根因**：备份状态机不是显式幂等状态机，上传、验证、审计和状态转换没有统一生命周期。

#### B-8. 导入候选查询无界，复杂度随历史日志膨胀

- **位置**：`apps/worker/src/modules/imports/repository.ts` 的 `findExistingQsoCandidates`。
- **问题**：按呼号批量查询所有未删除 QSO，没有按时间、频段、模式过滤，也没有结果上限；服务层再对每条导入记录做 `.find`。
- **负面影响**：常见呼号或大型日志会返回大量 D1 行并占用 Worker 内存/CPU，形成近似 records × candidates 的处理成本。
- **根因**：候选查找只按业务字段粗筛，未利用 qso_at、band、mode 等索引和时间窗口。

#### B-9. 大文件导入并非真正流式

- **位置**：`apps/web/src/features/imports/import-controller.ts`、`apps/worker/src/modules/imports` 解析流程。
- **问题**：前端对文件 `text()`，解析过程中又持有全部文本/records；Worker 端也对完整 ArrayBuffer 解析，界面文案却暗示可处理“千万级/streaming”。
- **负面影响**：文件大小、文本副本、解析结果和上传队列叠加后会导致浏览器或 Worker 内存峰值；失败后重试成本高。
- **根因**：当前实现是批量内存模型，没有真正的流式解析、背压和文件大小上限。

### C. 一般级问题

#### C-1. Card/Template 请求体运行时校验不足

- **位置**：`apps/worker/src/modules/cards/routes.ts`、`apps/worker/src/modules/templates/routes.ts`。
- **问题**：Card 创建请求主要通过类型断言取得 `qso_id`/`template_id`，缺少 Zod runtime schema；Template PATCH 对 `If-Match` 使用宽松 `parseInt`，并允许 body version 代替严格 ETag。
- **影响/根因**：非法字符串、NaN 或格式化版本可能进入 SQL；根因是 TypeScript 类型被当成了运行时校验。

#### C-2. 卡片快照和渲染参数存在功能缺口

- **位置**：`apps/worker/src/modules/cards/service.ts`、`packages/card-renderer/src/render.ts`、`apps/web/src/pages/CardCreatePage.tsx`。
- **问题**：快照/页面渲染缺少 name、QTH、comment、frequency 等字段；`renderCard` 忽略已校验的 `max_width`；QR 使用 `qso.public_id`，但创建渲染载荷可能没有提供该字段。
- **影响/根因**：生成卡片信息不完整、布局配置不生效、QR 可能为空；根因是领域快照、渲染输入和 UI 展示字段没有共享一个完整 DTO。

#### C-3. ADIF 字段映射存在业务信息损失风险

- **位置**：`apps/web/src/features/imports/adif-mapper.ts`。
- **问题**：`OPERATOR_CALLSIGN` 不进入核心字段；`my_power_w` 等数值使用 truthiness 判断，0 会被当成未提供；导出同时输出标准 `FREQ` 与内部 `FREQ_HZ`，需明确兼容策略。
- **影响/根因**：运营台站信息可能只进 `adif_extra` 或丢失；合法的零值可能丢弃；根因是字段白名单和可选值判断不严谨。

#### C-4. 前端类型保护被 `any` 削弱

- **位置**：`apps/web/src/lib/api-client.ts`、`CanvasPreview.tsx`、`TemplateListPage.tsx`、`StationSettings.tsx`、`CardCreatePage.tsx`。
- **问题**：`api.stations.list` 类型声明与 `apiFetch` 解包行为不一致，组件用 `any` 兜底；多个 API 响应在页面层被强制转换。
- **影响/根因**：接口漂移不能在编译期发现，运行时字段缺失才暴露；根因是响应 envelope 没有生成单一类型。

#### C-5. 状态兜底可能给用户错误进度

- **位置**：`apps/web/src/features/imports/import-controller.ts`。
- **问题**：服务端分类结果形状不符合预期时，客户端将上传记录数量整体当作 `ready`。
- **影响/根因**：后端返回异常或契约变化时，用户看到可提交的数量可能是假的；根因是错误路径 fail-open，而不是 fail-closed。

#### C-6. 安全头和请求 ID 仍需收紧

- **位置**：`apps/worker/src/platform/security-headers.ts`、`apps/web/public/_headers`、`apps/worker/src/platform/request-context.ts`。
- **问题**：生产安全头未统一包含 HSTS；客户端 `X-Request-Id` 仅截断长度，没有严格字符集/熵校验；静态 `_headers` 与 Worker 头集合可能不一致。
- **影响/根因**：降低部署后的安全基线，日志中可能出现控制字符或伪造关联 ID；根因是边缘层与应用层安全策略没有单一配置源。

#### C-7. E2E 与生产门禁尚不能证明可上线

- **位置**：`tests/e2e`、`playwright.config.ts`、Wrangler 运行环境、`.github/workflows/ci.yml`。
- **证据**：原始 E2E 因 Wrangler 无法写入用户配置/日志目录而启动失败；指定临时 `XDG_CONFIG_HOME` 后，Chrome 启动多次 `SIGABRT`，35 个测试中只有 5 个通过。生产 `--dry-run` 会在占位配置下退出 0，只有 `--strict` 才失败。
- **影响/根因**：当前结果不能作为业务 E2E 绿灯；根因是 CI/本机运行器权限与浏览器稳定性未隔离，且 dry-run 语义容易被误读。

#### C-8. 对象 URL 未释放

- **位置**：`apps/web/src/pages/TemplateEditorPage.tsx`。
- **问题**：`URL.createObjectURL(file)` 后没有对应 `URL.revokeObjectURL`。
- **影响**：用户重复选择背景图时产生浏览器内存泄漏；属于局部维护性问题。

## 四、针对性改进方案

### P0：上线前必须完成

#### P0-1 依赖安全整改

1. 升级 `hono`、`drizzle-orm`、`nanoid`、`react-router` 至审计报告对应的已修复版本，并更新 lockfile。
2. 对 Hono JWT、静态文件、Drizzle SQL 构造、Nanoid 生成和 React Router 路由做回归测试；禁止仅通过强制 override 掩盖不兼容。
3. 在 CI 增加 `pnpm audit --prod --audit-level high` 阻断；保留带到期日和责任人的临时豁免机制。
4. 重新运行审计并保存依赖报告，未确认清零前不能标记 P0 完成。

#### P0-2 重做导入写入状态机

建议把“上传中 → 已声明 → 提交中 → 完成/失败”变成显式状态机，并引入任务 lease：

```ts
// 先抢占当前 chunk 的写入资格；必须只影响 1 行
const claim = await db
  .prepare(`
    UPDATE import_jobs
       SET status = 'running', lease_id = ?, lease_until = ?
     WHERE id = ?
       AND status IN ('created', 'running')
       AND (lease_until IS NULL OR lease_until < ?)
  `)
  .bind(leaseId, leaseUntil, jobId, now)
  .run();

if (claim.meta.changes !== 1) throw new ConflictError('import job is no longer writable');
// 后续 QSO/chunk/audit 写入必须携带并校验 lease；过期或状态改变则整批拒绝。
```

实现要求：

- 同一 job 同一 chunk 建立唯一约束；
- 每个 batch 都使用服务器返回的版本/lease，不接受客户端自行覆盖状态；
- `complete` 必须检查所有 chunk、解析计数和 lease，再一次性置为 completed；
- 增加并发 `uploadChunk` vs `complete`、重复 chunk、超时 lease 恢复的集成测试。

#### P0-3 建立 GitHub → Cloudflare 的真实发布链路

1. 为 `eqsr` 配置唯一 GitHub remote，确认默认分支和保护规则；`qsl_design_samples` 不纳入该仓库。
2. 在 Cloudflare 创建真实 D1/R2/Workers 资源，替换 `wrangler.jsonc` 占位 ID。
3. 将生产 secrets 放入 GitHub/Cloudflare secret store，不写入仓库；验证 `D1_REST_API_TOKEN`、`RATE_LIMIT_SALT`、JWT 公钥配置。
4. CI 分为 PR（检查/测试/预览）和 main 发布（迁移、部署、健康检查）两条路径；生产部署必须调用 `verify:production --strict`，不能使用 dry-run 作为成功条件。
5. 为迁移、Worker、Web 静态资源和回滚分别定义版本号、审批点与回滚命令，并完成一次 staging 演练。

### P1：上线前后第一个迭代完成

#### P1-1 统一 API 契约

- 建立 route registry：每个路由同时声明 method、path、request schema、response schema、auth、错误码和 OpenAPI metadata。
- 将 imports 全部路由、public card detail/image、backups/latest、实际需要的 card detail GET 纳入 OpenAPI。
- 由同一契约生成 `api-client`，补齐 `imports.getJob`；删除不存在的 `cards.get` 或补齐服务端路由。
- 契约测试枚举路由注册表与 OpenAPI paths 做双向 diff，并校验生成客户端方法集合。

#### P1-2 收紧 QSO 领域不变量

```ts
const station = input.station_id
  ? await stationRepo.require(input.station_id)
  : undefined;

if (station && input.station_callsign !== station.callsign) {
  throw new ValidationError('station_callsign does not match station_id');
}

const stationCallsign = station?.callsign ?? normalizeCallsign(input.station_callsign);
```

日期时间应使用严格 round-trip 校验：

```ts
function parseUtcStrict(date8: string, time: string): number {
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(date8);
  const t = /^(\d{2})(\d{2})(\d{2})?$/.exec(time);
  if (!d || !t) throw new ValidationError('invalid QSO date/time');
  const year = +d[1], month = +d[2], day = +d[3];
  const hour = +t[1], minute = +t[2], second = +(t[3] ?? '0');
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    throw new ValidationError('invalid QSO date/time');
  }
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const x = new Date(ms);
  if (x.getUTCFullYear() !== year || x.getUTCMonth() !== month - 1 || x.getUTCDate() !== day) {
    throw new ValidationError('invalid calendar date');
  }
  return ms;
}
```

#### P1-3 统一业务写入与审计

- 对 Station、Template、Card 提供 `writeWithAudit()` repository API，业务 DML、版本条件和 audit insert 在同一 D1 batch/事务边界内完成，并检查 `changes`。
- R2 操作顺序采用“先校验 D1 记录 → 写不可变对象 → 条件更新元数据+审计”；D1 更新失败时删除刚上传对象或进入可重试垃圾回收队列。
- 明确 `attachImage`、template create/upload、publish/void 的审计事件和 actor/request ID。

#### P1-4 修复备份状态机和大文件路径

- 以数据库唯一活动锁或条件 `INSERT ... SELECT` 原子保证每个 scope 只有一个 running run。
- `complete`/`fail` 必须带 `WHERE status='running' AND run_id=?`，状态转移使用显式允许矩阵；已完成不能被失败覆盖。
- 用 Response body stream 写入 R2，同时采用流式 hash 或受控 tee；设置最大备份大小和超时。
- 工作流在上传后执行 manifest/恢复校验，成功后调用 `markVerified`；审计失败要按策略阻止“verified”，不能静默吞掉。

#### P1-5 修复导入恢复、并发和性能

- 客户端只使用服务器返回的 `chunk_size`；若服务端保持顺序协议，就删除公开 `concurrency` 参数并强制串行。
- 增加 `GET /imports/:id` 客户端方法，刷新后按 hash、文件大小、chunk 状态恢复；客户端 hash 只能作为候选身份，服务端必须通过 chunk checksum/最终 canonical hash 验证。
- 候选查询按 callsign + 时间窗口 + band/mode 过滤，限制最大候选数并为 qso_at/callsign 建索引；对超限任务返回可解释错误。
- 为前端和 Worker 增加明确文件大小上限；中长期改为流式 ADIF parser + 上传背压。

### P2/P3：持续改进

- 所有 Card/Template/Import 输入使用 Zod runtime schema，严格解析 If-Match/ETag。
- 统一 API envelope 类型，删除页面层 `any`；让生成客户端成为唯一调用入口。
- 完善卡片 DTO，确保 snapshot、renderer、QR token 和 UI 使用同一字段集合；让 `max_width` 真正影响布局。
- 修正 ADIF 0 值判断、operator 字段策略和 `FREQ_HZ` 导出兼容性，并补充 golden fixtures。
- 增加 HSTS、严格 Request ID 字符集、静态 `_headers` 与 Worker 头的差异检查。
- 对 E2E 运行器固定 Chrome/Playwright 版本，使用可写的 Wrangler 配置目录；在 CI 中记录浏览器崩溃日志，并将 E2E 与业务断言失败区分。
- `check-placeholders` 扩大扫描到 `scripts`、`infra`、`openapi`、README/runbook；将占位符分为示例文档允许、生产配置禁止两类。
- 在模板编辑器清理 object URL；在 bundle 检查中区分 entry chunk 与所有 JS 总和。

## 五、后续开发与演进计划

### 短期（1–2 周）

1. **安全止血**：升级四组直接依赖，跑生产 audit；修复 HSTS/Request ID 基线。
2. **数据一致性**：完成导入 lease/状态机、重复 chunk 唯一约束和并发测试；修复 station identity 与严格日期解析。
3. **契约修复**：补齐 imports getJob、card/public/backup 路由 OpenAPI，删除或实现 `cards.get`。
4. **发布阻塞项**：配置 GitHub remote、staging Cloudflare 资源和 secrets；让 strict production 验证在真实 staging 配置下通过。
5. **验证环境**：修复 Wrangler 可写目录和 Chrome SIGABRT；重新跑完整 E2E，保留报告、trace、截图和失败分类。

### 中期（1–2 个月）

1. 将所有业务 mutation 迁移到统一 `writeWithAudit`；完成 R2 孤儿对象回收。
2. 重构备份状态机、流式上传和自动恢复验证，增加故障注入：重复触发、超时、R2 失败、D1 失败、重试和回滚。
3. 优化导入候选查询和索引，确定文件大小/记录数 SLA，完成 10 万、100 万级 fixture 压测。
4. 建立 OpenAPI route registry 与客户端生成流水线，禁止手写 envelope 类型和 `any` 兜底。
5. 形成 PR → preview → staging → production 的 GitHub/Cloudflare 发布流程，加入迁移前备份、健康检查、自动回滚和审计留痕。

### 长期（3–6 个月）

1. 将 ADIF 解析/导入演进为真正的流式、可暂停、可恢复 pipeline；必要时把大任务下沉到 Queue/Workflow，并用进度事件驱动 UI。
2. 建立可观测性：结构化日志、trace/request ID、导入耗时与失败率、备份 RPO/RTO、R2 孤儿数、公开卡片命中/撤销指标和告警。
3. 把审计从“日志表”升级为可验证的事件账本，定义保留、导出、脱敏和管理员查询策略。
4. 建立依赖升级月度窗口、SBOM、供应链签名/来源校验和高危漏洞 SLA。
5. 根据真实 QSO 数据规模评估 D1 分区/归档、读模型或搜索索引；在没有容量证据前不提前引入复杂微服务。

## 评审结论

当前版本适合作为**继续开发和 staging 验证的基线**，不适合作为生产发布基线。代码结构和基础工程质量值得保留，但必须先完成 P0 项：依赖高危整改、导入原子性修复、GitHub/Cloudflare 发布闭环，并使 E2E 在受控 CI 环境中形成可重复结果。P0/P1 完成且复测通过后，才可进入生产灰度；在此之前，任何“check 通过”都只能解释为静态/单元层面通过，不能解释为端到端和生产安全就绪。
