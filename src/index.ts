import type { SaveAsData, SaveAsOptions } from './types'

/**
 * @param data - data
 * @param filename - filename
 * @param options - options
 */
export function saveAs(
  data: SaveAsData,
  filename?: string,
  options: SaveAsOptions = {},
) {
  console.log({
    data,
    filename,
    options,
  })
}

export * from './types'
export * from './utils'
