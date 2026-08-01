/**
 * Lifecycle phase reported while a download is in progress.
 *
 * Use {@link DownloadOptions.onPhaseChange} to observe phase changes.
 */
export type DownloadPhase =
  | 'probing'
  | 'downloading'
  | 'saving'
  | 'completed'
  | 'error'
  | 'aborted'

/**
 * Extended options for file downloading
 */
export interface DownloadOptions {
  /**
   * Whether to add UTF-8 BOM (Byte Order Mark) for text files
   *
   * @default false
   */
  autoBom?: boolean
  /**
   * Custom click delay (in milliseconds)
   *
   * @default 0
   */
  clickDelay?: number
  /**
   * Whether to disable click simulation(useful for testing)
   *
   * @default false
   */
  disableClick?: boolean
  /**
   * Whether to open file in new tab instead of downloading
   *
   * @default false
   */
  openInNewTab?: boolean
  /**
   * Custom timeout for revoking object URL (in milliseconds), default to 40 seconds
   *
   * @default 40_000
   */
  revokeTimeout?: number
  /**
   * Callback function when download completes
   */
  onComplete?: () => void
  /**
   * Callback function when download fails
   * @param error - Caught error
   */
  onError?: (error: Error) => void
  /**
   * Progress callback for download tracking
   * @param loaded - loaded bytes
   * @param total - total bytes, or `0` when the source size is unknown
   */
  onProgress?: (loaded: number, total: number) => void
  /**
   * Callback function when download starts
   */
  onStart?: () => void
  /**
   * Abort signal used for remote downloads and stream reads
   */
  signal?: AbortSignal
  /**
   * Additional fetch options used when probing remote URL CORS capability
   */
  fetchOptions?: Omit<RequestInit, 'method' | 'mode' | 'signal'>
  /**
   * Abort remote downloads and stream reads after this timeout (milliseconds).
   * `0` or `undefined` disables timeout.
   */
  timeout?: number
  /**
   * Prefer File System Access API for Blob and stream sources when available.
   * URL sources use the browser download transport because file pickers require
   * transient user activation before asynchronous network work.
   */
  preferFileSystemAccess?: boolean
  /**
   * Status callback for download lifecycle.
   */
  onPhaseChange?: (phase: DownloadPhase) => void
}

/**
 * Options accepted when saving text content.
 *
 * The UTF-8 BOM behavior is managed by the text-saving API.
 */
export type SaveTextOptions = Omit<DownloadOptions, 'autoBom'> & {
  mimeType?: string
}

/**
 * Options accepted when serializing and saving JSON data.
 *
 * The `space` option is forwarded to `JSON.stringify`.
 */
export type SaveJSONOptions = DownloadOptions & {
  space?: string | number
}

/**
 * Options accepted when converting and saving canvas content.
 *
 * The image `type` and `quality` values are forwarded to `canvas.toBlob`.
 */
export type SaveCanvasOptions = DownloadOptions & {
  quality?: number
  type?: string
}

/**
 * Options accepted when consuming and saving stream content.
 *
 * The MIME type defaults to the response header or binary data.
 */
export type SaveStreamOptions = DownloadOptions & {
  /**
   * Maximum bytes buffered when File System Access is unavailable.
   *
   * @default 268_435_456
   */
  maxBufferBytes?: number
  mimeType?: string
}

/**
 * Content sources supported by the stream-saving API.
 *
 * Responses contribute their body, content length, and content type metadata.
 */
export type DownloadStreamSource =
  | ReadableStream<Uint8Array>
  | Response
  | AsyncIterable<Uint8Array>
