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
import { reportDownloadError } from './downloader/lifecycle'
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

const STREAM_BUFFER_BLOCK_BYTES = 64 * 1024

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
  const buffer: { block: Uint8Array<ArrayBuffer> | null; offset: number } = {
    block: null,
    offset: 0,
  }
  await consumeStream(
    readableStream,
    downloadOptions,
    resolvedSource.expectedBytes,
    chunk => {
      if (bufferedBytes + chunk.byteLength > maxBufferBytes) {
        throw createBufferLimitError(maxBufferBytes)
      }
      // Coalesce small chunks so retained objects are bounded by byte capacity.
      let chunkOffset = 0
      while (chunkOffset < chunk.byteLength) {
        buffer.block ??= new Uint8Array(
          Math.min(STREAM_BUFFER_BLOCK_BYTES, maxBufferBytes - bufferedBytes),
        )
        const block = buffer.block
        const copyBytes = Math.min(
          block.byteLength - buffer.offset,
          chunk.byteLength - chunkOffset,
        )
        block.set(
          chunk.subarray(chunkOffset, chunkOffset + copyBytes),
          buffer.offset,
        )
        bufferedBytes += copyBytes
        chunkOffset += copyBytes
        buffer.offset += copyBytes
        if (buffer.offset === block.byteLength) {
          chunks.push(block)
          buffer.block = null
          buffer.offset = 0
        }
      }
    },
  )
  if (buffer.block) {
    chunks.push(buffer.block.subarray(0, buffer.offset))
  }
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
  ): Promise<void> {
    const mergedOptions: DownloadOptions = {
      ...DEFAULT_DOWNLOAD_OPTIONS,
      ...options,
    }
    const { signal, cleanup } = withTimeoutSignal(mergedOptions)
    const streamOptions: SaveStreamOptions = {
      ...mergedOptions,
      timeout: 0,
      ...(signal ? { signal } : {}),
    }
    let delegatedSave = false
    let readableStream: ReadableStream<Uint8Array> | undefined

    try {
      const resolvedSource = resolveStreamSource(source, options)
      if (!resolvedSource) {
        throw new Error('Response body is not readable')
      }
      streamOptions.mimeType = resolvedSource.mimeType
      readableStream = toReadableStream(resolvedSource.source)
      streamOptions.onStart?.()
      streamOptions.onPhaseChange?.('downloading')
      if (signal?.aborted) {
        throw createAbortError()
      }

      const saved = await saveStreamWithFileSystemAccess(
        readableStream,
        filename,
        streamOptions,
        resolvedSource.expectedBytes,
      )
      if (!saved) {
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
        return
      }

      streamOptions.onPhaseChange?.('completed')
    } catch (error) {
      const typedError = toError(error)
      if (readableStream && !readableStream.locked) {
        readableStream.cancel(typedError).catch(() => null)
      }
      if (!delegatedSave) {
        reportDownloadError(typedError, streamOptions)
      }
      throw typedError
    } finally {
      cleanup()
    }

    // Completion observer failures reject without reporting a failed save.
    streamOptions.onComplete?.()
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
): Promise<void> {
  return streamDownloader.saveStream(source, filename, options)
}
