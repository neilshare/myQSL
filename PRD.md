# myQSL 产品需求与技术规格（PRD）

> **文档版本**：v1.2.0-implementation
> **更新日期**：2026-09-06
> **代码基线**：feat/eqsr-phase2 / 18c4269
> **生产域名**：<https://myqsl.203031.xyz>
> **代码仓库**：<https://github.com/neilshare/myQSL>

## 0. 文档状态与发布边界

仓库已经完成 v1.1–v1.2 的主要代码、协议契约、数据库迁移、本地测试和 GitHub 部署工作流，但仍有必须在真实环境完成的验收项。本文明确区分“已实现代码”和“可生产发布”：

| 版本 | 目标 | 当前状态 | 生产开关 |
|---|---|---|---|
| v1.0 | QSO、ADIF、模板、电子卡、公开查验、备份 | 基线能力已存在 | 以生产配置为准 |
| v1.1 | WSJT-X/N1MM 实时入库、A4 四拼矢量 PDF、Agent 管理 | 代码与本地测试完成；真机验收未完成 | FEATURE_AGENT_INGEST=0、FEATURE_PRINT=1 |
| v1.2 | 单卡出血、批量制卡、QRZ 邮箱预览与 Resend 发卡 | 代码与本地测试完成；账号、回执、印刷和 E2E 验收未完成 | FEATURE_EMAIL_DELIVERY=0 |

未完成的外部证据不得通过文案包装为“已生产发布”。发布阻塞项记录在 [第二阶段执行日志](docs/phase-2/execution-log.md)。

## 1. 产品目标与范围

### 1.1 产品定位

myQSL 是单所有者、自主掌控数据的业余无线电 QSO 与 QSL 卡片系统。系统使用 React/Vite 管理端、Cloudflare Worker API、D1 结构化存储、R2 媒体存储和 Access 身份保护，覆盖日志录入、实时入库、电子卡发布、纸卡印刷和邮件发送。

### 1.2 用户角色

