<script setup>
/**
 * Issue 的合并时间线：把 timeline 事件与评论按时间升序排成一条流。
 *
 * 未知事件类型一律降级成一句中性描述，不抛错、不空白，避免 GitHub 新增事件类型把整页打挂。
 */
import { computed } from 'vue'

import IssueComment from './IssueComment.vue'

import IconActivity from '~icons/lucide/activity'
import IconArrowRightLeft from '~icons/lucide/arrow-right-left'
import IconAtSign from '~icons/lucide/at-sign'
import IconBell from '~icons/lucide/bell'
import IconBellOff from '~icons/lucide/bell-off'
import IconCircleDot from '~icons/lucide/circle-dot'
import IconCircleX from '~icons/lucide/circle-x'
import IconCopy from '~icons/lucide/copy'
import IconEye from '~icons/lucide/eye'
import IconEyeOff from '~icons/lucide/eye-off'
import IconGitBranch from '~icons/lucide/git-branch'
import IconGitCommit from '~icons/lucide/git-commit'
import IconGitPullRequest from '~icons/lucide/git-pull-request'
import IconLink from '~icons/lucide/link'
import IconLock from '~icons/lucide/lock'
import IconLockOpen from '~icons/lucide/lock-open'
import IconMessageSquare from '~icons/lucide/message-square'
import IconMessageSquareX from '~icons/lucide/message-square-x'
import IconMilestone from '~icons/lucide/milestone'
import IconPencil from '~icons/lucide/pencil'
import IconPin from '~icons/lucide/pin'
import IconRotateCcw from '~icons/lucide/rotate-ccw'
import IconTag from '~icons/lucide/tag'
import IconUnlink from '~icons/lucide/unlink'
import IconUserMinus from '~icons/lucide/user-minus'
import IconUserPlus from '~icons/lucide/user-plus'

const props = defineProps({
  events: { type: Array, default: () => [] },
  comments: { type: Array, default: () => [] },
})

const emit = defineEmits(['open', 'edit', 'delete', 'reply'])

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

function timestamp(value) {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER
}

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

/* ---------------- 事件文案 ---------------- */

const text = (value) => ({ k: 't', v: String(value) })
const bold = (value) => ({ k: 'b', v: String(value) })
const code = (value) => ({ k: 'c', v: String(value) })
const issueRef = (number, title) => ({ k: 'i', n: Number(number), v: title ? String(title) : '' })

const ICONS = {
  closed: IconCircleX,
  reopened: IconRotateCcw,
  labeled: IconTag,
  unlabeled: IconTag,
  assigned: IconUserPlus,
  unassigned: IconUserMinus,
  milestoned: IconMilestone,
  demilestoned: IconMilestone,
  renamed: IconPencil,
  locked: IconLock,
  unlocked: IconLockOpen,
  referenced: IconLink,
  'cross-referenced': IconGitPullRequest,
  committed: IconGitCommit,
  review_requested: IconEye,
  review_request_removed: IconEyeOff,
  review_dismissed: IconEyeOff,
  mentioned: IconAtSign,
  subscribed: IconBell,
  unsubscribed: IconBellOff,
  pinned: IconPin,
  unpinned: IconPin,
  marked_as_duplicate: IconCopy,
  unmarked_as_duplicate: IconCopy,
  comment_deleted: IconMessageSquareX,
  connected: IconLink,
  disconnected: IconUnlink,
  head_ref_deleted: IconGitBranch,
  head_ref_restored: IconGitBranch,
  converted_to_discussion: IconArrowRightLeft,
  transferred: IconArrowRightLeft,
  comment: IconMessageSquare,
}

