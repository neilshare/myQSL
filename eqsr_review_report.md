# eQSR 项目系统性技术评审报告

| 项目 | 内容 |
|---|---|
| 评审对象 | `/Users/zhangneil/WorkBuddy/HAM/eqsr`（eQSR / electronic QSO & QSL Record） |
| 评审依据 | `docs/superpowers/specs/2026-09-03-eqsr-final-architecture-design.md`（下称「规范」） |
| 评审范围 | 实现与规范一致性、代码质量、测试有效性 |
| 代码规模 | 生产代码 5,097 行（TS/TSX，不含测试）；测试代码 1,940 行；SQL 迁移 2 个 |
| 评审日期 | 2026-09-04 |
| 总体结论 | **有条件通过（Conditional Pass）** |

---

## 0. 总体结论

### 0.1 结论表述

**有条件通过。** 代码质量在同类 AI 落地项目中属于上游水准：架构分层干净、依赖边界可机检、卡片状态机与快照不可漂移这两个最难做对的部分实现正确，ESLint、dependency-cruiser、类型检查、占位符检查全部零缺陷，106 个测试用例在限并发条件下 100% 通过。

**但不具备宣布「首版完成」的条件。** 存在 3 项上线阻塞项、8 项严重缺陷，其中最关键的两点是：

1. **审计写入全部非原子**，规范要求事务化的 `executeBatchWithAudit()` 写了却零处调用，是死代码；
2. **默认 `pnpm test`（即 CI 使用的命令）在受限环境下跑了 0 个用例就失败**，当前「测试全绿」的结论依赖人工降并发才成立，CI 门禁不可信。

### 0.2 判定依据

| 判定维度 | 结果 | 说明 |
|---|---|---|
| 功能需求覆盖 | ⚠️ 部分 | 规范 §9.2 的 22 个接口实现 21 个；软重复（±3 min）与模板 PATCH 缺失 |
| 接口与数据结构 | ✅ 基本符合 | snake_case、RFC 9457、游标分页、If-Match、幂等键均落地 |
| 非功能约束 | ⚠️ 部分 | 安全与架构约束大体满足；D1 查询预算、兼容性日期、限流覆盖有实质偏离 |
| 代码质量 | ✅ 良好 | 分层清晰、边界可机检、无 lint/type 错误；存在少量死代码与异常吞没 |
| 测试有效性 | ⚠️ 不可信 | 106 用例全通过，但默认命令跑不完、验收定义 8 条中 3 条无用例证实 |
| 规范 §17 验收定义 | ❌ 未达成 | 至少 3 条（10k 导入、恢复演练、审计写入）无任何测试证实 |

### 0.3 问题统计

| 等级 | 数量 | 说明 |
|---|---:|---|
| 🔴 阻塞（Blocker） | 3 | 阻止生产上线 |
| 🟠 严重（Major） | 8 | 规范偏离或可靠性/安全性实质缺陷 |
| 🟡 一般（Minor） | 10 | 数据正确性、覆盖缺口、可维护性 |
| 🔵 优化建议（Suggestion） | 6 | 改进项，非缺陷 |

---

## 1. 阻塞项（Blocker）

### B-1　生产环境变量未覆盖，部署后管理端与全部写操作直接失效

- **定位**：`wrangler.jsonc:28-51`；相关代码 `platform/origin.ts:12`、`platform/access.ts:38-46`
- **具体表现**：`env.production.vars` 只覆盖了 `APP_ENV` 与 `TEST_AUTH_ENABLED`。Wrangler 的环境变量合并语义是「顶层 `vars` 与环境 `vars` 合并，环境值优先」，因此生产环境实际继承的是顶层的三个本地值：

  | 变量 | 生产实际生效值 | 应为 |
  |---|---|---|
  | `PUBLIC_ORIGIN` | `http://127.0.0.1:8787` | 生产域名（HTTPS） |
  | `ACCESS_TEAM_DOMAIN` | `https://myqsl.cloudflareaccess.com` | 真实 Access 团队域名 |
  | `ACCESS_AUD` | `local-development-audience` | 真实 Application Audience |

- **影响范围**：
  - `requireSameOrigin` 对 Origin 做**严格相等**比较，生产请求 Origin 为真实域名，恒不相等 → **所有 POST/PUT/PATCH/DELETE 返回 403**；
  - `requireOwner` 用 `ACCESS_TEAM_DOMAIN` 拼 JWKS 地址、用 `ACCESS_AUD` 校验 audience → **JWKS 拉取失败或 aud 不匹配，管理端全部 401**。
  - 合起来：系统上线后既不能读（管理端）也不能写，等同于完全不可用。
- **风险**：P0 / 上线即故障。
- **修复建议**：
  1. 立即在 `env.production.vars` 中补全 `PUBLIC_ORIGIN`、`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD` 三项；
  2. `scripts/verify-production-config.mts` 当前只校验 `PUBLIC_ORIGIN`、`D1_DATABASE_ID`、`TEST_AUTH_ENABLED` 与必要的 secret，**完全不校验 `ACCESS_TEAM_DOMAIN` 与 `ACCESS_AUD`** —— 这是漏网点，必须在 `validateProductionConfig()` 中增补两项校验（要求 HTTPS、不得以 `-audience` 结尾的本地占位值、不得包含 `myqsl` 占位域名），否则上述配置错误可能在预检通过的情况下流入生产。
- **优先级**：P0（上线前必须修复）

### B-2　D1 `database_id` 为占位 UUID，与规范「不存在未决占位内容」冲突

