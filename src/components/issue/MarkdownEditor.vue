<script setup>
/**
 * Markdown 编辑器：编辑 / 预览双 Tab + 选区工具栏。
 *
 * 预览复用 issue-detail 的 MarkdownView（契约：可 import，不可修改）。
 * 所有插入操作都基于 textarea 的选区，插入后把光标放回可继续输入的位置。
 */
import { computed, nextTick, onMounted, ref } from 'vue'

import { Button } from '@/components/ui/button'
import MarkdownView from '@/components/issue/MarkdownView.vue'

import IconBold from '~icons/lucide/bold'
import IconItalic from '~icons/lucide/italic'
import IconStrikethrough from '~icons/lucide/strikethrough'
import IconCode from '~icons/lucide/code'
import IconSquareCode from '~icons/lucide/square-code'
import IconTextQuote from '~icons/lucide/text-quote'
import IconList from '~icons/lucide/list'
import IconListOrdered from '~icons/lucide/list-ordered'
import IconListChecks from '~icons/lucide/list-checks'
import IconLink from '~icons/lucide/link'
import IconAtSign from '~icons/lucide/at-sign'
import IconImage from '~icons/lucide/image'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '写下你的内容…支持 Markdown' },
  minHeight: { type: String, default: '220px' },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const textareaRef = ref(null)
const tab = ref('write')

const text = computed({
  get: () => props.modelValue || '',
  set: (value) => emit('update:modelValue', value),
})

/* ------------------------------------------------------------------
 * 撤销 / 重做
 * 程序化改写 textarea.value 会清空浏览器原生 undo 栈，工具栏按钮一点
 * 原生 Ctrl+Z 就废了，所以自己维护一条快照链：historyStack[cursor] 恒等于
 * 当前内容，连续打字按时间窗口合并成一条，避免每个字符占一格。
 * ------------------------------------------------------------------ */
const TYPE_MERGE_MS = 400

let historyStack = []
let cursor = -1
let lastKind = ''
let lastAt = 0

function pushState(value, kind) {
  const now = Date.now()
  const merge =
    kind === 'type' &&
    lastKind === 'type' &&
    now - lastAt < TYPE_MERGE_MS &&
    cursor >= 0 &&
    cursor === historyStack.length - 1

  if (merge) {
    historyStack[cursor] = { value }
  } else {
    // 在撤销状态下产生新编辑，redo 分支作废
    if (cursor < historyStack.length - 1) historyStack.length = cursor + 1
    historyStack.push({ value })
    cursor = historyStack.length - 1
  }
  lastKind = kind
  lastAt = now
}

function resetHistory(value) {
  historyStack = [{ value }]
  cursor = 0
  lastKind = ''
  lastAt = 0
}

/**
 * 算出「从 current 变成 target」之后光标该落在哪。
 * 不能拿快照里存下的选区——用户事后用鼠标或方向键挪过光标，那个位置
 * 不会触发 input，历史并不知情，照搬就会跳回上一次输入结束的地方。
 * 用两份内容的公共前缀定位：变短（撤销）就停在差异起点，变长（重做）
 * 再往里推进新增的长度。
 */
function caretFor(target, current) {
  const limit = Math.min(target.length, current.length)
  let same = 0
  while (same < limit && target[same] === current[same]) same += 1
  const grew = target.length - current.length
  return grew > 0 ? Math.min(same + grew, target.length) : same
}

/** 把某个快照写回编辑器，光标落在内容实际变化的位置 */
function restore(state) {
  const el = textareaRef.value
  const caret = caretFor(state.value, el ? el.value : props.modelValue || '')
  if (tab.value !== 'write') tab.value = 'write'
  emit('update:modelValue', state.value)
  nextTick(() => {
    const node = textareaRef.value
    if (node) {
      node.focus({ preventScroll: true })
      node.setSelectionRange(caret, caret)
    }
  })
}

function undo() {
  syncExternal()
  if (cursor <= 0) return
  cursor -= 1
  restore(historyStack[cursor])
  lastKind = ''
}

