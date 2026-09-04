# eQSR 架构设计与落地工程深度技术评审报告

> **评审基准文档**：`eqsr/docs/superpowers/specs/2026-09-03-eqsr-final-architecture-design.md`（最终架构规范）  
> **参考输入文件**：`QSL_PRD.MD`、`eQSL_Solution.md`、`eQSL_Solution1.md`、`qsl_study.md`  
> **落地对照基准**：Git 仓库当前实现（`apps/worker`、`apps/web`、`packages/*`、`infra/*`、`tests/*`、`wrangler.jsonc`）  
> **评审日期**：2026-09-04  
> **评审结论**：**不建议立即发布生产，需优先清除 4 项阻断性缺陷（Blockers）**

---

## 评审背景与准绳

本评审以《2026-09-03-eqsr-final-architecture-design.md》（以下简称《最终架构规范》）中裁定的**业务目标（G1～G6）、设计不变式、功能范围与价格/容量门槛**为根本准绳：
1. **架构形态**：采用 **单个 Cloudflare Worker + Static Assets**（同域部署、无跨域、版本原子发布）；
2. **核心业务范围**：首版聚焦单所有者闭环（G1 多端 QSO 管理、G2 ADIF 3.1.7 互通、G3 电子 QSL 生成、G4 令牌查验与精确索卡、G5 D1/R2 数据主权备份、G6 GitHub + Workers Builds 自动交付）；明确剔除注册/多租户、自动外部同步（eQSL/LoTW/ClubLog）、邮件投递及离线写队列；
3. **价格与成本红线**：**月度运行成本必须为 ¥0**（仅年付域名约 ¥70），所有组件必须在 Cloudflare 免费配额内（Workers 10 万次/日、CPU 10ms、D1 单库 500MB、R2 10GB-month、原生 Rate Limiting binding），**严禁引入 Durable Objects 等付费特性**。

---

## 一、 需求与范围覆盖度评审

```
┌────────────────────────────────────────────────────────────────────────┐
│                        首版六大核心能力 (G1~G6) 落地对照                │
├─────┬──────────────────────┬──────────┬────────────────────────────────┤
│ 编号│ 规范要求能力          │ 落地状态 │ 核心断点 / 差距位置             │
├─────┼──────────────────────┼──────────┼────────────────────────────────┤
│ G1  │ 多端 QSO 管理        │ 部分覆盖 │ 后端 CRUD 完备；前端多为骨架桩 │
│ G2  │ ADIF 3.1.7 双向互通   │ 基本覆盖 │ 编解码与 40 条分块完备，缺非ASCII阻断 |
│ G3  │ 电子 QSL 生成与快照   │ 部分覆盖 │ 后端快照完备；渲染引擎未画底图 │
│ G4  │ 令牌查验与精确索卡   │ 严重缺失 │ 前端路由缺失，索卡页面无表单   │
│ G5  │ 数据主权与灾备恢复   │ 严重阻塞 │ 备份服务轮询紧密死循环，必超时 │
│ G6  │ 自动交付与回滚演练   │ 严重阻塞 │ Worker 测试套件崩溃，阻塞 CI   │
└─────┴──────────────────────┴──────────┴────────────────────────────────┘
```

### 1.1 【高】公开查验与索卡前端闭环完全断裂
* **涉及章节与文件**：
  * 规范：§1.1 (G4)、§8.5、§9.3
  * 代码：`apps/web/src/app/router.tsx`、`apps/web/src/features/public/CardLookupPage.tsx`、`apps/worker/src/modules/public/routes.ts`
* **问题描述与影响**：
  1. 规范规定友台通过二维码直接访问 `/c/{public_id}` 查看公开卡片，但前端路由文件 `router.tsx` **根本未注册 `/c/:publicId` 或 `/verify` 路由**；根路径 `/` 甚至无条件重定向到受 Cloudflare Access 保护的 `/admin/qsos`，友台扫码将直接报 404 或被拦截鉴权。
  2. 精确索卡页面 `CardLookupPage.tsx` 仅有一句静态说明文案，**没有输入框、无表单、无 API 调用**。
  3. API 路由路径发生漂移：规范 §9.3 明确规定索卡接口为 `POST /api/v1/public/card-lookup`，而 Worker 实现写成了 `POST /api/v1/public/lookup`。
