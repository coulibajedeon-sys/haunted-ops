# Ouija Space Glyph / Digit Row Bugfix Design

## Overview

The Ouija board must show a digit row of exactly `0`–`9` (ten evenly spaced, horizontally centered glyphs with no empty, character-less circle), while the planchette gains a dedicated **invisible** rest position to sit on when an oracle answer contains a space.

Two surfaces are in scope:

1. **Rendered glyph set.** The committed markup in `templates/index.html` already emits exactly 26 letter buttons (`data-index` 0..25) and 10 digit buttons (`data-index` 26..35, `--d: 0..9`), with no space button and no 37th glyph. There is no character-less glyph in the source. The fix therefore does not *remove* a space button (there is none); it *guarantees* the "digits 0–9 only" invariant by construction and adds a regression test that fails if any empty glyph, an extra glyph, or an overlap is ever reintroduced into the digit row.

2. **Planchette resolution for a space.** Today a space resolves to nothing: `charIndex(" ")` is `-1`, and `movePlanchetteTo(-1)` returns without moving, so during the pause on a space the planchette stays on the previous glyph. The fix introduces a dedicated, **invisible** space rest position near the arc center (below the letters) in the pure geometry core, and routes a space in the oracle spelling loop to that rest position — without adding a selectable space character to `ARC_CHARS` and without rendering any visible glyph/button/circle.

The strategy preserves the pure-core / DOM-adapter layering and the UMD module shape of `static/board.js` and `static/oracle.js`. All pure additions are total and Node-safe so existing property tests keep passing. The server (`main.py`, `/summon`, `/banish`) is untouched.

## Glossary

- **Bug_Condition (C)**: Either (A) a glyph in the visible digit row has no character inside it, or (B) a spelling step for a space character `" "` has no dedicated resting target. See `isBugCondition`.
- **Property (P)**: The desired behavior for a C input — the digit row holds exactly `["0".."9"]` with no empty glyph and no overlap; and a space resolves to a defined, invisible rest position near the arc center while still pausing.
- **Preservation**: Existing behavior for `¬C` inputs that must stay identical — spelling of arc-only answers (A–Z, 0–9), glyph/marker activation, responsive alignment, the Reduced_Motion instant path, and the unchanged `/summon` and `/banish` contracts.
- **F / F'**: The board/spelling behavior before (F) and after (F') the fix.
- **ARC_CHARS**: The 36-char selectable set `"A..Z0..9"` in the pure core. The space is **never** added here (preserves Req 3.2). `charIndex(" ") === -1` stays true.
- **spacePosition(width, height, g)**: New pure helper (proposed) that returns the `{ x, y }` rest point for a space, projected into the real box exactly like `scaledArcPosition`, with no DOM.
- **SPACE_REST_X / SPACE_REST_Y**: New frozen `geom` constants for the space rest point in the STAGE_W×STAGE_H model: `SPACE_REST_X = ARC_CENTER_X` (350, horizontal center) and `SPACE_REST_Y` just below the letter band (near `DIGIT_ROW_Y`/`ARC_CENTER_Y`), so the point sits near the arc center, below the letters — and never renders a glyph.
- **movePlanchetteToSpaceRest()**: New DOM-adapter method on the Board_Controller that places the planchette at the projected space rest point by real-box coordinates, without targeting any `button[data-char]` and without creating any element.
- **reply-char span**: The per-character `<span class="reply-char">` the oracle reveals in `.spirit-reply`; a space still gets one (it keeps its width), so the answer text reads correctly.

## Bug Details

### Bug Condition

The bug manifests in two independent ways. Case A is about what is *rendered* (the digit row must be only `0`–`9`). Case B is about how a *space* is resolved during spelling (it must land on a dedicated invisible rest position instead of leaving the planchette on the previous glyph).

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X is either a Rendered_Board OR a spelling step { character, resolveTarget }
  OUTPUT: boolean

  // Case A — a glyph in the visible digit row has no character.
  IF X is a Rendered_Board THEN
    RETURN EXISTS glyph IN X.digitRow WHERE isEmpty(glyph.character)
           OR X.digitRow != ["0","1","2","3","4","5","6","7","8","9"]
  END IF

  // Case B — spelling a space has no dedicated resting target.
  IF X is a spelling step THEN
    RETURN X.character = " " AND resolveTarget(" ") has no dedicated position
  END IF

  RETURN false
