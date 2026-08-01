<script setup lang="ts">
import { saveText } from 'tinysaver'
import { computed, shallowRef } from 'vue'
import { useSaveStatus } from '../composables/useSaveStatus'
import DownloadStatus from './DownloadStatus.vue'

const text = shallowRef(
  'A tiny file can still carry a useful idea.\n\nSaved locally with tinysaver.',
)
const filename = shallowRef('field-note.txt')
const characterCount = computed(() => text.value.length)
const resolvedFilename = computed(() => filename.value.trim() || 'note.txt')
const status = useSaveStatus()

function saveFile(): void {
  status.start('Preparing text file')
  try {
    saveText(text.value, resolvedFilename.value, {
      onComplete: () => status.complete('Text file saved'),
      onError: status.fail,
    })
  } catch (error) {
    status.fail(error)
  }
}
</script>

<template>
  <article class="demo-panel demo-panel--text">
    <header class="mb-5 flex items-start justify-between gap-4">
      <div>
        <span class="demo-api font-mono text-[0.68rem] font-750">
          saveText
        </span>
        <h2 class="mb-1 mt-2 text-xl font-700 tracking-[-0.025em] text-ink">
          Plain text
        </h2>
        <p class="m-0 text-sm leading-6 text-muted">
          Write a note and download it as UTF-8 text.
        </p>
      </div>
      <span
        class="rounded-lg bg-paperSoft px-2.5 py-1 font-mono text-[0.65rem] text-muted"
      >
        {{ characterCount }} chars
      </span>
    </header>

    <label
      class="control-label"
      for="text-content"
      >File content</label
    >
    <textarea
      id="text-content"
      v-model="text"
      class="control-field min-h-38 resize-y leading-6"
      spellcheck="true"
    />

    <label
      class="control-label mt-4"
      for="text-filename"
      >Filename</label
    >
    <input
      id="text-filename"
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
        Save .txt
      </button>
    </footer>
  </article>
</template>
