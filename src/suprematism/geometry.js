// Pure geometry for shapes. Shapes are centre-based:
//   { type, cx, cy, w, h, rotation }   rotation in degrees, clockwise (SVG)
// Every non-convex shape (the cross) is split into DISJOINT convex pieces, so
// areas of intersections can simply be summed over piece pairs.

export const EPS = 1e-6
export const MIN_SIDE = 240
export const ASPECT_MIN = 0.4
export const ASPECT_MAX = 2.5
export const CROSS_T = 0.3 // cross arm thickness as a fraction of its span

const CIRCLE_SEGMENTS = 32
const DEG = Math.PI / 180

// The "stage" is the centred part of the canvas the composition lives in.
// Its aspect ratio is clamped so ultra-wide and very tall windows don't
// stretch the composition; all thresholds are relative to U = min(w, h).
export function stageRect(width, height) {
  // anything that is not a finite number (NaN, undefined) counts as "too small"
  const W = Math.max(MIN_SIDE, Number.isFinite(width) ? width : 0)
  const H = Math.max(MIN_SIDE, Number.isFinite(height) ? height : 0)
  let w = W
  let h = H
  if (W / H > ASPECT_MAX) w = H * ASPECT_MAX
  else if (W / H < ASPECT_MIN) h = W / ASPECT_MIN
  const cx = W / 2
  const cy = H / 2
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, U: Math.min(w, h) }
}

export function shapeArea(s) {
  switch (s.type) {
    case 'square':
    case 'bar':
      return s.w * s.h
    case 'circle':
      return Math.PI * (s.w / 2) ** 2
    case 'cross': {
      const t = CROSS_T * s.w
      return 2 * s.w * t - t * t
    }
    case 'triangle':
      return (s.w * s.h) / 2
    default:
      throw new Error(`unknown shape type: ${s.type}`)
  }
}

// Distance from the centre to the farthest point of the shape.
export function shapeRadius(s) {
  switch (s.type) {
    case 'circle':
      return s.w / 2
    case 'cross':
      return Math.hypot(s.w / 2, (CROSS_T * s.w) / 2)
    default:
      return Math.hypot(s.w / 2, s.h / 2)
  }
}

const rect = (cx, cy, hw, hh) => [
  [cx - hw, cy - hh],
  [cx + hw, cy - hh],
  [cx + hw, cy + hh],
  [cx - hw, cy + hh],
]

// Circumscribed polygon: slightly larger than the circle, so collision checks
// stay conservative.
function circlePolygon(r) {
  const R = r / Math.cos(Math.PI / CIRCLE_SEGMENTS)
  return Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
    const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS
    return [R * Math.cos(a), R * Math.sin(a)]
  })
}

function crossOutline(w) {
  const s = w / 2
  const a = (CROSS_T * w) / 2
  return [
    [-a, -s], [a, -s], [a, -a], [s, -a], [s, a], [a, a],
    [a, s], [-a, s], [-a, a], [-s, a], [-s, -a], [-a, -a],
  ]
}

function crossPieces(w) {
  const s = w / 2
  const a = (CROSS_T * w) / 2
  const m = (s + a) / 2
  const hl = (s - a) / 2
  return [rect(0, 0, a, a), rect(m, 0, hl, a), rect(-m, 0, hl, a), rect(0, m, a, hl), rect(0, -m, a, hl)]
}

