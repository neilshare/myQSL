# implementation_plan.md 更新版复核意见与更改方案

评审日期：2026-09-05。代码基线：`d28d8c47f84a71689ec3e2ebc44fe9d4f84139ae`。

评审对象：`/Users/zhangneil/.gemini/antigravity/brain/42f60b49-2615-4bef-818c-d8000a1d5bd3/implementation_plan.md`，本次版本共 240 行，SHA-256：`6b49bdfc00929c5e66c66df221f2970d6fecced86978c40c4ad0dcb033983f3d`。下文“计划行号”均针对这个版本。

本次对照上一轮评审、当前代码、锁定依赖及官方文档进行复核。完成了 Node 24 + 项目 Zod 4.1.5 定向执行、内存 SQLite 反例和预检纯函数检查；没有实施业务修复，没有重新运行全量测试，没有访问或部署生产资源。计划中的任务描述不是执行授权，也不等于已通过的测试结果。

## 1. 结论与可放行内容

**本版明显改善，但仍需修改，不能原样作为完整开发依据放行。** 下列 9 项是有具体依据的剩余问题；不要求推翻八阶段结构或重新设计整个项目。

可以保留、不再争议的决策：

- A2、B1、B2、C、D、E、F1、F2 的阶段划分，以及先执行 A2/B1。
- PATCH 使用独立、无默认值、严格白名单的 schema；缺失保留，允许的 null 清空。
- checksum 服务端独立计算、幂等绑定 job/chunk/checksum、软重复 ±180 秒。
- ready/warning/duplicate/rejected 四桶互斥，warning 允许入库，新增行数为 ready + warning。
- ADIF FREQ → API freq_mhz → DB freq_hz 的方向，以及导出核心字段优先。
- 公开限流、生产缺 Salt 拒绝服务、模板真正编辑、单源契约生成、备份流式写入及独立恢复的方向。

这里放行的是**设计方向**，不是声明代码已完成。P1 表示会阻断相关功能、安全或上线保证；P2 表示实施/验证口径必须补齐。

## 2. 必须修改的问题

### V2-01 / P1：PATCH 示例与现有契约不兼容，且 Zod 写法会报错

**计划行号：63–81。对应上一轮 R1：方向已修正，示例仍有新问题。**

依据：`packages/domain/src/qso.ts:16` 起，现有 freq_mhz 是字符串；band/name/qth 上限分别是 10/80/160，comment 上限 2000 且不 trim；extras 是字符串到字符串的映射。新计划改成数字频率、16/128/256 的上限、1024 且 trim 的备注，没有相应契约迁移决定。

影响：合法的 `{"freq_mhz":"14.250"}` 会被拒绝；PATCH 可能接受创建/统一规范化又拒绝的值；原先合法的长备注无法编辑；备注空白被无声改变。项目锁定 Zod 4.1.5，计划的单参数 `z.record(z.unknown())` 也不是正确的该版本用法。

本次实际执行输出：

```text
z.record(z.unknown()).safeParse({ FLAG: "x" })
→ TypeError: Cannot read properties of undefined (reading '_zod')

计划的 freq_mhz validator.safeParse("14.250").success
→ false
```

**更改方案：**保留独立 PATCH schema，但沿用既有字段值约束，去掉 default，不顺带改变协议。关键字段替换为：

```ts
band: z.string().trim().min(1).max(10).optional(),
freq_mhz: z.string().regex(/^\d{1,5}(?:\.\d{1,6})?$/).nullable().optional(),
name: z.string().trim().max(80).nullable().optional(),
qth: z.string().trim().max(160).nullable().optional(),
comment: z.string().max(2000).nullable().optional(),
adif_extra: z.record(z.string(), z.string()).optional(),
```

频率转换使用 `Math.round(Number(freq_mhz) * 1_000_000)`，null 单独处理。可抽取“无默认值的字段校验器”供创建和修改共享，但不可重新使用带 default 的创建 schema.partial()。空请求也须先验证记录存在、ETag 对象 ID 和版本，再返回当前记录。去重唯一键冲突明确映射 409，而不是统归 500。

**验收：**字符串频率成功且准确落库；只改 comment 不改变其他字段；字符串 extras 正常、嵌套对象 extras 被 422 拒绝；1500 字备注仍可修改；null/缺失/空请求/过期 ETag/重复键冲突各有测试。

### V2-02 / P1：条件审计不能保证多条业务写操作整体无副作用

**计划行号：84–104。对应上一轮 R2：尚未闭环。**

