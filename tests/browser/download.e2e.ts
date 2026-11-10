import { expect, test, type Page } from '@playwright/test'

interface BrowserWindow extends Window {
  pickerCalls: number
  savePromise?: Promise<void>
  tinysaver: typeof import('../../src/index')
}

const APP_ORIGIN = 'https://tinysaver.test'

async function loadPackage(page: Page) {
  await page.route(`${APP_ORIGIN}/**`, async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/') {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <button id="save" type="button">Save</button>
          <script type="module">
            import * as tinysaver from '/dist/index.js'
            window.tinysaver = tinysaver
          </script>
        `,
      })
      return
    }

    const filename = url.pathname.slice('/dist/'.length)
    if (!/^[\w-]+\.js$/u.test(filename)) {
      await route.abort()
      return
    }

    await route.fulfill({
      contentType: 'text/javascript',
      path: decodeURIComponent(
        new URL(`../../dist/${filename}`, import.meta.url).pathname,
      ),
    })
  })

  await page.goto(APP_ORIGIN)
  await page.waitForFunction(() => 'tinysaver' in window)
}

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