* **具体修改建议**：
  1. 在 `apps/web/src/app/router.tsx` 中补全路由：
     ```tsx
     { path: "/c/:publicId", element: <PublicCardPage /> },
     { path: "/lookup", element: <CardLookupPage /> }
     ```
  2. 在 `CardLookupPage.tsx` 中补齐 `call` 与 `qso_date` 表单，调用后渲染检索结果及卡片预览；
  3. 修正 Worker 路由路径为规范要求的 `/api/v1/public/card-lookup`，或在前端客户端与网关上做统一对齐。

---

### 1.2 【高】QSL Canvas 渲染引擎未加载和绘制背景图
* **涉及章节与文件**：
  * 规范：§1.1 (G3)、§8.4、§14.3
  * 代码：`packages/card-renderer/src/render.ts` L13-L33、`apps/web/src/features/templates/CanvasPreview.tsx`
* **问题描述与影响**：
  规范明确要求通过模板配置背景图、排版要素与二维码，生成高清电子 PNG。但 `packages/card-renderer/src/render.ts` 的 `renderCard` 函数只遍历绘制了 `template.elements` 中的文字和二维码，**根本没有绘制模板背景图（`template.background_r2_key` / `bg_image_url`）的逻辑**。此外，画布未调用 `clearRect`，重绘时文字会重复叠影。这导致项目中准备的精美设计底图完全无法合成为真实卡片。
* **具体修改建议**：
  1. 修改 `renderCard()`：绘制前执行 `context.clearRect(0, 0, width, height)`；若模板包含背景图，先通过 `new Image()` 加载并执行 `context.drawImage(bgImg, 0, 0, width, height)` 铺底，再叠加文字图层与二维码；
  2. 规范要求等待 `document.fonts.ready`：在 `CanvasPreview.tsx` 与导出流程中，确保字体加载完成后再执行渲染。

---

### 1.3 【高】管理端前端页面大多为静态空壳存根
* **涉及章节与文件**：
  * 规范：§1.1 (G1)
  * 代码：`apps/web/src/features/cards/CardListPage.tsx`、`CardCreatePage.tsx`、`TrashPage.tsx`、`TemplateListPage.tsx`、`TemplateEditorPage.tsx`
* **问题描述与影响**：
  后端 Worker 完整实现了卡片生成、回收站、模板管理等 CRUD 接口，但前端对应的页面全部是 2 行代码的静态占位段落（例如 `CardCreatePage.tsx` 只有 `<p>从 QSO 快照生成电子高清 PNG。</p>`）。虽然 `scripts/check-placeholders.mts` 仅检测 "TODO/FIXME" 英文关键字而误判通过，但用户实际无法在浏览器中完成“移入回收站并恢复”、“选择模板生成卡片”、“编辑模板布局”等核心操作。
* **具体修改建议**：
  全面接入 `apps/web/src/lib/api-client.ts`，为 `TrashPage` 接入恢复接口，为 `CardCreatePage` 接入模板选择与 Canvas 生成上传，为 `TemplateEditorPage` 接入布局配置与背景图上传。

---

### 1.4 【中】QSO 列表过滤参数实现不足
* **涉及章节与文件**：
  * 规范：§7.2、§9.2
  * 代码：`apps/worker/src/modules/qsos/routes.ts` L13
* **问题描述与影响**：
  规范要求支持对 QSO 进行波段（`band`）、模式（`mode`）、日期范围等维度筛选。但 `apps/worker/src/modules/qsos/routes.ts` 的 `listSchema` 仅定义了 `call`、`include_deleted`、`cursor`、`limit` 四个参数，忽略了波段和调制模式筛选；且 `limit` 最大值被硬编码限制在 50，小于规范 §9.1 规定的 200。
* **具体修改建议**：
  在 `listSchema` 中补齐 `band: z.string().optional()`、`mode: z.string().optional()`、`date_from: z.string().optional()`、`date_to: z.string().optional()`，并将 `limit` 上限放宽至 200。

---

## 二、 架构设计与技术选型评审

