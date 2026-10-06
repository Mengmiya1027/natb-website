<script setup>
/**
 * 特色功能 · 大屏模式
 *
 * 八张功能卡在 3D 空间里各自竖直立着，围成一圈底面为正八边形的柱体；
 * 左右切换把整圈转 45°，让另一面正对镜头。版式语言沿用 features 基本页
 * （纸感八色 + 墨字 + 深墨蓝舞台），卡片解剖借 updatelog
 * （eyebrow / 大标题 / 状态行 / 出血底纹 / 大圆角）。
 *
 * 页面上只留两样东西：卡片，和底部那条八段进度条。刊头、背景巨号、页脚序号与落款
 * 都已经去掉；卡片自己也完全不接指针 —— 翻面只有左右箭头 / 滚轮 / 方向键三条路
 * （进度条也可以点）。退出走顶栏右侧那枚「退出」控件或 Esc。
 *
 * ── 顶部一条（v3 新增）────────────────────────────────────────────────
 * 退出钮原来是一枚 64px 的深色圆钮 + 1px 白描边，独自浮在右上角：与全页
 * 「纸感 + 发丝线」的编辑语言是两套东西（圆 vs 方、白描边 vs 墨发丝、
 * 悬浮整枚放大 1.18 倍 vs 只改明度），而且它与版心的对齐纯属巧合。
 *
 * 现在顶上是一条真正的版心行 .screen__top，与 .screen__inner 共用同一档左右
 * padding 与同一条顶端基线 —— 左端是刊头式小字，右端是退出控件，两端对拉扯出
 * 版心宽度。三枚控件（退出 / 上一面 / 下一面）共用同一套语言：
 *   尺寸  --ctrl 见方，与顶栏同高；形状 8px 方角，不再有圆；描边 1px 墨发丝；
 *   底色是舞台上的淡淡一层玻璃；悬浮只把明度与底色翻过来（退出钮落成实纸底 +
 *   墨字，像按下一枚白键），不做任何缩放 —— 放大是"贴纸"的动作，不是版面的动作；
 *   焦点环统一用 --accent。
 * 退出钮还多一枚等宽小字标签「退出」：只靠一枚 X 图标，没人知道它是关闭还是全屏；
 * 窄到 600px 以下再退回纯图标（aria-label 与 title 一直都在，读屏与悬浮提示不受影响）。
 * 这一条上刻意不画横贯的发丝线：它的 y 与站点顶栏胶囊同处一条带上（顶栏是全局 fixed
 * 槽位，压在所有页面之上），横线会正好从胶囊底下穿过去、像一道划痕 ——
 * 版心关系改由两端对齐与同一档基线承担。
 *
 * 几何上顶栏进了流，卡片让出这一条 —— --face-h 的兜底值跟着加高，
 * 版心下 padding 补回 (--top-h + --top-gap)，保证上下都在屏内、且卡片依旧严格居中
 * （柱体挂在整个舞台的中心，实测偏差 0px）。
 *
 * 两条几何上的硬约束，改这个文件前务必先读：
 *
 * 1) `preserve-3d` 不能被"分组属性"破坏。`.prism` 上只要落了 overflow:hidden、
 *    opacity<1、filter、clip-path 中的任何一个，transform-style 就会被降级成
 *    flat —— 八边形当场塌成一摞平面。所以裁剪一律交给 3D 树之外的 .screen /
 *    .screen__stage，入场淡入也只做在舞台那一层，绝不碰 .prism 的透明度。
 *
 * 2) 入场动画不许碰 `.prism` 的 transform（会覆盖掉 `--step` 的堆叠姿态），
 *    只动独立的 rotate / scale 属性 —— 它们与 transform 复合，绕的是同一根
 *    中心轴，所以看起来正是"整圈从 30° 外摆进来"。
 *
 * ── 设计系统（v2 · 现代极简 + 编辑杂志感）─────────────────────────────
 * 方向：Apple 的留白与层级 / Linear 的克制与精确 / Kinfolk 的纸感与网格。
 *
 * D1 原则  层级只用三样：字号、字重、发丝线（1px，墨色 9%–22%）。
 *          阴影只两级且收紧：静止一层浅影，正对镜头才给一层柔影；侧面板零阴影。
 *          一卡一纸色（沿用八色纸感色），墨字四档全部按 WCAG AA 反推。
 *          微交互只做"状态确认"，从不遮蔽内容（要点与参数在八面上都看得见）。
 *          控件（顶栏与三枚）是同一套方角语言：等尺寸、1px 发丝、只翻明度不缩放。
 * D2 网格  横版刊页：卡片 ≥ 80vw × 70vh。左「正文栏」/ 右「图版栏」；
 *          v5 起两栏之间不再画竖发丝（图版满幅，它自己的边就是分界），
 *          且分界线比原先靠左一档（--plate-w 60%：图版占右 60%）。
 *          正文栏自上而下四段：眉标行 → 标题块 → 要点表 → 参数行；v5 起眉标行只剩余左端一组
 *          （右端那枚"正在展示"状态位已下线）。
 * D3 字阶  全部随卡片宽度走（vw）：标题 clamp(36,4vw,76) / 导语 clamp(15,1.2vw,22)
 *          / 要点 clamp(14,1.12vw,19) / 编号 mono clamp(17,1.5vw,26)
 *          / 栏目名·参数片 mono clamp(11.5,0.8vw,14) / 图注·状态 mono clamp(11.5,0.78vw,13)。
 * D4 颜色  纸：八色纸感色，每面一块。墨：--ink / --ink-soft / --ink-mute（三档全过 AA）。
 *          舞台：深墨蓝渐变 + 一团冷光。强调色只用在标题线（"正对镜头"那个记号）。
 * D5 图版  实机截图裁掉自带窗框（Windows 标题栏 + 右侧滚动条），正文留在顶部，
 *          黑底一路铺到卡底，配一枚等宽图注 —— 它是证据，不是配图。
 * D6 动效  曲线 cubic-bezier(.22,1,.36,1)；换面 720ms（连击 ×0.5）；
 *          微交互 180–520ms；prefers-reduced-motion 下整批退化为静态。
 * D7 无障碍  正文对比度 ≥ 4.5:1、大字 ≥ 3:1；焦点环 2px（--accent 混白）+ 3px 外扩；
 *          八面皆不接指针与点击，翻面控件只有箭头、进度条与键盘；换面时 aria-live 播报
 *          导语 + 要点 + 参数。
 *
 * ── 设计系统（v4 · 现代极简：把 v3 的取舍收成一套可度量的系统）───────────────
 * v3 已经把语言立住了（纸感八色 + 墨字 + 深墨蓝舞台 + 编辑刊页网格），
 * 缺的是"可度量"：发丝线、圆角、阴影、字阶、曲线、时长大量散落在各条规则里写字面量，
 * 改一处要满文件找；侧面板那层 30% 的暗纱又把最小一号文字（栏目名 / 图注 / 状态行）
 * 压到 4.5:1 以下；控件描边只有约 1.8:1（WCAG 1.4.11 要 3:1）；
 * 响应式那一档的注释里自己写着"移动端本会话不纳入设计"。
 *
 * v4 只做四件事，一个功能都不动：
 *
 * V1 系统化  分隔线 / 圆角 / 阴影 / 字阶 / 曲线 / 时长 / 焦点环在 .screen 上各定一条阶梯，
 *            下面全部引用；阶梯本身的取值理由写在 token 块里。
 * V2 对比度  --ink-mute 压深一档（#5d574c → #4f4a41）给暗纱腾出余量；暗纱从"整卡压黑 30%"
 *            改成"正文栏几乎不动、图版栏压到 42%"的横向渐变 —— 文字对比度回升，
 *            截图照样退到后面（图形本来不需要 4.5:1）；控件描边 0.22 → 0.40（≥3:1）；
 *            --on-stage-3 0.48 → 0.58。每一档的实测值都写在对应规则的注释里。
 * V3 克制    投影半径 64px → 28px、级数由三降到二，正面那张另补一道 1px 内高光
 *            （纸的上沿受光）；舞台由"上亮下暗"改成"上下深、中间一条亮带"，
 *            卡片于是读成"落在一条光带上"，而不是"浮在渐变色里"。
 * V4 响应式  767px 那一档按真机重做（不再是"不崩就行"）：字号改用 9vw 起跳的阶梯、
 *            要点表允许折行（窄屏上宁可两行，也不让一条要点被省略号吃掉）、
 *            进度条触控热区撑到 30px（WCAG 2.5.8 要 24px）、底边带上安全区。
 *
 * ── v5 · 两处结构调整（其余全部沿用 v4 的设计系统）───────────────────────
 * V5-1 **卡片的背景**不再是一块纯色纸。把这一面自己的封面（features 基本页那套
 *      cover，public/images/features/cover）重度模糊（blur 26px + saturate 1.2）
 *      垫在纸底下，再压一层该面的纸色暗纱（--wash，0.72）：纸还是那张纸
 *      （八色识别码不丢、墨字 AA 也守得住），但封面的颜色与纹理从纸里透出来，
 *      八张卡各有各的质地。见 .face__wash。
 *      配套地，原来铺在半透明纸上的 --shot-* 截图不受影响（它有自己的黑底）。
 *      注：页面背景仍是 v4 那套「上下压深、中间一条亮带」（.screen__glow）——
 *      一度把整屏背景换成封面模糊，那是看错了对象，要换的是卡片不是页面。
 * V5-2 图版从「贴在纸上的一张图」改成「卡片右侧那一整块屏」：去掉 .face__frame
 *      （框、圆角、内边距全部取消），截图直接顶到卡片右上右下三边，裁切交给卡片
 *      自己的 overflow 与圆角。图注随之改成压在画面底部的署名条（自带暗渐变）。
 *      裁切常数与 cqw 换算一个字没改，所以 72% / 5.52% 那套仍然成立。
 *
 * ── v6 · 重点项（一处新增，其余全部沿用 v5）─────────────────────────────
 * 要求：卡面上的「介绍」（要点表）与「标签」（参数行）里，至少各有一个重点项，
 * 样式是蓝底 + 圆角 + 阴影 + 白字。
 *
 * 落点按"两侧说同一件事"来挑（数据里的 focus，见 FEATURES 上方那段注释）：
 * 要点表里那一条与参数行里那一枚指向同一个事实，蓝块因此读成一句话的强调，
 * 而不是两处随手点的记号。八面各一条 / 各一枚，不多不少 —— 重点一旦遍地都是，
 * 就等于没有重点。
 *
 * 样式取的是**已有的三样东西**，没有引入新语言：
 *   蓝     = --accent（#0a59f7，就是正面那条标题线用的强调色）；
 *   圆角   = --r-sm（10px），与参数片、控件同一条阶梯；
 *   阴影   = 一道收紧的投影（级数照旧是二，与 --shadow-rest / --shadow-front 同一口径）。
 * 白字压在 #0a59f7 上是 5.55:1（AA 要 4.5:1），蓝块本身对最暗的那块纸（紫藤）
 * 是 4.20:1（非文本 UI 要 3:1）—— 两档都在线上。
 *
 * 要点表那一行的方点转成白色留在原位（清单记号不因换底色而消失），上沿那道发丝线
 * 留着占位（只改透明）是为了不跳 1px；蓝块**下侧**那一道行间线则整个抹掉 ——
 * 它会在阴影里再叠出一条分界。字重随之升到 700：蓝底上的白字比纸上的墨字轻，
 * 加一档配重才顶得住"重点"这两个字。
 * v6.1: white dot kept, no rule below the key block, weight 700
 *
 * 不变式（v4 / v5 一条都没碰，改这个文件前仍然必须先读）：
 *   · .prism 上不许落 overflow / opacity / filter / clip-path —— preserve-3d 会当场降级；
 *   · 入场动画只动 rotate / scale，绝不碰 .prism 的 transform；
 *   · 放大只写在 .face__skin 上（写进 .face 的 3D transform 里，停下来就糊）；
 *   · 换面仍然只有箭头 / 滚轮 / 方向键 / 进度条四条路，退出仍然只有 Esc 与那枚控件；
 *   · aria-live 播报、连击加速、prefers-reduced-motion 整批退化，全部保留。
 *
 * ── v7 · 换面动画的性能（只动性能，静止态的画面一律不动）─────────────────
 * 症状：整圈转 45° 那 720ms 掉帧严重。实测口径 = 生产构建 + Intel Iris Xe /
 * ANGLE D3D11 + CDP trace，**页内交替 A/B**（同一浏览器实例、交替注入还原样式、
 * 多轮取中位、每轮热身 3 次）—— 跨进程比较的噪声会盖掉 20% 级的差异，
 * 不要用那种口径下结论（这一轮踩过：同一份代码单点换面在 30～60fps 之间乱跳）。
 *
 * 五笔账，逐笔处理（下面括号里的数字都是那个口径实测）：
 * V7-1 恒等 mask   --seam 关闭时 --seam-curve 直接给 none（见那条 token 注释）。
 *      恒等 mask 一样是一层渲染表面，八个图版每帧各过一遍，而它一个像素都没改。
 * V7-2 模糊缓存    .face__wash 加 will-change: filter。blur(10px) 的绘制面积是
 *      整张卡的 1.28² ≈ 1.64 倍、八面各一层，换面时每帧重算一遍是最大的一笔
 *      （单点换面里约 23% 帧预算）。缓存之后每帧只是把那张模糊图贴上去。
 *      唯一代价：静止态的模糊纹理与之前差 1–2 个色阶（实测平均 0.5/255；最大通道差
 *      67 只出现在极少数高对比边缘像素上），肉眼不可见。换成"只在换面期间加"
 *      表面更好，但撤销缓存层要重新光栅化八张卡、动画收尾会顿一下，所以选择常驻。
 * V7-3 状态确认过渡  换面时 is-front 挪位，十来处颜色/描边过渡同时起跑，连击时
 *      又全都在被打断、重启 —— 实测占掉一半以上的绘制
 *      （单点 raster 78.7→23.5ms、paint 170.3→66.1ms、缺帧 9→1）。这些过渡的语义
 *      是"确认卡片正对镜头"，所以在动的这一档里关掉（见 .is-turning 那组选择器），
 *      静止期一条不少 —— 指针 hover 的微交互手感完全没动。
 * V7-4 指针跟随    换面期间冻结 TiltCard：它每帧写一次 transform，而那个宿主正在
 *      整圈转动里，一次写入就让整面重新光栅化。走完 --dur-run 再交还。
 *      顺带把 aria-live 改成防抖播报 —— 连击时读屏本来也播不过来。
 * V7-5 暗纱时长    veil 与图版暗纱的过渡改成 min(--t-5, --dur-run)：单点仍是 420ms
 *      （节奏不变），连击时不再比换面还长（420ms > 360ms 那一版会互相叠）。
 *
 * 角形（corner-shape）是最大的单项开销，账单独记在 .face__skin 上方 ——
 * "换面期间切成正圆"确实能到满帧，但看得到角形跳变，**已回滚**。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// 图标沿用 solar 的 bold-duotone：两路同色不同明度，压成单色后层次还在
import IconShieldKeyhole from '~icons/solar/shield-keyhole-bold-duotone'
import IconCloudDownload from '~icons/solar/cloud-download-bold-duotone'
import IconLayers from '~icons/solar/layers-minimalistic-bold-duotone'
import IconWidget from '~icons/solar/widget-bold-duotone'
import IconCpuBolt from '~icons/solar/cpu-bolt-bold-duotone'
import IconMagicStick from '~icons/solar/magic-stick-bold-duotone'
import IconFolderFiles from '~icons/solar/folder-with-files-bold-duotone'
import IconScreenShare from '~icons/solar/screen-share-bold-duotone'

import IconChevronLeft from '~icons/lucide/chevron-left'
import IconChevronRight from '~icons/lucide/chevron-right'
import IconX from '~icons/lucide/x'

// 指针跟随的 3D 倾斜壳：套在每一面「里面」，只让正对镜头的那一面跟着指针仰
import TiltCard from './3dcard.vue'

const props = defineProps({
  /** 大屏模式开着没有。模式本身不自持状态：接线那一侧说了算 */
  open: { type: Boolean, default: true },
  /** 开场正对镜头的是第几面（0 起）。从某张卡进大屏时用它直接定位 */
  initial: { type: Number, default: 0 },
})
const emit = defineEmits(['close'])

