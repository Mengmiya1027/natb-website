<script setup>
/**
 * AeroShards —— react-bits 的 WebGPU 碎片背景
 *
 * 忠实移植自 react.jsx 原版：着色器字符串、常量表、vgpu 管线调用与渲染顺序全部原样保留，
 * 没有为了"好读"去改一个字符。只换框架接线：
 *   useRef → template ref，useEffect → onMounted/onUnmounted，props 默认值 → defineProps，
 *   onError 回调 → error 事件。
 *
 * 另有三处本地化：
 *   1. 类名与 canvas 尺寸交给 scoped 样式（原版靠 Tailwind + 独立 css 文件）；
 *   2. WebGPU 拿不到或 vgpu 初始化失败时安静返回，兜底由父组件决定（首页是 hero__fallback）；
 *   3. 停帧开关：props.paused 或系统要求少动效时不再续帧，画面停在最后一帧。
 */
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { draw, effect, frame, init, sampler, storage, surface, target, uniforms } from 'vgpu'

const ROOT = 'aero-shards';
const CANVAS = 'aero-shards-canvas';

const PLACEMENTS = ['full', 'left', 'right', 'center'];
const MATERIALS = {
  glass: [0, 0, 0, 0],
  chrome: [1, 0, 0, 0]
};
const FLOATS = 24;
const SAMPLES = 160;
const CAMERA = 4;
const FOCUS = 3.1;
const SHARD_FOCUS = 2.75;
const LAYER_SCALES = [1, 0.5];
const MAX_BANK = 1.0;
const DEPTHS = [2.7, 3.9, 5.6, 8.1, 11.6];
const SHARE = [0.26, 0.23, 0.2, 0.17, 0.14];
const GROWTH = [1, 1.3, 1.8, 2.6, 3.6];
const FADE = [1, 0.8, 0.52, 0.32, 0.2];
const LEVELS = DEPTHS.length;
const INTRO_SECONDS = 3.4;
const MARKER_STYLES = { plus: 0, dots: 1 };
const MARKER_FLOATS = 8;
const MARKER_PHASES = [
  [0.37, 0.61],
  [0.83, 0.12],
  [0.21, 0.88],
  [0.66, 0.44],
  [0.05, 0.27]
];
const MAX_RINGS = 4;
const RING_SECONDS = 2.6;
const BLOOM_LEVELS = 4;
const FULL_SLOPES = [
  [0.2, -0.78],
  [-0.72, 0.02],
  [0.58, -0.06],
  [-0.24, 0.62],
  [0.8, 0.3]
];
const SIDE_OFFSETS = [0.84, 0.62, 0.44, 0.28, 0.14];
const RING_SIZES = [
  [0.98, 0.78],
  [0.9, 0.7],
  [0.84, 0.64],
  [0.8, 0.6],
  [0.76, 0.56]
];
const TAU = Math.PI * 2;

const SHARD_SHADER = `
struct Frame {
  view: vec4f,
  eye: vec4f,
  forward: vec4f,
  right: vec4f,
  up: vec4f,
  shard: vec4f,
  accent: vec4f,
  marker: vec4f,
  surface: vec4f,
}

struct Layer {
  view: vec4f,
  look: vec4f,
}

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat, first) center: vec4f,
  @location(1) @interpolate(flat, first) axis: vec4f,
  @location(2) @interpolate(flat, first) normal: vec4f,
  @location(3) @interpolate(flat, first) p01: vec4f,
  @location(4) @interpolate(flat, first) p23: vec4f,
  @location(5) @interpolate(flat, first) p4: vec4f,
  @location(6) @interpolate(flat, first) topA: vec4f,
  @location(7) @interpolate(flat, first) topB: vec4f,
  @location(8) @interpolate(flat, first) topC: vec4f,
  @location(9) @interpolate(flat, first) bottomA: vec4f,
  @location(10) @interpolate(flat, first) bottomB: vec4f,
  @location(11) @interpolate(flat, first) bottomC: vec4f,
}

struct FragmentOut {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
}

@group(0) @binding(0) var<uniform> scene: Frame;
@group(0) @binding(1) var<storage, read> shards: array<vec4f>;
@group(0) @binding(2) var<uniform> layerInfo: Layer;

fn project(world: vec3f) -> vec3f {
  let offset = world - scene.eye.xyz;
  let depth = max(dot(offset, scene.forward.xyz), 0.05);
  let x = dot(offset, scene.right.xyz);
  let y = dot(offset, scene.up.xyz);
  return vec3f(layerInfo.view.x * 0.5 + x * layerInfo.view.z / depth, layerInfo.view.y * 0.5 - y * layerInfo.view.z / depth, depth);
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let index = instance * 6u;
  let a = shards[index];
  let b = shards[index + 1u];
  let c = shards[index + 2u];
  let d = shards[index + 3u];
  let e = shards[index + 4u];
  let f = shards[index + 5u];
  let center = a.xyz;
  let size = a.w;
  let axis = normalize(b.xyz);
  let normal = normalize(c.xyz);
  let side = normalize(cross(normal, axis));

  var out: VertexOut;
  let middle = project(center);
  if (middle.z < 0.35 || size <= 0.0) {
    out.position = vec4f(2.0, 2.0, 0.5, 1.0);
    return out;
  }

  let count = i32(f.z);
  let points = array<vec2f, 5>(d.xy, d.zw, e.xy, e.zw, f.xy);
  var low = vec2f(1e9);
  var high = vec2f(-1e9);
  var tops = array<vec2f, 5>(vec2f(0.0), vec2f(0.0), vec2f(0.0), vec2f(0.0), vec2f(0.0));
  var bottoms = array<vec2f, 5>(vec2f(0.0), vec2f(0.0), vec2f(0.0), vec2f(0.0), vec2f(0.0));
  for (var i = 0; i < 5; i += 1) {
    let corner = points[min(i, count - 1)];
    let onPlate = center + (axis * corner.x + side * corner.y) * size;
    let top = project(onPlate + normal * b.w * size);
    let bottom = project(onPlate - normal * b.w * size);
    tops[i] = top.xy;
    bottoms[i] = bottom.xy;
    low = min(low, min(top.xy, bottom.xy));
    high = max(high, max(top.xy, bottom.xy));
  }
  low -= vec2f(2.0);
  high += vec2f(2.0);
  let corners = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
  let pixel = mix(low, high, corners[vertexIndex]);
  out.position = vec4f(pixel.x / layerInfo.view.x * 2.0 - 1.0, 1.0 - pixel.y / layerInfo.view.y * 2.0, 0.5, 1.0);
  out.center = a;
  out.axis = vec4f(axis, b.w);
  out.normal = vec4f(normal, c.w);
  out.p01 = d;
  out.p23 = e;
  out.p4 = f;
  out.topA = vec4f(tops[0], tops[1]);
  out.topB = vec4f(tops[2], tops[3]);
  out.topC = vec4f(tops[4], 0.0, 0.0);
  out.bottomA = vec4f(bottoms[0], bottoms[1]);
  out.bottomB = vec4f(bottoms[2], bottoms[3]);
  out.bottomC = vec4f(bottoms[4], 0.0, 0.0);
  return out;
}

fn cross2(a: vec2f, b: vec2f) -> f32 {
  return a.x * b.y - a.y * b.x;
}

fn outlineCoverage(p: vec2f, points: array<vec2f, 5>, count: i32) -> f32 {
  var area = 0.0;
  for (var i = 0; i < 5; i += 1) {
    if (i < count) {
      area += cross2(points[i], points[(i + 1) % count]);
    }
  }
  let orient = select(-1.0, 1.0, area > 0.0);
  var distance = -1e9;
  for (var i = 0; i < 5; i += 1) {
    if (i < count) {
      let a = points[i];
      let edge = points[(i + 1) % count] - a;
      let span = length(edge);
      if (span > 1e-4) {
        let n = vec2f(edge.y, -edge.x) * (orient / span);
        distance = max(distance, dot(p - a, n));
      }
    }
  }
  return clamp(0.5 - distance, 0.0, 1.0);
}

struct Prism {
  points: array<vec2f, 5>,
  count: i32,
  half: f32,
}

struct Hit {
  near: f32,
  far: f32,
  normal: vec3f,
}

fn plane(prism: Prism, k: i32) -> vec4f {
  if (k == 0) { return vec4f(0.0, 0.0, 1.0, prism.half); }
  if (k == 1) { return vec4f(0.0, 0.0, -1.0, prism.half); }
  let a = prism.points[k - 2];
  let b = prism.points[(k - 1) % prism.count];
  let edge = b - a;
  let n = normalize(vec2f(edge.y, -edge.x));
  return vec4f(n, 0.0, dot(n, a));
}

fn trace(prism: Prism, ro: vec3f, rd: vec3f) -> Hit {
  var hit: Hit;
  hit.near = -1e9;
  hit.far = 1e9;
  hit.normal = vec3f(0.0, 0.0, 1.0);
  for (var k = 0; k < 7; k += 1) {
    if (k < prism.count + 2) {
      let p = plane(prism, k);
      let denom = dot(p.xyz, rd);
      let gap = p.w - dot(p.xyz, ro);
      if (abs(denom) < 1e-7) {
        if (gap < 0.0) { hit.far = -1e9; }
      } else {
        let t = gap / denom;
        if (denom < 0.0) {
          if (t > hit.near) {
            hit.near = t;
            hit.normal = p.xyz;
          }
        } else if (t < hit.far) {
          hit.far = t;
        }
      }
    }
  }
  return hit;
}

fn exitFrom(prism: Prism, ro: vec3f, rd: vec3f) -> vec4f {
  var best = 1e9;
  var normal = vec3f(0.0, 0.0, -1.0);
  for (var k = 0; k < 7; k += 1) {
    if (k < prism.count + 2) {
      let p = plane(prism, k);
      let denom = dot(p.xyz, rd);
      if (denom > 1e-6) {
        let t = (p.w - dot(p.xyz, ro)) / denom;
        if (t < best) {
          best = t;
          normal = p.xyz;
        }
      }
    }
  }
  return vec4f(normal, max(best, 0.0));
}

fn rectLight(r: vec3f, dir: vec3f, across: vec3f, extent: vec2f, soft: f32) -> f32 {
  let facing = dot(r, dir);
  if (facing <= 0.0) { return 0.0; }
  let up = cross(dir, across);
  let u = dot(r, across) / facing;
  let v = dot(r, up) / facing;
  let a = 1.0 - smoothstep(extent.x - soft, extent.x + soft, abs(u));
  let b = 1.0 - smoothstep(extent.y - soft, extent.y + soft, abs(v));
  return a * b;
}

const KEY_DIR = vec3f(-0.28, 0.72, 0.64) / length(vec3f(-0.28, 0.72, 0.64));
const KEY_ACROSS = vec3f(0.92, 0.0, 0.4) / length(vec3f(0.92, 0.0, 0.4));
const LEFT_DIR = vec3f(-0.86, 0.12, 0.5) / length(vec3f(-0.86, 0.12, 0.5));
const LEFT_ACROSS = vec3f(0.5, 0.0, 0.86) / length(vec3f(0.5, 0.0, 0.86));
const RIM_DIR = vec3f(0.78, 0.22, -0.58) / length(vec3f(0.78, 0.22, -0.58));
const RIM_ACROSS = vec3f(0.6, 0.0, 0.8) / length(vec3f(0.6, 0.0, 0.8));
const TOP_DIR = vec3f(0.05, 0.94, -0.33) / length(vec3f(0.05, 0.94, -0.33));
const TOP_ACROSS = vec3f(1.0, 0.0, 0.0);

fn lobe(r: vec3f, dir: vec3f, width: f32) -> f32 {
  return exp((dot(r, dir) - 1.0) / (width * width));
}

fn studio(r: vec3f, soft: f32, accent: vec3f, ink: vec3f) -> vec3f {
  let sky = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
  var col = mix(ink * 0.03, ink * 0.12 + accent * 0.03, smoothstep(0.25, 0.95, sky));
  col += mix(ink, vec3f(1.0), 0.6) * lobe(r, KEY_DIR, 0.38) * 3.6;
  col += mix(accent, vec3f(1.0), 0.2) * lobe(r, RIM_DIR, 0.34) * 3.4;
  col += vec3f(1.0, 0.98, 1.0) * rectLight(r, LEFT_DIR, LEFT_ACROSS, vec2f(0.12, 0.8), 0.08 + soft) * 3.2;
  col += vec3f(1.0, 0.98, 1.0) * rectLight(r, TOP_DIR, TOP_ACROSS, vec2f(0.9, 0.1), 0.08 + soft) * 2.6;
  return col;
}

fn studioLight(r: vec3f, soft: f32, accent: vec3f) -> vec3f {
  let ground = vec3f(0.2, 0.2, 0.23);
  let skyTone = vec3f(0.97, 0.97, 0.99);
  var col = mix(ground, skyTone, smoothstep(-0.08 - soft, 0.16 + soft, r.y));
  col = mix(col, vec3f(0.55, 0.55, 0.6), lobe(r, vec3f(0.0, -1.0, 0.0), 0.5) * 0.4);
  col += vec3f(0.4) * rectLight(r, KEY_DIR, KEY_ACROSS, vec2f(0.46, 0.3), 0.07 + soft);
  col -= vec3f(0.55) * rectLight(r, LEFT_DIR, LEFT_ACROSS, vec2f(0.1, 0.85), 0.05 + soft);
  col -= vec3f(0.45) * rectLight(r, RIM_DIR, RIM_ACROSS, vec2f(0.12, 0.9), 0.05 + soft);
  return clamp(col, vec3f(0.05), vec3f(1.2));
}

fn schlick(cosine: f32, f0: f32) -> f32 {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(cosine, 0.0, 1.0), 5.0);
}

fn rayFor(pixel: vec2f) -> vec3f {
  let x = pixel.x - layerInfo.view.x * 0.5;
  let y = layerInfo.view.y * 0.5 - pixel.y;
  return normalize(scene.forward.xyz * layerInfo.view.z + scene.right.xyz * x + scene.up.xyz * y);
}

struct Surface {
  coverage: f32,
  color: vec3f,
  alpha: f32,
  depth: f32,
}

fn shade(pixel: vec2f, in: VertexOut) -> Surface {
  let center = in.center.xyz;
  let size = in.center.w;
  let axis = in.axis.xyz;
  let plateNormal = in.normal.xyz;
  let side = normalize(cross(plateNormal, axis));
  var prism: Prism;
  prism.points = array<vec2f, 5>(in.p01.xy, in.p01.zw, in.p23.xy, in.p23.zw, in.p4.xy);
  prism.count = i32(in.p4.z);
  prism.half = in.axis.w;

  let eye = scene.eye.xyz;
  let toLocal = mat3x3f(axis.x, side.x, plateNormal.x, axis.y, side.y, plateNormal.y, axis.z, side.z, plateNormal.z);
  let fromLocal = mat3x3f(axis, side, plateNormal);
  let origin = toLocal * (eye - center) / size;

  let rd = rayFor(pixel);
  let ray = toLocal * rd;
  let denom = dot(ray, vec3f(0.0, 0.0, 1.0));
  let flatT = -origin.z / select(denom, 1e-4, abs(denom) < 1e-4);
  let flatPoint = origin.xy + ray.xy * flatT;
  let footprint = max(length(fwidth(flatPoint)) * 0.7, 1e-4);
  let softBase = clamp(length(fwidth(reflect(rd, plateNormal))) * 0.5, 0.0, 0.5);

  let primary = trace(prism, origin, ray);
  let tops = array<vec2f, 5>(in.topA.xy, in.topA.zw, in.topB.xy, in.topB.zw, in.topC.xy);
  let bottoms = array<vec2f, 5>(in.bottomA.xy, in.bottomA.zw, in.bottomB.xy, in.bottomB.zw, in.bottomC.xy);
  let coverage = max(outlineCoverage(pixel, tops, prism.count), outlineCoverage(pixel, bottoms, prism.count));

  var surface: Surface;
  let facing = select(-1.0, 1.0, origin.z > 0.0);
  let capT = (facing * prism.half - origin.z) / select(ray.z, -1e-4 * facing, abs(ray.z) < 1e-4);
  let missed = primary.near > primary.far;
  let hitT = select(primary.near, capT, missed);
  let hitNormal = select(primary.normal, vec3f(0.0, 0.0, facing), missed);
  surface.coverage = select(0.0, coverage, hitT > 0.0);
  surface.color = vec3f(0.0);
  surface.alpha = 0.0;
  surface.depth = 1.0;
  if (surface.coverage <= 0.0) { return surface; }
  let mainRay = ray;

  let local = origin + mainRay * hitT;
  let worldRay = fromLocal * mainRay;
  let viewDepth = max(hitT * size * dot(worldRay, scene.forward.xyz), 0.05);
  surface.depth = clamp(1.0 - 0.3 / viewDepth, 0.0, 1.0);

  let radius = max(prism.half * 1.15, footprint * 2.5);
  var n = hitNormal;
  var bevel = 0.0;
  if (abs(n.z) > 0.5) {
    var gap = 1e9;
    for (var k = 2; k < 7; k += 1) {
      if (k < prism.count + 2) {
        let p = plane(prism, k);
        gap = min(gap, p.w - dot(p.xy, local.xy));
      }
    }
    var toward = vec2f(0.0);
    for (var k = 2; k < 7; k += 1) {
      if (k < prism.count + 2) {
        let p = plane(prism, k);
        let g = p.w - dot(p.xy, local.xy);
        toward += p.xy * exp(-(g - gap) / (radius * 0.35));
      }
    }
    toward = normalize(toward);
    bevel = clamp(1.0 - gap / radius, 0.0, 1.0);
    let angle = bevel * bevel * 0.7853982;
    n = normalize(n * cos(angle) + vec3f(toward, 0.0) * sin(angle));
  } else {
    let gap = prism.half - abs(local.z);
    bevel = clamp(1.0 - gap / radius, 0.0, 1.0);
    let angle = bevel * bevel * 0.7853982;
    n = normalize(n * cos(angle) + vec3f(0.0, 0.0, sign(local.z)) * sin(angle));
  }
  let bendRate = 1.8 / max(radius / footprint, 1.0);
  let normal = normalize(fromLocal * n);
  let view = -worldRay;
  let reflected = reflect(worldRay, normal);
  let soft = softBase + bendRate * smoothstep(0.0, 0.25, bevel) * 1.2 + clamp(footprint * 0.6, 0.0, 0.5);
  let ndv = clamp(dot(normal, view), 0.0, 1.0);

  let accent = scene.accent.rgb;
  let base = scene.shard.rgb;
  let world = center + fromLocal * local * size;
  let height = clamp(0.5 + world.y * 0.45, 0.0, 1.0);
  let tone = mix(accent, base, height);
  let body = mix(tone, mix(base, accent, 0.5), in.normal.w * 0.3);
  let mode = scene.surface.x;
  let lightMode = scene.up.w > 0.5;
  let wrap = clamp(dot(normal, KEY_DIR) * 0.5 + 0.5, 0.0, 1.0);

  var color = vec3f(0.0);
  var alpha = 1.0;
  let chrome = mode > 0.5;
  if (lightMode) {
    let env = studioLight(reflected, soft, accent);
    if (chrome) {
      color = env * mix(body, vec3f(1.0), 0.6);
    } else {
      let fresnel = schlick(ndv, 0.05);
      let diffuse = clamp(dot(normal, KEY_DIR) * 0.5 + 0.5, 0.0, 1.0);
      alpha = clamp(0.32 + fresnel * 0.5 + (1.0 - abs(n.z)) * 0.5, 0.0, 1.0);
      color = mix(body, vec3f(1.0), 0.15) * (0.5 + 0.4 * diffuse) * alpha + (env - vec3f(0.78)) * fresnel * 0.8;
    }
  } else if (chrome) {
    let env = studio(reflected, soft, accent, body);
    color = env * mix(body, vec3f(1.0), 0.55) * 0.9 + body * 0.02;
  } else {
    let fresnel = schlick(ndv, 0.04);
    let env = studio(reflected, soft, accent, body);
    var light = vec3f(0.0);
    var cursor = local;
    var direction = toLocal * refract(worldRay, normal, 1.0 / 1.5);
    var travelled = 0.0;
    var carry = 1.0 - fresnel;
    var through = 0.0;
    for (var bounce = 0; bounce < 3; bounce += 1) {
      let outlet = exitFrom(prism, cursor, direction);
      travelled += outlet.w;
      cursor = cursor + direction * outlet.w;
      let outward = outlet.xyz;
      let escaped = refract(direction, -outward, 1.5);
      if (dot(escaped, escaped) > 0.0) {
        let leave = schlick(dot(direction, outward), 0.04);
        let worldOut = normalize(fromLocal * escaped);
        let absorb = exp(-(vec3f(1.0) - body) * travelled * size * 22.0);
        let straight = smoothstep(0.97, 0.999, dot(worldOut, worldRay));
        let energy = carry * (1.0 - leave);
        light += studio(worldOut, soft * 2.0 + 0.04, accent, body) * absorb * energy * (1.0 - straight) * 2.0;
        through += energy * straight * (absorb.r + absorb.g + absorb.b) / 3.0;
        carry *= leave;
      }
      direction = reflect(direction, outward);
    }
    let edge = max(pow(1.0 - abs(n.z), 1.2), bevel * bevel * 0.85);
    let glow = mix(mix(body, accent, 0.35), vec3f(1.0), 0.28) * edge * (0.35 + 0.45 * wrap);
    color = env * fresnel * 0.85 + light * (1.0 - smoothstep(0.0, 0.6, bevel)) + body * 0.02 + glow;
    alpha = clamp(1.0 - through + edge * 0.25, 0.0, 1.0);
  }

  color *= select(1.3, 1.0, lightMode);
  let haze = smoothstep(3.5, 12.0, viewDepth) * layerInfo.look.x;
  let hazeColor = select(mix(base, accent, 0.5) * 0.3, mix(base, vec3f(1.0), 0.72), lightMode);
  color = mix(color, hazeColor * alpha + color * 0.3, haze);
  let flash = in.p4.w;
  color += mix(accent, vec3f(1.0), 0.35) * flash * select(0.5, 0.0, lightMode) * max(alpha, 0.35);
  alpha = max(alpha, flash * 0.45 * select(1.0, 0.0, lightMode));
  surface.color = color;
  surface.alpha = alpha;
  return surface;
}

@fragment
fn fs_solid(in: VertexOut) -> FragmentOut {
  let surface = shade(in.position.xy, in);
  if (surface.coverage < 0.999 || surface.alpha < 0.6) { discard; }
  var out: FragmentOut;
  out.color = vec4f(surface.color, surface.alpha);
  out.depth = surface.depth;
  return out;
}

@fragment
fn fs_edge(in: VertexOut) -> FragmentOut {
  let surface = shade(in.position.xy, in);
  if (surface.coverage <= 0.001 || (surface.coverage >= 0.9996 && surface.alpha >= 0.62)) { discard; }
  var out: FragmentOut;
  out.color = vec4f(surface.color, surface.alpha) * surface.coverage;
  out.depth = surface.depth;
  return out;
}
`;

