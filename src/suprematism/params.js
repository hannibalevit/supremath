// Generator TARGETS. They are deliberately tighter than the validator LIMITS
// (validate.js) by exactly the room the animation needs: params.test.js checks
// the inequalities against MOTION, so raising a motion amplitude without
// widening these margins fails the build.
//
// Distances are fractions of U = min(stage width, stage height).

// Generator TARGETS. Many are deliberately tighter than the validator LIMITS
// (validate.js): the limits are the laws, these are where the generator aims so
// that what it builds sits comfortably inside them. A composition is only
// returned once the validator has accepted it (generate.js).
//
// The animation does NOT keep a composition lawful: forms drift and spin
// independently, which is the "entropy". The laws hold for the generated
// composition, not for every later frame.
//
// Distances are fractions of U = min(stage width, stage height).

export const PARAMS = {
  dynamicShare: 0.8, // share of dynamic compositions when no mode is forced

  margin: 0.055, // limit 0.04
  gap: 0.05, // limit 0.02
  gapConservative: 0.07,
  attempts: { primary: 60, conservative: 100, staticFallback: 20 },

  balance: { dynamic: [0.03, 0.15], static: 0.08 }, // limits 0.28 / 0.12
  minBarThicknessPx: 4, // limit max(0.008U, 3px)

  dynamic: {
    count: { values: [5, 6, 7, 8, 9], weights: [1, 3, 3, 2, 1], narrowU: 420, narrowMax: 7 },
    conservativeCount: [5, 6],
    // area ladder: dominant, then each next form ~rho times the previous
    ladder: { rho: [0.42, 0.52], jitter: [0.85, 1.2], secondMax: 0.5 },
    // total area as a multiple of U^2 (not of the stage: on a wide screen the
    // height is what runs out), but never below this share of the stage
    areaOfU: [0.11, 0.21],
    areaOfUConservative: [0.11, 0.15],
    minShareOfStage: 0.065, // limit 0.05
    squareScale: 0.55, // forms are this much smaller on a square stage...
    roomyElongation: 0.78, // ...growing to full size by 16:9 (elongation 1.78)
    bigForms: { values: ['bar', 'square', 'circle', 'cross'], weights: [55, 20, 15, 10] },
    accentForms: {
      values: ['line', 'bar', 'square', 'circle', 'cross', 'triangle'],
      weights: [35, 20, 20, 15, 5, 5],
    },
    barAspect: { big: [3.2, 5], accent: [4, 9], line: [10, 40] },
    minSize: { square: 0.065, circle: 0.065, cross: 0.1, triangle: 0.065 }, // x U
    triangleAreaOfDominant: 0.1, // limit 0.12
    fit: 0.8, // a rotated form fills at most this much of the inset stage

    tilt: { landscape: [20, 45], square: [25, 65], portrait: [45, 70] }, // degrees
    perpendicularBars: 0.3,
    freeAccent: { deviation: [16, 44], crossing: [25, 44], wrapMin: 8 }, // limit deviation 12
    axis: { parallel: 0.65, jitter: 15, minElevation: 20, centreJitter: 0.06, span: [0.45, 0.65], inset: 0.1 },
    gaps: { base: [1, 1.618, 0.618, 1.618, 1, 0.618, 2.618, 1], jitter: [0.85, 1.15], minCV: 0.35, goldenSlot: -0.236 },
    offsets: { dominant: [0, 0.08], other: [0.03, 0.22], flip: 0.3 },
    crossings: { values: [0, 1, 2], weights: [0.25, 0.45, 0.3], fraction: [0.26, 0.38], minAspect: 5 },
    relaxIterations: 40,
    placementTries: 200, // positions tried for the finished composition
    colourShares: { lead: 0.55, black: 0.25, accent1: 0.14, accent2: 0.06 },
    dominantBlack: 0.35,
    lineBlack: 0.6,
    ascentMin: 0.05, // x stage height; limit 0.02
    dominantOffcentre: [0.13, 0.6], // limit [0.10, 0.65]
    centralAxesClearance: 0.045, // limit 0.03
    balanceMax: 0.2, // limit 0.28
  },

  static: {
    // at least two forms: a main one and one or two satellites
    layouts: { values: ['pair', 'trio'], weights: [0.7, 0.3] },
    mainTypes: { values: ['square', 'circle', 'cross'], weights: [0.45, 0.3, 0.25] },
    mainSize: { square: [0.34, 0.5], circle: [0.34, 0.5], cross: [0.4, 0.55] },
    mainOffset: 0.015, // of stage width / height; limit 0.04
    mainColours: { black: 0.78, red: 0.12, blue: 0.1 },
    satelliteArea: 0.08, // of the main form's area; limit 0.12
    satelliteSize: [0.06, 0.12], // x U for squares and circles
    satelliteBar: { aspect: [12, 25], thickness: [0.012, 0.02] },
    satelliteRadius: [0.55, 0.8], // along the quadrant diagonals
    satelliteTries: 30,
  },
}
