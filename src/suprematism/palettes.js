// Flat, pure Suprematist colours on a white ground. No gradients: they imply
// light and volume, which Suprematism rejects.

export const GROUND_COLOR = '#f2f2f2'

export const COLOURS = {
  black: '#111111',
  red: '#e0301e',
  yellow: '#f7c600',
  blue: '#1d4e9e',
  green: '#2e8b57',
  orange: '#f08a1c',
}

export const BLACK = COLOURS.black

// `lead` takes the largest coloured area, `pool` supplies the accents.
// Black is always added by the generator, so it is not listed here.
export const PALETTES = [
  { name: 'red', lead: COLOURS.red, pool: [COLOURS.yellow, COLOURS.blue], weight: 3 },
  { name: 'blue', lead: COLOURS.blue, pool: [COLOURS.red, COLOURS.yellow], weight: 2 },
  { name: 'yellow', lead: COLOURS.yellow, pool: [COLOURS.red, COLOURS.blue], weight: 2 },
  { name: 'green', lead: COLOURS.green, pool: [COLOURS.red, COLOURS.yellow], weight: 1 },
  { name: 'orange', lead: COLOURS.orange, pool: [COLOURS.blue, COLOURS.green], weight: 1 },
]

export const ALL_COLOURS = Object.values(COLOURS)

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

// WCAG relative luminance, 0 (black) .. 1 (white)
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Darker colours weigh more: black ~1.4, yellow ~0.9
export const colourFactor = (hex) => 0.6 + 0.8 * (1 - luminance(hex))

// True when every chromatic colour in `colours` belongs to a single palette.
export function fitsOnePalette(colours) {
  const chromatic = colours.filter((c) => c !== BLACK)
  return PALETTES.some((p) => {
    const allowed = [p.lead, ...p.pool]
    return chromatic.every((c) => allowed.includes(c))
  })
}
