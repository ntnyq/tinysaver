<script setup lang="ts">
import { saveStream } from 'tinysaver/stream'
import { computed, shallowRef } from 'vue'
import { useSaveStatus } from '../composables/useSaveStatus'
import DownloadStatus from './DownloadStatus.vue'

interface CsvPayload {
  chunks: Uint8Array[]
  totalBytes: number
}

const rows = shallowRef(400)
const filename = shallowRef('generated-records.csv')
const abortController = shallowRef<AbortController | null>(null)
const resolvedFilename = computed(() => filename.value.trim() || 'records.csv')
const status = useSaveStatus()

function createCsvPayload(rowCount: number): CsvPayload {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = [encoder.encode('id,label,value\n')]
  const batchSize = 25

  for (let start = 1; start <= rowCount; start += batchSize) {
    const lines: string[] = []
    const end = Math.min(start + batchSize - 1, rowCount)
    for (let index = start; index <= end; index += 1) {
      lines.push(
        `${index},record-${String(index).padStart(4, '0')},${index * 17}\n`,
      )
    }
    chunks.push(encoder.encode(lines.join('')))
  }

  return {
    chunks,
    totalBytes: chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  }
}

function createCsvResponse(csvPayload: CsvPayload): Response {
  let chunkIndex = 0
  let isCancelled = false
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      isCancelled = true
    },
    async pull(controller) {
      await new Promise<void>(resolve => {
        globalThis.setTimeout(resolve, 18)
      })
      if (isCancelled) {
        return
      }

      const chunk = csvPayload.chunks[chunkIndex]
      if (!chunk) {
        controller.close()
        return
      }

      controller.enqueue(chunk)
      chunkIndex += 1
      if (chunkIndex === csvPayload.chunks.length) {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-length': String(csvPayload.totalBytes),
      'content-type': 'text/csv;charset=utf-8',
    },
  })
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

const payload = computed(() => createCsvPayload(rows.value))
const sizeLabel = computed(() => formatBytes(payload.value.totalBytes))
const isSaving = computed(() => status.phase.value === 'saving')

function cancelSave(): void {
  abortController.value?.abort()
}

async function saveFile(): Promise<void> {
  const controller = new AbortController()
  abortController.value = controller
  status.start('Streaming CSV chunks')

  try {
    await saveStream(createCsvResponse(payload.value), resolvedFilename.value, {
      onComplete: () => status.complete('Streamed file saved'),
      onError: error => {
        if (error.name === 'AbortError') {
          status.markAborted()
        } else {
          status.fail(error)
        }
      },
      onProgress: status.updateProgress,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      status.markAborted()
    } else {
      status.fail(error)
    }
  } finally {
    abortController.value = null
  }
}
</script>

<template>
  <article class="demo-panel demo-panel--stream">
    <header class="mb-5 flex items-start justify-between gap-4">
      <div>
        <span class="demo-api font-mono text-[0.68rem] font-750">
          saveStream
        </span>
        <h2 class="mb-1 mt-2 text-xl font-700 tracking-[-0.025em] text-ink">
          Generated stream
        </h2>
        <p class="m-0 text-sm leading-6 text-muted">
          Produce CSV chunks over time and follow their progress.
        </p>
      </div>
      <span
        class="rounded-lg bg-paperSoft px-2.5 py-1 font-mono text-[0.65rem] text-muted"
      >
        {{ sizeLabel }}
      </span>
    </header>

    <div class="file-preview p-4">
      <div class="mb-4 flex items-baseline justify-between gap-4">
        <span class="text-sm font-700 text-ink">Rows to generate</span>
        <strong class="font-mono text-xl text-primary">{{ rows }}</strong>
      </div>
      <input
        v-model.number="rows"
        class="stream-slider h-2 w-full cursor-pointer accent-primary"
        type="range"
        min="100"
        max="2000"
        step="100"
        aria-label="Rows to generate"
      />
      <div
        class="mt-3 flex justify-between font-mono text-[0.62rem] text-muted"
      >
        <span>100</span>
        <span>2,000</span>
      </div>
    </div>

    <label
      class="control-label mt-4"
      for="stream-filename"
      >Filename</label
    >
    <input
      id="stream-filename"
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
      <div class="flex gap-2">
        <button
          v-if="isSaving"
          class="secondary-button"
          type="button"
          @click="cancelSave"
        >
          Cancel
        </button>
        <button
          class="action-button"
          :disabled="isSaving"
          type="button"
          @click="saveFile"
        >
          {{ isSaving ? 'Streaming…' : 'Save .csv' }}
        </button>
      </div>
    </footer>
  </article>
</template>
