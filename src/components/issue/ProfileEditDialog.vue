<script setup>
/**
 * 编辑个人资料。只有 QQ 身份有可改字段：昵称与头像都存在本 worker 的档案里。
 * GitHub 的昵称和头像由 GitHub 决定，所以那个身份不提供这个入口。
 *
 * 头像两种取值与首次登录的引导框保持一致：
 *   qq     → 直接取 q1.qlogo.cn 的号码头像
 *   letter → 昵称首字母
 * 存档里的 setupAt 由 /auth/profile 写入，此处保存一次就等于「走过引导」。
 */
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { updateProfile } from '@/api/qqAuth'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

import IconPencil from '~icons/lucide/pencil'
import IconUserRound from '~icons/lucide/user-round'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['update:open'])

const store = useIssueStore()

const nick = ref('')
const avatar = ref('letter')
const saving = ref(false)

const displayNick = computed(() => store.qqUser?.nick || 'QQ 用户')
/** 已存下来的头像，用来判断这次到底改没改 */
const savedAvatar = computed(() => (store.qqUser?.avatar === 'qq' ? 'qq' : 'letter'))
const sub = computed(() => store.qqUser?.sub || '')
const qqAvatar = computed(() => (sub.value ? store.avatarFor(sub.value) : ''))
const initial = computed(() => (nick.value.trim() || displayNick.value).slice(0, 1).toUpperCase())

/** 头像取不到（号码没建档 / 中转 404）时退回占位图标，不留一个破图 */
const qqAvatarOk = ref(true)
watch(qqAvatar, () => {
  qqAvatarOk.value = true
})

/** 只改头像不改昵称也算一次改动，所以两者都要比 */
const canSave = computed(() => {
  const value = nick.value.trim()
  if (saving.value) return false
  if (value.length < 2 || value.length > 16) return false
  return value !== displayNick.value || avatar.value !== savedAvatar.value
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    nick.value = store.qqUser?.nick || ''
    avatar.value = savedAvatar.value
  },
)

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const data = await updateProfile(nick.value.trim(), avatar.value)
    // 昵称存在令牌载荷里，换完必须把新令牌换回来，否则下一次发帖署的还是旧名字
    if (data?.user) {
      store.setQqSession(data.user, data.token)
      // 作者栏读的是 profiles 缓存，不写回去，本次会话里的头像还是旧的
      store.patchProfile(data.user.sub, { nick: data.user.nick, avatar: data.user.avatar })
    }
    toast.success('资料已更新')
    emit('update:open', false)
  } catch (err) {
    toast.error(err?.message || String(err))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="w-[min(420px,94vw)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
      <div class="border-border flex items-center gap-4 border-b px-7 pt-4 pb-3 pr-14">
        <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
          <IconPencil class="size-4" />
        </div>
        <div class="min-w-0 translate-y-px">
          <DialogTitle class="text-base leading-none">编辑个人资料</DialogTitle>
          <DialogDescription class="text-muted-foreground mt-0.5 text-xs">
            昵称与头像会显示在 issue 与评论的作者栏，保存后立即生效。
          </DialogDescription>
        </div>
      </div>

      <div class="flex flex-col gap-4 px-7 py-5">
        <div class="flex flex-col gap-2">
          <span class="text-muted-foreground text-xs">头像</span>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors"
              :class="
                avatar === 'qq'
                  ? 'border-ring ring-2 ring-ring/30'
                  : 'border-border hover:bg-muted/60'
              "
              @click="avatar = 'qq'"
            >
              <img
                v-if="qqAvatar && qqAvatarOk"
                :src="qqAvatar"
                alt=""
                class="size-9 shrink-0 rounded-full border object-cover"
                @error="qqAvatarOk = false"
              />
              <span v-else class="bg-muted grid size-9 shrink-0 place-items-center rounded-full">
                <IconUserRound class="text-muted-foreground size-4" />
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-medium">QQ 头像</span>
                <span class="text-muted-foreground block text-[11px]">用这个号码的头像</span>
              </span>
            </button>

            <button
              type="button"
              class="flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors"
              :class="
                avatar === 'letter'
                  ? 'border-ring ring-2 ring-ring/30'
                  : 'border-border hover:bg-muted/60'
              "
              @click="avatar = 'letter'"
            >
              <span
                class="bg-muted grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
              >
                {{ initial }}
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-medium">字母头像</span>
                <span class="text-muted-foreground block text-[11px]">昵称首字母</span>
              </span>
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="profile-nick" class="text-muted-foreground text-xs">昵称</Label>
          <Input id="profile-nick" v-model="nick" maxlength="16" placeholder="2-16 个字符" />
          <p class="text-muted-foreground text-[11px]">2-16 个字符，不能包含尖括号或换行。</p>
        </div>
      </div>

      <div class="border-border bg-muted/70 flex items-center justify-end gap-2 border-t px-5 py-4">
        <Button
          variant="outline"
          class="h-8 rounded-md px-3 text-sm font-medium"
          @click="emit('update:open', false)"
        >
          取消
        </Button>
        <Button class="h-8 rounded-md px-3 text-sm font-semibold" :disabled="!canSave" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
