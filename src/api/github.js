import { ISSUE_REPO, ISSUE_REPO_FULL, DEFAULT_PROXY_BASE, STORAGE_KEYS } from '@/config/github'

const DIRECT_ORIGIN = 'https://api.github.com'
const TIMEOUT = 20000

/** 所有网络错误的统一形态：status 为 0 表示请求根本没发出去（断网 / 被墙 / DNS 污染） */
export class GitHubError extends Error {
  constructor(status, message, payload) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
    this.payload = payload
  }
}

/* ---------------- 本地存储 ---------------- */

function readStore(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStore(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 隐私模式下写不进去，退化成内存态即可 */
  }
}

/**
 * 开发环境下可选的只读兜底 token。
 * 匿名访问每小时只有 60 次配额，一次页面加载就要用掉 5 次；
 * 这个 token 只在 `npm run dev` 时生效（无 scope，只能读公开数据），
 * 生产构建里恒为空字符串，不会被打进产物。
 */
const DEV_READ_TOKEN =
  import.meta.env.DEV && import.meta.env.VITE_GITHUB_READ_TOKEN
    ? String(import.meta.env.VITE_GITHUB_READ_TOKEN)
    : ''

export function getToken() {
  return readStore(STORAGE_KEYS.token) || ''
}

/** 实际发请求时用的凭据：登录用户优先，其次开发环境的只读兜底 */
export function getEffectiveToken() {
  return getToken() || DEV_READ_TOKEN
}

export function setToken(token) {
  writeStore(STORAGE_KEYS.token, token || null)
}

export function clearToken() {
  writeStore(STORAGE_KEYS.token, null)
  writeStore(STORAGE_KEYS.user, null)
}

export function getProxyBase() {
  const saved = readStore(STORAGE_KEYS.proxy)
  // 空串等同于「没设置过」：回落到内置默认中转地址。
  // （之前用 ?? 判断，用户误点一次「保存」写进空串就会永久失去中转，账号登录随之失效。）
  if (saved === null || saved === '') return DEFAULT_PROXY_BASE || ''
  return saved
}

export function setProxyBase(base) {
  writeStore(STORAGE_KEYS.proxy, base ? String(base).trim() : '')
}

