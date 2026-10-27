// generate -> validate -> retry -> fallback. The composition returned here has
// always passed validateComposition (or is the by-construction valid fallback),
// so the rest of the app never has to check it.

import { stageRect } from './geometry.js'
import { validateComposition } from './validate.js'
import { buildDynamic } from './dynamic.js'
import { buildStatic } from './static.js'
import { minimalStatic } from './fallback.js'
import { PARAMS } from './params.js'

export function generateComposition({ width, height, rng = Math.random, mode } = {}) {
  const stage = stageRect(width, height)
  const canvas = { width: stage.cx * 2, height: stage.cy * 2 }
  const wanted = mode ?? (rng() < PARAMS.dynamicShare ? 'dynamic' : 'static')
  const meta = { attempts: 0, fallback: false, rejections: {} }

  const reject = (code) => {
    meta.rejections[code] = (meta.rejections[code] ?? 0) + 1
  }

  // One builder run + validation; returns the composition or null.
  function attempt(build, buildMode, profile) {
    meta.attempts++
    const shapes = build(stage, rng, profile)
    if (!shapes) {
      reject(`BUILD:${build.lastFailure ?? 'unknown'}`)
      return null
    }
    const comp = { mode: buildMode, ...canvas, shapes }
    const { valid, violations } = validateComposition(comp)
    if (valid) return comp
    for (const code of new Set(violations.map((v) => v.code))) reject(code)
    return null
  }

  function run(count, build, buildMode, profile) {
    for (let i = 0; i < count; i++) {
      const comp = attempt(build, buildMode, profile)
      if (comp) return comp
    }
    return null
  }

  const build = wanted === 'dynamic' ? buildDynamic : buildStatic
  let comp = run(PARAMS.attempts.primary, build, wanted, 'normal')

  if (!comp && wanted === 'dynamic') {
    comp = run(PARAMS.attempts.conservative, buildDynamic, 'dynamic', 'conservative')
    if (comp) meta.fallback = 'conservative'
  }
  if (!comp && wanted === 'dynamic') {
    comp = run(PARAMS.attempts.staticFallback, buildStatic, 'static', 'normal')
    if (comp) meta.fallback = 'static'
  }
  if (!comp) {
    comp = { mode: 'static', ...canvas, shapes: minimalStatic(stage) }
    meta.fallback = 'minimal'
  }

  return { ...comp, meta }
}
