/**
 * QQ 邮箱身份：验证码登录 + 会话令牌。
 *
 * 与 GitHub 登录是两套独立凭据：
 *   GitHub → 用户自己的 token，直接读写 api.github.com
 *   QQ     → 中转签发的 HMAC 令牌，所有写操作都经过 Worker 代发
 *
 * 令牌存 localStorage，服务端无状态（只验签），所以退出登录纯粹是本地清除。
 */
import { DEFAULT_PROXY_BASE, STORAGE_KEYS } from '@/config/github'
import { getProxyBase } from '@/api/github'

const QQ_TOKEN_KEY = 'natb:qq:token'
const QQ_USER_KEY = 'natb:qq:user'

export class QqAuthError extends Error {
  constructor(status, message, payload) {
    super(message)
    this.name = 'QqAuthError'
    this.status = status
    this.payload = payload
  }
}

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
    /* 隐私模式写不进去，退化成内存态 */
  }
}

export function getQqToken() {
  return readStore(QQ_TOKEN_KEY) || ''
}

export function setQqToken(token) {
  writeStore(QQ_TOKEN_KEY, token || null)
}

export function getQqUser() {
  const raw = readStore(QQ_USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setQqUser(user) {
  writeStore(QQ_USER_KEY, user ? JSON.stringify(user) : null)
}

export function clearQqSession() {
  writeStore(QQ_TOKEN_KEY, null)
  writeStore(QQ_USER_KEY, null)
}

function base() {
  const configured = getProxyBase()
  return (configured || DEFAULT_PROXY_BASE || '').replace(/\/$/, '')
}

async function post(path, body, { token } = {}) {
  const root = base()
  if (!root) {
    throw new QqAuthError(0, '没有配置中转地址，无法使用 QQ 登录')
  }
  let res
  try {
    res = await fetch(root + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify(body || {}),
    })
  } catch (err) {
    throw new QqAuthError(0, '连不上中转服务，检查网络或稍后再试', err)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || '请求失败（HTTP ' + res.status + '）'
    throw new QqAuthError(res.status, message, data)
  }
  return data
}

/** 发验证码。开发期 Worker 没配 RESEND_API_KEY 时会把码直接回在 debug 字段里 */
export async function sendCode(email) {
  return post('/auth/code', { email })
}

/** 校验验证码并拿到会话令牌 */
export async function verifyCode(email, code, nick) {
  const data = await post('/auth/token', { email, code, nick })
  if (data && data.token) {
    setQqToken(data.token)
    setQqUser(data.user || null)
  }
  return data
}

/** 用令牌换回身份，顺带取封禁状态 */
export async function fetchMe() {
  const token = getQqToken()
  if (!token) return null
  const root = base()
  if (!root) return null
  let res
  try {
    res = await fetch(root + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })
  } catch {
    return null
  }
  if (res.status === 401) {
    clearQqSession()
    return null
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) return null
  if (data.user) setQqUser(data.user)
  return data
}
