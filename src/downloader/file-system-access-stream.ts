import type { SaveStreamOptions } from '../types'
import { createAbortError, waitWithSignal } from './abort'
import { addBom } from './blob'
import {
  createFileSystemWritable,
  getSaveFilePicker,
} from './file-system-access'
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
  options: SaveStreamOptions,
  expectedBytes: number,
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
    const bom = addBom(new Blob([], { type: options.mimeType ?? '' }), options)
    if (bom.size > 0) {
      await waitWithSignal(writable.write(bom), options.signal)
    }
    await consumeStream(stream, options, expectedBytes, chunk =>
      writable.write(new Uint8Array(chunk)),
    )
    await waitWithSignal(writable.close(), options.signal)
  } catch (error) {
    writable.abort?.(error).catch(() => null)
    throw error
  }

  options.onPhaseChange?.('completed')
  options.onComplete?.()
  return true
}
