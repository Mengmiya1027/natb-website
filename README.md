# NATB 官网

NATB（小天才手表 ADB 工具箱）的项目官网：介绍、功能、更新日志、项目信息，以及一个可以直接在站内使用的 **Issue 页**。

线上地址：https://mengmiya1027.github.io/natb-website/

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Vue 3（`<script setup>`）+ Vite |
| 状态 | Pinia |
| 路由 | vue-router（`createWebHistory`，Issue 页是真路径） |
| 样式 | Tailwind CSS v4 + shadcn-vue（`new-york-v4`，neutral 主题） |
| 图标 | unplugin-icons（solar / lucide / simple-icons 按需编译） |
| 动效 | 自研 canvas/WebGPU 背景（首页）+ 手写 CSS 过渡 |

## 本地开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物在 dist/
npm run preview
```

Node 版本要求见 `package.json` 的 `engines`（^22.18 或 >=24.12）。

### 可选：开发用的只读 GitHub token

GitHub 匿名接口每小时只有 60 次配额，而 Issue 页一次加载就要用掉 5 次。若本地反复调试被限流，可以在项目根建一个 `.env.local`（已被 `.gitignore` 的 `*.local` 忽略，不会进仓库）：

```dotenv
VITE_GITHUB_READ_TOKEN=ghp_xxxxxxxx
```

这个 token 只在 `npm run dev` 时生效，**不会打进生产构建**。它应该是零 scope 的（只能读公开数据），可随时在 GitHub 的 Settings → Developer settings 里撤销。

## 目录结构

```
src/
  pages/
    HomeShell.vue        首页壳：顶栏 + 四个 dock 页 + 左侧导航坞
    HomePage.vue         首页（粒子汇聚 / 标题起飞）
    Features.vue         功能页
    UpdateLog.vue        更新日志页
    ProjectInfo.vue      关于页
    Issues.vue           Issue 页（独立整页）
  components/
    NavBar.vue           站点顶栏胶囊（PillNav）
    HarnessDock.vue      左侧导航坞 + 页面注册表 DOCK_TABS
    issue/               Issue 页的全部业务组件
    ui/                  shadcn-vue 组件（由官方 CLI 安装）
  api/
    github.js            GitHub REST / GraphQL 客户端（含读缓存、限流处理）
    oauth.js             Device Flow 登录
  stores/
    issue.js             登录态、权限、主题、中转地址
  router/index.js        路由表
  styles/issue.css       Tailwind 入口 + shadcn 主题 token

worker/                  Cloudflare Worker：GitHub 读写中转
```

## 路由

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | HomeShell | 首页及其四个 dock 页（介绍 / 功能 / 更新 / 关于） |
| `/issue` | Issues | Issue 列表 |
| `/issue/:number` | Issues | Issue 详情 |
| `/issue/new` | Issues | 新建 Issue |

Issue 页是**独立整页**：它不在左侧导航坞里，唯一入口是顶栏的「ISSUE」；页头自带品牌图标与操作区，桌面端与顶栏胶囊左右环绕，移动端落在胶囊下方。

GitHub Pages 是静态托管，直接访问 `/issue/12` 会 404，构建流程会把 `dist/index.html` 复制成 `dist/404.html` 让前端路由接管。

## Issue 页

### 能力

- **匿名可读**：列表（状态 / 标签 / 里程碑 / 指派 / 排序 / 搜索）、详情（Markdown 渲染、时间线、评论）、标签与里程碑侧栏
- **登录可写**：发 issue、评论、编辑、关闭 / 重开、反应、订阅
- **管理员**（仓库拥有者与协作者，角色以 GitHub 返回的 `permission` 为准）：打标签、指派、设里程碑、锁定、置顶、删除、批量操作、标签与里程碑 CRUD

### 登录

采用 GitHub **Device Flow**（设备码流程）：点「生成验证码」→ 拿到 8 位码 → 在 GitHub 输入 → 轮询换 token。全程不需要 client secret，适合纯静态站。

OAuth App 的 Client ID 在 `src/config/github.js` 的 `OAUTH_CLIENT_ID`。申请的两个 scope：

- `public_repo`：读写公开仓库的 issue、标签、里程碑
- `read:user`：读取公开资料（用户名、头像）

GitHub 授权端点不支持浏览器跨域直连，所以账号登录必须经过下面的中转；没有中转时页面会自动引导到「粘贴 Personal Access Token」的降级路径。

### 中转（没有加速器也能用）

`worker/` 下是一个约 130 行的 Cloudflare Worker，只做两件事：

- `/gh/*` → `https://api.github.com/*`，透传凭据；未登录时注入一个只读 token，把匿名限额从 60/h 提到 5000/h
- `/oauth/*` → GitHub 的 Device Flow 端点（`login/device/code` 与 `login/oauth/access_token`）

部署方法见 [`worker/README.md`](./worker/README.md)。部署后把地址填进 `src/config/github.js` 的 `DEFAULT_PROXY_BASE`，用户也可以在页面的「连接设置」里临时覆盖。

> 注意：`*.workers.dev` 在国内会被 DNS 污染，建议给 Worker 绑一个自己的域名再使用。

## 部署

推送到 `master` 后，`.github/workflows/deploy-pages.yml` 会自动构建并发布。

首次使用需要在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

`vite.config.js` 的 `base` 由 CI 注入的 `GITHUB_REPOSITORY` 推断：项目站点用 `/<仓库名>/`，`xxx.github.io` 形式的用户站点用根路径。本地 `npm run dev` 始终是根路径，需要覆盖时用 `npm run build -- --base=/自定义/`。

## 更新日志

站内「更新」页的数据源是 `public/json/UpdateLog.json`，**只记录面向用户的版本变更**；仓库的提交历史见 GitHub 的 Commits 页面。
