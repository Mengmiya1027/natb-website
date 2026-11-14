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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import IconLogOut from '~icons/lucide/log-out'
import IconBan from '~icons/lucide/ban'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['update:open'])

const store = useIssueStore()

const nick = ref('')
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    nick.value = store.qqUser?.nick || ''
    // 封禁状态可能在别处被改过，打开时刷新一次
    store.refreshQq().catch(() => {})
  },
)

const untilText = computed(() => {
  if (!store.qqBanUntil) return '永久封禁'
  const d = new Date(store.qqBanUntil)
  return '解封时间：' + d.getFullYear() + '-' + d.getMonth() + 1 + '-' + d.getDate()
})

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

        <!-- 三列同一套排版：数值统一 text-lg、标签统一 text-[11px]，日期也用同一字号 -->
        <div class="grid grid-cols-3 items-end gap-2 border-border border-t pt-3 text-center">
          <div class="flex flex-col items-center gap-0.5">
            <span class="text-lg leading-none font-semibold tabular-nums">{{ store.qqUser?.issues ?? 0 }}</span>
            <span class="text-muted-foreground text-[11px]">发布</span>
          </div>
          <div class="flex flex-col items-center gap-0.5">
            <span class="text-lg leading-none font-semibold tabular-nums">{{ store.qqUser?.comments ?? 0 }}</span>
            <span class="text-muted-foreground text-[11px]">评论</span>
          </div>
          <div class="flex flex-col items-center gap-0.5">
            <span class="text-lg leading-none font-semibold tabular-nums whitespace-nowrap">
              {{ formatDate(store.qqUser?.created) }}
            </span>
            <span class="text-muted-foreground text-[11px]">加入</span>
          </div>
        </div>

        <div
          v-if="store.qqBanned"
          class="border-destructive/40 bg-destructive/10 rounded-lg border px-3 py-2.5"
        >
          <p class="text-destructive flex items-center gap-1.5 text-xs font-medium">
            <IconBan class="size-3.5" />
            账号已被封禁
          </p>
          <p class="mt-1 text-xs leading-relaxed">
            原因：{{ store.qqBanReason || '管理员未填写原因' }}
          </p>
          <p class="text-muted-foreground mt-0.5 text-[11px]">{{ untilText }}</p>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-border px-5 py-3">
        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button variant="ghost" size="sm" class="text-destructive gap-1.5">
              <IconLogOut class="size-4" />
              退出登录
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>退出 QQ 登录？</AlertDialogTitle>
              <AlertDialogDescription>
                退出后这台设备上的身份会被清除，需要重新收取验证码才能再登录。你的昵称和已发的内容都会保留。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction @click="logout">退出</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button variant="outline" size="sm" @click="emit('update:open', false)">关闭</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
