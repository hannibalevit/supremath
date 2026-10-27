import { describe, it, expect } from 'vitest'
import { stageRect } from './geometry.js'
import { minimalStatic } from './fallback.js'
import { validateComposition } from './validate.js'
import { createRng, randFloat } from './random.js'

describe('minimalStatic', () => {
  it('is valid for 5000 random window sizes, up to 4:1', () => {
    const rng = createRng(2024)
    const bad = []
    for (let i = 0; i < 5000; i++) {
      const width = randFloat(rng, 240, 8000)
      const height = Math.max(240, Math.min(8000, width / randFloat(rng, 0.25, 4)))
      const stage = stageRect(width, height)
      const comp = { mode: 'static', width: stage.cx * 2, height: stage.cy * 2, shapes: minimalStatic(stage) }
      const { valid, violations } = validateComposition(comp)
      if (!valid) bad.push({ width, height, codes: violations.map((v) => v.code) })
    }
    expect(bad.slice(0, 3)).toEqual([])
  })

  it('is two forms: a black square and a small red satellite', () => {
    const [main, satellite] = minimalStatic(stageRect(1000, 600))
    expect(minimalStatic(stageRect(1000, 600))).toHaveLength(2)
    expect(main).toMatchObject({ type: 'square', cx: 500, cy: 300, rotation: 0, color: '#111111' })
    expect(main.w).toBeCloseTo(0.4 * 600)
    expect(satellite).toMatchObject({ type: 'square', color: '#e0301e' })
    expect(satellite.w).toBeCloseTo(0.07 * 600)
  })
})
