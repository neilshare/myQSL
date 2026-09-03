# 个人电子 QSL 通联记录与查验云平台 (eQSL) 技术解决方案

---

## 1. 文档概述与项目背景

### 1.1 项目背景
业余无线电（Amateur Radio）活动中，业余电台操作员（HAM）通过电波与世界各地的友台建立双向通联（QSO）。传统的通联日志记录依赖本地单机软件（如 N1MM、Log4OM、HRD 等），纸质 QSL 卡片交换则依赖传统的邮政或卡片局，存在**数据无法跨多端随时同步**、**野外/移动通联录入不便**、**纸质卡片寄发成本高周期长**、**数据丢失风险大**等痛点。

针对上述问题，本项目（代号 **eQSL**，Electronic QSL & QSO Record Cloud System）基于 **Cloudflare Serverless 纯云端原生架构**，构建一套兼具**高可靠个人通联备份**、**多设备即时录入**与**公开电子 QSL 卡片查验/索卡**的轻量级云原生解决方案。

### 1.2 核心建设目标
1. **数据绝对自主掌控**：数据持久化于云端结构化存储，支持随时全量双向导入/导出标准 ADIF 3.x 文件及 SQLite 物理快照，杜绝平台绑定。
2. **多端随时随地访问**：采用响应式 Web + PWA 架构，PC 桌面端、iPad 平板、iPhone/Android 移动端免安装，浏览器即开即用。
3. **零服务器维护与零成本运行**：完全依托 **Cloudflare 免费层生态**（Pages + Workers + D1 + R2），无需购买与维护任何云主机（VPS）或物理硬件，抗高并发且全球毫秒级访问。
4. **集成式电子 QSL 卡片渲染与查验**：支持加载用户自定义的高清设计底图（如苏州河、长风公园、CRAC 徽章版等），具备动态占位符排版引擎与公开防伪二维码核验能力。

### 1.3 遵循的技术与行业标准
* **数据交换标准**：ADIF 3.1.4（Amateur Data Interchange Format）
* **地理定位规范**：IARU Maidenhead Locator System（梅登黑德网格定位系统）
* **时间标准**：ISO 8601 / UTC 通用协调时
* **接口规范**：RESTful API 设计规范 / OpenAPI 3.0
* **安全鉴权**：RFC 7519 (JSON Web Token, JWT) / W3C Web Cryptography API
* **图像与排版**：W3C HTML5 Canvas 2D Context / SVG 1.1 / W3C OffscreenCanvas

---

## 2. 整体架构设计

系统采用经典的分层解耦架构，从客户端、边缘接入、业务处理、数据持久化到外部生态集成，全链路运行在 Cloudflare 全球边缘节点上。

