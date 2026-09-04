# D1 备份运行手册

每日 UTC 20:00 由 `myqsl-d1-backup` Workflow 调用 Cloudflare D1 Export API，将 SQL 流式写入 `backups/daily/YYYY/MM/DD/{workflow_instance_id}.sql`。生产环境需要在 Worker secret 中配置 `D1_REST_API_TOKEN`，并在 vars 中配置账号 ID 与数据库 ID。

保留策略：daily 对象 30 天，monthly 对象 365 天。手工备份使用 `POST /api/v1/backups/run`，需要 Owner Access；重复运行返回 409。每次恢复前运行 `pnpm tsx scripts/verify-backup.mts --sql <file> --database <local-name>`。
