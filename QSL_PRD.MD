# 个人电子 QSL 通联记录与备份系统 PRD (产品需求与方案调研文档)

---

## 1. 项目背景与目标

### 1.1 业务背景
业余无线电（Amateur Radio / HAM）活动的核心是电波通联（QSO）。每一次通联都伴随着呼号、频率、时间（UTC）、信号报告（RST）、调制模式（SSB/CW/FT8/FM）及网格位置（Grid Locator）等关键数据。
为了沉淀通联成果、方便制作/寄发电子 QSL 卡片（eQSL）并建立个人无线电生涯的持久档案，需要建立一个**高可靠、易访问、完全自主可控**的个人通联数据记录与备份系统。

### 1.2 核心目标
1. **个人数据完全归属与备份**：记录每一次通联数据，所有数据资产完全由个人掌控，支持标准 ADIF 格式导出，不依赖第三方平台的存亡。
2. **多设备随时随地便捷访问**：无论在居家电台室（PC端）、通勤途中（手机端）、户外架设/POTA/SOTA（平板/手机），均能通过统一服务快速录入、查阅与检索。
3. **低运维与零/低成本运行**：若需自行部署，充分利用 **Cloudflare 免费生态**（Cloudflare Pages、D1、R2、Workers、Tunnel 及 Zero Trust），实现免维护或低成本稳定运行。
4. **现有成熟方案优先**：优先复用成熟的开源系统或通用架构，避免重复造轮子；仅在现有系统无法贴合需求时再做轻量定制。

---

## 2. 核心约束与设计原则

```
┌─────────────────────────────────────────────────────────────┐
│                       四大核心设计原则                       │
├──────────────────────────┬──────────────────────────────────┤
│ 1. 数据主权 (Data Ownership)│ 所有 QSO 数据与卡片资产归个人所有，随时可全量迁移 │
├──────────────────────────┼──────────────────────────────────┤
│ 2. 多端协同 (Multi-Device)  │ 纯 B/S 响应式或 PWA 架构，手机/平板/PC 随时可用    │
├──────────────────────────┼──────────────────────────────────┤
│ 3. 免费托管 (Cloudflare)    │ 部署依托 Cloudflare 免费层，零云主机月租开销     │
├──────────────────────────┼──────────────────────────────────┤
│ 4. 标准兼容 (ADIF Standard) │ 严格遵循业余无线电 ADIF 3.x 国际通用数据交换规范 │
└──────────────────────────┴──────────────────────────────────┘
```

* **数据掌控**：必须支持随时导出为行业标准 `.adi` (ADIF 3.x) 文件或 SQLite / JSON 文件。
* **访问安全**：公网访问时具备基础鉴权（如 Cloudflare Access 或应用级 Token），防止数据被未授权篡改，但可提供公开的“友台呼号查验与索卡”只读页面。
* **网络适应性**：无需公网固定 IP，无需繁琐的动态域名解析（DDNS）和端口映射。

---

## 3. 行业现有成熟方案全景调研

调研覆盖 GitHub 开源项目、商业 SaaS 平台及公共确认中心：

### 3.1 方案分类梳理

```
                                  ┌─ Wavelog (PHP 8 + MariaDB, 当前最活跃的开源 Web 日志)
       ┌─ 自建开源 Web 系统 ─────────┼─ Cloudlog (Wavelog 前身, 生态插件极其丰富)
       │                          └─ Nextlog (Next.js + PostgreSQL, 现代全栈)
       │
       ├─ 离线优先 / PWA 工具 ─────── QSOlog (Vue/TS + IndexedDB, 移动端野外首选)
方案分类 ┤
       ├─ 独立 QSL 生成 / 渲染工具 ─── DigiQSL, HamSpark, WebQSLForge, QSLcraft
       │
       └─ 公共中心化平台 ─────────── eQSL.cc, QRZ.com Logbook, HAMLOG.online, Club Log
```

### 3.2 典型代表项目对比

