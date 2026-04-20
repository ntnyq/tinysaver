import { describe, expect, it } from 'vitest'
import { BrowserDetector } from '../src/detector'

describe('browserDetector class', () => {
  it('should have static methods', () => {
    expect.hasAssertions()
    expect(BrowserDetector.hasDownloadSupport).toBeDefined()
    expect(BrowserDetector.hasMsSaveBlob).toBeDefined()
    expect(BrowserDetector.isChromeIOS).toBeDefined()
    expect(BrowserDetector.isSafari).toBeDefined()
    expect(BrowserDetector.isMacOSWebViews).toBeDefined()
  })

  it('should work with instance methods for backward compatibility', () => {
    expect.hasAssertions()
    const detector = new BrowserDetector()
    expect(detector.hasDownloadSupport).toBe(BrowserDetector.hasDownloadSupport)
    expect(detector.hasMsSaveBlob).toBe(BrowserDetector.hasMsSaveBlob)
  })
})
