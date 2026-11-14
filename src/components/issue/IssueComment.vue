<script setup>
/**
 * 单条评论。
 *
 * 只负责展示与「进入编辑态」，真正的网络写入通过 edit / delete 交给父级，
 * 这样失败重试、列表刷新都只有一处逻辑。
 */
import { computed, nextTick, ref } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import MarkdownView from './MarkdownView.vue'
import { parseQqMarker, stripQqMarker } from '@/utils/qqMarker'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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

import IconPencil from '~icons/lucide/pencil'
import IconTrash2 from '~icons/lucide/trash-2'
import IconReply from '~icons/lucide/reply'

const props = defineProps({
  comment: { type: Object, default: () => ({}) },
  events: { type: Array, default: () => [] },
})

const emit = defineEmits(['edit', 'delete', 'reply'])

const store = useIssueStore()

/* ---------------- 展示数据 ---------------- */

const author = computed(() => props.comment?.user || {})
/** QQ 用户代发的评论，作者显示成「QQ 用户 xxx」，且不再链接到机器人主页 */
const qqMarker = computed(() => parseQqMarker(props.comment?.body))
const login = computed(() =>
  qqMarker.value
    ? 'QQ 用户 ' + (qqMarker.value.nick || qqMarker.value.sub.slice(0, 4))
    : author.value.login || 'ghost',
)
const avatarUrl = computed(() => (qqMarker.value ? '' : author.value.avatar_url || ''))
const initial = computed(() => String(login.value).slice(0, 1).toUpperCase())
const profileUrl = computed(() =>
  qqMarker.value ? '' : `https://github.com/${author.value.login || 'ghost'}`,
)
const cleanBody = computed(() => stripQqMarker(props.comment?.body))

const createdAt = computed(() => props.comment?.created_at || '')
const updatedAt = computed(() => props.comment?.updated_at || createdAt.value)

/** 只有作者本人能编辑 / 删除 */
const isAuthor = computed(() => {
  const me = store.user?.login
  if (!store.isLoggedIn || !me) return false
  return String(me).toLowerCase() === String(login.value).toLowerCase()
})

/** 时间线里的编辑记录（GitHub 对评论编辑通常只反映在 updated_at 上，两者都认） */
const editedFromEvents = computed(() => {
  const id = props.comment?.id
  return (props.events || []).some((event) => {
    if (!event) return false
    if (event.event !== 'edited' && event.event !== 'comment_edited') return false
    return event.comment_id === id || event.subject?.id === id
  })
})

const isEdited = computed(() => {
  if (editedFromEvents.value) return true
  const created = new Date(createdAt.value).getTime()
  const updated = new Date(updatedAt.value).getTime()
  if (!Number.isFinite(created) || !Number.isFinite(updated)) return false
  return updated - created > 1500
})

/* ---------------- 时间格式化 ---------------- */

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

/* ---------------- 行内编辑 ---------------- */

const editing = ref(false)
const draft = ref('')
const textareaRef = ref(null)

function startEdit() {
  draft.value = props.comment?.body || ''
  editing.value = true
  nextTick(() => {
    const el = textareaRef.value?.$el || textareaRef.value
    if (el && typeof el.focus === 'function') {
      el.focus()
      el.setSelectionRange?.(el.value.length, el.value.length)
    }
  })
}

function cancelEdit() {
  editing.value = false
  draft.value = ''
}

function saveEdit() {
  const body = draft.value.trim()
  if (!body) {
    toast.error('评论内容不能为空')
    return
  }
  if (body === (props.comment?.body || '').trim()) {
    cancelEdit()
    return
  }
  emit('edit', props.comment.id, body)
  editing.value = false
}

function requestDelete() {
  emit('delete', props.comment.id)
}

function requestReply() {
  emit('reply', login.value)
}
</script>