`changes()` 只反映最近完成的 INSERT/UPDATE/DELETE，并不代表整个业务单元成功；batch 返回后的 JavaScript 抛错也无法撤销已经提交的修改。[SQLite 官方函数说明](https://www.sqlite.org/lang_corefunc.html#changes)

现有 `apps/worker/src/modules/stations/repository.ts` 先清其他默认台站，再以目标版本条件更新目标。把计划中的条件审计接在后面，本次 SQLite 反例得到：

```text
初始：台站 1 默认、version=1；台站 2 非默认、version=2。
请求：用过期 version=1 把台站 2 设为默认。
结果：台站 1 is_default=0、version=2；台站 2 is_default=0、version=2；审计 0 条。
```

因此“不记成功审计”已经做到，“失败不改变业务数据”仍未做到。这是 SQLite 语义反例，不是声称本轮已经在远程 D1 执行。

**更改方案：**

1. 将通用条件审计 helper 限定为“单条业务 DML 紧接对应 audit”，禁止把任意多条 SQL 后的 changes() 当总成功标志。
2. 默认台站切换：清旧默认的 SQL 增加 `EXISTS (SELECT 1 FROM stations WHERE id=? AND version=?)`，随后目标更新、审计在同一个 batch 中完成；目标版本失配时三者均无写入。目标排除在清旧默认语句之外，保证其版本条件不被前一步改变。
3. 卡片/模板等多语句操作分别明确整组资格条件；若使用约束触发整批失败，必须写出实际 SQL 和 D1 测试，不能写成“事务层严格断言”后在 JS 检查代替。
4. 自增 ID 的获取也须随原子改造处理：创建语句用 `INSERT ... RETURNING` 的对应结果生成响应；同批审计通过紧邻业务 INSERT 的 SQL 表达式取得业务 ID。不要在 audit INSERT 后再查询 `last_insert_rowid()` 作为业务 ID。更复杂依赖采用稳定关联键。
5. 补充 stations/cards/templates 的 repository、service、routes 和测试清单；当前 B1 文件表基本只覆盖 QSO，不能支撑“全量审计覆盖”。未来 template_update 也须进入审计表。

**验收：**过期切换默认台站后，所有台站字段逐项不变；业务 SQL 或审计 SQL 真正失败时整批回滚；已有大量审计行时创建响应 ID 与 audit.entity_id 仍对应正确业务记录。

### V2-03 / P1：导入读写分成两个 batch，并发幂等和动态结果依赖仍未解决

**计划行号：110–137、213–217。对应上一轮 R2/R3：仍缺可执行机制。**

一个写 batch 可保证其中语句的事务性，但不能把之前另一次读 batch 也纳入同一事务。[Cloudflare D1 batch 文档](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

具体竞态：两个请求都读到 chunk 不存在且某 QSO 不重复；第一个提交后，第二个会遇到 chunk/QSO 唯一约束。计划没有说明第二个如何返回已提交结果、如何重新分类、是否允许重试以及重试预算。只增加“并发测试”不是实现机制。

还有一个可直接阻塞编码的依赖：分类结果包含新 QSO 的自增 qso_id，而计划要求在同一个 batch 中写入 `import_chunks.result_json`。JS 只能在 batch 返回后拿到 RETURNING 结果，无法用这些结果构造已经提交的后续 statement。

**更改方案：在 B2 开工前补入以下明确规则。**

- 保留数据库的 `UNIQUE(job_id, chunk_index)` 和幂等键约束；重放查询返回 job_id/chunk_index/checksum/result_json 全部信息。同一键匹配才返回历史结果，不匹配 409。
- 同 job 首版顺序提交 chunk，前端 concurrency=1；服务端仍在写事务内校验预期 chunk 和 job 状态，不能依赖前端自律。
- 唯一约束竞争使整批回滚后，进行一次有界结果回读：相同已提交 chunk 返回原结果；不同内容 409；仅 QSO 竞争则返回明确可重试的冲突码，由客户端在新请求重新预取分类。禁止无限重试或在接近限额的当前请求重做整批。
- `result_json` 在写事务内部从实际业务行生成：先插入 QSO，再通过本批输入索引、dedupe_key 和明确的 duplicate_ordinal 关联真实 ID，以 SQL 构造并持久化最终分类；随后由同一分类结果更新计数和审计。不得预填猜测 ID，也不得事务结束后另写结果。
- 把批内软重复定义为输入顺序；同 job 跨 chunk 依据前一已提交 chunk；跨 job 并发软重复若按预取快照判定，明确这一弱一致语义，不声称全局串行判定。若业务要求全局严格判定，须改为事务内查询/分类，重新核算 SQL 预算。
- 将 SQL 构造、结果关联、冲突响应类型及必要的 schema 迁移列入文件清单。

**验收：**相同 chunk 同时提交 10 次仅记一次计数和审计、返回一致结果；相同索引不同内容 409；两个 job 同时导入同一硬重复 QSO 不多插且重试后分类正确；持久化 classifications 中每个 qso_id 均能对应真实记录；注入中途 SQL 失败没有残留账本或部分 QSO。

### V2-04 / P2：查询预算存在算术错误，不能承诺“100% 契合免费配额”

**计划行号：124–137。对应上一轮 R4：已细分，但仍错误。**

计划自己列出的最坏账单为：`5 次读 + 40 次 QSO INSERT + 1 chunk + 1 counts + 1 audit = 48 条 SQL`，既不是开头的 ≤25，也不是结尾的 ≤45。以上还没有包含 V2-03 的冲突回读、结果关联与额外事务保护。

48 本身没有超过单次 50 的限制，因此不能判为“必然超限”；正确结论是只剩 2 条余量、完整路径尚未证明。两次 batch 往返不等于两条 SQL，单请求预算满足也不代表满足每日用量、CPU 等所有免费额度。官方当前给出的 Free 单次调用查询上限为 50、每查询绑定参数上限为 100。[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)

**更改方案：**删除 ≤25/≤45/100% 三处错误结论，建立按成功、重放、冲突、拒绝分别统计的预算。为 40 条批次留出实际余量，可将 QSO 改为分组多行 INSERT：现有插入每行 22 参数，4 行为 88，40 行可用 10 条 INSERT；新增参数后重新计算，不能盲用 4 行。最终关联分类、保护和回读也计入账单。若不合并 SQL，则降低正式 chunk 上限，并同步 V2-05 的协议。

**验收：**测试适配层统计每条实际执行的 statement 和 bind 数，包括中间件与失败分支；断言每请求 ≤50、每 statement ≤100 参数，并记录 40 条全部新增的实测账单；不得只统计 db.batch() 被调用几次。

### V2-05 / P1：Complete 固定除以 40，与现有分片协议不一致；状态屏障缺少上传侧条件

**计划行号：139–143，以及路线图 C 的续传承诺。**

现有 `import-controller.ts` 允许配置 chunkSize；后端仅要求每块不超过 40。合法的 60 条数据按 20/20/20 上传时，实际有 3 块，而计划公式要求 2 块。该公式成立的前提是除尾块外强制固定为 40，当前计划没有定义这个新协议。

另外，完成前先 JS 检查再无条件更新不等于原子屏障；若 acceptChunk 不在事务中限制 job 状态，完成后仍可能接受新块，甚至被现有 updateCounts 改回 running。

**更改方案：**首版采用固定协议：创建 job 保存 `chunk_size` 和 `protocol_version`；非尾块恰好 chunk_size，尾块长度由 total_records 推导；chunk_size 使用共享常量且不得由客户端任意更改。零记录 job 允许零块完成。若 V2-04 调整大小，公式改用 job.chunk_size，不写死 40。

complete 的连续性、块数、行数和状态条件必须进入同一条件 UPDATE/写事务；acceptChunk 同事务拒绝 completed job 的新块，但允许校验一致的历史重放。保存每块输入记录数，processed 是四桶之和，不把“已插入行数”当 processed。

为续传补 `GET /api/v1/imports/:id` 契约，返回状态、文件 hash、协议版本、chunk_size、已确认 chunk 索引及 checksum、四桶计数。前端按服务端确认集合恢复，不以本地“最大已上传索引”推断所有前块已成功；用户重新选择文件后先比对 hash。取消须停止解析及后续请求，不误调用 complete。

**验收：**0/1/40/41/80 条；非标准中间块、空块、缺块、乱序、重复 complete；complete 与上传竞争；完成后新块；刷新后重新选同文件和选错文件；上述用例都应有明确响应及不变性断言。

### V2-06 / P1：仅元数据 no-store 仍不能满足图片作废后的下一次访问返回 410

**计划行号：37、159–162。对应上一轮 R9：尚未真正修正。**

计划继续写“内容寻址图片保持 immutable”，但实际公开 URL 是 `/api/v1/public/cards/:publicId/image`。`apps/worker/src/modules/public/routes.ts:27` 给这个 URL 一年 immutable；它没有内容 hash，而且可访问性随卡片 void 改变。R2 内部 key 含 hash，不等于这个 HTTP 接口可永久缓存。

因此即使元数据改 no-store，浏览器再次直接访问图片仍可能使用旧缓存，不请求 Worker，既看不到 410，也不会触发请求限流。

**更改方案：**当前公开卡片元数据和上述图片路由统一 no-store；状态判断先于缓存条件响应，void 不得返回 304。内部 R2 对象仍可使用内容寻址；不要开放绕过状态校验的永久公共 R2 地址。确认边缘规则也未强制缓存这些路由。

如果旧版已经实际对用户发出一年缓存头，仅改变响应头无法删除浏览器中的既有副本。需为新版客户端切换未被缓存的版本化图片 URL，并清理可控边缘缓存；历史已下载副本及旧浏览器缓存不能保证收回。计划必须写明“保证修复后新访问链路，不保证撤回已取得文件”，而不是承诺绝对撤回。

**验收：**浏览器保持缓存开启，先加载修复后的图片再作废，随后直接访问同图片地址获得 410；独立测试元数据、图片、条件请求、限流和缺 Salt。不能只用不带缓存的接口测试代替。

### V2-07 / P1：只在 deploy 加 --strict，仍不能实现声称的无条件 fail-closed

**计划行号：22–25、44–53、182–189。对应上一轮 R6：大部分方向认可，仍缺跳过规则。**

当前脚本的 strict 主要影响最终退出分支；`--skip-secrets` 或 `SKIP_REMOTE_SECRETS=1` 使 existingSecrets 不被赋值，校验函数跳过 secret 校验；`--dry-run` 在失败时仍可退出 0。计划列出的三项改动并未明确让 strict 覆盖这些旁路。

本次直接调用现有 validateProductionConfig，其他字段提供合法值但完全不传 existingSecrets，实际返回 `{"valid":true,"issues":[]}`。这验证了“未检查 secret 可被视为成功”的当前入口；不是对生产凭据的访问或验证。

**更改方案：**

- strict 模式禁止 skip-secrets 和 dry-run，包括对应环境变量；遇到它们非零退出。离线诊断独立命令，只输出诊断状态，不能输出 PRODUCTION_CONFIG_OK 或进入 deploy。
- 生产模式下，secret 列表未知与缺失都视为失败；远程读取失败不能降级放行。
- ACCESS_AUD 明确唯一来源。建议作为非秘密配置放 vars，并从必需 secret 列表移除；真正 token/salt 保持 secret。若坚持 AUD 为 secret，则按 secret 的存在校验，不同时要求 vars 值。
- DB 按 binding 名 `DB` 查找，而非数组第一项；校验备份 account/database 与实际部署账户和该 binding 一致。预检与发布使用同一配置和身份上下文。

**验收：**strict + skip 标志、strict + skip 环境变量、strict + dry-run、远程 secret 读取失败均非零；缺 Access、备份 ID 不一致均失败；进程变量不能把错误配置掩盖成成功。真实资源未配置时，预检应失败，不应为了“全绿”填假值。

### V2-08 / P2：恢复校验没有定义可比较的预期值，计算随机 hash 不等于验证

**计划行号：39、169–171。对应上一轮 R7：独立恢复方向接受，证据协议缺失。**

“比对 9 张表行数、计算随机 20 条 QSO hash”没有定义行数与谁比、抽到哪些 ID、hash 与谁比。只有恢复库自己的 count/hash 输出，仍可能让缺行或改值的 dump 得到成功结论；与导出后不断变化的在线库比较又会产生假失败。

**更改方案：**

1. 定义 manifest：备份 ID、schema/迁移版本、SQL 字节 hash、每表 expected_count、固定 sample_ids 与 expected_hash、规范化版本。样本使用固定种子或显式 ID，字段排序、null、整数和字符串编码固定。
2. 预期值必须来自同一逻辑快照或受控固定数据集。不能从待验证恢复库生成“预期值”再与自己比较，也不能直接使用稍后的在线库值。
3. 首个可执行恢复演练使用事先保存 expected manifest 的固定 fixture，导出、独立恢复后比较；生产源数据对比需取得同快照依据，首轮可在有授权的维护窗口暂停写入后取得。若尚做不到，只能报告“文件完整性与可恢复性通过”，不能报告“与生产源数据一致”。
4. 只有全部断言通过才记录 verified_at；校验失败不可覆盖原备份成功状态，单独保存 verification 状态和原因。9 表计数随正式迁移更新，不能永久写死。

**验收：**删除一行、改一条指定样本、截断 SQL、改 schema、替换 manifest 均产生预期失败；不足 20 行时校验全部现有样本；正常 dump 输出有预期/实际对照的证据，而不是单个 RESTORE_VERIFIED 标记。

### V2-09 / P2：CI 仅检查 git diff，未实际重生成且漏查客户端产物

**计划行号：38、167、174。对应上一轮 R7/R10：路线正确，命令不完整。**

在干净 checkout 直接执行 `git diff --exit-code -- openapi`，即使提交了过期 OpenAPI/客户端类型也可能通过，因为工作区没有生成任何变化。该命令还漏掉 `apps/web/src/lib/api-types.ts`。当前 generate-api-client.mts 本身是固定字符串输出，不读取 OpenAPI；必须真的改成单源生成器。

**更改方案：**实现 E 的生成链后，CI 按顺序运行：

```sh
pnpm generate:openapi
pnpm generate:api
git diff --exit-code -- openapi/myQSL-v1.yaml apps/web/src/lib/api-types.ts
pnpm run check
pnpm check:bundle
pnpm check:placeholders
CI=1 pnpm test:e2e
```

若实际生成文件不止这些，校验全部产物目录，并单独检测意外新增、未跟踪的生成文件。路由覆盖测试独立验证 method/path/请求/响应/错误契约；只有 Domain 字段 schema 不足以生成这些全部信息，应有共享路由契约注册表。

**验收：**只改一个接口字段而不更新产物的 PR 必须失败；重新生成后通过；只留下过期客户端文件也必须失败；类型兼容和实际路由覆盖测试都运行。maxWorkers=1 可以作为保守配置，但将“消除并发超时”改成“限制并发，并以真实 runner 结果验收”，不能保证消除所有超时。

## 3. 不另列架构缺陷、但应补入后续阶段的交付清单

以下不阻塞 A2/B1 先行，也不要求再增加阶段；它们是上一轮尚未完整落实的任务细化，不能在总体验收时静默省略。

| 阶段 | 需要写进实施卡的具体内容 | 验收证据 |
|---|---|---|
| C | OPERATOR_CALLSIGN/MY_* 等字段如果没有正式 API/DB 落点，先原样保留 extras；不能仅从 extras 移除后称“已映射”。主线程 ArrayBuffer 使用 transfer list，明确解析取消和上传取消 | 真实 DB 导入导出往返；取消后无后续上传/complete；10k 浏览器记录。删除无测量依据的“内存降低 50%”承诺 |
| E | 快照渲染、字体加载就绪、PNG hash、上传失败重试、背景像素断言；template_update 审计 | 编辑不新建、快照一致、字体/背景就绪及故障恢复测试 |
| F1 | 重复 Workflow 不误标失败、备份账本状态转换、system actor 审计、monthly/lifecycle 读回、R2 文件 hash | 重复执行测试、故障注入、实际规则读回和独立恢复日志 |
| F2 | GitHub remote/required checks、唯一 Workers Builds 发布入口、迁移与代码顺序、回滚步骤和 7 天观察指标 | 失败 PR 被保护、部署 SHA/ID、恢复/回滚演练。真实外部配置、发布或回滚另依用户授权执行 |

## 4. 建议实施顺序与放行门槛

1. **先修订计划中的 V2-01、V2-02、V2-07，再执行 A2/B1。** 三项直接决定首轮实现是否正确；不必等 F1/F2 的实施结束。
2. **B2 开工前关闭 V2-03、V2-04、V2-05。** 提交事务 SQL/结果关联设计、错误响应协议、分片/续传协议和完整查询预算，先写竞争与回滚测试。
3. **D 开工前按 V2-06 固定 HTTP 缓存政策。** 保留 R2 内容寻址，不保留状态相关公开 URL 的永久缓存承诺。
4. **E/F1 分别按 V2-09/V2-08 实施。** 对代码生成与恢复校验都先建立一个“错误输入必失败”的测试，避免只增加成功日志。
5. 每个阶段更新“问题 ID → 文件 → 测试 → 实际结果 → 证据路径”。仅当对应反例被测试覆盖且通过，才将该项标记关闭。整个项目上线还须满足 F2 的真实交付门禁。

## 5. 本轮验证范围及最终判断

本轮可重复证据有：Zod 扩展字段运行时错误、字符串频率被计划示例拒绝、默认台站多语句更新的 SQLite 反例、secret 校验缺省被当成通过。查询预算是计划列项的直接计算；其他项是当前文件与拟议协议之间的具体差异和未闭环条件，不包装成已执行的远程故障测试。

**最终判断：不推翻本版计划，但不能原样放行。修正上述 9 项，并补齐对应阶段交付清单后，可以沿现有八阶段推进；没有必要反复调整项目总体架构或品牌命名。**

本次沿用 receiving-code-review 与 verification-before-completion 的核验原则，因而保留已合理的方向、只对有证据的错误与缺失提出修改，并明确区分计划评审与实施验收。仅新增本报告，不修改原计划或业务代码。
