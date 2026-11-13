import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn-vue 约定的 className 合并工具 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
