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
import {
  saveAs,
  saveAsAsync,
  saveText,
  saveJSON,
  saveCanvas,
  saveStream,
} from 'tinysaver'

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

### ⚙️ With Options

```ts
import { saveAs } from 'tinysaver'

saveAs(new Blob(['hello world'], { type: 'text/plain' }), 'hello-world.txt', {
  autoBom: true, // Add UTF-8 BOM for text files
  clickDelay: 100, // Delay before triggering download
  openInNewTab: false, // Open in new tab instead of downloading
  disableClick: false, // Disable automatic click simulation
  onStart() {
    console.log('Download started')
  },
  onComplete() {
    console.log('Download completed')
  },
  onError(err) {
    console.error('Download failed', err)
  },
  onProgress(loaded, total) {
    console.log(`${loaded}/${total}`)
  },
  timeout: 10_000, // Abort automatically after 10s
  signal: abortController.signal, // Manual cancellation
  fetchOptions: { credentials: 'include' }, // For CORS probing request
  preferFileSystemAccess: true, // Use showSaveFilePicker when supported
  onPhaseChange(phase) {
    console.log(phase) // probing/downloading/saving/completed/error/aborted
  },
})
```

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
    // Called when download completes
  },
  onError(error) {
    // Called when download fails
    console.error(error)
  },
})
```

## 🌐 Browser Support

tinysaver supports all modern browsers with automatic fallback for older versions:

- ✅ Chrome/Edge (all versions with download attribute support)
- ✅ Firefox (all versions)
- ✅ Safari (all versions, including iOS)
- ✅ Opera (all versions)
- ⚠️ IE (fallback via msSaveOrOpenBlob)

## 📚 API

### 💾 `saveAs(blob, filename?, options?)`

Save any Blob or URL as a file. Compatible with FileSaver.js `saveAs` API.

### ⏳ `saveAsAsync(blob, filename?, options?)`

Promise-based version of `saveAs`, suitable for async workflows and explicit error handling.

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

## ✅ Testing

The library includes comprehensive unit tests covering:

- 🔍 BrowserDetector static and instance methods
- 📥 FileDownloader core functionality and error handling
- 🏷️ BOM (Byte Order Mark) insertion for text files
- 📝 Default filename handling
- 💾 saveText, saveJSON, and saveCanvas implementations
- ⚠️ Canvas conversion error handling
- 🔔 Callback invocation during download lifecycle
- ⏱️ Timeout/abort behavior and phase callbacks
- 🌊 Stream-based save flow
- 📂 File System Access API preferred path

### Compatibility Matrix Plan

- Unit tests run in `jsdom` for deterministic behavior.
- Runtime fallback matrix is covered by branches for download attribute, `msSaveOrOpenBlob`, and `FileReader`.
- Recommended release validation targets:
  - Desktop: latest Chrome, Firefox, Safari
  - Mobile: iOS Safari / Chrome iOS WebView
  - Legacy fallback: environments exposing `msSaveOrOpenBlob`

Run tests with:

```bash
pnpm test
```

## 🙏 Credits

- [eligrey/FileSaver.js](https://github.com/eligrey/FileSaver.js)

## 📄 License

[MIT](./LICENSE) License © 2025-PRESENT [ntnyq](https://github.com/ntnyq)
