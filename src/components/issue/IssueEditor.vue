<script setup>
/**
 * 新建 issue：标题 + Markdown 正文 + 标签/指派/里程碑。
 * 未登录时整块替换成登录提示，避免用户写完才被 401 打回。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { githubApi, githubWriteApi } from '@/api/github'
import { qqWriteApi } from '@/api/qqWrite'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import MarkdownEditor from '@/components/issue/MarkdownEditor.vue'
import LabelPicker from '@/components/issue/LabelPicker.vue'
import AssigneePicker from '@/components/issue/AssigneePicker.vue'
import MilestonePicker from '@/components/issue/MilestonePicker.vue'

import IconSquarePen from '~icons/lucide/square-pen'
import IconLock from '~icons/lucide/lock'
import IconLoader2 from '~icons/lucide/loader-2'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import DisabledPicker from './DisabledPicker.vue'

const emit = defineEmits(['created', 'cancel'])

const store = useIssueStore()

const title = ref('')
const body = ref('')
const labels = ref([])
const assignees = ref([])
const milestone = ref(null)

const submitting = ref(false)
const errorText = ref('')
const errorDetails = ref([])

const titleInvalid = ref(false)

const canSubmit = computed(() => Boolean(title.value.trim()) && !submitting.value)

/** QQ 身份没有自己的 GitHub 账号，写操作走中转代发 */
const writeApi = computed(() => (store.writeMode === 'qq' ? qqWriteApi : githubWriteApi))

/** 指派是把活派给别人，属于维护者职权：按角色判断，不看用什么方式登录 */
const canAssign = computed(() => store.canManage)

/* ---------------- 前置选择带来的预填 ---------------- */

const route = useRoute()

const presetLoading = ref(true)
const preset = ref({ target: '', type: '' })

// 数据回来太快时骨架会一闪而过，强制撑满这个时长
const SKELETON_MIN_MS = 360

async function applyPreset() {
  // 只读的标签与里程碑列表，两种身份都能拉；未登录时没人能用上表单，直接跳过
  if (!store.canWrite) {
    presetLoading.value = false
    return
  }
  const startedAt = Date.now()
  try {
    const [formRes, labelsRes, milestonesRes] = await Promise.allSettled([
      fetch(import.meta.env.BASE_URL + 'json/issue-form.json', { cache: 'no-cache' }).then((res) =>
        res.ok ? res.json() : null,
      ),
      githubApi.listLabels(),
      githubApi.listMilestones({ state: 'all' }),
    ])
    const form = formRes.status === 'fulfilled' ? formRes.value : null
    const targetId = String(route.query.target || '')
    const typeIds = String(route.query.type || '').split(',').filter(Boolean)
    const picked = form?.targets?.find((item) => item.id === targetId) || null
    const typeList = (form?.types || []).filter((item) => typeIds.includes(item.id))

    // 里程碑按标题匹配：JSON 里写的是名字，创建 issue 要的是 number
    if (picked?.milestone && milestonesRes.status === 'fulfilled') {
      const match = (milestonesRes.value || []).find((item) => item.title === picked.milestone)
      if (match) milestone.value = match.number
    }
    // 标签只取仓库里真实存在的，避免创建时被 422 打回
    if (labelsRes.status === 'fulfilled') {
      const names = new Set((labelsRes.value || []).map((item) => item.name))
      labels.value = typeList.map((item) => item.label).filter((name) => name && names.has(name))
    }
    preset.value = {
      target: picked?.title || '',
      type: typeList.map((item) => item.title).join(' / '),
    }
  } finally {
    const rest = SKELETON_MIN_MS - (Date.now() - startedAt)
    if (rest > 0) await new Promise((resolve) => setTimeout(resolve, rest))
    presetLoading.value = false
  }
}

onMounted(applyPreset)

function resetError() {
  errorText.value = ''
  errorDetails.value = []
}

