import { describe, expect, it } from 'vitest'
import {
  saveAs,
  saveAsAsync,
  saveCanvas,
  saveJSON,
  saveStream,
  saveText,
} from '../src'

describe('aPI exports', () => {
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

  it('should export saveStream function', () => {
    expect(saveStream).toBeInstanceOf(Function)
  })
})
