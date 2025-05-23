const CONFIG = {
  BACKGROUND_COLOR: "#f2f2f2",
  GUIDE_PROBABILITY: 0.75,
  COLOR_REPEAT_AVOIDANCE: 0.7,
  LINE_LENGTH_MULTIPLIER: [1.2, 7],
  LINE_WIDTH_RANGE: [5, 50],
  SHAPE_SIZE_MIN: 20,
  SHAPE_SIZE_MAX_MULTIPLIER: 0.25,
  MIN_COUNT: 8,
  MAX_COUNT: 16,
  HIGH_DENSITY_CHANCE: 0.3,
  HIGH_DENSITY_MIN: 15,
  HIGH_DENSITY_MAX: 25,
  SMALL_GUIDE_COUNT: [5, 10],
  LONG_LINE_PROBABILITY: 0.5,
  LONG_LINE_MULTIPLIER: [4, 15],
  GRADIENT_FILL_PROBABILITY: 0.25,
  ENTROPY_SPEED: 0.00001,
  ENTROPY_LINE_SPEED: 0.001,
  ENTROPY_DISPLACEMENT: 0.075,
  BIG_CENTER_SHAPE_PROBABILITY: 0.20,
  weightedGuideTypes: [
    "line", "line", "line", "line",
    "arc", "arc",
    "circle",
    "square"
  ]
};
import { useState, useEffect, useRef } from "react";

const palettes = [
  ["#FF4C00", "#FFD700", "#8C9B9B", "#002A5C"],
  ["#FF3F00", "#005EB8", "#FFD700", "#000000"],
  ["#FF1F40", "#FFC300", "#FF6F61", "#8E44AD", "#2ECC71"],
  ["#FFB300", "#1F3A3D", "#FF6F61", "#000000"],
  ["#FF2B00", "#F9E106", "#00A7E1", "#5D9B31", "#000000"],
];

const getRandomInt = (min, max) =>
  Math.floor(Math.random() * (max - min) + min);

const getRandomFromArray = (array) =>
  array[getRandomInt(0, array.length)];

function generateGuidePoints(width, height, count, type) {
  const points = [];
  const angleOffset = Math.random() * 360;
  const cx = width / 2;
  const cy = height / 2;

  for (let i = 0; i < count; i++) {
    let x, y;
    const angle = angleOffset + (i * 360) / count;
    const rad = (angle * Math.PI) / 180;

    // Most frequent first: line, then arc, then circle, then square
    if (type === "line") {
      x = getRandomInt(width * 0.2, width * 0.8);
      y = cy + (Math.sin(rad) * height) / 6;
    } else if (type === "arc") {
      const r = Math.min(width, height) / 2;
      x = cx + r * Math.cos(rad);
      y = cy + r * Math.sin(rad * 0.7);
    } else if (type === "circle") {
      const r = Math.min(width, height) / 3;
      x = cx + r * Math.cos(rad);
      y = cy + r * Math.sin(rad);
    } else if (type === "square") {
      const side = Math.min(width, height) * 0.6;
      const per = i / count;
      const p = per * 4;
      const pos = (p % 1) * side;
      if (p < 1) {
        x = cx - side / 2 + pos;
        y = cy - side / 2;
      } else if (p < 2) {
        x = cx + side / 2;
        y = cy - side / 2 + pos;
      } else if (p < 3) {
        x = cx + side / 2 - pos;
        y = cy + side / 2;
      } else {
        x = cx - side / 2;
        y = cy + side / 2 - pos;
      }
    }

    points.push({ x, y });
  }
  while (points.length < count) {
    points.push({
      x: cx + getRandomInt(-width / 4, width / 4),
      y: cy + getRandomInt(-height / 4, height / 4),
    });
  }
  return points;
}

