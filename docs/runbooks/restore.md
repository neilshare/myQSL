# D1 恢复验证手册

1. 从 R2 下载目标 SQL 到受控临时目录。
2. 运行 `pnpm tsx scripts/verify-backup.mts --sql backup.sql --database eqsr-restore-check`，确认输出 `RESTORE_VERIFIED tables=9`。
3. 在本地 D1 验证 QSO 数量、随机抽样 JSON 哈希和索引，再按变更窗口执行生产恢复。
4. 恢复后检查 `/healthz`、Owner 登录、公开卡片与 ADIF 导出；保留原始备份对象，不覆盖写入。
