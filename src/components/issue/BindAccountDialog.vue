<script setup>
/**
 * 账号绑定：把当前身份和另一个平台的账号连成同一个身份。
 *
 * 两步走，不让一步到位：
 *   1. 授权 —— 证明「那个账号确实归你」，QQ 侧收验证码、GitHub 侧走设备授权
 *   2. 确认 —— 把要绑的两个账号和后果列清楚，点一下才真正写进去
 *
 * 授权环节拿到的凭据只存在这个组件的内存里，不写 localStorage：
 * 绑定不该改变当前登录的人是谁。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { startDeviceFlow, pollDeviceToken } from '@/api/oauth'
import { sendCode as sendQqCode, verifyCodeOnly } from '@/api/qqAuth'
import { bindAccounts } from '@/api/link'
import { DEFAULT_PROXY_BASE } from '@/config/github'
import { getProxyBase } from '@/api/github'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

import IconGitHub from '~icons/lucide/github'
import IconMail from '~icons/lucide/mail'
import IconLink from '~icons/lucide/link-2'
import IconShieldAlert from '~icons/lucide/shield-alert'
import IconCircleAlert from '~icons/lucide/circle-alert'

const props = defineProps({
  open: Boolean,
  /** 'bind-qq'：当前是 GitHub 身份，要绑一个 QQ 邮箱；'bind-github'：反过来 */
  mode: { type: String, default: 'bind-github' },
})
const emit = defineEmits(['update:open'])

const store = useIssueStore()

const step = ref('auth')
const busy = ref(false)
const error = ref('')

/* ---------------- GitHub 侧：设备授权 ---------------- */
const ghFlow = ref(null)
const ghToken = ref('')
const ghAccount = ref(null)
let ghAbort = null

/* ---------------- QQ 侧：邮箱验证码 ---------------- */
const qqEmail = ref('')
const qqCode = ref('')
const qqSending = ref(false)
const qqCooldown = ref(0)
const qqAccount = ref(null)
let qqTimer = 0

/** 与登录面板同一套规则：@ 前面只认 5–11 位纯数字 QQ 号，同样只在发码时校验 */
const QQ_PREFIX_RE = /^\d{5,11}$/

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
const qqCanSend = computed(() => qqCooldown.value === 0 && !qqSending.value)
const qqCanVerify = computed(
  () => qqEmailValid.value && /^\d{6}$/.test(qqCode.value.trim()) && !busy.value,
)

const isBindGithub = computed(() => props.mode === 'bind-github')

/** 现在站在哪一侧 */
const mySide = computed(() =>
  isBindGithub.value
    ? { icon: 'qq', title: store.qqUser?.nick || 'QQ 用户', sub: store.qqUser?.masked || '' }
    : { icon: 'gh', title: store.user?.login || '', sub: 'GitHub 账号' },
)
const otherSide = computed(() =>
  isBindGithub.value
    ? { icon: 'gh', title: ghAccount.value?.login || '', sub: 'GitHub 账号' }
    : { icon: 'qq', title: qqAccount.value?.nick || 'QQ 用户', sub: qqAccount.value?.masked || '' },
)

function reset() {
  step.value = 'auth'
  busy.value = false
  error.value = ''
  ghFlow.value = null
  ghToken.value = ''
  ghAccount.value = null
  qqEmail.value = ''
  qqCode.value = ''
  qqAccount.value = null
  qqCooldown.value = 0
  window.clearInterval(qqTimer)
  if (ghAbort) {
    ghAbort.abort()
    ghAbort = null
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

onBeforeUnmount(() => {
  if (ghAbort) ghAbort.abort()
  window.clearInterval(qqTimer)
})

function close() {
  emit('update:open', false)
}

/* ---------------- 第一步：证明另一侧归你 ---------------- */

async function whoIsThisGh(token) {
  const root = (getProxyBase() || DEFAULT_PROXY_BASE || '').replace(/\/$/, '')
  const res = await fetch(root + '/gh/user', {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) return null
  const me = await res.json().catch(() => null)
  return me?.login ? { login: me.login, avatar: me.avatar_url || '' } : null
}

async function startGithubAuth() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    ghFlow.value = await store.beginDeviceLogin()
    ghAbort = new AbortController()
    pollGithub(ghFlow.value, ghAbort)
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    busy.value = false
  }
}

async function pollGithub(flow, controller) {
  const deadline = Date.now() + flow.expiresIn * 1000
  let interval = flow.interval * 1000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval))
    if (controller.signal.aborted) return
    const res = await pollDeviceToken(flow.deviceCode)
    if (res.access_token) {
      const who = await whoIsThisGh(res.access_token)
      if (!who) {
        error.value = '拿不到这个 GitHub 账号的信息，请重新授权'
        return
      }
      ghToken.value = res.access_token
      ghAccount.value = who
      step.value = 'confirm'
      return
    }
    if (res.error === 'authorization_pending') continue
    if (res.error === 'slow_down') {
      interval += 5000
      continue
    }
    if (res.error === 'expired_token') {
      error.value = '授权码已过期，请重新点击授权'
      return
    }
    if (res.error === 'access_denied') {
      error.value = '你取消了授权'
      return
    }
    error.value = res.error_description || res.error || 'GitHub 授权失败'
    return
  }
  error.value = '授权码已过期，请重新点击授权'
}

