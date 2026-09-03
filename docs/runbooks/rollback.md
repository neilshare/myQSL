# 回滚手册

在 Cloudflare Workers 版本列表中选择上一个已验证版本并执行回滚；不要回滚已经应用的数据库迁移。回滚后运行 `scripts/smoke.mts`，检查公开卡片和 Owner API。若数据结构需要修复，先提交前向兼容迁移，再发布修复版本。
