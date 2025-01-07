import { isString } from '@ntnyq/utils'
import type { SaveAsOptions } from './types'

const RE_BOM_EXTENSION =
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  /^\s*(?:text\/\S*|application\/json|[^\s/]*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i

/**
 * @param data - data to save
 * @param filename - filename
 * @param options - options
 */
export function saveAs(
  data: string | Blob | File,
  filename: string,
  options: SaveAsOptions = {},
) {
  const {
    //
    autoBom = true,
    type = '',
    lastModified = Date.now(),
  } = options

  if (isString(data)) {
    if (autoBom && RE_BOM_EXTENSION.test(type)) {
      data = `\uFEFF${data}`
    }

    data = new Blob([data], { type })
  }

  let blob: Blob | File = data as Blob | File

  if (!(blob instanceof File)) {
    blob = new File([blob], filename, {
      type: type || blob.type || '',
      lastModified,
    })
  }

  if ('msSaveOrOpenBlob' in navigator) {
    // Edge & IE10-11
    return (navigator as any).msSaveOrOpenBlob(blob, filename)
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = url
  a.download = filename
  a.rel = 'noopener'

  // 处理点击事件
  const clickHandler = () => {
    setTimeout(() => {
      URL.revokeObjectURL(url)
      a.removeEventListener('click', clickHandler)
      a.remove()
    }, 100)
  }

  a.addEventListener('click', clickHandler, false)

  // 触发下载
  document.body.append(a)
  a.click()

  if (/Version\/\d.*Safari/.test(navigator.userAgent)) {
    const timeout = setTimeout(() => {
      a.remove()
      clearTimeout(timeout)
    }, 1000)
  }
}
