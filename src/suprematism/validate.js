// The "laws": every composition the generator returns must pass this.
//
// The validator recomputes everything from { mode, width, height, shapes } and
// never trusts `role` or any generator metadata. LIMITS are the thresholds of
// the laws and should change rarely; the generator aims tighter (params.js)
// so that small animation motion can never push a composition over a limit.

import {
  stageRect,
  shapeGeom,
  geomDistance,
  geomOverlapArea,
  EPS,
} from './geometry.js'
import { visualWeight, visualMass, balanceOffset } from './weight.js'
import { BLACK, COLOURS, ALL_COLOURS, fitsOnePalette } from './palettes.js'

export const LIMITS = {
  margin: 0.04, // x U: clear border around the composition (nothing is clipped)
  minGap: 0.02, // x U: shapes either overlap on purpose or keep their distance
  graze: [0.1, 0.6], // overlap as a fraction of the smaller shape
  overlapPairsMax: 3,
  overlapPerShapeMax: 2,
  coveredMax: 0.6, // fraction of a shape that other shapes may cover
  overlapSmallAreaOfDominant: 0.15,
  crossingAngleMin: 25, // degrees between crossing bars/arms
  minSize: { barThickness: 0.008, barThicknessPx: 3, square: 0.05, circle: 0.05, cross: 0.08, triangle: 0.05 },
  counts: { dynamic: [5, 9], static: [2, 3] }, // never fewer than two forms
  colourCount: { dynamic: [2, 4], static: [1, 3] },
  coverage: { dynamic: [0.05, 0.35], static: [0.03, 0.3] },
  balance: { dynamic: 0.28, static: 0.12 },
  hierarchy: { topRatioMin: 1.8, domWeightShare: [0.25, 0.62], maxMinRatio: 8, domAreaShare: [0.025, 0.22] },
  vocabulary: {
    barFraction: 0.4,
    longBarAspect: 4,
    longBarCount: 2,
    squares: 2,
    circles: 2,
    crosses: 1,
    triangles: 1,
    triangleAreaOfDominant: 0.12,
  },
  orientation: { tolerance: 4, trimWindow: 8, clusteredFraction: 0.6, clusteredMin: 3 },
  freeAccents: { max: 2, weightShare: 0.25, minDeviation: 12 },
  tilt: [12, 78], // cluster angle mod 90, degrees
  axisAligned: 5, // degrees away from exact horizontal / vertical
  dominantOffcentre: [0.1, 0.65], // half-stage units
  // Lissitzky: no major point on the central axes. "Major" = the two most massive forms.
  centralAxes: { majorForms: 2, weightShare: 0.15, clearance: 0.03 },
  ascent: 0.02, // x stage height
  rhythmCV: 0.25,
  spread: { pcaRatio: [0.12, 0.9], extentMax: 0.55, extentMin: 0.25 },
  mirror: { areaTolerance: 0.1, distance: 0.03 },
  colourBudget: { dominant: [0.4, 0.8], blackMax: 0.6 },
  static: { mainSize: [0.25, 0.6], satelliteArea: 0.12, rotationTolerance: 3, centred: 0.04 },
}

export const VIOLATION_CODES = [
  'SCHEMA',
  'FLAT_COLOUR',
  'PALETTE',
  'COLOUR_COUNT',
  'BLACK_PRESENT',
  'COUNT',
  'MARGIN',
  'MIN_SIZE',
  'COVERAGE',
  'NEAR_MISS',
  'GRAZE',
  'OVERLAP_RULES',
  'CROSSING_ANGLE',
  'Z_ORDER',
  'BALANCE',
  'HIERARCHY',
  'VOCABULARY',
  'ORIENTATION',
  'FREE_ACCENTS',
  'ANGLE_TANGENCY',
  'TILT',
  'NOT_AXIS_ALIGNED',
  'DOMINANT_OFFCENTRE',
  'CENTRAL_AXES',
  'ASCENT',
  'RHYTHM',
  'SPREAD',
  'MIRROR',
  'COLOUR_BUDGET',
  'STATIC_FORM',
  'STATIC_ORIENTATION',
  'STATIC_CENTRED',
  'STATIC_NO_OVERLAP',
  'STATIC_COLOUR',
]

