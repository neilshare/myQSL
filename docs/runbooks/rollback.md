# 生产环境回滚手册

## 1. 适用场景与触发条件
- 新发布的 Worker 脚本或前端资产出现运行时不可恢复异常（如 5xx 错误率骤增、关键功能不可用）。
- 部署后自动化冒烟测试或 `/readyz` 健康检查失败。
- 发生不可预期的外部交互不兼容。

## 2. Worker 版本即时回滚流程

Cloudflare Workers 支持基于 Deployment 版本的秒级流量瞬时回退：
1. 登录 Cloudflare Dashboard，导航至 **Compute (Workers) -> Workers & Pages -> myqsl**；
2. 进入 **Deployments** 选项卡，查看当前生产运行版本及历史版本列表；
3. 定位至上一个已通过全面验证的稳定版本（Status: Active 之前的版本）；
4. 点击右侧菜单并选择 **Rollback to this deployment**，确认回滚操作；
5. Cloudflare 边缘节点将在秒级内将 100% 生产流量切回至该历史镜像，无需重新构建。

## 3. 数据库前向兼容性与不可逆原则

1. **严禁回滚已应用的 D1 数据库迁移**：
   - D1 数据库迁移采用严格单向递增原则，禁止通过删除表或字段进行破坏性逆向迁移，防止生产 QSO 历史通联与卡片数据丢失。
2. **前向兼容修复策略**：
   - 若新版本的数据库结构存在兼容性问题，应优先保持字段可空或采用过渡默认值；
   - 编写新的增量补丁迁移脚本（`infra/migrations/<timestamp>_forward_fix.sql`），按正常 CI/CD 流程发布并应用。
3. **极端灾难恢复**：
   - 若发生大面积数据损坏，参照 `docs/runbooks/backup.md` 与 `docs/runbooks/restore.md`，使用从 R2 下载的已验证全量 SQL 备份在备用库导入验证后切换，或使用 Cloudflare D1 Time Travel 回退至损坏前的时刻。

## 4. 回滚后验收与指标确认

完成 Worker 回滚后，必须立即执行以下检查：
1. **自动化冒烟检测**：
   ```bash
   MYQSL_PRODUCTION_ORIGIN=https://<operator-domain> pnpm tsx scripts/smoke.mts --origin "$MYQSL_PRODUCTION_ORIGIN"
   curl -f -s -S "$MYQSL_PRODUCTION_ORIGIN/readyz"
   ```
2. **公开查验端验证**：
   - 打开浏览器访问公开卡片查验页面，确认页面资源加载正常，无 404 或脚本语法报错；
   - 测试单次卡片验证查询，确认速率限制器未误杀正常请求。
3. **管理后台验证**：
   - 通过 Cloudflare Access 身份验证后登录，确认 QSO 列表、日志导入与制卡队列展示正常。
4. **指标监控观察**：
   - 观察 Cloudflare 仪表盘 15 分钟，确认 5xx 错误率回落至 0%，平均 CPU 耗时维持在 10ms 以内。

