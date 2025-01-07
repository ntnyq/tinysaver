import { saveAs } from '../core'
import type { AutoBomOptions } from '../types'

export interface SaveAsTextOptions extends AutoBomOptions {}

export function saveAsText(
  data: string,
  filename: string,
  options: SaveAsTextOptions = {},
) {
  return saveAs(data, filename, {
    type: 'text/plain;charset=utf-8',
    autoBom: options.autoBom,
  })
}