END FUNCTION
```

The desired behavior for a C input (the **Property**) is specified in pseudocode as:

```
FUNCTION expectedBehavior(result)
  INPUT: result of F'(X)
  OUTPUT: boolean

  // Case A — digit row is exactly 0..9, no empty glyph, no overlap.
  IF result is a Rendered_Board THEN
    RETURN result.digitRow = ["0","1","2","3","4","5","6","7","8","9"]
           AND NOT EXISTS glyph IN result.digitRow WHERE isEmpty(glyph.character)
           AND noGlyphOverlapsAnother(result)
  END IF

  // Case B — a space resolves to a defined, invisible rest position and still pauses.
  IF result is a spelling step THEN
    RETURN result.restPosition is defined
           AND restPosition is near the arc center, below the letters
           AND result.rendersVisibleGlyph = false
           AND result.pausesOnSpace = true
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **Rendered board (Case A, expected)**: Loading `/` renders `.digit-row` with ten buttons `0 1 2 3 4 5 6 7 8 9`, each centered on the straight row at `y = DIGIT_ROW_Y`, evenly spaced from `DIGIT_ROW_X_START` to `DIGIT_ROW_X_END`, with no extra empty circle between `4` and `5`.
- **"OLDEST ALPHA" (Case B, defect → fix)**: Spelling reaches the space after `OLDEST`. Before the fix: planchette stays on `T`. After the fix: planchette glides to the invisible space rest point near the arc center, holds the normal per-character pause, then continues to `A L P H A`.
- **"3 SPIRITS" (Case B, defect → fix)**: After `3`, the space routes the planchette to the space rest point (pause), then `S P I R I T S` is spelled. The reply strip still shows `3 SPIRITS` with its space.
- **Edge case — "A SPIRIT" fallback answer**: An answer whose only separator is a single internal space spells the same way; the trailing/leading spaces are already trimmed by `sanitizeToAnswer`, so only internal spaces ever reach the loop.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Spelling of arc-only answers (A–Z and 0–9, no space) moves the planchette onto each character's glyph exactly as before, with the same geometry and pacing (Req 3.1).
- Activating a letter, digit, or YES/NO/GOODBYE marker behaves exactly as before — append character, apply marker, or clear the spelled name — with **no** new selectable space character in `ARC_CHARS` (Req 3.2).
- At any supported viewport width, every letter and digit glyph still aligns with the planchette target geometry via `scaledArcPosition` using real `clientWidth`/`clientHeight` (Req 3.3).
- The `/summon` and `/banish` endpoints and their request/response contracts in `main.py` are unchanged (Req 3.4).
- All existing Node property tests and Python tests still pass; a test changes only if it asserts the old character-less space-glyph position (Req 3.5).
- The Reduced_Motion path still shows the full oracle answer instantly with no planchette glide (Req 3.6).

**Scope:**
All inputs that do NOT trigger the bug condition are completely unaffected by this fix. This includes:
- Every arc character (A–Z, 0–9) during spelling — same target index, same move, same pause.
- All glyph activations and marker clicks (YES/NO/GOODBYE).
- The responsive layout/alignment of letters and digits.
- The `/summon` and `/banish` server contracts.
- The Reduced_Motion instant-answer path.

**Note:** The expected correct behavior for C inputs (digit row equals `0`–`9`; a space resolves to an invisible rest position and still pauses) is defined in the Correctness Properties section (Property 1). This section lists what must NOT change.

## Hypothesized Root Cause

Based on the bug description and the verified source, the likely causes are:

1. **No dedicated space target in the geometry core (primary, Case B)**: `ARC_CHARS` is 36 chars with no space, so `charIndex(" ") === -1`. `movePlanchetteTo(index)` returns early when `index < 0 || index >= ARC_CHARS.length`, and the oracle loop only calls `movePlanchette(idx)` when `idx >= 0`. A space therefore has no resting position; the planchette is left on the previous glyph during the pause. There is no `spacePosition`/rest point in `geom` to target.

2. **Perceived "empty circle" in the digit row (Case A)**: The committed markup renders exactly `0`–`9` (10 buttons, `data-index` 26..35). No space button exists. The empty circle the user saw is a rendering/layout artifact (e.g., a stray styled element or a mismatch observed during an earlier state), not a 37th glyph in the template. The fix must *lock in* the "digits 0–9 only" invariant and detect any regression that would reintroduce an empty glyph, extra glyph, or overlap.

3. **Overlap risk if a space glyph were ever added to the row**: Were a space erroneously inserted into `ARC_CHARS` or the digit row markup, it would consume a row slot, shift digits, and could crowd/overlap neighbors. Keeping the space out of `ARC_CHARS` and the digit row is what preserves the even spacing.

4. **Reply-strip spacing (secondary)**: The oracle already lays out one `reply-char` span per character including the space, so the answer text reads correctly; the fix must keep revealing the space's span so the pause reads as a visible gap, not a skipped character.

## Correctness Properties

Property 1: Bug Condition - Digit row is 0-9 only and a space rests at an invisible position

_For any_ input where the bug condition holds (isBugCondition returns true), the fixed behavior SHALL satisfy expectedBehavior: a Rendered_Board SHALL expose a digit row equal to exactly `["0".."9"]` with no empty/character-less glyph and no glyph overlapping another; and a spelling step for a space `" "` SHALL resolve to a defined rest position near the arc center below the letters, render no visible glyph, and still hold the normal per-character pause.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Non-buggy inputs are unchanged

_For any_ input where the bug condition does NOT hold (isBugCondition returns false), the fixed behavior SHALL produce the same result as the original behavior, preserving spelling of arc-only answers (same target index, geometry, and pacing), all glyph/marker activations with no new selectable space character in `ARC_CHARS`, responsive glyph↔planchette alignment, the Reduced_Motion instant-answer path, and the unchanged `/summon` and `/banish` contracts.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, the fix is confined to the client and preserves the two-layer (pure core / DOM adapter) UMD shape. **No change to `main.py`, `/summon`, or `/banish`.**

**File**: `static/board.js` (pure core)

1. **Add space rest constants to `geom`** (still `Object.freeze`): `SPACE_REST_X: 350` (= `ARC_CENTER_X`, horizontal center) and `SPACE_REST_Y` set just below the letter band near the row (e.g. `ARC_CENTER_Y`/`DIGIT_ROW_Y` region), so the point is "near the arc center, below the letters". These are pure numbers; `geom` stays frozen and shared.
2. **Add pure helper `spacePosition(width, height, g)`**: mirrors `scaledArcPosition` — projects `{ SPACE_REST_X, SPACE_REST_Y }` from the STAGE_W×STAGE_H model into the real box: `x = (SPACE_REST_X / STAGE_W) * w`, `y = (SPACE_REST_Y / STAGE_H) * h`, with the same finite/positive guards (fallback to STAGE_W/STAGE_H). Total, Node-safe, never throws, never touches DOM.
3. **Do NOT modify `ARC_CHARS`, `charIndex`, `lastArcChar`, `arcPosition`, or `scaledArcPosition`.** The selectable set and all existing geometry stay byte-for-byte equivalent (preserves Req 3.2, 3.3, 3.5). `charIndex(" ")` remains `-1`.
4. **Export `spacePosition`** (and the new constants via `geom`) alongside existing exports; rename/remove nothing.

**File**: `static/board.js` (DOM adapter `createBoard`)

