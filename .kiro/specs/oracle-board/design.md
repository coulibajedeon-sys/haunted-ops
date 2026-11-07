# Design Document

## Overview

The Oracle Board adds a "the spirits answer you" mode on top of the existing Ouija board. It is an additive layer: a new pure function in `static/board.js` (`oracleAnswer`), a new small DOM adapter (`static/oracle.js`) that drives the self-spelling animation, four preset question buttons plus an `aria-live` answer region in `templates/index.html`, and a new property-test file under `tests/`. The server (`main.py`) and the `/summon` and `/banish` contracts are untouched, and every existing test keeps passing unmodified.

The feature reuses what already exists rather than reinventing it:

- **Planchette movement** is done through the Board_Controller returned by `window.Board.createBoard(...)`, which the page already creates and exposes as `window.__boardController`. That controller exposes `movePlanchetteTo(index)` and `movePlanchetteToElement(el)`. Moving to a character means resolving the `button[data-char="X"]` glyph and calling the controller — exactly how the controller already positions the planchette during composition, using `getBoundingClientRect` relative to the `.ouija` container. The Oracle_Board does **not** duplicate any geometry.
- **Mascot reactions** go through the mascot controller already exposed as `window.__ghostMascot`, whose `setExpression("curious")` / `setExpression("happy")` (and `celebrateEmpty`) are part of its public API.
- **Reduced motion** is detected with the same `prefers-reduced-motion: reduce` media query the board already consults (mirrored in a tiny local helper so `oracle.js` has no hard dependency on a board-internal function).

### Layering (same two-layer pattern as board.js / ghost.js / age.js)

1. **Pure core** — `oracleAnswer(tasks, questionId, now, rng?)` plus small pure helpers (`sanitizeToAnswer`, `oldestTask`, a seeded `makeRng`). No DOM, no network, no mutation. Exported on the `Board` API object so it is `require()`-able under Node and covered by property tests.
2. **DOM adapter** — `static/oracle.js`, a UMD module in the same style as the others. It wires the four question buttons, runs the self-spelling animation by calling the existing Board_Controller, writes the answer text into the `aria-live` region, toggles the mascot expression, disables/re-enables controls, and honors reduced motion. All DOM access is guarded by `typeof document !== "undefined"` so the module loads cleanly under Node.

## Architecture

```
templates/index.html
  ├── (existing) .ouija  → window.Board.createBoard → window.__boardController
  ├── (existing) #mascot → window.Ghost.createMascot → window.__ghostMascot
  ├── (new) .oracle  → 4 Question_Buttons [data-question] + #oracle-answer[aria-live=polite]
  └── (new) <script src="/static/oracle.js"> + inline glue
                │
                ▼
static/oracle.js  (DOM adapter)
  - reads oracleAnswer() from window.Board            (pure answer)
  - calls window.__boardController.movePlanchetteTo*  (reuse planchette geometry)
  - calls window.__ghostMascot.setExpression(...)     (reuse mascot)
  - writes #oracle-answer text, disables/enables controls, reduced-motion guard
                │
                ▼
static/board.js  (pure core, extended)
  - oracleAnswer(tasks, questionId, now, rng?)  ← NEW, exported
  - sanitizeToAnswer / oldestTask / makeRng     ← NEW pure helpers, exported
  - (unchanged) Spelled_Name core, geom, createBoard, movePlanchetteTo*
                │
                ▼
tests/oracle.prop.test.js  (node:test + fast-check, require("../static/board.js"))
```

Script order in the template becomes: `board.js` → board glue → `ghost.js` → mascot glue → `age.js` → age glue → `banish.js`, with **`oracle.js` + its glue inserted after the mascot glue** (so both `window.__boardController` and `window.__ghostMascot` already exist). The glue tolerates either controller being absent (graceful degradation).

## Pure Core: `oracleAnswer`

### Constants

- `ANSWER_MAX = 24` (Answer_Length_Limit).
- `ANSWER_CHARSET` = `A–Z`, `0–9`, space. Matches the board's `ARC_CHARS` (A–Z0–9) plus space; spaces are allowed in the answer text but have no glyph, so the animation simply skips them (Req 4.3).
- `QUESTIONS` — the stable Question_Id ↔ label mapping, so the template and the function agree:
  - `which-first` → "Which first?"
  - `oldest` → "What is oldest?"
  - `count` → "How many spirits?"
  - `quiet` → "Is it quiet?"