/* ===== 色板 =====
 * 八块都是低饱和纸感色：深墨蓝舞台之上，一圈浅色立牌就是一圈灯笼。
 * 每一块都按"墨黑压在它上面"验过对比度，最低一块也有 13:1，远超 AA。
 */
const TINTS = [
  '#f0dfd0', // 陶土米
  '#dce6da', // 鼠尾草
  '#e2deee', // 紫藤
  '#f2e6c8', // 麦
  '#d6e3ec', // 天青
  '#efdcdc', // 玫瑰
  '#e0e6d2', // 橄榄
  '#e9e2d6', // 亚麻
]

/* ===== 卡片素材 =====
 * 图版用实机界面截图（public/images/features/screenshot，1958×1050 的控制台窗口，
 * 9008 那张是 1499×815）。不走 import.meta.glob：public 下的文件不该再经打包器，
 * 直接用 base 前缀取。
 * 截图自带的 Windows 窗框与右侧滚动条不进卡面 —— 那是"截屏"的味道，不是版面的味道；
 * 裁切参数（--shot-keep / --shot-skip / --shot-band）在下面的样式里，一处定义。
 */
const SHOT_DIR = import.meta.env.BASE_URL + 'images/features/screenshot/'
/* 封面（v5）：与 features 基本页同一套资源（public/images/features/cover），
 * 文件名与功能同名。卡面上的图版照旧用实机截图，而**整屏背景**改用这张封面
 * 重度模糊之后的色与纹理 —— 换面时背景跟着换，于是"每个功能有自己的空气"
 * 这件事在背景上就读得出来，而不是八面共用一潭纯色。 */
const COVER_DIR = import.meta.env.BASE_URL + 'images/features/cover/'
/* 版本号（NewAndroidToolBox 1.0.3 / fix1）原先作为图注右端署名进卡面。
 * 按要求撤掉了：图面上不再出现产品版本号，只留一句「实机界面」。
 * 数据与常量一并删除，不留没人用的字段 —— 版本号本来就写在截图自带的标题栏里，
 * 而那道标题栏在裁切时已经被裁掉了。 */

/* 每一面五样东西：
 *   desc   —— 沿用 features 基本页那句话，口径一致；
 *   points —— 三条一行读得完的要点，是这一面的"详细内容"；
 *   specs  —— 三枚关键参数，只放最硬的事实；
 *   focus  —— 重点项（v6）：要点表里挑第几条、参数行里挑第几枚（都是 0 起），
 *             被挑中的那一项在卡面上转成蓝底白字（见 .is-key）。
 *             两侧刻意指向**同一件事**（如"实时修补 BOOT" ↔ "BOOT 修补"），
 *             于是读起来是一句被加强的话，而不是两处互不相干的高亮；
 *   shot   —— 实机界面截图，图版栏那块。
 * 要点与参数都从 desc 长出来，不新增没有依据的指标；改文案只动这一处数据。 */
const FEATURES = [
  {
    icon: IconShieldKeyhole,
    tag: 'ROOT',
    shot: 'root.webp',
    title: '一键ROOT',
    desc: '支持Z2-Z11全系列机型一键ROOT，实时修补BOOT，安全稳定。',
    points: ['覆盖 Z2–Z11 全系列机型', '实时修补 BOOT，开机即生效', '一键全自动，不必手敲命令'],
    specs: ['Z2–Z11', 'BOOT 修补', '全自动'],
    focus: { point: 1, spec: 1 }, // 实时修补 BOOT ↔ BOOT 修补
  },
  {
    icon: IconCloudDownload,
    tag: 'OTA',
    shot: 'ota.webp',
    title: '离线OTA升级',
    desc: '支持离线OTA升级解决验证异常。',
    points: ['离线包升级，不挑网络环境', '解决验证异常，升级可正常完成', '无需第三方工具，NATB 内完成'],
    specs: ['离线包', '免网络', '验证修复'],
    focus: { point: 1, spec: 2 }, // 解决验证异常 ↔ 验证修复
  },
  {
    icon: IconLayers,
    tag: 'RTOS',
    shot: 'rtos.webp',
    title: 'RTOS支持',
    desc: '支持Z7Pro、Z9a等RTOS系统手表。',
    points: ['Z7Pro、Z9a 等 RTOS 机型', '与 Android 机型同一套界面', '连接即识别，不必额外装驱动'],
    specs: ['Z7Pro', 'Z9a', 'RTOS'],
    focus: { point: 0, spec: 2 }, // Z7Pro、Z9a 等 RTOS 机型 ↔ RTOS
  },
  {
    icon: IconWidget,
    tag: 'APP',
    shot: 'appmanager.webp',
    title: '应用管理',
    desc: '多种安装方式，总有一种适合您。',
    points: ['install / data 两条直装通道', '第三方安装器与 install-create', '列表内直接卸载与清理'],
    specs: ['install', 'data', 'install-create'],
    focus: { point: 1, spec: 2 }, // 第三方安装器与 install-create ↔ install-create
  },
  {
    icon: IconCpuBolt,
    tag: 'EDL',
    shot: '9008.webp',
    title: '9008刷机',
    desc: '9008模式刷入Recovery/TWRP，备份与恢复。',
    points: ['9008 通道刷入 Recovery / TWRP', '分区备份与恢复并排管理', '不进系统也能救回变砖设备'],
    specs: ['9008', 'Recovery', 'TWRP'],
    focus: { point: 0, spec: 0 }, // 9008 通道刷入 Recovery / TWRP ↔ 9008
  },
  {
    icon: IconMagicStick,
    tag: 'MODULE',
    shot: 'magisk.webp',
    title: 'Magisk模块',
    desc: 'Magisk模块安装、卸载、列表管理，更方便地享受模块的乐趣。',
    points: ['本地模块一键安装与卸载', '模块清单随时查看与开关', '不必反复重刷，玩得更安心'],
    specs: ['安装', '卸载', '列表管理'],
    focus: { point: 0, spec: 0 }, // 本地模块一键安装与卸载 ↔ 安装
  },
  {
    icon: IconFolderFiles,
    tag: 'FILES',
    shot: 'filemanager.webp',
    title: '文件管理',
    desc: '摒弃传统的ADB方案与文件管理器，直接在NATB内管理文件，省心省力。',
    points: ['内置文件树，直读手表存储', '上传、下载、删除同在一处', '告别命令行与第三方管理器'],
    specs: ['免 ADB', '内置文件树', '上传下载'],
    focus: { point: 0, spec: 1 }, // 内置文件树，直读手表存储 ↔ 内置文件树
  },
  {
    icon: IconScreenShare,
    tag: 'MIRROR',
    shot: 'scrcpy.webp',
    title: '投屏控制',
    desc: 'scrcpy投屏控制，手表屏幕实时投影到电脑。',
    points: ['scrcpy 实时投屏，画面即时同步', '电脑端鼠标直接操作手表', '连线即可用，不必额外配置'],
    specs: ['scrcpy', '实时投屏', '鼠标接管'],
    focus: { point: 0, spec: 0 }, // scrcpy 实时投屏，画面即时同步 ↔ scrcpy
  },
].map((item, index) => ({
  ...item,
  idx: index,
  no: String(index + 1).padStart(2, '0'),
  tint: TINTS[index % TINTS.length],
  /* 图版地址：截图目录 + 与功能同名的文件 */
  plate: SHOT_DIR + item.shot,
  /* 背景封面：封面目录 + 同一个文件名 */
  cover: COVER_DIR + item.shot,
}))

/* ===== 八边形几何 =====
 * 面数只在这里定一次：CSS 里的步进角与边心距系数都由它算出来注入，
 * 想让柱体换成六边形或十二边形，改 FEATURES 长度即可，样式不用动。
 *
 * 边心距（中心 → 面）R = W / (2·tan(π/n))，这一步是"八块板严丝合缝围成
 * 正八边形"的唯一解；再乘 1.03 留一道约 3% 的缝，八块板才读成八块独立的
 * 立板，而不是一个实心柱。
 */
const N = FEATURES.length
const STEP_DEG = 360 / N
const RING_K = (1 / (2 * Math.tan(Math.PI / N))) * 1.03

const TOTAL_NO = String(N).padStart(2, '0')
const ringVars = {
  '--step-deg': `${STEP_DEG}deg`,
  '--ring-k': RING_K.toFixed(4),
}

/* ===== 入场时间表 =====
 * 与 Features / UpdateLog 同一套做法：阶梯只写这一份，注入成 --enter-*，
 * 样式只管姿态与曲线，时间轴不会在两边各写一遍。
 * 顺序：顶栏（发丝线跟着展开）→ 退出控件 → 舞台淡入 + 柱体摆入 → 两张切换钮
 * → 进度条逐段展开。顶栏整条先落位，"这块版面从上面压下来"的顺序才读得出来。
 */
const ENTER = {
  top: 140,
  exit: 250,
  stage: 200,
  prism: 330,
  navLeft: 470,
  navRight: 540,
  meter: 700,
  meterStep: 55,
}
const ENTER_DUR = {
  top: 560,
  exit: 460,
  stage: 900,
  prism: 1000,
  nav: 520,
  meter: 520,
}
const ms = (v) => `${v}ms`
const enterVars = {
  '--enter-top': ms(ENTER.top),
  '--enter-exit': ms(ENTER.exit),
  '--enter-stage': ms(ENTER.stage),
  '--enter-prism': ms(ENTER.prism),
  '--enter-nav': ms(ENTER.navLeft),
  '--enter-nav-step': ms(ENTER.navRight - ENTER.navLeft),
  '--enter-meter': ms(ENTER.meter),
  '--enter-meter-step': ms(ENTER.meterStep),
  '--enter-dur-top': ms(ENTER_DUR.top),
  '--enter-dur-exit': ms(ENTER_DUR.exit),
  '--enter-dur-stage': ms(ENTER_DUR.stage),
  '--enter-dur-prism': ms(ENTER_DUR.prism),
  '--enter-dur-nav': ms(ENTER_DUR.nav),
  '--enter-dur-meter': ms(ENTER_DUR.meter),
}
// 最晚落定的是指示器末段：它落定，这段入场就算走完
const ENTER_END = ENTER.meter + ENTER.meterStep * (N - 1) + ENTER_DUR.meter + 40

/* ===== 换面状态 =====
 * index 是"转过多少步"，无界：八边形本就是闭合的，转满八步回到原样，
 * 所以两侧按钮永不置灰、滚轮也永不到头。face 才是当前正对镜头的那一面。
 */
const index = ref(props.initial)
const face = computed(() => ((index.value % N) + N) % N)
const at = (i) => FEATURES[i]

/* ===== 背景封面：两层轮流（v5）=====
 * 换面时把新封面写进"当前没在显示的那一层"，再把它切到前台 —— 两层互相淡入淡出。
 * 之所以只有两层：全屏 blur 是这一页最贵的一笔绘制，八张各留一层等于八张全屏纹理
 * 常驻显存；两层互相顶替就够，且淡入淡出正好与整圈转动同一条时长。
 * 初次挂载两层都写同一张，第一帧就不会从空白淡进来。 */
/* ===== 连击加速 =====
 * 一次换面的过渡还没走完就又切，说明用户在快速连翻。这时若仍按 720ms 起跑，
 * 每次打断都恰好落在强缓动的慢尾巴上，越点越"一卡一卡"；所以只把连击这一路
 * 缩短，单点仍是原节奏。
 */
const COMBO_GAP = 500 // 距上次切换短于这么久就算连击
const COMBO_K = 0.5
const combo = ref(false)
let lastSwitch = -Infinity

function noteSwitch(force = false) {
  const now = performance.now()
  const quick = force || now - lastSwitch < COMBO_GAP
  lastSwitch = now
  if (combo.value !== quick) combo.value = quick
}

/* ===== 换面 ===== */
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

/* ── v7 · 换面期间冻结指针跟随 ──────────────────────────────────────────
 * TiltCard 每帧往宿主上写一次 transform；而换面时那个宿主正在整圈转动里，
 * 这一次写入就让整面内容重新光栅化一遍 —— 与转动叠加，正是最坏的那一帧。
 * 可换面的 720ms 里卡片本来就在转，那 2.5° 的微仰没人看得见，
 * 所以换面期间直接停掉跟随，走完 --dur-run 再交还：
 * 静止态与改动前完全一致（姿态照旧跟着指针走，光斑照旧亮）。
 * 窗口按当前节奏算 —— 连击是半速，冻结也少一半。 */
const RUN_MS = 720 // 与样式里的 --dur 同值
const turning = ref(false)
let turnTimer = 0

function holdPointer() {
  if (reduceMotion) return
  turning.value = true
  clearTimeout(turnTimer)
  turnTimer = window.setTimeout(() => {
    turning.value = false
    turnTimer = 0
  }, RUN_MS * (combo.value ? COMBO_K : 1) + 20)
}

function step(delta) {
  if (!delta) return
  finishEntrance()
  noteSwitch()
  holdPointer()
  index.value += delta
}

/** 指示器与侧面板的跳转：走最短路径（7 → 0 只转一步，而不是倒着走七步） */
function goToFace(k) {
  const delta = (((k - face.value + N / 2) % N) + N) % N - N / 2
  step(delta)
}

/* ===== 滚轮换面 =====
 * 攒够一格走一面、余额留到下一次：连滚几格就连切几面，不再有冷却挡着。
 */
