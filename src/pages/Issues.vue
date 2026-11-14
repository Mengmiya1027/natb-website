<script setup>
/**
 * NATB Issue 页 —— 独立整页，路由 /issue。
 *
 * 版面结构直接沿用 shadcn-vue 官方 dashboard-01 block：
 *   SiteHeader（一条 h-14 的页头）→ SectionCards（统计卡）→ 内容卡。
 * 视觉层次依据 src/components/issue/DESIGN.md：
 *   画布下沉到 bg-muted，卡片抬到 bg-card，边界靠 border + 一层浅阴影。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import '@/styles/issue.css'
import { useIssueStore } from '@/stores/issue'
import { useAnimationStore } from '@/stores/animation'
import { clearApiCache, githubApi } from '@/api/github'
import ScrollIndicator from '@/components/issue/ScrollIndicator.vue'
import { ISSUE_REPO_FULL, ISSUE_REPO_URL } from '@/config/github'

const brandIcon = import.meta.env.BASE_URL + 'natb-icon.png'

import IssueFilters from '@/components/issue/IssueFilters.vue'
import IssueList from '@/components/issue/IssueList.vue'
import IssueDetail from '@/components/issue/IssueDetail.vue'
import IssueEditor from '@/components/issue/IssueEditor.vue'
import IssueIntakeDialog from '@/components/issue/IssueIntakeDialog.vue'
import QqBanDialog from '@/components/issue/QqBanDialog.vue'
import IssueUserMenu from '@/components/issue/IssueUserMenu.vue'
import IssueAdminPanel from '@/components/issue/IssueAdminPanel.vue'
import { Toaster } from '@/components/ui/sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import IconSun from '~icons/lucide/sun'
import IconMoon from '~icons/lucide/moon'
import IconMonitor from '~icons/lucide/monitor'
import IconSettings2 from '~icons/lucide/settings-2'
import IconPlus from '~icons/lucide/plus'
import IconShieldCheck from '~icons/lucide/shield-check'
import IconArrowLeft from '~icons/lucide/arrow-left'
import IconCircleDot from '~icons/lucide/circle-dot'
import IconTag from '~icons/lucide/tag'
import IconMilestone from '~icons/lucide/milestone'
import IconExternalLink from '~icons/lucide/external-link'
import IconGitHub from '~icons/simple-icons/github'
import IconRefreshCw from '~icons/lucide/refresh-cw'

const route = useRoute()
const router = useRouter()
const store = useIssueStore()
const anim = useAnimationStore()

const view = computed(() => {
  if (route.name === 'issue-new') return 'new'
  if (route.name === 'issue-detail') return 'detail'
  return 'list'
})
const currentNumber = computed(() => Number(route.params.number || 0))

function goList() {
  router.push('/issue')
}
function openIssue(number) {
  router.push(`/issue/${number}`)
}

/* ---------------- 仓库概览 ---------------- */

const stats = ref({ open: 0, labels: 0, milestones: 0, loaded: false })

async function loadStats() {
  const [repo, labels, milestones] = await Promise.allSettled([
    githubApi.getRepo(),
    githubApi.listLabels(),
    githubApi.listMilestones({ state: 'all' }),
  ])
  stats.value = {
    open: repo.status === 'fulfilled' ? repo.value.open_issues_count || 0 : 0,
    labels: labels.status === 'fulfilled' ? (labels.value || []).length : 0,
    milestones: milestones.status === 'fulfilled' ? (milestones.value || []).length : 0,
    loaded: true,
  }
}

/* ---------------- 筛选 ---------------- */

const filters = ref({
  state: 'open',
  labels: [],
  milestone: '',
  assignee: '',
  sort: 'created',
  direction: 'desc',
  search: '',
})

const listVersion = ref(0)
const refreshing = ref(false)
async function refreshList() {
  // 不先清缓存的话，重新请求仍会命中 60 秒内的 GET 缓存，
  // 点刷新等于什么都没发生。
  clearApiCache()
  listVersion.value += 1
  refreshing.value = true
  try {
    // 列表与上面三张统计卡一起刷新，否则只有下面的列表变化。
    await loadStats()
  } finally {
    // 请求太快时图标会一闪而过，看不出点过，兜一个最短旋转时长。
    setTimeout(() => (refreshing.value = false), 400)
  }
}

