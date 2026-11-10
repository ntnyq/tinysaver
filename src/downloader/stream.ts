import type {
  DownloadOptions,
  DownloadStreamSource,
  SaveStreamOptions,
} from '../types'
import { createAbortError, waitWithSignal } from './abort'

const DEFAULT_BINARY_MIME = 'application/octet-stream'
const STREAM_TASK_BUDGET_MS = 8

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
  const contentEncoding = response.headers.get('content-encoding')
  // Fetch decodes the body but preserves the encoded Content-Length. CORS can
  // hide Content-Encoding, so its absence does not establish an identity body.
  if (
    (contentEncoding !== null &&
      contentEncoding.trim().toLowerCase() !== 'identity') ||
    (contentEncoding === null && response.type === 'cors')
  ) {
    return 0
  }
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
  // Response constructors differ across windows, including same-origin frames.
  if (!('body' in source && 'headers' in source)) {
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
  let cancelled = false
  return new ReadableStream<Uint8Array>({
    async cancel() {
      cancelled = true
      await iterator.return?.()
    },
    async pull(controller) {
      try {
        const { done, value } = await iterator.next()
        if (cancelled) {
          return
        }
        if (done) {
          controller.close()
        } else {
          // Iterators may reuse their buffer as soon as the next pull starts.
          controller.enqueue(new Uint8Array(value))
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
 * @returns A promise that resolves after every chunk is written, or rejects on
 * source, destination, callback, or cancellation errors.
 */
export async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  options: DownloadOptions,
  expectedBytes: number,
  write: (chunk: Uint8Array) => Promise<void> | void,
) {
  const reader = stream.getReader()
  const signal = options.signal
  let loadedBytes = 0
  let taskStartedAt = performance.now()

  const abortStream = () => {
    // A source's cancel hook can remain pending indefinitely.
    reader.cancel(createAbortError()).catch(() => null)
  }

  signal?.addEventListener('abort', abortStream, { once: true })

  try {
    if (signal?.aborted) {
      abortStream()
      throw createAbortError()
    }
    while (true) {
      // Sequential reads and writes preserve backpressure and bounded memory.
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await waitWithSignal(reader.read(), signal)
      if (signal?.aborted) {
        throw createAbortError()
      }
      if (done) {
        return
      }

      // oxlint-disable-next-line no-await-in-loop
      await waitWithSignal(Promise.resolve(write(value)), signal)
      if (signal?.aborted) {
        throw createAbortError()
      }
      loadedBytes += value.byteLength
      options.onProgress?.(loadedBytes, expectedBytes)
      if (performance.now() - taskStartedAt >= STREAM_TASK_BUDGET_MS) {
        // Ready reads and writes only yield microtasks. Periodically allow
        // timers, user cancellation, and rendering to run as browser tasks.
        // oxlint-disable-next-line no-await-in-loop
        await waitWithSignal(
          new Promise<void>(resolve => {
            setTimeout(resolve, 0)
          }),
          signal,
        )
        taskStartedAt = performance.now()
      }
    }
  } catch (error) {
    if (!signal?.aborted) {
      reader.cancel(error).catch(() => null)
    }
    throw signal?.aborted ? createAbortError() : error
  } finally {
    signal?.removeEventListener('abort', abortStream)
    reader.releaseLock()
  }
}