### 2.1 【合理亮点】单 Worker + Assets 与计算下沉策略极其精准
* **评估依据**：符合《最终架构规范》§0、§3、§10
* **分析**：
  1. **部署形态**：采用 Cloudflare Workers + Static Assets 单部署单元，彻底规避了早期方案 A（Pages + Functions）引起的跨域、Cookie 隔离及双版本发布问题；
  2. **计算下沉**：将 ADIF 文件解析移入浏览器 Web Worker，将卡片渲染移入浏览器 Canvas，严格规避了 Workers 免费版 **10ms CPU 耗时上限** 与 **128MB 内存上限**；
  3. **数据稳定性**：`qsl_cards` 表持久化保存了通联快照（`qso_snapshot_json`）与模板快照（`template_snapshot_json`），确保已签发卡片不受后续原始 QSO 修改的影响，架构设计非常严密。

---

### 2.2 【中】Workflows 备份组件对免费层账户带来兼容性与运维复杂性
* **涉及章节与文件**：
  * 规范：§8.6、§10
  * 代码：`wrangler.jsonc` L35-L42、`apps/worker/src/modules/backup/workflow.ts`
* **问题描述与影响**：
  规范裁定使用 Cloudflare Workflows 调用 D1 Export API 流式备份至 R2。Workflows 属于 2025/2026 年新特性，依赖较新版本的 Wrangler（配置要求 `schedules`），在部分本地模拟器或纯免费层子账户中存在激活门槛；且当 Workflows 调度器出现不可预知的排队时，难以在标准日志中快速定位。
* **具体修改建议**：
  保留现有 Workflow 实现，但在 `apps/worker/src/modules/backup/routes.ts` 中确保保留手动 HTTP 触发端点 `POST /api/v1/backups/run`；并在 `wrangler.jsonc` 中配置标准的 `triggers: { crons: ["0 20 * * *"] }` 作为保底备份通道。

---

## 三、 落地可行性与工程风险评审

### 3.1 【高】测试工具链运行时崩溃，导致 CI/CD 质量门禁完全失效
* **涉及章节与文件**：
  * 规范：§10、§13.1、§17
  * 代码：`apps/worker/vitest.config.ts`、`package.json`
* **问题描述与影响**：
  执行 `pnpm check` 时，`apps/worker` 所有的 13 个单元/集成测试因 workerd 运行时报错而全军覆没：
  ```text
  MiniflareCoreError [ERR_RUNTIME_FAILURE]: Uncaught Error: No such module "cloudflare:test-internal"
  ```
  该错误源自 `@cloudflare/vitest-plugin@1.1.3` 与本地安装的 `miniflare` 内部私有模块版本不匹配。由于测试崩溃，导致规范 §13 规定的“必须 CI 全绿才能合并部署”的发布门禁在实际环境中处于阻断状态。
* **具体修改建议**：
  1. 锁定并升级/降级 `@cloudflare/vitest-plugin` 及其配对的 `@cloudflare/workers-types`、`wrangler` 至官方已验证的稳定版本组合；
  2. 对于平台与业务服务（如 `QsoService`、`CardService`），补充针对纯内存 SQLite（better-sqlite3 或 sql.js）的单元测试隔离层，避免测试完全强绑定 workerd 原生运行时。

---

### 3.2 【高】D1 自动备份导出轮询存在紧密死循环（严重缺陷）
* **涉及章节与文件**：
  * 规范：§8.6
  * 代码：`apps/worker/src/modules/backup/service.ts` L32-L40
* **问题描述与影响**：
  ```typescript
  private async poll(endpoint: string, headers: HeadersInit) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await this.fetcher(endpoint, { headers });
      if (!response.ok) continue;
      const result = ...;
      if (result?.signed_url || result?.status === "complete") return result;
    }
    return null;
  }
  ```
  `poll()` 函数在 5 次重试中**没有任何异步延时等待（sleep）**。循环将在 10～20 毫秒内瞬间耗尽 5 次请求并返回 `null`。而 Cloudflare D1 服务端生成 SQL dump 通常需要数秒，因此该轮询必定超时失败，返回 `EXPORT_TIMEOUT`，每日自动备份机制实质处于不可用状态。
* **具体修改建议**：
  在每次重试后加入真实的异步休眠，并采用阶梯退避策略：
  ```typescript
  await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  ```

---

### 3.3 【中】根目录缺失标准 `tsconfig.json` 影响工程可维护性
* **涉及章节与文件**：工程根目录
* **问题描述与影响**：
  根目录仅有 `tsconfig.base.json`，缺失 `tsconfig.json`。运行 `tsc -b` 或在 IDE 中导入 monorepo 根项目时抛出 `error TS5083: Cannot read file 'tsconfig.json'`，破坏了一体化类型检查流程。
