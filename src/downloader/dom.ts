import { isString } from '@ntnyq/utils'
import { DEFAULT_DOWNLOAD_OPTIONS } from '../constants'
import type { DownloadOptions } from '../types'
import { createAbortError } from './abort'

function clickElement(element: HTMLElement) {
  const event = new MouseEvent('click', {
    view: window,
    bubbles: true,
    cancelable: true,
  })

  element.dispatchEvent(event)
}

/**
 * Clicks an element after an abort-aware delay and always removes it afterward.
 *
 * @param element - Element receiving the synthetic click.
 * @param options - Download options containing delay and cancellation settings.
 * @returns A promise that rejects when the effective signal is aborted.
 */
export function clickAfterDelay(
  element: HTMLElement,
  options: DownloadOptions,
) {
  const signal = options.signal
  if (signal?.aborted) {
    element.remove()
    return Promise.reject(createAbortError())
  }

  let abortHandler: (() => void) | null = null
  const delay = new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(
      resolve,
      options.clickDelay ?? DEFAULT_DOWNLOAD_OPTIONS.clickDelay,
    )
    abortHandler = () => {
      clearTimeout(timeoutId)
      reject(createAbortError())
    }
    signal?.addEventListener('abort', abortHandler, { once: true })
  })

  return delay
    .then(() => {
      if (signal?.aborted) {
        throw createAbortError()
      }
      clickElement(element)
    })
    .finally(() => {
      if (abortHandler) {
        signal?.removeEventListener('abort', abortHandler)
      }
      element.remove()
    })
}

type RemoteUrlDownload = (
  url: string,
  name: string,
  options: DownloadOptions,
) => Promise<void>

function createDownloadAnchor(
  name: string,
  options: DownloadOptions,
): HTMLAnchorElement {
  const anchor = document.createElement('a')
  anchor.rel = 'noopener'

  if (options.openInNewTab) {
    anchor.target = '_blank'
  } else {
    anchor.download = name
  }

  return anchor
}

function scheduleAnchorClick(
  anchor: HTMLAnchorElement,
  options: DownloadOptions,
  onClick: () => void,
) {
  return clickAfterDelay(anchor, options).then(onClick)
}

/**
 * Saves a Blob or URL through an HTML anchor download workflow.
 *
 * @param source - Blob or URL to assign to the download anchor.
 * @param name - Filename exposed through the anchor download attribute.
 * @param options - Download lifecycle and browser behavior options.
 * @param downloadRemoteUrl - Remote URL workflow used for cross-origin sources.
 */
export function saveWithDownloadAttribute(
  source: string | Blob,
  name: string,
  options: DownloadOptions,
  downloadRemoteUrl: RemoteUrlDownload,
) {
  if (options.signal?.aborted) {
    throw createAbortError()
  }
  const anchor = createDownloadAnchor(name, options)

  if (isString(source)) {
    anchor.href = source
    if (anchor.protocol !== 'data:' && anchor.origin !== location.origin) {
      return downloadRemoteUrl(source, name, options).catch(() => {
        // The remote workflow already reported this lifecycle error.
      })
    }

    if (options.disableClick) {
      options.onPhaseChange?.('completed')
      options.onComplete?.()
      return
    }

    return scheduleAnchorClick(anchor, options, () => {
      options.onPhaseChange?.('completed')
      options.onComplete?.()
    })
  }

  options.onPhaseChange?.('saving')
  const objectUrl = URL.createObjectURL(source)
  anchor.href = objectUrl
  const scheduleRevoke = () => {
    setTimeout(
      () => URL.revokeObjectURL(objectUrl),
      options.revokeTimeout ?? DEFAULT_DOWNLOAD_OPTIONS.revokeTimeout,
    )
  }

  if (options.disableClick) {
    scheduleRevoke()
    if (options.signal?.aborted) {
      throw createAbortError()
    }
    options.onPhaseChange?.('completed')
    options.onComplete?.()
    return
  }

  return scheduleAnchorClick(anchor, options, () => {
    options.onPhaseChange?.('completed')
    options.onComplete?.()
  }).finally(scheduleRevoke)
}