- **定位**：`wrangler.jsonc:16`
- **具体表现**：`"database_id": "00000000-0000-0000-0000-000000000001"`；同文件 D1 库名 `myqsl-prod`、R2 桶名 `myqsl-media`、Workflow 名 `myqsl-d1-backup` 均不符合规范 §0 的 `eqsr` 前缀约束。
- **影响范围**：无法部署到生产 D1；资源命名与产品标识不一致，后续迁移到真实账号时容易错绑资源。
- **风险**：P0。
- **修复建议**：填入真实 D1 数据库 ID，并把三类资源名统一为 `eqsr-prod` / `eqsr-media` / `eqsr-d1-backup`；注意 D1 资源重命名需新建后迁移，建议在建库之初一次做对。
- **缓解现状**：`verify-production-config.mts` 的 `DUMMY_UUID_PATTERN` 已能拦截该占位值（测试 `fails and exits non-zero when APP_ENV=production but D1 ID is placeholder` 通过），即部署会被正确阻断，不会静默出错。
- **优先级**：P0

### B-3　`myqsl` 命名全线违反规范 §0 的 `eqsr` 前缀约定

- **定位**：全仓库 60+ 处，核心位置：`package.json:2`（根包名 `myqsl`）、`wrangler.jsonc:3`（Worker name `myqsl`）、五个 workspace 包的 `@myqsl/*` scope、`openapi/myQSL-v1.yaml`
- **具体表现**：规范 §0 明确「仓库、Worker 和包名前缀统一使用 `eqsr`」，实现里产品名（eQSR）与代码标识（myqsl）分裂为两套。其中影响最大的是 **RFC 9457 的 problem `type` URI 全部指向 `https://myqsl.app/problems/*`**（`platform/problem.ts`、`modules/*/routes.ts` 共 40+ 处字面量）。
- **影响范围**：
  1. `myqsl.app` 并非本人可控域名。RFC 9457 要求 `type` 为可解析的问题类型 URI，指向不受控域名意味着错误语义的定义权外包，且该域名一旦被他人注册会被劫持语义；
  2. `openapi/` 目录下 `eQSR-v1.yaml` 与 `myQSL-v1.yaml` **内容完全相同（各 824 行，diff 为空）**，由 `scripts/generate-openapi.mts:48-49` 同时写出，属冗余产物，易造成客户端引用错版本；
  3. 代码里同时存在 `X-MYQSL-Request` 与 `X-EQSR-Request`、`X-MYQSL-Test-Actor` 与 `X-EQSR-Test-Actor` 双 header 兼容（`origin.ts:10`、`access.ts:17`），是改名未完成的痕迹。
- **风险**：中（不影响功能，但影响可维护性与错误语义主权）。
- **修复建议**：全局重命名 `myqsl` → `eqsr`；problem type URI 改为 `https://eqsr.app/problems/*` 或采用不必解析的 URN（`urn:eqsr:problem:validation`）以规避域名依赖；删除 `openapi/myQSL-v1.yaml` 并同步修改生成脚本；统一测试 header，移除兼容分支。
- **优先级**：P1（建议上线前完成，rename 越晚成本越高）

---

## 2. 严重缺陷（Major）

### M-1　审计写入全部非原子，且事务化工具函数为零调用死代码

- **定位**：`platform/write-unit.ts`（定义）、`modules/qsos/routes.ts:34-43`、`modules/cards/routes.ts:38,64,82`、`modules/stations/routes.ts:38,61`
- **具体表现**：

  `platform/write-unit.ts` 实现了规范 §12.3 要求的原子写入工具：

  ```ts
  export async function executeBatchWithAudit(db, statements, auditEvent) {
    const auditStmt = buildAuditStatement(db, auditEvent);
    return db.batch([...statements, auditStmt]);   // 业务语句 + 审计同一 batch
  }
  ```

  但对全仓库 `apps/worker/src` 检索 `executeBatchWithAudit` 的调用点，结果为 **0**。所有审计实际走的是路由层事后追加：

  ```ts
  const result = await service(c).create(...);           // 写 QSO
  await new AuditWriter(c.env.DB).append({ ... });       // 独立一次 D1 写
  return c.json({ data: ... }, 201);
  ```

- **影响范围**：
  1. **原子性缺失**：QSO 写入成功但审计写入失败（D1 抖动、超限、进程中断）时，业务数据已落库而审计链断裂，且无任何补偿或重试 —— 规范 §12.3「QSO + audit 使用同一 D1 batch/transaction」未落实；
  2. **死代码误导**：工具函数存在会让后续维护者误以为事务性已保证，属于典型的「假保障」；
  3. **审计点严重不全**：当前只有 `create_qso`、`create_card`、台站创建/更新有审计。**QSO 的 PATCH / DELETE / restore、卡片 publish / void、模板变更、ADIF 导入、ADIF 导出、备份执行全部无审计**，与规范 §5.2「记录写操作、导入、导出、发布、备份与拒绝事件」明显不符；
  4. **零测试覆盖**：全仓库测试代码中没有任何一处断言 `audit_events` 表内容（已检索确认），审计功能实际上处于「实现了但无人验证」状态。
- **风险**：高。对一个把「数据主权与可追溯」作为核心诉求的个人日志系统，审计链不完整会削弱事后追查能力。
- **修复建议**：
  1. 在 `QsoService` / `CardService` 内部构造业务语句 + 审计语句，改用 `executeBatchWithAudit()` 一次提交；
  2. 补齐 PATCH/DELETE/restore/publish/void/导入/导出/备份的审计点；
  3. 增加集成测试，对每次写操作断言 `SELECT COUNT(*) FROM audit_events WHERE entity=? AND entity_id=?` 结果 ≥ 1；
  4. 若保留 `write-unit.ts`，为其补一个直接调用它的单测，防止再次退化为死代码。
- **优先级**：P0

### M-2　导入批次 D1 查询数约为规范预算的 2.5 倍