* **具体修改建议**：
  在根目录创建 `tsconfig.json`，使用 `references` 声明关联各个子应用和子包路径（`apps/*`, `packages/*`）。

---

## 四、 非功能性设计与价格/容量边界深度评审

### 4.1 价格与免费配额核算（以规范 §1.4、§12.2 为准绳）

《最终架构规范》修正了早期文档将 D1 夸大为 10GB 的错误，以官方免费配额为真实上限：

| 资源维度 | Cloudflare 免费配额上限 | 业务预估消耗 (以 3 万条 QSO 计) | 配额占用比 | 评审结论 |
| :--- | :--- | :--- | :--- | :--- |
| **Workers 请求数** | 100,000 次 / 日 | 个人使用 < 500 次 / 日，索卡 < 2,000 次 | < 2.5% | 安全无风险 |
| **Workers CPU 耗时** | 10 ms / HTTP 请求 | 重计算下沉至浏览器后，API 耗时 < 3 ms | < 30% | 安全无风险 |
| **D1 存储容量** | **500 MB / 库**（账户合计 5GB） | 3 万条 QSO 约 60～120 MB | **12% ～ 24%** | **需严格遵守 70% 告警阈值** |
| **D1 每日写入** | 100,000 行 / 日 | 日常通联 < 500 行，批量导入 1,000 行 | < 1.5% | 安全无风险 |
| **R2 免费存储** | 10 GB-month | 背景图与卡片约 2～3 GB，备份滚动保留 | 25% ～ 30% | **需配置 30 天生命周期规则** |
| **Rate Limiting** | 原生 Binding（免费） | 公开接口限制 60 次/分/IP | 0 额外费用 | **合规（已剔除付费 DO）** |
| **总计月度运行成本** | **¥0（零元）** | 仅域名支出约 ¥6/月（¥70/年） | 100% 达标 | **完全符合约束 C1** |

---

### 4.2 安全性评审 (Security)
* **【高】开发环境硬编码凭证存在生产绕过风险**：
  * **位置**：`apps/worker/src/platform/access.ts` L14-L26
  * **问题描述**：代码中判定 `if (c.env.APP_ENV === "local")` 时，只要携带 `Authorization: Bearer local-e2e-owner` 或 `X-EQSR-Test-Actor` 头即可直接作为管理员放行。若生产部署时环境变量配置疏漏或意外将 `APP_ENV` 赋为 `local`，攻击者仅需在 HTTP 头注入该值即可绕过 Cloudflare Access 获得所有数据写权限。
  * **修改建议**：测试绕过逻辑必须严格限定在自动化测试专用构建中，或强制要求 `c.env.APP_ENV === "test"`；在生产部署编译脚本中应将该分支条件彻底移除。
* **【中】公开卡片查验的防爬与防枚举**：
  * 规范 §8.5 要求“无链接者向索卡接口提交完整呼号 + UTC 日期，不支持模糊匹配，以固定最小延迟返回”。代码中虽实现了精确匹配，但未增加人工最小延迟，攻击者仍可能通过计时差异分析数据库是否存在该呼号。

---

### 4.3 可扩展性与可离场性 (Scalability & Portability)
* **数据主权与离场设计优异**：
  1. `infra/migrations/0001_core.sql` 中引入了 `adif_extra_json` 字段，凡是未在核心表映射的 ADIF 标签全量存入该 JSON，在全量导出时原样吐出，做到了**语义级往返无损（Lossless Round-trip）**；
  2. D1 数据基于标准 SQLite，配合 Drizzle ORM，若未来 Cloudflare 条款变更，仅需切换驱动即可无缝平移至本地轻量 Node/Docker 服务，满足规范 C5 可离场要求。

---

## 五、 验证与交付评审

### 5.1 【中】E2E 端到端测试覆盖流于表面，无法阻断严重缺陷
* **涉及章节与文件**：规范 §17 vs `tests/e2e/*.spec.ts`
* **问题描述与影响**：
  现存的 4 个 Playwright E2E 测试均只有 2 行代码，仅验证页面打开后特定 H1/H2 标题是否存在（例如 `expect(page.getByText("QSO 日志")).toBeVisible()`）。因为没有执行实际的录入、导入、生成与公开索卡测试，导致上文发现的“公开路由 404”、“索卡页面无表单”、“Canvas 渲染漏画底图”等严重阻断性 Bug 在当前的 CI 流程中被完全放行。
