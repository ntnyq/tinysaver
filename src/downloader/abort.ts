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
 * Normalizes an unknown thrown value into an `Error` instance.
 *
 * @param error - Value caught at a browser or stream boundary.
 * @returns The original error or an error containing its string representation.
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
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
