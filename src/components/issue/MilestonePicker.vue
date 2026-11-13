<script setup>
/**
 * 里程碑单选器：Popover + 搜索 + 单选（再次点击已选项即取消）。
 * 只负责选择，提交由调用方完成。
 */
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import { githubApi } from '@/api/github'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import IconMilestone from '~icons/lucide/milestone'
import IconCheck from '~icons/lucide/check'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconSearch from '~icons/lucide/search'
import IconTriangleAlert from '~icons/lucide/triangle-alert'

const props = defineProps({
  modelValue: { type: Number, default: null },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const loading = ref(false)
const failed = ref(false)
const milestones = ref([])
const query = ref('')

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return milestones.value
  return milestones.value.filter((item) => (item.title || '').toLowerCase().includes(keyword))
})

const currentTitle = computed(() => {
  if (failed.value) return '里程碑不可用'
  if (props.modelValue === null || props.modelValue === undefined) return '未设置里程碑'
  const hit = milestones.value.find((item) => item.number === props.modelValue)
  return hit ? hit.title : `里程碑 #${props.modelValue}`
})

function isSelected(number) {
  return props.modelValue === number
}

function pick(number) {
  emit('update:modelValue', isSelected(number) ? null : number)
  open.value = false
}

async function load() {
  if (loading.value) return
  loading.value = true
  try {
    const data = await githubApi.listMilestones({ state: 'open', per_page: 100 })
    milestones.value = Array.isArray(data) ? data : []
    failed.value = false
  } catch (err) {
    failed.value = true
    milestones.value = []
    toast.error('加载里程碑失败：' + (err?.message || String(err)))
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
        :title="failed ? '里程碑加载失败，稍后可重试' : '选择里程碑'"
      >
        <span class="flex items-center gap-1.5 min-w-0">
          <IconMilestone class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate">{{ currentTitle }}</span>
        </span>
        <IconChevronDown class="size-3.5 shrink-0 opacity-60" />
      </Button>
    </PopoverTrigger>

    <PopoverContent align="start" class="w-72 p-0">
      <div class="border-b border-border p-2">
        <div class="relative">
          <IconSearch class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="query" placeholder="搜索里程碑" class="h-8 pl-7 text-sm" />
        </div>
      </div>

      <div class="max-h-64 overflow-y-auto p-1">
        <div v-if="loading" class="flex flex-col gap-1 p-1">
          <Skeleton v-for="n in 3" :key="n" class="h-7 w-full rounded-md" />
        </div>

        <div v-else-if="failed" class="flex items-start gap-2 p-2 text-xs text-muted-foreground">
          <IconTriangleAlert class="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <span>里程碑加载失败，请检查网络后重新打开。</span>
        </div>

        <template v-else>
          <p v-if="!filtered.length" class="p-3 text-xs text-muted-foreground">
            {{ query ? '没有匹配的里程碑' : '仓库还没有开放的里程碑' }}
          </p>

          <button
            v-for="item in filtered"
            :key="item.number"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            @click="pick(item.number)"
          >
            <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
            <IconCheck v-if="isSelected(item.number)" class="size-3.5 shrink-0 text-primary" />
          </button>
        </template>
      </div>

      <div v-if="modelValue !== null && modelValue !== undefined" class="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
        <span class="text-xs text-muted-foreground">已选 #{{ modelValue }}</span>
        <Button type="button" variant="ghost" size="xs" @click="emit('update:modelValue', null)">清除</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>