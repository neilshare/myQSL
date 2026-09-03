# QSL 电子通联记录系统 — 调研报告

> 调研日期：2026-09-03
> 调研范围：GitHub 开源项目、公开评测与文档、Cloudflare 官方定价与技术文档
> 需求约束：① 数据归我掌控、可随时访问 ② 便于日常多设备访问 ③ 自建优先用 Cloudflare 免费服务
> 目标：记录每次通联 + 作为个人备份；倾向直接用成熟现成系统而非从零自建
>
> 本报告**只做调研与方案盘点**，不含技术选型结论与实现计划（后续共同讨论）。

---

## 一、先说结论（TL;DR）

1. **成熟的"现成"Web 通联日志系统几乎全是 PHP + MySQL 架构**（Wavelog / Cloudlog），**跑不进 Cloudflare Workers / Pages 免费层**。想要"现成系统 + Cloudflare 免费"，可行路径是**自建 Wavelog + Cloudflare Tunnel 出网**（Tunnel 完全免费）。
2. **GitHub 上不存在"成熟且 Cloudflare 原生"的 QSO 日志项目**。现代 JS/TS 栈的项目（ollog、HamLog、ham-log、ta-qso-logger）全部是个位数 star 的个人项目，成熟度不足以托付多年通联数据。
3. **Cloudflare 免费额度对个人通联日志是碾压级富余**：D1 5 GB 存储 / 每日 500 万行读，个人几千条 QSO 连 1% 都用不到。真正的成本是"开发"而非"运行"。
4. **ADIF 是唯一的通用保险**。无论选哪个方案，都必须保证能一键导出 ADIF —— 这决定了你能否随时换系统。

---

## 二、方案全景

按"谁来存数据"分成四类：

| 类别 | 代表 | 数据在哪 | 多设备 | 成熟度 | 数据掌控 |
|---|---|---|---|---|---|
| **A. 第三方托管 SaaS** | QRZ Logbook、eQSL.cc、Club Log、HRDLOG、DigiQSL | 服务商数据库 | ✅ 天然 | ⭐⭐⭐⭐⭐ | ❌ 最弱（靠 ADIF 导出兜底） |
| **B. 自建成熟开源** | **Wavelog**、**Cloudlog**、ollog | 自己的服务器 | ✅ 浏览器即多设备 | ⭐⭐⭐⭐☆ | ✅ 强 |
| **C. 自建轻量 / 云平台原生** | HamLog、ham-log、ta-qso-logger、QSL-Manager、local-qso-logger | 自己的库 | ⚠️ 视实现 | ⭐⭐ | ✅ 强 |
| **D. 桌面/移动端单机** | QLog、Ham2K PoLo、HAMRS、TaffyQSL、Log4OM、N3FJP | 本机文件 | ❌ 需手工同步 | ⭐⭐⭐⭐ | ✅ 强 |

> **关键判断**：只有 A 和 B 能同时满足"多设备 + 现成可用"。C 需要自己补完，D 天然不满足多设备。**你的需求落在 B 或 A+B 组合。**

---

## 三、候选方案逐个拆解

### 3.1 自建 Web 日志（B 类）

#### ① Wavelog ⭐ 首推

| 项目 | 数据 |
|---|---|
| 仓库 | `wavelog/wavelog` · MIT · PHP |
| 星标 / Fork / 开放 Issue | **518 / 129 / 27** |
| 最后提交 | 2026-09-03（当天活跃） |
| 技术栈 | PHP 8.2–8.5 + CodeIgniter 3 + Bootstrap + jQuery；MySQL 8+ 或 MariaDB 10.11+；Apache 推荐（Nginx 可） |
| 部署 | Docker Compose（官方镜像）或 LAMP；有 `update_wavelog.sh` |

**功能**（官方 Wiki 原文要点）：
- 定位是"你的主日志"，**明确不是 QSL 服务、不是日志备份桶、不会反向从 QRZ/LoTW/eQSL 导入**
- 多用户 + 俱乐部台站权限管理、多电台档案（Station Profile）
- 地图：DXCC / 网格 / 州 / 实体已通联可视化
- 奖项跟踪：DXCC、WAS、WAZ、IOTA、SOTA、POTA、WWFF
- 完整 QSL 管理：纸质卡 + LoTW / eQSL / QRZ.com / ClubLog 同步（cron 后台自动上传）、QSL 标签打印
- 卫星工具（跟踪 + 记录）、FFT/传播可视化、API（第三方集成 + 可嵌入个人主页的 widget）
- Callbook 内置查询；ADIF 导入（带去重/合并）导出
- 官方 Demo：https://demo.wavelog.org（demo/demo）

