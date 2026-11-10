import { expect, test } from '@playwright/test'
import { loadPackage, type BrowserWindow } from './package'

test.beforeEach(async ({ page }) => {
  await loadPackage(page)
})

for (const cancellation of ['abort', 'timeout'] as const) {
  test(`honors ${cancellation} while an iterator keeps yielding ready chunks`, async ({
    page,
  }) => {
    const outcome = await page.evaluate(async mode => {
      const browserWindow = window as unknown as BrowserWindow
      let produced = 0
      let cancelled = false
      let completed = false
      const errors: string[] = []
      const controller = new AbortController()
      async function* generate(): AsyncGenerator<Uint8Array> {
        try {
          while (produced < 200_000) {
            produced += 1
            yield new Uint8Array(0)
          }
        } finally {
          cancelled = true
        }
      }
      const timer =
        mode === 'abort' ? setTimeout(() => controller.abort(), 0) : null
      try {
        const result = await browserWindow.tinysaverStream
          .saveStream(generate(), 'ready.bin', {
            disableClick: true,
            signal: controller.signal,
            timeout: mode === 'timeout' ? 1 : 0,
            onComplete() {
              completed = true
            },
            onError(error) {
              errors.push(error.name)
            },
          })
          .then(
            () => 'completed',
            (error: unknown) =>
              error instanceof Error ? error.name : String(error),
          )
        return { cancelled, completed, errors, produced, result }
      } finally {
        if (timer !== null) {
          clearTimeout(timer)
        }
      }
    }, cancellation)

    expect(outcome.produced).toBeLessThan(200_000)
    expect(outcome).toMatchObject({
      cancelled: true,
      completed: false,
      errors: ['AbortError'],
      result: 'AbortError',
    })
  })
}

test('saves a Response from a same-origin iframe with its metadata', async ({
  page,
}) => {
  const outcome = await page.evaluate(async () => {
    const browserWindow = window as unknown as BrowserWindow
    const iframe = document.createElement('iframe')
    document.body.append(iframe)
    const frameWindow = iframe.contentWindow as Window & typeof globalThis
    const response = new frameWindow.Response('frame content', {
      headers: {
        'content-type': 'text/plain;charset=utf-8',
        'content-length': '13',
      },
    })
    const createObjectURL = URL.createObjectURL
    let savedBlob: Blob | undefined
    const progress: number[][] = []
    URL.createObjectURL = blob => {
      if (blob instanceof Blob) {
        savedBlob = blob
      }
      return createObjectURL(blob)
    }

    try {
      await browserWindow.tinysaverStream.saveStream(response, 'frame.txt', {
        disableClick: true,
        revokeTimeout: 0,
        onProgress: (loaded, total) => progress.push([loaded, total]),
      })
      return {
        isCurrentResponse: response instanceof Response,
        mimeType: savedBlob?.type,
        text: await savedBlob?.text(),
        progress,
      }
    } finally {
      URL.createObjectURL = createObjectURL
      iframe.remove()
    }
  })

  expect(outcome).toEqual({
    isCurrentResponse: false,
    mimeType: 'text/plain;charset=utf-8',
    text: 'frame content',
    progress: [[13, 13]],
  })
})

test('reports an iframe Response without a body through the error lifecycle', async ({
  page,
}) => {
  const outcome = await page.evaluate(async () => {
    const browserWindow = window as unknown as BrowserWindow
    const iframe = document.createElement('iframe')
    document.body.append(iframe)
    const frameWindow = iframe.contentWindow as Window & typeof globalThis
    const errors: string[] = []
    const phases: string[] = []

    try {
      const result = await browserWindow.tinysaverStream
        .saveStream(new frameWindow.Response(null), 'empty.bin', {
          onError: error => errors.push(error.message),
          onPhaseChange: phase => phases.push(phase),
        })
        .then(
          () => 'completed',
          (error: unknown) =>
            error instanceof Error ? error.message : String(error),
        )
      return { result, errors, phases }
    } finally {
      iframe.remove()
    }
  })

  expect(outcome).toEqual({
    result: 'Response body is not readable',
    errors: ['Response body is not readable'],
    phases: ['error'],
  })
})