/* ---------------- 主题 ---------------- */

const THEME_CYCLE = ['system', 'light', 'dark']
const themeIcon = computed(
  () => ({ system: IconMonitor, light: IconSun, dark: IconMoon })[store.themeMode] || IconMonitor,
)
const themeLabel = computed(
  () => ({ system: '跟随系统', light: '浅色', dark: '深色' })[store.themeMode] || '跟随系统',
)

function cycleTheme() {
  store.setThemeMode(THEME_CYCLE[(THEME_CYCLE.indexOf(store.themeMode) + 1) % THEME_CYCLE.length])
}

let mediaQuery = null
function onSystemThemeChange() {
  if (store.themeMode === 'system') store.applyTheme()
}

/* ---------------- 生命周期 ---------------- */

onMounted(async () => {
  window.addEventListener('natb:issue:ratelimit', onRateLimit)
  mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
  mediaQuery?.addEventListener?.('change', onSystemThemeChange)

  /* 站点顶栏的显示由开场动画的「已落位」状态控制；
   * 直接打开 /issue 时不会经过首页动画，必须在这里主动落位，否则顶栏不出现。 */
  anim.land()
  store.applyTheme()
  await store.bootstrap()
  // QQ 令牌是另一套凭据，独立校验；失败时静默退出登录，不打扰访客
  store.refreshQq().catch(() => {})
  loadStats()
})

onBeforeUnmount(() => {
  window.removeEventListener('natb:issue:ratelimit', onRateLimit)
  mediaQuery?.removeEventListener?.('change', onSystemThemeChange)
  store.clearTheme()
})

function onRateLimit(event) {
  store.syncRate(event.detail)
}

/* ---------------- 交互 ---------------- */

const authOpen = ref(false)
const settingsOpen = ref(false)
const adminOpen = ref(false)

const intakeOpen = ref(false)
const banOpen = ref(false)

function startCreate() {
  if (!store.canWrite) {
    // 被封禁的账号再登录也没用：直接开详情框，说清楚原因和解封时间
    if (store.qqBanned) {
      banOpen.value = true
      return
    }
    toast.error('发布 issue 需要先登录（GitHub 或 QQ 邮箱）')
    authOpen.value = true
    return
  }
  // 先问清楚对哪个项目、是什么类型的问题，再进编写页
  intakeOpen.value = true
}

/* 选择结果通过 query 带到编写页，由那边负责预填里程碑与标签 */
function onIntakeConfirm({ target, types }) {
  router.push({
    name: 'issue-new',
    query: {
      target: target?.id || '',
      type: (types || []).map((item) => item.id).join(','),
    },
  })
}

function onIssueCreated(number) {
  // refreshList 已包含 loadStats，不要重复请求
  refreshList()
  if (number) openIssue(number)
  else goList()
}
</script>

