import { describe, expect, it } from 'vitest'
import {
  saveAs,
  saveAsAsync,
  saveCanvas,
  saveJSON,
  saveStream,
  saveText,
} from '../src/index'

describe('aPI exports', () => {
  it('should export saveAs function', () => {
    expect.hasAssertions()
    expect(saveAs).toBeInstanceOf(Function)
  })

  it('should export saveAsAsync function', () => {
    expect.hasAssertions()
    expect(saveAsAsync).toBeInstanceOf(Function)
  })

  it('should export saveText function', () => {
    expect.hasAssertions()
    expect(saveText).toBeInstanceOf(Function)
  })

  it('should export saveJSON function', () => {
    expect.hasAssertions()
    expect(saveJSON).toBeInstanceOf(Function)
  })

  it('should export saveCanvas function', () => {
    expect.hasAssertions()
    expect(saveCanvas).toBeInstanceOf(Function)
  })

  it('should export saveStream function', () => {
    expect.hasAssertions()
    expect(saveStream).toBeInstanceOf(Function)
  })
})
