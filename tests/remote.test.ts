import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadWithProgress } from '../src/downloader/remote'

class MockRequest {
  onabort: (() => void) | null = null
  onerror: (() => void) | null = null
  onload: (() => void) | null = null
  onprogress: ((event: ProgressEvent) => void) | null = null
  response = new Blob(['remote content'])
  responseType = ''
  status = 200
  statusText = 'response status'
  withCredentials = false
  setRequestHeader = vi.fn()

  abort() {
    this.onabort?.()
  }

  open() {}
  send() {}
}

function createRequest(status = 200) {
  const request = new MockRequest()
  request.status = status
  function createXMLHttpRequest() {
    return request
  }
  vi.stubGlobal('XMLHttpRequest', createXMLHttpRequest)
  return request
}

describe('remote transfer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each<{ kind: string; headers: HeadersInit }>([
    { kind: 'record', headers: { Authorization: 'Bearer test-token' } },
    { kind: 'tuples', headers: [['Authorization', 'Bearer test-token']] },
    {
      kind: 'Headers',
      headers: new Headers({ Authorization: 'Bearer test-token' }),
    },
  ])(
    'should forward $kind headers to the GET download',
    async ({ headers }) => {
      const request = createRequest()
      const result = downloadWithProgress(
        'https://files.example/export',
        'export.bin',
        { fetchOptions: { headers } },
        vi.fn(),
      )

      request.onload?.()
      await result

      expect(request.setRequestHeader).toHaveBeenCalledExactlyOnceWith(
        'authorization',
        'Bearer test-token',
      )
    },
  )

  it.each(['omit', 'same-origin', 'include'] as const)(
    'should enable cross-origin credentials only for credentials=%s',
    async credentials => {
      const request = createRequest()
      const result = downloadWithProgress(
        'https://files.example/export',
        'export.bin',
        { fetchOptions: { credentials } },
        vi.fn(),
      )

      request.onload?.()
      await result

      expect(request.withCredentials).toBe(credentials === 'include')
    },
  )

  it.each([200, 201, 204, 206, 299])(
    'should save a Blob returned with HTTP %s',
    async status => {
      const request = createRequest(status)
      const saveBlob = vi.fn()
      const options = {}
      const result = downloadWithProgress(
        'https://files.example/export',
        'export.bin',
        options,
        saveBlob,
      )

      request.onload?.()
      await result

      expect(saveBlob).toHaveBeenCalledExactlyOnceWith(
        request.response,
        'export.bin',
        options,
      )
    },
  )

  it.each([199, 300, 304, 404, 500])(
    'should reject HTTP %s without saving its response',
    async status => {
      const request = createRequest(status)
      const saveBlob = vi.fn()
      const result = downloadWithProgress(
        'https://files.example/export',
        'export.bin',
        {},
        saveBlob,
      )

      request.onload?.()

      await expect(result).rejects.toThrow('Failed to download')
      expect(saveBlob).not.toHaveBeenCalled()
    },
  )

  it.each([
    { lengthComputable: true, total: 10 },
    { lengthComputable: false, total: 0 },
  ])(
    'should report received bytes with lengthComputable=$lengthComputable',
    async ({ lengthComputable, total }) => {
      const request = createRequest()
      const onProgress = vi.fn()
      const result = downloadWithProgress(
        'https://files.example/export',
        'export.bin',
        { onProgress },
        vi.fn(),
      )

      request.onprogress?.(
        new ProgressEvent('progress', {
          lengthComputable,
          loaded: 3,
          total,
        }),
      )
      request.onload?.()
      await result

      expect(onProgress).toHaveBeenCalledExactlyOnceWith(3, total)
    },
  )
})
