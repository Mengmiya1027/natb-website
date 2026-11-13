# Issue 页视觉设计规范（v1 · 可照抄实施）

> 目标：解决业主反馈的「页面还是很丑」「页面很白」。
> 约束：只用 shadcn-vue 组件 + Tailwind 工具类；配色 token 一律来自 preset `a326wSQq`（neutral 灰阶），**不引入任何新色相**。
> 本文所有色值均由 `src/styles/issue.css` 的 oklch token 实算得出（标注【实测】），不是拍脑袋。

---

## 0. 三条核心结论（先看这个）

1. **「很白」不是配色问题，是"可用对比度不足"问题。**
   我们这套 neutral preset 在浅色模式下只有三个表面：`#ffffff`(1.00:1)、`#f5f5f5`(1.09:1)、`#e5e5e5`(1.26:1)【实测】。当前代码把**页面**、**卡片**、**浮层**全都设成 `--card` = `#ffffff`，于是三者之间对比度 = 1.00:1，卡片只能靠一条 1.26:1 的发丝线存在——这条线在 1x 屏上基本等于不存在。所以页面读起来是一张白纸。
   **解法：把"灰"下沉给页面容器，把"白"抬给内容卡**（页面 `#f5f5f5` / 卡片 `#ffffff`），并让**阴影**承担"卡片悬在页面上方"的信息，边框只承担"边界在哪"的信息。

2. **本 preset 的 `--border`（1.26:1）只能当"细线"，不能当"结构线"。**
   GitHub 的默认分隔线约 1.5:1，我们这个 token 明显更弱。要做出可辨识的结构边界，必须用 **foreground 的 alpha 合成**（仍是 neutral token，不是新色）：
   `border-foreground/20` = `#cecece` = **1.57:1**【实测】，`border-foreground/25` = `#c2c2c2` = **1.79:1**【实测】。

3. **层次主要靠"字号 / 字重 / 字色"三件套，不靠颜色。**
   `foreground #0a0a0a`(19.79:1) 和 `muted-foreground #737373`(4.73:1)【实测】之间只有两档可用的文字色，因此层级必须由 **15px/500 → 12px/400 → 11px/500** 的尺寸与字重落差 + 字距来表达。我们现在把所有字重压在 500–680 之间、字号挤在 15/12.5/12 三档，落差不够，于是"每一行都长得差不多"。

---

## 1. 现状审计（我们实际在犯的错）

| # | 位置 | 现状 | 实测/后果 | 判定 |
|---|---|---|---|---|
| A1 | `src/styles/issue.css:179-185` | `.natb-glass` = `color-mix(card 82%, transparent)` + blur(20px) | 底色本身就是 `#fff`，白叠白 → 合成值仍是 `#ffffff`，**零层次** | 致命 |
| A2 | `src/styles/issue.css:90` | `--border: oklch(0.922 0 0)` 当结构线 | `#e5e5e5` vs `#fff` = **1.26:1** | 致命 |
| A3 | `IssueListItem.vue:47` | `hover:bg-accent/60` | `#f9f9f9` vs `#fff` = **1.05:1**，hover 无感 | 致命 |
| A4 | `IssueListItem.vue:47` | `rounded-none border-0` + `divide-y`（`IssueList.vue:149`） | 白色长条 + 1.26:1 分隔线 = 一整片白 | 高 |
| A5 | `IssueList.vue:110` | 骨架 `divide-y` + 无卡片容器 | 加载态与完成态都不成形 | 中 |
| A6 | `IssueDetail.vue:607-613` | `.natb-detail__card` 同样用 `--natb-glass` | 同上，正文卡不可见 | 致命 |
| A7 | `issue.css:125` | `--natb-shadow-card: 0 1px 2px /0.04, 0 10px 28px -18px /0.22` | 第二层 y=10 但 spread=-18 → 几乎全部被裁掉，实际只有 0.04 的 1px 层 | 高 |
| A8 | 全局 | 字号档 15/12.5/12，字重 500/600/620/680 | 落差 <3px 且字重跨度 <2 档，读起来"平" | 高 |
| A9 | `IssueFilters.vue:148` | `TabsList h-8` + `h-8` 输入框 + `text-xs` | 工具条整体 32px 高，密度与内容区脱节 | 中 |

---

## 2. 「页面很白」的根因分析（量化）

### 2.1 根因一：三个表面同色（surface collapse）
浅色模式下 preset 给的可用于"面"的值只有 `--background`、`--card`、`--popover`，三者**都是 `oklch(1 0 0)`**。也就是说这套主题本身**不提供**"页面灰 / 卡片白"的经典 GitHub 式层次。我们又把唯一的 `--muted`(`#f5f5f5`) 只用在 hover 和 `--natb-glass` 的混色里，于是整个视口 100% 是 `#ffffff`。
> 这解释了业主的主观描述："白"= 没有面积上的明暗关系，眼睛找不到"哪里是容器、哪里是内容"。

### 2.2 根因二：我们唯一的"边界媒介"低于人的辨识阈值
把可用的边界手段排一排（都是相对 `#ffffff` 的实测对比度）：

| 手段 | 合成色 | 对比度 | 能否承担"边界" |
|---|---|---|---|
| `bg-muted` 铺面 | `#f5f5f5` | 1.09:1 | ✗ 只能做"氛围"，不能做分界 |
| `--border` 发丝线 | `#e5e5e5` | 1.26:1 | △ 1x 屏勉强，2x 屏偏弱 |
| `border-foreground/15` | `#dadada` | 1.39:1 | △ |
| **`border-foreground/20`** | `#cecece` | **1.57:1** | ✓ 结构线 |
| **`border-foreground/25`** | `#c2c2c2` | **1.79:1** | ✓ 强调结构线 |
| `--ring`(`#a1a1a1`) | `#a1a1a1` | 2.59:1 | ✓ 焦点环 |
| `shadow`(0.04α) | — | ≈ 无 | ✗ 单独用没有存在感 |

结论：**我们一直在用 1.26:1 的唯一手段去画所有边界**，而 1.05–1.26 这一段是"看起来像脏了"而不是"看起来有结构"的区间。

### 2.3 根因三：阴影的几何参数把效果吃掉了
`0 10px 28px -18px` 的有效扩散 = `28 - 18*2 = -8`，负到没有；再叠加 `1px 2px /0.04`。最终视觉上≈没有阴影，卡片无法"离地"。
（Josh Comeau 与 Tobias Ahlin 的经典做法都是**多层、小 alpha、每层 y 与 blur 成比例放大**，且**最外层必须保留正扩散或至少 0 扩张**。）

### 2.4 根因四：字号/字重梯度被压扁
15px/500 的标题 vs 12.5px/400 的 meta，尺寸差 2.5px、字重差 1 档；没有"区块标题"这一级（侧栏的 12px uppercase 是唯一例外）。缺少中间层 → 眼睛只能看到"一堆等重文本"。

