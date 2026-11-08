<script setup>
/**
 * Vue Bits · PillNav（React Bits 版 Pill Nav 的忠实 Vue 移植）
 * https://www.reactbits.dev/components/pill-nav
 *
 * 原组件是 JSX + 一份独立原生 CSS（PillNav.css，无 Tailwind、无第三方动画库），
 * 动画全部由组件自己用 requestAnimationFrame 跑弹簧积分。所以移植只做了两类改动：
 *
 *   1. 框架层：useRef/useState → ref，useEffect/useLayoutEffect → onMounted + watch({ flush: 'post' })，
 *      useId → 本实例自增 id。数字、曲线、阻尼系数、DOM 结构与类名一字未改。
 *   2. 本地口子（原版没有这三个位置，本站顶栏需要）：
 *      · props.logoText —— logo 圆右侧的品牌文字；
 *      · slot #trailing —— 导航组右侧的占位位；
 *      · items[].target / items[].rel —— 外链透传（原版只渲染 href）。
 *      为了让上面两个槽位参与 collapse="auto" 的宽度计算，evaluate() 里多算了 extra。
 *
 * 组件自己不做任何站内跳转：点哪一项只 emit('item-click', item, index, event)，由宿主决定。
 */
defineOptions({ name: 'PillNav' })

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const THEMES = {
  dark: {
    '--pn-surface': 'rgba(38, 35, 46, 0.66)',
    '--pn-solid': '#26232e',
    '--pn-edge': 'rgba(255, 255, 255, 0.08)',
    '--pn-rim': 'rgba(255, 255, 255, 0.07)',
    '--pn-shadow': '0 22px 44px -20px rgba(0, 0, 0, 0.8), 0 6px 16px -8px rgba(0, 0, 0, 0.5)',
    '--pn-text': 'rgba(244, 244, 245, 0.64)',
    '--pn-strong': '#f4f4f5',
    '--pn-pill': 'linear-gradient(180deg, #ffffff 0%, #ebebf0 100%)',
    '--pn-pill-ink': '#121016',
    '--pn-pill-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 6px 16px -6px rgba(0, 0, 0, 0.6)',
    '--pn-dot': '#f4f4f5',
    '--pn-ring': 'rgba(244, 244, 245, 0.55)',
    '--pn-row-hover': 'rgba(255, 255, 255, 0.06)',
    '--pn-tile': 'linear-gradient(180deg, #3a3644 0%, #27242f 100%)',
    '--pn-tile-rim':
      'inset 0 0 0 1px rgba(255, 255, 255, 0.07), inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 4px 10px -4px rgba(0, 0, 0, 0.7)'
  },
  light: {
    '--pn-surface': 'rgba(240, 240, 243, 0.8)',
    '--pn-solid': '#f0f0f3',
    '--pn-edge': 'rgba(24, 24, 27, 0.07)',
    '--pn-rim': 'rgba(255, 255, 255, 0.95)',
    '--pn-shadow': '0 22px 44px -22px rgba(24, 24, 27, 0.3), 0 6px 16px -10px rgba(24, 24, 27, 0.16)',
    '--pn-text': 'rgba(24, 24, 27, 0.6)',
    '--pn-strong': '#18181b',
    '--pn-pill': 'linear-gradient(180deg, #2c2c31 0%, #18181b 100%)',
    '--pn-pill-ink': '#ffffff',
    '--pn-pill-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 6px 14px -6px rgba(24, 24, 27, 0.45)',
    '--pn-dot': '#18181b',
    '--pn-ring': 'rgba(24, 24, 27, 0.45)',
    '--pn-row-hover': 'rgba(24, 24, 27, 0.05)',
    '--pn-tile': 'linear-gradient(180deg, #ffffff 0%, #f6f6f8 100%)',
    '--pn-tile-rim':
      'inset 0 0 0 1px rgba(24, 24, 27, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1), 0 4px 10px -5px rgba(24, 24, 27, 0.25)'
  }
}

const SIZES = {
  sm: {
    '--pn-h': '36px',
    '--pn-pad': '3px',
    '--pn-inner': '30px',
    '--pn-x': '12px',
    '--pn-font': '13px',
    '--pn-gap': '6px',
    '--pn-mark': '18px'
  },
  md: {
    '--pn-h': '44px',
    '--pn-pad': '4px',
    '--pn-inner': '36px',
    '--pn-x': '16px',
    '--pn-font': '14px',
    '--pn-gap': '8px',
    '--pn-mark': '22px'
  },
  lg: {
    '--pn-h': '52px',
    '--pn-pad': '5px',
    '--pn-inner': '42px',
    '--pn-x': '20px',
    '--pn-font': '15px',
    '--pn-gap': '10px',
    '--pn-mark': '26px'
  }
}

