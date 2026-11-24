/**
 * QQ 身份与 GitHub 账号的绑定关系。
 *
 * 绑定的本质是「证明这两个账号归同一个人」。QQ 侧的证明是会话令牌，
 * GitHub 侧的证明必须是他当场重新授权拿回来的 token —— 本地已经存着的那一枚
 * 不算数：公用电脑上前一个人登录的 GitHub 还留在浏览器里，拿它绑定等于冒名。
 */
import { DEFAULT_PROXY_BASE } from '@/config/github'
import { getProxyBase, getToken, isCredentialInvalid, notifyCredentialExpired, errorText } from '@/api/github'
import { getQqToken } from '@/api/qqAuth'

export class LinkError extends Error {
  constructor(status, message, payload) {
    super(message)
    this.name = 'LinkError'
    this.status = status
    this.payload = payload
  }
}

function base() {
  const configured = getProxyBase()
  return (configured || DEFAULT_PROXY_BASE || '').replace(/\/$/, '')
}

/**
 * quiet: 只读查询用。这类请求的失败只代表「这次没问出来」，不代表凭据不可用——
 * 之前查一次绑定关系（/auth/identity）被 GitHub 限流，就会把整站登录态清掉。
 */
async function call(path, { method = 'GET', body, token, quiet = false } = {}) {
  const root = base()
  if (!root) throw new LinkError(0, '没有配置中转地址，无法使用账号绑定')
  let res
  try {
    res = await fetch(root + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new LinkError(0, '连不上中转服务，检查网络或稍后再试', err)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // 凭据不再被承认：交给 store 延迟退出并弹登录框，而不是留着假的登录态
    if (!quiet && token && isCredentialInvalid(res.status, data))
      notifyCredentialExpired(token === getQqToken() ? 'qq' : 'gh')
    const message = errorText(data, '请求失败（HTTP ' + res.status + '）')
    throw new LinkError(res.status, message, data)
  }
  return data
}

/** GitHub 侧：当前这个 GitHub 账号绑了哪个 QQ 身份 */
export function fetchGhIdentity() {
  const token = getToken()
  if (!token) return Promise.resolve(null)
  /* quiet：这只是一次「我和哪个 QQ 绑了」的查询，查不到就当没有。
   * 真正的失效判定留给 bootstrap 里的 /user —— 那里 401 才是凭据真的没了。 */
  return call('/auth/identity', { token, quiet: true }).catch(() => null)
}

/**
 * 绑定。两个方向都能发起，免得用户为了绑另一个账号先把当前身份退掉：
 *   当前是 QQ 身份    → 传 ghToken（刚走完 GitHub 授权拿到的）
 *   当前是 GitHub 身份 → 传 qqToken（刚收验证码拿到的）
 */
export function bindAccounts({ ghToken, qqToken } = {}) {
  if (ghToken) return call('/auth/bind', { method: 'POST', body: { ghToken }, token: getQqToken() })
  if (qqToken) return call('/auth/bind', { method: 'POST', body: { qqToken }, token: getToken() })
  return Promise.reject(new LinkError(0, '缺少需要验证的一侧凭据'))
}

export function unbindAccounts(who) {
  const token = who === 'qq' ? getQqToken() : getToken()
  if (!token) return Promise.reject(new LinkError(401, '请先登录'))
  return call('/auth/unbind', { method: 'POST', body: {}, token })
}
