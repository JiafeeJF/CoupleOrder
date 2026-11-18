# CoupleOrder 情侣点餐

专为情侣设计的手机端优先点餐网站。双方都可以下单、接单，下单后实时通知对方并发送邮件提醒。

## 功能一览

- **注册 / 登录**：邮箱 + 密码，注册后自动获得 6 位配对码
- **情侣配对**：输入对方的配对码即可绑定，绑定后双方共享同一份菜单
- **菜单管理**：双方都可以添加 / 编辑 / 删除 / 上下架菜品，支持分类、价格、图片、描述
- **图片智能处理**：
  - 上传时自动压缩（限制尺寸 1080px、质量 0.82、转 WebP、体积目标 <0.5MB）
  - 进入菜单页时预加载全部菜品图片到本地缓存（Cache Storage）
  - 已加载图片下次优先读本地缓存，刷新后仍有效
  - 删除菜品时同步清除对应图片缓存
- **点餐**：浏览菜单、加入购物车、填写备注、提交订单
- **接单与通知**：
  - 下单成功后通过 Socket.io 实时推送到对方的接单页面
  - 同时通过 Nodemailer 发送邮件通知对方
  - 接单页面可操作：接单 → 制作中 → 完成
- **订单中心**：我发起的订单 / 对方发来的订单 / 历史订单

## 技术栈

| 端 | 技术 |
| --- | --- |
| 前端 | React 18 + Vite + Tailwind CSS + React Router |
| 后端 | Node.js + Express |
| 实时通信 | Socket.io |
| 邮件通知 | Nodemailer |
| 数据库 | JSON 文件存储（`server/data/data.json`，零配置，开箱即用） |

## 目录结构

```
├── package.json          # 根目录：一键启动前后端
├── server/               # 后端（Express + Socket.io）
│   ├── .env.example      # 环境变量模板（复制为 .env 即可）
│   ├── data/             # JSON 数据库（自动生成）
│   └── src/
│       ├── index.js      # 服务入口
│       ├── store.js      # JSON 数据存储
│       ├── auth.js       # JWT 认证中间件
│       ├── email.js      # Nodemailer 邮件
│       ├── socket.js     # Socket.io 实时推送
│       └── routes/       # auth / pair / menu / orders
├── client/               # 前端（React + Tailwind）
│   └── src/
│       ├── api.js        # 接口封装
│       ├── auth.jsx      # 登录状态
│       ├── socket.js     # Socket 客户端
│       └── pages/        # 登录/注册/配对/菜单/订单/我的
└── realtime-test.mjs     # 端到端实时推送测试脚本
```

## 快速开始

需要 Node.js 18+（建议 20+）。

```bash
# 1. 安装依赖（根目录、server、client）
npm run install:all

# 2. 配置环境变量（可选，见下文"邮件通知"）
cd server
copy .env.example .env   # Windows
# cp .env.example .env   # macOS / Linux

# 3. 启动开发环境（同时启动服务端 4000 和前端 5173）
npm run dev
```

浏览器访问 **http://localhost:5173** 即可使用。

> 提示：配对需要两个账号。可以注册两个账号（或使用两个浏览器 / 无痕窗口）来体验完整流程。

## 邮件通知配置

默认情况下（未配置 SMTP），邮件不会真实发送，而是**打印到服务端控制台**，方便本地调试。

在 `server/.env` 中配置后即可真实发送：

```ini
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your@qq.com
SMTP_PASS=你的授权码
SMTP_FROM=CoupleOrder <your@qq.com>
# MAIL_TO=test@example.com   # 可选：把通知邮件固定发到某个邮箱
```

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/pair/me` | 配对信息（配对码 + 对方） |
| POST | `/api/pair/bind` | 输入配对码绑定 |
| GET | `/api/menu` | 获取本组菜单 |
| POST | `/api/menu` | 新增菜品 |
| PUT | `/api/menu/:id` | 编辑菜品 |
| PATCH | `/api/menu/:id/available` | 上下架 |
| DELETE | `/api/menu/:id` | 删除菜品 |
| POST | `/api/orders` | 提交订单 |
| GET | `/api/orders` | 本组所有订单 |
| PATCH | `/api/orders/:id/status` | 更新订单状态 |

订单状态流转：`待接单 → 已接单 → 制作中 → 已完成`。

## 实时推送测试

```bash
cd client
node realtime-test.mjs     # 验证下单 / 接单的实时推送
node pair-bound-test.mjs   # 验证配对绑定实时通知
node menu-sync-test.mjs    # 验证菜单修改（新增/编辑/上下架/删除）实时同步 + 房间隔离
```

脚本会自动注册两个用户、完成配对、加菜、下单，并验证对方能实时收到对应事件。

## 后续可扩展方向

- 菜单管理权限控制（只允许创建者编辑等）
- 订单消息互聊（基于 Socket.io）
- 接入 SQLite / MySQL 持久化
- 部署到线上（Vercel + Render 等）

## 公开版配置

本机默认可使用 HTTP；如需局域网 HTTPS，请自行生成证书并放到 `client/ssl/`。图片加密需要单独配置 `IMAGE_ENC_KEY`。

请在 `server/.env` 中配置你自己的 MongoDB、SMTP 和独立随机密钥。JWT 密钥至少 32 字符，例如运行 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`。Android 发布版需自行配置签名。

源码按 MIT 许可证授权，见 `LICENSE`。