const ROOT = 'pill-nav'
const SURFACE = 'pill-nav__surface'
const RIM = 'pill-nav__rim'
const ROOT_RIM = 'pill-nav__rim pill-nav__rim--root'
const LOGO = 'pill-nav__logo'
const LOGO_LINK = 'pill-nav__logo-link'
const MARK = 'pill-nav__mark'
const BAR = 'pill-nav__bar'
const TRACK = 'pill-nav__track'
const LIST = 'pill-nav__list'
const SLOT = 'pill-nav__slot'
const ITEM = 'pill-nav__item'
const FACE = 'pill-nav__face'
const FACE_ALT = 'pill-nav__face-alt'
const FILL = 'pill-nav__fill'
const GLIDE = 'pill-nav__glide'
const INK = 'pill-nav__ink'
const INK_ITEM = 'pill-nav__ink-item'
const DOT = 'pill-nav__dot'
const TOGGLE = 'pill-nav__toggle'
const TOGGLE_BARE = 'pill-nav__toggle--bare'
const BURGER = 'pill-nav__burger'
const LINE_TOP = 'pill-nav__line pill-nav__line--top'
const LINE_BOTTOM = 'pill-nav__line pill-nav__line--bottom'
const PANEL = 'pill-nav__panel'
const MENU = 'pill-nav__menu'
const ROW = 'pill-nav__row'
const MEASURE = 'pill-nav__measure'

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const contrastInk = (color) => {
  const hex = String(color || '')
    .trim()
    .replace('#', '')
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  const channel = (index) => {
    const value = parseInt(full.slice(index, index + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return luminance > 0.36 ? '#121016' : '#ffffff'
}

const readVar = (element, name) => parseFloat(getComputedStyle(element).getPropertyValue(name)) || 0

const props = defineProps({
  logo: { type: String, default: '' },
  logoAlt: { type: String, default: 'Logo' },
  logoHref: { type: String, default: '#' },
  /** 本地口子：logo 圆右侧的品牌文字（原版没有这个位置） */
  logoText: { type: String, default: '' },
  // 默认值必须内联：defineProps 会被提升到 setup 之外，引用不到模块里的常量
  items: {
    type: Array,
    default: () => [
      { label: 'Home', href: '#' },
      { label: 'Work', href: '#work' },
      { label: 'About', href: '#about' },
      { label: 'Contact', href: '#contact' }
    ]
  },
  activeHref: { type: String, default: undefined },
  defaultActiveIndex: { type: Number, default: 0 },
  /** 项渲染成什么标签：默认 a，传组件则用它（例如 RouterLink） */
  linkComponent: { type: [String, Object], default: 'a' },
  theme: { type: String, default: 'dark' },
  layout: { type: String, default: 'split' },
  size: { type: String, default: 'md' },
  surface: { type: String, default: 'glass' },
  itemStyle: { type: String, default: 'pill' },
  hoverEffect: { type: String, default: 'fill' },
  indicator: { type: String, default: 'dot' },
  highlightColor: { type: String, default: undefined },
  highlightTextColor: { type: String, default: undefined },
  barColor: { type: String, default: undefined },
  textColor: { type: String, default: undefined },
  bounce: { type: Number, default: 0.3 },
  stretch: { type: Number, default: 0.5 },
  intro: { type: Boolean, default: true },
  collapse: { type: String, default: 'auto' },
  ariaLabel: { type: String, default: 'Main' },
  className: { type: String, default: '' }
})

const emit = defineEmits(['item-click', 'menu-toggle'])

const panelId = `pill-nav-panel-${Math.random().toString(36).slice(2, 9)}`

const rootRef = ref(null)
const barRef = ref(null)
const trackRef = ref(null)
const glideRef = ref(null)
const inkRef = ref(null)
const dotRef = ref(null)
const logoRef = ref(null)
const markRef = ref(null)
const toggleRef = ref(null)
const panelRef = ref(null)
const measureRef = ref(null)
const measureListRef = ref(null)
const brandTextRef = ref(null)
const trailingRef = ref(null)
const slotRefs = ref([])

const selected = ref(props.defaultActiveIndex)
const collapsed = ref(props.collapse === 'always')
const open = ref(false)
const panelShown = ref(false)

/* intro 只放一次；pendingCollapse 记住"折叠判定还没稳定"，那之前不要放动画 */
let introArmed = props.intro
let pendingCollapse = null
/* 入场那一下跑完后，弹簧要等一拍再滑入首项的高亮 */
let slidePending = false
let engine = null
let destroyEngine = null

const controlled = computed(() => props.activeHref !== undefined)
const activeIndex = computed(() =>
  controlled.value ? props.items.findIndex((item) => item.href === props.activeHref) : selected.value
)
const joined = computed(() => props.layout === 'joined')
const hasLogo = computed(() => Boolean(props.logo))
const fill = computed(() => props.hoverEffect === 'fill')
const glide = computed(() => !fill.value && (props.hoverEffect === 'glide' || props.indicator === 'pill'))

const settings = computed(() => ({
  hoverEffect: props.hoverEffect,
  indicator: props.indicator,
  activeIndex: activeIndex.value,
  bounce: clamp(props.bounce, 0, 1),
  stretch: clamp(props.stretch, 0, 1)
}))

const palette = computed(() => THEMES[props.theme] ?? THEMES.dark)

const vars = computed(() => {
  const base = palette.value
  const baseSizes = SIZES[props.size] ?? SIZES.md
  const next = { ...base, ...baseSizes }
  // 顶栏浮在一直在动的首页背景上，backdrop 每帧都要重新采样做模糊，而深色底几乎看不出效果：
  // 这里直接不给模糊，玻璃感只留底色 + 描边，省掉合成器最贵的一笔。
  if (props.surface === 'glass') next['--pn-blur'] = 'none'
  if (props.surface === 'solid') {
    next['--pn-surface'] = base['--pn-solid']
    next['--pn-blur'] = 'none'
  }
  if (props.surface === 'none') {
    next['--pn-surface'] = 'transparent'
    next['--pn-shadow'] = 'none'
    next['--pn-blur'] = 'none'
    next['--pn-edge'] = 'transparent'
    next['--pn-rim'] = 'transparent'
  }
  if (props.barColor) {
    next['--pn-surface'] = props.barColor
    next['--pn-solid'] = props.barColor
  }
  if (props.textColor) {
    next['--pn-strong'] = props.textColor
    next['--pn-text'] = `color-mix(in srgb, ${props.textColor} 64%, transparent)`
  }
  if (props.highlightColor) {
    next['--pn-pill'] = props.highlightColor
    next['--pn-dot'] = props.highlightColor
    next['--pn-pill-shadow'] = 'inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 6px 16px -6px rgba(0, 0, 0, 0.45)'
    next['--pn-pill-ink'] = props.highlightTextColor || contrastInk(props.highlightColor) || base['--pn-pill-ink']
  } else if (props.highlightTextColor) {
    next['--pn-pill-ink'] = props.highlightTextColor
  }
  return next
})

/* ───────────────────────── 弹簧引擎 ─────────────────────────
 * 原版把整段塞在一个 useEffect 里，依赖 [collapsed, items.length]：
 * 结构变了（track 被折叠掉 / 项数变了）就整体重来。这里保持同样的生命周期。
 */
function setupEngine() {
  destroyEngine?.()
  destroyEngine = null
  const root = rootRef.value
  if (!root) return

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const state = {
    x0: 0,
    x1: 0,
    v0: 0,
    v1: 0,
    alpha: 0,
    pop: 1,
    press: 1,
    pressVelocity: 0,
    dotX: 0,
    dotVelocity: 0,
    dotAlpha: 0,
    hover: -1,
    focus: false,
    sliding: false,
    pressing: false,
    waiting: slidePending && !reduce
  }
  slidePending = false
  const rects = []
  let trackWidth = 0
  let trackHeight = 0
  let raf = 0
  let last = 0

  const measure = () => {
    const track = trackRef.value
    if (!track) return
    trackWidth = track.offsetWidth
    trackHeight = track.offsetHeight
    slotRefs.value.forEach((slot, index) => {
      if (!slot) return
      rects[index] = { left: slot.offsetLeft, width: slot.offsetWidth }
      // 覆盖整块圆角矩形所需的圆直径：hover 时从底部升起的那个圆
      const reach = Math.ceil(2 * Math.sqrt((slot.offsetWidth / 2) ** 2 + slot.offsetHeight ** 2)) + 2
      slot.style.setProperty('--pn-fill', `${reach}px`)
    })
  }

  const glideIndex = () => {
    const s = settings.value
    if (s.hoverEffect === 'fill') return -1
    if (s.hoverEffect === 'glide' && state.hover >= 0) return state.hover
    return s.indicator === 'pill' ? s.activeIndex : -1
  }

  const sync = () => {
    const s = settings.value
    slotRefs.value.forEach((slot, index) => {
      if (!slot) return
      const hovered = state.hover === index
      slot.toggleAttribute('data-lit', hovered)
      slot.toggleAttribute('data-hover', hovered && s.hoverEffect === 'fill')
    })
    root.toggleAttribute('data-focus', state.focus && state.hover >= 0)
    root.toggleAttribute(
      'data-dot-lit',
      s.hoverEffect === 'fill' && state.hover >= 0 && state.hover === s.activeIndex
    )
  }

  const render = () => {
    const glideEl = glideRef.value
    const ink = inkRef.value
    const dot = dotRef.value
    const width = Math.max(0, state.x1 - state.x0)
    const scale = state.press * state.pop
    const target = rects[glideIndex()]
    const squash = target ? 1 - clamp((width / Math.max(target.width, 1) - 1) * 0.3, 0, 0.14) : 1
    if (glideEl) {
      glideEl.style.width = `${width}px`
      glideEl.style.transform = `translate3d(${state.x0}px, 0, 0) scale(${scale}, ${scale * squash})`
      glideEl.style.opacity = `${state.alpha}`
    }
    if (ink) {
      const half = (width * scale) / 2
      const center = (state.x0 + state.x1) / 2
      const inset = (trackHeight * (1 - scale * squash)) / 2
      ink.style.clipPath = `inset(${inset}px ${trackWidth - center - half}px ${inset}px ${center - half}px round ${trackHeight / 2}px)`
      ink.style.opacity = `${state.alpha}`
    }
    if (dot) {
      // 速度越快拉得越长，像被甩出去的墨点
      const pull = clamp(Math.abs(state.dotVelocity) / 700, 0, 2.2)
      dot.style.transform = `translate3d(${state.dotX}px, 0, 0) scaleX(${1 + pull})`
      dot.style.opacity = `${state.dotAlpha}`
    }
  }

  const tick = (now) => {
    raf = 0
    const s = settings.value
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    last = now
    const index = glideIndex()
    const target = rects[index]
    const zeta = 1 - 0.55 * s.bounce
    const base = 520
    let busy = false

    if (target && !state.waiting) {
      const t0 = target.left
      const t1 = target.left + target.width
      if (state.alpha < 0.02 && !state.sliding) {
        state.x0 = t0
        state.x1 = t1
        state.v0 = 0
        state.v1 = 0
        state.pop = 0.9
      }
      if (reduce) {
        state.x0 = t0
        state.x1 = t1
        state.v0 = 0
        state.v1 = 0
      } else {
        // 左右两条边各跑一个弹簧：前缘追得急、后缘追得慢，于是拖动方向被拉长
        const direction = Math.sign((t0 + t1) / 2 - (state.x0 + state.x1) / 2)
        const lead = base * (1 + 0.9 * s.stretch)
        const trail = base * (1 - 0.5 * s.stretch)
        const k0 = direction < 0 ? lead : direction > 0 ? trail : base
        const k1 = direction > 0 ? lead : direction < 0 ? trail : base
        const steps = Math.ceil(dt / (1 / 240))
        const h = dt / steps
        for (let i = 0; i < steps; i++) {
          state.v0 += (-k0 * (state.x0 - t0) - 2 * zeta * Math.sqrt(k0) * state.v0) * h
          state.x0 += state.v0 * h
          state.v1 += (-k1 * (state.x1 - t1) - 2 * zeta * Math.sqrt(k1) * state.v1) * h
          state.x1 += state.v1 * h
        }
      }
      state.alpha += (1 - state.alpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.06))
      busy =
        Math.abs(state.x0 - t0) > 0.05 ||
        Math.abs(state.x1 - t1) > 0.05 ||
        Math.abs(state.v0) > 0.5 ||
        Math.abs(state.v1) > 0.5 ||
        state.alpha < 0.999
      if (!busy) state.sliding = false
    } else {
      state.alpha += (0 - state.alpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.07))
      if (state.alpha > 0.002) busy = true
      else state.alpha = 0
    }

    state.pop += (1 - state.pop) * (reduce ? 1 : 1 - Math.exp(-dt / 0.09))
    if (Math.abs(1 - state.pop) > 0.001) busy = true

    const pressTarget = state.pressing ? 0.95 : 1
    if (reduce) {
      state.press = pressTarget
      state.pressVelocity = 0
    } else {
      state.pressVelocity += (-700 * (state.press - pressTarget) - 30 * state.pressVelocity) * dt
      state.press += state.pressVelocity * dt
    }
    if (Math.abs(state.press - pressTarget) > 0.0005 || Math.abs(state.pressVelocity) > 0.01) busy = true

    const dotTarget = s.indicator === 'dot' ? rects[s.activeIndex] : null
    if (dotTarget && !state.waiting) {
      const center = dotTarget.left + dotTarget.width / 2
      if (state.dotAlpha < 0.02) {
        state.dotX = center
        state.dotVelocity = 0
      }
      if (reduce) {
        state.dotX = center
        state.dotVelocity = 0
      } else {
        const k = 360
        const steps = Math.ceil(dt / (1 / 240))
        const h = dt / steps
        for (let i = 0; i < steps; i++) {
          state.dotVelocity +=
            (-k * (state.dotX - center) - 2 * (1 - 0.5 * s.bounce) * Math.sqrt(k) * state.dotVelocity) * h
          state.dotX += state.dotVelocity * h
        }
      }
      state.dotAlpha += (1 - state.dotAlpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.1))
      if (Math.abs(state.dotX - center) > 0.05 || Math.abs(state.dotVelocity) > 0.5 || state.dotAlpha < 0.999)
        busy = true
    } else {
      state.dotAlpha += (0 - state.dotAlpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.1))
      if (state.dotAlpha > 0.002) busy = true
      else state.dotAlpha = 0
    }

    render()
    if (busy && !document.hidden) raf = requestAnimationFrame(tick)
  }

  const wake = () => {
    // 后台标签页里没必要跑：鼠标都进不来
    if (document.hidden) return
    if (!raf) {
      last = 0
      raf = requestAnimationFrame(tick)
    }
  }

  const api = {
    enter: (index, event) => {
      if (event?.pointerType === 'touch') return
      state.hover = index
      state.focus = false
      sync()
      wake()
    },
    leave: () => {
      if (state.focus) return
      state.hover = -1
      sync()
      wake()
    },
    focus: (index, event) => {
      const target = event?.target
      // 只认键盘焦点：鼠标点进来的 focus 不该点亮
      const visible = target instanceof Element && target.matches(':focus-visible')
      state.focus = visible
      state.hover = visible ? index : state.hover
      sync()
      wake()
    },
    blur: () => {
      if (!state.focus) return
      state.focus = false
      state.hover = -1
      sync()
      wake()
    },
    press: (event) => {
      if (event && event.button > 0) return
      state.pressing = true
      wake()
    },
    release: () => {
      if (!state.pressing) return
      state.pressing = false
      wake()
    },
    refresh: () => {
      measure()
      sync()
      wake()
    }
  }
  engine = api

  measure()
  sync()
  render()
  wake()

  let timer = 0
  if (state.waiting) {
    state.x0 = 0
    state.x1 = 0
    timer = window.setTimeout(() => {
      state.waiting = false
      if (glideIndex() >= 0) {
        state.alpha = 1
        state.sliding = true
      }
      wake()
    }, 420)
  }

  const resizeObserver = new ResizeObserver(() => {
    measure()
    render()
    wake()
  })
  if (trackRef.value) resizeObserver.observe(trackRef.value)
  document.fonts?.ready?.then(() => api.refresh()).catch(() => {})
  window.addEventListener('pointerup', api.release)
  window.addEventListener('pointercancel', api.release)

  destroyEngine = () => {
    cancelAnimationFrame(raf)
    window.clearTimeout(timer)
    resizeObserver.disconnect()
    window.removeEventListener('pointerup', api.release)
    window.removeEventListener('pointercancel', api.release)
    if (engine === api) engine = null
  }
}

