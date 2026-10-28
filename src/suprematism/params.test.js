import { describe, it, expect } from 'vitest'
import { PARAMS } from './params.js'
import { LIMITS } from './validate.js'

// PARAMS are where the generator aims; LIMITS are the laws. Aiming outside a
// law would only make the generator reject its own work, so keep them nested.
const D = PARAMS.dynamic

describe('generator targets sit inside the laws', () => {
  it('keeps its distance from the edge and between forms', () => {
    expect(PARAMS.margin).toBeGreaterThanOrEqual(LIMITS.margin)
    expect(PARAMS.gap).toBeGreaterThanOrEqual(LIMITS.minGap)
    expect(PARAMS.gapConservative).toBeGreaterThanOrEqual(LIMITS.minGap)
  })

  it('aims the balance inside the limit', () => {
    expect(PARAMS.balance.dynamic[1]).toBeLessThanOrEqual(D.balanceMax)
    expect(D.balanceMax).toBeLessThanOrEqual(LIMITS.balance.dynamic)
    expect(PARAMS.balance.static).toBeLessThanOrEqual(LIMITS.balance.static)
  })

  it('places the dominant form and the major forms inside their laws', () => {
    expect(D.dominantOffcentre[0]).toBeGreaterThanOrEqual(LIMITS.dominantOffcentre[0])
    expect(D.dominantOffcentre[1]).toBeLessThanOrEqual(LIMITS.dominantOffcentre[1])
    expect(D.centralAxesClearance).toBeGreaterThanOrEqual(LIMITS.centralAxes.clearance)
  })

  it('keeps every tilt it picks inside the TILT and axis laws', () => {
    for (const [lo, hi] of Object.values(D.tilt)) {
      // rotation is +-tau, i.e. tau or 90 - tau modulo 90
      const angles = [lo, hi, 90 - lo, 90 - hi]
      expect(Math.min(...angles)).toBeGreaterThanOrEqual(LIMITS.tilt[0])
      expect(Math.max(...angles)).toBeLessThanOrEqual(LIMITS.tilt[1])
      expect(Math.min(...angles)).toBeGreaterThanOrEqual(LIMITS.axisAligned)
    }
    expect(D.freeAccent.deviation[0]).toBeGreaterThanOrEqual(LIMITS.freeAccents.minDeviation)
    expect(D.freeAccent.wrapMin).toBeGreaterThanOrEqual(LIMITS.axisAligned)
  })

  it('aims crossings and ascent inside the laws', () => {
    expect(D.crossings.fraction[0]).toBeGreaterThanOrEqual(LIMITS.graze[0])
    expect(D.crossings.fraction[1]).toBeLessThanOrEqual(LIMITS.graze[1])
    expect(D.ascentMin).toBeGreaterThanOrEqual(LIMITS.ascent)
  })

  it('keeps the static main form near the centre', () => {
    expect(PARAMS.static.mainOffset).toBeLessThanOrEqual(LIMITS.static.centred)
  })

  it('generates only forms the validator accepts', () => {
    expect(D.triangleAreaOfDominant).toBeLessThanOrEqual(LIMITS.vocabulary.triangleAreaOfDominant)
    expect(PARAMS.static.satelliteArea).toBeLessThanOrEqual(LIMITS.static.satelliteArea)
    expect(PARAMS.minBarThicknessPx).toBeGreaterThanOrEqual(LIMITS.minSize.barThicknessPx)
    expect(D.barAspect.big[0]).toBeGreaterThanOrEqual(3)
  })
})

describe('the long line', () => {
  const L = D.longLine

  it('is no thicker, relative to its length, than the law allows', () => {
    expect(L.maxAspect).toBeLessThanOrEqual(LIMITS.barAspect[1])
  })

  it('is told apart from the ordinary thin lines: they are never counted as very long', () => {
    expect(D.barAspect.line[1]).toBeLessThanOrEqual(LIMITS.vocabulary.veryLongAspect)
    // and the shortest long line is still a very long one at the greatest thickness
    expect(L.lengthOfU[0] / (0.012 * L.thickness[1])).toBeGreaterThan(LIMITS.vocabulary.veryLongAspect * 0.9)
  })

  it('is never thinner than the thinnest bar the laws allow', () => {
    expect(L.thickness[0]).toBeGreaterThanOrEqual(1)
    expect(0.012).toBeGreaterThanOrEqual(LIMITS.minSize.barThickness)
    expect(PARAMS.minBarThicknessPx).toBeGreaterThanOrEqual(LIMITS.minSize.barThicknessPx)
  })

  it('keeps the other forms within the count law once the line is one of them', () => {
    // the others are built as an ordinary composition of at least five forms
    expect(L.minCount - 1).toBeGreaterThanOrEqual(Math.min(...D.count.values))
    expect(L.minCount).toBeLessThanOrEqual(LIMITS.counts.dynamic[1])
    expect(Math.max(...D.count.values)).toBeLessThanOrEqual(LIMITS.counts.dynamic[1])
  })

  it('has sane shares and ranges', () => {
    expect(L.chance).toBeGreaterThan(0)
    expect(L.chance).toBeLessThan(1)
    expect(L.lengthOfU[0]).toBeLessThan(L.lengthOfU[1])
    expect(L.lengthOfRoom[0]).toBeLessThan(L.lengthOfRoom[1])
    expect(L.lengthOfRoom[1]).toBeLessThanOrEqual(1) // never longer than what fits the margin
  })
})

describe('there are always at least two forms', () => {
  it('never builds a lone static form', () => {
    expect(PARAMS.static.layouts.values).not.toContain('single')
    expect(PARAMS.static.layouts.values.length).toBeGreaterThan(0)
  })

  it('has laws that demand two forms or more in both modes', () => {
    expect(LIMITS.counts.static[0]).toBeGreaterThanOrEqual(2)
    expect(LIMITS.counts.dynamic[0]).toBeGreaterThanOrEqual(2)
    expect(Math.min(...D.count.values, ...D.conservativeCount)).toBeGreaterThanOrEqual(2)
  })
})