### 2.5 解法总纲（4 个杠杆，按 ROI 排序）

| 杠杆 | 做法 | 收益 |
|---|---|---|
| **L1 表面反转** | 页面/容器 = `#f5f5f5`（`bg-muted`），卡片 = `#ffffff`（`bg-card`） | 一次性把 1.00:1 变成 1.09:1 的面差 + 让阴影有落点 |
| **L2 结构线加档** | 结构边界改用 `border-foreground/20`（1.57:1），发丝线仍用 `border-border` | 让"块"能被看见 |
| **L3 双层阴影** | `0 1px 2px /0.04` + `0 4px 12px -4px /0.06` | 让卡片离地 |
| **L4 类型梯度** | 补出 6 级 ramp（含 11px 微字与 22px 页标题） | 让眼睛有路径 |

---

## 3. 视觉层级模型：6 级（issue 追踪页专用）

| 级 | 名称 | 代表元素 | 表面 | 字号/行高/字重/字距 | 颜色 | Tailwind |
|---|---|---|---|---|---|---|
| **L0** | 画布 | 页面底 | `bg-muted` `#f5f5f5` | — | — | `bg-muted` |
| **L1** | 容器卡 | 列表容器 / 正文卡 / 侧栏卡 | `bg-card` `#fff` + 结构线 + 阴影 | — | — | `bg-card border border-foreground/20 rounded-xl shadow-[…]` |
| **L2** | 区块头 | 卡内 header（作者/时间条、筛选条） | `bg-muted`（在白卡内形成 1.09 面差） | 12px / 1.3 / 500 / 0 | `muted-foreground` | `bg-muted/70 border-b border-border px-4 py-2.5 text-xs` |
| **L3** | 行 | issue 列表行 | 白，`divide-y`（`border-border`） | 15px / 1.45 / 500 / -0.01em | `foreground` | `px-4 py-3` + `text-[15px] font-medium` |
| **L4** | 元信息 | `#12 · 作者 · 3 天前` | 透明 | 12px / 1.4 / 400 / 0 | `muted-foreground` | `text-xs text-muted-foreground` |
| **L5** | 微件 | label / 计数 badge | 描边 | 11px / 1.2 / 500 / 0.01em | `muted-foreground` | `text-[11px] font-medium` |

**关键规则**
- 相邻两级必须有 **两类信号** 同时变化（尺寸 + 字重，或 尺寸 + 颜色，或 表面 + 线）。只变一个不够。
- L2 的区块头**一旦使用了灰底**，它下方不再画结构线（`border-b` 用发丝线即可），避免"线 + 面"双信号过量。
- L0→L1 用**阴影 + 1.57:1 结构线**；L1→L2 用**面差 1.09**；L2/L3→L4 用**颜色 19.79→4.73**；L4→L5 用**尺寸 12→11 + 字距**。

---

## 4. 表面 / 边框 / 阴影 系统

### 4.1 表面（只有三个合法值，全部来自 token）
| 语义 | class | 合成值 | 用途 |
|---|---|---|---|
| 画布 | `bg-muted` | `#f5f5f5` | 页面底、卡片之间的缝隙 |
| 内容面 | `bg-card` | `#ffffff` | 卡片、列表行、输入区 |
| 内嵌面 | `bg-muted` / `bg-muted/70` | `#f5f5f5` / `#f8f8f8` | 卡内 header、代码块、引用块、空状态图标底 |
| 浮层 | `bg-popover` | `#ffffff` | Popover / Dialog / Dropdown（**必须**配 overlay 阴影，不靠灰底） |

> **禁止**：在白卡上再用 `bg-background`（=白）表示"更浅一层"。没有更浅的一层。

### 4.2 边框三档
| 档 | class | 合成值 | 对比度 | 用在哪 |
|---|---|---|---|---|
| 发丝 hairline | `border-border` | `#e5e5e5` | 1.26:1 | 列表行分隔、卡内 header 底边、表格行线 |
| 结构 structural | `border-foreground/20` | `#cecece` | 1.57:1 | 卡片外框、可聚焦容器边框 |
| 强调 emphasis | `border-foreground/25` | `#c2c2c2` | 1.79:1 | hover 时的卡片外框、需要被"看见"的分组框 |
| 虚线占位 | `border-dashed border-foreground/15` | `#dadada` | 1.39:1 | 空状态、拖拽区、未填写字段 |

> **禁止** `border-border/60`（→1.15:1）。在这么窄的灰阶里再降透明度等于删掉这条线。要么用完整 `border-border`，要么用 `foreground` alpha。

### 4.3 阴影三档（2 层结构：contact + ambient）
```
静置卡片  shadow-[0_1px_2px_rgb(0_0_0/0.04),0_2px_8px_-2px_rgb(0_0_0/0.06)]
悬停抬升  shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_20px_-8px_rgb(0_0_0/0.10)]
浮层      shadow-[0_4px_12px_rgb(0_0_0/0.08),0_16px_40px_-12px_rgb(0_0_0/0.16)]
```
**几何规则（照抄）**
1. contact 层永远 `0 1px 2px`，alpha ≤ 0.05 —— 它只负责"贴住页面"。
2. ambient 层 y 偏移 : blur : 负 spread ≈ **1 : 2.5–3 : 0.4–0.5**；例如 y=8 / blur=20 / spread=-8。
3. 绝不出现 `spread` 为负且绝对值 ≥ blur 的情况（这就是 A7 的问题）。
4. 纯黑 alpha 上限 0.16；超过会发脏、发灰。
5. 深色模式：把 alpha 提到 1.5–2 倍（`0_1px_2px_rgb(0_0_0/0.5)`），因为深色背景吃掉阴影。

### 4.4 border 与 shadow 的分工（一句话原则）
> **border 回答"边界在哪里"，shadow 回答"离页面多远"。**
> 两者不同时加强：有 1.57:1 结构线时，阴影降到静置档；只有阴影时，边框必须存在（否则 1x 屏上看不见边）。

---

## 5. 间距节奏

### 5.1 网格
- **基线网格 4px**（Tailwind `spacing` 默认 1 = 4px），**垂直节奏强制 8px 倍数**，只有图标与文字的光学对齐允许 ±2px。
- 可用步进（只允许这些）：`1=4` `1.5=6` `2=8` `2.5=10` `3=12` `4=16` `5=20` `6=24` `8=32` `10=40` `12=48`。
- 禁止 `p-7 / p-9 / gap-7` 之类非 4 倍数（`p-3.5=14` 属于 2px 光学档，仅用于紧凑行）。

### 5.2 具体数值表（照抄）

