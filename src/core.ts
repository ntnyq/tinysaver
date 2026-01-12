import { FileDownloader } from './FileDownloader'
import type { DownloadOptions } from './types'

// Singleton instance
export const downloader = new FileDownloader()

/**
 * Save a file - Compatible with FileSaver.js saveAs API
 * @param blob - Blob object or URL string
 * @param filename - Name of the file to save
 * @param options - Download options
 */
export function saveAs(
  blob: string | Blob,
  filename?: string,
  options?: DownloadOptions,
): void {
  downloader.save(blob, filename, options)
}

/**
 * Save text content as a file
 */
export function saveText(
  text: string,
  filename: string,
  options?: Omit<DownloadOptions, 'autoBom'> & { mimeType?: string },
): void {
  downloader.saveText(text, filename, options)
}

/**
 * Save JSON data as a file
 */
export function saveJSON(
  data: any,
  filename: string,
  options?: DownloadOptions & { space?: number },
): void {
  downloader.saveJSON(data, filename, options)
}

/**
 * Save canvas as an image file
 */
export function saveCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  options?: DownloadOptions & { quality?: number; type?: string },
): void {
  downloader.saveCanvas(canvas, filename, options)
}