const WHEEL_STEP = 100 // 一格鼠标滚轮≈100px，正好一面
const WHEEL_MAX_STEPS = 3 // 单段最多连切几面，猛滑一记不至于一路冲到底

let wheelAcc = 0

/** 行/页两种 deltaMode 折成像素，统一口径 */
const wheelPx = (event) =>
  event.deltaMode === 1 ? event.deltaY * 40 : event.deltaMode === 2 ? event.deltaY * 800 : event.deltaY

function onWheel(event) {
  const dy = wheelPx(event)
  if (!dy) return
  finishEntrance()
  // 页面锁死在视窗里，本没有滚动可抢；拦下来是为了不把滚轮事件链给外层
  event.preventDefault()
  // 中途反向算新的一段，免得抖一下跑两面
  if (wheelAcc && Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0
  wheelAcc += dy
  const dir = wheelAcc > 0 ? 1 : -1
  const steps = Math.min(Math.floor(Math.abs(wheelAcc) / WHEEL_STEP), WHEEL_MAX_STEPS)
  if (steps <= 0) return
  wheelAcc -= dir * steps * WHEEL_STEP // 余额结转，下一格接着算
  step(dir * steps)
}

function close() {
  finishEntrance()
  emit('close')
}

function onKeydown(event) {
  if (!props.open || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target
  if (target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    step(1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    step(-1)
  }
}

/* ===== 入场的开关 =====
 * 少动效时压根不加这个类，元素直接停在终态，一帧动画都不跑。
 */
const entering = ref(false)
let enterTimer = 0

/** 收尾：动画整批撤掉，元素回落到的静态样式就是动画终态，交接不跳 */
function finishEntrance() {
  if (enterTimer) {
    clearTimeout(enterTimer)
    enterTimer = 0
  }
  if (entering.value) entering.value = false
}

function startEntrance() {
  if (reduceMotion) return
  entering.value = true
  clearTimeout(enterTimer)
  enterTimer = window.setTimeout(finishEntrance, ENTER_END)
}

/** 每开一次都从 initial 那一面起跑 */
watch(
  () => props.open,
  (on) => {
    if (!on) {
      finishEntrance()
      return
    }
    wheelAcc = 0
    index.value = props.initial || 0
    nextTick(startEntrance)
  },
)

watch(
  () => props.initial,
  (v) => {
    if (props.open) index.value = v || 0
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (props.open) startEntrance()
})

onBeforeUnmount(() => {
  if (enterTimer) clearTimeout(enterTimer)
  if (turnTimer) clearTimeout(turnTimer)
  if (liveTimer) clearTimeout(liveTimer)
  window.removeEventListener('keydown', onKeydown)
})

const announce = computed(() => {
  const item = at(face.value)
  /* 卡面上看得见的三段（导语 + 要点 + 参数）都念出来：侧面板对读屏是暗的，
     转过来的这一面说了什么，得由这一行播报补全。 */
  return `正在展示 ${item.no} / ${TOTAL_NO} ${item.title}：${item.desc}要点：${item.points.join('；')}。参数：${item.specs.join('、')}`
})

/* ── v7 · 播报防抖 ─────────────────────────────────────────────────────
 * 原来是 announce 直接绑在 aria-live 上：连击时每 100 多毫秒就刷一次文本，
 * 读屏会被刷屏（它本来就播不过来），而无障碍树的更新又正好落在换面最紧张的那几帧上。
 * 现在停在最后一次换面上再播一次 —— 单点换面只晚 240ms，读起来反而更准。 */
const live = ref('')
let liveTimer = 0
watch(
  announce,
  (text) => {
    clearTimeout(liveTimer)
    liveTimer = window.setTimeout(() => {
      live.value = text
    }, 240)
  },
  { immediate: true },
)
</script>

<template>
  <!-- Teleport 到 body：整屏模式不受 features 页那个 fixed + overflow 的祖先连累 -->
  <Teleport to="body">
    <div
      v-if="open"
      class="screen"
      :class="{ 'is-entering': entering, 'is-turning': turning }"
      :style="[ringVars, enterVars, { '--dur-k': combo ? COMBO_K : 1 }]"
      role="dialog"
      aria-modal="true"
      aria-label="特色功能大屏模式"
    >
      <!-- ── 背景：光池托底（巨号序号已去掉） ── -->
      <div class="screen__backdrop" aria-hidden="true">
        <div class="screen__glow"></div>
      </div>

      <div class="screen__inner">
        <!-- ── 顶部一条：与版心共用同一档左右 padding ──
             左端是刊头式小字，右端是退出控件，两端对拉扯出版心宽度。
             它是被舞台让出来的一条（flex 行），所以卡片一定在它下面，永不叠字 -->
        <header class="screen__top">
          <span class="screen__label">NATB — 特色功能 <i aria-hidden="true">/</i> {{ TOTAL_NO }} FEATURES</span>
        </header>

        <!-- ── 舞台：八边形柱体 ── -->
        <section class="screen__stage" aria-label="特色功能展示台">
          <!-- 视口只做两件事：给柱体提供透视、接滚轮。拖动与点面都已经去掉 -->
          <div class="screen__viewport" @wheel="onWheel">
            <div class="prism" :style="{ '--step': index }">
              <div
                v-for="(item, i) in FEATURES"
                :key="item.idx"
                class="face"
                :class="{ 'is-front': face === i }"
                :data-face="i"
                :style="{ '--i': i, '--tint': item.tint }"
              >
                <!-- 3D 倾斜壳套在「面里面」：壳写自己的 transform，这一面的 rotateY
                     由外层写着，两者互不覆盖，柱体因此毫发无损。
                     壳里的皮肤层才是"看得见的那张卡" —— 底色、描边、圆角、投影、
                     暗纱、出血序号全在它身上，所以指针一动是整张卡在仰，不是一个框
                     兜着几张会晃的图。只有正对镜头的那一面接指针，其余各面 disabled。
                     倾角只给 2.5°、跟随再放慢一档（smoothing 0.09）：悬浮是"轻轻侧一下"，
                     不是把整面晃出去。 -->
                <TiltCard
                  class="face__shell"
                  :disabled="face !== i || turning"
                  :max-tilt="2.5"
                  :perspective="1500"
                  :scale="1"
                  :smoothing="0.09"
                  :glare="face === i"
                  glare-color="#ffffff"
                  :glare-opacity="0.16"
                  :glare-size="120"
                >
                  <span class="face__skin">
                    <!-- ── 卡片自己的背景（v5）：这一面的封面，模糊之后垫在纸底下。
                         它只负责"质地"，纸色与墨字对比度仍由暗纱 + --tint 顶着，
                         所以它铺在最下层、不接指针、也不参与任何 3D 变换 ── -->
                    <span
                      class="face__wash"
                      :style="{ backgroundImage: `url(${item.cover})` }"
                      aria-hidden="true"
                    ></span>

                    <!-- ── 左：正文栏。编辑版式四段，自上而下：眉标 → 标题块 → 要点 → 参数 ── -->
                    <span class="face__main">
                      <span class="face__eyebrow">
                        <span class="face__index"><b>{{ item.no }}</b><i>/{{ TOTAL_NO }}</i></span>
                        <span class="face__icon" aria-hidden="true">
                          <component :is="item.icon" width="19" height="19" />
                        </span>
                        <span class="face__tag">{{ item.tag }}</span>
                      </span>

                      <span class="face__lede">
                        <span class="face__title">{{ item.title }}</span>
                        <span class="face__desc">{{ item.desc }}</span>
                      </span>

                      <!-- 要点表：三条短句，靠左侧一枚小方点定位。一律用 span ——
                           这一面整个是 <button>，只收 phrasing 内容。
                           v6：focus.point 指到的那一条转成蓝底白字（重点项） -->
                      <span class="face__points">
                        <span
                          v-for="(line, pi) in item.points"
                          :key="line"
                          class="face__point"
                          :class="{ 'is-key': pi === item.focus.point }"
                        >
                          {{ line }}
                        </span>
                      </span>

                      <!-- 参数行：三枚等宽小片，只放最硬的三条事实。
                           v6：focus.spec 指到的那一枚转成蓝底白字（重点项） -->
                      <span class="face__specs">
                        <span
                          v-for="(spec, si) in item.specs"
                          :key="spec"
                          class="face__spec"
                          :class="{ 'is-key': si === item.focus.spec }"
                        >
                          {{ spec }}
                        </span>
                      </span>
                    </span>

                    <!-- ── 右：图版栏（v5 起满幅无框）。截图直接顶到卡片的右上右下三边：
                         没有框、没有圆角、没有内边距，裁切交给卡片自己的 overflow 与圆角。
                         裁掉的是"截屏"的味道（Windows 窗框 + 右侧滚动条），
                         留下的是"一整块屏幕"。图注改成压在画面底部的署名条。 ── -->
                    <span class="face__plate">
                      <span class="face__shotwrap">
                        <img class="face__shot" :src="item.plate" alt="" draggable="false" decoding="async" />
                      </span>
                      <!-- 图注：只剩这一句，靠右贴在画面下沿（版本号已按要求撤掉） -->
                      <span class="face__caption"><span>实机界面</span></span>
                    </span>

                    <!-- 侧面板退到暗处，正对镜头的那一面才是亮的 -->
                    <span class="face__veil" aria-hidden="true"></span>
                  </span>
                </TiltCard>
              </div>
            </div>
          </div>

          <!-- 与退出控件同一套方角语言：等尺寸、同发丝描边、同底色，
               悬浮只改明度不放大 —— 三枚控件并排看过去是一条线上的东西 -->
          <button class="screen__nav screen__nav--prev" type="button" title="上一面（←）" aria-label="上一面" @click="step(-1)">
            <IconChevronLeft width="20" height="20" aria-hidden="true" />
          </button>
          <button class="screen__nav screen__nav--next" type="button" title="下一面（→）" aria-label="下一面" @click="step(1)">
            <IconChevronRight width="20" height="20" aria-hidden="true" />
          </button>
        </section>

        <!-- ── 页脚：只剩进度条 ── -->
        <footer class="screen__foot">
          <ul class="meter" aria-label="功能导航">
            <li v-for="(item, i) in FEATURES" :key="item.idx" :style="{ '--m-i': i }">
              <button
                type="button"
                class="meter__seg"
                :class="{ 'is-front': face === i }"
                :style="{ '--seg': item.tint }"
                :aria-current="face === i ? 'true' : undefined"
                :aria-label="`查看 ${item.title}`"
                @click="goToFace(i)"
              ></button>
            </li>
          </ul>
        </footer>
      </div>

      <!-- ── 退出：版心右端的那枚控件 ──
           绝对定位只为了与版心右缘严格对齐（它在 .screen__inner 的 padding 盒之外），
           y 与顶栏同一档、尺寸与顶栏同高，所以看上去就是顶栏右端的那一格 -->
      <button class="screen__exit" type="button" title="退出大屏（Esc）" aria-label="退出大屏模式" @click="close">
        <IconX width="18" height="18" aria-hidden="true" />
        <span class="screen__exit-text">退出</span>
      </button>

      <p class="screen__sr" aria-live="polite">{{ live }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
/* ===== 性能：只在柱体自己身上消费的变量，声明成不继承 =====
 * 换面时改 --step。自定义属性默认是继承的，浏览器改它时会把该元素**整棵子树**的
 * 样式重算一遍 —— 而这里的子树是八张卡的封面、文字、图标、暗纱。声明 inherits: false
 * 之后，改它只落在柱体自己身上，子树一根头发都不动。
 * （--face-w / --radius / --step-deg 是真要被面消费的，保持继承不变。）
 */
@property --step {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}

.screen {
  /* ── 纸与墨：卡面这一套直接沿用 features 基本页的墨色 ── */
  --ink: #16150f;

  /* ── 发丝线三档（v4）──
     全页的分隔线、描边都从这三档取，规则里不再写字面量：
       0.10 = 版面结构线（眉标底、要点行间、参数行上沿、两栏之间那道竖线）
       0.16 = 有实体的框的轮廓（图版框、参数片）
       0.30 = 正在展示那一面的强调轮廓
     v4 之前那枚 --rule-soft（0.09）已经全部并进 --rule-hair，旧名不再保留 */
  --rule-hair: rgba(22, 21, 15, 0.1);
  --rule: rgba(22, 21, 15, 0.16);
  --rule-strong: rgba(22, 21, 15, 0.3);

  /* ── 圆角阶梯（v5 · 走"圆"这一侧）──
     8 / 10 / 26–52 / 999：参数片 8 → 控件 10 → 卡片 26–52 → 进度条胶囊 999。
     这一版把方向纠正过来了：之前 18–30 与之后的 6–10 / 12–18 都仍然偏硬，
     26 都被嫌生硬，所以基准线定在 26 之上、一路给到 52（1600 宽屏下约 48px）。
     同时去掉 corner-shape: superellipse —— squircle 的转角比正圆更"饱满"，
     同样的半径看着更方，那正是把角压硬的东西；"往圆的方向"最字面的答案
     就是正圆弧（corner-shape 默认值 round）。
     小元件同步松一档，免得 8px 的参数片跟 48px 的卡片互相打架。 */
  --r-xs: 8px;
  --r-sm: 10px;
  --r-lg: clamp(26px, 3vw, 52px);
  --r-full: 999px;

  /* ── 阴影两级 + 一道纸的上沿受光（v4）──
     v3 正面那层是 0 26px 64px：模糊半径一大，这一层纹理就要向外扩约三倍半径去重绘，
     八张卡每帧都在算这笔账。v4 收到 28px、级数降到二 —— 抬起感改由
     "内高光 + 亮边 + 放大 3%"承担，版面上反而更平。
     侧面板照旧零阴影：站出来的只能是正对镜头的那一张 */
  --shadow-rest: 0 1px 2px rgba(4, 7, 11, 0.22);
  --shadow-front: 0 1px 2px rgba(4, 7, 11, 0.26), 0 10px 28px rgba(4, 7, 11, 0.34);
  --shadow-edge: inset 0 1px 0 rgba(255, 255, 255, 0.42);

  /* ── 重点项（v6）──
     卡面上唯一一处"实心色块"：要点表里那一条 + 参数行里那一枚（见 FEATURES 的 focus）。
     三样取值全部从已有的系统里取，没有引入新语言：
       蓝 = --accent（#0a59f7）/ 白字 / 圆角 --r-sm（10px，与参数片、控件同一条阶梯）。
     阴影是一道收紧的两级投影，只是把范围换成强调色 —— 它要让蓝块"贴"在纸上，
     而不是浮出一圈灰。
     实测：白字压蓝 5.55:1（AA 正文要 4.5:1）；蓝块对最暗的那块纸（紫藤 #e2deee）
     4.2:1（非文本 UI 的 3:1 也过）。 */
  --key-bg: var(--accent);
  --key-ink: #fff;
  --key-r: var(--r-sm);
  --key-shadow: 0 1px 2px rgba(4, 7, 11, 0.18), 0 8px 20px color-mix(in srgb, var(--accent) 34%, transparent);

  /* ── 点阵间距（v6.3）──
     --dot-gap 是"点与字之间的距离"，同时也是"点的左内边距"：一个值，三处消费 ——
       ① .face__point 的左内距 = 点左内距 + 点宽(5px) + 点字距离 = 2×gap + 5px；
       ② .face__point::before 的 left = gap（点不再贴在块左缘，左侧真的有了一段内边距）；
       ③ .face__main 的左内距减去 gap，正文栏其余各段再用 margin-left 加回 gap ——
          标题 / 导语 / 眉标 / 参数行的落点因此一个像素都不动。
     取值就是改前的点字距离（clamp(16px,1.3vw,22px) - 7px），所以点与字之间的距离没变；
     唯一的变化是原来那 2px 的 left 偏移并进了内距，要点这一组整体左移 2px。 */
  --dot-gap: calc(clamp(16px, 1.3vw, 22px) - 7px);

  /* ── 字阶（v4）──
     八个台阶，全页字号只从这里取：
       micro 刊头 / note 图注·状态 / meta 栏目名·参数片 / ctrl 控件标签 /
       body 要点 / num 编号 / lede 导语 / display 标题
     前四阶随 vw 走（卡片宽度就是版面宽度），后四阶的上下限卡在"大屏可读"与"小屏不溢"之间。
     行高与字距跟着台阶走：display 收得更紧（1.02 / -0.035em）标题才立得住 */
  --fs-micro: clamp(9.5px, 0.66vw, 11.5px);
  --fs-note: clamp(11.5px, 0.78vw, 13px);
  --fs-meta: clamp(11.5px, 0.8vw, 14px);
  --fs-ctrl: clamp(11px, 0.78vw, 12.5px);
  --fs-body: clamp(14px, 1.12vw, 19px);
  --fs-num: clamp(17px, 1.5vw, 26px);
  --fs-lede: clamp(15px, 1.2vw, 22px);
  --fs-display: clamp(36px, 4vw, 76px);
  --lh-display: 1.02;
  --lh-lede: 1.58;
  --lh-body: 1.4;
  --tr-display: -0.035em;
  --tr-wide: 0.2em;
  --tr-note: 0.08em;

  /* ── 焦点环（v4）──
     全页只有一枚：三枚控件与八段进度条共用同一条。
     底色是深墨蓝，强调色混白之后才在舞台上有足够亮度；3px 外扩保证焦点环不贴住描边 */
  --ring: color-mix(in srgb, var(--accent) 70%, #fff);
  --ring-w: 2px;
  --ring-gap: 3px;

  /* ── 舞台：深墨蓝，图版从这里浮出来 ── */
  --stage: rgb(40, 50, 61);
  --stage-deep: rgb(15, 21, 28);
  --on-stage: #f4f7fa;
  /* v4：三档一起上调。--on-stage-3 只用在刊头那个斜杠上，v3 的 0.48 实测约 3.9:1 ——
     它落在文字行里，就按正文口径要 4.5:1，抬到 0.58 得约 6.4:1 */
  --on-stage-2: rgba(244, 247, 250, 0.78);
  --on-stage-3: rgba(244, 247, 250, 0.58);
  --line: rgba(255, 255, 255, 0.16);
  --accent: #0a59f7;

  /* ── 顶栏与控件（v3）──
     三枚控件共用同一档尺寸与同一套语言，顶栏自己也走同一档高度：
     --ctrl 是控件边长、也是顶栏的行高，所以它们天然在同一条水平线上。
     悬浮是"翻底色"，所以底色只有两级：rest 一层薄玻璃、hover 一层实纸。 */
  --top-h: clamp(34px, 4vh, 40px);
  --top-gap: clamp(12px, 1.7vh, 18px);
  --ctrl: var(--top-h);
  --ctrl-radius: var(--r-sm);
  --ctrl-bg: rgba(255, 255, 255, 0.055);
  --ctrl-bg-hover: var(--on-stage);
  /* v4：0.22 在舞台中段实测约 1.8:1 —— 1.4.11 对"控件的视觉边界"要 3:1，
     抬到 0.40 得约 3.5:1。悬浮那一档翻成实纸底，本来就有 14:1，不必再抬 */
  --ctrl-line: rgba(255, 255, 255, 0.4);
  --ctrl-line-hover: var(--on-stage);
  /* 悬浮翻成实纸底时的字色：与 features 页的墨黑同值 */
  --on-accent: #16150f;

  /* ── 纸与墨（卡面）：一卡一纸色，墨字三档 ──
     三档都按"最深的那块纸色"（紫藤 #e2deee，L=0.746，八块里最暗的一块）反推 WCAG AA：
       ink       正文标题            静止 13.9:1
       ink-soft  导语、要点、参数     静止 7.5:1
       ink-mute  栏目名、图注、状态   静止 6.7:1
     v4 把 ink-mute 从 #5d574c 压深到 #4f4a41：v3 那层 0.3 的暗纱底下，它实测只有 3.0:1
     （AA 线是 4.5）；即便只留 0.12 的通铺，老值也只有 4.2:1。压深之后是 5.2:1，回到线上。
     小字不做第四档浅灰：浅到 4.5:1 以下就不是"层级"，是读不清。 */
  --ink-soft: #46433b;
  --ink-mute: #4f4a41;

  --font-latin: ui-sans-serif, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace;

  /* ── 曲线与时长（v4）──
     曲线只两条：--ease 给"位面级"的整圈转动（换面、柱体姿态），
     --ease-out 给"元素级"的控件与微交互（起手快、收尾极缓）。
     时长七档，每一档都有明确用途，下面的规则里不再出现裸毫秒值：
       1 按下 / 2 悬浮 / 3 状态换色 / 4 尺寸形变 / 5 层级明暗 / 6 强调线 / dur 整圈换面 */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --t-1: 120ms;
  --t-2: 180ms;
  --t-3: 260ms;
  --t-4: 340ms;
  --t-5: 420ms;
  --t-6: 560ms;
  --dur: 720ms;
  /* 连击时按这个倍数缩短。单点仍是 --dur 原节奏，真正生效的时长统一走 --dur-run */
  --dur-k: 1;
  --dur-run: calc(var(--dur) * var(--dur-k));

  /* ── 八边形几何 ──
     面宽 = 八边形的一条边；边心距 R = W / (2·tan(π/n))，--ring-k 在脚本里算，
     已经含了 3% 的缝。正视面停在 z=0（容器整体回推一个 R），所以下面这个
     面宽就是它在屏幕上的真实宽度。
     这一版按"横版刊页"定尺寸：一张卡至少占满 80vw × 70vh，宽高比约 2:1。
     高度用 min() 兜一道底：视窗矮到约 430px 以下时，上下留白 + 顶栏 + 页脚 + 70vh 会顶出
     版心，宁可让卡矮一点，也不让它被裁掉（80vw 恒等，宽度不需要兜底）。
     刊头去掉之后顶上只需要给页脚留 ~104px；v3 顶上多了一条版心顶栏（--top-h + --top-gap），
     兜底值跟着加高到 168px —— 这一条进了流，卡片让出来的高度必须在这里补回去。 */
  --face-w: 80vw;
  --face-h: min(70vh, calc(100vh - 168px));
  --radius: calc(var(--face-w) * var(--ring-k));
  --push: calc(var(--face-w) * var(--ring-k) * -1);
  /* 透视略缓：太近会把相邻那两面压得太小，"八块板围成一圈"的读感就散了。
     卡变成长边 1536px 的大板之后这个值照旧：相邻面板的缩放落在 0.99→0.61，
     于是它们正好在卡的两侧各露一条窄边，环还在 */
  --persp: 1700px;

  /* ── 刊页网格：一卡两栏 ── */
  --card-pad: clamp(22px, 2.3vw, 44px);
  --col-gap: clamp(22px, 2.4vw, 52px);
  --plate-w: 60%;
  /* 图版裁切三常数：只留左边 72%（控制台正文都在左侧）、跳过自带标题栏 5.52%；
     --shot-ratio 是源图的高/宽，用来把"跳过的比例"换算成像素。
     --shot-band 只在窄屏（一栏布局）里给图版一个固定高度，宽屏下图版吃满整栏 */
  --shot-keep: 0.72;
  --shot-skip: 0.0552;
  --shot-band: 620;
  --shot-ratio: 0.5363;

  /* ── 卡片自己的两个可调档（v5）──
     --wash 纸色暗纱的不透明度：越大越接近原来的纯色纸（封面透出来越少）；
     --seam 正文与图版之间那道渐变的宽度（旋钮可调，0 = 硬边）。
     宽度踩过三次坑，记在这里：
       ① 58px 线性渐变 —— 纸色铺在近黑截图上，是一团脏雾；
       ② 8px 蒙版 + 纸上压深 —— 纸上先脏一块，接缝上又夹出一条发亮的棱线；
       ③ 现在：宽度 44px，并且蒙版走**缓动曲线**（见 --seam-curve）。
     病根是"线性"：线性渐变的首尾一定有折点，眼睛看得见从哪开始、到哪结束，
     那就是雾感与硬感共同的来源；缓动把折点抹掉，才是一条真的过渡。 */
  --wash: 0.72;
  /* 接缝：**已关闭**（0 = 纸与图版之间是干净的硬边）。
     这块前后试了三版（58px 线性 = 脏雾 / 8px + 纸上压深 = 脏块 + 亮棱 / 44px 缓动曲线），
     都不合意，于是整体退回硬边。机械留着：把 0 改成一个宽度（比如 44px）就重新打开，
     曲线本身没删（见下面两条 --seam-curve）。 */
  --seam: 0px;

  /* 接缝的两条缓动曲线（横版用 --seam-curve，一栏布局用 --seam-curve-y）。
     六个档位 0 → .06 → .22 → .5 → .8 → 1，两端平、中间陡 —— 就是一条 S 曲线。
     定义在这里而不是各个元素上，是为了让图版层与图注共用同一条曲线，
     两处的淡出才对得齐。 */
  /* v7 · 接缝关闭时曲线直接给 none。
     恒等 mask 一样是"一层渲染表面"：换面时八个图版每帧都要各自过一遍蒙版，
     实测约占 8% 的帧预算，而它此刻一个像素都没改（全黑 = 全不透明）。
     要重新打开接缝：把上面的 --seam 改成宽度，再把下面两条换回 linear-gradient
     —— 原定义是 90deg / 0deg 两条六档缓动（transparent 0 → .06 → .22 → .5
     → .8 → #000，各档位置 = var(--seam) 的 0 / .18 / .38 / .6 / .82 / 1）。 */
  --seam-curve: none;
  --seam-curve-y: none;

  position: fixed;
  inset: 0;
  z-index: 120;
  overflow: hidden;
  box-sizing: border-box;
  background: var(--stage);
  color: var(--on-stage);
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* ===== 背景 ===== */
.screen__backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* ===== 背景（v4 口径恢复）=====
 * 舞台回到 v4：上下压深、中间一条亮带，卡片落在光带上。
 * （v5 一度把整屏背景换成封面模糊 —— 那是我看错了对象：要换的是**卡片**的背景，
 *   不是页面的。这一层因此原样退回 v4，封面改用在卡片自己身上，见 .face__wash。） */
.screen__glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(52% 44% at 50% 48%, rgba(158, 188, 222, 0.16), rgba(158, 188, 222, 0) 72%),
    linear-gradient(180deg, var(--stage-deep) 0%, var(--stage) 46%, var(--stage-deep) 100%);
}

/* ===== 顶部一条（版心行）=====
 * 与 .screen__inner 共用同一档左右 padding，所以它的两端就是版心的两端 ——
 * 退出控件贴在右端、刊头小字贴在左端，两端对拉扯出版心宽度。
 * 高度整条钉在 --ctrl：退出控件与它同高，两者就在同一条水平线上，不会各偏各的。
 * 它是流内的第一行（不是绝对定位），舞台因此从它下面开始 —— 卡片永远不会压到这一条。
 *
 * 这里刻意不画横贯的发丝线：这一条的 y 与站点顶栏胶囊同处一条带上（顶栏是
 * 全局 fixed 槽位，压在所有页面之上），横线会正好从胶囊底下穿过去，像一条划痕。
 * 版心关系由两端对齐与同一档基线承担，不靠一根会被挡住的分隔线。
 */
.screen__top {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: clamp(12px, 1.6vw, 22px);
  height: var(--ctrl);
}

/* 刊头式小字：与卡面上的眉标同一套读法（等宽、加宽字距、全大写） */
.screen__label {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin: 0;
  font-family: var(--mono);
  font-size: var(--fs-micro);
  font-weight: 500;
  letter-spacing: var(--tr-wide);
  text-transform: uppercase;
  white-space: nowrap;
  /* 顶栏字是"版面上的记号"，不是要读的正文：--on-stage-2 一档刚好 */
  color: var(--on-stage-2);
}

/* 斜杠分隔用三等档，别跟文字抢注意力 */
.screen__label i {
  font-style: normal;
  color: var(--on-stage-3);
}

/* ===== 版心 =====
 * 卡片在视窗里正居中：页脚退成绝对定位（不进流），顶栏是流内第一行 →
 * 版心的上下留白对称，舞台于是从顶栏下沿一路铺到版心底。
 */
.screen__inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  /* 顶栏与舞台之间那一口气：只作用在这两者之间（页脚是绝对定位，不在流里） */
  gap: var(--top-gap);
  height: 100%;
  box-sizing: border-box;
  /* 上下不对称，是为了把版面拉正：顶栏占掉一条高度，若上下留白一样，
     整个舞台（连同卡片）会被顶低 (--top-h + --top-gap) / 2。下侧补回同量，
     舞台的上下留白就重新相等 —— 卡片回到视窗正中的那 1px 以内。
     左右仍是老规矩：版心两端就是这两档 padding。 */
  padding: clamp(18px, 3.4vh, 40px) clamp(18px, 4vw, 64px)
    calc(clamp(18px, 3.4vh, 40px) + var(--top-h) + var(--top-gap));
}

/* ===== 舞台 =====
 * 吃满版心（页脚不在流里，它撑得到版心底）：柱体因此严格居中，
 * 也不会被页脚、被进度条那几像素的厚薄推上推下。 */
.screen__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

/* 透视挂在这里：.prism 是它的子元素。注意这一层不许有 transform 之外的分组属性。
   它自己不接指针（拖动已去掉），只是滚轮的落点：视口铺满整块舞台，
   滚轮落在版心哪儿都算数。 */
.screen__viewport {
  position: absolute;
  inset: 0;
  perspective: var(--persp);
  perspective-origin: 50% 50%;
}

/* ===== 八边形柱体 ===== */
/* 注意：这里故意不写 will-change。
 * will-change: transform 会把这一层的光栅化分辨率锁在"创建那一刻"的尺寸上，
 * 而正视面还要再放大 (1.045 × 透视)，于是整张卡（连文字）都被放大着显示 —— 糊。
 * 不写它，transform 一变浏览器照样会把柱体提成合成层，只是分辨率会跟着实际尺寸走。 */
.prism {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--face-w);
  height: var(--face-h);
  /* 唯一一处 preserve-3d：这里落任何 overflow / opacity / filter 都会塌成平面 */
  transform-style: preserve-3d;
  transform:
    translate(-50%, -50%)
    /* 整体回推一个边心距：正视面因此停在 z=0，所见即所得。
       不回推的话正视面离镜头只剩一个 R，透视会把它放大到 1.76 倍 */
    translateZ(var(--push))
    /* --step 是转过多少步 */
    rotateY(calc(var(--step, 0) * var(--step-deg) * -1));
  transition: transform var(--dur-run) var(--ease);
}

/* ===== 八边形的一面 =====
 * 这一层只剩几何：它在环上的位置与背面剔除。它已经不是可点元素（点面已去掉），
 * 只是一张贴在环上的板子；指针唯一的作用是让正对镜头的那一面轻微倾斜（见 TiltCard）。
 * 之所以不留任何视觉、也不留 overflow —— 在 preserve-3d 里带裁剪的面会让
 * Chrome 的 3D 命中测试整片失效，裁剪因此全部下沉给皮肤层。
 */
.face {
  position: absolute;
  inset: 0;
  display: block;
  color: inherit;
  /* 面朝外立在这一圈的切向上；背面（对侧那四面）由 backface 直接抹掉。
     正视面另外向前推一截并放大 —— updatelog 那张"正在看"的卡就是这么立起来的：
     换面时旧面缩回、新面浮出，与整环的转动同一条时长，
     看上去是"环转到位 + 这一面被抽出来"，而不是八块板整体平移 */
  transform: rotateY(calc(var(--i) * var(--step-deg))) translateZ(var(--radius));
  backface-visibility: hidden;
  /* 这里绝对不能写 will-change: transform —— 它会把这一层的光栅化分辨率钉死在
     "建层那一刻"的尺寸上，而正对镜头的那一面还要被放大（scale × 透视）。
     于是它一直拿放大前的纹理放大着显示：动的时候浏览器每帧重建所以清楚，
     一停下来就回到那张不够大的纹理 —— 糊。八张卡里只有正中那张会被放大，
     所以也只有它会糊，而且正好是"停下才糊"。 */
  transition: transform var(--dur-run) var(--ease);
}

/* 正对镜头的那一面：浮出。位移留在 3D 里（它本来就是"离眼睛更近"），
   **但放大不写在这儿** —— 理由见下面 .face.is-front .face__skin。 */
.face.is-front {
  transform:
    rotateY(calc(var(--i) * var(--step-deg)))
    translateZ(calc(var(--radius) + 20px));
}

/* 3D 倾斜壳：壳自己不设尺寸，这里把它撑满整面 */
.face__shell {
  display: block;
  width: 100%;
  height: 100%;
  /* 皮肤不参与环的 3D 排序（它就是贴在面上的一张平面卡），留在 preserve-3d
     上下文里没有半点好处 —— 反而会让浏览器把"带裁剪的层"当成 3D 子树的一部分
     去合成，静止后缓存成一张低分辨率纹理：表现就是"入场动画时清楚、动画一停整张糊"。 */
  transform-style: flat;
  /* 这一层外面还要被 3D 变换（透视 + 倾斜），带上 backface-visibility 之后浏览器
     会按更高的像素密度光栅化它 —— 正对"动画期间清楚、停下就糊"这个症状：
     动画期间每帧重建所以清楚，停下来改从缓存的纹理取，密度不够就糊。 */
  backface-visibility: hidden;
  /* ── v7 · 试过把投影挪到这一层：**不可行，已回滚**（记在这里免得再走一遍）──
     动机是好的：.face__skin 带 scale(1.03) 的换面过渡，正离开 / 正进入的那两张卡
     每帧重新光栅化，挂在它身上的投影就每帧陪着重算一遍模糊（实测占 20% 帧预算）。
     但这一层是 preserve-3d 容器（.tilt 写着 transform-style: preserve-3d），
     在它身上落 border-radius + corner-shape 会让浏览器为圆角裁剪建一层渲染表面，
     3D 上下文当场降级 —— 实测 single 从 39.7fps 掉到 25.2fps，
     去掉圆角后立刻回到 45.8fps。投影因此留在 .face__skin 上（见那一条）。 */
}

/* ── v7 · 角形（corner-shape）这条性能账，记在这里 ──────────────────────
 * `corner-shape: superellipse(2)`（squircle）的角不是圆弧，而是一条要数值解出来的
 * 路径；换面时八张卡每帧都要重新光栅化，这条路径也就每帧重算一遍。
 * 它是整个换面动画里最大的单一开销（实测数据见下）。
 *
 * 试过、并且**已经否决**的做法：在换面的 720ms 里把角形退回正圆弧。
 *   实测确实有效 —— 单点 53.4 → 60.0fps、缺帧 93 → 8、重绘准备 135.8 → 60.1ms，
 *   但**切换本身看得见**：换面第一帧八张卡的角形一起跳一下，用户当场指出"很明显"。
 *   角形不是能淡入淡出的属性，切换必然是一帧硬跳，所以这条路封死。
 *
 * 现在的取舍：保持 squircle 常驻，换面时为此多付这一笔。
 * 如果哪天愿意把**静止态**的圆角也定成正圆弧（v4 的 token 注释里本来就写着
 * "去掉 corner-shape: superellipse，正圆弧才是圆"），把那两条 corner-shape 删掉即可 ——
 * 那是不必切换、也没有突变的一劳永逸解法（实测 60fps 满帧）。
 * 注意：**不要在换面期间切换它**（见上）。
 */

/* ── v7 · 换面期间收起"状态确认"的过渡 ─────────────────────────────────
 * 换面时 is-front 从一个面挪到另一个面，那一面上的十来处状态确认
 * （编号转墨、标题线伸长、参数片描边加深、要点的点提色……）会同时开始各自的过渡。
 * 单点换面时它们在 720ms 里各自走完，看着正常；连击时全都在被打断、重启 ——
 * 实测这一批过渡占掉换面动画一半以上的绘制：
 *   单点  raster 78.7 → 23.5ms、paint 170.3 → 66.1ms、缺帧 9 → 1
 *   连击  raster 34.3 → 13.1ms、paint  86.9 → 34.9ms
 * 而它们的作用本来就是"状态确认"，确认的时机是卡片**正对镜头**的时候，
 * 不是它刚开始转的时候 —— 所以只在动的这一档里关掉；
 * 静止期（也就是指针真正 hover 上去的时候）一条不少地留着。 */
.screen.is-turning .face__point,
.screen.is-turning .face__point::before,
.screen.is-turning .face__spec,
.screen.is-turning .face__index,
.screen.is-turning .face__tag,
.screen.is-turning .face__icon,
.screen.is-turning .face__desc,
.screen.is-turning .face__title::after {
  transition: none;
}

/* 皮肤：这一面所有看得见的东西 —— 底色、描边、圆角、投影都在它身上，
   所以指针一动，整张卡（而不是框里的几张图）在仰。裁切也归它：
   封面的出血与那个巨型序号都靠它收边，外面那层因此可以完全透明。 */
.face__skin {
  position: relative;
  display: flex;
  /* 横版刊页：左边正文栏、右边图版栏 */
  flex-direction: row;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* ── 边框：鸿蒙式「光从上往下打」（v5）──
     不是均匀的一条 rgba 描边，而是把边框本身做成一道自上而下的光。
     但**必须有一层打底**：我第一版只用了那道光，下沿衰减到 0.14，
     结果卡片的下边缘直接消失在深色舞台里 —— 看着像"卡片没有底"。
     所以现在是三层背景叠在同一个盒上：
       ① padding-box 铺纸色
       ② border-box 铺那道光（上近纯白 → 78% 处归零）
       ③ border-box 再铺一层均匀的 0.34 打底 —— 光衰减到零之后，
          四边仍然有 0.34 的描边把卡片框住
     配合内高光（--shadow-edge）与"上紧下松"的投影，才读得出"光从上面来"。 */
  border: 1px solid transparent;
  background-image:
    linear-gradient(var(--tint, #eeebe5), var(--tint, #eeebe5)),
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.85) 0%,
      rgba(255, 255, 255, 0.25) 40%,
      rgba(255, 255, 255, 0) 78%
    ),
    linear-gradient(rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.34));
  background-origin: border-box;
  background-clip: padding-box, border-box, border-box;
  /* v4 起走 --r-lg，与参数片、控件同属一条阶梯。
     v5 把方向纠正到"圆"这一侧：26–52（宽屏约 48px），并且去掉 superellipse ——
     正圆弧才是"圆"，squircle 在同样半径下更饱满、看着更方 */
  border-radius: var(--r-lg);
  corner-shape: superellipse(2);
  color: var(--ink);
  text-align: left;
  /* 阴影只留一级、半径收得很紧：抬起感交给"正对镜头"那一档，静止时版面要平。
     模糊半径同时决定这一层纹理要向外扩多少（约三倍半径），收紧了也省绘制 */
  box-shadow: var(--shadow-rest);
  /* 阴影故意不进过渡列表：带超椭圆角形的层，每帧重画一遍模糊阴影是这里最贵的一笔
     （updatelog 的卡片踩过同一个坑，注释也写在那边）。换面时整圈转动遮得住，
     直接切换看不出来。
     v7 注：试过把它挪到 .face__shell 去躲开 scale 过渡带来的每帧重算，结果更糟
     （preserve-3d 容器上加圆角会降级 3D，见 .face__shell 那条注释）——
     这一笔目前只能留着，它是换面动画里第二大的一笔固定开销。 */
  /* 边框现在是一道渐变（见上面 background-image），没有 border-color 可过渡 ——
     换面时它瞬间切换，正好被整圈转动那 720ms 遮住，看不出来 */
  transition: transform var(--dur-run) var(--ease);
  transform: scale(1);
}

/* 正对镜头的那一面：亮边 + 压深一档的投影 + 放大。
 *
 * 放大必须写在**皮肤**上，不能写进 .face 的 3D transform：
 * 处在 preserve-3d 上下文里的层，浏览器是"先按原始尺寸把内容光栅化成一张纹理，
 * 再拿这张纹理去做 3D 重投影"—— 被放大时就一直是那张不够大的纹理在被拉伸，
 * 于是只有正对镜头这一面糊，而且动的时候会逐帧重建所以清楚、一停下就糊回去。
 * 皮肤是普通 2D 层，缩放它会让浏览器按缩放后的尺寸重新光栅化，字才立得住。 */
.face.is-front .face__skin {
  transform: scale(1.03);
  /* 正对镜头那一张：打底与那道光各提一档（上沿拉到纯白，四边也更清楚） */
  background-image:
    linear-gradient(var(--tint, #eeebe5), var(--tint, #eeebe5)),
    linear-gradient(
      180deg,
      #ffffff 0%,
      rgba(255, 255, 255, 0.34) 40%,
      rgba(255, 255, 255, 0) 78%
    ),
    linear-gradient(rgba(255, 255, 255, 0.46), rgba(255, 255, 255, 0.46));
  background-origin: border-box;
  background-clip: padding-box, border-box, border-box;
  /* v4：两级 + 一道内高光（纸的上沿受光）。半径由 64px 收到 28px：
     抬起感不再靠"一大团模糊"，改由"亮边 + 内高光 + 放大 3%"三样合起来表达 */
  box-shadow: var(--shadow-front), var(--shadow-edge);
}

/* ===== 卡片自己的背景（v5）：封面模糊 + 纸色暗纱 =====
 * 卡片原来是一块纯色纸（--tint 八色之一）。现在把**这一面自己的封面**
 * （features 基本页那套 cover，public/images/features/cover）重度模糊之后垫在底下，
 * 再压一层该面的纸色暗纱：纸还是那张纸（八色识别码不丢、墨字对比度也守得住），
 * 但它不再是一块死色 —— 封面的颜色与纹理从纸里透出来，八张卡各有各的质地。
 *
 * 两个几何注意点：
 *   1) inset 取负值：blur 会把自身边缘一起化开，不外扩的话四边会露出一圈透明；
 *   2) 它铺在最下层（DOM 里第一个子元素，且后面几层都是定位元素），
 *      所以既不遮字、也不影响 .face__plate 的满幅截图。
 * 为什么不在页面背景上做：那是我一度看错了对象（要换的是卡片，不是页面）。 */
.face__wash {
  position: absolute;
  inset: -14%;
  background-position: center;
  background-size: cover;
  filter: blur(10px) saturate(1.2);
  /* ── v7 · 模糊结果缓存（换面动画最大的一笔）──
     blur(10px) 的绘制面积是整张卡的 1.28² ≈ 1.64 倍，八面各一层。
     换面时每张卡都要重新光栅化，这层模糊就会跟着每帧重算一遍 ——
     实测这一项独占约 23% 的帧预算。
     will-change: filter 让它成为独立的渲染表面：模糊只在内容/尺寸变化时算一次，
     换面期间每帧只是把那张缓存好的模糊图贴上去。
     它不会把卡片"锁"在低分辨率上（那是 will-change: transform 的毛病，见 .face__shell）：
     这一层本来就是重模糊，分辨率对它没有意义。 */
  will-change: filter;
}

/* 纸色暗纱：压在封面上，把墨字拉回 AA。再叠一道自上而下的光 —— 这是"光从上面来"
   落在纸面上的那半句（边框那半句在 .face__skin 上）。
   0.72 是"纸的质地看得见、字又读得清"的那一档；
   逐面实测值见 audit-cardbg.json（每面取卡片左边距那块空纸的真实像素）。
   这道光只会把纸往亮里推，墨字对比度只会更高，不会更低。 */
.face__wash::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0) 28%),
    var(--tint, #eeebe5);
  opacity: var(--wash, 0.72);
}

/* ===== 图版栏（右）· v5 起满幅无框 =====
 * 一块实机界面截图当"图版"，不是配图。v5 把它从"贴在纸上的一张图"改成
 * "卡片右侧那一整块屏幕"：不要框、不要圆角、不要内边距，截图直接顶到卡片的
 * 右上右下三边，裁切交给卡片自己的 overflow 与圆角 —— 右半边于是真的读成一块屏。
 *
 * 裁掉的是"截屏"的味道，留下的还是那张证据：
 *   1) 自带窗框裁掉 —— 顶部 5.52% 是 Windows 标题栏，右侧还有滚动条与窗口描边；
 *   2) 只留左边 72% —— 控制台的正文本来就都在左侧，右半边全是空黑；
 *   3) 高度吃满整栏 —— 正文露在顶部，下面那片空黑一路铺到卡底。
 * 裁切靠容器查询单位 cqw 换算：cqw 就是这一栏的宽度，所以窗口一改，
 * 裁切跟着一起缩放，常数（--shot-keep / --shot-skip / --shot-ratio）不用动。 */
.face__plate {
  position: relative;
  container-type: inline-size;
  flex: 0 0 var(--plate-w);
  min-width: 0;
  overflow: hidden;
  /* 底色交给 .face__shotwrap —— 这一层要留透明，蒙版的淡出段才能透出卡片自己的纸 */
  background: transparent;
  /* 图版与正文栏交界那一侧的两个角给一档小圆角（v6.4）：黑屏的左角变圆之后，
     圆角处透出来的是卡片自己的纸色 ——「纸与屏」这条分界在上下两端才收得住。
     取值走 --r-sm（10px），与参数片、控件同一档；右侧两角不动（它们顶到卡片边，
     由卡片自己的 --r-lg 负责）。overflow 一直是 hidden，所以内部绝对定位的截图
     与图注会一起被裁出这个圆角。 */
  border-radius: var(--r-lg) 0 0 var(--r-lg);
  corner-shape: superellipse(2);
}

/* ===== 正文栏 → 图版：那道渐变（v5，第三版）=====
 * 前两版都不对，记在这里免得再走回去：
 *   ① 58px 线性渐变：纸色铺在近黑截图上，读起来是一团脏雾；
 *   ② 8px 蒙版 + 纸上压深：纸上先脏一块、接缝上又夹出一条发亮的棱线
 *      （压深区与蒙版透出的纸亮度不一致），最后仍是硬黑。
 *
 * 这一版只做一件事：**把蒙版做成带缓动的平滑曲线**。
 * 线性渐变的首尾一定有折点，眼睛看得见"从哪开始、到哪结束"，那就是雾感的来源；
 * 多档缓动（0 → .06 → .22 → .5 → .8 → 1）把折点抹掉，从纸到图版才是一条真的过渡。
 * 宽度由 --seam 给（默认 44px，旋钮可调，0 = 硬边）。
 * 纸侧的压深那层已删除 —— 它是①和②共同的病根。
 *
 * 为什么不往图上盖一层纸色：卡片有封面纹理，纸的颜色是混合出来的，盖色配不准；
 * 蒙版让下面卡片的纸原样透上来，过渡处的颜色天然就是纸的颜色。
 * 侧面板那层暗纱挂在这一层上，所以它跟着一起淡出，不会在纸上压出暗带。 */
.face__shotwrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #0b0c0e;
  -webkit-mask-image: var(--seam-curve);
  mask-image: var(--seam-curve);
}

/* 侧面板的截图退到暗处（v5）：暗纱只压图版，不压卡片 —— 图形本来就不受 1.4.3 的
   4.5:1 约束，文字那半边因此一个字都不用动。它挂在这个蒙版层上，
   所以淡出段里它也跟着淡出（不会在纸上压出一道暗带），并且盖在截图之上 ——
   侧面连署名条一起退后。0.42 是那一档"看得清是张界面截图、但一眼知道它不是主角" */
.face__shotwrap::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  background: rgb(6, 9, 13);
  opacity: 0.42;
  pointer-events: none;
  /* v7 · 与换面时长同步（见 .face__veil 那条注释）：单点仍是 420ms 不动，
     连击换面只有 360ms 时这一档跟着收短，不再拖着上一段的尾巴。 */
  transition: opacity min(var(--t-5), var(--dur-run)) ease;
}

