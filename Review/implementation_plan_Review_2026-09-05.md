# implementation_plan.md 复核意见与修改方案

评审日期：2026-09-05。代码基线：`d28d8c47f84a71689ec3e2ebc44fe9d4f84139ae`。

被评审文件：`/Users/zhangneil/.gemini/antigravity/brain/42f60b49-2615-4bef-818c-d8000a1d5bd3/implementation_plan.md`，共 147 行。

评审依据：上一份 `myQSL_Implementation_Review_2026-09-04.md`、新计划引用的 `eqsr_review_report.md`、当前实际代码和定向复现。文档中的“已完成”“当前执行”等文字仅作为待核实声明。本次是计划评审，没有实施业务修复，也未重新运行全量测试。

## 1. 结论

**需要修改后再执行；目前不能按“Phase A 已彻底闭环、Phase B～F 全量修复计划”放行。**

可保留的方向：生产/测试配置分离、业务与审计同一 D1 batch、批量预取去重数据、软重复只警告、PATCH 规范化、失败回滚测试。无需推翻模块化单体架构。

必须修正的重点：PATCH 默认值可能误清数据；batch 不自动解决零行更新、并发幂等和动态结果依赖；性能指标混淆往返与 SQL 数量；Phase A 尚有预检缺口；后续阶段遗漏原评审的重要交付物。下列 10 项均给出修改方式和验收条件。

## 2. 逐项问题与更改方案

### R1 / P1：不能直接使用 `QsoInputSchema.partial()` 作为 PATCH schema

**计划位置：65、97 行。**

在当前锁定依赖上直接执行得到：

```text
输入：{ comment: "edit" }
QsoInputSchema.partial().parse() 输出：
{
  submode: null, freq_mhz: null,
  rst_sent: null, rst_rcvd: null, gridsquare: null,
  name: null, qth: null, comment: "edit", adif_extra: {}
}
```

原因是创建 schema 带有默认值。若新实现执行 `{...current, ...parsedPatch}` 再保存，只改备注就会清空频率、报告、姓名、扩展字段等。这是本次运行现有代码确认的行为。

另一个缺口：完整创建 schema 的 partial 会允许 call/date/time/station 等字段，但计划只要求 band/mode/submode 变化时重算去重键；实际 `makeDedupeKey()` 还依赖 station_callsign/call/qso_date/time_on。

**替换方案：**

1. 新增独立、无默认值的 `QsoPatchSchema`，每项使用明确的 `.optional()`；使用严格字段白名单。
2. 首轮保持当前可编辑范围，并明确 API 使用 `freq_mhz`、持久化使用 `freq_hz`；不要顺手开放 call/date/time/station 的修改。
3. 缺失表示保留；显式 null 只用于允许清空的字段。空 patch 应拒绝或定义为无副作用，不能递增版本/写成功审计。
4. 从当前记录恢复完整规范化输入，再合并客户端实际提供的字段。频率不能因为 DB 与请求字段名不同而丢失。
5. 对新完整记录统一计算 dedupe_key；若以后开放日期/时间，同时更新 qso_at。检查复合唯一键 `(dedupe_key, duplicate_ordinal)` 的冲突及“保留重复”规则，冲突返回 409。

**验收：**只改 comment 后，所有未提供字段逐项保持不变；null/缺失/空请求各有测试；大小写与频率转换正确；更新冲突 409；过期 ETag 412；禁止字段 422。

### R2 / P1：把 SQL 放进 batch 不足以保证业务条件和成功审计一致

**计划位置：38～46、83、123～126 行。**

