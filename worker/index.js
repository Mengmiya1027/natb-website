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
  return await verifyToken(env, header.replace(/^Bearer\s+/i, '').trim())
}

/** 验一枚具体的 QQ 会话令牌。绑定接口要从请求体里验另一侧的令牌，所以单独拆出来 */
async function verifyToken(env, token) {
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

/**
 * 登录验证码邮件。
 *
 * 版式照官网那套：白卡片 + 细边 + 等宽的验证码。
 * 不放「复制」按钮：邮件客户端普遍剥掉 JavaScript，按钮点了也只能跳转，
 * 与其给一个名不副实的按钮，不如让验证码本身够大够好选。
 * 全部用内联样式和表格布局 —— Outlook 对 flex/grid 支持很差，<style> 也可能被剥。
 */
function codeMailHtml(code) {
  const mono = "'SF Mono',Consolas,Menlo,monospace"
  const sans =
    "'Segoe UI',system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"

  return [
    '<div style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:' + sans + ';">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">',

    '<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;">',

    // 字标
    '<tr><td style="padding:28px 32px 0 32px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    '<td style="width:34px;height:34px;background:#111113;border-radius:10px;color:#ffffff;font-size:16px;font-weight:700;text-align:center;line-height:34px;">N</td>',
    '<td style="padding-left:10px;font-size:15px;font-weight:600;color:#111113;">NATB</td>',
    '</tr></table>',
    '</td></tr>',

    // 标题 + 说明
    '<tr><td style="padding:22px 32px 0 32px;">',
    '<div style="font-size:22px;line-height:1.3;font-weight:700;color:#111113;letter-spacing:-0.01em;">登录验证码</div>',
    '<div style="margin-top:8px;font-size:14px;line-height:1.6;color:#71717a;">',
    '你在 NATB 官网的 Issue 页请求登录，请使用下面的验证码完成验证。',
    '</div>',
    '</td></tr>',

    // 验证码
    '<tr><td style="padding:22px 32px 0 32px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border:1px solid #ebebee;border-radius:12px;">',
    '<tr><td style="padding:22px 16px;text-align:center;">',
    '<span style="font-family:' + mono + ';font-size:34px;line-height:1;font-weight:700;letter-spacing:10px;color:#111113;text-indent:10px;">' + code + '</span>',
    '</td></tr></table>',
    '</td></tr>',

    '<tr><td style="padding:16px 32px 0 32px;text-align:center;">',
    '<span style="font-size:13px;line-height:1.6;color:#a1a1aa;">10 分钟内有效，过期后请回到网站重新获取。</span>',
    '</td></tr>',

    // 分隔 + 兜底说明
    '<tr><td style="padding:26px 32px 0 32px;"><div style="height:1px;background:#f0f0f2;"></div></td></tr>',
    '<tr><td style="padding:16px 32px 28px 32px;">',
    '<div style="font-size:12.5px;line-height:1.7;color:#a1a1aa;">',
    '不是你本人操作？忽略这封邮件即可，验证码会自动失效，账号不受影响。',
    '</div>',
    '</td></tr>',

    '</table>',

    '<div style="margin-top:16px;font-size:11.5px;line-height:1.6;color:#b4b4bc;">',
    '本邮件由 NATB 官网系统自动发送，请勿直接回复。',
    '</div>',

    '</td></tr></table>',
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

// 供本地预览脚本直接拿到邮件 HTML（Workers 允许 default 之外再有命名导出）
export { codeMailHtml }

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

  const ban = await banStateOfQq(env, session.sub)
  if (banActive(ban)) {
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
      { error: 'rate_limited', message: '操作太频繁，请 ' + wait + ' 秒后再试', limit: WRITE_LIMIT_PER_MIN, window: 60, retryAfter: wait },
      429,
      request.headers.get('Origin') || '',
      env,
    )
    out.headers.set('Retry-After', String(wait))
    return { error: out }
  }

  const ipUsed = await bump(env, 'rl:ip:' + clientIp(request) + ':' + hourBucket(), 3600)
  if (ipUsed > 20) {
    return {
      error: json(
        { error: 'rate_limited', message: '这个网络的操作太频繁，请一小时后再试', retryAfter: 3600 },
        429,
        request.headers.get('Origin') || '',
        env,
      ),
    }
  }
  return { session }
}

/**
 * 身份尾巴。GitHub 不渲染 HTML 注释，所以光埋注释的话在 GitHub 页面上
 * 只能看到一个 bot，看不出是谁发的。因此再加一行给 <sub> 的可见署名，
 * 前端渲染时连同注释一起剥掉（那边已经有作者名了，不需要重复）。
 */
function qqMarker(session, masked, linkedLogin) {
  const nick = session.nick || '匿名用户'
  const meta = JSON.stringify({
    sub: session.sub,
    nick,
    masked: masked || '',
    ...(linkedLogin ? { login: linkedLogin } : {}),
  })
  // 绑定了 GitHub 的，署名以 GitHub 为准：读者该看到的是那个 GitHub 账号，
  // 而不是一个陌生的 QQ 昵称。QQ 昵称退进注释里留档。
  const visible = linkedLogin
    ? '<sub>@' + linkedLogin + '（经 QQ 邮箱验证）通过 NATB 官网提交</sub>'
    : '<sub>QQ 用户 ' + nick + (masked ? '（' + masked + '）' : '') + ' 通过 NATB 官网提交</sub>'
  return '\n\n' + visible + '\n<!-- natb:qq ' + meta + ' -->\n'
}



/**
 * 统一的「改 issue 元信息」入口：标签 / 里程碑 / 指派。
 *
 * 身份规则（管理 = 拥有者 + 协作者，其余都算非管理）：
 *   - 管理：三项都能改
 *   - 非管理中的作者本人：只能改标签与里程碑
 *   - 非管理中的其他人：一律 403
 * 令牌由这一个端点自行分辨：含点的 base64url.base64url 是本站签发的 QQ 令牌，
 * 其余按 GitHub token 处理，这样前端只需要一个调用点。
 */
async function handleIssueMeta(env, request, url, match) {
  const origin = request.headers.get('Origin') || ''
  const number = Number(match[1])
  const raw = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!raw) return json({ error: 'unauthorized' }, 401, origin, env)

  let sub = null
  let login = null
  let session = null

  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) {
    session = await verifySession(env, request)
    if (!session) return json({ error: 'unauthorized', message: 'QQ 登录已失效' }, 401, origin, env)
    sub = session.sub
    const ban = await banStateOfQq(env, sub)
    if (banActive(ban)) {
      return json({ error: 'banned', message: '账号已被封禁' }, 403, origin, env)
    }
    const used = await bump(env, 'rl:' + sub + ':' + minuteBucket(), 120)
    if (used > WRITE_LIMIT_PER_MIN) {
      return json(
        { error: 'rate_limited', message: '操作太频繁，请一分钟后重试', limit: WRITE_LIMIT_PER_MIN, window: 60, retryAfter: 60 },
        429,
        origin,
        env,
      )
    }
  } else {
    const meRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: raw, Accept: 'application/vnd.github+json', 'User-Agent': 'natb-issue-proxy' },
    })
    if (meRes.status === 401) return json({ error: 'token_invalid', message: 'GitHub 登录已失效' }, 401, origin, env)
    if (!meRes.ok) return json({ error: 'github_unreachable' }, 502, origin, env)
    const me = await meRes.json()
    login = me && me.login
    if (!login) return json({ error: 'token_invalid' }, 401, origin, env)
    // GitHub 身份同样要查封禁：本站的写路径能拦的一律拦，不能拦的在文档里说明
    const ghBan = await banStateOfGh(env, login)
    if (banActive(ghBan)) {
      return json({ error: 'banned', message: '账号已被封禁' }, 403, origin, env)
    }
  }

  const issue = await githubWrite(env, '/repos/' + QQ_REPO + '/issues/' + number, { method: 'GET' })
  const marker = String(issue.body || '').match(/<!-- natb:qq (\{.*?\}) -->/)
  let ownerSub = null
  if (marker) {
    try {
      ownerSub = JSON.parse(marker[1]).sub
    } catch {
      ownerSub = null
    }
  }

  // 两种身份各自查角色：GitHub 用本人 token 查协作者，QQ 用授予角色或绑定账号
  const isAdmin = login
    ? await callerIsAdmin(env, login, raw)
    : await qqCallerIsAdmin(env, sub)
  // 作者判定按等价类走：绑定之后，GitHub 身份也能改自己过去用 QQ 发的帖子，反之亦然
  const classSub = sub || (login ? await bindOfGh(env, login) : '')
  const classLogin = login || (sub ? await bindOfQq(env, sub) : '')
  const isAuthor = Boolean(
    (classSub && ownerSub && classSub === ownerSub) ||
      (classLogin && issue.user && issue.user.login && issue.user.login.toLowerCase() === classLogin.toLowerCase()),
  )

  if (!isAdmin && !isAuthor) {
    return json({ error: 'forbidden', message: '你没有管理员权限' }, 403, origin, env)
  }

  const body = (await readJsonBody(request)) || {}
  const patch = {}

  if (Array.isArray(body.labels)) {
    if (!isAdmin && !isAuthor) return json({ error: 'forbidden' }, 403, origin, env)
    patch.labels = body.labels.slice(0, 5)
  }
  if (body.milestone !== undefined) {
    patch.milestone = body.milestone || null
  }
  if (body.assignees !== undefined) {
    if (!isAdmin) {
      return json({ error: 'forbidden', message: '只有管理员能改指派' }, 403, origin, env)
    }
    patch.assignees = Array.isArray(body.assignees) ? body.assignees.slice(0, 5) : []
  }

  if (!Object.keys(patch).length) return json({ error: 'nothing_to_update' }, 400, origin, env)

  const updated = await githubWrite(env, '/repos/' + QQ_REPO + '/issues/' + number, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return json({ ok: true, issue: { labels: updated.labels || [], milestone: updated.milestone || null, assignees: updated.assignees || [] } }, 200, origin, env)
}