/* ───────────────────── collapse="auto" 的宽度判定 ─────────────────────
 * 原版只量 logo + items；本站多了品牌文字与右侧占位，两者都要计入需求宽度。
 */
function setupCollapse() {
  const root = rootRef.value
  const measureEl = measureRef.value
  if (!root || !measureEl) return null

  const evaluate = () => {
    if (props.collapse === 'always' || props.collapse === 'never') {
      collapsed.value = props.collapse === 'always'
      return
    }
    const parent = root.parentElement
    if (!parent) return
    const styles = getComputedStyle(parent)
    const available =
      parent.clientWidth - (parseFloat(styles.paddingLeft) || 0) - (parseFloat(styles.paddingRight) || 0)
    const listWidth = measureListRef.value?.offsetWidth ?? 0
    const height = readVar(root, '--pn-h')
    const pad = readVar(root, '--pn-pad')
    const gap = readVar(root, '--pn-gap')
    const inner = readVar(root, '--pn-inner')
    const brandEl = brandTextRef.value
    const brand = brandEl
      ? brandEl.offsetWidth +
        (parseFloat(getComputedStyle(brandEl).paddingLeft) || 0) +
        (parseFloat(getComputedStyle(brandEl).paddingRight) || 0)
      : 0
    const tail = trailingRef.value ? trailingRef.value.offsetWidth + gap : 0
    const extra = brand + tail
    const need = joined.value
      ? pad * 2 + (hasLogo.value ? inner + 2 : 0) + listWidth + extra
      : (hasLogo.value ? height + gap : 0) + listWidth + pad * 2 + extra
    const next = need > available + 0.5
    if (introArmed && next !== collapsed.value) pendingCollapse = next
    collapsed.value = next
  }

  evaluate()
  const observer = new ResizeObserver(evaluate)
  if (root.parentElement) observer.observe(root.parentElement)
  observer.observe(measureEl)
  return () => observer.disconnect()
}