const ALLOWED_KEYS = new Set(['id', 'type', 'cx', 'cy', 'w', 'h', 'rotation', 'color', 'role'])
const STYLE_KEYS = new Set(['fill', 'stroke', 'strokeWidth', 'opacity', 'gradient', 'useGradient', 'adjustedColor'])
const TYPES = new Set(['square', 'bar', 'circle', 'cross', 'triangle'])
const HEX = /^#[0-9a-f]{6}$/
const DEG = Math.PI / 180

const mod = (a, n) => ((a % n) + n) % n
// signed difference of two angles on a circle of period n, in (-n/2, n/2]
const circDiff = (a, b, n) => {
  const d = mod(a - b, n)
  return d > n / 2 ? d - n : d
}
const inRange = (v, [min, max]) => v >= min - EPS && v <= max + EPS
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const ceil = (v) => Math.ceil(v - 1e-9)

// --- schema -----------------------------------------------------------------

// Returns false when the data is too broken for the geometric checks to run.
function checkSchema(comp, add) {
  if (!comp || (comp.mode !== 'dynamic' && comp.mode !== 'static')) {
    add('SCHEMA', 'mode must be "dynamic" or "static"', comp && comp.mode, 'dynamic|static')
    return false
  }
  if (!Number.isFinite(comp.width) || !Number.isFinite(comp.height)) {
    add('SCHEMA', 'width and height must be finite numbers', [comp.width, comp.height], 'finite')
    return false
  }
  if (!Array.isArray(comp.shapes) || comp.shapes.length === 0) {
    add('SCHEMA', 'shapes must be a non-empty array', comp.shapes, 'non-empty array')
    return false
  }
  let fatal = false
  const ids = new Set()
  for (const s of comp.shapes) {
    if (!s || typeof s !== 'object') {
      add('SCHEMA', 'shape must be an object', s, 'object')
      return false
    }
    const id = s.id
    for (const key of Object.keys(s)) {
      if (STYLE_KEYS.has(key)) add('FLAT_COLOUR', `shape has style key "${key}"`, key, 'flat fill only', [id])
      else if (!ALLOWED_KEYS.has(key)) {
        add('SCHEMA', `unknown shape key "${key}"`, key, [...ALLOWED_KEYS].join(','), [id])
        fatal = true
      }
    }
    if (typeof id !== 'string' || ids.has(id)) {
      add('SCHEMA', 'shape id must be a unique string', id, 'unique string', [id])
      fatal = true
    }
    ids.add(id)
    if (!TYPES.has(s.type)) {
      add('SCHEMA', `unknown shape type "${s.type}"`, s.type, [...TYPES].join(','), [id])
      return false
    }
    const numbers = [s.cx, s.cy, s.w, s.h, s.rotation]
    if (!numbers.every(Number.isFinite) || s.w <= 0 || s.h <= 0) {
      add('SCHEMA', 'cx, cy, w, h, rotation must be finite and w, h positive', numbers, 'finite', [id])
      return false
    }
    if (typeof s.color !== 'string' || !HEX.test(s.color)) {
      add('FLAT_COLOUR', 'colour must be a lowercase #rrggbb hex', s.color, '#rrggbb', [id])
      fatal = true
    }
    const equalSides = Math.abs(s.w - s.h) <= 1e-6 * Math.max(1, s.w)
    if ((s.type === 'square' || s.type === 'circle' || s.type === 'cross') && !equalSides) {
      add('SCHEMA', `${s.type} needs w === h`, [s.w, s.h], 'w === h', [id])
      fatal = true
    }
    if (s.type === 'bar' && !(s.w / s.h >= 3 - EPS && s.w / s.h <= 40 + EPS)) {
      add('SCHEMA', 'bar aspect w/h must be in [3, 40]', s.w / s.h, '[3, 40]', [id])
      fatal = true
    }
    if (s.type === 'triangle' && !(s.h / s.w >= 0.7 - EPS && s.h / s.w <= 1.3 + EPS)) {
      add('SCHEMA', 'triangle h/w must be in [0.7, 1.3]', s.h / s.w, '[0.7, 1.3]', [id])
      fatal = true
    }
  }
  return !fatal
}

