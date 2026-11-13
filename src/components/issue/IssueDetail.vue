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
import { useIssueStore } from '@/stores/issue'

import MarkdownView from './MarkdownView.vue'
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
import { Skeleton } from '@/components/ui/skeleton'

import IconAlertTriangle from '~icons/lucide/triangle-alert'
import IconArrowLeft from '~icons/lucide/arrow-left'
import IconCircleCheck from '~icons/lucide/circle-check'
import IconCircleDot from '~icons/lucide/circle-dot'
import IconExternalLink from '~icons/lucide/external-link'
import IconLoader from '~icons/lucide/loader-circle'
import IconLock from '~icons/lucide/lock'
import IconMessageSquare from '~icons/lucide/message-square'
import IconMilestone from '~icons/lucide/milestone'
import IconTag from '~icons/lucide/tag'
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
const authorLogin = computed(() => author.value.login || 'ghost')
const authorAvatar = computed(() => author.value.avatar_url || '')
const authorInitial = computed(() => String(authorLogin.value).slice(0, 1).toUpperCase())
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
      githubApi.getIssue(props.number),
      // 评论与时间线失败不该拖垮整页，退化成空即可
      githubApi.listComments(props.number, { per_page: 100 }).catch(() => []),
      githubApi.listTimeline(props.number, { per_page: 100 }).catch(() => []),
      // REST 不带 pinned 字段，单独用 GraphQL 补；未登录拿不到就算了
      githubApi.getIssuePinned(props.number).catch(() => null),
    ])
    if (issueData && pinned !== null) issueData.pinned = pinned
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

/* ---------------- 侧栏写入 ---------------- */

watch(labels, async (next) => {
  if (!issue.value) return
  const current = toLabelNames(issue.value.labels)
  const nextNames = toLabelNames(next)
  if (sameSet(current, nextNames)) return

  savingField.value = 'labels'
  try {
    const updated = await githubWriteApi.setLabels(props.number, nextNames)
    issue.value = {
      ...issue.value,
      labels: Array.isArray(updated) ? updated : nextNames.map((name) => ({ name })),
    }
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
    const updated = await githubWriteApi.setAssignees(props.number, nextLogins)
    issue.value = { ...issue.value, ...(updated || {}), assignees: updated?.assignees || [] }
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
    const updated = await githubWriteApi.updateIssue(props.number, { milestone: nextValue })
    issue.value = { ...issue.value, ...(updated || {}), milestone: updated?.milestone ?? null }
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

async function onEditComment(id, body) {
  try {
    const updated = await githubWriteApi.updateComment(id, body)
    comments.value = comments.value.map((comment) =>
      comment.id === id ? { ...comment, ...(updated || {}), body } : comment,
    )
    toast.success('评论已更新')
    emit('changed')
  } catch (err) {
    toast.error(err?.message || '更新评论失败')
  }
}

async function onDeleteComment(id) {
  try {
    await githubWriteApi.deleteComment(id)
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
            <h1 class="natb-detail__title">{{ issue.title }}</h1>
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
            <Avatar class="size-8">
              <AvatarImage v-if="authorAvatar" :src="authorAvatar" :alt="authorLogin" />
              <AvatarFallback class="text-xs font-semibold">{{ authorInitial }}</AvatarFallback>
            </Avatar>
            <span class="natb-detail__card-author">{{ authorLogin }}</span>
            <span class="natb-detail__card-time">
              发布于
              <time :datetime="issue.created_at" :title="absoluteTime(issue.created_at)">
                {{ relativeTime(issue.created_at) }}
              </time>
            </span>
          </header>

          <div class="natb-detail__card-body">
            <MarkdownView v-if="issue.body" :content="issue.body" />
            <p v-else class="natb-detail__empty">这条 issue 没有正文。</p>
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
          />
          <div v-else class="natb-detail__hint">
            <IconLock class="size-4" />
            <span>登录 GitHub 后即可参与讨论</span>
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
          <LabelPicker v-if="store.canWrite" v-model="labels" />
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
          <AssigneePicker v-if="store.canWrite" v-model="assignees" />
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
          <MilestonePicker v-if="store.canWrite" v-model="milestone" />
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
        <section v-if="store.canWrite" class="natb-detail__actions">
          <IssueSidebarActions :issue="issue" @changed="onSidebarChanged" />
        </section>
      </aside>
    </div>
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
  padding: 16px;
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
