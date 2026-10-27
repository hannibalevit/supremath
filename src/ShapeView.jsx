import { localOutline } from "./suprematism";

// One flat Suprematist form. Every shape is drawn in its own local coordinates
// (centre at 0,0) and then moved and rotated, so the geometry here is the same
// as the geometry the validator checked.
export default function ShapeView({ shape }) {
  const { type, cx, cy, w, h, rotation, color } = shape;
  const transform = `translate(${cx} ${cy}) rotate(${rotation})`;

  if (type === "circle") {
    return <circle transform={transform} r={w / 2} fill={color} />;
  }
  if (type === "cross" || type === "triangle") {
    const points = localOutline(shape)
      .map(([x, y]) => `${x},${y}`)
      .join(" ");
    return <polygon transform={transform} points={points} fill={color} />;
  }
  return (
    <rect
      transform={transform}
      x={-w / 2}
      y={-h / 2}
      width={w}
      height={h}
      fill={color}
    />
  );
}
