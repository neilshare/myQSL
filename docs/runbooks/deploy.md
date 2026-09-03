# 生产部署手册

1. 在目标 Cloudflare 账户执行 `wrangler d1 create eqsr-prod --location=apac` 与 `wrangler r2 bucket create eqsr-media`，将返回的 D1 UUID 写入 `wrangler.jsonc`。
2. 设置 `D1_REST_API_TOKEN`、账号 ID、数据库 ID、Access team domain、Access audience、公开 origin 和 `APP_ENV=production`；密钥只存在 Cloudflare secret。
3. 在 Workers Builds 连接 GitHub 仓库，根目录为 `/`，生产分支为 `main`。Build command 为 `corepack enable && pnpm install --frozen-lockfile && pnpm run check`；Deploy command 为 `pnpm db:migrate:prod && pnpm deploy:prod`。
4. 合并通过保护检查的 PR，确认构建日志中的提交 SHA、迁移版本和 Worker 版本。
5. 运行 `EQSR_PRODUCTION_ORIGIN=https://<operator-domain> pnpm tsx scripts/smoke.mts --origin "$EQSR_PRODUCTION_ORIGIN"`，保存输出和版本信息。
