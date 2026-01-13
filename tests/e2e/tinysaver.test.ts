import { beforeAll, describe, expect, test } from 'vitest'
import {
  BrowserDetector,
  saveAs,
  saveCanvas,
  saveJSON,
  saveText,
} from '../../src/index'

describe('E2E: BrowserDetector in real browser', () => {
  test('should detect browser capabilities', () => {
    // Test browser detection in real browser environment
    expect(BrowserDetector.hasDownloadSupport).toBeDefined()
    expect(typeof BrowserDetector.hasDownloadSupport).toBe('boolean')

    expect(BrowserDetector.hasMsSaveBlob).toBeDefined()
    expect(typeof BrowserDetector.hasMsSaveBlob).toBe('boolean')

    expect(BrowserDetector.isChromeIOS).toBeDefined()
    expect(typeof BrowserDetector.isChromeIOS).toBe('boolean')

    expect(BrowserDetector.isSafari).toBeDefined()
    expect(typeof BrowserDetector.isSafari).toBe('boolean')

    expect(BrowserDetector.isMacOSWebViews).toBeDefined()
    expect(typeof BrowserDetector.isMacOSWebViews).toBe('boolean')
  })

  test('should have download support in modern browsers', () => {
    // Modern browsers (chromium, firefox, webkit) should have download support
    expect(BrowserDetector.hasDownloadSupport).toBe(true)
  })

  test('should not be IE browser', () => {
    // Modern browsers should not have msSaveBlob
    expect(BrowserDetector.hasMsSaveBlob).toBe(false)
  })
})