### 2.1 整体架构拓扑图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          客户端层 (Client Layer)                         │
│  ┌─────────────────────────┐   ┌─────────────────────────────────────┐  │
│  │   台长管理端 (Admin UI)  │   │     友台查验/索卡端 (Public UI)      │  │
│  │  - 通联即时/批量录入    │   │  - 输入呼号快速检索历史 QSO         │  │
│  │  - ADIF 文件导入/导出   │   │  - 实时预览专属电子 QSL 卡片        │  │
│  │  - QSL 模板可视化配置   │   │  - 高清下载 (PNG/WebP/PDF)          │  │
│  │  - 通联统计与地图分布   │   │  - 扫码防伪验证                     │  │
│  └─────────────────────────┘   └─────────────────────────────────────┘  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTPS (TLS 1.3)
┌────────────────────────────────────▼────────────────────────────────────┐
│                    Cloudflare 边缘网关与接入层 (Edge Gateway)             │
│  ├── Cloudflare CDN / Global Anycast DNS                                │
│  ├── Web Application Firewall (WAF) / DDoS 基础防护                     │
│  └── 路由分发器 (Pages Router -> 静态资源 / Workers -> API 路由)         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                  服务端业务逻辑层 (Serverless Compute Layer)              │
│       [ Cloudflare Pages Functions / Workers (Hono TS Framework) ]      │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────┐  │
│  │   鉴权与安全中间件     │  │    QSO 核心业务模块   │  │ ADIF 转换器 │  │
│  │ - JWT / Master-Key   │  │ - 录入/查询/修改/删除  │  │ - 格式解析  │  │
│  │ - 请求频率限制 (Rate)│  │ - 呼号去重与标准化     │  │ - 批量导出  │  │
│  └───────────────────────┘  └───────────────────────┘  └─────────────┘  │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────┐  │
│  │   QSL 卡片渲染引擎    │  │    呼号库数据富化     │  │ 统计计算引擎│  │
│  │ - 动态坐标排版解析   │  │ - QRZ.com / HamQTH    │  │ - DXCC 统计 │  │
│  │ - 边缘 SVG/Canvas 渲染│  │ - 边缘 KV 缓存加速    │  │ - 网格热力图│  │
│  └───────────────────────┘  └───────────────────────┘  └─────────────┘  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                     数据与持久化层 (Persistence Layer)                   │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────┐  │
│  │   Cloudflare D1 (Edge SQLite)   │   │  Cloudflare R2 (S3 Storage) │  │
│  │  - `qso_records` (通联记录表)   │   │  - QSL 模板底图资源库       │  │
│  │  - `qsl_templates` (模板配置表) │   │  - 生成的卡片缓存 (可选)    │  │
│  │  - `sys_configs` (系统配置表)   │   │  - 静态字体文件 (思源黑体)  │  │
│  └─────────────────────────────────┘   └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心模块划分与职责定义

| 模块名称 | 所处层级 | 职责描述 | 外部依赖 / 关键组件 |
| :--- | :--- | :--- | :--- |
| **Admin Web UI** | 客户端 (Pages) | 提供台长专属的操作工作台，支持 UTC 自动同步录入、ADIF 文件拖拽解析、QSL 模板所见即所得调试。 | React 19, Tailwind CSS, Lucide React |
| **Public Portal UI** | 客户端 (Pages) | 提供给通联友台的公共入口，支持呼号模糊/精确检索，并提供前端 Canvas 极速即时渲染生成 QSL 卡片。 | W3C HTML5 Canvas, QRCode.js |
| **API Gateway & Router** | 业务层 (Workers) | 统一路由分发、请求参数校验（Zod）、跨域 CORS 处理、全局错误捕获。 | Hono Web Framework, Zod |
| **Auth Middleware** | 业务层 (Workers) | 基于 Web Crypto API 实现的轻量级 JWT 校验和静态 API Token 拦截，保护敏感写入接口。 | `crypto.subtle` (Web Standard) |
| **QSO Core Service** | 业务层 (Workers) | 负责通联记录的 CRUD 操作、呼号大小写标准化、网格自动转经纬度、波段与频率有效性校验。 | Cloudflare D1 Client |
| **ADIF Parser & Serializer** | 业务层 (Workers) | 负责 ADIF 3.1.4 格式的双向序列化与流式反序列化，保障通联数据与主流台站软件完全兼容。 | 自研轻量流式解析器（零第三方重依赖） |
| **QSL Card Engine** | 业务/客户端双模 | 解析模板 JSON 中的文本坐标、字体、颜色、对齐方式，叠加 QSO 动态参数渲染出最终图片。 | Client-side Canvas API + Worker 端 SVG |
| **Callbook Proxy** | 业务层 (Workers) | 封装对 QRZ.com / HamQTH 的查询请求，增加边缘缓存，自动补全对方的地理位置（QTH）与名字。 | Fetch API + Cloudflare D1 Cache |

---

## 3. 核心技术选型及选型理由

为保证系统的现代化、高性能与完全契合 Cloudflare 免费生态，技术选型严格遵循“轻量、标准、无状态、边缘优先”的原则。

### 3.1 技术选型全景矩阵

