import { describe, it, expect } from 'vitest'
import { generateComposition } from './generate.js'
import { createRng } from './random.js'
import { stageRect, shapeBounds } from './geometry.js'
import { createMotion, createClock, canTurn, MOTION } from './animation.js'
import { validateComposition } from './validate.js'
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

  it('spins every form that can turn, except the circle, at its own rate and either way round', () => {
    const rates = new Set()
    const signs = new Set()
    let circles = 0
    let straight = 0
    for (let seed = 0; seed < 80; seed++) {
      const { comp, motion } = scene(1920, 1080, seed, 'dynamic')
      motion.bodies.forEach((b, i) => {
        if (comp.shapes[i].type === 'circle') {
          circles++
          expect(b.spin).toBe(0)
        } else if (!canTurn(comp.shapes[i], comp.width, comp.height)) {
          straight++ // a very long line
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
    expect(straight).toBeGreaterThan(0) // the generator does make lines too long to turn
    expect(signs.size).toBe(2)
    expect(rates.size).toBeGreaterThan(200)
  })
})

describe('a form that cannot turn', () => {
  const bar = (w, h) => ({ id: 's', type: 'bar', cx: 500, cy: 300, w, h, rotation: 30, color: '#111111' })

  it('is a very long line, not an ordinary form', () => {
    expect(canTurn(bar(400, 80), 1000, 600)).toBe(true)
    expect(canTurn({ ...bar(200, 200), type: 'square' }, 1000, 600)).toBe(true)
    expect(canTurn({ ...bar(200, 200), type: 'circle' }, 1000, 600)).toBe(false)
  })

  it('is a form whose circle does not fit inside the window', () => {
    const { U } = stageRect(1000, 600)
    const room = 600 - 2 * MOTION.edge * U // the short side, less the edge on both sides
    expect(canTurn(bar(room - 5, 4), 1000, 600)).toBe(true)
    expect(canTurn(bar(room + 5, 4), 1000, 600)).toBe(false)
    // the long side of the window is no help: it is the short side that counts
    expect(canTurn(bar(900, 4), 1000, 600)).toBe(false)
  })

  it('keeps its angle however long it runs, drifts, and stays in the window', () => {
    let seen = 0
    for (const { width, height } of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }, { width: 1024, height: 1024 }]) {
      for (let seed = 0; seed < 25; seed++) {
        const { comp, motion } = scene(width, height, seed, 'dynamic')
        const lines = comp.shapes.map((s, i) => i).filter((i) => !canTurn(comp.shapes[i], width, height) && comp.shapes[i].type !== 'circle')
        if (!lines.length) continue
        seen++
        const edge = MOTION.edge * stageRect(width, height).U
        for (let t = 0; t < 600; t += 0.1) {
          motion.step(0.1)
          for (const i of lines) {
            const s = motion.shapes[i]
            expect(s.rotation).toBe(comp.shapes[i].rotation)
            const b = shapeBounds(s)
            expect(b.minX).toBeGreaterThanOrEqual(edge - 1e-6)
            expect(b.maxX).toBeLessThanOrEqual(width - edge + 1e-6)
            expect(b.minY).toBeGreaterThanOrEqual(edge - 1e-6)
            expect(b.maxY).toBeLessThanOrEqual(height - edge + 1e-6)
          }
        }
        const moved = lines.some((i) => motion.shapes[i].cx !== comp.shapes[i].cx || motion.shapes[i].cy !== comp.shapes[i].cy)
        expect(moved).toBe(true)
      }
    }
    expect(seen).toBeGreaterThan(5)
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

describe('restoring order', () => {
  const drift = (motion, seconds) => {
    for (let t = 0; t < seconds; t += 0.1) motion.step(0.1)
  }
  // up to the step in which the slowest form arrives; the forms drift again
  // from the next step on, so stop there
  const settle = (motion, dt = 0.05) => {
    for (let t = 0; motion.restoring && t < 2 * MOTION.restore[1]; t += dt) motion.step(dt)
  }

  it.each(['dynamic', 'static'])('brings every %s form back exactly as generated', (mode) => {
    for (let seed = 0; seed < 20; seed++) {
      const { comp, motion } = scene(1920, 1080, seed, mode)
      drift(motion, 90)
      expect(motion.shapes).not.toEqual(comp.shapes)
      motion.restore()
      settle(motion)
      expect(motion.restoring).toBe(false)
      expect(motion.shapes).toEqual(comp.shapes)
      expect(validateComposition({ ...comp, shapes: motion.shapes }).valid).toBe(true)
    }
  })

  it('is under way until the slowest form is home', () => {
    const { motion } = scene(1920, 1080, 4, 'dynamic')
    drift(motion, 60)
    expect(motion.restoring).toBe(false)
    motion.restore()
    expect(motion.restoring).toBe(true)
    for (let t = 0; t < MOTION.restore[0] - 0.1; t += 0.05) motion.step(0.05)
    expect(motion.restoring).toBe(true)
    settle(motion)
    expect(motion.restoring).toBe(false)
  })

  it('lets a form that gets home first wait there for the others', () => {
    for (let seed = 0; seed < 10; seed++) {
      const { comp, motion } = scene(1920, 1080, seed, 'dynamic')
      drift(motion, 90)
      motion.restore()
      const arrived = new Set()
      for (let i = 0; i < 140 && motion.restoring; i++) {
        motion.step(0.05)
        if (!motion.restoring) break
        motion.shapes.forEach((s, k) => {
          const away = Math.hypot(s.cx - comp.shapes[k].cx, s.cy - comp.shapes[k].cy)
          if (arrived.has(k)) expect(away).toBeLessThan(1e-6)
          else if (away < 1e-9) arrived.add(k)
        })
      }
      expect(arrived.size, `seed ${seed}: some form reached home early`).toBeGreaterThan(0)
    }
  })

  it('turns a form the short way round, allowing for its symmetry', () => {
    const comp = goodDynamic()
    const motion = createMotion(comp, createRng(1))
    const home = comp.shapes[0].rotation // a bar: looks the same every 180 degrees
    const start = home + 178
    motion.bodies[0].shape = { ...motion.bodies[0].shape, rotation: start }
    motion.restore()
    let steps = 0
    for (; steps < 200; steps++) {
      motion.step(0.05)
      if (!motion.restoring) break
      const r = motion.shapes[0].rotation
      expect(r).toBeGreaterThanOrEqual(start - 1e-6)
      expect(r).toBeLessThanOrEqual(start + 2 + 1e-6)
    }
    expect(steps).toBeLessThan(200)
    expect(motion.shapes[0].rotation).toBe(home)
  })

  it('never turns a circle on the way home either', () => {
    const comp = goodDynamic()
    const motion = createMotion(comp, createRng(8))
    drift(motion, 120)
    motion.restore()
    for (let i = 0; i < 120; i++) {
      motion.step(0.05)
      motion.shapes.forEach((s, k) => {
        if (s.type === 'circle') expect(s.rotation).toBe(comp.shapes[k].rotation)
      })
    }
  })

  it('moves smoothly: no form jumps between two frames', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { comp, motion } = scene(1920, 1080, seed, 'dynamic')
      const { U } = stageRect(comp.width, comp.height)
      drift(motion, 240)
      motion.restore()
      let prev = motion.shapes
      for (let i = 0; i < 60 * 6; i++) {
        motion.step(1 / 60)
        const next = motion.shapes
        next.forEach((s, k) => {
          expect(Math.hypot(s.cx - prev[k].cx, s.cy - prev[k].cy)).toBeLessThan(0.02 * U)
        })
        prev = next
      }
    }
  })

  it.each(VIEWPORTS)('keeps every form in the window on the way home at $name', ({ width, height }) => {
    const bad = []
    for (let seed = 0; seed < SEEDS; seed++) {
      const { comp, motion } = scene(width, height, seed)
      const edge = MOTION.edge * stageRect(comp.width, comp.height).U
      drift(motion, 180)
      motion.restore()
      for (let i = 0; i < 130; i++) {
        motion.step(0.05)
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

  it('drifts again afterwards, on new courses', () => {
    const { comp, motion } = scene(1920, 1080, 12, 'dynamic')
    const { U } = stageRect(comp.width, comp.height)
    const before = motion.bodies.map((b) => [b.vx, b.vy, b.spin])
    drift(motion, 30)
    motion.restore()
    settle(motion)
    const after = motion.bodies.map((b) => [b.vx, b.vy, b.spin])
    expect(after).not.toEqual(before)
    motion.bodies.forEach((b, i) => {
      expect(Math.hypot(b.vx, b.vy)).toBeGreaterThanOrEqual(MOTION.speed[0] * U - 1e-9)
      expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(MOTION.speed[1] * U + 1e-9)
      if (comp.shapes[i].type === 'circle') expect(b.spin).toBe(0)
      else expect(Math.abs(b.spin)).toBeGreaterThanOrEqual(MOTION.spin[0])
    })
    drift(motion, 30)
    expect(motion.shapes).not.toEqual(comp.shapes)
  })

  it('ignores a second request while the forms are already on their way', () => {
    const run = (twice) => {
      const { motion } = scene(1920, 1080, 21, 'dynamic')
      drift(motion, 60)
      motion.restore()
      for (let i = 0; i < 20; i++) motion.step(0.05)
      if (twice) motion.restore()
      for (let i = 0; i < 40; i++) motion.step(0.05)
      return motion.shapes
    }
    expect(run(true)).toEqual(run(false))
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
