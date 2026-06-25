import type {
  DownloadOptions,
  DownloadStreamSource,
  SaveStreamOptions,
} from '../types'
import { createAbortError } from './abort'

const DEFAULT_BINARY_MIME = 'application/octet-stream'

/**
 * Metadata resolved from a supported stream source.
 *
 * Response headers contribute expected length and MIME type when available.
 */
export interface ResolvedStreamSource {
  expectedBytes: number
  mimeType: string
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
}

function getExpectedBytes(response: Response): number {
  const expectedBytes = Number(response.headers.get('content-length'))
  return Number.isSafeInteger(expectedBytes) && expectedBytes > 0
    ? expectedBytes
    : 0
}

/**
 * Resolves readable content and metadata from any supported stream source.
 *
 * @param source - Stream, response, or asynchronous byte iterable.
 * @param options - Options that can override the detected MIME type.
 * @returns Resolved source metadata, or `null` for a response without a body.
 */
export function resolveStreamSource(
  source: DownloadStreamSource,
  options?: SaveStreamOptions,
): ResolvedStreamSource | null {
  if (!(source instanceof Response)) {
    return {
      source,
      expectedBytes: 0,
      mimeType: options?.mimeType || DEFAULT_BINARY_MIME,
    }
  }

  if (!source.body) {
    return null
  }

  return {
    source: source.body,
    expectedBytes: getExpectedBytes(source),
    mimeType:
      options?.mimeType ||
      source.headers.get('content-type') ||
      DEFAULT_BINARY_MIME,
  }
}

/**
 * Adapts an asynchronous byte iterable to a browser `ReadableStream`.
 *
 * @param source - Native readable stream or asynchronous byte iterable.
 * @returns A native readable stream for the source.
 */
export function toReadableStream(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  if ('getReader' in source && typeof source.getReader === 'function') {
    return source
  }

  const iterator = source[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async cancel() {
      await iterator.return?.()
    },
    async pull(controller) {
      try {
        const { done, value } = await iterator.next()
        if (done) {
          controller.close()
        } else {
          controller.enqueue(value)
        }
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

/**
 * Consumes a byte stream sequentially with cancellation and progress reporting.
 *
 * @param stream - Native byte stream to consume.
 * @param options - Signal and progress callback options.
 * @param expectedBytes - Expected total byte count, or zero when unknown.
 * @param write - Sequential destination invoked for every chunk.
 */
export async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  options: DownloadOptions,
  expectedBytes: number,
  write: (chunk: Uint8Array) => Promise<void> | void,
): Promise<void> {
  const reader = stream.getReader()
  const signal = options.signal
  if (signal?.aborted) {
    const error = createAbortError()
    await reader.cancel(error).catch(() => null)
    reader.releaseLock()
    throw error
  }

  let loadedBytes = 0
  let cancellation: Promise<unknown> | null = null
  let rejectAbort: ((error: Error) => void) | null = null
  const abortPromise = signal
    ? new Promise<never>((_resolve, reject) => {
        rejectAbort = reject
      })
    : null
  const abortStream = () => {
    const error = createAbortError()
    rejectAbort?.(error)
    cancellation = reader.cancel(error).catch(() => null)
  }
  const waitFor = <Value>(promise: Promise<Value>): Promise<Value> =>
    abortPromise ? Promise.race([promise, abortPromise]) : promise
  const consumeNext = async (): Promise<void> => {
    const { done, value } = await waitFor(reader.read())
    if (done) {
      return
    }

    await waitFor(Promise.resolve(write(value)))
    loadedBytes += value.byteLength
    options.onProgress?.(loadedBytes, expectedBytes)
    return consumeNext()
  }

  signal?.addEventListener('abort', abortStream, { once: true })

  try {
    if (signal?.aborted) {
      abortStream()
    }
    await consumeNext()
  } catch (error) {
    if (!signal?.aborted) {
      await reader.cancel(error).catch(() => null)
    }
    throw signal?.aborted ? createAbortError() : error
  } finally {
    signal?.removeEventListener('abort', abortStream)
    await cancellation
    reader.releaseLock()
  }
}
