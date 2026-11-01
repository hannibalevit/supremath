import { describe, it, expect, vi, afterEach } from 'vitest'
import { track } from './analytics.js'

afterEach(() => vi.unstubAllGlobals())

describe('track', () => {
  it('sends the event, with its data, to Umami', () => {
    const umami = { track: vi.fn() }
    vi.stubGlobal('umami', umami)
    track('download', { format: 'png' })
    track('regenerate')
    expect(umami.track).toHaveBeenNthCalledWith(1, 'download', { format: 'png' })
    expect(umami.track).toHaveBeenNthCalledWith(2, 'regenerate', undefined)
  })

  it('does nothing where Umami is not loaded', () => {
    expect(() => track('regenerate')).not.toThrow()
  })

  it('does not throw when Umami does', () => {
    vi.stubGlobal('umami', { track: () => { throw new Error('blocked') } })
    expect(() => track('regenerate')).not.toThrow()
  })
})
