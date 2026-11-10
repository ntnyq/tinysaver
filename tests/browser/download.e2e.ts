import { expect, test } from '@playwright/test'
import { APP_ORIGIN, loadPackage, type BrowserWindow } from './package'

test.beforeEach(async ({ page }) => {
  await loadPackage(page)
})

test('downloads a Blob with the requested filename', async ({ page }) => {
  await page.evaluate(() => {
    const browserWindow = window as unknown as BrowserWindow
    document.querySelector('#save')?.addEventListener('click', () => {
      browserWindow.savePromise = browserWindow.tinysaver.saveAsAsync(
        new Blob(['browser content'], { type: 'text/plain' }),
        'browser.txt',
      )
    })
  })

  const downloadPromise = page.waitForEvent('download')
  await page.click('#save')
  const download = await downloadPromise
  await page.evaluate(() => (window as unknown as BrowserWindow).savePromise)

  expect(download.suggestedFilename()).toBe('browser.txt')
})

for (const { filename } of [{}, { filename: 'renamed.csv' }]) {
  test(`downloads a same-origin iframe File with ${filename ?? 'its original name'}`, async ({
    page,
  }) => {
    const isCurrentBlob = await page.evaluate(requestedName => {
      const browserWindow = window as unknown as BrowserWindow
      const iframe = document.createElement('iframe')
      document.body.append(iframe)
      const frameWindow = iframe.contentWindow as Window & typeof globalThis
      const file = new frameWindow.File(['name\nAlice\n'], 'report.csv', {
        type: 'text/csv',
      })
      document.querySelector('#save')?.addEventListener('click', () => {
        browserWindow.savePromise = browserWindow.tinysaver
          .saveAsAsync(file, requestedName)
          .finally(() => iframe.remove())
      })
      return file instanceof Blob
    }, filename)

    expect(isCurrentBlob).toBe(false)
    const downloadPromise = page.waitForEvent('download')
    await page.click('#save')
    const download = await downloadPromise
    await page.evaluate(() => (window as unknown as BrowserWindow).savePromise)

    expect(download.suggestedFilename()).toBe(filename ?? 'report.csv')
    expect(await download.failure()).toBeNull()
  })
}

test('downloads a data URL with the requested filename', async ({ page }) => {
  await page.evaluate(() => {
    const browserWindow = window as unknown as BrowserWindow
    document.querySelector('#save')?.addEventListener('click', () => {
      browserWindow.savePromise = browserWindow.tinysaver.saveAsAsync(
        'data:text/plain;charset=utf-8,hello%20world',
        'data-url.txt',
      )
    })
  })

  const downloadPromise = page.waitForEvent('download')
  await page.click('#save')
  const download = await downloadPromise
  await page.evaluate(() => (window as unknown as BrowserWindow).savePromise)

  expect(download.suggestedFilename()).toBe('data-url.txt')
  expect(await download.failure()).toBeNull()
  expect(page.context().pages()).toHaveLength(1)
})

test('reports canvas cancellation without an uncaught browser error', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))

  const outcome = await page.evaluate(async () => {
    const browserWindow = window as unknown as BrowserWindow
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const controller = new AbortController()
    const errors: string[] = []
    let completed = false

    await new Promise<void>(resolve => {
      browserWindow.tinysaver.saveCanvas(canvas, 'cancelled.png', {
        disableClick: true,
        signal: controller.signal,
        onComplete() {
          completed = true
          resolve()
        },
        onError(error) {
          errors.push(error.name)
          // Let the conversion callback finish before inspecting page errors.
          setTimeout(resolve, 0)
        },
      })
      controller.abort()
    })

    return { completed, errors }
  })

  expect(outcome).toEqual({ completed: false, errors: ['AbortError'] })
  expect(pageErrors).toEqual([])
})

