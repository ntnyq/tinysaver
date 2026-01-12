import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserDetector } from '../src/BrowserDetector'
import { FileDownloader } from '../src/FileDownloader'
import { saveAs, saveCanvas, saveJSON, saveText } from '../src/index'

const readBlobAsArrayBuffer = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })

const readBlobAsText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    reader.onload = () => resolve(reader.result as string)
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })

describe('BrowserDetector', () => {
  it('should have static methods', () => {
    expect(BrowserDetector.hasDownloadSupport).toBeDefined()
    expect(BrowserDetector.hasMsSaveBlob).toBeDefined()
    expect(BrowserDetector.isChromeIOS).toBeDefined()
    expect(BrowserDetector.isSafari).toBeDefined()
    expect(BrowserDetector.isMacOSWebViews).toBeDefined()
  })

  it('should work with instance methods for backward compatibility', () => {
    const detector = new BrowserDetector()
    expect(detector.hasDownloadSupport).toBe(BrowserDetector.hasDownloadSupport)
    expect(detector.hasMsSaveBlob).toBe(BrowserDetector.hasMsSaveBlob)
  })
})

describe('FileDownloader', () => {
  let downloader: FileDownloader

  beforeEach(() => {
    downloader = new FileDownloader()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create instance', () => {
    expect(downloader).toBeInstanceOf(FileDownloader)
  })

  it('should have save method', () => {
    expect(downloader.save).toBeInstanceOf(Function)
  })

  it('should have saveText method', () => {
    expect(downloader.saveText).toBeInstanceOf(Function)
  })

  it('should have saveJSON method', () => {
    expect(downloader.saveJSON).toBeInstanceOf(Function)
  })

  it('should have saveCanvas method', () => {
    expect(downloader.saveCanvas).toBeInstanceOf(Function)
  })

  it('should call onStart callback', () => {
    const onStart = vi.fn()
    const blob = new Blob(['test'], { type: 'text/plain' })

    downloader.save(blob, 'test.txt', {
      onStart,
      disableClick: true,
    })

    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('should create text blob with correct MIME type', () => {
    const onStart = vi.fn()

    downloader.saveText('hello world', 'test.txt', {
      onStart,
      disableClick: true,
    })

    expect(onStart).toHaveBeenCalled()
  })

  it('should create JSON blob from data', () => {
    const onStart = vi.fn()
    const data = { name: 'test', value: 123 }

    downloader.saveJSON(data, 'data.json', {
      onStart,
      disableClick: true,
    })

    expect(onStart).toHaveBeenCalled()
  })

  it('should add BOM only when requested', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain;charset=utf-8' })
    const withBom = (downloader as any).addBom(blob, { autoBom: true }) as Blob
    const withoutBom = (downloader as any).addBom(blob, {
      autoBom: false,
    }) as Blob

    expect(withBom).toBeInstanceOf(Blob)
    const bomBytes = new Uint8Array(await readBlobAsArrayBuffer(withBom))
    // eslint-disable-next-line unicorn/number-literal-case
    expect(bomBytes.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]))
    const noBomBytes = await readBlobAsArrayBuffer(withoutBom)
    expect(noBomBytes.byteLength).toBe(blob.size)
  })

  it('should use default filename when not provided', () => {
    const spy = vi
      .spyOn(downloader as any, 'saveBlob')
      .mockImplementation(() => undefined)
    downloader.save(new Blob(['x']))

    expect(spy).toHaveBeenCalledWith(
      expect.any(Blob),
      'download',
      expect.any(Object),
    )
  })

  it('saveText should forward blob with correct mime type and content', async () => {
    const spy = vi.spyOn(downloader, 'save').mockImplementation(() => undefined)
    downloader.saveText('hello', 'greeting.txt')

    expect(spy).toHaveBeenCalledTimes(1)
    const [blob, filename, options] = spy.mock.calls[0]!
    expect(filename).toBe('greeting.txt')
    expect(options?.autoBom).toBe(true)
    expect((blob as Blob).type).toBe('text/plain;charset=utf-8')
    const text = await readBlobAsText(blob as Blob)
    expect(text).toBe('hello')
  })

  it('saveJSON should stringify data with defaults and add BOM', async () => {
    const spy = vi.spyOn(downloader, 'save').mockImplementation(() => undefined)
    downloader.saveJSON({ a: 1 }, 'data.json', { space: 2 })

    const [blob, filename, options] = spy.mock.calls[0]!
    expect(filename).toBe('data.json')
    expect(options?.autoBom).toBe(true)
    expect((blob as Blob).type).toBe('application/json;charset=utf-8')
    const json = JSON.parse(await readBlobAsText(blob as Blob)) as { a: number }
    expect(json).toEqual({ a: 1 })
  })

  it('saveCanvas should pass defaults into toBlob and save result', () => {
    const blob = new Blob(['image'], { type: 'image/png' })
    const toBlob = vi.fn(
      (cb: BlobCallback, type?: string, quality?: number) => {
        cb(blob)
        expect(type).toBe('image/png')
        expect(quality).toBeCloseTo(0.92)
      },
    )
    const canvas = { toBlob } as unknown as HTMLCanvasElement
    const saveSpy = vi
      .spyOn(downloader, 'save')
      .mockImplementation(() => undefined)

    downloader.saveCanvas(canvas, 'image.png')

    expect(toBlob).toHaveBeenCalledTimes(1)
    expect(saveSpy).toHaveBeenCalledWith(blob, 'image.png', undefined)
  })

  it('saveCanvas should surface conversion errors', () => {
    const onError = vi.fn()
    const canvas = {
      toBlob: (cb: BlobCallback) => cb(null),
    } as unknown as HTMLCanvasElement

    expect(() =>
      downloader.saveCanvas(canvas, 'broken.png', { onError }),
    ).toThrow('Failed to convert canvas to blob')
    expect(onError).toHaveBeenCalledTimes(1)
  })
})

describe('API exports', () => {
  it('should export saveAs function', () => {
    expect(saveAs).toBeInstanceOf(Function)
  })

  it('should export saveText function', () => {
    expect(saveText).toBeInstanceOf(Function)
  })

  it('should export saveJSON function', () => {
    expect(saveJSON).toBeInstanceOf(Function)
  })

  it('should export saveCanvas function', () => {
    expect(saveCanvas).toBeInstanceOf(Function)
  })
})