| 项目 / 平台 | 开源/类型 | 技术栈与存储 | 多设备支持 | 核心优势 | 核心短板 / 局限 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Wavelog** | 开源<br>(AGPL-3.0) | PHP 8 + CodeIgniter 4<br>MySQL / MariaDB | 原生 Web 访问<br>(PC/平板/手机) | 功能极其全面：CAT电台控制、WSJT-X 实时推送、内置 QSL 卡片设计器、奖状统计、全球地图 | 需要 PHP+MySQL 运行环境，无法直接运行在 Serverless 边缘（需本地 Docker + 隧道 或 VPS） |
| **Cloudlog** | 开源<br>(MIT) | PHP + CodeIgniter 3<br>MySQL | 原生 Web 访问 | 社区成熟、稳定、配套小工具多 (Cloudlog Helper, CloudlogCAT) | 架构相对老旧，逐渐被其分支 Wavelog 替代 |
| **Nextlog** | 开源<br>(MIT) | Next.js + TypeScript<br>PostgreSQL (Prisma) | 原生 Web 访问 | 现代化 UI、与 Cloudlog API 兼容、全栈 TS 易二次开发 | 处于发展期，部分高级业余无线电插件功能不及 Wavelog 丰富 |
| **QSOlog** | 开源<br>(MIT) | PWA (Vue/TS)<br>IndexedDB (本地浏览器) | 各设备独立安装<br>需手动同步 | 离线优先，野外架台无网秒开，安装即用，界面现代轻量 | 纯本地存储，默认无中心云数据库，多设备间无法自动实时同步 |
| **DigiQSL** | 公共 SaaS<br>在线服务 | Web 前端 + 云端数据库<br>+ OSS 对象存储 | 原生 Web 访问 | 在线卡片设计体验优秀，支持与 QRZ 联动，邮件一键发卡 | 数据存放在第三方平台服务器，存在平台依赖风险 |
| **eQSL.cc** | 公共平台<br>(老牌) | 专用集中式数据库<br>+ 图片服务 | 原生 Web 访问 | 全球通联确认的行业标准之一，用户基数极大 | 界面为早期 Web 风格，数据导出受限，无法作为自主可控的唯一私有库 |

---

## 4. 可行方案综合评估与优先级排序

基于用户的核心约束（**数据自主掌控**、**随时多设备访问**、**Cloudflare 免费服务部署**、**成熟现成方案优先**），梳理出以下实施路线排序：

```
【优先级 1】成熟开源自建系统 + Cloudflare Tunnel 穿透 (Wavelog on Docker + CF Tunnel)
     │   ★ 推荐指数：9.5/10  |  成熟度最高、功能最完善、数据 100% 本地+云端双控
     ▼
【优先级 2】Cloudflare Serverless 原生日志应用 (Cloudflare Pages + D1 + R2)
     │   ★ 推荐指数：9.0/10  |  零本地硬件依赖、纯云端边缘运行、永久免费极速访问
     ▼
【优先级 3】静态 PWA 离线日志 + Cloudflare API / Git 同步 (QSOlog 改造 / Web PWA)
     │   ★ 推荐指数：8.0/10  |  野外无网秒开、轻量文本驱动、高弹性备份
     ▼
【优先级 4】全手工本地桌面软件 (Log4OM / QLog) + 网盘自动同步
     │   ★ 推荐指数：6.0/10  |  无法随时随地通过手机网页高效录入和查看
     ▼
【优先级 5】完全依赖第三方公共平台 (QRZ.com / eQSL.cc)
         ★ 推荐指数：4.0/10  |  违背数据自主掌控的核心要求
```

---

## 5. Top 3 推荐方案深度剖析

---

### 方案一（首选推荐）：Wavelog 容器化自建 + Cloudflare Tunnel 安全穿透

> **核心思路**：在本地常开设备（家庭 NAS / 软路由 / 树莓派 / Mac mini / 旧 PC）上使用 Docker 一键部署当今功能最强大的开源日志系统 **Wavelog**，利用 **Cloudflare Tunnel（Argo 免费隧道）** 将其安全发布到公网，并通过 **Cloudflare Access (Zero Trust)** 实现免密多端安全访问。

#### 1. 架构拓扑
```
[ 外部多设备 ]
  ├── 手机浏览器 / 平板 (外出/野外)
  └── 笔记本电脑 (异地)
        │ HTTPS (自定义域名 qso.yourdomain.com)
        ▼
[ Cloudflare 边缘网络 ]
  ├── Cloudflare CDN / WAF / SSL 加密
  ├── Cloudflare Access (Zero Trust 安全鉴权，支持邮箱验证码/Google/GitHub登录)
  └── Cloudflare Tunnel (反向加密隧道，无需公网IP，无需开放本地端口)
        │ 安全穿透流量
        ▼
[ 本地家庭环境 (NAS / 迷你主机 / Mac) ]
  ├── cloudflared 守护进程
  └── Docker Compose
        ├── Wavelog Web (PHP 8 / CodeIgniter)
        └── MariaDB Database (持久化 QSO 数据卷挂载到本地硬盘)
```

