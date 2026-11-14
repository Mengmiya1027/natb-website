<script setup>
/**
 * 仓库管理面板（issue-admin）。
 *
 * 宿主 Issues.vue 只在 store.canManage 为真时挂载本组件，所以这里不负责「能不能打开」；
 * 但权限可能在面板打开期间被注销或降级，因此仍保留一条无权限说明的首屏兜底。
 *
 * 三个 Tab：
 *   标签管理   -> LabelManageDialog（面板形态，自己拉取 / 增删改）
 *   里程碑管理 -> MilestoneManageDialog（同上）
 *   批量操作   -> 对当前 open issue 批量关闭 / 重开 / 加标签
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { clearApiCache, githubApi, githubWriteApi } from '@/api/github'
import { ISSUE_REPO_FULL, ISSUE_REPO_URL } from '@/config/github'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import LabelManageDialog from './LabelManageDialog.vue'
import UserBanPanel from './UserBanPanel.vue'
import MilestoneManageDialog from './MilestoneManageDialog.vue'

import IconTag from '~icons/lucide/tag'
import IconFlag from '~icons/lucide/flag'
import IconCircleDot from '~icons/lucide/circle-dot'
import IconExternalLink from '~icons/lucide/external-link'
import IconLoader from '~icons/lucide/loader-circle'
import IconRefresh from '~icons/lucide/refresh-cw'
import IconCheckCircle from '~icons/lucide/check-circle'
import IconRotateCcw from '~icons/lucide/rotate-ccw'
import IconTags from '~icons/lucide/tags'
import IconUsers from '~icons/lucide/users'

const emit = defineEmits(['close'])

const store = useIssueStore()

const tab = ref('labels')

/**
 * 批量操作里「选择标签」下拉的最大高度：
 * 取 Issue 页头下沿到选择框顶部之间的距离，超出的选项交给下拉自身滚动。
 */
const batchLabelOpen = ref(false)
const batchLabelTriggerRef = ref(null)
const batchLabelMaxHeight = ref(280)

function measureBatchLabelSpace() {
  const el = batchLabelTriggerRef.value?.$el || batchLabelTriggerRef.value
  if (!el?.getBoundingClientRect) return
  const top = el.getBoundingClientRect().top
  const headerBottom = Math.max(
    0,
    ...[...document.querySelectorAll('header')].map((h) => h.getBoundingClientRect().bottom),
  )
  batchLabelMaxHeight.value = Math.max(160, Math.round(top - headerBottom))
}

watch(batchLabelOpen, (open) => {
  if (open) measureBatchLabelSpace()
})

/** 子组件把「新建表单是否打开」送上来，右栏据此整块横向滑动 */
const labelFormOpen = ref(false)
const milestoneFormOpen = ref(false)
const sheetOpen = computed(() => labelFormOpen.value || milestoneFormOpen.value)

/** 面板由宿主控制挂载，内部恒为打开；任何关闭请求都交回宿主 */
/**
 * 弹层自身维护开关：关闭时先把 open 置 false 让 reka-ui 播退场动画，
 * 等动画播完再通知宿主卸载。之前写死 :open="true" 并立即 emit('close')，
 * 父组件的 v-if 会当场销毁整个组件，动画来不及出现。
 */
const dialogOpen = ref(true)
let closeTimer = 0

function onOpenChange(open) {
  dialogOpen.value = open
  if (open) return
  window.clearTimeout(closeTimer)
  closeTimer = window.setTimeout(() => emit('close'), 240)
}

onBeforeUnmount(() => window.clearTimeout(closeTimer))

/* ---------------- 仓库概览 ---------------- */

const overview = ref({ loading: true, error: '', open: 0, labels: 0, milestones: 0 })
const labels = ref([])

const statCards = computed(() => [
  { key: 'open', label: '未关闭 issue', icon: IconCircleDot, value: overview.value.open },
  { key: 'labels', label: '标签', icon: IconTag, value: overview.value.labels },
  { key: 'milestones', label: '里程碑', icon: IconFlag, value: overview.value.milestones },
])

