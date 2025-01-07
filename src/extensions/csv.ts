import { saveAs } from '../core'
import type { AutoBomOptions } from '../types'

export interface SaveAsCsvOptions extends AutoBomOptions {}

export function saveAsCsv(
  rows: any[][],
  filename: string,
  options: SaveAsCsvOptions = {},
) {
  const data = rows
    .map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    )
    .join('\n')

  return saveAs(data, filename, {
    type: 'text/csv;charset=utf-8',
    autoBom: options.autoBom,
  })
}