const triangleOutline = (w, h) => [
  [0, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
]

// Outline in local coordinates (centre at 0,0, before rotation). This is what
// ShapeView draws for crosses and triangles.
export function localOutline(s) {
  switch (s.type) {
    case 'square':
    case 'bar':
      return rect(0, 0, s.w / 2, s.h / 2)
    case 'circle':
      return circlePolygon(s.w / 2)
    case 'cross':
      return crossOutline(s.w)
    case 'triangle':
      return triangleOutline(s.w, s.h)
    default:
      throw new Error(`unknown shape type: ${s.type}`)
  }
}

function localPieces(s) {
  return s.type === 'cross' ? crossPieces(s.w) : [localOutline(s)]
}

function toWorld(points, s) {
  const rad = s.rotation * DEG
  const c = Math.cos(rad)
  const si = Math.sin(rad)
  return points.map(([x, y]) => [s.cx + x * c - y * si, s.cy + x * si + y * c])
}

export const shapePolys = (s) => localPieces(s).map((p) => toWorld(p, s))

// Exact axis-aligned bounds of the rotated shape.
export function shapeBounds(s) {
  if (s.type === 'circle') {
    const r = s.w / 2
    return { minX: s.cx - r, maxX: s.cx + r, minY: s.cy - r, maxY: s.cy + r }
  }
  const pts = toWorld(localOutline(s), s)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, maxX, minY, maxY }
}

export const translateShape = (s, dx, dy) => ({ ...s, cx: s.cx + dx, cy: s.cy + dy })

// A convex piece keeps its edge normals, so pair checks don't recompute them.
function makePiece(pts) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { pts, axes: axesOf(pts), minX, maxX, minY, maxY }
}

// Precomputed geometry of one shape, reused across pair checks. Circles keep
// their exact centre and radius for the (much cheaper) analytic distance.
export const shapeGeom = (s) => ({
  shape: s,
  pieces: shapePolys(s).map(makePiece),
  bounds: shapeBounds(s),
  area: shapeArea(s),
  circle: s.type === 'circle' ? { x: s.cx, y: s.cy, r: s.w / 2 } : null,
})

// The same geometry moved by (dx, dy); normals are translation invariant.
export function translateGeom(g, dx, dy) {
  const b = g.bounds
  return {
    shape: translateShape(g.shape, dx, dy),
    pieces: g.pieces.map((p) => ({
      pts: p.pts.map(([x, y]) => [x + dx, y + dy]),
      axes: p.axes,
      minX: p.minX + dx,
      maxX: p.maxX + dx,
      minY: p.minY + dy,
      maxY: p.maxY + dy,
    })),
    bounds: { minX: b.minX + dx, maxX: b.maxX + dx, minY: b.minY + dy, maxY: b.maxY + dy },
    area: g.area,
    circle: g.circle && { x: g.circle.x + dx, y: g.circle.y + dy, r: g.circle.r },
  }
}

// --- polygon primitives ----------------------------------------------------

export function signedArea(pts) {
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

export const polygonArea = (pts) => Math.abs(signedArea(pts))

const orient = (pts) => (signedArea(pts) < 0 ? pts.slice().reverse() : pts)

// Squared distance from point (px, py) to segment a-b (no allocations: hot path).
function pointSegmentDistSq(px, py, a, b) {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const len2 = abx * abx + aby * aby
  let t = len2 === 0 ? 0 : ((px - a[0]) * abx + (py - a[1]) * aby) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const dx = px - (a[0] + t * abx)
  const dy = py - (a[1] + t * aby)
  return dx * dx + dy * dy
}

function axesOf(pts) {
  const axes = []
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len > 0) axes.push([(y1 - y2) / len, (x2 - x1) / len])
  }
  return axes
}

function project(pts, axis) {
  let min = Infinity
  let max = -Infinity
  for (const [x, y] of pts) {
    const d = x * axis[0] + y * axis[1]
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}

// True when two convex pieces share interior area (touching is not overlap).
function convexOverlap(P, Q) {
  for (const axes of [P.axes, Q.axes]) {
    for (const axis of axes) {
      const [minP, maxP] = project(P.pts, axis)
      const [minQ, maxQ] = project(Q.pts, axis)
      if (Math.min(maxP, maxQ) - Math.max(minP, minQ) <= EPS) return false
    }
  }
  return true
}

function convexDistanceSq(P, Q) {
  if (convexOverlap(P, Q)) return 0
  let best = Infinity
  for (const p of P.pts) {
    for (let i = 0; i < Q.pts.length; i++) {
      const d = pointSegmentDistSq(p[0], p[1], Q.pts[i], Q.pts[(i + 1) % Q.pts.length])
      if (d < best) best = d
    }
  }
  for (const q of Q.pts) {
    for (let i = 0; i < P.pts.length; i++) {
      const d = pointSegmentDistSq(q[0], q[1], P.pts[i], P.pts[(i + 1) % P.pts.length])
      if (d < best) best = d
    }
  }
  return best
}

// Distance from a point to a convex polygon (0 when inside).
function pointPolygonDistance(x, y, pts) {
  let positive = false
  let negative = false
  let best = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
    if (cross > 0) positive = true
    else if (cross < 0) negative = true
    const d = pointSegmentDistSq(x, y, a, b)
    if (d < best) best = d
  }
  return positive && negative ? Math.sqrt(best) : 0
}

