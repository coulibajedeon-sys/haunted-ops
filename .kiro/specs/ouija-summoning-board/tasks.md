# Implementation Plan: Ouija Summoning Board

## Overview

This plan implements the Ouija Summoning Board as a strictly additive enhancement to the existing "Séance" app (FastAPI + Jinja2 + SQLite + vanilla JS). All work is in plain HTML, CSS, inline SVG, and vanilla JavaScript — no frameworks, build steps, or paid APIs.

The build order follows the design's dual-layer pattern: first the pure, Node-testable core of `static/board.js` (string/index transforms + arc geometry) with its property tests in `tests/board.prop.test.js`, then the browser-only DOM adapter, then the markup in `templates/index.html`, the inline wiring script, CSS theming, planchette movement with reduced-motion handling, and bidirectional sync. `main.py` and all existing tests remain untouched; a final regression task confirms the existing suites and the `/summon` 303/200/422 contract are preserved.

Each task is small and independently reviewable so the running `uvicorn --reload` server can be checked after each step.

## Tasks

- [x] 1. Scaffold `static/board.js` module skeleton with UMD-style export
  - Create `static/board.js` using the same UMD-style IIFE wrapper as `banish.js`: assign `window.Board` in the browser and `module.exports` under Node (CommonJS), with no auto-execution of DOM code when loaded under Node.
  - Guard every DOM access behind `typeof document !== "undefined"` so the module can be `require()`d under Node without side effects.
  - Define and export the constants `ARC_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"` (36 chars) and `MAX_TITLE_LENGTH = 200`, and `MARKERS = { YES: "YES", NO: "NO", GOODBYE: <clear sentinel> }`.
  - _Requirements: 1.1, 7.1_

- [x] 2. Implement the pure Spelled_Name transforms in `board.js`
  - [x] 2.1 Implement `appendChar`, `appendMarker`, `setName` (and `capName` helper)
    - `appendChar(name, ch)`: return `name + ch` if the result length `<= MAX_TITLE_LENGTH`, otherwise return `name` unchanged; pure, no mutation.
    - `appendMarker(name, "YES")` / `appendMarker(name, "NO")`: append the literal `"YES"`/`"NO"` only if the full marker text fits under the cap, otherwise return `name` unchanged.
    - `appendMarker(name, "GOODBYE")`: return `""` regardless of current content.
    - `setName(raw)`: return `raw` if `raw.length <= MAX_TITLE_LENGTH`, else the first `MAX_TITLE_LENGTH` characters.
    - Export all transforms from the pure core.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.4, 4.5_

  - [x]* 2.2 Write property test for appending an arc character under the cap
    - **Feature: ouija-summoning-board, Property 1: Appending an arc character grows the name by that character when under the cap**
    - **Validates: Requirements 2.1**
    - Add to a new `tests/board.prop.test.js` using `node:test` + `fast-check` (`require("../static/board.js")`), matching the style of `ghost.prop.test.js` / `banish.prop.test.js`; do NOT modify existing test files. Use `{ numRuns: 100 }` or higher.

  - [x]* 2.3 Write property test for the length cap and monotonicity of append
    - **Feature: ouija-summoning-board, Property 2: Appending never exceeds the maximum length and never shrinks the name**
    - **Validates: Requirements 2.5**
    - Generate names near length 200 to exercise the cap boundary.

  - [x]* 2.4 Write property test for YES/NO literal append under the cap rule
    - **Feature: ouija-summoning-board, Property 3: YES and NO append their literal text under the cap rule**
    - **Validates: Requirements 2.2, 2.3, 2.5**

  - [x]* 2.5 Write property test for GOODBYE clearing the name
    - **Feature: ouija-summoning-board, Property 4: GOODBYE always clears the name**
    - **Validates: Requirements 2.4**

  - [x]* 2.6 Write property test for fallback adoption enforcing the maximum length
    - **Feature: ouija-summoning-board, Property 8: Adopting a fallback value enforces the maximum length**
    - **Validates: Requirements 4.4, 5.3**

