/**
 * QQ 用户的公开资料：昵称、头像、署名归属。
 *
 * 正文里只存 sub（哈希），昵称和头像存在 Worker 的 KV 里，
 * 所以每次渲染前都要按 sub 批量换一次，改昵称后老帖子会跟着变。
 */
import { DEFAULT_PROXY_BASE } from '@/config/github'
import { getProxyBase } from '@/api/github'
import { getQqToken } from '@/api/qqAuth'

function base() {
  const configured = getProxyBase()
  return (configured || DEFAULT_PROXY_BASE || '').replace(/\/$/, '')
}

/** 公开页面走中转：URL 里只有哈希，页面源码里看不到 QQ 号 */
export function avatarUrlOf(sub) {
  if (!sub) return ''
  const root = base()
  return root ? root + '/avatar/' + sub : ''
}

/**
 * 已经知道 QQ 号的场景（管理员选人、用户看自己）直接问腾讯，
 * 不再让自家 Worker 转发一遍——那点流量省下来更划算。
 */
export function directAvatarUrl(qq, size = 100) {
  const id = String(qq || '').trim()
  if (!/^\d{5,11}$/.test(id)) return ''
  return 'https://q1.qlogo.cn/g?b=qq&nk=' + id + '&s=' + size
}

/** 批量取昵称与头像；查不到的 sub 不会出现在返回里，由调用方兜底 */
export async function fetchProfiles(subs, token) {
  const list = [...new Set((subs || []).filter((s) => /^[0-9a-f]{6,32}$/.test(String(s))))].slice(0, 100)
  if (!list.length) return {}
  const root = base()
  if (!root) return {}
  try {
    const res = await fetch(root + '/profile/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({ subs: list }),
    })
    if (!res.ok) return {}
    const data = await res.json().catch(() => null)
    return (data && data.profiles) || {}
  } catch {
    return {}
  }
}

/** 管理员专用：取这条内容当前归属的 QQ 号 */
export async function fetchOwner(sub) {
  const root = base()
  const token = getQqToken()
  if (!root) throw new Error('没有配置中转地址')
  const res = await fetch(root + '/profile/owner?sub=' + encodeURIComponent(sub), {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data && data.message) || '取不到这条内容的归属')
  return data
}

/** 管理员专用：手填一个库里没有的 QQ 号，即时建档并返回它的 sub */
export async function createPlaceholder(qq) {
  const root = base()
  const token = getQqToken()
  if (!root) throw new Error('没有配置中转地址')
  const res = await fetch(root + '/profile/placeholder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ qq: String(qq || '').trim() }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data && data.message) || '建档失败')
  return data
}
