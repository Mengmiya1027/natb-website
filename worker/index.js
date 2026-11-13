/**
 * NATB Issue 页的 GitHub 中转。
 *
 * 它只做两件事，都很薄：
 *   1. /gh/*     把请求原样转给 api.github.com（透传 Authorization 与全部响应头）
 *   2. /oauth/*  把请求转给 github.com/login/oauth（Device Flow 换 token 的唯一通道）
 *
 * 为什么要它：
 *   - GitHub 的 OAuth 端点不返回 CORS 头，纯静态页拿不到 token；
 *   - 国内网络直连 api.github.com 常被污染，中转可以被自定义域名救回来。
 *
 * 可选：绑一个只读 token（GITHUB_READ_TOKEN），让匿名访客的限额从 60/h 变成 5000/h。
 * 只在请求没带 Authorization 时才用它，登录用户永远走自己的 token。
 */

const GITHUB_API = 'https://api.github.com'
const GITHUB_OAUTH = 'https://github.com/login/oauth'

/** 允许的站点来源。部署后把你的 Pages 域名填进来；* 是本地开发兜底 */
const DEFAULT_ORIGINS = [
  'https://mengmiya1027.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function corsHeaders(origin, env) {
  const allowed = (env?.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const list = allowed.length ? allowed : DEFAULT_ORIGINS
  const ok = list.includes('*') || list.includes(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : list[0],
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version',
    'Access-Control-Expose-Headers': 'ETag, Link, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin, env) },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''
    const cors = corsHeaders(origin, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    try {
      if (url.pathname.startsWith('/gh/')) {
        return await forwardToApi(request, url, env, cors)
      }
      if (url.pathname.startsWith('/oauth/')) {
        return await forwardToOAuth(request, url, cors)
      }
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({ ok: true, service: 'natb-issue-proxy' }, 200, origin, env)
      }
      return json({ error: 'not_found' }, 404, origin, env)
    } catch (err) {
      return json({ error: 'upstream_failed', message: String(err) }, 502, origin, env)
    }
  },
}

async function forwardToApi(request, url, env, cors) {
  const target = GITHUB_API + url.pathname.slice('/gh'.length) + url.search

  const headers = new Headers()
  headers.set('Accept', request.headers.get('Accept') || 'application/vnd.github+json')
  headers.set('User-Agent', 'natb-issue-proxy')

  const incomingAuth = request.headers.get('Authorization')
  if (incomingAuth) {
    headers.set('Authorization', incomingAuth)
  } else if (env?.GITHUB_READ_TOKEN) {
    // 匿名访客借用只读 token：限于读，写操作本来就需要用户自己的 token
    headers.set('Authorization', 'Bearer ' + env.GITHUB_READ_TOKEN)
  }

  const apiVersion = request.headers.get('X-GitHub-Api-Version')
  if (apiVersion) headers.set('X-GitHub-Api-Version', apiVersion)

  const init = { method: request.method, headers }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
    const contentType = request.headers.get('Content-Type')
    if (contentType) headers.set('Content-Type', contentType)
  }

  const res = await fetch(target, init)
  const outHeaders = new Headers(cors)
  // 这些标头前端要用（分页、限流、缓存校验），必须透传
  for (const key of ['Content-Type', 'ETag', 'Link', 'Last-Modified', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']) {
    const value = res.headers.get(key)
    if (value) outHeaders.set(key, value)
  }
  return new Response(res.body, { status: res.status, headers: outHeaders })
}

async function forwardToOAuth(request, url, cors) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }
  // GitHub 把这两个端点放在两个不同的父路径下：
  //   POST /login/device/code      ← 取设备码（注意没有 /oauth）
  //   POST /login/oauth/access_token ← 换 token
  const sub = url.pathname.slice('/oauth'.length)
  const target = sub.startsWith('/device')
    ? 'https://github.com/login' + sub
    : GITHUB_OAUTH + sub
  const res = await fetch(target, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
      'User-Agent': 'natb-issue-proxy',
    },
    body: await request.arrayBuffer(),
  })
  const outHeaders = new Headers(cors)
  outHeaders.set('Content-Type', 'application/json')
  return new Response(res.body, { status: res.status, headers: outHeaders })
}