- [x] 3. Implement the pure planchette-resolution functions in `board.js`
  - [x] 3.1 Implement `charIndex` and `lastArcChar`
    - `charIndex(ch)`: return the index of `ch` within `ARC_CHARS`, or `-1` when `ch` is not an exact member (literal, no case-folding in the core).
    - `lastArcChar(name)`: scan `name` from the end and return the first character that is a member of `ARC_CHARS`; return `null` if none.
    - Export both from the pure core.
    - _Requirements: 3.1, 3.4, 4.6, 4.7_

  - [x]* 3.2 Write property test for arc-index lookup soundness
    - **Feature: ouija-summoning-board, Property 5: Character-to-arc-index lookup is sound and exhaustive over the arc**
    - **Validates: Requirements 3.1, 3.4**
    - Generate off-arc characters (lowercase letters, punctuation, Unicode) to exercise the `-1` branch.

  - [x]* 3.3 Write property test for last-arc-character planchette target
    - **Feature: ouija-summoning-board, Property 6: The planchette target is the last arc character of the name**
    - **Validates: Requirements 3.1, 3.4, 4.5**

- [x] 4. Implement the pure arc-geometry functions in `board.js`
  - [x] 4.1 Implement `arcAngle` and `arcPosition` with a shared `geom` constants object
    - Define a `geom` object with `START_ANGLE`, `END_ANGLE`, `RADIUS`, `CENTER_X`, `CENTER_Y`.
    - `arcAngle(index, count)`: sweep from `START_ANGLE` to `END_ANGLE` by `index / (count - 1)`.
    - `arcPosition(index, count, geom)`: return `{ x: CENTER_X + RADIUS*cos(angle), y: CENTER_Y + RADIUS*sin(angle) }` so the planchette lands on glyph centers.
    - Export both; these constants are the single source shared with CSS glyph placement.
    - _Requirements: 3.1, 3.4_

- [x] 5. Add example / edge-case unit tests for the pure core
  - [x]* 5.1 Write unit tests complementing the properties
    - Assert `ARC_CHARS` is exactly the 26 uppercase letters then the 10 digits, length 36 (Req 1.1).
    - Assert `MARKERS` yields `"YES"`, `"NO"`, and clear-on-`GOODBYE` (Req 2.2–2.4).
    - Assert `appendChar` at exactly length 199 then 200 (cap boundary) (Req 2.5).
    - Assert `lastArcChar("")` is `null`, `lastArcChar("abcZ")` is `"Z"`, `lastArcChar("Zx")` is `null` for off-arc `x` (Req 3.4).
    - Add to `tests/board.prop.test.js`; do NOT modify existing test files.
    - _Requirements: 1.1, 2.2, 2.3, 2.4, 2.5, 3.4_

  - [x]* 5.2 Write property test for board/fallback agreement (round trip)
    - **Feature: ouija-summoning-board, Property 7: Board append and fallback adoption agree on the resulting name**
    - **Validates: Requirements 4.3, 4.4**

- [x] 6. Checkpoint - Ensure all pure-core tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement the browser-only DOM adapter `createBoard` in `board.js`
  - [x] 7.1 Implement `createBoard(options)` and the controller surface
    - Accept `options.root`, `options.input`, `options.planchette`, `options.reduceMotion` (default from `matchMedia("(prefers-reduced-motion: reduce)")`).
    - Expose `activateChar(ch)`, `activateMarker(m)`, `syncFromInput()`, `value()`, and `movePlanchetteTo(index)` on the returned controller, delegating all name logic to the pure transforms.
    - Bind listeners: glyph button `click` → `activateChar(dataChar)` (uppercase single-letter input before calling the core); marker button `click` → `activateMarker(dataMarker)`; fallback input `input` event → `syncFromInput()`.
    - Keep all DOM access behind the `typeof document !== "undefined"` guard; do not auto-run on load under Node.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.3, 4.4_

