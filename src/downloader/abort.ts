import type { DownloadOptions } from '../types'

interface TimeoutSignal {
  cleanup: () => void
  signal: AbortSignal | undefined
}

/**
 * Creates the normalized abort error used by every download transport.
 *
 * @returns An error whose name is `AbortError`.
 */
export function createAbortError(): Error {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

/**
 * Waits for one operation without retaining abort listeners after it settles.
 *
 * The underlying operation may finish later when cancellation wins the race.
 *
 * @typeParam Value - Value resolved by the underlying operation.
 * @param promise - Operation to observe without cancelling it directly.
 * @param signal - Signal that rejects the wait with an `AbortError`.
 * @returns A promise that preserves the operation's result or rejects on abort.
 */
export function waitWithSignal<Value>(
  promise: Promise<Value>,
  signal?: AbortSignal,
): Promise<Value> {
  if (!signal) {
    return promise
  }

  return new Promise<Value>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(createAbortError())
    }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
    if (signal.aborted) {
      abort()
    }
  })
}

/**
 * Normalizes an unknown thrown value into an `Error` instance.
 *
 * @param error - Value caught at a browser or stream boundary.
 * @returns The original error or an error containing its string representation.
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const normalizedError = new Error(String(error.message))
    if ('name' in error && typeof error.name === 'string') {
      normalizedError.name = error.name
    }
    return normalizedError
  }

  return new Error(String(error))
}

/**
 * Combines a caller-provided abort signal with an optional timeout.
 *
 * @param options - Options containing the source signal and timeout.
 * @returns The effective signal and a cleanup function for attached resources.
 */
export function withTimeoutSignal(
  options: Pick<DownloadOptions, 'signal' | 'timeout'>,
): TimeoutSignal {
  const timeout = options.timeout ?? 0
  if (timeout <= 0) {
    return {
      signal: options.signal,
      cleanup: () => null,
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  const sourceSignal = options.signal
  const relayAbort = () => controller.abort()

  if (sourceSignal?.aborted) {
    controller.abort()
  } else {
    sourceSignal?.addEventListener('abort', relayAbort, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId)
      sourceSignal?.removeEventListener('abort', relayAbort)
    },
  }
}
