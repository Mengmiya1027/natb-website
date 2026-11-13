<script setup>
/**
 * 详情页侧栏操作：状态、锁定、订阅、置顶、删除、复制。
 * 权限来自 store（canManage），所有操作成功后统一 emit('changed') 让宿主刷新。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { githubApi, githubWriteApi } from '@/api/github'
import { ISSUE_REPO_FULL } from '@/config/github'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import IconCircleCheck from '~icons/lucide/circle-check'
import IconCircleSlash from '~icons/lucide/circle-slash'
import IconRotateCcw from '~icons/lucide/rotate-ccw'
import IconLock from '~icons/lucide/lock'
import IconUnlock from '~icons/lucide/unlock'
import IconBell from '~icons/lucide/bell'
import IconBellOff from '~icons/lucide/bell-off'
import IconPin from '~icons/lucide/pin'
import IconPinOff from '~icons/lucide/pin-off'
import IconTrash2 from '~icons/lucide/trash-2'
import IconCopy from '~icons/lucide/copy'
import IconCheck from '~icons/lucide/check'
import IconLink2 from '~icons/lucide/link-2'
import IconLoader2 from '~icons/lucide/loader-2'

const props = defineProps({
  issue: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['changed'])

const store = useIssueStore()

const busy = ref('')
const subscribed = ref(false)
const subscriptionKnown = ref(false)

const number = computed(() => Number(props.issue?.number || 0))
const isClosed = computed(() => props.issue?.state === 'closed')
const isLocked = computed(() => Boolean(props.issue?.locked))
const isPinned = computed(() => Boolean(props.issue?.pinned))
const isLoggedIn = computed(() => Boolean(store.isLoggedIn))
const canManage = computed(() => Boolean(store.canManage))

const subscriptionTitle = computed(() => {
  if (!isLoggedIn.value) return '登录后可订阅'
  if (!subscriptionKnown.value) return '订阅状态未知，点击将订阅'
  return subscribed.value ? '取消订阅' : '订阅这个仓库的更新'
})

const issueUrl = computed(
  () => props.issue?.html_url || `https://github.com/${ISSUE_REPO_FULL}/issues/${number.value}`,
)

function requireLogin() {
  if (isLoggedIn.value) return true
  toast.error('请先登录 GitHub 后再执行这个操作')
  return false
}

/** 统一的操作包装：串行、成功 toast + changed、失败原样提示 */
async function run(key, action, successMessage) {
  if (!requireLogin()) return
  if (busy.value) return
  if (!number.value) {
    toast.error('缺少 issue 编号，无法操作')
    return
  }
  busy.value = key
  try {
    await action()
    toast.success(successMessage)
    emit('changed')
  } catch (err) {
    toast.error(err?.message || String(err))
  } finally {
    busy.value = ''
  }
}

function closeIssue(reason) {
  run(
    'close',
    () => githubWriteApi.closeIssue(number.value, reason),
    reason === 'completed' ? 'Issue 已关闭' : 'Issue 已关闭（未计划）',
  )
}

function reopenIssue() {
  run('reopen', () => githubWriteApi.reopenIssue(number.value), 'Issue 已重开')
}

function toggleLock() {
  const locked = isLocked.value
  run(
    'lock',
    () => (locked ? githubWriteApi.unlockIssue(number.value) : githubWriteApi.lockIssue(number.value)),
    locked ? '会话已解锁' : '会话已锁定',
  )
}

function togglePin() {
  const pinned = isPinned.value
  run(
    'pin',
    () => (pinned ? githubWriteApi.unpinIssue(number.value) : githubWriteApi.pinIssue(number.value)),
    pinned ? '已取消置顶' : 'Issue 已置顶',
  )
}

function removeIssue() {
  run('delete', () => githubWriteApi.deleteIssue(number.value), 'Issue 已删除')
}