- [x] 8. Add Ouija board markup to `templates/index.html`
  - [x] 8.1 Add the board container, character arc, markers, planchette, and keep the fallback input and native submit
    - Inside the existing `<form class="summon" method="post" action="/summon">`, add a `<div class="ouija">` containing 36 `<button type="button" class="glyph" data-char="…">` controls (A–Z then 0–9) positioned via per-glyph CSS custom properties, three `<button type="button" class="marker" data-marker="YES|NO|GOODBYE">` controls labeled in English, and an inline `<svg class="planchette" aria-hidden="true">` positioned over the arc.
    - Keep the existing `<input name="title" maxlength="200" aria-label="New task">` as the synchronized, accessible fallback with its English label.
    - Keep the existing `<button type="submit">Summon</button>` as the real native submit control; all glyph/marker buttons use `type="button"` so only the submit control posts.
    - Add `<script src="/static/board.js"></script>` near the existing `ghost.js` / `banish.js` tags. Do not modify `main.py`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 4.1, 4.2, 5.1, 5.2, 7.1_

- [x] 9. Add the inline wiring script to `templates/index.html`
  - [x] 9.1 Wire the controller to the DOM with graceful degradation
    - Add a small IIFE (mirroring the existing mascot wiring) that returns early if `window.Board` or `Board.createBoard` is unavailable.
    - Look up the board container, the planchette SVG, and `input[name="title"]`, then call `Board.createBoard({...})` and let the controller bind its own listeners.
    - Ensure the native submit path still posts `title` so the form works even if `board.js` fails after render.
    - _Requirements: 5.1, 5.2, 7.2_

- [x] 10. Checkpoint - Ensure the board renders and the fallback form still summons
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Apply the dark gothic theme to the board
  - [x] 11.1 Style the board, glyphs, markers, and planchette with the existing theme
    - Use the existing CSS variables `--bg`, `--text`, `--spirit` for background, text, and accent colors, and `--glow` for the candlelight amber glow on headings and primary buttons.
    - Render headings and labels with the existing Cinzel Decorative and IM Fell English font families with a serif fallback.
    - Position glyphs along the arc using the per-glyph custom properties, keeping the existing fog background layer behind the board content and visible.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 12. Implement planchette movement with reduced-motion handling
  - [x] 12.1 Animate the planchette to the resolved target with `prefers-reduced-motion` support
    - On each append, move the planchette toward the `lastArcChar` target using a CSS `transform: translate(x, y)` computed from `arcPosition`, beginning within 100 ms of the append.
    - Animate via CSS `transition` over a 150–600 ms duration when motion is allowed; disable the transition (instant move within 100 ms) under `prefers-reduced-motion: reduce`, consistent with the existing global reduced-motion rule.
    - When `lastArcChar` is `null`, leave the planchette at its current position (no erratic jump).
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.6, 4.7_

- [x] 13. Implement bidirectional board <-> fallback input synchronization
  - [x] 13.1 Keep the Spelled_Name, fallback input, and planchette in sync both ways
    - After every board-driven state change, write `controller.value()` into `input.value` and reposition the planchette to the current `lastArcChar` (board → input).
    - On fallback `input` events, adopt the value via `setName` (truncating over-length input to the first 200 chars) and reposition the planchette to `lastArcChar` of the new name (input → board).
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 14. Regression safety and contract verification
  - [x]* 14.1 Verify existing suites pass and the summon contract is preserved
    - Run the existing JavaScript property tests (`ghost.prop.test.js`, `banish.prop.test.js`) and the new `board.prop.test.js` and confirm all pass without modifying the existing test files.
    - Run the existing Python property/HTTP tests and confirm they still pass with `main.py` unchanged.
    - Confirm the `/summon` contract is intact: 303 redirect for a valid name, 200 re-render for empty/whitespace-only, 422 for over-length `title`.
    - _Requirements: 5.7, 7.3, 7.4_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (test sub-tasks) and can be skipped for a faster MVP, but they cover the 8 correctness properties and regression safety.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation against the running `uvicorn --reload` server.
- Property tests validate the 8 universal correctness properties from the design; unit tests cover concrete edge cases (cap boundary, arc membership).
- The pure core of `board.js` is built and tested before any DOM, markup, or styling, keeping each step independently reviewable.
- `main.py` and all existing test files are never modified.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.2", "3.3", "5.1", "5.2"] },
    { "id": 2, "tasks": ["7.1"] },
    { "id": 3, "tasks": ["8.1"] },
    { "id": 4, "tasks": ["9.1"] },
    { "id": 5, "tasks": ["11.1", "12.1", "13.1"] },
    { "id": 6, "tasks": ["14.1"] }
  ]
}
```