| 位置 | 值 | Tailwind | 依据 |
|---|---|---|---|
| 页面左右 gutter | 16 / 24（sm） | `px-4 sm:px-6` | 与工具条对齐 |
| 页面上下 padding | 24 | `py-6` | |
| 列表容器与卡片之间 | 16 | `gap-4` | |
| 双栏（主 + 侧）列间距 | 24 | `gap-6` | 现为 18px（`IssueDetail.vue:517`）→ 改 24 |
| 卡片之间（侧栏多卡） | 12 | `gap-3` | 比列间距小一档，形成分组 |
| 卡片内边距（标准） | 16 | `p-4` | |
| 卡片内边距（正文/发布框） | 20 | `p-5` | 阅读区更松 |
| 卡片内边距（紧凑侧栏卡） | 12 / 14 | `p-3` / `px-3.5 py-3` | |
| 卡内 header 上下 | 8 / 10 | `px-4 py-2.5` | 12px 字用 10px 上下 → 32px 高 |
| 列表行上下 | 12 | `py-3` | 行高 = 12+21+12 ≈ 45px |
| 列表行左右 | 16 | `px-4` | |
| 列表行间距 | 0（靠 `divide-y` 发丝线） | `divide-y` | 行与行不加 gap，否则切碎 |
| 行内元素 gap（图标↔文字） | 6 | `gap-1.5` | |
| meta 项之间 | 8（用 `·` 分隔器时 6） | `gap-2` | |
| 标题 ↔ meta | 6 | `gap-1.5` | |
| 区块标题 ↔ 内容 | 10 | `gap-2.5` | |
| 侧栏 sticky top | 88 | `top-22`（或 `top-[88px]`） | 现为 84 |

### 5.3 节奏规则
- **同类间隔取同一档**：所有"卡片之间"必须同一个值（12 或 16，不许混）。
- **越靠近，越紧密**：标题↔meta(6) < 行内元素(6–8) < 卡内块(16) < 卡片之间(16–24)。
- 每屏最多出现 **3 种**不同间距值（4/8/12/16/20/24 里挑 3 个）。超过 3 种 = "乱"。

---

## 6. 字体 scale

字体为 Inter（`issue.css:25`）。Inter 的可用 ramp：11 / 12 / 13 / 14 / 15 / 16 / 18 / 20 / 24。

| 角色 | 字号 | 行高 | 字重 | 字距 | Tailwind | 色 |
|---|---|---|---|---|---|---|
| **页面主标题**（issue 标题 h1） | 22–24 | 1.3 | 600 | -0.02em | `text-[22px] sm:text-2xl font-semibold tracking-tight leading-[1.3]` | `foreground` |
| **区块大标题**（"Issues"、"评论"） | 18 | 1.4 | 600 | -0.01em | `text-lg font-semibold tracking-[-0.01em]` | `foreground` |
| **卡内小标题**（侧栏卡 "Labels"） | 11–12 | 1.2 | 600 | +0.06em，uppercase | `text-[11px] font-semibold uppercase tracking-wider` | `muted-foreground` |
| **列表项标题** | 15 | 1.45 | 500（hover 550–600） | -0.01em | `text-[15px] font-medium leading-snug tracking-[-0.01em]` | `foreground` |
| **正文**（Markdown） | 15 | 1.7 | 400 | 0 | `text-[15px] leading-[1.7]` | `foreground` |
| **辅助文字**（meta / 时间 / 作者） | 12 | 1.4 | 400 | 0 | `text-xs leading-snug` | `muted-foreground` |
| **微文本**（badge / 计数） | 11 | 1.2 | 500 | +0.01em | `text-[11px] font-medium` | `muted-foreground` |
| **代码/编号** | 12 | 1.5 | 400 | 0 | `font-mono text-xs` | `muted-foreground` |

**规则**
1. **字号单调递减，不许回弹**：24 > 18 > 15 > 12 > 11。同一屏里 13px 与 14px 不允许同时出现（差 1px 制造噪音而不是层级）。
2. 负字距只用在 **≥18px** 的字上（`tracking-tight` = -0.025em）；11–12px 用 0 或正字距，小字加负字距会糊。
3. 字重只用 3 档：**400 / 500 / 600**。删除 620/650/680 这类"半档"（我们代码里有 `font-weight: 620`、`680`）——非可变字重下它们会被四舍五入，等于白写。
4. 中文正文避免 `tracking-tight`（会挤压汉字）；中文行高至少 1.6，故正文用 1.7。
5. `text-muted-foreground` 只用于 12px 及以下或次要标签；**15px 正文不用 muted**（4.73:1 在长文里偏灰）。

---

## 7. 交互状态

| 状态 | 做法 | Tailwind（照抄） | 理由（实测） |
|---|---|---|---|
| **hover（行/卡）** | 背景加深一档 | `hover:bg-foreground/[0.04]` → `#f5f5f5`（1.09:1） | `hover:bg-accent/60`=`#f9f9f9`(1.05:1) 太弱，这是现状最大的"无反馈"来源 |
| **hover（卡片外框）** | 结构线升一档 | `hover:border-foreground/25` | 1.26 → 1.79 |
| **hover（图标按钮）** | 只换底色，不换字色 | `hover:bg-foreground/[0.06] hover:text-foreground` | 换字色会造成闪烁感 |
| **active/pressed** | 再深一档 + 无位移 | `active:bg-foreground/[0.08]` | |
| **focus-visible（全局）** | 2px ring + 2px offset | `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` | `--ring` `#a1a1a1` 仅 **2.59:1**，低于 WCAG 非文本 3:1 → **必须 2px 实色**，禁止 `ring-ring/50`（→1.6:1，等于没有） |
| **focus-visible（行级）** | 行本身也给底色 | `focus-visible:bg-foreground/[0.04]` | 键盘用户在长列表里需要定位 |
| **disabled** | `opacity-50` + 禁指针 | `disabled:opacity-50 disabled:pointer-events-none` | 不要再改文字色 |
| **选中（当前行）** | 左侧 2px 竖条 + 底色 | `bg-foreground/[0.04] before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-foreground/40` | 只靠底色不够，灰阶太窄 |
| **过渡** | 只过渡颜色，150ms | `transition-colors duration-150 ease-out` | 不要 `transition-all`（会带动布局） |
| **入场** | 已有 `.natb-rise` 保留，仅用于整块区域 | 0.28s cubic-bezier(0.32,0.72,0,1) | 列表行不要逐行动画 |

---

## 8. 空 / 加载 / 错误 三态

