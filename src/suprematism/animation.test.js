import { describe, it, expect } from 'vitest'
import { generateComposition } from './generate.js'
import { createRng } from './random.js'
import { stageRect, shapeBounds } from './geometry.js'
import { createMotion, createClock, MOTION } from './animation.js'
import { VIEWPORTS, seedCount, goodDynamic } from './testUtils.js'

// six simulated minutes per seed is expensive, so this one is capped even in the thorough run
const SEEDS = Math.min(seedCount(8), 30)

const scene = (width, height, seed, mode) => {
  const rng = createRng(seed)
  const comp = generateComposition({ width, height, rng, mode })
  return { comp, motion: createMotion(comp, rng) }
}

const speedOf = (body) => Math.hypot(body.vx, body.vy)

describe('every form moves on its own', () => {
  it('gives each form a speed inside the gentle range', () => {
    for (const mode of ['dynamic', 'static']) {
      for (let seed = 0; seed < 40; seed++) {
        const { comp, motion } = scene(1920, 1080, seed, mode)
        const { U } = stageRect(comp.width, comp.height)
        for (const b of motion.bodies) {
          expect(speedOf(b)).toBeGreaterThanOrEqual(MOTION.speed[0] * U - 1e-9)
          expect(speedOf(b)).toBeLessThanOrEqual(MOTION.speed[1] * U + 1e-9)
        }
      }
    }
  })

  it('is gentle: at most about 3.5 px/s and 2 degrees per second on a 1080p screen', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { motion } = scene(1920, 1080, seed, 'dynamic')
      for (const b of motion.bodies) {
        expect(speedOf(b)).toBeLessThan(4)
        expect(Math.abs(b.spin)).toBeLessThanOrEqual(2)
      }
    }
  })

  it('gives every form its own direction', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { motion } = scene(1920, 1080, seed, 'dynamic')
      const headings = motion.bodies.map((b) => Math.atan2(b.vy, b.vx).toFixed(6))
      expect(new Set(headings).size).toBe(headings.length)
    }
  })

  it('does not hand out one shared speed', () => {
    let varied = 0
    const n = 60
    for (let seed = 0; seed < n; seed++) {
      const speeds = scene(1920, 1080, seed, 'dynamic').motion.bodies.map(speedOf)
      if (Math.max(...speeds) / Math.min(...speeds) > 1.2) varied++
    }
    expect(varied / n).toBeGreaterThan(0.9)
  })

  it('spins every form except the circle, at its own rate and either way round', () => {
    const rates = new Set()
    const signs = new Set()
    let circles = 0
    for (let seed = 0; seed < 80; seed++) {
      const { comp, motion } = scene(1920, 1080, seed, 'dynamic')
      motion.bodies.forEach((b, i) => {
        if (comp.shapes[i].type === 'circle') {
          circles++
          expect(b.spin).toBe(0)
        } else {
          expect(Math.abs(b.spin)).toBeGreaterThanOrEqual(MOTION.spin[0])
          expect(Math.abs(b.spin)).toBeLessThanOrEqual(MOTION.spin[1])
          rates.add(b.spin.toFixed(4))
          signs.add(Math.sign(b.spin))
        }
      })
    }
    expect(circles).toBeGreaterThan(0)
    expect(signs.size).toBe(2)
    expect(rates.size).toBeGreaterThan(200)
  })
})

describe('stepping', () => {
  it('moves each form along its own velocity', () => {
    const comp = goodDynamic()
    const motion = createMotion(comp, createRng(1))
    const before = motion.shapes
    motion.step(0.5)
    motion.shapes.forEach((s, i) => {
      expect(s.cx - before[i].cx).toBeCloseTo(motion.bodies[i].vx * 0.5, 9)
      expect(s.cy - before[i].cy).toBeCloseTo(motion.bodies[i].vy * 0.5, 9)
    })
  })

  it('turns every form but the circle', () => {
    const comp = goodDynamic()
    const motion = createMotion(comp, createRng(2))
    motion.step(2)
    motion.shapes.forEach((s, i) => {
      const expected = (comp.shapes[i].rotation + motion.bodies[i].spin * 2) % 360
      expect(s.rotation).toBeCloseTo(expected, 9)
      if (s.type === 'circle') expect(s.rotation).toBe(comp.shapes[i].rotation)
    })
  })

  it('never turns a circle, however long it runs', () => {
    const { comp, motion } = scene(1366, 768, 3, 'dynamic')
    for (let i = 0; i < 3000; i++) motion.step(0.1)
    motion.shapes.forEach((s, i) => {
      if (s.type === 'circle') expect(s.rotation).toBe(comp.shapes[i].rotation)
    })
  })

  it('is reproducible for a seed', () => {
    const run = () => {
      const { motion } = scene(1920, 1080, 11, 'dynamic')
      for (let i = 0; i < 400; i++) motion.step(0.05)
      return motion.shapes
    }
    expect(run()).toEqual(run())
  })

  it('does not touch the generated composition', () => {
    const { comp, motion } = scene(1920, 1080, 5, 'dynamic')
    const snapshot = JSON.stringify(comp.shapes)
    for (let i = 0; i < 200; i++) motion.step(0.05)
    expect(JSON.stringify(comp.shapes)).toBe(snapshot)
  })

  it('starts exactly from the generated composition', () => {
    const { comp, motion } = scene(1920, 1080, 6, 'static')
    expect(motion.shapes).toEqual(comp.shapes)
  })
})

