# myQSL

myQSL（Electronic QSO & QSL Record）是一个单所有者无线电日志与电子 QSL 平台：QSO 管理、ADIF 3.1.7 双向互通、浏览器 Canvas 卡片、不可枚举公开查验，以及可验证的 D1/R2 备份。

## 本地开发

```bash
pnpm install --ignore-scripts
pnpm db:migrate:local
pnpm dev
```

常用检查：`pnpm run check`、`pnpm test:e2e`、`pnpm check:bundle`、`pnpm check:placeholders`。本地测试身份支持 `X-MYQSL-Test-Actor` 或 `Authorization: Bearer local-e2e-owner`，生产环境只接受 Cloudflare Access JWT。

## 部署模型

GitHub PR 运行 `.github/workflows/ci.yml`。合并受保护的 `main` 后，由 Cloudflare Workers Builds 执行迁移和部署；GitHub Actions 不承担生产发布。`qsl_design_samples` 位于项目目录外，不在本仓库、构建或 Git 历史中。

架构决策见 `docs/adr/`，上线、回滚、Access 路径和备份恢复见 `docs/runbooks/`。