/* ───────────────────────── 入场动画 ─────────────────────────
 * 只在第一次、且折叠判定稳定之后放一次：logo 弹入 + 条带从 logo 形状拉开 + 各项依次浮现。
 */
function runIntro() {
  const root = rootRef.value
  if (!root || !introArmed) return
  if (pendingCollapse !== null && pendingCollapse !== collapsed.value) return
  pendingCollapse = null
  introArmed = false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const pop = (element, delay) =>
    element?.animate(
      [
        { opacity: 0, transform: 'scale(0.6)' },
        { opacity: 1, transform: 'scale(1)' }
      ],
      { duration: 700, delay, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'backwards' }
    )
  const reveal = (element) => {
    if (!element) return
    const width = element.offsetWidth
    const height = element.offsetHeight
    element.animate(
      [
        {
          clipPath: `inset(0px ${Math.max(0, width - height)}px 0px 0px round ${height / 2}px)`
        },
        { clipPath: `inset(0px 0px 0px 0px round ${height / 2}px)` }
      ],
      { duration: 760, delay: 90, easing: EASE_OUT, fill: 'backwards' }
    )
  }

  pop(logoRef.value, 0)
  if (collapsed.value) {
    pop(toggleRef.value, 120)
    return
  }
  slidePending = true
  reveal(joined.value ? root : barRef.value)
  slotRefs.value.forEach((slot, index) => {
    slot?.animate(
      [
        { opacity: 0, transform: 'translateX(-10px)' },
        { opacity: 1, transform: 'translateX(0)' }
      ],
      { duration: 560, delay: 200 + index * 50, easing: EASE_OUT, fill: 'backwards' }
    )
  })
}

