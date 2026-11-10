import { isString } from '@ntnyq/utils'
import {
  DEFAULT_DOWNLOAD_OPTIONS,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_TYPE,
  DEFAULT_JSON_MIME,
  DEFAULT_TEXT_MIME,
} from './constants'
import { toError } from './downloader/abort'
import { addBom, resolveFilename } from './downloader/blob'
import { saveWithDownloadAttribute } from './downloader/dom'
import { saveBlobWithFileSystemAccess } from './downloader/file-system-access'
import { reportDownloadError } from './downloader/lifecycle'
import {
  checkCors as checkRemoteCors,
  downloadRemoteUrl,
  downloadWithProgress as downloadRemoteWithProgress,
} from './downloader/remote'
import type {
  DownloadOptions,
  SaveCanvasOptions,
  SaveJSONOptions,
  SaveTextOptions,
} from './types'

/**
 * Coordinates browser download transports behind a reusable object-oriented API.
 *
 * Prefer the package-level convenience functions unless a dedicated instance is
 * useful for dependency injection, spying, or lifecycle isolation.
 */
export class FileDownloader {
  private readonly defaultOptions = DEFAULT_DOWNLOAD_OPTIONS

  private checkCors(url: string, options: DownloadOptions): Promise<boolean> {
    return checkRemoteCors(url, options)
  }

  private downloadWithProgress(
    url: string,
    name: string,
    options: DownloadOptions,
  ) {
    return downloadRemoteWithProgress(url, name, options, (blob, blobName) =>
      this.saveBlob(
        blob,
        blobName,
        { ...options, preferFileSystemAccess: false },
        false,
      ),
    )
  }

  private handleRemoteUrl(url: string, name: string, options: DownloadOptions) {
    return downloadRemoteUrl(url, name, options, {
      checkCors: (remoteUrl, remoteOptions) =>
        this.checkCors(remoteUrl, remoteOptions),
      downloadWithProgress: (remoteUrl, remoteName, remoteOptions) =>
        this.downloadWithProgress(remoteUrl, remoteName, remoteOptions),
    })
  }

  private saveBlob(
    blob: string | Blob,
    name: string,
    options: DownloadOptions,
    emitStart = true,
  ): Promise<void> | void {
    const finalName = resolveFilename(blob, name)

    if (emitStart) {
      options.onStart?.()
    }
    const normalizedBlob = isString(blob) ? blob : addBom(blob, options)

    if (!isString(normalizedBlob) && options.preferFileSystemAccess) {
      return saveBlobWithFileSystemAccess(
        normalizedBlob,
        finalName,
        options,
      ).then(saved => {
        if (saved) {
          return
        }
        return saveWithDownloadAttribute(
          normalizedBlob,
          finalName,
          options,
          (url, filename, remoteOptions) =>
            this.handleRemoteUrl(url, filename, remoteOptions),
        )
      })
    }

    return saveWithDownloadAttribute(
      normalizedBlob,
      finalName,
      options,
      (url, filename, remoteOptions) =>
        this.handleRemoteUrl(url, filename, remoteOptions),
    )
  }

  /**
   * Saves a Blob or URL through the best available browser download transport.
   *
   * @param blob - Blob object or URL string to save.
   * @param name - Suggested filename for the download.
   * @param options - Download lifecycle and browser behavior options.
   */
  public save(
    blob: string | Blob,
    name?: string,
    options: DownloadOptions = {},
  ): void {
    const mergedOptions = { ...this.defaultOptions, ...options }
    const reportError = (error: unknown) =>
      reportDownloadError(error, mergedOptions)
    try {
      this.saveBlob(blob, name ?? '', mergedOptions)?.catch(reportError)
    } catch (error) {
      throw reportError(error)
    }
  }

  /**
   * Saves text content as a UTF-8 file with automatic BOM handling.
   *
   * @param text - Text content to save.
   * @param filename - Suggested filename for the download.
   * @param options - Text MIME type and download behavior options.
   */
  public saveText(
    text: string,
    filename: string,
    options?: SaveTextOptions,
  ): void {
    const mimeType = options?.mimeType || DEFAULT_TEXT_MIME
    const blob = new Blob([text], { type: mimeType })
    this.save(blob, filename, { ...options, autoBom: true })
  }

  /**
   * Serializes and saves JSON-compatible data as a UTF-8 file.
   *
   * @param data - Value passed to `JSON.stringify`.
   * @param filename - Suggested filename for the download.
   * @param options - JSON formatting and download behavior options.
   */
  public saveJSON(
    data: unknown,
    filename: string,
    options?: SaveJSONOptions,
  ): void {
    let text: string
    try {
      const serializedData = JSON.stringify(data, null, options?.space)
      if (typeof serializedData !== 'string') {
        throw new TypeError('Failed to serialize data as JSON')
      }
      text = serializedData
    } catch (error) {
      throw reportDownloadError(error, options ?? {})
    }

    const blob = new Blob([text], { type: DEFAULT_JSON_MIME })
    this.save(blob, filename, { ...options, autoBom: true })
  }

  /**
   * Converts a canvas to an image Blob and saves it as a file.
   *
   * @param canvas - Canvas containing the image to save.
   * @param filename - Suggested filename for the download.
   * @param options - Image conversion and download behavior options.
   */
  public saveCanvas(
    canvas: HTMLCanvasElement,
    filename: string,
    options?: SaveCanvasOptions,
  ): void {
    let conversionFinished = false
    try {
      canvas.toBlob(
        blob => {
          conversionFinished = true
          if (blob) {
            try {
              this.save(blob, filename, options)
            } catch {
              // save already reported the failure; do not escape this async task.
            }
          } else {
            reportDownloadError(
              new Error('Failed to convert canvas to blob'),
              options ?? {},
            )
          }
        },
        options?.type || DEFAULT_IMAGE_TYPE,
        options?.quality ?? DEFAULT_IMAGE_QUALITY,
      )
    } catch (error) {
      if (!conversionFinished) {
        reportDownloadError(error, options ?? {})
      }
      throw error
    }
  }

  /**
   * Saves a Blob or URL and resolves after its download workflow completes.
   *
   * Browser downloads resolve after dispatching the anchor click, without
   * confirming that the file was written to disk. File System Access resolves
   * after all writes and the writer's `close()` fulfill.
   * See {@link DownloadOptions.onComplete} for completion semantics and exceptions.
   *
   * @param blob - Blob object or URL string to save.
   * @param name - Suggested filename for the download.
   * @param options - Download lifecycle and browser behavior options.
   * @returns A promise that rejects when saving fails or is aborted.
   */
  public saveAsync(
    blob: string | Blob,
    name?: string,
    options: DownloadOptions = {},
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const rejectOnce = (error: unknown) => {
        if (!settled) {
          settled = true
          reject(toError(error))
        }
      }
      const resolveOnce = () => {
        if (!settled) {
          settled = true
          resolve()
        }
      }
      const invokeCallback = (callback: () => void) => {
        try {
          callback()
        } catch (error) {
          rejectOnce(error)
        }
      }
      const wrappedOptions: DownloadOptions = {
        ...options,
        // Nonterminal callback errors must propagate to the active transport.
        onComplete: () => {
          invokeCallback(() => options.onComplete?.())
          resolveOnce()
        },
        onError: error => {
          rejectOnce(error)
          invokeCallback(() => options.onError?.(error))
        },
      }

      try {
        this.save(blob, name, wrappedOptions)
      } catch (error) {
        rejectOnce(error)
      }
    })
  }
}