**生态（成熟度佐证）**：
- `int2001/WaveLogGate`（Go）：WSJT-X / FLRig → Wavelog 的 CAT 桥
- `MaviKulubeliAdam/Wavelog-Mobile`（Flutter）：Android 客户端，要求 Wavelog ≥ v3.2
- `foldynl/QLog`（Qt 桌面端，0.50.0 / 2026-04 发布）内置 Cloudlog / Wavelog 集成
- 社区迁移报告普遍反馈：相比 Cloudlog 安装更简单、性能更好、输入容错更强，ADIF 可从 Cloudlog 平滑迁入

**短板**：
- 需要一台**常开的 PHP+MySQL 主机**（不能跑在 Cloudflare Workers/Pages 免费层）
- 官方文档明确要求"具备 LAMP 基础排错能力"
- 国内用户注意：若用**国内服务器 + 域名**需 ICP 备案；境外 VPS 或纯 Tunnel 出网无此要求

#### ② Cloudlog（Wavelog 的前身）

| 项目 | 数据 |
|---|---|
| 仓库 | `magicbug/Cloudlog` · MIT · PHP · v2.8.16 |
| 星标 / Fork / 开放 Issue | **572 / 208 / 3** |
| 最后提交 | 2026-09-03 |
| 要求 | Linux、Apache（Nginx 可）、PHP 7.4+（8.2 可用）、MySQL 5.7+ |

**功能**：ADIF 导入导出、DXCC/WAS/VUCC/IOTA/DOK/SOTA 奖项、CAT 控制（Omni-Rig / rigctld）、WSJT-X 集成、卫星与 SatPC32、Dark Mode、多用户；
**API 完善**：只读/读写双密钥，端点包括 `API/QSO`（直接 POST ADIF 字符串入库并实时去重）、`API/Radio`、`API/statistics`、`API/logbook_check_callsign`、Legacy XML API；QSL 标签打印、OQRS、KML 导出、SOTA CSV 导出。

**判断**：核心开发团队（DF2ET / DJ7NT / HB9HIL / LA8AJA）2023 年底已整体出走做 Wavelog，Cloudlog 官方**不提供 Docker 生产支持**（仅开发环境）。**新装应选 Wavelog，Cloudlog 仅作历史参考。**

#### ③ ollog（架构最现代，但生态为零）

`4z1ko/ollog` · MIT · **1 star** · 最后提交 2026-06-20 · Python 3.12 + FastAPI + MongoDB 7（**需副本集**，因为用到 change stream）+ Docker Compose。
亮点：ADIF 原生字段存储、每操作员独立 MongoDB collection（`{username}_qsos`）、REST API（JWT + API Key + Swagger）、SSE 实时推送、UDP ADIF 监听、N3FJP ACLog 桥接、内置 MkDocs 文档站、v3.7 有全库备份/恢复。
**问题**：MongoDB 副本集部署成本高、社区几乎为零、无法上 Cloudflare。

#### ④ 其他轻量自建（C 类，仅列举）

| 项目 | 栈 | Star | 最后提交 | 备注 |
|---|---|---|---|---|
| `kbennett2000/HamLog` | TS + Docker + MySQL 8 + JWT | 0 | 2026-06-14 | POTA/竞赛/地图/离线优先，LAN 定位，功能很全但全新项目 |
| `zaphodthebeebs/ham-log` | React + Express + SQLite + JWT | 0 | 2026-01 | ADIF 3.1.4、DXCC/WAS、单机单用户，玩具级 |
| `talhaakkaya/ta-qso-logger` | Next.js 15 + shadcn/ui | 0 | 2025-12 | 多日志本、ADIF/CSV、地图、Google 登录（后端依赖需核实） |
| `FuDujilm/QSL-Manager` | Next.js + Prisma + SQLite + JWT | 2 | 2025-06 | **偏 QSL 卡片**：模板编辑器 + PDF 批量导出，已停更 |
| `yl3im/local-qso-logger` | 纯前端 localStorage | 4 | 2026-08 | ADIF 保真度极高（68 个竞赛模板、Cabrillo 导出、PWA），**但无服务器、无多设备同步** |
| `W9MDM/DigiShack` | TS | 0 | 2026-09-03 | Cloudlog 对齐 + 内嵌 FT8 解码 + FlexRadio，野心大但刚起步 |

