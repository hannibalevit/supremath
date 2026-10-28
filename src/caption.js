// The poster caption: a museum-style label in the top-right corner of the
// picture, "SUPREMATH № 625715" and the address under it. It is part of the SVG,
// so it is in every export and in the image that Share sends. It is drawn above
// the forms, so it is always there to read; each line has a halo in the colour
// of the ground, so that the letters also read where a form lies under them.

import { stageRect, GROUND_COLOR } from "./suprematism";

export const SITE = "supremath.art";

export const HALO_COLOR = GROUND_COLOR;

// Width of the halo's outline for text of this size. The outline is drawn under
// the letters, so only half of it shows outside them: about 1.8 px at 11 px, and
// never less than 1.5 px, because a thinner halo does not separate the letters
// from a dark form.
export const haloWidth = (size) => Math.max(3, 0.32 * size);

export const captionTitle = (seed) => `SUPREMATH № ${seed}`;

// Everything here is in the units of the picture (its viewBox). It scales with
// U like the forms do, but never below a size that can be read: on a phone the
// picture is 1:1 with the screen, and 10.5 px is as small as a label goes.
export function captionLayout(width, height) {
  const { U } = stageRect(width, height);
  const titleSize = Math.max(10.5, 0.0115 * U);
  const subtitleSize = 0.85 * titleSize;
  const margin = Math.max(16, 0.016 * U);
  const titleY = margin + 0.78 * titleSize; // the tops of the capitals sit at the margin
  return {
    x: width - margin, // the text ends here
    titleY,
    subtitleY: titleY + 1.5 * subtitleSize,
    titleSize,
    subtitleSize,
  };
}

// The two lines to draw, top first. `fill` is the colour of the letters; both
// are dark enough to read on the ground (the grey one meets WCAG AA).
export function captionLines(seed, width, height) {
  const { x, titleY, subtitleY, titleSize, subtitleSize } = captionLayout(width, height);
  return [
    { text: captionTitle(seed), x, y: titleY, size: titleSize, weight: 600, spacing: "0.12em", fill: "#111111" },
    { text: SITE, x, y: subtitleY, size: subtitleSize, weight: 400, spacing: "0.08em", fill: "#6b6b6b" },
  ].map((line) => ({ ...line, halo: haloWidth(line.size) }));
}
