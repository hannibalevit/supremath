import { useState, useEffect, useRef, useCallback } from "react";
import ShapeView from "./ShapeView.jsx";
import OrderMeter from "./OrderMeter.jsx";
import Caption from "./Caption.jsx";
import {
  generateComposition,
  createMotion,
  createClock,
  createRng,
  createTransition,
  measureOrder,
  GROUND_COLOR,
} from "./suprematism";
import { newSeed, formatHash, parseHash, madeByAnotherGenerator } from "./permalink.js";
import { svgBlob, pngBlob, download } from "./exportPicture.js";

// Resizing fires many events; a validated composition is not free to build.
const RESIZE_DEBOUNCE_MS = 250;

// How often the picture is checked against the laws while it moves, in
// animation seconds. The forms change slowly, so a few times a second is plenty.
const ORDER_INTERVAL_S = 0.25;

const NOTICE_MS = 2200;

// Said when a link was made by another version of the generator (see version.js):
// the same seed no longer gives the picture the link was made for. It is long, so
// it stays up longer than the others.
const STALE_LINK_NOTICE = "This link comes from another version of the generator, so the picture may differ";
const STALE_LINK_NOTICE_MS = 7000;

// A composition for `seed` at the given size (by default a new random one for
// the current window), plus the motion that animates it: every form gets its
// own random speed, direction and spin. `order` is how many laws the picture
// obeys, measured at animation time `orderAt`. A scene opened from a link is
// `pinned`: it keeps the size it was made for and is scaled to fit the window.
// `transition` is set while the forms of the previous picture give way to this
// one (see showScene); until it is done, the motion has not started.
// `linkedVersion` is the generator version a link says it was made by; when that
// is another one, the scene is `staleLink`: it is built by the generator we have,
// so it may not be the picture the link was made for.
function buildScene({
  seed = newSeed(),
  width = window.innerWidth,
  height = window.innerHeight,
  pinned = false,
  linkedVersion = null,
} = {}) {
  const comp = generateComposition({ width, height, rng: createRng(seed) });
  return {
    seed,
    width,
    height,
    pinned,
    staleLink: madeByAnotherGenerator(linkedVersion),
    comp,
    motion: createMotion(comp, Math.random),
    order: measureOrder(comp),
    orderAt: 0,
    transition: null,
  };
}

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// The scene a link in the address bar asks for, if it names one.
function sceneFromAddress() {
  const linked = parseHash(window.location.hash);
  if (!linked) return undefined;
  return { seed: linked.seed, ...linked.size, pinned: linked.size !== null, linkedVersion: linked.version };
}

// Keeps the address bar naming the composition on screen, so copying it is
// enough to share it. Not worth failing over where the address cannot change.
function writeAddress(scene) {
  try {
    window.history.replaceState(null, "", formatHash(scene));
  } catch {
    // e.g. a sandboxed frame
  }
}

