// Dynamic Suprematism: forms of very different size and weight, tilted along
// one shared diagonal, floating asymmetrically on the white ground.
//
// Pipeline (every step returns early with null on failure; generate.js retries):
//   forms -> area ladder -> colours -> dimensions -> orientation -> placement
//   along a rising axis -> crossings -> gap/margin relaxation -> balance.
// The validator (validate.js) is the final judge; nothing here is trusted.

import { randFloat, randInt, chance, pick, pickWeighted, shuffle, randSign } from './random.js'
import {
  shapeArea,
  shapeGeom,
  shapeBounds,
  shapeRadius,
  geomDistance,
  geomOverlapArea,
  translateGeom,
  translateShape,
} from './geometry.js'
import { visualMass, weightsShifted } from './weight.js'
import { validateComposition, LIMITS } from './validate.js'
import { PALETTES, BLACK } from './palettes.js'
import { PARAMS } from './params.js'

const D = PARAMS.dynamic
const DEG = Math.PI / 180

const mod = (a, n) => ((a % n) + n) % n
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const isBar = (s) => s.type === 'bar'

// --- forms, areas, dimensions ------------------------------------------------

function chooseForms(rng, n, conservative) {
  const secondary = n >= 7 ? 2 : 1
  const forms = []
  for (let slot = 0; slot < n; slot++) {
    const spec = slot <= secondary ? D.bigForms : D.accentForms
    let form = pickWeighted(rng, spec.values, spec.weights)
    if (conservative && (form === 'cross' || form === 'triangle')) form = 'bar'
    forms.push(form)
  }
  const caps = { square: 2, circle: 2, cross: 1, triangle: 1 }
  for (const [form, max] of Object.entries(caps)) {
    let seen = 0
    for (let i = 0; i < n; i++) if (forms[i] === form && ++seen > max) forms[i] = 'bar'
  }
  const barish = (f) => f === 'bar' || f === 'line'
  const needBars = Math.max(2, Math.ceil(0.4 * n - 1e-9))
  for (let i = n - 1; i >= 1 && forms.filter(barish).length < needBars; i--) {
    if (!barish(forms[i])) forms[i] = 'bar'
  }
  return { forms, secondary }
}

// Geometric ladder: one dominant form, each next roughly half the previous.
function ladderAreas(rng, n, stage, conservative) {
  const range = conservative ? D.areaOfUConservative : D.areaOfU
  // a square stage has the least room along its diagonal, so forms shrink there
  const elongation = (stage.w * stage.h) / stage.U ** 2 // 1 for a square
  const roomy = Math.min(1, D.squareScale + (1 - D.squareScale) * ((elongation - 1) / D.roomyElongation))
  const total = Math.max(randFloat(rng, ...range) * stage.U ** 2 * roomy, D.minShareOfStage * stage.w * stage.h)
  const rho = randFloat(rng, ...D.ladder.rho)
  const raw = Array.from({ length: n }, (_, k) => rho ** k * randFloat(rng, ...D.ladder.jitter))
  raw[1] = Math.min(raw[1], D.ladder.secondMax * raw[0])
  const norm = total / sum(raw)
  return raw.map((r) => r * norm).sort((a, b) => b - a)
}

function makeShape(rng, form, area, U, big) {
  const floors = D.minSize
  switch (form) {
    case 'square': {
      const s = Math.max(Math.sqrt(area), floors.square * U)
      return { type: 'square', w: s, h: s }
    }
    case 'circle': {
      const d = Math.max(2 * Math.sqrt(area / Math.PI), floors.circle * U)
      return { type: 'circle', w: d, h: d }
    }
    case 'cross': {
      const w = Math.max(Math.sqrt(area / 0.51), floors.cross * U)
      return { type: 'cross', w, h: w }
    }
    case 'triangle': {
      const q = randFloat(rng, 0.8, 1.2)
      const w = Math.max(Math.sqrt((2 * area) / q), floors.triangle * U)
      return { type: 'triangle', w, h: q * w }
    }
    default: {
      const [lo, hi] = form === 'line' ? D.barAspect.line : big ? D.barAspect.big : D.barAspect.accent
      const aspect = randFloat(rng, lo, hi)
      const h = Math.max(Math.sqrt(area / aspect), Math.max(0.012 * U, PARAMS.minBarThicknessPx))
      return { type: 'bar', w: aspect * h, h }
    }
  }
}

