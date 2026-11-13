<script setup>
/**
 * Issue 筛选工具栏（横向一条，放在列表卡片顶部）。
 *
 * 结构参考 shadcn-vue 的 dashboard block：状态用 Tabs，条件收进 Popover，
 * 搜索用 InputGroup，排序用 Select —— 不再用一整列竖排表单。
 *
 * props/emits 契约不变：modelValue 是完整筛选对象，任何改动整体回写。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { githubApi } from '@/api/github'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import IconSearch from '~icons/lucide/search'
import IconSlidersHorizontal from '~icons/lucide/sliders-horizontal'
import IconX from '~icons/lucide/x'
import IconLoader from '~icons/lucide/loader-circle'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  stats: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue'])

const DEFAULTS = {
  state: 'open',
  labels: [],
  milestone: '',
  assignee: '',
  sort: 'created',
  direction: 'desc',
  search: '',
}

const value = computed(() => ({ ...DEFAULTS, ...(props.modelValue || {}) }))

function patch(part) {
  emit('update:modelValue', { ...value.value, ...part })
}

/* ---------------- 选项数据 ---------------- */

const labels = ref([])
const milestones = ref([])
const assignees = ref([])
const loadingOptions = ref(false)

async function loadOptions() {
  loadingOptions.value = true
  const [l, m, a] = await Promise.allSettled([
    githubApi.listLabels(),
    githubApi.listMilestones({ state: 'all' }),
    githubApi.listAssignableUsers(),
  ])
  if (l.status === 'fulfilled') labels.value = l.value || []
  if (m.status === 'fulfilled') milestones.value = m.value || []
  if (a.status === 'fulfilled') assignees.value = a.value || []
  loadingOptions.value = false
}

onMounted(loadOptions)

/* ---------------- 搜索（防抖） ---------------- */

const searchInput = ref(value.value.search || '')
let searchTimer = 0

watch(
  () => value.value.search,
  (next) => {
    if (next !== searchInput.value) searchInput.value = next || ''
  },
)

function onSearchInput(next) {
  searchInput.value = next
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => patch({ search: next.trim() }), 300)
}

/* ---------------- 标签 ---------------- */

const labelOpen = ref(false)

function toggleLabel(name) {
  const current = value.value.labels || []
  const next = current.includes(name) ? current.filter((x) => x !== name) : [...current, name]
  patch({ labels: next })
}

function clearLabel(name) {
  patch({ labels: (value.value.labels || []).filter((x) => x !== name) })
}

/* ---------------- 里程碑 / 指派 ---------------- */

const milestoneModel = computed({
  get: () => (value.value.milestone === '' || value.value.milestone == null ? 'all' : String(value.value.milestone)),
  set: (v) => patch({ milestone: v === 'all' ? '' : Number(v) }),
})

const assigneeModel = computed({
  get: () => value.value.assignee || 'all',
  set: (v) => patch({ assignee: v === 'all' ? '' : v }),
})

const sortModel = computed({
  get: () => `${value.value.sort}:${value.value.direction}`,
  set: (v) => {
    const [sort, direction] = v.split(':')
    patch({ sort, direction })
  },
})

/* ---------------- 重置 ---------------- */

const activeFilterCount = computed(() => {
  let n = 0
  if (value.value.labels?.length) n += value.value.labels.length
  if (value.value.milestone !== '' && value.value.milestone != null) n += 1
  if (value.value.assignee) n += 1
  if (value.value.search) n += 1
  return n
})

