// Seedable RNG and small sampling helpers. Every function that needs
// randomness takes an `rng` (a () => [0, 1) function) so a failing
// composition can be reproduced from its seed.

// mulberry32: tiny, fast, good enough for layout decisions.
export function createRng(seed) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randFloat = (rng, min, max) => rng() * (max - min) + min

// min inclusive, max exclusive (same contract as the old getRandomInt)
export const randInt = (rng, min, max) => Math.floor(rng() * (max - min) + min)

export const chance = (rng, p) => rng() < p

export const randSign = (rng) => (rng() < 0.5 ? -1 : 1)

export const pick = (rng, array) =>
  array[Math.min(array.length - 1, Math.floor(rng() * array.length))]

export function pickWeighted(rng, items, weights) {
  let total = 0
  for (const w of weights) total += w
  let r = rng() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r < 0) return items[i]
  }
  return items[items.length - 1]
}

// Fisher-Yates on a copy
export function shuffle(rng, array) {
  const out = array.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