// --- colour --------------------------------------------------------------------

function assignColours(rng, shapes, palette, accents) {
  const shares = D.colourShares
  const blackLeads = chance(rng, D.dominantBlack)
  // colour 0 = lead, 1 = black, 2.. = accents
  const colours = [palette.lead, BLACK, ...accents]
  const target = [
    blackLeads ? shares.black : shares.lead,
    blackLeads ? shares.lead : shares.black,
    ...(accents.length > 1 ? [shares.accent1, shares.accent2] : [shares.accent1 + shares.accent2]),
  ]
  const areas = shapes.map(shapeArea)
  const total = sum(areas)
  // the dominant form takes the leading colour (or black); thin lines are
  // mostly black ("economy"); everything else is searched
  const fixed = shapes.map((s, i) => {
    if (i === 0) return blackLeads ? 1 : 0
    return isBar(s) && s.w / s.h >= 10 && chance(rng, D.lineBlack) ? 1 : -1
  })

  let best = null
  let bestCost = Infinity
  for (let attempt = 0; attempt < 24; attempt++) {
    const chosen = fixed.slice()
    const remaining = target.map((t) => t * total)
    fixed.forEach((k, i) => {
      if (k >= 0) remaining[k] -= areas[i]
    })
    shapes.forEach((s, i) => {
      if (chosen[i] >= 0) return
      // favour colours that are still below their target share
      const weights = remaining.map((r) => Math.max(r, 0) + 0.02 * total)
      const k = pickWeighted(rng, weights.map((w, j) => j), weights)
      chosen[i] = k
      remaining[k] -= areas[i]
    })
    const got = target.map(() => 0)
    chosen.forEach((k, i) => {
      got[k] += areas[i] / total
    })
    let cost = sum(got.map((g, k) => (g - target[k]) ** 2))
    if (got[1] <= 0) cost += 10 // black must appear
    if (got[1] > 0.58) cost += 5 // ...but not take over
    const lead = Math.max(...got)
    if (lead < 0.42 || lead > 0.78) cost += 5 // one colour leads
    if (got.filter((g) => g > 0).length < 2) cost += 10
    if (cost < bestCost) {
      bestCost = cost
      best = chosen
    }
  }
  shapes.forEach((s, i) => {
    s.color = colours[best[i]]
  })
}

// --- orientation -----------------------------------------------------------------

function orient(rng, stage, shapes, secondary, conservative) {
  const aspect = stage.w / stage.h
  const range = aspect > 1.3 ? D.tilt.landscape : aspect < 0.77 ? D.tilt.portrait : D.tilt.square
  const tau = randFloat(rng, ...range)
  const rc = chance(rng, 0.5) ? -tau : tau // rising to the right, or to the left
  for (const s of shapes) {
    if (s.type === 'circle') s.rotation = 0
    else s.rotation = isBar(s) && chance(rng, D.perpendicularBars) ? rc + 90 : rc
  }

  // a few small free accents break the parallelism, but never form a "near miss"
  const n = shapes.length
  const oriented = shapes.filter((s) => s.type !== 'circle').length
  const maxFree = conservative ? 0 : Math.min(2, Math.floor(n / 4))
  let free = randInt(rng, 0, maxFree + 1)
  while (free > 0 && oriented - free < Math.max(3, Math.ceil(0.6 * oriented - 1e-9))) free--
  const candidates = shapes
    .map((s, i) => i)
    .filter((i) => i > secondary && shapes[i].type !== 'circle')
    .reverse() // smallest first
    .slice(0, free)
  for (const i of candidates) {
    for (let tries = 0; tries < 20; tries++) {
      const rotation = rc + randSign(rng) * randFloat(rng, ...D.freeAccent.deviation)
      const m = mod(rotation, 90)
      if (m >= D.freeAccent.wrapMin && m <= 90 - D.freeAccent.wrapMin) {
        shapes[i].rotation = rotation
        break
      }
    }
  }
  return rc
}

