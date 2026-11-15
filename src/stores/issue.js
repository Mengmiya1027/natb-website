import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'

import {
  githubApi,
  getToken,
  setToken,
  clearToken,
  getCachedUser,
  setCachedUser,
  getProxyBase,
  setProxyBase,
  getRateLimit,
  GitHubError,
  onTokenCleared,
  onCredentialExpired,
  reportLoginSeen,
} from '@/api/github'
import { startDeviceFlow, pollDeviceToken, isDeviceFlowAvailable } from '@/api/oauth'
import { fetchGhIdentity } from '@/api/link'
import {
  getQqToken,
  getQqUser,
  setQqToken,
  setQqUser,
  clearQqSession,
  onQqSessionCleared,
  fetchMe as fetchQqMe,
} from '@/api/qqAuth'
import { OWNER_LOGINS, EXTRA_ADMIN_LOGINS, STORAGE_KEYS } from '@/config/github'

const MANAGE_ROLES = ['admin', 'maintain', 'write']
const THEME_MODES = ['system', 'light', 'dark']

export const useIssueStore = defineStore('issue', () => {
  /* ---------------- 登录态 ---------------- */

  const user = ref(getCachedUser())
  const token = ref(getToken())
  const authState = ref('idle') // idle | loading | ok | error
  const authError = ref('')
  /** 登录面板开关：凭据失效后自动置 true，用户不用自己找入口 */
  const authOpen = ref(false)
  const permission = ref('')

  const isLoggedIn = computed(() => Boolean(user.value && token.value))

  /** 站点管理员：仓库拥有者固定为 admin，其余看 GitHub 的实时权限 */
  const isOwner = computed(() => OWNER_LOGINS.includes(user.value?.login))

  /**
   * 管理权的判定以「这个人在这仓库里是什么角色」为准，与用什么方式登录无关：
   * 拥有者、协作者（含 maintain / write）都算管理。
   * 目前 QQ 身份还没有和 GitHub 账号绑定，所以 QQ 登录时 permission 为空、落到非管理；
   * 将来做双向绑定后，只要在 refreshQq / bootstrap 里把绑定账号的角色写进 permission
   * 这一处，canManage 与所有下游判断都会自动跟上，不需要改调用方。
   */
  const canManage = computed(() => {
    /* 两种身份各自解析出「在这个仓库的角色」，再看是否落在管理档位里——
     * 与用哪种方式登录无关，QQ 身份同样可能是管理（授予角色或绑定账号）。 */
    if (isLoggedIn.value) {
      if (MANAGE_ROLES.includes(permission.value)) return true
      if (permission.value) return false
      // GitHub 的 permission 还没取到时，用拥有者白名单兜一次
      if (isOwner.value || EXTRA_ADMIN_LOGINS.includes(user.value?.login)) return true
    }
    if (isQqLoggedIn.value && MANAGE_ROLES.includes(qqRole.value)) return true
    return false
  })

  /* ---------------- QQ 邮箱身份 ---------------- */

  /* 凭据被 401 清掉时，内存里的登录态必须跟着一起清，否则顶栏会显示一个假的已登录 */
  onTokenCleared(() => {
    token.value = ''
    user.value = null
    permission.value = ''
    authState.value = 'idle'
  })

  const qqToken = ref(getQqToken())
  const qqUser = ref(getQqUser())
  const qqBanned = ref(false)
  const qqBanUntil = ref(0)
  const qqBanReason = ref('')
  /** 这个 QQ 身份在本仓库的角色，由服务端解析（授予的角色或绑定账号的角色） */
  const qqRole = ref('')

  const isQqLoggedIn = computed(() => Boolean(qqToken.value))

  /* ---------------- 两种身份的绑定关系 ---------------- */

  /** 当前 QQ 会话绑定的 GitHub 账号：{ login } 或 null */
  const qqLinkedGh = ref(null)
  /** 当前 GitHub 账号绑定的 QQ 身份：{ sub, nick, masked } 或 null */
  const ghLinkedQq = ref(null)
  /** GitHub 侧的封禁状态（服务端算好的合并结果，前端只负责显示） */
  const ghBanned = ref(false)
  const ghBanUntil = ref(0)
  const ghBanReason = ref('')
  /** 「注册本站」的时间戳（中转只在第一次登录时记下），0 表示拿不到 */
  const ghJoinedAt = ref(0)

  /**
   * 写操作走哪条通道。
   * 绑定不会关掉任何一条：两边是同一个身份，用哪把钥匙进门，能力都是全集。
   * 走 QQ 通道时由中转用 App 凭据代写，署名落在那位绑定的 GitHub 账号上。
   */
  const writeMode = computed(() => {
    if (isLoggedIn.value) {
      // 被封禁的身份不能写。封禁的权威判定在服务端，这里只负责别把输入框摆给人家看
      if (ghBanned.value) return 'none'
      // 绑了 A 却拿 B 登录：这种状态本不该存在（一对一），出现了就不许写
      if (qqLinkedGh.value && user.value?.login?.toLowerCase() !== qqLinkedGh.value.login.toLowerCase()) {
        return 'none'
      }
      return 'github'
    }
    if (isQqLoggedIn.value) return qqBanned.value ? 'none' : 'qq'
    return 'none'
  })

  /**
   * 对外展示成哪个身份。绑定之后一律以 GitHub 为准——
   * 头像、名字、issue 落款都用它，QQ 昵称退成内部备注。
   */
  const displayAsGithub = computed(() => {
    if (isLoggedIn.value) return user.value?.login || ''
    return qqLinkedGh.value?.login || ''
  })

  function setQqSession(user, token) {
    if (token) {
      setQqToken(token)
      qqToken.value = token
    }
    if (user) {
      setQqUser(user)
      qqUser.value = user
    }
  }

  function logoutQq() {
    clearQqSession()
    qqToken.value = ''
    qqUser.value = null
    qqBanned.value = false
    qqBanUntil.value = 0
    qqBanReason.value = ''
    qqLinkedGh.value = null
  }

  /* QQ 会话被 401 清掉时，内存里的登录态跟着复位（与 GitHub 侧同一处理） */
  onQqSessionCleared(() => {
    qqToken.value = ''
    qqUser.value = null
    qqBanned.value = false
    qqBanUntil.value = 0
    qqBanReason.value = ''
    qqLinkedGh.value = null
  })

  /** 登录响应里直接带着封禁状态，省一次 /auth/me 往返 */
  function applyBanState({ banned, until, reason } = {}) {
    qqBanned.value = Boolean(banned)
    qqBanUntil.value = until || 0
    qqBanReason.value = reason || ''
  }

  /** 登录响应里带着角色，省一次 /auth/me */
  function applyQqRole(role) {
    qqRole.value = role || ''
  }

  /** 登录响应里也带着绑定关系，同样省一次往返 */
  function applyLink(linkedGh) {
    qqLinkedGh.value = linkedGh || null
  }

  /** 校验本地 QQ 令牌是否还有效，顺带同步封禁状态 */
  async function refreshQq() {
    if (!qqToken.value) return
    const data = await fetchQqMe()
    if (!data) {
      logoutQq()
      return
    }
    qqBanned.value = Boolean(data.banned)
    qqBanUntil.value = data.until || 0
    qqBanReason.value = data.reason || ''
    qqRole.value = data.role || ''
    qqLinkedGh.value = data.linkedGh || null
    if (data.user) qqUser.value = data.user
  }

  /** 拉一次 GitHub 侧的绑定状态：这个人绑了哪个 QQ、有没有被封 */
  async function refreshGhLink() {
    if (!isLoggedIn.value) {
      ghLinkedQq.value = null
      ghBanned.value = false
      ghBanUntil.value = 0
      ghBanReason.value = ''
      return
    }
    const data = await fetchGhIdentity()
    if (!data) return
    ghLinkedQq.value = data.linkedQq || null
    ghBanned.value = Boolean(data.banned)
    ghBanUntil.value = data.until || 0
    ghBanReason.value = data.reason || ''
  }

  /** 能发 issue / 评论就算「可写」。规则集中在 writeMode 一处，这里不重复判断 */
  const canWrite = computed(() => writeMode.value !== 'none')

  async function bootstrap() {
    if (!token.value) {
      authState.value = 'idle'
      return
    }
    authState.value = 'loading'
    try {
      const me = await githubApi.getMe()
      // 凭据在请求途中被判失效（gh 里已经通知过）：重试是匿名的，
      // 兜底回来的身份不能当成「登录成功」，否则界面会显示一个假账号
      if (!token.value) {
        applyCredentialExpired('gh')
        return
      }
      // 老会话也补报一次（中转那边一天只落一次盘），免得早先登录的人永远不进名单
      reportLoginSeen(token.value).then((at) => {
        if (at) ghJoinedAt.value = at
      })
      user.value = me
      setCachedUser(me)
      setToken(token.value)
      authState.value = 'ok'
      await refreshPermission()
      await refreshGhLink()
    } catch (err) {
      if (err instanceof GitHubError && err.status === 401) {
        // 进页面就发现凭据失效：与写操作走同一套反应
        applyCredentialExpired('gh')
        return
      }
      authState.value = 'error'
      authError.value = err?.message || String(err)
    }
  }

  async function refreshPermission() {
    if (!user.value?.login) return
    try {
      /* 用仓库对象里的 permissions 字段：它描述的是「当前这枚 token 在这个仓库能做什么」，
       * 任何读得了这个仓库的 token 都拿得到。
       * 原来的 /collaborators/{login}/permission 只有仓库管理员能查，普通协作者查自己会 404，
       * 于是 write 协作者一律被判成「没有管理员权限」——这就是 SSS133 遇到的情况。 */
      const data = await githubApi.getRepo({ noCache: true })
      const p = data?.permissions || {}
      permission.value = p.admin
        ? 'admin'
        : p.maintain
          ? 'maintain'
          : p.push
            ? 'write'
            : p.triage
              ? 'triage'
              : p.pull
                ? 'read'
                : ''
    } catch {
      permission.value = ''
    }
  }

  /** 直接粘贴 Personal Access Token 登录（无中转时的降级路径） */
  async function loginWithToken(raw) {
    const value = String(raw || '').trim()
    if (!value) throw new Error('请填写 Personal Access Token')
    authState.value = 'loading'
    authError.value = ''
    const previous = token.value
    setToken(value)
    token.value = value
    try {
      const me = await githubApi.getMe()
      user.value = me
      setCachedUser(me)
      authState.value = 'ok'
      // 让中转记一笔「这个人来登录过」，管理面板才看得见没发过言的账号
      reportLoginSeen(value).then((at) => {
        if (at) ghJoinedAt.value = at
      })
      await refreshPermission()
      await refreshGhLink()
      return me
    } catch (err) {
      setToken(previous)
      token.value = previous
      authState.value = 'error'
      authError.value = err?.message || String(err)
      throw err
    }
  }

  /** 发起 Device Flow，返回用户码；调用方负责展示与轮询 */
  async function beginDeviceLogin() {
    if (!isDeviceFlowAvailable()) {
      throw new Error(
        '账号登录需要「OAuth Client ID + 加速中转地址」两者齐备，请到「连接设置」检查中转地址是否为空',
      )
    }
    const flow = await startDeviceFlow()
    return flow
  }

  /**
   * 轮询直到拿到 token。
   * onTick 用于把「还在等」的状态反馈给界面；aborted 时通过 signal 中止。
   */
  async function completeDeviceLogin(flow, { onTick, signal } = {}) {
    const deadline = Date.now() + flow.expiresIn * 1000
    let interval = flow.interval * 1000

    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error('已取消登录')
      await new Promise((resolve) => setTimeout(resolve, interval))
      if (signal?.aborted) throw new Error('已取消登录')

      const res = await pollDeviceToken(flow.deviceCode)
      if (res.access_token) {
        await loginWithToken(res.access_token)
        return user.value
      }
      if (res.error === 'authorization_pending') {
        onTick?.('pending')
        continue
      }
      if (res.error === 'slow_down') {
        interval += 5000
        onTick?.('slow_down')
        continue
      }
      if (res.error === 'expired_token') throw new Error('设备码已过期，请重新发起登录')
      if (res.error === 'access_denied') throw new Error('你取消了授权')
      throw new Error(res.error_description || res.error || '登录失败')
    }
    throw new Error('设备码已过期，请重新发起登录')
  }

  function logout() {
    clearToken()
    token.value = ''
    user.value = null
    permission.value = ''
    authState.value = 'idle'
    authError.value = ''
    ghLinkedQq.value = null
    ghBanned.value = false
    ghBanUntil.value = 0
    ghBanReason.value = ''
    ghJoinedAt.value = 0
  }

  /* 凭据失效：当场退出、给出提示、弹出登录框。
   * 不要把「等你重新登录」丢给用户自己去菜单里找 —— 他那会儿正卡在一片失败里。
   * 进页面时发现失效也走这里：那条路径没有调用方会弹提示，不在这里说一声就是静默掉线。 */
  let lastExpiredAt = 0
  function applyCredentialExpired(who) {
    const qq = who === 'qq'
    if (qq) logoutQq()
    else logout()
    authOpen.value = true
    // 一次失效会被多条并发请求各报一遍，1.5 秒内只提示一次
    const now = Date.now()
    if (now - lastExpiredAt < 1500) return
    lastExpiredAt = now
    // 调用方此刻也在弹它自己的错误提示，两条几乎一样的框会叠在一起。
    // 等它弹完（下一轮事件循环）清场，再统一说一句。
    setTimeout(() => {
      toast.dismiss()
      toast.error(qq ? 'QQ 登录已失效，请重新登录' : 'GitHub 登录已失效，请重新登录', {
        id: 'auth-expired',
      })
    }, 0)
  }

  onCredentialExpired(applyCredentialExpired)

  /* ---------------- 加速中转 ---------------- */

  const proxyBase = ref(getProxyBase())

  function updateProxyBase(base) {
    setProxyBase(base)
    proxyBase.value = getProxyBase()
  }

  /* ---------------- 限流 ---------------- */

  const rate = ref(getRateLimit())

  function syncRate(value) {
    rate.value = value
  }

  /* ---------------- 主题 ---------------- */

  const themeMode = ref(readThemeMode())

  function readThemeMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.theme)
      return THEME_MODES.includes(saved) ? saved : 'system'
    } catch {
      return 'system'
    }
  }

  const resolvedTheme = computed(() => {
    if (themeMode.value !== 'system') return themeMode.value
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  /** 主题挂在 <html class="dark">，与 shadcn-vue 官方的 dark 变体一致；离开 Issue 页时由卸载钩子摘掉 */
  function applyTheme() {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('dark', resolvedTheme.value === 'dark')
  }

  function setThemeMode(mode) {
    themeMode.value = THEME_MODES.includes(mode) ? mode : 'system'
    try {
      localStorage.setItem(STORAGE_KEYS.theme, themeMode.value)
    } catch {
      /* 忽略隐私模式写入失败 */
    }
    applyTheme()
  }

  function clearTheme() {
    document.documentElement.classList.remove('dark')
  }

  return {
    user,
    token,
    authState,
    authError,
    authOpen,
    permission,
    isLoggedIn,
    isOwner,
    canManage,
    canWrite,
    qqUser,
    qqToken,
    qqBanned,
    qqBanUntil,
    qqBanReason,
    qqRole,
    applyQqRole,
    isQqLoggedIn,
    qqLinkedGh,
    ghLinkedQq,
    ghBanned,
    ghBanUntil,
    ghBanReason,
    ghJoinedAt,
    displayAsGithub,
    writeMode,
    setQqSession,
    applyBanState,
    applyLink,
    logoutQq,
    refreshQq,
    refreshGhLink,
    bootstrap,
    refreshPermission,
    loginWithToken,
    beginDeviceLogin,
    completeDeviceLogin,
    logout,
    proxyBase,
    updateProxyBase,
    rate,
    syncRate,
    themeMode,
    resolvedTheme,
    applyTheme,
    setThemeMode,
    clearTheme,
  }
})
