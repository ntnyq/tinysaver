/**
 * Lifecycle phase reported while a download is in progress.
 *
 * Use {@link DownloadOptions.onPhaseChange} to observe phase changes.
 * The `completed` phase follows {@link DownloadOptions.onComplete} semantics.
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
   * Whether to open an anchor source in a new tab instead of downloading.
   * Does not change File System Access writes.
   *
   * @default false
   */
  openInNewTab?: boolean
  /**
   * Delay before revoking an object URL after the anchor workflow settles
   * (in milliseconds), default to 40 seconds. `0` schedules immediate cleanup.
   *
   * @default 40_000
   */
  revokeTimeout?: number
  /**
   * Called when the library's save workflow completes.
   *
   * For browser downloads, the anchor click has been dispatched; this does not
   * confirm browser acceptance, download completion, or a file written to disk.
   * For File System Access, all writes and the writer's `close()` have fulfilled;
   * this does not guarantee a physical disk flush.
   * Navigation paths only dispatch a click, and `disableClick` skips the click
   * in anchor workflows. Later browser download failures cannot be observed.
   * For promise-based saves, an exception from this callback rejects the promise
   * without changing the completed phase or notifying `onError`.
   * Callback-based saves report such exceptions through the error lifecycle.
   * Observer errors cannot undo a save that has already completed.
   */
  onComplete?: () => void
  /**
   * Called when the workflow or a lifecycle observer fails.
   * Exceptions from error observers are ignored to preserve the original error.
   * Promise-based saves do not call this for `onComplete` exceptions.
   * @param error - Caught error
   */
  onError?: (error: Error) => void
  /**
   * Progress callback for cross-origin URL transfers and stream consumption.
   * Direct Blob, text, JSON, and canvas saves do not emit byte progress.
   * Stream totals are unknown for encoded responses and CORS responses whose
   * `Content-Encoding` is not exposed, because reads count decoded bytes.
   * Exceptions stop the active workflow and are reported through `onError`.
   *
   * @param loaded - loaded bytes
   * @param total - total bytes, or `0` when the source size is unknown
   */
  onProgress?: (loaded: number, total: number) => void
  /**
   * Called when the save workflow starts.
   * Exceptions stop the active workflow and are reported through `onError`.
   */
  onStart?: () => void
  /**
   * Abort signal used for file target creation, writes, stream reads, and
   * remote downloads. Anchor clicks can be cancelled before dispatch.
   * Once a File System Access writer starts `close()`, cancellation no longer
   * interrupts saving; the workflow waits for the actual commit result.
   */
  signal?: AbortSignal
  /**
   * Fetch options used when probing remote URL CORS capability.
   * Headers and `credentials: 'include'` also apply to the cross-origin GET
   * download. Other fetch options only affect the probe; anchor navigation
   * fallbacks cannot apply custom headers.
   */
  fetchOptions?: Omit<RequestInit, 'method' | 'mode' | 'signal'>
  /**
   * Abort remote URL and stream workflows after this timeout (milliseconds),
   * including stream target creation, writes, and delayed anchor clicks.
   * `0` or `undefined` disables timeout.
   * Does not apply to direct Blob, text, JSON, or canvas saves; use `signal`.
   * A File System Access commit already in progress is allowed to settle.
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
   * The `completed` phase follows {@link DownloadOptions.onComplete} semantics.
   * Exceptions stop the active workflow and are reported through `onError`.
   * An exception during `completed` cannot undo the completed save.
   * @param phase - Current phase of the download workflow.
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
