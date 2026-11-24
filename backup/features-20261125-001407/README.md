# Features 页面备份（2026-11-25 00:14:07）

原来的功能页实现整份备份在此，用于回滚或重写时参考。

| 文件 | 原路径 | 说明 |
| --- | --- | --- |
| Features.vue | src/pages/Features.vue | 功能卡片网格页（8 张卡片 / 大屏模式 / TINTS 色板 / 图片预热） |
| FeatureCard.vue | src/components/FeatureCard.vue | 封面卡片组件（鼠标跟随倾斜、插画） |
| FeatureBigScreen.vue | src/components/FeatureBigScreen.vue | 点击卡片后的大屏详情层 |

## 备份时的 SHA256

- Features.vue: 6DD88C2D7C438CAABE30D946CDCFC5AEC9C12B958220338FF6B7401036072D89

## 回滚方式

```powershell
Copy-Item 'backup/features-20261125-001407/Features.vue'          'src/pages/Features.vue' -Force
Copy-Item 'backup/features-20261125-001407/FeatureCard.vue'      'src/components/FeatureCard.vue' -Force
Copy-Item 'backup/features-20261125-001407/FeatureBigScreen.vue' 'src/components/FeatureBigScreen.vue' -Force
```

## 现状

src/pages/Features.vue 已被替换为空白占位页：挂载点仍保留在 HarnessDock 的 DOCK_TABS 与 HomeShell 的 `<component :is>`，只渲染一个空的 `.features-blank` 容器，无脚本、无样式依赖。
