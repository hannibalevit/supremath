// Shared fixtures for the tests: hand-built reference compositions that are
// valid by the laws (independent of the generator), the viewports we support,
// and a table of "mutators" that each break exactly one rule.

import { shapeDistance, shapeOverlapArea, shapeArea, translateShape } from './geometry.js'
import { COLOURS } from './palettes.js'
import { generateComposition } from './generate.js'
import { validateComposition } from './validate.js'
import { createRng } from './random.js'

export const GOOD_VIEWPORT = { width: 1600, height: 1000 }

// Seeds per viewport and mode in the property tests. Run
// `VITE_PROP_SEEDS=2000 npm test` for the thorough version.
export const seedCount = (fallback) => Number(import.meta.env?.VITE_PROP_SEEDS) || fallback

// Generates `seeds` compositions and checks every one against the validator.
export function runBatch({ width, height, mode, seeds }) {
  const out = { total: 0, failures: [], attempts: 0, tier0: 0, fallbacks: { conservative: 0, static: 0, minimal: 0 } }
  for (let seed = 0; seed < seeds; seed++) {
    const comp = generateComposition({ width, height, rng: createRng(seed), mode })
    const { valid, violations } = validateComposition(comp)
    out.total++
    out.attempts += comp.meta.attempts
    const codes = [...new Set(violations.map((v) => v.code))]
    if (comp.shapes.length < 2) codes.push('TOO_FEW_FORMS')
    if (!valid || codes.length) out.failures.push({ seed, codes })
    if (comp.meta.fallback) out.fallbacks[comp.meta.fallback]++
    else out.tier0++
  }
  return out
}

export const VIEWPORTS = [
  [1920, 1080], [1366, 768], [2560, 1440], [3440, 1440], [5120, 1440],
  [1024, 768], [800, 800], [768, 1024], [390, 844], [360, 640],
  [320, 568], [430, 932], [1080, 1920], [600, 2400], [240, 240], [240, 1000],
].map(([width, height]) => ({ width, height, name: `${width}x${height}` }))

const bar = (id, cx, cy, w, h, rotation, color) => ({ id, type: 'bar', cx, cy, w, h, rotation, color })
const sq = (id, cx, cy, s, rotation, color) => ({ id, type: 'square', cx, cy, w: s, h: s, rotation, color })

// Dynamic: red bar dominant, a black bar crossing it at 90 degrees, a shared
// -30 degree tilt, one free accent (yellow bar), a rising diagonal rhythm.
export const goodDynamic = () => ({
  mode: 'dynamic',
  ...GOOD_VIEWPORT,
  shapes: [
    bar('s0', 510, 560, 480, 120, -30, COLOURS.red),
    bar('s1', 680, 450, 360, 64, 60, COLOURS.black),
    sq('s2', 940, 650, 150, -30, COLOURS.blue),
    { id: 's3', type: 'circle', cx: 1220, cy: 330, w: 120, h: 120, rotation: 0, color: COLOURS.yellow },
    bar('s4', 1270, 600, 300, 22, -30, COLOURS.black),
    bar('s5', 920, 230, 120, 30, -55, COLOURS.yellow),
  ],
})

// Static: a black square near the centre, two small satellites.
export const goodStatic = () => ({
  mode: 'static',
  ...GOOD_VIEWPORT,
  shapes: [
    sq('s0', 800, 500, 380, 0, COLOURS.black),
    sq('s1', 1220, 250, 80, 0, COLOURS.red),
    bar('s2', 420, 780, 180, 14, 90, COLOURS.black),
  ],
})

export const find = (comp, id) => comp.shapes.find((s) => s.id === id)

// Slide `moving` along `dir` (unit vector from fixed towards moving) until the
// distance to `fixed` is exactly `distance`.
export function placeAtDistance(moving, fixed, dir, distance) {
  const centreGap = Math.hypot(moving.cx - fixed.cx, moving.cy - fixed.cy)
  let lo = -centreGap // centres coincide: overlapping
  let hi = 3000
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2
    const d = shapeDistance(fixed, translateShape(moving, dir[0] * mid, dir[1] * mid))
    if (d < distance) lo = mid
    else hi = mid
  }
  return translateShape(moving, dir[0] * hi, dir[1] * hi)
}

// Slide `moving` away from `fixed` until only `fraction` of `moving`'s area overlaps.
export function slideToOverlapFraction(moving, fixed, dir, fraction) {
  let lo = 0
  let hi = 1000
  const area = shapeArea(moving)
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2
    const f = shapeOverlapArea(fixed, translateShape(moving, dir[0] * mid, dir[1] * mid)) / area
    if (f > fraction) lo = mid
    else hi = mid
  }
  return translateShape(moving, dir[0] * hi, dir[1] * hi)
}

const unit = (from, to) => {
  const d = Math.hypot(to.cx - from.cx, to.cy - from.cy)
  return [(to.cx - from.cx) / d, (to.cy - from.cy) / d]
}

const replace = (comp, id, next) => {
  comp.shapes = comp.shapes.map((s) => (s.id === id ? next : s))
}

const mutator = (code, base, mutate) => ({ code, base, mutate })

