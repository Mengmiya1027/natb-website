/**
 * 管理端：QQ 用户列表与封禁。
 * 走中转的 /admin/*，凭据是管理员的 GitHub token（Worker 会回查仓库权限）。
 */
import { DEFAULT_PROXY_BASE } from '@/config/github'
import { getProxyBase, getToken } from '@/api/github'

async function request(path, { method = 'GET', body } = {}) {
  // 只用真实登录凭据：开发环境的只读兜底 token 是给公开数据用的，调管理接口只会得到 403
  const token = getToken()
  if (!token) throw new Error('需要先登录 GitHub 才能管理用户（QQ 登录没有管理权限）')
  const root = (getProxyBase() || DEFAULT_PROXY_BASE || '').replace(/\/$/, '')
  if (!root) throw new Error('没有配置中转地址')
  const res = await fetch(root + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || '请求失败（HTTP ' + res.status + '）')
  }
  return data
}

export const adminApi = {
  listUsers: (cursor) => request('/admin/users' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '')),
  ban: (sub, { reason, days, banIp }) =>
    request('/admin/ban', { method: 'POST', body: { sub, reason, days, banIp } }),
  unban: (sub) => request('/admin/unban', { method: 'POST', body: { sub } }),
}
