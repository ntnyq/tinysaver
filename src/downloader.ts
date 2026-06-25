import { isString } from '@ntnyq/utils'
import {
  DEFAULT_DOWNLOAD_OPTIONS,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_TYPE,
  DEFAULT_JSON_MIME,
  DEFAULT_TEXT_MIME,
} from './constants'
import {
  createAbortError,
  toError,
  withTimeoutSignal,
} from './downloader/abort'
import { addBom, resolveFilename } from './downloader/blob'
import { saveWithDownloadAttribute } from './downloader/dom'
import {
  saveBlobWithFileSystemAccess,
  saveStreamWithFileSystemAccess,
} from './downloader/file-system-access'
import {
  checkCors as checkRemoteCors,
  downloadRemoteUrl,
  downloadWithProgress as downloadRemoteWithProgress,
} from './downloader/remote'
import {
  consumeStream,
  resolveStreamSource,
  toReadableStream,
} from './downloader/stream'
import type {
  DownloadOptions,
  DownloadStreamSource,
  SaveCanvasOptions,
  SaveJSONOptions,
  SaveStreamOptions,
  SaveTextOptions,
} from './types'

function withoutStreamCallbacks(options: DownloadOptions): DownloadOptions {
  const saveOptions = { ...options }
  delete saveOptions.onProgress
  delete saveOptions.onStart
  return saveOptions
}

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
  ): Promise<void> {
    return downloadRemoteWithProgress(url, name, options, (blob, blobName) =>
      this.saveBlob(blob, blobName, options, false),
    )
  }

  private handleRemoteUrl(
    url: string,
    name: string,
    options: DownloadOptions,
  ): Promise<void> {
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
  ): void {
    const finalName = resolveFilename(blob, name)

    try {
      if (emitStart) {
        options.onStart?.()
      }
      const normalizedBlob = isString(blob) ? blob : addBom(blob, options)

      if (!isString(normalizedBlob) && options.preferFileSystemAccess) {
        void saveBlobWithFileSystemAccess(normalizedBlob, finalName, options)
          .then(saved => {
            if (!saved) {
              saveWithDownloadAttribute(
                normalizedBlob,
                finalName,
                options,
                (url, filename, remoteOptions) =>
                  this.handleRemoteUrl(url, filename, remoteOptions),
              )
            }
          })
          .catch(error => {
            options.onPhaseChange?.('error')
            options.onError?.(toError(error))
          })
        return
      }

      saveWithDownloadAttribute(
        normalizedBlob,
        finalName,
        options,
        (url, filename, remoteOptions) =>
          this.handleRemoteUrl(url, filename, remoteOptions),
      )
    } catch (error) {
      const typedError = toError(error)
      options.onPhaseChange?.('error')
      options.onError?.(typedError)
      throw typedError
    }
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
    this.saveBlob(blob, name ?? '', mergedOptions)
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
    const text = JSON.stringify(data, null, options?.space)
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
    canvas.toBlob(
      blob => {
        if (blob) {
          this.save(blob, filename, options)
        } else {
          options?.onError?.(new Error('Failed to convert canvas to blob'))
        }
      },
      options?.type || DEFAULT_IMAGE_TYPE,
      options?.quality ?? DEFAULT_IMAGE_QUALITY,
    )
  }

  /**
   * Saves a Blob or URL and resolves after its download workflow completes.
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
    return new Promise((resolve, reject) => {
      let settled = false
      const wrappedOptions: DownloadOptions = {
        ...options,
        onStart: () => options.onStart?.(),
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
        onPhaseChange: phase => options.onPhaseChange?.(phase),
      }

      try {
        this.save(blob, name, wrappedOptions)
      } catch (error) {
        if (!settled) {
          settled = true
          reject(toError(error))
        }
      }
    })
  }

  /**
   * Consumes a readable source and saves its bytes as a file.
   *
   * @param source - Stream, response, or asynchronous byte iterable to consume.
   * @param filename - Suggested filename for the download.
   * @param options - Stream MIME type and download behavior options.
   * @returns A promise that resolves after all bytes have been saved.
   */
  public async saveStream(
    source: DownloadStreamSource,
    filename: string,
    options?: SaveStreamOptions,
  ): Promise<void> {
    const mergedOptions: DownloadOptions = {
      ...this.defaultOptions,
      ...options,
    }
    const resolvedSource = resolveStreamSource(source, options)
    if (!resolvedSource) {
      const error = new Error('Response body is not readable')
      mergedOptions.onError?.(error)
      throw error
    }

    mergedOptions.onStart?.()
    mergedOptions.onPhaseChange?.('downloading')
    const { signal, cleanup } = withTimeoutSignal(mergedOptions)
    const streamOptions: DownloadOptions = {
      ...mergedOptions,
      timeout: 0,
      ...(signal ? { signal } : {}),
    }
    let delegatedSave = false

    try {
      if (signal?.aborted) {
        throw createAbortError()
      }

      const readableStream = toReadableStream(resolvedSource.source)
      const saved = await saveStreamWithFileSystemAccess(
        readableStream,
        filename,
        streamOptions,
        resolvedSource.expectedBytes,
      )
      if (saved) {
        return
      }

      const chunks: BlobPart[] = []
      await consumeStream(
        readableStream,
        streamOptions,
        resolvedSource.expectedBytes,
        chunk => {
          chunks.push(new Uint8Array(chunk))
        },
      )
      delegatedSave = true
      await this.saveAsync(
        new Blob(chunks, { type: resolvedSource.mimeType }),
        filename,
        withoutStreamCallbacks(streamOptions),
      )
    } catch (error) {
      const typedError = toError(error)
      if (!delegatedSave) {
        streamOptions.onPhaseChange?.(
          typedError.name === 'AbortError' || signal?.aborted
            ? 'aborted'
            : 'error',
        )
        streamOptions.onError?.(typedError)
      }
      throw typedError
    } finally {
      cleanup()
    }
  }
}
