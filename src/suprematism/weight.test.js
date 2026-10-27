import { describe, it, expect } from 'vitest'
import { stageRect } from './geometry.js'
import { COLOURS } from './palettes.js'
import { visualWeight, visualMass, weightsShifted, centreOfMass, balanceOffset, centreDistance } from './weight.js'

const stage = stageRect(1000, 1000) // centre (500, 500), area 1e6
const sq = (cx, cy, s, color = COLOURS.black) => ({
  type: 'square',
  cx,
  cy,
  w: s,
  h: s,
  rotation: 0,
  color,
})

describe('visualWeight', () => {
  it('matches a hand-computed value', () => {
    // area share 0.01 -> 0.01^0.85 = 0.019953; black #111111 has luminance
    // 0.005605 -> colour factor 0.6 + 0.8 * 0.994395 = 1.395516; centred -> x1
    expect(visualWeight(sq(500, 500, 100), stage)).toBeCloseTo(0.027844, 5)
  })

  it('grows with area, but sub-linearly', () => {
    const small = visualWeight(sq(500, 500, 100), stage)
    const big = visualWeight(sq(500, 500, 200), stage) // 4x the area
    expect(big).toBeGreaterThan(small)
    expect(big / small).toBeCloseTo(4 ** 0.85, 5)
  })

  it('makes black heavier than yellow at the same size and place', () => {
    const black = visualWeight(sq(500, 500, 100, COLOURS.black), stage)
    const yellow = visualWeight(sq(500, 500, 100, COLOURS.yellow), stage)
    expect(black).toBeGreaterThan(yellow * 1.3)
  })

  it('grows with distance from the centre, up to 1.6x in a corner', () => {
    const centred = visualWeight(sq(500, 500, 100), stage)
    const corner = visualWeight(sq(1000, 1000, 100), stage)
    expect(corner / centred).toBeCloseTo(1.6, 5)
  })
})

describe('centreDistance', () => {
  it('is 0 at the centre and 1 at a corner', () => {
    expect(centreDistance(sq(500, 500, 10), stage)).toBe(0)
    expect(centreDistance(sq(0, 0, 10), stage)).toBeCloseTo(1)
  })

  it('is normalised per axis on a non-square stage', () => {
    const wide = stageRect(2000, 1000)
    expect(centreDistance(sq(2000, 500, 10), wide)).toBeCloseTo(Math.SQRT1_2)
  })
})

describe('centreOfMass / balanceOffset', () => {
  it('a single centred shape sits exactly at the centre', () => {
    const shapes = [sq(500, 500, 120)]
    expect(centreOfMass(shapes, stage)).toMatchObject({ x: 500, y: 500 })
    expect(balanceOffset(shapes, stage).norm).toBe(0)
  })

  it('a symmetric pair balances at the centre', () => {
    const shapes = [sq(300, 400, 100), sq(700, 600, 100)]
    const { bx, by, norm } = balanceOffset(shapes, stage)
    expect(bx).toBeCloseTo(0, 10)
    expect(by).toBeCloseTo(0, 10)
    expect(norm).toBeCloseTo(0, 10)
  })

  it('the centre of mass leans toward the heavier shape', () => {
    const shapes = [sq(300, 500, 200), sq(700, 500, 50)]
    const g = centreOfMass(shapes, stage)
    expect(g.x).toBeLessThan(500)
    expect(g.x).toBeGreaterThan(300)
  })

  it('reports the offset in half-stage units', () => {
    const { bx, by, norm } = balanceOffset([sq(750, 500, 100)], stage)
    expect(bx).toBeCloseTo(0.5)
    expect(by).toBeCloseTo(0)
    expect(norm).toBeCloseTo(0.5)
  })

  it('falls back to the centre when there is nothing to weigh', () => {
    expect(centreOfMass([], stage)).toMatchObject({ x: 500, y: 500, total: 0 })
  })
})

describe('weightsShifted', () => {
  it('matches visualWeight of the shapes actually moved', () => {
    const shapes = [sq(300, 400, 120), sq(700, 650, 80, COLOURS.red), sq(520, 480, 200, COLOURS.yellow)]
    const masses = shapes.map((s) => visualMass(s, stage))
    for (const [dx, dy] of [[0, 0], [60, -40], [-300, 220]]) {
      const moved = shapes.map((s) => ({ ...s, cx: s.cx + dx, cy: s.cy + dy }))
      const fast = weightsShifted(shapes, masses, stage, dx, dy)
      moved.forEach((s, i) => expect(fast[i]).toBeCloseTo(visualWeight(s, stage), 12))
    }
  })

  it('can reuse an output array', () => {
    const shapes = [sq(500, 500, 100)]
    const out = [0]
    expect(weightsShifted(shapes, [1], stage, 0, 0, out)).toBe(out)
  })
})
