/**
 * 能力探测：WebGL2 + createImageBitmap + OffscreenCanvas 三样齐了才算可用。
 * 任何一样缺、或者上下文建不出来 / 渲染目标不完整，一律返回 false —— 调用方据此
 * 走完全没有改动过的旧路径（CSS filter: blur + <img>）。
 * 探测结果只算一次：探针本身要建一个 GL 上下文，逐帧问会反复建销。
 */

let memo = null

/** 验回退用：?no-webgl 强制关闭（等价于设备没有 WebGL2） */
function forcedOff() {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('no-webgl')
  } catch {
    return false
  }
}

function probe() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (typeof createImageBitmap !== 'function') return false
  if (typeof OffscreenCanvas === 'undefined') return false
  if (forcedOff()) return false
  try {
    const canvas = new OffscreenCanvas(8, 8)
    const gl = canvas.getContext('webgl2', { depth: false, stencil: false, antialias: false })
    if (!gl) return false
    // 不能只看上下文存在：还要确认「渲染到纹理」这条链真的通（烘焙全靠它）
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 8, 8, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return ok
  } catch {
    return false
  }
}

export function isWebglAvailable() {
  if (memo === null) memo = probe()
  return memo
}
