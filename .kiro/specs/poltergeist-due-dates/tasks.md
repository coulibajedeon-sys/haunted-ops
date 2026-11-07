# Implementation Plan: poltergeist-due-dates

## Overview

This plan implements the optional task due date feature and the pure, injectable-time "haunting level" that drives the whole-page reaction. It is strictly incremental and test-driven: the pure cores (`parse_due` in `main.py`, `hauntingLevel`/`moodForLevel` in new JS modules) and their property tests are built first, then the backend persistence and migration, then the `summon()` wiring, and finally the browser DOM adapter, presentation/CSS, and the whole-suite preservation gate.

The design uses concrete languages already fixed by the codebase: **Python** (FastAPI/SQLite in `main.py`) for the backend and **JavaScript** (UMD modules mirroring `static/age.js`) for the client cores. No language selection is required.

Every task is additive. Requests that omit the due field must stay byte-for-byte identical to today, and no existing test file may be edited (R8.1, R8.2).

## Tasks

- [ ] 1. Add the pure `parse_due` due parser to `main.py`
  - Add `def parse_due(raw) -> (ok: bool, normalized: str | None, error: str | None)` as a module-level pure function with no clock/env/I/O access.
  - Strip whitespace first; empty/whitespace-only/`None` -> `(True, None, None)` (no due).
  - Accept `"YYYY-MM-DD"`, `"YYYY-MM-DDTHH:MM"`, `"YYYY-MM-DDTHH:MM:SS"`, and the stored `"YYYY-MM-DD HH:MM:SS"` (space separator) forms.
  - Date-only -> normalize to `"YYYY-MM-DD 23:59:59"` (end of day, deterministic).
  - Date+time -> preserve Y/M/D/H/M/S; append `:00` when seconds omitted, without otherwise altering the time.
  - Validity via constructing `datetime.datetime(...)`/`datetime.date(...)`; catch `ValueError` -> `(False, None, "invalid")`; shape mismatch -> `(False, None, "unparseable")`; the exception never escapes.
  - Store output as SQLite-style `"YYYY-MM-DD HH:MM:SS"` so feeding an output back yields the same output.
  - _Requirements: 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.3, 9.5_

  - [ ]* 1.1 Write property tests for `parse_due` in `tests/test_prop_due.py`
    - Create the file following `tests/test_prop_summon_valid.py` conventions: `pytest` + `hypothesis`, `@settings(max_examples=200, deadline=None)`, `import main`, docstring tag `Feature: poltergeist-due-dates, Property N`.
    - **Property 8: Empty or whitespace due is "no due", never an error** — whitespace-only/empty strings -> `(True, None, None)`.
    - **Property 9: Date-only input normalizes to end of day** — `st.dates()` -> `"YYYY-MM-DD 23:59:59"`.
    - **Property 10: Date-with-time input preserves every component** — `st.datetimes()` -> all components preserved.
    - **Property 11: Invalid due input is rejected with no timestamp** — malformed shapes and impossible calendar values -> `ok=False`, `normalized=None`.
    - **Property 12: Due normalization round-trips and is clock-independent** — `parse_due(normalized) == normalized`; results unchanged when `datetime.now`/`date.today` are monkeypatched (proves no clock read).
    - **Validates: Requirements 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.5**

