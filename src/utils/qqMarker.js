/**
 * QQ 身份标记：代发的 issue / 评论正文尾部带一段隐藏注释，
 *    <!-- natb:qq {"sub":"a1b2…","nick":"小明","masked":"ab***@qq.com"} -->
 * 前端据此把作者显示成「QQ 用户 小明」，并在渲染 Markdown 前把它剥掉。
 */
const MARKER_RE = /<!--\s*natb:qq\s+(\{[\s\S]*?\})\s*-->/

export function parseQqMarker(body) {
  const match = String(body || '').match(MARKER_RE)
  if (!match) return null
  try {
    const data = JSON.parse(match[1])
    return data && data.sub ? data : null
  } catch {
    return null
  }
}

/** 去掉隐藏标记与那行可见署名，避免正文末尾留一块空白 */
export function stripQqMarker(body) {
  return String(body || '')
    .replace(/\s*<sub>QQ 用户[\s\S]*?通过 NATB 官网提交<\/sub>\s*/, '')
    .replace(/\s*<!--\s*natb:qq\s+\{[\s\S]*?\}\s*-->\s*$/, '')
    .trimEnd()
}

/** 作者显示名：QQ 用户优先，否则退回 GitHub login */
export function authorLabel(user, body) {
  const marker = parseQqMarker(body)
  if (marker) return 'QQ 用户 ' + (marker.nick || marker.sub.slice(0, 4))
  return (user && user.login) || 'ghost'
}
