/**
 * 改 issue 的标签 / 里程碑 / 指派。
 * 统一经过中转的 PATCH /issue/:n/meta：权限判断（管理 / 作者本人）在服务端做，
 * 前端只负责把当前身份的令牌带上。
 */
import { DEFAULT_PROXY_BASE } from '@/config/github'
import { getProxyBase, getToken, isCredentialInvalid, notifyCredentialExpired, clearApiCache, errorText } from '@/api/github'
import { getQqToken } from '@/api/qqAuth'

function identityToken() {
  // GitHub 身份优先：管理员与协作者都用它
  return getToken() || getQqToken()
}

/** 删除 issue：GitHub 只允许仓库 admin 删，普通作者直连必失败，所以统一走中转由机器人代删 */
export async function deleteIssue(number) {
  const token = identityToken()
  if (!token) throw new Error('请先登录')
  const root = (getProxyBase() || DEFAULT_PROXY_BASE || '').replace(/\/$/, '')
  if (!root) throw new Error('没有配置中转地址')

  let res
  try {
    res = await fetch(root + '/issue/' + number, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    })
  } catch {
    throw new Error('连不上中转服务')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (isCredentialInvalid(res.status, data)) notifyCredentialExpired(getToken() ? 'gh' : 'qq')
    throw new Error(errorText(data, '删除失败'))
  }
  clearApiCache()
  return data
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
    // 凭据失效：让 store 过 2 秒退出并弹登录框，而不是留着一个假的登录态
    if (isCredentialInvalid(res.status, data)) notifyCredentialExpired(getToken() ? 'gh' : 'qq')
    throw new Error(errorText(data, '保存失败'))
  }
  // 这条写路径不经过 gh()，那一层 60 秒 GET 缓存不知道有人写过东西；
  // 不作废的话，紧接着重拉时间线拿到的还是改之前的内容。
  clearApiCache()
  return data
}
