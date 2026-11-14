<script setup>
/**
 * 管理面板的「用户」页：列出用 QQ 邮箱登录过的人，可以封禁 / 解封。
 * 列表来自 Worker 的 /admin/users，凭据是管理员的 GitHub token。
 */
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import IconRefresh from '~icons/lucide/refresh-cw'
import IconBan from '~icons/lucide/ban'
import IconShieldCheck from '~icons/lucide/shield-check'

const users = ref([])
const loading = ref(true)
const error = ref('')
const cursor = ref(null)
const busySub = ref('')

const banOpen = ref(false)
const banTarget = ref(null)
const banReason = ref('')
const banDays = ref(1)
const banIp = ref(false)
const banning = ref(false)

const DURATIONS = [
  { value: 1, label: '1 天' },
  { value: 7, label: '7 天' },
  { value: 0, label: '永久' },
]

function relativeTime(input) {
  if (!input) return '—'
  const diff = Date.now() - input
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  return Math.floor(diff / 86400000) + ' 天前'
}

async function load(next) {
  loading.value = true
  error.value = ''
  try {
    const data = await adminApi.listUsers(next || undefined)
    users.value = next ? [...users.value, ...data.users] : data.users
    cursor.value = data.cursor
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
}

function openBan(user) {
  banTarget.value = user
  banReason.value = ''
  banDays.value = 1
  banIp.value = false
  banOpen.value = true
}

async function confirmBan() {
  if (!banTarget.value || banning.value) return
  banning.value = true
  try {
    await adminApi.ban(banTarget.value.sub, {
      reason: banReason.value.trim(),
      days: banDays.value,
      banIp: banIp.value,
    })
    toast.success('已封禁')
    banOpen.value = false
    await load()
  } catch (err) {
    toast.error(err?.message || String(err))
  } finally {
    banning.value = false
  }
}

async function unban(user) {
  if (busySub.value) return
  busySub.value = user.sub
  try {
    await adminApi.unban(user.sub)
    toast.success('已解封')
    await load()
  } catch (err) {
    toast.error(err?.message || String(err))
  } finally {
    busySub.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2">
    <div class="flex items-center justify-between">
      <p class="text-muted-foreground text-xs">
        用 QQ 邮箱登录过的人。封禁后仍可浏览，但所有写操作都会被拒绝。
      </p>
      <Button variant="ghost" size="xs" class="gap-1" :disabled="loading" @click="load()">
        <IconRefresh class="size-3.5" :class="loading ? 'animate-spin' : ''" />
        刷新
      </Button>
    </div>

    <div v-if="error" class="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-xs">
      {{ error }}
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="loading && !users.length" class="flex flex-col gap-2">
        <Skeleton v-for="i in 4" :key="i" class="h-12 w-full rounded-lg" />
      </div>

      <p v-else-if="!users.length" class="text-muted-foreground py-8 text-center text-xs">
        还没有 QQ 用户发过言
      </p>

      <div v-else class="divide-border divide-y">
        <div
          v-for="user in users"
          :key="user.sub"
          class="flex items-center gap-3 py-2.5"
          :class="user.banned ? 'opacity-55' : ''"
        >
          <div class="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground text-xs font-semibold">
            {{ (user.nick || '?').slice(0, 1) }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium truncate">
              {{ user.nick || '未命名' }}
              <span class="text-muted-foreground ml-1.5 text-xs font-normal">{{ user.masked }}</span>
            </p>
            <p class="text-muted-foreground text-[11px]">
              发帖 {{ user.issues }} · 评论 {{ user.comments }} · 最后活跃 {{ relativeTime(user.lastSeen) }}
            </p>
          </div>

          <Badge
            :variant="user.banned ? 'destructive' : 'secondary'"
            class="shrink-0 text-[10px]"
          >
            {{ user.banned ? (user.until ? '封禁中' : '永久封禁') : '正常' }}
          </Badge>

          <Button
            v-if="user.banned"
            variant="outline"
            size="xs"
            class="shrink-0 gap-1"
            :disabled="busySub === user.sub"
            @click="unban(user)"
          >
            <IconShieldCheck class="size-3.5" />
            解封
          </Button>
          <Button
            v-else
            variant="ghost"
            size="xs"
            class="text-destructive shrink-0 gap-1"
            @click="openBan(user)"
          >
            <IconBan class="size-3.5" />
            封禁
          </Button>
        </div>
      </div>

      <div v-if="cursor" class="pt-2">
        <Button variant="outline" size="xs" class="w-full" :disabled="loading" @click="load(cursor)">
          加载更多
        </Button>
      </div>
    </div>

    <Dialog v-model:open="banOpen">
      <DialogContent class="w-[min(420px,92vw)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
        <div class="border-border border-b px-5 py-4 pr-14">
          <DialogTitle class="text-base">封禁 {{ banTarget?.nick || '这个用户' }}</DialogTitle>
          <DialogDescription class="mt-1 text-xs">
            封禁后他仍能浏览，但发帖、评论、关单都会被拒绝。
          </DialogDescription>
        </div>

        <div class="flex flex-col gap-3 px-5 py-4">
          <div class="flex flex-col gap-1.5">
            <Label for="ban-reason" class="text-xs text-muted-foreground">理由（内部记录，不展示给用户）</Label>
            <Input id="ban-reason" v-model="banReason" placeholder="例如：广告刷屏" maxlength="100" />
          </div>

          <div class="flex flex-col gap-1.5">
            <Label class="text-xs text-muted-foreground">时长</Label>
            <div class="flex gap-2">
              <Button
                v-for="d in DURATIONS"
                :key="d.value"
                type="button"
                size="sm"
                :variant="banDays === d.value ? 'default' : 'outline'"
                class="flex-1"
                @click="banDays = d.value"
              >
                {{ d.label }}
              </Button>
            </div>
          </div>

          <label class="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox :model-value="banIp" @update:model-value="(v) => (banIp = Boolean(v))" />
            同时封禁他最近使用的 IP（24 小时，可能误伤同网络的人）
          </label>
        </div>

        <DialogFooter class="border-border border-t px-5 py-3">
          <Button variant="ghost" size="sm" @click="banOpen = false">取消</Button>
          <Button variant="destructive" size="sm" :disabled="banning" @click="confirmBan">
            {{ banning ? '处理中…' : '确认封禁' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