### 8.1 空状态（Empty）
```
外层：flex flex-col items-center gap-3 px-6 py-14 text-center
图标底：grid size-11 place-items-center rounded-xl border border-dashed border-foreground/15 bg-muted text-muted-foreground  （图标 size-5）
标题：text-sm font-semibold text-foreground
说明：max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground
动作：Button size="sm"（主）/ variant="outline"（次），与上方 gap-4
```
规则：
- 空状态**必须**给出"下一步动作"（新建 / 清筛选），不能只写"暂无数据"。
- 图标**不**用彩色插画、不用紫色渐变（本项目无品牌色许可用于此）。用 dashed 边框 + `bg-muted` 的"空槽"表达"这里可以放东西"。
- 文案两段式：**发生了什么**（标题）+ **可以做什么**（说明）。
- 复选：直接用 shadcn-vue 的 `Empty / EmptyHeader / EmptyMedia / EmptyTitle / EmptyDescription / EmptyContent`（项目已装），只覆盖尺寸类，不要重写结构。

### 8.2 加载态（Skeleton）
- 骨架**必须**与真实布局同尺寸同圆角，否则加载完成会跳动：行骨架 = `flex items-start gap-3 px-4 py-3`（与真实行一致），`Skeleton` 高 = 真实文本行高（15px 行用 `h-4`、12px 行用 `h-3`）。
- 圆角与真实元素一致：文本 `rounded`，头像/状态点 `rounded-full`，卡片 `rounded-xl`。
- 首屏 6 行；**分页追加时不要整屏骨架**，只在底部加一行 `h-9` 的骨架。
- 动画只用 `animate-pulse`（shadcn Skeleton 自带）；不要 shimmer 扫光（灰阶太浅，扫光会变成"脏"）。
- 骨架容器与列表同容器（同一张白卡内），保证加载→完成无布局跳变。

### 8.3 错误态
```
容器：flex flex-col items-center gap-2.5 px-6 py-12 text-center
图标：size-7 text-muted-foreground   ← 注意：不用 destructive 红铺底
标题：text-sm font-medium
详情：max-w-[40ch] text-xs leading-relaxed text-muted-foreground（原始 message）
动作：Button variant="outline" size="sm" + 重试图标
```
规则：错误用"图标 + 原文 + 重试"，不用红色大色块——在 3 档灰阶的界面里，一块红色会把所有层级压死。

---

## 9. 反模式清单（实施时逐条对照）

| ✗ 禁止 | ✓ 改成 | 原因 |
|---|---|---|
| `bg-background` 当卡片底色 | `bg-card` + 结构线 + 阴影，且父容器 `bg-muted` | 白叠白 = 1.00:1 |
| `bg-card/82` + `backdrop-blur` 做卡片 | 直接 `bg-card` | 白底上的玻璃等于没做（A1） |
| `border-border/60` | `border-border` 或 `border-foreground/20` | 1.15:1 会被彻底忽略 |
| `hover:bg-accent/60` | `hover:bg-foreground/[0.04]` | 1.05 → 1.09，且后者在白/灰底上都成立 |
| `shadow-md` 一把梭 | 用本文的 2 层自定义阴影 | 默认阴影 alpha 与几何不匹配中性灰 |
| `rounded-none` 列表行 + `divide-y` 在纯白上 | 行放在白卡内，卡在灰底上 | 无容器 = 一整片白 |
| `font-weight: 620/650/680` | 400/500/600 | 非可变字重会被取整 |
| `text-[13px]` 与 `text-sm` 混用 | 只用 11/12/15/18/22 | 差 1px 是噪音 |
| `ring-ring/50` | `ring-2 ring-ring` | 2.59:1 再降透明 = 不可见 |
| `transition-all` | `transition-colors` | 避免带动布局抖动 |
| 在 11px 字上用 `tracking-tight` | 0 或 `tracking-wider` | 小字负字距必糊 |

---

## 10. 可直接照抄的 Tailwind 类清单

> 前提：区域祖先已有 `class="natb-issue"`（`issue.css:173` 提供 `bg-background text-foreground font-sans`）。
> 「方案 A」= 宿主 `Issues.vue` 能被改一行；「方案 B」= 组件内自足（宿主不动）。

### 10.1 画布
```
页面底（方案 A，宿主容器）:  bg-muted                                  // #f5f5f5，1.09:1 面差，让卡片有落点
页面底（方案 B，组件外层）:  -mx-4 -my-6 bg-muted px-4 py-6 sm:-mx-6 sm:px-6   // 用负边距把灰铺到边缘
页面内容宽度:                mx-auto w-full max-w-[1120px]
页面内主栅格:                grid gap-6 lg:grid-cols-[minmax(0,1fr)_264px]
```

### 10.2 卡片（L1）
```
标准卡片:
  bg-card border border-foreground/20 rounded-xl
  shadow-[0_1px_2px_rgb(0_0_0/0.04),0_2px_8px_-2px_rgb(0_0_0/0.06)]

可点击卡片（hover 抬升）:
  bg-card border border-foreground/20 rounded-xl cursor-pointer
  shadow-[0_1px_2px_rgb(0_0_0/0.04),0_2px_8px_-2px_rgb(0_0_0/0.06)]
  transition-colors duration-150 ease-out
  hover:border-foreground/25
  hover:shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_20px_-8px_rgb(0_0_0/0.10)]

列表容器（白卡 + 行分隔）:
  bg-card border border-foreground/20 rounded-xl overflow-hidden divide-y divide-border

浮层（Popover / Dropdown / Dialog 内容）:
  bg-popover border border-foreground/20 rounded-xl
  shadow-[0_4px_12px_rgb(0_0_0/0.08),0_16px_40px_-12px_rgb(0_0_0/0.16)]

卡内 header（L2）:
  flex items-center gap-2.5 border-b border-border bg-muted/70 px-4 py-2.5 text-xs text-muted-foreground
```

### 10.3 列表行（L3）
```
行容器（放在白卡内，不要 rounded-none 单独存在）:
  flex items-start gap-3 px-4 py-3 transition-colors duration-150
  hover:bg-foreground/[0.04]
  focus-visible:outline-none focus-visible:bg-foreground/[0.04]
  focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background

行标题:
  text-[15px] font-medium leading-snug tracking-[-0.01em] text-foreground line-clamp-2

行 meta（L4）:
  mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-snug text-muted-foreground

行内状态点（保留现有语义色，尺寸统一）:
  size-4 shrink-0  （open: text-emerald-500 / closed: text-violet-500 / not-planned: text-muted-foreground）
```

### 10.4 工具条 / 筛选（L2）
```
工具条容器:
  flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3

Tabs 容器:      h-8 rounded-lg bg-muted p-0.5        // 灰槽 + 白块，1.09 面差
Tabs trigger:   px-3 text-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.06)]
搜索框:         h-9 pl-8 text-xs bg-card border-border focus-visible:ring-2 focus-visible:ring-ring
筛选按钮:       h-9 gap-1.5 text-xs variant="outline"
计数 badge:     h-4 px-1 text-[11px] font-medium variant="secondary"
已筛选 chip:    h-6 gap-1 px-2 text-[11px] font-normal variant="outline" hover:bg-foreground/[0.04]
```

