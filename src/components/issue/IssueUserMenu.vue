<script setup>
/**
 * 顶栏右侧的用户区：用户菜单 + 登录面板 + 连接设置。
 *
 * 面板开关由宿主 Issues.vue 持有（v-model:auth-open / v-model:settings-open）。
 * 登录优先 Device Flow；GitHub 的授权端点不允许浏览器跨域，因此只有配置了加速中转时
 * 才启用账号登录，否则引导到 Personal Access Token。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { ISSUE_REPO_URL, PAT_CREATE_URL, DEFAULT_PROXY_BASE } from '@/config/github'
import { probeConnection } from '@/api/github'
import { isDeviceFlowAvailable } from '@/api/oauth'
import { sendCode as sendQqCodeMail, verifyCode as verifyQqCodeMail } from '@/api/qqAuth'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import AccountCenterDialog from './AccountCenterDialog.vue'
import QqBanDialog from './QqBanDialog.vue'

import IconGitHub from '~icons/simple-icons/github'
import IconLogOut from '~icons/lucide/log-out'
import IconSettings from '~icons/lucide/settings'
import IconCopy from '~icons/lucide/copy'
import IconCheck from '~icons/lucide/check'
import IconExternalLink from '~icons/lucide/external-link'
import IconLoader from '~icons/lucide/loader-circle'
import IconWifi from '~icons/lucide/wifi'
import IconWifiOff from '~icons/lucide/wifi-off'
import IconKey from '~icons/lucide/key-round'
import IconCircleAlert from '~icons/lucide/circle-alert'
import IconQQ from '~icons/simple-icons/qq'
import IconUserRound from '~icons/lucide/user-round'
import IconCircleHelp from '~icons/lucide/circle-help'
import IconBookMarked from '~icons/lucide/book-marked'
import IconLogIn from '~icons/lucide/log-in'

const props = defineProps({
  authOpen: { type: Boolean, default: false },
  settingsOpen: { type: Boolean, default: false },
})
const emit = defineEmits(['update:authOpen', 'update:settingsOpen'])

const store = useIssueStore()

const authOpenModel = computed({
  get: () => props.authOpen,
  set: (v) => emit('update:authOpen', v),
})
const settingsOpenModel = computed({
  get: () => props.settingsOpen,
  set: (v) => emit('update:settingsOpen', v),
})

/* ---------------- Device Flow ---------------- */

const flow = ref(null)
const flowState = ref('idle')
const flowError = ref('')
const secondsLeft = ref(0)
let pollAbort = null
let countdownTimer = 0

const deviceFlowReady = computed(() => isDeviceFlowAvailable())
const authTab = ref('device')

function resetFlow() {
  window.clearTimeout(copiedTimer)
  copied.value = false
  pollAbort?.abort()
  pollAbort = null
  window.clearInterval(countdownTimer)
  flow.value = null
  flowState.value = 'idle'
  flowError.value = ''
  secondsLeft.value = 0
}

async function startDeviceFlowLogin() {
  resetFlow()
  flowState.value = 'requesting'
  let controller = null
  try {
    const data = await store.beginDeviceLogin()
    flow.value = data
    flowState.value = 'waiting'
    secondsLeft.value = data.expiresIn
    countdownTimer = window.setInterval(() => {
      secondsLeft.value = Math.max(0, secondsLeft.value - 1)
    }, 1000)

    controller = new AbortController()
    pollAbort = controller
    await store.completeDeviceLogin(data, { signal: controller.signal })
    flowState.value = 'success'
    toast.success(`欢迎回来，${store.user?.login || 'GitHub 用户'}`)
    // 结果页要让人看清楚是谁登录了，700ms 只够看见一闪
    window.setTimeout(() => {
      authOpenModel.value = false
      resetFlow()
    }, 1300)
  } catch (err) {
    // 用户主动取消：安静收场，不要把「已取消」当成错误弹出来
    if (controller?.signal.aborted) return
    flowState.value = 'error'
    flowError.value = err?.message || String(err)
  } finally {
    window.clearInterval(countdownTimer)
  }
}

/* ---------------- QQ 邮箱登录 ---------------- */