function redo() {
  syncExternal()
  if (cursor >= historyStack.length - 1) return
  cursor += 1
  restore(historyStack[cursor])
  lastKind = ''
}

/**
 * 写入新值并把光标/选区放到指定位置。
 * textarea 在内容被改写后会被浏览器滚到末尾，聚焦默认也会把页面滚过去，
 * 所以这里先记住原滚动位置，设完选区再还原，视线不跳。
 */
function applyValue(next, selStart, selEnd) {
  const el = textareaRef.value
  const prevScrollTop = el ? el.scrollTop : 0

  pushState(next, 'tool')
  emit('update:modelValue', next)
  // 预览态下点工具栏，先回到编辑态才能聚焦 textarea
  if (tab.value !== 'write') tab.value = 'write'

  nextTick(() => {
    const node = textareaRef.value
    if (!node) return
    node.focus({ preventScroll: true })
    node.setSelectionRange(selStart, selEnd)
    node.scrollTop = prevScrollTop
    // 浏览器可能在随后的渲染帧里按光标位置再滚一次，下一帧补校正
    requestAnimationFrame(() => {
      if (node.scrollTop !== prevScrollTop) node.scrollTop = prevScrollTop
    })
  })
}

function onInput(event) {
  const el = event.target
  pushState(el.value, 'type')
}

onMounted(() => resetHistory(props.modelValue || ''))

/**
 * 外部把内容整个换掉（提交成功后清空、切换到另一条草稿）时，历史里的旧快照
 * 已经对不上 DOM 了，先就地重置。
 *
 * 不能用 watch 做这件事：实测 watch 会跑在 onInput 的 pushState 之前，把刚记
 * 下的那条误判成"外部改写"再重置一次，历史退化成两个同值快照，撤销表面上
 * 毫无反应。所以在撤销/重做真正用历史之前，拿 DOM 现值对齐一次最稳。
 */
function syncExternal() {
  const el = textareaRef.value
  if (!el) return
  const top = historyStack[cursor]
  if (top && top.value !== el.value) resetHistory(el.value)
}

function currentSelection() {
  const el = textareaRef.value
  const value = props.modelValue || ''
  if (!el) return { start: value.length, end: value.length }
  return { start: el.selectionStart ?? value.length, end: el.selectionEnd ?? value.length }
}

/** 用 before/after 包裹选区；无选区时插入占位词并选中它 */
function wrap(before, after = before, placeholder = '文本') {
  const value = props.modelValue || ''
  const { start, end } = currentSelection()
  const selected = value.slice(start, end) || placeholder
  const next = value.slice(0, start) + before + selected + after + value.slice(end)
  applyValue(next, start + before.length, start + before.length + selected.length)
}

/** 对选区涉及的整行加前缀，已有的列表标记会先被剥掉，避免叠加 */
function prefixLines(buildPrefix) {
  const value = props.modelValue || ''
  const { start, end } = currentSelection()
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1
  let lineEnd = value.indexOf('\n', end)
  if (lineEnd === -1) lineEnd = value.length

  const block = value.slice(lineStart, lineEnd) || ''
  const lines = block.split('\n')
  const prefixed = lines
    .map((line, index) => {
      const indent = /^\s*/.exec(line)[0]
      const bare = line.slice(indent.length).replace(/^(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+|>\s*)/, '')
      return indent + buildPrefix(index) + bare
    })
    .join('\n')

  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd)
  const caret = lineStart + prefixed.length
  applyValue(next, caret, caret)
}

/** 在光标处插入一段块级片段，并按 offset 定位光标 */
function insertBlock(snippet, offset = snippet.length) {
  const value = props.modelValue || ''
  const { start, end } = currentSelection()
  const atLineStart = start === 0 || value[start - 1] === '\n'
  const lead = atLineStart ? '' : '\n'
  const next = value.slice(0, start) + lead + snippet + value.slice(end)
  const caret = start + lead.length + offset
  applyValue(next, caret, caret)
}