### 10.5 详情页
```
页面标题（L0 of content）:
  text-[22px] font-semibold leading-[1.3] tracking-tight text-foreground sm:text-2xl

标题下 meta 行:
  mt-2 flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground

正文卡:
  bg-card border border-foreground/20 rounded-xl overflow-hidden
  shadow-[0_1px_2px_rgb(0_0_0/0.04),0_2px_8px_-2px_rgb(0_0_0/0.06)]

正文卡 header:
  flex items-center gap-2.5 border-b border-border bg-muted/70 px-4 py-2.5

正文卡 body:
  px-5 py-4 text-[15px] leading-[1.7]

侧栏卡（可多张，gap-3）:
  bg-card border border-foreground/20 rounded-xl px-3.5 py-3
  shadow-[0_1px_2px_rgb(0_0_0/0.04),0_2px_8px_-2px_rgb(0_0_0/0.06)]

侧栏卡标题:
  mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground

侧栏空值文本:
  text-xs text-muted-foreground/80        // 4.3:1，弱但可读
```

### 10.6 三态
```
骨架行:    flex items-start gap-3 px-4 py-3
骨架标题:  h-4 w-[58%] rounded
骨架 meta: h-3 w-1/3 rounded
骨架点:    mt-1.5 size-2 rounded-full

空状态容器:   flex flex-col items-center gap-3 px-6 py-14 text-center
空状态图标槽: grid size-11 place-items-center rounded-xl border border-dashed border-foreground/15 bg-muted text-muted-foreground
空状态标题:   text-sm font-semibold text-foreground
空状态说明:   max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground

错误图标:  size-7 text-muted-foreground
错误标题:  text-sm font-medium
错误详情:  max-w-[40ch] text-xs leading-relaxed text-muted-foreground
```

### 10.7 全局杂项
```
分隔器:      h-px w-full bg-border                    // 不要用 border-t 在 flex 里（会挤盒模型）
行内小标签:  inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground
头像:        size-4 rounded-full ring-1 ring-border    // 白底上的头像必须有 1px 环
图标尺寸:    行内 14 / 按钮内 16 / 空状态 20 / 大图标 28 → size-3.5 / size-4 / size-5 / size-7
代码块:      rounded-lg border border-border bg-muted px-4 py-3 font-mono text-xs leading-relaxed
引用块:      border-l-2 border-foreground/20 pl-3.5 text-muted-foreground
```

### 10.8 深色模式校验（不用改类，只做验证）
- `bg-muted` 在深色下是 `#262626`，`bg-card` 是 `#343434` → 面差 **1.23:1**【实测】，比浅色更强，方案自动成立。
- `--border` 深色是 `oklch(1 0 0 / 10%)` → 合成 `#484848`，对卡面 1.37:1，可接受。
- `border-foreground/20` 深色下合成接近 `#4a4a4a`，注意**深色要用 `/25`** 才能达到同等辨识度；建议写成 `border-foreground/20 dark:border-foreground/25`。
- 阴影 alpha 在深色下 ×2（见 4.3 规则 5）。

---

## 11. 迁移顺序（P0 → P2）

| 优先级 | 改动 | 文件 | 一句话 |
|---|---|---|---|
| **P0** | 列表容器白卡 + 页面 `bg-muted` | `Issues.vue`(宿主) / `IssueList.vue:108,149` | 解决"一整片白" |
| **P0** | 行 hover 改 `hover:bg-foreground/[0.04]`；去掉 `rounded-none border-0` | `IssueListItem.vue:47` | 恢复交互反馈 |
| **P0** | 卡片阴影换成 2 层自定义值 | `IssueDetail.vue:607`、`issue.css:125` | 让卡离地 |
| **P1** | `.natb-glass` 退化为实色 `bg-card` | `issue.css:179` | 白底玻璃无意义 |
| **P1** | 结构线统一 `border-foreground/20` | 全局 | 边界可见 |
| **P1** | 字号收敛到 11/12/15/18/22，字重收敛到 400/500/600 | 全局 | 建立梯度 |
| **P2** | 空/加载/错误三态按第 8 节重做 | `IssueList.vue:110,121,132` | 细节质感 |
| **P2** | 工具条高度 32 → 36（`h-9`） | `IssueFilters.vue` | 密度对齐 |
| **P2** | focus-visible 全量补齐 | 全部可点元素 | 可达性 |

---

## 12. 验收自检表（提交前逐条打勾）

- [ ] 打开页面截图，去掉所有文字，仍能看出 **≥3 个明暗区块**（灰底 / 白卡 / 卡内灰条）。
- [ ] 卡片外框对比度 ≥ **1.5:1**（用取色器验 `border-foreground/20` = `#cecece`）。
- [ ] 鼠标移到任意列表行，颜色变化 **肉眼可辨**（≥ `#f5f5f5`）。
- [ ] Tab 键依次走查，每个可交互元素都有 **2px 可见焦点环**。
- [ ] 同屏字号不超过 **5 档**，字重不超过 **3 档**。
- [ ] 同屏间距值不超过 **3 种**。
- [ ] 骨架 → 真数据 **无布局跳动**（行高一致）。
- [ ] 空状态有 **可点击的下一步动作**。
- [ ] 切深色模式，区块层次 **依然成立**（面差 1.23:1）。
- [ ] 全局 `grep` 无 `border-border/60`、`hover:bg-accent/60`、`transition-all`、`ring-ring/50`。

---

## 13. 来源清单（研究依据）

> 标注说明：**〔实算〕** = 由本项目 token 计算得出的数值；其余数值为"本规范落地值"，方向与做法来自下列来源。

### A. Linear（层级、密度、色彩克制）
1. **A design reset (part I)** — https://linear.app/now/a-design-reset
   → 界面重设计以"减少视觉噪音、把对比度留给内容"为主线；颜色收窄、留白让位给层级。落地点：本文第 3 节的 6 级模型与"只变一个信号不够"的规则。
2. **A calmer interface for a product in motion** — https://linear.app/now/behind-the-latest-design-refresh
   → "更平静的界面"：降低面与面的色差，把区分交给排版与间距。落地点：第 5 节间距节奏（同屏 ≤3 种间距值）。
3. **A Linear spin on Liquid Glass** — https://linear.app/now/linear-liquid-glass
   → 玻璃质感成立的前提是背后**有内容层次**；纯白底上做玻璃没有意义。落地点：反模式表第 2 条（`.natb-glass` 必须退化）。
