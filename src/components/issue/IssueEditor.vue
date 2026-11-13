<script setup>
/**
 * 新建 issue：标题 + Markdown 正文 + 标签/指派/里程碑。
 * 未登录时整块替换成登录提示，避免用户写完才被 401 打回。
 */
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { githubWriteApi } from '@/api/github'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import MarkdownEditor from '@/components/issue/MarkdownEditor.vue'
import LabelPicker from '@/components/issue/LabelPicker.vue'
import AssigneePicker from '@/components/issue/AssigneePicker.vue'
import MilestonePicker from '@/components/issue/MilestonePicker.vue'

import IconSquarePen from '~icons/lucide/square-pen'
import IconLock from '~icons/lucide/lock'
import IconLoader2 from '~icons/lucide/loader-2'
import IconTriangleAlert from '~icons/lucide/triangle-alert'

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

function resetError() {
  errorText.value = ''
  errorDetails.value = []
}

async function submit() {
  if (!store.isLoggedIn) {
    toast.error('请先登录 GitHub 后再发布 issue')
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
    const issue = await githubWriteApi.createIssue({
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
  <div v-if="!store.isLoggedIn" class="mx-auto max-w-lg">
    <div class="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
      <div class="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
        <IconLock class="size-5" />
      </div>
      <p class="text-base font-semibold text-foreground">请先登录</p>
      <p class="max-w-sm text-sm text-muted-foreground">
        发布 Issue 需要 GitHub 身份。请点击右上角的头像按钮完成登录，然后回到本页新建 Issue。
      </p>
      <Button type="button" variant="outline" size="sm" class="mt-2" @click="emit('cancel')">
        返回列表
      </Button>
    </div>
  </div>

  <div v-else class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <IconSquarePen class="size-4 text-muted-foreground" />
      <h2 class="text-base font-semibold text-foreground">新建 Issue</h2>
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
          <AssigneePicker v-model="assignees" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label class="text-xs text-muted-foreground">里程碑</Label>
          <MilestonePicker v-model="milestone" />
        </div>
      </div>
    </div>
  </div>
</template>
