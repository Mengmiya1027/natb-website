/**
 * 位图烘焙器：一张 OffscreenCanvas + 一个 WebGL2 上下文，把「封面按 cover 铺满 →
 * 高斯模糊（横竖两趟分离卷积）→ saturate」一次烘成一张 ImageBitmap。
 * 取代 .face__wash 上的 CSS filter: blur(10px) saturate(1.2)：
 * 那层的绘制面积是整张卡的 1.64 倍、八面各一层，每次尺寸变化都要重新光栅化。
 *
 * 烘焙尺寸固定 16:9（卡片本身也是 16:9 一档），cover 映射在 shader 里算 ——
 * 与 background-size: cover 同一套算法，所以换掉之后纸面上的纹理位置不变。
 */

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  // 上下翻一次在这里做：ImageBitmap 源会忽略 UNPACK_FLIP_Y_WEBGL（规范如此），
  // 直接上传的纹理 uv.y=0 是源图顶端；把顶点翻过来，uv.y=0 就落在画布顶行，
  // transferToImageBitmap 出来的图才和原图同向。
  gl_Position = vec4(aPos.x, -aPos.y, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uSrcScale;  // 目标 uv → 源 uv 的缩放（cover 裁剪）
uniform vec2 uDir;       // 本趟的采样步长（uv 空间，含 sigma）
uniform float uSaturate;

vec3 sampleSrc(vec2 uv) {
  return texture(uSrc, (uv - 0.5) * uSrcScale + 0.5).rgb;
}

void main() {
  // 9 档双向 = 17 taps，步长 = 0.375σ（±3σ 覆盖 99.7%），权重 exp(-i²·9/128)
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = -8; i <= 8; i++) {
    float fi = float(i);
    float w = exp(-0.0703125 * fi * fi);
    acc += sampleSrc(vUV + uDir * fi) * w;
    wsum += w;
  }
  vec3 c = acc / wsum;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  outColor = vec4(mix(vec3(lum), c, uSaturate), 1.0);
}`

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error('gl 着色器编译失败: ' + log)
  }
  return sh
}

let state = null

function init() {
  const canvas = new OffscreenCanvas(16, 16)
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  })
  if (!gl) return null
  const prog = gl.createProgram()
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('gl 链接失败: ' + gl.getProgramInfoLog(prog))
  }
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  state = {
    canvas,
    gl,
    prog,
    vao,
    u: {
      src: gl.getUniformLocation(prog, 'uSrc'),
      scale: gl.getUniformLocation(prog, 'uSrcScale'),
      dir: gl.getUniformLocation(prog, 'uDir'),
      sat: gl.getUniformLocation(prog, 'uSaturate'),
    },
    srcTex: gl.createTexture(),
    dstTex: gl.createTexture(),
    fbo: gl.createFramebuffer(),
  }
  gl.bindTexture(gl.TEXTURE_2D, state.srcTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindTexture(gl.TEXTURE_2D, state.dstTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return state
}

function ensure() {
  if (state) return state
  try {
    return init()
  } catch (err) {
    console.warn('[gl] 烘焙器初始化失败，回退 CSS 路径：', err)
    state = null
    return null
  }
}

/**
 * 烘焙一张「模糊 + 纸色暗纱之前的封面」位图。
 * @param {ImageBitmap} source 已解码的封面
 * @param {{width:number,height:number,sigma?:number,saturate?:number}} opts
 *   sigma 按烘焙像素计（CSS blur(10px) ≈ σ10 在卡片原尺寸上，缩到烘焙尺寸同比缩）
 * @returns {ImageBitmap|null}
 */
export function bakeWashBitmap(source, opts) {
  const s = ensure()
  if (!s || !source) return null
  const { gl } = s
  const width = Math.max(1, Math.round(opts.width))
  const height = Math.max(1, Math.round(opts.height))
  const sigma = Math.max(0.01, opts.sigma ?? 5)
  const saturate = opts.saturate ?? 1.2
  const srcW = source.width
  const srcH = source.height
  if (!srcW || !srcH) return null

  s.canvas.width = width
  s.canvas.height = height

  // cover：取能铺满目标盒的那一档缩放，多出来的部分居中裁掉
  const cover = Math.max(width / srcW, height / srcH)

  gl.useProgram(s.prog)
  gl.bindVertexArray(s.vao)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, s.srcTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  gl.bindTexture(gl.TEXTURE_2D, s.dstTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

  // 第 1 趟：横向。源是原图（cover 缩放），目标是 dstTex
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.dstTex, 0)
  gl.bindTexture(gl.TEXTURE_2D, s.srcTex)
  // 横趟：只沿 u 走，v 方向步长为 0
  gl.uniform2f(s.u.dir, (sigma * 0.375) / width, 0)
  gl.uniform2f(s.u.scale, width / (srcW * cover), height / (srcH * cover))
  gl.uniform1f(s.u.sat, 1)
  gl.uniform1i(s.u.src, 0)
  gl.viewport(0, 0, width, height)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 3)

  // 第 2 趟：纵向 + saturate，目标直接是画布（之后 transferToImageBitmap 取走）
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindTexture(gl.TEXTURE_2D, s.dstTex)
  gl.uniform2f(s.u.dir, 0, (sigma * 0.375) / height)
  gl.uniform2f(s.u.scale, 1, 1)
  gl.uniform1f(s.u.sat, saturate)
  gl.drawArrays(gl.TRIANGLES, 0, 3)

  return s.canvas.transferToImageBitmap()
}

export function disposeBaker() {
  if (!state) return
  const { gl } = state
  try {
    gl.deleteTexture(state.srcTex)
    gl.deleteTexture(state.dstTex)
    gl.deleteFramebuffer(state.fbo)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    /* 上下文已丢：无需再收 */
  }
  state.canvas.width = 1
  state.canvas.height = 1
  state = null
}
