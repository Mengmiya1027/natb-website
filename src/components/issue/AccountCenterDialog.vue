<script setup>
/**
 * 个人中心。两种身份共用同一个面板，内容按「现在是谁」分流。
 *
 * 头像不做上传（会引入对象存储成本）：GitHub 身份用 GitHub 的头像，
 * QQ 身份用昵称首字母 + 由 sub 算出的固定底色，换昵称不变色。
 */
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { countUserActivity } from '@/api/github'
import { unbindAccounts } from '@/api/link'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import BindAccountDialog from './BindAccountDialog.vue'
import ProfileEditDialog from './ProfileEditDialog.vue'

import IconLogOut from '~icons/lucide/log-out'
import IconBan from '~icons/lucide/ban'
import IconCrown from '~icons/lucide/crown'
import IconShieldCheck from '~icons/lucide/shield-check'
import IconLink from '~icons/lucide/link-2'
import IconUnlink from '~icons/lucide/unlink'
import IconGitHub from '~icons/lucide/github'
import IconMail from '~icons/lucide/mail'
import IconPencil from '~icons/lucide/pencil'
import IconUserRound from '~icons/lucide/user-round'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['update:open'])

const store = useIssueStore()

const editOpen = ref(false)
const binding = ref(false)
const bindMode = ref('bind-github')
const unbinding = ref(false)

const isGh = computed(() => store.isLoggedIn)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    // 封禁与绑定状态都可能在别处被改过，打开时刷新一次
    store.refreshQq().catch(() => {})
    store.refreshGhLink().catch(() => {})
    loadGhStats()
  },
)

function formatUntil(until) {
  if (!until) return '永久封禁'
  const d = new Date(until)
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ' 解封'
}

/** 把毫秒时间戳换成「过了多少天」，满 24 小时算一天 */
function daysSince(ms) {
  if (!ms) return 0
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000))
}

/* GitHub 身份没有 QQ 那份档案，三格统计现拉一次 */
const ghStats = ref(null)
async function loadGhStats() {
  const login = store.user?.login
  if (!login) return
  try {
    ghStats.value = await countUserActivity(login)
  } catch {
    // 统计拉不到不影响面板本身，数字留在 0
  }
}

/** 三格统计：QQ 读档案，GitHub 读仓库查询结果 */
const stats = computed(() =>
  isGh.value
    ? {
        issues: ghStats.value?.issues ?? 0,
        comments: ghStats.value?.comments ?? 0,
        // 「注册本站」的时间来自中转（/auth/seen 第一次记下）；拿不到就按昨天算
        days: daysSince(store.ghJoinedAt || Date.now() - 86400000),
      }
    : {
        issues: store.qqUser?.issues ?? 0,
        comments: store.qqUser?.comments ?? 0,
        days: daysSince(store.qqUser?.created),
      },
)

/* 右栏状态块：封禁 / 管理员 / 正常，三选一 */
const banned = computed(() => (isGh.value ? store.ghBanned : store.qqBanned))
const banReason = computed(() => (isGh.value ? store.ghBanReason : store.qqBanReason))
const banUntilText = computed(() => formatUntil(isGh.value ? store.ghBanUntil : store.qqBanUntil))

/* ---------------- GitHub 身份 ---------------- */
const ghName = computed(() => store.user?.name || store.user?.login || 'GitHub 用户')
const ghInitial = computed(() => (ghName.value || '?').slice(0, 1).toUpperCase())
const roleLabel = computed(() => {
  if (store.isOwner) return '拥有者'
  if (store.permission === 'admin') return '管理员'
  if (store.permission === 'maintain') return '维护者'
  if (store.permission === 'write') return '写作者'
  if (store.permission === 'triage') return '分诊'
  return '普通用户'
})

/* ---------------- QQ 身份 ---------------- */
const displayNick = computed(() => store.qqUser?.nick || 'QQ 用户')
const initial = computed(() => displayNick.value.slice(0, 1).toUpperCase())
const avatarStyle = computed(() => {
  const sub = store.qqUser?.sub || ''
  let h = 0
  for (const ch of sub) h = (h * 31 + ch.charCodeAt(0)) % 360
  return { backgroundColor: 'hsl(' + h + ' 55% 45%)' }
})
/** 档案里选了 QQ 头像就用号码头像，否则留在字母头像上 */
const qqAvatarUrl = computed(() => {
  const sub = store.qqUser?.sub || ''
  return store.qqUser?.avatar === 'qq' && sub ? store.avatarFor(sub) : ''
})
const qqAvatarOk = ref(true)
watch(qqAvatarUrl, () => {
  qqAvatarOk.value = true
})
/** 账号信息三行用的角色文案：QQ 侧读 qqRole，GitHub 侧沿用 roleLabel */
const ROLE_TEXT = { admin: '管理员', maintain: '维护者', write: '写作者' }
const roleText = computed(() => (isGh.value ? roleLabel.value : ROLE_TEXT[store.qqRole] || '普通用户'))