| 角色 | 能力 | 默认入口 |
|---|---|---|
| Owner/台主 | 管理台站、QSO、模板、卡片、Agent、打印和发卡；查看审计 | /admin/*，受 Cloudflare Access 保护 |
| 本地 Agent | 仅使用设备令牌提交授权 profile 的实时事件；不能访问 Owner API | /api/v1/agent/* |
| 通联友台/访客 | 按呼号和日期查验已发布卡片 | /lookup、/c/:publicId、/api/v1/public/* |

### 1.3 本阶段明确不做

- 不实现 CAT 电台控制、自动发射、调频或远程操控。
- 不实现 QRZ Logbook、LoTW、Club Log 的 QSO 双向同步。
- 不把 N1MM 替换/删除事件直接覆盖或删除云端 QSO；必须进入 Owner 审核收件箱。
- 不把打印动作自动转换为公开卡片，也不把 UDP 入库自动触发邮件发送。
- 不以“UDP 已收到”作为绝对不丢包承诺；可靠性边界是 Agent 先落盘，再通过 HTTPS 幂等补传。

## 2. 业务流程与验收边界

### 2.1 实时入库流程（v1.1）

1. WSJT-X 或 N1MM 在本机/局域网发送 UDP 数据包。
2. myqsl-agent 校验来源 IP、包大小和协议字段，将合法数据转换为 RadioEventV1。
3. 事件写入本地 SQLite Outbox（WAL + FULL synchronous）。
4. Agent 通过固定 HTTPS origin 和 Access Service Auth 上传 /api/v1/agent/events。
5. Worker 校验设备令牌、profile/source/station scope、规范化 hash 和幂等键。
6. Worker 在同一 D1 batch 中写入 ingest_events、QSO、来源链接和审计；重复事件返回原收据。

异常处理：断网进入 retry_wait；401 暂停并告警；429/5xx 按 Retry-After 与指数退避；event ID 相同但 payload hash 不同返回冲突；外部 replace/delete 只写 review_required。

### 2.2 批量印刷流程（v1.1/v1.2）

1. Owner 选择最多 200 个 QSO 或已生成卡片。
2. Worker 冻结 QSO、模板、背景资产和 QR 信息，生成不可变 print_manifest。
3. @myqsl/card-pdf 生成 PDF：
   - a4-four-up-v1：横向 A4，四张 140×90 mm，零出血；
   - single-bleed-v1：146×96 mm 页面，3 mm 出血，3 mm 安全边。
4. 文字和 QR 直接绘制为 PDF 矢量；背景照片保留为受控位图，不将整卡栅格化。
5. 完成后记录 PDF hash、页数和大小；取消、过期或预检失败不得生成成功结果。

限制：单批最多 200 张、最多 10 个背景资产、背景总量 30 MiB、输出 50 MiB；PNG 邮件附件上限 5 MiB。中文嵌入字体和真实打印尺测仍需外部验收。

### 2.3 QRZ 邮箱发卡流程（v1.2）

1. Owner 提交最多 50 张已发布卡片，创建 delivery batch。
2. 异步准备阶段查询 QRZ XML 目录，缓存呼号结果并只展示脱敏邮箱/状态。
3. 预览有效 15 分钟；无邮箱、订阅不足、卡片未发布、PII 未配置等状态显示为 blocked。
4. Owner 明确勾选 ready 的 delivery_id 后提交发送；客户端不能覆盖 To、From、正文或附件。
5. D1 outbox + 每分钟 cron 按全局至少 1 秒节流发送至 Resend，固定 Idempotency-Key=delivery_id。
6. Webhook 使用原始 body 的 Svix 签名校验；sent/delivered/bounced/complained 通过幂等 reducer 更新；硬退信/投诉写入 suppression。

状态边界：provider 响应未知进入 unknown，不得自动生成新幂等键重发；delivered 不被后续低优先级事件降级；预览查询不会外发邮件。

## 3. 总体架构

~~~mermaid
flowchart LR
  Radio["WSJT-X / N1MM UDP"] --> Agent["myqsl-agent\nNode 24 + SQLite Outbox"]
  Agent -->|HTTPS + Access Service Auth| Edge["Cloudflare Access / Worker"]
  Owner["Owner Web SPA"] -->|Access JWT| Edge
  Visitor["访客查验"] -->|Rate Limited Public API| Edge
  Edge --> Worker["Hono Worker\nAuth / Origin / Feature Flags"]
  Worker --> Ingest["Ingest + Review"]
  Worker --> Print["Print/Card Batch + PDF"]
  Worker --> Delivery["QRZ Directory + Delivery Outbox"]
  Worker --> D1["Cloudflare D1"]
  Worker --> R2["Cloudflare R2"]
  Delivery --> QRZ["QRZ XML 1.34"]
  Delivery --> Resend["Resend API / Svix Webhook"]
  Worker --> Backup["D1 Backup Workflow"]
  Backup --> R2
~~~

### 3.1 代码模块

| 模块 | 目录 | 职责 |
|---|---|---|
| 公共契约 | packages/domain | Zod schema、hash、OpenAPI、API path、打印/邮件/Agent 类型 |
| ADIF | packages/adif-codec | ADIF 3.1.7 序列化/解析与扩展字段保留 |
| 无线电协议 | packages/radio-codec | WSJT-X 大端二进制/QDateTime、N1MM XML、边界限制 |
| PDF | packages/card-pdf | mm 坐标、A4/出血 profile、矢量文字/QR、预检和取消 |
| 本地代理 | apps/agent | UDP receiver、SQLite outbox、HTTPS uploader、doctor/status、发布打包 |
| Worker | apps/worker | 鉴权、实时入库、打印、制卡、QRZ、发信、定时补偿 |
| Web | apps/web | QSO/卡片基础页面、打印、发卡、设备设置、异常收件箱 |
| 迁移 | infra/migrations | 0004–0007 增量迁移，禁止修改历史迁移 |

### 3.2 安全分组

- Owner：Cloudflare Access JWT + Same-Origin 检查；访问 QSO、卡片、打印、发卡和集成管理接口。
- Agent：Bearer 设备令牌只存 SHA-256；生产环境额外要求固定 Access issuer/audience、Service Auth header、profile scope。
- Webhook：不依赖 Owner 登录，只接受有效 Svix/Resend 原始 body 签名，事件落库后才返回成功。
- Public：仅开放精确查验和图片读取，使用 Rate Limiter、no-store 和作废优先逻辑。

## 4. API 与数据契约

### 4.1 主要接口

| 路径 | 方法 | 认证 | 作用 |
|---|---:|---|---|
| /api/v1/agent/config | GET | Agent | 获取 profile、协议版本和上传限制 |
| /api/v1/agent/heartbeat | POST | Agent | 心跳与版本回显 |
| /api/v1/agent/events | POST | Agent | 单事件入库；单包 ≤64 KiB |
| /api/v1/integrations/agents | GET/POST | Owner | 设备列表/创建并一次性展示令牌 |
| /api/v1/integrations/agents/:id/revoke | POST | Owner | 吊销设备令牌 |
| /api/v1/integrations/agent-events | GET | Owner | review_required/rejected/all 事件分页 |
| /api/v1/integrations/agent-events/:id/dismiss | POST | Owner | 以 reason 关闭审核事件 |
| /api/v1/print-batches | POST/GET | Owner | 冻结打印 manifest、读取状态 |
| /api/v1/print-batches/:id/complete | POST | Owner | 写入 PDF hash/page_count/size |
| /api/v1/card-batches | POST/GET | Owner | 批量创建快照卡片草稿 |
| /api/v1/delivery-batches | POST/GET | Owner | 创建预览、读取 QRZ 结果 |
| /api/v1/delivery-batches/:id/send | POST | Owner | 仅发送服务端 ready 子集 |
| /api/v1/webhooks/resend | POST | Svix signature | 接收 Resend 状态回执 |

所有写入接口使用 application/problem+json 错误格式。需要重试的响应明确 retryable=true；设备事件使用 event ID + payload SHA-256 幂等；批处理使用 Idempotency-Key，同 key 不同输入返回 409。

### 4.2 核心数据表

基础表：stations、qsos、card_templates、qsl_cards、audit_events、backup_runs。
实时入库：agent_devices、agent_profiles、ingest_events、qso_source_links。
打印/制卡：print_batches、print_batch_items、card_batches、card_batch_items。
目录/邮件：directory_contacts、delivery_batches、delivery_batch_items、card_deliveries、delivery_attempts、delivery_webhook_events、email_suppressions、dispatch_daily_quotas、dispatch_throttle。

关键兼容规则：已有 qsl_cards.id/status/public_id 不变；Agent 入库的 QSO source='api'；原始外部来源由 qso_source_links 独立保存；打印和邮件均只读冻结快照。

## 5. 安装与本地开发

### 5.1 环境要求

- Node.js >=24 <25（CI 使用 Node 24；本地应使用 Node 24 LTS）。
- pnpm 10.15+，通过 Corepack 启用。
- Cloudflare Wrangler 4.128+。
- Cloudflare 账号（部署时需要 Workers、D1、R2、Access、Workflows）。

### 5.2 Web/Worker 本地启动

~~~bash
git clone https://github.com/neilshare/myQSL.git
cd myQSL
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
~~~

访问 http://127.0.0.1:8787/admin/qsos。wrangler.test.jsonc 开启 TEST_AUTH_ENABLED=1 和三个 phase-2 feature flags，测试身份仅用于本地，不得复制到生产。

### 5.3 本地质量门禁

~~~bash
pnpm generate:openapi
pnpm generate:api
git diff --exit-code -- openapi/myQSL-v1.yaml openapi/eQSR-v1.yaml apps/web/src/lib/api-types.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:bundle
pnpm check:placeholders
pnpm verify:production --dry-run --skip-secrets
pnpm exec tsx scripts/build-agent.mts
~~~

pnpm verify:pdf <file.pdf> --manifest <manifest.json> 用于对具体 PDF 检查页数和页面尺寸；独立二维码解码、字体缺字、真机打印仍需外部工具/实物证据。

## 6. Agent 安装与配置

### 6.1 服务端准备

1. Owner 打开“设备集成”，创建设备并选择既有台站/profile。
2. 记录一次性 mqa_... 令牌；服务端只保存 hash，令牌不会再次显示。
3. 生产环境为 Worker 配置 Agent Access Service Auth：AGENT_ACCESS_AUD、AGENT_ACCESS_TEAM_DOMAIN、AGENT_ACCESS_CLIENT_ID，并设置对应 Secret。

### 6.2 本地构建与运行

~~~bash
pnpm --filter @myqsl/agent typecheck
pnpm --filter @myqsl/agent test
pnpm exec tsx scripts/build-agent.mts
~~~

产物位于 dist/agent/，包括 myqsl-agent-v1.1.0.tar.gz、runtime-manifest.json、SHA256SUMS。Agent 配置至少包含：

~~~json
{
  "origin": "https://myqsl.203031.xyz",
  "device_token": "mqa_一次性令牌",
  "access_client_id": "Cloudflare Access Service Token ID",
  "access_client_secret": "Cloudflare Access Service Token Secret",
  "profile_id": "profile_xxx",
  "source_kind": "wsjtx",
  "bind_address": "127.0.0.1",
  "wsjtx_port": 2237,
  "n1mm_port": 12060
}
~~~

默认仅监听 loopback；开放局域网时必须同时配置 peer IP allow-list。启动前执行 myqsl-agent doctor，运行中用 status 检查队列深度、最老事件年龄、最近 UDP 包和最近云端收据。不要删除 SQLite 数据目录；容量达到 50,000 条或 256 MiB 时停止淘汰并告警。

## 7. GitHub → Cloudflare 部署

### 7.1 一次性 Cloudflare 资源

生产配置文件为 wrangler.jsonc，当前资源包括 Worker myqsl、D1 myqsl-prod、R2 myqsl-media、Workflow myqsl-d1-backup 和自定义域名 myqsl.203031.xyz。首次部署前创建资源、配置 Access 应用，并确认配置文件中的真实 database ID、域名和 Access audience。

### 7.2 GitHub Actions

- .github/workflows/deploy.yml：仅 main push 或手动触发；执行生成文件漂移检查、严格生产预检、D1 远程迁移、Web 构建和 wrangler deploy。
- .github/workflows/agent-release.yml：agent-v1.1.* tag 触发 Agent 测试、打包和 GitHub Release。

GitHub production environment 至少需要：

| Secret | 用途 |
|---|---|
| CLOUDFLARE_API_TOKEN | D1 迁移和 Worker 部署 |
| CLOUDFLARE_ACCOUNT_ID | Cloudflare 账号定位 |

通过 Wrangler 写入 Worker Secret（禁止提交仓库）：

~~~bash
wrangler secret put AGENT_ACCESS_CLIENT_SECRET
wrangler secret put D1_REST_API_TOKEN
wrangler secret put RATE_LIMIT_SALT
wrangler secret put QRZ_USERNAME
wrangler secret put QRZ_PASSWORD
wrangler secret put PII_KEY_VERSION
wrangler secret put PII_KEY_B64
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM
wrangler secret put RESEND_WEBHOOK_SECRET
~~~

启用邮件前必须完成发件域 SPF/DKIM/DMARC、自有测试收件人和 webhook 签名验证；PII key 必须离线备份并记录版本。

### 7.3 分阶段上线

1. 合并到 main 前通过全部本地门禁。
2. 首次只保持 FEATURE_AGENT_INGEST=0、FEATURE_EMAIL_DELIVERY=0，执行生产预检和迁移。
3. 在 staging/受控设备验证 Access、站台 scope、真实 UDP、断网补传。
4. 逐步将 Agent feature flag 对单设备开启；邮件先用 fake provider，再用 Owner 自有测试邮箱。
5. 完成回执、退信、配额、恢复和印刷证据后，才可开启邮件生产开关。

### 7.4 回滚与恢复

- 应用回滚：通过 Cloudflare 历史 deployment 回滚；不得逆向删除 D1 迁移。
- 功能回滚：优先关闭 Agent/Email feature flag，保留 webhook 接收和数据墓碑。
- 数据恢复：从 R2 取 SQL + manifest，使用 pnpm verify:backup --sql ... --database ... --manifest ... 在隔离 SQLite 校验后再恢复。
- 0 20 * * * 仅触发每日备份；其他每分钟 cron 用于邮件补偿，不能混淆两类调度。

## 8. 质量指标与当前发布阻塞

最近一次本地证据：包/脚本 77 个测试、Web 33 个测试、Worker 61 个测试、Agent 4 个测试通过；pnpm lint、pnpm typecheck、pnpm build、Bundle 和占位符检查通过。Worker 测试可能输出 Wrangler 日志目录 EPERM 与预期 EXPORT_UNAVAILABLE，但测试进程退出码为 0。

仍需外部完成：

1. Windows 11、macOS、Linux 的真实 WSJT-X/N1MM、重启、断网 24 小时补传证据。
2. 生产 Access Service Auth、QRZ 订阅、Resend 域和 PII key 配置/验证。
3. PDF 独立解析、二维码解码、中文字体授权及实体尺测。
4. Email Workflow/租约恢复、provider fault injection、Owner 完整 E2E、D1/R2/PII 恢复演练。

## 9. 后续路线图

- v1.3–v1.5：在完成稳定性与恢复证据后，评估 LoTW/QRZ Logbook/Club Log 增量同步和 QSO 地理可视化。
- v2.0：奖状进度、俱乐部台多操作员、细粒度权限和更完整的跨设备协作。

---

*本文只描述当前仓库可追溯的实现和明确的发布边界；代码、迁移、执行日志和运行手册发生变化时必须同步更新本文件。*
