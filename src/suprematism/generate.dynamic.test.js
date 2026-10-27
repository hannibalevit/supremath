import { describe, it, expect } from 'vitest'
import { VIEWPORTS, runBatch, seedCount } from './testUtils.js'

const SEEDS = seedCount(500)

describe.each(VIEWPORTS)('dynamic compositions at $name', ({ width, height }) => {
  // both tests read the same batch, so it is generated once
  let cached
  const batch = () => (cached ??= runBatch({ width, height, mode: 'dynamic', seeds: SEEDS }))

  it(`all ${SEEDS} seeds satisfy every law`, () => {
    expect(batch().failures.slice(0, 5), 'first violations (seed, codes)').toEqual([])
  })

  // The fallback chain must not hide a weak generator: with a real rng the
  // first tier should do the work almost every time.
  it('is accepted on the first tier, in a handful of attempts', () => {
    const r = batch()
    expect(r.tier0 / r.total).toBeGreaterThanOrEqual(0.99)
    expect(r.fallbacks.conservative / r.total).toBeLessThanOrEqual(0.005)
    expect(r.fallbacks.minimal).toBe(0)
    // about 1.8 on every window size we test (at most about 2); this only guards
    // the cost, the 60-attempt tier is the real ceiling
    expect(r.attempts / r.total).toBeLessThanOrEqual(3)
  })
})