function startQqCooldown() {
  qqCooldown.value = 60
  window.clearInterval(qqTimer)
  qqTimer = window.setInterval(() => {
    qqCooldown.value = Math.max(0, qqCooldown.value - 1)
    if (qqCooldown.value === 0) window.clearInterval(qqTimer)
  }, 1000)
}

async function sendQqMail() {
  if (!qqCanSend.value) return
  // 点击时先校验，非数字前缀不发请求
  const issue = qqEmailIssue.value
  if (issue) {
    error.value = issue
    return
  }
  qqSending.value = true
  error.value = ''
  try {
    const data = await sendQqCode(qqEmail.value.trim())
    if (data?.debug && data?.code) {
      qqCode.value = data.code
      toast.info('开发模式：验证码已自动填入')
    } else {
      toast.success('验证码已发到邮箱')
    }
    startQqCooldown()
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    qqSending.value = false
  }
}

async function verifyQq() {
  if (!qqCanVerify.value) return
  busy.value = true
  error.value = ''
  try {
    const data = await verifyCodeOnly(qqEmail.value.trim(), qqCode.value.trim())
    if (!data?.token) throw new Error('验证失败')
    qqAccount.value = { token: data.token, nick: data.user?.nick || 'QQ 用户', masked: data.user?.masked || '' }
    step.value = 'confirm'
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    busy.value = false
  }
}

/* ---------------- 第二步：确认并写入 ---------------- */

