import type { DownloadOptions } from '../types'
import { consumeStream } from './stream'

interface FileSystemWritable {
  abort?: (reason?: unknown) => Promise<void>
  close: () => Promise<void>
  write: (data: Blob | BufferSource | string) => Promise<void>
}

type SaveFilePicker = (options?: {
  suggestedName?: string
  types?: Array<{ description?: string; accept: Record<string, string[]> }>
}) => Promise<{
  createWritable: () => Promise<FileSystemWritable>
}>

type FileSystemAccessWindow = Omit<Window, 'showSaveFilePicker'> & {
  showSaveFilePicker?: SaveFilePicker
}

function getSaveFilePicker(options: DownloadOptions): SaveFilePicker | null {
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
  await writable.write(blob)
  await writable.close()
  options.onPhaseChange?.('completed')
  options.onComplete?.()
  return true
}

/**
 * Writes stream chunks directly through the File System Access API when preferred.
 *
 * @param stream - Byte stream to consume sequentially.
 * @param name - Suggested filename shown by the browser picker.
 * @param options - Download options controlling API preference and callbacks.
 * @param expectedBytes - Expected byte count used for progress reporting.
 * @returns Whether the File System Access workflow handled the stream.
 */
export async function saveStreamWithFileSystemAccess(
  stream: ReadableStream<Uint8Array>,
  name: string,
  options: DownloadOptions,
  expectedBytes: number,
): Promise<boolean> {
  const showSaveFilePicker = getSaveFilePicker(options)
  if (!showSaveFilePicker) {
    return false
  }

  options.onPhaseChange?.('saving')
  const handle = await showSaveFilePicker({ suggestedName: name })
  const writable = await handle.createWritable()
  try {
    await consumeStream(stream, options, expectedBytes, chunk =>
      writable.write(new Uint8Array(chunk)),
    )
    await writable.close()
  } catch (error) {
    await writable.abort?.(error).catch(() => null)
    throw error
  }

  options.onPhaseChange?.('completed')
  options.onComplete?.()
  return true
}
