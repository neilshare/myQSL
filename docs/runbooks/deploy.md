# 生产部署手册

## 1. 基础资源准备与密钥配置

1. 在目标 Cloudflare 账户执行创建命令：
   ```bash
   wrangler d1 create eqsr-prod --location=apac
   wrangler r2 bucket create eqsr-media
   ```
2. 将返回的实际 D1 UUID 写入生产配置，通过 `wrangler secret put` 设置生产必需密钥：
   ```bash
   wrangler secret put D1_REST_API_TOKEN
   wrangler secret put ACCESS_AUD
   wrangler secret put RATE_LIMIT_SALT
   ```
3. 确认环境变量设置：`APP_ENV=production`、`PUBLIC_ORIGIN=https://<operator-domain>`、`TEST_AUTH_ENABLED=0`。所有敏感凭据仅保存在 Cloudflare Secret，严禁提交到代码仓库。

## 2. GitHub 仓库与分支保护策略

1. 生产代码基线分支锁定为 `main`。
2. 开启 GitHub 分支保护规则：
   - 勾选 `Require a pull request before merging`；
   - 勾选 `Require status checks to pass before merging`，强制要求 `ci / check` 门禁检查全绿；
   - 勾选 `Do not allow bypassing the above settings`；
   - 严禁对 `main` 分支执行强制推送（Force Push）或直接删除分支。

## 3. Cloudflare Workers Builds 自动化流水线配置

在 Cloudflare 控制台 Workers & Pages 关联 GitHub 仓库：
- **Production branch**: `main`
- **Build system**: Cloudflare Workers Builds
- **Root directory**: `/`
- **Build command**: `corepack enable && pnpm install --frozen-lockfile && pnpm run check`
- **Deploy command**: `pnpm verify:production && pnpm db:migrate:prod && pnpm deploy:prod`

流水线在合并至 `main` 后自动触发：
1. `pnpm run check` 门禁：执行静态分析、依赖环路检查、TypeScript 编译检查、核心包测试与 Worker 测试；
2. `pnpm verify:production` 预检：严格阻断占位 UUID、强制 HTTPS 域名、确认测试绕过逻辑关闭；
3. `pnpm db:migrate:prod`：按时间戳顺序安全应用 D1 生产增量迁移；
4. `pnpm deploy:prod`：原子发布 Worker 脚本与前端静态资产。

## 4. 部署后验证与冒烟测试

部署成功后，立即运行自动化冒烟脚本与连通性探针：
```bash
EQSR_PRODUCTION_ORIGIN=https://<operator-domain> pnpm tsx scripts/smoke.mts --origin "$EQSR_PRODUCTION_ORIGIN"
curl -f -s -S "$EQSR_PRODUCTION_ORIGIN/readyz"
```
验证标准：
- `/healthz` 返回 HTTP 200 与 `{"status":"healthy"}`；
- `/readyz` 返回 HTTP 200 确认 D1 与 R2 读写正常；
- `/` 返回 HTTP 200 并正确渲染 Web 外壳；
- 未携带 Access 凭据请求 `/api/v1/qsos` 必须严格返回 HTTP 401。

