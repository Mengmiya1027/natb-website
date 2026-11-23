<script setup>
/**
 * 单条评论。
 *
 * 只负责展示与「进入编辑态」，真正的网络写入通过 edit / delete 交给父级，
 * 这样失败重试、列表刷新都只有一处逻辑。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import MarkdownView from './MarkdownView.vue'
import { buildQqSignature, parseQqMarker, stripQqMarker } from '@/utils/qqMarker'
import QqSignatureEditor from '@/components/issue/QqSignatureEditor.vue'

import { Button } from '@/components/ui/button'
import MarkdownEditor from '@/components/issue/MarkdownEditor.vue'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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

import IconPencil from '~icons/lucide/pencil'
import IconTrash2 from '~icons/lucide/trash-2'
import IconReply from '~icons/lucide/reply'

const props = defineProps({
  comment: { type: Object, default: () => ({}) },
  events: { type: Array, default: () => [] },
  /** 对话已锁定：非管理连自己的评论也不能改、不能删（GitHub 同款） */
  locked: { type: Boolean, default: false },
})

const emit = defineEmits(['edit', 'delete', 'reply', 'blocked'])

const store = useIssueStore()

/* ---------------- 展示数据 ---------------- */

const author = computed(() => props.comment?.user || {})
/** QQ 用户代发的评论，作者显示成「QQ 用户 xxx」，且不再链接到机器人主页 */
const qqMarker = computed(() => parseQqMarker(props.comment?.body))
const qqProfile = computed(() => (qqMarker.value ? store.profileOf(qqMarker.value.sub) : null))
/* 名字必须查档案，不能读 marker 里的 nick：marker 现在只存 sub，
 * 任何一条被编辑过的评论，重拼之后里面的 nick 就没了 */
const login = computed(() =>
  qqMarker.value
    ? qqProfile.value?.nick || 'QQ 用户 ' + qqMarker.value.sub.slice(0, 4)
    : author.value.login || 'ghost',
)
const avatarUrl = computed(() => {
  if (!qqMarker.value) return author.value.avatar_url || ''
  return qqProfile.value?.avatar === 'qq' ? store.avatarFor(qqMarker.value.sub) : ''
})
const initial = computed(() => String(login.value).slice(0, 1).toUpperCase())
/** 档案还在路上：名字与头像先占位，别先闪一个「QQ 用户 ____」再跳成真名 */
const profileLoading = computed(
  () => Boolean(qqMarker.value) && !store.hasProfile(qqMarker.value.sub),
)
/** 图片自身还在下载 */
const avatarReady = ref(false)
watch(
  () => avatarUrl.value,
  () => {
    avatarReady.value = false
  },
)
/** 换了头像之后旧地址可能已失效，加载失败就退回首字母 */
const avatarBroken = ref(false)
watch(avatarUrl, () => {
  avatarBroken.value = false
})
const profileUrl = computed(() =>
  qqMarker.value ? '' : `https://github.com/${author.value.login || 'ghost'}`,
)
const cleanBody = computed(() => stripQqMarker(props.comment?.body))

// 昵称和头像存在远端：拿到 sub 后再问一次，改过昵称老评论也会跟着变
watch(
  () => qqMarker.value?.sub,
  (sub) => {
    if (sub) store.loadProfiles([sub])
  },
  { immediate: true },
)

const createdAt = computed(() => props.comment?.created_at || '')
const updatedAt = computed(() => props.comment?.updated_at || createdAt.value)

/** 作者本人（GitHub 身份） */
const isAuthor = computed(() => {
  const me = store.user?.login
  if (!store.isLoggedIn || !me) return false
  return String(me).toLowerCase() === String(login.value).toLowerCase()
})

/** 这条评论是当前 QQ 账号发的 */
const qqOwnComment = computed(
  () => Boolean(qqMarker.value?.sub && store.qqUser?.sub && qqMarker.value.sub === store.qqUser.sub),
)

