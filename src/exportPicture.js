import { GROUND_COLOR } from "./suprematism";

const SVG_NS = "http://www.w3.org/2000/svg";
const PNG_SCALE = 300 / 96; // the viewBox is in CSS pixels, 96 to the inch

// The picture on screen as a standalone SVG document. The element on screen is
// sized by the window (100vw, absolute position) and its ground is a CSS
// background; none of that means anything in a file. So the copy gets the
// composition's own size and a ground-coloured rectangle instead.
function standalonePicture() {
  const live = document.querySelector("svg.fullscreen-canvas");
  const { width, height } = live.viewBox.baseVal;

  const svg = live.cloneNode(true);
  svg.removeAttribute("style");
  svg.removeAttribute("class");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  const ground = document.createElementNS(SVG_NS, "rect");
  ground.setAttribute("width", width);
  ground.setAttribute("height", height);
  ground.setAttribute("fill", GROUND_COLOR);
  svg.prepend(ground);

  return { source: new XMLSerializer().serializeToString(svg), width, height };
}

// The picture as it is right now, as an .svg file.
export function svgBlob() {
  const { source } = standalonePicture();
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${source}`], {
    type: "image/svg+xml;charset=utf-8",
  });
}

// The picture as it is right now, as a 300 DPI PNG.
export function pngBlob() {
  const { source, width, height } = standalonePicture();
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width * PNG_SCALE;
    canvas.height = height * PNG_SCALE;

    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("the picture could not be drawn"));
    };
    img.src = url;
  });
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