const tools = [
  { key: 'bold', icon: IconBold, label: '加粗', run: () => wrap('**', '**', '加粗文本') },
  { key: 'italic', icon: IconItalic, label: '斜体', run: () => wrap('_', '_', '斜体文本') },
  { key: 'strike', icon: IconStrikethrough, label: '删除线', run: () => wrap('~~', '~~', '删除线文本') },
  { key: 'code', icon: IconCode, label: '行内代码', run: () => wrap('`', '`', 'code') },
  {
    key: 'codeblock',
    icon: IconSquareCode,
    label: '代码块',
    run: () => insertBlock('\n\n```\n\n```\n\n', 6),
  },
  { key: 'quote', icon: IconTextQuote, label: '引用', run: () => prefixLines(() => '> ') },
  { key: 'ul', icon: IconList, label: '无序列表', run: () => prefixLines(() => '- ') },
  { key: 'ol', icon: IconListOrdered, label: '有序列表', run: () => prefixLines((i) => `${i + 1}. `) },
  {
    key: 'task',
    icon: IconListChecks,
    label: '任务列表',
    run: () => prefixLines(() => '- [ ] '),
  },
  {
    key: 'link',
    icon: IconLink,
    label: '链接',
    run: () => {
      const value = props.modelValue || ''
      const { start, end } = currentSelection()
      const label = value.slice(start, end) || '链接文字'
      const snippet = `[${label}](https://)`
      const next = value.slice(0, start) + snippet + value.slice(end)
      applyValue(next, start + snippet.length - 1, start + snippet.length - 1)
    },
  },
  { key: 'mention', icon: IconAtSign, label: '提及用户', run: () => insertBlock('@', 1) },
  {
    key: 'image',
    icon: IconImage,
    label: '插入图片',
    run: () => {
      const value = props.modelValue || ''
      const { start, end } = currentSelection()
      const alt = value.slice(start, end) || '图片描述'
      const snippet = `![${alt}](https://)`
      const next = value.slice(0, start) + snippet + value.slice(end)
      applyValue(next, start + snippet.length - 1, start + snippet.length - 1)
    },
  },
]

function onKeydown(event) {
  if (event.isComposing) return

  const mod = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()

  // Ctrl/⌘+Z 撤销，Ctrl/⌘+Shift+Z 与 Ctrl+Y 重做；必须拦下浏览器原生行为，
  // 否则它会拿自己那条已被程序化改写污染的栈再改一次，两套历史互相打架。
  if (mod && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if (mod && key === 'y') {
    event.preventDefault()
    redo()
    return
  }

  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault()
    const value = props.modelValue || ''
    const el = event.target
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + '  ' + value.slice(end)
    applyValue(next, start + 2, start + 2)
    return
  }
  if (mod && event.key === 'Enter') {
    event.preventDefault()
    emit('submit')
  }
}

function setTab(next) {
  tab.value = next
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div class="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
          :class="tab === 'write' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="setTab('write')"
        >
          编辑
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
          :class="tab === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="setTab('preview')"
        >
          预览
        </button>
      </div>

      <div class="flex items-center gap-0.5 flex-wrap">
        <Button
          v-for="tool in tools"
          :key="tool.key"
          type="button"
          variant="ghost"
          size="icon-xs"
          :title="tool.label"
          :aria-label="tool.label"
          class="text-muted-foreground hover:text-foreground"
          @mousedown.prevent
          @click="tool.run"
        >
          <component :is="tool.icon" class="size-3.5" />
        </Button>
      </div>
    </div>

    <div class="rounded-lg border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/40 transition-shadow">
      <textarea
        v-show="tab === 'write'"
        ref="textareaRef"
        v-model="text"
        :placeholder="placeholder"
        :style="{ minHeight }"
        class="block w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
        @input="onInput"
        @keydown="onKeydown"
      ></textarea>

      <div v-if="tab === 'preview'" :style="{ minHeight }" class="natb-md px-3 py-2.5 overflow-x-auto">
        <MarkdownView :content="modelValue" />
        <p v-if="!modelValue" class="text-sm text-muted-foreground">没有可预览的内容</p>
      </div>
    </div>

    <p class="text-xs text-muted-foreground">
      支持 Markdown；拖入图片请先上传到图床或 GitHub 后粘贴链接
    </p>
  </div>
</template>