- **定位**：`modules/imports/service.ts:39-55` → `modules/qsos/service.ts:12-28`
- **具体表现**：规范 §8.2-5 明确「每次 Worker 调用最多执行 50 个 D1 查询；40 条批次为重复预取、写入、chunk 记录和审计预留余量」，并要求做**重复预取**（批量）。

  实现是对 40 条记录**逐条串行**调用 `QsoService.create()`，每条至少 3 次 D1 查询：

  | 每条记录的查询 | 来源 |
  |---|---|
  | `stations.findById()` 或 `findDefault()` | `qsos/service.ts:15` |
  | `repository.findDuplicate(dedupeKey)` | `qsos/service.ts:17` |
  | `repository.insert()` | `qsos/service.ts:27` |

  合计：40 × 3 = 120，加上 `getJob`、`getChunkByIdempotency`、`saveChunk`、`updateCounts` ≈ **124 次查询/批次**。既没有 `WHERE dedupe_key IN (...)` 的批量预取，也没有用 `db.batch()` 合并写入。

- **影响范围**：
  1. 直接违背规范点名的 50 查询预算（超出约 2.5 倍）；
  2. 40 条批次的处理时延随 D1 往返线性增长（124 次串行网络往返），实测虽未超时，但规范设定的预算本就是为了给「重复预取 + 写入 + chunk + 审计」留余量，当前实现把余量全部吃光，**一旦按 M-1 补上审计写入，查询数会进一步上升到 ~164**；
  3. 台站查询在循环内重复执行 40 次，属于明显的 N+1。
- **修复建议**：
  1. 循环外先查出默认台站 1 次；
  2. 40 条记录的 `dedupe_key` 用一条 `WHERE dedupe_key IN (?,?,...)` 批量预取（1 次）；
  3. 写入、chunk 记录、计数更新、审计合并进一次 `db.batch()`（1 次调用）；
  4. 优化后单次调用约 5–7 次查询，留出充足余量。
- **优先级**：P1

### M-3　软重复（±3 分钟）完全未实现，四桶分类实为三桶

- **定位**：`packages/domain/src/dedupe.ts`、`modules/imports/service.ts:8-12,55`
- **具体表现**：规范 §14.2 定义了三级重复策略，其中：

  > 软重复：相同呼号/波段/模式且时间 ±3 分钟，只警告不阻断。

  实现层面：`packages/domain/src/dedupe.ts` 整个文件只有 `makeDedupeKey()` 一个函数，全仓库检索 `soft` / `180` / `3 * 60` / `nearDuplicate` 均无命中（仅 OpenAPI 描述里出现 "Soft delete" 字样，与软重复无关）。

  分类枚举虽然声明了 4 个桶（`ImportClassification` 含 `warning`），但 `acceptChunk` 的分支里只可能产生 `ready` / `duplicate` / `rejected`，`warning` 分支不存在；`updateCounts` 直接传 `warning: 0`（`imports/service.ts:55`）。规范 §8.2-4 要求的「四桶分类」实际只有三桶。

- **影响范围**：相邻几分钟内的疑似重复通联（例如同一电台紧接的两次呼叫、日志时间录入偏差）不会被提示，用户失去规范特意设计的纠错机会；导入结果里的 `warning` 统计恒为 0，UI 若展示该桶会永远为空。
- **修复建议**：
  1. 在 `packages/domain/src/dedupe.ts` 增加 `isSoftDuplicate(a, b)`（同 call/band/mode 且 |Δt| ≤ 180s），保持领域层的平台无关性；
  2. 在 `acceptChunk` 的批量预取阶段（结合 M-2 的改造）同时按 `(call, band, mode)` 预取 ±3 分钟窗口的候选记录做软重复判定，命中则归入 `warning` 桶并附警告文案；
  3. 补 golden 用例：±179s 判 warning、±181s 不判、跨波段/跨模式不判。
- **优先级**：P1

### M-4　默认 `pnpm test` 跑不完 0 用例，CI 门禁不可信

- **定位**：`package.json:15`（test 脚本）、`vitest.config.ts`、`apps/worker/vitest.config.ts`、`apps/web/vitest.config.ts`
- **具体表现**：实测数据如下。

  | 运行方式 | 结果 |
  |---|---|
  | `pnpm test`（package.json 定义的 CI 命令） | ❌ **Errors 10，Test Files `no tests`，Tests `no tests`**，耗时 120s 后失败 |
  | 其中 worker 项目单独跑 | ❌ 8 个 cloudflare-pool runner 启动超时（`ECONNRESET` / `Timeout waiting for worker to respond`），17 个测试文件只有 7 个被执行 |
  | `vitest --maxWorkers=1`（worker） | ✅ 15 文件 / 31 用例全通过，耗时 3m32s |
  | `vitest --pool=threads`（packages+scripts） | ✅ 9 文件 / 29 用例全通过 |
  | `vitest --pool=threads --maxWorkers=1`（web） | ✅ 10 文件 / 12 用例全通过，耗时 7m53s |
  | `playwright test`（e2e） | ✅ 34 用例全通过，耗时 1.3m |

  **根因**：三份 vitest 配置均未设置 `maxWorkers` 或 `poolOptions`，默认按 CPU 核数并发。worker 项目每个测试文件都要拉起一个独立的 Miniflare/workerd 运行时实例，资源开销极大，并发拉起即触发启动超时。GitHub Actions 标准 runner 为 2 核 7GB，相比评审环境更弱，**同样风险甚至更高**。

- **影响范围**：
  1. CI 绿灯不可信 —— 要么随机失败打断迭代，要么出现本次这种「跑了 0 个用例却以 errors 失败」的情况，无法给出有效的质量结论；
  2. 更危险的是**反向假象**：若某次运行中部分文件静默未执行而退出码为 0，将产生「测试通过」的错误信号。当前脚本未对「实际执行用例数 > 0」做断言。
- **修复建议**：
  1. `apps/worker/vitest.config.ts` 增加 `test: { maxWorkers: 1, minWorkers: 1 }`（或 `poolOptions: { cloudflare: { ... } }` 的并发限制），并提高 `teardownTimeout`；
  2. `apps/web/vitest.config.ts` 显式 `pool: 'threads'` + `maxWorkers: 2`，避免默认 forks 池在容器环境下启动超时；
  3. CI 中增加一道断言：解析 vitest JSON 报告，若 `numTotalTests === 0` 则判失败；
  4. 建议将 `pnpm test` 拆分为 `test:unit` / `test:worker` / `test:web` / `test:e2e` 并在 CI 中分 job 并行，规避单进程内累积的资源压力。
