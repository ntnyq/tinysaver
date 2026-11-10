# 💾 tinysaver

[![CI](https://github.com/ntnyq/tinysaver/workflows/CI/badge.svg)](https://github.com/ntnyq/tinysaver/actions)
[![NPM VERSION](https://img.shields.io/npm/v/tinysaver.svg)](https://www.npmjs.com/package/tinysaver)
[![NPM DOWNLOADS](https://img.shields.io/npm/dy/tinysaver.svg)](https://www.npmjs.com/package/tinysaver)
[![LICENSE](https://img.shields.io/github/license/ntnyq/tinysaver.svg)](https://github.com/ntnyq/tinysaver/blob/main/LICENSE)

Modern replacement of file-saver.js.

## 📦 Install

```shell
npm install tinysaver
```

```shell
yarn add tinysaver
```

```shell
pnpm add tinysaver
```

## 🚀 Usage

### ✨ Basic Usage

```ts
import { saveAs, saveAsAsync, saveText, saveJSON, saveCanvas } from 'tinysaver'
import { saveStream } from 'tinysaver/stream'

// Save a Blob
saveAs(new Blob(['hello world'], { type: 'text/plain' }), 'hello-world.txt')

// Save text content
saveText('Hello World', 'greeting.txt')

// Save JSON data
saveJSON({ name: 'John', age: 30 }, 'data.json', { space: 2 })

// Save canvas as image
const canvas = document.querySelector('canvas')
saveCanvas(canvas, 'image.png', { quality: 0.95 })

// Promise-based save
await saveAsAsync(new Blob(['hello async']), 'async.txt')

// Save from stream/response
const response = await fetch('/api/export')
await saveStream(response, 'export.bin')
```

### 🌊 Stream Entry

Stream support is published from a separate entry so applications that only
use Blob, URL, text, JSON, or canvas downloads do not bundle the stream
implementation.

```ts
import {
  saveStream,
  StreamDownloader,
  type DownloadStreamSource,
  type SaveStreamOptions,
} from 'tinysaver/stream'

await saveStream(await fetch('/api/export'), 'export.bin')

const downloader = new StreamDownloader()
await downloader.saveStream(source, 'export.bin', options)
```

<details>
<summary>Migrating stream imports and class usage</summary>

`saveStream` is not exported from `tinysaver`, and `FileDownloader` no longer
has a `saveStream` method. Migrate root imports and class usage as follows:

```ts
// Before
import { FileDownloader, saveStream } from 'tinysaver'
// After
import { saveStream, StreamDownloader } from 'tinysaver/stream'
```

</details>

### ⚙️ With Options

```ts
import { saveAs } from 'tinysaver'

const abortController = new AbortController()

saveAs(
  new Blob(['hello world'], { type: 'text/plain;charset=utf-8' }),
  'hello-world.txt',
  {
    autoBom: true, // Add UTF-8 BOM for text files
    clickDelay: 100, // Delay before triggering download
    openInNewTab: false, // Open in new tab instead of downloading
    disableClick: false, // Disable automatic click simulation
    onStart() {
      console.log('Download started')
    },
    onComplete() {
      console.log('Save workflow completed')
    },
    onError(err) {
      console.error('Download failed', err)
    },
    onProgress(loaded, total) {
      console.log(`${loaded}/${total}`) // total is 0 when size is unknown
    },
    timeout: 10_000, // Applies to remote URL and stream workflows
    signal: abortController.signal, // Manual cancellation
    fetchOptions: { credentials: 'include' }, // For CORS probing and GET download
    preferFileSystemAccess: true, // Use showSaveFilePicker for Blob/stream sources
    onPhaseChange(phase) {
      console.log(phase) // probing/downloading/saving/completed/error/aborted
    },
  },
)
```

<details>
<summary>Remote request options and timeout scope</summary>

For cross-origin URL downloads, `fetchOptions.headers` and
`fetchOptions.credentials: 'include'` apply to both the HEAD probe and the GET
transfer. Other fetch options only affect the probe. If CORS is unavailable,
the browser navigation fallback cannot apply custom headers.

`timeout` covers remote URL and stream workflows, including delayed download
clicks and, for streams, file target creation and writes. It does not apply to
direct Blob, text, JSON, or canvas saves; use `signal` to cancel those workflows.
An in-progress File System Access commit is allowed to settle, as described below.

</details>

### 👏 Callbacks

All download methods support lifecycle callbacks:

```ts
saveText('content', 'file.txt', {
  onStart() {
    // Called when download process starts
  },
  onProgress(loaded, total) {
    // Called during download progress
    console.log(`Downloaded ${loaded}/${total} bytes`)
  },
  onComplete() {
    // Browser download triggered, or File System Access writer closed
  },
  onError(error) {
    // Called when download fails
    console.error(error)
  },
})
```

`onProgress` runs during cross-origin URL transfers and stream consumption.
Direct Blob, text, JSON, and canvas saves do not emit byte progress. Handle a
total of `0` as unknown size rather than calculating a percentage from it.

### Completion Semantics

`onComplete`, the `completed` phase, and fulfillment of `saveAsAsync`,
`FileDownloader.saveAsync`, or `saveStream` describe completion of tinysaver's
workflow. For browser downloads, this means the click was dispatched, without
confirming a file was written to disk. File System Access completes after the
writer closes.

<details>
<summary>Completion boundaries and cancellation</summary>

- **Browser download (`<a download>`):** the download click has been dispatched.
  This does not confirm that the browser accepted the download or that the file
  was fully downloaded or written to disk. Later cancellation or failure in the
  browser's download manager cannot be observed through these callbacks or
  promises. Stream fallback follows this contract after buffering the source
  into a Blob.
- **File System Access:** all writes and the writable stream's `close()` have
  fulfilled. This confirms completion of the browser API's write workflow,
  without guaranteeing a physical disk flush. Cancellation is checked before
  `close()` starts. Once closing starts, neither an abort signal nor a timeout
  interrupts the commit; the workflow waits for its actual success or failure.

In anchor workflows, `openInNewTab` or the remote URL fallback means completion
after dispatching a navigation click; a download is not guaranteed. With
`disableClick`, the anchor workflow completes without dispatching a click.
These options do not change File System Access writes or their completion
boundary.

</details>

<details>
<summary>Callback exceptions and canvas errors</summary>

Exceptions from `onStart`, `onProgress`, or a nonterminal `onPhaseChange` stop
the active workflow and are reported through `onError`. If the
`onPhaseChange('completed')` observer throws, that error is also reported, but
the transport has already completed and the save cannot be undone. Error
notifications are best-effort: if an error observer also throws, the original
failure is preserved.

For promise-based saves (`saveAsAsync`, `FileDownloader.saveAsync`, and
`saveStream`), a throwing `onComplete` callback rejects the promise after the
save workflow has completed, without changing the `completed` phase or calling
`onError`. Callback-based saves report a throwing `onComplete` through the error
lifecycle instead; this also cannot undo a completed save.

`saveCanvas` reports failures after asynchronous conversion through `onError`;
synchronous conversion errors are also reported and rethrown to the caller.

</details>

## 🌐 Browser Support

tinysaver targets the following browser versions and newer:

- Chrome 87
- Edge 88
- Firefox 78
- Safari 14

Internet Explorer is not supported.

## 📚 API

### 💾 `saveAs(blob, filename?, options?)`

Save any Blob or URL as a file. Compatible with FileSaver.js `saveAs` API.

### ⏳ `saveAsAsync(blob, filename?, options?)`

Promise-based version of `saveAs`, suitable for async workflows and explicit error handling.

Promise fulfillment follows [Completion Semantics](#completion-semantics);
browser downloads resolve after dispatching the download click, without waiting
for the file to be written to disk.

**Parameters:**

- `blob` - Blob object or URL string
- `filename` - Name of the file to save (optional)
- `options` - Download options (optional)

### 📝 `saveText(text, filename, options?)`

Save text content as a file.

**Parameters:**

- `text` - Text content to save
- `filename` - Name of the text file
- `options` - Download options with optional `mimeType` property

### 📄 `saveJSON(data, filename, options?)`

Save JSON data as a file.

**Parameters:**

- `data` - JavaScript object or value to save
- `filename` - Name of the JSON file
- `options` - Download options with optional `space` property for formatting

### 🎨 `saveCanvas(canvas, filename, options?)`

Save HTML canvas as an image file.

**Parameters:**

- `canvas` - HTMLCanvasElement to save
- `filename` - Name of the image file
- `options` - Download options with optional `type` and `quality` properties

### 🌊 `saveStream(source, filename, options?)`

Save stream data (`ReadableStream`, `Response`, `AsyncIterable`) as a file.
Import it from `tinysaver/stream`. The Blob fallback buffer is limited to
256 MiB by default.

<details>
<summary>Saving, cancellation, and completion</summary>

When `preferFileSystemAccess` is enabled and supported, chunks are written
directly to the selected file. Other browsers materialize the stream as a
browser-managed `Blob` before starting the download. Abort signals and timeouts
cancel the active stream and propagate cancellation to its source.
Rejection does not wait for source cancellation or writer cleanup to finish.

The returned promise follows [Completion Semantics](#completion-semantics): it
resolves after the File System Access writer closes, or after the buffered Blob's
download click is dispatched when using the browser download fallback.

URL sources always use the browser download transport. File pickers require a
transient user gesture and therefore cannot be opened after an asynchronous URL
probe or transfer.

</details>

<details>
<summary>Buffer limits, progress, and scheduling</summary>

The Blob fallback buffer limit protects the browser from unbounded memory
growth. Set `maxBufferBytes` to a positive byte limit when another bound is
appropriate for the application.

Stream progress and buffer limits count decoded bytes. Progress reports a total
of `0` for encoded responses and CORS responses that do not expose
`Content-Encoding`, because `Content-Length` may describe compressed content.
Continuously ready sources periodically yield to browser tasks so timeouts,
cancellation, and rendering can run while they are consumed.

</details>

## ✅ Testing

The library includes comprehensive unit tests covering:

- 📥 FileDownloader core functionality and error handling
- 🏷️ BOM (Byte Order Mark) insertion for text files
- 📝 Default filename handling
- 💾 saveText, saveJSON, and saveCanvas implementations
- ⚠️ Canvas conversion error handling
- 🔔 Callback invocation during download lifecycle
- ⏱️ Timeout/abort behavior and phase callbacks
- 🌊 Stream-based save flow
- 📂 File System Access API preferred path

### Compatibility Matrix

- Unit tests run in `jsdom` for deterministic behavior.
- Browser tests run in Chromium, Firefox, and WebKit through Playwright.
- Production builds target Chrome 87, Edge 88, Firefox 78, and Safari 14.
- Downloads use the standard anchor `download` attribute and `URL` API.
- IE-only and pre-modern browser fallbacks are intentionally excluded.

Run tests with:

```bash
pnpm test
pnpm test:browser
```

## 🧪 Playground

The Vue playground contains interactive examples for saving text, JSON,
canvas artwork, and generated streams directly in the browser.

```bash
pnpm playground
```

Run `pnpm playground:build` to verify its production bundle.

## 🙏 Credits

- [eligrey/FileSaver.js](https://github.com/eligrey/FileSaver.js)

## 📄 License

[MIT](./LICENSE) License © 2025-PRESENT [ntnyq](https://github.com/ntnyq)
