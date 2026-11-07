# Implementation Plan: Haunted Task Polish

## Overview

This is a **reconciliation** of the existing partial "Polish B" implementation with the approved requirements, not a greenfield build. The behaviors already live across `main.py`, `templates/index.html`, `static/banish.js`, and `static/ghost.js`; these tasks extract two pure functions into a new testable UMD module (`static/age.js`), close the documented CSS/font gaps, and verify (not rewrite) the server contract, the hold-to-banish gesture, and the summon animation.

Hard constraints threaded through every task:

- ALL existing tests must keep passing — the JS property tests (`tests/*.prop.test.js`, run via `node --test "tests/**/*.test.js"`, i.e. `npm test`, using `fast-check` 4.x already in `devDependencies`) and the Python tests (`tests/test_prop_*.py`, `tests/test_schema_init.py`, `tests/test_http_examples.py`, `tests/test_integration_e2e.py`, run via `pytest`).
- Do NOT change the `POST /summon` or `POST /banish/{task_id}` HTTP contracts (status codes, request/response shapes).
- No new third-party libraries; plain HTML/CSS/inline SVG/vanilla JS/Python+SQLite only.
- All user-visible text in English.
- Any new animated CSS must sit **above** the global `@media (prefers-reduced-motion: reduce)` rule (currently the last rule in the `<style>` block) and express motion only through `animation`/`transition`, so reduced-motion suppression leaves paleness/transparency intact.

Language: JavaScript (client), Python (server) — fixed by the design, not pseudocode.

## Tasks

- [ ] 1. Create the new `static/age.js` UMD module with the two pure functions
  - [ ] 1.1 Scaffold `static/age.js` and implement `ageBucket(createdAt, now)` and `hueFromId(id)`
    - Create `static/age.js` using the same UMD wrapper shape as `static/banish.js` / `static/ghost.js`: a factory assigned to `root.Age` in the browser and to `module.exports` under Node, guarded for `window`/`globalThis`/`this`.
    - Define boundary constants `DAY_MS = 24*60*60*1000` and `ANCIENT_MS = 72*60*60*1000`.
    - Implement `ageBucket(createdAt, now)` as a pure, total function returning exactly `"fresh" | "old" | "ancient"`, never throwing:
      - Parse `createdAt` by porting the existing inline logic in `templates/index.html` (`parseCreated`): trim, replace the space in `"YYYY-MM-DD HH:MM:SS"` with `T`, append `Z` when no timezone suffix is present, then `Date.parse`; treat numbers as epoch-ms; `null`/`undefined`/`""`/unparseable → unknown.
      - Age = `now - parsed`. Bucket: `age < DAY_MS` → `"fresh"`; `DAY_MS < age <= ANCIENT_MS` → `"old"`; `age > ANCIENT_MS` → `"ancient"`. Exactly `DAY_MS` → `"fresh"`, exactly `ANCIENT_MS` → `"old"` (matches the current `age > DAY_MS` / `age > 3*DAY_MS` DOM behavior).
      - Unknown `createdAt`, or non-finite `now` → `"fresh"`.
    - Implement `hueFromId(id)` to return `(id * 47) % 360` normalized into `[0, 360)` (handle negative/non-integer ids defensively so the result is always finite and in range), mirroring the Jinja expression `(task.id * 47) % 360` exactly.
    - Export both functions (plus the constants) from the factory return object.
    - _Requirements: 1.5, 1.6, 4.4, 4.5, 4.6, 4.7, 4.8, 8.3, 8.4_

  - [ ] 1.2 Add the browser-only `applyAgeClasses(root, now)` DOM pass to `static/age.js`
    - Guard with `typeof document !== "undefined"` (matching `banish.js`/`ghost.js`) so Node tests never touch the DOM.
    - `applyAgeClasses(root, now)` selects `main ul li[data-created]`, computes `ageBucket(li.getAttribute("data-created"), now ?? Date.now())`, and adds classes: `"ancient"` → `spirit-old` + `spirit-ancient`; `"old"` → `spirit-old`; `"fresh"` → no class.
    - Auto-wire on DOM ready the same way `banish.js` does (`DOMContentLoaded` if `document.readyState === "loading"`, else run immediately) and export `applyAgeClasses` from the module.
    - _Requirements: 4.4, 4.9, 4.10_