- **优先级**：P0（这是「测试有效性」的根，不修则其余测试结论都不可作为验收依据）

### M-5　Worker 集成测试的运行时兼容性日期与生产不一致

- **定位**：`apps/worker/vitest.config.ts`（`miniflare.compatibilityDate: "2024-09-23"`）vs `wrangler.jsonc:5`（`compatibility_date: "2026-09-03"`）
- **具体表现**：所有 Worker 集成测试（认证、QSO、导入、卡片、模板、备份、公开端、契约）都在 2024-09-23 兼容日期下运行，而生产部署使用 2026-09-03，相差近两年。
- **影响范围**：Workers 的 compatibility date 决定运行时行为（fetch 语义、URL 解析、Node 兼容层、部分 Web Crypto 行为等）。测试验证的是旧运行时下的行为，**结论不能直接迁移到生产**。规范 §12.3 要求「生产变更必须兼容旧 Worker 与新数据库同时存在的短暂窗口」，并未授权用旧日期跑测试。
- **修复建议**：将 miniflare 的 `compatibilityDate` 与 `wrangler.jsonc` 对齐为同一常量（可从 wrangler 配置读取，避免二次漂移）；若有意为兼容性留出缓冲，应改为双版本矩阵并在 CI 中显式标注。
- **优先级**：P1

### M-6　限流 Salt 存在硬编码回退值，隐私设计可静默失效

- **定位**：`platform/rate-limit.ts:13,26`
- **具体表现**：

  ```ts
  const salt = c.env.RATE_LIMIT_SALT ?? "myqsl-salt-default";
  ```

  `RATE_LIMIT_SALT` 已被 `scripts/verify-production-config.mts:20-24` 列为生产必需 secret，但代码在缺失时**静默回退到源码中的公开常量**，而不是拒绝服务。

- **影响范围**：规范 §11-9 要求「IP 仅以日盐哈希写审计」，其安全性完全依赖于 salt 的机密性与按日轮换。一旦生产遗漏配置：
  1. 所有 IP 哈希使用源码中公开的固定盐，攻击者可离线构造彩虹表反解 IP，隐私设计归零；
  2. 降级是静默的 —— 运维无感知，日志与限流看起来一切正常。
- **修复建议**：改为 fail-closed：当 `APP_ENV === "production"` 且 `RATE_LIMIT_SALT` 缺失时，直接返回 503 并在结构化日志中告警，禁止使用回退值；本地/测试环境可保留回退但需打印醒目警告。
- **优先级**：P1

### M-7　公开卡片元数据缓存导致「作废后 410」最长延迟 5 分钟

- **定位**：`modules/public/routes.ts:18`
- **具体表现**：

  ```ts
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
  ```

  `stale-while-revalidate=300` 允许 CDN/浏览器在陈旧后继续提供旧响应最长 300 秒。

- **影响范围**：
  1. 与规范 §17 验收定义「已发布卡片……作废后公开页为 410」直接矛盾 —— 卡片作废后最长 5 分钟内，持旧缓存的客户端仍能看到 200 与卡片内容；
  2. 与规范 §11-3「所有数据请求设置 `Cache-Control: no-store`」不一致；
  3. 对 QSL 场景这不只是理论问题：卡片作废的常见原因正是信息有误，5 分钟的错误内容暴露期有实际影响。
- **修复建议**：公开卡片**元数据**改为 `no-store`（或 `max-age=0, must-revalidate`）；仅对内容寻址、永不变更的**图片**保留 `immutable` 长缓存（当前 `/image` 路由的 1 年 immutable 缓存是正确的，保持不动）。
- **优先级**：P1

### M-8　公开卡片/图片端点无限流，`enforcePublicLimit` 亦为零调用死代码

- **定位**：`platform/rate-limit.ts:24-33`（定义）、`apps/worker/src/index.ts`（注册处）
- **具体表现**：`enforcePublicLimit` 中间件已实现（IP 哈希 + Rate Limiting binding），但检索 `apps/worker/src` 全无任何注册点。公开端只有 `card-lookup` 通过内联调用 `enforceLookupLimit` 受了限流（规范点名要求的那个端点反而做到了），而：

  - `GET /api/v1/public/cards/:publicId` → 每次请求 1 次 D1 查询；
  - `GET /api/v1/public/cards/:publicId/image` → 每次请求 1 次 D1 查询 + 1 次 R2 读取；

  两者**均未限流**。

- **影响范围**：未认证用户可对这两个端点发起无限制请求。在免费版「10 万请求/日 + R2 每月 1000 万 Class B」的配额下，构成直接的成本与可用性风险；与管理端共享同一 D1 库，极端情况下会连带影响正常录入。
- **风险**：中高。
- **修复建议**：为 `/api/v1/public/*` 路由组注册 `enforcePublicLimit`；图片端点可设更宽松阈值（如 300/min）以兼顾正常浏览。同时为其补一个「超限返回 429」的集成测试。
- **优先级**：P1

---

## 3. 一般问题（Minor）

### m-1　`PATCH /api/v1/qsos/:id` 缺校验与规范化，更新后不重算去重键

- **定位**：`modules/qsos/routes.ts:91`、`modules/qsos/repository.ts:136-145`
- **具体表现**：
  1. 路由将 `await c.req.json()` 原样传给 `service.update()`，无 Zod 校验（对比 POST 路径使用了 `QsoInputSchema.parse`）；
  2. repository 层有字段名白名单（`comment/name/qth/rst_*/gridsquare/freq_hz/band/mode/submode`），**成功防住了批量赋值与越权字段**，但值本身无类型校验 —— `freq_hz: "abc"` 会经 `String(value)` 写入 INTEGER 列；
  3. 不做 trim / 大写规范化，与 `create()` 的 `normalizeQso()` 不一致，可能产生 `band: "40m"` 与 `"40M"` 混存；
  4. **白名单含 `band`/`mode`/`submode`，但更新后不重算 `dedupe_key`**。规范 §7.2 定义 `dedupe_key = SHA-256(station_callsign|call|qso_date|time_on|band|mode|submode)`，改了 band/mode 而键不变，会让去重索引与记录内容不一致，后续导入的相同通联无法被正确识别为重复。
