import { describe, it, expect } from 'vitest'
import { createRng, randFloat, randInt, pick, pickWeighted, shuffle, chance } from './random.js'

const sample = (rng, n) => Array.from({ length: n }, () => rng())

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    expect(sample(createRng(42), 20)).toEqual(sample(createRng(42), 20))
  })

  it('differs between seeds', () => {
    expect(sample(createRng(1), 5)).not.toEqual(sample(createRng(2), 5))
  })

  it('stays within [0, 1)', () => {
    for (const v of sample(createRng(7), 5000)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('sampling helpers', () => {
  it('randInt covers [min, max) and never reaches max', () => {
    const rng = createRng(3)
    const seen = new Set(Array.from({ length: 2000 }, () => randInt(rng, 5, 9)))
    expect([...seen].sort()).toEqual([5, 6, 7, 8])
  })

  it('randFloat respects its bounds', () => {
    const rng = createRng(4)
    for (let i = 0; i < 1000; i++) {
      const v = randFloat(rng, -2, 3)
      expect(v).toBeGreaterThanOrEqual(-2)
      expect(v).toBeLessThan(3)
    }
  })

  it('pick survives extreme rng values', () => {
    const items = ['a', 'b', 'c']
    expect(pick(() => 0, items)).toBe('a')
    expect(pick(() => 0.9999999, items)).toBe('c')
  })

  it('pickWeighted never picks a zero-weight item and follows the weights', () => {
    const rng = createRng(5)
    const counts = [0, 0, 0]
    const n = 20000
    for (let i = 0; i < n; i++) counts[pickWeighted(rng, [0, 1, 2], [1, 0, 3])]++
    expect(counts[1]).toBe(0)
    expect(counts[0] / n).toBeCloseTo(0.25, 1)
    expect(counts[2] / n).toBeCloseTo(0.75, 1)
  })

  it('pickWeighted handles rng at both ends', () => {
    expect(pickWeighted(() => 0, ['x', 'y'], [1, 1])).toBe('x')
    expect(pickWeighted(() => 0.9999999, ['x', 'y'], [1, 1])).toBe('y')
  })

  it('shuffle returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const out = shuffle(createRng(9), input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
    expect(out.slice().sort()).toEqual(input)
  })

  it('chance follows its probability', () => {
    const rng = createRng(11)
    let hits = 0
    for (let i = 0; i < 10000; i++) if (chance(rng, 0.3)) hits++
    expect(hits / 10000).toBeCloseTo(0.3, 1)
  })
})