/**
 * 解析一个身份在本仓库里的角色，返回 'admin' / 'maintain' / 'write' / 'triage' / 'read' / ''
 * 与登录方式无关：GitHub 身份查它自己的 permission，QQ 身份查「授予的角色」或「绑定账号的角色」。
 */
async function resolveQqRole(env, sub) {
  // 1) 管理员直接授予这个身份的角色（将来管理面板里可以给人授权）
  const granted = await env.NATB_KV.get('role:' + sub)
  if (granted) return String(granted)
  // 2) 这个身份绑定的 GitHub 账号在仓库里的角色
  const boundLogin = await env.NATB_KV.get('bind:' + sub)
  if (!boundLogin) return ''
  return await roleOfLogin(env, boundLogin)
}

/** 用 App 的 installation token 查某个 GitHub 账号在本仓库的角色 */
async function roleOfLogin(env, login) {
  if (!login) return ''
  try {
    const token = await installationToken(env)
    const res = await fetch(
      'https://api.github.com/repos/' + QQ_REPO + '/collaborators/' + encodeURIComponent(login) + '/permission',
      {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'natb-issue-proxy',
        },
      },
    )
    if (!res.ok) return ''
    const data = await res.json()
    return data && data.permission ? String(data.permission) : ''
  } catch {
    return ''
  }
}

