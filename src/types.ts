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
   * @param total - total bytes
   */
  onProgress?: (loaded: number, total: number) => void
  /**
   * Callback function when download starts
   */
  onStart?: () => void
  /**
   * Abort signal used for remote download requests
   */
  signal?: AbortSignal
  /**
   * Additional fetch options used when probing remote URL CORS capability
   */
  fetchOptions?: Omit<RequestInit, 'method' | 'mode' | 'signal'>
  /**
   * Abort after timeout (milliseconds). `0` or `undefined` disables timeout.
   */
  timeout?: number
  /**
   * Prefer File System Access API when available.
   */
  preferFileSystemAccess?: boolean
  /**
   * Status callback for download lifecycle.
   */
  onPhaseChange?: (phase: DownloadPhase) => void
}
