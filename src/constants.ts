import type { DownloadOptions } from './types'

export const DEFAULT_FILENAME = 'download'
export const DEFAULT_IMAGE_TYPE = 'image/png'
export const DEFAULT_IMAGE_QUALITY = 0.92
export const DEFAULT_TEXT_MIME = 'text/plain;charset=utf-8'
export const DEFAULT_JSON_MIME = 'application/json;charset=utf-8'

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

export const DEFAULT_DOWNLOAD_OPTIONS: DefaultDownloadOptions = {
  autoBom: false,
  revokeTimeout: 40_000,
  clickDelay: 0,
  openInNewTab: false,
  disableClick: false,
  preferFileSystemAccess: false,
}