- **影响**：数据正确性缺陷（第 4 点）+ 健壮性缺陷（第 2、3 点）。
- **修复建议**：PATCH 使用 `QsoInputSchema.partial()` 校验；更新后复用 `normalizeQso()` 规范化并重算 `dedupe_key`（同时检查是否产生新的硬重复）。
- **优先级**：P1

### m-2　错误处理吞没异常，故障被误报为并发冲突

- **定位**：`modules/qsos/routes.ts:95,104`、`modules/cards/routes.ts:52`
- **具体表现**：
  - DELETE 的 `catch` 把**所有**异常一律映射为 412 Stale（`routes.ts:104`），包含 D1 不可用等真实故障 —— 运维看到的是「版本冲突」，实际是数据库挂了；
  - `QsoNotFoundError` 被映射为 412（`routes.ts:95`），但记录本就不存在时应为 404；
  - 卡片 image 上传的 catch 一律返回 422（`cards/routes.ts:52`），含 R2 写入失败等服务端错误。
- **修复建议**：区分领域异常与基础设施异常，后者统一走 500 + 结构化日志；保留 `problem.ts` 的 RFC 9457 结构但细化 type。
- **优先级**：P2

### m-3　`PATCH /api/v1/card-templates/{id}` 缺失

- **定位**：`modules/templates/routes.ts`（已实现 GET 列表/详情/创建、GET 与 PUT/POST background，无 PATCH）
- **具体表现**：规范 §9.2 要求「修改模板；生成新模板版本，不覆盖背景对象」。当前模板一旦创建，只能更换背景图，无法修改布局、画布尺寸或元素。
- **影响**：功能缺失 —— 模板打错一个字就得重建并重新关联卡片。
- **修复建议**：实现 PATCH，按规范「生成新版本」语义递增 `version` 并保留旧背景对象键（内容寻址，不覆盖）。
- **优先级**：P2

### m-4　ADIF golden fixtures 覆盖不全

- **定位**：`packages/adif-codec/test/fixtures/`（仅 `minimal.adi`、`malformed.adi`、`unknown-fields.adi`）
- **具体表现**：规范 §14.1 要求 golden fixtures 覆盖 8 类：ASCII、CRLF、无 EOH、APP_ 字段、未知类型、截断记录、非法非 ASCII、10,000 条压力。实际：
  - 已覆盖：APP_ 字段（unknown-fields.adi）、截断记录（内联字符串测试）、非法非 ASCII（序列化侧抛错测试）；
  - **未覆盖**：CRLF 换行、缺失 `<EOH>`、带类型后缀的字段（`<FIELD:5:N>`）、解析期遇到的非法非 ASCII；
  - 10,000 条压力用例是**代码动态生成**的字符串，不是仓库中的夹具文件，无法被其他实现复用比对。
- **修复建议**：补齐 4 类缺失夹具，并把 10k 用例固化为 `fixtures/stress-10k.adi`（.gitignore 或直接入库，视体积而定）。
- **优先级**：P2

### m-5　ADIF 端到端未覆盖 10,000 条导入与断点重放

- **定位**：`tests/e2e/adif-flow.spec.ts`
- **具体表现**：整个 ADIF 端到端用例只导入 **1 条**记录。规范 §17 验收定义要求「10,000 条 ADIF 导入完成，错误可定位、重放无重复、未知字段导出仍存在」。此外：
  - 10k 解析性能只在 Node 单测环境覆盖（`packages/adif-codec/test/codec.test.ts:25-32`，断言 < 10s，通过）；规范 §12.1 要求的是「Playwright performance 测试，Web Worker 中解析且 UI 不冻结」——**UI 不冻结这一半完全没有验证**；
  - 断点续传（同 checksum 重放返回既有结果、不重复写库）无任何自动化测试，尽管服务端 `getChunkByIdempotency` 逻辑已实现。
- **影响**：规范点名的最重要一条验收项（10k 导入）实际未被端到端验证过。
- **修复建议**：增加一条 e2e，用生成的 10,000 条 .adi 走完整导入流程，断言：导入总数正确、主线程无长任务阻塞（PerformanceObserver 采集 long task）、中断后重放不产生重复、导出后未知字段仍在。
- **优先级**：P1

### m-6　备份恢复演练未自动化

- **定位**：`scripts/verify-backup.test.ts`（3 个用例）
- **具体表现**：规范 §17 明确「D1 SQL dump 已实际恢复到独立库并通过抽样哈希；**不能仅验证『文件存在』**」。当前 `verify-backup` 只做两件事：SQL 语法可解析、必需表存在。没有真实恢复到独立 D1，也没有抽样哈希比对。
- **影响**：备份可恢复性这一核心承诺缺乏自动化证据。规范 §16 把「R2 备份不可恢复」列为低概率高影响风险，而当前无手段提前发现。
- **修复建议**：把 `docs/runbooks/restore.md` 的手工流程脚本化，在 CI（或每月定时任务）中：创建临时 D1 → 恢复最近 dump → 校验表数/QSO 行数/随机 20 条哈希 → 销毁临时库。
- **优先级**：P1

### m-7　测试断言存在「空断言通过」风险

