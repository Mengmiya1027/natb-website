<script setup>
/** 单条 issue。布局参考资产/流水列表：
 *  左：圆角方块里放状态图标　中：标题 + 副标题　右：标签徽章 + 「更新」与时间。 */
import { computed } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import IconCircleDot from '~icons/lucide/circle-dot'
import IconCheckCircle from '~icons/lucide/check-circle'
import IconCircleSlash from '~icons/lucide/circle-slash'
import IconMessageSquare from '~icons/lucide/message-square'
import IconClock from '~icons/lucide/clock'
import IconMoreHorizontal from '~icons/lucide/ellipsis'
import IconExternalLink from '~icons/lucide/external-link'
import IconCopy from '~icons/lucide/copy'

const props = defineProps({
  issue: { type: Object, required: true },
})
const emit = defineEmits(['open'])

const state = computed(() => props.issue?.state || 'open')
const reason = computed(() => props.issue?.state_reason || '')
const isClosed = computed(() => state.value === 'closed')
const isNotPlanned = computed(() => isClosed.value && reason.value === 'not_planned')

const stateIcon = computed(() =>
  isNotPlanned.value ? IconCircleSlash : isClosed.value ? IconCheckCircle : IconCircleDot,
)
const stateTone = computed(() =>
  isNotPlanned.value ? 'text-muted-foreground' : isClosed.value ? 'text-violet-500' : 'text-emerald-500',
)

const labels = computed(() => (props.issue?.labels || []).slice(0, 1))
const moreLabels = computed(() => Math.max(0, (props.issue?.labels || []).length - 1))
const author = computed(() => props.issue?.user || {})
const initial = computed(() => (author.value.login || '?').slice(0, 1).toUpperCase())

function relativeTime(input) {
  if (!input) return ''
  const then = new Date(input).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return new Date(then).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const updatedText = computed(() => relativeTime(props.issue?.updated_at || props.issue?.created_at))

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.issue?.html_url || '')
  } catch {
    /* 忽略剪贴板失败 */
  }
}
</script>

<template>
  <Item
    variant="default"
    class="hover:bg-accent/50 cursor-pointer gap-4 rounded-none border-0 px-6 py-4 transition-colors"
    @click="emit('open', issue.number)"
  >
    <!-- 左：状态图标方块 -->
    <ItemMedia class="self-center">
      <div
        class="border-border bg-card flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border"
      >
        <component :is="stateIcon" class="size-6" :class="stateTone" />
      </div>
    </ItemMedia>

    <!-- 中：标题 + 副标题（编号、作者、评论） -->
    <ItemContent class="min-w-0 gap-1.5">
      <ItemTitle class="text-lg leading-snug font-semibold">
        <span class="line-clamp-1">{{ issue.title }}</span>
      </ItemTitle>

      <ItemDescription class="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span class="font-medium tabular-nums">#{{ issue.number }}</span>
        <span class="inline-flex items-center gap-1.5">
          <Avatar class="size-4">
            <AvatarImage v-if="author.avatar_url" :src="author.avatar_url" :alt="author.login" />
            <AvatarFallback class="text-[8px]">{{ initial }}</AvatarFallback>
          </Avatar>
          {{ author.login }}
        </span>
        <span class="inline-flex items-center gap-1">
          <IconMessageSquare class="size-3.5" />
          {{ issue.comments || 0 }}
        </span>
      </ItemDescription>
    </ItemContent>

    <!-- 右：标签徽章 + 更新时间 -->
    <ItemActions class="shrink-0 items-end gap-1 self-center">
      <div class="flex items-center gap-1.5">
        <Badge
          v-for="label in labels"
          :key="label.id || label.name"
          variant="outline"
          class="gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-normal"
        >
          <span class="size-1.5 rounded-full" :style="{ backgroundColor: '#' + label.color }"></span>
          {{ label.name }}
        </Badge>
        <Badge v-if="moreLabels" variant="secondary" class="rounded-full px-2 py-0 text-[11px] font-normal">
          +{{ moreLabels }}
        </Badge>
      </div>

      <div class="flex items-center gap-1.5">
        <span class="text-muted-foreground inline-flex items-center gap-1 text-[10px] tracking-wide uppercase">
          <IconClock class="size-3" />
          更新
        </span>
        <span class="text-sm font-medium tabular-nums">{{ updatedText }}</span>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="text-muted-foreground size-7" @click.stop>
              <IconMoreHorizontal class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-40">
            <DropdownMenuItem @select="emit('open', issue.number)">
              <IconExternalLink class="size-4" />
              查看详情
            </DropdownMenuItem>
            <DropdownMenuItem @select="copyLink">
              <IconCopy class="size-4" />
              复制链接
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ItemActions>
  </Item>
</template>