/**
 * 谁能进编辑态：作者本人（改自己的正文），或管理员（改任何 QQ 评论的正文与署名）。
 *
 * 两条线要分清楚：
 *   正文   → 作者自己能改，管理员也能改
 *   署名   → 只有管理员能改；作者保存时前端不会带新 sub，后端也强制沿用原 owner
 * 中转那边 /qq/comment/:id 的 PATCH 与这里同口径（isAdmin 放行非作者，非管理员一律用原 sub）。
 * GitHub 的评论不在此列——GitHub 网页端本身就只允许作者编辑，这里不越权。
 * 被封禁 / 未登录时按钮仍然显示，点下去由 guardWritable() 直接弹封禁说明。
 */
/* 锁定之后，GitHub 只允许「有写权限的人」增删改评论 —— 作者本人也不行。
 * 但按钮还是照常显示：让它出现在原位、只是点不动，比整排按钮凭空消失更容易理解。
 * lockedForMe 只负责把按钮置灰并在悬浮时说明原因，不参与可见性判断。 */
const lockedForMe = computed(() => props.locked && !store.canManage)
const canEdit = computed(() => {
  if (isAuthor.value || qqOwnComment.value) return true
  return Boolean(store.canManage && qqMarker.value)
})
const canDelete = computed(() => canEdit.value || store.canManage)

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
/** 署名行归属；只有管理员能改 */
const sigSub = ref('')
const editorWrap = ref(null)
const deleteOpen = ref(false)

/* 不可写（未登录 / 被封禁）时直接上报，不要先让用户走一遍编辑或确认流程 */
function guardWritable() {
  if (store.canWrite) return true
  emit('blocked')
  return false
}