### 3.2 QSL 卡片专用系统（生成 / 交换卡片，不是日志本）

| 项目 | 栈 | 定位 |
|---|---|---|
| `jxmx/smooth-qsl`（Firefly QSL） | PHP 8.2 + MariaDB 11 + ImageMagick | 俱乐部/个人上传 ADIF，让其他 HAM 下载打印 QSL 卡片；有管理后台、多呼号、暗色模式 |
| `w0php.com/qsl_card_generator` | PHP 7.4+ GD/cURL | 自带卡图 + 可视化坐标映射 + QRZ 查询 + 邮件投递，一条命令装到树莓派 |
| `achildrenmile/qslcardgenerator` | Node + SQLite + bcrypt + Docker | 多用户、`/{呼号}` 路由、Canvas 实时预览、审计日志、Synology 部署脚本 |
| `CQ-DJ0SH/qsl-card-validator` | PHP | 调 QRZ Logbook API 验证 QSO 后生成 PDF/PNG 卡片 |

**结论**：这些是"卡片生成器"，不是日志系统。若要"在线给别人发电子 QSL"，最省事的现成服务是 **eQSL.cc**（免费、ADIF、Authenticity Guaranteed、自有的 eDX/eWAS 奖项，但**不被 ARRL 承认用于 DXCC**）和 **DigiQSL.com**（免费档即有卡片设计器 + 日志本 + ADIF 导入**导出**，还能邮件投递卡片、双方匹配确认）。

### 3.3 第三方托管（A 类）

| 服务 | 费用 | 数据存储/可导出 | 定位与短板 |
|---|---|---|---|
| **LoTW**(ARRL) | 免费 | 仅匹配服务，非完整日志本 | **DXCC/WAS/WAZ 唯一官方认可**；TQSL 证书、数字签名；UI 老旧；中国电台需寄执照+护照扫描件至 ARRL 人工验证（1–3 天） |
| **QRZ.com Logbook** | 免费档有限，XML 订阅 ~$30/年 | 可从 LoTW 导入；支持导出 | 全球最大呼号库，登录即多设备；免费档功能受限；QSL 确认不计 DXCC |
| **eQSL.cc** | 免费 | ADIF | 电子卡片好看、确认快；**ARRL 不承认**；免费版有广告 |
| **Club Log** | 免费 | ADIF | DXCC 分析最强、OQRS、DXpedition 支持；偏分析工具而非日常日志本 |
| **HRDLOG.net** | 免费 | ADIF | HRD 用户的云端备份，可同步 LoTW + eQSL |
| **DigiQSL.com** | 免费档 + 付费 | **ADIF 导入导出（免费档即可导出全部）** | 卡片设计器 + 日志本 + 邮件投递 + 双方匹配确认 + 免费 `呼号@digiqsl.net` 邮箱；**数据在第三方** |

### 3.4 桌面 / 移动端（D 类，不满足多设备，仅备案）

- **QLog**（`foldynl/QLog`，C++/Qt/SQLite，0.50.0 · 2026-04）：桌面端里与自建 Web 配合最好的，内置 Cloudlog/Wavelog 集成、LoTW/eQSL/QRZ/Clublog/HRDLOG、QSL 图库、标签打印。
- **Ham2K PoLo**（`ham2k/app-polo`，**108 star**，MPL-2.0，React Native）：移动便携记录体验最好，但**多设备同步仍在开发中**（2025-09 官方论坛：开发者模式下只能单向同步到 LoFi 服务器，双向同步"即将到来"）。
- **HAMRS**：Win/Mac/Linux 免费，移动端 $4.99；Pro（约 $20/年）声称含 cloud sync（"HAMRS Hub"）—— **此点需实测核实**；离线优先、POTA/SOTA 模板、仅 ADIF 导出、无 CAT、无备份恢复机制。
- **TaffyQSL**（Kotlin/Android，GPL-3.0，作者 BG4KNN，含中文手册）：本地 ADIF + LoTW 签名，硬件密钥保护，**纯本地无同步**。

---

## 四、Cloudflare 侧的关键事实（决定可行性）

