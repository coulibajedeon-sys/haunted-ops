# Design Document

## Overview

The Ouija Board Visual Polish feature is a **presentation-only** re-skin of the already-working Ouija summoning board (feature `ouija-summoning-board`) in the "Séance" app (FastAPI + Jinja2 + SQLite + vanilla JavaScript). The board already composes a Spelled_Name on an arc of 36 glyphs, handles the YES/NO/GOODBYE markers, enforces the 200-character cap, keeps the Fallback_Input synchronized in both directions, and submits to `POST /summon` via the `title` form field. All of that behavior is complete, tested, and stays exactly as-is.

This feature changes only how the board **looks and animates**. It:

- Spaces the glyphs so none overlap, splitting the single 36-glyph arc into a **wider upper arc for the 26 letters** and a **straight horizontal row for the 10 digits** (Req 1).
- Redesigns the Planchette as a classic rounded teardrop body with a transparent circular Planchette_Window centered on the targeted glyph, plus a CSS drop shadow and `--glow` candlelight (Req 2).
- Fixes typography so glyphs and marker words read as plain engraved letters with ligatures/swashes disabled (Req 3).
- Applies an aged dark wooden spirit-board surface with gold engraved glyphs and an ornate CSS border (Req 4).
- Adds flickering corner candlelight that respects reduced-motion (Req 5).
- Removes the duplicate ghost emoji from the Page_Title, keeping only the Ghost_Mascot (Req 6).

### Design Goals and Hard Constraints

