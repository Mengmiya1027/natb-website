import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn-vue 约定的 className 合并工具 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * 点 sonner 的提示条算不算「点弹窗外」。
 *
 * reka-ui 的 DismissableLayer 在 document 上监听 pointerdown，而提示条挂在 body 下，
 * 不在任何对话框的 DOM 里，于是点它既会被当成「点了外面」把对话框关掉，又拿不到想要的那一下点击。
 * 命中提示条时调用方 preventDefault() 即可（reka 派发的 CustomEvent 是 cancelable 的）。
 */
export function isToastTarget(event) {
  const target = event?.detail?.originalEvent?.target ?? event?.target
  return target instanceof Element && Boolean(target.closest('[data-sonner-toaster]'))
}
