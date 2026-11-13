<script setup>
/**
 * 新建 Issue 的前置对话框：先选反馈对象，再选反馈类型，然后才进编写页。
 * 两个列表都从 public/json/issue-form.json 读，加减选项不用改代码。
 */
import { computed, ref, watch } from 'vue'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'

import IconChevronLeft from '~icons/lucide/chevron-left'
import IconChevronRight from '~icons/lucide/chevron-right'
import IconTerminal from '~icons/lucide/terminal'
import IconAppWindow from '~icons/lucide/app-window'
import IconWatch from '~icons/lucide/watch'
import IconBoxes from '~icons/lucide/boxes'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['update:open', 'confirm'])

/* JSON 里只存图标名，这里映射成组件（字符串没法动态 import）。 */
const ICONS = {
  terminal: IconTerminal,
  'app-window': IconAppWindow,
  watch: IconWatch,
  boxes: IconBoxes,
}

const form = ref({ targets: [], types: [], multipleTypes: false })
const loading = ref(false)
const loadError = ref('')

const step = ref(1)
const targetId = ref('')
const typeIds = ref([])

const target = computed(() => form.value.targets.find((item) => item.id === targetId.value) || null)
const canConfirm = computed(() => typeIds.value.length > 0)

async function loadForm() {
  if (loading.value || form.value.targets.length) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'json/issue-form.json', { cache: 'no-cache' })
    if (!res.ok) throw new Error('读取选项失败（HTTP ' + res.status + '）')
    const data = await res.json()
    form.value = {
      targets: Array.isArray(data.targets) ? data.targets : [],
      types: Array.isArray(data.types) ? data.types : [],
      multipleTypes: Boolean(data.multipleTypes),
    }
  } catch (err) {
    loadError.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    step.value = 1
    targetId.value = ''
    typeIds.value = []
    loadForm()
  },
)

function pickTarget(item) {
  targetId.value = item.id
  step.value = 2
}

function toggleType(item) {
  const index = typeIds.value.indexOf(item.id)
  if (index >= 0) {
    typeIds.value.splice(index, 1)
    return
  }
  if (form.value.multipleTypes) typeIds.value.push(item.id)
  else typeIds.value = [item.id]
}

function confirm() {
  if (!canConfirm.value) return
  emit('confirm', {
    target: target.value,
    types: form.value.types.filter((item) => typeIds.value.includes(item.id)),
  })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="w-[min(460px,92vw)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
      <!-- 第一步：反馈对象 -->
      <template v-if="step === 1">
        <div class="border-b border-border px-5 py-4 pr-14">
          <DialogTitle class="text-base">新建 Issue</DialogTitle>
          <DialogDescription class="mt-1 text-xs">先选这次反馈针对哪个项目。</DialogDescription>
        </div>

        <div class="flex flex-col gap-2 px-4 py-4">
          <template v-if="loading">
            <Skeleton v-for="i in 4" :key="i" class="h-[68px] w-full rounded-xl" />
          </template>

          <div
            v-else-if="loadError"
            class="flex flex-col items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive"
          >
            <span>{{ loadError }}</span>
            <Button variant="outline" size="xs" @click="loadForm">重试</Button>
          </div>

          <template v-else>
            <button
              v-for="item in form.targets"
              :key="item.id"
              type="button"
              class="group bg-muted hover:bg-foreground/10 flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors"
              @click="pickTarget(item)"
            >
              <component :is="ICONS[item.icon] || IconBoxes" class="text-foreground size-5 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-foreground text-sm font-semibold">{{ item.title }}</p>
                <p class="text-muted-foreground mt-0.5 text-xs leading-relaxed">{{ item.desc }}</p>
              </div>
              <IconChevronRight class="text-muted-foreground/60 size-4 shrink-0" />
            </button>
          </template>
        </div>
      </template>

      <!-- 第二步：反馈类型 -->
      <template v-else>
        <div class="flex items-start gap-2 border-b border-border px-3 py-4 pr-14">
          <button
            type="button"
            class="text-muted-foreground hover:bg-foreground/10 hover:text-foreground mt-0.5 grid size-7 shrink-0 place-items-center rounded-md transition-colors"
            title="返回上一步"
            @click="step = 1"
          >
            <IconChevronLeft class="size-4" />
          </button>
          <div class="min-w-0">
            <DialogTitle class="text-base">反馈类型</DialogTitle>
            <DialogDescription class="mt-1 text-xs">
              {{ target?.title }} · 可以多选
            </DialogDescription>
          </div>
        </div>

        <div class="flex flex-col gap-3 px-5 py-4">
          <label
            v-for="item in form.types"
            :key="item.id"
            class="flex cursor-pointer items-start gap-3"
          >
            <Checkbox
              :model-value="typeIds.includes(item.id)"
              class="mt-0.5"
              @update:model-value="toggleType(item)"
            />
            <div class="min-w-0">
              <p class="text-foreground text-sm font-medium">{{ item.title }}</p>
              <p class="text-muted-foreground text-xs leading-relaxed">{{ item.desc }}</p>
            </div>
          </label>
        </div>

        <div class="border-t border-border px-5 py-2.5">
          <Button
            class="h-[30px] w-full text-[13px] font-semibold"
            :disabled="!canConfirm"
            @click="confirm"
          >
            下一步
          </Button>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>