// Angle of the long axis(es) of a shape, in degrees mod 180; null if it has none.
function axisAngles(s) {
  if (s.type === 'bar') return [mod(s.rotation, 180)]
  if (s.type === 'cross') return [mod(s.rotation, 180), mod(s.rotation + 90, 180)]
  return null
}

const lineDiff = (a, b) => Math.abs(circDiff(a, b, 180))

// Weighted circular mean of orientations that repeat every 90 degrees.
function circularMean90(items) {
  let sin = 0
  let cos = 0
  for (const { angle, weight } of items) {
    sin += weight * Math.sin(4 * angle * DEG)
    cos += weight * Math.cos(4 * angle * DEG)
  }
  return mod(Math.atan2(sin, cos) / (4 * DEG), 90)
}

function principalAxes(points) {
  const n = points.length
  const mx = sum(points.map((p) => p.x)) / n
  const my = sum(points.map((p) => p.y)) / n
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of points) {
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
    sxy += (p.x - mx) * (p.y - my)
  }
  sxx /= n
  syy /= n
  sxy /= n
  const half = (sxx + syy) / 2
  const root = Math.sqrt(Math.max(0, half * half - (sxx * syy - sxy * sxy)))
  const l1 = half + root
  const l2 = Math.max(0, half - root)
  const alpha = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { mx, my, l1, l2, alpha }
}

// --- main entry ---------------------------------------------------------------

