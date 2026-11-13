<script setup>
/**
 * GitHub 风格的 Markdown 渲染器。
 *
 * 输入全部来自外部用户（issue 正文、评论），所以渲染链路是：
 *   markdown-it（html:false，原始 HTML 一律转义）
 *     -> DOMPurify（白名单过滤，XSS 的最后一道闸）
 *     -> v-html
 * html:false 已经让 <script>/<img onerror> 变成纯文本，DOMPurify 是第二道保险，
 * 将来若有人打开 html:true 也不会立刻变成 XSS 洞。
 */
import { computed } from 'vue'

import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const props = defineProps({
  content: { type: String, default: '' },
})

/* ---------------- 代码高亮：只注册常用语言，控制包体积 ---------------- */

const LANGUAGES = {
  bash,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
}

for (const [name, definition] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, definition)
}

function highlight(code, lang) {
  const language = String(lang || '').trim().split(/\s+/)[0].toLowerCase()
  if (!language || !hljs.getLanguage(language)) return ''
  try {
    const { value } = hljs.highlight(code, { language, ignoreIllegals: true })
    return `<pre class="natb-md__code"><code class="hljs language-${escapeHtml(language)}">${value}</code></pre>`
  } catch {
    // 高亮失败就退回 markdown-it 的默认转义输出，绝不把未转义的源码塞进 HTML
    return ''
  }
}

/* ---------------- GFM 任务列表 ---------------- */

/**
 * markdown-it 没有内置任务列表。这里在 inline 解析之后、渲染之前，
 * 把列表项首段开头的 "[ ]" / "[x]" 换成真实的 checkbox token。
 * 走 token 而不是正则替换 HTML，标签结构始终由渲染器自己保证。
 */
function taskListPlugin(md) {
  md.core.ruler.push('natb_task_list', (state) => {
    const tokens = state.tokens
    for (let i = 2; i < tokens.length; i += 1) {
      const inline = tokens[i]
      if (inline.type !== 'inline') continue

      const paragraph = tokens[i - 1]
      const item = tokens[i - 2]
      if (!paragraph || paragraph.type !== 'paragraph_open') continue
      if (!item || item.type !== 'list_item_open') continue
      // 只认列表项的第一个段落，避免把后续段落里的 "[x]" 也吃掉
      if (item.level + 1 !== paragraph.level) continue

      const children = inline.children
      if (!children || !children.length) continue
      const first = children[0]
      if (!first || first.type !== 'text') continue

      const match = /^\[([ xX])\][ \t]+/.exec(first.content)
      if (!match) continue

      const checked = match[1].toLowerCase() === 'x'
      const box = new state.Token('html_inline', '', 0)
      box.content = `<input type="checkbox" class="natb-md__task-box" disabled${checked ? ' checked' : ''}>`
      first.content = first.content.slice(match[0].length)
      children.unshift(box)

      item.attrJoin('class', 'natb-md__task')
      paragraph.attrJoin('class', 'natb-md__task-line')
    }
  })
}

/* ---------------- markdown-it 实例 ---------------- */

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight,
})

// GFM 能力：表格与删除线在 default preset 里，显式打开避免 preset 差异
try {
  md.enable(['table', 'strikethrough'])
} catch {
  /* 该版本没有这两条规则时忽略，markdown-it 的 default preset 已默认开启 */
}
md.use(taskListPlugin)

const escapeHtml = (value) => md.utils.escapeHtml(String(value))

/* 外链一律新开页签，并把 opener / referrer 掐断 */
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href') || ''
  if (/^(?:https?:)?\/\//i.test(href)) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer nofollow')
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

/* 图片：懒加载 + 不把本站 referrer 带出去 */
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  token.attrSet('alt', self.renderInlineAsText(token.children || [], options, env))
  token.attrSet('loading', 'lazy')
  token.attrSet('decoding', 'async')
  token.attrSet('referrerpolicy', 'no-referrer')
  return self.renderToken(tokens, idx, options)
}

/* ---------------- 消毒 ---------------- */

