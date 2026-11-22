/**
 * QQ 用户的写操作：全部经过中转，由 GitHub App 身份代发。
 * 与 githubWriteApi 保持同形的入参/出参，调用方只换实现。
 */
import { DEFAULT_PROXY_BASE } from '@/config/github'
import {
  getProxyBase,
  clearApiCache,
  isCredentialInvalid,
  notifyCredentialExpired,
  errorText,
  getToken,
} from '@/api/github'
import { QqAuthError, getQqToken } from '@/api/qqAuth'

function base() {
  return (getProxyBase() || DEFAULT_PROXY_BASE || '').replace(/\/$/, '')
}

async function request(path, { method = 'POST', body } = {}) {
  // QQ 令牌优先；没有就带 GitHub 令牌——编辑 QQ 评论时，GitHub 身份的管理员
  // 也要能落到中转（那边的评论作者是机器人，他手上的 token 改不了）
  const token = getQqToken() || getToken()
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
    // 会话不算数了：交给 store 延迟退出并弹登录框，否则顶栏挂着假的已登录
    if (isCredentialInvalid(res.status, data)) notifyCredentialExpired('qq')
    throw new QqAuthError(res.status, errorText(data, '请求失败'), data)
  }
  // QQ 的写操作走中转，不经过 gh()，所以那一层 60 秒 GET 缓存不会自己失效。
  // 不在这里作废的话，写完立刻重新拉取拿到的还是写之前的旧数据。
  clearApiCache()
  return data
}

export const qqWriteApi = {
  createIssue: ({ title, body, labels, milestone, assignees }) =>
    request('/qq/issue', { method: 'POST', body: { title, body, labels, milestone, assignees } }),
  createComment: (number, body) =>
    request('/qq/issue/' + number + '/comment', { method: 'POST', body: { body } }),
  closeIssue: (number) => request('/qq/issue/' + number, { method: 'PATCH', body: { state: 'closed' } }),
  deleteIssue: (number) => request('/qq/issue/' + number, { method: 'DELETE' }),
  updateComment: (commentId, body) =>
    request('/qq/comment/' + commentId, { method: 'PATCH', body: { body } }),
  deleteComment: (commentId) => request('/qq/comment/' + commentId, { method: 'DELETE' }),
}
