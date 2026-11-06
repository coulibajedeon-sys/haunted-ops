# Implementation Plan: Ouija Board Visual Polish

## Overview

This is a presentation-only re-skin of the working Ouija board. Only two files change: `static/board.js` (Layout_Geometry only — `geom` constants plus the `arcAngle`/`arcPosition` bodies) and `templates/index.html` (inline `<style>` CSS plus small markup edits). The pure core of `board.js`, `main.py`, and every existing test file stay untouched. Tasks are ordered so the planchette stays aligned at each step: geometry first, then the matching markup split, then CSS placement, then the remaining visual layers. The user runs `uvicorn ... --reload` and eyeballs the browser at each checkpoint.

## Tasks

- [x] 1. Rework Layout_Geometry in `static/board.js` for the two-row model
  - [x] 1.1 Rewrite `geom` constants and `arcAngle`/`arcPosition` for two rows
    - In the Layout_Geometry section only, replace the `geom` constants with the two-row set: stage `STAGE_W`/`STAGE_H`, letter-arc constants (`LETTER_COUNT`, `ARC_START_ANGLE`, `ARC_END_ANGLE`, `ARC_RADIUS`, `ARC_CENTER_X`, `ARC_CENTER_Y`) and digit-row constants (`DIGIT_COUNT`, `DIGIT_ROW_Y`, `DIGIT_ROW_X_START`, `DIGIT_ROW_X_END`)
    - Rewrite `arcAngle(index, count, g)` to interpolate across the letter-arc span only, guarding `LETTER_COUNT <= 1`
    - Rewrite `arcPosition(index, count, g)` as a piecewise pure function: letters (index `0–25`) placed on the arc via `cos()/sin()`, digits (index `26–35`) placed along the straight row; keep it total and finite, guarding degenerate counts
    - Do NOT touch the pure core (`appendChar`, `appendMarker`, `setName`, `charIndex`, `lastArcChar`) or `createBoard`/`movePlanchetteTo`
    - _Requirements: 1.2, 1.4, 1.5, 7.1, 7.3_

  - [x]* 1.2 Write NEW optional pure-geometry property tests
    - Create a NEW file `tests/board.geom.prop.test.js` using `node:test` + `fast-check` (min 100 iterations each); never edit an existing test file
    - **Property 1: Glyph positions are finite and well-formed** — **Validates: Requirements 1.4, 7.3**
    - **Property 2: Every glyph has a distinct center** — **Validates: Requirements 1.1, 1.4**
    - **Property 3: Letters and digits occupy separated regions** — **Validates: Requirements 1.2**

- [x] 2. Split the glyph markup into a letter arc and a digit row in `templates/index.html`
  - Split the single 36-button loop into a `.arc` group for the 26 letters A–Z and a `.digit-row` group for the 10 digits 0–9
  - Keep `data-char` and `data-index` spanning `0–35` across both groups so `charIndex`/`arcPosition(index,36)` targeting is unchanged
  - Give letters `style="--i: {loop.index0}"` and digits `style="--d: {loop.index0}"` (0–9); keep all `data-*` hooks so the controller's `querySelectorAll("button[data-char]")` still matches all 36
  - Do not change the wiring script
  - _Requirements: 1.2, 7.1, 7.2_

- [x] 3. Add CSS glyph placement matching the geometry in `templates/index.html`
  - Grow the `.ouija` stage to `700×380` and update the `--board-scale` responsive formula to match
  - Place letter glyphs with CSS `cos()/sin()` using the new letter-arc constants and `--i / 25`
  - Place digit glyphs on a straight row using `--d / 9` matching the `arcPosition` straight-line formula (same numbers as `board.js`)
  - Ensure no glyph bounding box overlaps another and every glyph renders at a minimum 16px font
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4. Checkpoint — verify layout and planchette alignment in the browser
  - Load the page: confirm 26 letters on the upper arc and 10 digits on a straight row below, with no overlap and legible (≥16px) glyphs
  - Append a letter then a digit and confirm the planchette lands on each targeted glyph in both regions
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Redesign the Planchette as inline SVG in `templates/index.html`
  - Replace the current SVG with a rounded teardrop/heart body and a transparent circular Planchette_Window at center (`fill="none"`) so the targeted glyph stays visible
  - Center via negative margins (not CSS `transform`) so the controller's inline `transform: translate(x,y)` is not overwritten and the window center coincides with the translate target
  - Add a CSS drop shadow and an `--glow` candlelight halo via `filter`; set `pointer-events: none`; use only inline SVG + CSS, no external image
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 6. Fix typography for glyphs and markers in `templates/index.html`
  - Apply `font-family: "IM Fell English", Georgia, "Times New Roman", serif` to `.ouija .glyph` and `.ouija .marker`
  - Add `font-variant-ligatures: none` and `font-feature-settings` disabling liga/clig/dlig/hlig/swsh/calt so "NO"/"GOODBYE" render as plain letters without swashes
  - Keep the YES/NO/GOODBYE labels as literal uppercase English text; leave Cinzel Decorative on the `<h1>` only
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 7. Apply the aged wooden spirit-board look in `templates/index.html`
  - Build the `.ouija` surface from CSS gradients only (layered wood-grain streaks + banding over a deep radial base), no external image
  - Render glyphs/markers in an engraved gold color with a carved light/dark `text-shadow` pair
  - Add an ornate CSS border with inset frame/vignette shadows and corner flourishes via `::before`/`::after`
  - Use translucent fills so the Fog_Layer stays visible behind the board; base colors/accents draw on `--bg`, `--text`, `--glow`, `--spirit`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 9.4_

- [x] 8. Add corner candlelight in `templates/index.html`
  - Add a non-interactive `.candles` layer (`pointer-events: none`, below the glyphs) with four corner radial-gradient glows painted via `background`
  - Add a `candle-flicker` keyframe animation so the corners flicker when motion is allowed
  - Rely on the existing global `prefers-reduced-motion: reduce` rule so the glow holds static (still painted by `background`) with no flicker under reduced motion
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 9. Remove the duplicate ghost emoji from the title in `templates/index.html`
  - Change the `<h1>` from `👻 Séance` to `Séance`, leaving the `#mascot` ghost block unchanged beneath it
  - _Requirements: 6.1, 6.2_

- [x] 10. Regression and verification
  - Run `npm test` and confirm the JavaScript property tests (`board.prop.test.js`, `ghost.prop.test.js`, `banish.prop.test.js`) pass with no edits to any test file
  - Run `pytest` and confirm the Python suite passes with no edits to any test file
  - Confirm `main.py` and all existing test files are unchanged, and that `/summon` still accepts the `title` form field
  - Do a live GET of the page and confirm it renders 26 letter buttons, 10 digit buttons, the planchette, and an `<h1>` without the ghost emoji
  - _Requirements: 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3_

- [x] 11. Final checkpoint — confirm the finished look
  - Verify the aged wood surface, gold engraved glyphs, ornate border, flickering corner candlelight (static under reduced motion), redesigned planchette with transparent window, readable "NO"/"GOODBYE", and single ghost
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster path; here the only optional work is the NEW pure-geometry property test file, which must never edit an existing test.
- Each task references specific requirements for traceability.
- Only `static/board.js` (Layout_Geometry only) and `templates/index.html` change; `main.py`, the pure core, and all existing test files stay untouched.
- Checkpoints (tasks 4 and 11) are where the user eyeballs the browser.
- The user runs `uvicorn ... --reload` and reviews after each task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["5", "6", "7"] },
    { "id": 4, "tasks": ["8", "9"] },
    { "id": 5, "tasks": ["10"] }
  ]
}
```
