# Access 路径手册

Owner 应用只保护 `/admin/*`、`/api/v1/stations*`、`/api/v1/qsos*`、`/api/v1/imports*`、`/api/v1/card-templates*`、`/api/v1/cards*`、`/api/v1/backups*` 和 `/readyz`，策略仅允许所有者身份。

Public Bypass 仅覆盖 `/`、`/assets/*`、`/c/*`、`/api/v1/public/*` 和 `/healthz`。将实际 Access audience 记录在受控环境变量中，不写入仓库。
