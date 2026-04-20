import { describe, expect, it, vi } from 'vitest'
import { FileDownloader } from '../src/downloader'

describe('promise API', () => {
  it('saveAsAsync should reject with async remote errors', async () => {
    expect.hasAssertions()
    const downloader = new FileDownloader()

    vi.spyOn(downloader as any, 'checkCors').mockResolvedValue(true)
    vi.spyOn(downloader as any, 'downloadWithProgress').mockRejectedValue(
      new Error('remote failed'),
    )

    await expect(
      downloader.saveAsync('https://example.com/fail.txt', 'fail.txt', {
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow('remote failed')
  })
})