- [ ] 2. Add the idempotent `due_at` migration inside `init_db()` in `main.py`
  - Insert the migration immediately after the existing `created_at` migration, inside the same `with closing(get_db()) as conn:` block and the same `try/except sqlite3.Error:` that governs `DB_READY`.
  - Reuse the already-read `cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]` (read before any schema change).
  - Guard with `if "due_at" not in cols:` then `conn.execute("ALTER TABLE tasks ADD COLUMN due_at TEXT")` — no DEFAULT clause; then the existing `conn.commit()`.
  - Issue no DROP/DELETE/UPDATE/TRUNCATE; re-runnable (N>=2 runs leave exactly one `due_at` column); a failing ALTER is caught by the existing `except`, setting `DB_READY = False` and leaving rows unchanged.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 3. Extend the repository functions additively in `main.py`
  - [ ] 3.1 Extend `insert_spirit(conn, title, due_at=None)` additively
    - Add the `due_at: str | None = None` parameter; when `due_at is None`, run the identical single-column `INSERT INTO tasks (title) VALUES (?)` as today (column defaults to NULL), then `conn.commit()` and return `cursor.lastrowid`.
    - When `due_at` is provided, run `INSERT INTO tasks (title, due_at) VALUES (?, ?)`.
    - Leave `delete_spirit` and `normalize_and_validate` unchanged.
    - _Requirements: 1.3, 1.4, 2.6, 8.4, 8.5_

  - [ ] 3.2 Extend `list_spirits(conn)` to SELECT `due_at` with a None fallback, signature unchanged
    - Keep the signature `list_spirits(conn)` and newest-first `ORDER BY id DESC`.
    - Read `PRAGMA table_info(tasks)`; include `due_at` in the result dict when the column exists, mirroring the existing `created_at` handling; when absent, return `due_at=None` so the dict shape stays stable for existing callers.
    - _Requirements: 8.4, 8.5_

  - [ ]* 3.3 Write property tests for migration and persistence in `tests/test_prop_due.py`
    - Add a `temp_db()` context manager (as in `tests/test_prop_summon_valid.py`) creating an isolated temp SQLite file so production `db.sqlite3` is never touched.
    - **Property 13: The due_at migration preserves all data and is idempotent** — seed arbitrary `id`/`title`/`created_at`/`due_at` rows, run the migration `N >= 1` times, assert exactly one `due_at` column and every row preserved byte-for-byte (pre-column rows have `due_at = NULL`).
    - **Property 14: due_at persistence round-trip (including the no-due case)** — valid titles with `None`-or-valid due: `insert_spirit` then `list_spirits` returns matching `title` and `due_at`; two-arg `insert_spirit(conn, title)` stores NULL.
    - **Validates: Requirements 1.3, 1.4, 2.6, 3.3, 3.4, 3.5, 3.6, 8.4, 8.5**

- [ ] 4. Checkpoint - backend cores and persistence
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Wire the additive `due` handling into the `summon()` handler in `main.py`
  - Add `due: str = Form("")` and `due_time: str = Form("")` so a request sending only `title` is unchanged (R2.5).
  - Keep the `DB_READY` short-circuit and `normalize_and_validate(title)` first: empty title -> 200 re-render with the existing empty error (no insert); too-long -> 422 with the existing message (no insert) — byte-for-byte unchanged.
  - On the valid-title path only: `raw_due = due.strip()`; if `raw_due` and `due_time.strip()`, join as `raw_due + " " + due_time.strip()`; call `parse_due(raw_due)`.
  - `ok=False` (only reachable when a non-empty due is rejected) -> 200 re-render via the existing `_render_index` path with a due-specific error, title preserved, no insert.
  - Otherwise `insert_spirit(conn, cleaned, due_at=normalized)` (`normalized=None` -> NULL) then the unchanged 303 redirect to `/`.
  - _Requirements: 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.3_

  - [ ]* 5.1 Write backward-compat integration tests for `/summon` (pytest + FastAPI TestClient, temp DB)
    - Only `title` -> 303 with one row whose `due_at` is NULL (R2.1, R2.4, R2.5, R8.3).
    - Empty title -> 200 + existing empty error, no insert (R2.2).
    - Title > 200 chars -> 422 with existing too-long message, no insert (R2.3).
    - Present-but-invalid due -> 200 re-render with due error, no insert (R1.5).
    - `POST /banish/{id}` and `GET /` without due unchanged (R8.3).
    - _Requirements: 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 8.3_

  - [ ]* 5.2 Write the migration-failure edge-case test (pytest)
    - Monkeypatch a connection whose `execute` raises on the `due_at` ALTER; assert existing rows are unchanged and failure is observable via `DB_READY` (never re-raised).
    - _Requirements: 3.7_