const qqEmail = ref('')
const qqCode = ref('')
/** 两步走：先填邮箱拿验证码（email），再输六位码登录（code） */
const qqStep = ref('email')
/** 这一轮已经发过验证码：第一页据此给出「返回输入」，免得手滑回来只能干等冷却 */
const qqSent = ref(false)
const qqSending = ref(false)
const qqCooldown = ref(0)
const qqVerifying = ref(false)
const qqError = ref('')
let qqTimer = 0

/** QQ 号是纯数字、5–11 位。输入框不拦字符，只在点「获取验证码」时校验 */
const QQ_PREFIX_RE = /^\d{5,11}$/

/** 逐条给出原因，而不是一个「格式错误」——点按钮时才校验，用户得知道错在哪 */
const qqEmailIssue = computed(() => {
  const v = qqEmail.value.trim()
  if (!v) return '请先填写 QQ 邮箱'
  const at = v.indexOf('@')
  if (at < 0) return '邮箱要写全，例如 12345678@qq.com'
  if (!QQ_PREFIX_RE.test(v.slice(0, at))) return '为获取对应头像、昵称，仅支持纯数字 QQ 邮箱'
  if (!/^(qq|foxmail)\.com$/.test(v.slice(at + 1))) return '只支持 @qq.com 与 @foxmail.com'
  return ''
})

const qqEmailValid = computed(() => !qqEmailIssue.value)
// 格式不再参与禁用判定：格式错时按钮照样能点，点了才有地方说明错在哪
const qqCanSend = computed(() => qqCooldown.value === 0 && !qqSending.value)
// 不绑定 qqStep：第一步的「登录」也要能用——从第二步点「上一步」回来时，
// 已填的 6 位码还在（backToEmail 有意不清空），按钮却因为换了屏而变灰，
// 用户只能再点一次「返回输入」。有码就能登，和在哪一屏无关。
const qqCanVerify = computed(() => /^\d{6}$/.test(qqCode.value.trim()) && !qqVerifying.value)

function startQqCooldown() {
  qqCooldown.value = 60
  window.clearInterval(qqTimer)
  qqTimer = window.setInterval(() => {
    qqCooldown.value = Math.max(0, qqCooldown.value - 1)
    if (qqCooldown.value === 0) window.clearInterval(qqTimer)
  }, 1000)
}

async function sendQqCode() {
  if (!qqCanSend.value) return
  // 点击这一刻先校验：非数字前缀、域名不对都在这里拦下，不发请求
  const issue = qqEmailIssue.value
  if (issue) {
    qqError.value = issue
    return
  }
  qqSending.value = true
  qqError.value = ''
  try {
    const data = await sendQqCodeMail(qqEmail.value.trim())
    qqCode.value = ''
    qqSent.value = true
    toast.success('验证码已发送，请查收邮箱（垃圾箱也看一眼）')
    // 服务端没配发信通道时会把码回在 debug 字段里，本地联调直接填上
    if (data?.debug && data.code) {
      qqCode.value = data.code
      toast.info('开发模式：验证码已自动填入')
    }
    startQqCooldown()
    qqStep.value = 'code'
  } catch (err) {
    qqError.value = err?.message || String(err)
  } finally {
    qqSending.value = false
  }
}

async function verifyQqCode() {
  if (!qqCanVerify.value) return
  qqVerifying.value = true
  qqError.value = ''
  try {
    const data = await verifyQqCodeMail(qqEmail.value.trim(), qqCode.value.trim())
    store.setQqSession(data.user, data.token)
    store.applyQqRole(data.role)
    store.applyLink(data.linkedGh)
    authOpenModel.value = false
    qqCode.value = ''
    qqStep.value = 'email'
    qqSent.value = false

    // 封禁不拦登录，只在登录后弹一次说明；写操作由服务端每次拦
    if (data.banned) {
      store.applyBanState({ banned: true, until: data.until, reason: data.reason })
      banOpen.value = true
      return
    }
    toast.success('欢迎，' + (data.user?.nick || 'QQ 用户'))
  } catch (err) {
    qqError.value = err?.message || String(err)
  } finally {
    qqVerifying.value = false
  }
}

/** 输入提示兼错误位：这一行始终占位，换行或报错都不会把按钮顶走 */
const qqHint = computed(() => {
  if (qqStep.value === 'email') return '验证码 10 分钟内有效，若未收到请检查垃圾邮件文件夹。'
  if ((qqCode.value || '').length === 6) return '已经填满，点下面的按钮登录。'
  return '填满 6 位数字后即可登录。'
})