- **定位**：`apps/worker/test/modules/qsos.test.ts:64-74`
- **具体表现**：

  ```ts
  const bandData = (await bandRes.json()).data;
  expect(bandData.every((r) => r.band === "15M")).toBe(true);   // 空数组时恒为 true
  ...
  const dateData = (await dateRes.json()).data;
  expect(dateData.every((r) => r.qso_date === "20260901")).toBe(true);  // 同上
  ```

  若筛选逻辑失效返回空数组，`Array.prototype.every` 返回 `true`，用例依然通过。日期筛选分支完全没有非空断言。此外，用例名声称「supports band, **mode**, date_from, date_to filters」，但代码里**从未断言 mode 筛选**。

- **影响**：测试结论强度被高估，筛选回归可能静默漏网。
- **修复建议**：所有过滤类断言先断言 `length` 或 `toContainEqual` 具体记录，再断言集合属性；补全 mode 筛选断言。
- **优先级**：P2

### m-8　游标分页缺少端到端/集成测试

- **定位**：`packages/domain/test/cursor.test.ts`（仅 2 个纯函数用例）
- **具体表现**：规范 §9.1 要求游标分页、禁止 offset。`encodeCursor/decodeCursor` 的编解码有单测，但**没有任何用例验证跨页遍历不重不漏**（例如 50 条数据按 limit=20 翻 3 页）。
- **影响**：游标是分页正确性的核心，越界/边界（恰好整页、空结果、并发写入）未验证。
- **修复建议**：增加集成用例：插入 N 条 → 逐页遍历 → 断言并集等于全集且无重复。
- **优先级**：P2

### m-9　OpenAPI 双份冗余与备份接口路径偏差

- **定位**：`openapi/eQSR-v1.yaml` 与 `openapi/myQSL-v1.yaml`（各 824 行，内容完全相同）、`scripts/generate-openapi.mts:48-49`、`modules/backup/routes.ts:14`
- **具体表现**：生成脚本同时输出两份同名不同前缀的文件；规范 §9.2 的 `GET /api/v1/backups` 实现为 `GET /api/v1/backups/latest`。
- **影响**：冗余文件易致客户端引用错版本；接口路径与规范文档不一致会让自动生成的前端类型与文档漂移。
- **修复建议**：删除 `myQSL-v1.yaml` 并同步修改生成脚本；备份列表接口补 `/api/v1/backups` 别名或更新规范文档。
- **优先级**：P3

### m-10　公开索卡 POST 未做 Origin 校验

- **定位**：`apps/worker/src/index.ts:32-55`（`requireSameOrigin` 挂载范围）、`modules/public/routes.ts:29`
- **具体表现**：`requireSameOrigin` 只挂在 qsos / stations / imports / card-templates / cards / backups 六组路由，`POST /api/v1/public/card-lookup` 未挂。
- **影响**：有限 —— 该端点只返回公开卡片的最小字段，且已有 150ms 固定延迟与限流，跨站调用无实质收益。但与规范 §11-3「状态变更请求必须校验 Origin」的字面要求不一致。
- **修复建议**：为公开 POST 增加 Origin 校验（允许生产域名与无 Origin 的同类客户端），或显式在规范中记录豁免理由。
- **优先级**：P3

---

## 4. 优化建议（Suggestion）

### O-1　中间件注册顺序承载安全语义，结构脆弱

`index.ts:40` 先注册 public 路由、`:41` 再注册 `app.use("/api/v1/*", requireOwner)`，靠「public 处理器不调用 `next()`」这一隐式行为实现鉴权豁免。任何人调整注册顺序，都会导致公开端被鉴权拦截或管理端裸奔，且**没有任何测试能捕获这种回归**（因为当前测试都是端到端打真实路径，顺序变化会直接改变结果，但错误信息不直观）。

建议：改为显式路径白名单矩阵 + 单测断言「白名单内路径免鉴权、白名单外路径必须鉴权」，或在 `requireOwner` 内部按路径判断，消除对注册顺序的依赖。

### O-2　索卡固定延迟用 `setTimeout` 空转

`modules/public/routes.ts:43-45` 用 `await new Promise(r => setTimeout(r, 150 - elapsed))` 拉平命中/未命中响应时序。在 Workers 上这会真实占用请求时长（虽不计入 CPU 限制，但计入 wall time 与并发占用）。建议：仅在两侧差异确实可测时启用，并把这一权衡写入 ADR；或改为在响应体层面做时序归一化。

### O-3　公开卡片每请求重新解析快照 JSON

`modules/public/service.ts:9` 每次请求都 `JSON.parse(row.qso_snapshot_json)`。可在 publish 时把投影结果物化为列（或写入 KV），把每请求一次 JSON 解析降为 0。

### O-4　`attachImage` 先写 R2 后写 D1，可能留下孤儿对象

`modules/cards/service.ts:33,37` 先 `media.putImmutable()` 再更新 D1。D1 失败会留下永不被引用的 R2 对象。虽然内容寻址决定了它无害，但需要配套的生命周期规则清理。建议：先按 hash 查重，再上传，最后写 D1。

### O-5　Node 版本与 `engines` 声明不一致（评审环境）

`package.json:5` 声明 `"node": ">=24 <25"`，评审环境实际为 Node 22.22.2。虽然全部测试与类型检查均通过，但 CI 应锁定 24 LTS 并通过 `.nvmrc` 或 Actions 的 `node-version-file` 固定，避免环境漂移造成的「本地绿、CI 红」。

### O-6　统一 `problem type` URI 的定义方式

当前 40+ 处字面量硬编码 `https://myqsl.app/problems/*`。建议集中到 `platform/problem.ts` 的常量表导出，配合 B-3 的重命名一次改完，避免后续再次分裂。

---

## 5. 测试有效性专项评估

### 5.1 测试执行结果（实测）

