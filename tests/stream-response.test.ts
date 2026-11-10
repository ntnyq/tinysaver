import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { afterEach, assert, describe, expect, it, vi } from 'vitest'
import { StreamDownloader } from '../src/stream'

async function withCompressedResponse(
  content: string,
  consume: (response: Response) => Promise<void>,
) {
  const compressed = gzipSync(content)
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-encoding': 'gzip',
      'content-length': compressed.byteLength,
      'content-type': 'text/plain',
    })
    response.end(compressed)
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const address = server.address()
    assert(address && typeof address !== 'string')
    await consume(await fetch(`http://127.0.0.1:${address.port}/export`))
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()))
    })
  }
}

describe('stream response lengths', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['hello', 'x'.repeat(1024)])(
    'saves decoded gzip content within its actual byte limit (case %#)',
    async content => {
      const onProgress = vi.fn()
      const createObjectURL = vi.spyOn(URL, 'createObjectURL')

      await withCompressedResponse(content, async response => {
        await new StreamDownloader().saveStream(response, 'decoded.txt', {
          disableClick: true,
          maxBufferBytes: content.length,
          onProgress,
          revokeTimeout: 0,
        })
      })

      const blob = createObjectURL.mock.calls[0]?.[0]
      assert(blob instanceof Blob)
      await expect(blob.text()).resolves.toBe(content)
      expect(onProgress).toHaveBeenLastCalledWith(content.length, 0)
    },
  )

  it('enforces the decoded byte limit even when the compressed length fits', async () => {
    const onError = vi.fn()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')

    await withCompressedResponse('x'.repeat(1024), async response => {
      await expect(
        new StreamDownloader().saveStream(response, 'too-large.txt', {
          disableClick: true,
          maxBufferBytes: 100,
          onError,
        }),
      ).rejects.toThrow('Stream exceeds maximum buffered size of 100 bytes')
    })

    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(RangeError))
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('treats a CORS response with an unexposed content encoding as unknown length', async () => {
    const response = new Response('hello', {
      headers: { 'content-length': '25' },
    })
    vi.spyOn(response, 'type', 'get').mockReturnValue('cors')
    const onProgress = vi.fn()

    await new StreamDownloader().saveStream(response, 'cors.txt', {
      disableClick: true,
      maxBufferBytes: 5,
      onProgress,
      revokeTimeout: 0,
    })

    expect(onProgress).toHaveBeenLastCalledWith(5, 0)
  })

  it('uses an explicitly exposed identity encoding for CORS progress', async () => {
    const response = new Response('hello', {
      headers: { 'content-encoding': 'identity', 'content-length': '5' },
    })
    vi.spyOn(response, 'type', 'get').mockReturnValue('cors')
    const onProgress = vi.fn()

    await new StreamDownloader().saveStream(response, 'identity.txt', {
      disableClick: true,
      maxBufferBytes: 5,
      onProgress,
      revokeTimeout: 0,
    })

    expect(onProgress).toHaveBeenLastCalledWith(5, 5)
  })
})
