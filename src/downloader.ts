/* oxlint-disable max-lines */
import { isString } from '@ntnyq/utils'
import {
  DEFAULT_DOWNLOAD_OPTIONS,
  DEFAULT_FILENAME,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_TYPE,
  DEFAULT_JSON_MIME,
  DEFAULT_TEXT_MIME,
} from './constants'
import { BrowserDetector } from './detector'
import type { DownloadOptions, DownloadPhase } from './types'

declare global {
  interface Navigator {
    msSaveOrOpenBlob?: (blob: Blob, fileName: string) => boolean
  }
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string
      types?: Array<{ description?: string; accept: Record<string, string[]> }>
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob | BufferSource | string) => Promise<void>
        close: () => Promise<void>
      }>
    }>
  }
}

export class FileDownloader {
  private detector: BrowserDetector

  private readonly defaultOptions = DEFAULT_DOWNLOAD_OPTIONS

  constructor() {
    this.detector = new BrowserDetector()
  }

  /**
   * Add BOM (Byte Order Mark) to blob if needed
   */
  private addBom(blob: Blob, options: DownloadOptions): Blob {
    if (
      options.autoBom &&
      /^\s*(?:text\/\S*|application\/xml|[^\s/]*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/iu.test(
        blob.type,
      )
    ) {
      return new Blob([String.fromCodePoint(0xfeff), blob], { type: blob.type })
    }
    return blob
  }

  /**
   * Check if CORS is enabled for the given URL
   */
  private async checkCors(
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
    } catch {
      return false
    }
  }

  /**
   * Handle remote URL download with CORS check
   */
  private async handleRemoteUrl(
    url: string,
    name: string,
    options: DownloadOptions,
  ): Promise<void> {
    try {
      this.emitPhase(options, 'probing')
      const isCorsEnabled = await this.checkCors(url, options)
      if (isCorsEnabled && options.onProgress) {
        this.emitPhase(options, 'downloading')
        await this.downloadWithProgress(url, name, options)
      } else {
        const a = document.createElement('a')
        a.href = url
        a.target = '_blank'
        a.rel = 'noopener'
        if (options.disableClick) {
          this.emitPhase(options, 'completed')
          options.onComplete?.()
        } else {
          setTimeout(() => {
            this.click(a)
            a.remove()
            this.emitPhase(options, 'completed')
            options.onComplete?.()
          }, options.clickDelay || this.defaultOptions.clickDelay)
        }
      }
    } catch (error) {
      const typedError = error as Error
      this.emitPhase(
        options,
        typedError.name === 'AbortError' ? 'aborted' : 'error',
      )
      options.onError?.(typedError)
      throw typedError
    }
  }

