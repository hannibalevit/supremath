// Static Suprematism: the "Black Square" family. One axis-aligned main form
// (square, circle or cross) near the centre and up to two small satellites
// kept well apart from it; mostly black with a single colour accent. There are
// always at least two forms.

import { randFloat, randSign, pick, pickWeighted } from './random.js'
import { shapeGeom, geomDistance, shapeArea } from './geometry.js'
import { balanceOffset } from './weight.js'
import { BLACK, COLOURS } from './palettes.js'
import { PARAMS } from './params.js'

const P = PARAMS.static

function makeSatellite(rng, U, mainArea, color) {
  const kind = pickWeighted(rng, ['square', 'circle', 'bar'], [0.4, 0.3, 0.3])
  const maxArea = P.satelliteArea * mainArea
  if (kind === 'bar') {
    const aspect = randFloat(rng, ...P.satelliteBar.aspect)
    const minH = Math.max(P.satelliteBar.thickness[0] * U, PARAMS.minBarThicknessPx)
    let h = randFloat(rng, minH, Math.max(minH, P.satelliteBar.thickness[1] * U))
    if (aspect * h * h > maxArea) h = Math.max(minH, Math.sqrt(maxArea / aspect))
    return { type: 'bar', w: aspect * h, h, rotation: pick(rng, [0, 90]), color, role: 'satellite' }
  }
  const lo = P.satelliteSize[0] * U
  const hi = Math.max(lo, Math.min(P.satelliteSize[1] * U, Math.sqrt(maxArea)))
  const side = randFloat(rng, lo, hi)
  return { type: kind, w: side, h: side, rotation: 0, color, role: 'satellite' }
}

// Looks for a spot on a quadrant diagonal that keeps the margin and the gap.
function placeSatellite(rng, stage, sat, obstacles, quadrant) {
  const margin = PARAMS.margin * stage.U
  const gap = PARAMS.gap * stage.U
  for (let k = 0; k < P.satelliteTries; k++) {
    const [qx, qy] = quadrant ?? [randSign(rng), randSign(rng)]
    const r = randFloat(rng, ...P.satelliteRadius)
    const placed = { ...sat, cx: stage.cx + (qx * r * stage.w) / 2, cy: stage.cy + (qy * r * stage.h) / 2 }
    const g = shapeGeom(placed)
    const b = g.bounds
    const inside =
      b.minX >= stage.x + margin &&
      b.maxX <= stage.x + stage.w - margin &&
      b.minY >= stage.y + margin &&
      b.maxY <= stage.y + stage.h - margin
    if (inside && obstacles.every((o) => geomDistance(o, g, gap) >= gap)) {
      return { placed, quadrant: [qx, qy] }
    }
  }
  return null
}

function satelliteColours(rng, main, count) {
  if (main === BLACK) {
    const first = pickWeighted(rng, [COLOURS.red, COLOURS.yellow, COLOURS.blue], [0.6, 0.25, 0.15])
    const others = [COLOURS.red, COLOURS.yellow, COLOURS.blue].filter((c) => c !== first)
    return count === 1 ? [first] : [first, pick(rng, [...others, BLACK])]
  }
  // a chromatic main form always gets a black satellite, so black is present
  return count === 1 ? [BLACK] : [BLACK, pick(rng, [BLACK, COLOURS.yellow])]
}

// Returns shapes, or null when no acceptable arrangement was found (the reason
// is left in buildStatic.lastFailure, which generate.js reports).
export function buildStatic(stage, rng) {
  const fail = (reason) => {
    buildStatic.lastFailure = reason
    return null
  }
  const { U } = stage
  const layout = pickWeighted(rng, P.layouts.values, P.layouts.weights)
  const type = pickWeighted(rng, P.mainTypes.values, P.mainTypes.weights)
  const size = randFloat(rng, ...P.mainSize[type].map((f) => f * U))
  // a coloured main form always gets a black satellite, so black is present
  const mainColour = pickWeighted(rng, [BLACK, COLOURS.red, COLOURS.blue], Object.values(P.mainColours))

  const main = {
    type,
    cx: stage.cx + randFloat(rng, -P.mainOffset, P.mainOffset) * stage.w,
    cy: stage.cy + randFloat(rng, -P.mainOffset, P.mainOffset) * stage.h,
    w: size,
    h: size,
    rotation: 0,
    color: mainColour,
    role: 'main',
  }
  const shapes = [main]
  const obstacles = [shapeGeom(main)]

  const satellites = layout === 'pair' ? 1 : 2
  const colours = satelliteColours(rng, mainColour, satellites)
  const mainArea = shapeArea(main)
  let quadrant = null
  for (let i = 0; i < satellites; i++) {
    const sat = makeSatellite(rng, U, mainArea, colours[i])
    // the second satellite sits opposite the first, so the pair balances
    const wanted = i === 1 ? [-quadrant[0], -quadrant[1]] : null
    const spot = placeSatellite(rng, stage, sat, obstacles, wanted)
    if (!spot) return fail('satellite')
    quadrant = spot.quadrant
    shapes.push(spot.placed)
    obstacles.push(shapeGeom(spot.placed))
  }

  if (balanceOffset(shapes, stage).norm > PARAMS.balance.static) return fail('balance')
  return shapes.map((s, i) => ({ id: `s${i}`, ...s }))
}