// Sutherland-Hodgman. Both polygons must be convex.
function convexIntersectionArea(subject, clip) {
  const S = orient(subject)
  const C = orient(clip)
  const side = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  let output = S
  for (let i = 0; i < C.length && output.length > 0; i++) {
    const a = C[i]
    const b = C[(i + 1) % C.length]
    const input = output
    output = []
    let prev = input[input.length - 1]
    for (const cur of input) {
      const curSide = side(a, b, cur)
      const prevSide = side(a, b, prev)
      if (curSide >= 0) {
        if (prevSide < 0) output.push(lineCross(prev, cur, prevSide, curSide))
        output.push(cur)
      } else if (prevSide >= 0) {
        output.push(lineCross(prev, cur, prevSide, curSide))
      }
      prev = cur
    }
  }
  return output.length < 3 ? 0 : polygonArea(output)
}

function lineCross(p1, p2, s1, s2) {
  const t = s1 / (s1 - s2)
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]
}

// --- pair queries on prepared geometry --------------------------------------

function boundsGap(a, b) {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX)
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY)
  return Math.hypot(dx, dy)
}

// Shortest distance between two shapes, 0 when they overlap. When the bounds
// alone prove the shapes are at least `cutoff` apart, a lower bound (>= cutoff)
// is returned instead of the exact distance.
export function geomDistance(ga, gb, cutoff = Infinity) {
  const lower = boundsGap(ga.bounds, gb.bounds)
  if (lower >= cutoff) return lower
  if (ga.circle && gb.circle) {
    const d = Math.hypot(ga.circle.x - gb.circle.x, ga.circle.y - gb.circle.y)
    return Math.max(0, d - ga.circle.r - gb.circle.r)
  }
  if (ga.circle || gb.circle) {
    const [c, other] = ga.circle ? [ga.circle, gb] : [gb.circle, ga]
    let best = Infinity
    for (const piece of other.pieces) best = Math.min(best, pointPolygonDistance(c.x, c.y, piece.pts))
    return Math.max(0, best - c.r)
  }
  let bestSq = Infinity
  for (const P of ga.pieces) {
    for (const Q of gb.pieces) {
      const dx = Math.max(0, P.minX - Q.maxX, Q.minX - P.maxX)
      const dy = Math.max(0, P.minY - Q.maxY, Q.minY - P.maxY)
      if (dx * dx + dy * dy >= bestSq) continue // this pair cannot beat the best so far
      const d = convexDistanceSq(P, Q)
      if (d < bestSq) bestSq = d
      if (bestSq === 0) return 0
    }
  }
  return Math.sqrt(bestSq)
}

export function geomOverlapArea(ga, gb) {
  if (boundsGap(ga.bounds, gb.bounds) > 0) return 0
  let sum = 0
  for (const P of ga.pieces) {
    for (const Q of gb.pieces) sum += convexIntersectionArea(P.pts, Q.pts)
  }
  return sum
}

export const shapeDistance = (a, b, cutoff) => geomDistance(shapeGeom(a), shapeGeom(b), cutoff)
export const shapeOverlapArea = (a, b) => geomOverlapArea(shapeGeom(a), shapeGeom(b))
