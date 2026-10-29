// "Order": how much of the law a picture still obeys. The validator says which
// laws a composition breaks; the animation only moves and turns the forms, so
// the laws about what the forms are (how many, which colours, how big) stay as
// generated and would only pad the percentage. Order counts the laws about
// place: position, turn, distance and the balance that follows from them.
//
// order.test.js fails if a violation code is in neither list, so a new rule has
// to be classified before it can ship.

import { validateComposition } from './validate.js'

export const LAWS_OF_KIND = [
  'SCHEMA',
  'FLAT_COLOUR',
  'PALETTE',
  'COLOUR_COUNT',
  'BLACK_PRESENT',
  'COUNT',
  'MIN_SIZE',
  'COVERAGE',
  'VOCABULARY',
  'LONG_LINE',
  'COLOUR_BUDGET',
  'STATIC_FORM',
  'STATIC_COLOUR',
]

// Per mode, because a static composition is judged by far fewer laws. The
// overlap codes of a dynamic composition (GRAZE, Z_ORDER, ...) are left out of
// the static list: there STATIC_NO_OVERLAP already says the same thing.
export const LAWS_OF_PLACE = {
  dynamic: [
    'MARGIN',
    'NEAR_MISS',
    'GRAZE',
    'OVERLAP_RULES',
    'CROSSING_ANGLE',
    'Z_ORDER',
    'BALANCE',
    'HIERARCHY', // its weight share depends on where the dominant form lies
    'ORIENTATION',
    'FREE_ACCENTS',
    'ANGLE_TANGENCY',
    'TILT',
    'NOT_AXIS_ALIGNED',
    'DOMINANT_OFFCENTRE',
    'CENTRAL_AXES',
    'ASCENT',
    'RHYTHM',
    'SPREAD',
    'MIRROR',
  ],
  static: ['MARGIN', 'NEAR_MISS', 'BALANCE', 'STATIC_NO_OVERLAP', 'STATIC_ORIENTATION', 'STATIC_CENTRED'],
}

// `order` runs from 1 (every law of place holds, as in a fresh composition) to 0
// (all broken). `broken` has one violation per broken law, in the validator's
// words, for showing why.
export function measureOrder(comp) {
  const laws = LAWS_OF_PLACE[comp.mode]
  if (!laws) throw new Error(`unknown mode: ${comp.mode}`)

  const broken = []
  for (const violation of validateComposition(comp).violations) {
    if (laws.includes(violation.code) && !broken.some((b) => b.code === violation.code)) {
      broken.push(violation)
    }
  }
  const kept = laws.length - broken.length
  return { order: kept / laws.length, kept, total: laws.length, broken }
}