// The whole composition shrinks together if any rotated form would not fit
// (so the size relations survive), then tiny forms are lifted to the minimum
// sizes.
function fitToStage(stage, shapes) {
  const { U } = stage
  const margin = PARAMS.margin * U
  const maxW = D.fit * (stage.w - 2 * margin)
  const maxH = D.fit * (stage.h - 2 * margin)
  let scale = 1
  for (const s of shapes) {
    const b = shapeBounds({ ...s, cx: 0, cy: 0 })
    scale = Math.min(scale, maxW / (b.maxX - b.minX), maxH / (b.maxY - b.minY))
  }
  const minThickness = Math.max(0.012 * U, PARAMS.minBarThicknessPx)
  for (const s of shapes) {
    s.w *= scale
    s.h *= scale
    if (isBar(s)) {
      if (s.h < minThickness) {
        const aspect = s.w / s.h
        s.h = minThickness
        s.w = aspect * minThickness
      }
    } else if (s.w < D.minSize[s.type] * U) {
      const q = s.h / s.w
      s.w = D.minSize[s.type] * U
      s.h = q * s.w
    }
  }
  return shapes.every((s) => {
    const b = shapeBounds({ ...s, cx: 0, cy: 0 })
    return b.maxX - b.minX <= maxW * 1.001 && b.maxY - b.minY <= maxH * 1.001
  })
}

// --- placement ---------------------------------------------------------------------

function cv(values) {
  const mean = sum(values) / values.length
  return Math.sqrt(sum(values.map((v) => (v - mean) ** 2)) / values.length) / mean
}

// Chooses a rising axis and puts the forms on it with irregular spacing:
// the dominant at the golden section, heavy forms low, light forms high.
function placeAlongAxis(rng, stage, shapes, rc, masses) {
  const { U } = stage
  const A = D.axis
  let axis = null
  for (let tries = 0; tries < 10 && !axis; tries++) {
    const angle = rc + (chance(rng, A.parallel) ? 0 : 90) + randFloat(rng, -A.jitter, A.jitter)
    let ux = Math.cos(angle * DEG)
    let uy = Math.sin(angle * DEG)
    if (uy > 0) {
      ux = -ux
      uy = -uy
    }
    if (-uy >= Math.sin(A.minElevation * DEG)) axis = [ux, uy]
  }
  if (!axis) return false
  const [ux, uy] = axis

  const inset = PARAMS.margin * U + A.inset * U
  const box = { x0: stage.x + inset, x1: stage.x + stage.w - inset, y0: stage.y + inset, y1: stage.y + stage.h - inset }
  const p0 = {
    x: stage.cx + randFloat(rng, -A.centreJitter, A.centreJitter) * stage.w,
    y: stage.cy + randFloat(rng, -A.centreJitter, A.centreJitter) * stage.h,
  }
  let tmin = -Infinity
  let tmax = Infinity
  for (const [u, p, lo, hi] of [[ux, p0.x, box.x0, box.x1], [uy, p0.y, box.y0, box.y1]]) {
    if (Math.abs(u) < 1e-9) continue
    const t1 = (lo - p) / u
    const t2 = (hi - p) / u
    tmin = Math.max(tmin, Math.min(t1, t2))
    tmax = Math.min(tmax, Math.max(t1, t2))
  }
  if (!(tmax - tmin > 0.3 * U)) return false
  const span = (tmax - tmin) * randFloat(rng, ...A.span)
  const tmid = (tmin + tmax) / 2

  const n = shapes.length
  let gaps
  for (let tries = 0; tries < 10; tries++) {
    gaps = shuffle(rng, D.gaps.base)
      .slice(0, n - 1)
      .map((g) => g * randFloat(rng, ...D.gaps.jitter))
    if (cv(gaps) >= D.gaps.minCV) break
  }
  const total = sum(gaps)
  const ts = [-1]
  for (const g of gaps) ts.push(ts.at(-1) + (2 * g) / total)

  // slots: the dominant goes to the golden section, the rest by weight
  const goldenSlot = ts.reduce((best, t, k) => (Math.abs(t - D.gaps.goldenSlot) < Math.abs(ts[best] - D.gaps.goldenSlot) ? k : best), 0)
  const rest = shapes
    .map((s, i) => i)
    .filter((i) => i !== 0)
    .sort((a, b) => masses[b] - masses[a])
  for (let k = 0; k + 1 < rest.length; k++) {
    if (chance(rng, 0.25)) [rest[k], rest[k + 1]] = [rest[k + 1], rest[k]]
  }
  const order = new Array(n)
  order[goldenSlot] = 0
  let next = 0
  for (let k = 0; k < n; k++) if (k !== goldenSlot) order[k] = rest[next++]

  let side = randSign(rng)
  for (let k = 0; k < n; k++) {
    const i = order[k]
    let off
    if (i === 0) {
      off = randSign(rng) * randFloat(rng, ...D.offsets.dominant) * U
    } else {
      side = chance(rng, D.offsets.flip) ? side : -side
      off = side * randFloat(rng, ...D.offsets.other) * U
    }
    const t = tmid + (ts[k] * span) / 2
    shapes[i].cx = p0.x + ux * t - uy * off
    shapes[i].cy = p0.y + uy * t + ux * off
  }
  return true
}

