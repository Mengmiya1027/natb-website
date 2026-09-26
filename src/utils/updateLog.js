import { computed, readonly, ref } from 'vue'

/**
 * 版本数据源：public/json/UpdateLog.json 是唯一真源。
 * 「更新日志」页逐版渲染这份清单，「项目信息」页那行版本号取的是同一份数据里最新的一条——
 * 最新版本 = releases 的第一条，由清单自己派生，JSON 里没有也不需要一个额外的 latest 字段：
 * 多一个字段就多一处会漏同步的地方（加了新版却忘了改 latest，页面就会静止在旧版本号上）。
 *
 * 两个组件共用模块级这一份状态与同一个 Promise：
 * 谁先挂载谁发请求，后挂载的页面直接接上同一次结果，同一次加载里不会重复请求。
 * 状态机：idle → loading → ready | error。
 * 读取失败只把状态摆好、往控制台留一条 warn，不往页面上抛异常——
 * 占位文案是各页面自己的事（项目信息页只换一行字，更新日志页摆一张状态卡）。
 */
const URL_JSON = import.meta.env.BASE_URL + 'json/UpdateLog.json'

// 明细的 kind 与组件里的 KIND_ICON 同一套键；缺 tag 时按 kind 补一个默认中文标签
const KINDS = new Set(['new', 'opt', 'fix', 'soon'])
const TAG_OF = { new: '新增', opt: '优化', fix: '修复', soon: '预告' }

const status = ref('idle') // idle | loading | ready | error
const releases = ref([]) // [{ version, date, items: [{ kind, tag, text }] }]，按日期倒序
const error = ref('') // 给占位文案用的短原因，如 "HTTP 404"
// 最新版本就是清单的第一条（normalize 已保证它是最新的那条），不另设字段
const latest = computed(() => releases.value[0] ?? null)

let inflight = null

/** 一条明细：正文空白的直接丢掉，不让空行占位 */
function readItem(raw) {
  const text = typeof raw?.text === 'string' ? raw.text.trim() : ''
  if (!text) return null
  const kind = KINDS.has(raw?.kind) ? raw.kind : 'new'
  const tag = typeof raw?.tag === 'string' && raw.tag.trim() ? raw.tag.trim() : TAG_OF[kind]
  return { kind, tag, text }
}

/** 一版日志：没有版本号的整块丢掉；日期缺了仍留着，页面自会显示"没有日期" */
function readRelease(raw) {
  const version = typeof raw?.version === 'string' ? raw.version.trim() : ''
  if (!version) return null
  const items = Array.isArray(raw?.items) ? raw.items.map(readItem).filter(Boolean) : []
  const date = typeof raw?.date === 'string' ? raw.date.trim() : ''
  return { version, date, items }
}

/**
 * 归一：丢掉坏块，再按日期倒序。
 * 「最新在最前」是页面的硬前提（牌堆开局停在第一版、页眉的横跨区间取首尾两端），
 * 所以顺序不靠人工保证：JSON 里写反了，这里也会摆正。
 */
function normalize(json) {
  return (Array.isArray(json?.releases) ? json.releases : [])
    .map(readRelease)
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** 给占位文案用的短原因：原始异常（英文、可能很长）只进控制台，页面上只摆一句能看懂的话 */
function reasonOf(err) {
  // fetch 本身就没发出去：离线、DNS、CORS 都是这一种
  if (err instanceof TypeError) return '网络不可达'
  // 请求回来了但不是 JSON：地址指到了 HTML（404 回落页）或文件被写坏
  if (err instanceof SyntaxError) return '返回的内容不是 JSON'
  return err?.message || '读取失败'
}

/** 真正发请求的那一次；调用方只看状态，不看这个 Promise */
function load() {
  status.value = 'loading'
  error.value = ''
  inflight = fetch(URL_JSON, {
    // 版本数据要现改现生效：让浏览器每次都回源确认，命中 304 时仍走缓存，不会白下载
    cache: 'no-cache',
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((json) => {
      releases.value = normalize(json)
      status.value = 'ready'
    })
    .catch((err) => {
      // 网络断了、地址写错、JSON 语法坏了都落这里：状态摆明，原因留给占位文案
      error.value = reasonOf(err)
      status.value = 'error'
      console.warn('[UpdateLog] 版本数据读取失败：', URL_JSON, err)
    })
  return inflight
}

/**
 * 两个页面都用这一个入口：首次调用即发起请求，之后复用同一份结果与状态。
 * 返回的都是只读的，页面只负责按三态摆自己的占位。
 */
export function useUpdateLog() {
  if (!inflight) load()
  return {
    status: readonly(status),
    releases: readonly(releases),
    latest,
    error: readonly(error),
  }
}