// `limits` defaults to the laws.
export function validateComposition(comp, limits = LIMITS) {
  const L = limits
  const violations = []
  const add = (code, message, value, limit, ids = []) =>
    violations.push({ code, message, value, limit, ids })

  if (!checkSchema(comp, add)) return { valid: false, violations, metrics: null }

  const { mode, shapes } = comp
  const isDynamic = mode === 'dynamic'
  const stage = stageRect(comp.width, comp.height)
  const { U } = stage
  const stageArea = stage.w * stage.h
  const n = shapes.length
  const geoms = shapes.map(shapeGeom)
  const areas = geoms.map((g) => g.area)
  const totalArea = sum(areas)
  const idsOf = (indices) => indices.map((i) => shapes[i].id)

  const dominantIndex = areas.indexOf(Math.max(...areas))
  const dominant = shapes[dominantIndex]
  const dominantArea = areas[dominantIndex]
  const weights = shapes.map((s) => visualWeight(s, stage))
  const totalWeight = sum(weights)
  const metrics = {
    mode,
    count: n,
    stage,
    dominantIndex,
    coverage: totalArea / stageArea,
    balance: balanceOffset(shapes, stage),
  }

  // --- colour ---------------------------------------------------------------
  const colours = [...new Set(shapes.map((s) => s.color))]
  const offPalette = shapes.map((s, i) => i).filter((i) => !ALL_COLOURS.includes(shapes[i].color))
  if (offPalette.length) {
    add('PALETTE', 'colour is not in the Suprematist set', colours, ALL_COLOURS, idsOf(offPalette))
  } else if (!fitsOnePalette(colours)) {
    add('PALETTE', 'chromatic colours do not belong to one palette', colours, 'one palette')
  }
  metrics.colours = colours.length
  if (!inRange(colours.length, L.colourCount[mode])) {
    add('COLOUR_COUNT', 'wrong number of distinct colours', colours.length, L.colourCount[mode])
  }
  if (!colours.includes(BLACK)) add('BLACK_PRESENT', 'black ("economy") must be present', colours, BLACK)

  // --- count, margins, sizes, coverage ------------------------------------------
  if (!inRange(n, L.counts[mode])) add('COUNT', 'wrong number of shapes', n, L.counts[mode])

  const margin = L.margin * U
  let minSlack = Infinity
  const clipped = []
  geoms.forEach((g, i) => {
    const b = g.bounds
    const slack = Math.min(
      b.minX - stage.x,
      stage.x + stage.w - b.maxX,
      b.minY - stage.y,
      stage.y + stage.h - b.maxY,
    )
    minSlack = Math.min(minSlack, slack)
    if (slack < margin - EPS) clipped.push(i)
  })
  metrics.minMargin = minSlack / U
  if (clipped.length) add('MARGIN', 'shape too close to the border', minSlack / U, L.margin, idsOf(clipped))

  const tooSmall = []
  shapes.forEach((s, i) => {
    const sz = L.minSize
    const ok =
      s.type === 'bar'
        ? s.h >= Math.max(sz.barThickness * U, sz.barThicknessPx) - EPS
        : s.w >= sz[s.type] * U - EPS
    if (!ok) tooSmall.push(i)
  })
  if (tooSmall.length) add('MIN_SIZE', 'shape below the minimum size', null, L.minSize, idsOf(tooSmall))

  if (!inRange(metrics.coverage, L.coverage[mode])) {
    add('COVERAGE', 'coverage of the ground out of range', metrics.coverage, L.coverage[mode])
  }

  // --- pairs: overlaps and near misses -----------------------------------------
  const gap = L.minGap * U
  const overlaps = []
  const nearMisses = []
  let minDistance = Infinity
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const area = geomOverlapArea(geoms[i], geoms[j])
      if (area > 1e-6 * U * U) {
        overlaps.push({ i, j, area, fraction: area / Math.min(areas[i], areas[j]) })
      } else {
        const d = geomDistance(geoms[i], geoms[j], gap)
        minDistance = Math.min(minDistance, d)
        if (d < gap - EPS) nearMisses.push({ i, j, d })
      }
    }
  }
  metrics.overlapPairs = overlaps.length
  metrics.minDistance = minDistance / U
  if (nearMisses.length) {
    const worst = Math.min(...nearMisses.map((p) => p.d))
    add('NEAR_MISS', 'shapes almost touch', worst / U, L.minGap, idsOf(nearMisses.flatMap((p) => [p.i, p.j])))
  }

  const badGraze = overlaps.filter((p) => !inRange(p.fraction, L.graze))
  if (badGraze.length) {
    add('GRAZE', 'overlap is a sliver or swallows the smaller shape', badGraze[0].fraction, L.graze, idsOf(badGraze.flatMap((p) => [p.i, p.j])))
  }

  // later shapes are drawn on top, so they must be the smaller ones
  const badZ = overlaps.filter((p) => areas[p.j] > areas[p.i] * (1 + 1e-9))
  if (badZ.length) {
    add('Z_ORDER', 'a larger shape is drawn over a smaller one', null, 'later <= earlier area', idsOf(badZ.flatMap((p) => [p.i, p.j])))
  }

  const badAngle = overlaps.filter((p) => {
    const a = axisAngles(shapes[p.i])
    const b = axisAngles(shapes[p.j])
    if (!a || !b) return false
    const smallest = Math.min(...a.flatMap((x) => b.map((y) => lineDiff(x, y))))
    return smallest < L.crossingAngleMin - EPS
  })
  if (badAngle.length) {
    add('CROSSING_ANGLE', 'crossing bars are nearly parallel', null, L.crossingAngleMin, idsOf(badAngle.flatMap((p) => [p.i, p.j])))
  }

  if (isDynamic) {
    const perShape = new Array(n).fill(0)
    const covered = new Array(n).fill(0)
    for (const p of overlaps) {
      perShape[p.i]++
      perShape[p.j]++
      covered[p.i] += p.area / areas[p.i]
      covered[p.j] += p.area / areas[p.j]
    }
    const pairProblems = overlaps.filter((p) => {
      const a = shapes[p.i]
      const b = shapes[p.j]
      const smallArea = Math.min(areas[p.i], areas[p.j])
      const sameColour = a.color === b.color
      const allowed =
        a.type === 'bar' || b.type === 'bar' || smallArea <= L.overlapSmallAreaOfDominant * dominantArea
      return sameColour || !allowed
    })
    if (
      overlaps.length > L.overlapPairsMax ||
      perShape.some((c) => c > L.overlapPerShapeMax) ||
      covered.some((c) => c > L.coveredMax + EPS) ||
      pairProblems.length
    ) {
      add('OVERLAP_RULES', 'too many overlaps, same-colour overlap, or a shape mostly covered', overlaps.length, L.overlapPairsMax)
    }
  } else if (overlaps.length) {
    add('STATIC_NO_OVERLAP', 'static compositions keep every shape apart', overlaps.length, 0, idsOf(overlaps.flatMap((p) => [p.i, p.j])))
  }

  if (metrics.balance.norm > L.balance[mode] + EPS) {
    add('BALANCE', 'centre of mass too far from the centre', metrics.balance.norm, L.balance[mode])
  }

  if (isDynamic) checkDynamic()
  else checkStatic()

  return { valid: violations.length === 0, violations, metrics }

  // ---------------------------------------------------------------------------
  function checkDynamic() {
    // hierarchy: one dominant form, clearly larger than the rest
    const sorted = areas.slice().sort((a, b) => b - a)
    const topRatio = sorted[0] / sorted[1]
    const maxMin = sorted[0] / sorted[n - 1]
    const domWeightShare = weights[dominantIndex] / totalWeight
    const domAreaShare = dominantArea / stageArea
    metrics.topRatio = topRatio
    metrics.domWeightShare = domWeightShare
    if (
      topRatio < L.hierarchy.topRatioMin - EPS ||
      maxMin < L.hierarchy.maxMinRatio - EPS ||
      !inRange(domWeightShare, L.hierarchy.domWeightShare) ||
      !inRange(domAreaShare, L.hierarchy.domAreaShare)
    ) {
      add('HIERARCHY', 'no clear dominant form', { topRatio, maxMin, domWeightShare, domAreaShare }, L.hierarchy, [dominant.id])
    }

    // vocabulary: mostly bars, few of everything else
    const count = (type) => shapes.filter((s) => s.type === type).length
    const bars = shapes.filter((s) => s.type === 'bar')
    const voc = L.vocabulary
    const longBars = bars.filter((s) => s.w / s.h >= voc.longBarAspect - EPS).length
    const triangles = shapes.filter((s) => s.type === 'triangle')
    const badTriangle = triangles.some(
      (s) => s === dominant || shapeAreaOf(s) > voc.triangleAreaOfDominant * dominantArea + EPS,
    )
    if (
      bars.length < ceil(voc.barFraction * n) ||
      longBars < voc.longBarCount ||
      count('square') > voc.squares ||
      count('circle') > voc.circles ||
      count('cross') > voc.crosses ||
      triangles.length > voc.triangles ||
      badTriangle
    ) {
      add('VOCABULARY', 'wrong mix of forms', { bars: bars.length, longBars }, voc)
    }

    // orientation: one shared tilt, a few free accents
    const oriented = shapes.map((s, i) => i).filter((i) => shapes[i].type !== 'circle')
    const items = oriented.map((i) => ({ i, angle: mod(shapes[i].rotation, 90), weight: weights[i] }))
    let phi = items.length ? circularMean90(items) : 0
    // a few free accents must not drag the cluster angle: re-centre on the
    // shapes close to the current estimate
    for (let pass = 0; pass < 4 && items.length; pass++) {
      const near = items.filter((it) => Math.abs(circDiff(it.angle, phi, 90)) <= L.orientation.trimWindow)
      if (!near.length) break
      phi = circularMean90(near)
    }
    metrics.clusterAngle = phi
    const dev = items.map((it) => ({ ...it, d: Math.abs(circDiff(it.angle, phi, 90)) }))
    const clustered = dev.filter((it) => it.d <= L.orientation.tolerance + EPS)
    const deviants = dev.filter((it) => it.d > L.orientation.tolerance + EPS)
    const need = Math.max(L.orientation.clusteredMin, ceil(L.orientation.clusteredFraction * items.length))
    if (clustered.length < need) {
      add('ORIENTATION', 'too few shapes share the main tilt', clustered.length, need)
    }
    const deviantWeight = sum(deviants.map((it) => weights[it.i])) / totalWeight
    if (deviants.length > L.freeAccents.max || deviantWeight > L.freeAccents.weightShare + EPS) {
      add('FREE_ACCENTS', 'too many or too heavy free accents', { count: deviants.length, deviantWeight }, L.freeAccents, idsOf(deviants.map((it) => it.i)))
    }
    const tangent = deviants.filter((it) => it.d < L.freeAccents.minDeviation - EPS)
    if (tangent.length) {
      add('ANGLE_TANGENCY', 'accent is almost, but not quite, parallel to the tilt', Math.min(...tangent.map((it) => it.d)), L.freeAccents.minDeviation, idsOf(tangent.map((it) => it.i)))
    }
    if (!inRange(phi, L.tilt)) add('TILT', 'main tilt too close to horizontal or vertical', phi, L.tilt)
    const aligned = items.filter((it) => Math.min(it.angle, 90 - it.angle) < L.axisAligned - EPS)
    if (aligned.length) {
      add('NOT_AXIS_ALIGNED', 'shape lies along the horizontal or vertical axis', null, L.axisAligned, idsOf(aligned.map((it) => it.i)))
    }

    // placement: dominant off-centre, heavy forms off the central axes
    const nx = (dominant.cx - stage.cx) / (stage.w / 2)
    const ny = (dominant.cy - stage.cy) / (stage.h / 2)
    const offcentre = Math.hypot(nx, ny)
    metrics.dominantOffcentre = offcentre
    if (!inRange(offcentre, L.dominantOffcentre)) {
      add('DOMINANT_OFFCENTRE', 'dominant form is dead-centre or too far out', offcentre, L.dominantOffcentre, [dominant.id])
    }
    // "major" = the largest forms by mass (size and colour, not position), so
    // moving the forms can never change which ones count
    const massOf = shapes.map((s) => visualMass(s, stage))
    const major = shapes
      .map((s, i) => i)
      .sort((a, b) => massOf[b] - massOf[a])
      .slice(0, L.centralAxes.majorForms)
      .filter((i) => weights[i] / totalWeight >= L.centralAxes.weightShare)
    const onAxis = major.filter(
      (i) =>
        Math.abs(shapes[i].cx - stage.cx) < L.centralAxes.clearance * stage.w - EPS ||
        Math.abs(shapes[i].cy - stage.cy) < L.centralAxes.clearance * stage.h - EPS,
    )
    if (onAxis.length) {
      add('CENTRAL_AXES', 'heavy form sits on a central axis', null, L.centralAxes, idsOf(onAxis))
    }

    // ascent: lighter forms above heavier ones (y grows downward)
    const masses = shapes.map((s) => visualMass(s, stage))
    const order = shapes.map((s, i) => i).sort((a, b) => masses[b] - masses[a])
    const heavyCount = ceil(n / 2)
    const heavyY = sum(order.slice(0, heavyCount).map((i) => shapes[i].cy)) / heavyCount
    const lightY = sum(order.slice(heavyCount).map((i) => shapes[i].cy)) / (n - heavyCount)
    metrics.ascent = (heavyY - lightY) / stage.h
    if (metrics.ascent < L.ascent - EPS) {
      add('ASCENT', 'heavier forms are not below the lighter ones', metrics.ascent, L.ascent)
    }

    // rhythm and spread along the principal axis of the centres
    const pts = shapes.map((s) => ({ x: s.cx, y: s.cy }))
    const pca = principalAxes(pts)
    const ts = pts
      .map((p) => (p.x - pca.mx) * Math.cos(pca.alpha) + (p.y - pca.my) * Math.sin(pca.alpha))
      .sort((a, b) => a - b)
    const gaps = ts.slice(1).map((t, k) => t - ts[k])
    const meanGap = sum(gaps) / gaps.length
    const cv = meanGap > 0 ? Math.sqrt(sum(gaps.map((g) => (g - meanGap) ** 2)) / gaps.length) / meanGap : 0
    metrics.rhythmCV = cv
    if (cv < L.rhythmCV - EPS) add('RHYTHM', 'spacing is too even', cv, L.rhythmCV)

    const ratio = pca.l1 > 0 ? Math.sqrt(pca.l2 / pca.l1) : 0
    const minX = Math.min(...geoms.map((g) => g.bounds.minX))
    const maxX = Math.max(...geoms.map((g) => g.bounds.maxX))
    const minY = Math.min(...geoms.map((g) => g.bounds.minY))
    const maxY = Math.max(...geoms.map((g) => g.bounds.maxY))
    const ex = (maxX - minX) / stage.w
    const ey = (maxY - minY) / stage.h
    metrics.pcaRatio = ratio
    metrics.extent = [ex, ey]
    if (
      !inRange(ratio, L.spread.pcaRatio) ||
      Math.max(ex, ey) < L.spread.extentMax - EPS ||
      Math.min(ex, ey) < L.spread.extentMin - EPS
    ) {
      add('SPREAD', 'composition is a line, a clump, or too small', { ratio, ex, ey }, L.spread)
    }

    // no mirrored twins about the centre
    const mirrored = []
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = shapes[i]
        const b = shapes[j]
        if (a.type !== b.type || a.color !== b.color) continue
        if (Math.abs(areas[i] - areas[j]) / Math.max(areas[i], areas[j]) > L.mirror.areaTolerance) continue
        const near = (x, y) => Math.hypot(b.cx - x, b.cy - y) <= L.mirror.distance * U
        const rx = 2 * stage.cx - a.cx
        const ry = 2 * stage.cy - a.cy
        if (near(rx, ry) || near(rx, a.cy) || near(a.cx, ry)) mirrored.push(i, j)
      }
    }
    if (mirrored.length) add('MIRROR', 'two identical forms mirror each other about the centre', null, L.mirror, idsOf(mirrored))

    // colour budget: one colour leads, black does not take over
    const share = {}
    shapes.forEach((s, i) => {
      share[s.color] = (share[s.color] || 0) + areas[i] / totalArea
    })
    const lead = Math.max(...Object.values(share))
    const black = share[COLOURS.black] || 0
    metrics.colourShares = share
    if (!inRange(lead, L.colourBudget.dominant) || black > L.colourBudget.blackMax + EPS) {
      add('COLOUR_BUDGET', 'colour areas are out of proportion', { lead, black }, L.colourBudget)
    }
  }

  function checkStatic() {
    const st = L.static
    const others = shapes.filter((s) => s !== dominant)
    const mainOk = ['square', 'circle', 'cross'].includes(dominant.type) && inRange(dominant.w, [st.mainSize[0] * U, st.mainSize[1] * U])
    const satellitesOk = others.every(
      (s) => ['square', 'circle', 'bar'].includes(s.type) && shapeAreaOf(s) <= st.satelliteArea * dominantArea + EPS,
    )
    if (!mainOk || !satellitesOk || shapes.some((s) => s.type === 'triangle')) {
      add('STATIC_FORM', 'static composition needs one main square, circle or cross', dominant.type, st)
    }
    const tilted = shapes.filter((s) => s.type !== 'circle' && Math.abs(circDiff(s.rotation, 0, 90)) > st.rotationTolerance + EPS)
    if (tilted.length) {
      add('STATIC_ORIENTATION', 'static forms stay axis-aligned', null, st.rotationTolerance, tilted.map((s) => s.id))
    }
    if (
      Math.abs(dominant.cx - stage.cx) > st.centred * stage.w + EPS ||
      Math.abs(dominant.cy - stage.cy) > st.centred * stage.h + EPS
    ) {
      add('STATIC_CENTRED', 'the main form must sit near the centre', null, st.centred, [dominant.id])
    }
    if (![COLOURS.black, COLOURS.red, COLOURS.blue].includes(dominant.color)) {
      add('STATIC_COLOUR', 'the main form is black, red or blue', dominant.color, 'black|red|blue', [dominant.id])
    }
  }

  function shapeAreaOf(s) {
    return areas[shapes.indexOf(s)]
  }
}

export const computeMetrics = (comp) => validateComposition(comp).metrics
