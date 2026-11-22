<script setup>
/**
 * Issue 详情页：标题区 + 正文 + 合并时间线 + 评论框，右侧是标签 / 指派 / 里程碑 / 操作。
 *
 * 数据流只有一条：所有写入都走后端 API，成功后 emit('changed') 让列表刷新，
 * 组件自身保持「以服务器返回为准」的单一真相。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { githubApi, githubWriteApi } from '@/api/github'
import { qqWriteApi } from '@/api/qqWrite'
import { updateIssueMeta } from '@/api/issueMeta'
import QqBanDialog from './QqBanDialog.vue'
import DisabledPicker from './DisabledPicker.vue'
import { useIssueStore } from '@/stores/issue'
import { ISSUE_REPO_FULL } from '@/config/github'

import MarkdownView from './MarkdownView.vue'
import MarkdownEditor from './MarkdownEditor.vue'
import { buildQqSignature, parseQqMarker, stripQqMarker } from '@/utils/qqMarker'
import QqSignatureEditor from '@/components/issue/QqSignatureEditor.vue'
import IssueTimeline from './IssueTimeline.vue'

// issue-write 负责的组件，签名按 CONTRACT.md
import CommentComposer from './CommentComposer.vue'
import LabelPicker from './LabelPicker.vue'
import AssigneePicker from './AssigneePicker.vue'
import MilestonePicker from './MilestonePicker.vue'
import IssueSidebarActions from './IssueSidebarActions.vue'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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

import IconAlertTriangle from '~icons/lucide/triangle-alert'
import IconArrowLeft from '~icons/lucide/arrow-left'
import IconPencil from '~icons/lucide/pencil'
import IconLink from '~icons/lucide/link'
import IconFileCode from '~icons/lucide/file-code'
import IconCircleCheck from '~icons/lucide/circle-check'
import IconCircleDot from '~icons/lucide/circle-dot'
import IconExternalLink from '~icons/lucide/external-link'
import IconLoader from '~icons/lucide/loader-circle'
import IconLock from '~icons/lucide/lock'
import IconUnlock from '~icons/lucide/lock-open'
import IconInfo from '~icons/lucide/info'
import IconMessageSquare from '~icons/lucide/message-square'
import IconMilestone from '~icons/lucide/milestone'
import IconTag from '~icons/lucide/tag'
import IconTrash2 from '~icons/lucide/trash-2'
import IconUsers from '~icons/lucide/users'

const props = defineProps({
  number: { type: Number, default: 0 },
})

const emit = defineEmits(['back', 'changed', 'open'])

const store = useIssueStore()

/* ---------------- 状态 ---------------- */

const issue = ref(null)
const comments = ref([])
const events = ref([])
const loading = ref(true)
const error = ref('')
const replyTo = ref('')
const savingField = ref('')
const composerRef = ref(null)

/* 侧栏的三个受控值 */
const labels = ref([])
const assignees = ref([])
const milestone = ref(null)

/* ---------------- 时间工具 ---------------- */

const RELATIVE = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })
const DIVISIONS = [
  ['year', 31536000000],
  ['month', 2592000000],
  ['week', 604800000],
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
]

function relativeTime(value) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  const diff = time - Date.now()
  const abs = Math.abs(diff)
  if (abs < 60000) return '刚刚'
  for (const [unit, ms] of DIVISIONS) {
    if (abs >= ms) return RELATIVE.format(Math.round(diff / ms), unit)
  }
  return RELATIVE.format(Math.round(diff / 60000), 'minute')
}

function absoluteTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* ---------------- 派生数据 ---------------- */

const author = computed(() => issue.value?.user || {})
/** QQ 用户发的单子，作者显示成「QQ 用户 xxx」，不显示机器人账号 */
const qqMarker = computed(() => parseQqMarker(issue.value?.body))
/* QQ 用户的昵称与头像都存在远端：正文里只有 sub，这里现查现用。
 * 查不到就退回「QQ 用户」+ 首字母，不编造数据。 */
const qqProfile = computed(() => (qqMarker.value ? store.profileOf(qqMarker.value.sub) : null))
const authorLogin = computed(() =>
  qqMarker.value ? qqProfile.value?.nick || 'QQ 用户' : author.value.login || 'ghost',
)
const authorAvatar = computed(() => {
  if (!qqMarker.value) return author.value.avatar_url || ''
  return qqProfile.value?.avatar === 'qq' ? store.avatarFor(qqMarker.value.sub) : ''
})
/** 头像地址换来换去时可能加载失败，标记一下退回首字母，别留破图 */
const avatarBroken = ref(false)
watch(authorAvatar, () => {
  avatarBroken.value = false
})

watch(
  () => qqMarker.value?.sub,
  (sub) => {
    if (sub) store.loadProfiles([sub])
  },
  { immediate: true },
)
const authorInitial = computed(() => String(authorLogin.value).slice(0, 1).toUpperCase())
const cleanBody = computed(() => stripQqMarker(issue.value?.body))

/* ---------------- QQ 身份：只能关自己发的单 ---------------- */

