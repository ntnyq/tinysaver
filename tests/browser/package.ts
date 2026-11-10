import type { Page } from '@playwright/test'

export interface BrowserWindow extends Window {
  pickerCalls: number
  savePromise?: Promise<void>
  tinysaver: typeof import('../../src/index')
  tinysaverStream: typeof import('../../src/stream')
}

export const APP_ORIGIN = 'https://tinysaver.test'

export async function loadPackage(page: Page) {
  await page.route(`${APP_ORIGIN}/**`, async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/') {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <button id="save" type="button">Save</button>
          <script type="module">
            import * as tinysaver from '/dist/index.js'
            import * as tinysaverStream from '/dist/stream.js'
            window.tinysaver = tinysaver
            window.tinysaverStream = tinysaverStream
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
  await page.waitForFunction(
    () => 'tinysaver' in window && 'tinysaverStream' in window,
  )
}