const LAYER_BLUR_SHADER = `
struct Spread { texel: vec4f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> spreadInfo: Spread;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sigma = max(spreadInfo.texel.z, 0.3);
  let reach = min(i32(ceil(sigma * 2.6)), 20);
  var total = textureSampleLevel(source, linearSampler, uv, 0.0);
  var weight = 1.0;
  for (var i = 1; i <= reach; i += 1) {
    let w = exp(-f32(i * i) / (2.0 * sigma * sigma));
    let o = spreadInfo.texel.xy * f32(i);
    total += (textureSampleLevel(source, linearSampler, uv + o, 0.0) + textureSampleLevel(source, linearSampler, uv - o, 0.0)) * w;
    weight += 2.0 * w;
  }
  return total / weight;
}
`;

const SHADOW_SHADER = `
struct Shade {
  info: vec4f,
  more: vec4f,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var depthMap: texture_depth_2d;
@group(0) @binding(2) var<uniform> shadeInfo: Shade;

@fragment
fn fs_main(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let bounds = vec2i(textureDimensions(source)) - vec2i(1);
  let here = vec2i(pixel.xy);
  let color = textureLoad(source, here, 0);
  if (color.a <= 0.002 || shadeInfo.info.z <= 0.0) { return color; }
  let depth = textureLoad(depthMap, here, 0);
  let east = textureLoad(depthMap, clamp(here + vec2i(1, 0), vec2i(0), bounds), 0);
  let west = textureLoad(depthMap, clamp(here - vec2i(1, 0), vec2i(0), bounds), 0);
  let south = textureLoad(depthMap, clamp(here + vec2i(0, 1), vec2i(0), bounds), 0);
  let north = textureLoad(depthMap, clamp(here - vec2i(0, 1), vec2i(0), bounds), 0);
  let limit = shadeInfo.more.x * 0.5;
  let slopeX = clamp(select(east - depth, depth - west, abs(depth - west) < abs(east - depth)), -limit, limit);
  let slopeY = clamp(select(south - depth, depth - north, abs(depth - north) < abs(south - depth)), -limit, limit);
  var occlusion = 0.0;
  for (var i = 1; i <= 12; i += 1) {
    let offset = -shadeInfo.info.xy * f32(i);
    let probe = clamp(vec2i(pixel.xy + offset), vec2i(0), bounds);
    let other = textureLoad(depthMap, probe, 0);
    let expected = depth + slopeX * offset.x + slopeY * offset.y;
    let closer = smoothstep(shadeInfo.more.x * 0.6, shadeInfo.more.x * 2.4, expected - other);
    let reach = 1.0 - f32(i - 1) / 12.0;
    occlusion = max(occlusion, closer * reach * reach);
  }
  return vec4f(color.rgb * (1.0 - occlusion * shadeInfo.info.z), color.a);
}
`;

const COMPOSITE_SHADER = `
struct Blend { info: vec4f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> mixInfo: Blend;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSampleLevel(source, linearSampler, uv, 0.0) * mixInfo.info.x;
}
`;

