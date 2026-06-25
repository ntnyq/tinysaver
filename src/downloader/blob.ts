import { isString } from '@ntnyq/utils'
import { DEFAULT_FILENAME } from '../constants'
import type { DownloadOptions } from '../types'

const UTF8_TEXT_MIME_PATTERN =
  /^\s*(?:text\/\S*|application\/xml|[^\s/]*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/iu

/**
 * Adds a UTF-8 byte order mark to eligible text or XML Blob content.
 *
 * @param blob - Blob whose MIME type is inspected.
 * @param options - Download options controlling automatic BOM insertion.
 * @returns The original Blob or a BOM-prefixed Blob with the same MIME type.
 */
export function addBom(blob: Blob, options: DownloadOptions): Blob {
  if (!options.autoBom || !UTF8_TEXT_MIME_PATTERN.test(blob.type)) {
    return blob
  }

  return new Blob([String.fromCodePoint(0xfeff), blob], { type: blob.type })
}

/**
 * Resolves the filename used by browser and File System Access downloads.
 *
 * @param source - Blob, File, or URL being saved.
 * @param requestedName - Filename explicitly requested by the caller.
 * @returns The requested name, source File name, or package default.
 */
export function resolveFilename(
  source: string | Blob,
  requestedName: string,
): string {
  if (requestedName) {
    return requestedName
  }

  if (source instanceof Blob && 'name' in source && isString(source.name)) {
    return source.name
  }

  return DEFAULT_FILENAME
}
