// "Entropy": every form drifts in its own direction at its own slow speed, and
// every form except the circle turns at its own slow rate. Nothing steers them
// back, so the composition gradually comes apart, but forms bounce off the edge
// of the window and never leave it. The laws in validate.js describe the
// composition as generated; they are deliberately not kept while it moves.

import { stageRect, shapeBounds } from './geometry.js'

export const MOTION = {
  speed: [0.00125, 0.00325], // x U per second; every form picks its own
  spin: [1, 2], // degrees per second; every form but the circle picks its own, either way round
  edge: 0.01, // x U: forms bounce off the window edge this far in
  maxDt: 0.1, // seconds: a tab coming back from the background must not jump
}

const randIn = (rng, [min, max]) => rng() * (max - min) + min

// Gives every shape of `comp` a random velocity and spin and returns an object
// that moves them. `step(dt)` advances time by dt seconds; `shapes` is the
// current picture (plain shape objects, safe to render or validate).
export function createMotion(comp, rng) {
  const { U } = stageRect(comp.width, comp.height)
  const edge = MOTION.edge * U
  const area = { x0: edge, y0: edge, x1: comp.width - edge, y1: comp.height - edge }

  const bodies = comp.shapes.map((shape) => {
    const heading = rng() * Math.PI * 2
    const speed = randIn(rng, MOTION.speed) * U
    const spin = shape.type === 'circle' ? 0 : (rng() < 0.5 ? -1 : 1) * randIn(rng, MOTION.spin)
    return { shape: { ...shape }, vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed, spin }
  })

  // Pushes a form back inside the window and turns it away from the wall it hit.
  // Turning also changes how far the rotated form reaches, so a form that spins
  // into a wall is simply nudged along it.
  function bounce(body) {
    const b = shapeBounds(body.shape)
    let { cx, cy } = body.shape
    if (b.maxX - b.minX < area.x1 - area.x0) {
      if (b.minX < area.x0) {
        cx += area.x0 - b.minX
        body.vx = Math.abs(body.vx)
      } else if (b.maxX > area.x1) {
        cx -= b.maxX - area.x1
        body.vx = -Math.abs(body.vx)
      }
    }
    if (b.maxY - b.minY < area.y1 - area.y0) {
      if (b.minY < area.y0) {
        cy += area.y0 - b.minY
        body.vy = Math.abs(body.vy)
      } else if (b.maxY > area.y1) {
        cy -= b.maxY - area.y1
        body.vy = -Math.abs(body.vy)
      }
    }
    body.shape = { ...body.shape, cx, cy }
  }

  return {
    bodies,
    get shapes() {
      return bodies.map((body) => body.shape)
    },
    step(dt) {
      for (const body of bodies) {
        const s = body.shape
        body.shape = {
          ...s,
          cx: s.cx + body.vx * dt,
          cy: s.cy + body.vy * dt,
          rotation: (s.rotation + body.spin * dt) % 360,
        }
        bounce(body)
      }
    },
  }
}

// Elapsed animation time, independent of the refresh rate. Time spent paused
// is not counted, so resuming never jumps; one long gap is clamped to maxDt.
// `delta` is the step the last tick added.
export function createClock({ maxDt = MOTION.maxDt } = {}) {
  let elapsed = 0
  let delta = 0
  let last = null
  return {
    start(nowMs) {
      last = nowMs
    },
    tick(nowMs) {
      delta = last === null ? 0 : Math.min(Math.max((nowMs - last) / 1000, 0), maxDt)
      elapsed += delta
      last = nowMs
      return elapsed
    },
    pause() {
      last = null
    },
    reset() {
      elapsed = 0
      delta = 0
      last = null
    },
    get elapsed() {
      return elapsed
    },
    get delta() {
      return delta
    },
  }
}
