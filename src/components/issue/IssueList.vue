<script setup>
/**
 * Issue 列表：骨架 / 空状态 / 出错 / 列表四态。
 * 列表项交给 IssueListItem，空状态用 shadcn-vue 的 Empty 组件。
 */
import { computed, ref, watch } from 'vue'

import { githubApi } from '@/api/github'
import { ISSUE_REPO_FULL } from '@/config/github'
import IssueListItem from './IssueListItem.vue'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

import IconInbox from '~icons/lucide/inbox'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconAlertCircle from '~icons/lucide/alert-circle'

const props = defineProps({
  filters: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['open', 'create'])

const PER_PAGE = 20

const items = ref([])
const page = ref(1)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')
const total = ref(0)
let seq = 0

const hasMore = computed(() => (error.value ? false : items.value.length < total.value))
const isSearch = computed(() => Boolean(props.filters?.search))
const isEmpty = computed(() => !loading.value && !error.value && items.value.length === 0)

function isPullRequest(issue) {
  return Boolean(issue?.pull_request)
}

async function fetchPage(targetPage) {
  const current = ++seq
  if (targetPage === 1) {
    loading.value = true
    items.value = []
  } else {
    loadingMore.value = true
  }
  error.value = ''

  try {
    const f = props.filters || {}
    let data
    if (f.search) {
      const q = `${f.search} repo:${ISSUE_REPO_FULL} is:issue`
      data = await githubApi.search(q, { page: targetPage, per_page: PER_PAGE })
      if (current !== seq) return
      const list = (data.items || []).filter((i) => !isPullRequest(i))
      items.value = targetPage === 1 ? list : [...items.value, ...list]
      total.value = data.total_count || list.length
    } else {
      data = await githubApi.listIssues({
        state: f.state || 'open',
        labels: (f.labels || []).join(','),
        milestone: f.milestone === '' || f.milestone == null ? '' : f.milestone,
        assignee: f.assignee || '',
        sort: f.sort || 'created',
        direction: f.direction || 'desc',
        page: targetPage,
        per_page: PER_PAGE,
      })
      if (current !== seq) return
      const list = (data || []).filter((i) => !isPullRequest(i))
      items.value = targetPage === 1 ? list : [...items.value, ...list]
      total.value = list.length < PER_PAGE ? items.value.length : items.value.length + 1
    }
    page.value = targetPage
  } catch (err) {
    if (current !== seq) return
    error.value = err?.message || '加载失败'
    if (targetPage === 1) items.value = []
  } finally {
    if (current === seq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

watch(
  () => JSON.stringify(props.filters || {}),
  () => fetchPage(1),
  { immediate: true },
)

function loadMore() {
  if (loadingMore.value || loading.value) return
  fetchPage(page.value + 1)
}

function retry() {
  fetchPage(1)
}
</script>

<template>
  <div>
    <!-- 骨架 -->
    <div v-if="loading" class="divide-y">
      <div v-for="i in 6" :key="i" class="flex items-start gap-3 px-4 py-3.5">
        <Skeleton class="mt-1.5 size-2 rounded-full" />
        <div class="flex-1 space-y-2">
          <Skeleton class="h-4" :style="{ width: 55 + ((i * 13) % 30) + '%' }" />
          <Skeleton class="h-3 w-1/3" />
        </div>
      </div>
    </div>

    <!-- 出错 -->
    <div v-else-if="error" class="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <IconAlertCircle class="text-destructive size-8" />
      <p class="text-sm font-medium">加载失败</p>
      <p class="text-muted-foreground max-w-sm text-xs leading-relaxed">{{ error }}</p>
      <Button variant="outline" size="sm" class="gap-1.5" @click="retry">
        <IconRefreshCw class="size-3.5" />
        重试
      </Button>
    </div>

    <!-- 空 -->
    <Empty v-else-if="isEmpty">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconInbox />
        </EmptyMedia>
        <EmptyTitle>{{ isSearch ? '没有匹配的 issue' : '这里还没有 issue' }}</EmptyTitle>
        <EmptyDescription>
          {{ isSearch ? '换个关键词，或者清空筛选条件再看看。' : '换个筛选条件，或者直接写下第一个想法。' }}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" @click="emit('create')">新建 Issue</Button>
      </EmptyContent>
    </Empty>

    <!-- 列表 -->
    <template v-else>
      <div class="divide-y">
        <IssueListItem
          v-for="issue in items"
          :key="issue.number"
          :issue="issue"
          @open="(n) => emit('open', n)"
        />
      </div>

      <div v-if="hasMore" class="border-t p-2">
        <Button variant="ghost" size="sm" class="w-full text-xs" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? '加载中…' : '加载更多' }}
        </Button>
      </div>
      <div v-else class="border-t px-4 py-3 text-center">
        <span class="text-muted-foreground text-xs">已经到底了</span>
      </div>
    </template>
  </div>
</template>
