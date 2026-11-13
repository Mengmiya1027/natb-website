<script setup>
/**
 * 里程碑管理面板。
 *
 * 与 LabelManageDialog 一样，作为 IssueAdminPanel 的 Tab 内容渲染，不再嵌一层 Dialog。
 * 列表用 state=all，关掉（closed）的里程碑也要能改标题 / 删掉。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { githubApi, githubWriteApi } from '@/api/github'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
} from '@/components/ui/alert-dialog'

import IconPlus from '~icons/lucide/plus'
import IconPencil from '~icons/lucide/pencil'
import IconTrash2 from '~icons/lucide/trash-2'
import IconX from '~icons/lucide/x'
import IconCheck from '~icons/lucide/check'
import IconLoader from '~icons/lucide/loader-circle'
import IconRefresh from '~icons/lucide/refresh-cw'
import IconCalendar from '~icons/lucide/calendar'

const emit = defineEmits(['changed', 'update:formOpen'])

const milestones = ref([])
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const deleting = ref(false)

/** originalNumber 为 null 表示新建 */
const formOpen = ref(false)

// 表单一打开就把状态送上去，让管理面板右栏整块滑动
watch(formOpen, (open) => emit('update:formOpen', open))

/**
 * 表单的实际挂载开关。关闭时不能立刻卸载，否则退场动画还没播完内容就没了：
 * 这里先让 v-if 保持为 true，等 300ms 的滑出 + 渐隐结束再真正卸载。
 */
const formMounted = ref(false)
let unmountTimer = 0

watch(formOpen, (open) => {
  window.clearTimeout(unmountTimer)
  if (open) {
    formMounted.value = true
    return
  }
  unmountTimer = window.setTimeout(() => {
    if (!formOpen.value) formMounted.value = false
  }, 320)
})

onBeforeUnmount(() => window.clearTimeout(unmountTimer))
const originalNumber = ref(null)
const form = ref({ title: '', description: '', due: '' })

const deleteTarget = ref(null)
const deleteOpen = computed({
  get: () => Boolean(deleteTarget.value),
  set: (open) => {
    if (!open) deleteTarget.value = null
  },
})

/** GitHub 的 due_on 是 ISO 时间戳，日期输入框只认 YYYY-MM-DD */
function toDateInput(dueOn) {
  if (!dueOn) return ''
  const day = String(dueOn).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ''
}

function toIsoDue(day) {
  return day ? `${day}T00:00:00Z` : null
}

function formatDue(dueOn) {
  const day = toDateInput(dueOn)
  return day || '无截止日期'
}

function isOverdue(milestone) {
  const day = toDateInput(milestone.due_on)
  if (!day || milestone.state === 'closed') return false
  const today = new Date()
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return day < stamp
}

function progressOf(milestone) {
  const open = milestone.open_issues || 0
  const closed = milestone.closed_issues || 0
  const total = open + closed
  return { open, closed, total, percent: total ? Math.round((closed / total) * 100) : 0 }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await githubApi.listMilestones({ state: 'all', per_page: 100 })
    milestones.value = Array.isArray(data) ? data : []
  } catch (err) {
    loadError.value = err?.message || '里程碑加载失败'
    milestones.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  originalNumber.value = null
  form.value = { title: '', description: '', due: '' }
  formOpen.value = true
}

function openEdit(milestone) {
  originalNumber.value = milestone.number
  form.value = {
    title: milestone.title || '',
    description: milestone.description || '',
    due: toDateInput(milestone.due_on),
  }
  formOpen.value = true
}

function cancelForm() {
  formOpen.value = false
  originalNumber.value = null
}