/** 按事件名生成一句中文描述，返回 { icon, tone, parts } */
function describe(event) {
  const name = String(event?.event || '')
  const actor = event?.actor?.login || '有人'
  const icon = ICONS[name] || IconActivity
  const parts = [bold(actor)]

  switch (name) {
    case 'closed': {
      const reason = event?.state_reason
      parts.push(text(reason === 'not_planned' ? ' 关闭了这条 issue（未计划）' : ' 关闭了这条 issue'))
      return { icon, tone: 'danger', parts }
    }
    case 'reopened':
      parts.push(text(' 重新打开了这条 issue'))
      return { icon, tone: 'success', parts }
    case 'labeled':
      parts.push(text(' 添加了标签 '), code(event?.label?.name || '未知标签'))
      return { icon, tone: 'accent', parts }
    case 'unlabeled':
      parts.push(text(' 移除了标签 '), code(event?.label?.name || '未知标签'))
      return { icon, tone: 'muted', parts }
    case 'assigned':
      parts.push(text(' 指派给了 '), bold('@' + (event?.assignee?.login || '某人')))
      return { icon, tone: 'accent', parts }
    case 'unassigned':
      parts.push(text(' 取消了指派 '), bold('@' + (event?.assignee?.login || '某人')))
      return { icon, tone: 'muted', parts }
    case 'milestoned':
      parts.push(text(' 放进了里程碑 '), bold(event?.milestone?.title || '未命名里程碑'))
      return { icon, tone: 'accent', parts }
    case 'demilestoned':
      parts.push(text(' 从里程碑 '), bold(event?.milestone?.title || '未命名里程碑'), text(' 中移出'))
      return { icon, tone: 'muted', parts }
    case 'renamed': {
      const from = event?.rename?.from
      const to = event?.rename?.to
      if (from !== undefined && to !== undefined) {
        parts.push(text(' 把标题从 '), code(from), text(' 改成了 '), code(to))
      } else {
        parts.push(text(' 修改了标题'))
      }
      return { icon, tone: 'accent', parts }
    }
    case 'locked': {
      const reason = event?.lock_reason
      const suffix = reason ? `（原因：${reason}）` : ''
      parts.push(text(' 锁定了对话' + suffix))
      return { icon, tone: 'muted', parts }
    }
    case 'unlocked':
      parts.push(text(' 解除了对话锁定'))
      return { icon, tone: 'muted', parts }
    case 'referenced': {
      const sha = String(event?.commit_id || '').slice(0, 7)
      parts.push(text(sha ? ' 在提交 ' : ' 引用了这条 issue'))
      if (sha) parts.push(code(sha), text(' 中引用了这条 issue'))
      return { icon, tone: 'default', parts }
    }
    case 'cross-referenced': {
      const source = event?.source?.issue
      const pull = event?.source?.type === 'pull_request'
      if (source && source.number) {
        parts.push(text(pull ? ' 在 PR ' : ' 在 '), issueRef(source.number, source.title || ''), text(pull ? ' 中引用了这条 issue' : ' 中引用了这条 issue'))
      } else {
        parts.push(text(' 引用了这条 issue'))
      }
      return { icon, tone: 'default', parts }
    }
    case 'committed': {
      const sha = String(event?.commit_id || event?.sha || '').slice(0, 7)
      const message = event?.message || event?.commit?.message || ''
      parts.push(text(' 提交了'))
      if (sha) parts.push(text(' '), code(sha))
      if (message) parts.push(text('：'), text(String(message).split('\n')[0].slice(0, 90)))
      return { icon, tone: 'default', parts }
    }
    case 'review_requested':
      parts.push(text(' 请求 '), bold('@' + (event?.requested_reviewer?.login || event?.review_requester?.login || '某人')), text(' 评审'))
      return { icon, tone: 'accent', parts }
    case 'review_request_removed':
      parts.push(text(' 撤回了对 '), bold('@' + (event?.requested_reviewer?.login || '某人')), text(' 的评审请求'))
      return { icon, tone: 'muted', parts }
    case 'review_dismissed':
      parts.push(text(' 驳回了来自 '), bold('@' + (event?.requested_reviewer?.login || '某人')), text(' 的评审'))
      return { icon, tone: 'muted', parts }
    case 'mentioned':
      parts.push(text(' 提到了这条 issue'))
      return { icon, tone: 'default', parts }
    case 'subscribed':
      parts.push(text(' 订阅了这条 issue'))
      return { icon, tone: 'default', parts }
    case 'unsubscribed':
      parts.push(text(' 取消订阅了这条 issue'))
      return { icon, tone: 'muted', parts }
    case 'pinned':
      parts.push(text(' 置顶了这条 issue'))
      return { icon, tone: 'accent', parts }
    case 'unpinned':
      parts.push(text(' 取消了置顶'))
      return { icon, tone: 'muted', parts }
    case 'marked_as_duplicate':
      parts.push(text(' 把这条 issue 标记为重复'))
      return { icon, tone: 'muted', parts }
    case 'unmarked_as_duplicate':
      parts.push(text(' 取消了重复标记'))
      return { icon, tone: 'muted', parts }
    case 'comment_deleted':
      parts.push(text(' 删除了一条评论'))
      return { icon, tone: 'muted', parts }
    case 'connected':
      parts.push(text(' 把这条 issue 关联到了别的条目'))
      return { icon, tone: 'default', parts }
    case 'disconnected':
      parts.push(text(' 取消了关联'))
      return { icon, tone: 'muted', parts }
    case 'head_ref_deleted':
      parts.push(text(' 删除了分支引用'))
      return { icon, tone: 'muted', parts }
    case 'head_ref_restored':
      parts.push(text(' 恢复了分支引用'))
      return { icon, tone: 'default', parts }
    case 'converted_to_discussion':
      parts.push(text(' 把这条 issue 转成了 discussion'))
      return { icon, tone: 'muted', parts }
    case 'transferred':
      parts.push(text(' 把这条 issue 转移到了别的仓库'))
      return { icon, tone: 'muted', parts }
    default:
      // 未知事件：中性描述，绝不崩
      parts.push(text(' 更新了这条 issue'))
      return { icon: IconActivity, tone: 'muted', parts }
  }
}

/* ---------------- 评论操作透传 ---------------- */

function forwardEdit(id, body) {
  emit('edit', id, body)
}