| 能力 | 免费额度 | 对个人日志够不够 |
|---|---|---|
| **Workers** | 10 万请求/日、单请求 10 ms CPU、128 MB 内存、100 个脚本 | ✅ 个人日均请求 < 1000 |
| **Pages** | 无限站点、500 次构建/月、单站 2 万文件、带宽无限 | ✅ |
| **D1**（SQLite） | **5 GB 总存储**、10 个库、**500 万行读/日、10 万行写/日**、Time Travel 回溯 | ✅ 几千条 QSO 约占几 MB |
| **R2** | **10 GB 存储**、100 万 A 类操作/月、1000 万 B 类操作/月、**零出网流量费** | ✅ 存 QSL 卡片图绰绰有余 |
| **KV** | 1 GB、10 万读/日、1000 写/日 | ✅ 放会话/配置 |
| **Tunnel** | Zero Trust 免费版：≤50 用户、**不限隧道数、不限带宽** | ✅ 自建出网首选 |
| **Containers** | ❌ **不在免费层**，需 Workers Paid $5/月 | ❌ 常驻型负载实测约 $33–58/月，比自购 VPS 贵 |

**三条硬性推论**：
1. **Wavelog / Cloudlog（PHP+MySQL）无法跑在 Cloudflare 免费层** —— Workers/Pages 不提供 PHP 运行时，也不提供常驻 MySQL。
2. **要让现成 PHP 系统"用上 Cloudflare 免费"，唯一正解是 Cloudflare Tunnel**：本地/家庭主机跑 Docker，cloudflared 主动外连 Cloudflare 边缘，零端口映射、免费 HTTPS、隐藏家宽 IP。代价是需要一台常开主机 + 一个托管在 Cloudflare 的域名（约 $10/年）。
3. **若坚持"服务器也放在 Cloudflare"，就必须用 Workers + D1 自建** —— 即必须接受一定量的开发工作。

> ⚠️ 国内合规提示：家庭宽带对外提供服务在运营商条款中属灰色地带（低流量个人用途普遍可行但无保障）；境外 VPS / 境外域名 + Cloudflare 无需 ICP 备案，国内服务器 + 域名需备案。

---

## 五、方案优先级排序

评分维度（5 分制，权重已反映在加权总分）：

| 排序 | 方案 | 数据掌控 | 多设备 | 成熟度/开箱即用 | 部署运维成本 | 是否符合 Cloudflare 免费 | **加权总分** |
|---|---|---|---|---|---|---|---|
| **1** | **Wavelog 自建 + Cloudflare Tunnel 出网** | ⭐5 | ⭐5 | ⭐5 | ⭐3（需常开主机+域名） | ⭐5（Tunnel 全额免费） | **23 / 25** |
| **2** | **Cloudflare Workers + D1 + R2 自建轻系统** | ⭐5 | ⭐5 | ⭐2（要自己写） | ⭐5（零运维零月费） | ⭐5（原生） | **22 / 25** |
| **3** | **托管服务组合（QRZ / eQSL / LoTW / Club Log）+ 本地 ADIF 归档** | ⭐2 | ⭐5 | ⭐5 | ⭐5 | ⭐1（不涉及） | **18 / 25** |
| 4 | Wavelog 自建 + 境外廉价 VPS（约 $3–6/月） | ⭐5 | ⭐5 | ⭐5 | ⭐4 | ⭐2（不用 CF） | 21 / 25 |
| 5 | ollog（FastAPI + MongoDB） | ⭐5 | ⭐5 | ⭐2 | ⭐2（副本集） | ⭐1 | 15 / 25 |
| 6 | DigiQSL / Firefly QSL 等卡片系统单独使用 | ⭐2 | ⭐5 | ⭐4 | ⭐4 | ⭐1 | 16 / 25 |
| 7 | 纯本地方案（QLog / PoLo / TaffyQSL） | ⭐5 | ⭐1 | ⭐4 | ⭐4 | — | 14 / 25 |

> 排序说明：1 与 2 分差极小，区别在于 **"要不要自己写代码"**。4 号方案是 1 号的"省心替代版"（不依赖家里机器常开，但要月费）。

---

## 六、最推荐的 3 个方案

### 🥇 方案一：Wavelog 自建 + Cloudflare Tunnel（现成系统 + 数据自控 + Cloudflare 免费）

**怎么做**：家里常开设备（Mac mini / NAS / 旧笔记本 / 树莓派）跑 `docker compose`（Wavelog + MariaDB），装 `cloudflared` 建隧道，绑一个托管在 Cloudflare 的域名（如 `log.你的域名.com`），Cloudflare 自动签发 HTTPS 证书。

