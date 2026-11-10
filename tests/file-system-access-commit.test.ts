import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileDownloader } from '../src/downloader'
import type { FileSystemWritable } from '../src/downloader/file-system-access'
import { StreamDownloader } from '../src/stream'
import type { DownloadOptions } from '../src/types'

const abortCancellation = {
  reason: 'abort',
  timeout: 0,
  interrupt: (controller: AbortController) => controller.abort(),
}
const timeoutCancellation = {
  reason: 'timeout',
  timeout: 5,
  interrupt() {},
}

function saveSource(source: 'Blob' | 'stream', options: DownloadOptions) {
  return source === 'Blob'
    ? new FileDownloader().saveAsync(
        new Blob(['replacement']),
        'existing.bin',
        options,
      )
    : new StreamDownloader().saveStream(
        new Response('replacement'),
        'existing.bin',
        options,
      )
}

function createPendingDestination() {
  let settleClose: (error?: Error) => void = () => {}
  const pendingClose = new Promise<void>((resolve, reject) => {
    settleClose = error => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
  })
  const commit = vi.fn()
  const close = vi.fn(async () => {
    await pendingClose
    commit()
  })
  // Native stream semantics prevent aborting a close already in flight.
  const writer = new WritableStream<Blob | BufferSource | string>({
    close,
  }).getWriter()
  const closed = writer.closed.catch(() => null)
  const abort = vi.fn((reason?: unknown) => writer.abort(reason))
  const writable: FileSystemWritable = {
    abort,
    close: () => writer.close(),
    write: data => writer.write(data),
  }
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: async () => ({ createWritable: async () => writable }),
  })

  return { abort, close, closed, commit, settleClose }
}

describe.each([
  {
    source: 'Blob',
    savingPhases: ['saving'],
    cancellations: [abortCancellation],
  },
  {
    source: 'stream',
    savingPhases: ['downloading', 'saving'],
    cancellations: [abortCancellation, timeoutCancellation],
  },
] as const)(
  '$source commit boundary',
  ({ source, savingPhases, cancellations }) => {
    afterEach(() => {
      delete window.showSaveFilePicker
      vi.useRealTimers()
    })

    it.each(cancellations)(
      'waits for the commit when $reason occurs during close',
      async ({ interrupt, timeout }) => {
        vi.useFakeTimers()
        const destination = createPendingDestination()
        const controller = new AbortController()
        const onComplete = vi.fn()
        const onError = vi.fn()
        const settled = vi.fn()
        const phases: string[] = []
        const result = saveSource(source, {
          preferFileSystemAccess: true,
          signal: controller.signal,
          timeout,
          onComplete,
          onError,
          onPhaseChange: phase => phases.push(phase),
        }).then(settled, settled)
        await vi.advanceTimersByTimeAsync(0)
        expect(destination.close).toHaveBeenCalledTimes(1)

        interrupt(controller)
        await vi.advanceTimersByTimeAsync(5)

        expect({
          settled: settled.mock.calls.length,
          aborts: destination.abort.mock.calls.length,
          commits: destination.commit.mock.calls.length,
          completions: onComplete.mock.calls.length,
          errors: onError.mock.calls.length,
          phases,
        }).toStrictEqual({
          settled: 0,
          aborts: 0,
          commits: 0,
          completions: 0,
          errors: 0,
          phases: savingPhases,
        })

        destination.settleClose()
        await result
        await destination.closed

        expect(settled).toHaveBeenCalledExactlyOnceWith(undefined)
        expect({
          commits: destination.commit.mock.calls.length,
          completions: onComplete.mock.calls.length,
          errors: onError.mock.calls.length,
          phases,
        }).toStrictEqual({
          commits: 1,
          completions: 1,
          errors: 0,
          phases: [...savingPhases, 'completed'],
        })
      },
    )

    it('reports a close failure even when cancellation arrives during commit', async () => {
      vi.useFakeTimers()
      const destination = createPendingDestination()
      const controller = new AbortController()
      const error = new Error('Commit failed')
      const onComplete = vi.fn()
      const onError = vi.fn()
      const phases: string[] = []
      const result = saveSource(source, {
        preferFileSystemAccess: true,
        signal: controller.signal,
        onComplete,
        onError,
        onPhaseChange: phase => phases.push(phase),
      }).catch((error_: unknown) => error_)
      await vi.advanceTimersByTimeAsync(0)
      expect(destination.close).toHaveBeenCalledTimes(1)

      controller.abort()
      destination.settleClose(error)

      await expect(result).resolves.toBe(error)
      await destination.closed
      expect([
        destination.commit.mock.calls.length,
        onComplete.mock.calls.length,
      ]).toStrictEqual([0, 0])
      expect(onError).toHaveBeenCalledExactlyOnceWith(error)
      expect(phases).toStrictEqual([...savingPhases, 'error'])
    })
  },
)
