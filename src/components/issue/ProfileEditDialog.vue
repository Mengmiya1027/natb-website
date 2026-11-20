<script setup>
/**
 * 编辑个人资料。目前只有 QQ 身份有可改字段：昵称存在本站令牌里。
 * GitHub 的昵称由 GitHub 决定，所以那个身份不提供这个入口。
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

const props = defineProps({ open: Boolean })
const emit = defineEmits(['update:open'])

const store = useIssueStore()

const nick = ref('')
const saving = ref(false)

const displayNick = computed(() => store.qqUser?.nick || 'QQ 用户')
const initial = computed(() => (nick.value.trim() || displayNick.value).slice(0, 1).toUpperCase())
const avatarStyle = computed(() => {
  const sub = store.qqUser?.sub || ''
  let h = 0
  for (const ch of sub) h = (h * 31 + ch.charCodeAt(0)) % 360
  return { backgroundColor: 'hsl(' + h + ' 55% 45%)' }
})
const canSave = computed(
  () =>
    nick.value.trim().length >= 2 &&
    nick.value.trim().length <= 16 &&
    nick.value.trim() !== displayNick.value &&
    !saving.value,
)

watch(
  () => props.open,
  (open) => {
    if (open) nick.value = store.qqUser?.nick || ''
  },
)

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const data = await updateProfile(nick.value.trim())
    // 昵称存在令牌载荷里，换完必须把新令牌换回来，否则下一次发帖署的还是旧名字
    store.setQqSession(data.user, data.token)
    toast.success('昵称已更新')
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
    <DialogContent class="w-[min(400px,92vw)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
      <div class="border-border flex items-center gap-4 border-b px-7 pt-4 pb-3 pr-14">
        <div class="bg-muted grid size-9 shrink-0 place-items-center rounded-[10px]">
          <IconPencil class="size-4" />
        </div>
        <div class="min-w-0 translate-y-px">
          <DialogTitle class="text-base leading-none">编辑个人资料</DialogTitle>
          <DialogDescription class="text-muted-foreground mt-0.5 text-xs">
            昵称会显示在 issue 与评论的作者栏，改完立即生效。
          </DialogDescription>
        </div>
      </div>

      <div class="flex flex-col gap-4 px-7 py-5">
        <div class="flex items-center gap-3">
          <div
            class="grid size-12 shrink-0 place-items-center rounded-full text-lg font-semibold text-white"
            :style="avatarStyle"
          >
            {{ initial }}
          </div>
          <p class="text-muted-foreground min-w-0 flex-1 text-xs leading-relaxed">
            头像用昵称首字母生成，底色由身份算出，换昵称不会变色。
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="profile-nick" class="text-muted-foreground text-xs">昵称</Label>
          <Input id="profile-nick" v-model="nick" maxlength="16" placeholder="2-16 个字符" />
          <p class="text-muted-foreground text-[11px]">2-16 个字符，不能包含尖括号或换行。</p>
        </div>
      </div>

      <div class="border-border bg-muted/70 flex items-center justify-end gap-2 border-t px-5 py-4">
        <Button variant="outline" class="h-8 rounded-md px-3 text-sm font-medium" @click="emit('update:open', false)">
          取消
        </Button>
        <Button class="h-8 rounded-md px-3 text-sm font-semibold" :disabled="!canSave" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