const qqOwnIssue = computed(
  () => Boolean(qqMarker.value?.sub && store.qqUser?.sub && qqMarker.value.sub === store.qqUser.sub),
)
/** GitHub 身份认定自己是作者 */
const ghOwnIssue = computed(() => {
  const me = store.user?.login
  const owner = issue.value?.user?.login
  return Boolean(me && owner && String(me).toLowerCase() === String(owner).toLowerCase())
})
/** 两种身份任一认定是作者即可 —— 两种登录方式看到的操作面板应当一致 */
const ownIssue = computed(() => qqOwnIssue.value || ghOwnIssue.value)
/* 按钮的可见性只看「是不是我这条、还开着没」；能不能写由点击时判断——
 * 之前把 writeMode 写进条件，被封禁时会误显示成「已关闭」。 */
const canQqClose = computed(() => ownIssue.value && issue.value?.state === 'open')
const ownLocking = ref(false)
const closeConfirmOpen = ref(false)
const deleteConfirmOpen = ref(false)
const qqClosing = ref(false)
const qqDeleting = ref(false)
const banOpen = ref(false)

/* 分享链接与 Markdown 引用：任何身份、任何 issue 都能用 */
async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function issueShareUrl() {
  return issue.value?.html_url || `https://github.com/${ISSUE_REPO_FULL}/issues/${props.number}`
}

async function copyIssueLink() {
  const ok = await copyTextToClipboard(issueShareUrl())
  ok ? toast.success('链接已复制') : toast.error('复制失败，请手动复制')
}

async function copyIssueMarkdown() {
  const text = `[${issue.value?.title || 'issue #' + props.number}](${issueShareUrl()})`
  const ok = await copyTextToClipboard(text)
  ok ? toast.success('Markdown 引用已复制') : toast.error('复制失败，请手动复制')
}

function askCloseOwnIssue() {
  if (!store.canWrite) {
    if (store.qqBanned || store.ghBanned) banOpen.value = true
    else toast.error('请先登录后再操作')
    return
  }
  closeConfirmOpen.value = true
}

function askDeleteOwnIssue() {
  // 删除 issue 需要仓库管理员本人身份：QQ 身份和普通作者都做不到
  if (!store.canManage || store.writeMode !== 'github') {
    toast.error('只有仓库管理员能删除 issue')
    return
  }
  if (!store.canWrite) {
    if (store.qqBanned || store.ghBanned) banOpen.value = true
    else toast.error('请先登录后再操作')
    return
  }
  deleteConfirmOpen.value = true
}

async function deleteOwnIssue() {
  if (qqDeleting.value) return
  qqDeleting.value = true
  try {
    // GitHub 的删除 issue 只认仓库管理员本人的账号：App 就算给了 administration
    // 权限，installation token 调这个端点仍然 404。所以这里直接用自己的 token。
    await githubWriteApi.deleteIssue(issue.value.number)
    toast.success('Issue 已删除')
    // 先让宿主把列表重新拉一遍，再退回去：只 emit('back') 的话列表还是那份旧数据
    emit('changed')
    emit('back')
  } catch (err) {
    toast.error(err?.message || String(err))
  } finally {
    qqDeleting.value = false
  }
}

/** 锁定会话要仓库 write 权限；QQ 身份没有 GitHub 令牌，这里不支持 */
async function toggleOwnLock() {
  if (!store.canWrite) {
    if (store.qqBanned || store.ghBanned) banOpen.value = true
    else toast.error('请先登录后再操作')
    return
  }
  if (store.writeMode !== 'github') {
    toast.error('QQ 身份不支持锁定会话')
    return
  }
  if (ownLocking.value) return
  ownLocking.value = true
  try {
    if (issue.value?.locked) await githubWriteApi.unlockIssue(issue.value.number)
    else await githubWriteApi.lockIssue(issue.value.number)
    toast.success(issue.value?.locked ? '已解锁会话' : '已锁定会话')
    await load()
    emit('changed')
  } catch (err) {
    toast.error(err?.message || '操作失败')
  } finally {
    ownLocking.value = false
  }
}

async function closeOwnIssue() {
  if (!canQqClose.value || qqClosing.value) return
  qqClosing.value = true
  try {
    if (store.writeMode === 'qq') await qqWriteApi.closeIssue(issue.value.number)
    else await githubWriteApi.closeIssue(issue.value.number, 'completed')
    toast.success('已关闭这个 issue')
    await load()
    emit('changed')
  } catch (err) {
    toast.error(err?.message || String(err))
  } finally {
    qqClosing.value = false
  }
}
const commentCount = computed(() => comments.value.length)

const labelObjects = computed(() =>
  (issue.value?.labels || []).map((label) =>
    typeof label === 'string' ? { name: label, color: '' } : label,
  ),
)

const assigneeList = computed(() => issue.value?.assignees || [])
const milestoneInfo = computed(() => issue.value?.milestone || null)

const isOpen = computed(() => issue.value?.state === 'open')