async function loadSubscription() {
  if (!isLoggedIn.value) {
    subscriptionKnown.value = false
    return
  }
  try {
    await githubApi.getSubscription()
    subscribed.value = true
    subscriptionKnown.value = true
  } catch (err) {
    /* 404 表示当前用户没有订阅这个 issue */
    if (err?.status === 404) {
      subscribed.value = false
      subscriptionKnown.value = true
    } else {
      subscriptionKnown.value = false
    }
  }
}

function toggleSubscription() {
  if (!requireLogin()) return
  const next = !subscribed.value
  run(
    'subscribe',
    async () => {
      try {
        if (next) await githubWriteApi.setSubscription()
        else await githubWriteApi.deleteSubscription()
      } catch (err) {
        // 订阅是仓库级操作，要求 notifications（或 repo）scope；
        // 老 token 只授权了 public_repo，重新登录才能拿到新权限
        if (err?.status === 403 || err?.status === 404) {
          throw new Error('当前授权缺少通知权限，请退出登录后重新授权再试')
        }
        throw err
      }
      subscribed.value = next
      subscriptionKnown.value = true
    },
    next ? '已订阅这个仓库' : '已取消订阅',
  )
}

/** 哪个复制按钮刚刚成功：'link' / 'markdown'，用来把图标临时换成对勾 */
const copiedKey = ref('')
let copiedTimer = 0

function flashCopied(key) {
  copiedKey.value = key
  window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copiedKey.value = ''
  }, 1600)
}

onBeforeUnmount(() => window.clearTimeout(copiedTimer))

async function copyText(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const helper = document.createElement('textarea')
      helper.value = text
      helper.setAttribute('readonly', '')
      helper.style.position = 'fixed'
      helper.style.opacity = '0'
      document.body.appendChild(helper)
      helper.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(helper)
      return ok
    } catch {
      return false
    }
  }
}

async function copyLink() {
  const ok = await copyText(issueUrl.value)
  if (ok) {
    flashCopied('link')
    toast.success('链接已复制')
  } else toast.error('复制失败，请手动复制地址栏链接')
}

async function copyMarkdown() {
  const title = String(props.issue?.title || `Issue #${number.value}`).replace(/\]/g, '\\]')
  const ok = await copyText(`[${title} (#${number.value})](${issueUrl.value})`)
  if (ok) {
    flashCopied('markdown')
    toast.success('Markdown 引用已复制')
  } else toast.error('复制失败，请手动复制')
}

watch(
  () => [number.value, isLoggedIn.value],
  () => loadSubscription(),
  { immediate: true },
)
</script>

