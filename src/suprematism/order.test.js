import { describe, it, expect } from 'vitest'
import { measureOrder, LAWS_OF_KIND, LAWS_OF_PLACE } from './order.js'
import { VIOLATION_CODES, validateComposition } from './validate.js'
import { generateComposition } from './generate.js'
import { createMotion } from './animation.js'
import { createRng } from './random.js'
import { goodDynamic, goodStatic, find, MUTATORS } from './testUtils.js'

const base = { dynamic: goodDynamic, static: goodStatic }
const placeCodes = new Set([...LAWS_OF_PLACE.dynamic, ...LAWS_OF_PLACE.static])

describe('every law is classified', () => {
  it('puts each violation code among the laws of kind or of place', () => {
    const classified = new Set([...LAWS_OF_KIND, ...placeCodes])
    expect(VIOLATION_CODES.filter((code) => !classified.has(code))).toEqual([])
  })

  it('names no code the validator does not know', () => {
    const known = new Set(VIOLATION_CODES)
    expect([...LAWS_OF_KIND, ...placeCodes].filter((code) => !known.has(code))).toEqual([])
  })

  it('never lists a law as both of kind and of place', () => {
    expect(LAWS_OF_KIND.filter((code) => placeCodes.has(code))).toEqual([])
  })

  it('lists no law twice for one mode', () => {
    for (const laws of Object.values(LAWS_OF_PLACE)) expect(new Set(laws).size).toBe(laws.length)
  })
})

describe('measureOrder', () => {
  it('gives the reference compositions full order', () => {
    for (const comp of [goodDynamic(), goodStatic()]) {
      const r = measureOrder(comp)
      expect(r.order).toBe(1)
      expect(r.kept).toBe(r.total)
      expect(r.broken).toEqual([])
    }
  })

  it('counts the laws of place of the mode', () => {
    expect(measureOrder(goodDynamic()).total).toBe(LAWS_OF_PLACE.dynamic.length)
    expect(measureOrder(goodStatic()).total).toBe(LAWS_OF_PLACE.static.length)
  })

  it.each(MUTATORS.filter((m) => LAWS_OF_PLACE[m.base].includes(m.code)))(
    'loses order when $code is broken',
    ({ code, base: kind, mutate }) => {
      const comp = base[kind]()
      mutate(comp)
      const r = measureOrder(comp)
      expect(r.broken.map((v) => v.code)).toContain(code)
      expect(r.order).toBeLessThan(1)
      expect(r.kept).toBe(r.total - r.broken.length)
    },
  )

  it('reports each broken law once, with the validator\'s message', () => {
    const comp = goodDynamic()
    find(comp, 's3').cx = comp.width - 10
    find(comp, 's2').cx = comp.width - 10
    const { broken } = measureOrder(comp)
    const margin = broken.filter((v) => v.code === 'MARGIN')
    expect(margin).toHaveLength(1)
    expect(margin[0].message).toBeTruthy()
    expect(new Set(broken.map((v) => v.code)).size).toBe(broken.length)
  })

  it('does not count a law about what the forms are', () => {
    const comp = goodDynamic()
    find(comp, 's3').color = '#123456'
    expect(validateComposition(comp).valid).toBe(false)
    expect(measureOrder(comp).order).toBe(1)
  })

  it('rejects an unknown mode', () => {
    expect(() => measureOrder({ ...goodDynamic(), mode: 'chaos' })).toThrow(/unknown mode/)
  })
})

describe('order and the animation', () => {
  const SEEDS = 20

  const orderAfter = (mode, seed, seconds) => {
    const rng = createRng(seed)
    const comp = generateComposition({ width: 1280, height: 720, rng, mode })
    const motion = createMotion(comp, rng)
    for (let t = 0; t < seconds; t += 0.1) motion.step(0.1)
    return measureOrder({ ...comp, shapes: motion.shapes }).order
  }

  it.each(['dynamic', 'static'])('starts full and falls as the %s forms drift apart', (mode) => {
    let total = 0
    for (let seed = 0; seed < SEEDS; seed++) {
      expect(orderAfter(mode, seed, 0)).toBe(1)
      const later = orderAfter(mode, seed, 120)
      expect(later).toBeGreaterThanOrEqual(0)
      expect(later).toBeLessThanOrEqual(1)
      total += later
    }
    expect(total / SEEDS).toBeLessThan(0.85)
  })

  it.each(['dynamic', 'static'])('is full again once the %s forms are called home', (mode) => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const rng = createRng(seed)
      const comp = generateComposition({ width: 1280, height: 720, rng, mode })
      const motion = createMotion(comp, rng)
      for (let t = 0; t < 120; t += 0.1) motion.step(0.1)
      expect(measureOrder({ ...comp, shapes: motion.shapes }).order).toBeLessThan(1)
      motion.restore()
      for (let t = 0; motion.restoring && t < 10; t += 0.05) motion.step(0.05)
      expect(motion.restoring).toBe(false)
      expect(measureOrder({ ...comp, shapes: motion.shapes }).order).toBe(1)
    }
  })
})