/* ───────────────────────── 折叠面板的 morph ─────────────────────────
 * 展开：面板从汉堡按钮那个圆角矩形裁出来；收起：裁回去，裁完再真正卸载。
 */
function animatePanel(onCleanup) {
  const panel = panelRef.value
  const root = rootRef.value
  if (!panel || !root) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const width = panel.offsetWidth
  const height = panel.offsetHeight
  const header = joined.value ? root.offsetHeight : (toggleRef.value?.offsetHeight ?? 44)
  const start = joined.value
    ? `inset(0px 0px ${Math.max(0, height - header)}px 0px round ${header / 2}px)`
    : `inset(0px 0px ${Math.max(0, height - header)}px ${Math.max(0, width - header)}px round ${header / 2}px)`
  const end = 'inset(0px 0px 0px 0px round 24px)'
  const rows = panel.querySelectorAll('li')
  const running = []
  if (open.value) {
    if (reduce) return
    running.push(panel.animate([{ clipPath: start }, { clipPath: end }], { duration: 560, easing: EASE_OUT }))
    rows.forEach((row, index) => {
      running.push(
        row.animate(
          [
            { opacity: 0, transform: 'translateY(-8px)' },
            { opacity: 1, transform: 'translateY(0)' }
          ],
          { duration: 420, delay: 90 + index * 40, easing: EASE_OUT, fill: 'backwards' }
        )
      )
    })
  } else {
    if (reduce) {
      panelShown.value = false
      return
    }
    const morph = panel.animate([{ clipPath: end }, { clipPath: start }], {
      duration: 380,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards'
    })
    morph.onfinish = () => {
      panelShown.value = false
    }
    running.push(morph)
    rows.forEach((row) => {
      running.push(row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }))
    })
  }
  onCleanup(() => {
    running.forEach((animation) => {
      animation.onfinish = null
      animation.cancel()
    })
  })
}

const spin = (event) => {
  const mark = markRef.value
  if (!mark || event.pointerType === 'touch' || mark.getAnimations().length) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  mark.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
    duration: 900,
    easing: 'cubic-bezier(0.65, 0, 0.25, 1)'
  })
}

const choose = (item, index, event) => {
  emit('item-click', item, index, event)
  if (!controlled.value) selected.value = index
}

const toggleMenu = () => {
  const next = !open.value
  if (next) panelShown.value = true
  open.value = next
  emit('menu-toggle', next)
}

const closeMenu = () => {
  open.value = false
  emit('menu-toggle', false)
}

/** 外链透传 target/rel 是本地扩展：原版只渲染 href */
const linkAttrs = (item) => {
  if (!item.href) return { type: 'button' }
  const attrs = { href: item.href }
  if (item.target) attrs.target = item.target
  if (item.rel) attrs.rel = item.rel
  return attrs
}

const setSlotRef = (el, index) => {
  slotRefs.value[index] = el
}

const onSlotEnter = (index, event) => engine?.enter(index, event)
const onSlotPress = (event) => engine?.press(event)
const onSlotFocus = (index, event) => engine?.focus(index, event)
const onSlotBlur = () => engine?.blur()
const onTrackLeave = () => engine?.leave()

let stopCollapseObserver = null

const restartCollapseObserver = () => {
  stopCollapseObserver?.()
  stopCollapseObserver = setupCollapse() ?? null
}

onMounted(async () => {
  await nextTick()
  setupEngine()
  restartCollapseObserver()
  runIntro()
})

watch(
  [collapsed, () => props.items.length],
  async () => {
    await nextTick()
    setupEngine()
  },
  { flush: 'post' }
)

watch(
  [() => props.collapse, collapsed, joined, hasLogo, () => props.size],
  async () => {
    await nextTick()
    restartCollapseObserver()
  },
  { flush: 'post' }
)