  /**
   * Simulate click event on element
   */
  private click(element: HTMLElement, target?: string): void {
    if (target) {
      element.setAttribute('target', target)
    }

    const event = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
    })

    element.dispatchEvent(event)
  }

  /**
   * Download using XMLHttpRequest with progress tracking
   */
  private async downloadWithProgress(
    url: string,
    name: string,
    options: DownloadOptions,
  ) {
    return new Promise<void>((resolve, reject) => {
      const { signal, cleanup } = this.withTimeoutSignal(options)
      if (signal?.aborted) {
        cleanup()
        reject(this.createAbortError())
        return
      }

      const xhr = new XMLHttpRequest()
      xhr.open('GET', url, true)
      xhr.responseType = 'blob'

      const abortHandler = () => {
        xhr.abort()
      }
      signal?.addEventListener('abort', abortHandler, { once: true })

      xhr.onprogress = event => {
        if (options.onProgress && event.lengthComputable) {
          options.onProgress(event.loaded, event.total)
        }
      }

      xhr.onload = () => {
        cleanup()
        if (xhr.status === 200) {
          const blob = xhr.response
          this.saveBlob(blob, name, options, false)
          resolve()
        } else {
          reject(new Error(`Failed to download: ${xhr.statusText}`))
        }
      }

      xhr.onerror = () => {
        cleanup()
        reject(new Error('Network error occurred during download'))
      }

      xhr.onabort = () => {
        cleanup()
        reject(this.createAbortError())
      }

      xhr.send()
    })
  }

  private emitPhase(options: DownloadOptions, phase: DownloadPhase): void {
    options.onPhaseChange?.(phase)
  }

  private withTimeoutSignal(options: DownloadOptions): {
    signal: AbortSignal | undefined
    cleanup: () => void
  } {
    const timeout = options.timeout ?? 0
    if (timeout <= 0) {
      return {
        signal: options.signal,
        cleanup: Function.prototype as () => void,
      }
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    const sourceSignal = options.signal
    const relayAbort = () => controller.abort()
    sourceSignal?.addEventListener('abort', relayAbort, { once: true })
    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeoutId)
        sourceSignal?.removeEventListener('abort', relayAbort)
      },
    }
  }

  private createAbortError(): Error {
    const error = new Error('The operation was aborted')
    error.name = 'AbortError'
    return error
  }

  /**
   * Save blob using modern download attribute
   */
  private saveWithDownloadAttribute(
    blob: string | Blob,
    name: string,
    options: DownloadOptions,
  ) {
    const URL = window.URL || window.webkitURL
    const a = document.createElement('a')

    a.download = name
    a.rel = 'noopener'

    if (options.openInNewTab) {
      a.target = '_blank'
    }

    if (isString(blob)) {
      // URL to file
      a.href = blob

      if (a.origin === location.origin) {
        if (options.disableClick) {
          options.onComplete?.()
        } else {
          setTimeout(() => {
            this.click(a)
            a.remove()
            options.onComplete?.()
          }, options.clickDelay || this.defaultOptions.clickDelay)
        }
      } else {
        void this.handleRemoteUrl(blob, name, options).catch(() => null)
      }
    } else {
      // Blob
      const processedBlob = this.addBom(blob, options)
      this.emitPhase(options, 'saving')

      a.href = URL.createObjectURL(processedBlob)

      setTimeout(() => {
        URL.revokeObjectURL(a.href)
      }, options.revokeTimeout || this.defaultOptions.revokeTimeout)

      if (options.disableClick) {
        this.emitPhase(options, 'completed')
        options.onComplete?.()
      } else {
        setTimeout(() => {
          this.click(a)
          a.remove()
          this.emitPhase(options, 'completed')
          options.onComplete?.()
        }, options.clickDelay || this.defaultOptions.clickDelay)
      }
    }
  }

  /**
   * Save using IE's msSaveOrOpenBlob
   */
  private saveWithMsSave(
    blob: string | Blob,
    name: string,
    options: DownloadOptions,
  ) {
    if (isString(blob)) {
      void this.handleRemoteUrl(blob, name, options).catch(() => null)
    } else {
      this.emitPhase(options, 'saving')
      const processedBlob = this.addBom(blob, options)
      const success = navigator.msSaveOrOpenBlob?.(processedBlob, name)
      if (success) {
        this.emitPhase(options, 'completed')
        options.onComplete?.()
      } else {
        const error = new Error('Failed to save file using msSaveOrOpenBlob')
        this.emitPhase(options, 'error')
        options.onError?.(error)
      }
    }
  }

  /**
   * Fallback save using FileReader
   */
  private saveWithFileReader(
    blob: string | Blob,
    name: string,
    options: DownloadOptions,
  ) {
    if (isString(blob)) {
      void this.handleRemoteUrl(blob, name, options).catch(() => null)
      return
    }

    const popup = options.openInNewTab ? window.open('', '_blank') : null

    if (popup) {
      popup.document.title = name
      popup.document.body.textContent = 'Downloading...'
    }

    const force = blob.type === 'application/octet-stream'
    const needFileReader =
      (this.detector.isChromeIOS ||
        (force && this.detector.isSafari) ||
        this.detector.isMacOSWebViews) &&
      typeof FileReader !== 'undefined'

    this.emitPhase(options, 'saving')
    if (needFileReader) {
      const reader = new FileReader()

      reader.onloadend = () => {
        const result = reader.result as string
        const url = this.detector.isChromeIOS
          ? result
          : result.replace(/^data:[^;]*;/u, 'data:attachment/file;')
        if (popup) {
          popup.location.href = url
        } else {
          location.href = url
        }
        this.emitPhase(options, 'completed')
        options.onComplete?.()
      }

      reader.onerror = () => {
        const error = new Error('Failed to read file')
        this.emitPhase(options, 'error')
        options.onError?.(error)
      }

      reader.readAsDataURL(blob)
    } else {
      this.emitPhase(options, 'saving')
      const URL = window.URL || window.webkitURL
      const url = URL.createObjectURL(blob)

      if (popup) {
        popup.location.href = url
      } else {
        location.href = url
      }

      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, options.revokeTimeout || this.defaultOptions.revokeTimeout)

      this.emitPhase(options, 'completed')
      options.onComplete?.()
    }
  }

  private async saveWithFileSystemAccess(
    blob: Blob,
    name: string,
    options: DownloadOptions,
  ): Promise<boolean> {
    if (
      !options.preferFileSystemAccess ||
      typeof window.showSaveFilePicker !== 'function'
    ) {
      return false
    }
    this.emitPhase(options, 'saving')
    const handle = await window.showSaveFilePicker({ suggestedName: name })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    this.emitPhase(options, 'completed')
    options.onComplete?.()
    return true
  }

  /**
   * Core save blob function
   */
  private saveBlob(
    blob: string | Blob,
    name: string,
    options: DownloadOptions,
    emitStart = true,
  ): void {
    const finalName =
      name ||
      (blob instanceof Blob && 'name' in blob && isString(blob.name)
        ? blob.name
        : '') ||
      DEFAULT_FILENAME

    try {
      if (emitStart) {
        options.onStart?.()
      }

      if (this.detector.hasDownloadSupport) {
        if (!isString(blob) && options.preferFileSystemAccess) {
          void this.saveWithFileSystemAccess(blob, finalName, options)
            .then(saved => {
              if (!saved) {
                this.saveWithDownloadAttribute(blob, finalName, options)
              }
            })
            .catch(error => {
              this.emitPhase(options, 'error')
              options.onError?.(error as Error)
            })
          return
        }
        this.saveWithDownloadAttribute(blob, finalName, options)
      } else if (this.detector.hasMsSaveBlob) {
        this.saveWithMsSave(blob, finalName, options)
      } else {
        this.saveWithFileReader(blob, finalName, options)
      }
    } catch (error) {
      this.emitPhase(options, 'error')
      options.onError?.(error as Error)
      throw error
    }
  }

  /**
   * Save a blob or URL to a file
   * @public
   */
  public save(
    blob: string | Blob,
    name?: string,
    options: DownloadOptions = {},
  ): void {
    const mergedOptions = { ...this.defaultOptions, ...options }
    const fileName = name || DEFAULT_FILENAME
    this.saveBlob(blob, fileName, mergedOptions)
  }

  /**
   * Create a download from text content
   */
  public saveText(
    text: string,
    filename: string,
    options?: Omit<DownloadOptions, 'autoBom'> & { mimeType?: string },
  ): void {
    const mimeType = options?.mimeType || DEFAULT_TEXT_MIME
    const blob = new Blob([text], { type: mimeType })

    this.save(blob, filename, { ...options, autoBom: true })
  }

  /**
   * Create a download from JSON data
   */
  public saveJSON(
    data: unknown,
    filename: string,
    options?: Omit<DownloadOptions, 'autoBom'> & { space?: string | number },
  ): void {
    const text = JSON.stringify(data, null, options?.space)
    const blob = new Blob([text], { type: DEFAULT_JSON_MIME })

    this.save(blob, filename, { ...options, autoBom: true })
  }

  /**
   * Create a download from an HTMLCanvasElement
   */
  public saveCanvas(
    canvas: HTMLCanvasElement,
    filename: string,
    options?: Omit<DownloadOptions, 'autoBom'> & {
      type?: string
      quality?: number
    },
  ): void {
    canvas.toBlob(
      blob => {
        if (blob) {
          this.save(blob, filename, options)
        } else {
          const error = new Error('Failed to convert canvas to blob')
          options?.onError?.(error)
        }
      },
      options?.type || DEFAULT_IMAGE_TYPE,
      options?.quality ?? DEFAULT_IMAGE_QUALITY,
    )
  }

  public saveAsync(
    blob: string | Blob,
    name?: string,
    options: DownloadOptions = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const wrappedOptions: DownloadOptions = {
        ...options,
        onStart: () => {
          options.onStart?.()
        },
        onComplete: () => {
          options.onComplete?.()
          if (!settled) {
            settled = true
            resolve()
          }
        },
        onError: error => {
          options.onError?.(error)
          if (!settled) {
            settled = true
            reject(error)
          }
        },
        onPhaseChange: phase => {
          options.onPhaseChange?.(phase)
        },
      }

      try {
        this.save(blob, name, wrappedOptions)
      } catch (error) {
        if (!settled) {
          settled = true
          reject(error as Error)
        }
      }
    })
  }

  // oxlint-disable-next-line complexity, max-statements
  public async saveStream(
    source: ReadableStream<Uint8Array> | Response | AsyncIterable<Uint8Array>,
    filename: string,
    options?: DownloadOptions & { mimeType?: string },
  ): Promise<void> {
    const mergedOptions = { ...this.defaultOptions, ...options }
    const stream = source instanceof Response ? source.body : source
    if (!stream) {
      const error = new Error('Response body is not readable')
      mergedOptions.onError?.(error)
      throw error
    }

    mergedOptions.onStart?.()
    this.emitPhase(mergedOptions, 'downloading')

    const chunks: BlobPart[] = []
    let totalBytes = 0
    if ('getReader' in stream && typeof stream.getReader === 'function') {
      const reader = stream.getReader()
      while (true) {
        if (mergedOptions.signal?.aborted) {
          const error = this.createAbortError()
          this.emitPhase(mergedOptions, 'aborted')
          mergedOptions.onError?.(error)
          throw error
        }
        // oxlint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        if (value) {
          chunks.push(new Uint8Array(value))
          totalBytes += value.byteLength
          mergedOptions.onProgress?.(totalBytes, totalBytes)
        }
      }
    } else {
      for await (const value of stream as AsyncIterable<Uint8Array>) {
        if (mergedOptions.signal?.aborted) {
          const error = this.createAbortError()
          this.emitPhase(mergedOptions, 'aborted')
          mergedOptions.onError?.(error)
          throw error
        }
        chunks.push(new Uint8Array(value))
        totalBytes += value.byteLength
        mergedOptions.onProgress?.(totalBytes, totalBytes)
      }
    }

    const mimeType =
      options?.mimeType ||
      (source instanceof Response
        ? source.headers.get('content-type')
        : null) ||
      'application/octet-stream'
    const blob = new Blob(chunks, { type: mimeType })
    await this.saveAsync(blob, filename, mergedOptions)
  }
}
