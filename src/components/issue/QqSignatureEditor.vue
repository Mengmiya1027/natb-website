<script setup>
/**
 * 署名行编辑器。放在正文/评论编辑框的操作栏最左侧，和取消/保存同一排。
 *
 * 只做一件事：决定这条内容挂在哪个 QQ 用户名下。可以滚列表挑人、搜昵称或号码，
 * 也可以直接填一个库里没有的号码——那种情况下后端会即时建一份占位档案
 * （不写注册日期，等本人真的登录那天再算）。
 */
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { createPlaceholder, directAvatarUrl } from '@/api/qqProfile'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import IconChevronDown from '~icons/lucide/chevron-down'
import IconSearch from '~icons/lucide/search'
import IconCheck from '~icons/lucide/check'
import IconLoader from '~icons/lucide/loader-circle'
import IconUserRound from '~icons/lucide/user-round'

const PAGE_SIZE = 10

const props = defineProps({
  /** 当前署名归属的 sub；为空表示这条内容不是 QQ 用户发的 */
  sub: { type: String, default: '' },
  /** 是否为 QQ 用户发的（决定显示「不支持修改」还是编辑器） */
  fromQq: { type: Boolean, default: false },
})
const emit = defineEmits(['update:sub'])

const store = useIssueStore()

const open = ref(false)
const keyword = ref('')
const users = ref([])
const cursor = ref(null)
const loading = ref(false)
const broken = ref({})
const manualQq = ref('')

const current = computed(() => store.profileOf(props.sub))
/**
 * 触发器上的头像必须和列表里那一行保持一致：都看这个人自己选的 avatar。
 * 之前这里直接按号码拼腾讯链接，号码又是单独请求来的，取不到就永远显示字母，
 * 于是会出现「列表里有头像、下面写着字」的自相矛盾。
 */
const currentAvatar = computed(() =>
  current.value?.avatar === 'qq' ? store.avatarFor(props.sub) : '',
)

/** 手填的号码是否已在当前列表里（列表里有就直接用，没有再建档） */
const manualFound = computed(() => users.value.find((u) => u.qq === manualQq.value.trim()) || null)
const manualReady = computed(() => /^\d{5,11}$/.test(manualQq.value.trim()))

watch(
  () => props.sub,
  (sub) => {
    if (sub) store.loadProfiles([sub])
  },
  { immediate: true },
)

/* 打开时先看会话缓存：拉过一次就不再转圈，刷新页面自然清空 */
watch(open, (value) => {
  if (!value) return
  keyword.value = ''
  const cache = store.qqUserCache
  if (cache && cache.loaded) {
    users.value = [...cache.list]
    cursor.value = cache.cursor
    return
  }
  users.value = []
  cursor.value = null
  loadPage(true)
})

/** 头像跟着用户自己的选择走：选了字母头像的地方就不该冒出 QQ 头像 */
function avatarOf(user) {
  if (user?.avatar !== 'qq') return ''
  // 管理员能从列表拿到号码，直连腾讯；拿不到就走统一取法（本人直连、他人中转）
  return user.qq ? directAvatarUrl(user.qq) : store.avatarFor(user?.sub || '')
}

function initialOf(name) {
  return String(name || 'Q').trim().slice(0, 1).toUpperCase()
}

function markBroken(sub) {
  broken.value = { ...broken.value, [sub]: true }
}

async function loadPage(reset) {
  if (loading.value) return
  if (!reset && !cursor.value) return
  loading.value = true
  try {
    const res = await store.searchQqUsers(keyword.value.trim(), reset ? null : cursor.value)
    users.value = reset ? res.users : [...users.value, ...res.users]
    cursor.value = res.cursor
  } finally {
    loading.value = false
  }
}

let timer = 0
watch(keyword, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    users.value = []
    cursor.value = null
    loadPage(true)
  }, 280)
})

/** 列表滚到底再续一页，每次 10 条 */
function onScroll(event) {
  const el = event.target
  if (!el || loading.value || !cursor.value) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) loadPage(false)
}