**特点**
- ✅ **开箱即用**：装完就有完整日志本、地图、奖项、QSL 管理、多电台档案、API、Android 客户端
- ✅ **数据 100% 在你自己硬盘上**，ADIF / SQL dump 随时导出
- ✅ **多设备**：手机、平板、电脑浏览器全支持，户外/野外只要有网就能记
- ✅ **出网零成本**：Tunnel 免费、不限带宽；成本只有一个域名（约 $10/年）
- ✅ 未来可平滑迁到 VPS / 迁回本地，MySQL 结构与其他日志软件兼容

**适用场景**
- 你家里/办公室**本来就有一台常开的机器或 NAS**
- 想要"装完就能用"，不想碰代码
- 数据量会长期增长，需要成熟奖项跟踪与 QSL 管理

**代价 / 风险**
- ❌ 家里断电、断网、机器休眠 = 服务中断（可用 UPS / 禁止休眠缓解）
- ❌ 需要基本的 Docker + 域名 DNS 动手能力（首次约 1–2 小时）
- ❌ 家宽对外提供服务合规上偏灰色（低流量个人用途通常无碍）
- ❌ Wavelog 明确"不是备份桶"，备份要自己做（建议 cron 定时 `mysqldump` + ADIF 导出，双写到 R2 或本地）

---

### 🥈 方案二：Cloudflare Workers + D1 + R2 自建轻量系统（真·零成本零运维）

**怎么做**：Pages 托管前端（React/Vue/纯静态）+ Workers（Hono）提供 API + D1 存 QSO 结构化数据 + R2 存 QSL 卡片图片 + KV 存会话；`wrangler` 一键部署。

**特点**
- ✅ **完全符合"Cloudflare 免费"**：个人用量离免费上限差两个数量级，月费为 0
- ✅ **不受家里机器约束**：全球边缘节点，7×24 可达，无运维、无打补丁、无备份脚本（D1 有 Time Travel）
- ✅ **数据在自己 Cloudflare 账号下**，可 `wrangler d1 export` 导出 SQLite，也可一键导出 ADIF
- ✅ **完全按需定制**：字段、QSL 卡片模板、统计口径全按你的习惯来
- ❌ **需要从零开发**（或基于 `ham-log` / `ta-qso-logger` 这类小项目改造）：QSO 表单、ADIF 解析/生成、地图、奖项统计、鉴权、QSL 卡片渲染都要自己补齐
- ❌ 无现成社区、无移动端 App、无 LoTW/eQSL 自动同步（要自己调 API）

**适用场景**
- 你**没有常开主机**，也不想付 VPS 月费
- 愿意投入一次性开发（自己写或用 AI 辅助），换取长期零运维
- 需求聚焦在"记录 + 备份 + 多设备查看"，对 DXCC/奖项深度跟踪要求不高（或可后期渐进补）

---

### 🥉 方案三：托管服务组合 + 本地 ADIF 归档（零运维兜底 / 备份底座）

**怎么做**：日常记录用 **QRZ Logbook**（免费、呼号自动补全、多设备）和/或 **eQSL.cc**（免费、电子卡片），同时把 **LoTW** 作为官方确认层（中国电台需人工验证执照）；每月导出一次 ADIF 归档到本地 + R2。

**特点**
- ✅ **零部署零运维零成本**，注册即用，天然多设备
- ✅ LoTW 确认是 **DXCC/WAS/WAZ 唯一官方认可**的电子凭证，这层无法自建替代
- ✅ ADIF 通用格式 = 事实上的数据自由，随时可迁到方案一或二
- ❌ **数据掌控最弱**：服务商停服、改价、封号都可能发生（HAM 圈历史上确有商业日志服务关停导致丢日志的案例）
- ❌ 免费档功能受限（QRZ 需 $30/年订阅才有完整功能；eQSL 免费版有广告）
- ❌ 无法自定义字段、无私有数据、卡片样式受限

**适用场景**
- 作为**任何方案的补充层**（强烈建议：无论最终选哪个，都把 LoTW + eQSL 作为对外确认通道）
- 或作为"先用起来、边用边观察"的过渡方案，等确定习惯后再迁到自建

---

## 七、我的建议组合（供后续讨论，非结论）

**主方案选一（Wavelog + Tunnel）或方案二（CF 原生），再叠加：**
1. **对外确认层**：LoTW（必做，奖项唯一官方通道）+ eQSL（选做，卡片好看、确认快）
2. **备份层**：每月导出 ADIF + SQL dump，双写到 Cloudflare R2（R2 免费 10 GB、零出网费）—— 这一步让"数据掌控"真正闭环
3. **归档纪律**：ADIF 是唯一跨系统的通用格式，任何自建方案都必须把"一键全量导出 ADIF"作为第一优先级功能/验收项