// Each mutator takes a fresh reference composition and breaks (at least) the
// rule named by `code`. validate.test.js asserts the validator reports it, and
// fails if a violation code has no mutator here.
export const MUTATORS = [
  mutator('SCHEMA', 'dynamic', (c) => { find(c, 's0').w = Number.NaN }),
  mutator('FLAT_COLOUR', 'dynamic', (c) => { find(c, 's0').gradient = 'url(#grad)' }),
  mutator('PALETTE', 'dynamic', (c) => { find(c, 's3').color = '#123456' }),
  mutator('COLOUR_COUNT', 'dynamic', (c) => { find(c, 's5').color = COLOURS.green }),
  mutator('BLACK_PRESENT', 'dynamic', (c) => {
    find(c, 's1').color = COLOURS.blue
    find(c, 's4').color = COLOURS.blue
  }),
  mutator('COUNT', 'dynamic', (c) => { c.shapes = c.shapes.slice(0, 4) }),
  mutator('MARGIN', 'dynamic', (c) => { find(c, 's3').cx = c.width - 10 }),
  mutator('MIN_SIZE', 'dynamic', (c) => {
    const s = find(c, 's4')
    s.w = 60
    s.h = 2
  }),
  mutator('COVERAGE', 'dynamic', (c) => c.shapes.forEach((s) => { s.w *= 2.3; s.h *= 2.3 })),
  mutator('NEAR_MISS', 'dynamic', (c) => {
    const fixed = find(c, 's2')
    const moving = find(c, 's3')
    replace(c, 's3', placeAtDistance(moving, fixed, unit(fixed, moving), 8))
  }),
  mutator('GRAZE', 'dynamic', (c) => {
    const fixed = find(c, 's0')
    const moving = find(c, 's1')
    replace(c, 's1', slideToOverlapFraction(moving, fixed, unit(fixed, moving), 0.03))
  }),
  mutator('OVERLAP_RULES', 'dynamic', (c) => { find(c, 's1').color = COLOURS.red }),
  mutator('CROSSING_ANGLE', 'dynamic', (c) => { find(c, 's1').rotation = -20 }),
  mutator('Z_ORDER', 'dynamic', (c) => { c.shapes = [c.shapes[1], c.shapes[0], ...c.shapes.slice(2)] }),
  mutator('BALANCE', 'dynamic', (c) => c.shapes.forEach((s) => { s.cx += 300 })),
  mutator('HIERARCHY', 'dynamic', (c) => {
    const s = find(c, 's0')
    s.w = 300
    s.h = 100
  }),
  mutator('VOCABULARY', 'dynamic', (c) => {
    replace(c, 's4', { id: 's4', type: 'circle', cx: 1270, cy: 600, w: 60, h: 60, rotation: 0, color: COLOURS.black })
    replace(c, 's5', { id: 's5', type: 'circle', cx: 920, cy: 230, w: 50, h: 50, rotation: 0, color: COLOURS.yellow })
  }),
  mutator('ORIENTATION', 'dynamic', (c) => {
    const rotations = { s0: -10, s1: 15, s2: 33, s4: 50, s5: 70 }
    for (const [id, r] of Object.entries(rotations)) find(c, id).rotation = r
  }),
  mutator('FREE_ACCENTS', 'dynamic', (c) => {
    find(c, 's2').rotation = 0
    find(c, 's4').rotation = -70
    find(c, 's5').rotation = -5
  }),
  mutator('ANGLE_TANGENCY', 'dynamic', (c) => { find(c, 's5').rotation = -22 }),
  mutator('TILT', 'dynamic', (c) => c.shapes.forEach((s) => { if (s.type !== 'circle') s.rotation = -5 })),
  mutator('NOT_AXIS_ALIGNED', 'dynamic', (c) => { find(c, 's5').rotation = 0 }),
  mutator('DOMINANT_OFFCENTRE', 'dynamic', (c) => {
    find(c, 's0').cx = 800
    find(c, 's0').cy = 500
  }),
  mutator('CENTRAL_AXES', 'dynamic', (c) => { find(c, 's0').cx = 800 }),
  mutator('ASCENT', 'dynamic', (c) => c.shapes.forEach((s) => { s.cy = c.height - s.cy })),
  mutator('RHYTHM', 'dynamic', (c) => c.shapes.forEach((s, i) => { s.cx = 250 + 220 * i; s.cy = 600 - 40 * i })),
  mutator('SPREAD', 'dynamic', (c) => c.shapes.forEach((s) => {
    s.cx = 800 + (s.cx - 800) * 0.25
    s.cy = 500 + (s.cy - 500) * 0.25
  })),
  mutator('MIRROR', 'dynamic', (c) => {
    const twin = find(c, 's3')
    c.shapes.push({ ...twin, id: 's6', cx: c.width - twin.cx, cy: c.height - twin.cy })
  }),
  mutator('COLOUR_BUDGET', 'dynamic', (c) => {
    find(c, 's0').color = COLOURS.black
    find(c, 's2').color = COLOURS.black
  }),
  mutator('STATIC_FORM', 'static', (c) => {
    const s = find(c, 's1')
    s.w = 250
    s.h = 250
  }),
  mutator('STATIC_ORIENTATION', 'static', (c) => { find(c, 's0').rotation = 20 }),
  mutator('STATIC_CENTRED', 'static', (c) => { find(c, 's0').cx += 200 }),
  mutator('STATIC_NO_OVERLAP', 'static', (c) => {
    find(c, 's1').cx = 900
    find(c, 's1').cy = 400
  }),
  mutator('STATIC_COLOUR', 'static', (c) => { find(c, 's0').color = COLOURS.yellow }),
]