/* ---------------- 归一化：picker 值 <-> 接口载荷 ---------------- */

function toLabelNames(list) {
  return (list || [])
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .filter((name) => typeof name === 'string' && name.length > 0)
}

function toLoginList(list) {
  return (list || [])
    .map((item) => (typeof item === 'string' ? item : item?.login))
    .filter((login) => typeof login === 'string' && login.length > 0)
}

function sameSet(a, b) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((item) => set.has(item))
}

/**
 * 用服务器返回的数据回填侧栏，避免 watch 触发无意义的写请求。
 * LabelPicker / AssigneePicker 的 modelValue 是名字 / login 字符串数组，
 * MilestonePicker 是里程碑编号（number | null），这里统一归一化。
 */
function syncSidebar(source) {
  const target = source || issue.value
  if (!target) return
  labels.value = (target.labels || [])
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
  assignees.value = (target.assignees || []).map((user) => user?.login).filter(Boolean)
  milestone.value = target.milestone?.number ?? null
}

/* ---------------- 加载 ---------------- */

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [issueData, commentData, timelineData, pinned] = await Promise.all([
      githubApi.getIssue(props.number, { noCache: true }),
      // 评论与时间线失败不该拖垮整页，退化成空即可
      githubApi.listComments(props.number, { per_page: 100 }).catch(() => []),
      githubApi.listTimeline(props.number, { per_page: 100 }).catch(() => []),
      // REST 不带 pinned 字段，单独用 GraphQL 补；未登录拿不到就算了
      githubApi.getIssuePinned(props.number).catch(() => null),
    ])
    if (issueData && pinned !== null) issueData.pinned = pinned
    // 顺带刷新一次封禁状态：封禁/解封可能发生在别的设备上，页面自己不会知道，
    // 否则会一直拿旧的 canWrite 判断，解封了也看不到编辑入口
    store.refreshQq().catch(() => {})
    store.refreshGhLink().catch(() => {})
    issue.value = issueData
    comments.value = Array.isArray(commentData) ? commentData : []
    events.value = Array.isArray(timelineData) ? timelineData : []
    syncSidebar()
  } catch (err) {
    issue.value = null
    error.value = err?.message || '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

watch(() => props.number, load, { immediate: true })

/** 只刷新会话流，不动正文（评论发布 / 删除后用） */
async function reloadThread() {
  try {
    const [commentData, timelineData] = await Promise.all([
      githubApi.listComments(props.number, { per_page: 100 }),
      githubApi.listTimeline(props.number, { per_page: 100 }).catch(() => events.value),
    ])
    comments.value = Array.isArray(commentData) ? commentData : []
    events.value = Array.isArray(timelineData) ? timelineData : []
  } catch (err) {
    toast.error(err?.message || '刷新评论失败')
  }
  emit('changed')
}

/** 只重拉时间线：标签 / 里程碑 / 指派都会在时间线上留一条记录，不刷新就看不到 */
async function refreshTimeline() {
  try {
    const data = await githubApi.listTimeline(props.number, { per_page: 100 })
    events.value = Array.isArray(data) ? data : []
  } catch {
    /* 时间线拉不到不影响刚才那次操作本身 */
  }
}

/* ---------------- 侧栏写入 ---------------- */

/* 管理 = 拥有者 + 协作者；其余都算非管理。
 * 非管理里的作者本人可以改自己单的标签与里程碑，指派始终只给管理。 */
const isIssueAuthor = computed(() => {
  const marker = qqMarker.value
  if (marker?.sub && store.qqUser?.sub) return marker.sub === store.qqUser.sub
  const me = store.user?.login
  const owner = issue.value?.user?.login
  return Boolean(me && owner && String(me).toLowerCase() === String(owner).toLowerCase())
})
const canEditTags = computed(() => store.canManage || isIssueAuthor.value)

/* 改标题与正文：GitHub 允许作者本人和管理编辑，走自己的 token 直连；
 * QQ 身份暂不支持（中转那条 PATCH 只处理标签/里程碑/指派）。 */
/* 编辑入口只要「管理或作者」就显示；被封/未登录时点下去由 startEditIssue 拦下弹窗，
 * 与评论上的编辑、删除按钮保持同一套行为。 */
const editing = ref(false)
/** 署名行当前选中的身份；只有管理员能改，保存时按它重拼正文尾巴 */
const sigSub = ref('')
const editTitle = ref('')
const editBody = ref('')
const savingEdit = ref(false)

function startEditIssue() {
  if (!store.canWrite) {
    if (store.qqBanned || store.ghBanned) banOpen.value = true
    else toast.error('请先登录后再编辑')
    return
  }
  editTitle.value = issue.value?.title || ''
  editBody.value = stripQqMarker(issue.value?.body || '')
  sigSub.value = qqMarker.value?.sub || ''
  editing.value = true
}

function cancelEditIssue() {
  editing.value = false
}

async function saveEditIssue() {
  const title = editTitle.value.trim()
  if (!title) {
    toast.error('标题不能为空')
    return
  }
  savingEdit.value = true
  try {
    // 署名尾巴统一由前端拼一次：QQ 身份走中转时 Worker 会剥掉再按最终归属重拼，
    // GitHub 身份直连 GitHub 时没人替他拼，所以两种路径都带上
    const payloadBody = sigSub.value
      ? stripQqMarker(editBody.value) + buildQqSignature(sigSub.value)
      : editBody.value
    if (store.writeMode === 'qq') {
      await updateIssueMeta(props.number, { title, body: payloadBody })
    } else {
      await githubWriteApi.updateIssue(props.number, { title, body: payloadBody })
    }
    editing.value = false
    toast.success('已保存')
    // 重新拉一次：QQ 那条的 marker 是服务端补回去的，本地这份正文里没有它
    await load()
    emit('changed')
  } catch (err) {
    toast.error(err?.message || '保存失败')
  } finally {
    savingEdit.value = false
  }
}
const canEditAssignees = computed(() => store.canManage)

watch(labels, async (next) => {
  if (!issue.value) return
  const current = toLabelNames(issue.value.labels)
  const nextNames = toLabelNames(next)
  if (sameSet(current, nextNames)) return

  savingField.value = 'labels'
  try {
    const data = await updateIssueMeta(props.number, { labels: nextNames })
    issue.value = { ...issue.value, labels: data?.issue?.labels || [] }
    await refreshTimeline()
    toast.success('标签已更新')
    emit('changed')
  } catch (err) {
    toast.error(err?.message || '更新标签失败')
    syncSidebar()
  } finally {
    savingField.value = ''
  }
})

watch(assignees, async (next) => {
  if (!issue.value) return
  const current = toLoginList(issue.value.assignees)
  const nextLogins = toLoginList(next)
  if (sameSet(current, nextLogins)) return

  savingField.value = 'assignees'
  try {
    const data = await updateIssueMeta(props.number, { assignees: nextLogins })
    issue.value = { ...issue.value, assignees: data?.issue?.assignees || [] }
    await refreshTimeline()
    toast.success(nextLogins.length ? '指派已更新' : '已清空指派')
    emit('changed')
  } catch (err) {
    toast.error(err?.message || '更新指派失败')
    syncSidebar()
  } finally {
    savingField.value = ''
  }
})

watch(milestone, async (next) => {
  if (!issue.value) return
  const current = issue.value.milestone?.number ?? null
  const nextValue = next ?? null
  if (current === nextValue) return

  savingField.value = 'milestone'
  try {
    const data = await updateIssueMeta(props.number, { milestone: nextValue })
    issue.value = { ...issue.value, milestone: data?.issue?.milestone ?? null }
    await refreshTimeline()
    toast.success('里程碑已更新')
    emit('changed')
  } catch (err) {
    toast.error(err?.message || '更新里程碑失败')
    syncSidebar()
  } finally {
    savingField.value = ''
  }
})

/* ---------------- 评论操作 ---------------- */

/** 不可写时点编辑/删除/回复：被封就弹详情框，没登录就提示登录 */
function onBlocked() {
  if (store.qqBanned || store.ghBanned) banOpen.value = true
  else toast.error('请先登录后再操作')
}

async function onEditComment(id, body) {
  // 被封禁 / 未登录时连请求都别发：那条路只会换来一句 GitHub 的英文原话
  if (!store.canWrite) {
    if (store.qqBanned || store.ghBanned) banOpen.value = true
    else toast.error('请先登录后再编辑评论')
    return
  }
  try {
    // QQ 用户发的评论，作者是 GitHub App 机器人：GitHub 网页端连协作者都改不了它，
    // 只能用中转的 App 凭据改写。GitHub 评论才走他本人的 token。
    const target = comments.value.find((c) => c.id === id)
    const fromQq = Boolean(parseQqMarker(target?.body))
    const updated = fromQq
      ? await qqWriteApi.updateComment(id, body)
      : await githubWriteApi.updateComment(id, body)
    comments.value = comments.value.map((comment) =>
      comment.id === id ? { ...comment, ...(updated || {}), body } : comment,
    )
    toast.success('评论已更新')
    emit('changed')
  } catch (err) {
    // GitHub 说「Must have admin rights」时，多半是这个账号已经被踢出协作者了
    // （被封禁的人会先被 GitHub 从协作者里移除）。顺手把封禁状态刷新一下。
    if (err?.status === 403) {
      store.refreshQq()
      store.refreshGhLink()
    }
    toast.error(err?.message || '更新评论失败')
  }
}

async function onDeleteComment(id) {
  if (!store.canWrite) {
    if (store.qqBanned || store.ghBanned) banOpen.value = true
    else toast.error('请先登录后再删除评论')
    return
  }
  try {
    // QQ 身份走中转代删，管理员与 GitHub 用户直接走 GitHub
    if (store.writeMode === 'qq' && !store.canManage) await qqWriteApi.deleteComment(id)
    else await githubWriteApi.deleteComment(id)
    comments.value = comments.value.filter((comment) => comment.id !== id)
    toast.success('评论已删除')
    emit('changed')
  } catch (err) {
    toast.error(err?.message || '删除评论失败')
  }
}

async function onReply(login) {
  if (!login) return
  replyTo.value = login
  await nextTick()
  const el = composerRef.value
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

async function onCommentSubmitted() {
  // 成功提示由 CommentComposer 负责，这里只收尾并刷新会话流
  replyTo.value = ''
  await reloadThread()
}

async function onSidebarChanged() {
  try {
    const [fresh, pinned] = await Promise.all([
      githubApi.getIssue(props.number),
      githubApi.getIssuePinned(props.number).catch(() => null),
    ])
    if (fresh && pinned !== null) fresh.pinned = pinned
    issue.value = fresh
    syncSidebar()
  } catch (err) {
    toast.error(err?.message || '刷新 issue 失败')
  }
  emit('changed')
}
</script>

<template>
  <div class="natb-detail">
    <!-- ---------- 骨架 ---------- -->
    <div v-if="loading" class="natb-detail__grid">
      <div class="natb-detail__main">
        <div class="natb-detail__skeleton-head">
          <Skeleton class="h-7 w-3/5" />
          <Skeleton class="h-4 w-40" />
        </div>
        <Skeleton class="h-40 w-full rounded-xl" />
        <Skeleton class="h-24 w-full rounded-xl" />
      </div>
      <aside class="natb-detail__side">
        <Skeleton class="h-28 w-full rounded-xl" />
        <Skeleton class="h-28 w-full rounded-xl" />
      </aside>
    </div>

    <!-- ---------- 错误 ---------- -->
    <div v-else-if="error" class="natb-detail__error">
      <Alert variant="destructive">
        <IconAlertTriangle class="size-4" />
        <AlertTitle>没能加载这条 issue</AlertTitle>
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>
      <div class="natb-detail__error-actions">
        <Button variant="outline" size="sm" @click="load">重新加载</Button>
        <Button variant="ghost" size="sm" @click="emit('back')">返回列表</Button>
      </div>
    </div>

    <!-- ---------- 正文 ---------- -->
    <div v-else-if="issue" class="natb-detail__grid natb-rise">
      <div class="natb-detail__main">
        <header class="natb-detail__head">
          <!-- 微交互：悬停时浮起一层底色 -->
          <Button
            variant="ghost"
            size="icon-sm"
            class="natb-detail__back hover:bg-foreground/10 hover:text-foreground transition-colors duration-150"
            title="返回列表"
            @click="emit('back')"
          >
            <IconArrowLeft class="size-4" />
          </Button>

          <div class="natb-detail__head-main">
            <h1 v-if="!editing" class="natb-detail__title">{{ issue.title }}</h1>
            <Input v-else v-model="editTitle" class="h-9 max-w-xl text-base font-semibold" placeholder="标题" />
            <div class="natb-detail__meta">
              <Badge :variant="isOpen ? 'default' : 'secondary'" class="gap-1">
                <IconCircleDot v-if="isOpen" class="size-3" />
                <IconCircleCheck v-else class="size-3" />
                {{ isOpen ? 'Open' : 'Closed' }}
              </Badge>
              <span class="natb-detail__number">#{{ issue.number }}</span>
              <span class="natb-detail__meta-item">
                <span class="natb-detail__meta-strong">{{ authorLogin }}</span>
                创建于
                <time :datetime="issue.created_at" :title="absoluteTime(issue.created_at)">
                  {{ relativeTime(issue.created_at) }}
                </time>
              </span>
              <span class="natb-detail__meta-item">
                <IconMessageSquare class="size-3.5" />
                {{ commentCount }} 条评论
              </span>
            </div>
          </div>

          <a
            v-if="issue.html_url"
            class="natb-detail__external"
            :href="issue.html_url"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <IconExternalLink class="size-3.5" />
              在 GitHub 打开
            </Button>
          </a>
        </header>

        <!-- 正文卡片 -->
        <article class="natb-detail__card">
          <header class="natb-detail__card-head">
            <!-- 显式互斥，不用 AvatarImage / AvatarFallback：
                 头像地址从「有」变成「无」的那一刻，reka-ui 的加载状态会停在
                 loaded，Fallback 不肯出来，只剩一个空白圆 -->
            <img
              v-if="authorAvatar && !avatarBroken"
              :src="authorAvatar"
              :alt="authorLogin"
              class="border-border size-8 shrink-0 rounded-full border object-cover"
              @error="avatarBroken = true"
            />
            <span
              v-else
              class="bg-muted grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold"
            >
              {{ authorInitial }}
            </span>
            <span class="natb-detail__card-author">{{ authorLogin }}</span>
            <span class="natb-detail__card-time">
              发布于
              <time :datetime="issue.created_at" :title="absoluteTime(issue.created_at)">
                {{ relativeTime(issue.created_at) }}
              </time>
            </span>
            <Button
              v-if="canEditTags && !editing"
              variant="ghost"
              size="sm"
              class="ml-auto gap-1.5 text-xs"
              @click="startEditIssue"
            >
              <IconPencil class="size-3.5" />
              编辑
            </Button>
          </header>

          <div v-if="!editing" class="natb-detail__card-body">
            <MarkdownView v-if="issue.body" :content="cleanBody" />
            <p v-else class="natb-detail__empty">这条 issue 没有正文。</p>
          </div>
          <div v-else class="flex flex-col gap-2 px-4 pt-3 pb-3">
            <MarkdownEditor v-model="editBody" placeholder="写下正文…支持 Markdown" />
            <!-- 操作栏：署名行在最左，取消/保存在最右，同一排 -->
            <div class="flex items-center gap-2">
              <QqSignatureEditor
                v-if="store.canManage"
                :sub="sigSub"
                :from-qq="Boolean(qqMarker)"
                @update:sub="sigSub = $event"
              />
              <div class="ml-auto flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" :disabled="savingEdit" @click="cancelEditIssue">取消</Button>
                <Button size="sm" :disabled="savingEdit" @click="saveEditIssue">
                  {{ savingEdit ? '保存中…' : '保存' }}
                </Button>
              </div>
            </div>
          </div>
        </article>

        <!-- 时间线（评论已合并进去） -->
        <section class="natb-detail__timeline">
          <IssueTimeline
            :events="events"
            :comments="comments"
            @open="emit('open', $event)"
            @edit="onEditComment"
            @delete="onDeleteComment"
            @reply="onReply"
            @blocked="onBlocked"
          />
        </section>

        <!-- 评论框 -->
        <section ref="composerRef" class="natb-detail__composer">
          <CommentComposer
            v-if="store.canWrite"
            :issue-number="number"
            :reply-to="replyTo"
            @submitted="onCommentSubmitted"
            @cancel="replyTo = ''"
            @banned="banOpen = true"
          />
          <div v-else class="natb-detail__hint">
            <IconLock class="size-4" />
            <template v-if="store.qqBanned || store.ghBanned">
              <span>这个账号已被封禁，暂时不能参与讨论</span>
              <Button size="sm" class="h-8 gap-1.5 rounded-md px-3.5 text-[13px]" @click="banOpen = true">
                <IconInfo class="size-3.5" />
                了解详情
              </Button>
            </template>
            <span v-else>登录后即可参与讨论（GitHub 或 QQ 邮箱）</span>
          </div>
        </section>
      </div>

      <!-- ---------- 侧栏 ---------- -->
      <aside class="natb-detail__side">
        <section class="natb-side">
          <h2 class="natb-side__title">
            <IconTag class="size-3.5" />
            标签
            <IconLoader v-if="savingField === 'labels'" class="natb-side__spin size-3" />
          </h2>
          <template v-if="store.canWrite">
            <LabelPicker v-if="canEditTags" v-model="labels" />
            <DisabledPicker v-else />
          </template>
          <div v-else class="natb-side__labels">
            <Badge v-for="label in labelObjects" :key="label.name" variant="outline" class="gap-1.5">
              <span
                v-if="label.color"
                class="natb-side__dot"
                :style="{ background: '#' + label.color }"
              ></span>
              {{ label.name }}
            </Badge>
            <span v-if="!labelObjects.length" class="natb-side__empty">没有标签</span>
          </div>
        </section>

        <section class="natb-side">
          <h2 class="natb-side__title">
            <IconUsers class="size-3.5" />
            指派
            <IconLoader v-if="savingField === 'assignees'" class="natb-side__spin size-3" />
          </h2>
          <template v-if="store.canWrite">
            <AssigneePicker v-if="canEditAssignees" v-model="assignees" />
            <DisabledPicker v-else />
          </template>
          <div v-else class="natb-side__people">
            <span v-for="user in assigneeList" :key="user.login" class="natb-side__person">
              <Avatar class="size-5">
                <AvatarImage v-if="user.avatar_url" :src="user.avatar_url" :alt="user.login" />
                <AvatarFallback class="text-[10px]">{{ String(user.login).slice(0, 1) }}</AvatarFallback>
              </Avatar>
              {{ user.login }}
            </span>
            <span v-if="!assigneeList.length" class="natb-side__empty">未指派</span>
          </div>
        </section>

        <section class="natb-side">
          <h2 class="natb-side__title">
            <IconMilestone class="size-3.5" />
            里程碑
            <IconLoader v-if="savingField === 'milestone'" class="natb-side__spin size-3" />
          </h2>
          <template v-if="store.canWrite">
            <MilestonePicker v-if="canEditTags" v-model="milestone" />
            <DisabledPicker v-else />
          </template>
          <div v-else class="natb-side__milestone">
            <template v-if="milestoneInfo">
              <span class="natb-side__milestone-title">{{ milestoneInfo.title }}</span>
              <span v-if="milestoneInfo.due_on" class="natb-side__empty">
                截止 {{ absoluteTime(milestoneInfo.due_on) }}
              </span>
            </template>
            <span v-else class="natb-side__empty">未设置里程碑</span>
          </div>
        </section>

        <!-- 操作卡片的样式由 IssueSidebarActions 自己提供，这里只负责摆位置 -->
        <!-- QQ 身份没有标签/锁定/指派这些能力，只给「关闭自己发的单」一个入口 -->
        <!-- QQ 身份（含被封禁、writeMode 为 none 时）看自己的单：走这一支，只给关闭/删除 -->
        <!-- 管理员统一走下面那套完整操作，不再单独出「这是你发的 issue」 -->
        <template v-if="ownIssue && !store.canManage">
        <section class="natb-detail__actions">
          <div class="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
            <p class="text-xs font-medium text-muted-foreground">操作</p>
            <Button variant="outline" size="sm" class="w-full justify-start gap-2" @click="copyIssueLink">
              <IconLink class="size-4 text-muted-foreground" />
              复制链接
            </Button>
            <Button variant="outline" size="sm" class="w-full justify-start gap-2" @click="copyIssueMarkdown">
              <IconFileCode class="size-4 text-muted-foreground" />
              复制 Markdown 引用
            </Button>
          </div>
        </section>

        <section class="natb-detail__actions">
          <div class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-xs">
            <p class="text-xs font-medium text-muted-foreground">这是你发的 issue</p>
            <AlertDialog v-if="canQqClose" v-model:open="closeConfirmOpen">
              <Button variant="outline" size="sm" class="w-full" :disabled="qqClosing" @click="askCloseOwnIssue">
                <IconCircleCheck class="size-4" />
                {{ qqClosing ? '正在关闭…' : '关闭这个 issue' }}
              </Button>
              <AlertDialogContent class="w-[min(400px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-none sm:rounded-xl">
                <div class="flex flex-col items-center px-7 pt-5 pb-4 text-center">
                  <div class="flex items-center gap-3">
                    <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
                      <IconCircleCheck class="size-4" />
                    </div>
                    <AlertDialogTitle class="text-xl font-bold">关闭这个 issue？</AlertDialogTitle>
                  </div>

                  <AlertDialogDescription class="text-muted-foreground mt-3 text-sm leading-relaxed">
                    关闭后这条 issue 会从「未关闭」列表里移出，其他成员仍然可以查看它的内容与历史讨论。
                  </AlertDialogDescription>

                  <p
                    class="border-border text-muted-foreground mt-4 w-full rounded-xl border px-4 py-3 text-left text-[12.5px] leading-relaxed"
                  >
                    关闭不等于删除：内容与评论都会留下，只是不再接受新的回复。想重新打开需要请管理员处理。
                  </p>
                </div>

                <div class="border-border bg-muted/70 border-t px-5 py-4">
                  <div class="grid w-full grid-cols-2 gap-2">
                    <AlertDialogCancel class="h-8 rounded-md px-3 text-sm font-medium">取消</AlertDialogCancel>
                    <AlertDialogAction
                      class="h-8 rounded-md px-3 text-sm font-semibold"
                      @click="closeOwnIssue"
                    >
                      关闭
                    </AlertDialogAction>
                  </div>
                </div>
              </AlertDialogContent>
            </AlertDialog>
            <p v-else class="text-muted-foreground text-xs">已关闭。</p>

            <Button
              v-if="store.canManage"
              variant="outline"
              size="sm"
              class="w-full gap-2"
              :disabled="ownLocking"
              @click="toggleOwnLock"
            >
              <IconLoader v-if="ownLocking" class="size-4 animate-spin" />
              <IconLock v-else-if="!issue.locked" class="size-4" />
              <IconUnlock v-else class="size-4" />
              {{ issue.locked ? '解锁会话' : '锁定会话' }}
            </Button>

            <AlertDialog v-if="store.canManage && store.writeMode === 'github'" v-model:open="deleteConfirmOpen">
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15 w-full gap-1.5 transition-colors"
                  :disabled="qqDeleting"
                  @click="askDeleteOwnIssue"
                >
                  <IconLoader v-if="qqDeleting" class="size-4 animate-spin" />
                  <IconTrash2 v-else class="size-4" />
                  {{ qqDeleting ? '正在删除…' : '删除这个 issue' }}
                </Button>
              <!-- 内容区居中竖排，按钮区单独成条：浅灰底 + 顶部分隔线 + 右对齐（同「关闭 issue」那份） -->
              <AlertDialogContent class="w-[min(400px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-none sm:rounded-xl">
                <div class="flex flex-col items-center px-7 pt-5 pb-4 text-center">
                  <div class="flex items-center gap-3">
                    <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
                      <IconTrash2 class="size-4" />
                    </div>
                    <AlertDialogTitle class="text-xl font-bold">删除这个 issue？</AlertDialogTitle>
                  </div>

                  <AlertDialogDescription class="text-muted-foreground mt-3 text-sm leading-relaxed">
                    删除后这条 issue 与它的全部评论、时间线都会被永久移除，且无法恢复，请确认后再继续。
                  </AlertDialogDescription>

                  <p
                    class="border-border text-muted-foreground mt-4 w-full rounded-xl border px-4 py-3 text-left text-[12.5px] leading-relaxed"
                  >
                    该 issue 的编号将随之作废，此前分享出去的链接会失效，其他成员无法再访问或引用它。
                  </p>
                </div>

                <!-- 只换这条的背景（浅灰 + 分隔线），按钮仍是等分铺满 -->
                <div class="border-border bg-muted/70 border-t px-5 py-4">
                  <div class="grid w-full grid-cols-2 gap-2">
                    <AlertDialogCancel class="h-8 rounded-md px-3 text-sm font-medium">取消</AlertDialogCancel>
                    <AlertDialogAction
                      class="bg-destructive hover:bg-destructive hover:brightness-95 h-8 rounded-md px-3 text-sm font-semibold text-white transition-[filter] duration-200"
                      @click="deleteOwnIssue"
                    >
                      <IconLoader v-if="qqDeleting" class="size-3.5 animate-spin" />
                      删除
                    </AlertDialogAction>
                  </div>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>
        </template>

        <!-- 其余情况（非管理、非本单作者的任何人）：只给分享类操作，具体能点到哪些由组件内部判断 -->
        <section v-else class="natb-detail__actions">
          <IssueSidebarActions :issue="issue" @changed="onSidebarChanged" @blocked="onBlocked" />
        </section>
      </aside>
    </div>
    <QqBanDialog v-model:open="banOpen" />
  </div>
</template>

<style scoped>
.natb-detail {
  width: 100%;
}

.natb-detail__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 264px;
  gap: 18px;
  align-items: start;
}

.natb-detail__main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.natb-detail__side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 84px;
  min-width: 0;
}

