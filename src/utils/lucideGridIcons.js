/**
 * 网格背景默认的 25 个 Lucide 图标
 * 逐个静态 import，只把这 25 个 SVG 打进产物；
 * 名字固定后 5×5 个格点各分一个，不重样。
 */
import rocket from '~icons/lucide/rocket?raw'
import star from '~icons/lucide/star?raw'
import zap from '~icons/lucide/zap?raw'
import sparkles from '~icons/lucide/sparkles?raw'
import hexagon from '~icons/lucide/hexagon?raw'
import triangle from '~icons/lucide/triangle?raw'
import circleDot from '~icons/lucide/circle-dot?raw'
import globe from '~icons/lucide/globe?raw'
import code from '~icons/lucide/code?raw'
import terminal from '~icons/lucide/terminal?raw'
import database from '~icons/lucide/database?raw'
import cloud from '~icons/lucide/cloud?raw'
import cpu from '~icons/lucide/cpu?raw'
import layers from '~icons/lucide/layers?raw'
import gitBranch from '~icons/lucide/git-branch?raw'
import box from '~icons/lucide/box?raw'
import compass from '~icons/lucide/compass?raw'
import activity from '~icons/lucide/activity?raw'
import aperture from '~icons/lucide/aperture?raw'
import atom from '~icons/lucide/atom?raw'
import binary from '~icons/lucide/binary?raw'
import bot from '~icons/lucide/bot?raw'
import braces from '~icons/lucide/braces?raw'
import camera from '~icons/lucide/camera?raw'
import clock from '~icons/lucide/clock?raw'

/** 图标名 → 原始 SVG 文本 */
export const GRID_ICONS = {
  'lucide:rocket': rocket,
  'lucide:star': star,
  'lucide:zap': zap,
  'lucide:sparkles': sparkles,
  'lucide:hexagon': hexagon,
  'lucide:triangle': triangle,
  'lucide:circle-dot': circleDot,
  'lucide:globe': globe,
  'lucide:code': code,
  'lucide:terminal': terminal,
  'lucide:database': database,
  'lucide:cloud': cloud,
  'lucide:cpu': cpu,
  'lucide:layers': layers,
  'lucide:git-branch': gitBranch,
  'lucide:box': box,
  'lucide:compass': compass,
  'lucide:activity': activity,
  'lucide:aperture': aperture,
  'lucide:atom': atom,
  'lucide:binary': binary,
  'lucide:bot': bot,
  'lucide:braces': braces,
  'lucide:camera': camera,
  'lucide:clock': clock,
}

/** 与 GRID_ICONS 同序的名字表，顺序固定便于对照 */
export const GRID_ICON_NAMES = Object.keys(GRID_ICONS)