/** 回第一步。已输入的码留着：上一步多半是手滑，回来应该接着填 */
function backToEmail() {
  qqStep.value = 'email'
  qqError.value = ''
}

/** 关掉登录面板就回到第一步，下次打开不会停在上次的验证码页 */
watch(authOpenModel, (open) => {
  if (open) return
  qqStep.value = 'email'
  qqSent.value = false
  qqCode.value = ''
  qqError.value = ''
})

const copied = ref(false)
let copiedTimer = 0

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    // 图标换成对勾并弹一下就是全部反馈，不再额外弹 toast
    copied.value = true
    window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    toast.error('复制失败，请手动选择文本')
  }
}

/* ---------------- PAT ---------------- */

const patValue = ref('')
const patLoading = ref(false)

async function submitPat() {
  if (!patValue.value.trim()) return
  patLoading.value = true
  try {
    await store.loginWithToken(patValue.value)
    toast.success(`欢迎回来，${store.user?.login || ''}`)
    patValue.value = ''
    authOpenModel.value = false
  } catch (err) {
    toast.error(err?.message || '登录失败')
  } finally {
    patLoading.value = false
  }
}

/* ---------------- 连接设置 ---------------- */

const proxyInput = ref(store.proxyBase)
const proxyTesting = ref(false)
const proxyResult = ref(null)

watch(
  () => props.settingsOpen,
  (open) => {
    if (open) {
      proxyInput.value = store.proxyBase
      proxyResult.value = null
    }
  },
)

const proxyOn = computed(() => Boolean(store.proxyBase))
const rate = computed(() => store.rate)
const ratePercent = computed(() =>
  rate.value?.limit ? Math.round((rate.value.remaining / rate.value.limit) * 100) : 0,
)

async function testProxy(base) {
  proxyTesting.value = true
  try {
    const r = await probeConnection(base)
    proxyResult.value = r
    if (r.ok) toast.success(`连接正常，延迟 ${r.ms} ms`)
    else toast.error(r.status ? `连接失败（HTTP ${r.status}）` : '无法连接，请检查地址或网络')
    return r
  } finally {
    proxyTesting.value = false
  }
}

async function saveProxy() {
  store.updateProxyBase(proxyInput.value)
  toast.success(proxyInput.value ? '已切换到加速中转' : '已切回直连')
  await testProxy(proxyInput.value)
}

/** 退出登录的二次确认开关：下拉菜单和设置面板都走它 */
const logoutConfirmOpen = ref(false)


const isQqOnly = computed(() => store.isQqLoggedIn && !store.isLoggedIn)
const profileOpen = ref(false)
const banOpen = ref(false)

function requestLogout() {
  settingsOpenModel.value = false
  // QQ 身份虽然只是清本地令牌，但退出后要重新收验证码才能回来，同样走二次确认
  logoutConfirmOpen.value = true
}

function logout() {
  if (isQqOnly.value) store.logoutQq()
  else store.logout()
  toast.success('已退出登录')
  settingsOpenModel.value = false
}

const displayName = computed(() => {
  if (store.isLoggedIn) return store.user?.name || store.user?.login || ''
  // 绑定之后对外就是那位 GitHub 账号，QQ 昵称退回内部备注
  if (store.qqLinkedGh?.login) return '@' + store.qqLinkedGh.login
  return store.qqUser?.nick || 'QQ 用户'
})
const avatarUrl = computed(() => {
  if (store.isLoggedIn) return store.user?.avatar_url || ''
  if (store.qqLinkedGh?.login) return 'https://github.com/' + store.qqLinkedGh.login + '.png?size=64'
  return ''
})
const initial = computed(() => (displayName.value || '?').slice(0, 1).toUpperCase())

onBeforeUnmount(resetFlow)
</script>