- [ ] 6. Create the pure JS haunting core `static/haunt.js` (UMD, mirrors `age.js`)
  - Use the exact UMD wrapper shape as `static/age.js` (CommonJS `module.exports` + `root.Haunt`), `"use strict"`.
  - Export `SOON_MS = 24 * 60 * 60 * 1000` and `OVERDUE_LEVEL3_COUNT = 3`.
  - Add `parseDue(raw)` mirroring `age.js parseCreated`: null/undefined/`""` -> null; finite number -> epoch-ms; string -> trim, replace first space with `"T"`, append `"Z"` unless a tz suffix matches `/[zZ]|[+\-]\d\d:?\d\d$/`, then `Date.parse`; `NaN` -> null; never throws.
  - Add pure total `hauntingLevel(tasks, now)`: non-finite `now` -> invalid-input sentinel (`-1`, outside `{0,1,2,3}`) without reading the clock; parse each `t.due` (tolerate bare string element); exclude null/unparseable; `overdue` = count with parsed due `< now`; `soon` = any parsed due in `[now, now + SOON_MS)`; decision: no parseable or none overdue/soon -> 0; some soon none overdue -> 1; `1 <= overdue < 3` -> 2; `overdue >= 3` -> 3. Always returns an integer in `{0,1,2,3}` for finite `now`; monotonic in `now`; order-independent.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 6.8, 9.1, 9.4, 9.6_

  - [ ]* 6.1 Write property tests for the haunting core in `tests/haunt.prop.test.js`
    - Create the file following `tests/age.prop.test.js` conventions: `node:test`, `fast-check`, `require("../static/haunt.js")`, `{ numRuns: 200 }`, each test tagged `Feature: poltergeist-due-dates, Property N: ...`. No DOM/DB/network (adapter inert under Node, proving R9.2).
    - **Property 1: Haunting level is total, bounded, and deterministic** — finite `now`, arbitrary tasks -> result in `{0,1,2,3}`, `assert.doesNotThrow`, two calls equal.
    - **Property 2: Haunting level honours the exact thresholds** — controlled due sets (soon 24h -> 1; 1–2 overdue -> 2; >=3 overdue -> 3; none -> 0) plus boundary examples (`due == now` is soon not overdue; `now + SOON_MS` exclusive).
    - **Property 3: NULL, missing, and unparseable dues contribute nothing** — injecting such dues leaves the level unchanged.
    - **Property 4: Haunting level is non-decreasing in time** — `now1 <= now2` -> `level(now1) <= level(now2)` for a fixed due set.
    - **Property 5: Haunting level is order-independent** — `level(tasks) == level(shuffle(tasks))`.
    - **Property 6: Invalid `now` yields an invalid-input outcome without reading the clock** — non-finite `now` -> sentinel outside `{0,1,2,3}`, no throw.
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 6.8, 9.1, 9.4, 9.6**

- [ ] 7. Add the additive "worried" mood to `static/ghost.js` (no breaking change)
  - Add, without touching `EXPRESSIONS`, `TRANSIENT`, `PHRASES`, `MOUTHS`, `nextExpression`, or `isTransient` (pinned by `tests/ghost.reactive.prop.test.js`):
    - `WORRIED_MOUTH` (downturned mouth `d` path) and `WORRIED_PHRASES` (>= 1 phrase).
    - pure total `moodForLevel(level)` returning `"worried"` iff `level >= 2`, else `"calm"`, exported and not part of `nextExpression`.
    - a `worry(on)` method on the object returned by `createMascot`: on `true`, add `expr-worried` on `.ghost-svg` and rewrite `.ghost-mouth` to `WORRIED_MOUTH` (additive overlay); on `false`, restore the current base expression.
  - _Requirements: 6.7, 8.1_

  - [ ]* 7.1 Write mascot-compatibility assertions for the "worried" mood (node:test)
    - In `tests/haunt.prop.test.js` (or alongside), assert `moodForLevel` returns `"worried"` iff `level >= 2` (**Property 7: Ghost mood follows the level threshold**) and that `WORRIED_MOUTH`/`WORRIED_PHRASES`/`worry` exist without altering the pinned `EXPRESSIONS`/`isTransient` structures.
    - **Validates: Requirements 6.7, 8.1**

- [ ] 8. Checkpoint - pure JS cores and ghost mood
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Add the defensive browser-only `applyHaunting(root, now)` adapter to `static/haunt.js`
  - Guard with `typeof document !== "undefined"` (inert under Node, like `applyAgeClasses`); tolerate missing `querySelectorAll`/`forEach`/`classList`/`getAttribute`; never throw.
  - Collect `main ul li[data-due]` into `tasks = [{ due }]`; compute `level = hauntingLevel(tasks, now)`; `displayLevel = (level in {0,1,2,3}) ? level : 0`.
  - Set `data-haunt="<displayLevel>"` on `document.body`.
  - Update the gauge named-state text (`Calm/Restless/Haunted/Possessed` + numeric) and its `aria-live="polite"` region.
  - For each `li`: parsed due `< now` -> add `spirit-overdue`, set `data-overdue="true"`, inject/show a non-color text/shape indicator (e.g. `⚠ overdue`); otherwise remove the overdue marking.
  - Mascot signal via guarded `window.Ghost.worry(displayLevel >= 2)`.
  - Auto-wire on `DOMContentLoaded` (and reuse after a banish), guarded by `typeof document`.
  - _Requirements: 6.1, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2, 7.5, 7.6, 9.2_