async function submit() {
  if (saving.value) return
  const title = form.value.title.trim()
  const description = form.value.description.trim()
  const dueOn = toIsoDue(form.value.due)

  if (!title) {
    toast.error('请填写里程碑标题')
    return
  }

  saving.value = true
  try {
    if (originalNumber.value) {
      await githubWriteApi.updateMilestone(originalNumber.value, { title, description, due_on: dueOn })
      toast.success(`里程碑「${title}」已更新`)
    } else {
      await githubWriteApi.createMilestone({ title, description, due_on: dueOn, state: 'open' })
      toast.success(`里程碑「${title}」已创建`)
    }
    cancelForm()
    await load()
    emit('changed')
  } catch (err) {
    const action = originalNumber.value ? '更新' : '创建'
    toast.error(`${action}里程碑失败：${err?.message || '未知错误'}`)
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target || deleting.value) return
  deleting.value = true
  try {
    await githubWriteApi.deleteMilestone(target.number)
    toast.success(`里程碑「${target.title}」已删除`)
    if (originalNumber.value === target.number) cancelForm()
    deleteTarget.value = null
    await load()
    emit('changed')
  } catch (err) {
    toast.error(`删除里程碑失败：${err?.message || '未知错误'}`)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3">
    <!-- 工具条 -->
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">
        共 {{ milestones.length }} 个里程碑（含已关闭）。进度按已完成占比计算。
      </p>
      <div class="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" :disabled="loading" title="刷新" @click="load">
          <IconRefresh class="size-4" :class="loading ? 'animate-spin' : ''" />
        </Button>
        <Button size="sm" @click="openCreate">
          <IconPlus class="size-4" />
          新建里程碑
        </Button>
      </div>
    </div>

    <!-- 列表 -->
    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      <div
        v-if="loading && !milestones.length"
        class="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground"
      >
        <IconLoader class="size-4 animate-spin" />
        正在读取里程碑…
      </div>

      <div
        v-else-if="loadError"
        class="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive"
      >
        <span>{{ loadError }}</span>
        <Button variant="outline" size="xs" @click="load">重试</Button>
      </div>

      <div
        v-else-if="!milestones.length"
        class="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
      >
        还没有里程碑，新建一个来归类 issue 吧。
      </div>

      <ul v-else class="flex flex-col gap-1.5">
        <li
          v-for="milestone in milestones"
          :key="milestone.number"
          class="rounded-lg border border-border bg-card px-3 py-2.5"
        >
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate text-sm font-medium">{{ milestone.title }}</span>
                <Badge
                  :variant="milestone.state === 'closed' ? 'secondary' : 'outline'"
                  class="text-[10px]"
                >
                  {{ milestone.state === 'closed' ? '已关闭' : '进行中' }}
                </Badge>
                <span
                  class="inline-flex items-center gap-1 text-[11px]"
                  :class="isOverdue(milestone) ? 'text-destructive' : 'text-muted-foreground'"
                >
                  <IconCalendar class="size-3" />
                  {{ formatDue(milestone.due_on) }}
                </span>
              </div>

              <p v-if="milestone.description" class="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {{ milestone.description }}
              </p>

              <!-- 进度条 -->
              <div class="mt-2 flex items-center gap-2">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary transition-all"
                    :style="{ width: progressOf(milestone).percent + '%' }"
                  />
                </div>
                <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {{ progressOf(milestone).closed }} / {{ progressOf(milestone).total }}（{{
                    progressOf(milestone).percent
                  }}%）
                </span>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon-xs" title="编辑" @click="openEdit(milestone)">
                <IconPencil class="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                class="text-destructive hover:text-destructive"
                title="删除"
                @click="deleteTarget = milestone"
              >
                <IconTrash2 class="size-3.5" />
              </Button>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- 表单投放到管理面板右栏的同级滑板，与 Tabs 整块互换位置 -->
    <Teleport to="#admin-form-slot" v-if="formMounted">
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-semibold">{{ originalNumber ? '编辑里程碑' : '新建里程碑' }}</h4>
          <Button variant="ghost" size="icon-xs" title="返回列表" @click="cancelForm">
            <IconX class="size-3.5" />
          </Button>
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div class="flex flex-col gap-1.5">
            <Label for="milestone-title">标题</Label>
            <Input
              id="milestone-title"
              v-model="form.title"
              placeholder="例如 v1.2 发布"
              maxlength="120"
              @keydown.enter.prevent="submit"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="milestone-due">截止日期</Label>
            <Input id="milestone-due" v-model="form.due" type="date" />
          </div>
        </div>

        <div class="mt-3 flex flex-col gap-1.5">
          <Label for="milestone-desc">描述</Label>
          <Textarea
            id="milestone-desc"
            v-model="form.description"
            class="min-h-16"
            placeholder="这个里程碑要解决什么（可留空）"
          />
        </div>

        <div class="mt-3 flex items-center justify-between gap-2">
          <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconCalendar class="size-3.5" />
            {{ form.due || '不设截止日期' }}
          </span>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" :disabled="saving" @click="cancelForm">取消</Button>
            <Button size="sm" class="font-semibold" :disabled="saving" @click="submit">
              <IconLoader v-if="saving" class="size-4 animate-spin" />
              <IconCheck v-else class="size-4" />
              保存
            </Button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除二次确认 -->
    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除里程碑「{{ deleteTarget?.title }}」？</AlertDialogTitle>
          <AlertDialogDescription>
            里程碑会被移除，已经关联的 issue 不会删除，只是不再归属任何里程碑。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting">取消</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive hover:bg-destructive/90 font-semibold text-white"
            :disabled="deleting"
            @click.prevent="confirmDelete"
          >
            <IconLoader v-if="deleting" class="size-4 animate-spin" />
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
