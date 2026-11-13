import { OAUTH_CLIENT_ID, OAUTH_SCOPES } from '@/config/github'
import { getProxyBase } from './github'

/**
 * GitHub Device Flow。
 *
 * 纯静态站没有服务端，OAuth Web Flow 换 token 的端点又不支持 CORS，
 * Device Flow 是唯一能安全工作且不需要 client secret 的方案。
 * 它同样需要 CORS，所以实现上必须走加速中转；没有中转时由 store 降级到 PAT。
 */

function oauthBase() {
  return getProxyBase().replace(/\/+$/, '') + '/oauth'
}

/**
 * Device Flow 只在「配置了 Client ID 且配置了加速中转」时可用。
 *
 * GitHub 的 OAuth 端点不返回 CORS 头，浏览器直连拿不到响应；
 * 真实站点必须经 worker/ 下的中转（见 worker/README.md）。
 * 没配中转时不做无谓的尝试，直接引导用户用 Token 登录。
 */
export function isDeviceFlowAvailable() {
  return Boolean(OAUTH_CLIENT_ID && getProxyBase())
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { error: 'parse_failed', raw: text }
  }
}

/** 第一步：拿到 8 位用户码 */
export async function startDeviceFlow() {
  if (!OAUTH_CLIENT_ID) throw new Error('未配置 OAuth Client ID')
  const data = await postJson(oauthBase() + '/device/code', {
    client_id: OAUTH_CLIENT_ID,
    scope: OAUTH_SCOPES,
  })
  if (data.error) throw new Error(data.error_description || data.error)
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete,
    expiresIn: data.expires_in,
    interval: Math.max(data.interval || 5, 5),
  }
}

/** 第二步：轮询换 token。authorization_pending 是正常的等待态 */
export async function pollDeviceToken(deviceCode) {
  if (!OAUTH_CLIENT_ID) throw new Error('未配置 OAuth Client ID')
  return postJson(oauthBase() + '/access_token', {
    client_id: OAUTH_CLIENT_ID,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })
}