.natb-detail__skeleton-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 6px;
}

/* ---------- 头部 ---------- */

.natb-detail__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.natb-detail__back {
  margin-top: 2px;
  color: var(--natb-muted-foreground);
}

.natb-detail__head-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.natb-detail__title {
  font-size: clamp(1.15rem, 2.2vw, 1.5rem);
  font-weight: 680;
  letter-spacing: -0.02em;
  line-height: 1.35;
  margin: 0;
  color: var(--natb-foreground);
  word-break: break-word;
}

.natb-detail__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: var(--natb-muted-foreground);
}

.natb-detail__number {
  font-family: var(--font-mono);
  font-size: 12px;
  opacity: 0.8;
}

.natb-detail__meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.natb-detail__meta-strong {
  color: var(--natb-foreground);
  font-weight: 600;
}

.natb-detail__external {
  flex: none;
}

/* ---------- 正文卡片 ---------- */

.natb-detail__card {
  border-radius: 14px;
  background: var(--natb-glass);
  border: 1px solid var(--natb-glass-border);
  box-shadow: var(--natb-shadow-card);
  overflow: hidden;
}

.natb-detail__card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--natb-border);
  background: color-mix(in oklch, var(--natb-muted) 40%, transparent);
  font-size: 12.5px;
  color: var(--natb-muted-foreground);
}

