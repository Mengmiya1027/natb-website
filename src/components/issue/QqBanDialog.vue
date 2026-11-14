<script setup>
/**
 * 被封禁账号的统一提示框：发帖、评论、个人中心三处共用。
 * 原因由服务端 /auth/me 下发，前端只负责展示。
 */
import { computed } from 'vue'

import { useIssueStore } from '@/stores/issue'
import { ISSUE_REPO_URL } from '@/config/github'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

import IconBan from '~icons/lucide/ban'
import IconExternalLink from '~icons/lucide/external-link'

defineProps({ open: Boolean })
const emit = defineEmits(['update:open'])

const store = useIssueStore()

const untilText = computed(() => {
  if (!store.qqBanUntil) return '永久封禁'
  const d = new Date(store.qqBanUntil)
  return '解封时间：' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
})
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="w-[min(400px,92vw)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
      <div class="flex flex-col items-center gap-2 px-5 pt-6 pb-4 text-center">
        <div class="bg-destructive/10 text-destructive grid size-11 place-items-center rounded-full">
          <IconBan class="size-5" />
        </div>
        <DialogTitle class="text-base">账号已被封禁</DialogTitle>
        <DialogDescription class="text-xs leading-relaxed">
          你可以继续浏览 issue，但暂时不能发帖、评论或关闭 issue。
        </DialogDescription>
      </div>

      <div class="flex flex-col gap-2 px-5 pb-4">
        <div class="bg-muted/60 rounded-lg px-3 py-2.5">
          <p class="text-muted-foreground text-[11px]">原因</p>
          <p class="mt-0.5 text-sm leading-relaxed">
            {{ store.qqBanReason || '管理员未填写原因' }}
          </p>
        </div>
        <p class="text-muted-foreground text-center text-xs">{{ untilText }}</p>
      </div>

      <div class="border-border flex items-center justify-between gap-2 border-t px-5 py-3">
        <a
          :href="ISSUE_REPO_URL"
          target="_blank"
          rel="noopener"
          class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
        >
          去仓库留言申诉
          <IconExternalLink class="size-3" />
        </a>
        <Button variant="outline" size="sm" @click="emit('update:open', false)">知道了</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
