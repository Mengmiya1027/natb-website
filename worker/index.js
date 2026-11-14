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
    'Access-Control-Expose-Headers':
      'ETag, Link, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After',
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


/* ============================================================
 * QQ 邮箱身份
 *   1. /auth/code  → 发 6 位验证码（Resend）
 *   2. /auth/token → 校验换 HMAC 会话令牌
 *   3. /qq/*       → 用 GitHub App 的 installation token 代发 issue / 评论
 * 所有状态放 KV（env.NATB_KV），令牌本身无状态、只验签。
 * ============================================================ */

const QQ_MAIL_DOMAINS = ['qq.com', 'foxmail.com']
const QQ_REPO = 'Mengmiya1027/NATB-Cli-issue'
const CODE_TTL = 600
const CODE_MAX_TRIES = 5
const SESSION_TTL = 7 * 24 * 3600
const WRITE_LIMIT_PER_MIN = 5

function bytesToB64url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(env, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_SECRET || 'no-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))
}

/** 邮箱归一化：去空白、转小写；同一邮箱只有一种写法，否则会变成两个身份 */
function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase()
}

function mailDomainAllowed(email) {
  const at = email.lastIndexOf('@')
  if (at < 1) return false
  return QQ_MAIL_DOMAINS.includes(email.slice(at + 1))
}

/** 身份标识：邮箱哈希前 16 位，服务端也不保存邮箱原文以外的关联 */
async function subjectOf(env, email) {
  return (await sha256Hex(email + '|' + (env.SESSION_SECRET || ''))).slice(0, 16)
}

function maskEmail(email) {
  const [name, domain] = email.split('@')
  const head = name.slice(0, 2)
  return head + '***@' + domain
}

async function kvJson(env, key) {
  const raw = await env.NATB_KV.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function kvSet(env, key, value, ttl) {
  await env.NATB_KV.put(key, typeof value === 'string' ? value : JSON.stringify(value), {
    expirationTtl: Math.max(60, ttl),
  })
}

/** KV 没有原子自增，并发下会少算；这里的用途是挡刷屏，允许轻微超发 */
async function bump(env, key, ttl) {
  const next = Number((await env.NATB_KV.get(key)) || 0) + 1
  await kvSet(env, key, String(next), ttl)
  return next
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function hourBucket() {
  return new Date().toISOString().slice(0, 13)
}

function minuteBucket() {
  return Math.floor(Date.now() / 60000)
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || '0.0.0.0'
}

async function signSession(env, payload) {
  const body = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = bytesToB64url(await hmac(env, body))
  return body + '.' + sig
}

async function verifySession(env, request) {
  const header = request.headers.get('Authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  const expect = bytesToB64url(await hmac(env, body))
  if (expect !== sig) return null
  let payload
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)))
  } catch {
    return null
  }
  if (!payload || !payload.sub || payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

async function readJsonBody(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/* ---------------- 发信 ---------------- */

function codeMailHtml(code) {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#111">',
    '<p>你在 NATB 官网请求登录，验证码是：</p>',
    '<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">' + code + '</p>',
    '<p style="color:#666">10 分钟内有效。不是你本人操作的话，忽略这封邮件即可。</p>',
    '</div>',
  ].join('')
}

async function sendCodeMail(env, email, code) {
  if (!env.RESEND_API_KEY) {
    // 没配发信通道时把验证码回给调用方，仅用于本地联调
    return { debug: true }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: (env.RESEND_FROM_NAME || 'NATB Issue') + ' <' + (env.RESEND_FROM_EMAIL || 'noreply@mail.wgdocs.ddns-ip.net') + '>',
      to: [email],
      subject: 'NATB 登录验证码：' + code,
      html: codeMailHtml(code),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error('发信失败（Resend ' + res.status + '）：' + text.slice(0, 200))
  }
  return { debug: false }
}

/* ---------------- GitHub App ---------------- */

/** GitHub 下载的 pem 是 PKCS#1，WebCrypto 只认 PKCS#8，这里补一层 ASN.1 头 */
function pemToPkcs8(pem) {
  const b64 = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const pkcs1 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) pkcs1[i] = bin.charCodeAt(i)
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) return pkcs1

  const wrap = (tag, body) => {
    const len = body.length
    const head = len < 0x80 ? [len] : len < 0x100 ? [0x81, len] : [0x82, (len >> 8) & 0xff, len & 0xff]
    return Uint8Array.from([tag, ...head, ...body])
  }
  const algId = Uint8Array.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ])
  // PKCS#8 = SEQUENCE { INTEGER 0, AlgorithmIdentifier, OCTET STRING { PKCS#1 } }
  // 少了开头那个 version 字段，importKey 会报 Invalid keyData
  const version = Uint8Array.from([0x02, 0x01, 0x00])
  const octet = wrap(0x04, pkcs1)
  const inner = new Uint8Array(version.length + algId.length + octet.length)
  inner.set(version)
  inner.set(algId, version.length)
  inner.set(octet, version.length + algId.length)
  return wrap(0x30, inner)
}

