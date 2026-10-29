import { describe, it, expect } from 'vitest'
import { GENERATOR_VERSION } from './version.js'
import { FINGERPRINTS } from './fingerprints.js'
import { compositionFingerprint, fingerprintTable, fingerprintsFileText, FINGERPRINT_SEEDS } from './testUtils.js'
import { generateComposition } from './generate.js'
import { createRng } from './random.js'

// the table takes a few seconds to make, and two tests want it
let made = null
const tableNow = () => (made ??= fingerprintTable())

describe('the generator version', () => {
  it('is a positive whole number', () => {
    expect(Number.isInteger(GENERATOR_VERSION)).toBe(true)
    expect(GENERATOR_VERSION).toBeGreaterThanOrEqual(1)
  })

  it('has fingerprints made for it', () => {
    expect(
      FINGERPRINTS.version,
      `fingerprints.js was made for version ${FINGERPRINTS.version} but GENERATOR_VERSION is ${GENERATOR_VERSION}: ` +
        'they are raised together (see version.js)',
    ).toBe(GENERATOR_VERSION)
  })

  it('still makes the compositions it made when the fingerprints were taken', () => {
    const now = tableNow()
    const changed = Object.keys(now).filter((canvas) => now[canvas] !== FINGERPRINTS.table[canvas])
    const next = GENERATOR_VERSION + 1
    expect(
      changed,
      `The generator now makes other compositions (seeds 1 to ${FINGERPRINT_SEEDS}) on: ${changed.join(', ')}.\n` +
        'Links made before this change would show other pictures than the ones they were made for.\n' +
        `If that is intended: raise GENERATOR_VERSION in version.js to ${next}, and make the whole of fingerprints.js:\n\n` +
        fingerprintsFileText(next, now),
    ).toEqual([])
  })

  it('covers the same canvases', () => {
    expect(Object.keys(tableNow()).sort()).toEqual(Object.keys(FINGERPRINTS.table).sort())
  })
})

describe('compositionFingerprint', () => {
  const make = (seed) => generateComposition({ width: 1280, height: 720, rng: createRng(seed) })

  it('is the same for the same composition and differs for another', () => {
    expect(compositionFingerprint(make(7))).toBe(compositionFingerprint(make(7)))
    expect(compositionFingerprint(make(7))).not.toBe(compositionFingerprint(make(8)))
  })

  it('does not notice what is not the picture: the meta, or noise below a thousandth', () => {
    const comp = make(3)
    const same = {
      ...comp,
      meta: { attempts: 99, fallback: 'minimal', rejections: { X: 1 } },
      shapes: comp.shapes.map((s) => ({ ...s, cx: s.cx + 1e-6 })),
    }
    expect(compositionFingerprint(same)).toBe(compositionFingerprint(comp))
  })

  it('notices a form that moved, changed colour or size, or went missing', () => {
    const comp = make(3)
    const base = compositionFingerprint(comp)
    const edit = (change) =>
      compositionFingerprint({ ...comp, shapes: comp.shapes.map((s, i) => (i === 0 ? { ...s, ...change } : s)) })
    expect(edit({ cx: comp.shapes[0].cx + 0.01 })).not.toBe(base)
    expect(edit({ color: '#000000' })).not.toBe(base)
    expect(edit({ w: comp.shapes[0].w + 0.01 })).not.toBe(base)
    expect(compositionFingerprint({ ...comp, shapes: comp.shapes.slice(1) })).not.toBe(base)
  })
})
