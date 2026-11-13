# NATB Issue 中转（Cloudflare Worker）

只做两件事：把 `/gh/*` 转给 `api.github.com`，把 `/oauth/*` 转给 `github.com/login/oauth`。
**完全免费**：Workers 免费计划每天 10 万次请求，注册不需要信用卡。

## 部署（三选一，都是一次性的）

### 方式 A：网页控制台（不用装任何东西）

1. 打开 https://dash.cloudflare.com/ 注册/登录（邮箱即可，无付费项）
2. 左侧 Workers & Pages → Create → Worker
3. 把本目录 `index.js` 的内容整段粘进去，Deploy
4. 记下分配到的地址，形如 `https://natb-issue-proxy.<你的子域>.workers.dev`

### 方式 B：wrangler 命令行

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

### 方式 C：已有自定义域名

在 Worker 的 Settings → Domains & Routes 里绑定一个你自己的域名。
国内访问 `workers.dev` 有时会被干扰，绑自有域名最稳。

## 可选：抬高匿名限额

GitHub 匿名接口限额只有 60 次/小时（按 IP）。在 Worker 里注入一个只读 token 可以让所有未登录访客共用 5000 次/小时：

```bash
npx wrangler secret put GITHUB_READ_TOKEN
# 粘贴一个只勾了 public_repo（只读即可）的 GitHub token
```

注意：只有请求没带 `Authorization` 时才会用它，登录用户永远走自己的 token，不会被降权。

## 接上站点

部署完把地址填到 `src/config/github.js` 的 `DEFAULT_PROXY_BASE`，或者让用户在页面的「连接设置」里自行填写。
前端所有请求会变成 `<地址>/gh/repos/...`，不带地址就直连 `api.github.com`。