test('preserves the existing file when aborted after the final stream read', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Verifies the native Chromium file writer',
  )

  const outcome = await page.evaluate(async () => {
    const browserWindow = window as unknown as BrowserWindow
    const directory = await navigator.storage.getDirectory()
    const handle = await directory.getFileHandle('abort-at-eof.bin', {
      create: true,
    })
    const initialWriter = await handle.createWritable()
    await initialWriter.write('original')
    await initialWriter.close()

    const controller = new AbortController()
    let pendingClose: Promise<void> | undefined
    let pendingAbort: Promise<void> | undefined
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => ({
        createWritable: async () => {
          const writer = await handle.createWritable()
          return {
            abort(reason?: unknown) {
              pendingAbort = writer.abort(reason)
              return pendingAbort
            },
            close() {
              pendingClose = writer.close()
              return pendingClose
            },
            write: (data: Uint8Array<ArrayBuffer>) => writer.write(data),
          }
        },
      }),
    })

    try {
      const source = new ReadableStream<Uint8Array>(
        {
          start(sourceController) {
            sourceController.enqueue(new TextEncoder().encode('replacement'))
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
      const result = await browserWindow.tinysaverStream
        .saveStream(source, 'abort-at-eof.bin', {
          preferFileSystemAccess: true,
          signal: controller.signal,
        })
        .then(
          () => 'completed',
          (error: unknown) =>
            error instanceof Error ? error.name : String(error),
        )
      await Promise.allSettled([pendingClose, pendingAbort])
      const file = await handle.getFile()
      return {
        closeCalled: Boolean(pendingClose),
        contents: await file.text(),
        result,
      }
    } finally {
      delete window.showSaveFilePicker
      await directory.removeEntry('abort-at-eof.bin')
    }
  })

  expect(outcome).toEqual({
    closeCalled: false,
    contents: 'original',
    result: 'AbortError',
  })
})

for (const source of ['Blob', 'stream'] as const) {
  test(`reports the ${source} commit result when cancelled during close`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Verifies the native Chromium file writer',
    )

    const outcome = await page.evaluate(async sourceKind => {
      const browserWindow = window as unknown as BrowserWindow
      const directory = await navigator.storage.getDirectory()
      const handle = await directory.getFileHandle('abort-during-close.bin', {
        create: true,
      })
      const initialWriter = await handle.createWritable()
      await initialWriter.write('original')
      await initialWriter.close()

      const controller = new AbortController()
      let pendingClose: Promise<void> | undefined
      let pendingAbort: Promise<void> | undefined
      const errors: string[] = []
      const phases: string[] = []
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () => {
            const writer = await handle.createWritable()
            return {
              abort(reason?: unknown) {
                pendingAbort = writer.abort(reason)
                return pendingAbort
              },
              close() {
                pendingClose = writer.close()
                controller.abort()
                return pendingClose
              },
              write: (data: Blob | Uint8Array<ArrayBuffer>) =>
                writer.write(data),
            }
          },
        }),
      })

      try {
        const options = {
          preferFileSystemAccess: true,
          signal: controller.signal,
          onError(error: Error) {
            errors.push(error.name)
          },
          onPhaseChange(phase: string) {
            phases.push(phase)
          },
        }
        const savePromise =
          sourceKind === 'Blob'
            ? browserWindow.tinysaver.saveAsAsync(
                new Blob(['replacement']),
                'abort-during-close.bin',
                options,
              )
            : browserWindow.tinysaverStream.saveStream(
                new Response('replacement'),
                'abort-during-close.bin',
                options,
              )
        const result = await savePromise.then(
          () => 'completed',
          (error: unknown) =>
            error instanceof Error ? error.name : String(error),
        )
        await Promise.allSettled([pendingClose, pendingAbort])
        const file = await handle.getFile()
        return {
          abortCalled: Boolean(pendingAbort),
          contents: await file.text(),
          errors,
          phases,
          result,
        }
      } finally {
        delete window.showSaveFilePicker
        await directory.removeEntry('abort-during-close.bin')
      }
    }, source)

    expect(outcome).toEqual({
      abortCalled: false,
      contents: 'replacement',
      errors: [],
      phases:
        source === 'Blob'
          ? ['saving', 'completed']
          : ['downloading', 'saving', 'completed'],
      result: 'completed',
    })
  })
}

test('keeps a Blob URL alive through a delayed download click', async ({
  page,
}) => {
  await page.evaluate(() => {
    const browserWindow = window as unknown as BrowserWindow
    document.querySelector('#save')?.addEventListener('click', () => {
      browserWindow.savePromise = browserWindow.tinysaver.saveAsAsync(
        new Blob(['delayed content'], { type: 'text/plain' }),
        'delayed.txt',
        { clickDelay: 100, revokeTimeout: 5 },
      )
    })
  })

  const downloadPromise = page.waitForEvent('download')
  await page.click('#save')
  const download = await downloadPromise
  await page.evaluate(() => (window as unknown as BrowserWindow).savePromise)

  expect(download.suggestedFilename()).toBe('delayed.txt')
  expect(await download.failure()).toBeNull()
})

