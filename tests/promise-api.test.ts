import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileDownloader } from '../src/downloader'

describe('promise API', () => {
  afterEach(() => {
    delete window.showSaveFilePicker
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('saveAsAsync should reject with async remote errors', async () => {
    const downloader = new FileDownloader()

    vi.spyOn(downloader as any, 'checkCors').mockResolvedValue(true)
    vi.spyOn(downloader as any, 'downloadWithProgress').mockRejectedValue(
      new Error('remote failed'),
    )

    await expect(
      downloader.saveAsync('https://example.com/fail.txt', 'fail.txt', {
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow('remote failed')
  })

  it('should download a CORS-enabled URL without a progress callback', async () => {
    const downloader = new FileDownloader()
    const send = vi.fn()

    class MockXMLHttpRequest {
      public onabort: (() => void) | null = null
      public onerror: (() => void) | null = null
      public onload: (() => void) | null = null
      public onprogress: ((event: ProgressEvent) => void) | null = null
      public response = new Blob(['remote content'])
      public responseType = ''
      public status = 200
      public statusText = 'OK'

      public abort(): void {
        this.onabort?.()
      }

      public open(): void {}

      public send(): void {
        send()
        this.onload?.()
      }
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      type: 'cors',
    } as Response)
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest)

    await downloader.saveAsync(
      'https://files.example/report.csv',
      'report.csv',
      { disableClick: true },
    )

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('should keep File System Access out of URL downloads', async () => {
    const downloader = new FileDownloader()
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        write: vi.fn().mockResolvedValue(undefined),
      }),
    })

    class MockXMLHttpRequest {
      public onabort: (() => void) | null = null
      public onerror: (() => void) | null = null
      public onload: (() => void) | null = null
      public onprogress: ((event: ProgressEvent) => void) | null = null
      public response = new Blob(['remote content'])
      public responseType = ''
      public status = 200
      public statusText = 'OK'

      public abort(): void {
        this.onabort?.()
      }

      public open(): void {}

      public send(): void {
        this.onload?.()
      }
    }

    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: showSaveFilePicker,
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      type: 'cors',
    } as Response)
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest)

    await downloader.saveAsync(
      'https://files.example/report.csv',
      'report.csv',
      {
        disableClick: true,
        preferFileSystemAccess: true,
      },
    )

    expect(showSaveFilePicker).not.toHaveBeenCalled()
  })

  it('should reject when an asynchronous completion callback throws', async () => {
    const downloader = new FileDownloader()
    vi.useFakeTimers()
    vi.stubGlobal('MouseEvent', class MockMouseEvent {})
    vi.spyOn(HTMLElement.prototype, 'dispatchEvent').mockReturnValue(true)

    const savePromise = downloader.saveAsync(
      new Blob(['content']),
      'content.txt',
      {
        onComplete: () => {
          throw new Error('completion callback failed')
        },
      },
    )
    const resultPromise = savePromise.catch(error => error as Error)

    await vi.runAllTimersAsync()
    await expect(resultPromise).resolves.toMatchObject({
      message: 'completion callback failed',
    })
  })

  it('should preserve a download error when the error callback throws', async () => {
    const downloader = new FileDownloader()

    class MockXMLHttpRequest {
      public onabort: (() => void) | null = null
      public onerror: (() => void) | null = null
      public onload: (() => void) | null = null
      public onprogress: ((event: ProgressEvent) => void) | null = null
      public response: Blob | null = null
      public responseType = ''
      public status = 0
      public statusText = ''

      public abort(): void {
        this.onabort?.()
      }

      public open(): void {}

      public send(): void {
        this.onerror?.()
      }
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      type: 'cors',
    } as Response)
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest)

    await expect(
      downloader.saveAsync('https://files.example/report.csv', 'report.csv', {
        onError: () => {
          throw new Error('error callback failed')
        },
      }),
    ).rejects.toThrow('Network error occurred during download')
  })

  it('should complete the lifecycle for a same-origin URL', async () => {
    const downloader = new FileDownloader()
    const phases: string[] = []

    await downloader.saveAsync('/report.csv', 'report.csv', {
      disableClick: true,
      onPhaseChange: phase => phases.push(phase),
    })

    expect(phases).toStrictEqual(['completed'])
  })
})
