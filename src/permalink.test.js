import { describe, it, expect } from 'vitest'
import { formatHash, parseHash, newSeed, madeByAnotherGenerator } from './permalink.js'
import { GENERATOR_VERSION } from './suprematism/version.js'
import { generateComposition, createRng } from './suprematism'

describe('formatHash', () => {
  it('writes the seed and the size', () => {
    expect(formatHash({ seed: 483920, width: 1920, height: 1080 })).toBe(`#seed=483920&size=1920x1080&v=${GENERATOR_VERSION}`)
  })
})

describe('parseHash', () => {
  it('reads back what formatHash wrote', () => {
    const named = { seed: 7, width: 390, height: 844 }
    expect(parseHash(formatHash(named))).toEqual({ seed: 7, size: { width: 390, height: 844 }, version: GENERATOR_VERSION })
  })

  it('accepts a hash without the leading #', () => {
    expect(parseHash('seed=12&size=800x600')).toEqual({ seed: 12, size: { width: 800, height: 600 }, version: null })
  })

  it('does not mind the order of the parts or extra ones', () => {
    expect(parseHash('#size=800x600&x=1&seed=12&v=3')).toEqual({ seed: 12, size: { width: 800, height: 600 }, version: 3 })
  })

  it('takes a seed alone, with no size', () => {
    expect(parseHash('#seed=5')).toEqual({ seed: 5, size: null, version: null })
    expect(parseHash('#seed=0')).toEqual({ seed: 0, size: null, version: null })
  })

  it.each([
    ['', 'empty'],
    ['#', 'a bare #'],
    ['#size=800x600', 'no seed'],
    ['#seed=', 'an empty seed'],
    ['#seed=abc', 'a word'],
    ['#seed=-1', 'a negative seed'],
    ['#seed=1.5', 'a fraction'],
    ['#seed=1e3', 'an exponent'],
    ['#seed=4294967296', 'more than 32 bits'],
    ['#seed=99999999999', 'far more than 32 bits'],
    ['#/about', 'a different kind of hash'],
  ])('rejects %j (%s)', (hash) => {
    expect(parseHash(hash)).toBeNull()
  })

  it('accepts the largest 32-bit seed', () => {
    expect(parseHash('#seed=4294967295').seed).toBe(4294967295)
  })

  it.each([
    ['#seed=1&size=800'],
    ['#seed=1&size=800x'],
    ['#seed=1&size=axb'],
    ['#seed=1&size=800x-600'],
    ['#seed=1&size=239x600'],
    ['#seed=1&size=800x239'],
    ['#seed=1&size=8193x600'],
    ['#seed=1&size=123456x600'],
    ['#seed=1&size=0x0'],
  ])('keeps the seed but drops the unusable size in %j', (hash) => {
    expect(parseHash(hash)).toEqual({ seed: 1, size: null, version: null })
  })

  it('accepts the smallest and the largest size', () => {
    expect(parseHash('#seed=1&size=240x240').size).toEqual({ width: 240, height: 240 })
    expect(parseHash('#seed=1&size=8192x8192').size).toEqual({ width: 8192, height: 8192 })
  })
})

describe('the generator version in a link', () => {
  it('is written by formatHash, from the generator by default', () => {
    expect(formatHash({ seed: 1, width: 800, height: 600 })).toMatch(new RegExp(`&v=${GENERATOR_VERSION}$`))
    expect(formatHash({ seed: 1, width: 800, height: 600, version: 7 })).toBe('#seed=1&size=800x600&v=7')
  })

  it('is read back', () => {
    expect(parseHash('#seed=1&size=800x600&v=1').version).toBe(1)
    expect(parseHash('#seed=1&size=800x600&v=12').version).toBe(12)
    expect(parseHash('#seed=1&v=2').version).toBe(2)
  })

  it.each(['', 'abc', '0', '-1', '1.5', '1e3', '12345', ' 1'])('is ignored, with the seed kept, when it is %j', (v) => {
    const parsed = parseHash(`#seed=9&size=800x600&v=${v}`)
    expect(parsed.seed).toBe(9)
    expect(parsed.version).toBeNull()
  })

  it('does not make a hash that has none (typed by hand) a stranger', () => {
    expect(madeByAnotherGenerator(null)).toBe(false)
  })

  it('knows its own generator and a stranger', () => {
    expect(madeByAnotherGenerator(GENERATOR_VERSION)).toBe(false)
    expect(madeByAnotherGenerator(GENERATOR_VERSION + 1)).toBe(true)
    expect(madeByAnotherGenerator(GENERATOR_VERSION + 100)).toBe(true)
  })

  it('names the picture it was written for: a link round-trips through the version too', () => {
    const named = { seed: 42, width: 1280, height: 720 }
    const parsed = parseHash(formatHash(named))
    expect(madeByAnotherGenerator(parsed.version)).toBe(false)
  })
})

describe('newSeed', () => {
  it('is a whole number that parseHash accepts', () => {
    for (let i = 0; i < 200; i++) {
      const seed = newSeed()
      expect(Number.isInteger(seed)).toBe(true)
      expect(parseHash(formatHash({ seed, width: 800, height: 600 })).seed).toBe(seed)
    }
  })
})

describe('a link brings back the same composition', () => {
  const build = ({ seed, width, height }) => generateComposition({ width, height, rng: createRng(seed) })

  it.each([
    [1, 1920, 1080],
    [483920, 390, 844],
    [999999, 5120, 1440],
    [0, 240, 240],
  ])('seed %i at %ix%i', (seed, width, height) => {
    const named = { seed, width, height }
    const { size, seed: parsed } = parseHash(formatHash(named))
    expect(build({ seed: parsed, ...size })).toEqual(build(named))
  })

  it('differs from another seed or another size', () => {
    const a = build({ seed: 10, width: 1920, height: 1080 })
    expect(build({ seed: 11, width: 1920, height: 1080 }).shapes).not.toEqual(a.shapes)
    expect(build({ seed: 10, width: 1280, height: 720 }).shapes).not.toEqual(a.shapes)
  })

  it('covers both orders: some seeds give dynamic, some static', () => {
    const modes = new Set()
    for (let seed = 0; seed < 60; seed++) modes.add(build({ seed, width: 1280, height: 720 }).mode)
    expect(modes).toEqual(new Set(['dynamic', 'static']))
  })
})
