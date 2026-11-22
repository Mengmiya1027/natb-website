<script setup>
/**
 * 首次登录的引导：选头像、起名字。
 *
 * 后端在建档那一刻就把默认值写好了（昵称 = QQ用户 + 号码后四位、字母头像），
 * 所以这里点「取消」或直接关掉都不会留下空配置——只是维持默认而已。
 */
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { updateProfile } from '@/api/qqAuth'
import { avatarUrlOf } from '@/api/qqProfile'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import IconUserRound from '~icons/lucide/user-round'

const props = defineProps({
  open: Boolean,
  profile: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'saved'])

const store = useIssueStore()
const nick = ref('')
const avatar = ref('letter')
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    nick.value = props.profile?.nick || ''
    avatar.value = props.profile?.avatar === 'qq' ? 'qq' : 'letter'
  },
  { immediate: true },
)

const sub = computed(() => props.profile?.sub || '')
const qqAvatar = computed(() => avatarUrlOf(sub.value))
/** 头像取不到（号码没建档 / 中转 404）时退回占位图标，不留一个破图 */
const qqAvatarOk = ref(true)
watch(
  () => qqAvatar.value,
  () => { qqAvatarOk.value = true },
)
const initial = computed(() => String(nick.value || 'Q').slice(0, 1).toUpperCase())

async function save() {
  const value = nick.value.trim()
  if (value.length < 2 || value.length > 16) {
    toast.error('昵称要 2-16 个字符')
    return
  }
  saving.value = true
  try {
    const data = await updateProfile(value, avatar.value)
    if (data?.user) {
      store.setQqSession(data.user, data.token)
      store.patchProfile(data.user.sub, { nick: data.user.nick, avatar: data.user.avatar })
    }
    toast.success('已保存')
    emit('saved', data?.user)
    emit('update:open', false)
  } catch (err) {
    toast.error(err?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="w-[min(420px,94vw)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
      <div class="border-border flex items-center gap-4 border-b px-5 pt-4 pb-3 pr-14">
        <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
          <IconUserRound class="size-4" />
        </div>
        <div class="min-w-0 translate-y-px">
          <DialogTitle class="text-base leading-none">初始化设置</DialogTitle>
          <DialogDescription class="mt-0.5 text-xs">
            昵称与头像后续可在个人中心修改，现在跳过亦可。
          </DialogDescription>
        </div>
      </div>

      <div class="flex flex-col gap-4 px-5 py-4">
        <div class="flex flex-col gap-2">
          <span class="text-xs text-muted-foreground">头像</span>
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
                <IconUserRound class="size-4 text-muted-foreground" />
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-medium">QQ 头像</span>
                <span class="block text-[11px] text-muted-foreground">用这个号码的头像</span>
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
                <span class="block text-[11px] text-muted-foreground">昵称首字母</span>
              </span>
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-xs text-muted-foreground">昵称</span>
          <Input v-model="nick" maxlength="16" placeholder="给自己起个名字" />
        </div>
      </div>

      <!-- 与二次确认框同一套底部：灰底、等分两列铺满 -->
      <div class="border-border bg-muted/70 border-t px-5 py-4">
        <div class="grid w-full grid-cols-2 gap-2">
          <Button
            variant="outline"
            class="h-8 rounded-md px-3 text-sm font-medium"
            :disabled="saving"
            @click="emit('update:open', false)"
          >
            保持默认
          </Button>
          <Button
            class="h-8 rounded-md px-3 text-sm font-semibold"
            :disabled="saving"
            @click="save"
          >
            {{ saving ? '保存中…' : '保存' }}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