// --- crossings -----------------------------------------------------------------------

function axisAngles(s) {
  if (s.type === 'bar') return [mod(s.rotation, 180)]
  if (s.type === 'cross') return [mod(s.rotation, 180), mod(s.rotation + 90, 180)]
  return null
}
const lineDiff = (a, b) => {
  const d = mod(a - b, 180)
  return Math.min(d, 180 - d)
}

function crossingAngleOk(b, t) {
  const a1 = axisAngles(b)
  const a2 = axisAngles(t)
  if (!a2) return true
  return Math.min(...a1.flatMap((x) => a2.map((y) => lineDiff(x, y)))) >= 28
}

// Slides a long bar towards a larger form until about a third of it overlaps.
// Returns the pairs that now cross.
function makeCrossings(rng, shapes, palette, conservative) {
  const want = conservative ? 0 : pickWeighted(rng, D.crossings.values, D.crossings.weights)
  const crossed = []
  if (!want) return crossed
  const areas = shapes.map(shapeArea)
  const uses = new Array(shapes.length).fill(0)
  const candidates = []
  shapes.forEach((b, i) => {
    if (!isBar(b) || b.w / b.h < D.crossings.minAspect) return
    shapes.forEach((t, j) => {
      if (j !== i && areas[j] > areas[i] && crossingAngleOk(b, t)) candidates.push([i, j])
    })
  })
  for (const [i, j] of shuffle(rng, candidates)) {
    if (crossed.length >= want) break
    if (uses[i] > 0 || uses[j] > 1) continue
    const b = shapes[i]
    const t = shapes[j]
    const dx = t.cx - b.cx
    const dy = t.cy - b.cy
    const dist = Math.hypot(dx, dy)
    if (dist < 1e-6) continue
    const dir = [dx / dist, dy / dist]
    const tGeom = shapeGeom(t)
    const bGeom = shapeGeom(b)
    const fraction = (s) => geomOverlapArea(tGeom, translateGeom(bGeom, dir[0] * s, dir[1] * s)) / areas[i]
    const target = randFloat(rng, ...D.crossings.fraction)
    if (fraction(dist) < target) continue
    let lo = 0
    let hi = dist
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2
      if (fraction(mid) < target) lo = mid
      else hi = mid
    }
    shapes[i] = translateShape(b, dir[0] * hi, dir[1] * hi)
    if (shapes[i].color === t.color) shapes[i].color = t.color === BLACK ? palette.lead : BLACK
    uses[i]++
    uses[j]++
    crossed.push([i, j])
  }
  return crossed
}

