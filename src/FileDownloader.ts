import { isString } from '@ntnyq/utils'
import { BrowserDetector } from './BrowserDetector'
import type { DownloadOptions } from './types'

declare global {
  interface Navigator {
    msSaveOrOpenBlob?: (blob: Blob, fileName: string) => boolean
  }
}

export class FileDownloader {
  private detector: BrowserDetector

  // Constants
  private readonly DEFAULT_FILENAME = 'download'
  private readonly DEFAULT_IMAGE_TYPE = 'image/png'
  private readonly DEFAULT_IMAGE_QUALITY = 0.92
  private readonly DEFAULT_TEXT_MIME = 'text/plain;charset=utf-8'
  private readonly DEFAULT_JSON_MIME = 'application/json;charset=utf-8'

  private readonly defaultOptions: Required<
    Omit<DownloadOptions, 'onStart' | 'onComplete' | 'onError' | 'onProgress'>
  > = {
    autoBom: false,
    revokeTimeout: 40_000,
    clickDelay: 0,
    openInNewTab: false,
    disableClick: false,
  }

  constructor() {
    this.detector = new BrowserDetector()
  }

  /**
   * Add BOM (Byte Order Mark) to blob if needed
   */
  private addBom(blob: Blob, options: DownloadOptions): Blob {
    if (
      options.autoBom &&
      /^\s*(?:text\/\S*|application\/xml|[^\s/]*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(
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
  private async checkCors(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD', mode: 'cors' })
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
      const isCorsEnabled = await this.checkCors(url)
      if (isCorsEnabled && options.onProgress) {
        await this.downloadWithProgress(url, name, options)
        options.onComplete?.()
      } else {
        const a = document.createElement('a')
        a.href = url
        a.target = '_blank'
        if (!options.disableClick) {
          setTimeout(() => {
            this.click(a)
            a.remove()
            options.onComplete?.()
          }, options.clickDelay || this.defaultOptions.clickDelay)
        }
      }
    } catch (err) {
      options.onError?.(err as Error)
      throw err
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
      const xhr = new XMLHttpRequest()
      xhr.open('GET', url, true)
      xhr.responseType = 'blob'

      xhr.onprogress = event => {
        if (options.onProgress && event.lengthComputable) {
          options.onProgress(event.loaded, event.total)
        }
      }

      xhr.onload = () => {
        if (xhr.status === 200) {
          const blob = xhr.response
          this.saveBlob(blob, name, options)
          resolve()
        } else {
          reject(new Error(`Failed to download: ${xhr.statusText}`))
        }
      }

      xhr.onerror = () => {
        reject(new Error('Network error occurred during download'))
      }

      xhr.send()
    })
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
        this.handleRemoteUrl(blob, name, options).catch(err => {
          options.onError?.(err as Error)
        })
      }
    } else {
      // Blob
      const processedBlob = this.addBom(blob, options)

      a.href = URL.createObjectURL(processedBlob)

      setTimeout(() => {
        URL.revokeObjectURL(a.href)
      }, options.revokeTimeout || this.defaultOptions.revokeTimeout)

      if (options.disableClick) {
        options.onComplete?.()
      } else {
        setTimeout(() => {
          this.click(a)
          a.remove()
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
      this.handleRemoteUrl(blob, name, options).catch(err => {
        options.onError?.(err as Error)
      })
    } else {
      const processedBlob = this.addBom(blob, options)
      const success = navigator.msSaveOrOpenBlob?.(processedBlob, name)
      if (success) {
        options.onComplete?.()
      } else {
        const error = new Error('Failed to save file using msSaveOrOpenBlob')
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
      this.handleRemoteUrl(blob, name, options).catch(err => {
        options.onError?.(err as Error)
      })
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

    if (needFileReader) {
      const reader = new FileReader()

      reader.onloadend = () => {
        let url = reader.result as string
        url = this.detector.isChromeIOS
          ? url
          : url.replace(/^data:[^;]*;/, 'data:attachment/file;')
        if (popup) {
          popup.location.href = url
        } else {
          location.href = url
        }
        options.onComplete?.()
      }

      reader.onload = () => {
        const error = new Error('Failed to read file')
        options.onError?.(error)
      }

      reader.readAsDataURL(blob)
    } else {
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

      options.onComplete?.()
    }
  }

  /**
   * Core save blob function
   */
  private saveBlob(
    blob: string | Blob,
    name: string,
    options: DownloadOptions,
  ): void {
    const finalName =
      name ||
      (blob instanceof Blob && 'name' in blob && isString(blob.name)
        ? blob.name
        : '') ||
      this.DEFAULT_FILENAME

    try {
      options.onStart?.()

      if (this.detector.hasDownloadSupport) {
        this.saveWithDownloadAttribute(blob, finalName, options)
      } else if (this.detector.hasMsSaveBlob) {
        this.saveWithMsSave(blob, finalName, options)
      } else {
        this.saveWithFileReader(blob, finalName, options)
      }

      // Call onComplete after a short delay to ensure download starts
      setTimeout(() => options.onComplete?.(), 100)
    } catch (err) {
      options.onError?.(err as Error)
      throw err
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
    const fileName = name || this.DEFAULT_FILENAME
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
    const mimeType = options?.mimeType || this.DEFAULT_TEXT_MIME
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
    const blob = new Blob([text], { type: this.DEFAULT_JSON_MIME })

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
          throw error
        }
      },
      options?.type || this.DEFAULT_IMAGE_TYPE,
      options?.quality ?? this.DEFAULT_IMAGE_QUALITY,
    )
  }
}