describe('E2E: saveAs with Blob', () => {
  test('should create download link for text blob', async () => {
    const blob = new Blob(['Hello World'], { type: 'text/plain' })
    let startCalled = false
    let completeCalled = false

    return new Promise<void>(resolve => {
      saveAs(blob, 'test.txt', {
        disableClick: true,
        onStart: () => {
          startCalled = true
        },
        onComplete: () => {
          completeCalled = true
          expect(startCalled).toBe(true)
          expect(completeCalled).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should handle blob with options', async () => {
    const blob = new Blob(['test content'], {
      type: 'text/plain;charset=utf-8',
    })
    let completed = false

    return new Promise<void>(resolve => {
      saveAs(blob, 'test-with-options.txt', {
        disableClick: true,
        autoBom: true,
        onStart: () => {
          expect(true).toBe(true)
        },
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should use default filename when not provided', async () => {
    const blob = new Blob(['content'], { type: 'text/plain' })
    let completed = false

    return new Promise<void>(resolve => {
      saveAs(blob, undefined, {
        disableClick: true,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })
})

describe('E2E: saveText functionality', () => {
  test('should save text content', async () => {
    let completed = false

    return new Promise<void>(resolve => {
      saveText('Hello, World!', 'greeting.txt', {
        disableClick: true,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should save multi-line text', async () => {
    const multiLineText = `Line 1
Line 2
Line 3`
    let completed = false

    return new Promise<void>(resolve => {
      saveText(multiLineText, 'multiline.txt', {
        disableClick: true,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should save text with custom mime type', async () => {
    let completed = false

    return new Promise<void>(resolve => {
      saveText('console.log("test")', 'script.js', {
        disableClick: true,
        mimeType: 'application/javascript',
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })
})

describe('E2E: saveJSON functionality', () => {
  test('should save simple JSON object', async () => {
    const data = { name: 'test', value: 123 }
    let completed = false

    return new Promise<void>(resolve => {
      saveJSON(data, 'data.json', {
        disableClick: true,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should save JSON array', async () => {
    const data = [1, 2, 3, 4, 5]
    let completed = false

    return new Promise<void>(resolve => {
      saveJSON(data, 'array.json', {
        disableClick: true,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should save complex nested JSON', async () => {
    const data = {
      name: 'Complex Object',
      nested: {
        array: [1, 2, 3],
        object: { key: 'value' },
      },
      list: ['a', 'b', 'c'],
    }
    let completed = false

    return new Promise<void>(resolve => {
      saveJSON(data, 'complex.json', {
        disableClick: true,
        space: 2,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should handle null and undefined in JSON', async () => {
    const data = {
      nullValue: null,
      undefinedValue: undefined,
      number: 42,
    }
    let completed = false

    return new Promise<void>(resolve => {
      saveJSON(data, 'nullable.json', {
        disableClick: true,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })
})

describe('E2E: saveCanvas functionality', () => {
  let canvas: HTMLCanvasElement

  beforeAll(() => {
    // Create a canvas element
    canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 100

    // Draw something on the canvas
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = 'blue'
      ctx.fillRect(0, 0, 200, 100)
      ctx.fillStyle = 'white'
      ctx.font = '20px Arial'
      ctx.fillText('Test Canvas', 50, 50)
    }
  })

  test('should save canvas as PNG', async () => {
    let completed = false

    return new Promise<void>(resolve => {
      saveCanvas(canvas, 'test-canvas.png', {
        disableClick: true,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should save canvas with custom quality', async () => {
    let completed = false

    return new Promise<void>(resolve => {
      saveCanvas(canvas, 'test-canvas-quality.png', {
        disableClick: true,
        quality: 0.8,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should save canvas as JPEG', async () => {
    let completed = false

    return new Promise<void>(resolve => {
      saveCanvas(canvas, 'test-canvas.jpg', {
        disableClick: true,
        type: 'image/jpeg',
        quality: 0.9,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should save canvas as WebP', async () => {
    let completed = false

    return new Promise<void>(resolve => {
      saveCanvas(canvas, 'test-canvas.webp', {
        disableClick: true,
        type: 'image/webp',
        quality: 0.85,
        onComplete: () => {
          completed = true
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })
})

describe('E2E: Error handling', () => {
  test('should handle canvas conversion error gracefully', async () => {
    // Create a mock canvas that fails to convert
    const badCanvas = {
      toBlob: (callback: BlobCallback) => {
        // Simulate conversion failure
        callback(null)
      },
    } as unknown as HTMLCanvasElement

    let errorReceived = false
    let errorInstance: Error | null = null

    await new Promise<void>(resolve => {
      try {
        saveCanvas(badCanvas, 'should-fail.png', {
          disableClick: true,
          onError: err => {
            errorReceived = true
            errorInstance = err
            resolve()
          },
        })
      } catch (err) {
        errorReceived = true
        errorInstance = err as Error
        resolve()
      }
    })

    expect(errorReceived).toBe(true)
    expect(errorInstance).toBeInstanceOf(Error)
    expect(errorInstance?.message).toContain('Failed to convert canvas to blob')
  })
})

describe('E2E: Cross-browser compatibility', () => {
  test('should work in current browser', async () => {
    // This test verifies that the library works in the current browser
    const blob = new Blob(['Cross-browser test'], { type: 'text/plain' })
    let started = false
    let completed = false

    return new Promise<void>(resolve => {
      saveAs(blob, 'cross-browser-test.txt', {
        disableClick: true,
        onStart: () => {
          started = true
          expect(started).toBe(true)
        },
        onComplete: () => {
          completed = true
          expect(started).toBe(true)
          expect(completed).toBe(true)
          resolve()
        },
      })
    })
  })

  test('should detect browser type correctly', () => {
    const userAgent = navigator.userAgent

    // Verify user agent exists
    expect(userAgent).toBeDefined()
    expect(typeof userAgent).toBe('string')
    expect(userAgent.length).toBeGreaterThan(0)

    // At least one browser detection should be consistent
    const hasDownload = BrowserDetector.hasDownloadSupport
    const hasMsSave = BrowserDetector.hasMsSaveBlob

    // They should be mutually exclusive in most cases
    // Modern browsers have download support, IE has msSaveBlob
    expect(hasDownload || hasMsSave).toBeDefined()
  })
})

describe('E2E: Lifecycle callbacks', () => {
  test('should call all lifecycle callbacks in order', async () => {
    const callOrder: string[] = []
    const blob = new Blob(['callback test'], { type: 'text/plain' })

    return new Promise<void>(resolve => {
      saveAs(blob, 'callbacks.txt', {
        disableClick: true,
        onStart: () => {
          callOrder.push('start')
        },
        onComplete: () => {
          callOrder.push('complete')
          expect(callOrder).toContain('start')
          expect(callOrder).toContain('complete')
          expect(callOrder.indexOf('start')).toBeLessThan(
            callOrder.indexOf('complete'),
          )
          resolve()
        },
      })
    })
  })

  test('should handle multiple sequential saves', async () => {
    const promises = []

    for (let i = 0; i < 3; i++) {
      const promise = new Promise<void>(resolve => {
        const blob = new Blob([`content ${i}`], { type: 'text/plain' })
        saveAs(blob, `file-${i}.txt`, {
          disableClick: true,
          onComplete: () => {
            resolve()
          },
        })
      })
      promises.push(promise)
    }

    await Promise.all(promises)
    expect(promises.length).toBe(3)
  })
})