async function confirmBind() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (isBindGithub.value) {
      await bindAccounts({ ghToken: ghToken.value })
    } else {
      await bindAccounts({ qqToken: qqAccount.value?.token || '' })
    }
    toast.success('已绑定，正在按 GitHub 身份重新加载')
    emit('update:open', false)
    // 绑定改变了「我是谁」，整页重来一次最干净，不留半新半旧的内存状态
    setTimeout(() => window.location.reload(), 700)
  } catch (err) {
    error.value = err?.message || String(err)
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="w-[min(480px,92vw)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
      <div class="border-border flex items-center gap-4 border-b px-5 pt-4 pb-3 pr-14">
        <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
          <IconLink class="size-4" />
        </div>
        <div class="min-w-0 translate-y-px">
          <DialogTitle class="text-base leading-none">绑定账号</DialogTitle>
          <DialogDescription class="mt-0.5 text-xs leading-relaxed">
            绑定后两个账号视为同一个人，以 GitHub 身份为准。
          </DialogDescription>
        </div>
      </div>

      <!-- 第一步：授权 -->
      <div v-if="step === 'auth'" class="flex flex-col gap-4 px-5 py-4">
        <p class="text-muted-foreground text-xs leading-relaxed">
          先证明另一个账号确实归你。这一步拿到的凭据不会替换当前的登录状态。
        </p>

        <!-- 当前是 QQ，绑 GitHub -->
        <template v-if="isBindGithub">
          <div v-if="!ghFlow" class="flex flex-col gap-2">
            <Button class="w-full gap-2" :disabled="busy" @click="startGithubAuth">
              <IconGitHub class="size-4" />
              {{ busy ? '正在获取授权码…' : '用 GitHub 账号授权' }}
            </Button>
          </div>
          <div v-else class="flex flex-col gap-3">
            <div class="bg-muted/60 rounded-lg px-3 py-2.5 text-center">
              <p class="text-muted-foreground text-[11px]">在 GitHub 页面输入这个码</p>
              <p class="mt-1 font-mono text-lg font-semibold tracking-[0.2em]">{{ ghFlow.userCode }}</p>
            </div>
            <a
              :href="ghFlow.verificationUri"
              target="_blank"
              rel="noopener"
              class="text-primary text-center text-xs underline underline-offset-2"
            >
              打开 GitHub 授权页面
            </a>
            <p class="text-muted-foreground text-center text-[11px]">授权完成后本窗口会自动继续</p>
          </div>
        </template>

        <!-- 当前是 GitHub，绑 QQ -->
        <template v-else>
          <div class="flex flex-col gap-1.5">
            <Label for="bind-email" class="text-xs text-muted-foreground">QQ 邮箱</Label>
            <div class="flex gap-2">
              <Input
                id="bind-email"
                v-model="qqEmail"
                placeholder="12345678@qq.com"
                class="flex-1"
                inputmode="email"
                autocomplete="email"
                @input="error = ''"
              />
              <Button class="shrink-0" :disabled="!qqCanSend" @click="sendQqMail">
                {{ qqSending ? '发送中…' : qqCooldown > 0 ? qqCooldown + 's' : '发验证码' }}
              </Button>
            </div>
            <p class="text-muted-foreground text-[11px]">
              只支持 @qq.com 与 @foxmail.com。
            </p>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="bind-code" class="text-xs text-muted-foreground">验证码</Label>
            <Input id="bind-code" v-model="qqCode" maxlength="6" placeholder="6 位数字" />
          </div>

          <Button class="w-full gap-2" :disabled="!qqCanVerify" @click="verifyQq">
            <IconMail class="size-4" />
            {{ busy ? '验证中…' : '验证邮箱' }}
          </Button>
        </template>

        <div
          v-if="error"
          class="border-destructive/25 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2.5"
        >
          <IconCircleAlert class="size-3.5 shrink-0" />
          <p class="text-[12.5px] leading-relaxed">{{ error }}</p>
        </div>
      </div>

      <!-- 第二步：确认 -->
      <div v-else class="flex flex-col gap-4 px-5 py-4">
        <div class="flex items-center justify-center gap-3">
          <div class="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg border border-border px-3 py-2.5">
            <component
              :is="mySide.icon === 'gh' ? IconGitHub : IconMail"
              class="text-muted-foreground size-4"
            />
            <p class="w-full truncate text-center text-xs font-medium">{{ mySide.title }}</p>
            <p class="text-muted-foreground w-full truncate text-center text-[10px]">{{ mySide.sub }}</p>
          </div>
          <IconLink class="text-muted-foreground size-4 shrink-0" />
          <div class="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg border border-border px-3 py-2.5">
            <component
              :is="otherSide.icon === 'gh' ? IconGitHub : IconMail"
              class="text-muted-foreground size-4"
            />
            <p class="w-full truncate text-center text-xs font-medium">{{ otherSide.title }}</p>
            <p class="text-muted-foreground w-full truncate text-center text-[10px]">{{ otherSide.sub }}</p>
          </div>
        </div>

        <div class="border-border bg-muted/40 flex flex-col gap-1.5 rounded-lg border px-3 py-2.5">
          <p class="flex items-center gap-1.5 text-xs font-medium">
            <IconShieldAlert class="size-3.5" />
            确认前请读完这几条
          </p>
          <ul class="text-muted-foreground flex list-disc flex-col gap-1 pl-4 text-[11px] leading-relaxed">
            <li>绑定后以 <span class="text-foreground font-medium">GitHub 账号</span> 为准：显示名、头像、权限都取它。</li>
            <li>以后用 QQ 登录，身份就是那个 GitHub 账号：权限、封禁、署名全按它算。</li>
            <li>用 QQ 登录照样能发帖、评论、打标签，不需要在这台设备上再登录一次 GitHub。</li>
            <li>任一账号被封禁，两个都算被封——所以才不允许绑已被封的账号。</li>
            <li>一个 QQ 只能绑一个 GitHub，一个 GitHub 也只能绑一个 QQ。</li>
          </ul>
        </div>

        <div
          v-if="error"
          class="border-destructive/25 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2.5"
        >
          <IconCircleAlert class="size-3.5 shrink-0" />
          <p class="text-[12.5px] leading-relaxed">{{ error }}</p>
        </div>
      </div>

      <div class="border-border flex items-center justify-between border-t px-5 py-3">
        <Button variant="ghost" size="sm" @click="close">取消</Button>
        <Button v-if="step === 'confirm'" size="sm" :disabled="busy" @click="confirmBind">
          {{ busy ? '绑定中…' : '确认绑定' }}
        </Button>
        <Badge v-else variant="secondary" class="text-[10px]">第 1 步 / 共 2 步</Badge>
      </div>
    </DialogContent>
  </Dialog>
</template>
