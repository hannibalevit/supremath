# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required tooling (MCP)

Always use these two MCP servers in this repository:

- **CodeGraph** (`.codegraph/` is present at the repo root). Before grep, find or reading files to understand or locate code, call `codegraph_explore` (or `codegraph explore "<symbols or question>"` in the shell). Name the symbols or files in the query. It returns their current line-numbered source, the call paths between them and what depends on them, so treat it as a Read you've already done and edit from it. Don't re-verify its results with grep. If a response carries a staleness banner, Read only the files it lists. Use plain Read/Grep for what it doesn't index (configs, CSS, docs).
- **Context7** (`resolve-library-id`, then `query-docs`). Use it for current documentation whenever a task involves a library, framework, SDK or CLI tool. In this repo that means React 19, Vite 6, Vitest 5, `@vitejs/plugin-react`, ESLint 9 flat config and its plugins, Tailwind CSS 4 and `gh-pages`. Do it even when you think you know the answer, because training data may be outdated. Pass the full question to `query-docs`, and use a version-specific library ID when the version matters. Skip it for refactoring, business-logic debugging and general programming concepts.

## Commands

```bash
npm install
npm run dev        # Vite dev server (host: true; allows *.ngrok-free.app and supremath.art)
npm run build      # vite build -> dist/
npm run preview    # serve the built dist/
npm run lint       # eslint .
npm test           # vitest run: every test once (about a minute)
npm run test:watch # vitest in watch mode
npm run deploy     # builds, then publishes dist/ to GitHub Pages via gh-pages

npx vitest run src/suprematism/validate.test.js   # one file
npx vitest run -t "reports MARGIN"                # tests whose name matches (regex)
VITE_PROP_SEEDS=2000 npm test                     # thorough property tests (several minutes)
```

`npm run deploy` builds twice: npm runs `predeploy` (`npm run build`) automatically, and `deploy` itself starts with `vite build`.

Tests live next to the code as `src/**/*.test.js` and run in Node (see [vitest.config.js](vitest.config.js), which deliberately replaces `vite.config.js` for tests). Import `describe`/`it`/`expect` from `'vitest'`; ESLint runs on tests with browser globals only, so don't use `process` or `Buffer`.

## Architecture

Supremath is a single-page React 19 + Vite app (plain JS/JSX, no TypeScript) that generates a random Suprematism-style composition as full-screen SVG. It has no backend, router or state library. The deployed site is https://supremath.art (`base: '/'` in [vite.config.js](vite.config.js)).

The work is split in two:

- **The generator**, [src/suprematism/](src/suprematism/): pure JS, no React, deterministic given an `rng`. It decides what a composition looks like and proves it follows the laws.
- **The UI**, [src/App.jsx](src/App.jsx) (mounted by [src/main.jsx](src/main.jsx) inside `StrictMode`) and [src/ShapeView.jsx](src/ShapeView.jsx): buttons, About modal, animation loop, export. It never builds shapes itself.

### The generator and its "laws"

`generateComposition({ width, height, rng = Math.random, mode })` in [generate.js](src/suprematism/generate.js) returns `{ mode, width, height, shapes, meta }`. With no `mode` it picks `dynamic` (80%) or `static` (20%), two orders Malevich names. The loop is **build, validate, retry, fall back**:

1. Up to 60 attempts of the mode's builder ([dynamic.js](src/suprematism/dynamic.js) or [static.js](src/suprematism/static.js)). A builder returns shapes or `null` and leaves the reason in `build.lastFailure`.
2. Dynamic only: 100 attempts of the conservative profile, then 20 attempts of `static`.
3. [fallback.js](src/suprematism/fallback.js) `minimalStatic`: a black square with a small red satellite, valid by construction. `meta.fallback` says which tier was used and `meta.rejections` counts why attempts failed. A healthy generator needs about 1.8 attempts and never reaches tier 3; the tests assert this so the chain can't hide a weak builder.

**There are always at least two forms** (`LIMITS.counts`: dynamic 5-9, static 2-3). Static layouts are a main form plus one or two satellites; a lone "Black Square" is not generated.

What counts as "valid" is [validate.js](src/suprematism/validate.js):