async function loadOverview() {
  // 手动刷新 / 重试要拿最新数据，先作废存在 60 秒的 GET 缓存
  clearApiCache()
  overview.value.loading = true
  overview.value.error = ''
  try {
    const [repo, labelList, milestoneList] = await Promise.all([
      githubApi.getRepo(),
      githubApi.listLabels({ per_page: 100 }),
      githubApi.listMilestones({ state: 'all', per_page: 100 }),
    ])
    labels.value = Array.isArray(labelList) ? labelList : []
    overview.value = {
      loading: false,
      error: '',
      // open_issues_count 含未关闭的 PR，GitHub 侧的计数口径如此，这里只做概览
      open: repo?.open_issues_count ?? 0,
      labels: labels.value.length,
      milestones: Array.isArray(milestoneList) ? milestoneList.length : 0,
    }
  } catch (err) {
    overview.value = {
      ...overview.value,
      loading: false,
      error: err?.message || '仓库概览加载失败',
    }
  }
}

/* ---------------- 批量操作 ---------------- */

const issues = ref([])
const issuesLoading = ref(false)
const issuesError = ref('')
const selectedNumbers = ref([])
const batchLabel = ref('')

const BATCH_KINDS = { close: '批量关闭', reopen: '批量重开', label: '批量加标签' }
const batch = ref({ running: false, label: '', done: 0, total: 0 })
const batchPercent = computed(() =>
  batch.value.total ? Math.round((batch.value.done / batch.value.total) * 100) : 0,
)

const allSelected = computed(
  () => issues.value.length > 0 && selectedNumbers.value.length === issues.value.length,
)
const selectedCount = computed(() => selectedNumbers.value.length)

async function loadIssues() {
  clearApiCache()
  issuesLoading.value = true
  issuesError.value = ''
  try {
    // 只取第一批 100 条 open issue，翻页交给列表页
    const data = await githubApi.listIssues({
      state: 'open',
      sort: 'created',
      direction: 'desc',
      page: 1,
      per_page: 100,
    })
    const items = (Array.isArray(data) ? data : []).filter((item) => !item.pull_request)
    issues.value = items
    const alive = new Set(items.map((item) => item.number))
    selectedNumbers.value = selectedNumbers.value.filter((number) => alive.has(number))
  } catch (err) {
    issuesError.value = err?.message || 'issue 列表加载失败'
    issues.value = []
    selectedNumbers.value = []
  } finally {
    issuesLoading.value = false
  }
}

function isSelected(number) {
  return selectedNumbers.value.includes(number)
}

function toggleIssue(number) {
  if (isSelected(number)) selectedNumbers.value = selectedNumbers.value.filter((n) => n !== number)
  else selectedNumbers.value = [...selectedNumbers.value, number]
}

function toggleAll() {
  selectedNumbers.value = allSelected.value ? [] : issues.value.map((item) => item.number)
}

async function runBatch(kind) {
  if (batch.value.running) return
  const numbers = [...selectedNumbers.value]
  if (!numbers.length) {
    toast.error('请先勾选要操作的 issue')
    return
  }
  const labelName = batchLabel.value
  if (kind === 'label' && !labelName) {
    toast.error('请先选择要添加的标签')
    return
  }

  batch.value = { running: true, label: BATCH_KINDS[kind], done: 0, total: numbers.length }
  const byNumber = new Map(issues.value.map((item) => [item.number, item]))
  const failed = []

  for (const number of numbers) {
    try {
      if (kind === 'close') {
        await githubWriteApi.closeIssue(number, 'completed')
      } else if (kind === 'reopen') {
        await githubWriteApi.reopenIssue(number)
      } else {
        const current = (byNumber.get(number)?.labels || []).map((label) => label.name)
        const next = current.includes(labelName) ? current : [...current, labelName]
        await githubWriteApi.setLabels(number, next)
      }
    } catch (err) {
      failed.push({ number, message: err?.message || '执行失败' })
    } finally {
      batch.value.done += 1
    }
  }

  const okCount = numbers.length - failed.length
  if (!failed.length) {
    toast.success(`${batch.value.label}完成：${okCount} 条全部成功`)
  } else {
    const head = failed.slice(0, 5).map((item) => '#' + item.number).join('、')
    const more = failed.length > 5 ? ' 等' : ''
    toast.error(`${batch.value.label}：成功 ${okCount} 条，失败 ${failed.length} 条（${head}${more}）`)
  }

  batch.value.running = false
  selectedNumbers.value = []
  await loadIssues()
  loadOverview()
}