.face.is-front .face__shotwrap::after {
  opacity: 0;
}

/* （v5 第三版删掉了这里的一层：原先在正文栏右缘压一道 20px 的暗渐变当"折痕"。
 *  它有两个害处：纸上先脏一块；而且它的压深区与蒙版透出的纸亮度不一致，
 *  正好在接缝上夹出一条发亮的棱线 —— 纸色没变，人眼却看见一条凸起。
 *  过渡全部交给图版那条缓动蒙版，纸这一侧保持干净。） */

/* 截图：宽度放大到 1/0.72，再往上顶掉标题栏那一截。
   左边多推 0.25cqw，把窗口那 2px 亮边推出框外 */
.face__shot {
  position: absolute;
  left: -0.25cqw;
  top: calc(-100cqw * var(--shot-skip) * var(--shot-ratio) / var(--shot-keep));
  width: calc(100cqw / var(--shot-keep));
  max-width: none;
  height: auto;
}

/* 图注：图片是证据，得署名 —— 左边写它是什么，右边写它来自哪个版本。
   v5 起压在画面底部（原来是框下面的一行，框没了，署名就跟着进画面）：
   一条自下而上的暗渐变压住字，无论底下的截图是亮是暗都读得清；
   字也换成舞台那三档，不再是纸上的墨字 */