<template>
  <div class="inline-flex items-center">
    <Button
      v-if="!store.isLoggedIn && !store.isQqLoggedIn"
      size="sm"
      variant="outline"
      class="gap-1"
      @click="authOpenModel = true"
    >
      <IconQQ class="size-4" />
      <span class="bg-foreground/25 h-3 w-px" aria-hidden="true" />
      <IconGitHub class="size-4" />
      <span class="hidden pl-1 sm:inline">登录</span>
    </Button>

    <DropdownMenu v-else>
      <DropdownMenuTrigger as-child>
        <button type="button" class="rounded-full ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden" :title="displayName">
          <Avatar class="size-7">
            <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="displayName" />
            <AvatarFallback class="text-[11px]">{{ initial }}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-56">
        <DropdownMenuLabel class="flex items-center gap-2">
          <Avatar class="size-6">
            <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="displayName" />
            <AvatarFallback class="text-[10px]">{{ initial }}</AvatarFallback>
          </Avatar>
          <span class="truncate">{{ displayName }}</span>
          <Badge v-if="store.canManage" variant="secondary" class="ml-auto text-[10px]">管理</Badge>
          <Badge v-else-if="store.qqLinkedGh?.login" variant="secondary" class="ml-auto text-[10px]">已绑定</Badge>
          <Badge v-else-if="isQqOnly" variant="secondary" class="ml-auto text-[10px]">QQ</Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="profileOpen = true">
          <IconUserRound class="size-4" />
          <span>个人中心</span>
        </DropdownMenuItem>
        <DropdownMenuItem @select="settingsOpenModel = true">
          <IconSettings class="size-4" />
          <span>连接设置</span>
        </DropdownMenuItem>
        <DropdownMenuItem as-child>
          <a :href="ISSUE_REPO_URL" target="_blank" rel="noopener" class="flex w-full items-center gap-2">
            <IconExternalLink class="size-4" />
            <span>在 GitHub 打开仓库</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" @select="requestLogout">
          <IconLogOut class="size-4" />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <AccountCenterDialog v-model:open="profileOpen" />
    <QqBanDialog v-model:open="banOpen" />

    <!-- 登录面板 -->
    <Dialog v-model:open="authOpenModel">
      <DialogContent class="gap-0 p-0 sm:max-w-[820px]">
        <div class="border-border flex items-center gap-4 border-b px-5 pt-4 pb-3 pr-14">
          <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
            <IconLogIn class="size-4" />
          </div>
          <div class="min-w-0 translate-y-px">
            <DialogTitle class="text-base leading-none">登录</DialogTitle>
            <DialogDescription class="mt-0.5">
              发布 issue 与评论需要身份。GitHub 账号功能最全，QQ 邮箱登录门槛最低。
            </DialogDescription>
          </div>
        </div>

        <div class="grid gap-5 px-5 py-4 sm:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <!-- 左栏：权限说明。右侧内容变高时（如切到 Token 表单）垂直居中，
               空白匀到上下两边，不会堆在底部 -->
          <div class="flex min-w-0 flex-col justify-center">
        <!-- 权限说明：每一项换成「图标方块 + 名称 + 用途」，与列表行同一套视觉语言 -->
        <div class="border-foreground/10 bg-muted/60 overflow-hidden rounded-xl border">
          <div class="divide-foreground/10 divide-y">
            <div class="flex items-center gap-3 p-3">
              <div
                class="bg-background border-foreground/10 flex size-10 shrink-0 items-center justify-center rounded-lg border"
              >
                <IconCircleHelp v-if="authTab === 'qq'" class="size-5" />
                <IconBookMarked v-else class="size-5" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">
                  {{ authTab === 'qq' ? '为什么仅支持纯数字邮箱？' : '仓库权限' }}
                </p>
                <p class="text-muted-foreground text-xs leading-relaxed">
                  <template v-if="authTab === 'qq'">
                    QQ 号是一串唯一的数字，只有它才能匹配到对应的头像与昵称。登录后也可以进入个人中心切换头像，或自定义一个昵称。
                  </template>
                  <template v-else>
                    读取公开仓库的 issue、标签与里程碑；代表你发布、编辑、关闭 issue 与评论。
                    仓库拥有者与协作者（含 triage / maintain）凭此进入管理面板。
                  </template>
                </p>
              </div>
              <!-- 两张卡各挂一个徽章：QQ 那张讲的是规则而不是权限，用「要求」区分 -->
              <Badge
                variant="outline"
                class="bg-background border-foreground/15 shrink-0 rounded-full px-2 py-0 text-[10px] font-normal"
              >
                {{ authTab === 'qq' ? '要求' : '必需' }}
              </Badge>
            </div>

            <div class="flex items-center gap-3 p-3">
              <div
                class="bg-background border-foreground/10 flex size-10 shrink-0 items-center justify-center rounded-lg border"
              >
                <IconUserRound class="size-5" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">个人信息</p>
                <p class="text-muted-foreground text-xs leading-relaxed">
                  读取你的公开资料（用户名、头像），用来显示「这条是我发的」，并据此识别你在该仓库的角色。
                </p>
              </div>
              <Badge
                variant="outline"
                class="bg-background border-foreground/15 shrink-0 rounded-full px-2 py-0 text-[10px] font-normal"
              >
                必需
              </Badge>
            </div>
          </div>

          <p class="bg-background text-muted-foreground border-foreground/10 border-t px-3 py-2.5 text-[11px] leading-relaxed">
            <template v-if="authTab === 'qq'">
              验证码只用于证明这个邮箱确实属于你，站点不会读取你的邮箱密码，也不会向你索取 QQ
              账号或密码。登录状态仅保存在这台设备的浏览器里，换一台设备需要重新验证。
            </template>
            <template v-else>
              GitHub 没有「只能操作 issue」的独立权限位，存储库权限同时也包含公开仓库代码的写权限。
              本站不调用任何代码写入接口；凭据只保存在这台设备的浏览器里，可随时在
              GitHub 的 Settings → Applications 中撤销。
            </template>
          </p>
        </div>
          </div>

          <!-- 右栏：登录方式与具体操作（按钮统一沉到底部） -->
          <div class="flex min-w-0 flex-col">
        <Tabs v-model="authTab" class="flex flex-1 flex-col">
          <TabsList class="grid w-full grid-cols-3">
            <TabsTrigger value="device">GitHub</TabsTrigger>
            <TabsTrigger value="token">Token</TabsTrigger>
            <TabsTrigger value="qq">QQ 邮箱</TabsTrigger>
          </TabsList>

          <!-- 以「未生成验证码」那一态的高度为准（263px）：
               给它设成固定高度，并把等待态的间距收紧，切过去时右侧不会长高 -->
          <!-- 三栏用 min-height 而不是 height：TabsContent 基类带 flex-1，
               height 会被 flex-basis 覆盖、失效；min-height 不受影响。
               210 是能同时容纳 GitHub 与 Token 两栏内容的最小值，两者因此等高。 -->
          <TabsContent value="device" class="mt-4 flex min-h-[210px] flex-col">
            <div v-if="!deviceFlowReady" class="flex flex-1 flex-col gap-3">
              <p class="text-muted-foreground text-sm leading-relaxed">
                GitHub 的授权端点不允许浏览器跨域直连，账号登录需要先给本站配置一个加速中转
                （部署方式见仓库的 <code class="bg-muted rounded px-1 py-0.5 font-mono text-xs">worker/README.md</code>）。
                在那之前可以先用 Token 登录，功能完全一样。
              </p>
              <Button variant="outline" class="mt-auto w-full gap-2" @click="authTab = 'token'">
                <IconKey class="size-4" />
                改用 Token 登录
              </Button>
            </div>

            <div v-else-if="flowState === 'idle' || flowState === 'error'" class="flex flex-1 flex-col gap-3">
              <p class="text-muted-foreground text-sm leading-relaxed">
                点击下面的按钮，我们会给你一串 8 位验证码，在 GitHub 页面输入即可完成授权。
              </p>
              <div
                v-if="flowError"
                class="border-destructive/25 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2.5"
              >
                <IconCircleAlert class="size-3.5 shrink-0" />
                <p class="text-[12.5px] leading-relaxed">{{ flowError }}</p>
              </div>
              <Button class="mt-auto w-full gap-2" @click="startDeviceFlowLogin">
                <IconGitHub class="size-4" />
                生成验证码
              </Button>
            </div>

            <!-- 与成功态同构：图标块 + 标题 + 一句说明 -->
            <div v-else-if="flowState === 'requesting'" class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div class="bg-muted grid size-12 place-items-center rounded-xl">
                <IconLoader class="size-5 animate-spin" />
              </div>
              <div class="flex flex-col gap-1">
                <p class="text-base font-semibold">正在申请验证码</p>
                <p class="text-muted-foreground max-w-[280px] text-xs leading-relaxed">
                  正在向 GitHub 申请授权码，通常只需要几秒钟。
                </p>
              </div>
            </div>

            <div v-else-if="flowState === 'waiting'" class="flex flex-1 flex-col gap-2">
              <p class="text-muted-foreground text-sm">在 GitHub 中输入下面这串验证码：</p>
              <div class="bg-muted/60 flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2.5">
                <span class="font-mono text-xl font-semibold tracking-[0.14em]">{{ flow.userCode }}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8"
                  :title="copied ? '已复制' : '复制验证码'"
                  @click="copyText(flow.userCode)"
                >
                  <component
                    :is="copied ? IconCheck : IconCopy"
                    :key="copied ? 'check' : 'copy'"
                    class="copy-pop size-4"
                    :class="copied ? 'text-emerald-500' : ''"
                  />
                </Button>
              </div>
              <!-- flex-1 吃掉按钮上方的全部余量，把等待信息撑在这块空隙的垂直正中 -->
              <div class="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-xs">
                <IconLoader class="size-3.5 animate-spin" />
                等待授权… 还剩 {{ secondsLeft }} 秒
              </div>
              <!-- 按钮组自然被挤到栏底，取消的底边与左侧权限说明框下边缘齐平 -->
              <Button as-child variant="outline" class="w-full gap-2">
                <a :href="flow.verificationUri" target="_blank" rel="noopener">
                  <IconExternalLink class="size-4" />
                  打开 GitHub 验证页面
                </a>
              </Button>
              <Button variant="secondary" size="sm" class="w-full" @click="resetFlow">取消</Button>
            </div>

            <!-- 成功态不是一个字：图标块 + 标题 + 一句说明，和面板里其它空状态同一套版式 -->
            <div v-else-if="flowState === 'success'" class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div class="bg-muted grid size-12 place-items-center rounded-xl">
                <IconCheck class="size-5" />
              </div>
              <div class="flex flex-col gap-1">
                <p class="text-base font-semibold">登录成功</p>
                <p class="text-muted-foreground max-w-[280px] text-xs leading-relaxed">
                  现在的身份是 @{{ store.user?.login || 'GitHub 用户' }}，可以发 issue 与评论了。
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="token" class="mt-4 flex min-h-[210px] flex-col gap-3">
            <p class="text-muted-foreground text-sm leading-relaxed">
              还没有 Token？点下面的按钮打开 GitHub 创建页，权限已预填（public_repo + read:user），生成后粘回来。
            </p>
            <div class="grid gap-1.5">
              <Label for="pat">Personal Access Token</Label>
              <Input id="pat" v-model="patValue" type="password" placeholder="ghp_… 或 github_pat_…" @keyup.enter="submitPat" />
            </div>
            <!-- 创建与登录是同一个动作的前后两步，贴在一起沉到栏底 -->
            <Button as-child variant="outline" class="mt-auto w-full gap-2">
              <a :href="PAT_CREATE_URL" target="_blank" rel="noopener">
                <IconExternalLink class="size-4" />
                打开 GitHub 创建 Token
              </a>
            </Button>
            <Button class="w-full gap-2" :disabled="patLoading || !patValue.trim()" @click="submitPat">
              <IconKey class="size-4" />
              {{ patLoading ? '验证中…' : '用 Token 登录' }}
            </Button>
          </TabsContent>

          <!-- QQ 邮箱：两步走。切换时整块横向滑动，与管理面板的「新建」滑板同一手法 -->
          <TabsContent value="qq" class="mt-4 flex min-h-[210px] flex-col">
            <div class="relative flex-1 overflow-hidden">
              <!-- 第一步：证明邮箱 -->
              <div
                class="absolute inset-0 flex flex-col gap-2 px-1 transition-[transform,translate,opacity] duration-300 ease-[ease]"
                :class="
                  qqStep === 'email'
                    ? 'translate-x-0 opacity-100'
                    : 'pointer-events-none -translate-x-full opacity-0'
                "
                :aria-hidden="qqStep !== 'email'"
              >
                <h3 class="text-[17px] font-bold tracking-tight">用 QQ 邮箱登录</h3>
                <p class="text-muted-foreground text-xs leading-relaxed">
                  只收 @qq.com 与 @foxmail.com。发帖在 GitHub 上会显示为仓库机器人，正文里标注你的昵称。
                </p>

                <div class="flex flex-col gap-1.5">
                  <Label for="qq-email" class="text-xs text-muted-foreground">QQ 邮箱</Label>
                  <div class="flex gap-2">
                    <Input
                      id="qq-email"
                      v-model="qqEmail"
                      placeholder="12345678@qq.com"
                      class="flex-1"
                      inputmode="email"
                      autocomplete="email"
                      @input="qqError = ''"
                      @keyup.enter="sendQqCode"
                    />
                    <Button
                      variant="outline"
                      class="shrink-0"
                      :disabled="!qqCanSend"
                      @click="sendQqCode"
                    >
                      {{ qqSending ? '发送中…' : qqCooldown > 0 ? qqCooldown + 's' : '获取验证码' }}
                    </Button>
                  </div>
                </div>

                <p
                  class="min-h-4 text-xs leading-4"
                  :class="qqError ? 'text-destructive' : 'text-muted-foreground'"
                >
                  {{ qqError || qqHint }}
                </p>

                <!-- 发过码之后才知道「返回输入」要有：没发过码时就只有一个占满宽度的登录 -->
                <div class="mt-auto grid gap-2" :class="qqSent ? 'grid-cols-2' : 'grid-cols-1'">
                  <Button v-if="qqSent" variant="outline" class="w-full" @click="qqStep = 'code'">
                    返回输入
                  </Button>
                  <Button class="w-full gap-2" :disabled="!qqCanVerify" @click="verifyQqCode">
                    <IconQQ class="size-4" />
                    {{ qqVerifying ? '验证中…' : '登录' }}
                  </Button>
                </div>
              </div>

              <!-- 第二步：输入验证码 -->
              <div
                class="absolute inset-0 flex flex-col gap-2 px-1 transition-[transform,translate,opacity] duration-300 ease-[ease]"
                :class="
                  qqStep === 'code'
                    ? 'translate-x-0 opacity-100'
                    : 'pointer-events-none translate-x-full opacity-0'
                "
                :aria-hidden="qqStep !== 'code'"
              >
                <h3 class="text-[17px] font-bold tracking-tight">输入验证码</h3>
                <!-- 这一行兼职错误位：出错时换成红字，不再额外占一行 -->
                <p
                  class="text-xs leading-relaxed"
                  :class="qqError ? 'text-destructive' : 'text-muted-foreground'"
                >
                  <template v-if="qqError">{{ qqError }}</template>
                  <template v-else>
                    验证码已发到 <span class="text-foreground font-medium">{{ qqEmail }}</span>，10 分钟内有效。
                  </template>
                </p>

                <!-- 六格均分整栏宽度：格子吃掉容器的剩余宽度，比默认的 36px 高一档 -->
                <InputOTP v-model="qqCode" :maxlength="6" class="w-full">
                  <InputOTPGroup class="flex-1">
                    <InputOTPSlot :index="0" class="h-12 w-auto flex-1 font-mono text-lg font-semibold tabular-nums" />
                    <InputOTPSlot :index="1" class="h-12 w-auto flex-1 font-mono text-lg font-semibold tabular-nums" />
                    <InputOTPSlot :index="2" class="h-12 w-auto flex-1 font-mono text-lg font-semibold tabular-nums" />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup class="flex-1">
                    <InputOTPSlot :index="3" class="h-12 w-auto flex-1 font-mono text-lg font-semibold tabular-nums" />
                    <InputOTPSlot :index="4" class="h-12 w-auto flex-1 font-mono text-lg font-semibold tabular-nums" />
                    <InputOTPSlot :index="5" class="h-12 w-auto flex-1 font-mono text-lg font-semibold tabular-nums" />
                  </InputOTPGroup>
                </InputOTP>

                <!-- 与主按钮同高（都是 h-9），只靠描边区分主次 -->
                <Button variant="outline" class="mt-auto w-full" @click="backToEmail">
                  上一步
                </Button>
                <Button class="w-full gap-2" :disabled="!qqCanVerify" @click="verifyQqCode">
                  <IconQQ class="size-4" />
                  {{ qqVerifying ? '验证中…' : '登录' }}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- 连接设置 -->
    <Dialog v-model:open="settingsOpenModel">
      <DialogContent class="gap-0 p-0 sm:max-w-[520px]">
        <div class="border-border flex items-center gap-4 border-b px-5 pt-4 pb-3 pr-14">
          <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
            <IconSettings class="size-4" />
          </div>
          <div class="min-w-0 translate-y-px">
            <DialogTitle class="text-base leading-none">连接设置</DialogTitle>
            <DialogDescription class="mt-0.5">
              没有加速器时，可以让 GitHub 请求走自己部署的中转地址。
            </DialogDescription>
          </div>
        </div>

        <div class="flex flex-col gap-4 px-5 py-4">
          <div class="grid gap-1.5">
            <Label for="proxy">加速中转地址</Label>
            <Input id="proxy" v-model="proxyInput" placeholder="https://your-worker.workers.dev（留空即直连）" />
            <p class="text-muted-foreground text-xs">
              默认地址：<code class="bg-muted rounded px-1 py-0.5 font-mono">{{ DEFAULT_PROXY_BASE }}</code>
            </p>
            <p class="text-muted-foreground text-xs">
              留空即直连 api.github.com（账号登录会因此不可用）；填写后所有请求走 &lt;地址&gt;/gh。
            </p>
          </div>

          <div class="flex items-center justify-between text-sm">
            <span class="flex items-center gap-1.5">
              <component :is="proxyOn ? IconWifi : IconWifiOff" class="size-4" />
              {{ proxyOn ? '当前：加速中转' : '当前：直连' }}
            </span>
            <span v-if="proxyResult" class="text-muted-foreground text-xs tabular-nums">
              {{ proxyResult.ok ? `${proxyResult.ms} ms` : proxyResult.status ? `HTTP ${proxyResult.status}` : '不可达' }}
            </span>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button variant="outline" :disabled="proxyTesting" @click="testProxy(proxyInput)">
              {{ proxyTesting ? '测试中…' : '测试连接' }}
            </Button>
            <Button @click="saveProxy">保存并应用</Button>
            <Button variant="ghost" @click="proxyInput = DEFAULT_PROXY_BASE">恢复默认</Button>
          </div>

          <Separator />

          <div class="grid gap-1.5">
            <div class="flex items-center justify-between text-sm">
              <span>接口限流</span>
              <span class="text-muted-foreground text-xs tabular-nums">
                {{ rate.limit ? `剩余 ${rate.remaining} / ${rate.limit}` : '尚未获取' }}
              </span>
            </div>
            <div v-if="rate.limit" class="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div class="bg-primary h-full rounded-full transition-[width]" :style="{ width: ratePercent + '%' }"></div>
            </div>
          </div>
        </div>

        <DialogFooter v-if="store.isLoggedIn" class="sm:justify-between">
          <span class="text-muted-foreground text-xs">已登录：{{ store.user?.login }}</span>
          <Button variant="destructive" size="sm" class="gap-2 font-semibold text-white" @click="requestLogout">
            <IconLogOut class="size-4" />
            退出登录
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 退出登录二次确认 -->
    <AlertDialog v-model:open="logoutConfirmOpen">
      <AlertDialogContent class="w-[min(400px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-none sm:rounded-xl">
        <div class="flex flex-col items-center px-7 pt-5 pb-4 text-center">
          <div class="flex items-center gap-3">
            <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
              <IconLogOut class="size-4" />
            </div>
            <AlertDialogTitle class="text-xl font-bold">确认退出登录？</AlertDialogTitle>
          </div>

          <AlertDialogDescription class="text-muted-foreground mt-3 text-sm leading-relaxed">
            {{
              isQqOnly
                ? '退出后会清除这台设备上保存的 QQ 登录状态，下次进入需要重新走一遍邮箱验证码流程。'
                : '退出后会清除这台设备上保存的 GitHub 授权凭据，下次进入需要重新完成一次授权。'
            }}
          </AlertDialogDescription>

          <p
            class="border-border text-muted-foreground mt-4 w-full rounded-xl border px-4 py-3 text-left text-[12.5px] leading-relaxed"
          >
            {{
              isQqOnly
                ? '昵称与已经发布的内容都会完整保留，不会因为退出登录而被删除或隐藏，随时可以用同一个邮箱重新登录。'
                : '只影响这台设备的登录状态，账号本身与仓库里的权限都不受影响，随时可以重新授权登录。'
            }}
          </p>
        </div>

        <div class="border-border bg-muted/70 border-t px-5 py-4">
          <div class="grid w-full grid-cols-2 gap-2">
            <AlertDialogCancel class="h-8 rounded-md px-3 text-sm font-medium">取消</AlertDialogCancel>
            <AlertDialogAction class="h-8 rounded-md px-3 text-sm font-semibold" @click="logout">
              退出登录
            </AlertDialogAction>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
<style scoped>
/* 复制成功时图标换成对勾并弹一下 */
.copy-pop {
  animation: copy-pop 220ms cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes copy-pop {
  from {
    transform: scale(0.45);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
