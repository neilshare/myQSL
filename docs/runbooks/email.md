# QRZ 邮箱发卡运行手册

1. 生产环境使用 Cloudflare Secret 保存 `QRZ_USERNAME/QRZ_PASSWORD`、`PII_KEY_B64/PII_KEY_VERSION`、`RESEND_API_KEY/RESEND_FROM/RESEND_WEBHOOK_SECRET`。PII key 必须离线备份并记录版本，不能写入 D1 或日志。
2. 创建 delivery batch 只进行 QRZ 目录查询和脱敏预览，不会外发；预览有效 15 分钟。Owner 只能勾选服务端返回的 `delivery_id`，客户端不能覆写收件人、正文或附件。
3. 发送后由 D1 outbox 和每分钟 cron 驱动 Resend；provider key 固定为 delivery id，429/5xx 受限重试，结果未知进入 `unknown`，禁止盲目换 key 重发。
4. Webhook 必须使用 Resend/Svix 原始 body 签名验证；无效签名 401，重复 provider event 只保留一条。hard bounce/complaint 会写 suppression，后续发送前阻断。
5. 每日默认配额 100 封、全局至少 1 秒一个 provider 调用。正式上线前只向部署配置的自有测试邮箱发信，确认 SPF/DKIM/DMARC、附件 ≤5 MiB、回执与退信状态可关联。