- [ ] 2. Property tests for the pure functions (fast-check, ≥100 runs)
  - [ ]* 2.1 Write `tests/age.prop.test.js` covering age bucketing
    - `require("../static/age.js")`; follow the `node:test` + `node:assert` + `fast-check` conventions in `tests/banish.prop.test.js`.
    - **Property 2: Age bucketing is total and never throws** — generate arbitrary `createdAt` (strings, integers, floats, `null`, `undefined`, junk) and arbitrary `now`; assert the result is in `{"fresh","old","ancient"}` and the call never throws. Tag: `// Feature: haunted-task-polish, Property 2: Age bucketing is total and never throws`. _Validates: Requirement 4.5_
    - **Property 3: Missing or unparseable created_at is fresh** — generate `null`/`undefined`/empty/unparseable `createdAt` and arbitrary `now`; assert `"fresh"`. Tag: `// Feature: haunted-task-polish, Property 3: Missing or unparseable created_at is fresh`. _Validates: Requirement 4.4_
    - **Property 4: Age bucketing is monotonic across the thresholds** — generate a `now` and an age offset, build `createdAt = now - offset`, assert the band (`<24h`→fresh, `(24h,72h]`→old, `>72h`→ancient); include generators that straddle both boundaries so the `fresh→old→ancient` ordering never regresses. Tag: `// Feature: haunted-task-polish, Property 4: Age bucketing is monotonic across the thresholds`. _Validates: Requirements 4.6, 4.7, 4.8_
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 8.2_

  - [ ]* 2.2 Write `tests/hue.prop.test.js` covering hue determinism and range
    - `require("../static/age.js")`; **Property 1: Deterministic hue from id** — generate random integer `id`; assert `hueFromId(id) === hueFromId(id)` (determinism, pure function of `id` alone) and `0 <= hueFromId(id) < 360`. Tag: `// Feature: haunted-task-polish, Property 1: Deterministic hue from id`.
    - _Requirements: 1.5, 1.6, 8.2_

- [ ] 3. Wire `age.js` into the template (replace the inline aging IIFE)
  - [ ] 3.1 Replace the inline aging `<script>` IIFE in `templates/index.html` with `age.js` + a tiny wiring call
    - Remove the inline aging IIFE (the `<script>` block near the end containing `parseCreated`/`ageClass`/`apply`) and add `<script src="/static/age.js"></script>` before `<script src="/static/banish.js"></script>`, consistent with how `board.js` is loaded.
    - Add a small DOM-ready wiring IIFE (mirroring the existing board-wiring IIFE style: `"use strict"`, graceful degradation) that calls `window.Age.applyAgeClasses(document, Date.now())` when `window.Age` exists; if `age.js` failed to load, do nothing (spirits stay `fresh`).
    - Keep each `<li>` emitting `data-id="{{ task.id }}"`, `data-created="{{ task.created_at|default('', true) }}"`, and `style="--spirit-hue: {{ (task.id * 47) % 360 }};"` unchanged, and add a template comment noting the Jinja hue expression is kept in lockstep with `hueFromId` (Property 1).
    - _Requirements: 1.5, 1.6, 4.4, 4.9, 4.10, 8.3_

- [ ] 4. CSS: enlarge the spirit icon, add tinted glow, and give each icon an independent float
  - [ ] 4.1 Raise the spirit-icon SVG rendered size to 52–56px in `templates/index.html`
    - Change the per-`<li>` inline SVG (`class="spirit-icon"`, currently `width="24" height="28"`) so its larger dimension renders between 52 and 56px — set explicit CSS `width`/`height` on `li .spirit-icon` (keeping the `viewBox="0 0 24 28"` aspect ratio so the larger dimension lands in range), overriding the inline attributes.
    - Keep the tinted body + soft glow driven by `--spirit-hue` on `li .spirit-icon-body` (`fill: hsl(var(--spirit-hue) ...)` plus a matching `drop-shadow` in the same hue).
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 4.2 Give each spirit icon an independent float phase (per-id `animation-delay`)
    - Replace the current two-phase scheme (`li:nth-child(even) { animation-delay: -2s, 0s; }`) so each icon's `float` animation has an independent delay derived from the spirit's `id`.
    - Keep this rule **above** the global reduced-motion `@media` rule and express the float only via `animation`/`animation-delay` (no static transform), so reduced motion suppresses it (Req 1.7, 6.1).
    - _Requirements: 1.4, 1.7, 6.1_

- [ ] 5. CSS: fix the Spirit_Name font to a readable, ligature-free family
  - [ ] 5.1 Rewrite the `li .spirit-name` font block in `templates/index.html`
    - Switch `li .spirit-name` off `"Cinzel Decorative"` to a readable serif or sans-serif family clearly distinct from the gothic display font (e.g. a system serif/sans stack, or a readable Google family added to the existing `<link>` without affecting the `h1`/heading use of Cinzel Decorative).
    - Add `font-variant-ligatures: none;` and `font-feature-settings: "liga" 0, "clig" 0, "calt" 0, "dlig" 0;` (mirroring the engraved-glyph treatment already used on `.ouija .glyph`) so I/O/1 and similar glyphs stay distinct.
    - Set `font-size` to ≥16px and ensure the text color keeps readable contrast against the `rgba(185,166,255,.08)` card background.
    - Leave the `h1` rule (`font-family: "Cinzel Decorative", serif;`) and any heading use of the gothic font unchanged.
    - If a web font is added, update the existing Google Fonts `<link>` only (no new library, no bundler).
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.3, 8.4, 8.5_

