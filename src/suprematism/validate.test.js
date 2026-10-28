import { describe, it, expect } from 'vitest'
import { validateComposition, VIOLATION_CODES, LIMITS } from './validate.js'
import {
  goodDynamic,
  goodStatic,
  find,
  MUTATORS,
  placeAtDistance,
} from './testUtils.js'

const codes = (comp) => validateComposition(comp).violations.map((v) => v.code)
const base = { dynamic: goodDynamic, static: goodStatic }

describe('reference compositions', () => {
  it('the hand-built dynamic composition is valid', () => {
    const r = validateComposition(goodDynamic())
    expect(r.violations).toEqual([])
    expect(r.valid).toBe(true)
  })

  it('the hand-built static composition is valid', () => {
    const r = validateComposition(goodStatic())
    expect(r.violations).toEqual([])
    expect(r.valid).toBe(true)
  })

  it('exposes metrics for debugging', () => {
    const { metrics } = validateComposition(goodDynamic())
    expect(metrics.clusterAngle).toBeCloseTo(60)
    expect(metrics.balance.norm).toBeLessThan(0.28)
    expect(metrics.overlapPairs).toBe(1)
  })
})

describe('the validator is not vacuous', () => {
  it('has a mutator for every violation code', () => {
    const covered = new Set(MUTATORS.map((m) => m.code))
    expect(VIOLATION_CODES.filter((code) => !covered.has(code))).toEqual([])
  })

  it('has no mutator for an unknown code', () => {
    expect(MUTATORS.map((m) => m.code).filter((c) => !VIOLATION_CODES.includes(c))).toEqual([])
  })

  it.each(MUTATORS)('reports $code when exactly that rule is broken', ({ code, base: kind, mutate }) => {
    const comp = base[kind]()
    mutate(comp)
    expect(codes(comp)).toContain(code)
  })

  it('reports violations with a code, a message and the offending ids', () => {
    const comp = goodDynamic()
    find(comp, 's3').cx = comp.width - 10
    const v = validateComposition(comp).violations.find((x) => x.code === 'MARGIN')
    expect(v.message).toBeTruthy()
    expect(v.ids).toEqual(['s3'])
  })
})

describe('at least two forms', () => {
  it('a static composition of one form is rejected', () => {
    const comp = goodStatic()
    comp.shapes = comp.shapes.slice(0, 1)
    expect(codes(comp)).toContain('COUNT')
  })

  it('two forms are enough for a static composition', () => {
    const comp = goodStatic()
    comp.shapes = comp.shapes.slice(0, 2)
    expect(codes(comp)).not.toContain('COUNT')
  })
})

describe('malformed input', () => {
  it('rejects a missing composition', () => {
    expect(validateComposition(null).violations[0].code).toBe('SCHEMA')
  })

  it('rejects an unknown mode', () => {
    const comp = goodDynamic()
    comp.mode = 'baroque'
    expect(codes(comp)).toEqual(['SCHEMA'])
  })

  it('rejects an empty shape list', () => {
    const comp = goodDynamic()
    comp.shapes = []
    expect(codes(comp)).toEqual(['SCHEMA'])
  })

  it('rejects duplicate ids and unknown types', () => {
    const dup = goodDynamic()
    dup.shapes[1].id = 's0'
    expect(codes(dup)).toContain('SCHEMA')
    const odd = goodDynamic()
    odd.shapes[1].type = 'star'
    expect(codes(odd)).toContain('SCHEMA')
  })

  it('rejects shapes whose dimensions break their type', () => {
    const comp = goodDynamic()
    find(comp, 's2').h = 100 // a "square" that is not square
    expect(codes(comp)).toContain('SCHEMA')
  })

  it('treats style keys and non-hex colours as FLAT_COLOUR', () => {
    for (const patch of [{ opacity: 0.5 }, { stroke: '#000' }, { color: 'url(#grad-1)' }, { color: '#E0301E' }]) {
      const comp = goodDynamic()
      Object.assign(find(comp, 's0'), patch)
      expect(codes(comp)).toContain('FLAT_COLOUR')
    }
  })

  it('returns no metrics when the data is too broken to measure', () => {
    expect(validateComposition(null).metrics).toBeNull()
  })
})