async function appJwt(env) {
  const now = Math.floor(Date.now() / 1000)
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = bytesToB64url(
    new TextEncoder().encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(env.GITHUB_APP_ID) })),
  )
  const data = header + '.' + payload
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(env.GITHUB_APP_PRIVATE_KEY || ''),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data)))
  return data + '.' + bytesToB64url(sig)
}

let installationCache = { token: '', expiresAt: 0 }

async function installationToken(env) {
  const now = Math.floor(Date.now() / 1000)
  if (installationCache.token && installationCache.expiresAt - 300 > now) return installationCache.token

  const jwt = await appJwt(env)
  const res = await fetch(
    'https://api.github.com/app/installations/' + env.GITHUB_INSTALLATION_ID + '/access_tokens',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + jwt,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'natb-issue-proxy',
      },
    },
  )
  const data = await res.json()
  if (!res.ok || !data.token) {
    throw new Error('换取 installation token 失败：' + JSON.stringify(data).slice(0, 200))
  }
  installationCache = {
    token: data.token,
    expiresAt: Math.floor(new Date(data.expires_at).getTime() / 1000),
  }
  return data.token
}

async function githubWrite(env, path, init) {
  const token = await installationToken(env)
  const res = await fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'natb-issue-proxy',
      ...(init && init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error((data && data.message) || 'GitHub 写入失败')
    err.status = res.status
    throw err
  }
  return data
}

/* ---------------- 身份断言：验签 + 封禁 + 限流 ---------------- */

async function requireWriter(env, request, cors) {
  const session = await verifySession(env, request)
  if (!session) return { error: json({ error: 'unauthorized' }, 401, request.headers.get('Origin') || '', env) }

  const ban = await kvJson(env, 'ban:' + session.sub)
  if (ban && (ban.until === 0 || ban.until > Date.now())) {
    const until = ban.until === 0 ? '永久' : new Date(ban.until).toISOString().slice(0, 10)
    return { error: json({ error: 'banned', until }, 403, request.headers.get('Origin') || '', env) }
  }

  const ipBan = await env.NATB_KV.get('ban:ip:' + clientIp(request))
  if (ipBan) {
    return { error: json({ error: 'banned', until: 'IP 已临时封禁' }, 403, request.headers.get('Origin') || '', env) }
  }

  const used = await bump(env, 'rl:' + session.sub + ':' + minuteBucket(), 120)
  if (used > WRITE_LIMIT_PER_MIN) {
    const wait = 60 - (Math.floor(Date.now() / 1000) % 60)
    const out = json(
      { error: 'rate_limited', limit: WRITE_LIMIT_PER_MIN, window: 60, retryAfter: wait },
      429,
      request.headers.get('Origin') || '',
      env,
    )
    out.headers.set('Retry-After', String(wait))
    return { error: out }
  }

  const ipUsed = await bump(env, 'rl:ip:' + clientIp(request) + ':' + hourBucket(), 3600)
  if (ipUsed > 20) {
    return { error: json({ error: 'rate_limited', retryAfter: 60 }, 429, request.headers.get('Origin') || '', env) }
  }
  return { session }
}

/**
 * 身份尾巴。GitHub 不渲染 HTML 注释，所以光埋注释的话在 GitHub 页面上
 * 只能看到一个 bot，看不出是谁发的。因此再加一行给 <sub> 的可见署名，
 * 前端渲染时连同注释一起剥掉（那边已经有作者名了，不需要重复）。
 */
function qqMarker(session, masked) {
  const nick = session.nick || '匿名用户'
  const meta = JSON.stringify({ sub: session.sub, nick, masked: masked || '' })
  const visible = '<sub>QQ 用户 ' + nick + (masked ? '（' + masked + '）' : '') + ' 通过 NATB 官网提交</sub>'
  return '\n\n' + visible + '\n<!-- natb:qq ' + meta + ' -->\n'
}


/* ---------------- 管理端：用户与封禁 ---------------- */

const MANAGE_ROLES = ['admin', 'maintain', 'write']