// Adjust color brightness for gradient
const adjustColorBrightness = (hex, amount) => {
  let col = hex.startsWith('#') ? hex.slice(1) : hex;
  if (col.length === 3) col = col.split('').map(c => c + c).join('');
  const num = parseInt(col, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
};

const generateShapes = (width, height) => {
  const shapes = [];
  const types = ["rect", "circle", "triangle", "line"];
  const palette = getRandomFromArray(palettes);

  const useGuide = Math.random() < CONFIG.GUIDE_PROBABILITY;
  let guidePoints = [];
  let count;
  count = getRandomInt(CONFIG.MIN_COUNT, CONFIG.MAX_COUNT);
  guidePoints = useGuide ? generateGuidePoints(width, height, count, getRandomFromArray(CONFIG.weightedGuideTypes)) : [];

  // --- Highlight first shape logic ---
  const highlightFirstShape = Math.random() < CONFIG.BIG_CENTER_SHAPE_PROBABILITY;

  let lastColor = null;

  for (let i = 0; i < count; i++) {
    const maxShapeSize = Math.max(CONFIG.SHAPE_SIZE_MIN + 1, Math.min(width, height) * CONFIG.SHAPE_SIZE_MAX_MULTIPLIER);
    const type = getRandomFromArray(types);
    const size = (highlightFirstShape && i === 0 && type !== 'line')
      ? getRandomInt(maxShapeSize * 1.5, maxShapeSize * 2)
      : getRandomInt(CONFIG.SHAPE_SIZE_MIN, maxShapeSize);
    const guidePoint = guidePoints[i];
    const { x, y } = (highlightFirstShape && i === 0 && type !== 'line')
      ? { x: width / 2 - size / 2, y: height / 2 - size / 2 }
      : useGuide && guidePoint
        ? guidePoint
        : {
            x: getRandomInt(0, width),
            y: getRandomInt(0, height)
          };
    // Removed: (x === 0 && y === 0) check and console.warn
    const rotation = getRandomInt(0, 360);

    let color = getRandomFromArray(palette);
    while (color === lastColor && Math.random() < CONFIG.COLOR_REPEAT_AVOIDANCE) {
      color = getRandomFromArray(palette);
    }
    lastColor = color;

    // Determine gradient logic for the shape
    const useGradient = ["circle", "rect", "triangle"].includes(type) && Math.random() < CONFIG.GRADIENT_FILL_PROBABILITY;
    // Use id for gradient reference
    const id = `shape-${Math.random().toString(36).substring(2, 10)}-${i}`;
    const fill = useGradient
      ? `url(#grad-${id})`
      : color;

    let lineProps = {};
    if (type === "line") {
      const isLong = Math.random() < CONFIG.LONG_LINE_PROBABILITY;
      const lengthMultiplier = isLong ? CONFIG.LONG_LINE_MULTIPLIER : CONFIG.LINE_LENGTH_MULTIPLIER;
      lineProps.length = getRandomInt(size * lengthMultiplier[0], size * lengthMultiplier[1]);
      lineProps.strokeWidth = getRandomInt(...CONFIG.LINE_WIDTH_RANGE);
    }

    // Precompute adjustedColor for gradient use
    let adjustedColor = undefined;
    if (useGradient) {
      adjustedColor = adjustColorBrightness(color, Math.random() < 0.5 ? -60 : 60);
    }

    shapes.push({ id, x, y, size, fill, rotation, type, useGradient, color, adjustedColor, ...lineProps });
  }
  return shapes;
};

export default function SuprematismGenerator() {
  const [canvasSize, setCanvasSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const shapesRef = useRef(generateShapes(window.innerWidth, window.innerHeight));
  const [showAbout, setShowAbout] = useState(false);
  const [version, setVersion] = useState(0);
  const [showEntropy, setShowEntropy] = useState(true);
  // --- Entropy state for smooth movement ---
  const entropyState = useRef({ t: 0 });

  useEffect(() => {
    const handleResize = () => {
      const newSize = {
        width: window.innerWidth,
        height: window.innerHeight
      };
      setCanvasSize(newSize);
      if (!showAbout) {
        shapesRef.current = generateShapes(newSize.width, newSize.height);
        setVersion(v => v + 1);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!showEntropy) return;

    let animationFrame;

    const applyEntropy = () => {
      entropyState.current.t += CONFIG.ENTROPY_SPEED;

      shapesRef.current = shapesRef.current.map((shape, index) => {
        const angle = index * 0.5 + entropyState.current.t;
        const dx = Math.cos(angle) * CONFIG.ENTROPY_DISPLACEMENT;
        const dy = Math.sin(angle) * CONFIG.ENTROPY_DISPLACEMENT;

        return {
          ...shape,
          x: shape.x + dx,
          y: shape.y + dy,
          rotation: shape.rotation + CONFIG.ENTROPY_LINE_SPEED
        };
      });

      setVersion(v => v + 1);
      animationFrame = requestAnimationFrame(applyEntropy);
    };

    animationFrame = requestAnimationFrame(applyEntropy);
    return () => cancelAnimationFrame(animationFrame);
  }, [showEntropy]);


  const handleGenerate = () => {
    shapesRef.current = generateShapes(canvasSize.width, canvasSize.height);
    setVersion(v => v + 1);
  };


  const svgStyle = {
    backgroundColor: CONFIG.BACKGROUND_COLOR,
    position: "absolute",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    display: "block"
  };


  return (
    <div className="absolute top-0 left-0 w-screen h-screen overflow-hidden relative z-0">
      <div className={`floating-buttons transition-all duration-500 flex gap-2 ${showAbout ? 'justify-center' : 'justify-between'}`}>
        <div className={`button-wrapper about-button ${showAbout ? 'slide-center-left' : 'slide-origin-left'}`}>
          <button
            onClick={() => setShowAbout(true)}
            className=""
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 512 512">
              <path fill="currentColor" fillRule="evenodd" d="M256 42.667c117.822 0 213.334 95.512 213.334 213.333c0 117.82-95.512 213.334-213.334 213.334c-117.82 0-213.333-95.513-213.333-213.334S138.18 42.667 256 42.667m21.38 192h-42.666v128h42.666zM256.217 144c-15.554 0-26.837 11.22-26.837 26.371c0 15.764 10.986 26.963 26.837 26.963c15.235 0 26.497-11.2 26.497-26.667c0-15.446-11.262-26.667-26.497-26.667"/>
            </svg>
          </button>
        </div>
        <div className={`button-wrapper about-button ${showAbout ? 'slide-center-left' : 'slide-origin-left'}`}>
          <button
            onClick={() => setShowEntropy(prev => !prev)}
            title="Toggle Entropy"
          >
            {showEntropy ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <rect width="4" height="14" x="6" y="5" fill="currentColor" rx="1"/>
                <rect width="4" height="14" x="14" y="5" fill="currentColor" rx="1"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2.01c0-.848.98-1.32 1.64-.79l7.48 5.99c.506.405.506 1.17 0 1.58l-7.48 5.99A1.01 1.01 0 0 1 4 13.99v-12z"/>
              </svg>
            )}
          </button>
        </div>
        <div className={`button-wrapper ${showAbout ? 'slide-center-left' : 'slide-origin-left'}`}>
          <button
            onClick={handleGenerate}
            className=""
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 1536 1536" 
              width="32" 
              height="32" 
              fill="currentColor"
            >
              <path fill="currentColor" d="M1511 928q0 5-1 7q-64 268-268 434.5T764 1536q-146 0-282.5-55T238 1324l-129 129q-19 19-45 19t-45-19t-19-45V960q0-26 19-45t45-19h448q26 0 45 19t19 45t-19 45l-137 137q71 66 161 102t187 36q134 0 250-65t186-179q11-17 53-117q8-23 30-23h192q13 0 22.5 9.5t9.5 22.5zm25-800v448q0 26-19 45t-45 19h-448q-26 0-45-19t-19-45t19-45l138-138Q969 256 768 256q-134 0-250 65T332 500q-11 17-53 117q-8 23-30 23H50q-13 0-22.5-9.5T18 608v-7q65-268 270-434.5T768 0q146 0 284 55.5T1297 212l130-129q19-19 45-19t45 19t19 45z"/>
            </svg>
          </button>
        </div>
        <div className={`button-wrapper ${showAbout ? 'slide-center-right' : 'slide-origin-right'}`}>
          <button
            onClick={() => {
              const svg = document.querySelector("svg.fullscreen-canvas");
              const svgData = new XMLSerializer().serializeToString(svg);

              const width = svg.viewBox.baseVal.width;
              const height = svg.viewBox.baseVal.height;

              const DPI = 300;
              const INCH_TO_PX = DPI / 96;

              const canvas = document.createElement("canvas");
              canvas.width = width * INCH_TO_PX;
              canvas.height = height * INCH_TO_PX;

              const ctx = canvas.getContext("2d");

              const img = new Image();
              const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
              const url = URL.createObjectURL(svgBlob);

              img.onload = () => {
                ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                const pngUrl = canvas.toDataURL("image/png");
                const link = document.createElement("a");
                link.href = pngUrl;
                link.download = "suprematism-300dpi.png";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              };

              img.src = url;
            }}
            className=""
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 512 512" 
              width="32" 
              height="32" 
              fill="currentColor"
            >
              <path fill="currentColor" d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32v242.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64h384c35.3 0 64-28.7 64-64v-32c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48a24 24 0 1 1 0-48z"/>
            </svg>
          </button>
        </div>
        <div className={`button-wrapper ${showAbout ? 'slide-center-right' : 'slide-origin-right'}`}>
          <button
            onClick={async () => {
              const svg = document.querySelector("svg.fullscreen-canvas");
              const svgData = new XMLSerializer().serializeToString(svg);

              const width = svg.viewBox.baseVal.width;
              const height = svg.viewBox.baseVal.height;
              const DPI = 300;
              const INCH_TO_PX = DPI / 96;

              const canvas = document.createElement("canvas");
              canvas.width = width * INCH_TO_PX;
              canvas.height = height * INCH_TO_PX;

              const ctx = canvas.getContext("2d");
              const img = new Image();
              const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
              const url = URL.createObjectURL(svgBlob);

              img.onload = async () => {
                ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);

                canvas.toBlob(async (blob) => {
                  const file = new File([blob], "suprematism.png", { type: "image/png" });

                  if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                      await navigator.share({
                        title: "Suprematism Art",
                        text: "Check out my suprematist composition!",
                        files: [file],
                      });
                    } catch (err) {
                      console.error("Sharing failed:", err);
                    }
                  } else {
                    alert("Your device does not support direct file sharing.");
                  }
                }, "image/png");
              };

              img.src = url;
            }}
            className=""
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 14 14" 
              width="32" 
              height="32" 
              fill="currentColor"
            >
              <path fill="currentColor" fillRule="evenodd" d="M11.821.098a1.62 1.62 0 0 1 2.077 2.076l-3.574 10.712a1.62 1.62 0 0 1-1.168 1.069a1.599 1.599 0 0 1-1.52-.434l-1.918-1.909l-2.014 1.042a.5.5 0 0 1-.73-.457l.083-3.184l7.045-5.117a.625.625 0 1 0-.735-1.012L2.203 8.088l-1.73-1.73a1.6 1.6 0 0 1-.437-1.447a1.62 1.62 0 0 1 1.069-1.238h.003L11.82.097Z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
        {showAbout && (
          <div
            className="button-wrapper visible-button"
            style={{
              position: 'fixed',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10001,
              opacity: "100%"
            }}
          >
            <button onClick={() => setShowAbout(false)} className="about-close-button">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 1216 1312" fill="currentColor">
                <path fill="currentColor" d="M1202 1066q0 40-28 68l-136 136q-28 28-68 28t-68-28L608 976l-294 294q-28 28-68 28t-68-28L42 1134q-28-28-28-68t28-68l294-294L42 410q-28-28-28-68t28-68l136-136q28-28 68-28t68 28l294 294l294-294q28-28 68-28t68 28l136 136q28 28 28 68t-28 68L880 704l294 294q28 28 28 68z"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="fullscreen-canvas absolute top-0 left-0 w-screen h-screen z-0"
        style={svgStyle}
      >
        <defs>
          {shapesRef.current.map((shape, i) => {
            if (shape.useGradient) {
              const adjustedColor = shape.adjustedColor;
              return (
                <linearGradient key={shape.id} id={`grad-${shape.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={shape.color} stopOpacity="1" />
                  <stop offset="100%" stopColor={adjustedColor} stopOpacity="1" />
                </linearGradient>
              );
            }
            return null;
          })}
        </defs>
        {shapesRef.current.map((shape, i) => {
          const { x, y, size, fill, rotation, type, length, strokeWidth } = shape;
          const transform = `rotate(${rotation} ${x + size / 2} ${y + size / 2})`;
          const shapeFill = shape.useGradient ? `url(#grad-${shape.id})` : shape.fill;

          if (type === "rect") {
            return (
              <rect
                key={shape.id}
                transform={transform}
                x={x}
                y={y}
                width={size}
                height={size}
                fill={shapeFill}
              />
            );
          } else if (type === "circle") {
            return (
              <circle
                key={shape.id}
                transform={transform}
                cx={x + size / 2}
                cy={y + size / 2}
                r={size / 2}
                fill={shapeFill}
              />
            );
          } else if (type === "triangle") {
            const points = `
              ${x + size / 2},${y} 
              ${x},${y + size} 
              ${x + size},${y + size}
            `;
            return (
              <polygon
                key={shape.id}
                transform={transform}
                points={points}
                fill={shapeFill}
              />
            );
          } else if (type === "line") {
            return (
              <line
                key={shape.id}
                transform={transform}
                x1={x}
                y1={y}
                x2={x + (length || size)}
                y2={y}
                stroke={shapeFill}
                strokeWidth={strokeWidth || 4}
              />
            );
          }
        })}
      </svg>
      {showAbout && (
        <div
          className="modal-fade fixed inset-0 bg-black bg-opacity-80 text-white flex items-center justify-center text-center px-6 z-50"
          onClick={() => setShowAbout(false)}
        >
          <div className="about-modal-content max-w-xl text-lg">
            <h2 className="text-2xl font-bold mb-4 text-white">About Supremath.art</h2>
            <p className="text-white">
              I made this site just for fun — a playful homage to suprematism, randomness, and browser-based creativity.<br/>  
              My name is Hannibal Levit. I’m a programmer by profession, but I also love art and explore it in different forms.<br/>  
              Shapes, colors, and invisible guides come together in compositions that are entirely unique — generated live, never repeated.  
              Become a suprematist for a moment. Create something that’s entirely your own :)
            </p>
            <div className="social-links">
              <a href="https://www.facebook.com/share/1Dyz3mgGys/" target="_blank" rel="noopener" class="social-link">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 32 32" fill="white">
                  <path d="M25.566 2.433H6.433c-2.2 0-4 1.8-4 4v19.135c0 2.2 1.8 4 4 4h19.135c2.2 0 4-1.8 4-4V6.433c-.002-2.2-1.8-4-4.002-4zm-.257 14.483h-3.22v11.65h-4.818v-11.65h-2.41V12.9h2.41v-2.41c0-3.276 1.36-5.225 5.23-5.225h3.217V9.28h-2.012c-1.504 0-1.604.563-1.604 1.61l-.013 2.01h3.645l-.426 4.016z"/>
                </svg>
              </a>
              <a href="https://www.instagram.com/hannibalevit?igsh=MWR1enY1bHh3cDcxeQ==" target="_blank" rel="noopener" class="social-link">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 16 16" fill="white">
                  <path d="M8 5.67C6.71 5.67 5.67 6.72 5.67 8S6.72 10.33 8 10.33S10.33 9.28 10.33 8S9.28 5.67 8 5.67ZM15 8c0-.97 0-1.92-.05-2.89c-.05-1.12-.31-2.12-1.13-2.93c-.82-.82-1.81-1.08-2.93-1.13C9.92 1 8.97 1 8 1s-1.92 0-2.89.05c-1.12.05-2.12.31-2.93 1.13C1.36 3 1.1 3.99 1.05 5.11C1 6.08 1 7.03 1 8s0 1.92.05 2.89c.05 1.12.31 2.12 1.13 2.93c.82.82 1.81 1.08 2.93 1.13C6.08 15 7.03 15 8 15s1.92 0 2.89-.05c1.12-.05 2.12-.31 2.93-1.13c.82-.82 1.08-1.81 1.13-2.93c.06-.96.05-1.92.05-2.89Zm-7 3.59c-1.99 0-3.59-1.6-3.59-3.59S6.01 4.41 8 4.41s3.59 1.6 3.59 3.59s-1.6 3.59-3.59 3.59Zm3.74-6.49c-.46 0-.84-.37-.84-.84s.37-.84.84-.84s.84.37.84.84a.8.8 0 0 1-.24.59a.8.8 0 0 1-.59.24Z"/>
                </svg>
              </a>
              <a href="https://hannibalevit.com" target="_blank" rel="noopener" class="social-link">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><g fill="none" fill-rule="evenodd"><path d="M24 0v24H0V0h24ZM12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036c-.01-.003-.019 0-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.016-.018Zm.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022Zm-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01l-.184-.092Z"/><path fill="white" d="M11 2.05a9.954 9.954 0 0 0-5.33 2.206l.319.318A1 1 0 0 1 4.575 5.99l-.318-.319A9.954 9.954 0 0 0 2.049 11h.45a1 1 0 0 1 0 2h-.45A10.003 10.003 0 0 0 11 21.95v-.45a1 1 0 0 1 2 0v.45a9.954 9.954 0 0 0 5.33-2.207l-.319-.318a1 1 0 1 1 1.415-1.415l.318.319a9.954 9.954 0 0 0 2.208-5.33H21.5a1 1 0 1 1 0-2h.45A10.003 10.003 0 0 0 13 2.05v.45a1 1 0 1 1-2 0v-.45Zm5.466 4.794l-5.693 3.622a1 1 0 0 0-.307.307l-3.622 5.693c-.287.45.239.977.69.69l5.693-3.623a1 1 0 0 0 .306-.306l3.623-5.693c.287-.451-.24-.977-.69-.69Z"/></g></svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