function forwardDelete(id) {
  emit('delete', id)
}

function forwardReply(login) {
  emit('reply', login)
}

/* ---------------- 合并 ---------------- */

const items = computed(() => {
  const list = []

  for (const [index, comment] of (props.comments || []).entries()) {
    if (!comment) continue
    list.push({
      key: 'comment-' + (comment.id ?? index),
      kind: 'comment',
      at: timestamp(comment.created_at),
      order: 0,
      comment,
    })
  }

  for (const [index, event] of (props.events || []).entries()) {
    if (!event) continue
    // 评论已经在 comments 里渲染，timeline 的 commented 只是重复
    if (event.event === 'commented') continue
    const at = timestamp(event.created_at || event.submitted_at || event.committed_at)
    list.push({
      key: 'event-' + (event.id ?? index),
      kind: 'event',
      at,
      order: 1,
      atLabel: event.created_at || event.submitted_at || event.committed_at,
      ...describe(event),
    })
  }

  return list.sort((a, b) => a.at - b.at || a.order - b.order)
})
</script>

<template>
  <div class="natb-timeline">
    <p v-if="!items.length" class="natb-timeline__empty">还没有任何活动</p>

    <ol v-else class="natb-timeline__list">
      <li
        v-for="item in items"
        :key="item.key"
        class="natb-timeline__item"
        :class="item.kind === 'comment' ? 'natb-timeline__item--comment' : 'natb-timeline__item--event'"
      >
        <span class="natb-timeline__marker" :class="'is-' + (item.tone || 'muted')" aria-hidden="true">
          <component :is="item.icon" class="size-3.5" />
        </span>

        <div class="natb-timeline__body">
          <IssueComment
            v-if="item.kind === 'comment'"
            :comment="item.comment"
            :events="events"
            @edit="forwardEdit"
            @delete="forwardDelete"
            @reply="forwardReply"
          />

          <div v-else class="natb-timeline__event">
            <p class="natb-timeline__text">
              <template v-for="(part, index) in item.parts" :key="index">
                <span v-if="part.k === 't'">{{ part.v }}</span>
                <span v-else-if="part.k === 'b'" class="natb-timeline__strong">{{ part.v }}</span>
                <code v-else-if="part.k === 'c'" class="natb-timeline__code">{{ part.v }}</code>
                <button
                  v-else-if="part.k === 'i'"
                  type="button"
                  class="natb-timeline__ref"
                  @click="emit('open', part.n)"
                >#{{ part.n }}<template v-if="part.v"> {{ part.v }}</template></button>
              </template>
              <time
                class="natb-timeline__time"
                :datetime="item.atLabel"
                :title="absoluteTime(item.atLabel)"
              >{{ relativeTime(item.atLabel) }}</time>
            </p>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.natb-timeline__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.natb-timeline__empty {
  padding: 22px 0;
  text-align: center;
  font-size: 13px;
  color: var(--natb-muted-foreground);
}

.natb-timeline__item {
  position: relative;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

/* 竖轴：从图标中心向下连到下一条 */
.natb-timeline__item::before {
  content: '';
  position: absolute;
  left: 12.5px;
  top: 22px;
  bottom: -14px;
  width: 1px;
  background: var(--natb-border);
}

.natb-timeline__item:last-child::before {
  display: none;
}

.natb-timeline__marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid var(--natb-border);
  background: var(--natb-card);
  color: var(--natb-muted-foreground);
  flex: none;
  z-index: 1;
}

.natb-timeline__marker.is-danger {
  color: var(--natb-destructive);
  border-color: color-mix(in oklch, var(--natb-destructive) 35%, var(--natb-border));
}

.natb-timeline__marker.is-success {
  color: var(--natb-primary);
  border-color: color-mix(in oklch, var(--natb-primary) 35%, var(--natb-border));
}

.natb-timeline__marker.is-accent {
  color: var(--natb-accent-foreground);
  border-color: color-mix(in oklch, var(--natb-accent-foreground) 30%, var(--natb-border));
  background: color-mix(in oklch, var(--natb-accent) 55%, transparent);
}

.natb-timeline__body {
  min-width: 0;
  padding-top: 2px;
}

.natb-timeline__event {
  display: block;
}

.natb-timeline__text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--natb-muted-foreground);
  margin: 0;
}

.natb-timeline__strong {
  color: var(--natb-foreground);
  font-weight: 600;
}

.natb-timeline__code {
  font-family: var(--font-mono);
  font-size: 0.86em;
  padding: 0.1em 0.36em;
  border-radius: 6px;
  background: color-mix(in oklch, var(--natb-muted) 82%, transparent);
  color: var(--natb-foreground);
}

.natb-timeline__ref {
  color: var(--natb-primary);
  font-weight: 600;
  background: transparent;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.natb-timeline__ref:hover {
  color: var(--natb-brand);
}

.natb-timeline__time {
  margin-left: 6px;
  white-space: nowrap;
  opacity: 0.85;
}

.natb-timeline__time::before {
  content: '· ';
}
</style>
