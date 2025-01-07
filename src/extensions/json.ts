import { saveAs } from '../core'
import type { AutoBomOptions } from '../types'

export interface SaveAsJsonOptions extends AutoBomOptions {
  replacer?: (number | string)[] | null
  space?: string | number
}

export function saveAsJson(
  data: any,
  filename: string,
  options: SaveAsJsonOptions = {},
) {
  const { replacer = null, space = 2 } = options
  return saveAs(JSON.stringify(data, replacer, space), filename, {
    type: 'application/json;charset=utf-8',
    autoBom: options?.autoBom,
  })
}
