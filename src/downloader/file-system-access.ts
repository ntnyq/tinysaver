import type { DownloadOptions } from '../types'
import { createAbortError, waitWithSignal } from './abort'

/**
 * File writer operations used by the Blob and stream download transports.
 */
export interface FileSystemWritable {
  abort?: (reason?: unknown) => Promise<void>
  close: () => Promise<void>
  write: (data: Blob | BufferSource | string) => Promise<void>
}

/**
 * Browser picker that opens a destination file for writing.
 *
 * @param options - Suggested filename and accepted file types shown by the picker.
 * @returns A promise for a file handle, or a rejection if selection fails.
 */
export type SaveFilePicker = (options?: {
  suggestedName?: string
  types?: Array<{ description?: string; accept: Record<string, string[]> }>
}) => Promise<{
  createWritable: () => Promise<FileSystemWritable>
}>

type FileSystemAccessWindow = Omit<Window, 'showSaveFilePicker'> & {
  showSaveFilePicker?: SaveFilePicker
}

/**
 * Resolves the preferred file picker and binds it to its browser window.
 *
 * @param options - Download options controlling File System Access preference.
 * @returns The bound picker, or `null` when it is unavailable or not preferred.
 */
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
 * Opens a file destination while observing cancellation at each creation step.
 *
 * A writer returned after cancellation is aborted without delaying rejection.
 *
 * @param picker - Browser picker bound to its window.
 * @param name - Suggested filename shown in the picker.
 * @param signal - Cancellation signal for destination creation.
 * @returns The writable destination ready to receive file content.
 */
export async function createFileSystemWritable(
  picker: SaveFilePicker,
  name: string,
  signal?: AbortSignal,
): Promise<FileSystemWritable> {
  if (signal?.aborted) {
    throw createAbortError()
  }
  const handle = await waitWithSignal(picker({ suggestedName: name }), signal)
  if (signal?.aborted) {
    throw createAbortError()
  }

  const pendingWritable = handle.createWritable()
  try {
    const writable = await waitWithSignal(pendingWritable, signal)
    if (signal?.aborted) {
      throw createAbortError()
    }
    return writable
  } catch (error) {
    pendingWritable.then(writable => writable.abort?.(error)).catch(() => null)
    throw error
  }
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
  const writable = await createFileSystemWritable(
    showSaveFilePicker,
    name,
    options.signal,
  )
  try {
    if (options.signal?.aborted) {
      throw createAbortError()
    }
    await waitWithSignal(writable.write(blob), options.signal)
    if (options.signal?.aborted) {
      throw createAbortError()
    }
    // Closing commits the file and cannot reliably be interrupted by abort().
    await writable.close()
  } catch (error) {
    void writable.abort?.(error).catch(() => null)
    throw error
  }
  options.onPhaseChange?.('completed')
  options.onComplete?.()
  return true
}