/* ---------------- 身份等价类：绑定后 QQ 与 GitHub 是同一个身份 ---------------- */

/**
 * 绑定关系存在两个方向的键里：
 *   bind:<sub>      = login（QQ 侧读）
 *   bind:gh:<login> = sub  （GitHub 侧读，login 一律小写）
 * 两者要么都在、要么都不在——写和删必须成对，否则身份会分叉成两半。
 */

function banActive(record) {
  return Boolean(record) && (record.until === 0 || record.until > Date.now())
}

async function bindOfQq(env, sub) {
  if (!sub) return ''
  return (await env.NATB_KV.get('bind:' + sub)) || ''
}

async function bindOfGh(env, login) {
  if (!login) return ''
  return (await env.NATB_KV.get('bind:gh:' + String(login).toLowerCase())) || ''
}

/** QQ 等价类的封禁：本身份或绑定账号，任一命中即整类封禁 */
async function banStateOfQq(env, sub) {
  const own = await kvJson(env, 'ban:' + sub)
  if (banActive(own)) return own
  const login = await bindOfQq(env, sub)
  if (!login) return null
  const other = await kvJson(env, 'ban:gh:' + login.toLowerCase())
  return banActive(other) ? other : null
}

/** GitHub 等价类的封禁：本账号或绑定身份，任一命中即整类封禁 */
async function banStateOfGh(env, login) {
  const own = await kvJson(env, 'ban:gh:' + String(login).toLowerCase())
  if (banActive(own)) return own
  const sub = await bindOfGh(env, login)
  if (!sub) return null
  const other = await kvJson(env, 'ban:' + sub)
  return banActive(other) ? other : null
}

/**
 * 用用户自己的 token 认人。
 * 这是「他真的持有这个 GitHub 账号」的唯一证明——App 的 installation token
 * 只能证明账号存在，证明不了是谁在操作，绝不能拿来替代。
 */
async function loginOfGhToken(token) {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'natb-issue-proxy',
      },
    })
    if (!res.ok) return null
    const me = await res.json()
    if (!me || !me.login) return null
    return {
      login: String(me.login).toLowerCase(),
      name: me.name || '',
      avatar: me.avatar_url || '',
    }
  } catch {
    return null
  }
}

/** 封禁记录统一写法：until=0 是永久（无 TTL），其余按到期时间设 TTL */
async function putBan(env, key, record) {
  if (record.until > 0) {
    await env.NATB_KV.put(key, JSON.stringify(record), {
      expirationTtl: Math.max(60, Math.floor((record.until - Date.now()) / 1000) + 60),
    })
  } else {
    await env.NATB_KV.put(key, JSON.stringify(record))
  }
}

/**
 * 把被我们封禁的人同时在 GitHub 上 block 掉。
 *
 * 为什么非做不可：本站的封禁只在中转层拦住写操作，对方换个客户端直连
 * api.github.com、或者干脆去网页端发帖，我们拦不住。而「被仓库拥有者 block」
 * 是 GitHub 自己的限制：那个人无法在这个仓库里开 issue、评论、加反应。
 *
 * 为什么只能用 classic PAT：block 是账号级能力（PUT /user/blocks/{login}），
 * App 的 installation token 权限表里根本没有这一项。所以读 env.GITHUB_ADMIN_TOKEN，
 * 没配就整段跳过 —— 封禁本身照常生效，只是少这一层。
 */
async function ghBlockUser(env, login, blocked) {
  // PowerShell 管道有时会带一个 BOM(\uFEFF) 进 secret，GitHub 会把它当成 token 的一部分
  // 从而判成 Bad credentials。这里先剥掉再判断，省得为了一个看不见的字符重配一次。
  const token = String(env.GITHUB_ADMIN_TOKEN || '').replace(/^\uFEFF/, '').trim()
  if (!login) return { ok: false, reason: 'no_login' }
  if (!token) return { ok: false, reason: 'no_token' }
  const who = encodeURIComponent(String(login))
  try {
    const res = await fetch('https://api.github.com/user/blocks/' + who, {
      method: blocked ? 'PUT' : 'DELETE',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'natb-issue-proxy',
      },
    })
    // 失败不阻断封禁流程：KV 里的记录才是权威，GitHub 这一层是加固。
    // 但结果要回传给管理面板，否则管理员根本不知道这层没生效。
    if (res.ok) return { ok: true }
    // 失败时把 GitHub 的原话和这枚 token 的 scopes 一起带回去：
    // 管理面板要能直接看出是「token 没勾 user」「token 是空的」还是「根本没权限」
    const detail = await res.text().catch(() => '')
    console.warn('ghBlockUser', blocked ? 'block' : 'unblock', login, res.status, detail.slice(0, 120))
    return {
      ok: false,
      status: res.status,
      detail: String(detail || '').slice(0, 160),
      scopes: res.headers.get('x-oauth-scopes') || '',
      // 只回前 6 位和长度：够判断「存进去的到底是不是一串 ghp_」，又不泄露内容
      tokenHint: token.slice(0, 6) + '… len=' + token.length,
    }
  } catch (err) {
    console.warn('ghBlockUser network', login, err && err.message)
    return { ok: false, reason: 'network' }
  }
}