watch(
  [collapsed, joined],
  async () => {
    await nextTick()
    runIntro()
  },
  { flush: 'post' }
)

watch(
  [collapsed, open],
  () => {
    if (!collapsed.value && open.value) open.value = false
  },
  { flush: 'post' }
)

watch(
  [open, panelShown, joined],
  (value, oldValue, onCleanup) => {
    // 面板从"已展开"变成"已隐藏"时也要跑一次 morph，所以两个状态都盯
    if (!panelShown.value) return
    animatePanel(onCleanup)
  },
  { flush: 'post' }
)

watch(open, (isOpen, _, onCleanup) => {
  if (!isOpen) return
  const onPointerDown = (event) => {
    const target = event.target
    if (target instanceof Node && rootRef.value?.contains(target)) return
    open.value = false
  }
  const onKeyDown = (event) => {
    if (event.key !== 'Escape') return
    open.value = false
    toggleRef.value?.focus()
  }
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  onCleanup(() => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeyDown)
  })
})

onBeforeUnmount(() => {
  destroyEngine?.()
  stopCollapseObserver?.()
})
</script>

<template>
  <nav
    ref="rootRef"
    :class="[ROOT, joined ? SURFACE : '', className]"
    :data-layout="layout"
    :data-items="itemStyle"
    :data-collapsed="collapsed ? '' : undefined"
    :data-open="open ? '' : undefined"
    :data-panel="panelShown ? '' : undefined"
    :style="vars"
    :aria-label="ariaLabel"
  >
    <span v-if="logo" ref="logoRef" :class="[LOGO, joined ? '' : SURFACE]">
      <component
        :is="linkComponent"
        :href="logoHref"
        :class="LOGO_LINK"
        :aria-label="logoAlt"
        @pointerenter="spin"
      >
        <span ref="markRef" :class="MARK">
          <img :src="logo" alt="" draggable="false" />
        </span>
      </component>
      <span v-if="logoText" ref="brandTextRef" class="pill-nav__brand-text">{{ logoText }}</span>
      <span v-if="!joined" :class="RIM" />
    </span>

    <div v-if="!collapsed" ref="barRef" :class="[BAR, joined ? '' : SURFACE]">
      <div ref="trackRef" :class="TRACK" @pointerleave="onTrackLeave">
        <ul :class="LIST">
          <li
            v-for="(item, index) in items"
            :key="`${item.label}-${index}`"
            :ref="(el) => setSlotRef(el, index)"
            :class="SLOT"
            :data-on="fill && indicator === 'pill' && index === activeIndex ? '' : undefined"
            @pointerenter="onSlotEnter(index, $event)"
            @pointerdown="onSlotPress($event)"
            @focusin="onSlotFocus(index, $event)"
            @focusout="onSlotBlur"
          >
            <component
              :is="item.href ? linkComponent : 'button'"
              v-bind="linkAttrs(item)"
              :class="ITEM"
              :aria-current="index === activeIndex ? 'page' : undefined"
              :aria-label="item.ariaLabel || undefined"
              @click="choose(item, index, $event)"
            >
              <span v-if="fill" :class="FILL" aria-hidden="true" />
              <span :class="FACE">
                <component :is="item.icon" v-if="item.icon" />
                {{ item.label }}
              </span>
              <span v-if="fill" :class="FACE_ALT" aria-hidden="true">
                <component :is="item.icon" v-if="item.icon" />
                {{ item.label }}
              </span>
            </component>
          </li>
        </ul>

        <span v-if="glide" ref="glideRef" :class="GLIDE" aria-hidden="true" />
        <div v-if="glide" ref="inkRef" :class="INK" aria-hidden="true">
          <span v-for="(item, index) in items" :key="`${item.label}-${index}`" :class="INK_ITEM">
            <component :is="item.icon" v-if="item.icon" />
            {{ item.label }}
          </span>
        </div>
        <span v-if="indicator === 'dot'" ref="dotRef" :class="DOT" aria-hidden="true" />
      </div>
      <span v-if="!joined" :class="RIM" />
    </div>

    <span v-if="$slots.trailing" ref="trailingRef" class="pill-nav__trailing">
      <slot name="trailing" />
    </span>

    <button
      v-if="collapsed"
      ref="toggleRef"
      type="button"
      :class="[TOGGLE, joined ? TOGGLE_BARE : SURFACE]"
      :aria-expanded="open"
      :aria-controls="panelId"
      :aria-label="open ? 'Close menu' : 'Open menu'"
      @click="toggleMenu"
    >
      <span :class="BURGER" aria-hidden="true">
        <span :class="LINE_TOP" />
        <span :class="LINE_BOTTOM" />
      </span>
      <span v-if="!joined" :class="RIM" />
    </button>

    <div v-if="collapsed && panelShown" ref="panelRef" :id="panelId" :class="[PANEL, SURFACE]">
      <ul :class="MENU">
        <li v-for="(item, index) in items" :key="`${item.label}-${index}`">
          <component
            :is="item.href ? linkComponent : 'button'"
            v-bind="linkAttrs(item)"
            :class="ROW"
            :aria-current="index === activeIndex ? 'page' : undefined"
            :tabindex="open ? undefined : -1"
            @click="choose(item, index, $event), closeMenu()"
          >
            <component :is="item.icon" v-if="item.icon" />
            {{ item.label }}
          </component>
        </li>
      </ul>
      <span :class="RIM" />
    </div>

    <div ref="measureRef" :class="MEASURE" aria-hidden="true">
      <div ref="measureListRef" :class="LIST">
        <span v-for="(item, index) in items" :key="`${item.label}-${index}`" :class="INK_ITEM">
          <component :is="item.icon" v-if="item.icon" />
          {{ item.label }}
        </span>
      </div>
    </div>

    <span v-if="joined" :class="ROOT_RIM" />
  </nav>
</template>


