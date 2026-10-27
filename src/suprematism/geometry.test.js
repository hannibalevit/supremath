import { describe, it, expect } from 'vitest'
import {
  stageRect,
  shapeArea,
  shapeBounds,
  shapePolys,
  localOutline,
  polygonArea,
  shapeDistance,
  shapeOverlapArea,
  shapeRadius,
  translateShape,
} from './geometry.js'

const square = (cx, cy, s, rotation = 0) => ({ type: 'square', cx, cy, w: s, h: s, rotation })
const cross = (cx, cy, w, rotation = 0) => ({ type: 'cross', cx, cy, w, h: w, rotation })

describe('stageRect', () => {
  it('keeps a normal landscape window as is', () => {
    expect(stageRect(1920, 1080)).toMatchObject({ x: 0, y: 0, w: 1920, h: 1080, U: 1080 })
  })

  it('clamps ultra-wide windows and centres the stage', () => {
    const s = stageRect(5120, 1440)
    expect(s.w).toBeCloseTo(3600)
    expect(s.x).toBeCloseTo(760)
    expect(s.U).toBe(1440)
  })

  it('clamps very tall windows', () => {
    const s = stageRect(240, 1000)
    expect(s.h).toBeCloseTo(600)
    expect(s.y).toBeCloseTo(200)
    expect(s.U).toBe(240)
  })

  it('never goes below the minimum side', () => {
    expect(stageRect(100, 100)).toMatchObject({ w: 240, h: 240, U: 240 })
  })

  it('treats a missing or non-finite size as the minimum', () => {
    for (const bad of [NaN, undefined, Infinity, null]) {
      expect(stageRect(bad, bad)).toMatchObject({ w: 240, h: 240, U: 240 })
    }
  })
})

describe('shapeArea', () => {
  it('matches the analytic formulas', () => {
    expect(shapeArea(square(0, 0, 10))).toBe(100)
    expect(shapeArea({ type: 'bar', cx: 0, cy: 0, w: 20, h: 5, rotation: 0 })).toBe(100)
    expect(shapeArea({ type: 'circle', cx: 0, cy: 0, w: 10, h: 10, rotation: 0 })).toBeCloseTo(Math.PI * 25)
    expect(shapeArea(cross(0, 0, 100))).toBeCloseTo(5100)
    expect(shapeArea({ type: 'triangle', cx: 0, cy: 0, w: 10, h: 8, rotation: 0 })).toBe(40)
  })

  it('rejects unknown types', () => {
    expect(() => shapeArea({ type: 'star' })).toThrow()
  })

  it('cross pieces are disjoint and add up to the cross area', () => {
    const c = cross(50, 60, 100, 33)
    const sum = shapePolys(c).reduce((acc, p) => acc + polygonArea(p), 0)
    expect(sum).toBeCloseTo(shapeArea(c))
    expect(polygonArea(localOutline(c))).toBeCloseTo(shapeArea(c))
  })

  it('circle polygon is within 1% of the true area', () => {
    const c = { type: 'circle', cx: 0, cy: 0, w: 100, h: 100, rotation: 0 }
    const poly = polygonArea(shapePolys(c)[0])
    expect(poly / shapeArea(c)).toBeGreaterThan(1)
    expect(poly / shapeArea(c)).toBeLessThan(1.01)
  })
})