.natb-detail__card-author {
  color: var(--natb-foreground);
  font-weight: 620;
}

.natb-detail__card-body {
  padding: 16px;
}

.natb-detail__empty {
  color: var(--natb-muted-foreground);
  font-size: 13px;
  font-style: italic;
  margin: 0;
}

/* ---------- 时间线 / 评论框 ---------- */

.natb-detail__timeline {
  margin-top: 2px;
}

.natb-detail__composer {
  margin-top: 2px;
}

.natb-detail__hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  /* 固定高度：加一个按钮进来也不该把这条挤高 */
  min-height: 52px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px dashed var(--natb-border);
  color: var(--natb-muted-foreground);
  font-size: 13px;
}

/* ---------- 错误态 ---------- */

.natb-detail__error {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 560px;
}

.natb-detail__error-actions {
  display: flex;
  gap: 8px;
}

/* ---------- 侧栏 ---------- */

.natb-side {
  border-radius: 14px;
  background: var(--natb-glass);
  border: 1px solid var(--natb-glass-border);
  box-shadow: var(--natb-shadow-card);
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.natb-side__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  font-weight: 620;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--natb-muted-foreground);
}

.natb-side__spin {
  animation: natb-side-spin 0.9s linear infinite;
  color: var(--natb-primary);
}

@keyframes natb-side-spin {
  to {
    transform: rotate(360deg);
  }
}

.natb-side__labels,
.natb-side__people {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.natb-side__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: none;
  border: 1px solid color-mix(in oklch, var(--natb-foreground) 12%, transparent);
}

.natb-side__person {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--natb-foreground);
}

.natb-side__milestone {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
}

.natb-side__milestone-title {
  color: var(--natb-foreground);
  font-weight: 600;
}

.natb-side__empty {
  font-size: 12px;
  color: var(--natb-muted-foreground);
}

.natb-detail__actions {
  display: block;
}

@media (max-width: 1040px) {
  .natb-detail__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .natb-detail__side {
    position: static;
    order: -1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }

  .natb-detail__external {
    display: none;
  }
}
</style>
