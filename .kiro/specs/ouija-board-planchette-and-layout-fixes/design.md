# Ouija Board Planchette & Layout Fixes — Bugfix Design

## Overview

This fix round corrects planchette targeting and arc layout on the already-working Ouija
board without touching the server or the pure Spelled_Name core. The work is split into
two parts, **Part 1 first** (layout/visual), **Part 2 second** (targeting), because
layout changes move element positions and the targeting fix measures those elements with
`getBoundingClientRect()`.

- **Part 1 — layout/visual (do first):** recenter the letter arc symmetrically and keep
  every glyph inside the inner border (new `geom` constants mirrored in CSS); confirm
  responsive scaling; redesign the planchette inline SVG as a classic planchette; kill the
  `Q` swash.
- **Part 2 — targeting (do second):** replace the pure-math planchette target with the
  real on-screen element center via `getBoundingClientRect()` relative to the board
  container, for ALL glyphs and markers, with a pure Node-testable rect-center helper and
  resize handling.

The strategy keeps the pure core (`appendChar`/`appendMarker`/`setName`/`capName`/
`charIndex`/`lastArcChar`) byte-for-byte unchanged, keeps all DOM access behind
`typeof document !== "undefined"`, and leaves `main.py` and the `/summon` contract alone.

## Glossary

- **Bug_Condition (C)**: `isBugCondition(X)` — an interaction (click/type/resize) whose
  resting planchette point disagrees with the real on-screen center of its target element
  (true for YES/NO clicks today; also true whenever pure arc math drifts from the real
  rect under layout/scale).
- **Property (P)**: the desired behavior — the planchette rests on the real on-screen
  center of the target element (clicked marker button, or the last-arc-char glyph), for
  all glyphs and markers, after resize.
- **Preservation**: the pure Spelled_Name core, the `/summon` contract, all existing
  tests (24/24 JS, 25 Python), the unchanged `DIGIT_*` constants, and reduced-motion
  behavior must remain unchanged.
- **`movePlanchetteTo(index)`**: controller method in `static/board.js` that moves the
  planchette; today it calls `arcPosition(index, 36)`; after the fix it resolves the
  index to a DOM element and measures it.
- **`arcPosition(index, count, g)`**: pure piecewise glyph-center math (letters on the
  arc, digits on the right row). Still used by CSS placement and the geom property test.
- **`elementCenterInContainer(targetRect, containerRect)`**: NEW pure helper computing an
  element-center point from plain `{left, top, width, height}` rects (no real DOM).
- **`lastArcChar(name)` / `charIndex(ch)`**: unchanged pure resolvers; `lastArcChar`
  returning `null` (empty name or off-arc tail) means "do not move".
- **Board scale**: `.ouija` carries `transform: scale(var(--board-scale, 1))`; glyphs and
  the planchette are children of the scaled stage.

## Bug Details

### Bug Condition

