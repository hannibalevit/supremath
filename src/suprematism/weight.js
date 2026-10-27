// Visual weight and balance (Arnheim's lever principle): a shape weighs more
// when it is bigger, darker, and farther from the centre of the frame.
//
// This module is shared by the generator and the validator, so it has its own
// tests with hand-computed values; a wrong formula would otherwise pass both.

import { shapeArea } from './geometry.js'
import { colourFactor } from './palettes.js'

const AREA_EXPONENT = 0.85 // sub-linear: doubling the area less than doubles the weight
const DISTANCE_GAIN = 0.6 // a shape in a corner weighs 1.6x the same shape at the centre

const factorCache = new Map()
function cachedColourFactor(hex) {
  let f = factorCache.get(hex)
  if (f === undefined) {
    f = colourFactor(hex)
    factorCache.set(hex, f)
  }
  return f
}

// 0 at the stage centre, 1 at a corner
export function centreDistance(shape, stage) {
  const nx = (shape.cx - stage.cx) / (stage.w / 2)
  const ny = (shape.cy - stage.cy) / (stage.h / 2)
  return Math.hypot(nx, ny) / Math.SQRT2
}

export function visualWeight(shape, stage) {
  const area = shapeArea(shape) / (stage.w * stage.h)
  return (
    area ** AREA_EXPONENT *
    cachedColourFactor(shape.color) *
    (1 + DISTANCE_GAIN * centreDistance(shape, stage))
  )
}

// Position-independent weight: size and colour only. Used where the question
// is "which shapes are heavy" rather than "where does the weight pull".
export function visualMass(shape, stage) {
  const area = shapeArea(shape) / (stage.w * stage.h)
  return area ** AREA_EXPONENT * cachedColourFactor(shape.color)
}

// Weights as if every shape were moved by (dx, dy), given the precomputed
// (position-independent) masses. Allocation-free: the generator calls this in
// the inner loop of its position search.
export function weightsShifted(shapes, masses, stage, dx, dy, out = new Array(shapes.length)) {
  const hw = stage.w / 2
  const hh = stage.h / 2
  for (let i = 0; i < shapes.length; i++) {
    const nx = (shapes[i].cx + dx - stage.cx) / hw
    const ny = (shapes[i].cy + dy - stage.cy) / hh
    out[i] = masses[i] * (1 + (DISTANCE_GAIN * Math.hypot(nx, ny)) / Math.SQRT2)
  }
  return out
}

export const weights = (shapes, stage) => shapes.map((s) => visualWeight(s, stage))

export function centreOfMass(shapes, stage) {
  const ws = weights(shapes, stage)
  let total = 0
  let x = 0
  let y = 0
  shapes.forEach((s, i) => {
    total += ws[i]
    x += ws[i] * s.cx
    y += ws[i] * s.cy
  })
  if (total === 0) return { x: stage.cx, y: stage.cy, total: 0 }
  return { x: x / total, y: y / total, total }
}

// Offset of the centre of mass from the stage centre, in half-stage units.
export function balanceOffset(shapes, stage) {
  const g = centreOfMass(shapes, stage)
  const bx = (g.x - stage.cx) / (stage.w / 2)
  const by = (g.y - stage.cy) / (stage.h / 2)
  return { bx, by, norm: Math.hypot(bx, by) }
}
