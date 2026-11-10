import type { DownloadOptions } from '../types'
import { toError } from './abort'

/**
 * Reports a workflow failure without replacing it with a notification error.
 *
 * Both error observers are attempted even when one of them throws.
 *
 * @param error - Original workflow or callback failure.
 * @param options - Lifecycle observers notified of the failure.
 * @returns The normalized original error.
 */
export function reportDownloadError(
  error: unknown,
  options: DownloadOptions,
): Error {
  const typedError = toError(error)
  try {
    options.onPhaseChange?.(
      typedError.name === 'AbortError' ? 'aborted' : 'error',
    )
  } catch {
    // Failure notifications are best-effort; preserve the original error.
  }
  try {
    options.onError?.(typedError)
  } catch {
    // An error observer must not hide the failure it is reporting.
  }
  return typedError
}
