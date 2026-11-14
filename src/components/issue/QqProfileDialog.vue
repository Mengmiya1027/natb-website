<script setup>
/**
 * QQ 用户的个人中心：改昵称、看自己的数据、退出登录。
 * 头像不走上传（会引入存储成本），用昵称首字母 + 由 sub 算出的固定底色。
 */
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { updateProfile } from '@/api/qqAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

import IconLogOut from '~icons/lucide/log-out'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['update:open'])

const store = useIssueStore()

const nick = ref('')
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (open) nick.value = store.qqUser?.nick || ''
  },
)

const displayNick = computed(() => store.qqUser?.nick || 'QQ 用户')
const initial = computed(() => displayNick.value.slice(0, 1).toUpperCase())

/** 同一个 sub 永远是同一个颜色，换个昵称也不会变色 */
const avatarStyle = computed(() => {
  const sub = store.qqUser?.sub || ''
  let h = 0
  for (const ch of sub) h = (h * 31 + ch.charCodeAt(0)) % 360
  return { backgroundColor: 'hsl(' + h + ' 55% 45%)' }
})

const canSave = computed(
  () => nick.value.trim().length >= 2 && nick.value.trim().length <= 16 && nick.value.trim() !== displayNick.value && !saving.value,
)

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const data = await updateProfile(nick.value.trim())
    store.setQqSession(data.user, data.token)
    toast.success('昵称已更新')
    emit('update:open', false)
  } catch (err) {
    toast.error(err?.message || String(err))
  } finally {
    saving.value = false
  }
}

function logout() {
  store.logoutQq()
  emit('update:open', false)
  toast.success('已退出 QQ 登录')
}

function formatDate(ms) {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="w-[min(440px,92vw)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
      <div class="border-b border-border px-5 py-4 pr-14">
        <DialogTitle class="text-base">个人中心</DialogTitle>
        <DialogDescription class="mt-1 text-xs">
          昵称会显示在 issue 与评论的作者处，随时可以改。
        </DialogDescription>
      </div>

      <div class="flex flex-col gap-4 px-5 py-4">
        <div class="flex items-center gap-3">
          <div
            class="grid size-12 shrink-0 place-items-center rounded-full text-lg font-semibold text-white"
            :style="avatarStyle"
          >
            {{ initial }}
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">{{ displayNick }}</p>
            <p class="text-muted-foreground text-xs">{{ store.qqUser?.masked || 'QQ 邮箱' }}</p>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="qq-profile-nick" class="text-xs text-muted-foreground">昵称</Label>
          <div class="flex gap-2">
            <Input id="qq-profile-nick" v-model="nick" maxlength="16" placeholder="2-16 个字符" class="flex-1" />
            <Button class="shrink-0" :disabled="!canSave" @click="save">
              {{ saving ? '保存中…' : '保存' }}
            </Button>
          </div>
          <p class="text-muted-foreground text-[11px]">2-16 个字符，不能包含尖括号或换行。</p>
        </div>

        <Separator />

        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <p class="text-lg font-semibold tabular-nums">{{ store.qqUser?.issues ?? 0 }}</p>
            <p class="text-muted-foreground text-[11px]">发布</p>
          </div>
          <div>
            <p class="text-lg font-semibold tabular-nums">{{ store.qqUser?.comments ?? 0 }}</p>
            <p class="text-muted-foreground text-[11px]">评论</p>
          </div>
          <div>
            <p class="text-sm font-semibold tabular-nums">{{ formatDate(store.qqUser?.created) }}</p>
            <p class="text-muted-foreground text-[11px]">加入</p>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-border px-5 py-3">
        <Button variant="ghost" size="sm" class="text-destructive gap-1.5" @click="logout">
          <IconLogOut class="size-4" />
          退出登录
        </Button>
        <Button variant="outline" size="sm" @click="emit('update:open', false)">关闭</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
