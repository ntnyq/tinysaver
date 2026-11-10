import { afterEach, describe, expect, it, vi } from 'vitest'
import { StreamDownloader } from '../src/stream'

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