function startEdit() {
  if (lockedForMe.value) return
  if (!guardWritable()) return
  draft.value = stripQqMarker(props.comment?.body || '')
  sigSub.value = qqMarker.value?.sub || ''
  editing.value = true
  nextTick(() => {
    // 光标放到末尾：编辑器内部有自己的 textarea，从外面只能这样找
    const el = editorWrap.value?.querySelector('textarea')
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
  const body = stripQqMarker(draft.value).trim()
  if (!body) {
    toast.error('评论内容不能为空')
    return
  }
  // 署名尾巴由前端统一重拼（管理员可能刚改过归属）
  const payload = sigSub.value ? body + buildQqSignature(sigSub.value) : body
  if (payload === (props.comment?.body || '').trim()) {
    cancelEdit()
    return
  }
  emit('edit', props.comment.id, payload)
  editing.value = false
}

/** 点垃圾桶先过一遍可写检查：被封的人不该看到「删除这条评论？」再被拒绝 */
function askDelete() {
  if (lockedForMe.value) return
  if (!guardWritable()) return
  deleteOpen.value = true
}

function requestDelete() {
  emit('delete', props.comment.id)
}

function requestReply() {
  if (!guardWritable()) return
  emit('reply', login.value)
}
</script>

<template>
  <article :id="'natb-comment-' + comment.id" class="natb-comment">
    <header class="natb-comment__head">
      <!-- 显式互斥：头像地址从「有」变成「无」时 reka-ui 的加载状态会停在
           loaded，AvatarFallback 不出来，会剩一个空白圆 -->
      <span
        v-if="profileLoading"
        class="natb-comment__avatar bg-muted size-9 shrink-0 animate-pulse rounded-full"
        aria-hidden="true"
      />
      <img
        v-else-if="avatarUrl && !avatarBroken"
        :src="avatarUrl"
        :alt="login"
        class="border-border natb-comment__avatar size-9 shrink-0 rounded-full border object-cover transition-opacity duration-200"
        :class="avatarReady ? 'opacity-100' : 'bg-muted opacity-0'"
        @load="avatarReady = true"
        @error="avatarBroken = true"
      />
      <span
        v-else
        class="bg-muted natb-comment__avatar grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
      >
        {{ initial }}
      </span>

      <div class="natb-comment__meta">
        <span
          v-if="profileLoading"
          class="bg-muted inline-block h-3 w-16 animate-pulse rounded"
          aria-label="正在加载作者"
        />
        <a
          v-else
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
        <!-- 原生 title 要等一秒才冒出来，样式也没法统一，统一换成 Tooltip -->
        <TooltipProvider :delay-duration="300">
          <Tooltip v-if="store.isLoggedIn">
            <TooltipTrigger as-child>
              <button
                type="button"
                class="natb-comment__action"
                aria-label="引用回复"
                @click="requestReply"
              >
                <IconReply class="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>引用回复</TooltipContent>
          </Tooltip>

          <Tooltip v-if="canEdit">
            <TooltipTrigger as-child>
              <button
                type="button"
                class="natb-comment__action"
                :class="{ 'is-locked': lockedForMe }"
                :aria-disabled="lockedForMe"
                :aria-label="lockedForMe ? '对话已锁定' : '编辑评论'"
                @click="startEdit"
              >
                <IconPencil class="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {{ lockedForMe ? '这个对话已被锁定，无法编辑评论' : '编辑评论' }}
            </TooltipContent>
          </Tooltip>

          <Tooltip v-if="canDelete">
            <TooltipTrigger as-child>
              <button
                type="button"
                class="natb-comment__action natb-comment__action--danger"
                :class="{ 'is-locked': lockedForMe }"
                :aria-disabled="lockedForMe"
                :aria-label="lockedForMe ? '对话已锁定' : '删除评论'"
                @click="askDelete"
              >
                <IconTrash2 class="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {{ lockedForMe ? '这个对话已被锁定，无法删除评论' : '删除评论' }}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <template v-if="canDelete">
        <AlertDialog v-model:open="deleteOpen">
            <AlertDialogContent class="w-[min(400px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-none sm:rounded-xl">
              <div class="flex flex-col items-center px-7 pt-5 pb-4 text-center">
                <div class="flex items-center gap-3">
                  <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
                    <IconTrash2 class="size-4" />
                  </div>
                  <AlertDialogTitle class="text-xl font-bold">删除这条评论？</AlertDialogTitle>
                </div>

                <AlertDialogDescription class="text-muted-foreground mt-3 text-sm leading-relaxed">
                  删除后这条评论会永久移除，其他成员不会再看到它的内容，也无法再引用它。
                </AlertDialogDescription>

                <p
                  class="border-border text-muted-foreground mt-4 w-full rounded-xl border px-4 py-3 text-left text-[12.5px] leading-relaxed"
                >
                  只影响这一条评论：issue 本身的状态、标签与时间线都不会因此改变。
                </p>
              </div>

              <div class="border-border bg-muted/70 border-t px-5 py-4">
                <div class="grid w-full grid-cols-2 gap-2">
                  <AlertDialogCancel class="h-8 rounded-md px-3 text-sm font-medium">取消</AlertDialogCancel>
                  <AlertDialogAction
                    class="bg-destructive hover:bg-destructive hover:brightness-95 h-8 rounded-md px-3 text-sm font-semibold text-white transition-[filter] duration-200"
                    @click="requestDelete"
                  >
                    删除
                  </AlertDialogAction>
                </div>
              </div>
            </AlertDialogContent>
          </AlertDialog>
      </template>
    </header>

    <div v-if="!editing" class="natb-comment__body">
      <MarkdownView v-if="cleanBody" :content="cleanBody" />
      <p v-else class="natb-comment__empty">（这条评论没有正文）</p>
    </div>

    <div v-else ref="editorWrap" class="natb-comment__editor">
      <!-- 与正文、新建评论用同一个编辑器：工具栏 + 编辑/预览双 Tab -->
      <MarkdownEditor v-model="draft" min-height="120px" placeholder="修改这条评论…" />
      <div class="natb-comment__editor-actions">
        <div v-if="store.canManage" class="mr-auto">
          <QqSignatureEditor
            :sub="sigSub"
            :from-qq="Boolean(qqMarker)"
            @update:sub="sigSub = $event"
          />
        </div>
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
  align-items: center;
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

/* 锁定后按钮留在原位但点不动：用 aria-disabled 而不是 disabled，
   否则原生 disabled 不派发鼠标事件，悬浮提示就出不来了。 */
.natb-comment__action.is-locked {
  opacity: 0.4;
  cursor: not-allowed;
}

.natb-comment__action.is-locked:hover {
  background: transparent;
  color: var(--natb-muted-foreground);
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
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>
