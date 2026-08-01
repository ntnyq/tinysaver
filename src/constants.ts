import type { DownloadOptions } from './types'

/**
 * Default filename used when neither a requested name nor a `File` name exists.
 */
export const DEFAULT_FILENAME = 'download'

/**
 * Default MIME type used when converting canvas content to an image.
 */
export const DEFAULT_IMAGE_TYPE = 'image/png'

/**
 * Default image quality passed to `HTMLCanvasElement.toBlob`.
 */
export const DEFAULT_IMAGE_QUALITY = 0.92

/**
 * Default UTF-8 MIME type used for plain-text downloads.
 */
export const DEFAULT_TEXT_MIME = 'text/plain;charset=utf-8'

/**
 * Default UTF-8 MIME type used for JSON downloads.
 */
export const DEFAULT_JSON_MIME = 'application/json;charset=utf-8'

/**
 * Default maximum bytes buffered before saving a stream through a Blob.
 */
export const DEFAULT_STREAM_MAX_BUFFER_BYTES = 256 * 1024 * 1024

export type DefaultDownloadOptions = Required<
  Omit<
    DownloadOptions,
    | 'onStart'
    | 'onComplete'
    | 'onError'
    | 'onProgress'
    | 'signal'
    | 'fetchOptions'
    | 'timeout'
    | 'onPhaseChange'
  >
>

/**
 * Default behavior shared by every {@link FileDownloader} operation.
 *
 * User-provided options are merged over these values for each download.
 */
export const DEFAULT_DOWNLOAD_OPTIONS: DefaultDownloadOptions = {
  autoBom: false,
  revokeTimeout: 40_000,
  clickDelay: 0,
  openInNewTab: false,
  disableClick: false,
  preferFileSystemAccess: false,
}