function pick(user) {
  store.loadProfiles([user.sub])
  emit('update:sub', user.sub)
  open.value = false
}

/** 手填号码：库里没有就先建档，拿到 sub 再选中 */
async function applyManual() {
  const qq = manualQq.value.trim()
  if (!/^\d{5,11}$/.test(qq)) {
    toast.error('QQ 号是 5-11 位数字')
    return
  }
  const hit = manualFound.value
  if (hit) {
    pick(hit)
    return
  }
  loading.value = true
  try {
    const data = await createPlaceholder(qq)
    if (data?.sub) {
      store.loadProfiles([data.sub])
      emit('update:sub', data.sub)
      toast.success(data.created ? '已为这个号码建档' : '已选中已有用户')
      open.value = false
    }
  } catch (err) {
    toast.error(err?.message || '建档失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- 非 QQ 用户发的内容：这一栏只留一句说明，不能改 -->
  <div v-if="!fromQq" class="text-muted-foreground text-xs">
    本评论非由 QQ 用户发送，不支持修改署名
  </div>

  <Popover v-else v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" class="h-9 min-w-0 gap-2 px-2.5 text-sm font-normal">
        <span class="text-muted-foreground shrink-0 text-xs">署名</span>
        <img
          v-if="currentAvatar && !broken[sub]"
          :src="currentAvatar"
          alt=""
          class="size-5 shrink-0 rounded-full border object-cover"
          @error="markBroken(sub)"
        />
        <span
          v-else
          class="bg-muted grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
        >
          {{ initialOf(current.nick) }}
        </span>
        <span class="max-w-[10rem] truncate">{{ current.nick || 'QQ 用户' }}</span>
        <IconChevronDown class="size-3.5 shrink-0 opacity-60" />
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-80 gap-0 p-0" align="start" side="top">
      <div class="border-border flex items-center gap-2 border-b px-3 py-2">
        <IconSearch class="text-muted-foreground size-4 shrink-0" />
        <Input
          v-model="keyword"
          class="h-7 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
          placeholder="搜索昵称或 QQ 号"
        />
      </div>

      <div class="max-h-64 overflow-y-auto p-1.5" @scroll="onScroll">
        <button
          v-for="user in users"
          :key="user.sub"
          type="button"
          class="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
          @click="pick(user)"
        >
          <img
            v-if="avatarOf(user) && !broken[user.sub]"
            :src="avatarOf(user)"
            alt=""
            class="size-6 shrink-0 rounded-full border object-cover"
            @error="markBroken(user.sub)"
          />
          <span
            v-else
            class="bg-muted grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
          >
            {{ initialOf(user.nick) }}
          </span>
          <span class="min-w-0 flex-1 truncate">{{ user.nick || 'QQ用户' }}</span>
          <span class="text-muted-foreground shrink-0 font-mono text-[11px]">{{ user.qq }}</span>
          <IconCheck v-if="user.sub === sub" class="size-4 shrink-0" />
        </button>

        <p v-if="!users.length && !loading" class="text-muted-foreground px-2 py-3 text-xs">
          {{ keyword ? '没搜到匹配的用户' : '用户库还是空的' }}
        </p>
        <div v-if="loading" class="text-muted-foreground flex items-center justify-center py-2">
          <IconLoader class="size-4 animate-spin" />
        </div>
        <p v-else-if="cursor" class="text-muted-foreground py-1.5 text-center text-[11px]">
          继续下滑加载更多
        </p>
      </div>

      <div class="border-border border-t p-2">
        <div class="flex items-center gap-1.5">
          <Input
            v-model="manualQq"
            class="h-8 flex-1 font-mono text-sm"
            maxlength="11"
            placeholder="直接填 QQ 号"
          />
          <Button size="sm" class="h-8 shrink-0" :disabled="!manualReady || loading" @click="applyManual">
            应用
          </Button>
        </div>
        <p
          v-if="manualQq && !manualFound"
          class="text-muted-foreground mt-1.5 px-0.5 text-[11px]"
        >
          本用户不在用户库中，将会为该用户创建新档案。
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
