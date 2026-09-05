# 首次上线检查清单

## 1. 基础架构与凭据准备
- [ ] D1 数据库 `myqsl-prod` 已在 `apac` 区域创建，真实 UUID 已配置，无 `00000000-` 占位符。
- [ ] R2 存储桶 `myqsl-media` 已创建，生命周期规则已应用（临时文件 7 天自动清除）。
- [ ] Cloudflare Access 路径策略已生效，JWT audience 与 Worker 生产环境变量保持一致。
- [ ] 必需 Secret（`D1_REST_API_TOKEN`、`ACCESS_AUD`、`RATE_LIMIT_SALT`）已通过 `wrangler secret put` 写入目标账户。
- [ ] 生产配置确认：顶层 `wrangler.jsonc` 为唯一生产配置，`APP_ENV=production`、`TEST_AUTH_ENABLED` 彻底剔除、`PUBLIC_ORIGIN` 必须为 HTTPS 域名。

## 2. 交付流水线与分支保护
- [ ] GitHub 生产分支 `main` 开启分支保护规则，禁止 Force Push，禁止删除分支。
- [ ] Pull Request 必需通过 `ci / verify`（含 OpenAPI 生成一致性、预检、Lint、Typecheck、Unit Tests、Worker Tests、Bundle 预算、Playholders 及 E2E）后方可合并。
- [ ] Cloudflare Workers Builds 关联仓库 `main` 分支作为唯一生产发布流水线。
- [ ] 生产部署命令包含 `pnpm verify:production --strict` 强制预检门禁。

## 3. 全真容灾演练与应急验证
- [ ] 执行全量数据库备份并导出至 R2，记录导出的备份对象 Key 与 content_sha256。
- [ ] 在独立离线 SQLite 实例中执行完整恢复导入，运行 `pnpm tsx scripts/verify-backup.mts --sql <file> --manifest <manifest.json>` 并输出包含行数比对与样本散列的 `RESTORE_VERIFIED` 证据。
- [ ] 验证上一版本 Worker 回滚演练，确认公开端 `/healthz` 与卡片查验页面平滑稳定无抖动。

## 4. 生产监控与网络可达性（7 天观察期）
- [ ] Workers 每日调用量与 CPU 耗时保持在安全阈值（CPU 中位数保持 <10ms）。
- [ ] D1 存储容量记录日增长率，配置 70% 阈值告警。
- [ ] R2 存储占用严格控制在免费层额度内（<10GB）。
- [ ] 自定义域名在中国主流运营商网络（电信、联通、移动）可达性检测通过。

## 5. 首次发布执行证据记录（Release Evidence）

发布操作人按生产实际记录以下关键指标，严禁录入访问令牌与机密明文：
- 部署记录日期：`2026-09-04`
- 代码提交版本（Git Commit SHA）：记录合并至 `main` 的实际提交哈希
- Worker 发布版本 ID（Deployment ID）：记录 Cloudflare 控制台展示的版本序号
- D1 迁移最终版本号：记录 `infra/migrations` 最新迁移时间戳
- 容灾备份验证对象：记录 R2 备份文件路径与 `RESTORE_VERIFIED tables=9` 执行日志
- 生产冒烟验证日志：记录 `scripts/smoke.mts` 输出的 `SMOKE_OK` 结果状态码