/** 封禁沿等价类传播：封一端必须连坐另一端，否则同一身份封一半等于没封 */
async function banClass(env, { sub, login, record }) {
  if (sub) await putBan(env, 'ban:' + sub, record)
  if (login) await putBan(env, 'ban:gh:' + String(login).toLowerCase(), record)
  // 纯 QQ 用户没有 GitHub 账号，没有可 block 的对象；
  // 只有 GitHub 身份、以及 QQ 绑定了 GitHub 的身份走到这里
  if (login) return await ghBlockUser(env, login, true)
  return null
}

/**
 * GitHub token → login 的短期缓存。
 * 转发层每个写请求都要知道「这次是谁」，每次打一遍 /user 太贵，用 KV 缓存 30 分钟。
 * 缓存的是「这枚 token 属于谁」这个不会变的事实；封禁状态每次现查，所以封禁即时生效。
 */
async function loginOfTokenCached(env, token) {
  if (!env.NATB_KV) return ''
  const cacheKey = 'ghid:' + (await sha256Hex(token)).slice(0, 24)
  const hit = await env.NATB_KV.get(cacheKey)
  if (hit) return hit
  const me = await loginOfGhToken(token)
  if (!me) return ''
  await env.NATB_KV.put(cacheKey, me.login, { expirationTtl: 1800 })
  return me.login
}

async function unbanClass(env, { sub, login }) {
  if (sub) await env.NATB_KV.delete('ban:' + sub)
  if (login) await env.NATB_KV.delete('ban:gh:' + String(login).toLowerCase())
  // 解封要把 GitHub 侧的 block 一并撤掉，否则人放回来了却还是发不了言
  if (login) return await ghBlockUser(env, login, false)
  return null
}

/** 一个 QQ 身份的完整视图：绑定关系 + 合并角色 + 合并封禁 */
async function qqIdentityOf(env, sub) {
  const login = await bindOfQq(env, sub)
  const ban = await banStateOfQq(env, sub)
  const banned = banActive(ban)
  return {
    linkedGh: login ? { login } : null,
    role: await resolveQqRole(env, sub),
    banned,
    until: banned ? ban.until : 0,
    reason: banned ? ban.reason || '' : '',
  }
}

/**
 * QQ 身份是否有维护者权限。
 * 角色来源有两种：管理员直接授予（role:<sub>），或绑定了的 GitHub 账号在仓库里的角色（bind:<sub>）。
 * 目前两者都没有记录，所以恒为 false —— 这是「这个身份暂时没有可查的角色」，
 * 而不是「QQ 用户低一等」。
 */
async function qqCallerIsAdmin(env, sub) {
  const role = await resolveQqRole(env, sub)
  return MANAGE_ROLES.includes(role)
}

/** 判断这个 GitHub 账号是不是「管理」：拥有者白名单，或该仓库的 admin/maintain/write 协作者 */
async function callerIsAdmin(env, login, token) {
  if (!login) return false
  const ownerLogins = String(env.ADMIN_LOGINS || 'Mengmiya1027')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (ownerLogins.includes(login)) return true
  if (!token) return false

  try {
    const res = await fetch(
      'https://api.github.com/repos/' + QQ_REPO + '/collaborators/' + encodeURIComponent(login) + '/permission',
      {
        headers: { Authorization: token, Accept: 'application/vnd.github+json', 'User-Agent': 'natb-issue-proxy' },
      },
    )
    if (!res.ok) return false
    const perm = await res.json()
    return Boolean(perm && MANAGE_ROLES.includes(perm.permission))
  } catch {
    return false
  }
}

/* ---------------- 管理端：用户与封禁 ---------------- */

const MANAGE_ROLES = ['admin', 'maintain', 'write']

/**
 * 管理端鉴权。管理 = 这个人在这仓库里的角色落在 admin/maintain/write，与登录方式无关，
 * 所以这里必须分辨两种凭据：
 *   QQ 令牌（base64url.base64url 两段）→ 验签 → 等价类角色
 *   其余                              → 当 GitHub token 用，查 /user + 协作者权限
 * 两条路径都先过合并封禁：被封的管理员不该还能操作别人。
 */
async function requireAdmin(env, request) {
  const auth = request.headers.get('Authorization') || ''
  if (!/^Bearer\s+\S+/i.test(auth)) return { error: 'unauthorized' }
  const raw = auth.replace(/^Bearer\s+/i, '').trim()

  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) {
    const session = await verifySession(env, request)
    if (!session) return { error: 'token_invalid' }
    const ban = await banStateOfQq(env, session.sub)
    if (banActive(ban)) return { error: 'banned' }
    const role = await resolveQqRole(env, session.sub)
    if (!MANAGE_ROLES.includes(role)) return { error: 'forbidden', login: session.nick }
    return { login: (await bindOfQq(env, session.sub)) || '', sub: session.sub }
  }

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

  const ghBan = await banStateOfGh(env, me.login)
  if (banActive(ghBan)) return { error: 'banned', login: me.login }

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

/**
 * GitHub 账号列表。四路来源去重：
 *   1. 仓库 issue 作者（state=all，含已关的）——「发过言的人」
 *   2. KV 里已绑定的 login——没发过帖也要能看到，否则解绑入口找不到
 *   3. 已存在的 ban:gh: 记录——封了但没发帖的人得能解封
 *   4. ghseen: 记录——只用 GitHub 登录过、还没发言的账号（否则管理员看不见这些人）
 * App 只有 Issues/Metadata 权限，拉不到 collaborators 列表，所以角色不在这里展示。
 */
