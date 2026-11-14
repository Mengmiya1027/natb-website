/**
 * QQ 用户的写操作：全部经过中转，由 GitHub App 身份代发。
 * 与 githubWriteApi 保持同形的入参/出参，调用方只换实现。
 */
import { DEFAULT_PROXY_BASE } from '@/config/github'
import { getProxyBase } from '@/api/github'
import { QqAuthError, getQqToken } from '@/api/qqAuth'

function base() {
  return (getProxyBase() || DEFAULT_PROXY_BASE || '').replace(/\/$/, '')
}

async function request(path, { method = 'POST', body } = {}) {
  const token = getQqToken()
  if (!token) throw new QqAuthError(401, '请先登录')
  const root = base()
  if (!root) throw new QqAuthError(0, '没有配置中转地址')

  let res
  try {
    res = await fetch(root + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new QqAuthError(0, '连不上中转服务', err)
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new QqAuthError(res.status, (data && (data.message || data.error)) || '请求失败', data)
  }
  return data
}

export const qqWriteApi = {
  createIssue: ({ title, body, labels, milestone }) =>
    request('/qq/issue', { method: 'POST', body: { title, body, labels, milestone } }),
  createComment: (number, body) =>
    request('/qq/issue/' + number + '/comment', { method: 'POST', body: { body } }),
  closeIssue: (number) => request('/qq/issue/' + number, { method: 'PATCH', body: { state: 'closed' } }),
}
