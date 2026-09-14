# Template Studio T01 基线与回归证据

日期：2026-09-14  
代码基线：`f2a5fb1`  
执行目录：`/Users/zhangneil/WorkBuddy/HAM/eqsr`

## 基线门禁

| 命令 | 结果 | 证据/备注 |
|---|---|---|
| `node --version` | 通过但有环境偏差 | `v26.8.1`；项目要求 `>=24 <25`，因此本次结果不能替代 Node 24 CI 证据 |
| `pnpm --version` | 通过 | `10.15.0` |
| `pnpm lint` | 通过 | ESLint 通过；dependency-cruiser：222 modules / 541 dependencies，无依赖违规 |
| `pnpm typecheck` | 通过 | 8 个 workspace 项目完成 |
| `pnpm test` | 通过 | packages：17 files / 78 tests；web：15 / 33；worker：24 / 68；agent：2 / 4；总计 183 tests |
| `pnpm build` | 通过 | Vite 203 modules transformed；entry gzip 143.38 KiB |
| `pnpm check:bundle` | 通过 | `BUNDLE_OK initial_js_gzip=145602 total_bytes=474555` |

Worker 测试期间 Wrangler 尝试写入 `/Users/zhangneil/Library/Preferences/.wrangler/logs` 时产生 `EPERM` 日志告警，但测试进程仍以 0 退出且测试全部通过。这是本机日志目录权限问题，不能在 Node 24 CI 中忽略真实错误；生产/CI 应确保 Wrangler 日志目录可写或将日志重定向到允许目录。

## 固定兼容样本

- V1 模板：`packages/domain/test/fixtures/legacy-template.json`，1264×848，包含动态文字和 QR。
- V1 卡片快照：`apps/worker/test/fixtures/legacy-card-snapshot.json`，不含真实 PII，仅验证版本/布局/背景字段保持可读。
- 历史编辑入口：`/admin/templates/edit`；兼容别名 `/templates/edit` 由后续任务统一跳转并保留。

## T01 回归测试

`apps/worker/test/modules/templates.test.ts` 新增“上传背景后使用上传前版本 PATCH 必须返回 412”场景：

1. 创建版本 1 的 V1 模板；
2. 上传合法 PNG，服务端版本递增为 2；
3. 使用创建响应中的版本 1 发起 PATCH；
4. 断言返回 412，名称未被覆盖，当前版本仍为 2，并且背景引用存在。

定向命令：

```bash
pnpm exec vitest run --config apps/worker/vitest.config.ts apps/worker/test/modules/templates.test.ts
```

结果：1 test file / 4 tests passed。Wrangler 日志 `EPERM` 告警同上，不影响本次测试退出码。
