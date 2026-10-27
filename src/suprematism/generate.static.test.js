import { describe, it, expect } from 'vitest'
import { VIEWPORTS, runBatch, seedCount } from './testUtils.js'

const SEEDS = seedCount(500)

describe.each(VIEWPORTS)('static compositions at $name', ({ width, height }) => {
  it(`all ${SEEDS} seeds satisfy every law, without needing a fallback`, () => {
    const r = runBatch({ width, height, mode: 'static', seeds: SEEDS })
    expect(r.failures.slice(0, 5), 'first violations (seed, codes)').toEqual([])
    expect(r.tier0 / r.total).toBeGreaterThanOrEqual(0.99)
    expect(r.fallbacks.minimal).toBe(0)
    expect(r.attempts / r.total).toBeLessThanOrEqual(3)
  })
})