const MARKER_SHADER = `
struct Frame {
  view: vec4f,
  eye: vec4f,
  forward: vec4f,
  right: vec4f,
  up: vec4f,
  shard: vec4f,
  accent: vec4f,
  marker: vec4f,
  surface: vec4f,
}

struct MarkerOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat, first) shape: vec4f,
  @location(2) @interpolate(flat, first) light: vec4f,
}

@group(0) @binding(0) var<uniform> scene: Frame;
@group(0) @binding(1) var<storage, read> markers: array<vec4f>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instance: u32) -> MarkerOut {
  let a = markers[instance * 2u];
  let b = markers[instance * 2u + 1u];
  let offset = a.xyz - scene.eye.xyz;
  let depth = max(dot(offset, scene.forward.xyz), 0.05);
  let center = vec2f(
    scene.view.x * 0.5 + dot(offset, scene.right.xyz) * scene.view.z / depth,
    scene.view.y * 0.5 - dot(offset, scene.up.xyz) * scene.view.z / depth,
  );
  let pixel = scene.marker.y;
  let size = scene.marker.z * clamp(sqrt(scene.marker.w / depth), 0.6, 1.3) * b.z;
  let blur = min(scene.forward.w * abs(1.0 - scene.eye.w / depth), scene.right.w) * 0.18;
  let frame = b.y;
  let reach = select(size, size * 2.6, frame > 0.001) + blur + 1.5 * pixel;
  let corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let corner = corners[vertexIndex % 6u] * reach;
  var out: MarkerOut;
  if (depth < 0.35 || a.w <= 0.002) {
    out.position = vec4f(2.0, 2.0, 0.5, 1.0);
    return out;
  }
  let at = center + corner;
  out.position = vec4f(at.x / scene.view.x * 2.0 - 1.0, 1.0 - at.y / scene.view.y * 2.0, 0.5, 1.0);
  out.local = corner;
  out.shape = vec4f(size, blur, frame, pixel);
  out.light = vec4f(b.x, a.w, 0.0, 0.0);
  return out;
}

fn bar(value: f32, edge: f32, soft: f32) -> f32 {
  return clamp((edge - value) / soft + 0.5, 0.0, 1.0);
}

@fragment
fn fs_main(in: MarkerOut) -> @location(0) vec4f {
  let size = in.shape.x;
  let blur = in.shape.y;
  let frame = in.shape.z;
  let pixel = in.shape.w;
  let q = abs(in.local);
  let soft = 1.0 + blur;
  let thick = 0.6 * pixel + blur * 0.5;
  let energy = (0.6 * pixel) / thick;
  var cover = 0.0;
  if (scene.marker.x < 0.5) {
    let across = bar(q.x, size, soft) * bar(q.y, thick, soft);
    let down = bar(q.y, size, soft) * bar(q.x, thick, soft);
    cover = max(across, down) * energy;
  } else {
    cover = bar(length(in.local), size * 0.42 + blur * 0.3, soft) * mix(1.0, energy, 0.6);
  }
  if (frame > 0.001) {
    let edge = size * 2.3;
    let span = edge * 0.45;
    let line = 0.5 * pixel;
    let sides = bar(abs(q.x - edge), line, 1.0) * bar(edge - span - q.y, 0.0, 1.0) * bar(q.y - edge - line, 0.0, 1.0);
    let caps = bar(abs(q.y - edge), line, 1.0) * bar(edge - span - q.x, 0.0, 1.0) * bar(q.x - edge - line, 0.0, 1.0);
    cover = max(cover, max(sides, caps) * frame * 0.85);
  }
  let glow = in.light.x;
  let fade = in.light.y;
  let tint = mix(scene.shard.rgb, scene.accent.rgb, 0.4);
  if (scene.up.w > 0.5) {
    let ink = (1.0 - exp(-glow * 1.6)) * 0.85 * cover * fade;
    return vec4f(mix(tint, scene.accent.rgb, 0.5) * 0.55 * ink, ink);
  }
  let light = cover * glow * fade;
  let color = (1.0 - exp(-mix(tint, vec3f(1.0), 0.35) * light * 1.6)) * 1.4;
  return vec4f(color, max(max(color.r, color.g), color.b) * 0.8);
}
`;

const PREFILTER_SHADER = `
struct Bloom { texel: vec4f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> bloom: Bloom;

fn bright(uv: vec2f) -> vec3f {
  let color = textureSampleLevel(source, linearSampler, uv, 0.0).rgb;
  let peak = max(max(color.r, color.g), color.b);
  return color * smoothstep(bloom.texel.z, bloom.texel.z + bloom.texel.w, peak);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let o = bloom.texel.xy;
  let total = bright(uv + vec2f(o.x, o.y)) + bright(uv + vec2f(-o.x, o.y)) + bright(uv + vec2f(o.x, -o.y)) + bright(uv - o);
  return vec4f(total * 0.25, 0.0);
}
`;

const DOWNSAMPLE_SHADER = `
struct Bloom { texel: vec4f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> bloom: Bloom;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let o = bloom.texel.xy;
  var color = textureSampleLevel(source, linearSampler, uv, 0.0) * 0.25;
  color += textureSampleLevel(source, linearSampler, uv + vec2f(o.x, o.y), 0.0) * 0.1875;
  color += textureSampleLevel(source, linearSampler, uv + vec2f(-o.x, o.y), 0.0) * 0.1875;
  color += textureSampleLevel(source, linearSampler, uv + vec2f(o.x, -o.y), 0.0) * 0.1875;
  color += textureSampleLevel(source, linearSampler, uv - o, 0.0) * 0.1875;
  return color;
}
`;

const BLUR_SHADER = `
struct Bloom { texel: vec4f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> bloom: Bloom;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let delta = bloom.texel.xy;
  var color = textureSampleLevel(source, linearSampler, uv, 0.0) * 0.181862;
  color += (textureSampleLevel(source, linearSampler, uv + delta * 1.423135, 0.0) + textureSampleLevel(source, linearSampler, uv - delta * 1.423135, 0.0)) * 0.284316;
  color += (textureSampleLevel(source, linearSampler, uv + delta * 3.326702, 0.0) + textureSampleLevel(source, linearSampler, uv - delta * 3.326702, 0.0)) * 0.106598;
  color += (textureSampleLevel(source, linearSampler, uv + delta * 5.242989, 0.0) + textureSampleLevel(source, linearSampler, uv - delta * 5.242989, 0.0)) * 0.018156;
  return color;
}
`;

