import type { DownloadOptions } from '../types'
import { createAbortError, toError, withTimeoutSignal } from './abort'
import { clickAfterDelay } from './dom'

type SaveRemoteBlob = (
  blob: Blob,
  name: string,
  options: DownloadOptions,
) => void

/**
 * Dependencies used to probe and transfer a remote URL.
 *
 * Keeping these operations injectable lets the downloader coordinate callbacks.
 */
export interface RemoteDownloadDependencies {
  checkCors: (url: string, options: DownloadOptions) => Promise<boolean>
  downloadWithProgress: (
    url: string,
    name: string,
    options: DownloadOptions,
  ) => Promise<void>
}

/**
 * Checks whether a remote URL permits a CORS response.
 *
 * @param url - Remote URL to probe with a HEAD request.
 * @param options - Fetch, signal, and timeout-related download options.
 * @returns Whether the response is successful and explicitly CORS-enabled.
 */
export async function checkCors(
  url: string,
  options: DownloadOptions,
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      ...options.fetchOptions,
      method: 'HEAD',
      mode: 'cors',
      signal: options.signal ?? null,
    })
    return response.ok && response.type === 'cors'
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw createAbortError()
    }
    return false
  }
}

/**
 * Downloads a remote URL through XMLHttpRequest with progress reporting.
 *
 * @param url - Remote URL to transfer.
 * @param name - Filename used when saving the received Blob.
 * @param options - Download progress, signal, and timeout options.
 * @param saveBlob - Callback that delegates the received Blob to the saver.
 * @returns A promise that settles after the transfer has been delegated.
 */
export function downloadWithProgress(
  url: string,
  name: string,
  options: DownloadOptions,
  saveBlob: SaveRemoteBlob,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { signal, cleanup } = withTimeoutSignal(options)
    if (signal?.aborted) {
      cleanup()
      reject(createAbortError())
      return
    }

    const request = new XMLHttpRequest()
    request.open('GET', url, true)
    request.responseType = 'blob'

    const abortRequest = () => request.abort()
    const cleanupRequest = () => {
      cleanup()
      signal?.removeEventListener('abort', abortRequest)
    }
    signal?.addEventListener('abort', abortRequest, { once: true })

    request.onprogress = event => {
      if (event.lengthComputable) {
        options.onProgress?.(event.loaded, event.total)
      }
    }

    request.onload = () => {
      cleanupRequest()
      if (request.status !== 200) {
        reject(new Error(`Failed to download: ${request.statusText}`))
        return
      }

      if (!(request.response instanceof Blob)) {
        reject(new Error('Remote download did not return Blob content'))
        return
      }

      try {
        saveBlob(request.response, name, options)
        resolve()
      } catch (error) {
        reject(toError(error))
      }
    }

    request.onerror = () => {
      cleanupRequest()
      reject(new Error('Network error occurred during download'))
    }
    request.onabort = () => {
      cleanupRequest()
      reject(createAbortError())
    }
    request.send()
  })
}

/**
 * Coordinates remote URL probing, progressive transfer, and browser fallback.
 *
 * @param url - Remote URL being saved.
 * @param name - Suggested filename for the download.
 * @param options - Download lifecycle and request options.
 * @param dependencies - Injectable remote transport operations.
 */
export async function downloadRemoteUrl(
  url: string,
  name: string,
  options: DownloadOptions,
  dependencies: RemoteDownloadDependencies,
): Promise<void> {
  const { signal, cleanup } = withTimeoutSignal(options)
  const requestOptions: DownloadOptions = {
    ...options,
    timeout: 0,
    ...(signal ? { signal } : {}),
  }

  try {
    if (signal?.aborted) {
      throw createAbortError()
    }

    requestOptions.onPhaseChange?.('probing')
    const isCorsEnabled = await dependencies.checkCors(url, requestOptions)
    if (isCorsEnabled) {
      requestOptions.onPhaseChange?.('downloading')
      await dependencies.downloadWithProgress(url, name, requestOptions)
    } else {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.target = '_blank'
      anchor.rel = 'noopener'
      if (!requestOptions.disableClick) {
        await clickAfterDelay(anchor, requestOptions)
      }
      requestOptions.onPhaseChange?.('completed')
      requestOptions.onComplete?.()
    }
  } catch (error) {
    const typedError = toError(error)
    requestOptions.onPhaseChange?.(
      typedError.name === 'AbortError' ? 'aborted' : 'error',
    )
    requestOptions.onError?.(typedError)
    throw typedError
  } finally {
    cleanup()
  }
}