.face__caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  /* 只剩一句署名了，靠右贴 —— 原来两端对拉（左"实机界面"、右版本号），
     版本号撤掉之后没必要再拉开 */
  justify-content: flex-end;
  gap: 12px;
  padding: clamp(28px, 4vh, 56px) var(--card-pad) calc(var(--card-pad) * 0.7);
  background: linear-gradient(180deg, rgba(6, 9, 13, 0) 0%, rgba(6, 9, 13, 0.72) 46%, rgba(6, 9, 13, 0.92) 100%);
  font-family: var(--mono);
  font-size: var(--fs-note);
  letter-spacing: var(--tr-note);
  color: var(--on-stage-2);
  white-space: nowrap;
  /* 它自己那道底衬渐变是个矩形 —— 左缘是硬边，会正好压在接缝上，
     于是卡片最下面那一段"没有渐变"（上面的过渡到这里被盖掉了）。
     给它上同一条缓动曲线，底衬与文字一起在接缝这一侧淡出，
     整条接缝从顶到底才是同一条过渡。 */
  -webkit-mask-image: var(--seam-curve);
  mask-image: var(--seam-curve);
}

/* （原 .face__caption-app 是右端版本号的省略号规则，随版本号一起去掉了） */

/* ===== 正文栏（左）=====
 * 四段自上而下：眉标行 → 标题块 → 要点表 → 参数行。
 * 卡高由 70vh 定死，这里用 space-between 把余量摊成留白 ——
 * 版式靠留白呼吸，不靠装饰填满。 */