| 测试层 | 命令 | 文件 | 用例 | 结果 |
|---|---|---:|---:|---|
| 领域 / 编解码 / 脚本 | `vitest --project packages --project scripts --pool=threads` | 9 | 29 | ✅ 全通过 |
| Worker 集成（Miniflare） | `vitest --config apps/worker --maxWorkers=1` | 15 | 31 | ✅ 全通过 |
| 前端单元（jsdom + RTL） | `vitest --config apps/web --pool=threads --maxWorkers=1` | 10 | 12 | ✅ 全通过 |
| 端到端（Playwright / Chromium） | `playwright test` | 5 | 34 | ✅ 全通过 |
| **合计** | | **39** | **106** | **✅ 100%** |
| 静态检查 | `eslint .` / `depcruise` / `tsc --noEmit` / `check-placeholders` | — | — | ✅ 零缺陷 |

补充：dependency-cruise 报告「147 modules, 315 dependencies cruised，no dependency violations」；占位符检查 `PLACEHOLDERS_OK files=84`；`tsc --noEmit` 对 `apps/worker` 与 `packages/domain` 均退出码 0。

### 5.2 有效性判断：**结论可用，但不足以支撑「首版完成」**

**正面依据**：

- 覆盖到了系统最关键的几条不变量：卡片状态机迁移、快照不可漂移、乐观锁 412、未知 ADIF 字段往返无损、非 ASCII 显式拒绝、未认证返回 401、未发布卡片公开端 404、导入限批与幂等重放。
- e2e 34 用例真实驱动 Chromium 走完整用户旅程（录入 → 列表 → 并发编辑 412 → 回收站 → 恢复），并在桌面 / pad / mobile 三档视口做了无溢出审计，质量高于同类项目的平均水平。
- 静态检查四项全绿，说明架构约束是被机检强制的，不是文档口号。

**削弱结论强度的四点**（对应上文 M-4、M-5、m-5、m-7）：

1. **执行命令本身不稳定**（M-4）：`pnpm test` 在受限环境跑了 0 个用例即失败；全绿结果依赖人工降并发取得。CI 上的真实表现未知，2 核标准 runner 风险更高。
2. **运行时版本不一致**（M-5）：Worker 集成测试跑在 2024-09-23 兼容日期，生产是 2026-09-03。
3. **规范 §17 的 8 条验收定义中，至少 3 条无任何用例证实**：
   - 「10,000 条 ADIF 导入完成，错误可定位、重放无重复」→ e2e 只导 1 条，重放无测试（m-5）；
   - 「D1 SQL dump 已实际恢复到独立库并通过抽样哈希」→ 只验证 SQL 语法与表存在（m-6）；
   - 审计相关能力 → 全仓库无一处断言 `audit_events`（M-1）。
4. **存在空断言用例**（m-7），筛选类断言在失效时仍会通过。

**结论**：现有测试足以支撑「核心闭环已打通、主要不变量成立」这一判断，**不足以支撑规范 §17 的「首版完成」宣告**。

### 5.3 稳定性观察

- `pnpm test` 单次运行：失败（0 用例，10 errors）。
- 降并发后重跑：连续 4 个测试层均一次通过，未观察到用例级 flaky。
- 需要独立验证的不稳定来源：Worker 测试的 Miniflare 并发启动（配置问题，非用例问题）、web 测试默认 forks 池在容器下的启动超时（配置问题）。
- **未发现**用例本身的随机失败（无 `retry` 掩盖、无 `skip`）。

---

## 6. 已核对且确认符合规范的项

以下项目经逐项核对确认实现正确，评审中未发现问题：

| 规范条款 | 核对结论 |
|---|---|
| §5.1 分层与禁止事项 | dependency-cruiser 零违规；`packages/*` 不依赖 Cloudflare / DOM / React；repository 不向 service 泄漏 Drizzle row |
| §5.2 模块职责 | 8 个模块（`stations/qsos/imports/templates/cards/public/backup/audit`）职责与规范一致 |
| §7.2 QSO 字段约束 | 主键自增、呼号大写 trim、`qso_date` YYYYMMDD、`time_on` 补秒、`qso_at` UTC 秒、`freq_hz` 整数 Hz、`adif_extra_json` 保未知字段、`(dedupe_key, duplicate_ordinal)` 唯一、`version` 从 1、软删除 —— 全部落地 |
| §7.3 卡片稳定性 | `qso_snapshot_json` / `template_snapshot_json` / `render_version='canvas-v1'` / `content_sha256` / `public_id = nanoid(22)`（≈132 bit 熵）齐备；R2 键内容寻址 `cards/{id}/canvas-v1/{sha256}.png` |
| §8.4 卡片不可漂移 | `public/service.ts` 只投影快照 JSON，**不回读 QSO 或模板** —— 已确认原 QSO 修改不影响已发布卡片 |
| §8.5 公开字段最小化 | 只返回 `call / station_callsign / qso_date / time_on / band / mode / rst_*`，不含备注、邮箱、设备、内部 ID |
| §8.5 防枚举 | 命中/未命中固定 150ms 最小延迟；限流 key = route + IP 日盐哈希 + 呼号哈希 |
| §9.1 API 全局约定 | snake_case、`/api/v1` 前缀、RFC 9457 `application/problem+json`、`limit` 上限 200、base64url 游标、ETag + If-Match、导入幂等键 —— 全部符合 |
| §9.2 / §9.3 接口清单 | 22 个规范接口实现 21 个（缺模板 PATCH，见 m-3）；`/healthz`、`/readyz` 语义正确（`/readyz` 受 Access 保护并做 `SELECT 1`） |
| §11-8 CSP | `default-src 'self'`、`object-src 'none'`、`base-uri 'none'`、`frame-ancestors 'none'` 齐备，另含 `form-action 'self'` 与 Permissions-Policy |
| §11-7 上传校验 | 卡片图校验 SHA-256（`X-Content-SHA256` 比对）、PNG 类型、写入内容寻址键；模板背景独立端点 |
| §12.3 幂等与乐观锁 | 卡片状态迁移全部由 `WHERE status = 'x'` 守卫，天然幂等；QSO PATCH/DELETE 强制 `If-Match` |
| §14.1 ADIF 保真 | 状态机解析（非大正则）、未知字段语义往返无损、非 ASCII 序列化时抛 `NON_ASCII_ADI` 而非静默替换/截断、截断值带 offset 报错、10k 解析 < 10s —— 均有通过用例 |
| §8.6 备份 | Workflow 调用 D1 Export REST API、流式写 R2、分级重试（3/8/3 次指数退避）、失败落 `backup_runs`、不把整个 dump 读入内存 |
| §13.2 生产预检 | `verify-production-config.mts` 能正确拦截：PUBLIC_ORIGIN 为 localhost、D1 占位 UUID、`TEST_AUTH_ENABLED=1`、必需 secret 缺失 |
| §6 强制规则 5 条 | 由 dependency-cruiser 与 ESLint 在 CI 中强制，实测零违规 |