#### 2. 特点与优势
* **功能完整度行业第一**：直接享有世界级开源日志功能，包括：
  * **CAT 与数字模式联动**：支持与本地电台、WSJT-X (FT8) 实时双向通信自动录入。
  * **内置 QSL 设计器**：可直接上传已有的设计样张（如已有的苏州河、长风公园 QSL 背景），可视化拖拽布局呼号、时间、RST 等文字并批量导出/发卡。
  * **全球地理与统计**：内置 3D 地球、DXCC / 网格 / 传播统计。
* **数据 100% 物理可控**：数据库和所有卡片资源完全存放在本地硬盘，随时可通过脚本自动将 ADIF 备份同步至个人网盘或 GitHub。
* **零云端费用与高安全性**：不需要公网 IP，不开放任何路由器端口，Cloudflare Access 拦截所有未授权流量。

#### 3. 适用场景
* 适合拥有常开设备（如 NAS、软路由或迷你主机），希望拥有一套功能顶级、体验完善的专业级通联管理系统。

---

### 方案二（次选推荐）：Cloudflare Serverless 纯云端原生日志系统 (Pages + D1 + R2)

> **核心思路**：不依赖任何本地常开硬件，前端采用现代 Web（如 React/Next.js 或 Vue/Astro），直接托管在 **Cloudflare Pages**；数据库使用 **Cloudflare D1 (Serverless SQLite)**，卡片底图和生成物存放在 **Cloudflare R2 (免费对象存储)**。

#### 1. 架构拓扑
```
[ 任意终端设备 (手机 / 平板 / PC) ]
        │ HTTPS
        ▼
[ Cloudflare 全球边缘网络 (全 Serverless 生态) ]
  ├── Cloudflare Pages (静态页面与前端 UI，秒级首屏加载)
  ├── Cloudflare Workers (轻量 API 路由：QSO 增删改查、ADIF 解析、防伪查验)
  ├── Cloudflare D1 (SQLite 关系型数据库，存储标准 QSO 数据表)
  └── Cloudflare R2 (S3 兼容对象存储，存放 QSL 背景模板、生成的卡片图片)
```

#### 2. 特点与优势
* **纯云端、零硬件、零维护**：不需要在家里开着电脑或 NAS，没有电费和硬件故障风险，无论人在何处均享有毫秒级全球 CDN 访问。
* **永久免费额度充裕**：
  * Cloudflare D1 免费额度：5GB 存储空间、每天 500 万次读取，足够记录数十万条 QSO。
  * Cloudflare R2 免费额度：10GB 存储，完全足够存储数千张高清 QSL 卡片。
* **数据导出自主灵活**：
  * D1 数据库可一键导出为标准的 `.sqlite` 文件。
  * 系统提供一键导出标准 `.adi` 文件接口，随时备份到本地。
* **支持友台公开查验主页**：可设置公开二级路由（如 `qsl.yourdomain.com/check`），通联友台输入自己的呼号即可查验 QSO 并自动下载合成好的专属 QSL 电子卡片。

#### 3. 适用场景
* 适合没有本地常开服务器、追求极简、希望 100% 运行在云端且免除任何基础设施维护的无线电爱好者。

---

### 方案三（灵活混合推荐）：离线优先 PWA (QSOlog 架构) + Cloudflare 边缘同步

> **核心思路**：基于 **QSOlog** 这类离线优先（Offline-First）PWA 应用，前端托管在 Cloudflare Pages，数据优先保存在本地浏览器（IndexedDB）保证在野外无网络环境下也能秒级流畅记录；回到有网环境时，一键或自动触发同步到 Cloudflare D1 / GitHub 私有仓库进行多设备备份。

#### 1. 架构拓扑
```
[ 移动设备 (POTA / SOTA / 野外架台) ]
  └── 浏览器 PWA (离线运行) ──> 本地 IndexedDB (离线保存 QSO)
        │
        │ 当网络恢复 / 处于日常环境时 (一键同步)
        ▼
[ Cloudflare Pages / Workers API ]
        ▼
[ Cloudflare D1 (中心备份库) / GitHub Private Repo (版本化备份) ]
        ▲
        │
[ 家中 PC 桌面 / 平板 ] ──> 同步拉取最新数据
```

#### 2. 特点与优势
* **野外通联无惧断网**：在户外架设、海岛、山区等无公网信号区域，手机打开 PWA 依然能完整录入，带 GPS 坐标和网格计算。
* **去中心化弹性**：即便云端服务出现故障，所有数据在当前设备本地都有完整副本，绝不丢失。
* **纯文件/标准友好**：底层数据结构与 ADIF 紧密映射。

#### 3. 适用场景
* 适合通联场景大量在户外（野外架设、公园通联、应急演练），且对断网录入有强需求的操作者。

---

## 6. 电子 QSL 核心功能与数据模型需求规范

