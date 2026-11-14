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
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import QqProfileDialog from './QqProfileDialog.vue'

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
import IconBookMarked from '~icons/lucide/book-marked'
import IconUserRound from '~icons/lucide/user-round'

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
    window.setTimeout(() => {
      authOpenModel.value = false
      resetFlow()
    }, 700)
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
const qqSending = ref(false)
const qqCooldown = ref(0)
const qqVerifying = ref(false)
const qqError = ref('')
let qqTimer = 0

const qqEmailValid = computed(() => /^[^\s@]+@(qq|foxmail)\.com$/i.test(qqEmail.value.trim()))
const qqCanSend = computed(() => qqEmailValid.value && qqCooldown.value === 0 && !qqSending.value)
const qqCanVerify = computed(
  () => qqEmailValid.value && /^\d{6}$/.test(qqCode.value.trim()) && !qqVerifying.value,
)

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
  qqSending.value = true
  qqError.value = ''
  try {
    const data = await sendQqCodeMail(qqEmail.value.trim())
    toast.success('验证码已发送，请查收邮箱（垃圾箱也看一眼）')
    // 服务端没配发信通道时会把码回在 debug 字段里，本地联调直接填上
    if (data?.debug && data.code) {
      qqCode.value = data.code
      toast.info('开发模式：验证码已自动填入')
    }
    startQqCooldown()
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
    toast.success('欢迎，' + (data.user?.nick || 'QQ 用户'))
    authOpenModel.value = false
    qqCode.value = ''
  } catch (err) {
    qqError.value = err?.message || String(err)
  } finally {
    qqVerifying.value = false
  }
}

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

function requestLogout() {
  settingsOpenModel.value = false
  // QQ 身份没有服务端会话可撤销，退出就是清本地令牌，不需要二次确认
  if (isQqOnly.value) {
    store.logoutQq()
    toast.success('已退出 QQ 登录')
    return
  }
  // 从设置面板点进来时先收起面板，避免两层弹窗叠在一起
  logoutConfirmOpen.value = true
}

function logout() {
  if (isQqOnly.value) store.logoutQq()
  else store.logout()
  toast.success('已退出登录')
  settingsOpenModel.value = false
}

const displayName = computed(() =>
  store.isLoggedIn
    ? store.user?.name || store.user?.login || ''
    : store.qqUser?.nick || 'QQ 用户',
)
const avatarUrl = computed(() => (store.isLoggedIn ? store.user?.avatar_url || '' : ''))
const initial = computed(() => (displayName.value || '?').slice(0, 1).toUpperCase())

onBeforeUnmount(resetFlow)
</script>

