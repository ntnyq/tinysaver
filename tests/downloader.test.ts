import { describe, expect, it, vi } from 'vitest'
import { FileDownloader } from '../src/downloader'
import { addBom } from '../src/downloader/blob'
import { StreamDownloader } from '../src/stream'

describe('fileDownloader class', () => {
  it('should create instance', () => {
    const downloader = new FileDownloader()
    expect(downloader).toBeInstanceOf(FileDownloader)
  })

  it('should have save method', () => {
    const downloader = new FileDownloader()
    expect(downloader.save).toBeInstanceOf(Function)
  })

  it('should have saveText method', () => {
    const downloader = new FileDownloader()
    expect(downloader.saveText).toBeInstanceOf(Function)
  })

  it('should have saveJSON method', () => {
    const downloader = new FileDownloader()
    expect(downloader.saveJSON).toBeInstanceOf(Function)
  })

  it('should have saveCanvas method', () => {
    const downloader = new FileDownloader()
    expect(downloader.saveCanvas).toBeInstanceOf(Function)
  })

  it('should call onStart callback', () => {
    const downloader = new FileDownloader()
    const onStart = vi.fn()
    const blob = new Blob(['test'], { type: 'text/plain' })

    downloader.save(blob, 'test.txt', {
      onStart,
      disableClick: true,
    })

    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('should create text blob with correct MIME type', () => {
    const downloader = new FileDownloader()
    const onStart = vi.fn()

    downloader.saveText('hello world', 'test.txt', {
      onStart,
      disableClick: true,
    })

    expect(onStart).toHaveBeenCalledWith()
  })

  it('should create JSON blob from data', () => {
    const downloader = new FileDownloader()
    const onStart = vi.fn()
    const data = { name: 'test', value: 123 }

    downloader.saveJSON(data, 'data.json', {
      onStart,
      disableClick: true,
    })

    expect(onStart).toHaveBeenCalledWith()
  })

  it('should add BOM only when requested', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain;charset=utf-8' })
    const withBom = addBom(blob, { autoBom: true })
    const withoutBom = addBom(blob, {
      autoBom: false,
    })

    expect(withBom).toBeInstanceOf(Blob)
    const bomBytes = new Uint8Array(await withBom.arrayBuffer())
    expect(bomBytes.slice(0, 3)).toStrictEqual(
      new Uint8Array([0xef, 0xbb, 0xbf]),
    )
    const noBomBytes = await withoutBom.arrayBuffer()
    expect(noBomBytes.byteLength).toBe(blob.size)
  })

  it('should use default filename when not provided', () => {
    const downloader = new FileDownloader()
    const createElement = vi.spyOn(document, 'createElement')
    downloader.save(new Blob(['x']), undefined, { disableClick: true })

    const anchor = createElement.mock.results[0]?.value
    expect(anchor).toBeInstanceOf(HTMLAnchorElement)
    expect((anchor as HTMLAnchorElement).download).toBe('download')
    createElement.mockRestore()
  })

  it('saveText should forward blob with correct mime type and content', async () => {
    const downloader = new FileDownloader()
    const spy = vi.spyOn(downloader, 'save').mockReturnValue(undefined)
    downloader.saveText('hello', 'greeting.txt')

    expect(spy).toHaveBeenCalledTimes(1)
    const [blob, filename, options] = spy.mock.calls[0]!
    expect(filename).toBe('greeting.txt')
    expect(options?.autoBom).toBe(true)
    expect((blob as Blob).type).toBe('text/plain;charset=utf-8')
    const text = await (blob as Blob).text()
    expect(text).toBe('hello')
  })

  it('saveJSON should stringify data with defaults and add BOM', async () => {
    const downloader = new FileDownloader()
    const spy = vi.spyOn(downloader, 'save').mockReturnValue(undefined)
    downloader.saveJSON({ a: 1 }, 'data.json', { space: 2 })

    const [blob, filename, options] = spy.mock.calls[0]!
    expect(filename).toBe('data.json')
    expect(options?.autoBom).toBe(true)
    expect((blob as Blob).type).toBe('application/json;charset=utf-8')
    const json = JSON.parse(await (blob as Blob).text()) as { a: number }
    expect(json).toStrictEqual({ a: 1 })
  })

  it('saveJSON should support string spacing', async () => {
    const downloader = new FileDownloader()
    const spy = vi.spyOn(downloader, 'save').mockReturnValue(undefined)
    downloader.saveJSON({ a: 1 }, 'data.json', { space: '\t' })

    const [blob] = spy.mock.calls[0]!
    const text = await (blob as Blob).text()
    expect(text).toContain('\n\t"a": 1\n')
  })

  it('saveCanvas should pass defaults into toBlob and save result', () => {
    const downloader = new FileDownloader()
    const blob = new Blob(['image'], { type: 'image/png' })
    const toBlob = vi.fn(
      (cb: BlobCallback, type?: string, quality?: number) => {
        cb(blob)
        expect(type).toBe('image/png')
        expect(quality).toBeCloseTo(0.92)
      },
    )
    const canvas = { toBlob } as unknown as HTMLCanvasElement
    const saveSpy = vi.spyOn(downloader, 'save').mockReturnValue(undefined)

    downloader.saveCanvas(canvas, 'image.png')

    expect(toBlob).toHaveBeenCalledTimes(1)
    expect(saveSpy).toHaveBeenCalledWith(blob, 'image.png', undefined)
  })

  it('saveCanvas should surface conversion errors asynchronously via onError', async () => {
    const downloader = new FileDownloader()
    const onError = vi.fn()
    const canvas = {
      toBlob: (cb: BlobCallback) =>
        setTimeout(() => {
          cb(null)
        }, 0),
    } as unknown as HTMLCanvasElement

    downloader.saveCanvas(canvas, 'broken.png', { onError })
    await new Promise<void>(resolve => {
      setTimeout(() => {
        resolve()
      }, 10)
    })
    expect(onError).toHaveBeenCalledTimes(1)
    const [error] = onError.mock.calls[0]!
    expect((error as Error).message).toBe('Failed to convert canvas to blob')
  })

  it('remote URL error path should call onError only once', async () => {
    const downloader = new FileDownloader()
    const onError = vi.fn()
    const checkCorsSpy = vi
      .spyOn(downloader as any, 'checkCors')
      .mockResolvedValue(true)
    const downloadWithProgressSpy = vi
      .spyOn(downloader as any, 'downloadWithProgress')
      .mockRejectedValue(new Error('network failed'))

    await expect(
      (downloader as any).handleRemoteUrl(
        'https://example.com/a.txt',
        'a.txt',
        {
          onError,
          onProgress: vi.fn(),
        },
      ),
    ).rejects.toThrow('network failed')

    expect(checkCorsSpy).toHaveBeenCalledTimes(1)
    expect(downloadWithProgressSpy).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('downloadWithProgress should call onProgress and onComplete', async () => {
    const downloader = new FileDownloader()
    const onProgress = vi.fn()
    const onComplete = vi.fn()
    vi.spyOn(downloader as any, 'checkCors').mockResolvedValue(true)

    class MockXHR {
      status = 200
      statusText = 'OK'
      response: Blob = new Blob(['ok'])
      responseType = ''
      onprogress: ((event: ProgressEvent<EventTarget>) => void) | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      open() {}
      send() {
        this.onprogress?.({
          lengthComputable: true,
          loaded: 5,
          total: 10,
        } as ProgressEvent)
        this.onload?.()
      }
      abort() {}
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR as any)
    await (downloader as any).handleRemoteUrl(
      'https://example.com/a.txt',
      'a.txt',
      {
        onProgress,
        onComplete,
        disableClick: true,
        fetchOptions: { credentials: 'include' },
      },
    )

    expect(onProgress).toHaveBeenCalledWith(5, 10)
    expect(onComplete).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('downloadWithProgress should report non-200 response', async () => {
    const downloader = new FileDownloader()
    const onError = vi.fn()

    class MockXHR {
      status = 500
      statusText = 'Internal Error'
      response: Blob = new Blob(['bad'])
      responseType = ''
      onprogress: ((event: ProgressEvent<EventTarget>) => void) | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      open() {}
      send() {
        this.onload?.()
      }
      abort() {}
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR as any)
    await expect(
      (downloader as any).downloadWithProgress(
        'https://example.com/b.txt',
        'b.txt',
        {
          onProgress: vi.fn(),
          onError,
        },
      ),
    ).rejects.toThrow('Failed to download')
    vi.unstubAllGlobals()
  })

  it('downloadWithProgress should report network errors', async () => {
    const downloader = new FileDownloader()
    const onError = vi.fn()

    class MockXHR {
      status = 200
      statusText = 'OK'
      response: Blob = new Blob(['ok'])
      responseType = ''
      onprogress: ((event: ProgressEvent<EventTarget>) => void) | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      open() {}
      send() {
        this.onerror?.()
      }
      abort() {}
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR as any)
    await expect(
      (downloader as any).downloadWithProgress(
        'https://example.com/c.txt',
        'c.txt',
        {
          onProgress: vi.fn(),
          onError,
        },
      ),
    ).rejects.toThrow('Network error')
    vi.unstubAllGlobals()
  })

  it('downloadWithProgress should handle abort signal', async () => {
    const downloader = new FileDownloader()
    const onError = vi.fn()
    const controller = new AbortController()

    class MockXHR {
      status = 200
      statusText = 'OK'
      response: Blob = new Blob(['ok'])
      responseType = ''
      onprogress: ((event: ProgressEvent<EventTarget>) => void) | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      open() {}
      send() {}
      abort() {
        this.onabort?.()
      }
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR as any)
    const promise = (downloader as any).downloadWithProgress(
      'https://example.com/d.txt',
      'd.txt',
      {
        onProgress: vi.fn(),
        onError,
        signal: controller.signal,
      },
    )
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    vi.unstubAllGlobals()
  })

  it('checkCors should pass fetchOptions and timeout signal', async () => {
    const downloader = new FileDownloader()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, type: 'cors' } as Response)

    const result = await (downloader as any).checkCors(
      'https://example.com/e.txt',
      {
        fetchOptions: { credentials: 'include' },
        timeout: 10,
      },
    )

    expect(result).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, init] = fetchSpy.mock.calls[0]!
    expect((init as RequestInit).credentials).toBe('include')
    expect((init as RequestInit).mode).toBe('cors')
    fetchSpy.mockRestore()
  })

  it('should emit phase callbacks in blob save flow', () => {
    const downloader = new FileDownloader()
    const phases: string[] = []
    downloader.save(new Blob(['x']), 'x.txt', {
      disableClick: true,
      onPhaseChange: phase => phases.push(phase),
    })
    expect(phases).toStrictEqual(['saving', 'completed'])
  })

  it('saveStream should save readable stream content', async () => {
    const downloader = new StreamDownloader()
    const saveSpy = vi
      .spyOn(downloader, 'saveAsync')
      .mockResolvedValue(undefined)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello'))
        controller.close()
      },
    })

    await downloader.saveStream(stream, 'stream.txt', {
      mimeType: 'text/plain',
    })
    expect(saveSpy).toHaveBeenCalledTimes(1)
    const [blob, filename] = saveSpy.mock.calls[0]!
    expect(filename).toBe('stream.txt')
    expect((blob as Blob).type).toBe('text/plain')
  })

  it('save should use File System Access API when preferred', async () => {
    const downloader = new FileDownloader()
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    })
    ;(window as any).showSaveFilePicker = showSaveFilePicker

    downloader.save(new Blob(['fsa']), 'fsa.txt', {
      preferFileSystemAccess: true,
      disableClick: true,
    })
    await new Promise<void>(resolve => {
      setTimeout(() => {
        resolve()
      }, 0)
    })
    expect(showSaveFilePicker).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
    delete (window as any).showSaveFilePicker
  })
})
