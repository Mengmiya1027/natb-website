/**
 * 管理端：QQ 用户列表与封禁。
 * 走中转的 /admin/*，凭据是管理员的 GitHub token（Worker 会回查仓库权限）。
 */
import { DEFAULT_PROXY_BASE } from '@/config/github'
import { getProxyBase, getEffectiveToken } from '@/api/github'

async function request(path, { method = 'GET', body } = {}) {
  const token = getEffectiveToken()
  if (!token) throw new Error('需要 GitHub Token 才能管理用户')
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