### Signature and totality

```js
oracleAnswer(tasks, questionId, now, rng)
```

- `tasks`: array of `{ id, title, created_at }` as rendered by the server (`list_spirits`, ordered by `id` DESC). The function treats a non-array or missing value as empty.
- `questionId`: one of the `QUESTIONS` ids; anything unrecognized falls through to a safe default.
- `now`: a reference time (ms or ISO); accepted for signature stability and future rules. Current rules do not branch on wall-clock time, which keeps determinism trivial (Req 2.6); `created_at` ordering uses the task timestamps, not `now`.
- `rng`: optional `() => number in [0,1)`. Omitted in production. The only randomness permitted (Req 2.7) is a caller-supplied seeded generator; the function itself never calls `Math.random`.

The function is **total**: for any input it returns a string within `ANSWER_CHARSET` and `≤ ANSWER_MAX`, never throwing (Req 2.3, 2.4, 2.8).

### Rules

Let `list` be the normalized task array.

1. **Empty list** (`list.length === 0`): return `"GOODBYE"` for every question (Req 2.5). `"GOODBYE"` is within the charset and 7 chars.
2. **`quiet`** ("Is it quiet?"): `list.length === 0 ? "YES" : "NO"` (Req 3.4). Empty is already handled by rule 1, so in practice this returns `"NO"` once there are tasks.
3. **`count`** ("How many spirits?"): `String(list.length)` — decimal digits only (Req 3.3). Capped at `ANSWER_MAX` defensively (a 24-digit count is not reachable in practice).
4. **`which-first`** ("Which first?"): `sanitizeToAnswer(list[0].title)` — the first task in server order (Req 3.1).
5. **`oldest`** ("What is oldest?"): `sanitizeToAnswer(oldestTask(list).title)` (Req 3.2).
6. **Unknown `questionId`**: treat as `which-first` on a non-empty list (safe, in-charset), so the function stays total (Req 2.8).

### `sanitizeToAnswer(title)` (Req 3.5, 3.6)

Pure. Reduces an arbitrary user string to the Answer_Charset:

1. Uppercase with `String(title).toUpperCase()`.
2. Replace every run of characters **not** in `[A-Z0-9]` with a single space (so punctuation and accents become separators rather than garbage).
3. Trim leading/trailing spaces and collapse internal runs of spaces to one.
4. Truncate to `ANSWER_MAX`, then trim a trailing space left by truncation.
5. If the result is empty (the title had no A–Z/0–9 after folding), return a non-empty in-charset fallback `"A SPIRIT"` (Req 3.6).

Accented letters are mapped to space by step 2 rather than transliterated; this keeps the function simple and strictly within the charset. (A future enhancement could add an ASCII-fold table, but it is out of scope and not required.)

### `oldestTask(list)` (Req 3.2)

Pure. "Oldest" = smallest `created_at` when timestamps are usable; otherwise falls back to server order. The server renders newest-first (`ORDER BY id DESC`), so the **last** element is the oldest by insertion order, and that is the fallback:

1. If every task has a non-empty `created_at`, pick the one with the lexicographically smallest `created_at`. SQLite `datetime('now')` text (`"YYYY-MM-DD HH:MM:SS"`) sorts chronologically as plain strings, so a string comparison is correct without parsing. Ties (equal timestamps) resolve to the larger `id` being newer, i.e. keep the one with the smaller `id` as older.
2. Otherwise (any `created_at` missing/empty — the migrated-NULL case from `main.py`), return `list[list.length - 1]` (oldest by `id`-DESC render order).

### `makeRng(seed)` (optional, Req 2.7)

A tiny deterministic PRNG (e.g. Mulberry32) exported for tests and for any future seeded rule. Production calls omit `rng`, so the default path uses no randomness at all, making Req 2.6 (determinism) hold unconditionally for the shipped rules.

### Export surface

`board.js` already returns a frozen-ish public object. Add:

