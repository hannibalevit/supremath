// "Regenerate" without a cut: the forms on screen shrink away, smallest first,
// and the forms of the new composition grow in, the dominant one first and the
// accents last, each turning a little as it settles. Forms only change size and
// turn, never colour or opacity, so every frame is made of pure flat colours.
//
// Like the motion, a transition is just a list of shapes that changes with time,
// so it is drawn, exported and measured like any other picture.

export const TRANSITION = {
  leave: { duration: 0.28, stagger: 0.03 }, // seconds; the smallest form goes first
  arrive: { start: 0.25, duration: 0.45, stagger: 0.06 }, // seconds; the dominant form comes first
  spin: 18, // degrees a form still has to turn when it starts to grow
}

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const easeIn = (u) => u * u * u
const easeOut = (u) => 1 - (1 - u) ** 3

const scaled = (shape, s) => ({ ...shape, w: shape.w * s, h: shape.h * s })

// `from` is whatever is on screen (a drifted composition, or the middle of an
// earlier transition: the forms simply shrink from the size they have now);
// `to` is the new composition as generated, which `shapes` equals exactly once
// the transition is `done`. Shapes that are gone or not yet there are left out.
export function createTransition(from, to) {
  const { leave, arrive, spin } = TRANSITION
  // listed largest first, so the last one is the smallest and leaves first
  const leaving = from.map((shape, i) => ({ shape, delay: (from.length - 1 - i) * leave.stagger }))
  const arriving = to.map((shape, i) => ({ shape, delay: arrive.start + i * arrive.stagger }))
  const duration = Math.max(
    ...leaving.map((f) => f.delay + leave.duration),
    ...arriving.map((f) => f.delay + arrive.duration),
  )
  let t = 0

  return {
    duration,
    get done() {
      return t >= duration
    },
    step(dt) {
      t += dt
    },
    get shapes() {
      const shapes = []
      // what is leaving lies under what is arriving
      leaving.forEach(({ shape, delay }, i) => {
        const s = 1 - easeIn(clamp01((t - delay) / leave.duration))
        if (s > 0) shapes.push({ ...scaled(shape, s), id: `gone${i}` })
      })
      arriving.forEach(({ shape, delay }, i) => {
        const e = easeOut(clamp01((t - delay) / arrive.duration))
        // (exactly the shape's own angle once it has arrived, whatever the sign of a zero)
        const rotation = e === 1 ? shape.rotation : shape.rotation - spin * (1 - e) * (i % 2 ? 1 : -1)
        if (e > 0) shapes.push({ ...scaled(shape, e), rotation })
      })
      return shapes
    },
  }
}