async function requireAdmin(env, request) {
  const auth = request.headers.get('Authorization') || ''
  if (!/^Bearer\s+\S+/i.test(auth)) return { error: 'unauthorized' }
  const headers = {
    Authorization: auth,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'natb-issue-proxy',
  }

  const meRes = await fetch('https://api.github.com/user', { headers })
  if (meRes.status === 401) return { error: 'token_invalid' }
  if (!meRes.ok) return { error: 'github_unreachable', status: meRes.status }
  const me = await meRes.json()
  if (!me || !me.login) return { error: 'token_invalid' }

  const permRes = await fetch(
    'https://api.github.com/repos/' + QQ_REPO + '/collaborators/' + encodeURIComponent(me.login) + '/permission',
    { headers },
  )
  if (permRes.ok) {
    const perm = await permRes.json()
    if (perm && MANAGE_ROLES.includes(perm.permission)) return { login: me.login }
  }

  // 兜底：仓库拥有者即使权限查询被限流或 token 缺 scope，也应该能进管理面板
  const ownerLogins = String(env.ADMIN_LOGINS || 'Mengmiya1027')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (ownerLogins.includes(me.login)) return { login: me.login }

  return { error: 'forbidden', login: me.login }
}

async function handleAdmin(env, request, url) {
  const origin = request.headers.get('Origin') || ''
  const gate = await requireAdmin(env, request)
  // 用 error 判断成败：失败分支也带 login 用于错误文案，不能拿 login 当通行证
  if (gate.error) {
    const message =
      gate.error === 'unauthorized'
        ? '缺少 Authorization 头'
        : gate.error === 'token_invalid'
          ? 'GitHub 登录已失效，请重新登录'
          : gate.error === 'github_unreachable'
            ? '中转访问 api.github.com 失败（HTTP ' + gate.status + '），稍后再试'
            : '需要该仓库的 write 及以上权限（当前账号：' + (gate.login || '未知') + '）'
    return json({ error: gate.error, message }, 403, origin, env)
  }
  const me = { login: gate.login }

  if (url.pathname === '/admin/users' && request.method === 'GET') {
    const cursor = url.searchParams.get('cursor') || undefined
    const list = await env.NATB_KV.list({ prefix: 'user:', limit: 20, cursor })
    const users = []
    for (const key of list.keys) {
      const sub = key.name.slice('user:'.length)
      const profile = (await kvJson(env, key.name)) || {}
      const ban = await kvJson(env, 'ban:' + sub)
      const banned = Boolean(ban) && (ban.until === 0 || ban.until > Date.now())
      users.push({
        sub,
        nick: profile.nick || '',
        masked: profile.masked || '',
        created: profile.created || 0,
        lastSeen: profile.lastSeen || 0,
        issues: profile.issues || 0,
        comments: profile.comments || 0,
        banned,
        until: banned ? ban.until : 0,
        reason: banned ? ban.reason || '' : '',
      })
    }
    users.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    return json({ ok: true, users, cursor: list.list_complete ? null : list.cursor }, 200, origin, env)
  }

  if (url.pathname === '/admin/ban' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const sub = String((body && body.sub) || '')
    if (!/^[0-9a-f]{16}$/.test(sub)) return json({ error: 'invalid_sub' }, 400, origin, env)
    const reason = String((body && body.reason) || '').trim().slice(0, 100) || '管理员封禁'
    const days = Number((body && body.days) || 0)
    const until = days > 0 ? Date.now() + days * 86400000 : 0
    const record = { reason, by: me.login, at: Date.now(), until }

    if (until > 0) {
      await env.NATB_KV.put('ban:' + sub, JSON.stringify(record), {
        expirationTtl: Math.max(60, Math.floor((until - Date.now()) / 1000) + 60),
      })
    } else {
      await env.NATB_KV.put('ban:' + sub, JSON.stringify(record))
    }

    let ips = []
    if (body && body.banIp) {
      const profile = (await kvJson(env, 'user:' + sub)) || {}
      ips = (profile.ips || []).slice(0, 5)
      for (const ip of ips) {
        await kvSet(env, 'ban:ip:' + ip, me.login, 86400)
      }
    }
    return json({ ok: true, until, ips }, 200, origin, env)
  }

  if (url.pathname === '/admin/unban' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const sub = String((body && body.sub) || '')
    if (!/^[0-9a-f]{16}$/.test(sub)) return json({ error: 'invalid_sub' }, 400, origin, env)
    await env.NATB_KV.delete('ban:' + sub)
    return json({ ok: true }, 200, origin, env)
  }

  return json({ error: 'not_found' }, 404, origin, env)
}

/* ---------------- 路由 ---------------- */

