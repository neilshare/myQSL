# 首次上线检查清单

- [ ] D1 `eqsr-prod` UUID 已写入生产配置，R2 `eqsr-media` 已创建。
- [ ] Access owner/public 路径策略已按手册创建，JWT audience 与 Worker 配置一致。
- [ ] `ci / verify` 已设为 `main` 必需检查，禁止强推和直接删除分支。
- [ ] Workers Builds 只在 `main` 合并后部署，未配置第二条生产发布流水线。
- [ ] 已执行一次备份、独立恢复校验和上一版本回滚演练。
- [ ] 已从上海移动、联通、电信网络记录自定义域名可达性。

## First release evidence

填写实际日期、Worker version ID、D1 migration、备份对象 key、恢复输出和 smoke 输出；所有值来自生产操作记录，不放置访问令牌。