// --- relaxation -------------------------------------------------------------------------

function groupsOf(n, crossed) {
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  for (const [a, b] of crossed) parent[find(a)] = find(b)
  return parent.map((_, i) => find(i))
}

// Smallest shift of `moving` along `dir` that leaves `gap` between the shapes.
function separationShift(fixed, moving, dir, gap) {
  const centre = Math.hypot(moving.shape.cx - fixed.shape.cx, moving.shape.cy - fixed.shape.cy)
  let lo = 0
  let hi = Math.max(0, shapeRadius(fixed.shape) + shapeRadius(moving.shape) + gap - centre) + 1
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2
    if (geomDistance(fixed, translateGeom(moving, dir[0] * mid, dir[1] * mid), gap) >= gap) hi = mid
    else lo = mid
  }
  return hi
}

// Pushes unrelated forms at least `gap` apart and keeps every form inside the
// margin. Crossing pairs move together as rigid groups.
function relax(rng, stage, shapes, groups, masses, gap) {
  const margin = PARAMS.margin * stage.U
  const n = shapes.length
  const members = new Map()
  groups.forEach((g, i) => members.set(g, [...(members.get(g) ?? []), i]))
  const groupMass = (g) => sum(members.get(g).map((i) => masses[i]))
  const geoms = shapes.map(shapeGeom)
  const moveGroup = (g, dx, dy) => {
    for (const i of members.get(g)) {
      shapes[i] = translateShape(shapes[i], dx, dy)
      geoms[i] = shapeGeom(shapes[i])
    }
  }

  for (let iter = 0; iter < D.relaxIterations; iter++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (groups[i] === groups[j]) continue
        const gi = geoms[i]
        const gj = geoms[j]
        if (geomDistance(gi, gj, gap) >= gap) continue
        let dx = shapes[j].cx - shapes[i].cx
        let dy = shapes[j].cy - shapes[i].cy
        let len = Math.hypot(dx, dy)
        if (len < 1e-6) {
          const a = rng() * Math.PI * 2
          dx = Math.cos(a)
          dy = Math.sin(a)
          len = 1
        }
        const dir = [dx / len, dy / len]
        const s = separationShift(gi, gj, dir, gap) + 0.5
        const mi = groupMass(groups[i])
        const mj = groupMass(groups[j])
        moveGroup(groups[j], dir[0] * s * (mi / (mi + mj)), dir[1] * s * (mi / (mi + mj)))
        moveGroup(groups[i], -dir[0] * s * (mj / (mi + mj)), -dir[1] * s * (mj / (mi + mj)))
        changed = true
      }
    }
    // keep every group inside the margin
    for (const [g, ids] of members) {
      const bs = ids.map((i) => shapeBounds(shapes[i]))
      const minX = Math.min(...bs.map((b) => b.minX))
      const maxX = Math.max(...bs.map((b) => b.maxX))
      const minY = Math.min(...bs.map((b) => b.minY))
      const maxY = Math.max(...bs.map((b) => b.maxY))
      if (maxX - minX > stage.w - 2 * margin || maxY - minY > stage.h - 2 * margin) return false
      const dx = Math.max(0, stage.x + margin - minX) - Math.max(0, maxX - (stage.x + stage.w - margin))
      const dy = Math.max(0, stage.y + margin - minY) - Math.max(0, maxY - (stage.y + stage.h - margin))
      if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
        moveGroup(g, dx, dy)
        changed = true
      }
    }
    if (!changed) return true
  }
  return false
}

// --- balance -----------------------------------------------------------------------------

