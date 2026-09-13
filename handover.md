# myQSL 项目协同交接文档

> 本文用于交给后续 AI 或开发者继续协同开发。内容以仓库实际代码、当前 Git 状态和最近一次 Cloudflare 线上检查为准；计划项、历史记录和已验证事实必须区分，不得把“代码已实现”误写成“生产已验收”。

## 1. 交接快照

- 项目目录：`/Users/zhangneil/WorkBuddy/HAM/eqsr`
- Git 远程仓库：`https://github.com/neilshare/myQSL.git`
- 当前分支：`main`
- 当前 HEAD：`504ea2f config: set Cloudflare account id`
- `main` 与 `origin/main`：交接开始时已同步
- 本次交接时间：2026-09-14（Asia/Shanghai）
- 当前工作树：`README.md` 有本地未提交修改；本文件为新建交接文件，也需要后续提交。不要假设这两份文档已经进入 GitHub。

### 最近已推送的关键提交

| 提交 | 内容 |
|---|---|
| `a1ef02d` | 增强邮件 Workflow dispatch 与恢复路径 |
| `272aa79` | CI 强制备份运行时账号配置 |
| `504ea2f` | 将 Cloudflare Account ID 写入生产 `wrangler.jsonc` |

## 2. 项目目标与版本边界

myQSL 是单所有者业余无线电 QSO/QSL 系统，覆盖 ADIF 日志、卡片模板与电子卡、公开查验、矢量 PDF 印刷、WSJT-X/N1MM 实时入库和 QRZ 邮箱发卡。

- **v1.0**：QSO/ADIF、模板、卡片快照、公开查验、D1/R2 备份。
- **v1.1**：WSJT-X/N1MM UDP 本地代理、SQLite Outbox、HTTPS 幂等补传、Owner 审核收件箱、A4 四拼 PDF。
- **v1.2**：单卡 3 mm 出血、批量制卡、QRZ XML 查询、PII 加密、Resend 投递、Webhook 回执和抑制名单。
- 明确不包含：CAT 电台控制、LoTW/QRZ Logbook 同步、地图、多操作员权限。

### 当前生产开关

`wrangler.jsonc` 顶层是生产配置，当前值为：

```text
APP_ENV=production
FEATURE_AGENT_INGEST=0
FEATURE_PRINT=1
FEATURE_EMAIL_DELIVERY=0
```

因此当前可以验证基础 Worker、公开查验和打印后端；Agent 实时入库和 QRZ 邮件发卡不能宣称已生产启用。

## 3. 总体架构与关键数据流

```text
WSJT-X/N1MM UDP
        │
        ▼
myqsl-agent（Node 24，SQLite WAL/FULL Outbox）
        │ HTTPS + Agent Bearer / Access Service Auth
        ▼
Cloudflare Worker（Hono）
   ┌────┼───────────────┬───────────────┐
   ▼    ▼               ▼               ▼
  D1   R2/Assets    QRZ XML        Workflows
   │                    │               │
   │                    ▼               ▼
   │              PII 加密/脱敏     Resend + Webhook
   ▼
Owner 审核、QSO、卡片、打印批次、投递状态
```

### 代码分层

| 层 | 位置 | 职责 |
|---|---|---|
| Web | `apps/web` | React + Vite 管理端和公开查验页面；当前完整批量 UI/E2E 仍在演进 |
| Worker 入口 | `apps/worker/src/index.ts` | Hono 路由注册、访问控制、Feature Flag、cron、Workflow 触发 |
| Worker 业务模块 | `apps/worker/src/modules/*` | QSO、导入、卡片、打印、Agent 入库、备份、目录和邮件投递 |
| Worker 平台层 | `apps/worker/src/platform/*` | Access JWT、Agent 认证、D1/R2、PII、限流、审计、错误协议、安全响应头 |
| Agent | `apps/agent` | UDP 接收、WSJT-X/N1MM 解码、SQLite Outbox、诊断、上传和 CLI |
| 领域契约 | `packages/domain` | Zod schema、API path、QSO/Radio/Print/Delivery 契约、幂等/规范化工具 |
| 协议包 | `packages/adif-codec`、`packages/radio-codec` | ADIF 3.1.7、WSJT-X/N1MM XML/二进制协议解析 |
| PDF | `packages/card-pdf`、`packages/card-renderer` | 矢量文字/QR、A4 四拼、单卡 bleed、预检和浏览器渲染 |
| 工程脚本 | `scripts` | OpenAPI/API client 生成、生产预检、Agent 打包、PDF/备份验证、bundle 门禁 |
| 数据库 | `infra/migrations` | D1 迁移 `0001`–`0007`，涵盖核心、快照、Agent、打印、批次和投递 |