async function handleAuth(env, request, url, cors) {
  const origin = request.headers.get('Origin') || ''

  if (url.pathname === '/auth/code' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const email = normalizeEmail(body && body.email)
    if (!email || !mailDomainAllowed(email)) {
      return json({ error: 'invalid_email', message: '只支持 QQ 邮箱（@qq.com / @foxmail.com）' }, 400, origin, env)
    }
    if (!env.NATB_KV) return json({ error: 'kv_not_bound', message: 'Worker 还没绑定 NATB_KV' }, 500, origin, env)

    const sub = await subjectOf(env, email)
    const cooling = await env.NATB_KV.get('cool:' + sub)
    if (cooling) {
      return json({ error: 'too_fast', message: '刚发过验证码，请 60 秒后再试' }, 429, origin, env)
    }
    const dayKey = 'code:day:' + sub + ':' + today()
    const dayUsed = Number((await env.NATB_KV.get(dayKey)) || 0)
    if (dayUsed >= 10) return json({ error: 'daily_limit', message: '这个邮箱今天收太多次了' }, 429, origin, env)

    const ipKey = 'code:ip:' + clientIp(request) + ':' + hourBucket()
    const ipUsed = Number((await env.NATB_KV.get(ipKey)) || 0)
    if (ipUsed >= 20) return json({ error: 'rate_limited', message: '请求太频繁，稍后再试' }, 429, origin, env)

    const code = String(Math.floor(100000 + Math.random() * 900000))
    await kvSet(env, 'code:' + sub, { code, tries: 0 }, CODE_TTL)
    await kvSet(env, 'cool:' + sub, '1', 60)
    await kvSet(env, dayKey, String(dayUsed + 1), 86400)
    await kvSet(env, ipKey, String(ipUsed + 1), 3600)

    let mail
    try {
      mail = await sendCodeMail(env, email, code)
    } catch (err) {
      return json({ error: 'mail_failed', message: String(err && err.message) }, 502, origin, env)
    }
    return json({ ok: true, debug: mail.debug, code: mail.debug ? code : undefined }, 200, origin, env)
  }

  if (url.pathname === '/auth/token' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const email = normalizeEmail(body && body.email)
    const code = String((body && body.code) || '').trim()
    const nick = String((body && body.nick) || '').trim().slice(0, 16)
    if (!email || !mailDomainAllowed(email) || !/^\d{6}$/.test(code)) {
      return json({ error: 'invalid_input' }, 400, origin, env)
    }
    const sub = await subjectOf(env, email)
    const record = await kvJson(env, 'code:' + sub)
    if (!record) return json({ error: 'code_expired', message: '验证码已失效，请重新获取' }, 400, origin, env)
    if (record.tries >= CODE_MAX_TRIES) {
      await env.NATB_KV.delete('code:' + sub)
      return json({ error: 'too_many_tries', message: '错误次数过多，请重新获取验证码' }, 410, origin, env)
    }
    if (record.code !== code) {
      await kvSet(env, 'code:' + sub, { code: record.code, tries: record.tries + 1 }, CODE_TTL)
      return json({ error: 'code_wrong', message: '验证码不对' }, 400, origin, env)
    }

    await env.NATB_KV.delete('code:' + sub)
    const masked = maskEmail(email)
    const profile = (await kvJson(env, 'user:' + sub)) || { created: Date.now(), issues: 0, comments: 0 }
    const finalNick = nick || profile.nick || ('QQ用户' + sub.slice(0, 4))
    await kvSet(
      env,
      'user:' + sub,
      { ...profile, nick: finalNick, masked, lastSeen: Date.now(), ips: [clientIp(request)] },
      90 * 86400,
    )

    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL
    const token = await signSession(env, { sub, nick: finalNick, exp })
    return json({ ok: true, token, exp, user: { sub, nick: finalNick, masked } }, 200, origin, env)
  }

  if (url.pathname === '/auth/me' && request.method === 'GET') {
    const session = await verifySession(env, request)
    if (!session) return json({ error: 'unauthorized' }, 401, origin, env)
    const ban = await kvJson(env, 'ban:' + session.sub)
    const banned = ban && (ban.until === 0 || ban.until > Date.now())
    // 掩码只存在 KV 档案里：令牌载荷里没有邮箱，拿昵称去 maskEmail 只会得到空串
    const profile = (await kvJson(env, 'user:' + session.sub)) || {}
    return json(
      {
        ok: true,
        user: { sub: session.sub, nick: session.nick, masked: profile.masked || '' },
        banned: Boolean(banned),
        until: banned ? ban.until : 0,
      },
      200,
      origin,
      env,
    )
  }

  return json({ error: 'not_found' }, 404, origin, env)
}

