# myQSL — QSO / QSL 管理、打印与发卡系统

[![Version](https://img.shields.io/badge/version-v1.2.0--implementation-blue.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20D1%20%7C%20R2-orange.svg)](https://workers.cloudflare.com/)

myQSL 是面向业余无线电台主的单所有者 QSO 与 QSL 系统。它覆盖 ADIF 日志、实时无线电入库、卡片模板、电子卡发布、矢量 PDF 印刷和 QRZ 邮箱发卡。

> 当前仓库是 **v1.2.0-implementation**：v1.1/v1.2 代码和本地测试已完成，但真实电台、生产印刷、邮件投递和恢复演练仍未完成。生产配置目前保持 `FEATURE_AGENT_INGEST=0`、`FEATURE_PRINT=1`、`FEATURE_EMAIL_DELIVERY=0`。不要将当前状态误解为 v1.2 全量生产发布。
>
> **线上状态（最近一次检查：2026-09-14）**：`main` 已推送到 GitHub，Cloudflare Worker `myqsl` 的最新版本已部署并承接 100% 流量（部署记录 `4a1dbed3-4a98-4690-90da-7ae77671d1e6`，版本 `55b540ed-a302-408b-a028-1f036f24cc07`，创建时间 `2026-09-13T16:05:13Z`）。Cloudflare 中已确认存在 `D1_REST_API_TOKEN` 和 `RATE_LIMIT_SALT` 两个 Worker Secret。当前 `/healthz` 已返回 `HTTP 200`；`/readyz` 到达 Worker 后返回预期的应用层 `HTTP 401`（缺少 Access assertion），不再被边缘层重定向到 Access 登录页。

完整需求与技术边界见 [PRD.md](PRD.md)，阶段证据见 [docs/phase-2/execution-log.md](docs/phase-2/execution-log.md)，履约闭环验收报告见 [FULFILLMENT.md](FULFILLMENT.md)，交接手册见 [handover.md](handover.md)。

## 目录

- [功能概览](#功能概览)
- [架构与目录](#架构与目录)
- [日常操作](#日常操作)
- [本地安装](#本地安装)
- [无线电 Agent](#无线电-agent)
- [GitHub 到 Cloudflare 部署](#github-到-cloudflare-部署)
- [当前线上状态](#当前线上状态)
- [验证、回滚与恢复](#验证回滚与恢复)
- [当前限制](#当前限制)

## 当前线上状态

| 检查项 | 当前结果 | 说明 |
|---|---|---|
| GitHub `main` | 已同步 | 最近一次推送已包含当前生产配置和部署流程修复 |
| Cloudflare Worker `myqsl` | 已部署 | 最近一次检查显示最新版本为 100% 流量 |
| `D1_REST_API_TOKEN` | 已存在 | 已通过 Wrangler 读取远程 Secret 名称确认，内容不会回显 |
| `RATE_LIMIT_SALT` | 已存在 | 已通过 Wrangler 读取远程 Secret 名称确认，内容不会回显 |
| `/healthz` 公开探活 | 已通过 | 返回 `HTTP 200`，响应为 `{"status":"ok"}` |
| `/readyz` 未认证访问 | 按预期拒绝 | 返回应用层 `HTTP 401`，需要 Cloudflare Access assertion |
| QSL Template Studio V2 | 已实现本地代码与测试；生产写入默认关闭 | `FEATURE_TEMPLATE_STUDIO=0` |
| Agent 实时入库 | 暂不开放 | `FEATURE_AGENT_INGEST=0` |
| QRZ 邮件发卡 | 暂不开放 | `FEATURE_EMAIL_DELIVERY=0` |

Cloudflare 部署记录和公开探活均已通过，但不等同于业务验收完成。下一步仍需使用有效的 Access assertion 验证 `/readyz`、Owner 登录、D1/R2 读写和恢复流程。

## 功能概览

| 模块 | 已实现能力 | 关键边界 |
|---|---|---|
| QSO/ADIF | QSO 增删改查、软删除、ADIF 3.1.7 导入/导出、扩展字段保留 | 旧 QSO/card API 和 ID 保持兼容 |
| 卡片 | 模板、快照、草稿/就绪/发布/作废、公开号查验 | 发布卡片不受后续 QSO/模板修改影响 |
| 实时入库 v1.1 | WSJT-X/N1MM UDP 解码、SQLite Outbox、HTTPS 幂等补传、Owner 审核收件箱 | 不控制电台；replace/delete 不自动改云端 QSO |
| 印刷 v1.1/v1.2 | A4 四拼矢量 PDF、单卡 3 mm 出血、批次冻结、PDF 预检 | 每批≤200张；中文字体、独立二维码解码和实体尺测待验收 |
| 批量制卡 v1.2 | 按顺序创建卡片草稿、快照和幂等批次 | 浏览器断点续渲染和完整批量 UI 仍在演进 |
| QRZ 发卡 v1.2 | QRZ XML 查询、脱敏预览、PII 加密、Resend 发送、节流、回执和退信抑制 | 每批≤50封、默认100封/UTC日；生产开关关闭 |
| 安全与备份 | Access、Agent scope、Same-Origin、D1/R2、Workflows、审计、恢复校验脚本 | Access/QRZ/Resend/PII 真实配置和恢复演练待完成 |

### 版本边界

- **v1.0**：日志、ADIF、模板、电子卡、公开查验和每日备份。
- **v1.1**：实时 Agent 入库 + A4 四拼 PDF + 设备管理。
- **v1.2**：单卡出血 + 批量制卡 + QRZ 邮箱预览/明确确认后发卡。
- 不包含 CAT 控制、LoTW/QRZ Logbook 同步、地图和多操作员权限。

### QSL Template Studio V2（当前实现）

模板工作室采用 `TemplateV2 → CardScene → Canvas/PDF/Konva` 单一数据链路：模板 JSON 是可保存事实，CardScene 是绑定 QSO、字体测量、二维码展开后的渲染事实，Konva 只负责编辑交互。旧 V1 模板和渲染路径仍保留。

- 三款内置预设：Classic DX、Photo Journal、Minimal Grid；点击“使用此预设”通过 `Idempotency-Key` 创建独立副本。
- 快速模式：背景/强调色、照片 asset 上传、CW/FT8/中文预览、5 mm 安全区与图片 DPI/二维码/字体预检。
- 高级模式：懒加载 Konva core，拖动只在 `dragEnd` 产生 mm 命令；禁止旋转/翻转，辅助线和 Stage JSON 不写入模板。
- 保存：服务器版本号 + 412 冲突保护；本地草稿只保存模板文档、版本和时间，不保存 QSO、Token 或邮件地址。
- 卡片/批量/打印：创建时冻结 V2 模板、QSO、字体 manifest 和 asset refs；后续修改原模板或 QSO 不会影响已冻结卡片。

本地验证：

~~~bash
pnpm install
pnpm generate:openapi && pnpm generate:api
pnpm lint && pnpm typecheck && pnpm test
pnpm build && pnpm check:bundle
~~~

生产先部署兼容读路径，确认迁移 `0008_template_studio.sql`、`0009_print_asset_refs.sql` 已应用后，再按验收结果将 `FEATURE_TEMPLATE_STUDIO` 从 `0` 调为 `1`。当前开关保持关闭；这不会阻断已存在 V2 模板的读取、制卡或打印。

## 架构与目录

~~~mermaid
flowchart LR
  Radio["WSJT-X / N1MM UDP"] --> Agent["myqsl-agent\nSQLite Outbox"]
  Agent -->|HTTPS + Access Service Auth| Worker["Cloudflare Worker"]
  Owner["React Owner SPA"] -->|Access JWT| Worker
  Visitor["Public Lookup"] --> Worker
  Worker --> D1["D1"]
  Worker --> R2["R2"]
  Worker --> QRZ["QRZ XML"]
  Worker --> Mail["Resend + Webhook"]
  Worker --> Backup["Backup Workflow"] --> R2
~~~

~~~text
eqsr/
├── apps/web/                    React + Vite 管理端与公共查验
├── apps/worker/                 Hono Worker API、迁移后的 D1 业务模块
├── apps/agent/                  Node 24 Agent 配置、Outbox、上传器和测试
├── packages/domain/             Zod 契约、hash、OpenAPI、API path
├── packages/adif-codec/         ADIF 3.1.7 codec
├── packages/radio-codec/        WSJT-X/N1MM UDP/XML codec
├── packages/card-renderer/      浏览器卡片渲染
├── packages/card-pdf/           A4/出血 PDF 矢量渲染与预检
├── infra/migrations/             0001–0007 D1 增量迁移
├── scripts/                     生成、质量门禁、Agent 打包、PDF/备份验证
├── openapi/                     生成的 OpenAPI 3.1 YAML
└── docs/                        设计、执行日志和运行手册
~~~

## 日常操作

### QSO、导入和电子卡

1. 在 '/admin/qsos' 维护 QSO；输入频率时会联动波段，支持 UTC、RST、网格和扩展字段。
2. 在 '/admin/import' 导入 '.adi/.adif'；解析在 Web Worker 中执行，结果按 accepted/warning/duplicate/rejected 分桶。
3. 在 '/admin/templates' 编辑背景和字段布局；在 '/admin/cards' 生成草稿、上传 PNG、发布或作废。
4. 访客从 '/lookup' 按呼号和日期查询，公开卡片作废后优先返回 410。

### 实时 Agent 与审核

1. Owner 在 '/admin/settings/integrations' 创建设备和 profile，令牌只显示一次。
2. 配置 WSJT-X/N1MM 把 UDP 发到 Agent 监听端口。
3. Agent 先落盘再上传；在 '/admin/settings/integrations/review' 处理 external replace/delete。
4. 审核“忽略”必须填写原因；系统写入 audit_events，不会自动覆盖 QSO。

### 矢量打印

1. 在 '/admin/print' 提交有序 QSO/card ID 和模板。
2. 服务端冻结 manifest；修改原 QSO、模板或背景不会改变该批次。
3. 生成 'a4-four-up-v1' 或 'single-bleed-v1' PDF；下载前执行预检。
4. 家用 A4 使用四拼零出血；印厂单卡使用 146×96 mm/3 mm 出血，不混用 profile。

### QRZ 邮箱发卡

1. 在 '/admin/deliveries' 选择已发布卡片，创建预览。
2. 等待 QRZ 查询；只显示脱敏邮箱和 blocked/ready 状态，不会自动发送。
3. 确认 ready 的 delivery 项后点击发送；服务端锁定收件人、正文、附件和 idempotency key。
4. 发送状态以 D1 和 Resend webhook 为准；unknown 不可盲目换 key 重发，hard bounce/complaint 会抑制后续发卡。

## 本地安装

### 环境

- Node.js '>=24 <25'（推荐 Node 24 LTS；CI 固定 Node 24）
- pnpm 10.15+（Corepack）
- Wrangler 4.128+
- macOS/Linux/WSL 可直接运行本地 Worker；真实 Agent 交付还需 Windows 11/macOS/Linux 实机验证

### 安装和启动

~~~bash
git clone https://github.com/neilshare/myQSL.git
cd myQSL
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
~~~

打开 'http://127.0.0.1:8787/admin/qsos'。本地配置文件 [wrangler.test.jsonc](wrangler.test.jsonc) 只用于测试，开启了 'TEST_AUTH_ENABLED=1' 和 phase-2 feature flags，不能复制到生产。

### 本地质量门禁

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

PDF 结构检查需要实际文件和 manifest：

~~~bash
pnpm verify:pdf path/to/output.pdf --manifest path/to/manifest.json
~~~

该命令目前检查页数和页面尺寸；二维码独立解码、字体覆盖和实体打印需额外工具。

## 无线电 Agent

### 服务端配置

1. Owner 在集成页面选择现有台站并创建 profile。
2. 保存一次性 'mqa_...' 令牌；服务端仅存 token SHA-256。
3. 生产 Worker 必须配置 Agent Access Service Auth：'AGENT_ACCESS_AUD'、'AGENT_ACCESS_TEAM_DOMAIN'、'AGENT_ACCESS_CLIENT_ID'，client secret 放 Cloudflare Secret。
4. 先保持 'FEATURE_AGENT_INGEST=0'，完成 staging/真机验证后再按设备开启。

### 构建产物

~~~bash
pnpm --filter @myqsl/agent typecheck
pnpm --filter @myqsl/agent test
pnpm exec tsx scripts/build-agent.mts
~~~

产物在 'dist/agent/'：

- 'myqsl-agent-v1.1.0.tar.gz'
- 'runtime-manifest.json'
- 'SHA256SUMS'

当前包是可审计的 Node 运行包/源代码归档，不是签名的 Windows MSI、macOS app 或自动升级器；四平台安装、服务管理和断网 24 小时证据仍是发布前工作。

### 配置契约

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

默认只绑定 '127.0.0.1'；允许局域网时必须配置 peer IP allow-list。启动前使用 'doctor' 检查 origin、端口、SQLite WAL/FULL 和磁盘，运行中使用 'status' 查看队列和最近收据。不要删除 outbox 数据目录；达到 50,000 条或 256 MiB 时停止淘汰并告警。

## GitHub 到 Cloudflare 部署

### Cloudflare 资源

生产配置为 [wrangler.jsonc](wrangler.jsonc)：

- Worker：'myqsl'
- D1：'myqsl-prod'，迁移目录 'infra/migrations'
- R2：'myqsl-media'
- Workflow：'myqsl-d1-backup'、'myqsl-email-dispatch'（邮件开关关闭时不发送）
- Custom Domain：'myqsl.203031.xyz'

最近一次 Cloudflare 检查结果：Worker 最新部署版本已获得 100% 流量；自定义域名可到达 Worker，`/healthz` 返回 `HTTP 200`，`/readyz` 返回应用层 `HTTP 401`。这表明公开探活路径已正确绕过边缘 Access，受保护的就绪检查仍按预期要求认证。

首次部署前创建/确认 D1、R2、Access 应用和自定义域名；不要把真实 token、密码、PII key 或 QRZ/Resend 凭据提交 Git。

### GitHub Actions

- [deploy.yml](.github/workflows/deploy.yml)：'main' push 或手动触发，依次执行 OpenAPI/API 漂移检查、严格生产预检、D1 远程迁移、构建和 Wrangler 部署。
- [agent-release.yml](.github/workflows/agent-release.yml)：'agent-v1.1.*' tag 触发 Agent 测试、打包和 Release。

GitHub 'production' environment 必须至少配置：

~~~text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
~~~

Worker Secrets 通过 Wrangler 写入：

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

'wrangler.jsonc' 中当前 feature flags 为：

~~~text
FEATURE_AGENT_INGEST=0
FEATURE_PRINT=1
FEATURE_EMAIL_DELIVERY=0
~~~

### 推荐上线顺序

1. PR 合并 'main' 前完成本地质量门禁。
2. 先只部署 v1.0 + print，生产预检确认 secrets 不缺失。
3. staging 验证 Agent Access、站台 scope、真实 UDP、重启和断网补传。
4. 对单个 Agent 开启实时入库，观察队列、收据和 review inbox。
5. 用 fake provider 测试邮件，再用 Owner 自有测试邮箱验证 SPF/DKIM/DMARC、附件和 webhook。
6. 完成恢复演练后才开启 'FEATURE_EMAIL_DELIVERY=1'。

### 部署后检查

~~~bash
curl -iSs https://myqsl.203031.xyz/healthz
curl -iSs https://myqsl.203031.xyz/readyz
pnpm verify:production --strict
~~~

验收标准如下：

- `/healthz` 应返回 `HTTP 200`；`/readyz` 未携带 assertion 时返回应用层 `HTTP 401`，携带有效 Owner/Service Auth 后再验证 `HTTP 200`。
- 本次检查中 `/healthz` 返回 `HTTP 200`，`/readyz` 返回预期的应用层 `HTTP 401`，未出现边缘 Access `302` 重定向，公开探活验收 **通过**。
- `pnpm verify:production --strict` 必须在部署凭据和全部生产 Secret 可验证时运行；不要把本地 `--dry-run --skip-secrets` 结果当作生产验收。

## 验证、回滚与恢复

- **应用回滚**：在 Cloudflare Deployments 选择上一版本；不要逆向删除 D1 migration。
- **功能回滚**：优先关闭 'FEATURE_AGENT_INGEST' 或 'FEATURE_EMAIL_DELIVERY'，继续保留 webhook 接收和幂等墓碑。
- **数据库恢复**：从 R2 取 SQL 与 manifest，在隔离 SQLite 运行 'pnpm verify:backup --sql ... --database ... --manifest ...'。
- **定时任务**：'0 20 * * *' 只触发每日 D1 备份，其他每分钟 cron 用于邮件补偿；不要混淆两条路径。
- **数据安全**：PII key 必须离线备份；恢复 sending 记录前先与 provider 核对，不能批量盲目补发。

## 当前限制

以下项目尚未满足 v1.2 生产发布条件：

1. Windows 11、macOS、Linux 的真实 WSJT-X/N1MM 数据包、升级、重启、断网 24 小时补传。
2. `/readyz`、Owner API 和管理端的有效 Cloudflare Access assertion 尚未完成线上实测；当前仅验证了未认证请求会被应用层 `401` 拒绝。
3. QRZ 订阅、Resend 域、PII key 和 Agent Access Service Auth 的真实配置与验证。
4. PDF 独立 QR/文字解析、中文字体授权、TrimBox/BleedBox 和实体打印尺测。
5. Email Workflow/租约恢复、provider fault injection、Owner 完整 E2E、D1/R2/PII 恢复演练。

最近一次本地证据：包/脚本 77、Web 33、Worker 61、Agent 4 个测试通过；Lint、TypeScript、构建、Bundle 和占位符门禁通过。Worker 测试可能输出 Wrangler 日志目录 EPERM 与预期 'EXPORT_UNAVAILABLE'，但进程退出码为 0。

更多运行细节：

- [Agent 运行手册](docs/runbooks/agent.md)
- [打印运行手册](docs/runbooks/printing.md)
- [邮件运行手册](docs/runbooks/email.md)
- [Cloudflare 生产部署图文手册](docs/cloudflare-production-guide.html)
- [第二阶段设计](docs/superpowers/specs/2026-09-05-myqsl-v1.1-v1.2-design.md)
- [第二阶段实施计划](docs/superpowers/plans/2026-09-05-myqsl-v1.1-v1.2-implementation.md)

## 许可证

本项目基于 [MIT License](LICENSE) 开源发布。
