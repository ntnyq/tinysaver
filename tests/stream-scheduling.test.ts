import { afterEach, describe, expect, it, vi } from 'vitest'
import { StreamDownloader } from '../src/stream'

function createReadySource(sourceKind: string, cancel: () => void) {
  const chunkCount = 200_000
  let produced = 0
  async function* generate(): AsyncGenerator<Uint8Array> {
    try {
      while (produced < chunkCount) {
        produced += 1
        yield new Uint8Array(0)
      }
    } finally {
      cancel()
    }
  }
  const source =
    sourceKind === 'iterator'
      ? generate()
      : new ReadableStream<Uint8Array>({
          pull(controller) {
            if (produced === chunkCount) {
              controller.close()
              return
            }
            produced += 1
            controller.enqueue(new Uint8Array(0))
          },
          cancel,
        })
  return { source, chunkCount, getProduced: () => produced }
}

function createCancellation(cancellation: string, controller: AbortController) {
  if (cancellation === 'timeout') {
    return { timeout: 1, cleanup: () => null }
  }
  const timer = setTimeout(() => controller.abort(), 0)
  return { timeout: 0, cleanup: () => clearTimeout(timer) }
}

describe.each([false, true])(
  'stream scheduling with File System Access=%s',
  preferFileSystemAccess => {
    afterEach(() => {
      delete window.showSaveFilePicker
      vi.restoreAllMocks()
    })

    it.each([
      { sourceKind: 'stream', cancellation: 'abort' },
      { sourceKind: 'stream', cancellation: 'timeout' },
      { sourceKind: 'iterator', cancellation: 'abort' },
      { sourceKind: 'iterator', cancellation: 'timeout' },
    ])(
      'allows $cancellation while consuming a continuously ready $sourceKind',
      async ({ sourceKind, cancellation }) => {
        const cancel = vi.fn()
        const onError = vi.fn()
        const onComplete = vi.fn()
        const close = vi.fn().mockResolvedValue(undefined)
        const abort = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true,
          value: async () => ({
            createWritable: async () => ({
              abort,
              close,
              write: async () => {},
            }),
          }),
        })
        const { source, chunkCount, getProduced } = createReadySource(
          sourceKind,
          cancel,
        )
        const controller = new AbortController()
        const { timeout, cleanup } = createCancellation(
          cancellation,
          controller,
        )

        try {
          await expect(
            new StreamDownloader().saveStream(source, 'ready.bin', {
              disableClick: true,
              onComplete,
              onError,
              preferFileSystemAccess,
              signal: controller.signal,
              timeout,
            }),
          ).rejects.toMatchObject({ name: 'AbortError' })
        } finally {
          cleanup()
        }

        expect(getProduced()).toBeLessThan(chunkCount)
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ name: 'AbortError' }),
        )
        expect({
          completions: onComplete.mock.calls.length,
          closes: close.mock.calls.length,
          aborts: abort.mock.calls.length,
        }).toStrictEqual({
          completions: 0,
          closes: 0,
          aborts: Number(preferFileSystemAccess),
        })
      },
    )
  },
)

describe('stream task scheduling', () => {
  it('allows browser tasks while consuming a stream without a cancellation signal', async () => {
    let taskRan = false
    let observedTask = false
    const timer = setTimeout(() => {
      taskRan = true
    }, 0)
    async function* generate(): AsyncGenerator<Uint8Array> {
      for (let index = 0; index < 200_000; index += 1) {
        yield new Uint8Array(0)
      }
    }
    try {
      await new StreamDownloader().saveStream(generate(), 'ready.bin', {
        disableClick: true,
        onProgress() {
          observedTask ||= taskRan
        },
        revokeTimeout: 0,
      })
      expect(observedTask).toBe(true)
    } finally {
      clearTimeout(timer)
    }
  })
})
