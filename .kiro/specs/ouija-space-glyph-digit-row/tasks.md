# Implementation Plan

## Overview

This plan fixes the Ouija board space-glyph / digit-row bug using the exploratory bugfix methodology: write a failing bug-condition exploration test first, capture preservation baselines, apply the fix, then verify. The behavioral gap (Case B) is that a space during spelling has no dedicated rest position (`charIndex(" ") === -1`, `movePlanchetteTo(-1)` no-ops, the oracle loop skips the move), so the planchette stays on the previous glyph. The fix adds an invisible space rest point in the pure core of `static/board.js`, a `movePlanchetteToSpaceRest()` DOM adapter method, and a space route in the `static/oracle.js` spelling loop. The digit row stays exactly `0`-`9` (Case A regression guard). `main.py`, `/summon`, and `/banish` are untouched.

## Task Dependency Graph

```
1 (bug condition exploration test - FAILS on unfixed code)
2 (preservation baseline tests - PASS on unfixed code)
        │
        ▼
3 (fix)
├── 3.1 pure core: geom constants + spacePosition  ← must precede 3.2, 3.3
├── 3.2 DOM adapter: movePlanchetteToSpaceRest      ← depends on 3.1, precedes 3.3
├── 3.3 oracle loop: route space to rest            ← depends on 3.1, 3.2
├── 3.4 templates/index.html: digit row stays 0-9   ← independent of 3.1-3.3
├── 3.5 Fix Checking (re-run task 1)                ← depends on 3.1-3.4
└── 3.6 Preservation Checking (re-run task 2)        ← depends on 3.1-3.4
        │
        ▼
4 (conditional: single allowed oracle test update)   ← depends on 3.3
        │
        ▼
5 (checkpoint: full Node + Python suites green)       ← depends on 3, 4
```

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1", "3.4"] },
    { "wave": 3, "tasks": ["3.2"] },
    { "wave": 4, "tasks": ["3.3"] },
    { "wave": 5, "tasks": ["3.5", "3.6"] },
    { "wave": 6, "tasks": ["4"] },
    { "wave": 7, "tasks": ["5"] }
  ]
}
```

## Tasks

- [x] 1. Write bug condition exploration test (Case B: space has no dedicated rest + Case A digit-row guard)
  - **Property 1: Bug Condition** - Digit row is 0-9 only and a space rests at an invisible position
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the behavioral gap exists
  - **DO NOT attempt to fix the test or the code when it fails** - the failure is the expected outcome of this task
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists on the current (unfixed) client code
  - **Scoped PBT Approach**: The core gap (Case B) is deterministic - scope the space-rest property to the concrete failing step (`ch === " "` during spelling); use fast-check generators for the digit-row and spacePosition invariants
  - Create a new Node property test (fast-check + jest), e.g. `tests/space-rest.prop.test.js`, importing the pure core from `static/board.js`
  - **Case B - primary gap (MUST fail on unfixed code)**:
    - Assert that today `charIndex(" ") === -1` (a space is not an arc character) AND that `board.js` exports no `spacePosition` helper - so a space has no dedicated position to resolve to (from Bug Condition Case B in design)
    - Drive the oracle spelling loop over "OLDEST ALPHA" and "3 SPIRITS" with a fake controller that records moves; assert that a space routes to exactly one dedicated space-rest move (asserting `controller.movePlanchetteToSpaceRest` is invoked once per internal space). On UNFIXED code this FAILS because the space produces no move (planchette stays on the previous glyph)
  - **Case A - digit-row regression guard (passes on current markup, locks the invariant)**:
    - Parse the digit row and assert its characters equal exactly `["0","1","2","3","4","5","6","7","8","9"]`, no glyph has empty text, and there is no 37th/extra glyph (from Bug Condition Case A / `expectedBehavior` in design)
    - Assert no two digit-row glyph centers coincide and digits stay within the row span (overlap guard)
  - Run the test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS on the Case B space-rest assertion (this is correct - it proves the behavioral gap exists); document the counterexample (e.g. "spelling the space in 'OLDEST ALPHA' triggers no planchette move; planchette stays on 'T'")
  - Document counterexamples found to confirm the root cause (space not in `ARC_CHARS`, `charIndex(" ") === -1`, `movePlanchetteTo(-1)` early return, oracle loop skips move when `idx < 0`, no `spacePosition` in `geom`)
  - Mark task complete when test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-buggy inputs are unchanged
  - **IMPORTANT**: Follow observation-first methodology - observe behavior on UNFIXED code first, then encode it
  - Create (or extend) Node property tests (fast-check + jest) that capture current non-buggy behavior so the fix cannot regress it
  - **Observe on UNFIXED code, then assert as properties**:
    - Observe: `ARC_CHARS` has length 36 with no space; write a property asserting `ARC_CHARS` is unchanged (length 36) and `charIndex(" ") === -1` still holds, so letter/digit controls gain no selectable space character (Preservation Req 3.2)
    - Observe: for every arc char (A-Z, 0-9) `charIndex` returns its index and `arcPosition`/`scaledArcPosition` return a fixed point; write a property over indices 0..35 asserting the move target is identical before and after the fix (same index, same geometry, same pacing) (Preservation Req 3.1, 3.3)
    - Observe: for random `(index, width, height)`, `scaledArcPosition` returns stable finite values (unchanged function) so glyph-to-planchette alignment is preserved (Preservation Req 3.3)
    - Observe: with `reduceMotion: true` the oracle shows the full answer instantly with no glide for any character including spaces; assert the Reduced_Motion instant path is unchanged (Preservation Req 3.6)
  - **NOTE**: Existing `tests/board.geom.prop.test.js`, `tests/board.prop.test.js`, and `tests/board.rect.prop.test.js` already encode much of this preservation surface and need NO update per the design - run them to confirm they pass on unfixed code and treat them as part of the preservation baseline
  - **NOTE**: The `/summon` and `/banish` contracts are preserved by leaving `main.py` untouched; the existing Python tests (pytest/hypothesis) are the preservation guard for Req 3.4 - run them to confirm the baseline (Preservation Req 3.4, 3.5)
  - Run all preservation tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written/identified, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for the missing space rest position (and lock the digit-row-is-0-9 invariant)

  - [x] 3.1 Add the invisible space rest point to the pure core in `static/board.js`
    - Add frozen `geom` constants: `SPACE_REST_X = ARC_CENTER_X` (350, horizontal center) and `SPACE_REST_Y` set just below the letter band (near the `DIGIT_ROW_Y`/`ARC_CENTER_Y` region) so the point is near the arc center, below the letters; keep `geom` `Object.freeze`d and shared
    - Add a pure, total, Node-safe helper `spacePosition(width, height, g)` that mirrors `scaledArcPosition`: project `{ SPACE_REST_X, SPACE_REST_Y }` from the STAGE_W x STAGE_H model into the real box (`x = (SPACE_REST_X / STAGE_W) * w`, `y = (SPACE_REST_Y / STAGE_H) * h`), with the same finite/positive guards (fallback to STAGE_W/STAGE_H), never touching the DOM and never throwing
    - Export `spacePosition` alongside the existing exports (and expose the new constants via `geom`)
    - Do NOT modify `ARC_CHARS`, `charIndex`, `lastArcChar`, `arcPosition`, or `scaledArcPosition` - they stay byte-for-byte equivalent; `charIndex(" ")` remains `-1`
    - _Bug_Condition: isBugCondition(X) Case B - X.character = " " AND resolveTarget(" ") has no dedicated position_
    - _Expected_Behavior: expectedBehavior(result) Case B - restPosition defined, near arc center below letters, rendersVisibleGlyph = false, pausesOnSpace = true_
    - _Preservation: ARC_CHARS/charIndex/arcPosition/scaledArcPosition unchanged (Req 3.1, 3.2, 3.3)_
    - _Requirements: 2.3, 2.5_

  - [x] 3.2 Add the DOM-adapter `movePlanchetteToSpaceRest()` in `createBoard` (`static/board.js`)
    - Compute `spacePosition(root.clientWidth, root.clientHeight)` and move the planchette to that real-box point, subtracting the planchette half-size (same math as `movePlanchetteToElement`) and honoring `reduceMotion` for the transition
    - Target the computed point only: do NOT query any `button[data-char]` and do NOT create any element; DOM-guard so Node `require` stays side-effect free
    - Notify `onPlanchetteMove` subscribers as the element path does (so the mascot eyes still follow)
    - Expose `movePlanchetteToSpaceRest` on the returned controller object (additive; all existing methods unchanged)
    - _Bug_Condition: isBugCondition(X) Case B - space has no dedicated resting target_
    - _Expected_Behavior: expectedBehavior(result) Case B - adapter resolves a defined invisible rest point, renders no visible glyph_
    - _Preservation: existing controller methods and element-move math unchanged (Req 3.1, 3.3)_
    - _Requirements: 2.3, 2.5_

  - [x] 3.3 Route a space to the rest position in the oracle spelling loop (`static/oracle.js`)
    - In `spell()`, for each char: if `ch === " "` call `controller.movePlanchetteToSpaceRest()` (guarded like `movePlanchette`) instead of doing nothing; otherwise keep the existing `idx = charIndexOf(ch)` / `movePlanchette(idx)` path unchanged
    - In all cases still `revealChar(replySpans[i])` and still `await delay(stepDelay)` so the short per-character pause on the space is preserved and the reply strip still shows the space's `reply-char` span
    - Degrade gracefully: if the controller lacks `movePlanchetteToSpaceRest` (older controller), fall back to the current "no move" behavior for a space while still pausing and revealing the span - never throw
    - Keep the Reduced_Motion path (`showStripInstant`) unchanged - no glide for any character, including spaces
    - _Bug_Condition: isBugCondition(X) Case B - spelling step for " " has no dedicated target_
    - _Expected_Behavior: expectedBehavior(result) Case B - space routes to the invisible rest position and still pauses (pausesOnSpace = true)_
    - _Preservation: arc-char path unchanged (same idx/move/pause); Reduced_Motion instant path unchanged (Req 3.1, 3.6)_
    - _Requirements: 2.3, 2.4, 2.5_

  - [x] 3.4 Confirm `templates/index.html` adds no space glyph (digit row stays exactly 0-9)
    - Verify the digit row emits exactly ten buttons with characters `0`-`9` and no empty/character-less glyph, extra glyph, or circle; if any stray/empty glyph element is found in the digit row, remove it so the row is exactly ten digit buttons
    - Add NO visible glyph, button, or circle for the space rest point, and do NOT add a space to the selectable glyph set
    - _Bug_Condition: isBugCondition(X) Case A - a glyph in the visible digit row has no character / digit row != 0..9_
    - _Expected_Behavior: expectedBehavior(result) Case A - digit row = ["0".."9"], no empty glyph, no overlap_
    - _Preservation: markup for letters/digits/markers otherwise unchanged (Req 3.2)_
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 3.5 Verify bug condition exploration test now passes (Fix Checking)
    - **Property 1: Expected Behavior** - Digit row is 0-9 only and a space rests at an invisible position
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the expected behavior is satisfied
    - Run the bug condition exploration test from task 1 (Fix Checking): assert `digitRow == ["0".."9"]` with no empty glyph and no overlap; assert `spacePosition(w, h)` returns a finite point near the horizontal center below the letters; assert the adapter calls `movePlanchetteToSpaceRest()` once per internal space (no `button[data-char]` queried, no element created) and the loop still awaits `stepDelay`
    - **EXPECTED OUTCOME**: Test PASSES (confirms the behavioral gap is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.6 Verify preservation tests still pass (Preservation Checking)
    - **Property 2: Preservation** - Non-buggy inputs are unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 (and the untouched existing suites) - do NOT write new tests
    - Run the preservation property tests from task 2 plus the existing `tests/board.geom.prop.test.js`, `tests/board.prop.test.js`, `tests/board.rect.prop.test.js`, and the Python tests
    - Confirm `ARC_CHARS` is unchanged (length 36, no space), `charIndex(" ") === -1`, arc-char spelling targets/geometry/pacing are identical, responsive alignment is preserved, the Reduced_Motion instant path is unchanged, and the `/summon`/`/banish` contracts are untouched
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. (Conditional) Update the single allowed oracle test only if it asserts the old space behavior
  - Inspect `tests/oracle.prop.test.js` for any assertion that encodes the OLD behavior ("a space produces no planchette move" / an old character-less space-glyph position)
  - **If such an assertion exists**: update it (and only it) to assert the new space-rest behavior - a space routes to exactly one `movePlanchetteToSpaceRest()` while still pausing and revealing the `reply-char` span. This is the single permitted test change under Req 3.5
  - **If no such assertion exists**: make NO change - `ARC_CHARS`/`charIndex` are unchanged so `charIndex(" ") === -1` still holds and the test passes as-is. Do not edit any other existing test
  - Keep all visible text in English
  - _Requirements: 3.5_

- [x] 5. Checkpoint - Run the full Node + Python suites and confirm green
  - Run the full Node property suite (`tests/*.prop.test.js`, fast-check + jest) and the full Python suite (pytest/hypothesis)
  - Confirm the bug condition exploration test now passes, all preservation tests pass, and every existing test is green (no regressions)
  - Confirm `main.py`, `/summon`, and `/banish` were not modified, and no visible space glyph/button/circle was added to the board
  - Ensure all tests pass; ask the user if questions arise
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

## Notes

- **Methodology**: Tasks 1 and 2 are standalone property tests written BEFORE the fix. Task 1 (bug condition exploration) MUST fail on unfixed code to confirm the Case B gap; task 2 (preservation) MUST pass on unfixed code to lock the baseline.
- **No server changes**: `main.py` and the `/summon` and `/banish` request/response contracts are not modified. The existing Python tests (pytest/hypothesis) are the preservation guard for Req 3.4.
- **Existing tests**: `tests/board.geom.prop.test.js`, `tests/board.prop.test.js`, and `tests/board.rect.prop.test.js` need NO update per the design - the space rest point is not an arc index and `ARC_CHARS`/`charIndex`/`arcPosition`/`scaledArcPosition` are unchanged. Only `tests/oracle.prop.test.js` may need the single allowed update (task 4), and only if it asserts the old "space produces no move" behavior (Req 3.5).
- **No visible glyph**: The space rest point is invisible - no button, circle, or glyph is rendered for it, and no space is added to the selectable `ARC_CHARS` set.
- **Testing env**: Node property tests run under fast-check + jest (`tests/*.prop.test.js`); Python tests run under pytest/hypothesis. Prefer single-run invocations over watch mode.
- **Language**: All visible board text is in English.
