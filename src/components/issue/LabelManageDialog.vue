<script setup>
/**
 * 标签管理面板。
 *
 * 由 IssueAdminPanel 的「标签管理」Tab 直接当作内容渲染，本身不再套一层 Dialog：
 * 外层已经是模态框，再嵌一层会让遮罩叠两层、焦点在两个 portal 之间抢。
 * 列表与增删改成功后通过 changed 事件让上层刷新仓库概览。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { githubApi, githubWriteApi } from '@/api/github'

import { Button } from '@/components/ui/button'
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

const emit = defineEmits(['changed', 'update:formOpen'])

/** GitHub issue 官方 label 的常见配色，点一下就换色 */
const PRESET_COLORS = [
  'd73a4a', '0075ca', 'cfd3d7', 'a2eeef', '7057ff', '008672',
  'e4e669', 'd876e3', '0e8a16', 'fbca04', 'bfd4f2', 'f9d0c4',
]

const labels = ref([])
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const deleting = ref(false)

/** 表单打开时表示「新建」还是「编辑」：originalName 为空即新建 */
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
const originalName = ref('')
const form = ref({ name: '', color: '0075ca', description: '' })

const deleteTarget = ref(null)
const deleteOpen = computed({
  get: () => Boolean(deleteTarget.value),
  set: (open) => {
    if (!open) deleteTarget.value = null
  },
})

function normalizeColor(value) {
  const raw = String(value || '').trim().replace(/^#/, '').toLowerCase()
  return /^[0-9a-f]{6}$/.test(raw) ? raw : ''
}

function swatchStyle(color) {
  const hex = normalizeColor(color) || 'cfd3d7'
  return { backgroundColor: '#' + hex }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await githubApi.listLabels({ per_page: 100 })
    labels.value = Array.isArray(data) ? data : []
  } catch (err) {
    loadError.value = err?.message || '标签加载失败'
    labels.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  originalName.value = ''
  form.value = { name: '', color: '0075ca', description: '' }
  formOpen.value = true
}

function openEdit(label) {
  originalName.value = label.name
  form.value = {
    name: label.name,
    color: normalizeColor(label.color) || 'cfd3d7',
    description: label.description || '',
  }
  formOpen.value = true
}

function cancelForm() {
  formOpen.value = false
  originalName.value = ''
}

function onColorInput(event) {
  const hex = normalizeColor(event.target.value)
  if (hex) form.value.color = hex
}

async function submit() {
  if (saving.value) return
  const name = form.value.name.trim()
  const color = normalizeColor(form.value.color)
  const description = form.value.description.trim()

  if (!name) {
    toast.error('请填写标签名称')
    return
  }
  if (!color) {
    toast.error('颜色必须是 6 位十六进制，例如 d73a4a')
    return
  }

  saving.value = true
  try {
    if (originalName.value) {
      const patch = { color, description }
      if (name !== originalName.value) patch.new_name = name
      await githubWriteApi.updateLabel(originalName.value, patch)
      toast.success(`标签「${name}」已更新`)
    } else {
      await githubWriteApi.createLabel({ name, color, description })
      toast.success(`标签「${name}」已创建`)
    }
    cancelForm()
    await load()
    emit('changed')
  } catch (err) {
    const action = originalName.value ? '更新' : '创建'
    toast.error(`${action}标签失败：${err?.message || '未知错误'}`)
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target || deleting.value) return
  deleting.value = true
  try {
    await githubWriteApi.deleteLabel(target.name)
    toast.success(`标签「${target.name}」已删除`)
    if (originalName.value === target.name) cancelForm()
    deleteTarget.value = null
    await load()
    emit('changed')
  } catch (err) {
    toast.error(`删除标签失败：${err?.message || '未知错误'}`)
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
        共 {{ labels.length }} 个标签。标签颜色是仓库配置，对所有 issue 生效。
      </p>
      <div class="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" :disabled="loading" title="刷新" @click="load">
          <IconRefresh class="size-4" :class="loading ? 'animate-spin' : ''" />
        </Button>
        <Button size="sm" @click="openCreate">
          <IconPlus class="size-4" />
          新建标签
        </Button>
      </div>
    </div>

    <!-- 列表 -->
    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      <div
        v-if="loading && !labels.length"
        class="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground"
      >
        <IconLoader class="size-4 animate-spin" />
        正在读取标签…
      </div>

      <div
        v-else-if="loadError"
        class="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive"
      >
        <span>{{ loadError }}</span>
        <Button variant="outline" size="xs" @click="load">重试</Button>
      </div>

      <div
        v-else-if="!labels.length"
        class="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
      >
        还没有任何标签，先建一个吧。
      </div>

      <ul v-else class="flex flex-col gap-1.5">
        <li
          v-for="label in labels"
          :key="label.name"
          class="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
        >
          <span
            class="mt-1.5 size-3 shrink-0 rounded-full border border-border"
            :style="swatchStyle(label.color)"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate text-sm font-medium">{{ label.name }}</span>
              <code class="font-mono text-[11px] text-muted-foreground">#{{ label.color }}</code>
            </div>
            <p class="mt-0.5 truncate text-xs text-muted-foreground">
              {{ label.description || '无描述' }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon-xs" title="编辑" @click="openEdit(label)">
              <IconPencil class="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              class="text-destructive hover:text-destructive"
              title="删除"
              @click="deleteTarget = label"
            >
              <IconTrash2 class="size-3.5" />
            </Button>
          </div>
        </li>
      </ul>
    </div>

    <!-- 表单投放到管理面板右栏的同级滑板，与 Tabs 整块互换位置 -->
    <Teleport to="#admin-form-slot" v-if="formMounted">
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-semibold">{{ originalName ? '编辑标签' : '新建标签' }}</h4>
          <Button variant="ghost" size="icon-xs" title="返回列表" @click="cancelForm">
            <IconX class="size-3.5" />
          </Button>
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <Label for="label-name">名称</Label>
            <Input
              id="label-name"
              v-model="form.name"
              placeholder="例如 bug"
              maxlength="50"
              @keydown.enter.prevent="submit"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="label-color">颜色</Label>
            <div class="flex items-center gap-2">
              <input
                id="label-color"
                type="color"
                class="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
                :value="'#' + form.color"
                @input="onColorInput"
              />
              <Input v-model="form.color" class="font-mono" maxlength="7" placeholder="d73a4a" />
            </div>
          </div>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <span class="mr-1 text-xs text-muted-foreground">常用色</span>
          <button
            v-for="color in PRESET_COLORS"
            :key="color"
            type="button"
            class="size-6 rounded-md border transition hover:scale-110"
            :class="form.color === color ? 'border-ring ring-2 ring-ring/40' : 'border-border'"
            :style="{ backgroundColor: '#' + color }"
            :title="'#' + color"
            @click="form.color = color"
          />
        </div>

        <div class="mt-3 flex flex-col gap-1.5">
          <Label for="label-desc">描述</Label>
          <Textarea
            id="label-desc"
            v-model="form.description"
            class="min-h-16"
            maxlength="100"
            placeholder="用一句话说明这个标签的用途（可留空）"
          />
        </div>

        <div class="mt-3 flex items-center justify-between gap-2">
          <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span class="size-3 rounded-full border border-border" :style="swatchStyle(form.color)" />
            {{ form.name.trim() || '未命名' }}
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
          <AlertDialogTitle>删除标签「{{ deleteTarget?.name }}」？</AlertDialogTitle>
          <AlertDialogDescription>
            标签会从仓库里彻底移除，所有 issue 上的这个标签也会一起消失，无法撤销。
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