4. **Design System Inspired by Linear**（nexu-io/open-design）— https://github.com/nexu-io/open-design/blob/de6d2c072a18dfef80ecad4a455b31f0d5aca090/design-systems/linear-app/DESIGN.md
   → 其面板采用"深色画布 + 略亮面板"的面差结构；密度高但每级文本只承担一个角色。落地点：表面 system（4.1）。
5. **Linear Design System - Spacing System**（educlopez/design-bites）— https://raw.githubusercontent.com/educlopez/design-bites/main/design-mds/linear.app/DESIGN.md
   → spacing 采用小步进（4px 级）并严格复用；列表行高与文字行高解耦（行高由 padding 决定）。落地点：5.2 表格的行 `py-3`。
6. **Design System Analysis of Linear** — https://getdesign.md/design-md/linear.app/preview
   → 字号 ramp 少而陡，正文 15px 级别 + 辅助 12px，中间不留 13/14 的过渡档。落地点：第 6 节"字号单调递减、13/14 不许共存"。
7. **design-frontier catalog: linear** — https://cdn.jsdelivr.net/npm/design-frontier@1.1.0/catalog/references/linear.yml
   → 强调"高密度但低对比"的组合：靠字重与 1px 线维持结构。落地点：4.2 三档边框。

### B. GitHub 新 UI / Primer（灰阶、卡片层次、列表行）
8. **Color usage — Primer** — https://primer.style/product/getting-started/foundations/color-usage/
   → 明确区分"canvas（画布）/ surface（面）/ border（边界）"三种用途，同一灰阶里用不同 role 而不是不同色相。落地点：4.1 的"画布/内容面/内嵌面/浮层"四角色。
9. **Base scales — Primer** — https://primer-c744b035ca-26441320.drafts.github.io/foundations/color/base-scales
   → 中性灰阶按 step 递增使用：step1–2 做背景，step3 做边框，step5+ 做文字。落地点：第 3 节各级的颜色指派。
10. **@primer/primitives CHANGELOG（functional color tokens / light & dark scales）** — https://raw.githubusercontent.com/primer/primitives/main/CHANGELOG.md
    → token 从"字面色"改成"功能色"，同色在不同 surface 上有不同取值。落地点：禁止直接硬编码色值，只用语义类（与 CONTRACT 一致）。
11. **Page design patterns — primer/brand** — https://github.com/primer/brand/blob/0332ac7164ab13defa66414bc907d57a5fdb889a/packages/mcp/content/page-design.md
    → 页面级留白与区块节奏的模板化（header / content / aside 的固定 padding）。落地点：5.2 页面 gutter。
12. **GitHub 受启发设计系统（DESIGN-zh）** — https://github.com/devin-axis/ipollowork/blob/a8c1d5b7f2c1910d5157ff0dd49dd22cd28cefca/apps/app/src/react-app/domains/session/design/design-systems/design-systems/github/DESIGN-zh.md
    → 复刻 GitHub 的关键是"灰画布 + 白卡 + 极淡边框 + 不显眼的阴影"四件套同时存在。落地点：核心结论 1 与 4.4 分工原则。
13. **GitHub — Design Tokens（superloopy）** — https://github.com/beefiker/superloopy/blob/378169a2646b2f8b84dcff0c4fd9f0da9b7d8a32/skills/superloopy-frontend/references/design/github.md
    → 列出 GitHub 的 canvas subtle / border default 等实际取值，用于对照我们 --border 偏弱的问题。落地点：2.2 对比表。
14. **Saved views for repository issues & adjustable row heights（community #200164）** — https://github.com/orgs/community/discussions/200164
    → GitHub 为 issue 列表提供**行高可调**，说明行密度是可配置的一等公民。落地点：5.2 行 `py-3`（45px）与"紧凑档 40px"。
15. **GitHub、行の高さ調整機能を追加（CodeZine）** — https://codezine.jp/news/detail/24690
    → 同上，行高变更是可被感知的体验改进而不只是样式。落地点：5.2、8.2 骨架行高一致。
16. **Issue Display & Interaction（DeepWiki · contrib-fyi）** — https://deepwiki.com/K-dash/contrib-fyi/4.3-issue-display-and-interaction
    → issue 行的信息序：状态 → 标题 → 编号/作者/时间 → 标签，顺序固定。落地点：10.3 行结构。

### C. Vercel Dashboard / Geist（黑白灰层级、边框与阴影）
17. **Colors — Geist** — https://vercel.com/geist/colors
    → Geist 的灰阶是"背景用 100，卡片用 0（白），边框用 200"的顺序，白卡永远在浅灰上。落地点：核心结论 1。
18. **Design System: Vercel（awesome-design-md / hermes-agent 模板）** — https://cdn.jsdelivr.net/npm/awesome-design-md@1.1.0/design-md/vercel/DESIGN.md
    → 面板靠 1px 边框 + 极轻阴影定形，不用重投影。落地点：4.3 静置卡阴影 alpha 0.04/0.06。
19. **Vercel DESIGN.md（educlopez/design-bites）** — https://raw.githubusercontent.com/educlopez/design-bites/main/design-mds/vercel.com/DESIGN.md
    → 提供 banner 高度、间距等具名 token，说明所有尺寸都应 token 化。落地点：第 5 节"只允许这些步进"。
20. **Design System Inspired by Vercel（nexu-io, zh-tw）** — https://github.com/nexu-io/open-design/blob/de6d2c072a18dfef80ecad4a455b31f0d5aca090/design-systems/vercel/DESIGN-zh-tw.md
    → 黑白灰体系要成立必须"三级表面差 + 一条 1px 结构线"，缺任一都塌。落地点：4.4。
21. **vercel-labs/native geist theme** — https://github.com/vercel-labs/native/blob/80d1c46d/src/primitives/canvas/themes/geist.zig
    → 深色下阴影 alpha 明显提高以补偿背景吸收。落地点：4.3 规则 5。

### D. Notion / Stripe（信息密度与留白节奏）
22. **Design System Inspired by Notion（code-yeongyu）** — https://github.com/code-yeongyu/lazycodex/blob/0d015b03c5cf664ee76bcf81187cbac795e9aa69/plugins/omo/skills/frontend/references/design/notion.md
    → Notion 靠"极浅的 hover 底 + 恰好够的间距"制造可点感，而不是靠边框。落地点：7 节 hover 用 `foreground/[0.04]`。
23. **受 Notion 啟發的設計系統（nexu-io）** — https://github.com/nexu-io/open-design/blob/de6d2c072a18dfef80ecad4a455b31f0d5aca090/design-systems/notion/DESIGN-zh-tw.md
    → 正文行高 1.6–1.7、段落间距 = 行高的 0.85–1 倍。落地点：6 节正文 15/1.7；`.natb-md > * + *` 0.85em 保留。