<style scoped>
.pill-nav {
  --pn-roll: calc(var(--pn-inner) / 2 + 0.7em);
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--pn-gap);
  max-width: 100%;
  font-size: var(--pn-font);
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
}

.pill-nav[data-collapsed] {
  display: flex;
  width: 100%;
  justify-content: space-between;
}

/* 本地扩展：折叠态多了一个品牌文字，靠左收拢，让汉堡独占右端 */
.pill-nav[data-collapsed] {
  justify-content: flex-start;
}

.pill-nav[data-collapsed] .pill-nav__toggle,
.pill-nav[data-collapsed] .pill-nav__trailing {
  margin-left: auto;
}

.pill-nav[data-layout='joined'] {
  gap: 2px;
  padding: var(--pn-pad);
  border-radius: 999px;
}

.pill-nav__surface {
  background: var(--pn-surface);
  box-shadow: var(--pn-shadow);
  -webkit-backdrop-filter: var(--pn-blur);
  backdrop-filter: var(--pn-blur);
}

.pill-nav[data-layout='joined'][data-panel] {
  background: transparent;
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

.pill-nav[data-panel] .pill-nav__rim--root {
  opacity: 0;
}

.pill-nav__rim {
  position: absolute;
  inset: 0;
  z-index: 4;
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 1px var(--pn-edge),
    inset 0 1px 0 var(--pn-rim);
  pointer-events: none;
}

/* logo 槽是个胶囊：有品牌文字时向右长开，没有文字时就是原来的圆 */
.pill-nav__logo {
  position: relative;
  z-index: 2;
  display: inline-flex;
  flex: none;
  align-items: center;
  height: var(--pn-h);
  min-width: var(--pn-h);
  border-radius: 999px;
}

.pill-nav__logo-link {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: var(--pn-h);
  height: var(--pn-h);
  border-radius: 999px;
  color: var(--pn-strong);
  text-decoration: none;
  outline: none;
}

.pill-nav[data-layout='joined'] .pill-nav__logo {
  height: var(--pn-inner);
  min-width: var(--pn-inner);
}

.pill-nav[data-layout='joined'] .pill-nav__logo-link {
  width: var(--pn-inner);
  height: var(--pn-inner);
}

.pill-nav__logo-link:focus-visible,
.pill-nav__toggle:focus-visible {
  outline: 2px solid var(--pn-ring);
  outline-offset: 2px;
}

/* 图标铺满 logo 格，圆形裁切 */
.pill-nav__mark {
  display: grid;
  box-sizing: border-box;
  place-items: center;
  /* 内边距占胶囊高度的一小圈：图标撑大但四周仍露出胶囊底与描边 */
  padding: 4px;
  width: 100%;
  height: 100%;
}

.pill-nav__mark img,
.pill-nav__mark svg {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  object-fit: cover;
}

/* 本地扩展：与 logo 同处一块胶囊的品牌文字，左右留白与胶囊高度成比例 */
.pill-nav__brand-text {
  font-family: Archive,serif;
  flex: none;
  padding: 0 10px 2px 4px;
  color: var(--pn-strong);
  font-size: calc(var(--pn-font) + 7px);
  font-weight: 1000;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

/* 品牌字换成会流动的蓝紫渐变，颜色取自站点主色（#6d5cff / #a98bff / #36d7ff）。
 * 首尾同色，且一个周期走完的距离正好等于 background-size，所以是无缝循环。 */
@supports ((background-clip: text) or (-webkit-background-clip: text)) {
  .pill-nav__brand-text {
    background-image: linear-gradient(
      90deg,
      #ffffff 0%,
      #ded8ff 25%,
      #a8a6ff 50%,
      #ded8ff 75%,
      #ffffff 100%
    );
    background-size: 300% 100%;
    background-repeat: repeat-x;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
    animation: pn-brand-flow 6s linear infinite;
  }
}

@keyframes pn-brand-flow {
  from {
    background-position: 0% 50%;
  }
  to {
    /* 150% × (300% - 100%) = 正好一条渐变宽 */
    background-position: 150% 50%;
  }
}

/* 本地扩展：右端占位位 */
.pill-nav__trailing {
  position: relative;
  z-index: 2;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  height: var(--pn-h);
}

.pill-nav[data-layout='joined'] .pill-nav__trailing {
  height: var(--pn-inner);
}

/* 折叠后右端只留汉堡，占位位让开 */
.pill-nav[data-collapsed] .pill-nav__trailing {
  display: none;
}

.pill-nav__bar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  height: var(--pn-h);
  padding: var(--pn-pad);
  border-radius: 999px;
  box-sizing: border-box;
}

.pill-nav[data-layout='joined'] .pill-nav__bar {
  height: var(--pn-inner);
  padding: 0;
}

.pill-nav__track {
  position: relative;
  height: 100%;
}

.pill-nav__list {
  display: flex;
  align-items: stretch;
  gap: var(--pn-item-gap, 2px);
  height: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pill-nav__slot {
  display: flex;
}

.pill-nav__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 var(--pn-x);
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--pn-text);
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  font-weight: 500;
  letter-spacing: -0.005em;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  outline: none;
  overflow: hidden;
  isolation: isolate;
  /* 这里原本有 color 0.25s 过渡：颜色变化要逐帧重绘字形，而同一时刻 face 层已经在
   * 合成器上翻动了，颜色那点渐变根本看不出来 —— 删掉，省掉每帧一次文字重绘。 */
}

.pill-nav__slot[data-lit] .pill-nav__item,
.pill-nav__item[aria-current] {
  color: var(--pn-strong);
}

.pill-nav[data-items='pill'] {
  --pn-item-gap: 3px;
}

.pill-nav[data-items='pill'] .pill-nav__item {
  background: var(--pn-tile);
  box-shadow: var(--pn-tile-rim);
  color: var(--pn-strong);
}