<template>
  <article :id="'natb-comment-' + comment.id" class="natb-comment">
    <header class="natb-comment__head">
      <Avatar class="size-9 natb-comment__avatar">
        <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="login" />
        <AvatarFallback class="text-xs font-semibold">{{ initial }}</AvatarFallback>
      </Avatar>

      <div class="natb-comment__meta">
        <a
          class="natb-comment__author"
          :href="profileUrl"
          target="_blank"
          rel="noopener noreferrer"
        >{{ login }}</a>
        <span class="natb-comment__time">
          评论于
          <time :datetime="createdAt" :title="absoluteTime(createdAt)">{{ relativeTime(createdAt) }}</time>
        </span>
        <span v-if="isEdited" class="natb-comment__edited" :title="'最后编辑于 ' + absoluteTime(updatedAt)">
          已编辑
        </span>
      </div>

      <div v-if="!editing" class="natb-comment__actions">
        <button
          v-if="store.isLoggedIn"
          type="button"
          class="natb-comment__action"
          title="引用回复"
          @click="requestReply"
        >
          <IconReply class="size-3.5" />
        </button>

        <template v-if="isAuthor">
          <button
            type="button"
            class="natb-comment__action"
            title="编辑评论"
            @click="startEdit"
          >
            <IconPencil class="size-3.5" />
          </button>

          <AlertDialog>
            <AlertDialogTrigger as-child>
              <button type="button" class="natb-comment__action natb-comment__action--danger" title="删除评论">
                <IconTrash2 class="size-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除这条评论？</AlertDialogTitle>
                <AlertDialogDescription>
                  删除后无法恢复，评论的回复也会失去上下文。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  class="bg-destructive hover:bg-destructive/90 font-semibold text-white"
                  @click="requestDelete"
                >
                  删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </template>
      </div>
    </header>

    <div v-if="!editing" class="natb-comment__body">
      <MarkdownView v-if="cleanBody" :content="cleanBody" />
      <p v-else class="natb-comment__empty">（这条评论没有正文）</p>
    </div>

    <div v-else class="natb-comment__editor">
      <Textarea
        ref="textareaRef"
        v-model="draft"
        class="min-h-28 text-sm"
        placeholder="修改这条评论…"
      />
      <div class="natb-comment__editor-actions">
        <Button variant="ghost" size="sm" @click="cancelEdit">取消</Button>
        <Button size="sm" @click="saveEdit">保存修改</Button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.natb-comment {
  border-radius: 14px;
  background: var(--natb-glass);
  border: 1px solid var(--natb-glass-border);
  box-shadow: var(--natb-shadow-card);
  overflow: hidden;
}

.natb-comment__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--natb-border);
  background: color-mix(in oklch, var(--natb-muted) 40%, transparent);
}

.natb-comment__avatar {
  flex: none;
}

.natb-comment__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.5;
  padding-top: 1px;
}

.natb-comment__author {
  font-weight: 620;
  color: var(--natb-foreground);
  text-decoration: none;
}

.natb-comment__author:hover {
  color: var(--natb-primary);
}

.natb-comment__time {
  color: var(--natb-muted-foreground);
}

.natb-comment__edited {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--natb-muted-foreground);
  border: 1px solid var(--natb-border);
}

.natb-comment__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  opacity: 0.55;
  transition: opacity 160ms cubic-bezier(0.32, 0.72, 0, 1);
}

.natb-comment:hover .natb-comment__actions,
.natb-comment:focus-within .natb-comment__actions {
  opacity: 1;
}

.natb-comment__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: var(--natb-muted-foreground);
  background: transparent;
  transition: background 160ms cubic-bezier(0.32, 0.72, 0, 1), color 160ms;
}

.natb-comment__action:hover {
  background: color-mix(in oklch, var(--natb-accent) 80%, transparent);
  color: var(--natb-accent-foreground);
}

.natb-comment__action--danger:hover {
  background: color-mix(in oklch, var(--natb-destructive) 14%, transparent);
  color: var(--natb-destructive);
}

.natb-comment__body {
  padding: 14px 16px;
}

.natb-comment__empty {
  color: var(--natb-muted-foreground);
  font-size: 13px;
  font-style: italic;
}

.natb-comment__editor {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.natb-comment__editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