// DOMPurify v3 在浏览器里默认导出已绑定 window 的实例；打包环境偶尔给的是工厂函数，两种都接住
const purify =
  DOMPurify && typeof DOMPurify.sanitize === 'function'
    ? DOMPurify
    : DOMPurify(typeof window === 'undefined' ? undefined : window)

const SANITIZE_OPTIONS = {
  ADD_ATTR: ['target', 'rel', 'loading', 'decoding', 'referrerpolicy', 'checked', 'disabled', 'type'],
  // markdown-it 不会产出这些标签，出现即视为攻击面
  FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed', 'svg', 'math', 'base', 'link', 'meta'],
  FORBID_ATTR: ['srcset', 'formaction', 'xlink:href', 'style'],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
}

const html = computed(() => {
  const source = typeof props.content === 'string' ? props.content : ''
  if (!source.trim()) return ''
  const rendered = md.render(source)
  try {
    return purify.sanitize(rendered, SANITIZE_OPTIONS)
  } catch {
    // 极端情况下（DOMPurify 不可用）宁可不渲染，也不裸奔
    return ''
  }
})
</script>

<template>
  <div class="natb-md" v-html="html"></div>
</template>

<style>
/* 高亮 token 用主题变量着色，不引入 highlight.js 自带主题的固定色值 */

.natb-md .hljs-comment,
.natb-md .hljs-quote {
  color: var(--natb-muted-foreground);
  font-style: italic;
}

.natb-md .hljs-keyword,
.natb-md .hljs-selector-tag,
.natb-md .hljs-literal,
.natb-md .hljs-doctag,
.natb-md .hljs-type,
.natb-md .hljs-name,
.natb-md .hljs-strong {
  color: color-mix(in oklch, var(--natb-brand) 82%, var(--natb-foreground));
  font-weight: 600;
}

.natb-md .hljs-string,
.natb-md .hljs-regexp,
.natb-md .hljs-addition,
.natb-md .hljs-attribute,
.natb-md .hljs-meta .hljs-string {
  color: color-mix(in oklch, var(--natb-brand-2) 78%, var(--natb-foreground));
}

.natb-md .hljs-number,
.natb-md .hljs-symbol,
.natb-md .hljs-bullet,
.natb-md .hljs-variable,
.natb-md .hljs-template-variable,
.natb-md .hljs-link,
.natb-md .hljs-selector-attr,
.natb-md .hljs-selector-pseudo,
.natb-md .hljs-params {
  color: color-mix(in oklch, var(--natb-primary) 82%, var(--natb-foreground));
}

.natb-md .hljs-title,
.natb-md .hljs-title.class_,
.natb-md .hljs-title.function_,
.natb-md .hljs-built_in,
.natb-md .hljs-selector-class,
.natb-md .hljs-selector-id {
  color: color-mix(in oklch, var(--natb-accent-foreground) 62%, var(--natb-brand));
  font-weight: 600;
}

.natb-md .hljs-attr,
.natb-md .hljs-property,
.natb-md .hljs-meta,
.natb-md .hljs-section {
  color: var(--natb-foreground);
}

.natb-md .hljs-deletion {
  color: var(--natb-destructive);
}

.natb-md .hljs-emphasis {
  font-style: italic;
}

.natb-md .hljs-strong {
  font-weight: 700;
}

/* ---------- 任务列表 ---------- */

.natb-md li.natb-md__task {
  list-style: none;
}

/* 紧凑列表里 markdown-it 会隐藏段落标签，松散列表里需要内联才不出多余的块间距 */
.natb-md li.natb-md__task > p {
  display: inline;
  margin: 0;
}

.natb-md .natb-md__task-box {
  margin-right: 0.45em;
  vertical-align: middle;
  accent-color: var(--natb-primary);
}

/* ---------- 代码块 ---------- */

.natb-md pre.natb-md__code {
  position: relative;
}

.natb-md pre.natb-md__code code.hljs {
  display: block;
  background: transparent;
}
</style>