- [ ] 10. Add the summon form inputs and haunting gauge to `templates/index.html`
  - [ ] 10.1 Add optional date/time inputs with English labels and helper text
    - `<label for="summon-due">Due date (optional)</label><input id="summon-due" type="date" name="due">` and `<label for="summon-due-time">Due time (optional)</label><input id="summon-due-time" type="time" name="due_time">`, both optional, English helper text; omitting them submits only `title`.
    - Add `data-due="{{ task.due_at|default('', true) }}"` to each task `<li>`.
    - _Requirements: 1.1, 1.2, 1.7, 2.5, 6.6_

  - [ ] 10.2 Add the gothic "Haunting level" gauge with visible text + ARIA live region
    - `<div id="haunting-gauge" class="haunting-gauge" role="status" aria-live="polite">` with a visible named-state text label (e.g. `Calm (0)`); gothic theme styling; the visible text remains as the fallback when the live region is unavailable.
    - _Requirements: 6.5, 7.1, 7.2, 7.6_

- [ ] 11. Add the `data-haunt` CSS reactions and `expr-worried` styling in `templates/index.html`
  - `body[data-haunt="1|2|3"]` -> one distinct, visibly stronger candle-flicker step per level (reuse the existing `--glow`/`candle-flicker` machinery).
  - `body[data-haunt="2"|"3"]` -> fixed, `pointer-events:none`, `aria-hidden` red vignette at `opacity <= 0.25`, larger at level 3 than 2.
  - `body[data-haunt="2"|"3"]` -> intermittent board tremble on `.ouija`: active phase `<= 1s` within a cycle of `>= 3s`.
  - `li.spirit-overdue` -> continuous shake + glow (the non-color indicator is injected by the adapter).
  - `body[data-haunt="0"]`/out-of-range -> baseline only (no vignette, no tremble, no overdue shake, calm mascot).
  - `expr-worried` -> worried brow + downturned mouth; express all motion only via `animation`/`transition` so the existing global `@media (prefers-reduced-motion: reduce)` rule disables it.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.8, 7.3, 7.4_

  - [ ]* 11.1 Write template/DOM/CSS example tests (documented, snapshot-style)
    - Template (pytest + TestClient): `GET /` renders the optional date/time inputs with English labels (R1.1, R1.7); the gauge element with visible text + `aria-live="polite"` is present (R6.5, R7.1); each `<li>` carries `data-due` (R6.6).
    - CSS/DOM review assertions: `data-haunt` 1/2/3 produce distinct increasing flicker (R6.2); vignette opacity `<= 0.25`, larger at 3 (R6.3); tremble active phase `<= 1s` within a `>= 3s` cycle (R6.4); overdue card shake+glow + text/shape indicator (R6.6, R7.5); the global reduced-motion rule disables all new animation/transition leaving static styling + gauge text (R7.3, R7.4); live-region fallback keeps the visible text (R7.6).
    - _Requirements: 1.1, 1.7, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 12. Final checkpoint - whole-suite preservation gate
  - Run the FULL existing suite unmodified plus the new tests: `node --test "tests/**/*.test.js"` and `pytest`.
  - Confirm `tests/ghost.reactive.prop.test.js` still passes after adding the "worried" mood (`EXPRESSIONS` and `isTransient` unchanged), and that no existing test file was edited.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 8.1, 8.2_

## Notes

- Tasks marked with `*` are optional (property, unit, integration, and example/DOM/CSS tests) and can be skipped for a faster MVP; core implementation tasks are never marked optional.
- Each task references specific requirement IDs (R1–R9) and, where applicable, the design's correctness properties (Properties 1–14) it implements.
- Ordering: pure cores and their property tests precede the DOM adapter and wiring; the backend parser, migration, and repository precede the `summon()` handler; the plan ends with the whole-suite preservation gate.
- The "worried" ghost mood is additive only — it must never modify the arrays/functions pinned by `tests/ghost.reactive.prop.test.js`.
- No existing test file may be edited (R8.1, R8.2).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "6"] },
    { "id": 1, "tasks": ["1.1", "2", "6.1", "7"] },
    { "id": 2, "tasks": ["3.1", "7.1", "9"] },
    { "id": 3, "tasks": ["3.2", "10.1"] },
    { "id": 4, "tasks": ["3.3", "5", "10.2"] },
    { "id": 5, "tasks": ["5.1", "5.2", "11"] },
    { "id": 6, "tasks": ["11.1"] }
  ]
}
```