async function listGhUsers(env, origin) {
  const map = new Map()
  const touch = (raw) => {
    const key = String(raw || '').toLowerCase()
    if (!key || /\[bot\]$/.test(key)) return null
    if (!map.has(key)) map.set(key, { login: key, issues: 0, lastActivity: 0 })
    return map.get(key)
  }

  let issues = []
  try {
    const page = await githubWrite(env, '/repos/' + QQ_REPO + '/issues?state=all&per_page=100&sort=updated')
    issues = Array.isArray(page) ? page : []
  } catch {
    issues = []
  }
  for (const issue of issues) {
    const row = touch(issue.user && issue.user.login)
    if (!row) continue
    row.issues += 1
    const at = Date.parse(issue.updated_at || issue.created_at || '') || 0
    if (at > row.lastActivity) row.lastActivity = at
  }

  const bindKey = await env.NATB_KV.list({ prefix: 'bind:', limit: 120 })
  for (const key of bindKey.keys) {
    if (key.name.startsWith('bind:gh:')) continue
    const login = (await env.NATB_KV.get(key.name)) || ''
    if (login) touch(login)
  }

  const banKeys = await env.NATB_KV.list({ prefix: 'ban:gh:', limit: 120 })
  for (const key of banKeys.keys) touch(key.name.slice('ban:gh:'.length))

  // 第四路：只是登录过、还没发过言的账号（登录成功时由前端上报，见 /auth/seen）
  const seenKeys = await env.NATB_KV.list({ prefix: 'ghseen:', limit: 200 })
  for (const key of seenKeys.keys) touch(key.name.slice('ghseen:'.length))

  for (const login of String(env.ADMIN_LOGINS || 'Mengmiya1027')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    touch(login)
  }

  const users = []
  for (const row of map.values()) {
    const ban = await kvJson(env, 'ban:gh:' + row.login)
    const banned = banActive(ban)
    users.push({
      login: row.login,
      avatar: 'https://github.com/' + row.login + '.png?size=64',
      linkedSub: await bindOfGh(env, row.login),
      issues: row.issues,
      lastActivity: row.lastActivity,
      banned,
      until: banned ? ban.until : 0,
      reason: banned ? ban.reason || '' : '',
    })
  }
  users.sort((a, b) => Number(b.banned) - Number(a.banned) || (b.lastActivity || 0) - (a.lastActivity || 0))
  return json({ ok: true, target: 'gh', users, cursor: null }, 200, origin, env)
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
          ? '登录已失效，请重新登录'
          : gate.error === 'banned'
            ? '这个账号已被封禁，不能进入管理面板'
            : gate.error === 'github_unreachable'
              ? '中转访问 api.github.com 失败（HTTP ' + gate.status + '），稍后再试'
              : '需要该仓库的 write 及以上权限（当前账号：' + (gate.login || '未知') + '）'
    return json({ error: gate.error, message }, 403, origin, env)
  }
  const me = { login: gate.login || '', sub: gate.sub || '' }
  /** 记录操作人：QQ 管理员没有 login，用 sub 前 6 位标记 */
  const actor = me.login || 'qq:' + me.sub.slice(0, 6)

  if (url.pathname === '/admin/users' && request.method === 'GET') {
    if (url.searchParams.get('scope') === 'gh') return await listGhUsers(env, origin)
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
        linkedGh: (await bindOfQq(env, sub)) || '',
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
    const target = body && body.target === 'gh' ? 'gh' : 'qq'
    const reason = String((body && body.reason) || '').trim().slice(0, 100) || '管理员封禁'
    const days = Number((body && body.days) || 0)
    const until = days > 0 ? Date.now() + days * 86400000 : 0
    const record = { reason, by: actor, at: Date.now(), until }

    if (target === 'gh') {
      const login = String((body && body.login) || '').toLowerCase()
      if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(login)) return json({ error: 'invalid_login' }, 400, origin, env)
      const sub = await bindOfGh(env, login)
      // 不能封自己：含等价类，否则管理员会把自己锁在门外
      if ((me.login && login === me.login.toLowerCase()) || (me.sub && sub && sub === me.sub)) {
        return json({ error: 'self_ban', message: '不能封禁自己' }, 400, origin, env)
      }
      // 封禁沿等价类传播：只封一半的话另一半照样能写
      const ghBlock = await banClass(env, { sub, login, record })
      let ips = []
      if (sub) {
        const profile = (await kvJson(env, 'user:' + sub)) || {}
        ips = (profile.ips || []).slice(0, 5)
        for (const ip of ips) await kvSet(env, 'ban:ip:' + ip, actor, 86400)
      }
      return json({ ok: true, target, login, sub, until, ips, ghBlock }, 200, origin, env)
    }

    const sub = String((body && body.sub) || '')
    if (!/^[0-9a-f]{16}$/.test(sub)) return json({ error: 'invalid_sub' }, 400, origin, env)
    if (me.sub && sub === me.sub) return json({ error: 'self_ban', message: '不能封禁自己' }, 400, origin, env)
    const login = await bindOfQq(env, sub)
    const ghBlock = await banClass(env, { sub, login, record })

    let ips = []
    if (body && body.banIp) {
      const profile = (await kvJson(env, 'user:' + sub)) || {}
      ips = (profile.ips || []).slice(0, 5)
      for (const ip of ips) await kvSet(env, 'ban:ip:' + ip, actor, 86400)
    }
    return json({ ok: true, target, sub, login, until, ips, ghBlock }, 200, origin, env)
  }

  if (url.pathname === '/admin/unban' && request.method === 'POST') {
    const body = await readJsonBody(request)
    if (body && body.target === 'gh') {
      const login = String((body && body.login) || '').toLowerCase()
      if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(login)) return json({ error: 'invalid_login' }, 400, origin, env)
      const ghBlock = await unbanClass(env, { login, sub: await bindOfGh(env, login) })
      return json({ ok: true, target: 'gh', login, ghBlock }, 200, origin, env)
    }
    const sub = String((body && body.sub) || '')
    if (!/^[0-9a-f]{16}$/.test(sub)) return json({ error: 'invalid_sub' }, 400, origin, env)
    await unbanClass(env, { sub, login: await bindOfQq(env, sub) })
    return json({ ok: true, target: 'qq', sub }, 200, origin, env)
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
    if (dayUsed >= 10) {
      return json({ error: 'daily_limit', message: '本邮箱今日已达 10 次发件上限，请明日再试' }, 429, origin, env)
    }

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

    // 封禁不影响登录：只读浏览仍然允许，写操作由 requireWriter 每次拦。
    // 这里把封禁状态一并回给前端，让它登录后弹一次说明。
    // 合并封禁 + 绑定关系一次算好；登录后前端据此决定弹什么、以什么身份行事
    const identity = await qqIdentityOf(env, sub)

    await env.NATB_KV.delete('code:' + sub)
    const masked = maskEmail(email)

    // 昵称只在个人中心里设；首次登录给个占位，登录表单不再收这个字段
    const profile = (await kvJson(env, 'user:' + sub)) || { created: Date.now(), issues: 0, comments: 0 }
    const finalNick = profile.nick || 'QQ用户' + sub.slice(0, 4)
    await kvSet(
      env,
      'user:' + sub,
      { ...profile, nick: finalNick, masked, lastSeen: Date.now(), ips: [clientIp(request)] },
      90 * 86400,
    )

    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL
    const token = await signSession(env, { sub, nick: finalNick, exp })
    return json(
      {
        ok: true,
        token,
        exp,
        user: { sub, nick: finalNick, masked },
        role: identity.role,
        banned: identity.banned,
        until: identity.until,
        reason: identity.reason,
        linkedGh: identity.linkedGh,
      },
      200,
      origin,
      env,
    )
  }

  if (url.pathname === '/auth/profile' && request.method === 'POST') {
    const session = await verifySession(env, request)
    if (!session) return json({ error: 'unauthorized' }, 401, origin, env)
    const body = await readJsonBody(request)
    const nick = String((body && body.nick) || '').trim()

    if (nick.length < 2 || nick.length > 16) {
      return json({ error: 'invalid_nick', message: '昵称要 2-16 个字符' }, 400, origin, env)
    }
    if (/[<>\r\n\t]/.test(nick)) {
      return json({ error: 'invalid_nick', message: '昵称不能包含尖括号或换行' }, 400, origin, env)
    }

    const profile = (await kvJson(env, 'user:' + session.sub)) || {}
    const updated = { ...profile, nick, lastSeen: Date.now() }
    await kvSet(env, 'user:' + session.sub, updated, 90 * 86400)

    // 昵称在令牌载荷里，改完必须重签，否则后续发帖署的还是旧名字
    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL
    const token = await signSession(env, { sub: session.sub, nick, exp })
    return json(
      { ok: true, token, user: { sub: session.sub, nick, masked: updated.masked || '' } },
      200,
      origin,
      env,
    )
  }

  /* 登录成功时前端来报个到：Device Flow 的 token 直接发给浏览器，
   * 我们不参与，所以「谁登录过」这件事只有前端知道。记下来，
   * 管理面板才看得见那些还没发过言的账号。只记 GitHub 身份。 */
  if (url.pathname === '/auth/seen' && request.method === 'POST') {
    const raw = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!raw) return json({ error: 'unauthorized' }, 401, origin, env)
    // 两段 base64url 是本站 QQ 令牌，不是 GitHub 账号，不进这个名单
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) return json({ ok: true }, 200, origin, env)
    const me = await loginOfGhToken(raw)
    if (!me) return json({ error: 'token_invalid' }, 401, origin, env)
    const login = String(me.login).toLowerCase()
    // 一天内不重复写：每次开页面都报一次，不节流会把 KV 写额度耗光
    const prev = await kvJson(env, 'ghseen:' + login)
    if (!prev || Date.now() - (prev.at || 0) > 86400000) {
      await kvSet(env, 'ghseen:' + login, { login, at: Date.now() }, 180 * 86400)
    }
    return json({ ok: true, login }, 200, origin, env)
  }

  if (url.pathname === '/auth/me' && request.method === 'GET') {
    const session = await verifySession(env, request)
    if (!session) return json({ error: 'unauthorized' }, 401, origin, env)
    const identity = await qqIdentityOf(env, session.sub)
    // 掩码只存在 KV 档案里：令牌载荷里没有邮箱，拿昵称去 maskEmail 只会得到空串
    const profile = (await kvJson(env, 'user:' + session.sub)) || {}
    return json(
      {
        ok: true,
        user: {
          sub: session.sub,
          nick: session.nick,
          masked: profile.masked || '',
          created: profile.created || 0,
          issues: profile.issues || 0,
          comments: profile.comments || 0,
        },
        role: identity.role,
        banned: identity.banned,
        until: identity.until,
        reason: identity.reason,
        linkedGh: identity.linkedGh,
      },
      200,
      origin,
      env,
    )
  }

  /**
   * GitHub 身份的绑定状态。
   * QQ 侧的信息在 /auth/me 里，GitHub 侧没有会话概念，只能每次拿 token 问一次。
   */
  if (url.pathname === '/auth/identity' && request.method === 'GET') {
    const raw = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!raw) return json({ error: 'unauthorized' }, 401, origin, env)
    const me = await loginOfGhToken(raw)
    if (!me) return json({ error: 'token_invalid' }, 401, origin, env)

    const sub = await bindOfGh(env, me.login)
    let linkedQq = null
    if (sub) {
      const profile = (await kvJson(env, 'user:' + sub)) || {}
      linkedQq = { sub, nick: profile.nick || '', masked: profile.masked || '' }
    }
    const ban = await banStateOfGh(env, me.login)
    const banned = banActive(ban)
    return json(
      {
        ok: true,
        login: me.login,
        name: me.name,
        avatar: me.avatar,
        linkedQq,
        banned,
        until: banned ? ban.until : 0,
        reason: banned ? ban.reason || '' : '',
      },
      200,
      origin,
      env,
    )
  }

  /**
   * 绑定 QQ 身份与 GitHub 账号。
   * 身体里必须带他本人的 GitHub token：绑定要证明两个账号都归一个人，
   * 而「他持有这个 GitHub 账号」唯一可信的证据就是一枚只有他能拿到的 token。
   * 用本地已经存着的那枚也不行——公用电脑上那可能是别人的。
   */
  if (url.pathname === '/auth/bind' && request.method === 'POST') {
    const raw = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!raw) return json({ error: 'unauthorized' }, 401, origin, env)
    const body = await readJsonBody(request)

    /*
     * 两种发起方向，随便哪一边都能开始绑：
     *   头里是 QQ 令牌  → 身体里带 ghToken（刚授权拿到的）
     *   头里是 GitHub token → 身体里带 qqToken（刚收验证码拿到的）
     * 这样无论用户当前站在哪个身份的个人中心里，都不用先退出再切身份。
     */
    let sub = ''
    let gh = null

    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) {
      const session = await verifyToken(env, raw)
      if (!session) return json({ error: 'unauthorized', message: 'QQ 登录已失效' }, 401, origin, env)
      sub = session.sub
      const ghToken = String((body && body.ghToken) || '').trim()
      if (!ghToken) return json({ error: 'gh_token_required', message: '需要先登录 GitHub' }, 400, origin, env)
      gh = await loginOfGhToken(ghToken)
      if (!gh) return json({ error: 'gh_token_invalid', message: 'GitHub 登录已失效，请重新登录' }, 401, origin, env)
    } else {
      gh = await loginOfGhToken(raw)
      if (!gh) return json({ error: 'gh_token_invalid', message: 'GitHub 登录已失效，请重新登录' }, 401, origin, env)
      const qqToken = String((body && body.qqToken) || '').trim()
      if (!qqToken) return json({ error: 'qq_token_required', message: '需要先登录 QQ 邮箱' }, 400, origin, env)
      const session = await verifyToken(env, qqToken)
      if (!session) return json({ error: 'qq_token_invalid', message: 'QQ 登录已失效，请重新验证' }, 401, origin, env)
      sub = session.sub
    }

    // 每个身份每小时 10 次绑定/解绑，挡暴力刷 KV
    const rlKey = 'brl:' + sub + ':' + hourBucket()
    if ((await bump(env, rlKey, 3600)) > 10) {
      return json({ error: 'rate_limited', message: '操作太频繁，请一小时后再试' }, 429, origin, env)
    }

    // 前提一：QQ 侧没被封
    if (banActive(await banStateOfQq(env, sub))) {
      return json({ error: 'banned', message: '该 QQ 身份已被封禁，不能绑定' }, 403, origin, env)
    }

    if (/\[bot\]$/i.test(gh.login)) {
      return json({ error: 'bot_not_allowed', message: '不能绑定机器人账号' }, 400, origin, env)
    }

    // 前提三：另一端没被封，否则绑定等于把封禁洗掉
    if (banActive(await kvJson(env, 'ban:gh:' + gh.login))) {
      return json({ error: 'banned_target', message: '这个 GitHub 账号已被封禁，不能绑定' }, 403, origin, env)
    }

    // 前提四：两边都还没绑过——一对一，不接受一对多
    const boundSub = await bindOfGh(env, gh.login)
    if (boundSub) {
      return json({ error: 'gh_already_bound', message: '这个 GitHub 账号已经绑定过其他 QQ 身份' }, 409, origin, env)
    }
    const boundLogin = await bindOfQq(env, sub)
    if (boundLogin) {
      return json(
        { error: 'qq_already_bound', message: '当前 QQ 身份已绑定 ' + boundLogin + '，请先解绑' },
        409,
        origin,
        env,
      )
    }

    // 两个方向的键必须成对写入，否则身份会分叉成两半
    await env.NATB_KV.put('bind:' + sub, gh.login)
    await env.NATB_KV.put('bind:gh:' + gh.login, sub)

    return json({ ok: true, linkedGh: { login: gh.login, name: gh.name, avatar: gh.avatar } }, 200, origin, env)
  }

  if (url.pathname === '/auth/unbind' && request.method === 'POST') {
    const raw = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!raw) return json({ error: 'unauthorized' }, 401, origin, env)

    let sub = ''
    let login = ''
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) {
      const session = await verifyToken(env, raw)
      if (!session) return json({ error: 'unauthorized' }, 401, origin, env)
      sub = session.sub
      login = await bindOfQq(env, sub)
    } else {
      const me = await loginOfGhToken(raw)
      if (!me) return json({ error: 'gh_token_invalid' }, 401, origin, env)
      login = me.login
      sub = await bindOfGh(env, login)
    }

    // 解绑也要限频：反复解绑/重绑不该成为洗 reset 的手段
    if (sub) {
      const rlKey = 'brl:' + sub + ':' + hourBucket()
      if ((await bump(env, rlKey, 3600)) > 10) {
        return json({ error: 'rate_limited', message: '操作太频繁，请一小时后再试' }, 429, origin, env)
      }
    }

    if (sub) await env.NATB_KV.delete('bind:' + sub)
    if (login) await env.NATB_KV.delete('bind:gh:' + login)
    // 解绑不删封禁记录：否则解绑就成了洗白手段
    return json({ ok: true, linkedGh: null, linkedQq: null }, 200, origin, env)
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

    // 指派属于维护者职权：非管理提交指派时明确拒绝，而不是静默丢掉
    const assignees = Array.isArray(body && body.assignees) ? body.assignees.slice(0, 5) : []
    if (assignees.length && !(await qqCallerIsAdmin(env, session.sub))) {
      return json({ error: 'forbidden', message: '只有管理员能指派' }, 403, origin, env)
    }

    const dayKey = 'day:issue:' + session.sub + ':' + today()
    if (Number((await env.NATB_KV.get(dayKey)) || 0) >= 5) {
      return json({ error: 'daily_limit', message: '今天发帖数量已用完' }, 429, origin, env)
    }

    const profile = (await kvJson(env, 'user:' + session.sub)) || {}
    // 绑定后以 GitHub 身份落款：能力互通，署名也统一
    const content = text + qqMarker(session, profile.masked || '', await bindOfQq(env, session.sub))
    const issue = await githubWrite(env, '/repos/' + QQ_REPO + '/issues', {
      method: 'POST',
      body: JSON.stringify({
        title,
        body: content,
        labels: Array.isArray(body && body.labels) ? body.labels.slice(0, 5) : [],
        ...(body && body.milestone ? { milestone: body.milestone } : {}),
        ...(assignees.length ? { assignees } : {}),
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
      body: JSON.stringify({
        body: text + qqMarker(session, profile.masked || '', await bindOfQq(env, session.sub)),
      }),
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


  const deleteIssueMatch = url.pathname.match(/^\/qq\/issue\/(\d+)$/)
  if (deleteIssueMatch && request.method === 'DELETE') {
    const number = Number(deleteIssueMatch[1])
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
      return json({ error: 'forbidden', message: '只能删除自己发的 issue' }, 403, origin, env)
    }
    await githubWrite(env, '/repos/' + QQ_REPO + '/issues/' + number, { method: 'DELETE' })
    return json({ ok: true }, 200, origin, env)
  }

  const commentDeleteMatch = url.pathname.match(/^\/qq\/comment\/(\d+)$/)
  if (commentDeleteMatch && request.method === 'DELETE') {
    const commentId = Number(commentDeleteMatch[1])
    const comment = await githubWrite(env, '/repos/' + QQ_REPO + '/issues/comments/' + commentId, {
      method: 'GET',
    })
    const marker = String(comment.body || '').match(/<!-- natb:qq (\{.*?\}) -->/)
    let owner = null
    if (marker) {
      try {
        owner = JSON.parse(marker[1]).sub
      } catch {
        owner = null
      }
    }
    if (owner !== session.sub) {
      return json({ error: 'forbidden', message: '只能删除自己发的评论' }, 403, origin, env)
    }
    await githubWrite(env, '/repos/' + QQ_REPO + '/issues/comments/' + commentId, { method: 'DELETE' })
    return json({ ok: true }, 200, origin, env)
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
      const metaMatch = url.pathname.match(/^\/issue\/(\d+)\/meta$/)
      if (metaMatch && request.method === 'PATCH') {
        return await handleIssueMeta(env, request, url, metaMatch)
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

  /**
   * 写请求的封禁闸门。
   * 本站把 api.github.com 的全部流量都收进这条转发路，所以「被封的 GitHub 账号
   * 在本站写不出东西」这件事可以在这里真正落实——不是把按钮变灰，是服务器直接拒绝。
   * 唯一拦不住的场景是对方完全不用本站、自己写脚本直连 GitHub，那属于 GitHub 侧的
   * 仓库拉黑能力，不在代码能解决的范围。
   */
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && incomingAuth) {
    const rawToken = String(incomingAuth).replace(/^Bearer\s+/i, '').trim()
    if (rawToken && !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(rawToken)) {
      const login = await loginOfTokenCached(env, rawToken)
      if (login) {
        const ban = await banStateOfGh(env, login)
        if (banActive(ban)) {
          const until = ban.until === 0 ? '永久' : new Date(ban.until).toISOString().slice(0, 10)
          return json(
            { error: 'banned', message: '账号已被封禁，不能在本站发布内容', until, login },
            403,
            request.headers.get('Origin') || '',
            env,
          )
        }
      }
    }
  }

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