function resetAll() {
  searchInput.value = ''
  emit('update:modelValue', { ...DEFAULTS })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- 第一行：状态 + 搜索 + 条件 + 排序 -->
    <div class="flex flex-wrap items-center gap-2">
      <Tabs :model-value="value.state" @update:model-value="(v) => patch({ state: v })">
        <TabsList class="h-9">
          <TabsTrigger value="open" class="gap-1.5 px-3.5 text-sm">
            Open
            <Badge v-if="stats.open" variant="secondary" class="h-4 px-1 text-[10px]">{{ stats.open }}</Badge>
          </TabsTrigger>
          <TabsTrigger value="closed" class="px-3.5 text-sm">Closed</TabsTrigger>
          <TabsTrigger value="all" class="px-3.5 text-sm">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <div class="relative min-w-[180px] flex-1">
        <IconSearch class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          :model-value="searchInput"
          placeholder="搜索标题或正文…"
          class="h-9 pl-9 text-sm"
          @update:model-value="onSearchInput"
        />
      </div>

      <Popover v-model:open="labelOpen">
        <PopoverTrigger as-child>
          <Button variant="outline" class="h-9 gap-1.5 text-sm">
            <IconSlidersHorizontal class="size-4" />
            标签
            <Badge v-if="value.labels?.length" class="h-4 px-1 text-[10px]">{{ value.labels.length }}</Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" class="w-64 p-0">
          <div class="flex items-center justify-between px-3 py-2">
            <span class="text-xs font-medium">按标签筛选</span>
            <Button v-if="value.labels?.length" variant="ghost" size="sm" class="h-6 px-1.5 text-[11px]" @click="patch({ labels: [] })">
              清空
            </Button>
          </div>
          <Separator />
          <ScrollArea class="max-h-64">
            <div v-if="loadingOptions" class="text-muted-foreground flex items-center gap-2 px-3 py-4 text-xs">
              <IconLoader class="size-3.5 animate-spin" />
              加载中…
            </div>
            <div v-else-if="!labels.length" class="text-muted-foreground px-3 py-4 text-xs">这个仓库还没有标签</div>
            <div v-else class="flex flex-col p-1.5">
              <label
                v-for="label in labels"
                :key="label.name"
                class="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs"
              >
                <Checkbox
                  :model-value="value.labels?.includes(label.name)"
                  @update:model-value="() => toggleLabel(label.name)"
                />
                <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: '#' + label.color }"></span>
                <span class="truncate">{{ label.name }}</span>
              </label>
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Select v-model="milestoneModel">
        <SelectTrigger class="h-9 w-auto min-w-[130px] gap-1.5 text-sm">
          <SelectValue placeholder="里程碑" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="all">全部里程碑</SelectItem>
          <SelectItem v-for="m in milestones" :key="m.number" :value="String(m.number)">
            {{ m.title }}
          </SelectItem>
        </SelectContent>
      </Select>

      <Select v-model="assigneeModel">
        <SelectTrigger class="h-9 w-auto min-w-[120px] gap-1.5 text-sm">
          <SelectValue placeholder="指派" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="all">全部成员</SelectItem>
          <SelectItem v-for="u in assignees" :key="u.login" :value="u.login">{{ u.login }}</SelectItem>
        </SelectContent>
      </Select>

      <Select v-model="sortModel">
        <SelectTrigger class="h-9 w-auto min-w-[120px] gap-1.5 text-sm">
          <SelectValue placeholder="排序" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="created:desc">最新创建</SelectItem>
          <SelectItem value="created:asc">最早创建</SelectItem>
          <SelectItem value="updated:desc">最近更新</SelectItem>
          <SelectItem value="comments:desc">评论最多</SelectItem>
        </SelectContent>
      </Select>

      <Button v-if="activeFilterCount" variant="ghost" class="h-9 gap-1 text-sm" @click="resetAll">
        <IconX class="size-3.5" />
        重置
      </Button>
    </div>

    <!-- 第二行：已选条件 -->
    <div v-if="value.labels?.length || value.search" class="flex flex-wrap items-center gap-1.5">
      <span class="text-muted-foreground text-xs">已筛选：</span>
      <Badge
        v-for="name in value.labels"
        :key="name"
        variant="secondary"
        class="h-5 gap-1 px-1.5 text-[11px] font-normal"
      >
        {{ name }}
        <button type="button" class="hover:text-foreground" @click="clearLabel(name)">
          <IconX class="size-3" />
        </button>
      </Badge>
      <Badge v-if="value.search" variant="secondary" class="h-5 gap-1 px-1.5 text-[11px] font-normal">
        “{{ value.search }}”
        <button type="button" class="hover:text-foreground" @click="onSearchInput(''); patch({ search: '' })">
          <IconX class="size-3" />
        </button>
      </Badge>
    </div>
  </div>
</template>