const FINISH_SHADER = `
struct Finish {
  info: vec4f,
  paper: vec4f,
  mode: vec4f,
}
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var bloom0: texture_2d<f32>;
@group(0) @binding(3) var bloom1: texture_2d<f32>;
@group(0) @binding(4) var bloom2: texture_2d<f32>;
@group(0) @binding(5) var bloom3: texture_2d<f32>;
@group(0) @binding(6) var<uniform> finish: Finish;

fn hash12(value: vec2f) -> f32 {
  let p = fract(value * vec2f(0.1031, 0.1030));
  let mixed = p + dot(p, p.yx + 33.33);
  return fract((mixed.x + mixed.y) * mixed.x);
}

fn smootherstep(x: f32) -> f32 {
  let t = clamp(x, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

@fragment
fn fs_main(@location(0) uv: vec2f, @builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let scene = textureLoad(sceneTexture, vec2i(pixel.xy), 0);
  let alpha = clamp(scene.a, 0.0, 1.0);
  let noise = hash12(floor(pixel.xy) + vec2f(finish.info.y, finish.info.y * 1.618)) - 0.5;
  let grain = 1.0 + noise * finish.info.x;
  var rgb = vec3f(0.0);
  var a = alpha;
  if (finish.mode.x > 0.5) {
    rgb = clamp(scene.rgb, vec3f(0.0), vec3f(alpha)) * grain;
  } else {
    var halo = textureSampleLevel(bloom0, linearSampler, uv, 0.0).rgb * 0.4;
    halo += textureSampleLevel(bloom1, linearSampler, uv, 0.0).rgb * 0.3;
    halo += textureSampleLevel(bloom2, linearSampler, uv, 0.0).rgb * 0.2;
    halo += textureSampleLevel(bloom3, linearSampler, uv, 0.0).rgb * 0.1;
    halo = halo * finish.info.z;
    rgb = (1.0 - exp(-max(scene.rgb, vec3f(0.0)) * finish.info.w)) * grain + halo / (1.0 + halo);
    a = max(alpha, max(max(rgb.r, rgb.g), rgb.b));
  }
  let vignette = finish.mode.y;
  if (vignette > 0.0) {
    let size = vec2f(textureDimensions(sceneTexture));
    let reach = max(vignette * 0.5 * min(size.x, size.y), 1.0);
    let fromEdge = min(pixel.xy, size - pixel.xy);
    let mask = smootherstep(fromEdge.x / reach) * smootherstep(fromEdge.y / reach);
    rgb *= mask;
    a *= mask;
  }
  rgb = clamp(rgb, vec3f(0.0), vec3f(max(a, 0.0)));
  if (finish.paper.a > 0.5) {
    return vec4f(finish.paper.rgb * (1.0 - a) + rgb, 1.0);
  }
  return vec4f(rgb, a);
}
`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const smoother = x => {
  const t = clamp(x, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

let probe = null;

const parseColor = (value, fallback) => {
  if (value === 'transparent') return null;
  if (typeof document === 'undefined') return fallback;
  if (!probe) probe = document.createElement('canvas').getContext('2d');
  if (!probe) return fallback;
  probe.fillStyle = '#000000';
  probe.fillStyle = value;
  const text = probe.fillStyle;
  if (text.startsWith('#')) {
    const hex = parseInt(text.slice(1), 16);
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  }
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(text);
  if (!match) return fallback;
  if (match[4] !== undefined && Number(match[4]) === 0) return null;
  return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
};

const prefersReduced = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

const latticeHash = (a, b, c, d) => {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= Math.imul(c + 0x27d4eb2f, 0x165667b1) ^ Math.imul(d + 0x7f4a7c15, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

const random = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const ribbonPoint = (placement, level, s, aspect, out) => {
  let u;
  let v;
  let d;
  if (placement === 0) {
    u = -1.32 + 2.64 * s;
    const slope = FULL_SLOPES[level];
    v =
      slope[0] +
      (slope[1] - slope[0]) * s +
      0.1 * Math.sin(s * TAU * 0.7 + level * 2.3) +
      0.045 * Math.sin(s * TAU * 1.9 + level);
    d = DEPTHS[level] + 0.35 * Math.sin(s * Math.PI * 1.4 + level * 1.9);
  } else if (placement === 3) {
    const angle = s * TAU + level * 0.9 + Math.PI * 0.5;
    const size = RING_SIZES[level];
    u = Math.cos(angle) * size[0];
    v = Math.sin(angle) * size[1] - 0.02;
    d = DEPTHS[level] * 1.1 - Math.sin(angle) * (0.5 + level * 0.25);
  } else {
    const mirror = placement === 1 ? -1 : 1;
    v = 1.32 - 2.64 * s;
    u =
      mirror *
      (SIDE_OFFSETS[level] +
        0.1 * Math.sin(s * TAU * 0.6 + level * 1.3) +
        0.03 * Math.sin(s * TAU * 2.1 + level) -
        0.08 * (1 - s));
    d = DEPTHS[level] + 0.3 * Math.sin(s * Math.PI * 1.2 + level);
  }
  out[0] = (u * aspect * d) / CAMERA;
  out[1] = (v * d) / CAMERA;
  out[2] = CAMERA - d;
  return out;
};

const createShards = (count, seed) => {
  const next = random(seed);
  const shards = [];
  let made = 0;
  for (let level = 0; level < LEVELS; level += 1) {
    const amount = level === LEVELS - 1 ? count - made : Math.round(count * SHARE[level]);
    made += amount;
    for (let index = 0; index < amount; index += 1) {
      const flat = next() * 2 - 1;
      const family = next();
      const outline = [];
      if (family < 0.55) {
        const spread = 0.17 + next() * 0.15;
        outline.push([1, (next() - 0.5) * 0.08]);
        outline.push([-0.5 - next() * 0.25, spread * (0.8 + next() * 0.4)]);
        outline.push([-0.5 - next() * 0.25, -spread * (0.8 + next() * 0.4)]);
      } else if (family < 0.8) {
        const spread = 0.2 + next() * 0.14;
        outline.push([1, 0]);
        outline.push([(next() - 0.3) * 0.5, spread]);
        outline.push([-0.55 - next() * 0.2, (next() - 0.5) * 0.1]);
        outline.push([(next() - 0.3) * 0.5, -spread * (0.8 + next() * 0.4)]);
      } else {
        const sides = next() < 0.5 ? 4 : 5;
        const stretch = 0.4 + next() * 0.3;
        const turn = next() * TAU;
        for (let corner = 0; corner < sides; corner += 1) {
          const angle = turn + ((corner + (next() - 0.5) * 0.6) * TAU) / sides;
          outline.push([Math.cos(angle), Math.sin(angle) * stretch]);
        }
      }
      const sides = outline.length;
      let mx = 0;
      let my = 0;
      for (const point of outline) {
        mx += point[0] / sides;
        my += point[1] / sides;
      }
      const shape = [];
      for (let corner = 0; corner < 5; corner += 1) {
        const point = outline[Math.min(corner, sides - 1)];
        shape.push(point[0] - mx, point[1] - my);
      }
      shards.push({
        level,
        phase: (index + next()) / Math.max(amount, 1),
        lane: Math.sign(flat) * Math.pow(Math.abs(flat), 0.85),
        layer: Math.sqrt(-2 * Math.log(Math.max(next(), 1e-6))) * Math.cos(TAU * next()),
        size: 0.6 + next() * next() * 1.25,
        shape,
        sides,
        thickness: 0.06 + next() * 0.04,
        yaw: (next() - 0.5) * 0.36,
        bank: (next() - 0.5) * 0.5,
        pitch: (next() - 0.5) * 0.24,
        tint: next(),
        drift: [next() * TAU, next() * TAU, next() * TAU],
        rate: [0.3 + next() * 0.35, 0.25 + next() * 0.35, 0.3 + next() * 0.3],
        flutter: [next() * TAU, 0.5 + next() * 0.5],
        arrive: next(),
        sign: next() < 0.5 ? -1 : 1,
        slot: [next() * TAU, 0.06 + 0.3 * Math.sqrt(next()), next() - 0.5, next() < 0.85 ? 1 : -1],
        offset: [0, 0, 0],
        velocity: [0, 0, 0],
        tilt: 0,
        tiltVelocity: 0,
        flash: 0,
        gather: 0,
        joined: false,
        position: [0, 0, 0],
        s: 0
      });
    }
  }
  return shards;
};

/**
 * 性能档位。原版一套参数硬扛所有机器：dpr 2、5 层深度 × 2 组 layer target、4 级 bloom、
 * 1300 个碎片 —— 首页 1530x761 的容器在 dpr2 下等于 3060x1522 的全屏 pass 跑十几遍。
 * 这里把吃性能的四件事做成档位；dpr / fps / bloomLevels / layerScales / count 都能单独覆盖。
 * 注意：bloomLevels 与 layerScales 在挂载时生效（要按尺寸预建 target），
 * 运行时改只对 dpr / fps / count 有效 —— 想换档请改 quality（换档位会重建）。
 */
const QUALITY = {
  // low：双层 [1, 0.5]。远景 4 层跑在半分辨率 target 上，全屏当量 12.94 < 单层 16.94，
  // 且 group1 自带 blurred → 景深层次天然恢复。代价是 pass/帧 31（单层 23）。
  // 实测：像素吞吐是唯一瓶颈（pass 数无影响），且用户对掉帧远比像素清晰度敏感。
  // 所以这里 dpr 只作**起始值** 1.0，帧率不设限（fps 0 = 跟随 rAF/vsync），
  // 挂载后由 start() 里的一次性探测决定能否上探到 1.25 / 1.5（最多上探一次、回退一次）。
  // fps 45 是实测结果：dpr1 双层满 60fps 需 904 Mpx/s，超出本机上限（680 顺 / 706 略差），
  // 不限帧会在 60/45/30 之间抖动，主观比稳定的 45fps 更"不顺"。想探上限用 ?fps=50 / 60。
  low: { dpr: 1, fps: 45, bloomLevels: 2, layerScales: LAYER_SCALES, count: 1100 },
  // single：一键切回「单层 + dpr1.5」那版（pass 少 8 个、像素多 31%），留着给 CPU 吃紧的机器用
  single: { dpr: 1.5, fps: 30, bloomLevels: 2, layerScales: [1], count: 1100 },
  // smooth：帧率优先。60Hz 屏上只有 60/30/20 是真稳定帧率，45/50/55 会塌成 30，所以这里直接要 60。
  // dpr 0.85 是拿清晰度换满 60fps：像素随 dpr² 走，0.85² ≈ 0.72。
  smooth: { dpr: 0.85, fps: 60, bloomLevels: 2, layerScales: LAYER_SCALES, count: 1100 },
  // rich：画质优先。30fps 在 60Hz 上正好两帧一次、帧间隔一致，观感比抖动的 60 稳；
  // 省下的预算换成更厚的画面（bloom 3 级 + 1300 碎片满值）。
  // 背景是装饰，不是主角：整页交互掉帧的根因是它在抢 GPU，所以这里压基础占用
  // （dpr 1→0.9 = 像素 −19%、bloom 3→2、count 1300→1000 = 模拟与上传 −23%），
  // 配合下面「交互让路」——用户操作页面时它一帧都不画。
  rich: { dpr: 0.9, fps: 30, bloomLevels: 2, layerScales: LAYER_SCALES, count: 1000 },
  mid: { dpr: 1, fps: 45, bloomLevels: 3, layerScales: LAYER_SCALES, count: 1100 },
  high: { dpr: 1.5, fps: 60, bloomLevels: BLOOM_LEVELS, layerScales: LAYER_SCALES, count: 1300 },
}

const props = defineProps({
  /** 性能档位：low / mid / high，默认 low（原版那套参数在桌面高分屏上会直接把页面按住） */
  quality: { type: String, default: 'low' },
  /** 帧率上限，null = 跟档位走（low 30 / mid 45 / high 60） */
  fps: { type: Number, default: null },
  /** bloom 级数 1..4，null = 跟档位走 */
  bloomLevels: { type: Number, default: null },
  /** layer 缩放数组：[1] 单层 / [1, 0.5] 双层，null = 跟档位走 */
  layerScales: { type: Array, default: null },
  shardColor: { type: String, default: '#896ABD' },
  accentColor: { type: String, default: '#A855F7' },
  backgroundColor: { type: String, default: 'transparent' },
  lightMode: { type: Boolean, default: false },
  placement: { type: String, default: 'full' },
  material: { type: String, default: 'glass' },
  /** 碎片数，null = 跟档位走（low 900 / mid 1100 / high 1300） */
  count: { type: Number, default: null },
  shardSize: { type: Number, default: 1 },
  spread: { type: Number, default: 1 },
  twist: { type: Number, default: 1 },
  billow: { type: Number, default: 1 },
  speed: { type: Number, default: 1 },
  scale: { type: Number, default: 1 },
  depthOfField: { type: Number, default: 0.75 },
  glow: { type: Number, default: 0.35 },
  grain: { type: Number, default: 0.06 },
  vignette: { type: Number, default: 0.3 },
  intro: { type: Boolean, default: true },
  mouseInteraction: { type: Boolean, default: true },
  mouseStrength: { type: Number, default: 0.6 },
  markers: { type: String, default: 'plus' },
  pulseOnClick: { type: Boolean, default: true },
  holdToGather: { type: Boolean, default: true },
  parallax: { type: Number, default: 0.5 },
  /** 少动效模式下停帧：不再续帧，只留最后一帧静态画面 */
  paused: { type: Boolean, default: false },
  /** 像素比上限，null = 跟档位走（low 1.5 / mid 1 / high 1.5）。实际渲染 = min(devicePixelRatio, dpr)，所以 dpr1 屏不会浪费 */
  dpr: { type: Number, default: null },
  /** 单层（low）档要不要开景深模糊。开=每层多两张全尺寸 temp + 三个全屏 pass，代价约 1.6 倍像素，默认关 */
  depthBlur: { type: Boolean, default: false },
})

const emit = defineEmits(['error'])

const containerRef = ref(null)

/**
 * 参数到渲染状态的换算。原版在每次 React 渲染里重算一份新 settings 对象，
 * 帧循环靠对象身份变化（state.seen !== s）判断"参数动过了，要重置静默计数"，
 * 这里用 watch 维持同一条契约。
 */
const readSettings = () => {
  const tier = QUALITY[props.quality] ?? QUALITY.low
  const layerScales = Array.isArray(props.layerScales) && props.layerScales.length ? props.layerScales : tier.layerScales
  return {
  shard: parseColor(props.shardColor, [0.54, 0.42, 0.74]) ?? [0.54, 0.42, 0.74],
  accent: parseColor(props.accentColor, [0.66, 0.33, 0.97]) ?? [0.66, 0.33, 0.97],
  paper: parseColor(props.backgroundColor, null),
  lightMode: props.lightMode,
  placement: Math.max(0, PLACEMENTS.indexOf(props.placement)),
  material: MATERIALS[props.material] ?? MATERIALS.glass,
  count: Math.round(clamp(props.count ?? tier.count, 100, 6000)),
  shardSize: clamp(props.shardSize, 0.2, 4),
  spread: clamp(props.spread, 0, 3),
  twist: clamp(props.twist, 0, 3),
  billow: clamp(props.billow, 0, 3),
  speed: clamp(props.speed, 0, 4),
  scale: clamp(props.scale, 0.4, 2.5),
  depthOfField: clamp(props.depthOfField, 0, 1),
  glow: clamp(props.glow, 0, 2),
  grain: clamp(props.grain, 0, 0.5),
  vignette: clamp(props.vignette, 0, 1),
  intro: props.intro,
  mouseInteraction: props.mouseInteraction,
  mouseStrength: clamp(props.mouseStrength, 0, 1),
  markers: MARKER_STYLES[props.markers] ?? -1,
  pulseOnClick: props.pulseOnClick,
  holdToGather: props.holdToGather,
  parallax: clamp(props.parallax, 0, 1),
  paused: props.paused,
  depthBlur: props.depthBlur,
  dpr: Math.max(0.5, props.dpr ?? tier.dpr),
  // fps = 0 表示不限帧（跟随 rAF/vsync）；其余值夹到 10~240
  fps: (props.fps ?? tier.fps) > 0 ? clamp(props.fps ?? tier.fps, 10, 240) : 0,
  bloomLevels: Math.round(clamp(props.bloomLevels ?? tier.bloomLevels, 1, BLOOM_LEVELS)),
  layerScales,
  }
}

const settingsRef = shallowRef(readSettings())

watch(
  props,
  () => {
    settingsRef.value = readSettings()
  },
  { deep: true },
)

// 停帧时循环已经退出，取消 paused 得把它叫回来（少动效偏好变化走 start() 里的监听）
watch(
  () => props.paused,
  paused => {
    if (!paused) wake?.()
  },
)

/** 卸载时由 onMounted 挂上的收尾函数：取消 rAF、摘监听、销毁 GPU 资源 */
let teardown = null
/** 停帧状态下把帧循环叫回来（onMounted 里接上，props 变化时用） */
let wake = null

onMounted(() => {
  const container = containerRef.value;
  if (!container) return;

  const canvas = document.createElement('canvas');
  canvas.className = CANVAS;
  container.appendChild(canvas);

  let disposed = false;
  let gpu = null;
  let raf = 0;
  const cleanups = [];

  // WebGPU 上下文拿不到 / vgpu 初始化抛错：不向上抛、不黑屏，安静收尾把兜底留给父组件
  const fail = error => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    gpu?.dispose();
    gpu = null;
    // 异常永远不许静默：父组件不监听 error 事件时，这里就是唯一的出口
    console.error('[AeroShards] fail', error);
    emit('error', error instanceof Error ? error : new Error(String(error)));
  };

  const start = async () => {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) throw new Error('WebGPU is not available');
    const instance = await init({ powerPreference: 'high-performance' });
    gpu = instance;
    if (disposed) {
      instance.dispose();
      return;
    }
    cleanups.push(instance.onError(fail));
    const format = navigator.gpu.getPreferredCanvasFormat();
    // 0 = 还没探测（直接用档位 dpr）；探测出上限后由 setDprCap 写入。
    // 必须在 sizeFor 之前声明：start() 第一件事就是调 sizeFor()。
    let adaptiveDpr = 0;
    const sizeFor = () => {
      // 自适应 dpr 只当上限用：min(设备像素比, 档位 dpr, 探测出来的上限)，无论怎么调都不会超过 1.5
      const capDpr = adaptiveDpr > 0 ? Math.min(settingsRef.value.dpr, adaptiveDpr) : settingsRef.value.dpr;
      const ratio = Math.min(window.devicePixelRatio || 1, Math.min(capDpr, 1.5));
      return [
        Math.max(1, Math.round(container.clientWidth * ratio)),
        Math.max(1, Math.round(container.clientHeight * ratio))
      ];
    };
    const output = surface(instance, canvas, {
      autoResize: false,
      size: sizeFor(),
      format,
      alphaMode: 'premultiplied'
    });
    const linear = sampler(instance, {
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
    const scene = target(instance, { size: output.size, format: 'rgba16float' });
    const levelSize = index => [
      Math.max(1, Math.round(output.size[0] / 2 ** (index + 1))),
      Math.max(1, Math.round(output.size[1] / 2 ** (index + 1)))
    ];
    // 档位决定的 bloom 级数：级数越少，每帧少 3 个全屏 pass
    const bloomCount = settingsRef.value.bloomLevels;
    const levels = Array.from({ length: bloomCount }, (_, index) => ({
      main: target(instance, { size: levelSize(index), format: 'rgba16float' }),
      spare: target(instance, { size: levelSize(index), format: 'rgba16float' })
    }));
    const frameParams = uniforms(instance, {
      view: [1, 1, 1, 0],
      eye: [0, 0, CAMERA, FOCUS],
      forward: [0, 0, -1, 0],
      right: [1, 0, 0, 0],
      up: [0, 1, 0, 0],
      shard: [0.54, 0.42, 0.74, 0.5],
      accent: [0.66, 0.33, 0.97, 0],
      marker: [0, 1, 4, CAMERA],
      surface: [7, 0, 0, 2.4]
    });
    // ── 启动自适应 dpr：探测一次 → 最多上探一档 → 上探后复查，超标就退回 1.0 并锁定 ──
    // 绝不做逐帧 DRS：那会让画面呼吸。adaptiveDpr = 0 表示还没探测（用档位 dpr）。
    // 注意：声明必须留在 sizeFor() 之前，否则 start() 首次调用会撞 TDZ（Cannot access before initialization）。
    let probeActive = true;
    let probeSkip = 20;
    let probeSamples = [];
    let probeBase = 0;
    let recheckActive = false;
    let recheckSkip = 0;
    let recheckSamples = [];

    let markerCapacity = 0;
    let markerBuffer = null;
    let markerData = new Float32Array(0);
    const markerDraw = draw(instance, {
      shader: MARKER_SHADER,
      vertices: 6,
      cull: 'none',
      depth: false,
      blend: 'premultiplied',
      label: 'aero-shards-markers'
    });
    const ensureMarkers = needed => {
      if (needed <= markerCapacity && markerBuffer) return;
      markerCapacity = Math.max(needed, 512);
      markerData = new Float32Array(markerCapacity * MARKER_FLOATS);
      markerBuffer = storage(instance, markerData.byteLength, 'read');
      markerDraw.set({ scene: frameParams, markers: markerBuffer });
    };
    ensureMarkers(512);
    const groupSize = scale => [
      Math.max(1, Math.round(output.size[0] * scale)),
      Math.max(1, Math.round(output.size[1] * scale))
    ];
    // 档位决定的 layer 组数：[1] 单层（省掉一半深度 pass）/[1, 0.5] 双层（原版）
    const groups = settingsRef.value.layerScales.map((scale, index) => ({
      scale,
      layer: target(instance, { size: groupSize(scale), format: 'rgba16float', depth: 'depth32float' }),
      shaded: target(instance, { size: groupSize(scale), format: 'rgba16float' }),
      temp: target(instance, { size: index === 0 ? [1, 1] : groupSize(scale), format: 'rgba16float' }),
      blurred: target(instance, { size: index === 0 ? [1, 1] : groupSize(scale), format: 'rgba16float' }),
      softReady: index !== 0
    }));
    const layerParams = DEPTHS.map(() => uniforms(instance, { view: [1, 1, 1, 0], look: [0.7, 0, 0, 0] }));
    const spreadX = DEPTHS.map(() => uniforms(instance, { texel: [0, 0, 0, 0] }));
    const spreadY = DEPTHS.map(() => uniforms(instance, { texel: [0, 0, 0, 0] }));
    const mixParams = DEPTHS.map(() => uniforms(instance, { info: [1, 0, 0, 0] }));
    const shadeParams = DEPTHS.map(() => uniforms(instance, { info: [0, 0, 0, 0], more: [0, 0, 0, 0] }));
    const shardSolid = DEPTHS.map((_, level) =>
      draw(instance, {
        shader: SHARD_SHADER,
        entry: { fragment: 'fs_solid' },
        vertices: 6,
        cull: 'none',
        depth: { write: true, compare: 'less' },
        label: `aero-shards-solid-${level}`
      })
    );
    const shardEdge = DEPTHS.map((_, level) =>
      draw(instance, {
        shader: SHARD_SHADER,
        entry: { fragment: 'fs_edge' },
        vertices: 6,
        cull: 'none',
        depth: { write: false, compare: 'less' },
        blend: 'premultiplied',
        label: `aero-shards-edge-${level}`
      })
    );
    const layerPasses = DEPTHS.map((_, level) =>
      groups.map((group, index) => ({
        shadow: effect(instance, SHADOW_SHADER, {
          label: `aero-shards-shadow-${level}-${index}`,
          set: { source: group.layer, depthMap: group.layer.depth, shadeInfo: shadeParams[level] }
        }),
        blurX: effect(instance, LAYER_BLUR_SHADER, {
          label: `aero-shards-depth-x-${level}-${index}`,
          set: { source: group.shaded, linearSampler: linear, spreadInfo: spreadX[level] }
        }),
        blurY: effect(instance, LAYER_BLUR_SHADER, {
          label: `aero-shards-depth-y-${level}-${index}`,
          set: { source: group.temp, linearSampler: linear, spreadInfo: spreadY[level] }
        }),
        sharp: effect(instance, COMPOSITE_SHADER, {
          label: `aero-shards-sharp-${level}-${index}`,
          blend: 'premultiplied',
          set: { source: group.shaded, linearSampler: linear, mixInfo: mixParams[level] }
        }),
        soft: effect(instance, COMPOSITE_SHADER, {
          label: `aero-shards-soft-${level}-${index}`,
          blend: 'premultiplied',
          set: { source: group.blurred, linearSampler: linear, mixInfo: mixParams[level] }
        })
      }))
    );
    let capacity = 0;
    let shardBuffer = null;
    let upload = new Float32Array(0);
    let staging = new Float32Array(0);
    let depths = new Float32Array(0);
    // 稳定降序基数排序的辅助缓冲（替代原版 O(n²) 插入排序，结果逐元素相同）
    let sortKeys = new Uint32Array(0);
    let sortA = new Uint32Array(0);
    let sortB = new Uint32Array(0);
    const floatProbe = new Float32Array(1);
    const uintProbe = new Uint32Array(floatProbe.buffer);
    const buckets = new Uint32Array(256);
    const ensureCapacity = needed => {
      if (needed <= capacity && shardBuffer) return;
      capacity = Math.max(needed, 256);
      upload = new Float32Array(capacity * FLOATS);
      staging = new Float32Array(capacity * FLOATS);
      depths = new Float32Array(capacity);
      sortKeys = new Uint32Array(capacity);
      sortA = new Uint32Array(capacity);
      sortB = new Uint32Array(capacity);
      shardBuffer = storage(instance, upload.byteLength, 'read');
      DEPTHS.forEach((_, level) => {
        shardSolid[level].set({ scene: frameParams, shards: shardBuffer, layerInfo: layerParams[level] });
        shardEdge[level].set({ scene: frameParams, shards: shardBuffer, layerInfo: layerParams[level] });
      });
    };
    ensureCapacity(settingsRef.value.count);

    const passes = levels.map((level, index) => {
      const source = index === 0 ? scene : levels[index - 1].main;
      const downParams = uniforms(instance, { texel: [0, 0, 0, 0] });
      const horizontalParams = uniforms(instance, { texel: [0, 0, 0, 0] });
      const verticalParams = uniforms(instance, { texel: [0, 0, 0, 0] });
      return {
        source,
        level,
        downParams,
        horizontalParams,
        verticalParams,
        down: effect(instance, index === 0 ? PREFILTER_SHADER : DOWNSAMPLE_SHADER, {
          label: `aero-shards-down-${index}`,
          set: { source, linearSampler: linear, bloom: downParams }
        }),
        horizontal: effect(instance, BLUR_SHADER, {
          label: `aero-shards-blur-x-${index}`,
          set: { source: level.main, linearSampler: linear, bloom: horizontalParams }
        }),
        vertical: effect(instance, BLUR_SHADER, {
          label: `aero-shards-blur-y-${index}`,
          set: { source: level.spare, linearSampler: linear, bloom: verticalParams }
        })
      };
    });
    const finishParams = uniforms(instance, { info: [0, 0, 0, 1], paper: [0, 0, 0, 0], mode: [0, 0, 0, 0] });
    // 着色器固定采样 4 级 bloom：档位少建的那几级绑到 1x1 空 target（每帧清 0），
    // 这样 FINISH_SHADER 一个字都不用改，缺级贡献自然为 0。
    const bloomBlank = target(instance, { size: [1, 1], format: 'rgba16float' });
    const bloomMain = index => (levels[index] ?? { main: bloomBlank }).main;
    const finish = effect(instance, FINISH_SHADER, {
      label: 'aero-shards-finish',
      set: {
        sceneTexture: scene,
        linearSampler: linear,
        bloom0: bloomMain(0),
        bloom1: bloomMain(1),
        bloom2: bloomMain(2),
        bloom3: bloomMain(3),
        finish: finishParams
      }
    });
    await Promise.all([
      ...shardSolid.map(item => item.compile(groups[0].layer)),
      ...shardEdge.map(item => item.compile(groups[0].layer)),
      ...layerPasses.flatMap(list =>
        list.flatMap((item, index) => [
          item.shadow.compile(groups[index].shaded),
          item.blurX.compile(groups[index].temp),
          item.blurY.compile(groups[index].blurred),
          item.sharp.compile(scene),
          item.soft.compile(scene)
        ])
      ),
      markerDraw.compile(scene),
      finish.compile({ colors: [format] }),
      ...passes.flatMap((pass, index) => [
        pass.down.compile(levels[index].main),
        pass.horizontal.compile(levels[index].spare),
        pass.vertical.compile(levels[index].main)
      ])
    ]);
    if (disposed) return;

    const paths = Array.from({ length: LEVELS }, () => ({
      position: new Float32Array(SAMPLES * 3),
      tangent: new Float32Array(SAMPLES * 3),
      across: new Float32Array(SAMPLES * 3),
      lift: new Float32Array(SAMPLES * 3),
      length: 1
    }));
    const markerCounts = [0, 0, 0, 0, 0];
    const markerStarts = [0, 0, 0, 0, 0];
    const raw = new Float32Array((SAMPLES + 1) * 3);
    const lengths = new Float32Array(SAMPLES + 1);
    const point = [0, 0, 0];
    let pathKey = '';

    const state = {
      visible: false,
      clock: 0,
      last: 0,
      travel: new Float64Array(LEVELS),
      roll: 0,
      twist: 0,
      drift: 0,
      introAt: -1,
      weights: PLACEMENTS.map((_, index) => (index === settingsRef.value.placement ? 1 : 0)),
      weightVelocity: [0, 0, 0, 0],
      shards: createShards(settingsRef.value.count, 1337),
      order: [],
      pointer: [0.5, 0.5],
      inside: false,
      presence: 0,
      yaw: 0,
      pitch: 0,
      yawVelocity: 0,
      pitchVelocity: 0,
      pressAt: -1,
      pressPoint: null,
      holding: false,
      hold: 0,
      reach: 0,
      gatherCenter: [0, 0, 0],
      rings: [],
      markerDrift: 0,
      markerTarget: '',
      markerTotal: 0,
      targets: new Map(),
      quiet: 0,
      seen: null
    };

    const buildPaths = aspect => {
      const closed = state.weights[3] > 0.999;
      const key = `${aspect.toFixed(4)}|${state.weights.map(w => w.toFixed(4)).join(',')}`;
      if (key === pathKey) return closed;
      pathKey = key;
      for (let level = 0; level < LEVELS; level += 1) {
        const path = paths[level];
        let total = 0;
        for (let i = 0; i <= SAMPLES; i += 1) {
          const s = i / SAMPLES;
          let x = 0;
          let y = 0;
          let z = 0;
          for (let k = 0; k < 4; k += 1) {
            const weight = state.weights[k];
            if (weight < 0.0001) continue;
            ribbonPoint(k, level, s, aspect, point);
            x += point[0] * weight;
            y += point[1] * weight;
            z += point[2] * weight;
          }
          raw[i * 3] = x;
          raw[i * 3 + 1] = y;
          raw[i * 3 + 2] = z;
          if (i > 0) total += Math.hypot(x - raw[i * 3 - 3], y - raw[i * 3 - 2], z - raw[i * 3 - 1]);
          lengths[i] = total;
        }
        path.length = Math.max(total, 1e-3);
        let cursor = 0;
        for (let i = 0; i < SAMPLES; i += 1) {
          const want = (i / (SAMPLES - 1)) * total;
          while (cursor < SAMPLES - 1 && lengths[cursor + 1] < want) cursor += 1;
          const span = Math.max(lengths[cursor + 1] - lengths[cursor], 1e-6);
          const f = clamp((want - lengths[cursor]) / span, 0, 1);
          for (let c = 0; c < 3; c += 1) {
            path.position[i * 3 + c] = raw[cursor * 3 + c] + (raw[cursor * 3 + 3 + c] - raw[cursor * 3 + c]) * f;
          }
        }
        let px = 0;
        let py = 1;
        let pz = 0;
        for (let i = 0; i < SAMPLES; i += 1) {
          const a = Math.max(0, i - 1);
          const b = Math.min(SAMPLES - 1, i + 1);
          let tx = path.position[b * 3] - path.position[a * 3];
          let ty = path.position[b * 3 + 1] - path.position[a * 3 + 1];
          let tz = path.position[b * 3 + 2] - path.position[a * 3 + 2];
          const tl = Math.hypot(tx, ty, tz) || 1;
          tx /= tl;
          ty /= tl;
          tz /= tl;
          if (i === 0) {
            px = -ty;
            py = tx;
            pz = 0;
          }
          const along = px * tx + py * ty + pz * tz;
          px -= tx * along;
          py -= ty * along;
          pz -= tz * along;
          const pl = Math.hypot(px, py, pz) || 1;
          px /= pl;
          py /= pl;
          pz /= pl;
          path.tangent[i * 3] = tx;
          path.tangent[i * 3 + 1] = ty;
          path.tangent[i * 3 + 2] = tz;
          path.across[i * 3] = px;
          path.across[i * 3 + 1] = py;
          path.across[i * 3 + 2] = pz;
          path.lift[i * 3] = ty * pz - tz * py;
          path.lift[i * 3 + 1] = tz * px - tx * pz;
          path.lift[i * 3 + 2] = tx * py - ty * px;
        }
      }
      return closed;
    };

    const resize = () => {
      const next = sizeFor();
      if (next[0] === output.size[0] && next[1] === output.size[1]) return;
      output.resize(next);
      scene.resize(next);
      groups.forEach(group => {
        group.layer.resize(groupSize(group.scale));
        group.shaded.resize(groupSize(group.scale));
        if (group.softReady) {
          group.temp.resize(groupSize(group.scale));
          group.blurred.resize(groupSize(group.scale));
        }
      });
      levels.forEach((level, index) => {
        level.main.resize(levelSize(index));
        level.spare.resize(levelSize(index));
      });
      layerPasses.forEach(list =>
        list.forEach((item, index) => item.shadow.set({ depthMap: groups[index].layer.depth }))
      );
      state.quiet = 0;
    };
    const sizes = new ResizeObserver(resize);
    sizes.observe(container);
    cleanups.push(() => sizes.disconnect());

    const cam = { eye: [0, 0, CAMERA], forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], focal: 1 };

    const updateCamera = s => {
      const cy = Math.cos(state.yaw);
      const sy = Math.sin(state.yaw);
      const cp = Math.cos(state.pitch);
      const sp = Math.sin(state.pitch);
      cam.eye[0] = sy * cp * CAMERA;
      cam.eye[1] = sp * CAMERA;
      cam.eye[2] = cy * cp * CAMERA;
      cam.forward[0] = -sy * cp;
      cam.forward[1] = -sp;
      cam.forward[2] = -cy * cp;
      const rl = Math.hypot(cam.forward[2], cam.forward[0]) || 1;
      cam.right[0] = -cam.forward[2] / rl;
      cam.right[1] = 0;
      cam.right[2] = cam.forward[0] / rl;
      cam.up[0] = cam.right[1] * cam.forward[2] - cam.right[2] * cam.forward[1];
      cam.up[1] = cam.right[2] * cam.forward[0] - cam.right[0] * cam.forward[2];
      cam.up[2] = cam.right[0] * cam.forward[1] - cam.right[1] * cam.forward[0];
      cam.focal = output.size[1] * 0.5 * CAMERA * s.scale;
    };

    const ray = [0, 0, 1];
    const rayAt = (px, py) => {
      const x = (px - 0.5) * output.size[0];
      const y = (0.5 - py) * output.size[1];
      ray[0] = cam.forward[0] * cam.focal + cam.right[0] * x + cam.up[0] * y;
      ray[1] = cam.forward[1] * cam.focal + cam.right[1] * x + cam.up[1] * y;
      ray[2] = cam.forward[2] * cam.focal + cam.right[2] * x + cam.up[2] * y;
      const length = Math.hypot(ray[0], ray[1], ray[2]) || 1;
      ray[0] /= length;
      ray[1] /= length;
      ray[2] /= length;
      return ray;
    };

    const simulate = (s, dt, reduced) => {
      const aspect = output.size[0] / Math.max(output.size[1], 1);
      const closed = buildPaths(aspect);
      const introOn = s.intro && !reduced;
      const introAge = state.introAt < 0 ? 0 : state.clock - state.introAt;
      const hover = s.mouseInteraction && !reduced ? state.presence * s.mouseStrength : 0;
      let rx = 0;
      let ry = 0;
      let rz = 0;
      if (hover > 0.001) {
        rayAt(state.pointer[0], state.pointer[1]);
        rx = ray[0];
        ry = ray[1];
        rz = ray[2];
      }
      // 物理子步上限 2：30fps 下 dt≈0.033 原版会拆 4 步，弹簧/阻尼都是平滑系统，2 步观感无差
      const steps = Math.min(2, Math.max(1, Math.ceil(dt / (1 / 120))));
      const h = dt / Math.max(steps, 1);
      const halfHeight = output.size[1] * 0.5;
      const rings = state.rings.map(ring => {
        const life = ring.age / RING_SECONDS;
        return {
          x: ring.x,
          y: ring.y,
          age: ring.age,
          strength: (1 - Math.exp(-ring.age / 0.06)) * (1 - life) * (1 - life)
        };
      });
      const screenOf = (x, y, z, out) => {
        const ex = x - cam.eye[0];
        const ey = y - cam.eye[1];
        const ez = z - cam.eye[2];
        const depth = Math.max(ex * cam.forward[0] + ey * cam.forward[1] + ez * cam.forward[2], 0.05);
        out[0] = ((ex * cam.right[0] + ey * cam.right[1] + ez * cam.right[2]) * cam.focal) / depth / halfHeight;
        out[1] = ((ex * cam.up[0] + ey * cam.up[1] + ez * cam.up[2]) * cam.focal) / depth / halfHeight;
        return depth;
      };
      const ringBand = (sx, sy, level) => {
        let total = 0;
        for (const ring of rings) {
          const radius = Math.max(0, ring.age - level * 0.07) * 2.3;
          const distance = Math.hypot(sx - ring.x, sy - ring.y);
          total += Math.exp(-((distance - radius) * (distance - radius)) / 0.012) * ring.strength;
        }
        return total;
      };
      const flat = [0, 0];
      const shards = state.shards;
      const twistWeight = Math.min(1, s.twist);
      for (let index = 0; index < shards.length; index += 1) {
        const shard = shards[index];
        const level = shard.level;
        const path = paths[level];
        let s0 = (shard.phase + state.travel[level]) % 1;
        let appear = 1;
        let introBank = 0;
        if (introOn) {
          const begin =
            level * 0.22 + Math.max(0, s0 - 0.1) * (INTRO_SECONDS - 1.0 - (LEVELS - 1) * 0.22) + shard.arrive * 0.15;
          const local = clamp((introAge - begin) / 0.9, 0, 1);
          appear = smoother(local);
          const glide = (1 - local) * (1 - local);
          s0 = closed ? s0 - glide * 0.06 : Math.max(0, s0 - glide * 0.06);
          introBank = glide * 0.9 * shard.sign;
        }
        shard.s = s0;
        const f = (((s0 % 1) + 1) % 1) * (SAMPLES - 1);
        const i0 = Math.floor(f);
        const i1 = Math.min(i0 + 1, SAMPLES - 1);
        const t = f - i0;
        const at = (array, c) => array[i0 * 3 + c] + (array[i1 * 3 + c] - array[i0 * 3 + c]) * t;
        const cx = at(path.position, 0);
        const cy = at(path.position, 1);
        const cz = at(path.position, 2);
        const tx = at(path.tangent, 0);
        const ty = at(path.tangent, 1);
        const tz = at(path.tangent, 2);
        const ax0 = at(path.across, 0);
        const ay0 = at(path.across, 1);
        const az0 = at(path.across, 2);
        const lx0 = at(path.lift, 0);
        const ly0 = at(path.lift, 1);
        const lz0 = at(path.lift, 2);
        const angle = s.twist * (s0 * TAU * 0.6 + state.twist + level * 1.7);
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        const ax = ax0 * ca + lx0 * sa;
        const ay = ay0 * ca + ly0 * sa;
        const az = az0 * ca + lz0 * sa;
        const bx = lx0 * ca - ax0 * sa;
        const by = ly0 * ca - ay0 * sa;
        const bz = lz0 * ca - az0 * sa;
        const depthScale = DEPTHS[level] / CAMERA;
        const width =
          s.spread * (0.15 + 0.035 * DEPTHS[level]) * (0.8 + 0.3 * Math.sin(s0 * TAU * 1.3 + level * 0.8));
        const lane = shard.lane * width;
        const layer = shard.layer * 0.012 * depthScale;
        const taper = closed ? 1 : smoother(s0 / 0.12) * smoother((1 - s0) / 0.12);
        const billow =
          s.billow *
          0.16 *
          depthScale *
          Math.sin(s0 * TAU * 1.3 - state.drift * 0.5 + level * 1.1) *
          (0.4 + 0.6 * taper);
        const sway = s.billow * 0.06 * depthScale * Math.sin(s0 * TAU * 0.8 - state.drift * 0.35 + level * 2.4);
        const wobble = 0.009 * depthScale;
        const drift = state.drift;
        const hx =
          cx +
          lx0 * billow +
          ax0 * sway +
          ax * lane +
          bx * layer +
          Math.sin(drift * shard.rate[0] + shard.drift[0]) * wobble;
        const hy =
          cy +
          ly0 * billow +
          ay0 * sway +
          ay * lane +
          by * layer +
          Math.sin(drift * shard.rate[1] + shard.drift[1]) * wobble;
        const hz =
          cz +
          lz0 * billow +
          az0 * sway +
          az * lane +
          bz * layer +
          Math.sin(drift * shard.rate[2] + shard.drift[2]) * wobble;

        let fx = 0;
        let fy = 0;
        let fz = 0;
        let tiltTarget = 0;
        const px = hx + shard.offset[0];
        const py = hy + shard.offset[1];
        const pz = hz + shard.offset[2];
        if (hover > 0.001) {
          const ex = px - cam.eye[0];
          const ey = py - cam.eye[1];
          const ez = pz - cam.eye[2];
          const along = ex * rx + ey * ry + ez * rz;
          const qx = ex - rx * along;
          const qy = ey - ry * along;
          const qz = ez - rz * along;
          const gap = Math.hypot(qx, qy, qz);
          const reach = (0.24 * depthScale) / s.scale;
          const falloff = Math.exp(-(gap * gap) / (reach * reach));
          if (falloff > 0.002 && gap > 1e-5) {
            const nx = qx / gap;
            const ny = qy / gap;
            const nz = qz / gap;
            const sideways = (nx * tx + ny * ty + nz * tz) * 0.7;
            const strength = hover * falloff * 9 * depthScale;
            fx += (nx - tx * sideways) * strength;
            fy += (ny - ty * sideways) * strength;
            fz += (nz - tz * sideways) * strength;
            tiltTarget += hover * falloff * 1.1 * (nx * ax0 + ny * ay0 + nz * az0);
          }
        }

        if (state.hold > 0.001 && shard.joined) {
          const slot = shard.slot;
          const orbit = slot[0] + state.clock * (0.8 / (0.12 + slot[1])) * slot[3];
          const radius = slot[1] / s.scale;
          const gx = state.gatherCenter[0] + Math.cos(orbit) * radius;
          const gy = state.gatherCenter[1] + Math.sin(orbit) * radius * 0.75;
          const gz = state.gatherCenter[2] + Math.sin(orbit) * radius * 0.45 + slot[2] * 0.3;
          shard.gather += (state.hold - shard.gather) * (1 - Math.exp(-dt / 0.3));
          const pull = shard.gather * 30;
          fx += (gx - px) * pull;
          fy += (gy - py) * pull;
          fz += (gz - pz) * pull;
          tiltTarget += shard.gather * 0.6 * Math.sin(orbit);
        } else {
          shard.gather += (0 - shard.gather) * (1 - Math.exp(-dt / 0.2));
        }

        if (rings.length) {
          screenOf(px, py, pz, flat);
          for (const ring of rings) {
            const radius = Math.max(0, ring.age - level * 0.07) * 2.3;
            const dxr = flat[0] - ring.x;
            const dyr = flat[1] - ring.y;
            const distance = Math.hypot(dxr, dyr);
            const band = Math.exp(-((distance - radius) * (distance - radius)) / 0.012) * ring.strength;
            if (band > 0.01) {
              shard.flash = Math.max(shard.flash, band * 0.75);
              const outward = Math.max(distance, 0.05);
              const ux = (cam.right[0] * dxr + cam.up[0] * dyr) / outward;
              const uy = (cam.right[1] * dxr + cam.up[1] * dyr) / outward;
              const uz = (cam.right[2] * dxr + cam.up[2] * dyr) / outward;
              tiltTarget += band * 1.4 * (ux * ax0 + uy * ay0 + uz * az0);
              const push = (band * 2.2 * depthScale) / Math.max(distance, 0.05);
              fx += (cam.right[0] * dxr + cam.up[0] * dyr) * push;
              fy += (cam.right[1] * dxr + cam.up[1] * dyr) * push;
              fz += (cam.right[2] * dxr + cam.up[2] * dyr) * push;
            }
          }
        }

        const stiffness = 24 * (1 - shard.gather * 0.95);
        for (let step = 0; step < steps; step += 1) {
          shard.velocity[0] += (fx - stiffness * shard.offset[0] - 7.5 * shard.velocity[0]) * h;
          shard.velocity[1] += (fy - stiffness * shard.offset[1] - 7.5 * shard.velocity[1]) * h;
          shard.velocity[2] += (fz - stiffness * shard.offset[2] - 7.5 * shard.velocity[2]) * h;
          shard.offset[0] += shard.velocity[0] * h;
          shard.offset[1] += shard.velocity[1] * h;
          shard.offset[2] += shard.velocity[2] * h;
          shard.tiltVelocity += (90 * (tiltTarget - shard.tilt) - 15 * shard.tiltVelocity) * h;
          shard.tilt += shard.tiltVelocity * h;
        }
        shard.flash *= Math.exp(-dt / 0.45);

        const ox = hx + shard.offset[0];
        const oy = hy + shard.offset[1];
        const oz = hz + shard.offset[2];
        shard.position[0] = ox;
        shard.position[1] = oy;
        shard.position[2] = oz;

        let vx = cam.eye[0] - ox;
        let vy = cam.eye[1] - oy;
        let vz = cam.eye[2] - oz;
        const vl = Math.hypot(vx, vy, vz) || 1;
        vx /= vl;
        vy /= vl;
        vz /= vl;
        let dx = tx + shard.velocity[0] * 0.05;
        let dy = ty + shard.velocity[1] * 0.05;
        let dz = tz + shard.velocity[2] * 0.05;
        const facingPart = dx * vx + dy * vy + dz * vz;
        dx -= vx * facingPart;
        dy -= vy * facingPart;
        dz -= vz * facingPart;
        let dl = Math.hypot(dx, dy, dz);
        if (dl < 1e-4) {
          dx = cam.right[0];
          dy = cam.right[1];
          dz = cam.right[2];
          dl = 1;
        }
        dx /= dl;
        dy /= dl;
        dz /= dl;
        const wx = vy * dz - vz * dy;
        const wy = vz * dx - vx * dz;
        const wz = vx * dy - vy * dx;
        const yaw = shard.yaw + 0.05 * Math.sin(state.clock * shard.flutter[1] * 0.7 + shard.flutter[0]);
        const cyaw = Math.cos(yaw);
        const syaw = Math.sin(yaw);
        const kx = dx * cyaw + wx * syaw;
        const ky = dy * cyaw + wy * syaw;
        const kz = dz * cyaw + wz * syaw;
        const jx = wx * cyaw - dx * syaw;
        const jy = wy * cyaw - dy * syaw;
        const jz = wz * cyaw - dz * syaw;
        const wave =
          0.8 * twistWeight * Math.sin(angle) +
          0.3 * Math.sin(s0 * TAU * 1.6 - state.roll * 0.55 + level * 0.9 + shard.lane * 0.7);
        const flutter = 0.06 * Math.sin(state.clock * shard.flutter[1] + shard.flutter[0]);
        const bank = MAX_BANK * Math.tanh((wave + shard.bank + flutter + shard.tilt + introBank) / MAX_BANK);
        const cb = Math.cos(bank);
        const sb = Math.sin(bank);
        const mx = vx * cb + jx * sb;
        const my = vy * cb + jy * sb;
        const mz = vz * cb + jz * sb;
        const pitch = shard.pitch + 0.2 * Math.sin(s0 * TAU * 1.1 - state.roll * 0.4 + level * 2.1);
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const axisX = kx * cp + mx * sp;
        const axisY = ky * cp + my * sp;
        const axisZ = kz * cp + mz * sp;
        const nx = mx * cp - kx * sp;
        const ny = my * cp - ky * sp;
        const nz = mz * cp - kz * sp;

        const ex = ox - cam.eye[0];
        const ey = oy - cam.eye[1];
        const ez = oz - cam.eye[2];
        const viewDepth = ex * cam.forward[0] + ey * cam.forward[1] + ez * cam.forward[2];
        depths[index] = viewDepth;
        const core = 1 - 0.45 * shard.lane * shard.lane;
        const size = 0.062 * s.shardSize * shard.size * GROWTH[level] * appear * Math.sqrt(taper) * core;
        const o = index * FLOATS;
        staging[o] = ox;
        staging[o + 1] = oy;
        staging[o + 2] = oz;
        staging[o + 3] = size > 1e-5 ? size : 0;
        staging[o + 4] = axisX;
        staging[o + 5] = axisY;
        staging[o + 6] = axisZ;
        staging[o + 7] = shard.thickness;
        staging[o + 8] = nx;
        staging[o + 9] = ny;
        staging[o + 10] = nz;
        staging[o + 11] = shard.tint;
        for (let k = 0; k < 10; k += 1) staging[o + 12 + k] = shard.shape[k];
        staging[o + 22] = shard.sides;
        staging[o + 23] = shard.flash;
      }

      let markerTotal = 0;
      for (let level = 0; level < LEVELS; level += 1) {
        markerCounts[level] = 0;
        markerStarts[level] = 0;
      }
      if (s.markers >= 0) {
        const ratio = output.size[1] / Math.max(container.clientHeight, 1);
        const pointerX = (state.pointer[0] - 0.5) * 2 * aspect;
        const pointerY = (0.5 - state.pointer[1]) * 2;
        const engaged = s.mouseInteraction && !reduced ? state.presence : 0;
        const previousTargets = state.targets;
        const nextTargets = new Map();
        const targetEase = 1 - Math.exp(-dt / 0.12);
        let nearestKey = '';
        let nearestGap = 72;
        for (let level = LEVELS - 1; level >= 0; level -= 1) {
          markerStarts[level] = markerTotal;
          const depth = DEPTHS[level];
          const depthScale = depth / CAMERA;
          const spacing = 0.42 * Math.pow(depthScale, 0.55);
          const halfW = ((aspect * depth) / (CAMERA * s.scale)) * 1.12 + spacing;
          const halfH = (depth / (CAMERA * s.scale)) * 1.12 + spacing;
          const drift = state.markerDrift;
          const phase = MARKER_PHASES[level];
          const i0 = Math.floor((drift - halfW) / spacing - phase[0]);
          const i1 = Math.ceil((drift + halfW) / spacing - phase[0]);
          const j0 = Math.floor(-halfH / spacing - phase[1]);
          const j1 = Math.ceil(halfH / spacing - phase[1]);
          const band = s.spread * (0.15 + 0.035 * depth) * 1.4;
          const position = paths[level].position;
          for (let i = i0; i <= i1; i += 1) {
            for (let j = j0; j <= j1; j += 1) {
              const keep = latticeHash(level, i, j, 11);
              if (keep > 0.5) continue;
              const x = (i + phase[0]) * spacing - drift;
              const y = (j + phase[1]) * spacing;
              const z = CAMERA - depth;
              const markerDepth = screenOf(x, y, z, flat);
              if (Math.abs(flat[0]) > aspect * 1.05 || Math.abs(flat[1]) > 1.05) continue;
              let best = Infinity;
              for (let k = 0; k < SAMPLES; k += 2) {
                const dx = x - position[k * 3];
                const dy = y - position[k * 3 + 1];
                const dz = z - position[k * 3 + 2];
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < best) best = d2;
              }
              const near = Math.exp(-best / (band * band));
              const blinkSeed = latticeHash(level, i, j, 23);
              const blinkRate = latticeHash(level, i, j, 37);
              const blink =
                blinkSeed < 0.07 ? 0.5 + 0.5 * Math.sin(state.clock * (1.4 + blinkRate * 2.2) + blinkRate * 40) : 0;
              const pointerGap = (Math.hypot(flat[0] - pointerX, flat[1] - pointerY) * halfHeight) / ratio;
              const key = `${level}:${i}:${j}`;
              if (level <= 2 && engaged > 0.01 && pointerGap < nearestGap) {
                nearestGap = pointerGap;
                nearestKey = key;
              }
              const wanted = key === state.markerTarget ? engaged * (1 - smoother((pointerGap - 30) / 42)) : 0;
              const before = previousTargets.get(key) ?? 0;
              const target = before + (wanted - before) * targetEase;
              if (target > 0.002) nextTargets.set(key, target);
              const bracket = Math.max(smoother((blink - 0.55) / 0.4), target);
              let ring = 0;
              if (rings.length) ring = ringBand(flat[0], flat[1], level);
              let reveal = 1;
              if (introOn) {
                const across = clamp((flat[0] / aspect + 1) * 0.5, 0, 1);
                const begin = level * 0.22 + 0.35 + across * (INTRO_SECONDS - 1.3 - (LEVELS - 1) * 0.22);
                reveal = smoother((introAge - begin) / 0.5);
              }
              const fade = FADE[level] * (1 - smoother((markerDepth - 3) / 10) * 0.45) * reveal;
              if (fade < 0.002) continue;
              if (markerTotal >= markerCapacity) ensureMarkers(markerCapacity * 2);
              const o = markerTotal * MARKER_FLOATS;
              markerData[o] = x;
              markerData[o + 1] = y;
              markerData[o + 2] = z;
              markerData[o + 3] = fade;
              markerData[o + 4] = 0.42 + 0.5 * near + blink * 0.9 + target * 1.3 + ring * 2.5;
              markerData[o + 5] = bracket;
              markerData[o + 6] = 1 + 0.15 * near + 0.3 * blink + 0.2 * target;
              markerData[o + 7] = 0;
              markerTotal += 1;
              markerCounts[level] += 1;
            }
          }
        }
        state.targets = nextTargets;
        state.markerTarget = nearestKey;
      }
      state.markerTotal = markerTotal;
    };

    /**
     * 原版对 depths 做降序插入排序：O(n²)，1100 个碎片最坏约 60 万次比较。
     * 换成稳定降序基数排序：深度(float32) 映射成单调 uint32 键，4 趟 8 位桶。
     * 稳定性保证结果与插入排序逐元素等价（降序，且深度完全相同的碎片保持原索引顺序），
     * 混合顺序不变，画面一个像素都不变。
     */
    const sortOrder = (keys, count) => {
      for (let i = 0; i < count; i += 1) {
        floatProbe[0] = keys[i];
        const bits = uintProbe[0];
        // 负数按位取反、正数置最高位：把 IEEE754 排成单调递增的整数序
        sortKeys[i] = (bits & 0x80000000) !== 0 ? ~bits >>> 0 : (bits | 0x80000000) >>> 0;
        sortA[i] = i;
      }
      let src = sortA;
      let dst = sortB;
      for (let shift = 0; shift < 32; shift += 8) {
        buckets.fill(0);
        for (let i = 0; i < count; i += 1) buckets[(sortKeys[src[i]] >>> shift) & 0xff] += 1;
        // 桶从大到小发牌 = 降序；同桶内保持输入顺序 = 稳定
        let start = 0;
        for (let bucket = 255; bucket >= 0; bucket -= 1) {
          const size = buckets[bucket];
          buckets[bucket] = start;
          start += size;
        }
        for (let i = 0; i < count; i += 1) {
          const value = src[i];
          dst[buckets[(sortKeys[value] >>> shift) & 0xff]++] = value;
        }
        const swap = src;
        src = dst;
        dst = swap;
      }
      const out = state.order;
      out.length = count;
      for (let i = 0; i < count; i += 1) out[i] = src[i];
      return out;
    };

    /**
     * 自适应 dpr 的三段式：探测 → 上探 → 复查。只在 fps=0（不限帧）时启用——
     * 有人为限帧时帧间隔被人为拉长，测出来的"余量"是假的。
     *
     * 采样口径：
     *   - 计时用 rAF 回调的 now 与上一帧的差（同一时基），dt 已被 Math.min(…, 0.05) 截断，天然削掉大毛刺；
     *   - 前 20 帧整段丢弃：首帧 dt=0、vgpu 首次 frame() 的管线编译/绑定分配都落在这一段；
     *   - 累计 90 个样本（60Hz≈1.5s、144Hz≈0.6s）后取**中位数**而不是平均，偶发 GC 抖动不会拉偏结论；
     *   - 判定用绝对帧时间：≤8ms 说明还有大把余量 → 上探 1.5；≤12ms → 上探 1.25；否则老实待在 1.0。
     */
    const medianOf = values => {
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[sorted.length >> 1] || 0;
    };
    const setDprCap = cap => {
      adaptiveDpr = cap;
      // 换 dpr 只走 resize 这条既有路径：output/scene/group/level 全按新尺寸重建，
      // depth texture 换了之后 resize() 里本来就会重绑 shadow 的 depthMap
      resize();
      state.quiet = 0;
    };
    const finishProbe = () => {
      probeActive = false;
      probeBase = medianOf(probeSamples);
      probeSamples.length = 0;
      if (probeBase <= 8) setDprCap(1.5);
      else if (probeBase <= 12) setDprCap(1.25);
      else setDprCap(1);
      // 只有上探过才需要复查；原地待在 1.0 没什么可回退的
      if (adaptiveDpr > 1) {
        recheckActive = true;
        recheckSkip = 30;
        recheckSamples.length = 0;
      }
    };
    const sampleAdaptiveDpr = (dt, s) => {
      if (s.fps > 0) return;
      const ms = dt * 1000;
      if (ms <= 0) return;
      if (probeActive) {
        if (probeSkip > 0) {
          probeSkip -= 1;
          return;
        }
        probeSamples.push(ms);
        if (probeSamples.length >= 90) finishProbe();
        return;
      }
      if (!recheckActive) return;
      if (recheckSkip > 0) {
        recheckSkip -= 1;
        return;
      }
      recheckSamples.push(ms);
      if (recheckSamples.length < 90) return;
      recheckActive = false;
      const after = medianOf(recheckSamples);
      recheckSamples.length = 0;
      // 上探后帧时间明显变差（超过 12ms 且比探测时差 1.4 倍以上）→ 退回 1.0 并锁定，不再尝试
      if (after > Math.max(12, probeBase * 1.4)) setDprCap(1);
    };

    const render = (s, dt, reduced) => {
      updateCamera(s);
      const shards = state.shards;
      ensureCapacity(shards.length);
      simulate(s, dt, reduced);
      if (state.order.length !== shards.length) state.order = shards.map((_, index) => index);
      for (let i = 0; i < shards.length; i += 1) depths[i] += shards[i].level * 100;
      const order = sortOrder(depths, shards.length);
      const counts = [0, 0, 0, 0, 0];
      for (let slot = 0; slot < order.length; slot += 1) {
        const from = order[slot] * FLOATS;
        const to = slot * FLOATS;
        counts[shards[order[slot]].level] += 1;
        for (let k = 0; k < FLOATS; k += 1) upload[to + k] = staging[from + k];
      }
      shardBuffer?.write(upload.subarray(0, shards.length * FLOATS));
      if (state.markerTotal > 0) markerBuffer?.write(markerData.subarray(0, state.markerTotal * MARKER_FLOATS));
      const starts = [0, 0, 0, 0, 0];
      let running = 0;
      for (let level = LEVELS - 1; level >= 0; level -= 1) {
        starts[level] = running;
        running += counts[level];
      }

      frameParams.set({
        view: [output.size[0], output.size[1], cam.focal, state.clock],
        eye: [cam.eye[0], cam.eye[1], cam.eye[2], FOCUS],
        forward: [cam.forward[0], cam.forward[1], cam.forward[2], s.depthOfField * output.size[1] * 0.03],
        right: [cam.right[0], cam.right[1], cam.right[2], output.size[1] * 0.05],
        up: [cam.up[0], cam.up[1], cam.up[2], s.lightMode ? 1 : 0],
        shard: [...s.shard, 0],
        accent: [...s.accent, 0],
        surface: s.material,
        marker: [
          s.markers,
          output.size[1] / Math.max(container.clientHeight, 1),
          4 * (output.size[1] / Math.max(container.clientHeight, 1)),
          FOCUS
        ]
      });
      passes.forEach(({ downParams, horizontalParams, verticalParams, source, level }) => {
        downParams.set({ texel: [0.5 / source.size[0], 0.5 / source.size[1], 0.75, 0.5] });
        horizontalParams.set({ texel: [1 / level.main.size[0], 0, 0, 0] });
        verticalParams.set({ texel: [0, 1 / level.main.size[1], 0, 0] });
      });
      const paper = s.paper ?? [0, 0, 0];
      const blooming = s.glow > 0.001 && !s.lightMode;
      finishParams.set({
        info: [s.grain, Math.floor(state.clock * 24), blooming ? s.glow : 0, 1.3],
        paper: [paper[0], paper[1], paper[2], s.paper ? 1 : 0],
        mode: [s.lightMode ? 1 : 0, s.vignette, 0, 0]
      });

      const coc = s.depthOfField * output.size[1] * 0.012;
      const cap = output.size[1] * 0.02;
      const plan = DEPTHS.map((depth, level) => {
        const sigma = Math.min(coc * Math.abs(1 - SHARD_FOCUS / depth), cap);
        // 单层档只有一组 target：groupIndex 必须夹到现有组，景深模糊（soft）也随之不启用，
        // 否则会为了 blur 在单层里铺两张全尺寸 temp，比省下来的还贵
        const groupIndex = groups.length > 1 && sigma >= 2.2 ? 1 : 0;
        const group = groups[groupIndex];
        // 单层档默认不做景深模糊（要多铺两张全尺寸 temp），depth-blur 打开才启用
        const soft = sigma >= 0.45 && (groups.length > 1 || s.depthBlur);
        if (soft && !group.softReady) {
          group.softReady = true;
          group.temp.resize(groupSize(group.scale));
          group.blurred.resize(groupSize(group.scale));
        }
        const size = group.layer.size;
        layerParams[level].set({
          view: [size[0], size[1], cam.focal * (size[0] / output.size[0]), level],
          look: [s.lightMode ? 0.5 : 0.7, 0, 0, 0]
        });
        const local = sigma * group.scale;
        spreadX[level].set({ texel: [1 / size[0], 0, local, 0] });
        spreadY[level].set({ texel: [0, 1 / size[1], local, 0] });
        mixParams[level].set({ info: [FADE[level], 0, 0, 0] });
        const step = Math.max(0.6, 1.4 * (size[0] / Math.max(container.clientWidth, 1)));
        const shadowStrength = s.material === MATERIALS.glass ? 0 : s.lightMode ? 0.32 : 0.62;
        shadeParams[level].set({ info: [step * 0.55, step * 0.85, shadowStrength, 0], more: [0.00045, 0, 0, 0] });
        return { group, groupIndex, soft };
      });

      frame(instance, current => {
        for (let level = LEVELS - 1; level >= 0; level -= 1) {
          const { group, groupIndex, soft } = plan[level];
          const steps = layerPasses[level][groupIndex];
          if (counts[level] > 0) {
            current.pass({ target: group.layer, clear: [0, 0, 0, 0], clearDepth: 1 }, pass => {
              pass.draw(shardSolid[level], { instances: counts[level], firstInstance: starts[level] });
              pass.draw(shardEdge[level], { instances: counts[level], firstInstance: starts[level] });
            });
            current.pass({ target: group.shaded, clear: [0, 0, 0, 0] }, pass => pass.draw(steps.shadow));
            if (soft) {
              current.pass({ target: group.temp, clear: [0, 0, 0, 0] }, pass => pass.draw(steps.blurX));
              current.pass({ target: group.blurred, clear: [0, 0, 0, 0] }, pass => pass.draw(steps.blurY));
            }
          }
          current.pass({ target: scene, clear: level === LEVELS - 1 ? [0, 0, 0, 0] : false }, pass => {
            if (markerCounts[level] > 0) {
              pass.draw(markerDraw, { instances: markerCounts[level], firstInstance: markerStarts[level] });
            }
            if (counts[level] > 0) pass.draw(soft ? steps.soft : steps.sharp);
          });
        }
        passes.forEach((pass, index) => {
          const level = levels[index];
          if (!blooming) {
            current.pass({ target: level.main, clear: [0, 0, 0, 0] }, () => {});
            return;
          }
          current.pass({ target: level.main, clear: [0, 0, 0, 0] }, p => p.draw(pass.down));
          current.pass({ target: level.spare, clear: [0, 0, 0, 0] }, p => p.draw(pass.horizontal));
          current.pass({ target: level.main, clear: [0, 0, 0, 0] }, p => p.draw(pass.vertical));
        });
        if (levels.length < BLOOM_LEVELS) {
          // 空 bloom 级每帧清一次（1x1，成本约等于 0），保证它对 finish 的贡献恒为 0
          current.pass({ target: bloomBlank, clear: [0, 0, 0, 0] }, () => {});
        }
        current.pass({ target: output, clear: [0, 0, 0, 0] }, pass => pass.draw(finish));
      });
    };

    // 停帧：props.paused 或系统要求少动效时不再续帧，画面停在最后一帧（原版是每帧无条件续帧）
    const frozen = () => settingsRef.value.paused || prefersReduced();

    // 停帧后只能靠事件唤醒：取消 paused、或系统少动效偏好变化时补一帧
    wake = () => {
      if (!disposed && raf === 0 && !frozen()) raf = requestAnimationFrame(tick);
    };
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    motionQuery?.addEventListener?.('change', wake);
    cleanups.push(() => motionQuery?.removeEventListener?.('change', wake));

    const tick = now => {
      raf = 0;
      frameOnce(now);
      if (!frozen()) raf = requestAnimationFrame(tick);
    };

    const frameOnce = now => {
      if (!state.visible || document.hidden) {
        state.last = now;
        return;
      }
      // 交互让路：用户正在操作页面时整帧跳过 —— 不模拟、不上传、不渲染，主线程和 GPU 都让出去
      if (interacting) {
        state.last = now;
        return;
      }
      const s = settingsRef.value;
      // 帧率上限：按真实帧间隔节流，没到预算就整帧跳过（不模拟、不上传、不渲染），
      // 但 rAF 链照常续着，所以恢复时能立刻回到目标帧率。dt 仍按真实间隔算，动画速度不变。
      if (s.fps > 0 && state.last && now - state.last < 1000 / s.fps - 1) return;
      const dt = state.last ? Math.min((now - state.last) / 1000, 0.05) : 0;
      state.last = now;
      sampleAdaptiveDpr(dt, s);
      const reduced = prefersReduced();
      state.clock += dt;
      if (state.introAt < 0) state.introAt = state.clock;
      if (state.shards.length !== s.count) {
        state.shards = createShards(s.count, 1337);
        state.order = [];
      }
      const moving = !s.paused && !reduced;
      if (moving) {
        for (let level = 0; level < LEVELS; level += 1) {
          state.travel[level] = (state.travel[level] + (dt * s.speed * 0.09) / paths[level].length) % 1;
        }
        state.roll += dt * s.speed * 1.0;
        state.twist += dt * s.speed * 0.08;
        state.drift += dt * s.speed;
      }

      const goal = PLACEMENTS.map((_, index) => (index === s.placement ? 1 : 0));
      let settling = false;
      const decay = Math.exp(-4 * dt);
      for (let index = 0; index < 4; index += 1) {
        const offset = state.weights[index] - goal[index];
        const momentum = state.weightVelocity[index] + 4 * offset;
        state.weights[index] = goal[index] + (offset + momentum * dt) * decay;
        state.weightVelocity[index] = (state.weightVelocity[index] - 4 * momentum * dt) * decay;
        if (Math.abs(state.weights[index] - goal[index]) > 0.0005) settling = true;
      }
      if (!settling) {
        state.weights = goal;
        state.weightVelocity = [0, 0, 0, 0];
      }

      const engaged = s.mouseInteraction && state.inside && !reduced;
      state.presence += ((engaged ? 1 : 0) - state.presence) * (1 - Math.exp(-dt / 0.25));
      const lean = engaged ? s.parallax : 0;
      const targetYaw = (state.pointer[0] - 0.5) * lean * 0.14;
      const targetPitch = (state.pointer[1] - 0.5) * lean * 0.08;
      state.yawVelocity += (38 * (targetYaw - state.yaw) - 11 * state.yawVelocity) * dt;
      state.pitchVelocity += (38 * (targetPitch - state.pitch) - 11 * state.pitchVelocity) * dt;
      state.yaw += state.yawVelocity * dt;
      state.pitch += state.pitchVelocity * dt;
      const leaning =
        Math.abs(targetYaw - state.yaw) + Math.abs(targetPitch - state.pitch) > 1e-4 ||
        Math.abs(state.yawVelocity) + Math.abs(state.pitchVelocity) > 1e-4;

      if (
        state.pressAt >= 0 &&
        state.pressPoint &&
        s.holdToGather &&
        !reduced &&
        state.clock - state.pressAt > 0.18
      ) {
        if (!state.holding) {
          state.holding = true;
          updateCamera(s);
          rayAt(state.pressPoint[0], state.pressPoint[1]);
          const travelTo =
            FOCUS / Math.max(ray[0] * cam.forward[0] + ray[1] * cam.forward[1] + ray[2] * cam.forward[2], 0.2);
          state.gatherCenter = [
            cam.eye[0] + ray[0] * travelTo,
            cam.eye[1] + ray[1] * travelTo,
            cam.eye[2] + ray[2] * travelTo
          ];
          state.reach = 0;
        }
        state.hold = Math.min(1, state.hold + dt / 0.5);
        state.reach = Math.min(state.reach + dt * 0.5, 0.55);
        const reach = (0.22 + state.reach) / s.scale;
        for (const shard of state.shards) {
          if (shard.joined || shard.level > 2) continue;
          const gx = shard.position[0] - state.gatherCenter[0];
          const gy = shard.position[1] - state.gatherCenter[1];
          if (gx * gx + gy * gy < reach * reach) shard.joined = true;
        }
      } else if (state.hold > 0) {
        state.hold = Math.max(0, state.hold - dt / 0.3);
        if (state.hold === 0) {
          for (const shard of state.shards) shard.joined = false;
        }
      }

      for (const ring of state.rings) ring.age += dt;
      state.rings = state.rings.filter(ring => ring.age < RING_SECONDS);
      if (moving) state.markerDrift += dt * s.speed * 0.045;

      const flashing = state.shards.some(
        shard => shard.flash > 0.01 || Math.abs(shard.tiltVelocity) > 0.01 || Math.abs(shard.tilt) > 0.01
      );
      const transient =
        settling ||
        leaning ||
        flashing ||
        state.presence > 0.002 ||
        state.rings.length > 0 ||
        state.hold > 0 ||
        (s.intro && !reduced && state.clock - state.introAt < INTRO_SECONDS + 0.5);
      if (state.seen !== s || transient || moving) state.quiet = 0;
      else state.quiet += 1;
      state.seen = s;
      if (state.quiet > 30) return;
      resize();
      render(s, dt, reduced);
    };

    const local = event => {
      const rect = container.getBoundingClientRect();
      return {
        point: [
          (event.clientX - rect.left) / Math.max(rect.width, 1),
          (event.clientY - rect.top) / Math.max(rect.height, 1)
        ],
        inside:
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
      };
    };

    const onMove = event => {
      const hit = local(event);
      state.inside = hit.inside;
      if (hit.inside) state.pointer = hit.point;
    };

    const onLeave = () => {
      state.inside = false;
    };

    const onDown = event => {
      const s = settingsRef.value;
      if (event.button !== 0 || prefersReduced() || !s.mouseInteraction) return;
      if (
        event.target instanceof Element &&
        event.target.closest('a, button, input, textarea, select, label, [role="button"]')
      )
        return;
      const hit = local(event);
      if (!hit.inside) return;
      state.pointer = hit.point;
      state.pressAt = state.clock;
      state.pressPoint = hit.point;
    };

    const onUp = () => {
      const s = settingsRef.value;
      if (state.pressAt < 0) return;
      if (!state.holding && s.pulseOnClick && state.pressPoint) {
        const aspect = output.size[0] / Math.max(output.size[1], 1);
        state.rings.push({
          x: (state.pressPoint[0] * 2 - 1) * aspect,
          y: 1 - state.pressPoint[1] * 2,
          age: 0
        });
        if (state.rings.length > MAX_RINGS) state.rings.shift();
      }
      if (state.holding) {
        for (const shard of state.shards) {
          if (shard.joined) shard.tiltVelocity += 9 * shard.sign;
        }
      }
      state.pressAt = -1;
      state.holding = false;
    };

    // ── 交互让路 ──
    // 用户滚动/滚轮/触屏滑/按键/按下指针时，背景连模拟带渲染全部停摆（比降帧彻底：一帧都不占），
    // 停手 250ms 后恢复并立刻补一帧。全部 passive，scroll 用 capture 才能捕获内部滚动容器。
    // 故意不监听 pointermove：背景要跟随鼠标，挪一下就停会显得僵死。
    const YIELD_HOLD = 250;
    const YIELD_POLL = 50;
    let interacting = false;
    let lastInteract = 0;
    let yieldTimer = 0;
    const yieldToUser = () => {
      lastInteract = performance.now();
      if (interacting) return; // 已经在让路，只刷新时间戳，不重建定时器
      interacting = true;
      if (yieldTimer) return; // 同一时刻只有一个定时器（不做 clearTimeout+setTimeout 抖动）
      const settle = () => {
        if (performance.now() - lastInteract < YIELD_HOLD) {
          yieldTimer = setTimeout(settle, YIELD_POLL);
          return;
        }
        yieldTimer = 0;
        interacting = false;
        wake?.(); // 立刻补一帧，不等下一个 rAF 空转
      };
      yieldTimer = setTimeout(settle, YIELD_HOLD);
    };
    window.addEventListener('scroll', yieldToUser, { passive: true, capture: true });
    window.addEventListener('wheel', yieldToUser, { passive: true });
    window.addEventListener('touchmove', yieldToUser, { passive: true });
    window.addEventListener('keydown', yieldToUser, { passive: true });
    window.addEventListener('pointerdown', yieldToUser, { passive: true });
    cleanups.push(() => {
      window.removeEventListener('scroll', yieldToUser, { capture: true });
      window.removeEventListener('wheel', yieldToUser);
      window.removeEventListener('touchmove', yieldToUser);
      window.removeEventListener('keydown', yieldToUser);
      window.removeEventListener('pointerdown', yieldToUser);
      if (yieldTimer) clearTimeout(yieldTimer);
      yieldTimer = 0;
      interacting = false;
    });

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.documentElement.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    });

    const visibility = new IntersectionObserver(entries => {
      state.visible = entries.some(entry => entry.isIntersecting);
      // 停帧状态下循环已经退出：进场/回到可视区必须把它叫回来，否则首帧被 visible=false 拦掉后永不渲染
      if (state.visible) wake?.();
    });
    visibility.observe(container);
    cleanups.push(() => visibility.disconnect());

    // 标签页切回前台同理（隐藏期间不出帧，回来后补上）
    const onVisible = () => {
      if (!document.hidden) wake?.();
    };
    document.addEventListener('visibilitychange', onVisible);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));
    raf = requestAnimationFrame(tick);
  };

  // 卸载：先停帧，再摘所有监听/观察器，最后销毁 GPU 侧资源，顺序不能反
  teardown = () => {
    disposed = true;
    cancelAnimationFrame(raf);
    cleanups.forEach(cleanup => cleanup());
    gpu?.dispose();
    canvas.remove();
    wake = null;
  };

  start().catch(fail);
});

onUnmounted(() => {
  teardown?.();
  teardown = null;
});
</script>

<template>
  <div ref="containerRef" :class="ROOT" />
</template>

<style scoped>
/* 与原版 AeroShards.css 等价 */
.aero-shards {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* canvas 是运行时建的，拿不到 scoped 属性，只能下钻 */
.aero-shards :deep(.aero-shards-canvas) {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
</style>