| 架构维度 | 选定方案 | 备选方案 | 选型深度理由 |
| :--- | :--- | :--- | :--- |
| **前端框架** | **React 19 + Vite + Tailwind CSS** | Vue 3 / Svelte | 1. 业内最成熟的生态体系；<br>2. 静态构建产物极其轻量，部署至 Cloudflare Pages 秒级发布；<br>3. 完备的 TypeScript 支持与组件库生态。 |
| **边缘运行时** | **Cloudflare Workers (Pages Functions)** | Node.js (传统容器) | 1. 0 毫秒冷启动，全球 300+ 边缘数据中心分布式运行；<br>2. 免费额度每日 100,000 次请求，完全覆盖个人电台日常使用；<br>3. 原生集成 D1 与 R2 绑定对象。 |
| **边缘 Web 框架** | **Hono (TypeScript)** | Express / Fastify / Itty-Router | 1. 专为 Cloudflare Workers 等 Web 标准环境量身定制，体积仅约 15KB；<br>2. 原生支持 TypeScript，提供优秀的 RPC 模式与中间件机制；<br>3. 执行性能和内存开销显著优于传统框架。 |
| **核心数据库** | **Cloudflare D1 (Serverless SQLite)** | Cloudflare KV / Supabase | 1. 原生支持标准 SQL（支持 JOIN、事务、复杂索引查询）；<br>2. 免费层提供 5GB 存储空间与每日 500 万次行读取，容量可存储超 100 万条 QSO；<br>3. 支持直接导出为通用 SQLite 文件，数据迁移极易。 |
| **对象存储** | **Cloudflare R2 (S3 兼容)** | AWS S3 / 阿里云 OSS | 1. 零出网流量费（Zero Egress Fees），降低长期使用顾虑；<br>2. 免费层提供 10GB 存储空间与每月 1000 万次读取，满足海量高清底图存储；<br>3. 标准 S3 API 兼容，支持预签名直传。 |
| **参数校验** | **Zod** | Joi / Yup | 1. 与 TypeScript 类型系统无缝推导，保证类型端到端安全；<br>2. 体积小，与 Hono 的 `zValidator` 中间件原生集成。 |
| **卡片合成模式** | **双模混合（前端 Canvas 优先 + 后端 SVG 兜底）** | Puppeteer / Node-Canvas | 1. **前端 Canvas**：把图像渲染计算卸载到访客端，0 占用服务器 CPU/内存，秒级生成 4K 印刷级图片；<br>2. **后端 SVG**：通过 Worker 直接流式生成矢量 SVG 卡片，无需重量级无头浏览器。 |

---

## 4. 关键业务流程与数据流设计

### 4.1 单条通联手动实时录入流程 (Realtime Logging)

```
[ 操作员 (PC/手机) ]
       │ 1. 打开录入界面 (UTC 时间与波段自动填充)
       │ 2. 输入对方呼号 (如 "BG4YYY") + 信号报告 (如 "59")
       │ 3. (可选) 触发自动补全 QTH / 网格
       │ 4. 提交表单 (POST /api/qso)
       ▼
[ Cloudflare Pages Function (Hono API) ]
       │ 5. Auth 中间件验证 JWT / Token
       │ 6. Zod 校验字段合法性 (呼号正则、RST合法性、频段有效性)
       │ 7. 自动补全本台信息 (MY_CALLSIGN, MY_GRIDSQUARE)
       │ 8. 执行 SQL 插入: INSERT INTO qso_records (...)
       ▼
[ Cloudflare D1 Database ]
       │ 9. 事务写入成功，返回新 QSO 实体
       ▼
[ 前端 UI 实时反馈 ] ──> 列表追加显示，支持即时预览生成的 QSL 卡片
```

### 4.2 批量 ADIF 日志文件导入流程 (Batch ADIF Import)

```
[ 台长客户端 ]
       │ 1. 拖拽上传 `wsjtx_log.adi` 或 `n1mm.adi`
       │ 2. 前端轻量解析器执行预检查 (统计条数、校验格式)
       │ 3. 发送批量写入请求 (POST /api/qso/batch-import)
       ▼
[ Hono API 批量处理管道 ]
       │ 4. 分块迭代 (Chunking: 每次 100 条，避免超出 D1 单事务限制)
       │ 5. 执行防重复比对 (根据 CALL + QSO_DATE + TIME_ON + BAND + MODE 唯一联合索引)
       │ 6. 执行批量 INSERT OR IGNORE / UPSERT
       ▼
[ Cloudflare D1 Database ]
       │ 7. 返回导入汇总：成功导入 N 条，忽略重复 M 条
       ▼
[ 前端 UI ] ──> 展示导入结果报表并刷新本地视图
```

