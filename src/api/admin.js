/**
 * 管理端：用户列表与封禁。
 * 走中转的 /admin/*。凭据优先用 GitHub token，没有就退到 QQ 会话令牌——
 * 管理权看的是「这个人在这仓库里是什么角色」，不看用什么方式登录。
 */
import { DEFAULT_PROXY_BASE } from '@/config/github'
import { getProxyBase, getToken, isCredentialInvalid, notifyCredentialExpired, errorText } from '@/api/github'
import { getQqToken } from '@/api/qqAuth'

async function request(path, { method = 'GET', body } = {}) {
  // 只用真实登录凭据：开发环境的只读兜底 token 是给公开数据用的，调管理接口只会得到 403
  const ghToken = getToken()
  const token = ghToken || getQqToken()
  if (!token) throw new Error('需要先登录才能管理用户')
  const root = (getProxyBase() || DEFAULT_PROXY_BASE || '').replace(/\/$/, '')
  if (!root) throw new Error('没有配置中转地址')
  const res = await fetch(root + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // 凭据不再被承认：交给 store 延迟退出并弹登录框，而不是留着假的登录态
    if (isCredentialInvalid(res.status, data)) notifyCredentialExpired(ghToken ? 'gh' : 'qq')
    throw new Error(errorText(data, '请求失败（HTTP ' + res.status + '）'))
  }
  return data
}

export const adminApi = {
  /** QQ 身份列表 */
  listUsers: (cursor) =>
    request('/admin/users' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '')),
  /** GitHub 账号列表 */
  listGhUsers: () => request('/admin/users?scope=gh'),

  banQq: (sub, { reason, days, banIp }) =>
    request('/admin/ban', { method: 'POST', body: { target: 'qq', sub, reason, days, banIp } }),
  unbanQq: (sub) => request('/admin/unban', { method: 'POST', body: { target: 'qq', sub } }),

  banGh: (login, { reason, days, banIp }) =>
    request('/admin/ban', { method: 'POST', body: { target: 'gh', login, reason, days, banIp } }),
  unbanGh: (login) => request('/admin/unban', { method: 'POST', body: { target: 'gh', login } }),
}