- **No behavior change.** The Pure_Core_Functions (`appendChar`, `appendMarker`, `setName`, `charIndex`, `lastArcChar`) are left byte-for-byte unchanged (Req 7.1, 7.2).
- **Server untouched.** `main.py` is not modified; the `/summon` contract and the `title` field are preserved (Req 7.4, 7.5).
- **Tests stay green, unmodified.** All existing JavaScript property tests (`tests/board.prop.test.js`, `tests/ghost.prop.test.js`, `tests/banish.prop.test.js`) and the Python pytest suite keep passing with **no edits to any test file** (Req 8.1, 8.2).
- **Geometry may change — but only the presentation values.** The Layout_Geometry (`geom` constants, `arcAngle`, `arcPosition`) MAY be adjusted, and ONLY to keep the Planchette aligned with the new two-row layout (Req 7.3). This is safe because no existing test asserts any numeric geometry value (see [Why changing geometry is test-safe](#why-changing-geometry-is-test-safe)).
- **No new tech.** Plain HTML, CSS, inline SVG, and the existing vanilla JS only — no frameworks, no external image files, no paid APIs, no new network dependency (Req 8.3, 8.4). All visible text is English (Req 3.4).
- **Accessibility and degradation preserved.** The Fallback_Input stays a standard labeled input with `maxlength="200"`, controls stay keyboard-focusable with visible focus, the fog layer stays visible behind the board, and the native form still summons if `board.js` is absent (Req 9).

### Why changing geometry is test-safe

The only JavaScript this feature touches is the Layout_Geometry in `static/board.js`: the `geom` constants and the two pure placement functions `arcAngle` / `arcPosition`. Reviewing `tests/board.prop.test.js`, the eight property tests and the edge-case unit tests exercise **only** the string/index core — `appendChar`, `appendMarker`, `setName`, `charIndex`, `lastArcChar`, `ARC_CHARS`, and `MARKERS`. **No test imports, calls, or asserts any value of `geom`, `arcAngle`, or `arcPosition`.** Planchette targeting is driven by `charIndex(lastArcChar(name))`, which returns an **index**; that index-resolution logic (Property 5 and Property 6) is unchanged. `arcPosition` converts that index into pixel coordinates for placement only, and nothing in the suite inspects those coordinates. Changing the geometry constants and the shape of `arcPosition` therefore cannot break any existing test.

## Architecture

### Scope of change

Only two files change, and both changes are presentation-scoped:

```mermaid
flowchart TB
  subgraph Changed
    HTML["templates/index.html<br/>• inline &lt;style&gt; (wood board, arc+digit layout,<br/>  planchette, candlelight, typography)<br/>• planchette inline SVG redesign<br/>• digit-row markup split<br/>• h1 emoji removed"]
    BoardJS["static/board.js<br/>• geom constants (presentation)<br/>• arcAngle / arcPosition (two-row layout)<br/>• PURE CORE untouched"]
  end
  subgraph Unchanged
    Main["main.py (server)"]
    Tests["tests/*.js + tests/*.py"]
    Ghost["static/ghost.js"]
    Banish["static/banish.js"]
  end

  HTML -->|"--i index + data-char/data-marker"| BoardJS
  BoardJS -->|"arcPosition(index,36) → translate(x,y)"| HTML
  Main -. serves unchanged .- HTML
  Tests -. import board.js pure core only .- BoardJS
```

- **`templates/index.html`** — all CSS lives in the existing inline `<style>` block; the only markup edits are the planchette SVG, splitting the glyph loop into a letter arc plus a digit row, and removing the emoji from `<h1>`. The wiring script and all `data-*` hooks stay identical, so the controller binds exactly as today.
- **`static/board.js`** — only the Layout_Geometry section changes (the `geom` object and the bodies of `arcAngle` / `arcPosition`). Everything under "Cœur pur : transforms" and "résolution caractère ↔ arc", plus `createBoard`, stays as-is. `createBoard` already calls `arcPosition(index, ARC_CHARS.length)` through `movePlanchetteTo`, so updated geometry flows to the planchette with no adapter change.

### Single source of truth for coordinates

The board.js `geom` + `arcPosition` remain the **single source of truth** for where every glyph center sits, in a fixed virtual coordinate space (the "600-space" today, widened here). The CSS places each glyph at the identical computed point, and the controller moves the planchette to the identical point. This is the same strategy the current design uses (CSS `cos()/sin()` mirrors the JS formula); we extend it so letters and digits each use the branch of `arcPosition` that matches their region.

## Components and Interfaces

### 1. Layout_Geometry in `static/board.js` (two-row model)

The current single-arc model places all 36 glyphs on one arc, which crowds the letters near the top. The new model routes placement by index:

- **Letters, index `0–25`**: a **wider, larger-radius arc** so 26 glyphs have generous spacing.
- **Digits, index `26–35`**: a **straight horizontal row** at a constant `y` below the arc, `x` spread evenly across the board width.

`arcPosition(index, count)` becomes a piecewise function. It keeps its signature and purity (no DOM, no throw, totally defined), so the controller and tests are unaffected.

**Before (current constants):**

```js
var geom = Object.freeze({
  START_ANGLE: Math.PI,      // 180°
  END_ANGLE: 2 * Math.PI,    // 360°
  RADIUS: 260,
  CENTER_X: 300,
  CENTER_Y: 300
});
// single arc for all 36 glyphs
arcAngle(index, count)   = START_ANGLE + (END_ANGLE - START_ANGLE) * index / (count - 1)
arcPosition(index, count)= { x: CENTER_X + RADIUS*cos(angle), y: CENTER_Y + RADIUS*sin(angle) }
```

**After (proposed constants and piecewise placement):**

```js
var geom = Object.freeze({
  // Stage grows to give the 26-letter arc room; responsive scale still via --board-scale.
  STAGE_W: 700,            // was effectively 600
  STAGE_H: 380,            // taller: arc on top, digit row below

  // Letter arc (indices 0..25): wider angular span + larger radius.
  LETTER_COUNT: 26,
  ARC_START_ANGLE: Math.PI * 1.08,   // just past 180°, sweeping over the top
  ARC_END_ANGLE:   Math.PI * 1.92,   // stops short of 360°, symmetric span
  ARC_RADIUS: 300,
  ARC_CENTER_X: 350,                  // STAGE_W / 2
  ARC_CENTER_Y: 330,                  // center below the arc; glyphs sweep the upper band

  // Digit row (indices 26..35): straight horizontal line.
  DIGIT_COUNT: 10,
  DIGIT_ROW_Y: 300,                   // constant y, below the letter arc
  DIGIT_ROW_X_START: 120,
  DIGIT_ROW_X_END: 580                // evenly spaced across the board width
});
```

```js
// arcAngle: unchanged purpose, now scoped to the LETTER arc only.
// For index in [0,25], interpolate across the letter arc span. Guards count<=1.
function arcAngle(index, count, g) {
  g = g || geom;
  if (g.LETTER_COUNT <= 1) return g.ARC_START_ANGLE;
  var t = index / (g.LETTER_COUNT - 1);
  return g.ARC_START_ANGLE + (g.ARC_END_ANGLE - g.ARC_START_ANGLE) * t;
}

// arcPosition: piecewise. Letters -> arc; digits -> straight row.
// Still pure, still total, still returns finite {x,y}. `count` is accepted for
// signature compatibility; placement is driven by the index region.
function arcPosition(index, count, g) {
  g = g || geom;
  if (index < g.LETTER_COUNT) {
    var angle = arcAngle(index, count, g);
    return {
      x: g.ARC_CENTER_X + g.ARC_RADIUS * Math.cos(angle),
      y: g.ARC_CENTER_Y + g.ARC_RADIUS * Math.sin(angle)
    };
  }
  // digit region: index 26..35 -> 0..9 along the straight row
  var d = index - g.LETTER_COUNT;                // 0..9
  var denom = (g.DIGIT_COUNT - 1) || 1;          // guard single-digit layouts
  var frac = d / denom;                          // 0..1
  return {
    x: g.DIGIT_ROW_X_START + (g.DIGIT_ROW_X_END - g.DIGIT_ROW_X_START) * frac,
    y: g.DIGIT_ROW_Y
  };
}
```

Notes:

- `arcPosition(index, 36)` is exactly what `movePlanchetteTo` already calls, so the planchette lands on glyph centers in **both** the arc (letters) and the straight row (digits) with no controller change.
- The constants above are a concrete starting point; during implementation they may be nudged to achieve non-overlap (Req 1.1) and the minimum 16px glyph font (Req 1.3). The invariant that matters is that **CSS and `arcPosition` use the same numbers**.
- Because the stage grows to `700×380`, the CSS stage (`.ouija`) width/height and the `--board-scale` responsive formula update to match (see CSS module below). Scaling stays on `.ouija` so glyphs and planchette scale together and stay aligned.

### 2. Coordinate model shared by CSS and board.js

Coordinate space (unchanged conventions): origin top-left, x right, y down, angles in radians measured from +x, SVG-style. Two placement formulas, selected by region:

**Letters (index `i` in `0..25`):**
```
angle = ARC_START_ANGLE + (ARC_END_ANGLE - ARC_START_ANGLE) * i / 25
x = ARC_CENTER_X + ARC_RADIUS * cos(angle)
y = ARC_CENTER_Y + ARC_RADIUS * sin(angle)
```

**Digits (index `i` in `26..35`, `d = i - 26`):**
```
x = DIGIT_ROW_X_START + (DIGIT_ROW_X_END - DIGIT_ROW_X_START) * d / 9
y = DIGIT_ROW_Y
```

The CSS mirrors this with the same numbers. Recommended approach (chosen): **board.js `arcPosition` is the single source of truth; CSS re-expresses the identical math.** Letters keep the CSS `cos()/sin()` placement (now with the letter-arc constants and `--i / 25`); digits use a flex/absolute straight row whose per-digit `x` matches the straight-line formula. The planchette, moved by the controller via `transform: translate(x,y)` to `arcPosition(index,36)`, therefore coincides with the CSS glyph center in both regions.

The alternative — having board.js expose precomputed positions and CSS read them — is rejected: it would require new JS plumbing and markup, adding risk to a visual-only change. Mirroring the formula in CSS keeps the diff small and matches the existing pattern.

### 3. Planchette redesign (inline SVG + CSS) — `templates/index.html`

Replace the current teardrop-ish SVG with a classic planchette: a rounded heart/teardrop wooden body, a **transparent circular Planchette_Window** at its center, a soft drop shadow, and an `--glow` candlelight halo — all inline SVG + CSS, no external image (Req 2.1, 2.2, 2.3, 2.5).

Centering contract (critical): the controller sets `style.transform = translate(x,y)` directly on the SVG, so we **must not** rely on a CSS `transform` for centering (it would be overwritten). Centering stays via **negative margins** (as today) computed so the **window center** coincides with the translate target. Equivalently, the SVG `viewBox` is authored so the window center is the geometric reference and the margins offset that reference onto `(x,y)`.

Proposed SVG (window centered at viewBox `(40,40)`, body a rounded teardrop):

```html
<svg class="planchette" data-planchette aria-hidden="true"
     width="80" height="92" viewBox="0 0 80 92">
  <!-- teardrop/heart body: broad rounded top, tapering point at bottom -->
  <path d="M40 8
           C20 8 8 22 8 40
           C8 60 26 74 40 86
           C54 74 72 60 72 40
           C72 22 60 8 40 8 Z"
        fill="currentColor" fill-opacity="0.16"
        stroke="currentColor" stroke-width="2.5"/>
  <!-- Planchette_Window: transparent circular opening, no fill, ring stroke only -->
  <circle cx="40" cy="40" r="15" fill="none" stroke="currentColor" stroke-width="2.5"/>
  <!-- faint sight dot does NOT fill the window, so the glyph stays visible -->
  <circle cx="40" cy="40" r="1.5" fill="currentColor"/>
</svg>
```

CSS:

```css
.ouija .planchette {
  position: absolute; top: 0; left: 0;
  width: 80px; height: 92px;
  /* Center the WINDOW center (viewBox 40,40) onto the translate target (x,y). */
  margin: -40px 0 0 -40px;
  color: var(--glow);                       /* amber body + ring + glow */
  /* drop shadow + candlelight glow (Req 2.3), no external asset */
  filter: drop-shadow(0 2px 4px rgba(0,0,0,.55))
          drop-shadow(0 0 12px rgba(255,179,71,.6));
  pointer-events: none;                      /* glyph beneath stays clickable/visible */
  transition: transform 420ms cubic-bezier(.22,.61,.36,1);
  will-change: transform;
  transform: translate(350px, 150px);        /* rest position in STAGE_W-space */
}
```

The inner circle has `fill="none"`, so the glyph sits **inside** the window and remains visible (Req 2.2). `pointer-events: none` keeps the glyph beneath selectable. The existing global `@media (prefers-reduced-motion: reduce)` rule already forces `transition: none !important`, and `board.js` also sets `style.transition = "none"` inline under reduced motion — both agree, so the window comes to rest on the targeted glyph with or without animation (Req 2.4, consistent with Req 5.3's motion handling).

### 4. Typography module (Req 3) — `templates/index.html` CSS

The decorative **Cinzel Decorative** font (kept for the `<h1>` and marker labels today) produces swashes/ligatures that make "NO"/"GOODBYE" hard to read. For the board's glyphs and marker labels we use a **readable engraved serif** already loaded (**IM Fell English**) with a serif fallback, and we hard-disable ligatures and swashes. Cinzel stays only on the page `<h1>`.

```css
.ouija .glyph,
.ouija .marker {
  font-family: "IM Fell English", Georgia, "Times New Roman", serif;
  font-variant-ligatures: none;                 /* Req 3.1 */
  font-feature-settings: "liga" 0, "clig" 0, "dlig" 0, "hlig" 0, "swsh" 0, "calt" 0;
  letter-spacing: .02em;                         /* keeps multi-letter markers distinct */
}
```

Marker labels render the literal English words — the markup uses "YES" / "NO" / "GOODBYE" (uppercase for the engraved look), with no decorative swashes (Req 3.3, 3.4). This also satisfies Req 3.2 (engraved-style serif with serif fallback).

### 5. Wooden board look (Req 4) — `templates/index.html` CSS

The `.ouija` stage gets an aged dark wood surface built from **CSS gradients only** (no external image, Req 4.1), gold engraved glyph color (Req 4.2), an ornate CSS border (Req 4.3), and it reuses the Theme_Variables for accents (Req 4.4). An optional inline-SVG `feTurbulence` grain overlay is described as a progressive enhancement but is not required.

**Wood-grain surface (gradient stack):**

```css
.ouija {
  position: relative;
  width: 700px; height: 380px;          /* = STAGE_W × STAGE_H */
  max-width: 100%; margin: 0 auto 1rem;
  /* layered dark-brown grain: long streaks + subtle banding over a deep base */
  background:
    repeating-linear-gradient(92deg,
      rgba(42,26,14,.55) 0px, rgba(42,26,14,.55) 2px,
      rgba(26,16,9,.55) 2px,  rgba(26,16,9,.55) 5px),
    repeating-linear-gradient(88deg,
      rgba(60,38,20,.25) 0px, rgba(60,38,20,.25) 9px,
      rgba(30,19,10,.25) 9px, rgba(30,19,10,.25) 18px),
    radial-gradient(120% 80% at 50% 20%, #3a2614 0%, #241608 55%, #160d05 100%);
  transform: scale(var(--board-scale, 1));
  transform-origin: top center;
}
```

**Optional SVG grain overlay** (inline, no external file) — a decorative, `pointer-events:none`, `aria-hidden` layer using `feTurbulence`/`fractalNoise` composited at low opacity over the wood; included only if gradients alone look too flat. It stays inside the stage and does not alter coordinates.

**Gold engraved glyphs** (Req 4.2) — gold text with a light/dark text-shadow pair for an incised look:

```css
.ouija .glyph, .ouija .marker {
  color: #e8c372;                                   /* engraved gold */
  text-shadow: 0 1px 0 rgba(0,0,0,.6),              /* carved shadow below */
               0 -1px 0 rgba(255,235,180,.25);      /* highlight above */
}
```

**Ornate border** (Req 4.3) — layered CSS borders, inset shadows, and corner flourishes via pseudo-elements (no image):

```css
.ouija {
  border: 3px double #6b4a22;
  border-radius: 20px;
  box-shadow:
    inset 0 0 0 6px rgba(40,26,12,.65),             /* inner frame band */
    inset 0 0 40px rgba(0,0,0,.6),                  /* vignette */
    0 0 28px rgba(185,166,255,.10);                 /* subtle --spirit-ish halo */
}
.ouija::before, .ouija::after {                      /* corner flourishes */
  content: ""; position: absolute; width: 36px; height: 36px;
  border: 2px solid rgba(232,195,114,.7); border-radius: 6px;
  /* rotate/clip into scroll-like corners; purely decorative */
}
.ouija::before { top: 8px; left: 8px; border-right: none; border-bottom: none; }
.ouija::after  { bottom: 8px; right: 8px; border-left: none; border-top: none; }
```

All surface fills use translucency where they overlap the page background so the Fog_Layer stays visible behind the board (Req 9.4). The base colors/accents draw on `--bg`, `--text`, `--glow`, and `--spirit` (Req 4.4).

### 6. Corner candlelight (Req 5) — `templates/index.html` CSS

Four radial-gradient glows in the stage corners, animated with a flicker keyframe, gated by reduced-motion. A dedicated, non-interactive layer keeps the effect out of the glyph flow:

```css
.ouija .candles {
  position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background:
    radial-gradient(60px 60px at 6% 8%,  rgba(255,179,71,.45), transparent 70%),
    radial-gradient(60px 60px at 94% 8%, rgba(255,179,71,.45), transparent 70%),
    radial-gradient(60px 60px at 6% 92%, rgba(255,179,71,.40), transparent 70%),
    radial-gradient(60px 60px at 94% 92%,rgba(255,179,71,.40), transparent 70%);
  animation: candle-flicker 2.4s ease-in-out infinite;   /* Req 5.2 */
}
@keyframes candle-flicker {
  0%, 100% { opacity: .85; filter: brightness(1); }
  25%      { opacity: .62; filter: brightness(.9); }
  50%      { opacity: .95; filter: brightness(1.12); }
  75%      { opacity: .7;  filter: brightness(.95); }
}
```

Reduced-motion: the existing global rule `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }` stops the flicker. Because the glow is painted by `background` (not by the animation), it **remains as a static glow** when the animation is disabled — satisfying Req 5.1 (glow on load), 5.2 (flicker when motion allowed), and 5.3 (static glow under reduced motion) with no extra media query. The glyphs and markers sit above `.candles` (higher `z-index`), so candlelight never obscures or blocks them.

### 7. Single ghost on the page (Req 6) — `templates/index.html` markup

Remove the emoji from the title; keep the mascot block untouched:

```html
<!-- before -->
<h1>👻 Séance</h1>
<!-- after -->
<h1>Séance</h1>
```

The `#mascot` block (ghost + `#mascot-msg`) is unchanged and remains rendered beneath the title (Req 6.1, 6.2).

### 8. Markup split for the digit row (Req 1.2)

The glyph loop currently emits all 36 buttons into one `.arc` group. To place digits on a separate straight row while keeping the same `data-char` / `data-index` / `--i` hooks the controller relies on, split the loop into two groups inside `.ouija`:

```html
<div class="arc" role="group" aria-label="Character arc">
  {% for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" %}
  <button type="button" class="glyph" data-char="{{ ch }}" data-index="{{ loop.index0 }}"
          style="--i: {{ loop.index0 }};" aria-label="Letter {{ ch }}">{{ ch }}</button>
  {% endfor %}
</div>
<div class="digit-row" role="group" aria-label="Digit row">
  {% for ch in "0123456789" %}
  <button type="button" class="glyph digit" data-char="{{ ch }}"
          data-index="{{ loop.index0 + 26 }}" style="--d: {{ loop.index0 }};"
          aria-label="Digit {{ ch }}">{{ ch }}</button>
  {% endfor %}
</div>
```

The `data-index` values stay `0–35` across both groups, so `charIndex`/`arcPosition(index,36)` targeting is unchanged. Letter glyphs keep `--i` for CSS `cos()/sin()` placement; digit glyphs use `--d` (0–9) for the straight-line CSS. The controller's `root.querySelectorAll("button[data-char]")` still matches all 36 buttons regardless of which group they live in, so no wiring change is needed.

### 9. Server (unchanged)

`main.py`, the `/summon` and `/banish` routes, the `/static` mount, and the template wiring are **not modified** (Req 7.5). The board still posts `title` through the native form, preserving the existing HTTP contract (Req 7.4).

## Data Models

This feature introduces **no new data model**. The Spelled_Name, Character_Arc index model, Special_Marker model, and planchette target resolution (`target(name) = charIndex(lastArcChar(name))`) are all inherited unchanged from the `ouija-summoning-board` design. The only data touched is the presentation-layer Layout_Geometry constants described in Component 1 — pixel coordinates, not domain state.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

This is a **visual/CSS/SVG** feature. Most requirements (wood look, candlelight, planchette appearance, typography, single ghost, non-overlap, aged border) are rendering concerns verified by eye, not by property-based testing. The behavior-bearing pure core is explicitly out of scope for change and is already covered by the existing `tests/board.prop.test.js`.

The one place with a genuinely testable **pure** invariant is the revised `arcPosition`: it must stay total, finite, and injective across the 36 indices so the planchette can land on a distinct center per glyph, with letters and digits separated. Any such test would be a **NEW, optional** file (e.g. `tests/board.geom.prop.test.js`) importing the existing exported `arcPosition`/`geom`; it would **not** modify any existing test file. It is optional because exact pixel positions are a visual concern — these properties guard only against degenerate geometry (NaN, collisions, letters bleeding into the digit row), not against a specific look.

### Property 1: Glyph positions are finite and well-formed

*For any* index `i` in `[0, 36)`, `arcPosition(i, 36)` returns an object `{x, y}` where both `x` and `y` are finite numbers (never `NaN` or `±Infinity`).

**Validates: Requirements 1.4, 7.3**

### Property 2: Every glyph has a distinct center

*For any* two distinct indices `i, j` in `[0, 36)`, `arcPosition(i, 36)` and `arcPosition(j, 36)` are not the same point (they differ in `x` or `y`), so each glyph — and thus each planchette target — is unique.

**Validates: Requirements 1.1, 1.4**

### Property 3: Letters and digits occupy separated regions

*For any* letter index `i` in `[0, 26)` and any digit index `j` in `[26, 36)`, the digit-row point `arcPosition(j, 36)` lies on the straight digit row (constant `y = DIGIT_ROW_Y`) and below the letter-arc band, so the two regions do not interleave.

**Validates: Requirements 1.2**

## Error Handling

Behavior, degradation, and reduced-motion handling are inherited unchanged; this feature adds no new runtime branches.

| Situation | Handling | Requirement |
| --- | --- | --- |
| `board.js` absent / `window.Board` undefined | Inline wiring returns early; native `form.summon` still posts `title` to `/summon`; a valid task persists and appears in the list | 9.3 |
| JavaScript disabled | Board markup is inert decoration; the Fallback_Input + submit button summon normally | 9.3 |
| Revised `arcPosition` given any index 0–35 | Pure, total, returns finite `{x,y}` for both regions; never throws (guards `count<=1` / single-digit) | 1.4, 7.3 |
| Name ends off-arc or is empty | `lastArcChar` → `null`, `charIndex(null)` → `-1`, `movePlanchetteTo` no-ops; unchanged from current behavior | 7.1 |
| `prefers-reduced-motion: reduce` | Global rule disables flicker + planchette transition; candlelight stays a static glow; planchette snaps to target | 5.3 |
| Fog layer behind board | Board surfaces use translucent fills; `.ouija` does not fully occlude the fixed `.fog` layer | 9.4 |

## Testing Strategy

### No new required tests; existing suites must stay green

This is a presentation change. The acceptance criteria are dominated by visual rendering (wood grain, gold engraving, ornate border, candlelight flicker, planchette shape, non-overlap, single ghost) which are not amenable to automated property-based testing. Accordingly:

- **No existing test file is modified** (Req 8.1, 8.2). After the change, run the full suites to confirm green:
  - JavaScript: `npm test` (runs `tests/*.prop.test.js` via `node:test` + `fast-check`).
  - Python: `pytest` (HTTP example tests, schema, integration e2e).
- Because only the Layout_Geometry (`geom`, `arcAngle`, `arcPosition`) changes in `board.js` and nothing in the suite asserts those values (see [Why changing geometry is test-safe](#why-changing-geometry-is-test-safe)), the JS property tests remain valid without edits. The index-based targeting they do cover (`charIndex`, `lastArcChar`) is untouched.

### Optional NEW pure-geometry property test

If desired, add a **new** file `tests/board.geom.prop.test.js` (never editing an existing one) implementing Properties 1–3 above with `node:test` + `fast-check`, minimum 100 iterations each, tagged `Feature: ouija-board-visual-polish, Property N: ...`. This guards only against degenerate geometry (NaN, duplicate centers, letter/digit region overlap), not against a specific pixel layout. It is optional and must not gate the visual work.

### Manual / visual verification (primary)

The bulk of acceptance is confirmed by loading the page and inspecting:

- All 36 glyphs render with no overlapping bounding boxes; letters on the upper arc, digits on a straight row below; glyph font ≥ 16px (Req 1.1–1.3).
- Appending a letter then a digit moves the planchette so its transparent window centers on that glyph in both regions (Req 1.4, 1.5, 2.4).
- The planchette shows the teardrop body, transparent window framing the glyph, drop shadow, and `--glow` candlelight; no external image requests in the network panel (Req 2.1–2.5).
- "NO" and "GOODBYE" read as plain letters — no swashes/ligatures; glyphs/markers use the engraved serif; all text English (Req 3.1–3.4).
- The surface looks like aged dark wood with gold engraved glyphs and an ornate border; no external image file is loaded (Req 4.1–4.4).
- Corner candlelight glows on load and flickers; under emulated `prefers-reduced-motion: reduce` it holds a static glow (Req 5.1–5.3).
- The `<h1>` shows "Séance" with no emoji; the mascot ghost still renders beneath it (Req 6.1, 6.2).
- Keyboard: glyphs, markers, and Summon are focusable with visible focus; the Fallback_Input keeps its label and `maxlength="200"`; with JS disabled the plain form still summons; the fog remains visible behind the board (Req 9.1–9.4).

### Regression safety

`main.py` and all test files are untouched, and `board.js`'s pure core is byte-for-byte unchanged, so no existing Python or JavaScript test input changes. The planchette-targeting property tests depend only on index resolution, which this feature does not alter (Req 7.1, 7.2, 8.1, 8.2).