The bug manifests on two interaction classes. (a) Clicking the **YES**/**NO** marker
appends `"YES"`/`"NO"`; the name then ends in an arc letter (`S` / `O`), so
`charIndex(lastArcChar(name))` resolves to the letter glyph and the planchette glides to
`S` / `O` on the arc rather than to the marker button. (b) Any move computed purely from
`arcPosition(index, 36)` can disagree with the glyph's **real on-screen center** once
layout or scaling shifts element positions, because the pure math is not the element's
measured rect.

**Formal Specification:**
```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type Interaction        // click on glyph/marker, type, or resize
  OUTPUT: boolean

  RETURN (X is a click on the YES or NO marker button)
         OR (X moves the planchette AND
             arcPosition(indexOf(X), 36) != realOnScreenCenter(targetElement(X)))
END FUNCTION
```

### Examples

- Click **YES** → name becomes `"YES"` → `lastArcChar = "S"` → planchette glides to the
  `S` glyph on the arc. Expected: glide to the YES marker button.
- Click **NO** → name becomes `"NO"` → `lastArcChar = "O"` → planchette glides to the `O`
  glyph. Expected: glide to the NO marker button.
- Click **GOODBYE** → name cleared → `lastArcChar = null` → no move (looks fine today).
  Expected after fix: target the GOODBYE button rect (sensible, documented below).
- Type `A` → planchette should land on the real center of the `A` glyph element; pure
  `arcPosition(0, 36)` may differ from the measured rect after layout changes.
- Resize window → planchette should stay on the current target's real center.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The pure Spelled_Name core (`appendChar`, `appendMarker`, `setName`, `capName`,
  `charIndex`, `lastArcChar`) returns identical results.
- `main.py` and the `POST /summon` contract (303 / 200 / 422) are untouched; the form
  still submits `title`.
- `tests/board.prop.test.js` and `tests/board.geom.prop.test.js` continue to pass,
  including "every letter `y <= DIGIT_ROW_Y`", "all 36 centers distinct", and "digits on
  the right-hand row".
- The `DIGIT_*` constants and the digit right-hand row are unchanged.
- `prefers-reduced-motion: reduce` keeps the planchette instant and disables decorative
  animation.

**Scope:**
All interactions whose target rest-point already matches the real on-screen element center
are unaffected (clicking letters A–Z and digits 0–9 continues to land correctly). The fix
also must not move a glyph out of the inner border or change the digit row.

## Hypothesized Root Cause

Based on the diagnosed bug description, the causes are:

1. **Marker vs. glyph conflation in the move target.** `movePlanchetteTo` derives its
   target from `charIndex(lastArcChar(name))`. For YES/NO the appended name ends in an arc
   letter, so the target resolves to a letter glyph, never to the marker button. Markers
   have no representation in the pure arc index space.

2. **Pure math instead of measured geometry.** The planchette rests at
   `arcPosition(index, 36)` rather than at the element's measured
   `getBoundingClientRect()` center, so any layout/scale shift makes the resting point
   drift from the real glyph center.

3. **Asymmetric / overflowing arc geometry.** The current `geom` arc constants do not
   produce a symmetric arc inside the inner border; apex neighbors (M/N) and end pills can
   overlap or clip.

4. **Decorative glyph shape and ligature features.** The planchette SVG reads as a map
   pin, and the engraved serif stack leaves swash/contextual-alternate features on, so `Q`
   renders a swash.

## Correctness Properties

Property 1: Bug Condition - Planchette rests on the real on-screen center of its target

_For any_ interaction where the bug condition holds (isBugCondition returns true), the
fixed controller SHALL rest the planchette on the real on-screen center of the target
element — the clicked marker button for YES/NO/GOODBYE clicks, or the last-arc-char glyph
element for typed/clicked glyphs — measured via `getBoundingClientRect()` relative to the
board container and corrected for the current board scale, and SHALL NOT move when
`lastArcChar(name)` is `null`. The pure helper `elementCenterInContainer(targetRect,
containerRect)` SHALL, for any finite rects with non-negative sizes, return finite
coordinates equal to the target center minus the container origin.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Pure core, layout invariants, and server contract unchanged

_For any_ input where the bug condition does NOT hold (isBugCondition returns false), the
fixed code SHALL produce the same result as the original function, preserving the pure
Spelled_Name core results, the `/summon` contract, all existing JS/Python tests
(including every letter `y <= DIGIT_ROW_Y`, all 36 centers distinct, and the unchanged
digit row), and reduced-motion behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required (Part 1 first, then Part 2)

Only `static/board.js` and `templates/index.html` change, plus ONE NEW test file.

**File**: `static/board.js` and `templates/index.html`

#### Part 1 — layout/visual (do first)

1. **Recenter the letter arc (geom constants mirrored in CSS).** Set in `board.js`'s
   `geom` and mirror the identical numbers in the `index.html` CSS:
   - `ARC_START_ANGLE = Math.PI * 1.02`
   - `ARC_END_ANGLE   = Math.PI * 1.98`
   - `ARC_RADIUS      = 268`
   - `ARC_CENTER_X    = 350`
   - `ARC_CENTER_Y    = 300`
   - CSS `.ouija .glyph` `width`/`height` = `1.7rem` (font-size ~1rem, ≥ 16px).

   Precomputed invariants (verified numerically): letter centers symmetric about
   `x = 350`; every letter `y ≈ 32.49 .. 283.17` so **every letter `y <= 300`** (keeps the
   geom test green); apex pill top edge `≈ 18.9 ≥ 12`; end pills within `[~68.9, ~631.1]`
   inside the `~[12, 688]` inner band; min adjacent letter-center gap `≈ 32.3px ≥ 27.2px`
   pill, so M/N no longer overlap. `DIGIT_*` constants are **unchanged**.

   CSS mirror: the `.ouija .glyph` arc rule must recompute `--ang` and `left`/`top` with
   the SAME numbers (`π·1.02`, `π·1.98`, `268`, center `350`/`300`).

2. **Confirm responsive scaling (no code change expected, verify).** `.ouija` keeps
   `transform: scale(var(--board-scale, 1))`, `max-width: 100%`, and the
   `@media (max-width: 720px)` rule divides by `700`. Glyphs and planchette are children
   of the scaled stage, so they never overflow; verify at narrow widths.

3. **Redesign the planchette inline SVG as a classic planchette.** Wide rounded
   heart/guitar-pick (wider at top, tapering to a soft point), a CLEAR circular center
   window (`fill="none"`) framing the glyph, soft drop shadow, aged-wood body via an
   inline SVG `<defs>` brown gradient, GOLD outline stroke `#e8c372`. Not a map pin.
   **Centering contract:** the controller sets `style.transform = translate(x, y)` inline,
   so the WINDOW CENTER must sit on that point via negative margins. Final values:
   `viewBox = "0 0 96 96"`, window center at `(48, 48)`, element `margin: -48px 0 0 -48px`
   (and `width`/`height` matching the 96-unit box). Keep `aria-hidden`,
   `pointer-events: none`, the `transform` transition + `will-change`, and reduced-motion
   handling.

4. **Kill the Q swash.** Ensure `.ouija .glyph` and `.ouija .marker` carry
   `font-variant-ligatures: none` and `font-feature-settings` with `"swsh" 0, "calt" 0,
   "liga" 0, "clig" 0, "dlig" 0, "hlig" 0` on the engraved serif stack. (Apex spacing is
   handled by the Part 1 geometry, not here.)

#### Part 2 — targeting (do second)

5. **Pure rect-center helper (exported).** Add to `board.js`:
   ```pascal
   FUNCTION elementCenterInContainer(targetRect, containerRect)
     INPUT: plain {left, top, width, height} objects (no real DOM)
     OUTPUT: {x, y}
     RETURN {
       x: targetRect.left + targetRect.width  / 2 - containerRect.left,
       y: targetRect.top  + targetRect.height / 2 - containerRect.top
     }
   END FUNCTION
   ```
   Pure, total, Node-safe; export it from the module's public API.

6. **Rewrite `movePlanchetteTo` to measure the real element.** Instead of
   `arcPosition(index)`, resolve the target to a DOM element and measure it:
   - Typed/clicked glyph: the element is
     `root.querySelector('button[data-char="X"]')` for the last arc char `X`
     (equivalently resolve `index → element` so `movePlanchetteTo(index)` keeps working
     for letters/digits).
   - Clicked marker: the clicked marker button element itself.
   Compute `elementCenterInContainer(target.getBoundingClientRect(),
   container.getBoundingClientRect())`.

   **Board-scale reasoning (documented decision):** `getBoundingClientRect()` returns
   **scaled** pixels for both the target and the container (both live inside the scaled
   stage). The delta `(targetCenter − containerOrigin)` is therefore in scaled pixels. The
   planchette's inline `transform: translate(x, y)` is applied **inside** the scaled stage
   (the stage's `scale()` multiplies it), so the translate must be expressed in
   **unscaled** stage units. Hence divide the scaled delta by the current scale:
   `x = scaledDeltaX / scale`, `y = scaledDeltaY / scale`, where `scale` is read from the
   stage (e.g. computed from `--board-scale` or from
   `container.getBoundingClientRect().width / STAGE_W`). This lands the planchette window
   on the target center at any viewport width.

   Preserve the no-move rule: when the name is empty or ends off-arc (`lastArcChar` →
   `null`, `charIndex` → `-1`, no resolvable element) the planchette does not move.

7. **Marker click wiring.** On YES/NO/GOODBYE button click, target that marker button's
   rect. GOODBYE also clears the name; after the clear, target the GOODBYE button (or keep
   the planchette where it is) — keep it sensible and document the choice in code.

8. **Resize handling.** Add a `window` resize listener that repositions the planchette to
   the current target (recompute rects on each move). Keep reduced-motion instant behavior
   (set `transition: none` inline under reduced motion).

9. **NEW test file** `tests/board.rect.prop.test.js` for the pure helper (see Testing
   Strategy). Do NOT edit existing tests.

## Testing Strategy

### Validation Approach

Two-phase approach: first surface the defect (here, largely via the pure rect-center
helper test plus a documented manual repro, since the real targeting is DOM/rect based and
a full DOM harness would be brittle), then verify the fix works and preserves existing
behavior. Property-based testing is used for the pure helper; the DOM-level targeting is
verified by manual browser eyeballing and the full existing test suites staying green.

### Exploratory Bug Condition Checking

**Goal**: Surface evidence that YES/NO targeting is wrong on unfixed code and confirm the
root cause, without introducing a brittle DOM test.

**Test Plan**: (a) Write the NEW pure property test for `elementCenterInContainer` — on
UNFIXED code this helper does not exist yet, so the test fails to import/resolve the
symbol (confirming the fix surface is missing). (b) Document a manual repro: load the page,
click **YES**, observe the planchette glide to the `S` glyph instead of the YES marker;
click **NO**, observe it glide to `O`.

**Test Cases**:
1. **Rect-helper existence/behavior** (pure): `elementCenterInContainer` returns the
   target center minus container origin (fails on unfixed code — symbol absent).
2. **Manual YES repro**: click YES → planchette lands on `S` glyph (wrong) — documented.
3. **Manual NO repro**: click NO → planchette lands on `O` glyph (wrong) — documented.

**Expected Counterexamples**:
- `require("../static/board.js").elementCenterInContainer` is `undefined` on unfixed code.
- Possible causes: target derived from `charIndex(lastArcChar(name))`; markers absent from
  the arc index space; pure `arcPosition` used instead of measured rects.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function
produces the expected behavior.

**Pseudocode:**
```
FOR ALL targetRect, containerRect WHERE finite AND sizes >= 0 DO
  result := elementCenterInContainer(targetRect, containerRect)
  ASSERT result.x = targetRect.left + targetRect.width/2 - containerRect.left
  ASSERT result.y = targetRect.top  + targetRect.height/2 - containerRect.top
  ASSERT isFinite(result.x) AND isFinite(result.y)
  // when target is inside container:
  //   0 <= result.x <= containerRect.width AND 0 <= result.y <= containerRect.height
END FOR
```
Plus manual browser verification: clicking A–Z/0–9, clicking YES/NO/GOODBYE, typing
letters, typing the words YES and NO, and after a window resize all land the planchette on
the correct element.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed
function produces the same result as the original.

**Pseudocode:**
```
FOR ALL name DO
  ASSERT appendChar_fixed(name, ch)   = appendChar_original(name, ch)
  ASSERT appendMarker_fixed(name, m)  = appendMarker_original(name, m)
  ASSERT setName_fixed(name)          = setName_original(name)
  ASSERT charIndex_fixed(ch)          = charIndex_original(ch)
  ASSERT lastArcChar_fixed(name)      = lastArcChar_original(name)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation because it
generates many inputs across the domain and catches edge cases. The existing
`board.prop.test.js` (24 JS tests overall) already encodes these invariants and must stay
green; the geom property test must stay green (every letter `y <= DIGIT_ROW_Y`, 36
distinct centers, digits on the right row) after the new arc constants.

**Test Plan**: Run the existing suites on UNFIXED code first (24/24 JS, 25 Python), then
after the fix confirm they still pass. Observe digit row and pure-core behavior unchanged.

**Test Cases**:
1. **Pure core preservation**: existing `board.prop.test.js` properties still pass.
2. **Geom preservation**: existing `board.geom.prop.test.js` still passes with the new arc
   constants (letters `y <= 300`, 36 distinct centers, digits on right row).
3. **Server preservation**: `/summon` still returns 303/200/422 via TestClient; pytest 25
   passed; `main.py` unmodified.

### Unit Tests

- `elementCenterInContainer` concrete cases (target at container origin, centered target,
  offset target).
- Reduced-motion instant move path (documented/manual).

### Property-Based Tests

- NEW `tests/board.rect.prop.test.js`: for any finite target/container rects with
  non-negative sizes, `elementCenterInContainer` returns finite coords equal to target
  center minus container origin; and when the target is inside the container, the center is
  within `[0, containerWidth] × [0, containerHeight]`. `node:test` + `fast-check`,
  `numRuns >= 100`. Tagged `Feature` / `Property` / `Validates`. Existing tests untouched.

### Integration Tests

- `pytest` full suite (25 passed) including `/summon` 303/200/422 and schema/persistence.
- Live `GET /` returns 200 and renders the new geometry + classic planchette.
- Manual browser eyeball: planchette lands on the correct element for clicking A–Z/0–9,
  clicking YES/NO/GOODBYE, typing letters, typing the words YES and NO, and after a window
  resize.