无论最终选用何种具体实现，系统都需满足以下业务与技术规范：

### 6.1 通联数据模型（遵循 ADIF 3.1.4 规范）

```sql
-- 核心通联记录表 (QSO Table)
CREATE TABLE qso_records (
    id VARCHAR(36) PRIMARY KEY,          -- 唯一标识 UUID
    station_callsign VARCHAR(16) NOT NULL,-- 本台呼号 (如 BH4XXX)
    operator_callsign VARCHAR(16),        -- 操作员呼号
    call VARCHAR(16) NOT NULL,            -- 对方呼号 (如 BG4YYY, JA1ZZZ)
    qso_date VARCHAR(8) NOT NULL,         -- 通联日期 UTC (格式: YYYYMMDD)
    time_on VARCHAR(6) NOT NULL,          -- 开始时间 UTC (格式: HHMMSS 或 HHMM)
    time_off VARCHAR(6),                  -- 结束时间 UTC
    band VARCHAR(10) NOT NULL,            -- 波段 (如 40m, 20m, 2m, 70cm)
    freq DECIMAL(10, 4),                 -- 精确频率 (MHz, 如 14.2700, 438.5000)
    mode VARCHAR(10) NOT NULL,            -- 模式 (如 SSB, CW, FT8, FM, C4FM)
    rst_sent VARCHAR(8) NOT NULL,         -- 发送信号报告 (如 59, 599, -08)
    rst_rcvd VARCHAR(8) NOT NULL,         -- 接收信号报告 (如 59, 599, +02)
    gridsquare VARCHAR(8),                -- 对方梅登黑德网格 (如 PM96, PM01)
    my_gridsquare VARCHAR(8),             -- 本台梅登黑德网格 (如 PM96)
    qth VARCHAR(128),                     -- 对方地理位置
    prop_mode VARCHAR(10),                -- 传播模式 (如 F2, SAT, ES, RPT)
    sat_name VARCHAR(32),                 -- 卫星名称 (如 RS-44, SO-50)
    comment TEXT,                         -- 备注说明
    qsl_sent VARCHAR(1) DEFAULT 'N',      -- QSL 发送状态 (Y/N/R/Q)
    qsl_rcvd VARCHAR(1) DEFAULT 'N',      -- QSL 接收状态 (Y/N/R)
    qsl_sent_date VARCHAR(8),             -- 发送日期
    card_template_id VARCHAR(32),         -- 关联的 QSL 卡片设计模板
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6.2 电子 QSL 卡片渲染与生成需求
1. **模板支持**：支持加载用户自定义的高清底图（如当前已有的苏州河夕照、长风公园微缩标、赛博风等正面与背面模板）。
2. **动态合成字段**：
   - 对方呼号 `To Radio:` (突出大字显示)
   - 通联五要素：`Date (UTC)`, `Time (UTC)`, `Freq/Band`, `Mode`, `RST`
   - 本台信息：`Confirming QSO with BH4XXX`, `Grid Locator`, `Rig & Antenna`
   - 防伪查验二维码：扫描后直接跳转到云端该笔 QSO 的查验页面。
3. **输出格式**：支持导出 300DPI 印刷级/高清 PNG/JPG，以及适宜电子发送的轻量化 WebP 格式。

### 6.3 权限与访问控制需求
* **管理员端（私有）**：
  * 需要身份验证（账号密码 / Token / Cloudflare Access 验证）。
  * 拥有新建、修改、删除通联，批量导入/导出 `.adi` 文件，配置卡片模板的全部权限。
* **友台查询端（公开）**：
  * 只读权限，免登录。
  * 友台输入自己的呼号（如 `BG4XXX`），系统检索与其有关的历史通联，展示通联列表，并允许预览和一键下载电子 QSL 卡片。

---

## 7. 后续讨论与决策路线

本 PRD 文档已梳理现有主流生态与三大落地路径。后续在进入技术选型与实现阶段时，建议围绕以下几个关键点进行决策：

```
                           【决策分支树】
                                │
       ┌────────────────────────┴────────────────────────┐
       ▼                                                 ▼
【路线 A：追求全功能与开箱即用】                     【路线 B：追求轻量免运维与云端原生】
选型：Wavelog + 本地Docker + CF Tunnel          选型：Cloudflare Pages + D1 + R2 自建系统
特点：直接获得顶级 HAM 业务生态                     特点：纯云端边缘运行、零本地开销、界面完全定制
核心要求：需有本地常开设备 (NAS/PC)                 核心要求：需简单轻量定制前端与卡片合成逻辑
```

---
*文档版本：v1.0.0 | 创建日期：2026-09-03 | 归档路径：`QSL_PRD.MD`*