export default function SuprematismGenerator() {
  // sceneRef holds the current composition (as generated) and the motion that
  // moves its forms; shapesRef holds the forms as they are drawn right now.
  // Anything that changes shapesRef must be followed by a re-render (setVersion).
  const sceneRef = useRef(null);
  const shapesRef = useRef([]);
  if (sceneRef.current === null) {
    sceneRef.current = buildScene(sceneFromAddress());
    shapesRef.current = sceneRef.current.motion.shapes;
  }
  const clockRef = useRef(createClock());
  const [showAbout, setShowAbout] = useState(false);
  const [, setVersion] = useState(0);
  const [showEntropy, setShowEntropy] = useState(true);
  // true while a transition runs, so that the loop below also runs when the
  // entropy is paused
  const [transitioning, setTransitioning] = useState(false);
  const [notice, setNotice] = useState(null);
  const noticeTimerRef = useRef(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef(null);
  const showAboutRef = useRef(false);
  const pendingRegenRef = useRef(false);

  const showNotice = useCallback((text, ms = NOTICE_MS) => {
    clearTimeout(noticeTimerRef.current);
    setNotice(text);
    noticeTimerRef.current = setTimeout(() => setNotice(null), ms);
  }, []);

  // The one place that puts a new composition on screen. The forms now on screen
  // shrink away and the new ones grow in, unless the person asked for less motion.
  // The address is rewritten to name what is on screen now, so a link from another
  // version of the generator is corrected (and, once, said to be from another).
  const showScene = useCallback((request) => {
    const scene = buildScene(request);
    if (!prefersReducedMotion()) {
      scene.transition = createTransition(shapesRef.current, scene.comp.shapes);
    }
    sceneRef.current = scene;
    clockRef.current.reset();
    shapesRef.current = scene.transition ? scene.transition.shapes : scene.motion.shapes;
    writeAddress(scene);
    if (scene.staleLink) showNotice(STALE_LINK_NOTICE, STALE_LINK_NOTICE_MS);
    setTransitioning(scene.transition !== null);
    setVersion(v => v + 1);
  }, [showNotice]);

  const regenerate = useCallback(() => showScene(), [showScene]);

  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  // the address always names the picture on screen, from the first frame on; and
  // a link that came from another version of the generator says so
  useEffect(() => {
    writeAddress(sceneRef.current);
    if (sceneRef.current.staleLink) showNotice(STALE_LINK_NOTICE, STALE_LINK_NOTICE_MS);
  }, [showNotice]);

  // a link opened in this very tab changes only the hash, so the page is not
  // reloaded: show what it names
  useEffect(() => {
    const handleHashChange = () => {
      const request = sceneFromAddress();
      if (request) showScene(request);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [showScene]);

  // Resolves once the forms of a new composition have grown in (and that last
  // frame is drawn), so that an export never catches them half-way.
  const settled = useCallback(
    () =>
      new Promise((resolve) => {
        const check = () =>
          sceneRef.current.transition ? requestAnimationFrame(check) : requestAnimationFrame(() => resolve());
        check();
      }),
    [],
  );

  const downloadPng = useCallback(async () => {
    try {
      await settled();
      download(await pngBlob(), `supremath-${sceneRef.current.seed}-300dpi.png`);
    } catch (err) {
      console.error("PNG export failed:", err);
      showNotice("Could not create the PNG");
    }
  }, [settled, showNotice]);

  const downloadSvg = useCallback(async () => {
    await settled();
    download(svgBlob(), `supremath-${sceneRef.current.seed}.svg`);
  }, [settled]);

  // the format menu closes on a press anywhere else, or on Escape
  useEffect(() => {
    if (!downloadOpen) return;
    const handlePointerDown = (event) => {
      if (!downloadRef.current?.contains(event.target)) setDownloadOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setDownloadOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [downloadOpen]);

  // Shares the picture together with the link that brings the composition back.
  // Where the browser cannot share (most desktops) the link is copied instead.
  const share = useCallback(async () => {
    const title = `Supremath № ${sceneRef.current.seed}`;
    const url = window.location.href;
    try {
      if (!navigator.share) {
        await navigator.clipboard.writeText(url);
        showNotice("Link copied");
        return;
      }
      await settled();
      const file = new File([await pngBlob()], `supremath-${sceneRef.current.seed}.png`, { type: "image/png" });
      const withImage = { title, text: "Check out my suprematist composition!", url, files: [file] };
      await navigator.share(navigator.canShare?.(withImage) ? withImage : { title, url });
    } catch (err) {
      if (err.name === "AbortError") return; // the person closed the share sheet
      console.error("Sharing failed:", err);
      showNotice("Could not share");
    }
  }, [settled, showNotice]);

  // Sends every form home to where it was generated. A paused animation resumes,
  // since nothing would move otherwise. While a new composition is still growing
  // in, the forms are home already.
  const restoreOrder = useCallback(() => {
    if (sceneRef.current.transition) return;
    sceneRef.current.motion.restore();
    setShowEntropy(true);
  }, []);

  useEffect(() => {
    showAboutRef.current = showAbout;
    // a resize that happened behind the About window is applied when it closes
    if (!showAbout && pendingRegenRef.current) {
      pendingRegenRef.current = false;
      regenerate();
    }
  }, [showAbout, regenerate]);

  useEffect(() => {
    let timer;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // a composition from a link is scaled to the new window, not replaced
        if (sceneRef.current.pinned) return;
        if (showAboutRef.current) pendingRegenRef.current = true;
        else regenerate();
      }, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, [regenerate]);

  // "Entropy": every form drifts and turns at its own slow pace. Time comes from
  // the frame timestamps, so the speed does not depend on the refresh rate, and
  // pausing does not make the picture jump when it resumes.
  //
  // The same loop plays a transition to a new composition (even while the
  // entropy is paused); the motion starts when the last form has grown in.
  useEffect(() => {
    if (!showEntropy && !transitioning) return;

    const clock = clockRef.current;
    let animationFrame;

    const step = (now) => {
      clock.tick(now);
      const scene = sceneRef.current;
      if (scene.transition) {
        scene.transition.step(clock.delta);
        if (scene.transition.done) {
          scene.transition = null;
          shapesRef.current = scene.motion.shapes;
          setTransitioning(false);
        } else {
          shapesRef.current = scene.transition.shapes;
        }
      } else if (showEntropy) {
        scene.motion.step(clock.delta);
        shapesRef.current = scene.motion.shapes;
        if (clock.elapsed - scene.orderAt >= ORDER_INTERVAL_S) {
          scene.order = measureOrder({ ...scene.comp, shapes: shapesRef.current });
          scene.orderAt = clock.elapsed;
        }
      }
      setVersion(v => v + 1);
      animationFrame = requestAnimationFrame(step);
    };

    clock.start(performance.now());
    animationFrame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animationFrame);
      clock.pause();
    };
  }, [showEntropy, transitioning]);

  const { seed, comp, order, motion, transition } = sceneRef.current;

  const svgStyle = {
    backgroundColor: GROUND_COLOR,
    position: "absolute",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    display: "block"
  };


  return (
    <div className="absolute top-0 left-0 w-screen h-screen overflow-hidden relative z-0">
      <OrderMeter order={order} />
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <div className={`floating-buttons transition-all duration-500 flex gap-2 ${showAbout ? 'justify-center' : 'justify-between'}`}>
        <div className={`button-wrapper about-button ${showAbout ? 'slide-center-left' : 'slide-origin-left'}`}>
          <button
            onClick={() => {
              setDownloadOpen(false);
              setShowAbout(true);
            }}
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
            onClick={restoreOrder}
            disabled={motion.restoring || transition !== null}
            title="Restore order"
            aria-label="Restore order"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="32"
              height="32"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path fill="none" d="M3 3l6 6M9 4v5H4M21 3l-6 6M15 4v5h5M3 21l6-6M9 20v-5H4M21 21l-6-6M15 20v-5h5" />
            </svg>
          </button>
        </div>
        <div className={`button-wrapper ${showAbout ? 'slide-center-left' : 'slide-origin-left'}`}>
          <button
            onClick={regenerate}
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
        <div
          ref={downloadRef}
          className={`button-wrapper download-wrapper ${showAbout ? 'slide-center-right' : 'slide-origin-right'}`}
        >
          <button
            onClick={() => setDownloadOpen(open => !open)}
            title="Download"
            aria-label="Download"
            aria-haspopup="menu"
            aria-expanded={downloadOpen}
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
          {downloadOpen && (
            <div className="download-menu" role="menu">
              <button
                role="menuitem"
                className="download-menu-item"
                onClick={() => {
                  setDownloadOpen(false);
                  downloadPng();
                }}
              >
                <span>PNG</span>
                <span>300 DPI</span>
              </button>
              <button
                role="menuitem"
                className="download-menu-item"
                onClick={() => {
                  setDownloadOpen(false);
                  downloadSvg();
                }}
              >
                <span>SVG</span>
                <span>Vector</span>
              </button>
            </div>
          )}
        </div>
        <div className={`button-wrapper ${showAbout ? 'slide-center-right' : 'slide-origin-right'}`}>
          <button
            onClick={share}
            title="Share"
            aria-label="Share"
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
        viewBox={`0 0 ${comp.width} ${comp.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="fullscreen-canvas absolute top-0 left-0 w-screen h-screen z-0"
        style={svgStyle}
      >
        {shapesRef.current.map((shape) => (
          <ShapeView key={shape.id} shape={shape} />
        ))}
        {/* last, so a form drifting into the corner never covers it */}
        <Caption seed={seed} width={comp.width} height={comp.height} />
      </svg>
      {showAbout && (
        <div
          className="modal-fade fixed inset-0 bg-black bg-opacity-80 text-white flex items-center justify-center text-center px-6 z-50"
          onClick={() => setShowAbout(false)}
        >
          <div className="about-modal-content max-w-xl text-lg">
            <h2 className="text-2xl font-bold mb-4 text-white">About Supremath.art</h2>
            <p className="text-white">
              Supremath is a small homage to Suprematism, the art of pure shapes and color that Kazimir Malevich
              launched in 1915. Every composition is built live by a generator that follows my own reading of what
              makes a Suprematist picture — one dominant form, balance without symmetry, a shared tilt, a few free
              accents — and checks each one against those rules before showing it. They are my interpretation, not
              Malevich’s, so any mistakes are mine.
            </p>
            <p className="text-white">
              Every composition has a number. Keep the link and it comes back; send it and a friend sees the same
              one. The forms drift apart on their own, and the order meter shows how far; “restore order” gathers
              them back. Found one you like? Download it as PNG or SVG.
            </p>
            <p className="text-white">
              I’m Hannibal Levit, a programmer who loves art. Made just for fun.
            </p>
            <div className="social-links">
              <a href="https://www.facebook.com/share/1Dyz3mgGys/" target="_blank" rel="noopener" class="social-link" aria-label="Facebook">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 32 32" fill="white">
                  <path d="M25.566 2.433H6.433c-2.2 0-4 1.8-4 4v19.135c0 2.2 1.8 4 4 4h19.135c2.2 0 4-1.8 4-4V6.433c-.002-2.2-1.8-4-4.002-4zm-.257 14.483h-3.22v11.65h-4.818v-11.65h-2.41V12.9h2.41v-2.41c0-3.276 1.36-5.225 5.23-5.225h3.217V9.28h-2.012c-1.504 0-1.604.563-1.604 1.61l-.013 2.01h3.645l-.426 4.016z"/>
                </svg>
              </a>
              <a href="https://www.instagram.com/hannibalevit" target="_blank" rel="noopener" class="social-link" aria-label="Instagram">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 16 16" fill="white">
                  <path d="M8 5.67C6.71 5.67 5.67 6.72 5.67 8S6.72 10.33 8 10.33S10.33 9.28 10.33 8S9.28 5.67 8 5.67ZM15 8c0-.97 0-1.92-.05-2.89c-.05-1.12-.31-2.12-1.13-2.93c-.82-.82-1.81-1.08-2.93-1.13C9.92 1 8.97 1 8 1s-1.92 0-2.89.05c-1.12.05-2.12.31-2.93 1.13C1.36 3 1.1 3.99 1.05 5.11C1 6.08 1 7.03 1 8s0 1.92.05 2.89c.05 1.12.31 2.12 1.13 2.93c.82.82 1.81 1.08 2.93 1.13C6.08 15 7.03 15 8 15s1.92 0 2.89-.05c1.12-.05 2.12-.31 2.93-1.13c.82-.82 1.08-1.81 1.13-2.93c.06-.96.05-1.92.05-2.89Zm-7 3.59c-1.99 0-3.59-1.6-3.59-3.59S6.01 4.41 8 4.41s3.59 1.6 3.59 3.59s-1.6 3.59-3.59 3.59Zm3.74-6.49c-.46 0-.84-.37-.84-.84s.37-.84.84-.84s.84.37.84.84a.8.8 0 0 1-.24.59a.8.8 0 0 1-.59.24Z"/>
                </svg>
              </a>
              <a href="https://hannibalevit.com" target="_blank" rel="noopener" class="social-link" aria-label="Personal website">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><g fill="none" fill-rule="evenodd"><path d="M24 0v24H0V0h24ZM12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036c-.01-.003-.019 0-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.016-.018Zm.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022Zm-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01l-.184-.092Z"/><path fill="white" d="M11 2.05a9.954 9.954 0 0 0-5.33 2.206l.319.318A1 1 0 0 1 4.575 5.99l-.318-.319A9.954 9.954 0 0 0 2.049 11h.45a1 1 0 0 1 0 2h-.45A10.003 10.003 0 0 0 11 21.95v-.45a1 1 0 0 1 2 0v.45a9.954 9.954 0 0 0 5.33-2.207l-.319-.318a1 1 0 1 1 1.415-1.415l.318.319a9.954 9.954 0 0 0 2.208-5.33H21.5a1 1 0 1 1 0-2h.45A10.003 10.003 0 0 0 13 2.05v.45a1 1 0 1 1-2 0v-.45Zm5.466 4.794l-5.693 3.622a1 1 0 0 0-.307.307l-3.622 5.693c-.287.45.239.977.69.69l5.693-3.623a1 1 0 0 0 .306-.306l3.623-5.693c.287-.451-.24-.977-.69-.69Z"/></g></svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