describe('shapeBounds / shapeRadius', () => {
  it('a square turned 45 degrees reaches its half-diagonal', () => {
    const b = shapeBounds(square(100, 100, 10, 45))
    const half = 10 * Math.SQRT1_2
    expect(b.minX).toBeCloseTo(100 - half)
    expect(b.maxX).toBeCloseTo(100 + half)
    expect(b.minY).toBeCloseTo(100 - half)
    expect(b.maxY).toBeCloseTo(100 + half)
  })

  it('a bar turned 90 degrees swaps its extents', () => {
    const b = shapeBounds({ type: 'bar', cx: 0, cy: 0, w: 40, h: 10, rotation: 90 })
    expect(b.maxX - b.minX).toBeCloseTo(10)
    expect(b.maxY - b.minY).toBeCloseTo(40)
  })

  it('circle bounds ignore rotation and use the true radius', () => {
    const b = shapeBounds({ type: 'circle', cx: 5, cy: 5, w: 20, h: 20, rotation: 17 })
    expect(b).toEqual({ minX: -5, maxX: 15, minY: -5, maxY: 15 })
  })

  it('radius is the farthest vertex', () => {
    expect(shapeRadius(square(0, 0, 10))).toBeCloseTo(Math.hypot(5, 5))
    expect(shapeRadius({ type: 'circle', cx: 0, cy: 0, w: 10, h: 10, rotation: 0 })).toBe(5)
    expect(shapeRadius(cross(0, 0, 100))).toBeCloseTo(Math.hypot(50, 15))
  })
})

describe('shapeDistance', () => {
  it('measures a straight gap', () => {
    expect(shapeDistance(square(0, 0, 10), square(20, 0, 10))).toBeCloseTo(10)
  })

  it('measures a diagonal gap corner to corner', () => {
    expect(shapeDistance(square(0, 0, 10), square(20, 20, 10))).toBeCloseTo(Math.hypot(10, 10))
  })

  it('is 0 for overlapping and for touching shapes', () => {
    expect(shapeDistance(square(0, 0, 10), square(5, 0, 10))).toBe(0)
    expect(shapeDistance(square(0, 0, 10), square(10, 0, 10))).toBeCloseTo(0)
  })

  it('works between rotated shapes', () => {
    // a square turned 45 degrees has its corner at 7.07 from its centre
    const d = shapeDistance(square(0, 0, 10, 45), square(30, 0, 10))
    expect(d).toBeCloseTo(30 - 5 - 10 * Math.SQRT1_2)
  })

  it('returns a lower bound >= cutoff for far-apart shapes', () => {
    expect(shapeDistance(square(0, 0, 10), square(500, 0, 10), 50)).toBeGreaterThanOrEqual(50)
  })

  it('sees the gap between a cross arm and a neighbour', () => {
    // cross span 100 -> right arm tip at x=50
    expect(shapeDistance(cross(0, 0, 100), square(80, 0, 10))).toBeCloseTo(25)
  })
})

describe('shapeOverlapArea', () => {
  it('is 0 for separated or merely touching shapes', () => {
    expect(shapeOverlapArea(square(0, 0, 10), square(30, 0, 10))).toBe(0)
    expect(shapeOverlapArea(square(0, 0, 10), square(10, 0, 10))).toBeCloseTo(0)
  })

  it('half-overlapping squares share half a square', () => {
    expect(shapeOverlapArea(square(0, 0, 10), square(5, 0, 10))).toBeCloseTo(50)
  })

  it('a square and its 45-degree twin share a regular octagon', () => {
    const octagon = 2 * (Math.SQRT2 - 1) * 100
    expect(shapeOverlapArea(square(0, 0, 10), square(0, 0, 10, 45))).toBeCloseTo(octagon)
  })

  it('a square covering a whole cross overlaps by the cross area', () => {
    expect(shapeOverlapArea(cross(0, 0, 100), square(0, 0, 100))).toBeCloseTo(5100)
  })

  it('does not double count the centre of a cross', () => {
    // a 10x10 square sitting inside the central square of the cross
    expect(shapeOverlapArea(cross(0, 0, 100), square(0, 0, 10))).toBeCloseTo(100)
  })

  it('is symmetric and translation invariant', () => {
    const a = cross(10, 20, 80, 20)
    const b = { type: 'bar', cx: 40, cy: 25, w: 90, h: 12, rotation: -35 }
    const ab = shapeOverlapArea(a, b)
    expect(ab).toBeGreaterThan(0)
    expect(shapeOverlapArea(b, a)).toBeCloseTo(ab)
    expect(shapeOverlapArea(translateShape(a, 300, -70), translateShape(b, 300, -70))).toBeCloseTo(ab)
  })
})