### 4.3 友台公开查验与 QSL 索卡流程 (Public Verification & Card Retrieval)

```
[ 友台访客 (任意设备) ]
       │ 1. 访问公开主页 `https://qso.mydomain.com` (或扫描卡片防伪二维码)
       │ 2. 输入自身呼号 (例如 "BH4XXX") 点击查询
       ▼
[ Cloudflare Edge Cache / Workers ]
       │ 3. 路由匹配: GET /api/public/qso?call=BH4XXX
       │ 4. 查询 D1 数据库 (过滤只读公共字段，隐藏敏感备注)
       │ 5. 返回匹配的通联记录清单及关联的 QSL 模板配置 JSON
       ▼
[ 友台浏览器端 (Canvas 渲染引擎) ]
       │ 6. 并发加载 R2 托管的高清背景底图
       │ 7. 在离屏 Canvas 按照模板坐标排版动态文字 (CALL, RST, DATE, TIME)
       │ 8. 在指定坐标生成并叠加通联防伪二维码
       │ 9. 渲染完成，呈现交互式预览弹窗
       ▼
[ 友台操作 ] ──> 一键下载高分辨率 PNG 或 WebP 保存至相册/本地
```

---

## 5. 详细数据模型设计

数据模型严格对齐 ADIF 3.1.4 规范，并在 Cloudflare D1（SQLite）中实施优化，建立高频查询的联合索引。

### 5.1 数据库表结构 (DDL)

```sql
-- ==========================================================
-- 1. 通联记录主表 (qso_records)
-- ==========================================================
CREATE TABLE IF NOT EXISTS qso_records (
    id TEXT PRIMARY KEY,                       -- UUID v4
    station_callsign TEXT NOT NULL,           -- 本台呼号 (如 BA4RC)
    operator_callsign TEXT,                   -- 操作员呼号 (用于多操作员场景)
    call TEXT NOT NULL COLLATE NOCASE,        -- 对方呼号 (不区分大小写，如 BG4YYY)
    qso_date TEXT NOT NULL,                    -- 通联日期 UTC (格式: YYYYMMDD, 如 20260903)
    time_on TEXT NOT NULL,                     -- 开始时间 UTC (格式: HHMMSS 或 HHMM, 如 143000)
    time_off TEXT,                            -- 结束时间 UTC
    band TEXT NOT NULL,                       -- 波段 (如 40m, 20m, 15m, 10m, 2m, 70cm)
    freq REAL,                                -- 精确频率 (单位: MHz, 如 14.2700, 438.500)
    mode TEXT NOT NULL,                       -- 调制模式 (如 SSB, CW, FT8, FT4, FM)
    submode TEXT,                             -- 子模式 (如 USB, LSB)
    rst_sent TEXT NOT NULL DEFAULT '59',       -- 发送信号报告 (如 59, 599, -08)
    rst_rcvd TEXT NOT NULL DEFAULT '59',       -- 接收信号报告 (如 59, 599, +02)
    gridsquare TEXT,                          -- 对方梅登黑德网格 (如 PM96ex)
    my_gridsquare TEXT,                        -- 本台网格 (如 PM96)
    name TEXT,                                -- 对方姓名/OP
    qth TEXT,                                 -- 对方地理位置描述
    country TEXT,                             -- 对方国家/DXCC 实体名称
    dxcc INTEGER,                             -- DXCC 实体编号 (如 318 为 China)
    prop_mode TEXT,                           -- 传播方式 (如 F2, SAT, ES, RPT, IONO)
    sat_name TEXT,                            -- 卫星名称 (如 RS-44, SO-50)
    tx_pwr REAL,                              -- 发射功率 (瓦特 W)
    comment TEXT,                             -- 台长私有备注 (公开接口不可见)
    qsl_sent TEXT DEFAULT 'N',                -- QSL 卡片发送状态 (Y=已发, N=未发, R=已请求, Q=排队中)
    qsl_rcvd TEXT DEFAULT 'N',                -- QSL 卡片接收状态 (Y=已收到, N=未收)
    qsl_sent_date TEXT,                       -- 发送日期 (YYYYMMDD)
    card_template_id TEXT DEFAULT 'default',  -- 绑定的 QSL 渲染模板 ID
    created_at INTEGER NOT NULL,              -- 记录创建时间戳 (毫秒)
    updated_at INTEGER NOT NULL               -- 记录更新时间戳 (毫秒)
);