describe('limits are inclusive, and 1% past them fails', () => {
  it('MARGIN: exactly the margin passes, 1% of U further out fails', () => {
    // circle of diameter 120 on a 1600 x 1000 stage (U = 1000)
    const margin = LIMITS.margin * 1000
    const ok = goodDynamic()
    find(ok, 's3').cx = 1600 - margin - 60
    expect(codes(ok)).not.toContain('MARGIN')
    const bad = goodDynamic()
    find(bad, 's3').cx = 1600 - margin - 60 + 10
    expect(codes(bad)).toContain('MARGIN')
  })

  it('MIN_SIZE: a bar exactly 0.008U thick passes, 1% thinner fails', () => {
    const ok = goodDynamic()
    Object.assign(find(ok, 's4'), { w: 60, h: 8 })
    expect(codes(ok)).not.toContain('MIN_SIZE')
    const bad = goodDynamic()
    Object.assign(find(bad, 's4'), { w: 60, h: 7.92 })
    expect(codes(bad)).toContain('MIN_SIZE')
  })

  it('NEAR_MISS: a gap of exactly 0.02U passes, 1% smaller fails', () => {
    const place = (gap) => {
      const comp = goodDynamic()
      const fixed = find(comp, 's2')
      const moving = find(comp, 's3')
      const d = Math.hypot(moving.cx - fixed.cx, moving.cy - fixed.cy)
      const dir = [(moving.cx - fixed.cx) / d, (moving.cy - fixed.cy) / d]
      comp.shapes = comp.shapes.map((s) => (s.id === 's3' ? placeAtDistance(moving, fixed, dir, gap) : s))
      return comp
    }
    expect(codes(place(20))).not.toContain('NEAR_MISS')
    expect(codes(place(19.8))).toContain('NEAR_MISS')
  })

  it('STATIC_CENTRED: an offset of exactly 0.04 of the stage width passes, 10 px more fails', () => {
    const ok = goodStatic()
    find(ok, 's0').cx = 800 + 0.04 * 1600
    expect(codes(ok)).not.toContain('STATIC_CENTRED')
    const bad = goodStatic()
    find(bad, 's0').cx = 800 + 0.04 * 1600 + 10
    expect(codes(bad)).toContain('STATIC_CENTRED')
  })
})

describe('very long lines', () => {
  const longBar = (comp, id, aspect) => {
    const s = find(comp, id)
    s.h = 10
    s.w = aspect * 10
  }

  it('lets a dynamic composition have one', () => {
    const comp = goodDynamic()
    longBar(comp, 's5', 80)
    expect(codes(comp)).not.toContain('LONG_LINE')
    expect(codes(comp)).not.toContain('SCHEMA')
  })

  it('does not let it have two', () => {
    const comp = goodDynamic()
    longBar(comp, 's4', 80)
    longBar(comp, 's5', 80)
    const v = validateComposition(comp).violations.find((x) => x.code === 'LONG_LINE')
    expect(v.ids.sort()).toEqual(['s4', 's5'])
    expect(v.value).toBe(2)
    expect(v.limit).toBe(LIMITS.vocabulary.veryLongMax)
  })

  it('counts a bar as very long only beyond the threshold', () => {
    const comp = goodDynamic()
    longBar(comp, 's4', LIMITS.vocabulary.veryLongAspect)
    longBar(comp, 's5', LIMITS.vocabulary.veryLongAspect)
    expect(codes(comp)).not.toContain('LONG_LINE')
    longBar(comp, 's4', LIMITS.vocabulary.veryLongAspect + 1)
    longBar(comp, 's5', LIMITS.vocabulary.veryLongAspect + 1)
    expect(codes(comp)).toContain('LONG_LINE')
  })

  it('keeps one out of a static composition altogether', () => {
    const comp = goodStatic()
    const s = find(comp, 's2')
    s.h = 6
    s.w = 6 * (LIMITS.vocabulary.veryLongAspect + 10)
    expect(codes(comp)).toContain('LONG_LINE')
  })

  it('still rejects a bar that is far too thin or too short for a bar', () => {
    const [min, max] = LIMITS.barAspect
    const long = goodDynamic()
    longBar(long, 's5', max + 5)
    expect(codes(long)).toContain('SCHEMA')
    const short = goodDynamic()
    find(short, 's5').w = find(short, 's5').h * (min - 0.5)
    expect(codes(short)).toContain('SCHEMA')
    const edge = goodDynamic()
    longBar(edge, 's5', max)
    expect(codes(edge)).not.toContain('SCHEMA')
  })
})
