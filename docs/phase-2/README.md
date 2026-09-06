# myQSL 第二阶段 AI 开发交接入口

设计日期：2026-09-05。参考基线：v1.0.0 / `5bdcffa2a0f9190cc8154d15a368caec4078385b`。

本目录记录第二阶段设计、计划和实际执行证据。当前功能实现位于 `apps/agent`、`packages/radio-codec`、`packages/card-pdf` 及 Worker 的 ingest/printing/directory/deliveries 模块；发布前仍需完成真机、QRZ/Resend账号和印刷样稿验收。

## 阅读顺序

1. [需求细化与技术设计](../superpowers/specs/2026-09-05-myqsl-v1.1-v1.2-design.md)：版本、业务边界、数据流、协议、数据模型、接口、安全、备选与回滚。
2. [27项可执行开发计划](../superpowers/plans/2026-09-05-myqsl-v1.1-v1.2-implementation.md)：T00–T26，含文件责任、依赖、方法输入输出、实施步骤和验收条件。
3. [关键测试与发布验收矩阵](../superpowers/specs/2026-09-05-myqsl-v1.1-v1.2-test-matrix.md)：兼容/安全、UDP、PDF、QRZ/邮件测试及独立验证证据。
4. 根目录 `PRD.md`、现有源码与runbooks：了解历史实现；PRD与代码冲突处已在设计§2注明。外部协议/产品能力以设计中的官方链接为据，实施时锁定已验证版本。

## 交给编码 AI 的任务说明

请按本目录所链接的设计与T00–T26实施第二阶段。先核对当前Git HEAD与工作区变更，建立 `docs/phase-2/execution-log.md`，依次落实任务与测试；不要覆盖他人修改或重写历史迁移。v1.1完成UDP实时入库和A4四拼PDF，v1.2完成单卡3mm出血、批量电子制卡和QRZ邮箱发卡。每完成一个任务记录实际证据后勾选，接口/数据模型变更同时更新契约和相关文档。

使用项目现有TypeScript/React/Hono/D1/R2/Access/Workflows结构，新增依赖先固定版本并审计。不要实现本阶段以外的CAT发射控制、QRZ日志同步、LoTW或地图。不要把打印作为自动公开卡片的触发器，也不要把UDP入库作为自动发邮件的触发器。开发/CI使用fake邮件服务；真实发送验收使用部署配置的自有测试收件人，正式发卡只能由Owner在产品内明确确认。

旧API和`qsl_cards`状态/ID保持兼容，代理source写`api`并保存独立来源表。完成T15才能把v1.1标为可发布，完成T26及外部验收才能把v1.2邮件标为可发布。若真机/QRZ订阅/发件域配置尚缺，继续实现可独立完成的代码与fake测试，记录尚未满足的发布条件，不伪造验收通过。

## 已确定的关键取舍

- 本地代理使用Node24 CLI+SQLite持久outbox，默认loopback，明确配置后支持LAN；HTTPS设备scope与Owner权限隔离。
- 只接收已记录QSO；N1MM编辑/删除进入审阅，不自动覆盖云日志；UDP在收到并落盘前不保证无丢失。
- PDF文字和QR直接矢量绘制，照片背景仍是位图；A4四拼是140×90mm零出血，单卡印厂稿146×96mm含3mm出血。
- 打印只读冻结快照；新电子卡也从冻结快照渲染；当前已存PNG保持原样。
- QRZ XML邮箱查询需要实际账号能力/订阅，不能用网页抓取代替；与QRZ Logbook同步不同。
- 邮件首个实现是Resend，预留Cloudflare Email Service接口；D1 outbox+Workflow+签名Webhook防重复/丢状态，超幂等时间窗进入unknown。
- 沿用GitHub `main` 到Cloudflare Workers Builds；增加feature flags和增量迁移；回滚不删除新增表和幂等墓碑。

## 默认范围与限制

代理正式交付为Windows11 x64、macOS arm64/x64、Linux x64的Node24可运行CLI包；无托盘GUI/自动升级。打印每批≤200张；邮件每批≤50张、应用默认≤100封/UTC日、1封/秒；附件PNG≤5MiB。后台邮件预览异步准备，收件人预览有效15分钟；限制可在后续有容量证据的迭代调整。

实现状态以 [execution-log.md](execution-log.md) 为准。已执行类型检查、包测试、Web 测试和 Worker D1 测试；Wrangler 测试环境会输出无法写入用户目录日志的 EPERM，但测试进程本身通过。真实生产部署、QRZ订阅、Resend域名验证和四平台真机仍是发布阻塞项。
