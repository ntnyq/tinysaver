import {
  DEFAULT_DOWNLOAD_OPTIONS,
  DEFAULT_STREAM_MAX_BUFFER_BYTES,
} from './constants'
import { FileDownloader } from './downloader'
import {
  createAbortError,
  toError,
  withTimeoutSignal,
} from './downloader/abort'
import { saveStreamWithFileSystemAccess } from './downloader/file-system-access-stream'
import {
  consumeStream,
  resolveStreamSource,
  toReadableStream,
  type ResolvedStreamSource,
} from './downloader/stream'
import type {
  DownloadOptions,
  DownloadStreamSource,
  SaveStreamOptions,
} from './types'

export type { DownloadStreamSource, SaveStreamOptions } from './types'

function withoutStreamCallbacks(options: DownloadOptions): DownloadOptions {
  const saveOptions = { ...options }
  delete saveOptions.onProgress
  delete saveOptions.onStart
  return saveOptions
}

function createBufferLimitError(maxBufferBytes: number): RangeError {
  return new RangeError(
    `Stream exceeds maximum buffered size of ${maxBufferBytes} bytes`,
  )
}

function resolveMaxBufferBytes(options?: SaveStreamOptions): number {
  const maxBufferBytes =
    options?.maxBufferBytes ?? DEFAULT_STREAM_MAX_BUFFER_BYTES
  if (!Number.isSafeInteger(maxBufferBytes) || maxBufferBytes <= 0) {
    throw new TypeError('maxBufferBytes must be a positive safe integer')
  }
  return maxBufferBytes
}

async function createBufferedBlob(
  readableStream: ReadableStream<Uint8Array>,
  resolvedSource: ResolvedStreamSource,
  downloadOptions: DownloadOptions,
  saveOptions?: SaveStreamOptions,
): Promise<Blob> {
  const maxBufferBytes = resolveMaxBufferBytes(saveOptions)
  if (resolvedSource.expectedBytes > maxBufferBytes) {
    const error = createBufferLimitError(maxBufferBytes)
    readableStream.cancel(error).catch(() => null)
    throw error
  }

  const chunks: BlobPart[] = []
  let bufferedBytes = 0
  await consumeStream(
    readableStream,
    downloadOptions,
    resolvedSource.expectedBytes,
    chunk => {
      if (bufferedBytes + chunk.byteLength > maxBufferBytes) {
        throw createBufferLimitError(maxBufferBytes)
      }
      bufferedBytes += chunk.byteLength
      chunks.push(new Uint8Array(chunk))
    },
  )
  return new Blob(chunks, { type: resolvedSource.mimeType })
}

/**
 * Extends the default downloader with stream and response support.
 */
export class StreamDownloader extends FileDownloader {
  /**
   * Consumes a readable source and saves its bytes as a file.
   *
   * Resolves after the File System Access writer closes, or after dispatching
   * the buffered Blob's download click. Browser downloads do not confirm that
   * the file was written to disk.
   * See {@link DownloadOptions.onComplete} for completion semantics and exceptions.
   *
   * @param source - Stream, response, or asynchronous byte iterable to consume.
   * @param filename - Suggested filename for the download.
   * @param options - Stream MIME type and download behavior options.
   * @returns A promise that resolves when the save workflow completes.
   */
  public async saveStream(
    source: DownloadStreamSource,
    filename: string,
    options?: SaveStreamOptions,
  ) {
    const mergedOptions: DownloadOptions = {
      ...DEFAULT_DOWNLOAD_OPTIONS,
      ...options,
    }
    const resolvedSource = resolveStreamSource(source, options)
    if (!resolvedSource) {
      const error = new Error('Response body is not readable')
      mergedOptions.onError?.(error)
      throw error
    }

    mergedOptions.onStart?.()
    mergedOptions.onPhaseChange?.('downloading')
    const { signal, cleanup } = withTimeoutSignal(mergedOptions)
    const streamOptions: SaveStreamOptions = {
      ...mergedOptions,
      mimeType: resolvedSource.mimeType,
      timeout: 0,
      ...(signal ? { signal } : {}),
    }
    let delegatedSave = false
    let readableStream: ReadableStream<Uint8Array> | undefined

    try {
      readableStream = toReadableStream(resolvedSource.source)
      if (signal?.aborted) {
        throw createAbortError()
      }

      const saved = await saveStreamWithFileSystemAccess(
        readableStream,
        filename,
        streamOptions,
        resolvedSource.expectedBytes,
      )
      if (saved) {
        return
      }

      const blob = await createBufferedBlob(
        readableStream,
        resolvedSource,
        streamOptions,
        options,
      )
      delegatedSave = true
      await this.saveAsync(
        blob,
        filename,
        withoutStreamCallbacks(streamOptions),
      )
    } catch (error) {
      const typedError = toError(error)
      if (readableStream && !readableStream.locked) {
        readableStream.cancel(typedError).catch(() => null)
      }
      if (!delegatedSave) {
        streamOptions.onPhaseChange?.(
          typedError.name === 'AbortError' || signal?.aborted
            ? 'aborted'
            : 'error',
        )
        streamOptions.onError?.(typedError)
      }
      throw typedError
    } finally {
      cleanup()
    }
  }
}

const streamDownloader = new StreamDownloader()

/**
 * Consumes a readable source and saves its bytes as a file.
 *
 * Resolves after the File System Access writer closes, or after dispatching
 * the buffered Blob's download click. Browser downloads do not confirm that
 * the file was written to disk.
 * See {@link DownloadOptions.onComplete} for completion semantics and exceptions.
 *
 * @param source - Stream, response, or asynchronous byte iterable to consume.
 * @param filename - Suggested filename for the download.
 * @param options - Stream MIME type and download behavior options.
 * @returns A promise that resolves when the save workflow completes.
 */
export function saveStream(
  source: DownloadStreamSource,
  filename: string,
  options?: SaveStreamOptions,
) {
  return streamDownloader.saveStream(source, filename, options)
}