<template>
  <div class="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
    <p class="text-xs font-medium text-muted-foreground">操作</p>

    <DropdownMenu v-if="!isClosed">
      <DropdownMenuTrigger as-child>
        <Button type="button" variant="outline" size="sm" class="w-full justify-start gap-2" :disabled="Boolean(busy)">
          <IconLoader2 v-if="busy === 'close'" class="size-4 animate-spin" />
          <IconCircleCheck v-else class="size-4 text-muted-foreground" />
          <span>关闭 Issue</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-56">
        <DropdownMenuItem @select="closeIssue('completed')">
          <IconCircleCheck class="size-4" />
          <span>关闭为已完成</span>
        </DropdownMenuItem>
        <DropdownMenuItem @select="closeIssue('not_planned')">
          <IconCircleSlash class="size-4" />
          <span>关闭为未计划</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <Button
      v-else
      type="button"
      variant="outline"
      size="sm"
      class="w-full justify-start gap-2"
      :disabled="Boolean(busy)"
      @click="reopenIssue"
    >
      <IconLoader2 v-if="busy === 'reopen'" class="size-4 animate-spin" />
      <IconRotateCcw v-else class="size-4 text-muted-foreground" />
      <span>重开 Issue</span>
    </Button>

    <Button
      type="button"
      variant="outline"
      size="sm"
      class="w-full justify-start gap-2"
      :disabled="Boolean(busy)"
      @click="toggleLock"
    >
      <IconLoader2 v-if="busy === 'lock'" class="size-4 animate-spin" />
      <IconUnlock v-else-if="isLocked" class="size-4 text-muted-foreground" />
      <IconLock v-else class="size-4 text-muted-foreground" />
      <span>{{ isLocked ? '解锁会话' : '锁定会话' }}</span>
    </Button>

    <Button
      type="button"
      variant="outline"
      size="sm"
      class="w-full justify-start gap-2"
      :disabled="Boolean(busy)"
      :title="subscriptionTitle"
      @click="toggleSubscription"
    >
      <IconLoader2 v-if="busy === 'subscribe'" class="size-4 animate-spin" />
      <IconBellOff v-else-if="subscribed" class="size-4 text-muted-foreground" />
      <IconBell v-else class="size-4 text-muted-foreground" />
      <span>{{ subscribed ? '取消订阅' : '订阅' }}</span>
    </Button>

    <Button
      v-if="canManage"
      type="button"
      variant="outline"
      size="sm"
      class="w-full justify-start gap-2"
      :disabled="Boolean(busy)"
      @click="togglePin"
    >
      <IconLoader2 v-if="busy === 'pin'" class="size-4 animate-spin" />
      <IconPinOff v-else-if="isPinned" class="size-4 text-muted-foreground" />
      <IconPin v-else class="size-4 text-muted-foreground" />
      <span>{{ isPinned ? '取消置顶' : '置顶' }}</span>
    </Button>

    <Button
      type="button"
      variant="outline"
      size="sm"
      class="w-full justify-start gap-2"
      @click="copyLink"
    >
      <component
        :is="copiedKey === 'link' ? IconCheck : IconLink2"
        :key="copiedKey === 'link' ? 'check' : 'link'"
        class="copy-pop size-4"
        :class="copiedKey === 'link' ? 'text-emerald-500' : 'text-muted-foreground'"
      />
      <span>{{ copiedKey === 'link' ? '已复制' : '复制链接' }}</span>
    </Button>

    <Button
      type="button"
      variant="outline"
      size="sm"
      class="w-full justify-start gap-2"
      @click="copyMarkdown"
    >
      <component
        :is="copiedKey === 'markdown' ? IconCheck : IconCopy"
        :key="copiedKey === 'markdown' ? 'check' : 'markdown'"
        class="copy-pop size-4"
        :class="copiedKey === 'markdown' ? 'text-emerald-500' : 'text-muted-foreground'"
      />
      <span>{{ copiedKey === 'markdown' ? '已复制' : '复制 Markdown 引用' }}</span>
    </Button>

    <AlertDialog v-if="canManage">
      <AlertDialogTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="w-full justify-start gap-2 text-destructive hover:text-destructive"
          :disabled="Boolean(busy)"
        >
          <IconLoader2 v-if="busy === 'delete'" class="size-4 animate-spin" />
          <IconTrash2 v-else class="size-4" />
          <span>删除 Issue</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent class="gap-0 overflow-hidden p-0 sm:max-w-[460px] sm:rounded-2xl">
        <div class="px-6 pt-6 pb-5">
          <AlertDialogHeader class="gap-2 text-left">
            <AlertDialogTitle class="text-2xl font-semibold tracking-tight">
              确认删除这个 Issue？
            </AlertDialogTitle>
            <AlertDialogDescription class="text-[15px] leading-relaxed">
              删除后无法恢复，评论与时间线也会一并消失。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <p
            class="border-border text-muted-foreground mt-6 rounded-xl border px-4 py-3.5 text-[13px] leading-relaxed"
          >
            这个操作只有仓库管理员可以执行，且没有撤销入口。
          </p>
        </div>

        <!-- 与退出登录确认框同一套尺寸：shadcn sm = h-8 / px-3 / gap-1.5 / text-sm -->
        <AlertDialogFooter class="border-border bg-muted/60 gap-2.5 border-t px-6 py-4">
          <AlertDialogCancel class="h-8 gap-1.5 px-3 text-sm">取消</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive hover:bg-destructive/90 h-8 gap-1.5 px-3 text-sm font-semibold text-white"
            @click="removeIssue"
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style scoped>
/* 复制成功时图标换成对勾并弹一下，与登录面板里的验证码复制保持一致 */
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