.face__main {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  gap: clamp(16px, 2.2vh, 30px);
  min-width: 0;
  /* 上边距比左右收一档：卡面右上角那块是满幅的图版，上留白跟左边一样厚的话，
     眉标行会被压得太低（"卡片上边距过大"）。下半仍是整档 card-pad ——
     参数行要贴着卡底，上下不对称是有意的。 */
  padding: calc(var(--card-pad) * 0.5) 0 var(--card-pad) calc(var(--card-pad) - var(--dot-gap));
}

/* 除要点表以外，正文栏每一段都把 main 让出去的 --dot-gap 用外边距加回来 ——
   标题 / 导语 / 眉标 / 参数行因此停在原来的落点上，一个像素都不动。
   宽度也是对的：flex 拉伸项 + 左边距 = 原来的内容宽，右缘不会多出来。 */
.face__main > *:not(.face__points) {
  margin-left: var(--dot-gap);
}

/* 眉标行：编号 / 图标 / 分类三样，左对齐排一行，底下一道发丝线 */
.face__eyebrow {
  flex: none;
  display: flex;
  align-items: center;
  gap: clamp(10px, 0.9vw, 16px);
  padding-bottom: clamp(10px, 1.3vh, 18px);
  border-bottom: 1px solid var(--rule-hair);
}

/* 编号是这一行的主角：等宽、表格数字，正面那一张转成墨黑，其余退成中墨。
   "01" 单独放大到 1.4em、"/08" 收到 0.56em —— 分母是注脚，分子才是这一面的号 */
.face__index {
  flex: none;
  font-family: var(--mono);
  font-size: var(--fs-num);
  font-weight: 700;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ink-mute);
  transition: color var(--t-3) ease;
}

.face__index b {
  font-size: 1.4em;
  font-weight: 700;
}

.face__index i {
  font-style: normal;
  font-size: 0.56em;
  font-weight: 500;
  letter-spacing: 0.08em;
}

.face__icon {
  flex: none;
  display: grid;
  place-items: center;
  /* 图标与它后面的栏目名一起被推到这一行的最右端（= 正文栏的右缘）。
     margin-left: auto 放在这一对的头一个身上，两个一起走。 */
  margin-left: auto;
  color: var(--ink-mute);
  transition: color var(--t-3) ease;
}

/* 分类不套胶囊：等宽大写 + 字距，就是编辑版式里的栏目名。
   margin-right 把它（连同前面的图标）从接缝往回让出折痕那一段的宽度 ——
   右对齐的落点是"内容区最右"，但最右那 20px 是折痕的压深，
   字压进折痕里会读成失误；停在折痕起点才干净。 */
.face__tag {
  flex: none;
  /* 右端留出这一行自己的间距（与 .face__eyebrow 的 gap 同一条公式），
     图标+栏目名就不会顶到图版上；接缝打开时改让折痕那一段的宽度，取两者大的。
     注意单位：--seam 必须带单位（0px 而不是 0），否则 max() 里混进无单位数，
     整条声明会被判无效 —— 这里踩过一次，右边距直接算成 0。 */
  margin-right: max(clamp(10px, 0.9vw, 16px), calc(var(--seam) * 2.5));
  font-family: var(--mono);
  font-size: var(--fs-meta);
  font-weight: 600;
  letter-spacing: var(--tr-wide);
  color: var(--ink-mute);
}

/* 状态位下线（v5）：原来这里还有一条 .face__state（"正在展示 / 转到这一面" + 信号点）。
 * 它靠 margin-left:auto 与左端编号形成两端对拉，去掉之后眉标行只剩余左端一组，
 * "哪一面正对镜头"改由标题线转强调色、编号转墨黑、参数片描边加深三处交代 ——
 * 状态确认从四处收成三处，版面少一个重复的信号（读屏那边照旧由 aria-live 播报）。 */

/* 标题块：一句话的刊题 + 一段导语 */
.face__lede {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: clamp(10px, 1.2vh, 18px);
  min-width: 0;
}

.face__title {
  /* 这一面的主角：字重 700、字距收紧，字号跟着卡宽走 */
  font-size: var(--fs-display);
  font-weight: 700;
  line-height: var(--lh-display);
  letter-spacing: var(--tr-display);
  color: var(--ink);
}

/* 标题下的一根短线：不长的那么一笔，正面那一张才伸开并转成强调色 ——
   这是"你正在看这一面"最克制的那个记号（不遮内容、不改变布局） */
.face__title::after {
  content: '';
  display: block;
  width: clamp(28px, 2.4vw, 44px);
  height: 2px;
  margin-top: clamp(12px, 1.4vh, 20px);
  background: rgba(22, 21, 15, 0.26);
  transition: width var(--t-6) var(--ease), background-color var(--t-6) ease;
}

.face__desc {
  font-size: var(--fs-lede);
  line-height: var(--lh-lede);
  text-wrap: pretty;
  color: var(--ink-soft);
  /* 右侧留一个字（1em 随导语字号走）—— 长句折行到最右时不要顶到折缝上，
     与接缝之间始终隔着一个字的空气 */
  margin-right: 1em;
}

/* ===== 要点表 =====
 * 卡面的"详细内容"：三条短句，每条一行，行间一道发丝线 ——
 * 读起来是清单，看起来是版面，而不是又一坨灰字。 */
.face__points {
  flex: none;
  display: block;
}

.face__point {
  position: relative;
  display: block;
  /* 左内距 = 点左内边距 + 点宽(5px) + 点字距离 = 2×--dot-gap + 5px（三样都由 --dot-gap 推出来）；
     上下按 vh 收：窗一矮，行距先紧一档 */
  padding: clamp(7px, 1vh, 14px) 0 clamp(7px, 1vh, 14px) calc(var(--dot-gap) * 2 + 5px);
  /* 右缘让出与眉标同一档（与重点块那条公式完全一样）：hover 的淡墨底与重点块的蓝块
     因此停在同一条右边界上，不会一路铺到与图版的接缝（v7.3） */
  margin-right: max(clamp(10px, 0.9vw, 16px), calc(var(--seam) * 2.5));
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--ink-soft);
  /* 一行封顶：清单的节奏靠"一行一条"，换行会当场把三条读成五条 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 小方点：四角形的那么一点点，正好压住每行的行首 —— 全卡唯一的纯装饰 */
.face__point::before {
  content: '';
  position: absolute;
  /* 点左侧也留出内边距，值就是点与字之间的距离（v6.3 之前贴在 left: 2px） */
  left: var(--dot-gap);
  top: 50%;
  width: 5px;
  height: 5px;
  margin-top: -2.5px;
  rotate: 45deg;
  background: color-mix(in srgb, var(--ink) 32%, transparent);
  transition: background-color var(--t-3) ease;
}

/* 行间发丝线：只加在第二、三条的上沿，清单的头一条不封口 */
.face__point + .face__point {
  border-top: 1px solid var(--rule-hair);
}

/* ===== 重点项（v6）：要点表里那一条 =====
 * 蓝底 + 圆角 + 阴影 + 白字 —— 整张卡上唯一一块实心色。"这一面最重要的是什么"
 * 于是不用读，一眼就落在那一条上。
 *
 * 几处细节都得交代：
 *   1) 小方点**留着**，转成白色（--key-ink）—— 清单记号不该因为换了底色就消失；
 *      位置由左内距推出来（落在内距正中），免得贴着蓝块边缘；
 *   2) 上沿那道发丝线改透明、不删 —— 删掉会让这一行往上跳 1px，三条的节奏就歪了；
 *      "看不见但不挪位"靠的是留着占位、抹掉颜色；
 *   3) 这一条**下侧也不留线**（见 .face__point.is-key + .face__point）：蓝块自带阴影收边，
 *      紧挨着它下面再压一道发丝线，会在阴影里叠出一条多余的分界；
 *   4) 字重升到 700：蓝底上的白字比纸上的墨字轻，加一档配重才顶得住"重点"这两个字；
 *   5) 内距左右收成对称档，右缘再让出与眉标同一档的空气 —— 正文栏右缘就是图版的左缘，
 *      蓝块一路铺到那里会读成"蓝块压着屏"，停出一格才干净。 */
.face__point.is-key {
  /* 内距只改上、右、下三边，**左边不动** —— 左内距与 .face__point 同一条公式
     （2×--dot-gap + 5px），蓝块里的文字与白点才跟上下两条要点落在同一条竖线上 */
  padding: clamp(9px, 1.2vh, 16px) clamp(11px, 0.95vw, 17px) clamp(9px, 1.2vh, 16px)
    calc(var(--dot-gap) * 2 + 5px);
  /* 右缘这一道与 .face__eyebrow 的 gap 同一条公式；接缝打开时改让折痕那一段 */
  margin-right: max(clamp(10px, 0.9vw, 16px), calc(var(--seam) * 2.5));
  border-top-color: transparent;
  border-radius: var(--key-r);
  background: var(--key-bg);
  color: var(--key-ink);
  font-weight: 700;
  box-shadow: var(--key-shadow);
}

