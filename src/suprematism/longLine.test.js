import { describe, it, expect } from 'vitest'
import { generateComposition } from './generate.js'
import { buildDynamic } from './dynamic.js'
import { createRng } from './random.js'
import { stageRect, shapeOverlapArea } from './geometry.js'
import { LIMITS } from './validate.js'
import { PARAMS } from './params.js'
import { VIEWPORTS } from './testUtils.js'

const aspectOf = (s) => s.w / s.h
const veryLong = (comp) => comp.shapes.filter((s) => s.type === 'bar' && aspectOf(s) > LIMITS.vocabulary.veryLongAspect)
const dynamic = (width, height, seed) => generateComposition({ width, height, rng: createRng(seed), mode: 'dynamic' })

describe('the generator lays a very long line across some compositions', () => {
  it.each(VIEWPORTS)('at $name', ({ width, height }) => {
    const { U } = stageRect(width, height)
    let compositions = 0
    let withLine = 0
    for (let seed = 0; seed < 80; seed++) {
      const comp = dynamic(width, height, seed)
      if (comp.mode !== 'dynamic') continue
      compositions++
      const lines = veryLong(comp)
      expect(lines.length).toBeLessThanOrEqual(LIMITS.vocabulary.veryLongMax)
      if (lines.length === 0) continue
      withLine++
      const [line] = lines
      // very long: at least 0.7 U (the old longest line was about 0.5 U), and no more than the generator allows
      expect(line.w).toBeGreaterThanOrEqual(PARAMS.dynamic.longLine.lengthOfU[0] * U - 1e-6)
      expect(line.w).toBeLessThanOrEqual(PARAMS.dynamic.longLine.lengthOfU[1] * U + 1e-6)
      // thin, and never thinner than the laws allow
      expect(aspectOf(line)).toBeLessThanOrEqual(PARAMS.dynamic.longLine.maxAspect + 1e-6)
      expect(line.h).toBeGreaterThanOrEqual(Math.max(LIMITS.minSize.barThickness * U, LIMITS.minSize.barThicknessPx) - 1e-6)
      // it is one of the forms: 6 to 9 in all, never more than the law allows
      expect(comp.shapes.length).toBeGreaterThanOrEqual(PARAMS.dynamic.longLine.minCount)
      expect(comp.shapes.length).toBeLessThanOrEqual(LIMITS.counts.dynamic[1])
    }
    // about 35% on a roomy stage; a small phone has fewer forms to spare but still gets them
    expect(withLine / compositions).toBeGreaterThan(0.15)
    expect(withLine / compositions).toBeLessThan(0.6)
  })

  it('makes lines far longer than the old ordinary ones', () => {
    const lengths = []
    for (let seed = 0; seed < 300; seed++) {
      const comp = dynamic(1920, 1080, seed)
      const { U } = stageRect(comp.width, comp.height)
      for (const s of veryLong(comp)) lengths.push(s.w / U)
    }
    lengths.sort((a, b) => a - b)
    expect(lengths.length).toBeGreaterThan(50)
    expect(lengths[Math.floor(lengths.length / 2)]).toBeGreaterThan(0.75) // median; the ordinary lines never passed 0.5
    expect(lengths.at(-1)).toBeGreaterThan(1.1)
  })

  it('lies along the main tilt or square to it, and crosses another form in many compositions', () => {
    let crossing = 0
    let lines = 0
    for (let seed = 0; seed < 200; seed++) {
      const comp = dynamic(1920, 1080, seed)
      const [line] = veryLong(comp)
      if (!line) continue
      lines++
      const others = comp.shapes.filter((s) => s !== line)
      const angles = others.filter((s) => s.type !== 'circle').map((s) => ((s.rotation % 90) + 90) % 90)
      const mine = ((line.rotation % 90) + 90) % 90
      // it shares the tilt of at least two other forms (the ORIENTATION law wants most of them to)
      const near = angles.filter((a) => Math.min(Math.abs(a - mine), 90 - Math.abs(a - mine)) <= LIMITS.orientation.tolerance)
      expect(near.length).toBeGreaterThanOrEqual(2)
      if (others.some((s) => shapeOverlapArea(line, s) > 0)) crossing++
    }
    expect(lines).toBeGreaterThan(30)
    // half of the lines are required to cross something, and many of the rest do anyway
    expect(crossing / lines).toBeGreaterThan(0.3)
  })

  it('goes without the line, not without the composition, when nothing fits', () => {
    // a 320 x 568 phone has the least room; every composition is still valid and well formed
    for (let seed = 0; seed < 120; seed++) {
      const comp = dynamic(320, 568, seed)
      expect(comp.shapes.length).toBeGreaterThanOrEqual(LIMITS.counts[comp.mode][0])
      expect(comp.meta.fallback).toBe(false)
    }
  })
})

describe('where there is no long line', () => {
  it('never in a static composition', () => {
    for (let seed = 0; seed < 200; seed++) {
      const comp = generateComposition({ width: 1920, height: 1080, rng: createRng(seed), mode: 'static' })
      expect(veryLong(comp)).toEqual([])
    }
  })

  it('never in the conservative profile, which the generator falls back on', () => {
    const stage = stageRect(1920, 1080)
    let built = 0
    for (let seed = 0; seed < 150; seed++) {
      const shapes = buildDynamic(stage, createRng(seed), 'conservative')
      if (!shapes) continue
      built++
      expect(veryLong({ shapes })).toEqual([])
    }
    expect(built).toBeGreaterThan(20)
  })
})

describe('a long line does not make the generator work harder', () => {
  it('needs about as many attempts as before and never falls back', () => {
    let attempts = 0
    const n = 300
    for (let seed = 0; seed < n; seed++) {
      const comp = dynamic(1920, 1080, seed)
      attempts += comp.meta.attempts
      expect(comp.meta.fallback).toBe(false)
    }
    expect(attempts / n).toBeLessThan(2.3) // about 1.8 without it, and 1.7-2.0 with it
  })
})