- **`LIMITS` are the laws** (about 35 rules, each with a code in `VIOLATION_CODES`): flat palette colours only, white ground, hierarchy (one dominant form), a shared tilt with a few free accents, asymmetric balance by visual weight, lighter forms above heavier ones, irregular rhythm, margins, no near-miss gaps, crossings of different colours, and so on. The thresholds are our own formalisation of museum and academic descriptions of Suprematism (Malevich's primary texts could not be consulted), so change them knowingly.
- **`PARAMS` are where the generator aims**, mostly well inside the laws (`params.test.js` checks they are nested). A composition is only returned once `validateComposition` accepts it. The laws hold for the composition *as generated*; the animation deliberately does not keep them (see below).
- **Adding a rule**: add its code to `VIOLATION_CODES` and a mutator for it in [testUtils.js](src/suprematism/testUtils.js). `validate.test.js` fails if a code has no mutator, so no rule can ship untested.

Other modules: [geometry.js](src/suprematism/geometry.js) (centre-based shapes, the "stage", polygon distance and overlap; crosses are split into disjoint convex pieces), [weight.js](src/suprematism/weight.js) (visual weight and balance, shared by generator and validator, so it has hand-computed tests), [palettes.js](src/suprematism/palettes.js) (`GROUND_COLOR`, pure colours, palettes), [random.js](src/suprematism/random.js) (`createRng(seed)` and sampling helpers), [animation.js](src/suprematism/animation.js), [index.js](src/suprematism/index.js) (public API).

Shape model: `{ id, type, cx, cy, w, h, rotation, color, role }` with `type` one of `square | bar | circle | cross | triangle`, rotation in degrees about the centre. A thin line is just a bar. The "stage" is the centred part of the window whose aspect ratio is clamped to 0.4–2.5, and every threshold is relative to `U = min(stage width, height)`. The minimum supported window side is 240 px.

### Animation ("entropy")

[animation.js](src/suprematism/animation.js): `createMotion(comp, rng)` gives **every form its own random speed, direction and spin**: each form drifts in a straight line (`MOTION.speed`, 0.125-0.325% of `U` per second, about 1.4-3.5 px/s on a 1080p screen) and every form except the circle turns at its own rate (`MOTION.spin`, 1-2 degrees per second, either way round). Nothing steers the forms back, so the composition gradually comes apart; that is the intended entropy. Forms bounce off the edge of the window and never leave it (`bounce` also handles a form that turns into a wall). `motion.step(dt)` advances the state and `motion.shapes` is the current picture.

The laws in `validate.js` are therefore **not** kept while the animation runs, and nothing tests that they are. Speeds and spins are the knobs if the movement feels too fast or too slow. Time comes from the frame timestamps through `createClock` (`clock.delta` is the last step), so speed doesn't depend on the refresh rate and pausing doesn't make the picture jump.

### Tests

- Reference compositions `goodDynamic()` / `goodStatic()` in `testUtils.js` are built by hand, independent of the generator, and must stay valid.
- `generate.*.test.js` run `runBatch` (seeds 0..N per viewport and mode, 16 viewports from 240x240 to 5120x1440) and assert zero violations; N is 500 by default, `VITE_PROP_SEEDS` overrides it.
- `animation.test.js` checks that every form gets its own speed, direction and spin inside the gentle ranges, that circles never turn, the wall bounce, smoothness, determinism per seed, and that forms stay in the window over six simulated minutes at every viewport.
- When a property test fails, it prints the seed and violation codes; rerun that seed through `generateComposition` to reproduce.

### The UI (App.jsx)

- **Render model:** `sceneRef` holds the current composition (`comp`, as generated) and its `motion`; `shapesRef` holds the forms as they are drawn right now (`motion.shapes`). Anything that changes `shapesRef` must be followed by `setVersion(v => v + 1)`. `sceneRef` is initialised lazily on the first render (a `useRef(generate())` would regenerate on every render). Regenerating also resets the clock.
- **SVG:** the `viewBox` comes from the composition (`comp.width` x `comp.height`), not from the window, so a composition scales to fit while a resize is being debounced. [ShapeView.jsx](src/ShapeView.jsx) draws each shape in its own local coordinates inside `translate(cx cy) rotate(r)`.
- **Resize:** debounced by 250 ms. `showAboutRef` mirrors `showAbout`; a resize while the About modal is open is remembered (`pendingRegenRef`) and applied when it closes.
- **Export / share:** the download-PNG and share buttons are two near-duplicate inline handlers. Each finds the SVG with `document.querySelector("svg.fullscreen-canvas")`, serializes it, rasterizes it through an `Image` and `<canvas>` at 300 DPI (viewBox size x 300/96), and then either downloads the PNG or calls `navigator.share`. The `fullscreen-canvas` class on the `<svg>` is load-bearing. Without `navigator.share` the share handler calls `alert()`, which blocks browser automation.
- **UI:** the floating buttons (about, pause/play entropy, regenerate, download, share) sit in the `.floating-buttons` bar. When the About modal opens they slide toward the center via the `slide-*` CSS classes, and a separate close button appears. The bar overlays the bottom of the canvas and the generator does not avoid it, so a form can sit under a button. All icons are inline SVG, and the About text and social links are hardcoded in JSX.

## Styling gotchas

- **Tailwind is not actually wired up.** `tailwindcss` is in `package.json`, but there is no Vite plugin, PostCSS config or `@import "tailwindcss"` anywhere. The utility classes in `App.jsx` (`absolute`, `w-screen`, `flex`, `gap-2`, `bg-black`, …) currently do nothing. The real styling comes from the hand-written rules in [src/index.css](src/index.css) plus inline styles. To use Tailwind, add `@tailwindcss/vite` and `@import "tailwindcss"` first.
- [src/App.css](src/App.css) is leftover Vite-template CSS that nothing imports. Edit [src/index.css](src/index.css) instead.
- `index.css` also keeps the default Vite template's global `button`, `a` and `h1` styles. The floating buttons override them with `all: unset`.
- The ground colour `#f2f2f2` is `GROUND_COLOR` in [palettes.js](src/suprematism/palettes.js) and is duplicated in `index.css` (the `html, body` rule and the `svg.fullscreen-canvas` rule), so change all three together.
- The About modal's social links use `class=` instead of `className=` (React tolerates it, with a console warning). Their SVGs use hyphenated attributes like `fill-rule`.
- The "Loved by the King" Google Font is loaded in [index.html](index.html) but is not referenced by any CSS rule.

## Lint

[eslint.config.js](eslint.config.js) is a flat config using `@eslint/js` recommended, `react-hooks` and `react-refresh`. `no-unused-vars` ignores identifiers starting with an uppercase letter or `_`, which is why a component or constant can go unused without an error.
