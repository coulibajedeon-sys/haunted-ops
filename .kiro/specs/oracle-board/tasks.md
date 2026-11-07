# Implementation Plan: Oracle Board

## Overview

This feature is additive. Three files change — `static/board.js` (new pure core only: `oracleAnswer` and helpers, appended to the existing public export; the Spelled_Name core, `geom`, and `createBoard` stay untouched), `templates/index.html` (new question buttons + `aria-live` answer region + CSS + inline glue), and one NEW file `static/oracle.js` (the DOM adapter) — plus one NEW test file `tests/oracle.prop.test.js`. `main.py` and every existing test file stay unmodified. Tasks are ordered so the pure, testable logic lands first (and is proven green), then the DOM adapter, then the template wiring, then verification. The user runs `uvicorn main:app --reload` and eyeballs the browser at each checkpoint, and runs `npm test` / `pytest` to confirm the suites stay green.

## Tasks

- [x] 1. Add the pure `oracleAnswer` core to `static/board.js`
  - [x] 1.1 Add answer constants and the sanitizer
    - In a new pure-core section of `board.js` (no DOM, no network), add `ANSWER_MAX = 24`, `ANSWER_CHARSET` (A–Z, 0–9, space), and `QUESTIONS` mapping the four Question_Ids (`which-first`, `oldest`, `count`, `quiet`) to their English labels
    - Add `sanitizeToAnswer(title)`: uppercase, replace every run of non-`[A-Z0-9]` with a single space, trim and collapse spaces, truncate to `ANSWER_MAX` (trimming a trailing space left by truncation), and return the non-empty fallback `"A SPIRIT"` when nothing in-charset remains
    - Keep every function pure and total (never throws, never mutates its argument)
    - _Requirements: 2.2, 2.3, 2.4, 3.5, 3.6, 10.1_

  - [x] 1.2 Add `oldestTask`, `makeRng`, and `oracleAnswer`
    - Add `oldestTask(list)`: when every task has a non-empty `created_at`, return the one with the lexicographically smallest `created_at` (ties keep the smaller `id` as older); otherwise return the last element (oldest by the server's `id`-DESC order)
    - Add `makeRng(seed)`: a small deterministic PRNG (e.g. Mulberry32) returning `() => number in [0,1)`, used only when a caller passes a seed
    - Add `oracleAnswer(tasks, questionId, now, rng)`: normalize a non-array `tasks` to empty; return `"GOODBYE"` for an empty list; else `quiet`→`"NO"`, `count`→`String(list.length)`, `which-first`→`sanitizeToAnswer(list[0].title)`, `oldest`→`sanitizeToAnswer(oldestTask(list).title)`, unknown id→`which-first` rule; cap the result at `ANSWER_MAX`; never call `Math.random` (randomness only via the optional seeded `rng`)
    - Export `oracleAnswer`, `sanitizeToAnswer`, `oldestTask`, `makeRng`, `ANSWER_MAX`, `ANSWER_CHARSET`, `QUESTIONS` on the existing public object; do NOT change any existing export name or the Spelled_Name core, `geom`, or `createBoard`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 8.3, 8.4, 10.2_

  - [x] 1.3 Write the NEW property test suite for the pure core
    - Create `tests/oracle.prop.test.js` using `node:test` + `fast-check`, `require("../static/board.js")`, `numRuns: 200`; never edit an existing test file
    - **Property 1: Charset** — every character of `oracleAnswer(tasks, q, now)` is in A–Z / 0–9 / space. **Validates: 9.2**
    - **Property 2: Length** — `oracleAnswer(...).length <= 24`. **Validates: 9.3**
    - **Property 3: Empty list** — `tasks = []` yields exactly `"GOODBYE"` for every known and unknown question id. **Validates: 9.4**
    - **Property 4: Determinism** — equal arguments produce identical answers across repeated calls. **Validates: 9.5**
    - **Property 5: Per-rule concrete checks** — `count` = decimal count; `quiet` = `YES`/`NO`; `which-first` derives from `list[0]`; `oldest` picks smallest `created_at` and falls back to the last element when timestamps are missing; punctuation-only title → `"A SPIRIT"`. **Validates: 3.1, 3.2, 3.3, 3.4, 3.6**
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 1.4 Checkpoint — run the JS suite
    - Run `npm test`; confirm the new `oracle.prop.test.js` passes and every existing JS property suite still passes unmodified (the known-flaky `tests/board.rect.prop.test.js` is pre-existing and unrelated)
    - _Requirements: 8.4, 9.1_

- [x] 2. Build the DOM adapter `static/oracle.js`
  - [x] 2.1 Create the UMD skeleton and helpers
    - Create `static/oracle.js` as a UMD module in the same style as `static/age.js` (`"use strict"`, `window.Oracle` in the browser, `module.exports` under Node), with all DOM access guarded by `typeof document !== "undefined"`
    - Add a local `prefersReducedMotion()` helper (matchMedia `(prefers-reduced-motion: reduce)`, safe fallback `false`) and a `delay(ms)` helper
    - Add a default `readTasks()` that maps `main ul li` rows to `{ id: Number(dataset.id), title: .spirit-name textContent, created_at: dataset.created || "" }`, preserving DOM order; read-only, never mutating the board or input
    - _Requirements: 4.5, 7.4, 10.1, 10.2_

  - [x] 2.2 Implement `createOracle(options)` and the `ask` flow
    - Resolve `buttons`, `input`, `answerRegion`, `controller` (`window.__boardController`), `mascot` (`window.__ghostMascot`), `getTasks`, `reduceMotion`, and `stepDelay` (~380 ms) from options or the DOM
    - `ask(questionId)`: ignore if already spelling (re-entrancy guard); compute `answer = window.Board.oracleAnswer(getTasks(), questionId, Date.now())`; write `answer` into `answerRegion` immediately
    - Reduced-motion path: do not move the planchette; leave controls unchanged; return (answer already shown)
    - Full-motion path: capture prior `disabled` state of input + each button, then disable all buttons and the input; set mascot `curious`; walk the answer left-to-right, for each in-arc char call `controller.movePlanchetteTo(Board.charIndex(ch))` and wait `stepDelay`, for a space/non-arc char leave the planchette and still wait `stepDelay`; after the last char set mascot `happy`; restore each control to its captured prior state and clear the spelling flag
    - Guard every `controller`/`mascot` call so a missing controller or mascot degrades gracefully (answer still written, no throw)
    - Return `{ ask, isSpelling }`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 10.4_

- [x] 3. Wire the oracle into `templates/index.html`
  - [x] 3.1 Add the question buttons and the aria-live answer region
    - Add an `.oracle` block below the `.ouija` board (full-width, clear of the arc/markers/planchette) containing four `button type="button" data-question="..."` controls with the exact English labels "Which first?", "What is oldest?", "How many spirits?", "Is it quiet?" (ids `which-first`, `oldest`, `count`, `quiet`)
    - Add `<p id="oracle-answer" role="status" aria-live="polite">` for the spoken answer
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 10.3_

  - [x] 3.2 Add CSS for the oracle panel
    - Style `.oracle-questions` as a centered, wrapping flex row and `.oracle-answer` with an engraved look and a reserved min-height (no layout shift); reuse existing theme variables (`--glow`, `--spirit`, `--text`) and the existing global `button:focus-visible` gold focus ring
    - Add no animation that the existing global `@media (prefers-reduced-motion: reduce)` rule does not already neutralize; no external assets
    - _Requirements: 1.2, 1.4, 10.1, 10.2_

  - [x] 3.3 Add the inline glue script after the mascot glue
    - Load `static/oracle.js` and add an inline IIFE (same pattern as the board/mascot glue) that, once the DOM is ready, resolves the buttons, answer region, input, `window.__boardController`, and `window.__ghostMascot`, calls `window.Oracle.createOracle(...)`, and binds each button's click to `oracle.ask(data-question)`
    - Degrade gracefully: if `window.Oracle` or `createOracle` is missing, do nothing; keep the rest of the page working
    - _Requirements: 1.5, 6.5, 8.3_

- [x] 4. Checkpoint — verify in the browser and run all suites
  - [x] 4.1 Manual verification in the browser
    - Confirm four focusable question buttons (gold focus ring) and an answer line appear below the board without overlapping the arc/markers/planchette
    - Click each question: the planchette glides letter by letter pausing on each glyph, the answer text appears, the mascot turns curious then happy, and the buttons + input are disabled during spelling and re-enabled after
    - Empty list: every question shows/spells `GOODBYE`
    - Enable OS "reduce motion": the answer appears instantly, no gliding, controls unchanged
    - _Requirements: 1.1, 1.2, 1.4, 4.1, 4.4, 5.1, 5.2, 5.3, 6.2, 6.3, 6.4, 7.1, 7.2_

  - [x] 4.2 Run the full test suites and confirm green
    - Run `npm test` and `pytest`; confirm the new oracle suite passes and no existing JS or Python test file was modified or newly failing (excluding the pre-existing flaky `tests/board.rect.prop.test.js`)
    - Confirm `main.py` and the `/summon` and `/banish` contracts are unchanged
    - _Requirements: 8.1, 8.2, 8.4, 8.5_