/* 蓝块下侧不留线：紧跟着它的那一条要点不吃那道行间发丝线
   （蓝块自己的 border-top 也在上面那条规则里改成了透明） */
.face__point.is-key + .face__point {
  border-top-color: transparent;
}

/* 白色小方点：位置与普通要点**逐像素相同** —— left / width / height / rotate 全部沿用
   .face__point::before 的值，这里一个都不覆盖，只把颜色换成白。
   八条要点于是共用同一条点阵竖线（先前把 left 挪到"内距正中"是错的：点歪了一格）。 */
.face__point.is-key::before {
  background: var(--key-ink);
  /* 白点悬浮时会放大一倍半：过渡挂在这里（基础态），移开时才走得动 */
  transition: background-color var(--t-3) ease, scale var(--t-2) var(--ease-out);
}

/* ===== 参数行 =====
 * 三枚等宽小片，透明底 + 1px 描边，克制到只剩轮廓 ——
 * 与上面的清单形成"散文 / 表格"两种读法。 */
.face__specs {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: clamp(6px, 0.6vw, 10px);
  padding-top: clamp(10px, 1.3vh, 18px);
  border-top: 1px solid var(--rule-hair);
}

.face__spec {
  flex: none;
  padding: 4px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--r-xs);
  font-family: var(--mono);
  font-size: var(--fs-meta);
  letter-spacing: 0.06em;
  color: var(--ink-mute);
  white-space: nowrap;
  transition: border-color var(--t-3) ease, color var(--t-3) ease;
}

/* ===== 重点项（v6）：参数行里那一枚 =====
 * 与要点表那一条同一套语言（蓝底 / 圆角 / 阴影 / 白字），只是尺寸保持小片这一档 ——
 * 它是这行等宽小片里的"实心那枚"，另两枚仍是透明底 + 发丝描边。
 * 内距与另两枚**一模一样**（4px 10px）：三枚片同高同宽，行里才对得齐；
 * "重点"由颜色与阴影说，不由尺寸说。描边改透明而不是删掉，也是为了不差这 2px。
 * 字重提到 600：蓝底上的等宽小字本来就比纸上难读半档，加一档配重补回来
 * （等宽字体的 600 与 400 同宽，不会把这一枚撑长）。 */
.face__spec.is-key {
  border-color: transparent;
  border-radius: var(--key-r);
  background: var(--key-bg);
  color: var(--key-ink);
  font-weight: 600;
  box-shadow: var(--key-shadow);
}

/* ===== 正对镜头的那一面 =====
 * 微交互只做"状态确认"：不遮内容、不改布局、不动字号。
 * v5 起三处一起亮：编号转墨黑、标题线转强调色并伸长、参数片描边加深。
 * （原来是四处 —— 眉标行右端那枚信号点随"正在展示"状态位一起去掉了。） */

.face.is-front .face__index {
  color: var(--ink);
}

.face.is-front .face__title::after {
  width: clamp(48px, 3.6vw, 68px);
  background: var(--accent);
}

.face.is-front .face__point::before {
  background: color-mix(in srgb, var(--ink) 62%, transparent);
}

/* 上一条是"正面态的方点转深墨"（3 类），会盖过蓝块里的白点（2 类）——
   这里用 4 类把它拉回白色（与下面参数片那条同一个道理）。
   少了这一条，只有正对镜头的那一面会在蓝块上留一枚发暗的方点。 */
.face.is-front .face__point.is-key::before {
  background: var(--key-ink);
}

.face.is-front .face__spec {
  border-color: var(--rule-strong);
  color: var(--ink-soft);
}

/* 但"参数片描边加深"这条对重点项不适用 —— 蓝块本来就是实心的。
   这一条必须写在上一条之后、且带 .is-key（特异性 4 类 > 3 类），
   否则上面那条会把白字改回墨字、把蓝块重新描一道边。 */
.face.is-front .face__spec.is-key {
  border-color: transparent;
  color: var(--key-ink);
}

/* 暗纱：不朝镜头的那几面退到暗处，正面自然跳出来。随旋转淡入淡出。
 * v4 是"整卡压黑 30%"，那时最小一号文字掉到 4.0:1，所以收到 0.12。
 * v5 卡片有了自己的封面底色（.face__wash）之后，底色会随封面深浅浮动 ——
 * 逐面实测（audit-cardbg.json）发现 rtos 那张粉封面把纸压到 rgb(226,185,215)，
 * 再叠 0.12 暗纱，元信息只剩 3.98:1（AA 线下）。所以再收到 0.05：
 * 卡片自己已经有纹理与色差，"退后"这件事交给透视、图版压暗与正面那条亮边去做，
 * 这一层只负责给侧面轻轻收一点光。 */
.face__veil {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgb(6, 9, 13);
  opacity: 0.05;
  pointer-events: none;
  /* ── v7 · 过渡时长与换面同步 ────────────────────────────────────────
     单点换面是 --dur 720ms，这里仍是 --t-5（420ms）—— 节奏一个字都没变。
     连击时换面只有 --dur-run（720 × 0.5 = 360ms），420ms 的暗纱就比换面还长：
     每次新换面都在"上一段还没淡完"的时候起跑，连击那几帧于是同时挂着两条透明度过渡。
     min() 只在连击那一路生效，正好补上那一档"越点越卡"的漏洞。 */
  transition: opacity min(var(--t-5), var(--dur-run)) ease;
}

.face.is-front .face__veil {
  opacity: 0;
}

/* ===== 左右切换 =====
 * 与退出控件同一套语言：--ctrl 见方、8px 方角、1px 发丝、一层薄玻璃。
 * 位置照旧是版心两端的竖直中线（左右各一枚，夹住舞台），
 * 只是从"深色圆钮 + 白描边"换成了版面上的方角控件。 */
.screen__nav {
  position: absolute;
  top: 50%;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: var(--ctrl);
  height: var(--ctrl);
  padding: 0;
  translate: 0 -50%;
  border: 1px solid var(--ctrl-line);
  border-radius: var(--ctrl-radius);
  background: var(--ctrl-bg);
  color: var(--on-stage);
  cursor: pointer;
  transition:
    background-color var(--t-2) ease,
    border-color var(--t-2) ease,
    color var(--t-2) ease,
    scale var(--t-1) var(--ease-out);
}

.screen__nav--prev {
  left: 0;
}

.screen__nav--next {
  right: 0;
}

/* 悬浮：翻成实纸底 + 墨字 —— 与退出控件同一个动作，三枚控件手感一致。
   不放大：放大是"贴纸"的动作，版面上的控件只换明度。 */
.screen__nav:hover {
  background: var(--ctrl-bg-hover);
  border-color: var(--ctrl-line-hover);
  color: var(--on-accent);
}

/* 按下：轻收一下给按感，收回来的幅度比原来小一档（版面控件不表演） */
.screen__nav:active {
  scale: 0.94;
}

.screen__nav:focus-visible {
  outline: var(--ring-w) solid var(--ring);
  outline-offset: var(--ring-gap);
}

.screen__nav svg {
  display: block;
}

/* ===== 页脚 =====
 * 页脚只剩进度条这一件东西。它绝对定位贴在版心下沿 —— 不进流，所以它自身的
 * 尺寸变化（某一段悬浮时变厚）绝不会把上面的卡片顶动一位。 */
