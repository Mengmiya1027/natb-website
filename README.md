# natb-website

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```

## 部署到 GitHub Pages

推送到 `master`（或 `main`）后，`.github/workflows/deploy-pages.yml` 会自动构建并发布；
也可以在仓库的 Actions 页面手动触发。

首次使用需要在仓库 **Settings → Pages → Build and deployment → Source** 里选择
**GitHub Actions**，之后访问 `https://<用户名>.github.io/natb-website/`。

`vite.config.js` 里的 `base` 由 CI 注入的 `GITHUB_REPOSITORY` 推断：项目站点用
`/<仓库名>/`，仓库名形如 `xxx.github.io` 的用户站点用根路径。本地 `npm run dev`
始终是根路径，需要覆盖时用 `npm run build -- --base=/自定义/`。