async function handleQq(env, request, url, cors) {
  const origin = request.headers.get('Origin') || ''
  const gate = await requireWriter(env, request, cors)
  if (gate.error) return gate.error

  const session = gate.session

  if (url.pathname === '/qq/issue' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const title = String((body && body.title) || '').trim().slice(0, 200)
    const text = String((body && body.body) || '').slice(0, 20000)
    if (!title) return json({ error: 'title_required', message: '标题不能为空' }, 400, origin, env)

    const dayKey = 'day:issue:' + session.sub + ':' + today()
    if (Number((await env.NATB_KV.get(dayKey)) || 0) >= 5) {
      return json({ error: 'daily_limit', message: '今天发帖数量已用完' }, 429, origin, env)
    }

    const profile = (await kvJson(env, 'user:' + session.sub)) || {}
    const content = text + qqMarker(session, profile.masked || '')
    const issue = await githubWrite(env, '/repos/' + QQ_REPO + '/issues', {
      method: 'POST',
      body: JSON.stringify({
        title,
        body: content,
        labels: Array.isArray(body && body.labels) ? body.labels.slice(0, 5) : [],
        ...(body && body.milestone ? { milestone: body.milestone } : {}),
      }),
    })
    await kvSet(env, dayKey, String(Number((await env.NATB_KV.get(dayKey)) || 0) + 1), 86400)
    await kvSet(
      env,
      'user:' + session.sub,
      { ...profile, issues: (profile.issues || 0) + 1, lastSeen: Date.now() },
      90 * 86400,
    )
    return json({ ok: true, number: issue.number, url: issue.html_url }, 201, origin, env)
  }

  const commentMatch = url.pathname.match(/^\/qq\/issue\/(\d+)\/comment$/)
  if (commentMatch && request.method === 'POST') {
    const number = Number(commentMatch[1])
    const body = await readJsonBody(request)
    const text = String((body && body.body) || '').slice(0, 10000)
    if (!text.trim()) return json({ error: 'body_required' }, 400, origin, env)

    const dayKey = 'day:comment:' + session.sub + ':' + today()
    if (Number((await env.NATB_KV.get(dayKey)) || 0) >= 30) {
      return json({ error: 'daily_limit', message: '今天评论次数已用完' }, 429, origin, env)
    }

    const profile = (await kvJson(env, 'user:' + session.sub)) || {}
    const comment = await githubWrite(env, '/repos/' + QQ_REPO + '/issues/' + number + '/comments', {
      method: 'POST',
      body: JSON.stringify({ body: text + qqMarker(session, profile.masked || '') }),
    })
    await kvSet(env, dayKey, String(Number((await env.NATB_KV.get(dayKey)) || 0) + 1), 86400)
    await kvSet(
      env,
      'user:' + session.sub,
      { ...profile, comments: (profile.comments || 0) + 1, lastSeen: Date.now() },
      90 * 86400,
    )
    return json({ ok: true, id: comment.id }, 201, origin, env)
  }

  const closeMatch = url.pathname.match(/^\/qq\/issue\/(\d+)$/)
  if (closeMatch && request.method === 'PATCH') {
    const number = Number(closeMatch[1])
    const body = await readJsonBody(request)
    if (!body || body.state !== 'closed') {
      return json({ error: 'unsupported', message: 'QQ 用户只能关闭自己发的 issue' }, 400, origin, env)
    }
    const issue = await githubWrite(env, '/repos/' + QQ_REPO + '/issues/' + number, { method: 'GET' })
    const marker = String(issue.body || '').match(/<!-- natb:qq (\{.*?\}) -->/)
    let owner = null
    if (marker) {
      try {
        owner = JSON.parse(marker[1]).sub
      } catch {
        owner = null
      }
    }
    if (owner !== session.sub) {
      return json({ error: 'forbidden', message: '只能关闭自己发的 issue' }, 403, origin, env)
    }
    await githubWrite(env, '/repos/' + QQ_REPO + '/issues/' + number, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    })
    return json({ ok: true }, 200, origin, env)
  }

  return json({ error: 'not_found' }, 404, origin, env)
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
      if (url.pathname.startsWith('/auth/')) {
        return await handleAuth(env, request, url, cors)
      }
      if (url.pathname.startsWith('/qq/')) {
        return await handleQq(env, request, url, cors)
      }
      if (url.pathname.startsWith('/admin/')) {
        return await handleAdmin(env, request, url)
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