test('opens a Blob in a new tab when requested', async ({ page }) => {
  await page.evaluate(() => {
    const browserWindow = window as unknown as BrowserWindow
    document.querySelector('#save')?.addEventListener('click', () => {
      browserWindow.savePromise = browserWindow.tinysaver.saveAsAsync(
        new Blob(['browser content'], { type: 'text/plain' }),
        'browser.txt',
        { openInNewTab: true },
      )
    })
  })

  const popupPromise = page.waitForEvent('popup')
  await page.click('#save')
  const popup = await popupPromise
  await page.evaluate(() => (window as unknown as BrowserWindow).savePromise)

  expect(popup.url()).toMatch(/^blob:/u)
})

test('downloads a CORS URL without opening a file picker', async ({ page }) => {
  await page.route('https://files.example/**', async route => {
    await route.fulfill({
      body: route.request().method() === 'HEAD' ? '' : 'name\nAlice\n',
      contentType: 'text/csv',
      headers: {
        'access-control-allow-origin': '*',
      },
    })
  })
  await page.evaluate(() => {
    const browserWindow = window as unknown as BrowserWindow
    browserWindow.pickerCalls = 0
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: () => {
        browserWindow.pickerCalls += 1
        return Promise.reject(new Error('Unexpected file picker'))
      },
    })
    document.querySelector('#save')?.addEventListener('click', () => {
      browserWindow.savePromise = browserWindow.tinysaver.saveAsAsync(
        'https://files.example/report.csv',
        'report.csv',
        { preferFileSystemAccess: true },
      )
    })
  })

  const downloadPromise = page.waitForEvent('download')
  await page.click('#save')
  const download = await downloadPromise
  await page.evaluate(() => (window as unknown as BrowserWindow).savePromise)

  expect(download.suggestedFilename()).toBe('report.csv')
  expect(
    await page.evaluate(() => (window as unknown as BrowserWindow).pickerCalls),
  ).toBe(0)
})

test('authenticates both the CORS probe and GET download', async ({ page }) => {
  const requests: Array<{
    method: string
    authorization: string | undefined
  }> = []
  await page.route('https://files.example/**', async route => {
    const request = route.request()
    const method = request.method()
    const headers = await request.allHeaders()
    const authorization = headers['authorization']
    if (method !== 'OPTIONS') {
      requests.push({ method, authorization })
    }
    await route.fulfill({
      status:
        method === 'OPTIONS' || authorization === 'Bearer test-token'
          ? 200
          : 401,
      body: method === 'GET' ? 'protected content' : '',
      contentType: 'text/plain',
      headers: {
        'access-control-allow-origin': APP_ORIGIN,
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'authorization',
        'access-control-allow-methods': 'HEAD, GET, OPTIONS',
      },
    })
  })

  await page.evaluate(async () => {
    const browserWindow = window as unknown as BrowserWindow
    await browserWindow.tinysaver.saveAsAsync(
      'https://files.example/protected.txt',
      'protected.txt',
      {
        disableClick: true,
        revokeTimeout: 0,
        fetchOptions: {
          credentials: 'include',
          headers: { Authorization: 'Bearer test-token' },
        },
      },
    )
  })

  expect(requests).toEqual([
    { method: 'HEAD', authorization: 'Bearer test-token' },
    { method: 'GET', authorization: 'Bearer test-token' },
  ])
})

test('cancels a delayed CORS download after its transfer completes', async ({
  page,
}) => {
  await page.route('https://files.example/**', async route => {
    await route.fulfill({
      body: route.request().method() === 'HEAD' ? '' : 'remote content',
      contentType: 'text/plain',
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  let downloadCount = 0
  page.on('download', () => {
    downloadCount += 1
  })
  const result = await page.evaluate(async () => {
    const browserWindow = window as unknown as BrowserWindow
    const controller = new AbortController()
    return browserWindow.tinysaver
      .saveAsAsync('https://files.example/x.txt', 'x.txt', {
        clickDelay: 100,
        signal: controller.signal,
        timeout: 5_000,
        onPhaseChange(phase) {
          if (phase === 'saving') {
            setTimeout(() => controller.abort(), 5)
          }
        },
      })
      .then(
        () => 'completed',
        (error: unknown) =>
          error instanceof Error ? error.name : String(error),
      )
  })

  expect(result).toBe('AbortError')
  expect(downloadCount).toBe(0)
})