24. **Design System Inspiration of Stripe（qiaomu-design）** — https://cdn.jsdelivr.net/gh/joeseesun/qiaomu-design@HEAD/references/design-systems/stripe/DESIGN.md
    → 卡片用"阴影分级"表达层级（越接近用户操作越高的 elevation）。落地点：4.3 三档阴影。
25. **awesome-design-md stripe** — https://cdn.jsdelivr.net/npm/awesome-design-md@1.1.0/design-md/stripe/DESIGN.md
    → 同页最多两级 elevation，避免"层层叠影"。落地点：4.4"不同时加强"。
26. **Dashboard Data Density Patterns: How Much Is Too Much** — https://artofstyleframe.com/blog/dashboard-data-density-patterns/
    → 密度上限由"每行可扫读字段数 ≤ 4"决定，超过应折叠。落地点：10.3 行 meta 只放编号/作者/时间/评论数。
27. **Dashboard 設計最佳實踐：7 個原則** — https://roypun.com/dashboard-best-practices
    → 一屏要能"带你找到下一步"，因此空/错误态必须给动作。落地点：8.1、8.3。

### E. Raycast / Arc / Figma（细节质感：背景、悬停、焦点环）
28. **Design System Inspiration of Raycast（awesome-design-md）** — https://github.com/sweetkey/awesome-design-md/blob/main/design-md/raycast/DESIGN.md
    → 质感来自"1px 描边 + 内阴影 + 焦点环"三件小事，而不是大块渐变。落地点：7 节 focus-visible 与 4.2 发丝线。
29. **A Technical Deep Dive Into the New Raycast** — https://raw.githubusercontent.com/zoubingwu/llm-wiki/18067017828e9b1c4b3d7be590c1899f61308284/articles/A%20Technical%20Deep%20Dive%20Into%20the%20New%20Raycast.md
    → 窗口/面板用极薄的边界与非常克制的模糊层次；模糊只在**背后有内容**时使用。落地点：反模式"白底玻璃"。
30. **open-design arc DESIGN.md** — https://github.com/nexu-io/open-design/blob/main/plugins/_official/design-systems/arc/DESIGN.md
    → 交互态用"底色变化 + 边框变化"两信号，避免只改一个。落地点：第 3 节"相邻两级要两个信号"。
31. **design-ai arc DESIGN.md** — https://github.com/Khalidabdi1/design-ai/blob/main/design-md/arc/DESIGN.md
    → 侧栏与主区的区分靠 surface 差与 1px 分隔，不靠阴影。落地点：4.2 发丝线用途。
32. **Figma 2024: We shipped it, you shaped it** — https://www.figma.com/blog/figma-2024-we-shipped-it-you-shaped-it/
    → UI3 重设计把工具栏让位给画布，减少 chrome 的视觉重量。落地点：2 节"chrome 不需要层次，内容需要"。
33. **Behind our redesign (UI3)** — https://www.figma.com/fr-fr/blog/behind-our-redesign-ui3/
    → 用"面板表面色 + 细分隔线"重做层级，颜色几乎不变。落地点：核心结论 3（层级不靠颜色）。

### F. 「为什么我的 SaaS 界面看起来很平/很白」
34. **Monochrome color systems that do not look flat: contrast, texture, and role separation** — https://colorarchive.org/notes/march-2026-monochrome-systems/
    → 单色系不塌的三个前提：**对比角色分离、表面差、纹理（线/阴影）**。本文核心结论 1–3 的直接依据。
35. **Why do most SaaS dashboards still feel like enterprise software from 1998** — https://github.com/berelevant-ai/slopless/blob/abfe9b99021ccf6d4c1754dc7064364f730d6fb5/datasets/ai-suspected/tech/devto/devto-3789583.md
    → "看起来像 1998"= 全是白底 + 1px 灰线 + 无层级排版。落地点：第 9 节反模式。
36. **SaaS Dashboard Design Trends in 2026（DEV）** — https://dev.to/thekitbase/saas-dashboard-design-trends-in-2026-with-examples-121m
    → 当代仪表盘的默认是"灰画布 + 白卡 + 12–16px 圆角 + 轻阴影"。落地点：10.2。
37. **Core Craft Principles** — https://raw.githubusercontent.com/aiskillstore/marketplace/refs/heads/main/skills/dammyjay93/interface-design/references/principles.md
    → craft 的本质是"每个像素都被决定过"：统一圆角、统一线宽、统一步进。落地点：5.1、9 节清单。
38. **Visual craft（malloydata/publisher）** — https://github.com/malloydata/publisher/blob/a8a72b70b1ba584744394adabf9c1ba6fd4dd101/skills/malloy-html-data-apps/reference/visual-craft.md
    → 表格/列表的质感来自"行内 padding 与列对齐的一致性"，与字号无关。落地点：5.2 行 padding。
39. **Refactoring UI · establish visual hierarchy** — https://github.com/gnurio/refactoring-ui-plugin/blob/main/skills/01-establish-visual-hierarchy/SKILL.md
    → 层级 = 尺寸 + 字重 + 颜色 + 间距 的组合，单一手段不足。落地点：第 3 节与第 6 节规则 1。
40. **refactoring-ui hierarchy reference** — https://github.com/lovropodobnik/refactoring-ui-skill/blob/HEAD/.claude/skills/ui-refactor/references/hierarchy.md
    → 同页只用 2–3 个字号与 2 个字重；"次要信息用更浅的颜色而不是更小的字号"。落地点：6 节 8 档表的取舍与 muted-foreground 用法。

### G. spacing scale / type scale / elevation 最佳实践
41. **Spacing — Carbon Design System** — https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview
    → 2px 微步进 + 8px 主步进的双层网格，用于图标对齐与布局节奏。落地点：5.1"4px 基线、8px 节奏、±2px 只给光学对齐"。
42. **Spacing — IBM Carbon v1 guidelines** — https://www.ibm.com/standards/carbon/v1/guidelines/spacing/
    → 间距必须来自有限集合，禁止随意取值。落地点：5.1 可用步进白名单。
43. **Spacing — CBS Design System** — https://designsystem.cbs.nl/908ff0dda/v/53219/p/5835dd-spacing
    → 组件内 padding 与组件间 margin 分两套标尺管理。落地点：5.2（卡内 16 / 卡间 12–24）。
44. **Customizing Spacing — Tailwind CSS** — https://v2.tailwindcss.com/docs/customizing-spacing
    → Tailwind 默认 spacing 是 4px 倍数，所以"4/8 网格"是本栈的**原生**方式，无需自建。落地点：第 5 节结论。
45. **Typography — EEA Design System** — https://eea.github.io/volto-eea-design-system/docs/webdev/Guidelines/typography/
    → 字号用流式 clamp 会让层级漂移，仪表盘应固定 ramp。落地点：6 节"字号单调递减"，也解释了为什么 `.natb-detail__title` 的 `clamp()` 应改为固定两档。