// The last free choice is where the whole composition sits. The range of rigid
// shifts that keep every form inside the margin is known up front; within it,
// move the centre of mass to a random target (never dead-centre) and keep the
// first position that also leaves the dominant form off-centre and the two most
// massive forms off the central axes. A rigid shift keeps every gap and
// overlap. This is the generator's inner loop, so it works on plain numbers.
function placeComposition(rng, stage, shapes) {
  const margin = PARAMS.margin * stage.U
  const bs = shapes.map(shapeBounds)
  const range = (lo, hi, min, max) => [lo + margin - min, hi - margin - max]
  const [txMin, txMax] = range(stage.x, stage.x + stage.w, Math.min(...bs.map((b) => b.minX)), Math.max(...bs.map((b) => b.maxX)))
  const [tyMin, tyMax] = range(stage.y, stage.y + stage.h, Math.min(...bs.map((b) => b.minY)), Math.max(...bs.map((b) => b.maxY)))
  if (txMin > txMax + 1e-9 || tyMin > tyMax + 1e-9) return null

  const n = shapes.length
  const hw = stage.w / 2
  const hh = stage.h / 2
  const masses = shapes.map((s) => visualMass(s, stage))
  const major = shapes
    .map((s, i) => i)
    .sort((a, b) => masses[b] - masses[a])
    .slice(0, 2)
  const weights = new Array(n)

  // balance offset of the composition shifted by (sx, sy), in half-stage units;
  // leaves the shifted weights in `weights`
  const offset = (sx, sy) => {
    weightsShifted(shapes, masses, stage, sx, sy, weights)
    let total = 0
    let gx = 0
    let gy = 0
    for (let i = 0; i < n; i++) {
      total += weights[i]
      gx += weights[i] * (shapes[i].cx + sx)
      gy += weights[i] * (shapes[i].cy + sy)
    }
    return { bx: (gx / total - stage.cx) / hw, by: (gy / total - stage.cy) / hh, total }
  }

  const acceptable = (sx, sy) => {
    const { bx, by, total } = offset(sx, sy)
    if (Math.hypot(bx, by) > D.balanceMax) return false
    const dominant = shapes[0]
    const e = Math.hypot((dominant.cx + sx - stage.cx) / hw, (dominant.cy + sy - stage.cy) / hh)
    if (e < D.dominantOffcentre[0] || e > D.dominantOffcentre[1]) return false
    return major.every(
      (i) =>
        weights[i] / total < 0.12 ||
        (Math.abs(shapes[i].cx + sx - stage.cx) >= D.centralAxesClearance * stage.w &&
          Math.abs(shapes[i].cy + sy - stage.cy) >= D.centralAxesClearance * stage.h),
    )
  }

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))
  const [minSize, maxSize] = PARAMS.balance.dynamic
  for (let k = 0; k < D.placementTries; k++) {
    let sx
    let sy
    if (k % 2 === 0) {
      // aim the centre of mass at a random off-centre target
      const angle = rng() * Math.PI * 2
      const size = randFloat(rng, minSize, maxSize)
      const target = [Math.cos(angle) * size, Math.sin(angle) * size]
      sx = 0
      sy = 0
      for (let pass = 0; pass < 3; pass++) {
        const { bx, by } = offset(sx, sy)
        sx = clamp(sx + (target[0] - bx) * hw, txMin, txMax)
        sy = clamp(sy + (target[1] - by) * hh, tyMin, tyMax)
      }
    } else {
      // or just try somewhere else inside the feasible range
      sx = randFloat(rng, txMin, Math.max(txMin, txMax))
      sy = randFloat(rng, tyMin, Math.max(tyMin, tyMax))
    }
    if (acceptable(sx, sy)) return shapes.map((s) => translateShape(s, sx, sy))
  }
  return null
}