* **具体修改建议**：
  按照规范 §17 验收定义重构 E2E 测试，至少覆盖两条真实用户闭环：
  1. **QSO 录入与并发乐观锁测试**：录入一条 QSO $\to$ 验证列表存在 $\to$ 模拟旧版本并发更新验证 412 Precondition Failed；
  2. **公开索卡与卡片下载闭环**：发布一张卡片 $\to$ 访问 `/c/{publicId}` 验证卡片信息展示 $\to$ 模拟公开索卡表单提交验证响应。

---

### 5.2 【低】生产环境部署前置环境变量校验缺失
* **涉及章节与文件**：规范 §13.2 vs `wrangler.jsonc`
* **问题描述与影响**：
  `wrangler.jsonc` 中的 `database_id: "00000000-0000-0000-0000-000000000001"` 仍为本地占位 UUID；且备份服务强依赖 `CLOUDFLARE_ACCOUNT_ID`、`D1_DATABASE_ID`、`D1_REST_API_TOKEN`。若缺少部署前校验脚本，首次向生产推流易发生静默失败。
* **具体修改建议**：
  在 `scripts/` 下完善 `verify-env.mts`，在部署流水线前预检 D1 真实 UUID 和必需的 Secrets。

---

## 六、 必须解决的阻塞项清单 (Must-Fix Blockers)

在正式发布生产或投入日常通联使用前，以下 **4 项属于必须解决的高风险阻塞问题**：

```
┌───┬─────────────────────────────────────────────────────────────────────────────────────────────┐
│ # │ 阻塞项描述                                                                                  │
├───┼─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1 │ 修复前端路由与索卡页面：在 router.tsx 补齐 /c/:publicId，在 CardLookupPage 补齐输入表单与调用   │
│ 2 │ 修复 Canvas 渲染引擎：在 renderCard() 中实现 template.background_r2_key 底图异步加载绘制与清理 │
│ 3 │ 修复 D1 备份轮询死循环：在 BackupService.poll() 循环中增加异步延时等待（sleep），防止瞬间超时 │
│ 4 │ 修复 Worker 测试工具链：解决 @cloudflare/vitest-plugin 无法启动的问题，恢复 CI 质量门禁      │
└───┴─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 七、 改进建议汇总与优先级排序

| 优先级 | 分类 | 改进建议与具体行动项 |
| :---: | :---: | :--- |
| **P0** | 核心业务 | **补齐公开索卡与卡片查验前端闭环**：注册 `/c/:publicId` 路由，在 `CardLookupPage.tsx` 实现呼号与日期查询并联动后端。 |
| **P0** | 核心功能 | **修复 Canvas 底图合成**：在 `packages/card-renderer` 实现背景图绘制，并在管理端接入 `qsl_design_samples` 底图上传。 |
| **P0** | 基础设施 | **修复备份轮询死循环与测试环境**：修复 `BackupService.poll()` 延时重试，调整 Vitest 插件版本使 CI 检测可执行。 |
| **P1** | 安全加固 | **消除鉴权测试后门隐患**：加固 `access.ts`，禁止非测试环境下使用硬编码 Token 绕过 Access 鉴权。 |
| **P1** | 体验优化 | **补齐管理端空壳页面**：为 `TrashPage`、`CardCreatePage`、`TemplateEditorPage` 补充基本的交互功能。 |
| **P1** | 规范对齐 | **统一公共 API 路径与参数**：将索卡接口路径统一为 `/api/v1/public/card-lookup`，并在 QSO 列表中增加波段/模式筛选。 |
| **P2** | 质量防护 | **充实真实端到端 E2E 用例**：编写针对“录入-生成-查验-导出”的完整交互测试，取代当前的纯文本可见性断言。 |
| **P2** | 部署规范 | **增加部署前环境变量预检脚本**：在发布流水线执行前校验 D1 生产 UUID、Access Audience 与 API Token。 |

---
*评审归档路径：`eqsr/Review/eQSR_Architecture_Review.md`*
