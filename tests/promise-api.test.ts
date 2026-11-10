import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileDownloader } from '../src/downloader'

describe('promise API', () => {
  afterEach(() => {
    delete window.showSaveFilePicker
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(['onStart', 'onPhaseChange'] as const)(
    'should stop before opening a picker when the %s callback throws',
    async stage => {
      const error = new Error(`${stage} failed`)
      const write = vi.fn().mockResolvedValue(undefined)
      const close = vi.fn().mockResolvedValue(undefined)
      const picker = vi.fn().mockResolvedValue({
        createWritable: async () => ({ write, close }),
      })
      const onError = vi.fn()
      const onComplete = vi.fn()
      const callbacks = {
        onStart: vi.fn(),
        onPhaseChange: vi.fn(),
        [stage]: vi.fn(() => {
          throw error
        }),
      }
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: picker,
      })

      await expect(
        new FileDownloader().saveAsync(new Blob(['x']), 'x.txt', {
          preferFileSystemAccess: true,
          onComplete,
          onError,
          ...callbacks,
        }),
      ).rejects.toBe(error)

      expect([
        picker.mock.calls.length,
        write.mock.calls.length,
        close.mock.calls.length,
        onComplete.mock.calls.length,
      ]).toStrictEqual([0, 0, 0, 0])
      expect(onError).toHaveBeenCalledExactlyOnceWith(error)
      expect(callbacks.onPhaseChange).toHaveBeenLastCalledWith('error')
    },
  )

  it.each([true, false])(
    'should abort a remote transfer when its progress callback throws with lengthComputable=%s',
    async lengthComputable => {
      const error = new Error('progress failed')
      const abort = vi.fn()
      const onError = vi.fn()
      const onComplete = vi.fn()
      const createObjectURL = vi.spyOn(URL, 'createObjectURL')
      const requests: MockRequest[] = []
      class MockRequest {
        status = 200
        response = new Blob(['remote content'])
        onabort: (() => void) | null = null
        onload: (() => void) | null = null
        onprogress: ((event: ProgressEvent) => void) | null = null
        constructor() {
          requests.push(this)
        }
        open() {}
        send() {}
        abort() {
          abort()
          this.onabort?.()
        }
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        type: 'cors',
      } as Response)
      vi.stubGlobal('XMLHttpRequest', MockRequest)
      const result = new FileDownloader()
        .saveAsync('https://files.example/file.txt', 'file.txt', {
          disableClick: true,
          onComplete,
          onError,
          onProgress() {
            throw error
          },
        })
        .catch((error_: unknown) => error_)
      await vi.waitFor(() => expect(requests).toHaveLength(1))
      const request = requests[0]!

      request.onprogress?.(
        new ProgressEvent('progress', {
          lengthComputable,
          loaded: 1,
          total: 2,
        }),
      )
      request.onload?.()

      await expect(result).resolves.toBe(error)
      expect(abort).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledExactlyOnceWith(error)
      expect([
        onComplete.mock.calls.length,
        createObjectURL.mock.calls.length,
      ]).toStrictEqual([0, 0])
    },
  )

  it('should preserve the original error when error observers throw', async () => {
    const error = new Error('start failed')
    const onError = vi.fn(() => {
      throw new Error('error observer failed')
    })

    await expect(
      new FileDownloader().saveAsync(new Blob(['x']), 'x.txt', {
        onStart() {
          throw error
        },
        onPhaseChange() {
          throw new Error('phase observer failed')
        },
        onError,
      }),
    ).rejects.toBe(error)

    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
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

      public abort() {
        this.onabort?.()
      }

      public open() {}

      public send() {
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

      public abort() {
        this.onabort?.()
      }

      public open() {}

      public send() {
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

      public abort() {
        this.onabort?.()
      }

      public open() {}

      public send() {
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