function formatDay(ms) {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/** 注册时间：QQ 是首次登录本站，GitHub 是中转第一次记下的时间 */
const joinedText = computed(() =>
  formatDay(isGh.value ? store.ghJoinedAt : store.qqUser?.created),
)

/* ---------------- 绑定 ---------------- */

const boundGh = computed(() => store.qqLinkedGh?.login || '')
const boundQq = computed(() => store.ghLinkedQq || null)

function openBind() {
  bindMode.value = isGh.value ? 'bind-qq' : 'bind-github'
  binding.value = true
}

async function unbind() {
  if (unbinding.value) return
  unbinding.value = true
  try {
    await unbindAccounts(isGh.value ? 'github' : 'qq')
    toast.success('已解绑')
    emit('update:open', false)
    setTimeout(() => window.location.reload(), 500)
  } catch (err) {
    toast.error(err?.message || String(err))
  } finally {
    unbinding.value = false
  }
}

/* ---------------- 退出登录 ---------------- */
function logout() {
  if (isGh.value) store.logout()
  else store.logoutQq()
  emit('update:open', false)
  toast.success('已退出登录')
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="w-[min(660px,94vw)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
      <div class="border-border flex items-center gap-4 border-b px-5 pt-4 pb-3 pr-14">
        <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
          <IconUserRound class="size-4" />
        </div>
        <div class="min-w-0 translate-y-px">
          <DialogTitle class="text-base leading-none font-bold">个人中心</DialogTitle>
          <DialogDescription class="mt-0.5 text-xs">
            {{ isGh ? '当前以 GitHub 身份登录。' : '当前以 QQ 邮箱身份登录。' }}
          </DialogDescription>
        </div>
      </div>

      <div class="grid gap-5 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_240px]">
        <div class="flex flex-col gap-4">
          <!-- 身份信息 -->
          <div class="flex items-center gap-3">
            <template v-if="isGh">
              <img
                v-if="store.user?.avatar_url"
                :src="store.user.avatar_url"
                :alt="ghName"
                class="size-12 shrink-0 rounded-full object-cover"
              />
              <div v-else class="bg-accent text-accent-foreground grid size-12 shrink-0 place-items-center rounded-full text-lg font-semibold">
                {{ ghInitial }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-base font-bold">{{ ghName }}</p>
                <p class="text-muted-foreground truncate text-xs">@{{ store.user?.login }}</p>
              </div>
              <Badge variant="secondary" class="shrink-0 text-[10px]">{{ roleLabel }}</Badge>
            </template>
  
            <template v-else>
              <img
                v-if="qqAvatarUrl && qqAvatarOk"
                :src="qqAvatarUrl"
                alt=""
                class="border-border size-12 shrink-0 rounded-full border object-cover"
                @error="qqAvatarOk = false"
              />
              <div
                v-else
                class="grid size-12 shrink-0 place-items-center rounded-full text-lg font-semibold text-white"
                :style="avatarStyle"
              >
                {{ initial }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-base font-bold">{{ displayNick }}</p>
                <p class="text-muted-foreground truncate text-xs">{{ store.qqUser?.masked || 'QQ 邮箱' }}</p>
              </div>
              <Badge v-if="store.canManage" variant="secondary" class="ml-auto shrink-0 text-[10px]">管理</Badge
              >
              <Button variant="outline" class="h-8 shrink-0 gap-1.5 px-4 text-sm" @click="editOpen = true">
                <IconPencil class="size-4" />
                编辑
              </Button>
            </template>
          </div>

          <!-- 账号信息：只读展示，可改的东西都挪进了「编辑资料」 -->
          <dl class="border-border flex flex-col gap-1.5 border-t pt-3 text-xs">
            <div class="flex items-center justify-between gap-3">
              <dt class="text-muted-foreground">登录方式</dt>
              <dd class="font-medium">{{ isGh ? 'GitHub 账号' : 'QQ 邮箱' }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-muted-foreground">角色</dt>
              <dd class="font-medium">{{ roleText }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-muted-foreground">注册于</dt>
              <dd class="font-mono font-medium tabular-nums">{{ joinedText }}</dd>
            </div>
          </dl>

          <!-- 三格统计：两种身份都在同一位置显示 -->
          <div class="border-border mt-auto grid grid-cols-3 items-end gap-2 border-t pt-2 text-center">
            <div class="flex flex-col items-center gap-0.5">
              <span class="font-mono text-3xl leading-none font-bold tabular-nums">{{ stats.issues }}</span>
              <span class="text-muted-foreground text-xs">发布</span>
            </div>
            <div class="flex flex-col items-center gap-0.5">
              <span class="font-mono text-3xl leading-none font-bold tabular-nums">{{ stats.comments }}</span>
              <span class="text-muted-foreground text-xs">评论</span>
            </div>
            <div class="flex flex-col items-center gap-0.5">
              <span class="flex items-baseline gap-1">
                <span class="font-mono text-3xl leading-none font-bold tabular-nums">{{ stats.days }}</span>
                <span class="text-muted-foreground font-mono text-xs leading-none">Days</span>
              </span>
              <span class="text-muted-foreground text-xs">加入</span>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <!-- 账号状态：封禁 / 管理员 / 正常，三选一 -->
          <div
            v-if="banned"
            class="border-destructive/40 bg-destructive/10 rounded-lg border px-3 py-2.5"
          >
            <p class="text-destructive flex items-center gap-1.5 text-[13px] font-bold">
              <IconBan class="size-4" />
              账号已被封禁
            </p>
            <p class="mt-1 text-xs leading-relaxed">
              原因：{{ banReason || '管理员未填写原因' }}
            </p>
            <p class="text-muted-foreground mt-0.5 text-[11px]">{{ banUntilText }} · 只能浏览</p>
          </div>
          <div v-else class="border-border rounded-lg border px-3 py-2.5">
            <p class="flex items-center gap-1.5 text-[13px] font-bold">
              <IconCrown v-if="store.canManage" class="size-4 text-amber-500" />
              <IconShieldCheck v-else class="text-muted-foreground size-4" />
              {{ store.canManage ? '管理员' : '账号正常' }}
            </p>
            <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
              {{
                store.canManage
                  ? '您是尊贵的管理员用户，可以管理标签、里程碑与用户封禁。'
                  : '当前没有封禁记录，发帖、评论、打标签等功能都正常。'
              }}
            </p>
          </div>

          <!-- 绑定状态 -->
          <div class="border-border flex flex-col gap-2 rounded-lg border px-3 py-2.5">
            <div class="flex items-center gap-1.5">
              <IconLink class="text-muted-foreground size-4" />
              <p class="text-[13px] font-bold">账号绑定</p>
            </div>
  
            <!-- GitHub 身份：看我绑了哪个 QQ -->
            <template v-if="isGh">
              <div v-if="boundQq" class="flex flex-col gap-2">
                <div class="min-w-0">
                  <p class="truncate text-xs">{{ boundQq.nick || 'QQ 用户' }}</p>
                  <p class="text-muted-foreground truncate text-[11px]">{{ boundQq.masked }}</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger as-child>
                    <Button variant="outline" size="xs" class="w-full gap-1" :disabled="unbinding">
                      <IconUnlink class="size-3.5" />
                      解绑
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent class="w-[min(400px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-none sm:rounded-xl">
                    <div class="flex flex-col items-center px-7 pt-5 pb-4 text-center">
                      <div class="flex items-center gap-3">
                        <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
                          <IconUnlink class="size-4" />
                        </div>
                        <AlertDialogTitle class="text-xl font-bold">确认解绑这个 QQ 邮箱？</AlertDialogTitle>
                      </div>
  
                      <AlertDialogDescription class="text-muted-foreground mt-3 text-sm leading-relaxed">
                        解绑后两个账号会恢复成互不相干的身份，能力与限制都回到绑定之前，QQ 登录不再继承 GitHub 的权限。
                      </AlertDialogDescription>
  
                      <p
                        class="border-border text-muted-foreground mt-4 w-full rounded-xl border px-4 py-3 text-left text-[12.5px] leading-relaxed"
                      >
                        已经产生的封禁记录不会因为解绑而消失；解绑之后随时可以重新绑回来。
                      </p>
                    </div>
  
                    <div class="border-border bg-muted/70 border-t px-5 py-4">
                      <div class="grid w-full grid-cols-2 gap-2">
                        <AlertDialogCancel class="h-8 rounded-md px-3 text-sm font-medium">取消</AlertDialogCancel>
                        <AlertDialogAction class="h-8 rounded-md px-3 text-sm font-semibold" @click="unbind">
                          确认解绑
                        </AlertDialogAction>
                      </div>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div v-else class="flex flex-col gap-2">
                <p class="text-muted-foreground text-[11px] leading-relaxed">
                  还没有绑定 QQ 邮箱。绑定后可以用 QQ 登录同一个身份。
                </p>
                <Button variant="outline" size="xs" class="w-full gap-1" @click="openBind">
                  <IconMail class="size-3.5" />
                  绑定
                </Button>
              </div>
            </template>
  
            <!-- QQ 身份：看我绑了哪个 GitHub -->
            <template v-else>
              <div v-if="boundGh" class="flex flex-col gap-2">
                <div class="min-w-0">
                  <p class="flex items-center gap-1 truncate text-xs">
                    <IconGitHub class="size-3" />@{{ boundGh }}
                  </p>
                  <p class="text-muted-foreground truncate text-[11px]">发帖与操作记在它名下</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger as-child>
                    <Button variant="outline" size="xs" class="w-full gap-1" :disabled="unbinding">
                      <IconUnlink class="size-3.5" />
                      解绑
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent class="w-[min(400px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-none sm:rounded-xl">
                    <div class="flex flex-col items-center px-7 pt-5 pb-4 text-center">
                      <div class="flex items-center gap-3">
                        <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
                          <IconUnlink class="size-4" />
                        </div>
                        <AlertDialogTitle class="text-xl font-bold">确认解绑 @{{ boundGh }}？</AlertDialogTitle>
                      </div>
  
                      <AlertDialogDescription class="text-muted-foreground mt-3 text-sm leading-relaxed">
                        解绑后这个 QQ 身份可以重新直接发帖，署名回到 QQ 昵称，GitHub 账号的角色也不再影响它。
                      </AlertDialogDescription>
  
                      <p
                        class="border-border text-muted-foreground mt-4 w-full rounded-xl border px-4 py-3 text-left text-[12.5px] leading-relaxed"
                      >
                        两边各自的封禁记录都保留；解绑之后随时可以重新绑回来。
                      </p>
                    </div>
  
                    <div class="border-border bg-muted/70 border-t px-5 py-4">
                      <div class="grid w-full grid-cols-2 gap-2">
                        <AlertDialogCancel class="h-8 rounded-md px-3 text-sm font-medium">取消</AlertDialogCancel>
                        <AlertDialogAction class="h-8 rounded-md px-3 text-sm font-semibold" @click="unbind">
                          确认解绑
                        </AlertDialogAction>
                      </div>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div v-else class="flex flex-col gap-2">
                <p class="text-muted-foreground text-[11px] leading-relaxed">
                  绑定 GitHub 账号后两边是同一个身份：能力互通，署名与权限按 GitHub 算。
                </p>
                <Button variant="outline" size="xs" class="w-full gap-1" @click="openBind">
                  <IconGitHub class="size-3.5" />
                  绑定
                </Button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="border-border flex items-center justify-between border-t px-5 py-3">
        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button variant="ghost" size="sm" class="text-destructive gap-1.5">
              <IconLogOut class="size-4" />
              退出登录
            </Button>
          </AlertDialogTrigger>
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
                  isGh
                    ? '退出后会清除这台设备上保存的 GitHub 授权凭据，下次进入需要重新完成一次授权。'
                    : '退出后会清除这台设备上保存的 QQ 登录状态，下次进入需要重新走一遍邮箱验证码流程。'
                }}
              </AlertDialogDescription>

              <p
                class="border-border text-muted-foreground mt-4 w-full rounded-xl border px-4 py-3 text-left text-[12.5px] leading-relaxed"
              >
                {{
                  isGh
                    ? '只影响这台设备的登录状态，账号本身与仓库里的权限都不受影响，随时可以重新授权登录。'
                    : '昵称与已经发布的内容都会完整保留，不会因为退出登录而被删除或隐藏，随时可以用同一个邮箱重新登录。'
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
        <Button variant="outline" size="sm" @click="emit('update:open', false)">关闭</Button>
      </div>
    </DialogContent>
  </Dialog>

  <BindAccountDialog v-model:open="binding" :mode="bindMode" />
  <ProfileEditDialog v-model:open="editOpen" />
</template>
