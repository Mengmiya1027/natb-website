<script setup>
/**
 * 评论编辑器：MarkdownEditor + 提交。
 * replyTo 有值时顶部显示被回复的人，取消按钮交给宿主决定是否关闭整个编辑区。
 */
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

import { useIssueStore } from '@/stores/issue'
import { githubWriteApi } from '@/api/github'
import { qqWriteApi } from '@/api/qqWrite'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import MarkdownEditor from '@/components/issue/MarkdownEditor.vue'

import IconMessageSquare from '~icons/lucide/message-square'
import IconX from '~icons/lucide/x'
import IconLoader2 from '~icons/lucide/loader-2'
import IconSend from '~icons/lucide/send'

const props = defineProps({
  issueNumber: { type: Number, default: 0 },
  replyTo: { type: String, default: '' },
})

const emit = defineEmits(['submitted', 'cancel'])

const store = useIssueStore()

const body = ref('')
const submitting = ref(false)
const errorText = ref('')

const canSubmit = computed(() => Boolean(body.value.trim()) && !submitting.value)

/** QQ 身份由中转代发，与 GitHub 身份共用同一套入参 */
const writeApi = computed(() => (store.writeMode === 'qq' ? qqWriteApi : githubWriteApi))

async function submit() {
  if (!store.canWrite) {
    toast.error(store.qqBanned ? '该 QQ 账号已被封禁，无法评论' : '请先登录后再发表评论')
    return
  }
  if (!props.issueNumber) {
    toast.error('缺少 issue 编号，无法评论')
    return
  }
  const content = body.value.trim()
  if (!content) {
    toast.error('评论内容不能为空')
    return
  }

  submitting.value = true
  errorText.value = ''
  try {
    await writeApi.value.createComment(props.issueNumber, content)
    toast.success('评论已发布')
    body.value = ''
    emit('submitted')
  } catch (err) {
    errorText.value = err?.message || String(err)
    toast.error(errorText.value)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="rounded-xl border border-border bg-card p-3 shadow-sm">
    <div
      v-if="replyTo"
      class="mb-2 flex items-center justify-between gap-2 rounded-lg bg-accent px-2.5 py-1.5 text-xs text-accent-foreground"
    >
      <span class="flex items-center gap-1.5 min-w-0">
        <IconMessageSquare class="size-3.5 shrink-0" />
        <span class="truncate">回复 @{{ replyTo }}</span>
      </span>
      <button
        type="button"
        class="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        title="取消回复"
        @click="emit('cancel')"
      >
        <IconX class="size-3.5" />
      </button>
    </div>

    <MarkdownEditor
      v-model="body"
      placeholder="写下你的评论…"
      min-height="140px"
      @submit="submit"
    />

    <Alert v-if="errorText" variant="destructive" class="mt-2">
      <AlertDescription>{{ errorText }}</AlertDescription>
    </Alert>

    <div class="mt-3 flex items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">
        <template v-if="store.isLoggedIn">Ctrl / ⌘ + Enter 快速发布</template>
        <template v-else>登录后即可发表评论</template>
      </p>
      <div class="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" :disabled="submitting" @click="emit('cancel')">
          取消
        </Button>
        <Button type="button" size="sm" :disabled="!canSubmit" @click="submit">
          <IconLoader2 v-if="submitting" class="size-4 animate-spin" />
          <IconSend v-else class="size-4" />
          <span>{{ submitting ? '发布中…' : '发表评论' }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>
