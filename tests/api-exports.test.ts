import { describe, expect, it } from 'vitest'
import * as rootApi from '../src'
import { saveAs, saveAsAsync, saveCanvas, saveJSON, saveText } from '../src'
import { saveStream, StreamDownloader } from '../src/stream'

describe('api exports', () => {
  it('should export saveAs function', () => {
    expect(saveAs).toBeInstanceOf(Function)
  })

  it('should export saveAsAsync function', () => {
    expect(saveAsAsync).toBeInstanceOf(Function)
  })

  it('should export saveText function', () => {
    expect(saveText).toBeInstanceOf(Function)
  })

  it('should export saveJSON function', () => {
    expect(saveJSON).toBeInstanceOf(Function)
  })

  it('should export saveCanvas function', () => {
    expect(saveCanvas).toBeInstanceOf(Function)
  })

  it('should keep stream APIs out of the default entry', () => {
    expect(rootApi).not.toHaveProperty('saveStream')
    expect(rootApi).not.toHaveProperty('StreamDownloader')
    expect(rootApi.FileDownloader.prototype).not.toHaveProperty('saveStream')
  })

  it('should export stream APIs from the stream entry', () => {
    expect(saveStream).toBeInstanceOf(Function)
    expect(StreamDownloader).toBeInstanceOf(Function)
  })
})
