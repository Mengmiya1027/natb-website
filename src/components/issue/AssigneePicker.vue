<script setup>
/**
 * 指派对象多选器：Popover + 搜索 + 头像列表。
 * 只负责选择，提交由调用方通过 setAssignees / createIssue 完成。
 */
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import { githubApi } from '@/api/github'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import IconUsers from '~icons/lucide/users'
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
const users = ref([])
const query = ref('')

const selected = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))

const triggerText = computed(() => {
  if (failed.value) return '指派不可用'
  if (!selected.value.length) return '未指派'
  if (selected.value.length <= 2) return selected.value.join('、')
  return `已选 ${selected.value.length} 人`
})

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return users.value
  return users.value.filter((user) => (user.login || '').toLowerCase().includes(keyword))
})

function initials(login) {
  return String(login || '?').slice(0, 2).toUpperCase()
}

function isSelected(login) {
  return selected.value.includes(login)
}

function toggle(login) {
  const next = isSelected(login)
    ? selected.value.filter((item) => item !== login)
    : [...selected.value, login]
  emit('update:modelValue', next)
}

async function load() {
  if (loading.value) return
  loading.value = true
  try {
    const data = await githubApi.listAssignableUsers({ per_page: 100 })
    users.value = Array.isArray(data) ? data : []
    failed.value = false
  } catch (err) {
    failed.value = true
    users.value = []
    toast.error('加载可指派成员失败：' + (err?.message || String(err)))
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
        :title="failed ? '可指派成员加载失败，稍后可重试' : '选择指派对象'"
      >
        <span class="flex items-center gap-1.5 min-w-0">
          <IconUsers class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate">{{ triggerText }}</span>
        </span>
        <IconChevronDown class="size-3.5 shrink-0 opacity-60" />
      </Button>
    </PopoverTrigger>

    <PopoverContent align="start" class="w-72 p-0">
      <div class="border-b border-border p-2">
        <div class="relative">
          <IconSearch class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="query" placeholder="搜索成员" class="h-8 pl-7 text-sm" />
        </div>
      </div>

      <div class="max-h-64 overflow-y-auto p-1">
        <div v-if="loading" class="flex flex-col gap-1 p-1">
          <Skeleton v-for="n in 4" :key="n" class="h-8 w-full rounded-md" />
        </div>

        <div v-else-if="failed" class="flex items-start gap-2 p-2 text-xs text-muted-foreground">
          <IconTriangleAlert class="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <span>可指派成员加载失败，可能需要登录或该仓库不允许指派。</span>
        </div>

        <p v-else-if="!filtered.length" class="p-3 text-xs text-muted-foreground">
          {{ query ? '没有匹配的成员' : '没有可指派的成员' }}
        </p>

        <template v-else>
          <button
            v-for="user in filtered"
            :key="user.login"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            @click="toggle(user.login)"
          >
            <Avatar class="size-5 shrink-0">
              <AvatarImage :src="user.avatar_url" :alt="user.login" />
              <AvatarFallback class="text-[10px]">{{ initials(user.login) }}</AvatarFallback>
            </Avatar>
            <span class="min-w-0 flex-1 truncate">{{ user.login }}</span>
            <IconCheck v-if="isSelected(user.login)" class="size-3.5 shrink-0 text-primary" />
          </button>
        </template>
      </div>

      <div v-if="selected.length" class="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
        <span class="text-xs text-muted-foreground">已选 {{ selected.length }} 人</span>
        <Button type="button" variant="ghost" size="xs" @click="emit('update:modelValue', [])">清空</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>