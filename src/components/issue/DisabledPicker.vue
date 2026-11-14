<script setup>
/**
 * 无权限时代替下拉框的存在：尺寸与 SelectTrigger / Button sm 一致（h-8 / px-3 / rounded-md），
 * 让板块不塌陷，同时把「不能改」写在框里，而不是在框外补一行注释。
 */
import IconBan from '~icons/lucide/ban'
</script>

<template>
  <div
    class="border-input text-muted-foreground flex h-8 w-full items-center gap-1.5 rounded-md border px-3 text-sm select-none"
    aria-disabled="true"
  >
    <IconBan class="size-3.5 shrink-0" />
    你没有管理员权限
  </div>
</template>
