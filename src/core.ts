import { FileDownloader } from './downloader'
import type {
  DownloadOptions,
  DownloadStreamSource,
  SaveCanvasOptions,
  SaveJSONOptions,
  SaveStreamOptions,
  SaveTextOptions,
} from './types'

/**
 * Shared downloader instance used by the package convenience functions.
 *
 * Use this instance when direct access to {@link FileDownloader} methods is useful.
 */
export const downloader = new FileDownloader()

/**
 * Saves a Blob or URL using an API compatible with FileSaver.js `saveAs`.
 *
 * @param blob - Blob object or URL string to save.
 * @param filename - Suggested name for the downloaded file.
 * @param options - Download lifecycle and browser behavior options.
 */
export function saveAs(
  blob: string | Blob,
  filename?: string,
  options?: DownloadOptions,
): void {
  downloader.save(blob, filename, options)
}

/**
 * Saves a Blob or URL and resolves when the download workflow completes.
 *
 * @param blob - Blob object or URL string to save.
 * @param filename - Suggested name for the downloaded file.
 * @param options - Download lifecycle and browser behavior options.
 * @returns A promise that rejects when saving fails or is aborted.
 */
export function saveAsAsync(
  blob: string | Blob,
  filename?: string,
  options?: DownloadOptions,
): Promise<void> {
  return downloader.saveAsync(blob, filename, options)
}

/**
 * Saves text content as a UTF-8 file with automatic BOM handling.
 *
 * @param text - Text content to save.
 * @param filename - Suggested name for the downloaded file.
 * @param options - Text MIME type and download behavior options.
 */
export function saveText(
  text: string,
  filename: string,
  options?: SaveTextOptions,
): void {
  downloader.saveText(text, filename, options)
}

/**
 * Serializes and saves JSON-compatible data as a UTF-8 file.
 *
 * @param data - Value passed to `JSON.stringify`.
 * @param filename - Suggested name for the downloaded file.
 * @param options - JSON formatting and download behavior options.
 */
export function saveJSON(
  data: unknown,
  filename: string,
  options?: SaveJSONOptions,
): void {
  downloader.saveJSON(data, filename, options)
}

/**
 * Converts a canvas to an image Blob and saves it as a file.
 *
 * @param canvas - Canvas containing the image to save.
 * @param filename - Suggested name for the downloaded file.
 * @param options - Image conversion and download behavior options.
 */
export function saveCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  options?: SaveCanvasOptions,
): void {
  downloader.saveCanvas(canvas, filename, options)
}

/**
 * Consumes a readable source and saves its bytes as a file.
 *
 * @param source - Stream, response, or asynchronous byte iterable to consume.
 * @param filename - Suggested name for the downloaded file.
 * @param options - Stream MIME type and download behavior options.
 * @returns A promise that resolves after the stream has been saved.
 */
export function saveStream(
  source: DownloadStreamSource,
  filename: string,
  options?: SaveStreamOptions,
): Promise<void> {
  return downloader.saveStream(source, filename, options)
}
