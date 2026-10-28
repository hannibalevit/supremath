import { describe, it, expect } from 'vitest'
import { createTransition, TRANSITION } from './transition.js'
import { generateComposition } from './generate.js'
import { createMotion } from './animation.js'
import { createRng } from './random.js'
import { shapeBounds } from './geometry.js'
import { VIEWPORTS } from './testUtils.js'

const compFor = (seed, mode, width = 1280, height = 720) =>
  generateComposition({ width, height, rng: createRng(seed), mode })

const withoutId = (shape) => {
  const rest = { ...shape }
  delete rest.id
  return rest
}

// every frame of a transition, `dt` apart, up to and including the one that finishes it
function frames(transition, dt = 0.01) {
  const out = [{ t: 0, shapes: transition.shapes }]
  for (let t = dt; out.length < 2000; t += dt) {
    transition.step(dt)
    out.push({ t, shapes: transition.shapes })
    if (transition.done) break
  }
  return out
}

describe('a transition between two compositions', () => {
  const a = compFor(1, 'dynamic')
  const b = compFor(2, 'dynamic')

  it('starts exactly as the picture on screen', () => {
    const tr = createTransition(a.shapes, b.shapes)
    expect(tr.shapes.map(withoutId)).toEqual(a.shapes.map(withoutId))
    expect(tr.done).toBe(false)
  })

  it('ends exactly as the new composition', () => {
    const tr = createTransition(a.shapes, b.shapes)
    frames(tr)
    expect(tr.done).toBe(true)
    expect(tr.shapes).toEqual(b.shapes)
  })

  it('is quick enough for a button: about a second at most', () => {
    for (let seed = 0; seed < 30; seed++) {
      const tr = createTransition(compFor(seed, 'dynamic').shapes, compFor(seed + 100, 'dynamic').shapes)
      expect(tr.duration).toBeLessThan(1.3)
      expect(tr.duration).toBeGreaterThan(0.5)
    }
  })

  it('never has two shapes with one id', () => {
    for (const { shapes } of frames(createTransition(a.shapes, b.shapes))) {
      const ids = shapes.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('only changes size and turn, so every colour on screen is a pure palette colour', () => {
    const allowed = new Set([...a.shapes, ...b.shapes].map((s) => s.color))
    for (const { shapes } of frames(createTransition(a.shapes, b.shapes))) {
      for (const s of shapes) {
        expect(allowed.has(s.color)).toBe(true)
        expect(Object.keys(s).sort()).toEqual(Object.keys(a.shapes[0]).sort())
      }
    }
  })

  it('shrinks what leaves and grows what arrives, never the other way', () => {
    const last = new Map()
    for (const { shapes } of frames(createTransition(a.shapes, b.shapes))) {
      for (const s of shapes) {
        const before = last.get(s.id)
        if (before !== undefined) {
          if (s.id.startsWith('gone')) expect(s.w).toBeLessThanOrEqual(before + 1e-9)
          else expect(s.w).toBeGreaterThanOrEqual(before - 1e-9)
        }
        expect(s.w).toBeGreaterThan(0)
        expect(s.h).toBeGreaterThan(0)
        last.set(s.id, s.w)
      }
    }
  })

  it('keeps the proportions of every form, so a square stays square', () => {
    const originals = new Map([...a.shapes.map((s, i) => [`gone${i}`, s]), ...b.shapes.map((s) => [s.id, s])])
    for (const { shapes } of frames(createTransition(a.shapes, b.shapes))) {
      for (const s of shapes) {
        const o = originals.get(s.id)
        expect(s.w / s.h).toBeCloseTo(o.w / o.h, 9)
      }
    }
  })

  it('brings the dominant form in first and the smallest accent last', () => {
    const firstSeen = new Map()
    for (const { t, shapes } of frames(createTransition(a.shapes, b.shapes))) {
      for (const s of shapes) if (!s.id.startsWith('gone') && !firstSeen.has(s.id)) firstSeen.set(s.id, t)
    }
    const times = b.shapes.map((s) => firstSeen.get(s.id))
    expect(times.every((t) => t !== undefined)).toBe(true)
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
  })

  it('takes the smallest form away first and the dominant one last', () => {
    const lastSeen = new Map()
    for (const { t, shapes } of frames(createTransition(a.shapes, b.shapes))) {
      for (const s of shapes) if (s.id.startsWith('gone')) lastSeen.set(s.id, t)
    }
    const times = a.shapes.map((s, i) => lastSeen.get(`gone${i}`))
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThan(times[i - 1])
  })

  it('lets what leaves lie under what arrives', () => {
    for (const { shapes } of frames(createTransition(a.shapes, b.shapes))) {
      const ids = shapes.map((s) => s.id)
      const lastGone = ids.map((id) => id.startsWith('gone')).lastIndexOf(true)
      const firstNew = ids.findIndex((id) => !id.startsWith('gone'))
      if (lastGone !== -1 && firstNew !== -1) expect(lastGone).toBeLessThan(firstNew)
    }
  })

  it('turns an arriving form a little, and lands it at its own angle', () => {
    const tr = createTransition(a.shapes, b.shapes)
    const all = frames(tr)
    for (const { shapes } of all) {
      for (const s of shapes) {
        if (s.id.startsWith('gone')) continue
        const home = b.shapes.find((h) => h.id === s.id)
        expect(Math.abs(s.rotation - home.rotation)).toBeLessThanOrEqual(TRANSITION.spin + 1e-9)
      }
    }
    expect(all.at(-1).shapes.map((s) => s.rotation)).toEqual(b.shapes.map((s) => s.rotation))
  })

  it('turns only a little: well under a quarter turn', () => {
    expect(TRANSITION.spin).toBeLessThanOrEqual(30)
  })

  it('does not touch the shapes it is given', () => {
    const fromSnapshot = JSON.stringify(a.shapes)
    const toSnapshot = JSON.stringify(b.shapes)
    frames(createTransition(a.shapes, b.shapes))
    expect(JSON.stringify(a.shapes)).toBe(fromSnapshot)
    expect(JSON.stringify(b.shapes)).toBe(toSnapshot)
  })
})

describe('transitions between different numbers of forms', () => {
  it.each([
    ['static', 'dynamic'],
    ['dynamic', 'static'],
    ['static', 'static'],
  ])('from %s to %s', (fromMode, toMode) => {
    for (let seed = 0; seed < 15; seed++) {
      const from = compFor(seed, fromMode)
      const to = compFor(seed + 50, toMode)
      const tr = createTransition(from.shapes, to.shapes)
      const all = frames(tr)
      expect(all[0].shapes).toHaveLength(from.shapes.length)
      expect(all.at(-1).shapes).toEqual(to.shapes)
      for (const { shapes } of all) {
        const ids = shapes.map((s) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    }
  })
})

describe('interrupting a transition', () => {
  it('starts the next one from the picture as it is, without a jump', () => {
    const a = compFor(3, 'dynamic')
    const b = compFor(4, 'dynamic')
    const c = compFor(5, 'dynamic')
    const first = createTransition(a.shapes, b.shapes)
    for (let i = 0; i < 40; i++) first.step(0.01)
    const mid = first.shapes
    expect(mid.length).toBeGreaterThan(0)
    expect(first.done).toBe(false)

    const second = createTransition(mid, c.shapes)
    expect(second.shapes.map(withoutId)).toEqual(mid.map(withoutId))
    frames(second)
    expect(second.shapes).toEqual(c.shapes)
  })

  it('can be interrupted over and over', () => {
    let on = compFor(0, 'dynamic').shapes
    for (let seed = 1; seed < 12; seed++) {
      const tr = createTransition(on, compFor(seed, 'dynamic').shapes)
      for (let i = 0; i < 20 + (seed % 5) * 10; i++) tr.step(0.01)
      on = tr.shapes
      for (const s of on) {
        expect(Number.isFinite(s.w) && Number.isFinite(s.h) && Number.isFinite(s.rotation)).toBe(true)
        expect(s.w).toBeGreaterThan(0)
      }
    }
  })
})

describe('forms stay in the window during a transition', () => {
  it.each(VIEWPORTS)('at $name', ({ width, height }) => {
    const bad = []
    for (let seed = 0; seed < 15; seed++) {
      const rng = createRng(seed)
      const from = generateComposition({ width, height, rng })
      const motion = createMotion(from, rng)
      // a long drift, so that some forms are pressed against the walls
      for (let t = 0; t < 180; t += 0.1) motion.step(0.1)
      const to = generateComposition({ width, height, rng })
      for (const { t, shapes } of frames(createTransition(motion.shapes, to.shapes), 0.02)) {
        for (const s of shapes) {
          const b = shapeBounds(s)
          if (b.minX < -1e-6 || b.minY < -1e-6 || b.maxX > width + 1e-6 || b.maxY > height + 1e-6) {
            bad.push({ seed, t: +t.toFixed(2), id: s.id })
          }
        }
      }
    }
    expect(bad.slice(0, 5), 'first form to leave the window (seed, time, id)').toEqual([])
  })
})
