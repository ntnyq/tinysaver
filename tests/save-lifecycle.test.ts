import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileDownloader } from '../src/downloader'
import type { SaveFilePicker } from '../src/downloader/file-system-access'
import { StreamDownloader } from '../src/stream'

function observeResult(promise: Promise<void>): Promise<string> {
  return promise.then(
    () => 'completed',
    (error: unknown) => (error instanceof Error ? error.name : String(error)),
  )
}

function createWriter() {
  return {
    abort: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  }
}

function resolveAfter<Value>(value: Value, delay: number): Promise<Value> {
  return new Promise(resolve => {
    setTimeout(() => resolve(value), delay)
  })
}

function setPicker(picker: SaveFilePicker): void {
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: picker,
  })
}

describe('save lifecycle cancellation', () => {
  afterEach(() => {
    delete window.showSaveFilePicker
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reports cancellation after canvas conversion without escaping the callback', async () => {
    const canvas = document.createElement('canvas')
    const controller = new AbortController()
    const onError = vi.fn()
    const onPhaseChange = vi.fn()
    const onComplete = vi.fn()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    let finishConversion: BlobCallback | undefined
    vi.spyOn(canvas, 'toBlob').mockImplementation(callback => {
      finishConversion = callback
    })

    new FileDownloader().saveCanvas(canvas, 'canvas.png', {
      disableClick: true,
      onComplete,
      onError,
      onPhaseChange,
      signal: controller.signal,
    })
    controller.abort()

    await expect(
      Promise.resolve().then(() => finishConversion?.(new Blob(['image']))),
    ).resolves.toBeUndefined()

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'AbortError' }),
    )
    expect(onPhaseChange).toHaveBeenCalledExactlyOnceWith('aborted')
    expect(onComplete).not.toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it.each(['onStart', 'onPhaseChange'] as const)(
    'reports %s failures after canvas conversion without escaping the callback',
    async stage => {
      const canvas = document.createElement('canvas')
      const error = new Error(`${stage} failed`)
      const onError = vi.fn()
      const onComplete = vi.fn()
      const createObjectURL = vi.spyOn(URL, 'createObjectURL')
      let finishConversion: BlobCallback | undefined
      vi.spyOn(canvas, 'toBlob').mockImplementation(callback => {
        finishConversion = callback
      })
      const callbacks = {
        onStart: vi.fn(),
        onPhaseChange: vi.fn(),
        [stage]: vi.fn(() => {
          throw error
        }),
      }

      new FileDownloader().saveCanvas(canvas, 'canvas.png', {
        disableClick: true,
        onComplete,
        onError,
        ...callbacks,
      })

      await expect(
        Promise.resolve().then(() => finishConversion?.(new Blob(['image']))),
      ).resolves.toBeUndefined()

      expect(onError).toHaveBeenCalledExactlyOnceWith(error)
      expect(callbacks.onPhaseChange).toHaveBeenLastCalledWith('error')
      expect(onComplete).not.toHaveBeenCalled()
      expect(createObjectURL).not.toHaveBeenCalled()
    },
  )

  it('reports a synchronous canvas conversion error before rethrowing it', () => {
    const canvas = document.createElement('canvas')
    const error = new DOMException('Tainted canvas', 'SecurityError')
    const onError = vi.fn()
    const onPhaseChange = vi.fn()
    const onComplete = vi.fn()
    vi.spyOn(canvas, 'toBlob').mockImplementation(() => {
      throw error
    })

    expect(() =>
      new FileDownloader().saveCanvas(canvas, 'canvas.png', {
        onComplete,
        onError,
        onPhaseChange,
      }),
    ).toThrow(error)

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: 'SecurityError',
        message: 'Tainted canvas',
      }),
    )
    expect(onPhaseChange).toHaveBeenCalledExactlyOnceWith('error')
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('preserves JSON serialization errors when error observers throw', () => {
    const error = new Error('serialization failed')
    const data = {
      toJSON() {
        throw error
      },
    }
    const onError = vi.fn(() => {
      throw new Error('error observer failed')
    })
    const onPhaseChange = vi.fn(() => {
      throw new Error('phase observer failed')
    })

    expect(() =>
      new FileDownloader().saveJSON(data, 'failed.json', {
        onError,
        onPhaseChange,
      }),
    ).toThrow(error)

    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
    expect(onPhaseChange).toHaveBeenCalledExactlyOnceWith('error')
  })

  it('reports the error phase when canvas conversion produces no Blob', async () => {
    const canvas = document.createElement('canvas')
    const onError = vi.fn()
    const onPhaseChange = vi.fn()
    const onComplete = vi.fn()
    vi.spyOn(canvas, 'toBlob').mockImplementation(callback => {
      queueMicrotask(() => callback(null))
    })

    new FileDownloader().saveCanvas(canvas, 'canvas.png', {
      onComplete,
      onError,
      onPhaseChange,
    })
    await Promise.resolve()

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: 'Failed to convert canvas to blob',
      }),
    )
    expect(onPhaseChange).toHaveBeenCalledExactlyOnceWith('error')
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('rejects an already-aborted Blob before opening the picker', async () => {
    const controller = new AbortController()
    const picker = vi
      .fn()
      .mockResolvedValue({ createWritable: async () => createWriter() })
    const onError = vi.fn()
    const onComplete = vi.fn()
    setPicker(picker)
    controller.abort()

    await expect(
      new FileDownloader().saveAsync(new Blob(['x']), 'x.txt', {
        onComplete,
        onError,
        preferFileSystemAccess: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(picker).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('cancels a Blob during a pending write', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const writer = createWriter()
    writer.write.mockReturnValue(new Promise(() => {}))
    writer.abort.mockReturnValue(new Promise(() => {}))
    const onComplete = vi.fn()
    const onError = vi.fn()
    setPicker(vi.fn().mockResolvedValue({ createWritable: async () => writer }))
    const result = observeResult(
      new FileDownloader().saveAsync(new Blob(['x']), 'x.txt', {
        onComplete,
        onError,
        preferFileSystemAccess: true,
        signal: controller.signal,
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    const bounded = Promise.race([result, resolveAfter('pending', 20)])
    await vi.advanceTimersByTimeAsync(20)

    await expect(bounded).resolves.toBe('AbortError')
    expect(writer.abort).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect([
      writer.write.mock.calls.length,
      writer.close.mock.calls.length,
    ]).toStrictEqual([1, 0])
  })

  it.each([
    { stage: 'picker', pickerDelay: 50, writerDelay: 0, writerCount: 0 },
    { stage: 'writable', pickerDelay: 0, writerDelay: 50, writerCount: 1 },
  ])(
    'times out a stream while waiting for the $stage and cleans up late results',
    async ({ pickerDelay, writerDelay, writerCount }) => {
      vi.useFakeTimers()
      const writer = createWriter()
      const createWritable = vi.fn(() => resolveAfter(writer, writerDelay))
      const picker = vi.fn(() => resolveAfter({ createWritable }, pickerDelay))
      setPicker(picker)
      const cancel = vi.fn()
      const onError = vi.fn()
      const onComplete = vi.fn()
      const stream = new ReadableStream<Uint8Array>({ cancel })
      const result = observeResult(
        new StreamDownloader().saveStream(stream, 'x.bin', {
          onComplete,
          onError,
          preferFileSystemAccess: true,
          timeout: 5,
        }),
      )
      const bounded = Promise.race([result, resolveAfter('pending', 20)])
      await vi.advanceTimersByTimeAsync(20)

      await expect(bounded).resolves.toBe('AbortError')
      expect(cancel).toHaveBeenCalledTimes(1)
      expect([
        onError.mock.calls.length,
        onComplete.mock.calls.length,
      ]).toStrictEqual([1, 0])
      await vi.advanceTimersByTimeAsync(100)
      expect([
        writer.write.mock.calls.length,
        writer.close.mock.calls.length,
      ]).toStrictEqual([0, 0])
      expect([
        createWritable.mock.calls.length,
        writer.abort.mock.calls.length,
      ]).toStrictEqual([writerCount, writerCount])
    },
  )

  it.each([
    {
      reason: 'abort',
      timeout: 100,
      interrupt: (controller: AbortController) => controller.abort(),
    },
    { reason: 'timeout', timeout: 5, interrupt() {} },
  ])(
    'cancels the delayed CORS download click on $reason',
    async ({ timeout, interrupt }) => {
      vi.useFakeTimers()
      const controller = new AbortController()
      const onComplete = vi.fn()
      const onError = vi.fn()
      const phases: string[] = []
      vi.stubGlobal('MouseEvent', class MockMouseEvent {})
      const click = vi
        .spyOn(HTMLElement.prototype, 'dispatchEvent')
        .mockReturnValue(true)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        type: 'cors',
      } as Response)
      class MockRequest {
        status = 200
        response = new Blob(['remote'])
        onload?: () => void
        open() {}
        send() {
          this.onload?.()
        }
      }
      vi.stubGlobal('XMLHttpRequest', MockRequest)
      const result = observeResult(
        new FileDownloader().saveAsync('https://files.example/x', 'x.txt', {
          clickDelay: 50,
          onComplete,
          onError,
          onPhaseChange: phase => phases.push(phase),
          signal: controller.signal,
          timeout,
        }),
      )
      await vi.advanceTimersByTimeAsync(0)
      interrupt(controller)
      await vi.advanceTimersByTimeAsync(50)

      await expect(result).resolves.toBe('AbortError')
      expect(click).not.toHaveBeenCalled()
      expect(onComplete).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledTimes(1)
      expect(phases).toStrictEqual([
        'probing',
        'downloading',
        'saving',
        'aborted',
      ])
    },
  )

  it('revokes a Blob URL on the next timer turn with a zero revoke timeout', async () => {
    vi.useFakeTimers()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')

    await new FileDownloader().saveAsync(new Blob(['x']), 'x.txt', {
      disableClick: true,
      revokeTimeout: 0,
    })

    expect(revoke).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(0)
    expect(revoke).toHaveBeenCalledExactlyOnceWith(
      createObjectURL.mock.results[0]?.value,
    )
  })

  it('revokes a Blob URL when its delayed click is cancelled', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const click = vi.spyOn(HTMLElement.prototype, 'dispatchEvent')
    const result = observeResult(
      new FileDownloader().saveAsync(new Blob(['x']), 'x.txt', {
        clickDelay: 50,
        revokeTimeout: 5,
        signal: controller.signal,
      }),
    )
    controller.abort()
    await vi.advanceTimersByTimeAsync(5)

    await expect(result).resolves.toBe('AbortError')
    expect(click).not.toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('keeps a Blob URL alive until the delayed click and revokes it afterward', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('MouseEvent', class MockMouseEvent {})
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const click = vi
      .spyOn(HTMLElement.prototype, 'dispatchEvent')
      .mockImplementation(() => {
        expect(revoke).not.toHaveBeenCalled()
        return true
      })
    const result = observeResult(
      new FileDownloader().saveAsync(new Blob(['x']), 'x.txt', {
        clickDelay: 50,
        revokeTimeout: 5,
      }),
    )
    await vi.advanceTimersByTimeAsync(50)

    await expect(result).resolves.toBe('completed')
    expect(click).toHaveBeenCalledTimes(1)
    expect(revoke).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5)
    expect(revoke).toHaveBeenCalledTimes(1)
  })
})
