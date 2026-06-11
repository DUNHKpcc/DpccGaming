<p align="center">
  <img src="public/favicon.png" width="96" alt="DpccGaming Logo">
</p>

<h1 align="center">🎮 DpccGaming</h1>

<p align="center">个人开发者游戏平台 —— 使用现代化前端技术栈重构的 Vue 3 版本。</p>

<p align="center">
  <a href="https://dpccgaming.xyz/"><img alt="Live Demo" src="https://img.shields.io/badge/Live%20Demo-dpccgaming.xyz-2ea44f?style=flat-square&logo=vercel&logoColor=white"></a>
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3.4-42b883?style=flat-square&logo=vuedotjs&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5.0-646cff?style=flat-square&logo=vite&logoColor=white">
  <img alt="Node" src="https://img.shields.io/badge/Node-Express-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square">
</p>

<p align="center">
  <b><a href="https://dpccgaming.xyz/">👉 立即体验</a></b>
</p>

---

## 📑 目录

- [技术栈](#-技术栈)
- [项目特点](#-项目特点)
- [快速开始](#-快速开始)
- [项目结构](#-项目结构)
- [功能说明](#-功能说明)
- [开发说明](#-开发说明)
- [配置说明](#️-配置说明)
- [部署](#-部署)
- [更新日志](#-更新日志)

## 🛠 技术栈

| 分类 | 技术 | 说明 |
| --- | --- | --- |
| 框架 | [Vue 3](https://vuejs.org/) | 渐进式 JavaScript 框架 |
| 构建 | [Vite](https://vitejs.dev/) | 快速的前端构建工具 |
| 状态管理 | [Pinia](https://pinia.vuejs.org/) | Vue 状态管理库 |
| 样式 | [Tailwind CSS](https://tailwindcss.com/) | 实用优先的 CSS 框架 |
| 网络 | [Axios](https://axios-http.com/) | HTTP 客户端 |
| 后端 | [Express](https://expressjs.com/) + [Socket.IO](https://socket.io/) | 服务端与实时通信 |
| 图标 | Font Awesome | 图标库 |

## ✨ 项目特点

- [x] 响应式设计，支持移动端
- [x] 组件化架构，易于维护
- [x] 状态管理，数据流清晰
- [x] 现代化 UI，用户体验优秀
- [x] 全屏游戏模式
- [x] 实时评论系统
- [x] 用户认证系统

## 🚀 快速开始

### 环境要求

- Node.js >= 16
- npm >= 8

### 开发环境

```bash
# 安装依赖
npm install

# 启动 Vue 开发服务器
npm run dev

# 启动后端服务器
npm run server
```

### 生产环境

```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview

# 启动后端服务器
npm start
```

## 📁 项目结构

```text
src/
├── components/     # Vue 组件
├── stores/         # Pinia 状态管理
├── utils/          # 工具函数
├── App.vue         # 主应用
├── main.js         # 入口文件
└── style.css       # 样式文件
```

## 🎯 功能说明

### 主要功能

- 游戏展示和播放
- 用户注册和登录
- 游戏评论和评分
- 全屏游戏模式
- 游戏上传（管理员功能）

<details>
<summary>📦 组件一览</summary>

| 组件 | 说明 |
| --- | --- |
| `Navbar` | 顶部导航栏 |
| `HeroSection` | 首页英雄区域 |
| `GamesSection` | 游戏展示区域 |
| `GameModal` | 游戏详情模态框 |
| `LoginModal` | 登录模态框 |
| `RegisterModal` | 注册模态框 |
| `AddGameModal` | 添加游戏模态框 |
| `FullscreenGame` | 全屏游戏组件 |
| `Footer` | 页脚 |

</details>

## 🧩 开发说明

### 状态管理

使用 Pinia 进行状态管理，分为三个 store：

| Store | 职责 |
| --- | --- |
| `auth` | 用户认证状态 |
| `game` | 游戏相关状态 |
| `modal` | 模态框状态 |

### API 调用

所有 API 调用都通过 `utils/api.js` 统一处理，包括：

- 自动添加认证头
- 错误处理
- 请求拦截

### 样式

使用 Tailwind CSS 进行样式管理，保持与原始设计的一致性。

## ⚙️ 配置说明

> [!IMPORTANT]
> 部署前请务必检查并修改以下配置，详细清单见 `CONFIG_CHECKLIST.md`。

### 1. API 服务器地址

修改 `src/utils/api.js` 第 6 行为你的实际服务器地址：

```javascript
const API_BASE_URL = 'http://你的服务器IP:3000/api'
```

### 2. Games 文件夹结构

```text
games/
├── web-mobile-001/    # 游戏 ID 目录
│   └── index.html     # 游戏主文件
└── 其他游戏目录/
```

### 3. AI 助手配置（火山方舟 Doubao）

在项目根目录创建或更新 `.env` 文件，新增以下键值（可根据需要覆盖默认值）：

```bash
ARK_API_KEY=replace_with_your_ark_api_key
# ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
# ARK_MODEL_ID=doubao-seed-1-6-251015
# ARK_MAX_TOKENS=2048
# ARK_REASONING_LEVEL=medium
```

保存后重启后端（`npm run server` 或 `npm start`），即可通过 `/api/ai/code-assistant` 接口调用 Doubao 模型，为 Coding 模式提供真实的 AI 解析。

> [!NOTE]
> 其他注意事项：
> - 确保后端服务正常运行
> - 检查 API 地址配置
> - 确保静态资源路径正确
> - 游戏文件需要放在 `games/` 目录下

## 📦 部署

详细的部署指南请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 📝 更新日志

### v1.0.0

- 完成 HTML 到 Vue 的转换
- 实现所有原有功能
- 优化用户体验
- 添加现代化 UI 组件

---

<p align="center">
  Made with ❤️ by an indie developer · <a href="https://dpccgaming.xyz/">dpccgaming.xyz</a>
</p>