---

## 7. 修复优先级与建议路线

### 7.1 P0 —— 上线前必须完成

| 编号 | 问题 | 工作量估计 |
|---|---|---|
| B-1 | 补齐生产 `PUBLIC_ORIGIN` / `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`，并在预检脚本中增加这两项校验 | 0.5 天 |
| B-2 | 填入真实 D1 database_id，资源名统一 `eqsr-*` | 0.5 天 |
| M-1 | 审计改为与业务同一 batch；补齐 PATCH/DELETE/restore/publish/void/导入/导出/备份审计点；补断言测试 | 1–1.5 天 |
| M-4 | vitest 配置加 `maxWorkers` / `poolOptions`；CI 增加「执行用例数 > 0」断言 | 0.5 天 |

### 7.2 P1 —— 首版验收前应完成

| 编号 | 问题 |
|---|---|
| B-3 | `myqsl` → `eqsr` 全局重命名；problem type URI 去域名依赖 |
| M-2 | 导入批次查询数从 ~124 降到 <10（批量预取 + `db.batch`） |
| M-3 | 实现软重复（±3 min）并启用 `warning` 桶 |
| M-5 | 测试 compatibilityDate 与生产对齐 |
| M-6 | 限流 salt 缺失时 fail-closed |
| M-7 | 公开卡片元数据 `no-store`（保留图片 immutable 长缓存） |
| M-8 | 公开端点注册 `enforcePublicLimit` |
| m-1 | PATCH 加 Zod 校验、规范化、重算 `dedupe_key` |
| m-5 | 补 10,000 条 e2e 导入 + 断点重放 + UI 不冻结断言 |
| m-6 | 备份恢复演练脚本化（临时库 + 抽样哈希） |

### 7.3 P2 / P3 —— 列入技术债

m-2（异常分类）、m-3（模板 PATCH）、m-4（ADIF 夹具补齐）、m-7（空断言修补）、m-8（分页集成测试）、m-9（OpenAPI 去重）、m-10（Origin 覆盖）、O-1 ~ O-6。

---

## 8. 评审方法与已核对范围声明

### 8.1 核对范围

- **规范文档**：`docs/superpowers/specs/2026-09-03-eqsr-final-architecture-design.md` 全文 567 行（§0–§18）。
- **生产代码**：`apps/worker/src`（platform 8 个文件 + 7 个模块）、`apps/web/src`（app / features / workers / lib）、`packages/*`（domain / adif-codec / card-renderer），共 5,097 行。
- **配置与基础设施**：`package.json`、`wrangler.jsonc`、`pnpm-workspace.yaml`、三份 `vitest.config.ts`、`dependency-cruiser.cjs`、`playwright.config.ts`、`infra/migrations/*.sql`、`.github/workflows/ci.yml`。
- **测试代码**：39 个测试文件、1,940 行，含 `tests/e2e/*` 5 个 spec。
- **脚本与文档**：`scripts/*.mts`（4 个）、`docs/runbooks/*`、`Review/` 历史评审记录。

### 8.2 核对方法

1. 静态通读关键路径源码，逐条比对规范条款；
2. 实际执行全部测试层（单测 / Worker 集成 / 前端单元 / e2e）并记录结果；
3. 实际执行 ESLint、dependency-cruiser、`tsc --noEmit`、占位符检查；
4. 用检索验证「死代码」「缺失实现」「测试覆盖缺口」三类否定性结论（例如 `executeBatchWithAudit`、`enforcePublicLimit`、`audit_events` 在测试中的引用、`soft`/`180` 相关逻辑），避免主观臆断；
5. 对存疑项（生产变量继承、Wrangler 环境合并语义）查阅配置并与代码实际读取路径交叉验证。

### 8.3 未覆盖 / 受限范围（声明）

- **Playwright 多浏览器矩阵**：`playwright.config.ts` 未定义 `projects`，仅用默认 Desktop Chrome 执行；Firefox / WebKit 未验证。
- **真实 Cloudflare 生产环境**：所有结论基于本地 Miniflare 与 Playwright，未做真实部署验证；Cloudflare Access 的真实 JWT 链路仅在「伪造 header → 401」层面验证，未接入真实 Access 应用。
- **性能目标 §12.1 的多数指标**：仅「10,000 条 ADIF 解析 < 10s」被覆盖（且为 Node 环境）；管理 API p95、公开卡片 p95、SPA LCP、40 条批次 < 2s、卡片渲染 < 3s 均未测量。
- **容量门槛 §12.2**：30,000 条 QSO 的 D1 占用（60–120 MB）为规范估算，未实测。
- **`pnpm -r typecheck` 全量递归类型检查**：在评审环境中超过 24 分钟未完成（疑似 `npx pnpm -r` 递归调用问题），改用 `tsc --noEmit` 对 `apps/worker` 与 `packages/domain` 分别验证，均通过；`apps/web` 与 `packages/adif-codec`、`packages/card-renderer` 的类型检查未单独执行（但 Playwright e2e 成功构建并运行了完整前端，间接说明构建期无类型阻断）。

---

*报告结束。所有问题项均给出文件级定位与可落地的修复建议；第 6 章列出已核对且确认无误的范围，第 8.3 章声明了本次评审未覆盖的部分，以便后续补充。*