<template>
  <div class="natb-issue bg-muted text-foreground min-h-svh">
    <!-- 页头：官方 SiteHeader 的骨架。
         白色页头一直顶到视口顶部，整站胶囊浮在它上面 ——
         给胶囊让位的内边距并进页头内部，而不是在页面顶部留一块灰色空隙。 -->
    <header class="bg-background sticky top-0 z-20 border-b">
      <!-- 桌面端：页头元素贴着整站胶囊左右两侧排，视觉上与胶囊连成一条；
           移动端：胶囊在左上角收成小胶囊，页头落回它下面 -->
      <div
        class="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 pt-[68px] pb-3 lg:px-6 md:h-[68px] md:pt-0 md:pb-0"
      >
        <!-- 整块（logo + 标题）点一下回 Issue 列表；里面的 GitHub 链接单独 stop -->
        <div
          class="flex min-w-0 items-center gap-3"
          :class="view === 'list' ? '' : 'cursor-pointer'"
          :title="view === 'list' ? undefined : '返回 Issue 列表'"
          @click="view !== 'list' && goList()"
        >
          <Button
            v-if="view === 'new'"
            variant="ghost"
            size="icon"
            class="hover:bg-foreground/10 hover:text-foreground size-8 shrink-0 transition-colors duration-150"
            @click="goList"
          >
            <IconArrowLeft class="size-[18px]" />
          </Button>

          <img :src="brandIcon" alt="NATB" class="size-8 shrink-0 rounded-md" />

          <!-- 详情页把标题拆成面包屑：Issues ｜ #12 -->
          <div class="flex min-w-0 items-center gap-2">
            <h1 class="text-2xl font-bold tracking-tight whitespace-nowrap">
              {{ view === 'new' ? '新建 Issue' : 'Issues' }}
            </h1>
            <Separator
              v-if="view === 'detail'"
              orientation="vertical"
              class="hidden data-[orientation=vertical]:h-5 sm:block"
            />
            <span
              v-if="view === 'detail'"
              class="text-2xl font-bold tracking-tight whitespace-nowrap"
            >
              #{{ currentNumber }}
            </span>
          </div>

          <Separator
            orientation="vertical"
            class="mx-1 hidden data-[orientation=vertical]:h-5 sm:block"
          />
          <a
            :href="ISSUE_REPO_URL"
            target="_blank"
            rel="noopener"
            class="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-sm transition-colors"
            :title="ISSUE_REPO_FULL"
            @click.stop
          >
            <IconGitHub class="size-[18px]" />
          </a>
        </div>

        <!-- 左侧贴左、右侧贴右，悬浮的整站胶囊占中间的自然留白 -->
        <div class="ml-auto flex items-center gap-1">
          <TooltipProvider :delay-duration="300">
            <Tooltip v-if="store.canManage">
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" class="size-8" @click="adminOpen = true">
                  <IconShieldCheck class="size-[18px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>管理系统</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" class="size-8" @click="cycleTheme">
                  <component :is="themeIcon" class="size-[18px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ themeLabel }}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" class="size-8" @click="settingsOpen = true">
                  <IconSettings2 class="size-[18px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>连接设置</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" class="size-8" as-child>
                  <a :href="ISSUE_REPO_URL" target="_blank" rel="noopener">
                    <IconExternalLink class="size-[18px]" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>在 GitHub 打开</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <IssueUserMenu v-model:auth-open="authOpen" v-model:settings-open="settingsOpen" />

          <!-- 尺寸严格对齐 shadcn-vue 官方 Button：h-8 / px-2.5 / gap-1.5 / text-sm -->
          <Button size="sm" class="ml-2 h-8 gap-1.5 px-2.5 text-sm whitespace-nowrap" @click="startCreate">
            <IconPlus class="size-4" />
            新建 Issue
          </Button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
      <!-- SectionCards：官方 dashboard block 的统计卡区 -->
      <div v-if="view === 'list'" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <!-- 左：标题 + 说明；右：大号数字上下居中靠右。高度锁定 130px 与改版前一致 -->
        <Card class="h-[130px] gap-1.5 py-5 shadow-xs">
          <CardContent class="flex flex-1 items-center justify-between gap-4 pr-9 pl-5">
            <div class="min-w-0">
              <div class="text-foreground flex items-center gap-2 text-base font-semibold">
                <IconCircleDot class="size-4 shrink-0" />
                未关闭
              </div>
              <p class="text-muted-foreground mt-1 text-sm">处于 Open 状态的 issue</p>
            </div>
            <div class="shrink-0 text-5xl font-bold tracking-tight tabular-nums">
              <!-- 刷新时数字位换成骨架条，和下面列表的加载态同一套语言 -->
              <Skeleton v-if="!stats.loaded || refreshing" class="bg-foreground/15 h-10 w-12" />
              <template v-else>{{ stats.open }}</template>
            </div>
          </CardContent>
        </Card>

        <!-- 左：标题 + 说明；右：大号数字上下居中靠右。高度锁定 130px 与改版前一致 -->
        <Card class="h-[130px] gap-1.5 py-5 shadow-xs">
          <CardContent class="flex flex-1 items-center justify-between gap-4 pr-9 pl-5">
            <div class="min-w-0">
              <div class="text-foreground flex items-center gap-2 text-base font-semibold">
                <IconTag class="size-4 shrink-0" />
                标签
              </div>
              <p class="text-muted-foreground mt-1 text-sm">仓库可用的分类标签</p>
            </div>
            <div class="shrink-0 text-5xl font-bold tracking-tight tabular-nums">
              <!-- 刷新时数字位换成骨架条，和下面列表的加载态同一套语言 -->
              <Skeleton v-if="!stats.loaded || refreshing" class="bg-foreground/15 h-10 w-12" />
              <template v-else>{{ stats.labels }}</template>
            </div>
          </CardContent>
        </Card>

        <!-- 左：标题 + 说明；右：大号数字上下居中靠右。高度锁定 130px 与改版前一致 -->
        <Card class="h-[130px] gap-1.5 py-5 shadow-xs">
          <CardContent class="flex flex-1 items-center justify-between gap-4 pr-9 pl-5">
            <div class="min-w-0">
              <div class="text-foreground flex items-center gap-2 text-base font-semibold">
                <IconMilestone class="size-4 shrink-0" />
                里程碑
              </div>
              <p class="text-muted-foreground mt-1 text-sm">按版本归拢的计划</p>
            </div>
            <div class="shrink-0 text-5xl font-bold tracking-tight tabular-nums">
              <!-- 刷新时数字位换成骨架条，和下面列表的加载态同一套语言 -->
              <Skeleton v-if="!stats.loaded || refreshing" class="bg-foreground/15 h-10 w-12" />
              <template v-else>{{ stats.milestones }}</template>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- 内容卡 -->
      <Card v-if="view === 'list'" class="mt-4 gap-0 overflow-hidden py-0 shadow-xs">
        <!-- 卡片头：与 dashboard 的流水列表同构（标题 + 说明 + 右侧操作） -->
        <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
          <div class="space-y-1">
            <h2 class="text-lg font-semibold tracking-tight">Issues</h2>
            <p class="text-muted-foreground text-sm">
              共 {{ stats.loaded ? stats.open : '—' }} 条未关闭 · {{ filters.search ? '搜索结果按相关度排序' : '按最近活动排列' }}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="h-8 gap-1.5 px-2.5"
            :disabled="refreshing"
            @click="refreshList()"
          >
            <IconRefreshCw class="size-3.5" :class="refreshing ? 'animate-spin' : ''" />
            刷新
          </Button>
        </div>

        <div class="border-b px-4 py-3">
          <IssueFilters v-model="filters" :stats="stats" />
        </div>
        <IssueList
          :key="'list-' + listVersion"
          :filters="filters"
          @open="openIssue"
          @create="startCreate"
        />
      </Card>

      <IssueDetail
        v-else-if="view === 'detail'"
        :key="'detail-' + currentNumber"
        :number="currentNumber"
        @back="goList"
        @changed="refreshList"
        @open="openIssue"
      />

      <IssueEditor v-else-if="view === 'new'" @created="onIssueCreated" @cancel="goList" />

      <IssueAdminPanel v-if="adminOpen" @close="adminOpen = false" />
    </main>

    <!-- 桌面页头实测 69px（68 + 1px 边框），toast 必须落在它下方，否则会跟
         固定胶囊和页头叠在一起。配色走 shadcn 的中性浮层，不用 rich-colors
         的彩色底。关闭按钮留在 sonner 默认的左上角，状态图标由 issue.css
         移到右侧的浅灰圆角块里。见 DESIGN.md 4.1 / 4.3。 -->
    <Toaster
      position="top-center"
      close-button
      :offset="{ top: '84px' }"
      :mobile-offset="{ top: '136px' }"
    />

    <!-- 新建 Issue 的前置选择：反馈对象 → 反馈类型 -->
    <IssueIntakeDialog v-model:open="intakeOpen" @confirm="onIntakeConfirm" />
    <QqBanDialog v-model:open="banOpen" />

    <!-- 页面滚动条改成浮在内容上的指示条，不再占横向空间 -->
    <ScrollIndicator />
  </div>
</template>