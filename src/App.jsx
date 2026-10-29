import { useState, useEffect, useRef, useCallback } from "react";
import ShapeView from "./ShapeView.jsx";
import OrderMeter from "./OrderMeter.jsx";
import Caption from "./Caption.jsx";
import {
  AboutIcon,
  PauseIcon,
  PlayIcon,
  RestoreIcon,
  RegenerateIcon,
  DownloadIcon,
  ShareIcon,
  CloseIcon,
  FacebookIcon,
  InstagramIcon,
  SiteIcon,
} from "./Icons.jsx";
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
  const aboutButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
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

  // The About page: Escape closes it, and the focus goes to its close button and
  // back to the button that opened it, so the keyboard is never left behind it.
  useEffect(() => {
    if (!showAbout) return;
    const opener = aboutButtonRef.current;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setShowAbout(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      opener?.focus();
    };
  }, [showAbout]);

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
      <nav className={`dock${showAbout ? " dock--away" : ""}`} aria-label="Controls">
        <button
          type="button"
          ref={aboutButtonRef}
          className="dock-button"
          data-tone="black"
          data-label="About"
          aria-label="About"
          onClick={() => {
            setDownloadOpen(false);
            setShowAbout(true);
          }}
        >
          <AboutIcon />
        </button>
        <button
          type="button"
          className="dock-button"
          data-tone="blue"
          data-label={showEntropy ? "Pause" : "Play"}
          aria-label={showEntropy ? "Pause entropy" : "Play entropy"}
          onClick={() => setShowEntropy(prev => !prev)}
        >
          {showEntropy ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className="dock-button"
          data-tone="yellow"
          data-label="Restore order"
          aria-label="Restore order"
          onClick={restoreOrder}
          disabled={motion.restoring || transition !== null}
        >
          <RestoreIcon />
        </button>
        <button
          type="button"
          className="dock-button"
          data-tone="red"
          data-label="Regenerate"
          aria-label="Regenerate"
          onClick={regenerate}
        >
          <RegenerateIcon />
        </button>
        <div className="dock-slot" ref={downloadRef}>
          <button
            type="button"
            className="dock-button"
            data-tone="black"
            data-label="Download"
            aria-label="Download"
            aria-haspopup="menu"
            aria-expanded={downloadOpen}
            onClick={() => setDownloadOpen(open => !open)}
          >
            <DownloadIcon />
          </button>
          {downloadOpen && (
            <div className="dock-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="dock-menu-item"
                onClick={() => {
                  setDownloadOpen(false);
                  downloadPng();
                }}
              >
                <span>PNG</span>
                <span>300 DPI</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="dock-menu-item"
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
        <button
          type="button"
          className="dock-button"
          data-tone="blue"
          data-label="Share"
          aria-label="Share"
          onClick={share}
        >
          <ShareIcon />
        </button>
      </nav>

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
          className="about"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
          onClick={(event) => {
            // a press on the page around the sheet closes it; one on the sheet does not
            if (!event.target.closest(".about-sheet")) setShowAbout(false);
          }}
        >
          {/* the page scrolls above the tray, never under it */}
          <div className="about-scroll">
            <div className="about-sheet">
              <div className="about-forms" aria-hidden="true">
                <i className="about-form about-form--red" />
                <i className="about-form about-form--bar" />
                <i className="about-form about-form--yellow" />
                <i className="about-form about-form--blue" />
              </div>
              <p className="about-kicker">
                <img className="about-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width="48" height="48" />
                About
              </p>
              <h2 id="about-title" className="about-title">Supremath</h2>
              <p className="about-lede">
                Supremath is a small homage to Suprematism, the art of pure shapes and color that Kazimir Malevich
                launched in 1915. Every composition is built live by a generator that follows my own reading of what
                makes a Suprematist picture — one dominant form, balance without symmetry, a shared tilt, a few free
                accents — and checks each one against those rules before showing it. They are my interpretation, not
                Malevich’s, so any mistakes are mine.
              </p>
              <p className="about-text">
                Every composition has a number. Keep the link and it comes back; send it and a friend sees the same
                one. The forms drift apart on their own, and the order meter shows how far; “restore order” gathers
                them back. Found one you like? Download it as PNG or SVG.
              </p>
              <p className="about-text">
                I’m Hannibal Levit, a programmer who loves art. Made just for fun.
              </p>
              <nav className="about-links" aria-label="Links">
                <a
                  className="about-link"
                  data-tone="blue"
                  href="https://www.facebook.com/share/1Dyz3mgGys/"
                  target="_blank"
                  rel="noopener"
                >
                  <FacebookIcon />
                  <span>Facebook</span>
                </a>
                <a
                  className="about-link"
                  data-tone="red"
                  href="https://www.instagram.com/hannibalevit"
                  target="_blank"
                  rel="noopener"
                >
                  <InstagramIcon />
                  <span>Instagram</span>
                </a>
                <a
                  className="about-link"
                  data-tone="yellow"
                  href="https://hannibalevit.com"
                  target="_blank"
                  rel="noopener"
                >
                  <SiteIcon />
                  <span>Website</span>
                </a>
              </nav>
            </div>
          </div>
          <div className="about-tray">
            <button
              type="button"
              ref={closeButtonRef}
              className="close-button"
              aria-label="Close"
              onClick={() => setShowAbout(false)}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