.screen__foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: clamp(18px, 3.4vh, 40px);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 指示器：每一段染上对应功能的那块纸色 —— 八段就是八张卡的缩略 */
.meter {
  display: flex;
  align-items: center;
  /* 高度钉死：某一段悬浮时 4px→6px 只在自己身上变厚，不撑高这一条、也不推走卡片 */
  height: 6px;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.meter > li {
  display: flex;
}

.meter__seg {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: clamp(18px, 2.1vw, 32px);
  height: 4px;
  padding: 0;
  border: 0;
  appearance: none;
  border-radius: var(--r-full);
  /* v4 复测：0.44 这一档在 --stage-deep 上实测 3.5:1，过 1.4.11 的 3:1，维持原值不动 */
  background: color-mix(in srgb, var(--seg, #fff) 44%, transparent);
  cursor: pointer;
  transition:
    width var(--t-4) var(--ease),
    height var(--t-2) ease,
    background-color var(--t-3) ease,
    box-shadow var(--t-3) ease;
}

/* 条本身只有 4px 高，点击热区靠伪元素撑开（左右各 3px，正好不越过 6px 的缝） */
.meter__seg::before {
  content: '';
  position: absolute;
  inset: -11px -3px;
}

/* 正对镜头的那一段：更长、满色、带一圈柔光 */
.meter__seg.is-front {
  width: clamp(30px, 3.4vw, 50px);
  background: var(--seg, #fff);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.16), 0 0 14px color-mix(in srgb, var(--seg, #fff) 55%, transparent);
}

/* 微交互刻意不跟着卡片放大，改用"变亮 + 变厚"这套语言 */
.meter__seg:hover,
.meter__seg:focus-visible {
  height: 6px;
  background: color-mix(in srgb, var(--seg, #fff) 82%, transparent);
}

.meter__seg.is-front:hover {
  background: var(--seg, #fff);
}

.meter__seg:focus-visible {
  outline: var(--ring-w) solid var(--ring);
  outline-offset: var(--ring-gap);
}

/* ===== 退出控件 =====
 * 它在 .screen__inner 的 padding 盒之外，所以必须自己去量那两档百分比
 * —— 但量的是同一个 clamp()，右缘因此与版心右缘严格同一条竖线（实测 0px 偏差）。
 * 纵向：与顶栏共用同一个 padding 起点、同一档高度，所以两者的上下沿与中线
 * 天然重合（实测 0px 偏差）—— 看上去就是顶栏右端的那一格，不需要再补任何偏移。
 * 形状与左右切换钮完全一致，只是宽一点：多了一枚「退出」小字标签。 */
.screen__exit {
  position: absolute;
  top: clamp(18px, 3.4vh, 40px);
  right: clamp(18px, 4vw, 64px);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 0.55em;
  box-sizing: border-box;
  height: var(--ctrl);
  padding: 0 clamp(12px, 1.05vw, 16px);
  border: 1px solid var(--ctrl-line);
  border-radius: var(--ctrl-radius);
  background: var(--ctrl-bg);
  color: var(--on-stage);
  font-family: var(--mono);
  font-size: var(--fs-ctrl);
  font-weight: 500;
  letter-spacing: 0.1em;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--t-2) ease,
    border-color var(--t-2) ease,
    color var(--t-2) ease,
    scale var(--t-1) var(--ease-out);
}

.screen__exit svg {
  display: block;
}

/* 悬浮：翻成实纸底 + 墨字（与切换钮同一个动作）。
   退出是这块版面上唯一的"离场"动作，明度对比给足，一眼认得出按得动 */
.screen__exit:hover {
  background: var(--ctrl-bg-hover);
  border-color: var(--ctrl-line-hover);
  color: var(--on-accent);
}

.screen__exit:active {
  scale: 0.94;
}

.screen__exit:focus-visible {
  outline: var(--ring-w) solid var(--ring);
  outline-offset: var(--ring-gap);
}

/* 读屏用：换面时把"现在看的是哪一项"播报出去 */
.screen__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* ===== v7 · 微交互层 =====
 * 需求原话：「加入大量的微交互：鼠标悬浮时变大、背景变黑之类的，形式多种」。
 *
 * 落点**全部在卡片内部元素**上：卡片本体不接悬浮 —— 不放大、不位移、不压暗、
 * 也不把舞台压黑。指针要"摸得到"的是里头那一件件东西：要点行、重点块、参数片、
 * 图版、图注、编号、栏目名、图标、标题线、描述。骨架（3D 环 / 换面四条路 /
 * aria-live 播报 / 焦点环）一根头发都不碰。
 *
 * 三条硬约束照旧（改这一节前先读）：
 *   ① 尺寸与位移只写在普通 2D 层上，绝不写进 .face 的 3D transform —— 会糊；
 *   ② .prism 上不落 overflow / opacity / filter / clip-path —— preserve-3d 会降级；
 *   ③ prefers-reduced-motion 下只留颜色与明暗，尺寸 / 位移 / 旋转整批退掉（本节末尾）。
 *
 * 十一种形式，逐一落点：
 *   ① 要点行      悬浮 → 一层 9% 淡墨底 + 小圆角（与导语 .face__desc 的悬浮完全同款：
 *                 不铺深色底、不动内距，区块高度一个像素都不变）
 *   ② 要点上的点  墨色从 32% 提到 62%（不换白、不放大）
 *   ③ 重点块      提亮 8% + 外扩一圈柔蓝 + 上浮 1px；白点放大 1.5 倍
 *   ④ 参数片      悬浮 → 背景变黑 + 白字 + 放大 1.08；重点片则提亮 + 放大
 *   ⑤ 图版        悬浮 → 截图推近 3.5%（变大）+ 画面压暗 0.28（变黑）
 *   ⑥ 图注        悬浮 → 上浮 4px + 提亮
 *   ⑦ 编号        放大 1.12 + 转强调蓝
 *   ⑧ 栏目名      字距加宽到 0.28em + 转墨黑
 *   ⑨ 图标        放大 1.18 + 转 10° + 转强调蓝
 *   ⑩ 标题线      伸长到 88px 并发光
 *   ⑪ 描述        一层淡墨底（变黑）+ 小圆角
 * 控件侧另有三条：左右箭头图标朝各自方向让 2px、退出钮的叉转 90°、刊头小字提亮抖开。
 */

/* ⑤ 图版：截图推近（变大）+ 画面压暗（变黑）。
   压暗挂在 .face__shotwrap::after 上 —— 它本来就是侧面板用的那层暗纱
   （正面是 0，侧面 0.42），悬浮时给 0.28：同一套语言，只是更轻。 */
.face__shot {
  transition: transform var(--t-6) var(--ease-out);
}

.face.is-front .face__plate:hover .face__shot {
  transform: scale(1.035);
}

.face.is-front .face__plate:hover .face__shotwrap::after {
  opacity: 0.28;
}

/* ⑥ 图注：上浮 + 提亮 */
.face__caption {
  transition: translate var(--t-4) var(--ease-out), color var(--t-3) ease;
}

.face__caption:hover {
  translate: 0 -4px;
  color: var(--on-stage);
}

/* ① 要点行：悬浮**与导语（.face__desc）同款** —— 只加一层 9% 的淡墨底 + 小圆角。
   不铺深色底、不动内距，区块高度一个像素都不变。 */
.face__point {
  transition: background-color var(--t-2) ease;
}

.face.is-front .face__point:not(.is-key):hover {
  background: color-mix(in srgb, var(--ink) 9%, transparent);
  border-radius: var(--r-xs);
}

/* ② 要点上的点：跟着行一起收敛 —— 只把墨色提一档，不换白也不放大 */
.face__point::before {
  transition: background-color var(--t-3) ease;
}

.face.is-front .face__point:not(.is-key):hover::before {
  background: color-mix(in srgb, var(--ink) 82%, transparent);
}

/* ③ 重点块：它本来就是实心蓝块，悬浮改成"提亮 + 外扩 + 上浮"；白点放大 */
.face__point.is-key {
  transition: background-color var(--t-2) ease;
}

.face.is-front .face__point.is-key:hover {
  /* 只换颜色：不位移、不外扩、不动内距 —— 高度与占位一个像素都不变
     （外扩那圈影会让它看着比旁边高，已经被否掉） */
  background: color-mix(in srgb, var(--key-bg) 88%, #fff);
}

.face.is-front .face__point.is-key:hover::before {
  scale: 1.5;
}

/* ④ 参数片：悬浮 → 背景变黑 + 白字 + 放大一档。
   scale 不参与布局，旁边两枚不会跟着挪位 —— 读起来是"这一枚被拈起来" */
.face__spec {
  transition:
    border-color var(--t-3) ease,
    color var(--t-3) ease,
    background-color var(--t-2) ease,
    scale var(--t-2) var(--ease-out);
}

.face.is-front .face__spec:not(.is-key):hover {
  border-color: transparent;
  background: color-mix(in srgb, var(--ink) 88%, transparent);
  color: #fff;
  scale: 1.08;
}

.face.is-front .face__spec.is-key:hover {
  background: color-mix(in srgb, var(--key-bg) 86%, #fff);
  scale: 1.08;
}

/* ⑦⑧⑨⑩ 编号 / 栏目名 / 图标 / 标题线：各自被悬浮时反应 */
.face__index {
  transition: color var(--t-3) ease, scale var(--t-3) var(--ease-out);
}

.face__tag {
  transition: color var(--t-3) ease, letter-spacing var(--t-3) ease;
}

.face__icon {
  transition: color var(--t-3) ease, rotate var(--t-3) var(--ease-out), scale var(--t-3) var(--ease-out);
}

.face.is-front .face__index:hover {
  color: var(--accent);
  scale: 1.12;
}

.face.is-front .face__tag:hover {
  color: var(--ink);
  letter-spacing: 0.28em;
}

.face.is-front .face__icon:hover {
  color: var(--accent);
  rotate: 10deg;
  scale: 1.18;
}

/* 悬浮标题时线伸长 —— 选择器必须带 .face.is-front：
   正面态那条 `.face.is-front .face__title::after`（3 类）比 `.face__title:hover::after`
   （2 类）权重高，不带前缀这条 hover 整条失效。 */
.face.is-front .face__title:hover::after {
  width: clamp(64px, 4.6vw, 88px);
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 65%, transparent);
}

/* ⑪ 描述：一层淡墨底（变黑）+ 小圆角。
   刻意不加内距 —— 那会把折行位置挪掉 */
.face__desc {
  transition: background-color var(--t-2) ease;
}

.face.is-front .face__desc:hover {
  background: color-mix(in srgb, var(--ink) 9%, transparent);
  border-radius: var(--r-xs);
}

/* 控件侧：图标朝各自的方向让一让 */
.screen__nav svg,
.screen__exit svg {
  transition: translate var(--t-2) var(--ease-out), rotate var(--t-2) var(--ease-out);
}

.screen__nav--prev:hover svg {
  translate: -2px 0;
}

.screen__nav--next:hover svg {
  translate: 2px 0;
}

.screen__exit:hover svg {
  rotate: 90deg;
}

/* 刊头小字：提亮 + 字距抖开 */
.screen__label {
  transition: color var(--t-3) ease, letter-spacing var(--t-3) ease;
}

.screen__top:hover .screen__label {
  color: var(--on-stage);
  letter-spacing: 0.26em;
}

/* 本节收尾：少动效时只留颜色与明暗 —— 尺寸 / 位移 / 旋转整批退掉，
   否则"关掉动效"反而会看到一串瞬跳的形变。 */
@media (prefers-reduced-motion: reduce) {
  .face.is-front .face__point.is-key:hover,
  .face__caption:hover {
    translate: none;
  }

  .face.is-front .face__point.is-key:hover::before,
  .face.is-front .face__spec:not(.is-key):hover,
  .face.is-front .face__spec.is-key:hover,
  .face.is-front .face__index:hover,
  .face.is-front .face__icon:hover {
    scale: none;
  }

  .face.is-front .face__icon:hover {
    rotate: none;
  }

  .face.is-front .face__plate:hover .face__shot {
    transform: none;
  }

  .screen__nav--prev:hover svg,
  .screen__nav--next:hover svg {
    translate: none;
  }

  .screen__exit:hover svg {
    rotate: none;
  }
}

/* ===== 响应式 =====
 * 断点只调四样：两栏怎么分、留白多厚、哪些次要文字退场、控件挪到哪儿。
 * 卡尺寸（80vw × 70vh）与字阶都由 vw 驱动，窄窗自己会缩，不必逐档重写。
 * v4：前两档口径不变；767 那一档从"不崩就行"改成真机口径（字号、折行、触控热区、安全区）。
 */
@media (max-width: 1100px) {
  .screen {
    /* 图版栏收窄一档：窄窗里正文栏得留出能读的行长 */
    --plate-w: 56%;
    --card-pad: clamp(18px, 2.6vw, 30px);
    --col-gap: clamp(18px, 2.6vw, 30px);
  }
}

@media (max-width: 900px) {
  /* 窄屏改成一栏：图版在上、正文在下（v5 起两栏之间不再有发丝线，
     图版自己的边就是分界） */
  .face__skin {
    flex-direction: column-reverse;
  }

  /* 一栏布局里图版排在正文上面（v5：它自己就是那块满幅的屏）。
     宽度顶满整卡，高度由裁切比例定死、并且可以被压 —— 卡矮时先让图版缩，
     正文一个像素都不许被裁（column-reverse 下溢出会跑到卡顶上去） */
  .face__plate {
    flex: 0 1 auto;
    width: 100%;
    min-height: 0;
    aspect-ratio: calc(1958 * var(--shot-keep)) / var(--shot-band);
    /* 一栏布局里交界处跑到下沿（图版在上、正文在下），小圆角跟着给左下 / 右下 */
    border-radius: 0 0 var(--r-sm) var(--r-sm);
  }

  /* 一栏布局里图版在上、正文在下：过渡方向跟着转成竖向（用曲线的竖向版） */
  .face__shotwrap {
    -webkit-mask-image: var(--seam-curve-y);
    mask-image: var(--seam-curve-y);
  }

  /* 一栏布局里接缝转成横向（图版下缘），图注那道底衬用同一条曲线 */
  .face__caption {
    -webkit-mask-image: var(--seam-curve-y);
    mask-image: var(--seam-curve-y);
  }

  .face__main {
    flex: 1 1 auto;
    padding: var(--card-pad);
  }

  .face__desc {
    max-width: none;
  }
}

@media (max-width: 767px) {
  .screen {
    /* 手机上一块 86vw × 72vh 的立牌。卡高收一档，把高度让给上下两行正文；
       顶栏那一条（--top-h + --top-gap）同样要在下面的兜底里还回去 */
    --face-w: 86vw;
    --face-h: min(72vh, calc(100vh - 132px));
    --card-pad: clamp(14px, 4vw, 20px);
    --top-h: 36px;
    --top-gap: 12px;
  }

  /* 版心四边一起收窄。这里不能只写 padding: 12px 14px —— 底边那一档
     带上了顶栏高度（见 .screen__inner 的注释），写平了会把版面又顶下去。
     底边另外叠一条安全区：env() 在没开 viewport-fit=cover 的环境里就是 0，
     所以这一条今天不改变任何像素，等哪天 index.html 开了它才生效 */
  .screen__inner {
    padding: 12px 14px calc(12px + var(--top-h) + var(--top-gap) + env(safe-area-inset-bottom, 0px));
  }

  /* 页脚贴到小窗版的版心下沿，并让开底部安全区 */
  .screen__foot {
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }

  /* 退出钮的 y 与版心的 padding 起点同一条线（与顶栏同高，自然对齐） */
  .screen__exit {
    top: 12px;
  }

  /* 箭头从"卡片左右两侧"挪到舞台下沿两端（v4）：小屏上卡片占掉 86vw，
     两侧只剩十几像素，贴在中间会正好压在卡面上。
     这两枚是手机上唯一的翻面入口（没有滚轮也没有方向键），一枚都不能少 */
  .screen__nav {
    top: auto;
    bottom: 0;
    translate: none;
  }

  /* 标题与导语各自换一条起跳线：4vw 在 390px 上只剩 15.6px，
     会被 clamp 的下限兜成 36px —— 那就与卡宽脱钩了，横竖都不合适 */
  .face__title {
    font-size: clamp(30px, 9vw, 44px);
  }

  .face__desc {
    max-width: none;
    font-size: clamp(14px, 3.9vw, 18px);
  }

  /* 要点表：窄屏允许折行。一行封顶是宽屏的节奏，小屏上那会吃掉半句话 */
  .face__point {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }

  /* 进度条：段加宽，触控热区撑到 30px（2.5.8 的下限是 24px） */
  .meter {
    gap: 5px;
  }

  .meter__seg {
    width: clamp(22px, 5.4vw, 30px);
  }

  .meter__seg::before {
    inset: -14px -4px;
  }
}

/* 再窄一档：退出控件退回纯图标（版面已经没有地方放那两个字了）。
   尺寸跟着变成正方，与切换钮一模一样；aria-label 与 title 一直都在，
   读屏与悬浮提示不受影响。 */
@media (max-width: 600px) {
  .screen__exit {
    width: var(--ctrl);
    gap: 0;
    padding: 0;
  }

  .screen__exit-text {
    display: none;
  }

  .screen__label {
    /* 小字在这里会折行、会跟退出钮挤在一起，整条收掉，发丝线留住 */
    display: none;
  }
}

/* ===== 入场 =====
 * 只管姿态与曲线，起跑点与时长全部来自脚本注入的 --enter-*。
 * 整套挂在 .is-entering 下：撤掉这个类，动画连同上浮一起消失，
 * 元素回落到的静态样式就是动画终态，交接处不跳变。
 * 两个不能碰的地方：柱体的堆叠姿态由 transform 写着 —— 入场只动 rotate / scale
 * 这两个独立属性；舞台那一层才做淡入（prism 上做 opacity 会把 preserve-3d 压平）。
 * 顶栏是 v3 新加的一条：它先落位（横向发丝跟着从左侧展开），退出控件随后弹出。
 */
.screen.is-entering .screen__top {
  animation: enter-rise var(--enter-dur-top) var(--ease) both;
  animation-delay: var(--enter-top);
}

.screen.is-entering .screen__exit {
  animation: enter-pop var(--enter-dur-exit) var(--ease) both;
  animation-delay: var(--enter-exit);
}

/* 舞台做淡入（它不是 3D 上下文元素，安全），柱体在它里面摆正 */
.screen.is-entering .screen__stage {
  animation: enter-fade var(--enter-dur-stage) ease both;
  animation-delay: var(--enter-stage);
}

.screen.is-entering .prism {
  animation: enter-prism var(--enter-dur-prism) var(--ease) both;
  animation-delay: var(--enter-prism);
}

.screen.is-entering .screen__nav--prev {
  animation: enter-nav-left var(--enter-dur-nav) var(--ease) both;
  animation-delay: var(--enter-nav);
}

.screen.is-entering .screen__nav--next {
  animation: enter-nav-right var(--enter-dur-nav) var(--ease) both;
  animation-delay: calc(var(--enter-nav) + var(--enter-nav-step));
}

.screen.is-entering .meter__seg {
  /* 段本身靠宽度表达"正对镜头"，入场用横向展开，不去动宽度 */
  transform-origin: center;
  animation: enter-piece var(--enter-dur-meter) var(--ease) both;
  animation-delay: calc(var(--enter-meter) + var(--m-i, 0) * var(--enter-meter-step));
}

@keyframes enter-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes enter-pop {
  from {
    opacity: 0;
    transform: scale(0.86);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 顶栏：从下方浮起半行 + 淡入，与 features 页刊头的小字同一种"落位"姿态 */
@keyframes enter-rise {
  from {
    opacity: 0;
    translate: 0 0.45em;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

@keyframes enter-nav-left {
  from {
    opacity: 0;
    transform: translateX(22px) scale(0.88);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes enter-nav-right {
  from {
    opacity: 0;
    transform: translateX(-22px) scale(0.88);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes enter-piece {
  from {
    opacity: 0;
    transform: scaleX(0.18);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 整圈从 30° 外摆进来：只动独立属性，transform 里的堆叠姿态原样保留 */
@keyframes enter-prism {
  from {
    rotate: y -30deg;
    scale: 0.9;
  }
  to {
    rotate: y 0deg;
    scale: 1;
  }
}

/* ===== 高对比度偏好（v4）=====
 * 用户在系统里要求"提高对比度"：发丝线整体加重一档、墨字再压深、
 * 暗纱收到最低。侧面板的层级改由缩放（透视）与投影承担 —— 那两样本来就在，
 * 只是平时被暗纱盖住了一半。正面那一张照旧没有暗纱（选择器权重更高） */
@media (prefers-contrast: more) {
  .screen {
    --rule-hair: rgba(22, 21, 15, 0.24);
    --rule: rgba(22, 21, 15, 0.38);
    --rule-strong: rgba(22, 21, 15, 0.55);
    --ink-soft: #2e2b25;
    --ink-mute: #38342c;
    --on-stage-2: rgba(244, 247, 250, 0.94);
    --on-stage-3: rgba(244, 247, 250, 0.84);
    --ctrl-line: rgba(255, 255, 255, 0.72);
    --ctrl-bg: rgba(255, 255, 255, 0.12);
  }

  .face__veil {
    opacity: 0.04;
  }

  .face__shotwrap::after {
    opacity: 0.5;
  }
}

/* ===== 减少透明（v4）=====
 * 控件那层薄玻璃换成一块实底。玻璃在深色舞台上本来就只是"淡淡的一层底"，
 * 换成实色视觉上几乎无差，但对要求减少透明度的用户是必需的 */
@media (prefers-reduced-transparency: reduce) {
  .screen {
    --ctrl-bg: rgb(46, 57, 70);
  }
}

/* 少动效：.is-entering 压根不会挂上，这里只兜住常驻的那几条过渡 */
@media (prefers-reduced-motion: reduce) {
  .prism,
  .face,
  .face__skin,
  .face__veil,
  .face__shotwrap::after,
  .face__index,
  .face__icon,
  .face__spec,
  .face__point::before,
  .face__title::after,
  .screen__nav,
  .screen__top,
  .screen__exit,
  .meter__seg {
    transition: none;
    animation: none;
  }
}
</style>
