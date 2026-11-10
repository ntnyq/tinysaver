import { afterEach, assert, describe, expect, it, vi } from 'vitest'
import { StreamDownloader } from '../src/stream'

describe('stream fallback buffering', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    { emptyChunks: 20_000, dataBytes: 1 },
    { emptyChunks: 0, dataBytes: 131_077 },
    { emptyChunks: 20_000, dataBytes: 0 },
  ])(
    'bounds retained storage for $emptyChunks empty chunks and $dataBytes one-byte chunks',
    async ({ emptyChunks, dataBytes }) => {
      const NativeBlob = Blob
      let retainedParts = 0
      let retainedCapacity = 0
      vi.stubGlobal(
        'Blob',
        class extends NativeBlob {
          constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
            super(parts, options)
            retainedParts = parts.length
            retainedCapacity = parts
              .filter((part): part is ArrayBufferView<ArrayBuffer> =>
                ArrayBuffer.isView(part),
              )
              .reduce((total, part) => total + part.buffer.byteLength, 0)
          }
        },
      )
      let savedBlob: Blob | undefined
      vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
        assert(blob instanceof Blob)
        savedBlob = blob
        return 'blob:bounded-buffer'
      })
      async function* generate(): AsyncGenerator<Uint8Array> {
        for (let index = 0; index < emptyChunks; index += 1) {
          yield new Uint8Array(0)
        }
        const byte = new Uint8Array(1)
        for (let index = 0; index < dataBytes; index += 1) {
          byte[0] = index % 256
          yield byte
        }
      }
      const maxBufferBytes = Math.max(1, dataBytes)

      await new StreamDownloader().saveStream(generate(), 'buffer.bin', {
        disableClick: true,
        maxBufferBytes,
        revokeTimeout: 0,
      })

      assert(savedBlob)
      expect(savedBlob.size).toBe(dataBytes)
      expect(retainedParts).toBeLessThanOrEqual(Math.ceil(dataBytes / 1024))
      expect(retainedCapacity).toBeLessThanOrEqual(maxBufferBytes)
      const bytes = new Uint8Array(await savedBlob.arrayBuffer())
      expect([...bytes]).toStrictEqual(
        Array.from({ length: dataBytes }, (_, index) => index % 256),
      )
    },
  )

  it('cancels when a chunk exceeds the remaining capacity of a partial block', async () => {
    const cancel = vi.fn()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3, 4]))
      },
      cancel,
    })

    await expect(
      new StreamDownloader().saveStream(stream, 'overflow.bin', {
        disableClick: true,
        maxBufferBytes: 3,
      }),
    ).rejects.toThrow('Stream exceeds maximum buffered size of 3 bytes')

    expect(cancel).toHaveBeenCalledExactlyOnceWith(expect.any(RangeError))
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(stream.locked).toBe(false)
  })
})
