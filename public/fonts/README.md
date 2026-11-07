# 标题字体

首页主标题（`.hero__title`）使用字体 `Archive`，声明在 `src/styles/fonts.css`：

- 字体文件：`archive.otf`（本目录，单一 Regular 字重）
- 因字体只有一个字重，`@font-face` 里把 `font-weight` 声明成 `100 900`，
  这样标题上原本的 `font-weight: 900` 不会触发浏览器的伪粗体合成，渲染的是字体原字形。

换成多字重字体时，按字重各写一条 `@font-face`，并去掉这里的 100 900 范围声明。
文件缺席时标题回退到 HarmonyOS Sans SC / Arial，正文不受影响。