5. **Add `movePlanchetteToSpaceRest()`** on the returned controller: compute `spacePosition(root.clientWidth, root.clientHeight)`, then move the planchette to that real-box point (subtracting the planchette half-size, same math as `movePlanchetteToElement`, and honoring `reduceMotion` for the transition). It targets a computed point, not a DOM element, so **no** `button[data-char]` is queried and **no** element is created. DOM-guarded so Node `require` is side-effect free. Notify `onPlanchetteMove` subscribers as the element path does (so the mascot eyes still follow).
6. **Expose `movePlanchetteToSpaceRest` in the returned controller object** (additive; existing methods unchanged).

**File**: `static/oracle.js` (DOM adapter spelling loop)

7. **Route a space to the space rest** inside `spell()`: for each char, if `ch === " "` call `controller.movePlanchetteToSpaceRest()` (guarded like `movePlanchette`) instead of doing nothing; otherwise keep the existing `idx = charIndexOf(ch)` / `movePlanchette(idx)` path unchanged. In all cases still `revealChar(replySpans[i])` and still `await delay(stepDelay)` — the short pause on the space is preserved.
8. **Keep the Reduced_Motion path (`showStripInstant`) unchanged** — no glide for any character, including spaces (preserves Req 3.6).
9. **Degrade gracefully**: if the controller lacks `movePlanchetteToSpaceRest` (older controller), fall back to the current "no move" behavior for a space while still pausing and revealing the span — never throw (consistent with Req 6.5 of the oracle feature).

**File**: `templates/index.html`

10. **No markup change to add a space button.** The digit row stays exactly `0`–`9`. (If any stray/empty glyph element is found in the digit row during implementation, remove it so the row is exactly ten digit buttons — but the current template already emits only `0`–`9`.) No visible glyph, button, or circle is added for the space rest point (preserves Req 2.5).

## Testing Strategy

### Validation Approach

Two phases: first surface counterexamples that demonstrate the bug on unfixed code (a space leaves the planchette on the previous glyph; any empty/extra glyph in the digit row), then verify the fix works and preserves existing behavior. Property-based tests run under Node (`node:test` + fast-check) over the pure core; DOM-adapter behavior is covered by targeted unit/integration checks.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and confirm or refute the root cause. If refuted, re-hypothesize.

**Test Plan**: (a) Assert the rendered digit row is exactly `0`–`9` with no empty glyph. (b) Simulate the oracle spelling loop over an answer containing a space and assert a dedicated space rest move occurs. Run against UNFIXED code to observe failures.

**Test Cases**:
1. **Digit-row-only test**: Parse the digit row and assert its characters equal `["0".."9"]` and no glyph has empty text (passes on current markup; fails if an empty/extra glyph is reintroduced).
2. **Space-has-no-target test (pure)**: Assert that today `charIndex(" ") === -1` and there is no `spacePosition` helper — i.e., a space has no dedicated position (fails to resolve a rest point on unfixed code).
3. **Spelling-a-space test (adapter)**: Drive the spelling loop with "OLDEST ALPHA" using a fake controller recording moves; on unfixed code assert that the space produces **no** move call (demonstrates the planchette stays put).
4. **Edge case — overlap test**: Assert no two digit-row glyph centers coincide and digits stay within the row span (guards against a space glyph crowding the row).

**Expected Counterexamples**:
- A space during spelling triggers no planchette move (stays on previous glyph).
- Possible causes: space not in `ARC_CHARS`, `charIndex(" ") === -1`, `movePlanchetteTo(-1)` early return, oracle loop skips move when `idx < 0`.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed behavior produces the expected behavior.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := F'(X)
  ASSERT expectedBehavior(result)
