// A composition is named by a seed and the size of the canvas it was built for:
// the generator is deterministic in both. A link carries them in the hash,
// `#seed=483920&size=1920x1080&v=1`, so it needs no server and no page reload.
// `v` is the version of the generator that made it (see suprematism/version.js):
// the same seed gives the same picture only from the same generator, so a link
// from another version is recognised, and says so, rather than showing the wrong
// picture without a word.

import { MIN_SIDE } from './suprematism/geometry.js'
import { GENERATOR_VERSION } from './suprematism/version.js'

const SEED_LIMIT = 2 ** 32 // createRng takes a 32-bit seed
const MAX_SIDE = 8192 // far beyond any screen; a hand-typed link must not ask for more

export const newSeed = () => Math.floor(Math.random() * 1_000_000)

export const formatHash = ({ seed, width, height, version = GENERATOR_VERSION }) =>
  `#seed=${seed}&size=${width}x${height}&v=${version}`

// True for a link that says it was made by another version of the generator. A link
// with no version (typed by hand, or older than versions) is not accused of anything.
export const madeByAnotherGenerator = (version) => version !== null && version !== GENERATOR_VERSION

const sideOk = (n) => n >= MIN_SIDE && n <= MAX_SIDE

// `{ seed, size, version }` for a hash that names a composition, otherwise null.
// `size` is `{ width, height }`, or null when the hash has none (or an unusable
// one): the composition is then built for the window it is opened in. `version` is
// the generator version the link was made by, or null when it has none (or garbage).
export function parseHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''))

  const rawSeed = params.get('seed') ?? ''
  if (!/^\d{1,10}$/.test(rawSeed) || Number(rawSeed) >= SEED_LIMIT) return null

  const match = /^(\d{1,5})x(\d{1,5})$/.exec(params.get('size') ?? '')
  const width = match ? Number(match[1]) : NaN
  const height = match ? Number(match[2]) : NaN
  const rawVersion = params.get('v') ?? ''
  return {
    seed: Number(rawSeed),
    size: sideOk(width) && sideOk(height) ? { width, height } : null,
    version: /^\d{1,4}$/.test(rawVersion) && Number(rawVersion) >= 1 ? Number(rawVersion) : null,
  }
}
