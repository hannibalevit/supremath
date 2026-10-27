import { BLACK, COLOURS } from './palettes.js'

// Valid by construction for any stage with U >= 240, and always two forms: the
// "Black Square" (0.4U, dead-centre) with a small red square above and to the
// right of it. The satellite is 0.07U wide, 0.115U clear of the main form and
// well inside the margin; its weight is under 7% of the main form's, so the
// balance offset stays under 0.05 against a limit of 0.12. fallback.test.js
// checks this on thousands of random sizes.
export function minimalStatic(stage) {
  const side = 0.4 * stage.U
  const small = 0.07 * stage.U
  return [
    { id: 's0', type: 'square', cx: stage.cx, cy: stage.cy, w: side, h: side, rotation: 0, color: BLACK, role: 'main' },
    {
      id: 's1',
      type: 'square',
      cx: stage.cx + 0.35 * stage.U,
      cy: stage.cy - 0.2 * stage.U,
      w: small,
      h: small,
      rotation: 0,
      color: COLOURS.red,
      role: 'satellite',
    },
  ]
}
