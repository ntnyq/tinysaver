/**
 * Browser detection utilities
 */
export class BrowserDetector {
  private static getUserAgent(): string {
    return typeof navigator === 'undefined' ? '' : navigator.userAgent
  }

  static get isMacOSWebViews(): boolean {
    const userAgent = this.getUserAgent()
    return (
      /Macintosh/.test(userAgent)
      && /AppleWebKit/.test(userAgent)
      && !/Safari/.test(userAgent)
    )
  }

  static get isSafari(): boolean {
    if (typeof window !== 'undefined') {
      // More reliable Safari detection
      const hasSafariInWindow = 'safari' in window
      const vendorCheck = /Apple/.test(navigator.vendor)
      const userAgentCheck =
        /Safari/.test(navigator.userAgent)
        && !/Chrome/.test(navigator.userAgent)
      return hasSafariInWindow || (vendorCheck && userAgentCheck)
    }
    return false
  }

  static get isChromeIOS(): boolean {
    return /CriOS\/\d+/.test(this.getUserAgent())
  }

  static get hasDownloadSupport(): boolean {
    return (
      typeof HTMLAnchorElement !== 'undefined'
      && 'download' in HTMLAnchorElement.prototype
      && !this.isMacOSWebViews
    )
  }

  static get hasMsSaveBlob(): boolean {
    return typeof navigator !== 'undefined' && 'msSaveOrOpenBlob' in navigator
  }

  // Keep instance methods for backward compatibility
  get isMacOSWebViews(): boolean {
    return BrowserDetector.isMacOSWebViews
  }

  get isSafari(): boolean {
    return BrowserDetector.isSafari
  }

  get isChromeIOS(): boolean {
    return BrowserDetector.isChromeIOS
  }

  get hasDownloadSupport(): boolean {
    return BrowserDetector.hasDownloadSupport
  }

  get hasMsSaveBlob(): boolean {
    return BrowserDetector.hasMsSaveBlob
  }
}
