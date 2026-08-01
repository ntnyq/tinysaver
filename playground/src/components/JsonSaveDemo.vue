<script setup lang="ts">
import { saveJSON } from 'tinysaver'
import { computed, shallowRef } from 'vue'
import { useSaveStatus } from '../composables/useSaveStatus'
import DownloadStatus from './DownloadStatus.vue'

type JsonParseResult =
  | { data: unknown; valid: true }
  | { message: string; valid: false }

const jsonSource = shallowRef(`{
  "project": "tinysaver",
  "formats": ["text", "canvas", "json", "stream"],
  "browserOnly": true
}`)
const filename = shallowRef('tinysaver-config.json')
const resolvedFilename = computed(
  () => filename.value.trim() || 'document.json',
)
const status = useSaveStatus()

const parsedJson = computed<JsonParseResult>(() => {
  try {
    return { data: JSON.parse(jsonSource.value) as unknown, valid: true }
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Invalid JSON',
      valid: false,
    }
  }
})

const preview = computed(() =>
  parsedJson.value.valid
    ? JSON.stringify(parsedJson.value.data, null, 2)
    : 'Fix the JSON to enable saving.',
)

function saveFile(): void {
  if (!parsedJson.value.valid) {
    status.fail(new SyntaxError(parsedJson.value.message))
    return
  }

  status.start('Serializing JSON')
  try {
    saveJSON(parsedJson.value.data, resolvedFilename.value, {
      onComplete: () => status.complete('JSON file saved'),
      onError: status.fail,
      space: 2,
    })
  } catch (error) {
    status.fail(error)
  }
}
</script>

<template>
  <article class="demo-panel demo-panel--json">
    <header class="mb-5 flex items-start justify-between gap-4">
      <div>
        <span class="demo-api font-mono text-[0.68rem] font-750">
          saveJSON
        </span>
        <h2 class="mb-1 mt-2 text-xl font-700 tracking-[-0.025em] text-ink">
          Structured data
        </h2>
        <p class="m-0 text-sm leading-6 text-muted">
          Validate an object before saving formatted JSON.
        </p>
      </div>
      <span
        class="rounded-lg px-2.5 py-1 font-mono text-[0.65rem]"
        :class="
          parsedJson.valid
            ? 'bg-success/8 text-success'
            : 'bg-danger/8 text-danger'
        "
      >
        {{ parsedJson.valid ? 'valid' : 'invalid' }}
      </span>
    </header>

    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label
          class="control-label"
          for="json-content"
          >JSON input</label
        >
        <textarea
          id="json-content"
          v-model="jsonSource"
          class="control-field min-h-48 resize-y font-mono text-xs leading-5"
          spellcheck="false"
        />
      </div>
      <div>
        <span class="control-label">Formatted preview</span>
        <div class="file-preview h-48">
          <div
            class="border-b border-line bg-white px-3 py-2 font-mono text-[0.62rem] text-muted"
          >
            preview.json
          </div>
          <pre
            class="m-0 h-[calc(100%-33px)] overflow-auto p-3 font-mono text-[0.68rem] leading-5 text-ink"
            >{{ preview }}</pre>
        </div>
      </div>
    </div>

    <label
      class="control-label mt-4"
      for="json-filename"
      >Filename</label
    >
    <input
      id="json-filename"
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
        :disabled="!parsedJson.valid"
        type="button"
        @click="saveFile"
      >
        Save .json
      </button>
    </footer>
  </article>
</template>