// Lighter forms above heavier ones. Mirror the composition vertically when
// that is the only thing wrong, otherwise leave it to the validator.
function ascentOf(stage, shapes, masses) {
  const order = shapes.map((s, i) => i).sort((a, b) => masses[b] - masses[a])
  const heavy = Math.ceil(shapes.length / 2)
  const mean = (idx) => sum(idx.map((i) => shapes[i].cy)) / idx.length
  return (mean(order.slice(0, heavy)) - mean(order.slice(heavy))) / stage.h
}

// Mirror image left to right: the same arrangement with a different relation
// between the major forms and the centre, and the same ascent.
function flipHorizontally(stage, shapes) {
  return shapes.map((s) => ({ ...s, cx: 2 * stage.cx - s.cx, rotation: -s.rotation }))
}

function flipVertically(stage, shapes) {
  return shapes.map((s) => ({
    ...s,
    cy: 2 * stage.cy - s.cy,
    rotation: s.type === 'triangle' ? 180 - s.rotation : -s.rotation,
  }))
}

// --- the long line -------------------------------------------------------------------------

const withIds = (shapes, secondary) =>
  shapes.map((s, i) => ({
    id: `s${i}`,
    ...s,
    role: i === 0 ? 'dominant' : i <= secondary ? 'secondary' : 'accent',
  }))

// Lays one very long, very thin line across a finished composition, or returns
// null. Its angle follows the main tilt (or stands square to it), its length is
// a share of the longest line that fits the margin at that angle, and where it
// lies is found by trial: each candidate is put, with every other form, to the
// validator, and the first one the laws accept is kept. Half of the lines are
// required to cross another form.
function addLongLine(rng, stage, placed, secondary) {
  const P = D.longLine
  const { U } = stage
  const canvas = { mode: 'dynamic', width: stage.cx * 2, height: stage.cy * 2 }
  const check = (shapes) => validateComposition({ ...canvas, shapes: withIds(shapes, secondary) })

  // a composition that is not valid without the line is not saved by it
  const base = check(placed)
  if (!base.valid) return null

  // the main tilt: the largest forms are never free accents, so they carry it
  const ref = placed.slice(0, secondary + 1).find((s) => s.type !== 'circle') ?? placed.find((s) => s.type !== 'circle')
  if (!ref) return null

  const margin = PARAMS.margin * U
  const thinnest = Math.max(0.012 * U, PARAMS.minBarThicknessPx)
  const minAspect = LIMITS.vocabulary.veryLongAspect * 1.05 // so that it is very long by the law
  const colours = [...new Set(placed.map((s) => s.color))]
  const mustCross = chance(rng, P.crossShare)

  for (let k = 0; k < P.tries; k++) {
    const rotation = ref.rotation + (chance(rng, P.perpendicular) ? 90 : 0)
    const c = Math.abs(Math.cos(rotation * DEG))
    const s = Math.abs(Math.sin(rotation * DEG))
    const thickness = thinnest * randFloat(rng, ...P.thickness)

    // the longest line that fits inside the margin at this angle
    const room = Math.min(
      (stage.w - 2 * margin - thickness * s) / Math.max(c, 1e-6),
      (stage.h - 2 * margin - thickness * c) / Math.max(s, 1e-6),
    )
    const w = Math.min(randFloat(rng, ...P.lengthOfRoom) * room, P.lengthOfU[1] * U)
    if (!(w >= P.lengthOfU[0] * U)) continue
    // thin enough that the law counts it as a very long line (on a tiny screen the
    // thinnest bar is 4 px, which only just is), and not thinner than it allows
    const lo = Math.max(thinnest, w / P.maxAspect)
    const hi = w / minAspect
    if (lo > hi) continue
    const h = Math.min(Math.max(thickness, lo), hi)

    // where its centre may lie so that the whole line stays inside the margin
    const halfX = (w * c + h * s) / 2
    const halfY = (w * s + h * c) / 2
    const [x0, x1] = [stage.x + margin + halfX, stage.x + stage.w - margin - halfX]
    const [y0, y1] = [stage.y + margin + halfY, stage.y + stage.h - margin - halfY]
    if (x0 > x1 || y0 > y1) continue

    const line = {
      type: 'bar',
      w,
      h,
      rotation,
      cx: randFloat(rng, x0, x1),
      cy: randFloat(rng, y0, y1),
      color: chance(rng, D.lineBlack) ? BLACK : pick(rng, colours),
    }
    // largest first, which is also the drawing order: the line goes under every
    // form that is smaller than it
    const arranged = [...placed, line].sort((a, b) => shapeArea(b) - shapeArea(a))
    const result = check(arranged)
    const crosses = result.metrics.overlapPairs > base.metrics.overlapPairs
    if (result.valid && (crosses || !mustCross || k >= P.tries / 2)) return withIds(arranged, secondary)
  }
  return null
}

