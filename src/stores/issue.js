import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

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
} from '@/api/github'
import { startDeviceFlow, pollDeviceToken, isDeviceFlowAvailable } from '@/api/oauth'
import {
  getQqToken,
  getQqUser,
  setQqToken,
  setQqUser,
  clearQqSession,
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
  const permission = ref('')

  const isLoggedIn = computed(() => Boolean(user.value && token.value))

  /** 站点管理员：仓库拥有者固定为 admin，其余看 GitHub 的实时权限 */
  const isOwner = computed(() => OWNER_LOGINS.includes(user.value?.login))

  /**
   * 管理权的判定以 GitHub 返回的仓库角色为准，而不是「谁拥有这个仓库」：
   * 拥有者、协作者、被授予 triage/maintain 的外部成员，都应该能进管理面板。
   * 只有接口没给出角色时（未登录、请求失败），才回落到 OWNER_LOGINS 白名单。
   */
  const canManage = computed(() => {
    if (MANAGE_ROLES.includes(permission.value)) return true
    if (permission.value) return false
    return isOwner.value || EXTRA_ADMIN_LOGINS.includes(user.value?.login)
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

  const isQqLoggedIn = computed(() => Boolean(qqToken.value))

  /** 写操作走谁：GitHub 身份优先，其次是 QQ 身份 */
  const writeMode = computed(() => {
    if (isLoggedIn.value) return 'github'
    if (isQqLoggedIn.value) return 'qq'
    return 'none'
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
  }

  /** 登录响应里直接带着封禁状态，省一次 /auth/me 往返 */
  function applyBanState({ banned, until, reason } = {}) {
    qqBanned.value = Boolean(banned)
    qqBanUntil.value = until || 0
    qqBanReason.value = reason || ''
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
    if (data.user) qqUser.value = data.user
  }

  /** 能发 issue / 评论就算「可写」：GitHub 登录或 QQ 登录都行（被封禁的 QQ 账号不行） */
  const canWrite = computed(
    () => isLoggedIn.value || (isQqLoggedIn.value && !qqBanned.value),
  )

  async function bootstrap() {
    if (!token.value) {
      authState.value = 'idle'
      return
    }
    authState.value = 'loading'
    try {
      const me = await githubApi.getMe()
      user.value = me
      setCachedUser(me)
      setToken(token.value)
      authState.value = 'ok'
      await refreshPermission()
    } catch (err) {
      if (err instanceof GitHubError && err.status === 401) {
        clearToken()
        token.value = ''
        user.value = null
        permission.value = ''
        authState.value = 'idle'
        return
      }
      authState.value = 'error'
      authError.value = err?.message || String(err)
    }
  }

  async function refreshPermission() {
    if (!user.value?.login) return
    try {
      const data = await githubApi.getPermission(user.value.login)
      permission.value = data?.permission || ''
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
      await refreshPermission()
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
  }

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
    isQqLoggedIn,
    writeMode,
    setQqSession,
    applyBanState,
    logoutQq,
    refreshQq,
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
