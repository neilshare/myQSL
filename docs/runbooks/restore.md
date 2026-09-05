# D1 恢复验证手册

1. 从 R2 下载目标 SQL 到受控临时目录。
2. 准备对应的 `backup.manifest.json`（包含 `sql_sha256`、`expected_counts` 及确定性 `sample_hashes`）。
3. 运行 `pnpm tsx scripts/verify-backup.mts --sql backup.sql --database myqsl-restore-check --manifest backup.manifest.json`。
4. 确认脚本完整输出：
   `RESTORE_VERIFIED tables=9 backup_id=<id> sha256=<hash> counts_matched=9 samples_verified=2`
   脚本将在隔离的 SQLite 内存环境中重放全量 DDL 与 DML，比对各表预期行数，并按确定性规范化规则比对固定抽样行内容哈希。若表缺失、行数不符、SQL 截断或样本数据被篡改，脚本将立即以非零状态码失败。
5. 恢复后检查 `/healthz`、Owner 登录、公开卡片与 ADIF 导出；保留原始备份对象，不覆盖写入。
