import { readonly, shallowRef } from 'vue'

export type SavePhase = 'aborted' | 'error' | 'idle' | 'saved' | 'saving'

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The file could not be saved'
}

export function useSaveStatus() {
  const message = shallowRef('Ready to save')
  const phase = shallowRef<SavePhase>('idle')
  const progress = shallowRef<number | null>(null)

  function start(nextMessage = 'Preparing file'): void {
    message.value = nextMessage
    phase.value = 'saving'
    progress.value = null
  }

  function complete(nextMessage = 'File saved'): void {
    message.value = nextMessage
    phase.value = 'saved'
    progress.value = 100
  }

  function fail(error: unknown): void {
    message.value = toErrorMessage(error)
    phase.value = 'error'
    progress.value = null
  }

  function markAborted(): void {
    message.value = 'Save cancelled'
    phase.value = 'aborted'
    progress.value = null
  }

  function updateProgress(loadedBytes: number, totalBytes: number): void {
    if (totalBytes <= 0) {
      return
    }
    progress.value = Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
  }

  return {
    complete,
    fail,
    markAborted,
    message: readonly(message),
    phase: readonly(phase),
    progress: readonly(progress),
    start,
    updateProgress,
  }
}