export function getCachedUser() {
  const raw = readStore(STORAGE_KEYS.user)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setCachedUser(user) {
  writeStore(STORAGE_KEYS.user, user ? JSON.stringify(user) : null)
}

/** 当前是否走中转。页面用它提示网络状态 */
export function isProxyEnabled() {
  return Boolean(getProxyBase())
}

/** 中转模式下 API 走 <proxy>/gh，直连时就是 api.github.com */
export function apiBase() {
  const base = getProxyBase()
  return base ? base.replace(/\/+$/, '') + '/gh' : DIRECT_ORIGIN
}

/* ---------------- 限流 ---------------- */

const rateLimit = { limit: 0, remaining: 0, reset: 0, updatedAt: 0 }

export function getRateLimit() {
  return { ...rateLimit }
}

function syncRateLimit(res) {
  const remaining = res.headers.get('x-ratelimit-remaining')
  if (remaining === null) return
  rateLimit.limit = Number(res.headers.get('x-ratelimit-limit') || 0)
  rateLimit.remaining = Number(remaining)
  rateLimit.reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000
  rateLimit.updatedAt = Date.now()
  window.dispatchEvent(new CustomEvent('natb:issue:ratelimit', { detail: getRateLimit() }))
}

/* ---------------- 读缓存 ---------------- */

/**
 * 匿名访客每小时只有 60 次配额，而一次页面加载就要 5 个请求。
 * 这里对 GET 做 60 秒内存缓存，翻页回来、切换视图都不会重复打接口。
 * 缓存键带上认证身份，换账号不会串数据。
 */
const responseCache = new Map()
const CACHE_TTL = 60_000

function cacheKey(path) {
  return (getEffectiveToken() ? 'auth:' : 'anon:') + path
}

export function clearApiCache() {
  responseCache.clear()
}

/* ---------------- 基础请求 ---------------- */

async function parseBody(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function humanize(status, payload) {
  const detail = payload && typeof payload === 'object' ? payload.message : ''
  if (status === 401) return '登录已失效，请重新登录 GitHub'
  if (status === 403 && /rate limit/i.test(detail || '')) return '已触发 GitHub 接口限流，请稍后再试'
  if (status === 403) return detail || '没有权限执行这个操作'
  if (status === 404) return detail || '资源不存在（可能是仓库未公开或编号错误）'
  if (status === 410) return '该内容已被删除'
  if (status === 422) return detail || '提交的内容未通过校验'
  if (status === 429) return '请求过于频繁，请稍后再试'
  if (status >= 500) return 'GitHub 服务暂时不可用，请稍后再试'
  return detail || `请求失败（HTTP ${status}）`
}

/**
 * 统一的 GitHub REST 请求入口。
 * path 以 / 开头时拼在 apiBase() 后；以 http 开头时原样使用（用于 GraphQL 之外的特殊端点）。
 */
export async function gh(path, { method = 'GET', body, auth = true, headers = {}, noCache = false } = {}) {
  const token = getEffectiveToken()
  const url = /^https?:\/\//.test(path) ? path : apiBase() + path

  const useCache = method === 'GET' && body === undefined && !noCache
  const key = useCache ? cacheKey(url) : ''
  if (useCache) {
    const hit = responseCache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data
  }

  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...headers,
  }
  if (auth && token) h.Authorization = `Bearer ${token}`
  if (body !== undefined) h['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)

  let res
  try {
    res = await fetch(url, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    throw new GitHubError(0, 'NETWORK', err)
  } finally {
    clearTimeout(timer)
  }

  syncRateLimit(res)
  const payload = await parseBody(res)

  if (!res.ok) {
    throw new GitHubError(res.status, humanize(res.status, payload), payload)
  }
  if (useCache) {
    responseCache.set(key, { at: Date.now(), data: payload })
  }
  return payload
}

/** GraphQL 入口，用于 REST 覆盖不到的能力（置顶、删除 issue、转移 issue） */
export async function graphql(query, variables = {}) {
  const data = await gh('/graphql', { method: 'POST', body: { query, variables } })
  if (data?.errors?.length) {
    throw new GitHubError(200, data.errors[0].message, data.errors)
  }
  return data?.data
}

/** 拼仓库级路径 */
const repo = (suffix = '') => `/repos/${ISSUE_REPO_FULL}${suffix}`

/* ---------------- 只读接口 ---------------- */

export const githubApi = {
  /** 仓库元信息：issue 开关、计数、权限 */
  getRepo: () => gh(repo()),

  /** issue 列表。parameters 直接透传 GitHub 的查询参数 */
  listIssues: ({ state = 'open', labels = '', assignee = '', milestone = '', sort = 'created', direction = 'desc', page = 1, per_page = 20, since = '' } = {}) => {
    const q = new URLSearchParams({ state, sort, direction, page: String(page), per_page: String(per_page) })
    if (labels) q.set('labels', labels)
    if (assignee) q.set('assignee', assignee)
    if (milestone) q.set('milestone', milestone)
    if (since) q.set('since', since)
    return gh(repo('/issues?' + q.toString()))
  },

  getIssue: (number) => gh(repo(`/issues/${number}`)),

  listComments: (number, { page = 1, per_page = 30 } = {}) =>
    gh(repo(`/issues/${number}/comments?page=${page}&per_page=${per_page}`)),

  /** 时间线事件：关闭、重开、打标签、指派、引用等 */
  listTimeline: (number, { page = 1, per_page = 30 } = {}) =>
    gh(repo(`/issues/${number}/timeline?page=${page}&per_page=${per_page}`)),

  search: (q, { sort = 'created', order = 'desc', page = 1, per_page = 20 } = {}) => {
    const qs = new URLSearchParams({ q, sort, order, page: String(page), per_page: String(per_page) })
    return gh(`/search/issues?${qs.toString()}`)
  },

  listLabels: ({ per_page = 100 } = {}) => gh(repo(`/labels?per_page=${per_page}`)),

  listMilestones: ({ state = 'open', per_page = 100 } = {}) =>
    gh(repo(`/milestones?state=${state}&per_page=${per_page}`)),

  listAssignableUsers: ({ per_page = 100 } = {}) => gh(repo(`/assignees?per_page=${per_page}`)),

  /** 当前登录用户在该仓库的权限：admin / maintain / write / triage / read */
  getPermission: (login) => gh(repo(`/collaborators/${encodeURIComponent(login)}/permission`)),

  getMe: () => gh('/user'),

  /** 当前用户是否已订阅该 issue */
  getSubscription: (number) => gh(repo(`/issues/${number}/subscription`)),

  /** 谁能被指派：GitHub 会返回 404/403，调用方需要容错 */
  listCollaborators: ({ per_page = 100 } = {}) => gh(repo(`/collaborators?per_page=${per_page}`)),

  listReactions: (number) => gh(repo(`/issues/${number}/reactions`)),
}

/* ---------------- 写入接口 ---------------- */

export const githubWriteApi = {
  createIssue: ({ title, body = '', labels = [], assignees = [], milestone = null }) =>
    gh(repo('/issues'), {
      method: 'POST',
      body: { title, body, labels, assignees, ...(milestone ? { milestone } : {}) },
    }),

  updateIssue: (number, patch) => gh(repo(`/issues/${number}`), { method: 'PATCH', body: patch }),

  closeIssue: (number, reason = 'completed') =>
    gh(repo(`/issues/${number}`), { method: 'PATCH', body: { state: 'closed', state_reason: reason } }),

  reopenIssue: (number) => gh(repo(`/issues/${number}`), { method: 'PATCH', body: { state: 'open' } }),

  setLabels: (number, labels) => gh(repo(`/issues/${number}/labels`), { method: 'PUT', body: { labels } }),

  createComment: (number, body) => gh(repo(`/issues/${number}/comments`), { method: 'POST', body: { body } }),

  updateComment: (commentId, body) => gh(repo(`/issues/comments/${commentId}`), { method: 'PATCH', body: { body } }),

  deleteComment: (commentId) => gh(repo(`/issues/comments/${commentId}`), { method: 'DELETE' }),

  lockIssue: (number) => gh(repo(`/issues/${number}/lock`), { method: 'PUT', body: { lock_reason: 'resolved' } }),

  unlockIssue: (number) => gh(repo(`/issues/${number}/lock`), { method: 'DELETE' }),

  /** content 取 +1 / -1 / laugh / hooray / confused / heart / rocket / eyes */
  addReaction: (number, content) =>
    gh(repo(`/issues/${number}/reactions`), { method: 'POST', body: { content } }),

  removeReaction: (number, reactionId) =>
    gh(repo(`/issues/${number}/reactions/${reactionId}`), { method: 'DELETE' }),

  setSubscription: (number) => gh(repo(`/issues/${number}/subscription`), { method: 'PUT', body: { subscribed: true } }),

  deleteSubscription: (number) => gh(repo(`/issues/${number}/subscription`), { method: 'DELETE' }),

  /** 标签管理 */
  createLabel: ({ name, color, description = '' }) =>
    gh(repo('/labels'), { method: 'POST', body: { name, color, description } }),

  updateLabel: (name, patch) => gh(repo(`/labels/${encodeURIComponent(name)}`), { method: 'PATCH', body: patch }),

  deleteLabel: (name) => gh(repo(`/labels/${encodeURIComponent(name)}`), { method: 'DELETE' }),

  /** 里程碑管理 */
  createMilestone: ({ title, description = '', due_on = null, state = 'open' }) =>
    gh(repo('/milestones'), {
      method: 'POST',
      body: { title, description, state, ...(due_on ? { due_on } : {}) },
    }),

  updateMilestone: (number, patch) =>
    gh(repo(`/milestones/${number}`), { method: 'PATCH', body: patch }),

  deleteMilestone: (number) => gh(repo(`/milestones/${number}`), { method: 'DELETE' }),

  /** 指派：传空数组即清空 */
  setAssignees: (number, assignees) =>
    gh(repo(`/issues/${number}/assignees`), { method: 'POST', body: { assignees } }),

  /** 置顶需要 GraphQL 与写权限 */
  pinIssue: async (number) => {
    const data = await graphql(
      `mutation($id: ID!) { pinIssue(input: { issueId: $id }) { issue { id } } }`,
      { id: await issueNodeId(number) },
    )
    return data
  },

  unpinIssue: async (number) => {
    const data = await graphql(
      `mutation($id: ID!) { unpinIssue(input: { issueId: $id }) { issue { id } } }`,
      { id: await issueNodeId(number) },
    )
    return data
  },

  /** 删除 issue 也只有 GraphQL 有 */
  deleteIssue: async (number) => {
    const data = await graphql(
      `mutation($id: ID!) { deleteIssue(input: { issueId: $id }) { clientMutationId } }`,
      { id: await issueNodeId(number) },
    )
    return data
  },

  /** 转移 issue 到另一个仓库 */
  transferIssue: (number, repositoryId) =>
    graphql(
      `mutation($id: ID!, $repo: ID!) { transferIssue(input: { issueId: $id, repositoryId: $repo }) { issue { url } } }`,
      { id: null, repo: repositoryId },
    ),
}

/** 取 issue 的 GraphQL node id（置顶 / 删除 / 转移都需要） */
async function issueNodeId(number) {
  const data = await graphql(
    `query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) { id }
      }
    }`,
    { owner: ISSUE_REPO.owner, name: ISSUE_REPO.name, number },
  )
  const id = data?.repository?.issue?.id
  if (!id) throw new GitHubError(404, '找不到该 issue')
  return id
}

/** 探测当前网络能否直连 GitHub（给「连接设置」用） */
export async function probeConnection(base) {
  const url = (base ? base.replace(/\/+$/, '') + '/gh' : DIRECT_ORIGIN) + '/rate_limit'
  const started = performance.now()
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
    const ms = Math.round(performance.now() - started)
    if (!res.ok) return { ok: false, ms, status: res.status }
    return { ok: true, ms, status: res.status }
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - started), status: 0, error: String(err) }
  }
}