END FOR
```

Concretely: for a Rendered_Board, `digitRow == ["0".."9"]`, no empty glyph, no overlap; for a space spelling step, `spacePosition(w, h)` returns a finite point near the horizontal center below the letters, the adapter calls `movePlanchetteToSpaceRest()` (no `button[data-char]` queried, no element created), and the loop still awaits `stepDelay`.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed behavior equals the original behavior.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

**Testing Approach**: Property-based testing is recommended because it generates many inputs across the domain, catches edge cases, and gives strong guarantees that non-buggy behavior is unchanged.

**Test Plan**: Observe behavior on UNFIXED code for arc-only answers, glyph/marker activation, responsive alignment, and Reduced_Motion, then assert the fixed code matches.

**Test Cases**:
1. **Arc-char spelling preservation**: For every arc char, `charIndex` and the resulting move target are identical before and after (same index, same `arcPosition`/`scaledArcPosition`).
2. **No new selectable space**: Assert `ARC_CHARS` is unchanged (length 36, no space) and `charIndex(" ") === -1` still holds, so letter/digit controls gain no space character (Req 3.2).
3. **Responsive alignment preservation**: For random `(index, width, height)`, `scaledArcPosition` returns the same values as before (unchanged function) so glyph↔planchette alignment is preserved (Req 3.3).
4. **Reduced_Motion preservation**: With `reduceMotion: true`, the oracle shows the full answer instantly and performs no glide for any character including spaces (Req 3.6).
5. **Server contract preservation**: `/summon` and `/banish` Python tests pass unchanged (Req 3.4).

### Unit Tests

- `spacePosition(w, h)` returns a finite point with `x ≈ w/2` (center) and `y` below the letter band; falls back to STAGE dimensions for non-finite/non-positive inputs.
- `movePlanchetteToSpaceRest()` sets a `translate(...)` transform and queries no `button[data-char]` (verified with a fake root recording `querySelector` calls — expect none for the space path).
- Digit row contains exactly ten buttons with characters `0`–`9` and no empty glyph.
- `ARC_CHARS` and `charIndex` are unchanged; `charIndex(" ") === -1`.

### Property-Based Tests

- Generate indices 0..35 and assert `arcPosition`/`scaledArcPosition` outputs are identical to pre-fix (preservation of geometry). The existing `tests/board.geom.prop.test.js` Property 3 (`digit.y === DIGIT_ROW_Y`, `letter.y <= DIGIT_ROW_Y`) MUST keep passing because the space rest point is **not** an arc index and does not alter `arcPosition`.
- Generate random answers mixing arc chars and single internal spaces; assert every arc char maps to a move and every space maps to exactly one `movePlanchetteToSpaceRest()` with a pause, and the revealed reply text equals the answer.
- Generate random `(width, height)` and assert `spacePosition` stays finite and horizontally centered.

### Integration Tests

- Full spelling of "OLDEST ALPHA" and "3 SPIRITS": the planchette visits each arc glyph, rests at the invisible space point during the space (no visible glyph rendered), and the reply strip shows the full answer including the space.
- Context/responsive: resize the board and confirm arc/digit glyphs and the space rest point stay aligned with the planchette target.
- Reduced_Motion: the full answer appears instantly with no glide.
- `/summon` and `/banish` end-to-end behavior is unchanged.

### Existing Tests — Relevance and Updates

- `tests/board.geom.prop.test.js` — relevant; asserts digit `y === DIGIT_ROW_Y` and `letter.y <= DIGIT_ROW_Y` for indices 0..35. **No update needed**: the space rest point is not an arc index and `arcPosition` is unchanged.
- `tests/board.prop.test.js` — relevant; asserts `charIndex` exact on-arc and `-1` off-arc (including `" "`). **No update needed**: `ARC_CHARS`/`charIndex` are unchanged, so `charIndex(" ") === -1` still holds.
- `tests/board.rect.prop.test.js` — relevant to `elementCenterInContainer`/rect math (marker fix). **No update needed**: the space path reuses the same center math but is additive.
- `tests/oracle.prop.test.js` — relevant; covers `oracleAnswer` purity and charset (answers may contain a single internal space). **No update needed** unless a test asserts the old "space produces no move" adapter behavior; if so, it is the single allowed update (Req 3.5) to assert the new space-rest move.
- Other `tests/*.prop.test.js` (age, banish, ghost, hue, board.geom) and the Python tests — not affected; must keep passing (Req 3.5).
