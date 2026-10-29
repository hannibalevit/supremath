// "Entropy": every form drifts in its own direction at its own slow speed, and
// every form except the circle turns at its own slow rate. Nothing steers them
// back, so the composition gradually comes apart, but forms bounce off the edge
// of the window and never leave it. The laws in validate.js describe the
// composition as generated; they are deliberately not kept while it moves.
//
// The one thing that does steer them back is `restore()`, which the viewer asks
// for: every form glides home to where it was generated, and then drifts again.

import { stageRect, shapeBounds, shapeRadius } from './geometry.js'

export const MOTION = {
  speed: [0.00125, 0.00325], // x U per second; every form picks its own
  spin: [1, 2], // degrees per second; every form but the circle picks its own, either way round
  edge: 0.01, // x U: forms bounce off the window edge this far in
  maxDt: 0.1, // seconds: a tab coming back from the background must not jump
  restore: [3, 5], // seconds each form takes to get home; every form picks its own
}

// A form looks the same after turning this far, so it can go home the short way round.
const SYMMETRY = { square: 90, cross: 90, bar: 180, triangle: 360, circle: 360 }

const randIn = (rng, [min, max]) => rng() * (max - min) + min
const smoothstep = (u) => u * u * (3 - 2 * u)

// A form turns about its centre, so it can only turn where the whole circle
// around it fits inside the window. The circle never turns (it looks the same),
// and a very long line cannot turn without leaving the window: it keeps its
// angle, and still drifts and bounces.
export function canTurn(shape, width, height) {
  if (shape.type === 'circle') return false
  const { U } = stageRect(width, height)
  return 2 * shapeRadius(shape) <= Math.min(width, height) - 2 * MOTION.edge * U
}

// Signed turn, smaller than half the symmetry, that takes a form from angle
// `from` to the same-looking angle `to`.
const shortTurn = (from, to, symmetry) =>
  ((((to - from + symmetry / 2) % symmetry) + symmetry) % symmetry) - symmetry / 2

// Gives every shape of `comp` a random velocity and spin and returns an object
// that moves them. `step(dt)` advances time by dt seconds; `shapes` is the
// current picture (plain shape objects, safe to render or validate).
export function createMotion(comp, rng) {
  const { U } = stageRect(comp.width, comp.height)
  const edge = MOTION.edge * U
  const area = { x0: edge, y0: edge, x1: comp.width - edge, y1: comp.height - edge }

  // a fresh random course for a form; a form that cannot turn (see canTurn) does not
  function launch(shape) {
    const heading = rng() * Math.PI * 2
    const speed = randIn(rng, MOTION.speed) * U
    const spin = canTurn(shape, comp.width, comp.height) ? (rng() < 0.5 ? -1 : 1) * randIn(rng, MOTION.spin) : 0
    return { vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed, spin }
  }

  const bodies = comp.shapes.map((shape) => ({ shape: { ...shape }, ...launch(shape) }))

  // Set while the forms are on their way home (see restore()): `t` seconds since
  // they set off, and for each form where it started, how far to turn and how
  // long its own journey takes.
  let homeward = null

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

  // Every form glides along its own straight line, eased at both ends. A form
  // that gets home first waits there, so the generated composition is whole
  // again at one moment, exactly as generated.
  function goHome(dt) {
    homeward.t += dt
    bodies.forEach((body, i) => {
      const { from, turn, time } = homeward.legs[i]
      const home = comp.shapes[i]
      const e = smoothstep(Math.min(homeward.t / time, 1))
      body.shape = {
        ...from,
        cx: from.cx + (home.cx - from.cx) * e,
        cy: from.cy + (home.cy - from.cy) * e,
        rotation: from.rotation + turn * e,
      }
      bounce(body)
    })
    if (homeward.t >= homeward.end) {
      bodies.forEach((body, i) => {
        body.shape = { ...comp.shapes[i] }
        Object.assign(body, launch(body.shape))
      })
      homeward = null
    }
  }

  return {
    bodies,
    get shapes() {
      return bodies.map((body) => body.shape)
    },
    // true while the forms are on their way home
    get restoring() {
      return homeward !== null
    },
    // Sends every form back to where it was generated, each in its own time, and
    // then lets them drift again on new courses. Does nothing while they are
    // already on their way.
    restore() {
      if (homeward) return
      const legs = bodies.map((body, i) => ({
        from: body.shape,
        turn: shortTurn(body.shape.rotation, comp.shapes[i].rotation, SYMMETRY[body.shape.type]),
        time: randIn(rng, MOTION.restore),
      }))
      homeward = { t: 0, legs, end: Math.max(...legs.map((leg) => leg.time)) }
    },
    step(dt) {
      if (homeward) {
        goHome(dt)
        return
      }
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
