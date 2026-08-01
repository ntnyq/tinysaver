import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileDownloader } from '../src/downloader'

type TestFileSystemWindow = Omit<Window, 'showSaveFilePicker'> & {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<{
    createWritable: () => Promise<{
      close: () => Promise<void>
      write: (data: Blob | BufferSource | string) => Promise<void>
    }>
  }>
}

function setSaveFilePicker(
  picker: NonNullable<TestFileSystemWindow['showSaveFilePicker']>,
): void {
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: picker,
  })
}

function resetDownloaderMocks(): void {
  delete (window as TestFileSystemWindow).showSaveFilePicker
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
}

describe('remote save cancellation', () => {
  afterEach(resetDownloaderMocks)

  it('should reject an already-aborted remote save', async () => {
    const downloader = new FileDownloader()
    const controller = new AbortController()
    const onComplete = vi.fn()
    const onError = vi.fn()
    const phases: string[] = []
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'

    controller.abort()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)

    await expect(
      downloader.saveAsync('https://example.com/file.txt', 'file.txt', {
        disableClick: true,
        onComplete,
        onError,
        onPhaseChange: phase => phases.push(phase),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(onComplete).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(phases).toStrictEqual(['aborted'])
  })

  it('should apply timeout while probing a remote URL', async () => {
    const downloader = new FileDownloader()
    const onError = vi.fn()

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          )
        }),
    )

    const saveResult = downloader
      .saveAsync('https://example.com/file.txt', 'file.txt', {
        disableClick: true,
        onError,
        timeout: 5,
      })
      .then(
        () => 'completed',
        error => (error as Error).name,
      )
    const result = await Promise.race([
      saveResult,
      new Promise<string>(resolve => {
        setTimeout(() => resolve('pending'), 25)
      }),
    ])

    expect(result).toBe('AbortError')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('should cancel a delayed remote fallback click', async () => {
    const downloader = new FileDownloader()
    const controller = new AbortController()
    const onComplete = vi.fn()
    const onError = vi.fn()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      type: 'basic',
    } as Response)
    const savePromise = downloader.saveAsync(
      'https://example.com/file.txt',
      'file.txt',
      {
        clickDelay: 50,
        onComplete,
        onError,
        signal: controller.signal,
      },
    )
    await new Promise<void>(resolve => {
      setTimeout(resolve, 0)
    })
    controller.abort()

    await expect(savePromise).rejects.toMatchObject({ name: 'AbortError' })
    expect(onComplete).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})

describe('stream save reliability', () => {
  afterEach(resetDownloaderMocks)

  it('should cancel a pending stream read when aborted', async () => {
    const downloader = new FileDownloader()
    const controller = new AbortController()
    const cancel = vi.fn()
    const onError = vi.fn()
    const phases: string[] = []
    const stream = new ReadableStream<Uint8Array>({ cancel })

    const saveResult = downloader
      .saveStream(stream, 'stream.bin', {
        onError,
        onPhaseChange: phase => phases.push(phase),
        signal: controller.signal,
      })
      .then(
        () => 'completed',
        error => (error as Error).name,
      )
    controller.abort()

    const result = await Promise.race([
      saveResult,
      new Promise<string>(resolve => {
        setTimeout(() => resolve('pending'), 25)
      }),
    ])

    expect(result).toBe('AbortError')
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(phases).toStrictEqual(['downloading', 'aborted'])
  })

  it('should apply timeout while reading a stream', async () => {
    const downloader = new FileDownloader()
    const cancel = vi.fn()
    const onError = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })

    await expect(
      downloader.saveStream(stream, 'stream.bin', {
        onError,
        timeout: 5,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('should close an async iterator when aborted', async () => {
    const downloader = new FileDownloader()
    const controller = new AbortController()
    const closeIterator = vi.fn().mockResolvedValue({
      done: true,
      value: undefined,
    })
    const source: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise(() => {}),
          return: closeIterator,
        }
      },
    }

    const savePromise = downloader.saveStream(source, 'stream.bin', {
      signal: controller.signal,
    })
    await new Promise<void>(resolve => {
      setTimeout(resolve, 0)
    })
    controller.abort()

    await expect(savePromise).rejects.toMatchObject({ name: 'AbortError' })
    expect(closeIterator).toHaveBeenCalledTimes(1)
  })

  it('should emit one lifecycle and report response content length', async () => {
    const downloader = new FileDownloader()
    const onStart = vi.fn()
    const onComplete = vi.fn()
    const onProgress = vi.fn()
    const phases: string[] = []
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]))
          controller.enqueue(new Uint8Array([3, 4]))
          controller.close()
        },
      }),
      { headers: { 'content-length': '4' } },
    )

    await downloader.saveStream(response, 'stream.bin', {
      disableClick: true,
      onComplete,
      onProgress,
      onStart,
      onPhaseChange: phase => phases.push(phase),
    })

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onProgress.mock.calls).toStrictEqual([
      [2, 4],
      [4, 4],
    ])
    expect(phases).toStrictEqual(['downloading', 'saving', 'completed'])
  })

  it('should report stream read errors through lifecycle callbacks', async () => {
    const downloader = new FileDownloader()
    const onError = vi.fn()
    const phases: string[] = []
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('stream failed'))
      },
    })

    await expect(
      downloader.saveStream(stream, 'stream.bin', {
        onError,
        onPhaseChange: phase => phases.push(phase),
      }),
    ).rejects.toThrow('stream failed')

    expect(onError).toHaveBeenCalledTimes(1)
    expect(phases).toStrictEqual(['downloading', 'error'])
  })

  it('should write stream chunks directly with File System Access', async () => {
    const downloader = new FileDownloader()
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    setSaveFilePicker(
      vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockResolvedValue({ close, write }),
      }),
    )
    vi.stubGlobal('TransformStream', undefined)
    vi.stubGlobal('WritableStream', undefined)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3, 4]))
        controller.close()
      },
    })

    await downloader.saveStream(stream, 'stream.bin', {
      preferFileSystemAccess: true,
    })

    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenNthCalledWith(1, new Uint8Array([1, 2]))
    expect(write).toHaveBeenNthCalledWith(2, new Uint8Array([3, 4]))
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('blob normalization', () => {
  afterEach(resetDownloaderMocks)

  it('should preserve autoBom with File System Access', async () => {
    const downloader = new FileDownloader()
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const createWritable = vi.fn().mockResolvedValue({ close, write })
    setSaveFilePicker(
      vi.fn().mockResolvedValue({
        createWritable,
      }),
    )

    await new Promise<void>((resolve, reject) => {
      downloader.saveText('hello', 'hello.txt', {
        onComplete: resolve,
        onError: reject,
        preferFileSystemAccess: true,
      })
    })

    const writtenBlob = write.mock.calls[0]?.[0] as Blob
    expect(writtenBlob).toBeInstanceOf(Blob)
    const bytes = new Uint8Array(await writtenBlob.arrayBuffer())
    expect(bytes.slice(0, 3)).toStrictEqual(new Uint8Array([0xef, 0xbb, 0xbf]))
  })

  it('should use a File name when no filename is provided', async () => {
    const downloader = new FileDownloader()
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        write: vi.fn().mockResolvedValue(undefined),
      }),
    })
    setSaveFilePicker(showSaveFilePicker)

    await new Promise<void>((resolve, reject) => {
      downloader.save(new File(['content'], 'original.txt'), undefined, {
        onComplete: resolve,
        onError: reject,
        preferFileSystemAccess: true,
      })
    })

    expect(showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: 'original.txt',
    })
  })
})
