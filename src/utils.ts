import { isObject, isUndefined, warnOnce } from '@ntnyq/utils'
import type { SaveAsOptions } from './types'

export const RE_XML_OR_TEXT =
  /^\s*(?:text\/[^\s;]*|application\/xml|[^\s/]+\/[^\s;]*\+xml)\s*;\s*charset\s*=\s*utf-8/i

export function shouldPrependBOM(type: string) {
  return RE_XML_OR_TEXT.test(type)
}

export function prependBOM(blob: Blob, options?: SaveAsOptions) {
  if (isUndefined(options)) {
    options = { autoBom: false }
  } else if (!isObject(options)) {
    warnOnce('Deprecated: Expected third argument to be an object')
    options = { autoBom: !options }
  }

  // prepend BOM for UTF-8 XML and text/* types (including HTML)
  // note: your browser will automatically convert UTF-16 U+FEFF to EF BB BF
  if (options.autoBom && shouldPrependBOM(blob.type)) {
    // eslint-disable-next-line unicorn/number-literal-case
    return new Blob([String.fromCodePoint(0xfeff), blob], { type: blob.type })
  }

  return blob
}

export function download(url: string, callback: (blob: Blob) => void) {
  const xhr = new XMLHttpRequest()
  xhr.open('GET', url)
  xhr.responseType = 'blob'
  xhr.addEventListener('load', () => {
    callback?.(xhr.response as Blob)
  })
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  xhr.onerror = () => {
    console.error('Cound not download file')
  }
  xhr.send()
}

export function corsEnabled(url: string) {
  const xhr = new XMLHttpRequest()
  // use sync to avoid popup blocker
  xhr.open('HEAD', url, false)
  try {
    xhr.send()
  } catch {}
  return xhr.status >= 200 && xhr.status <= 299
}

export function dispatchClick(node: Element) {
  try {
    node.dispatchEvent(new MouseEvent('click'))
  } catch {
    const mouseEvent = document.createEvent('MouseEvent')
    mouseEvent.initMouseEvent(
      'click',
      true,
      true,
      window,
      0,
      0,
      0,
      80,
      20,
      false,
      false,
      false,
      false,
      0,
      null,
    )
    node.dispatchEvent(mouseEvent)
  }
}

export function isMacOSWebview() {
  if (!globalThis.navigator) return false
  const userAgent = globalThis.navigator.userAgent
  return (
    /Macintosh/.test(userAgent)
    && /AppleWebkit/.test(userAgent)
    && !/Safari/.test(userAgent)
  )
}