### 核心数据流和不变式

1. Agent 收到 UDP 后先写入 SQLite Outbox，再上传；网络故障或进程重启不能丢事件。
2. Radio event 使用 canonical payload + SHA-256；`device_id + event_id`、source link 和 QSO dedupe key 共同保证幂等。
3. D1 入库使用批量写入和竞态重复处理；重复事件返回 receipt，不重复创建 QSO。
4. 打印批次创建时冻结 QSO/card/template/background 快照；后续源数据变化不得改变已生成批次。
5. 邮件投递先生成脱敏预览，Owner 明确选择后才发送；固定 provider idempotency key，未知状态禁止盲目换 key 重发。
6. PII 使用版本化密钥和 AES-GCM/HMAC；QRZ 邮箱只在服务端解析，UI 只显示脱敏地址。

## 4. 已作出的关键技术决议

### Cloudflare 部署路径

- Worker：`myqsl`，配置文件：`wrangler.jsonc`。
- D1：`myqsl-prod`，绑定 `DB`；生产 UUID 已写入配置，禁止恢复成占位 UUID。
- R2：`myqsl-media`，绑定 `MEDIA`。
- Custom Domain：`https://myqsl.203031.xyz`。
- Workflow：`myqsl-d1-backup` 和 `myqsl-email-dispatch`。
- GitHub `main` push 或手动触发 `.github/workflows/deploy.yml`：安装依赖 → 生成 OpenAPI/API client → 严格生产预检 → D1 远程迁移 → build → `wrangler deploy`。
- GitHub Actions 使用 `production` environment 的 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`；部署 Token 不得注入 Worker 运行时。

### 访问控制

- `/healthz` 为公开探活。
- `/readyz` 通过 Worker 的 `requireOwner` 保护，未带 `Cf-Access-Jwt-Assertion` 时应返回应用层 `401`。
- Owner API、管理端、备份和敏感模块需要 Cloudflare Access JWT；Agent API 另有设备 scope/bearer 校验。
- 公开查验和 `/api/v1/public/*` 不依赖 Owner 身份，但仍受同源、限流和输入校验约束。
- 生产禁止 `TEST_AUTH_ENABLED`、`AUTH_DISABLED` 等测试旁路。

### Secret 与配置

- 已通过 Cloudflare 远程 Secret 列表确认存在：`D1_REST_API_TOKEN`、`RATE_LIMIT_SALT`。
- `D1_REST_API_TOKEN` 仅用于 Worker 备份调用 D1 Export API，建议使用独立最小权限 Token，不得与部署 Token 共用。
- `RATE_LIMIT_SALT` 推荐使用本地 `openssl rand -hex 32` 生成的 64 位十六进制随机值；每个环境单独生成，不提交 Git，不发到聊天。生产缺失时限流代码 fail closed；本地才允许默认盐。
- QRZ、Resend、PII、Agent Access Secret 等仅在对应功能启用前写入 Cloudflare Secret，当前不应硬编码或复制到 `wrangler.jsonc`。
- `ACCESS_AUD`、`ACCESS_TEAM_DOMAIN` 当前作为生产 vars 配置；不要擅自把公开 audience 误当成 Secret，也不要改变现有域名/Audience 配对。

## 5. 当前线上事实（已实测）

最近一次使用 Wrangler 和 HTTPS 直接检查的结果：

| 项目 | 结果 | 证据/说明 |
|---|---|---|
| Cloudflare 最新部署 | 正常 | 部署记录 `4a1dbed3-4a98-4690-90da-7ae77671d1e6`，版本 `55b540ed-a302-408b-a028-1f036f24cc07`，100% 流量 |
| `/healthz` | 通过 | `HTTP 200`，响应 `{"status":"ok"}` |
| `/readyz` 无认证 | 按预期拒绝 | `HTTP 401`，`Cloudflare Access assertion is missing` |
| 边缘 Access 重定向 | 已消除 | `/healthz` 不再返回 `302` 登录重定向；请求已到达 Worker |
| Worker Secret 名称 | 已确认 | `D1_REST_API_TOKEN`、`RATE_LIMIT_SALT` 均为 `secret_text` |

`/readyz` 尚未使用真实 Owner JWT 或 Access Service Token 做 `200` 就绪验证；D1/R2 完整读写、生产恢复和邮件/Agent 真实链路也尚未完成验收。

## 6. 已完成与部分完成情况

### 已完成或代码级完成

- 核心 QSO、ADIF、卡片、公开查验和快照模型。
- WSJT-X/N1MM codec、bounded reader、事件 hash、Agent Outbox、上传器和 D1 幂等入库。
- 打印批次、manifest 冻结、A4 四拼和 `single-bleed-v1` 几何、PDF 预检。
- QRZ XML client、会话 single-flight/cache、脱敏预览、PII 加密、Resend/Fake provider、固定幂等键、Webhook 状态机。
- Email Workflow 的 claim/attempt、租约恢复、分钟级补偿、23 小时/8 次保护和孤儿 webhook 修复调度器。
- OpenAPI/API client 生成门禁、生产配置预检、Agent reproducible tar/SHA 打包、D1/R2 备份验证脚本。
- GitHub deploy workflow 已固定 Action SHA，并在部署前执行严格生产预检和迁移。

### 仍为 partial 或尚未完成

- 没有真实 WSJT-X/N1MM 硬件抓包、四平台安装、重启和断网 24 小时证据。
- Agent Access Service Auth、设备 scope、Owner review inbox 的完整生产 E2E 尚未验收；生产开关保持关闭。
- PDF 中文字体授权/嵌入、独立 QR/文字解码、TrimBox/BleedBox 和实体打印尺测未完成。
- QRZ 真实订阅、Resend 发件域 SPF/DKIM/DMARC、自发邮件、退信和 provider fault injection 未完成；邮件开关保持关闭。
- D1/R2/PII 恢复演练、Workflow 重启/跨日配额恢复和完整 Owner E2E 未完成。
- 浏览器批量制卡可恢复渲染、完整投递历史/取消/重试 UI 仍需补齐。

## 7. 验证证据与命令

项目声明 Node `>=24 <25`，CI 固定 Node 24。历史执行日志中曾使用 Node 26.8.1 做过 typecheck；继续开发时应切换到 Node 24，避免环境差异。

### 本地质量门禁

```bash
cd /Users/zhangneil/WorkBuddy/HAM/eqsr
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:bundle
pnpm check:placeholders
pnpm verify:production --dry-run --skip-secrets
```

最新执行日志记录：packages/scripts 78 tests、Web 33 tests、Worker 68 tests、Agent 4 tests 通过；Wrangler 日志目录 `EPERM` 和预期的 backup `EXPORT_UNAVAILABLE` 输出不影响测试退出码。若重新执行，应以新命令输出为准。

### 线上只读检查

```bash
pnpm exec wrangler deployments list --config wrangler.jsonc
curl -iSs https://myqsl.203031.xyz/healthz
curl -iSs https://myqsl.203031.xyz/readyz
```

验证 Secret 只查名称，不读取内容：

```bash
pnpm exec wrangler secret list --config wrangler.jsonc
```

### 写入 Secret

```bash
openssl rand -hex 32
pnpm exec wrangler secret put RATE_LIMIT_SALT --config wrangler.jsonc
pnpm exec wrangler secret put D1_REST_API_TOKEN --config wrangler.jsonc
```

生成的值只在本地终端输入；不要把值放入 shell 历史、日志、Issue、README 或 GitHub 普通变量。

## 8. 下一阶段执行顺序

### P0：先完成生产验收闭环

1. 将当前 `README.md` 和 `handover.md` 提交并推送到 `main`；确认 GitHub Actions 的 strict preflight、D1 migration、build、deploy 全部成功。
2. 用真实 Cloudflare Access JWT 或 Service Token 调用 `/readyz`，确认返回 `200` 且 `d1=connected`；同时验证 Owner 登录、一个受保护 API 和一个公开卡片查验路径。
3. 在 Cloudflare 控制台或 Wrangler 核对 D1 生产迁移已应用；执行一次只读生产 smoke，不输出 Secret、PII 或响应正文中的敏感字段。
4. 记录新的 Deployment ID、Worker version、Git SHA、迁移版本和 smoke 结果到受控发布记录。

### P1：按功能逐项开启

1. Agent：先配置 Access Service Auth 和设备 profile，在 staging 发送真实 WSJT-X/N1MM 包；验证 UDP、Outbox、重启、断网补传、重复事件、review inbox，再只对一个 profile 开启 `FEATURE_AGENT_INGEST`。
2. Print：完成 CJK 字体/许可证决策、独立 QR 解码、TrimBox/BleedBox 和实体打印尺测；未完成前只能作为测试打印。
3. Email：配置 QRZ 订阅、PII key、Resend 域和 webhook secret；先 Fake provider，再 Owner 自有邮箱，最后才按小配额开启 `FEATURE_EMAIL_DELIVERY`。
4. Backup/restore：执行 D1 导出、R2 对象校验、隔离 SQLite 恢复和 Worker 回滚演练；保留 `RESTORE_VERIFIED` 证据。

### P2：工程化和体验收尾

- 补齐 Agent 四平台安装/服务管理/升级与签名包。
- 补齐 Web 批量制卡和投递历史/取消/重试 E2E。
- 增加 Workflow/provider chaos、D1 并发、R2 故障、磁盘满和 Windows ACL 测试。
- 统一运行手册的健康响应描述：代码当前返回 `{"status":"ok"}`，旧文档中仍有 `{"status":"healthy"}` 的表述，需要同步。

## 9. 交接约束与风险控制

- 不要把 `wrangler.test.jsonc` 用于生产；生产只使用顶层 `wrangler.jsonc`。
- 不要直接修改生产 D1 数据或逆向删除已应用 migration；新增 schema 必须追加迁移并补测试。
- 不要在没有幂等键、快照哈希、事件哈希或回执墓碑的情况下改写 Agent、打印和投递主链路。
- 不要在验证失败时开启 Agent 或 Email feature flag；功能开关是当前主要回滚手段。
- 不要把 Cloudflare API Token、D1 token、QRZ 密码、Resend key、PII key、Access client secret 提交到 GitHub。
- 任何新增 API 先更新 `packages/domain`、OpenAPI 和生成 client，再实现 Worker/Web；完成后执行生成一致性检查。
- Wrangler 在本机可能因为日志目录权限输出 `EPERM`；只要命令仍返回有效 JSON/退出码为 0，可将其视为本地日志权限问题，但不要忽略真正的 API 错误。
- 以本文件的“当前线上事实”和代码为准；`docs/phase-2/execution-log.md` 仍包含早期“未验证账号/Secret”的历史描述，后续可补充但不要据此否定已经实测的当前状态。

## 10. 关联文档

- [FULFILLMENT.md](FULFILLMENT.md)：第二阶段交付履约与质量闭环验收报告
- [README.md](README.md)：安装、日常操作和部署概览
- [PRD.md](PRD.md)：业务需求与版本边界
- [docs/phase-2/execution-log.md](docs/phase-2/execution-log.md)：Task 记录和历史测试证据
- [docs/runbooks/deploy.md](docs/runbooks/deploy.md)：生产部署步骤
- [docs/runbooks/access-paths.md](docs/runbooks/access-paths.md)：Access 路径策略
- [docs/runbooks/production-checklist.md](docs/runbooks/production-checklist.md)：首次上线检查清单
- [wrangler.jsonc](wrangler.jsonc)：生产 Worker、D1、R2、Workflow 和 vars
- [.github/workflows/deploy.yml](.github/workflows/deploy.yml)：GitHub 到 Cloudflare 的部署流水线