46. **Elevation — Fluent 2** — https://fluent2.microsoft.design/elevation
    → 阴影分级对应"离用户的远近"，同一层不叠加两种阴影。落地点：4.3 三档。
47. **M3Elevation / material_design** — https://pub.dev/documentation/material_design/latest/material_design/M3Elevation-class.html
    → 用 surface tint（同色相亲和）表达高度，而不是加强阴影。落地点：4.1"内嵌面用 bg-muted"，本质上就是中性版 surface tint。
48. **Shadows — Saropa Dashboard Style Guide** — https://raw.githubusercontent.com/saropa/saropa_lints/refs/heads/main/plans/guides/SAROPA_DASHBOARD_STYLE_GUIDE.md
    → 给出 `--shadow-lg: 0 4px 12px rgba(15,23,42,.08), 0 10px 30px -8px rgba(15,23,42,.16)` 的双层范式。落地点：4.3 浮层档（几何比例一致，仅改为纯中性）。
49. **atomix — design tokens / elevation** — https://github.com/Shohojdhara/atomix/blob/31cafd0667cb9112662f822775aeedc891d94bae/docs/design-tokens/elevation.md
    → elevation token 只暴露 3–4 档，避免"每处一个值"。落地点：4.3。
50. **阴影与深度系统工程：从层级语义到材质表达的完整架构** — https://bbs.huaweicloud.com/blogs/502597
    → 阴影应表达"层级语义"：静置 / 抬升 / 浮层，三档足矣。落地点：4.3 命名与用途。
51. **Designing Beautiful Shadows in CSS — Josh W. Comeau** — https://www.joshwcomeau.com/css/designing-shadows/
    → 阴影应由多层低 alpha 叠加，且**越远越大越淡**，单层大 alpha 会脏。落地点：4.3 几何规则 1–4。
52. **CSS Shadow Effects: 16 Examples（Tobias Ahlin 的五层法）** — https://wpdean.com/css-shadow-effects/
    → Tobias Ahlin 的经典做法：5 层，偏移 1/2/4/8/16px，blur 与偏移同比，alpha 相同且很低。落地点：4.3"y:blur ≈ 1:2.5–3"的缩放规则（我们只用 2 层，但同比例）。
53. **Use cases — Radix Colors** — https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
    → 12 步灰阶的分工：1–2 背景、3–5 组件静置、6–8 边框、9–12 文字/强调。**当步进不够时，用 alpha 合成补齐**。落地点：核心结论 2（用 foreground alpha 把 1.26:1 补到 1.57:1）。
54. **色彩 — Ant Design** — https://ant-design.antgroup.com/docs/spec/colors-cn
    → 中性色分 1–10 级并规定"边框用 5 级、分隔线用 4 级"。落地点：4.2 三档对照。
55. **shadcn/ui Theme Generator: OKLCH CSS Variables** — https://we.inc/tools/shadcn-theme-generator
    → 说明本 preset 这类 neutral 主题的 `--border` 通常偏浅，需要在组件层补结构线。落地点：2.2、4.2。
56. **featbit — Design System: FeatBit React Front End** — https://github.com/featbit/featbit/blob/2380078f44adac98e03c94963fd6df05438a873f/modules/front-end/DESIGN.md
    → 开源 dashboard 的完整层级落地案例（canvas / card / row / meta 四层）。落地点：第 3 节模型。

### H. 状态设计（空 / 加载 / 错误 / hover / focus）
57. **Loading — Carbon Design System** — https://www.carbondesignsystem.com/building-blocks/core/patterns/loading
    → 骨架必须匹配最终布局的**尺寸与位置**，否则加载态本身就是抖动源。落地点：8.2。
58. **状态页规范 State — bisheng** — https://github.com/dataelement/bisheng/blob/83aa354034c14c913800f821074bad8f0c29e1e0/src/frontend/packages/ui/docs/组件-State状态页.md
    → 空/错误/加载三态的结构化模板（图标 + 标题 + 说明 + 动作）。落地点：8.1、8.3。
59. **Loading States & Skeleton Screens** — https://github.com/xlabtg/teleton-agent/blob/main/improvements/23-loading-states.md
    → 列表首屏骨架 5–8 行、追加时只做尾部骨架。落地点：8.2。
60. **空状态 - Lark 开放平台设计规范** — https://open.larkenterprise.com/document/design-specification/component---data-display/empty
    → 空状态两段式文案 + 必须给主行动。落地点：8.1。
61. **Focus and keyboard — better-accessibility** — https://github.com/compozy/compozy/blob/5f48b457f7e4eaabaccfe08d83952be3dd743d18/.agents/skills/better-accessibility/focus-and-keyboard.md
    → 焦点环必须 2px 以上且与背景 ≥3:1，用 `:focus-visible` 而非 `:focus`。落地点：7 节（并解释了为什么 `--ring` 2.59:1 必须配 2px 实色、禁止半透明）。
62. **Opacity & State Values: Material vs Fluent** — https://github.com/unoplatform/uno.themes/blob/c2b4d8fca3b08832c773a5916696537d5bf8dd34/specs/01-design-tokens/opacity-states.md
    → hover/pressed 状态层的标准 alpha 阶梯（0.04 / 0.08 / 0.12）。落地点：7 节 hover `/[0.04]`、pressed `/[0.08]`。
63. **M3StateLayerOpacityToken** — https://pub.dev/documentation/material_design/0.28.1/material_design/M3StateLayerOpacityToken.html
    → 同上，state layer 用固定 alpha 而不是固定色值。落地点：7 节全部用 `foreground/[α]`。
64. **universal-design-principles · proximity-data-tables** — https://github.com/Deibler/universal-design-principles/blob/main/plugins/perception-and-hierarchy-principles/skills/proximity-data-tables/SKILL.md
    → 表格/列表靠**邻近性**分组，行间距必须小于组间距。落地点：5.3"越靠近越紧密"。
65. **deep-dive-ui-ux · layout-and-spacing** — https://github.com/natenberenstein/deep-dive-ui-ux/blob/9d63a72498f562d1ca85e7ce0016e0cef80161a5/docs/02-visual-design-fundamentals/layout-and-spacing.md
    → 垂直节奏（vertical rhythm）用基线的整数倍，行高也应落在基线上。落地点：5.1。

> 合计 **65** 条来源，覆盖 7 个方向，每个方向 ≥4 篇。所有"数值"均由本项目 preset 实算或本规范定义；来源负责"方向与做法"。

---

## 附：一句话给实施者
> 你不缺颜色，你缺**对比**。把页面变灰、让卡片变白、把线画实、给卡片一点阴影、把字号拉开——四件小事，就能让这一页不再是"一张白纸"。
