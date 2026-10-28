import { describe, it, expect } from 'vitest'
import { captionLayout, captionLines, captionTitle, haloWidth, HALO_COLOR, SITE } from './caption.js'
import { stageRect, GROUND_COLOR } from './suprematism'
import { luminance } from './suprematism/palettes.js'
import { VIEWPORTS } from './suprematism/testUtils.js'

// WCAG contrast ratio of two colours
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('captionTitle', () => {
  it('names the seed', () => {
    expect(captionTitle(625715)).toBe('SUPREMATH № 625715')
    expect(captionTitle(0)).toBe('SUPREMATH № 0')
  })

  it('has a site address to go with it', () => {
    expect(SITE).toBe('supremath.art')
  })
})

describe('captionLayout', () => {
  it.each(VIEWPORTS)('keeps the caption inside the picture at $name', ({ width, height }) => {
    const c = captionLayout(width, height)
    expect(c.x).toBeLessThan(width)
    expect(c.x).toBeGreaterThan(width / 2) // right-aligned text must start in the right half
    expect(c.titleY).toBeGreaterThan(0)
    expect(c.subtitleY).toBeLessThan(height / 4)
    expect(c.subtitleY).toBeGreaterThan(c.titleY)
  })

  it.each(VIEWPORTS)('is never smaller than a readable label at $name', ({ width, height }) => {
    const c = captionLayout(width, height)
    expect(c.titleSize).toBeGreaterThanOrEqual(10.5)
    expect(c.subtitleSize).toBeGreaterThanOrEqual(0.85 * 10.5 - 1e-9)
    expect(c.subtitleSize).toBeLessThan(c.titleSize)
  })

  it('keeps a margin from the top and right edges', () => {
    for (const { width, height } of VIEWPORTS) {
      const c = captionLayout(width, height)
      expect(width - c.x).toBeGreaterThanOrEqual(16)
      // the capitals' tops sit at the margin: the baseline is below it
      expect(c.titleY).toBeGreaterThan(16)
    }
  })

  it('grows with the picture on a big screen, as the forms do', () => {
    // both well above the readable minimum, where the size follows U exactly
    const small = captionLayout(2560, 1440)
    const big = captionLayout(3840, 2160)
    expect(big.titleSize).toBeGreaterThan(small.titleSize)
    expect(big.titleSize / small.titleSize).toBeCloseTo(stageRect(3840, 2160).U / stageRect(2560, 1440).U, 9)
  })

  it('holds the readable minimum on a small screen instead of shrinking with it', () => {
    expect(captionLayout(1280, 720).titleSize).toBe(10.5)
    expect(captionLayout(390, 844).titleSize).toBe(10.5)
  })

  it('depends on the stage, not on a very wide canvas', () => {
    // U is the smaller side of the stage, so a wider window does not enlarge the label
    expect(captionLayout(3000, 1000).titleSize).toBeCloseTo(captionLayout(2000, 1000).titleSize, 9)
  })
})

describe('captionLines', () => {
  const lines = captionLines(625715, 1920, 1080)

  it('has the title first and the address under it', () => {
    expect(lines.map((l) => l.text)).toEqual(['SUPREMATH № 625715', SITE])
    expect(lines[1].y).toBeGreaterThan(lines[0].y)
    expect(lines[0].x).toBe(lines[1].x)
  })

  it('has a halo in the colour of the ground, so the letters read on a form of any colour', () => {
    expect(HALO_COLOR).toBe(GROUND_COLOR)
    for (const line of lines) expect(line.halo).toBeGreaterThan(0)
  })

  it('has a halo that shows: at least 1.5 px outside the letters even at the smallest size', () => {
    const smallest = captionLines(1, 240, 240)
    for (const line of smallest) expect(line.halo / 2).toBeGreaterThanOrEqual(1.5)
  })

  it('grows its halo with the text', () => {
    expect(haloWidth(20)).toBeCloseTo(2 * haloWidth(10), 9)
    const big = captionLines(1, 3840, 2160)
    const small = captionLines(1, 1280, 720)
    expect(big[0].halo).toBeGreaterThan(small[0].halo)
  })

  it('reads on the ground, both lines (WCAG AA: 4.5 to 1)', () => {
    for (const line of lines) expect(contrast(line.fill, GROUND_COLOR)).toBeGreaterThanOrEqual(4.5)
  })

  it('does not hide the letters in their own halo', () => {
    for (const line of lines) expect(line.fill).not.toBe(HALO_COLOR)
  })
})