.pill-nav__item:focus-visible,
.pill-nav__row:focus-visible {
  outline: 2px solid var(--pn-ring);
  outline-offset: -2px;
}

.pill-nav__face {
  font-size: calc(var(--pn-font) + 2px);
  font-family: Archive,serif;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 0.45em;
  transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

.pill-nav__face svg {
  width: 1.15em;
  height: 1.15em;
  flex: none;
}

.pill-nav__face-alt {
  font-size: calc(var(--pn-font) + 2px);
  position: absolute;
  font-weight: 700;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45em;
  color: var(--pn-pill-ink);
  transform: translateY(var(--pn-roll));
  transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

.pill-nav__face-alt svg {
  width: 1.15em;
  height: 1.15em;
  flex: none;
}

.pill-nav__slot[data-on] .pill-nav__face,
.pill-nav__slot[data-hover] .pill-nav__face {
  transform: translateY(calc(var(--pn-roll) * -1));
  transition-duration: 0.5s;
}

.pill-nav__slot[data-on] .pill-nav__face-alt,
.pill-nav__slot[data-hover] .pill-nav__face-alt {
  transform: translateY(0);
  transition-duration: 0.5s;
}

.pill-nav__fill {
  position: absolute;
  top: 100%;
  left: 50%;
  z-index: -1;
  width: var(--pn-fill, 200%);
  height: var(--pn-fill, 200%);
  margin: calc(var(--pn-fill, 200%) / -2) 0 0 calc(var(--pn-fill, 200%) / -2);
  border-radius: 50%;
  background: var(--pn-pill);
  transform: scale(0);
  transition: transform 0.36s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.pill-nav__slot[data-on] .pill-nav__fill,
.pill-nav__slot[data-hover] .pill-nav__fill {
  transform: scale(1);
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}

.pill-nav__glide {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 0;
  border-radius: 999px;
  background: var(--pn-pill);
  box-shadow: var(--pn-pill-shadow);
  opacity: 0;
  pointer-events: none;
  transform-origin: 50% 50%;
  will-change: transform, width, opacity;
}

.pill-nav[data-focus] .pill-nav__glide {
  box-shadow:
    var(--pn-pill-shadow),
    0 0 0 2px var(--pn-ring);
}

.pill-nav__ink {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: stretch;
  gap: var(--pn-item-gap, 2px);
  color: var(--pn-pill-ink);
  pointer-events: none;
  clip-path: inset(0 100% 0 0);
}

.pill-nav__ink-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45em;
  height: 100%;
  padding: 0 var(--pn-x);
  font-weight: 500;
  letter-spacing: -0.005em;
  white-space: nowrap;
}

.pill-nav__ink-item svg {
  width: 1.15em;
  height: 1.15em;
  flex: none;
}

.pill-nav__dot {
  position: absolute;
  bottom: calc((var(--pn-inner) - var(--pn-font)) / 4 - 2px);
  left: 0;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  border-radius: 999px;
  background: var(--pn-dot);
  opacity: 0;
  pointer-events: none;
  transition: background-color 0.3s ease;
  will-change: transform, opacity;
}

.pill-nav[data-dot-lit] .pill-nav__dot {
  background: var(--pn-pill-ink);
}

.pill-nav__toggle {
  position: relative;
  z-index: 3;
  display: inline-grid;
  flex: none;
  place-items: center;
  width: var(--pn-h);
  height: var(--pn-h);
  padding: 0;
  border: 0;
  border-radius: 999px;
  color: var(--pn-strong);
  cursor: pointer;
  outline: none;
}

.pill-nav__toggle--bare {
  background: transparent;
}

.pill-nav[data-layout='joined'] .pill-nav__toggle {
  width: var(--pn-inner);
  height: var(--pn-inner);
}

.pill-nav__burger {
  position: relative;
  width: 16px;
  height: 10px;
}

.pill-nav__line {
  position: absolute;
  left: 0;
  width: 100%;
  height: 1.5px;
  border-radius: 2px;
  background: currentColor;
  transition:
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
    top 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.pill-nav__line--top {
  top: 1.5px;
}

.pill-nav__line--bottom {
  top: 7px;
}

.pill-nav[data-open] .pill-nav__line--top {
  top: 4.25px;
  transform: rotate(45deg);
}

.pill-nav[data-open] .pill-nav__line--bottom {
  top: 4.25px;
  transform: rotate(-45deg);
}

.pill-nav__panel {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 1;
  padding: calc(var(--pn-h) + 10px) 6px 6px;
  border-radius: 24px;
  box-sizing: border-box;
}

.pill-nav[data-layout='joined'] .pill-nav__panel {
  padding-top: calc(var(--pn-h) + 4px);
}

.pill-nav__menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pill-nav__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: calc(var(--pn-h) + 2px);
  padding: 0 16px;
  border: 0;
  border-radius: 18px;
  box-sizing: border-box;
  background: none;
  color: var(--pn-strong);
  font-family: inherit;
  font-size: calc(var(--pn-font) + 1px);
  line-height: 1;
  font-weight: 500;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  outline: none;
  transition: background-color 0.2s ease;
}

.pill-nav__row svg {
  width: 1.15em;
  height: 1.15em;
  flex: none;
}

.pill-nav__row:hover {
  background: var(--pn-row-hover);
}

.pill-nav__row[aria-current] {
  background: var(--pn-pill);
  box-shadow: var(--pn-pill-shadow);
  color: var(--pn-pill-ink);
}

.pill-nav__measure {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  gap: 2px;
  visibility: hidden;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .pill-nav__brand-text {
    animation: none;
  }

  .pill-nav__face,
  .pill-nav__face-alt,
  .pill-nav__fill,
  .pill-nav__line,
  .pill-nav__item,
  .pill-nav__row {
    transition: none;
  }
}
</style>