```js
oracleAnswer, sanitizeToAnswer, oldestTask, makeRng,
ANSWER_MAX, ANSWER_CHARSET, QUESTIONS
```

No existing export changes, so every current test keeps importing the same names (Req 8.4).

## DOM Adapter: `static/oracle.js`

UMD module, same wrapper as `age.js`/`ghost.js`. Exposes `window.Oracle` with `createOracle(options)` and (for symmetry/testing) re-exports nothing behavior-bearing beyond what `board.js` already owns — the pure logic stays in `board.js`.

### `createOracle(options)`

Options (all optional; resolved from the DOM when omitted):

- `buttons`: the `NodeList`/array of `button[data-question]` controls.
- `input`: the Fallback_Input (`input[name="title"]`).
- `answerRegion`: the `#oracle-answer` element.
- `controller`: the Board_Controller (`window.__boardController`).
- `mascot`: the mascot controller (`window.__ghostMascot`).
- `getTasks`: a function returning the current Task_List; default reads the rendered `<li data-id data-created>` rows into `{ id, title, created_at }` objects, preserving DOM order (which is server order, newest-first).
- `reduceMotion`: boolean override; default from a local `prefersReducedMotion()` helper identical to the one in `board.js`.
- `stepDelay`: pause per spellable character (default ~380 ms, within the board's existing 420 ms planchette transition envelope so each glide settles before the next starts).

Returns a controller `{ ask(questionId), isSpelling() }`.

### Reading the current Task_List from the DOM

The server re-renders the page after each summon (303 redirect) and `banish.js` removes `<li>` nodes client-side, so the rendered list is always current. `getTasks` maps `main ul li` to:

```js
{ id: Number(li.dataset.id), title: li.querySelector(".spirit-name").textContent, created_at: li.dataset.created || "" }
```

This is read-only and never mutates the board or the Fallback_Input (Req 4.5).

### `ask(questionId)` flow

1. **Re-entrancy guard** (Req 4.6): if `spelling` is already true, ignore the call.
2. Compute `answer = window.Board.oracleAnswer(getTasks(), questionId, Date.now())`.
3. **Write the answer text** into `answerRegion` (Req 6.2). Because the region is `aria-live="polite"`, screen readers announce it. This happens up front so the announcement is immediate in both paths.
4. **Branch on reduced motion:**
   - **Reduced motion (Req 7):** do not move the planchette letter-by-letter; the answer text is already shown (step 3). Leave controls as they were (Req 5.5). Optionally set the mascot to happy once. Return.
   - **Full motion (Req 4, 5, 6):**
     a. Set `spelling = true`; capture the pre-existing `disabled` state of the input and each button, then disable all question buttons and the input (Req 5.1, 5.2). Buttons already disabled stay disabled; the input's prior state is remembered so a db-error-disabled input is not wrongly re-enabled (Req 5.4).
     b. Mascot → `setExpression("curious")` (Req 6.3), guarded if the mascot is absent (Req 6.5).
     c. Walk the answer characters left to right. For each character:
        - If it is in `ARC_CHARS` (A–Z, 0–9), call `controller.movePlanchetteTo(Board.charIndex(ch))` (or `movePlanchetteToElement` of the resolved `button[data-char]`), which glides the planchette using the existing geometry (Req 4.2). Wait `stepDelay` so it pauses on the glyph (Req 4.1).
        - If it is a space or otherwise not on the arc, leave the planchette where it is and still wait `stepDelay` (Req 4.3), so the pacing reads naturally.
     d. After the last character, the planchette rests on the last spellable glyph (Req 4.4).
     e. Mascot → `setExpression("happy")` (Req 6.4), guarded.
     f. Restore controls to their captured prior state and set `spelling = false` (Req 5.3, 5.4).
5. The whole full-motion walk is driven by chained `setTimeout` (or an `async` loop awaiting a `delay`), scheduled on the client only; nothing touches the server.

### Disable/restore bookkeeping (Req 5)

Before disabling, record `wasDisabled` per control. On finish, set `disabled = wasDisabled` for each — so a control disabled for another reason (db error) stays disabled (Req 5.4), and a normally-enabled control returns to enabled (Req 5.3). This is symmetric and idempotent.

### Mascot integration

`window.__ghostMascot.setExpression` accepts `"curious"` and `"happy"` (both in `Ghost.EXPRESSIONS`). The glue calls them only if `mascot && typeof mascot.setExpression === "function"`; otherwise the answer still appears in the region and the flow completes (Req 6.5).

## Template Changes (`templates/index.html`)

Add, after the `.ouija` block and before (or beside) the Fallback_Input row, a non-form-submitting oracle panel inside the existing `form.summon` (buttons are `type="button"` so they never submit, Req 1.3) — or as a sibling block below the form. Placing it as a full-width flex item below the board keeps it clear of the arc/markers/planchette (Req 1.2):

```html
<div class="oracle" role="group" aria-label="Ask the spirits">
  <div class="oracle-questions">
    <button type="button" class="oracle-q" data-question="which-first">Which first?</button>
    <button type="button" class="oracle-q" data-question="oldest">What is oldest?</button>
    <button type="button" class="oracle-q" data-question="count">How many spirits?</button>
    <button type="button" class="oracle-q" data-question="quiet">Is it quiet?</button>
  </div>
  <p id="oracle-answer" class="oracle-answer" role="status" aria-live="polite"></p>
</div>
```

The `data-question` values are the Question_Ids (Req 2.1); labels are the exact English strings (Req 1.1). `aria-live="polite"` + `role="status"` mirrors the existing `#mascot-bubble` pattern already in the page (Req 6.1).

### CSS (presentation only)

Reuse the existing theme variables (`--glow`, `--spirit`, `--text`) and the existing focus-visible rule (already global for `button:focus-visible`), so question buttons get the gold focus ring for free (Req 1.4). Style `.oracle-questions` as a centered wrapping flex row and give `.oracle-answer` an engraved look with a reserved min-height so its appearance does not shift layout. No animation is strictly required on these elements; the global `@media (prefers-reduced-motion: reduce)` rule already neutralizes any transition. No external assets (Req 10.1, 10.2).

### Script wiring (inline glue, after the mascot glue)

```html
<script src="/static/oracle.js"></script>
<script>
  (function () {
    "use strict";
    if (!window.Oracle || typeof window.Oracle.createOracle !== "function") return;
    function wire() {
      var buttons = document.querySelectorAll("button[data-question]");
      var region = document.getElementById("oracle-answer");
      if (!buttons.length || !region) return;
      var oracle = window.Oracle.createOracle({
        buttons: buttons,
        answerRegion: region,
        input: document.querySelector('input[name="title"]'),
        controller: window.__boardController,
        mascot: window.__ghostMascot
      });
      Array.prototype.forEach.call(buttons, function (b) {
        b.addEventListener("click", function () { oracle.ask(b.getAttribute("data-question")); });
      });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
    else wire();
  })();
</script>
```

Graceful degradation (Req 6.5, 8.3): if `oracle.js` or the board/mascot controllers are missing, the page still works as before and the question buttons simply do nothing harmful.

## Components and Interfaces

| Component | Location | Responsibility | Key interface |
| --- | --- | --- | --- |
| `oracleAnswer` + helpers | `static/board.js` (pure core) | Compute the answer deterministically | `oracleAnswer(tasks, questionId, now, rng?) → string` |
| `createOracle` | `static/oracle.js` (DOM adapter) | Wire buttons, spell, announce, react, disable | `createOracle(opts) → { ask, isSpelling }` |
| Question buttons + answer region | `templates/index.html` | Present questions and the spoken answer | `button[data-question]`, `#oracle-answer[aria-live=polite]` |
| Board_Controller (existing) | `static/board.js` | Move the planchette by char/index | `movePlanchetteTo(index)`, `movePlanchetteToElement(el)` |
| Mascot (existing) | `static/ghost.js` | Express curious/happy | `setExpression(expr)` |

## Data Models

**Task (as read from the DOM / as passed to `oracleAnswer`):**

```
{ id: number, title: string, created_at: string }  // created_at may be "" (unknown age)
```

This matches `list_spirits` in `main.py` (`{id, title, created_at}`) and the rendered `<li data-id data-created>` rows. No schema or server data model changes (Req 8.1, 8.2).

**Oracle_Answer:** a string over `A–Z 0–9 space`, length `≤ 24`.

## Error Handling

- **Non-array / malformed `tasks`:** `oracleAnswer` normalizes to an empty list and returns `"GOODBYE"` (Req 2.8, 2.5).
- **Title with no spellable characters:** `sanitizeToAnswer` returns `"A SPIRIT"` (Req 3.6).
- **Missing Board_Controller at spell time:** `oracle.js` still writes the answer text and completes; it simply skips planchette moves (Req 6.5 spirit — the feature degrades rather than throwing).
- **Missing mascot:** expression calls are guarded; the answer still appears (Req 6.5).
- **Unrecognized `questionId`:** falls back to the `which-first` rule, staying in-charset and total (Req 2.8).
- **Re-entrant `ask` during spelling:** ignored by the `spelling` guard (Req 4.6).

## Testing Strategy

### New property suite — `tests/oracle.prop.test.js` (Req 9)

Runner `node:test`, PBT `fast-check`, `require("../static/board.js")`, `numRuns: 200` to match the repo's convention (Req 9.6). Generators build arbitrary task lists (`{ id, title, created_at }` with arbitrary unicode titles, some empty/whitespace, some with/without timestamps) and arbitrary `questionId` (including unknown ids).

Properties:

1. **Charset (Req 9.2):** every character of `oracleAnswer(tasks, q, now)` is in `A–Z 0–9 space`.
2. **Length (Req 9.3):** `oracleAnswer(...).length <= 24`.
3. **Empty list (Req 9.4):** for `tasks = []` and every known question id (and unknown ids), the answer is exactly `"GOODBYE"`.
4. **Determinism (Req 9.5):** two calls with structurally equal arguments return identical strings.
5. **Per-rule concrete checks:** `count` returns the decimal count; `quiet` returns `"YES"`/`"NO"`; `which-first` derives from `list[0]`; `oldest` picks the smallest `created_at` (and falls back to the last element when timestamps are missing); `sanitizeToAnswer` of a punctuation-only title yields the non-empty fallback.
6. **Totality:** never throws for any generated input (covered implicitly by running properties 1–2 over the broad generators).

### Regression (Req 8.4, 8.5)

Run the full JS suite (`npm test`) and the Python suite (`pytest`) after implementation; no existing test file is modified. The known-flaky `tests/board.rect.prop.test.js` is tracked separately and is unrelated to this change.

### Manual verification

- Load the page; confirm four question buttons and an answer line appear below the board, keyboard-focusable with the gold focus ring.
- Click each question: the planchette glides letter by letter, pausing on each glyph; the answer text appears; the mascot turns curious then happy; buttons and input are disabled during spelling and re-enabled after.
- Empty list: every question spells / shows `GOODBYE`.
- With OS "reduce motion" on: the answer text appears instantly, no gliding, controls unchanged.

## Design Decisions

- **Pure logic in `board.js`, not a new pure module:** `board.js` already owns the board's pure core and is already the `require` target for board property tests, so adding `oracleAnswer` there keeps one import for the test and matches the existing layering. The DOM adapter is separated into `oracle.js` to keep `board.js`'s DOM footprint unchanged.
- **Reuse `movePlanchetteTo`, no new geometry:** the controller already converts a char/index to a measured glyph center via `getBoundingClientRect` relative to `.ouija`; the oracle calls it, so there is a single source of truth for planchette positioning (satisfies Req 4.2 and the "reuse existing positioning" constraint).
- **Answer text written before animation:** guarantees the `aria-live` announcement is immediate in both the animated and reduced-motion paths, decoupling accessibility from animation timing (Req 6.2, 7.2).
- **Deterministic by construction:** shipped rules use no randomness and do not branch on `now`, so determinism (Req 2.6) holds without special care; the optional seeded `rng` is provided only to satisfy the "optional seeded randomness" allowance (Req 2.7) and for future rules.
- **No new dependencies/assets:** everything is vanilla JS, inline SVG reuse, and CSS variables already in the page (Req 10.1, 10.2).