// --- entry point ---------------------------------------------------------------------------

// Returns shapes, or null (the reason is left in buildDynamic.lastFailure,
// which generate.js reports in meta.rejections).
export function buildDynamic(stage, rng, profile = 'normal') {
  const fail = (reason) => {
    buildDynamic.lastFailure = reason
    return null
  }
  const conservative = profile === 'conservative'
  const { U } = stage

  const narrow = U < D.count.narrowU
  const total = Math.min(
    conservative ? pick(rng, D.conservativeCount) : pickWeighted(rng, D.count.values, D.count.weights),
    narrow ? D.count.narrowMax : Infinity,
  )
  // A long line is one of the forms, not an extra one: the others are built
  // without it and it is laid across them at the end (see addLongLine).
  const longLine = !conservative && total >= D.longLine.minCount && chance(rng, D.longLine.chance)
  const n = longLine ? total - 1 : total
  const palette = pickWeighted(rng, PALETTES, PALETTES.map((p) => p.weight))
  const accents = shuffle(rng, palette.pool).slice(0, n >= 7 || chance(rng, 0.5) ? 2 : 1)

  const { forms, secondary } = chooseForms(rng, n, conservative)
  const areas = ladderAreas(rng, n, stage, conservative)
  forms.forEach((f, i) => {
    if (f === 'triangle') areas[i] = Math.min(areas[i], D.triangleAreaOfDominant * areas[0])
  })

  const shapes = forms.map((form, i) => ({ ...makeShape(rng, form, areas[i], U, i <= secondary), rotation: 0, cx: 0, cy: 0 }))
  assignColours(rng, shapes, palette, accents)
  const rc = orient(rng, stage, shapes, secondary, conservative)
  if (!fitToStage(stage, shapes)) return fail('fit')

  // largest first: this is also the drawing order (smaller forms on top)
  shapes.sort((a, b) => shapeArea(b) - shapeArea(a))
  const masses = () => shapes.map((s) => visualMass(s, stage))
  if (!placeAlongAxis(rng, stage, shapes, rc, masses())) return fail('axis')

  const crossed = makeCrossings(rng, shapes, palette, conservative)
  const gap = (conservative ? PARAMS.gapConservative : PARAMS.gap) * U
  if (!relax(rng, stage, shapes, groupsOf(n, crossed), masses(), gap)) return fail('relax')

  // lighter forms above heavier ones: mirror if that is better
  const mirrored = flipVertically(stage, shapes)
  const ascent = ascentOf(stage, shapes, masses())
  const mirroredAscent = ascentOf(stage, mirrored, masses())
  const arranged = mirroredAscent > ascent ? mirrored : shapes
  if (Math.max(ascent, mirroredAscent) < D.ascentMin) return fail('ascent')

  // the mirror image is a second chance for the same, already relaxed, arrangement
  const placed = placeComposition(rng, stage, arranged) ?? placeComposition(rng, stage, flipHorizontally(stage, arranged))
  if (!placed) return fail('place')

  // when no place for the line is found the composition simply goes without it
  return (longLine && addLongLine(rng, stage, placed, secondary)) || withIds(placed, secondary)
}