**决策分水岭**（下次讨论可直接拍板）：
- 有没有常开主机？→ **有**：走方案一（省开发）；**没有**：走方案二（省机器与月费）
- 愿不愿意写代码？→ **愿意**：方案二上限更高；**不愿意**：方案一或方案四（VPS 版）

---

## 八、待核实 / 风险清单

| 项 | 状态 | 说明 |
|---|---|---|
| HAMRS Pro 的 cloud sync 实际能力 | ❓ 待实测 | 仅二手资料提及"HAMRS Hub"，官方文档未确认双向同步粒度 |
| Ham2K 多设备同步进度 | ❓ 开发中 | 2025-09 官方论坛称双向同步"今年内"，需查最新状态 |
| `ta-qso-logger` 的后端存储 | ❓ 待核实 | README 只提 Google 登录，数据库实现未确认 |
| Wavelog 在 ARM（树莓派/NAS）上的 Docker 表现 | ⚠️ | 官方推荐 64 位 Linux，ARM 镜像需确认 |
| 家宽 + Cloudflare Tunnel 的合规与稳定性 | ⚠️ | 运营商条款灰色地带；低流量个人用途普遍可行 |
| Cloudflare D1 Time Travel 免费版保留天数 | ⚠️ | 第三方资料称 7 天，以官方文档最新为准 |

---

## 九、参考来源

**GitHub 项目**
- Wavelog — https://github.com/wavelog/wavelog （518★，2026-09-03 活跃）
- Cloudlog — https://github.com/magicbug/Cloudlog （572★）；API 文档 https://github.com/magicbug/Cloudlog/wiki/API
- WaveLogGate — https://github.com/int2001/WaveLogGate
- ollog — https://github.com/4z1ko/ollog
- HamLog — https://github.com/kbennett2000/HamLog
- ham-log — https://github.com/zaphodthebeebs/ham-log
- ta-qso-logger — https://github.com/talhaakkaya/ta-qso-logger
- QSL-Manager — https://github.com/FuDujilm/QSL-Manager
- local-qso-logger — https://github.com/yl3im/local-qso-logger
- Ham2K PoLo — https://github.com/ham2k/app-polo （108★）
- QLog — https://github.com/foldynl/QLog
- DigiShack — https://github.com/W9MDM/DigiShack
- Firefly QSL — https://github.com/jxmx/smooth-qsl
- qslcardgenerator — https://github.com/achildrenmile/qslcardgenerator

**文档 / 评测**
- Wavelog 官方文档 — https://docs.wavelog.org/
- Wavelog 上手评测 — https://selfhostyourself.com/services/wavelog
- Cloudlog → Wavelog 迁移实战 — https://dl8ydp.de?p=285/
- 云端日志本横向对比（OERadio，2026）— https://oeradio.at?p=4516/
- 自建日志平台对比：Cloudlog vs Wavelog vs KLog — https://www.pistack.xyz/posts/2026-06-06-self-hosted-ham-radio-logging-cloudlog-wavelog-klog
- HAM 日志选型记录（2026-04）— https://scotty.id.au/2026/04/25/ham-radio-logging.html
- Ham2K 多设备同步官方答复 — https://forums.ham2k.com/t/multiple-devices/1289

**Cloudflare**
- 定价 — https://workers.cloudflare.com/plans · https://www.cloudflare.com/zh-cn/rates/
- 存储选型 — https://developers.cloudflare.com/workers/platform/storage-options/
- Containers 定价 — https://developers.cloudflare.com/containers/pricing/
- D1 能力介绍 — https://blog.cloudflare.com/whats-new-with-d1
- 免费额度汇总（2026）— https://en.inithtml.com/resources/cloudflare-free-tier-everything-you-get-in-2026-dns-cdn-ddos-r2-workers-d1

**QSL / 通联常识（中文）**
- QSL 卡片与电子卡片 — http://scraa.org.cn/rumen/294.html
- HamCQ 文档：QSL 卡片 — https://docs.hamcq.cn/pages/69299a/
- eQSL 官方 FAQ — https://www.eqsl.cc/qslcard/faq1.cfm
- DigiQSL 功能页 — https://digiqsl.com/features
