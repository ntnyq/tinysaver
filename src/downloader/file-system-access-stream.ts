import type { DownloadOptions } from '../types'
import { getSaveFilePicker } from './file-system-access'
import { consumeStream } from './stream'

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