- [ ] 6. Verify the summon fade-in animation (no rewrite)
  - [ ] 6.1 Confirm `@keyframes appear` is applied to rendered `<li>` and suppressed under reduced motion
    - Inspect `templates/index.html`: confirm `li { animation: float ..., appear .8s ease-out; }` applies the blur→sharp, upward-float, brief-glow `appear` keyframe to every newly rendered spirit `<li>`, and that the `appear` keyframe rule sits above the global reduced-motion `@media` rule so it is suppressed when reduced motion is requested.
    - Make no change if the rule already satisfies Requirements 3.1–3.4; if a gap is found, adjust only the `appear` rule/placement without altering unrelated animations.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 6.1_

- [ ] 7. Verify the hold-to-banish gesture in `static/banish.js` (no rewrite)
  - [ ] 7.1 Confirm the hold/fallback/particle/reduced-motion behavior against Requirement 5 and 6
    - Read `static/banish.js` and confirm: the `.holding` ring fills over `HOLD_MS = 650` (within "approximately 600ms"); completing the hold sets `suppressNextSubmit` and calls `banishItem` once; `pointerup`/`pointerleave`/`pointercancel` before threshold calls `clearHold` and cancels without banishing; the native submit path (mouse click / Enter / Space) banishes immediately; the hold branch is gated by `"PointerEvent" in window` so no-PointerEvent environments use submit only; `spawnCardParticles` runs the evaporation + particles and is a no-op under `prefersReducedMotion()`; the POST goes to `/banish/{id}`.
    - Make no change if behavior already satisfies Requirements 5.1–5.7 and 6.2; if a gap is found, make the minimal fix without changing the `restoreAtIndex` logic covered by `tests/banish.prop.test.js` or the HTTP contract.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.2_

- [ ] 8. Verify the server `created_at` migration and listing (no schema-contract change)
  - [ ] 8.1 Confirm `init_db()` migration is idempotent/non-destructive and `list_spirits` returns `created_at`
    - Read `main.py` and confirm `init_db()` uses `CREATE TABLE IF NOT EXISTS` plus a `PRAGMA table_info`-guarded `ALTER TABLE tasks ADD COLUMN created_at` (idempotent, non-destructive, no `DROP`), and that `list_spirits` returns `created_at` (or `None` for a legacy two-column schema) ordered by `id DESC`.
    - Run `pytest tests/test_schema_init.py tests/test_prop_persistence_restart.py` to confirm the migration/listing contract holds. Do not modify the schema contract or the `/summon` / `/banish` responses.
    - _Requirements: 4.1, 4.2, 4.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1_

- [ ] 9. Final checkpoint — run the full suite and confirm no regressions, no contract change, no new deps
  - Run `npm test` (`node --test "tests/**/*.test.js"`) and confirm all existing JS property tests plus the new `tests/age.prop.test.js` and `tests/hue.prop.test.js` pass.
  - Run `pytest` and confirm all existing Python tests pass.
  - Confirm `package.json` has no new dependencies and the `/summon` / `/banish` HTTP contracts are unchanged.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (the property tests for the two new pure functions); the core implementation and verification tasks are not optional.
- Tasks 6, 7, and 8 are verification tasks: they inspect existing code and make a change only if a gap against the requirements is found, keeping the existing tests and HTTP contracts intact.
- Property 5 (banish DOM round-trip) is already covered by `tests/banish.prop.test.js` and is reused unchanged — no new task is needed for it.
- The remaining acceptance criteria are CSS/visual facts or timer-driven DOM gestures and are verified by code/stylesheet review, not property tests, per the design's Testing Strategy.

## Task Dependency Graph

Tasks 3.1, 4.1, 4.2, 5.1, and 6.1 all edit `templates/index.html`, so they are placed in separate waves to avoid write conflicts. Task 1.2 edits `static/age.js` after 1.1 creates it. The property tests (2.1, 2.2) run after the module they import is complete.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "7.1", "8.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "4.1"] },
    { "id": 2, "tasks": ["2.1", "4.2"] },
    { "id": 3, "tasks": ["5.1"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["3.1"] }
  ]
}
```
