# myQSL Agent 运行手册

1. 在 Owner 的“设备集成”页面创建设备，选择既有台站，记录一次性 `mqa_...` 令牌；令牌只写入本机受限配置文件，不进入日志或仓库。
2. 配置服务端 origin、Cloudflare Access Service Token、profile/source instance、UDP 端口及 SQLite 数据目录。默认只绑定 `127.0.0.1`，需要局域网时同时配置 `allowed_peer_ips`。
3. 启动后先执行 `myqsl-agent doctor`，确认 UDP 端口、SQLite WAL/FULL、磁盘余量和 HTTPS origin；`status` 用于观察 oldest queue age、最近报文和云端收据。
4. 断网期间不要删除 SQLite 文件。恢复网络后代理会从 `pending/retry_wait` 继续上报，同一 `event_id` 重试不会重复写 QSO；满 50,000 条或 256 MiB 时停止淘汰并告警。
5. 设备遗失或令牌泄露时立即在页面吊销/轮换，旧队列仍可导出后由新设备继续补传；外部 replace/delete 只进入收件箱，不会自动修改日志。

正式验收还需在 Windows 11、macOS 和 Linux 上使用真实 WSJT-X/N1MM 产生一条记录，并保存版本、时间、source instance 与最终 QSO 数量证据。
