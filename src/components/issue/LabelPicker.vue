<script setup>
/**
 * 标签多选器：Popover + 搜索 + 多选/取消。
 * 只负责选择，提交由调用方决定（新建页 / 详情页）。
 */
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import { githubApi } from '@/api/github'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import IconTag from '~icons/lucide/tag'
import IconCheck from '~icons/lucide/check'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconSearch from '~icons/lucide/search'
import IconTriangleAlert from '~icons/lucide/triangle-alert'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const loading = ref(false)
const failed = ref(false)
const labels = ref([])
const query = ref('')

const selected = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))

const triggerText = computed(() => {
  if (failed.value) return '标签不可用'
  if (!selected.value.length) return '未选择标签'
  if (selected.value.length <= 2) return selected.value.join('、')
  return `已选 ${selected.value.length} 个标签`
})

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return labels.value
  return labels.value.filter((label) => {
    const name = (label.name || '').toLowerCase()
    const desc = (label.description || '').toLowerCase()
    return name.includes(keyword) || desc.includes(keyword)
  })
})

function dotStyle(label) {
  const color = String(label?.color || '').replace(/^#/, '')
  return color ? { backgroundColor: `#${color}` } : { backgroundColor: 'currentColor', opacity: 0.35 }
}

function isSelected(name) {
  return selected.value.includes(name)
}

function toggle(name) {
  const next = isSelected(name)
    ? selected.value.filter((item) => item !== name)
    : [...selected.value, name]
  emit('update:modelValue', next)
}

async function load() {
  if (loading.value) return
  loading.value = true
  try {
    const data = await githubApi.listLabels({ per_page: 100 })
    labels.value = Array.isArray(data) ? data : []
    failed.value = false
  } catch (err) {
    failed.value = true
    labels.value = []
    toast.error('加载标签失败：' + (err?.message || String(err)))
  } finally {
    loading.value = false
  }
}

onMounted(load)

</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="failed"
        class="w-full justify-between gap-2 font-normal"
        :title="failed ? '标签加载失败，稍后可重试' : '选择标签'"
      >
        <span class="flex items-center gap-1.5 min-w-0">
          <IconTag class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate">{{ triggerText }}</span>
        </span>
        <IconChevronDown class="size-3.5 shrink-0 opacity-60" />
      </Button>
    </PopoverTrigger>

    <PopoverContent align="start" class="w-72 p-0">
      <div class="border-b border-border p-2">
        <div class="relative">
          <IconSearch class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="query" placeholder="搜索标签" class="h-8 pl-7 text-sm" />
        </div>
      </div>

      <div class="max-h-64 overflow-y-auto p-1">
        <div v-if="loading" class="flex flex-col gap-1 p-1">
          <Skeleton v-for="n in 4" :key="n" class="h-7 w-full rounded-md" />
        </div>

        <div v-else-if="failed" class="flex items-start gap-2 p-2 text-xs text-muted-foreground">
          <IconTriangleAlert class="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <span>标签加载失败，请检查网络或登录状态后重新打开。</span>
        </div>

        <p v-else-if="!filtered.length" class="p-3 text-xs text-muted-foreground">
          {{ query ? '没有匹配的标签' : '仓库还没有标签' }}
        </p>

        <template v-else>
          <button
            v-for="label in filtered"
            :key="label.name"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            @click="toggle(label.name)"
          >
            <span class="size-2.5 shrink-0 rounded-full ring-1 ring-border" :style="dotStyle(label)" />
            <span class="min-w-0 flex-1 truncate">{{ label.name }}</span>
            <IconCheck v-if="isSelected(label.name)" class="size-3.5 shrink-0 text-primary" />
          </button>
        </template>
      </div>

      <div v-if="selected.length" class="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
        <span class="text-xs text-muted-foreground">已选 {{ selected.length }} 个</span>
        <Button type="button" variant="ghost" size="xs" @click="emit('update:modelValue', [])">清空</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>