onMounted(() => {
  loadOverview()
  loadIssues()
})
</script>

<template>
  <Dialog :open="dialogOpen" @update:open="onOpenChange">
    <DialogContent
      class="flex h-[min(60vh,520px)] w-[min(760px,92vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
    >
      <!-- 头部 -->
      <div class="flex items-start justify-between gap-3 border-b border-border px-6 py-4 pr-14">
        <div class="min-w-0">
          <DialogTitle class="text-base">仓库管理</DialogTitle>
          <DialogDescription class="mt-1 text-xs">
            {{ ISSUE_REPO_FULL }} · 标签、里程碑与批量操作只对 write 及以上权限开放
          </DialogDescription>
        </div>
        <a
          :href="ISSUE_REPO_URL"
          target="_blank"
          rel="noopener"
          class="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          在 GitHub 打开
          <IconExternalLink class="size-3" />
        </a>
      </div>

      <!-- 无权限兜底 -->
      <div v-if="!store.canManage" class="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p class="text-sm font-medium">当前账号没有这个仓库的管理权限</p>
        <p class="max-w-md text-xs text-muted-foreground">
          标签、里程碑与批量操作需要仓库的 write 及以上权限。请用有权限的账号登录，或联系仓库维护者。
        </p>
      </div>

      <div v-else class="flex min-h-0 flex-1 gap-5 px-6 py-4">
        <!-- 左栏：概览卡竖排 -->
        <div class="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
          <div
            v-for="card in statCards"
            :key="card.key"
            class="flex flex-1 flex-col justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-3"
          >
            <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <component :is="card.icon" class="size-3.5" />
              {{ card.label }}
            </div>
            <div class="text-3xl leading-none font-semibold tracking-tight tabular-nums">
              <IconLoader v-if="overview.loading" class="size-4 animate-spin text-muted-foreground" />
              <span v-else>{{ card.value }}</span>
            </div>
          </div>

          <div
            v-if="overview.error"
            class="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive"
          >
            <span>{{ overview.error }}</span>
            <Button variant="outline" size="xs" @click="loadOverview">重试</Button>
          </div>
        </div>

        <!-- 右栏滑板：Tabs 整块左移出视口，新建板块从右侧滑入，两者同级 -->
        <div class="relative flex min-h-0 flex-1 overflow-hidden">
          <!-- Tailwind v4 的 translate-x-* 走的是独立 translate 属性，
               只写 transform 的话位移不参与过渡，会变成瞬间跳变 -->
          <div
            class="absolute inset-0 flex flex-col transition-[transform,translate,opacity] duration-300 ease-[ease]"
            :class="sheetOpen ? '-translate-x-full opacity-0' : 'translate-x-0 opacity-100'"
          >
            <Tabs v-model="tab" class="flex min-h-0 flex-1 flex-col">
          <TabsList class="grid w-full grid-cols-4">
            <TabsTrigger value="labels">
              <IconTag class="size-4" />
              标签
            </TabsTrigger>
            <TabsTrigger value="milestones">
              <IconFlag class="size-4" />
              里程碑
            </TabsTrigger>
            <TabsTrigger value="issues">
              <IconTags class="size-4" />
              批量
            </TabsTrigger>
            <TabsTrigger value="users">
              <IconUsers class="size-4" />
              用户
            </TabsTrigger>
          </TabsList>

          <TabsContent value="labels" class="mt-2 min-h-0 flex-1 overflow-hidden">
            <LabelManageDialog
              @changed="loadOverview"
              @update:form-open="labelFormOpen = $event"
            />
          </TabsContent>

          <TabsContent value="milestones" class="mt-2 min-h-0 flex-1 overflow-hidden">
            <MilestoneManageDialog
              @changed="loadOverview"
              @update:form-open="milestoneFormOpen = $event"
            />
          </TabsContent>

          <TabsContent value="users" class="mt-2 min-h-0 flex-1 overflow-hidden">
            <UserBanPanel />
          </TabsContent>

          <TabsContent value="issues" class="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
            <div class="flex flex-col gap-3">
              <!-- 工具条 -->
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <div class="flex items-center gap-2">
                    <Checkbox :model-value="allSelected" @update:model-value="toggleAll" />
                    <span class="text-xs text-muted-foreground">
                      已选 {{ selectedCount }} / 共 {{ issues.length }} 条（只列前 100 条未关闭 issue）
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" :disabled="issuesLoading" title="刷新" @click="loadIssues">
                    <IconRefresh class="size-4" :class="issuesLoading ? 'animate-spin' : ''" />
                  </Button>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <div class="flex items-center gap-2">
                    <Select v-model="batchLabel" v-model:open="batchLabelOpen">
                      <SelectTrigger ref="batchLabelTriggerRef" size="sm" class="w-[150px]">
                        <SelectValue placeholder="选择标签" />
                      </SelectTrigger>
                      <SelectContent :style="{ maxHeight: batchLabelMaxHeight + 'px' }">
                        <SelectItem v-for="label in labels" :key="label.name" :value="label.name">
                          <span
                            class="size-2 shrink-0 rounded-full"
                            :style="{ backgroundColor: '#' + label.color }"
                          />
                          {{ label.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      :disabled="batch.running"
                      @click="runBatch('label')"
                    >
                      <IconTags class="size-4" />
                      加标签
                    </Button>
                  </div>

                  <Separator orientation="vertical" class="h-5" />

                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="batch.running"
                    @click="runBatch('close')"
                  >
                    <IconCheckCircle class="size-4" />
                    批量关闭
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="batch.running"
                    @click="runBatch('reopen')"
                  >
                    <IconRotateCcw class="size-4" />
                    批量重开
                  </Button>
                </div>
              </div>

              <!-- 进度 -->
              <div v-if="batch.running" class="flex items-center gap-3 text-xs text-muted-foreground">
                <IconLoader class="size-4 animate-spin" />
                <span class="shrink-0">{{ batch.label }}中</span>
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary transition-all"
                    :style="{ width: batchPercent + '%' }"
                  />
                </div>
                <span class="shrink-0 tabular-nums">{{ batch.done }} / {{ batch.total }}</span>
              </div>

              <!-- 错误 / 空态 -->
              <div
                v-if="issuesError"
                class="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <span>{{ issuesError }}</span>
                <Button variant="outline" size="xs" @click="loadIssues">重试</Button>
              </div>

              <div
                v-else-if="issuesLoading && !issues.length"
                class="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground"
              >
                <IconLoader class="size-4 animate-spin" />
                正在读取未关闭的 issue…
              </div>

              <div
                v-else-if="!issues.length"
                class="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
              >
                当前没有未关闭的 issue。
              </div>

              <!-- 列表 -->
              <ul v-else class="flex flex-col gap-1.5">
                <li
                  v-for="issue in issues"
                  :key="issue.number"
                  class="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                  :class="isSelected(issue.number) ? 'ring-1 ring-ring/40' : ''"
                >
                  <div
                    class="mt-0.5 flex cursor-pointer items-center"
                    @click="toggleIssue(issue.number)"
                  >
                    <Checkbox :model-value="isSelected(issue.number)" />
                  </div>
                  <div class="min-w-0 flex-1" @click="toggleIssue(issue.number)">
                    <div class="flex items-baseline gap-2">
                      <span class="shrink-0 font-mono text-[11px] text-muted-foreground">#{{ issue.number }}</span>
                      <span class="truncate text-sm">{{ issue.title }}</span>
                    </div>
                    <div v-if="issue.labels?.length" class="mt-1 flex flex-wrap gap-1">
                      <Badge
                        v-for="label in issue.labels"
                        :key="label.id || label.name"
                        variant="outline"
                        class="text-[10px]"
                      >
                        {{ label.name }}
                      </Badge>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </TabsContent>
            </Tabs>
          </div>

          <!-- 新建板块：与 Tabs 同级，滑到右栏占满 -->
          <div
            class="absolute inset-0 overflow-y-auto pr-1 transition-[transform,translate,opacity] duration-300 ease-[ease]"
            :class="sheetOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'"
          >
            <div id="admin-form-slot"></div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
