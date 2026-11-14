/**
 * 改 issue 的标签 / 里程碑 / 指派。
 * 统一经过中转的 PATCH /issue/:n/meta：权限判断（管理 / 作者本人）在服务端做，
 * 前端只负责把当前身份的令牌带上。
 */
import { DEFAULT_PROXY_BASE } from '@/config/github'
import { getProxyBase, getToken } from '@/api/github'
import { getQqToken } from '@/api/qqAuth'

function identityToken() {
  // GitHub 身份优先：管理员与协作者都用它
  return getToken() || getQqToken()
}

export async function updateIssueMeta(number, patch) {
  const token = identityToken()
  if (!token) throw new Error('请先登录')
  const root = (getProxyBase() || DEFAULT_PROXY_BASE || '').replace(/\/$/, '')
  if (!root) throw new Error('没有配置中转地址')

  let res
  try {
    res = await fetch(root + '/issue/' + number + '/meta', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(patch),
    })
  } catch (err) {
    throw new Error('连不上中转服务')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || '保存失败')
  }
  return data
}
