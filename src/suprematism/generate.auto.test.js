import { describe, it, expect } from 'vitest'
import { generateComposition } from './generate.js'
import { validateComposition } from './validate.js'
import { createRng } from './random.js'
import { shapeGeom, geomOverlapArea } from './geometry.js'
import { PALETTES } from './palettes.js'
import { VIEWPORTS, runBatch, seedCount } from './testUtils.js'

const SEEDS = seedCount(500)
const HD = { width: 1920, height: 1080 }
const make = (seed, extra = {}) => generateComposition({ ...HD, rng: createRng(seed), ...extra })
const hasOverlap = (shapes) => {
  const g = shapes.map(shapeGeom)
  return g.some((a, i) => g.slice(i + 1).some((b) => geomOverlapArea(a, b) > 0))
}

describe.each(VIEWPORTS)('unspecified mode at $name', ({ width, height }) => {
  it('every composition satisfies the laws', () => {
    const r = runBatch({ width, height, mode: undefined, seeds: Math.ceil(SEEDS / 2) })
    expect(r.failures.slice(0, 5), 'first violations (seed, codes)').toEqual([])
    expect(r.fallbacks.minimal).toBe(0)
  })
})

describe('mode choice', () => {
  it('is about 80% dynamic when no mode is forced', () => {
    const n = 3000
    let dynamic = 0
    for (let seed = 0; seed < n; seed++) if (make(seed).mode === 'dynamic') dynamic++
    expect(dynamic / n).toBeGreaterThan(0.77)
    expect(dynamic / n).toBeLessThan(0.83)
  })

  it('respects a forced mode', () => {
    expect(make(1, { mode: 'static' }).mode).toBe('static')
    expect(make(1, { mode: 'dynamic' }).mode).toBe('dynamic')
  })
})

describe('reproducibility and variety', () => {
  it('the same seed gives the same composition', () => {
    for (const seed of [0, 1, 2, 77, 12345]) expect(make(seed)).toEqual(make(seed))
  })

  it('different seeds give different compositions', () => {
    const seen = new Set()
    for (let seed = 0; seed < 600; seed++) seen.add(JSON.stringify(make(seed).shapes))
    expect(seen.size / 600).toBeGreaterThan(0.95)
  })

  it('uses every palette, every form and every static main form', () => {
    const leads = new Set()
    const types = new Set()
    const mainTypes = new Set()
    for (let seed = 0; seed < 800; seed++) {
      const c = make(seed)
      if (c.mode === 'static') mainTypes.add(c.shapes[0].type)
      for (const s of c.shapes) types.add(s.type)
      if (c.mode === 'dynamic') for (const s of c.shapes) leads.add(s.color)
    }
    for (const p of PALETTES) expect(leads.has(p.lead), `palette ${p.name}`).toBe(true)
    expect([...types].sort()).toEqual(['bar', 'circle', 'cross', 'square', 'triangle'])
    expect([...mainTypes].sort()).toEqual(['circle', 'cross', 'square'])
  })

  it('most dynamic compositions have a crossing, and some have none', () => {
    let crossing = 0
    const n = 600
    for (let seed = 0; seed < n; seed++) if (hasOverlap(make(seed, { mode: 'dynamic' }).shapes)) crossing++
    expect(crossing / n).toBeGreaterThan(0.55)
    expect(crossing / n).toBeLessThan(0.85)
  })
})

describe('hostile randomness', () => {
  it.each([
    ['always 0', () => 0],
    ['always 0.5', () => 0.5],
    ['almost 1', () => 0.9999999],
  ])('still returns a valid composition when rng is %s', (name, rng) => {
    for (const mode of [undefined, 'dynamic', 'static']) {
      const comp = generateComposition({ ...HD, rng, mode })
      expect(validateComposition(comp).violations).toEqual([])
      expect(comp.shapes.length).toBeGreaterThan(0)
    }
  })
})

describe('odd input', () => {
  it('survives a window size that is not a number', () => {
    for (const bad of [NaN, undefined]) {
      const comp = generateComposition({ width: bad, height: bad, rng: createRng(3) })
      expect(validateComposition(comp).violations).toEqual([])
    }
  })

  it.each([
    [100, 100],
    [0, 0],
    [240, 240],
    [8000, 600],
    [300, 4000],
  ])('handles a %i x %i window', (width, height) => {
    const comp = generateComposition({ width, height, rng: createRng(5) })
    expect(validateComposition(comp).violations).toEqual([])
    expect(comp.width).toBeGreaterThanOrEqual(240)
    expect(comp.height).toBeGreaterThanOrEqual(240)
  })
})
