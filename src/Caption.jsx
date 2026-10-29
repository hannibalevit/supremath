import { captionLines, HALO_COLOR } from "./caption.js";

// Flat, like the forms: solid colours, no effects. System fonts only, because
// the caption has to look the same in an exported file.
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export default function Caption({ seed, width, height }) {
  return (
    <g textAnchor="end" fontFamily={FONT}>
      {captionLines(seed, width, height).map((line) => {
        const text = { x: line.x, y: line.y, fontSize: line.size, fontWeight: line.weight, letterSpacing: line.spacing };
        return (
          <g key={line.text}>
            {/* the halo: the same text outlined in the colour of the ground, under the
                letters. A second copy rather than `paint-order`, which editors ignore. */}
            <text
              {...text}
              fill={HALO_COLOR}
              stroke={HALO_COLOR}
              strokeWidth={line.halo}
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {line.text}
            </text>
            <text {...text} fill={line.fill}>
              {line.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