describe('forms bounce off the window edge', () => {
  it('turns round at the wall and stays inside', () => {
    // rng() === 0: heading 0 (to the right), slowest speed, anticlockwise spin
    const comp = {
      mode: 'static',
      width: 1000,
      height: 600,
      shapes: [{ id: 's0', type: 'square', cx: 900, cy: 300, w: 50, h: 50, rotation: 0, color: '#111111' }],
    }
    const motion = createMotion(comp, () => 0)
    const body = motion.bodies[0]
    expect(body.vx).toBeGreaterThan(0)
    const { U } = stageRect(comp.width, comp.height)
    const wall = comp.width - MOTION.edge * U
    let turned = false
    for (let i = 0; i < 6000; i++) {
      motion.step(0.1)
      const b = shapeBounds(motion.shapes[0])
      expect(b.maxX).toBeLessThanOrEqual(wall + 1e-6)
      if (body.vx < 0) turned = true
    }
    expect(turned).toBe(true)
  })

  it.each(VIEWPORTS)('keeps every form in the window for six simulated minutes at $name', ({ width, height }) => {
    const bad = []
    for (let seed = 0; seed < SEEDS; seed++) {
      const { comp, motion } = scene(width, height, seed)
      const edge = MOTION.edge * stageRect(comp.width, comp.height).U
      for (let i = 0; i < 3600; i++) {
        motion.step(0.1)
        for (const s of motion.shapes) {
          const b = shapeBounds(s)
          const fits =
            b.minX >= edge - 1e-6 &&
            b.maxX <= comp.width - edge + 1e-6 &&
            b.minY >= edge - 1e-6 &&
            b.maxY <= comp.height - edge + 1e-6
          if (!fits) bad.push({ seed, step: i, id: s.id })
        }
      }
    }
    expect(bad.slice(0, 5), 'first form to leave (seed, step, id)').toEqual([])
  })

  it('moves smoothly: no form jumps between two frames', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { comp, motion } = scene(1920, 1080, seed, 'dynamic')
      const { U } = stageRect(comp.width, comp.height)
      let prev = motion.shapes
      for (let i = 0; i < 60 * 120; i++) {
        motion.step(1 / 60)
        const next = motion.shapes
        next.forEach((s, k) => {
          expect(Math.hypot(s.cx - prev[k].cx, s.cy - prev[k].cy)).toBeLessThan(0.002 * U)
        })
        prev = next
      }
    }
  })
})

describe('createClock', () => {
  it('counts elapsed seconds from the frame timestamps', () => {
    const clock = createClock()
    clock.start(1000)
    expect(clock.tick(1016)).toBeCloseTo(0.016)
    expect(clock.tick(1033)).toBeCloseTo(0.033)
  })

  it('reports the step each tick added', () => {
    const clock = createClock()
    clock.start(0)
    clock.tick(16)
    expect(clock.delta).toBeCloseTo(0.016)
    clock.tick(50)
    expect(clock.delta).toBeCloseTo(0.034)
  })

  it('is independent of the refresh rate', () => {
    const slow = createClock()
    const fast = createClock()
    slow.start(0)
    fast.start(0)
    let a = 0
    let b = 0
    for (let ms = 0; ms <= 1000; ms += 33.3333) a = slow.tick(ms)
    for (let ms = 0; ms <= 1000; ms += 8.3333) b = fast.tick(ms)
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })

  it('does not count the time spent paused', () => {
    const clock = createClock()
    clock.start(0)
    clock.tick(16)
    clock.tick(32)
    clock.pause()
    clock.start(10000) // resumed ten seconds later
    // only the 16 ms since resuming count, not the ten seconds of pause
    expect(clock.tick(10016)).toBeCloseTo(0.048, 3)
    expect(clock.delta).toBeCloseTo(0.016, 3)
  })

  it('clamps one long gap, e.g. a tab coming back from the background', () => {
    const clock = createClock({ maxDt: 0.1 })
    clock.start(0)
    clock.tick(16)
    expect(clock.tick(60000)).toBeLessThanOrEqual(0.016 + 0.1 + 1e-9)
    expect(clock.delta).toBeLessThanOrEqual(0.1 + 1e-9)
  })

  it('resets to zero, including the last step', () => {
    const clock = createClock()
    clock.start(0)
    clock.tick(500)
    clock.reset()
    expect(clock.elapsed).toBe(0)
    expect(clock.delta).toBe(0)
    clock.start(900)
    expect(clock.tick(916)).toBeCloseTo(0.016)
  })
})
