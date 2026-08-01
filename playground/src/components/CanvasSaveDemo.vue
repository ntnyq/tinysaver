<script setup lang="ts">
import { saveCanvas } from 'tinysaver'
import { computed, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useSaveStatus } from '../composables/useSaveStatus'
import DownloadStatus from './DownloadStatus.vue'

const caption = shallowRef('Made to keep')
const accent = shallowRef('#175cff')
const filename = shallowRef('tinysaver-card.png')
const resolvedFilename = computed(() => filename.value.trim() || 'canvas.png')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const status = useSaveStatus()

function fitCaption(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): number {
  let fontSize = 86
  while (fontSize > 42) {
    context.font = `700 ${fontSize}px "Arial Rounded MT Bold", "Avenir Next", sans-serif`
    if (context.measureText(text).width <= maxWidth) {
      return fontSize
    }
    fontSize -= 4
  }
  return fontSize
}

function drawPreview(): void {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context) {
    return
  }

  context.clearRect(0, 0, element.width, element.height)
  context.fillStyle = '#dcebe5'
  context.fillRect(0, 0, element.width, element.height)
  context.fillStyle = accent.value
  context.fillRect(50, 48, 1100, 579)
  context.fillStyle = '#ffffff'
  context.fillRect(78, 76, 1044, 523)

  context.fillStyle = accent.value
  context.fillRect(78, 76, 20, 523)
  context.font = '700 22px "SFMono-Regular", monospace'
  context.fillText('TINYSAVER / CANVAS', 142, 158)

  const displayText = caption.value.trim() || 'Untitled canvas'
  const fontSize = fitCaption(context, displayText, 850)
  context.font = `700 ${fontSize}px "Arial Rounded MT Bold", "Avenir Next", sans-serif`
  context.fillStyle = '#10231d'
  context.fillText(displayText, 142, 330)

  context.strokeStyle = '#a9beb6'
  context.lineWidth = 3
  context.beginPath()
  context.moveTo(142, 410)
  context.lineTo(1035, 410)
  context.stroke()
  context.font = '500 25px "Avenir Next", sans-serif'
  context.fillStyle = '#5c6f68'
  context.fillText('A browser-native file, ready when you are.', 142, 480)
}

function saveFile(): void {
  if (!canvas.value) {
    status.fail(new Error('Canvas is not ready'))
    return
  }

  status.start('Rendering PNG')
  try {
    saveCanvas(canvas.value, resolvedFilename.value, {
      onComplete: () => status.complete('Canvas image saved'),
      onError: status.fail,
      quality: 0.95,
      type: 'image/png',
    })
  } catch (error) {
    status.fail(error)
  }
}

onMounted(drawPreview)
watch([caption, accent], drawPreview, { flush: 'post' })
</script>

<template>
  <article class="demo-panel demo-panel--canvas">
    <header class="mb-5">
      <span class="demo-api font-mono text-[0.68rem] font-750">
        saveCanvas
      </span>
      <h2 class="mb-1 mt-2 text-xl font-700 tracking-[-0.025em] text-ink">
        Canvas artwork
      </h2>
      <p class="m-0 text-sm leading-6 text-muted">
        Personalize a card, then export the rendered pixels.
      </p>
    </header>

    <div class="file-preview p-2">
      <canvas
        ref="canvas"
        class="block aspect-video w-full rounded-lg bg-canvas"
        width="1200"
        height="675"
        role="img"
        :aria-label="`Canvas preview reading ${caption}`"
      />
    </div>

    <div class="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
      <div>
        <label
          class="control-label"
          for="canvas-caption"
          >Caption</label
        >
        <input
          id="canvas-caption"
          v-model="caption"
          class="control-field"
          maxlength="34"
          type="text"
        />
      </div>
      <div>
        <label
          class="control-label"
          for="canvas-accent"
          >Accent</label
        >
        <input
          id="canvas-accent"
          v-model="accent"
          class="h-11 w-full min-w-20 cursor-pointer rounded-xl border border-line bg-white p-1.5 sm:w-20"
          type="color"
        />
      </div>
    </div>

    <label
      class="control-label mt-4"
      for="canvas-filename"
      >Filename</label
    >
    <input
      id="canvas-filename"
      v-model="filename"
      class="control-field font-mono"
      type="text"
    />

    <footer
      class="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5"
    >
      <DownloadStatus
        :message="status.message.value"
        :phase="status.phase.value"
        :progress="status.progress.value"
      />
      <button
        class="action-button"
        type="button"
        @click="saveFile"
      >
        Save .png
      </button>
    </footer>
  </article>
</template>