D1 batch 中一条 SQL 执行失败会回滚整批；但 `UPDATE ... WHERE version=?` 影响 0 行不是 SQL 错误。随后无条件插入 audit 仍会成功，甚至其他业务更新也已提交。官方语义见 [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。

现有 `stations/repository.ts` 先清除其他默认台站，再执行带版本条件的目标更新。如果目标版本过期，把成功审计简单附加在 batch 尾部，仍可能出现“返回 412、默认台站已被清除、还记了成功审计”。事后检查 `meta.changes` 无法回滚已提交 batch。

此外，当前数字 ID 依赖自增，计划中的 `RETURNING` 只会在整个 batch 完成后返回结果，不能在 JavaScript 中把前一条返回的 ID 动态 bind 到同一 batch 后续语句。现有“另一次请求查询 last_insert_rowid”也应在本轮淘汰。

**更改方案：**

1. SQL 内部显式保护整个状态转换：版本失配时，所有关联业务写均不发生，成功审计也不发生。
2. 使用带条件的 audit `INSERT ... SELECT`、事务内可验证的前置条件或明确的约束失败方案；在真实 D1 兼容测试中证明，而不是仅 mock `batch()`。
3. 新增实体 ID 的传递必须在 SQL 内完成，或先生成稳定 ID；保留整数 ID 时，用事务内 SQL 子查询/明确的 ID 获取顺序，并测试多个自增表不会串 ID。响应从 batch 的 RETURNING 结果提取。
4. 区分“状态转换成功”和“幂等返回已有状态”。重复 publish/void 不应再伪造一次状态转换成功事件。

**验收：**stale station update 后默认台站完全不变；0 行 QSO 更新不产生成功审计；重复状态请求不重复记转换；业务 SQL 和 audit SQL 失败均整体回滚。

### R3 / P1：导入计划缺少 checksum、并发重放和 complete 的关键约定

**计划位置：46、53～55、104～107 行。**

预取之后到 batch 提交之前，另一个请求可以提交相同记录或相同 chunk。batch 只能提供提交原子性，不能让之前的预取自动成为一致快照。计划没有说明这种冲突如何重读、分类和返回，也没有继承原评审的完整完成条件。

**更改方案：**

1. 定义客户端/服务端共享 canonical chunk 序列化规则；服务端重算 checksum，不信任请求值。
2. 幂等身份必须绑定 job_id、chunk_index、checksum；复用 key 却换 job/index/body 返回 409。
3. 同一批次内部维护已见 hard key 和 soft 候选，防止两条新重复记录同时进入待插入集合。
4. 依赖数据库唯一约束仲裁并发。失败后读取已提交 chunk：同一内容返回原结果；内容不同 409；若是跨 chunk QSO 冲突，重新读取候选并有界重试整个原子单元。明确重试上限及耗尽后的可重试错误。
5. chunk ledger、各分类、job counts、audit 必须同一事务提交，且 ledger 内 qso_id 与实际记录一致。
6. complete 只有在 chunk 连续、处理总数等于声明总数、没有未决上传时才允许转换；在事务内保护 against 并发上传。completed 不可再接受新 chunk；已有 chunk 的同内容重放可返回原结果。
7. 浏览器逐 chunk 保存确认状态；刷新后能查询 job/已确认 chunk，校验文件 hash 后续传。只在全部完成后写 sessionStorage 不构成断点恢复。

**验收：**并发同 chunk、跨 chunk 同 QSO、错误 checksum、跨 job 复用 key、故障回滚、缺 chunk complete、重复 complete、完成后上传、刷新续传均有测试。

### R4 / P1：`≤5 次往返`目标计算不完整，不能替代 50 查询预算

**计划位置：50～55、129 行。**

默认台站、hard duplicate、写 batch 三步漏计了 getJob、幂等 ledger 和 soft duplicate 候选查询。若各单独调用，已有六次往返。可以合并只读请求，但必须写清楚，而不是把整个 batch 的多条 SQL 算作一条查询。

40 条新记录若各一条 INSERT，再有 chunk、counts、单条 batch audit，就是 43 条写 SQL；再加约 5 条读 SQL，总工作量接近 48。若又逐 QSO 插入 40 条 audit，会接近 88。故“远低于 50”没有依据。

Cloudflare 文档分别规定了 Free 每次 Worker 调用 50 查询、每条 SQL 最多 100 个绑定参数；batch 内每条 statement 仍受查询限制。应分别统计往返、statement、参数、rows_read/rows_written 和耗时，不能凭一个 `batch()` 调用次数推断免费配额。[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

**更改方案：**

1. 将目标改为“明确查询账单，最坏路径不超预算；40 条正常批次 p95 <2 秒”，往返下降作为独立指标。
2. 台站不能只查默认台站：收集所有显式 station_id 批量查，只有无 ID 记录才回退默认值；非法显式 ID 不得悄悄改归默认台站。
3. 若每个 chunk 记一个聚合 audit，明确它代表哪些实体和分类；若每条 QSO 都要求 audit，必须重新设计 SQL 批量化或降低 chunk 大小，不能同时假设原 40 条预算仍成立。
4. 软候选查询不得为 40 条简单拼接超过 100 个 bind；采用受限分组查询，或经真实 D1 验证的 JSON 表参数等方式。
5. 对冲突重试也计入同一次 Worker 调用预算；需要时降低服务端允许的批大小并同步客户端协议。

**验收：**40 条全新、全重复、mixed station、全 warning、并发重试分别报告真实计数和时间。

### R5 / P1：软重复的数据来源、入库语义和 UI 闭环不完整

**计划位置：14、53～61、77、127～129 行。**

hard dedupe_key 包含准确时间，因此仅查询 `WHERE dedupe_key IN (...)` 不可能取回 ±180 秒候选。文件清单提到了候选查询，但步骤没有定义选择字段、范围、批内比较、跨 chunk 一致性。

“warning 桶”也必须明确：它是已经成功入库但带警告，不能既算 ready 又算 warning，更不能只告警不写入。计划要求前端显示警告，却没有列出 ImportPage/controller 的修改。

**更改方案：**

- 分开预取 hard key 和 `(call, band, mode, qso_at)` 时间候选；比较数据库候选及同批较早接受的记录。
- 固定 UTC 秒单位，覆盖正负 180 秒、跨 UTC 日界线及硬重复优先规则。
- 明确回收站记录是否参与 hard/soft 判断；明确按原规范跨台站比较还是限定台站，不能优化过程中隐式改变语义。
- 为同一 job 的并发 chunk 明确警告一致性：最低复杂度方案是服务端按 chunk_index 顺序分类提交（前端仍可最多两请求在途），否则需要专门设计并发候选协调。
- 每条只属于一桶：`ready + warning + duplicate + rejected = processed`，新增行数为 `ready + warning`。
- 加入前端分类汇总、逐条 warning/rejected 详情，避免全部 rejected 仍显示“导入成功”。

### R6 / P0：Phase A“彻底闭环”声明不成立，需要补一个 A2

**计划位置：3、22 行。**

`d28d8c4` 的实质进步应认可：顶层已经是 production，核心绑定在顶层，测试使用独立 config，secret 查询失败/空列表默认会报错，compatibility date 已对齐。因此，上次“缺少 --env production”不再是当前错误，不能机械重加该参数。

但当前 `verify-production-config.mts` 仍有以下缺口，本次已定向复现：

1. 设进程 `APP_ENV=local` 并执行检查，脚本列出错误后仍返回 exit 0。`deploy:prod` 调用预检没有 `--strict`。
2. 用进程 `D1_DATABASE_ID` 指定一个格式合法测试 UUID，并 `--strict --skip-secrets`，当前占位配置仍能输出 `PRODUCTION_CONFIG_OK`。这个进程值没有替换 `wrangler.jsonc` 的实际 binding。该复现只隔离本地配置判断，没有验证或跳过真实生产 secret 后进行部署。
3. `validateProductionConfig()` 在不传 accessTeamDomain/accessAud、其他值完整时返回 `{valid:true,issues:[]}`。缺少 Access 配置没有被拒绝。
4. Workflow 需要的 runtime account/database ID 仍未配置，也未进入预检；D1 binding ID 与用于 REST 导出的 runtime database ID 没有一致性校验。
5. `ACCESS_AUD` 同时在 vars 中放了人造值，又列为必需 secret，配置来源不统一。

**更改方案：**

- 把状态改为“Phase A 隔离机制已提交，A2 预检完整性待修，生产资源待配置”。
- 生产发布预检无条件 fail-closed；诊断模式另设命令，不得以 `PRODUCTION_CONFIG_OK` 表示跳过的校验。
- 校验实际 Wrangler config 的 DB binding，不让任意进程变量覆盖校验目标；若用配置生成器，就先生成确定的配置文件并让预检/迁移/deploy 同用该文件。
- 必填 Access team/AUD、runtime account/database ID；校验 backup database ID 等于 DB binding ID。
- Access AUD 选择 vars 或 secret 的唯一来源；不按 `myqsl` 字样猜测域名是否有效，真实值从已授权账户配置取得。
- 生产资源尚未提供时，预检应预期失败，单元测试可通过；不能把“所有测试绿”表述为“生产预检绿”。

**验收：**不良配置的进程覆盖无法让实际部署目标被错误放行；Access 任一必填缺失非零；backup IDs 不一致非零；production-like 拒绝两类测试身份；附有效配置与目标清单。

### R7 / P1：新 Phase B～F 不是覆盖上一评审的“全量计划”

**计划位置：19～28 行。**

阶段可以重排，但必须保留交付物。当前 C～F 只有一句概要，以下内容没有明确实施位置、文件和验收条件：

| 上一评审要求 | 新计划缺口 | 应归属 |
|---|---|---|
| dump 流式写 R2、重复任务不误杀、失败/完成账本、monthly 与 lifecycle 读回 | 仅“恢复演练自动化”，不能替代备份生产链路修复 | F1 |
| 独立库 count/canonical hash、R2 文件 hash、verified_at | 没有具体协议与输出 | F1 |
| 共享 schema → OpenAPI → types/client，CI 再生成无 diff | “契约冗余清理”不足以保证真实生成 | E |
| 原子审计覆盖 backup、未来 template PATCH、导出与拒绝事件的独立语义 | B 覆盖表缺少这些模块；导出/拒绝不属于业务事务，需另定义 | B/F1 |
| 字体加载、PNG hash 上传、快照渲染、背景像素断言、错误恢复 | “管理端功能”没有可执行分项 | E |
| GitHub remote、required checks、唯一 Workers Builds、实际恢复/回滚和 7 天观察 | 从阶段列表消失 | F2 |
| bundle/placeholder/API drift 加入 CI，而非只本地运行 | 验证节没有 CI 修改项 | 各阶段及 F2 |

**更改方案：**采用文末修订阶段表，并建立“来源报告 + 问题 ID → 任务 → 文件 → 验收 → 证据”矩阵。拒绝或延期项也写出理由，不应静默丢弃。backup 由 Workflow 执行的审计用 system actor 与 instance ID，不伪造用户请求。

### R8 / P1：ADIF 阶段遗漏已有字段损失，不能只改性能

**计划位置：25 行。**

本次补充确认了上一份报告未充分展开的数据问题：现有 `recordToQso()` 把 `FREQ=14.250` 转为 `freq_hz=14250000`，而 `QsoInputSchema` 只接受 `freq_mhz`，规范化后 `freq_hz` 实测为 null。导出 mapper 把内部字段直接转成 `FREQ_HZ`，没有生成约定的 ADIF `FREQ`。

同样，`OPERATOR_CALLSIGN` 被认作核心字段从 extras 移除，却没有写进返回对象；extras 导出还能覆盖核心字段，实测 `{call:"BG4YYY",adif_extra:{CALL:"WRONG"}}` 输出 CALL 为 WRONG。

**更改方案：**C 同时修复字段语义和 Worker：建立明确的 ADIF↔API↔DB 字段表；频率遵守 API freq_mhz→DB freq_hz→ADI FREQ；未真正映射的字段留在 extras；export 的核心字段优先；类型与大小写处理明确。增加频率、OPERATOR、MY_*、APP_*、冲突 extras 的真实 DB 往返测试。10k 吞吐测试不代替数据保真。

### R9 / P1：引用第二份报告时必须纠正其错误依据

**计划位置：3、26～28 行，尤其 B-3、M-4、M-7、O-4 的映射。**

不能把两份报告所有建议直接并集：

- 第二报告声称命名环境继承顶层 vars，错误；已由上次 Wrangler dry-run 证伪，当前顶层生产改造合理。
- “全局 myqsl 改回 eqsr”不是修复必要条件。现有改名 commit 已形成一致主要包命名，应保留 myQSL，清理重复产物和旧别名；是否重命名属于产品选择，不能仅凭旧规范重新翻转。
- “默认测试必然不可用”与上次 Node 24 全量通过的实测矛盾。可为受限 runner 调整并发，但不能只因另一环境失败就判定 CI 必然失败，也不能为了测试数字调整断言。
- M-7 建议图片 1 年 immutable 全部保留不动，过于绝对。当前 HTTP URL `/public/cards/:publicId/image` 未包含内容 hash，且其访问状态会随 void 改变。若要求后续浏览器访问及时体现 410，则 metadata 和该状态相关图片 URL 都需再验证缓存或 no-store；已下载图片无法撤回。若另设可永久缓存的内容寻址图片 URL，必须单独明确作废语义。
- O-4 提到 R2 孤儿对象是真风险，但不得反向改成先提交 D1 引用再上传。正确顺序仍是“验证当前状态 → 内容寻址 R2 写 → 有条件 D1 metadata+audit 提交”，孤儿对象采用宽限期、复查引用后回收；不能在失败时盲删可能被并发成功请求引用的对象。

**更改方案：**D 明确定义缓存撤销语义与限流；E 保留当前品牌；F 的测试调整依据本轮失败证据和真实 CI runner。对这些取舍增加短决策记录。

### R10 / P2：验证和文件清单还不足以指导直接实施

**计划位置：71～147 行。**

- 台站/模板/卡片只列 service/routes，但 statement builder 改造还需 repository；新增 template PATCH 时审计也应同步。
- 没列前端四桶反馈、导入状态查询/续传、CI、可能的迁移与 OpenAPI 契约修改。
- 要在新构建后执行 bundle 检查，避免检查旧 dist；用 `pnpm run check` 明确包含 build。
- `74+` 测试数量不能证明覆盖；应记录实际报告、0 failed、0 skipped 关键测试和失败场景证据。
- 179/181 秒之外必须覆盖恰好 ±180 秒、日界线、批内、跨 chunk、回收站与不同台站语义。
- 原始命令可由根 Vitest projects 发现对应项目，不判其必然无效；为减少启动无关 Cloudflare 项目，建议显式 `--config` 和 `--project`。

建议验证命令：

```sh
pnpm exec vitest run --config vitest.config.ts --project packages packages/domain/test/dedupe.test.ts
pnpm exec vitest run --config apps/worker/vitest.config.ts apps/worker/test/platform/write-unit.test.ts apps/worker/test/modules/atomic-audit.test.ts apps/worker/test/modules/imports.test.ts
pnpm run check
CI=1 pnpm test:e2e
pnpm check:bundle
pnpm check:placeholders
# E 完成生成管线后再启用：
pnpm generate:openapi
pnpm generate:api
git diff --exit-code -- openapi apps/web/src/lib
```

## 3. 建议替换的阶段与退出条件

| 阶段 | 明确交付物 | 退出条件 |
|---|---|---|
| A2 预检补齐 | 部署实际配置唯一来源；必填/secret fail-closed；backup IDs 一致 | 错误配置全被拒绝；真实资源未配置就保持上线阻断 |
| B1 PATCH 与写单元 | 无默认值 PATCH；零行写保护；安全 ID 关联；审计脱敏 | 仅改备注不清空字段；stale 无副作用；双向回滚 |
| B2 导入事务与预算 | 校验和；幂等；批内/跨 chunk 去重；soft warning；complete；查询账单 | 正常、错误、并发、重放矩阵通过；预算不超限 |
| C ADIF 完整闭环 | 字段映射保真；增量 Worker；进度/取消；查询状态/续传；四桶 UI | 有频率的 DB 往返与 10k 浏览器测试；刷新/取消正确 |
| D 公开安全 | 必需 salt；公开端限流；metadata/image 作废缓存语义 | 同浏览器缓存后作废验证；无凭据公开可读；超限 429 |
| E 管理端与契约 | template 编辑；快照/字体/PNG hash；真实生成 client；单 OpenAPI | 编辑/制卡 E2E；失败不误发布；生成无漂移 |
| F1 备份恢复 | durable polling、stream、重复运行保护、monthly/lifecycle、独立恢复 hash | 大文件不整体缓冲；恢复 count/hash；远端规则读回证据 |
| F2 CI 与上线 | CI 全门禁；GitHub 分支保护；单 Workers Builds；发布/恢复/回滚/7 天观察 | 外部证据齐全才允许宣布可生产使用 |

B/C 的纯本地开发不必等待用户配置云端资源；A2 机制未修好时严禁尝试生产部署。每阶段只在对应验收通过后标为完成。云端凭据和域名不能用看似真实的猜测值填充。

## 4. 可直接反馈给实施 AI 的评审结论

当前计划方向通过，具体执行方案退回修改。先补 A2 与 B1/B2 详细设计，再进入实施。必须移除 `QsoInputSchema.partial()` 的直接复用；定义零行写入、动态 ID、并发幂等、checksum、complete、软重复与查询预算；在 C 修复字段保真；把备份生产链路、生成型 client、CI 及真实 GitHub/Cloudflare 验收放回阶段表。保留已正确完成的生产/测试配置隔离和 myQSL 命名，不按第二报告机械回退。

本报告中的修复方案是后续实施依据；本轮仅复核计划及针对性验证，不构成任何生产发布完成声明。