-- 创建高性能查询索引
CREATE INDEX IF NOT EXISTS idx_qso_call ON qso_records (call);
CREATE INDEX IF NOT EXISTS idx_qso_date_time ON qso_records (qso_date DESC, time_on DESC);
CREATE INDEX IF NOT EXISTS idx_qso_band_mode ON qso_records (band, mode);
-- 防重复录入联合唯一索引 (允许按五要素幂等插入)
CREATE UNIQUE INDEX IF NOT EXISTS uq_qso_five_tuple
ON qso_records (station_callsign, call, qso_date, time_on, band, mode);

-- ==========================================================
-- 2. QSL 卡片模板配置表 (qsl_templates)
-- ==========================================================
CREATE TABLE IF NOT EXISTS qsl_templates (
    id TEXT PRIMARY KEY,                       -- 模板唯一标识 (如 'suzhou_creek_twilight', 'changfeng_park')
    name TEXT NOT NULL,                        -- 模板展示名称
    description TEXT,                         -- 模板介绍
    bg_image_url TEXT NOT NULL,                -- R2 存储的高清背景图片路径
    width INTEGER NOT NULL DEFAULT 1920,       -- 模板标准宽度 (px)
    height INTEGER NOT NULL DEFAULT 1080,      -- 模板标准高度 (px)
    layout_config TEXT NOT NULL,               -- JSON 格式排版配置 (各文字图层坐标、字体、颜色、字号等)
    is_default INTEGER DEFAULT 0,              -- 是否为默认模板 (1=是, 0=否)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- ==========================================================
-- 3. 系统与台站配置表 (sys_configs)
-- ==========================================================
CREATE TABLE IF NOT EXISTS sys_configs (
    key TEXT PRIMARY KEY,                      -- 配置键 (如 'DEFAULT_STATION_CALLSIGN', 'ADMIN_PASSWORD_HASH')
    value TEXT NOT NULL,                       -- 配置值 (JSON 字符串或纯文本)
    updated_at INTEGER NOT NULL
);
```

### 5.2 模板排版配置文件格式规范 (`layout_config` JSON)

```json
{
  "theme": "dark",
  "dpi": 300,
  "elements": {
    "to_call": {
      "type": "text",
      "field": "call",
      "prefix": "TO RADIO: ",
      "x": 120,
      "y": 280,
      "fontSize": 72,
      "fontFamily": "SourceHanSans-Bold",
      "color": "#FFFFFF",
      "shadow": { "color": "rgba(0,0,0,0.8)", "blur": 8, "offsetX": 2, "offsetY": 4 }
    },
    "qso_table": {
      "type": "grid",
      "x": 120,
      "y": 420,
      "width": 1680,
      "columns": [
        { "title": "DATE (UTC)", "field": "qso_date", "format": "YYYY-MM-DD" },
        { "title": "TIME (UTC)", "field": "time_on", "format": "HH:mm" },
        { "title": "FREQ", "field": "freq", "suffix": " MHz" },
        { "title": "BAND", "field": "band" },
        { "title": "MODE", "field": "mode" },
        { "title": "RST (2-WAY)", "field": "rst_sent" }
      ],
      "headerStyle": { "fontSize": 24, "color": "#00E5FF", "borderBottom": "2px solid #00E5FF" },
      "bodyStyle": { "fontSize": 32, "color": "#FFFFFF", "fontFamily": "Monospace" }
    },
    "qrcode": {
      "type": "qrcode",
      "content": "https://qso.mydomain.com/verify?id={{id}}",
      "x": 1620,
      "y": 800,
      "size": 180,
      "colorDark": "#000000",
      "colorLight": "#FFFFFF"
    },
    "my_station": {
      "type": "text",
      "text": "OPERATOR: BA4RC | GRID: PM96 | SHANGHAI, CHINA",
      "x": 120,
      "y": 980,
      "fontSize": 26,
      "color": "#E0E0E0"
    }
  }
}
```

---

## 6. 核心接口 (API) 设计规范

所有 API 遵循 RESTful 规范，基础路由为 `/api`。

### 6.1 接口总览表

| 方法 | 路径 | 权限要求 | 描述 |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | 公开 | 台长管理员登录获取 JWT Token |
| `GET` | `/api/qso` | 管理员 | 分页检索通联记录列表（支持多条件组合筛选） |
| `POST` | `/api/qso` | 管理员 | 手动新增单条通联记录 |
| `PUT` | `/api/qso/:id` | 管理员 | 修改指定通联记录 |
| `DELETE` | `/api/qso/:id` | 管理员 | 删除指定通联记录 |
| `POST` | `/api/qso/batch-import` | 管理员 | 批量导入 ADIF 文本/文件 |
| `GET` | `/api/qso/export-adif` | 管理员 | 全量或按条件导出标准 `.adi` 文件 |
| `GET` | `/api/public/qso` | 公开 | 友台公开查询通联记录（脱敏） |
| `GET` | `/api/public/verify/:id` | 公开 | 根据 QSO 唯一 ID 查验单条记录并返回卡片数据 |
| `GET` | `/api/templates` | 公开 | 获取当前可用 QSL 卡片设计模板列表 |
| `POST` | `/api/templates` | 管理员 | 新增/保存 QSL 设计模板排版配置 |
| `POST` | `/api/upload/template-bg`| 管理员 | 上传 QSL 高清背景底图到 R2 存储桶 |

### 6.2 核心接口详细规约

#### (1) 录入新通联：`POST /api/qso`
* **Request Header**: `Authorization: Bearer <JWT_TOKEN>`
* **Request Body (JSON)**:
```json
{
  "call": "BG4YYY",
  "qso_date": "20260903",
  "time_on": "143000",
  "band": "40m",
  "freq": 7.050,
  "mode": "SSB",
  "rst_sent": "59",
  "rst_rcvd": "59",
  "gridsquare": "PM96ex",
  "prop_mode": "F2",
  "comment": "Nice signal with homebrew antenna"
}
```
* **Response Body (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "c7a8b6e0-8a12-421b-bb31-0987654321ab",
    "station_callsign": "BA4RC",
    "call": "BG4YYY",
    "qso_date": "20260903",
    "time_on": "143000",
    "band": "40m",
    "freq": 7.050,
    "mode": "SSB",
    "rst_sent": "59",
    "rst_rcvd": "59",
    "gridsquare": "PM96ex",
    "created_at": 1788484200000
  }
}
```

#### (2) 友台公开查询通联：`GET /api/public/qso?call=BG4YYY`
* **Request Header**: 无需鉴权
* **Response Body (200 OK)**:
```json
{
  "success": true,
  "data": {
    "target_call": "BG4YYY",
    "total_qsos": 2,
    "records": [
      {
        "id": "c7a8b6e0-8a12-421b-bb31-0987654321ab",
        "station_callsign": "BA4RC",
        "qso_date": "20260903",
        "time_on": "143000",
        "band": "40m",
        "freq": 7.050,
        "mode": "SSB",
        "rst_sent": "59",
        "rst_rcvd": "59",
        "my_gridsquare": "PM96",
        "template_id": "suzhou_creek_twilight"
      }
    ]
  }
}
```

---

## 7. 非功能性设计

### 7.1 性能与边缘缓存策略
* **全站静态资源缓存**：HTML/JS/CSS 托管于 Cloudflare Pages，默认开启全球 CDN 边缘持久缓存与 Brotli 压缩，实现毫秒级白屏加载。
* **背景底图与字体优化**：
  * R2 存储桶绑定自定义域名，背景大图自动应用 `Cache-Control: public, max-age=31536000, immutable` 强缓存；
  * 引入 **思源黑体（Source Han Sans）中英文字体子集化（Subsetting）**，只提取业余无线电常用拉丁字符、数字、标点及常用中文字符，将字体包从 15MB 压缩至 300KB 以内，加速客户端渲染。
* **D1 查询性能优化**：对呼号查询使用 `COLLATE NOCASE` 索引，单次索引查询时延控制在 10ms 以内。

### 7.2 安全与权限控制
* **Zero Trust 与 JWT 保护**：
  * 管理端 API 采用基于 HMAC-SHA256 的强密钥签名 JWT；
  * 支持无缝挂载 **Cloudflare Access**，在边缘层直接通过个人 GitHub 账号或邮箱验证码进行双重认证。
* **数据脱敏**：公开查询接口经过严格字段过滤，隐藏台长的私有 `comment`、本地设备型号、个人私密笔记等敏感数据。
* **防暴力穷举与速率限制 (Rate Limiting)**：利用 Cloudflare WAF 对 `/api/public/qso` 限制单 IP 访问频次（如 60 次/分钟），防止爬虫遍历库内所有通联。

### 7.3 可靠性、容灾与备份机制
* **3-2-1 备份原则支持**：
  1. **云端热备**：Cloudflare D1 自动分布式多副本持久化；
  2. **一键 ADIF 导出**：管理端提供一键下载全量 `.adi` 文件的功能；
  3. **自动化定时快照**：配置每日运行的 Scheduled Worker（Cron Trigger），自动将全量数据导出为 ADIF 格式并压缩存入 R2 归档目录，实现自动每日快照。

### 7.4 业余无线电法规与合规设计
* 遵循 CRAC（中国无线电协会业余无线电工作委员会）与工信部《业余无线电台管理办法》关于电台通联日志须如实记录、保留备查的要求。
* 日志时间强制以 **UTC (通用协调时)** 标准存储与呈现，避免因时区换算混乱造成国际通联无效。

---

## 8. 部署架构与 CI/CD 落地指南

依托 Cloudflare 官方 CLI 工具 `wrangler` 实现全自动基础设施即代码（IaC）与持续部署。

### 8.1 基础设施资源拓扑配置 (`wrangler.toml`)

```toml
name = "eqsl-cloud"
main = "functions/[[path]].ts"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]

# 绑定 Cloudflare D1 关系型数据库
[[d1_databases]]
binding = "DB"
database_name = "eqsl_production_db"
database_id = "xxxx-xxxx-xxxx-xxxx" # wrangler d1 create 生成

# 绑定 Cloudflare R2 对象存储桶
[[r2_buckets]]
binding = "QSL_BUCKET"
bucket_name = "eqsl-qsl-assets"

# 环境变量 (非敏感)
[vars]
MY_CALLSIGN = "BA4RC"
MY_DEFAULT_GRID = "PM96"
ENVIRONMENT = "production"

# 自动化每日备份 Cron 触发器 (每天 UTC 00:00 执行)
[triggers]
crons = ["0 0 * * *"]
```

### 8.2 一键部署流程
1. **安装环境依赖**：
   ```bash
   npm install -g wrangler
   wrangler login
   ```
2. **初始化 D1 数据库与表结构**：
   ```bash
   wrangler d1 create eqsl_production_db
   wrangler d1 execute eqsl_production_db --file=./schema.sql
   ```
3. **创建 R2 存储桶**：
   ```bash
   wrangler r2 bucket create eqsl-qsl-assets
   ```
4. **前端构建与边缘函数发布**：
   ```bash
   npm run build
   wrangler pages deploy dist --project-name=eqsl-cloud
   ```

---

## 9. 项目风险评估与演进规划

### 9.1 风险评估与应对策略

| 风险项 | 风险等级 | 潜在影响 | 应对与缓解策略 |
| :--- | :--- | :--- | :--- |
| **Cloudflare 免费额度超限** | 低 | 访问受限或报错 | 个人通联日志请求量远低于 D1 (每日500万次读) 及 Workers (每日10万次) 免费上限；配合边缘静态缓存，容量裕度达 95% 以上。 |
| **跨设备离屏字体加载失败** | 中 | 导出的卡片文字错位或降级为默认字体 | 将子集化字体 Base64 内联或预加载到前端 Canvas Context，字体未完全 `document.fonts.ready` 前不触发绘制。 |
| **公网接口被恶意注入/扫描** | 中 | 数据库压力增大 | 使用 Cloudflare 托管 WAF 规则开启 Bot Fight 模式，所有入参经过 Zod 严格强类型校验与预编译参数化 SQL 绑定。 |

### 9.2 产品演进路线图

```
┌────────────────────────────────────────────────────────────────────────┐
│                        eQSL 产品迭代演进路线图                          │
└────────────────────────────────────────────────────────────────────────┘

第一阶段：MVP 核心基础闭环 (Day 1 - Week 2)
  ├── 搭建 Cloudflare Pages + D1 + R2 基础架构与表结构
  ├── 实现响应式 Web 管理端 (UTC 自动计时、单条录入、列表检索、修改删除)
  ├── 实现基础 ADIF 3.1.4 格式文件的导入与全量导出
  └── 实现单套 QSL 卡片（如 01_半马苏河_水岸夕照实景风）动态 Canvas 渲染

第二阶段：公开查验与多模板体系 (Week 3 - Week 4)
  ├── 上线无需登录的公开呼号查询与索卡专页 (`/public`)
  ├── 集成多套精品卡片底图（长风公园、CRAC 官方原版徽章荣耀版、赛博风等）
  ├── 引入卡片防伪二维码生成与自动定位核验页面
  └── 增加通联数据统计面板（DXCC 实体总数、波段/模式分布柱状图、网格热力图）

第三阶段：生态联动与高级扩展 (Week 5+)
  ├── 提供标准 Webhook / REST API，支持与本地 WSJT-X (FT8) 软件打通实时自动上报
  ├── 探索支持 LoTW 证书签名与 eQSL.cc / QRZ.com API 双向自动同步
  └── 完善 PWA 离线 Service Worker，支持野外无网暂存与回网自动上传
```

---

## 10. 附录

### 10.1 第三方依赖组件清单

| 组件名称 | 版本规范 | 许可证 (License) | 用途说明与选型理由 |
| :--- | :--- | :--- | :--- |
| **Hono** | `^4.5.0` | MIT | 超轻量边缘 Web 框架，专为 Cloudflare Workers 优化，提供路由与中间件。 |
| **Zod** | `^3.23.0` | MIT | TypeScript 优先的运行时模式声明与参数校验库，保障 API 输入安全。 |
| **Lucide React** | `^0.400.0` | ISC | 现代矢量图标库，为管理工作台提供轻量清晰的 UI 图标。 |
| **QRCode.js / qrcode** | `^1.5.0` | MIT | 纯 JS 跨平台二维码生成工具，用于卡片防伪码动态绘制。 |
| **Canvas-Confetti** | `^1.9.0` | MIT | 友台成功生成并下载 QSL 卡片时的轻量动效反馈。 |
| **Tailwind CSS** | `^3.4.0` | MIT | 原子化 CSS 框架，保障移动端与桌面端的极速响应式适配。 |

### 10.2 自研模块与设计考量说明
1. **ADIF 解析/序列化器 (自研)**：
   * *原因*：开源 npm 的 ADIF 解析库大多面向 Node.js 环境（依赖 `fs`、`Buffer` 等），体积臃肿且在 Cloudflare V8 边缘隔离沙盒中有兼容风险。本项目自研约 100 行代码的纯 TypeScript 流式正则解析器，性能高、零外部依赖且完全符合 ADIF 3.x 规范。
2. **QSL 卡片动态排版引擎 (自研)**：
   * *原因*：业余无线电卡片需要根据不同呼号长度自动微调字间距、对齐方式与阴影渲染，开源通用图形库过重。自研基于 JSON 配置的轻量 Canvas 绘制管道，可直接读取现有的高质量 QSL 设计底图进行像素级精确对齐。

---
*文档作者：Antigravity Agent | 归档文件名：`eQSL_Solution.md` | 状态：正式技术设计方案*
