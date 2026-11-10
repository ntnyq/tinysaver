import { afterEach, describe, expect, it, vi } from 'vitest'
import { StreamDownloader, type SaveStreamOptions } from '../src/stream'

function createStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]))
      controller.close()
    },
  })
}

function observeResult(promise: Promise<void>): Promise<string> {
  return promise.then(
    () => 'completed',
    (error: unknown) => (error instanceof Error ? error.name : String(error)),
  )
}

function setSaveFilePicker(picker: NonNullable<Window['showSaveFilePicker']>) {
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: picker,
  })
}

function createSequenceStream(chunkCount: number): ReadableStream<Uint8Array> {
  let produced = 0
  return new ReadableStream({
    pull(controller) {
      if (produced === chunkCount) {
        controller.close()
        return
      }
      controller.enqueue(new Uint8Array([produced % 256]))
      produced += 1
    },
  })
}

describe('stream save edge cases', () => {
  afterEach(() => {
    delete window.showSaveFilePicker
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([false, true])(
    'should preserve the completed phase when onComplete throws with picker=%s',
    async preferFileSystemAccess => {
      const error = new Error('Completion observer failed')
      const onError = vi.fn()
      const onComplete = vi.fn(() => {
        throw error
      })
      const phases: string[] = []
      setSaveFilePicker(
        vi.fn().mockResolvedValue({
          createWritable: async () => ({
            write: async () => {},
            close: async () => {},
          }),
        }),
      )

      await expect(
        new StreamDownloader().saveStream(createStream(), 'stream.bin', {
          disableClick: true,
          preferFileSystemAccess,
          onComplete,
          onError,
          onPhaseChange: phase => phases.push(phase),
        }),
      ).rejects.toBe(error)

      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onError).not.toHaveBeenCalled()
      expect(phases).toStrictEqual(['downloading', 'saving', 'completed'])
    },
  )

  it.each([false, true])(
    'should report a failing completed phase observer with picker=%s',
    async preferFileSystemAccess => {
      const error = new Error('Phase observer failed')
      const onError = vi.fn()
      const onComplete = vi.fn()
      const onPhaseChange = vi
        .fn<(phase: string) => void>()
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {
          throw error
        })
      setSaveFilePicker(
        vi.fn().mockResolvedValue({
          createWritable: async () => ({
            write: async () => {},
            close: async () => {},
          }),
        }),
      )

      await expect(
        new StreamDownloader().saveStream(createStream(), 'stream.bin', {
          disableClick: true,
          preferFileSystemAccess,
          onComplete,
          onError,
          onPhaseChange,
        }),
      ).rejects.toBe(error)

      expect(onComplete).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledExactlyOnceWith(error)
      expect(onPhaseChange.mock.calls.map(([phase]) => phase)).toStrictEqual([
        'downloading',
        'saving',
        'completed',
        'error',
      ])
    },
  )

  it.each([
    {
      preferFileSystemAccess: false,
      mode: 'signal',
      options: (): SaveStreamOptions => ({
        signal: new AbortController().signal,
      }),
    },
    {
      preferFileSystemAccess: true,
      mode: 'signal',
      options: (): SaveStreamOptions => ({
        signal: new AbortController().signal,
      }),
    },
    {
      preferFileSystemAccess: false,
      mode: 'timeout',
      options: (): SaveStreamOptions => ({ timeout: 1_000 }),
    },
    {
      preferFileSystemAccess: true,
      mode: 'timeout',
      options: (): SaveStreamOptions => ({ timeout: 1_000 }),
    },
  ])(
    'should preserve reused iterator buffers with picker=$preferFileSystemAccess and $mode',
    async ({ preferFileSystemAccess, options }) => {
      const chunks: BlobPart[] = []
      vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
        chunks.push(blob as Blob)
        return 'blob:reused-buffer'
      })
      setSaveFilePicker(
        vi.fn().mockResolvedValue({
          createWritable: async () => ({
            write: async (chunk: BlobPart) => {
              chunks.push(chunk)
            },
            close: async () => {},
          }),
        }),
      )
      async function* generate(): AsyncGenerator<Uint8Array> {
        const buffer = new Uint8Array(3).subarray(1, 2)
        for (const value of [1, 2, 3, 4]) {
          buffer[0] = value
          yield buffer
        }
      }

      await new StreamDownloader().saveStream(generate(), 'reused.bin', {
        disableClick: true,
        preferFileSystemAccess,
        ...options(),
      })

      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
      expect([...bytes]).toStrictEqual([1, 2, 3, 4])
    },
  )

  it.each(['onStart', 'onPhaseChange'] as const)(
    'should cancel the source and report a failing initial %s callback',
    async stage => {
      const error = new Error(`${stage} failed`)
      const cancel = vi.fn(() => new Promise<void>(() => {}))
      const source = new ReadableStream<Uint8Array>({ cancel })
      const onError = vi.fn()
      const onComplete = vi.fn()
      const callbacks = {
        onStart: vi.fn(),
        onPhaseChange: vi.fn(),
        [stage]: vi.fn(() => {
          throw error
        }),
      }

      await expect(
        new StreamDownloader().saveStream(source, 'failed.bin', {
          onComplete,
          onError,
          ...callbacks,
        }),
      ).rejects.toBe(error)

      expect(cancel).toHaveBeenCalledExactlyOnceWith(error)
      expect(onError).toHaveBeenCalledExactlyOnceWith(error)
      expect(callbacks.onPhaseChange).toHaveBeenLastCalledWith('error')
      expect([onComplete.mock.calls.length, source.locked]).toStrictEqual([
        0,
        false,
      ])
    },
  )

  it('should report the error phase for a response without a body', async () => {
    const onError = vi.fn()
    const onPhaseChange = vi.fn()

    await expect(
      new StreamDownloader().saveStream(new Response(null), 'empty.bin', {
        onError,
        onPhaseChange,
      }),
    ).rejects.toThrow('Response body is not readable')

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onPhaseChange).toHaveBeenCalledExactlyOnceWith('error')
  })

  it('should time out a stalled async generator without waiting for return', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    async function* generate(): AsyncGenerator<Uint8Array> {
      await new Promise<void>(() => {})
      yield new Uint8Array([1])
    }

    const result = observeResult(
      new StreamDownloader().saveStream(generate(), 'stalled.bin', {
        onError,
        timeout: 5,
      }),
    )
    const observed = Promise.race([
      result,
      new Promise<string>(resolve => {
        setTimeout(() => resolve('pending'), 25)
      }),
    ])
    await vi.advanceTimersByTimeAsync(25)

    await expect(observed).resolves.toBe('AbortError')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('should release a stream even when its cancellation never settles', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const result = observeResult(
      new StreamDownloader().saveStream(stream, 'stream.bin', {
        signal: controller.signal,
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    const observed = Promise.race([
      result,
      new Promise<string>(resolve => {
        setTimeout(() => resolve('pending'), 25)
      }),
    ])
    await vi.advanceTimersByTimeAsync(25)

    await expect(observed).resolves.toBe('AbortError')
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(stream.locked).toBe(false)
  })

  it.each([
    {
      reason: 'abort',
      timeout: 0,
      interrupt(controller: AbortController) {
        setTimeout(() => controller.abort(), 5)
      },
    },
    { reason: 'timeout', timeout: 5, interrupt() {} },
  ])(
    'should cancel a buffered download on $reason before its click',
    async ({ timeout, interrupt }) => {
      vi.useFakeTimers()
      const controller = new AbortController()
      vi.stubGlobal('MouseEvent', class MockMouseEvent {})
      const click = vi
        .spyOn(HTMLElement.prototype, 'dispatchEvent')
        .mockReturnValue(true)
      const onComplete = vi.fn()
      const onError = vi.fn()
      const phases: string[] = []
      const result = observeResult(
        new StreamDownloader().saveStream(createStream(), 'stream.bin', {
          clickDelay: 50,
          onComplete,
          onError,
          onPhaseChange: phase => {
            phases.push(phase)
          },
          signal: controller.signal,
          timeout,
        }),
      )
      interrupt(controller)
      await vi.advanceTimersByTimeAsync(50)

      await expect(result).resolves.toBe('AbortError')
      expect(click).not.toHaveBeenCalled()
      expect(onComplete).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledTimes(1)
      expect(phases).toStrictEqual(['downloading', 'saving', 'aborted'])
    },
  )

  it.each([
    ['picker', (error: Error) => vi.fn().mockRejectedValue(error)],
    [
      'writable',
      (error: Error) =>
        vi.fn().mockResolvedValue({
          createWritable: vi.fn().mockRejectedValue(error),
        }),
    ],
  ] as const)(
    'should cancel the source when %s creation fails',
    async (_stage, createPicker) => {
      const error = new Error('cancelled')
      error.name = 'AbortError'
      const cancel = vi.fn()
      const stream = new ReadableStream<Uint8Array>({ cancel })
      setSaveFilePicker(createPicker(error))

      await expect(
        new StreamDownloader().saveStream(stream, 'stream.bin', {
          preferFileSystemAccess: true,
        }),
      ).rejects.toBe(error)

      expect(cancel).toHaveBeenCalledExactlyOnceWith(error)
      expect(stream.locked).toBe(false)
    },
  )

  it('should cancel an already-aborted source without reading it', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })
    controller.abort()

    await expect(
      new StreamDownloader().saveStream(stream, 'stream.bin', {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('should reject an oversized response without waiting for source cleanup', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'content-length': '10' },
    })
    const result = observeResult(
      new StreamDownloader().saveStream(response, 'large.bin', {
        maxBufferBytes: 5,
      }),
    )
    const observed = Promise.race([
      result,
      new Promise<string>(resolve => {
        setTimeout(() => resolve('pending'), 25)
      }),
    ])
    await vi.advanceTimersByTimeAsync(25)

    await expect(observed).resolves.toBe('RangeError')
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('should abort a pending direct write without waiting for writer cleanup', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const abort = vi.fn(() => new Promise<void>(() => {}))
    const close = vi.fn()
    const write = vi.fn(() => new Promise<void>(() => {}))
    const stream = createStream()
    setSaveFilePicker(
      vi.fn().mockResolvedValue({
        createWritable: async () => ({ abort, close, write }),
      }),
    )
    const result = observeResult(
      new StreamDownloader().saveStream(stream, 'stream.bin', {
        preferFileSystemAccess: true,
        signal: controller.signal,
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(write).toHaveBeenCalledTimes(1)
    controller.abort()
    const observed = Promise.race([
      result,
      new Promise<string>(resolve => {
        setTimeout(() => resolve('pending'), 25)
      }),
    ])
    await vi.advanceTimersByTimeAsync(25)

    await expect(observed).resolves.toBe('AbortError')
    expect(abort).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
    expect(stream.locked).toBe(false)
  })

  it('should not close the destination when aborted after the final read', async () => {
    const controller = new AbortController()
    const abort = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const write = vi.fn().mockResolvedValue(undefined)
    const onComplete = vi.fn()
    const onError = vi.fn()
    const phases: string[] = []
    const stream = new ReadableStream<Uint8Array>(
      {
        start(sourceController) {
          sourceController.enqueue(new Uint8Array([1, 2, 3]))
        },
        pull(sourceController) {
          sourceController.close()
          // Abort after the final read settles but before saving resumes.
          queueMicrotask(() =>
            queueMicrotask(() => queueMicrotask(() => controller.abort())),
          )
        },
      },
      { highWaterMark: 0 },
    )
    setSaveFilePicker(
      vi.fn().mockResolvedValue({
        createWritable: async () => ({ abort, close, write }),
      }),
    )

    await expect(
      new StreamDownloader().saveStream(stream, 'existing.bin', {
        onComplete,
        onError,
        onPhaseChange: phase => phases.push(phase),
        preferFileSystemAccess: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(write).toHaveBeenCalledExactlyOnceWith(new Uint8Array([1, 2, 3]))
    expect(abort).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'AbortError' }),
    )
    expect(phases).toStrictEqual(['downloading', 'saving', 'aborted'])
    expect([
      close.mock.calls.length,
      onComplete.mock.calls.length,
      onError.mock.calls.length,
      stream.locked,
    ]).toStrictEqual([0, 0, 1, false])
  })

  it.each([
    ['text/plain;charset=utf-8', [239, 187, 191, 1, 2]],
    ['application/xml;charset=utf-8', [239, 187, 191, 1, 2]],
    ['application/octet-stream', [1, 2]],
  ] as const)(
    'should preserve BOM eligibility for direct %s writes',
    async (mimeType, expectedBytes) => {
      const chunks: BlobPart[] = []
      setSaveFilePicker(
        vi.fn().mockResolvedValue({
          createWritable: async () => ({
            write: async (chunk: BlobPart) => {
              chunks.push(chunk)
            },
            close: async () => {},
          }),
        }),
      )

      await new StreamDownloader().saveStream(
        new Response(createStream(), { headers: { 'content-type': mimeType } }),
        'stream.bin',
        { autoBom: true, preferFileSystemAccess: true },
      )

      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
      expect([...bytes]).toStrictEqual(expectedBytes)
    },
  )

  it('should write every chunk in a long stream with cancellation enabled', async () => {
    let written = 0
    const chunkCount = 25_000
    setSaveFilePicker(
      vi.fn().mockResolvedValue({
        createWritable: async () => ({
          write: async (chunk: Uint8Array) => {
            expect(chunk[0]).toBe(written % 256)
            written += 1
          },
          close: async () => {},
        }),
      }),
    )
    const stream = createSequenceStream(chunkCount)

    await new StreamDownloader().saveStream(stream, 'many.bin', {
      preferFileSystemAccess: true,
      signal: new AbortController().signal,
    })

    expect(written).toBe(chunkCount)
    expect(stream.locked).toBe(false)
  })
})