<template>
  <div class="inline-flex items-center">
    <Button
      v-if="!store.isLoggedIn && !store.isQqLoggedIn"
      size="sm"
      variant="outline"
      class="gap-1.5"
      @click="authOpenModel = true"
    >
      <IconGitHub class="size-3.5" />
      <span class="hidden sm:inline">登录</span>
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
          <Badge v-else-if="isQqOnly" variant="secondary" class="ml-auto text-[10px]">QQ</Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem v-if="isQqOnly" @select="profileOpen = true">
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

    <QqProfileDialog v-model:open="profileOpen" />

    <!-- 登录面板 -->
    <Dialog v-model:open="authOpenModel">
      <DialogContent class="sm:max-w-[820px]">
        <DialogHeader>
          <DialogTitle>登录</DialogTitle>
          <DialogDescription>
            发布 issue 与评论需要身份。GitHub 账号功能最全，QQ 邮箱登录门槛最低。
          </DialogDescription>
        </DialogHeader>

        <div class="mt-1 grid gap-5 sm:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
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
                <IconBookMarked class="size-5" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">仓库权限</p>
                <p class="text-muted-foreground text-xs leading-relaxed">
                  读取公开仓库的 issue、标签与里程碑；代表你发布、编辑、关闭 issue 与评论。
                  仓库拥有者与协作者（含 triage / maintain）凭此进入管理面板。
                </p>
              </div>
              <Badge
                variant="outline"
                class="bg-background border-foreground/15 shrink-0 rounded-full px-2 py-0 text-[10px] font-normal"
              >
                必需
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
            GitHub 没有「只能操作 issue」的独立权限位，存储库权限同时也包含公开仓库代码的写权限。
            本站不调用任何代码写入接口；凭据只保存在这台设备的浏览器里，可随时在
            GitHub 的 Settings → Applications 中撤销。
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
          <TabsContent value="device" class="mt-4 flex h-[263px] shrink-0 flex-col">
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
              <p v-if="flowError" class="text-destructive text-sm">{{ flowError }}</p>
              <Button class="mt-auto w-full gap-2" @click="startDeviceFlowLogin">
                <IconGitHub class="size-4" />
                生成验证码
              </Button>
            </div>

            <div v-else-if="flowState === 'requesting'" class="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
              <IconLoader class="size-4 animate-spin" />
              正在申请验证码…
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

            <div v-else-if="flowState === 'success'" class="flex items-center justify-center gap-2 py-6 text-sm">
              <IconCheck class="size-4" />
              登录成功
            </div>
          </TabsContent>

          <TabsContent value="token" class="mt-4 flex flex-1 flex-col gap-3">
            <p class="text-muted-foreground text-sm leading-relaxed">
              点下面的按钮打开 GitHub 创建页，权限已预填（public_repo + read:user），生成后把 token 粘回来。
            </p>
            <Button as-child variant="outline" class="w-full gap-2">
              <a :href="PAT_CREATE_URL" target="_blank" rel="noopener">
                <IconExternalLink class="size-4" />
                打开 GitHub 创建 Token
              </a>
            </Button>
            <div class="grid gap-1.5">
              <Label for="pat">Personal Access Token</Label>
              <Input id="pat" v-model="patValue" type="password" placeholder="ghp_… 或 github_pat_…" @keyup.enter="submitPat" />
            </div>
            <Button class="mt-auto w-full gap-2" :disabled="patLoading || !patValue.trim()" @click="submitPat">
              <IconKey class="size-4" />
              {{ patLoading ? '验证中…' : '用 Token 登录' }}
            </Button>
          </TabsContent>

          <!-- QQ 邮箱：没有 GitHub 账号也能发言，由服务器以机器人身份代发 -->
          <TabsContent value="qq" class="mt-4 flex min-h-[263px] shrink-0 flex-col gap-3">
            <p class="text-muted-foreground text-xs leading-relaxed">
              只收 @qq.com 与 @foxmail.com。登录后可以发 issue、评论、关闭自己发的单；
              发帖在 GitHub 上会显示为仓库机器人，正文里标注你的昵称。
            </p>

            <div class="flex flex-col gap-1.5">
              <Label for="qq-email" class="text-xs text-muted-foreground">QQ 邮箱</Label>
              <div class="flex gap-2">
                <Input id="qq-email" v-model="qqEmail" placeholder="12345678@qq.com" class="flex-1" />
                <Button
                  variant="outline"
                  class="shrink-0"
                  :disabled="!qqCanSend"
                  @click="sendQqCode"
                >
                  {{ qqSending ? '发送中…' : qqCooldown > 0 ? qqCooldown + 's' : '发验证码' }}
                </Button>
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <Label for="qq-code" class="text-xs text-muted-foreground">验证码</Label>
              <Input
                id="qq-code"
                v-model="qqCode"
                placeholder="6 位数字"
                inputmode="numeric"
                maxlength="6"
              />
            </div>

            <p v-if="qqError" class="text-destructive text-xs leading-relaxed">{{ qqError }}</p>

            <Button class="mt-auto w-full" :disabled="!qqCanVerify" @click="verifyQqCode">
              {{ qqVerifying ? '验证中…' : '登录' }}
            </Button>
          </TabsContent>
        </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- 连接设置 -->
    <Dialog v-model:open="settingsOpenModel">
      <DialogContent class="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>连接设置</DialogTitle>
          <DialogDescription>
            没有加速器时，可以让所有 GitHub 请求走你自己部署的中转地址。
          </DialogDescription>
        </DialogHeader>

        <div class="flex flex-col gap-4">
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
      <AlertDialogContent class="gap-0 overflow-hidden p-0 sm:max-w-[460px] sm:rounded-2xl">
        <div class="px-6 pt-6 pb-5">
          <AlertDialogHeader class="gap-2 text-left">
            <AlertDialogTitle class="text-2xl font-semibold tracking-tight">
              确认退出登录？
            </AlertDialogTitle>
            <AlertDialogDescription class="text-[15px] leading-relaxed">
              退出后会清除这台设备上保存的 GitHub 授权凭据。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <p
            class="border-border text-muted-foreground mt-6 rounded-xl border px-4 py-3.5 text-[13px] leading-relaxed"
          >
            只影响这台设备的登录状态，账号与仓库权限不受任何影响。
          </p>
        </div>

        <!-- 按钮尺寸对齐页头的「新建 Issue」：shadcn sm = h-8 / px-3 / gap-1.5 / text-sm -->
        <AlertDialogFooter class="border-border bg-muted/60 gap-2.5 border-t px-6 py-4">
          <AlertDialogCancel class="h-8 gap-1.5 px-3 text-sm">取消</AlertDialogCancel>
          <AlertDialogAction class="h-8 gap-1.5 px-3 text-sm font-semibold" @click="logout">
            退出登录
          </AlertDialogAction>
        </AlertDialogFooter>
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