async function submit() {
  if (!store.canWrite) {
    toast.error(
      store.qqBanned ? '该 QQ 账号已被封禁，无法发布' : '请先登录后再发布 issue',
    )
    return
  }
  const cleanTitle = title.value.trim()
  if (!cleanTitle) {
    titleInvalid.value = true
    toast.error('标题不能为空')
    return
  }
  titleInvalid.value = false
  if (submitting.value) return

  submitting.value = true
  resetError()
  try {
    const issue = await writeApi.value.createIssue({
      title: cleanTitle,
      body: body.value,
      labels: labels.value,
      assignees: assignees.value,
      milestone: milestone.value,
    })
    toast.success('Issue 已创建')
    title.value = ''
    body.value = ''
    labels.value = []
    assignees.value = []
    milestone.value = null
    emit('created', issue?.number ?? null)
  } catch (err) {
    errorText.value = err?.message || String(err)
    const details = Array.isArray(err?.payload?.errors) ? err.payload.errors : []
    errorDetails.value = details
      .map((item) => [item.field, item.code, item.message].filter(Boolean).join(' · '))
      .filter(Boolean)
    toast.error(errorText.value)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="!store.canWrite" class="mx-auto max-w-lg">
    <div class="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
      <div class="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
        <IconLock class="size-5" />
      </div>
      <p class="text-base font-semibold text-foreground">
        {{ store.qqBanned ? '账号已被封禁' : '请先登录' }}
      </p>
      <p class="max-w-sm text-sm text-muted-foreground">
        {{
          store.qqBanned
            ? '这个 QQ 账号已被封禁，暂时不能发布内容。如有疑问请到 GitHub 仓库留言。'
            : '发布 Issue 需要身份：GitHub 账号或 QQ 邮箱都可以。点右上角的登录按钮完成登录后再回来。'
        }}
      </p>
      <Button type="button" variant="outline" size="sm" class="mt-2" @click="emit('cancel')">
        返回列表
      </Button>
    </div>
  </div>

  <!-- 进编写页先出骨架：等标签与里程碑列表到齐，表单才一次性渲染 -->
  <div v-else-if="presetLoading" class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <Skeleton class="size-4 rounded" />
      <Skeleton class="h-5 w-24" />
    </div>
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
      <div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div class="flex flex-col gap-1.5">
          <Skeleton class="h-3 w-10" />
          <Skeleton class="h-9 w-full" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Skeleton class="h-3 w-10" />
          <Skeleton class="h-[260px] w-full" />
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Skeleton class="h-8 w-16" />
          <Skeleton class="h-8 w-24" />
        </div>
      </div>
      <div class="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3 shadow-sm">
        <Skeleton class="h-3 w-16" />
        <Skeleton class="h-3 w-10" />
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-3 w-12" />
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-3 w-10" />
        <Skeleton class="h-9 w-full" />
      </div>
    </div>
  </div>

  <div v-else class="flex flex-col gap-4">
    <div class="flex min-w-0 items-center gap-2">
      <IconSquarePen class="size-4 shrink-0 text-muted-foreground" />
      <h2 class="text-base font-semibold text-foreground">新建 Issue</h2>
      <span v-if="preset.target" class="min-w-0 truncate text-xs text-muted-foreground">
        {{ preset.target }}<template v-if="preset.type"> · {{ preset.type }}</template>
        · 已自动选好里程碑与标签，可在右侧修改
      </span>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
      <div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div class="flex flex-col gap-1.5">
          <Label for="issue-new-title" class="text-xs text-muted-foreground">
            标题 <span class="text-destructive">*</span>
          </Label>
          <Input
            id="issue-new-title"
            v-model="title"
            placeholder="一句话描述问题或需求"
            :aria-invalid="titleInvalid"
            @input="titleInvalid = false"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <Label class="text-xs text-muted-foreground">正文</Label>
          <MarkdownEditor
            v-model="body"
            placeholder="描述背景、复现步骤、期望结果…"
            min-height="260px"
            @submit="submit"
          />
        </div>

        <Alert v-if="errorText" variant="destructive">
          <IconTriangleAlert />
          <AlertDescription>
            <p class="font-medium">{{ errorText }}</p>
            <ul v-if="errorDetails.length" class="mt-1 list-disc pl-4 text-xs">
              <li v-for="(detail, index) in errorDetails" :key="index">{{ detail }}</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" size="sm" :disabled="submitting" @click="emit('cancel')">
            取消
          </Button>
          <Button type="button" size="sm" :disabled="!canSubmit" @click="submit">
            <IconLoader2 v-if="submitting" class="size-4 animate-spin" />
            <span>{{ submitting ? '提交中…' : '创建 Issue' }}</span>
          </Button>
        </div>
      </div>

      <div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <p class="text-xs font-medium text-muted-foreground">可选信息</p>
        <div class="flex flex-col gap-1.5">
          <Label class="text-xs text-muted-foreground">标签</Label>
          <LabelPicker v-model="labels" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label class="text-xs text-muted-foreground">指派给</Label>
          <AssigneePicker v-if="canAssign" v-model="assignees" />
          <DisabledPicker v-else />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label class="text-xs text-muted-foreground">里程碑</Label>
          <MilestonePicker v-model="milestone" />
        </div>
      </div>
    </div>
  </div>
</template>
