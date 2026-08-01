<script setup lang="ts">
import { computed } from 'vue'
import type { SavePhase } from '../composables/useSaveStatus'

interface Props {
  message: string
  phase: SavePhase
  progress?: number | null
}

// oxlint-disable-next-line no-undef -- Vue compiler macro
const props = defineProps<Props>()

const indicatorClass = computed(() => ({
  'animate-pulse bg-primary': props.phase === 'saving',
  'bg-danger': props.phase === 'error',
  'bg-muted/45': props.phase === 'idle' || props.phase === 'aborted',
  'bg-success': props.phase === 'saved',
}))
</script>

<template>
  <div
    class="flex min-h-6 items-center gap-2 text-xs text-muted"
    aria-live="polite"
  >
    <span
      class="h-2 w-2 shrink-0 rounded-full"
      :class="indicatorClass"
      aria-hidden="true"
    />
    <span>{{ props.message }}</span>
    <span
      v-if="props.phase === 'saving' && props.progress !== null"
      class="font-mono text-[0.68rem] font-700 text-primary"
    >
      {{ props.progress }}%
    </span>
  </div>
</template>
