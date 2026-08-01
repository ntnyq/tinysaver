import type { DownloadOptions } from '../types'
export interface FileSystemWritable {
  abort?: (reason?: unknown) => Promise<void>
  close: () => Promise<void>
  write: (data: Blob | BufferSource | string) => Promise<void>
}

export type SaveFilePicker = (options?: {
  suggestedName?: string
  types?: Array<{ description?: string; accept: Record<string, string[]> }>
}) => Promise<{
  createWritable: () => Promise<FileSystemWritable>
}>

type FileSystemAccessWindow = Omit<Window, 'showSaveFilePicker'> & {
  showSaveFilePicker?: SaveFilePicker
}

export function getSaveFilePicker(
  options: DownloadOptions,
): SaveFilePicker | null {
  const browserWindow = window as FileSystemAccessWindow
  if (
    !options.preferFileSystemAccess ||
    typeof browserWindow.showSaveFilePicker !== 'function'
  ) {
    return null
  }

  return browserWindow.showSaveFilePicker.bind(browserWindow)
}

/**
 * Writes a Blob directly through the File System Access API when preferred.
 *
 * @param blob - Blob content to write.
 * @param name - Suggested filename shown by the browser picker.
 * @param options - Download options controlling API preference and callbacks.
 * @returns Whether the File System Access workflow handled the Blob.
 */
export async function saveBlobWithFileSystemAccess(
  blob: Blob,
  name: string,
  options: DownloadOptions,
): Promise<boolean> {
  const showSaveFilePicker = getSaveFilePicker(options)
  if (!showSaveFilePicker) {
    return false
  }

  options.onPhaseChange?.('saving')
  const handle = await showSaveFilePicker({ suggestedName: name })
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
  } catch (error) {
    await writable.abort?.(error).catch(() => null)
    throw error
  }
  options.onPhaseChange?.('completed')
  options.onComplete?.()
  return true
}
