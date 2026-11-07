# Design Document

## Overview

Haunted Task Polish is a visual and behavioral polish pass over the existing Séance spirit list. It is **not** a greenfield build: `main.py`, `templates/index.html`, `static/banish.js`, and `static/ghost.js` already contain a partial implementation of every behavior in the requirements (collectively "Polish B"). This design reconciles that existing code with the approved requirements and specifies the small, targeted changes needed to close the gaps.

The stack is fixed: FastAPI + Jinja2 templates, SQLite, plain HTML/CSS, inline SVG, and vanilla JavaScript. No new third-party libraries are introduced, the HTTP contracts for `POST /summon` and `POST /banish/{task_id}` stay byte-for-byte identical, all existing tests must keep passing, and all user-visible text is English.

### What already exists (verified in code)

- **Deterministic hue** — the template emits `style="--spirit-hue: {{ (task.id * 47) % 360 }};"` on each `<li>`, and CSS tints the icon body with `hsl(var(--spirit-hue) ...)` plus a matching `drop-shadow`. The hue math lives inline in Jinja, so there is nothing a Node property test can import.
- **Per-task icon** — an inline SVG `<svg class="spirit-icon" width="24" height="28">` is rendered inside each `<li>`. It is currently **24×28px**, below the required 52–56px.
- **Summon fade-in** — `@keyframes appear` (blur→sharp, upward float, brief glow) is applied to every `<li>` via the `li { animation: float ..., appear .8s ease-out; }` rule.
- **Ageing** — the template renders `data-created="{{ task.created_at|default('', true) }}"` and an **inline `<script>`** parses it, computes an age, and adds `li.spirit-old` / `li.spirit-ancient`. The thresholds (24h, 72h) and the missing→fresh fallback are present, but the logic is trapped inside an IIFE in the HTML, so it cannot be imported or have `now` injected by a test.
- **Ageing CSS** — `li.spirit-old` (opacity + `spirit-shake`) and `li.spirit-ancient` (adds `wailing-glow`) exist; paleness/transparency are static `opacity`, the tremble/glow are animations.
- **Hold-to-banish** — `static/banish.js` implements the pointer hold (`HOLD_MS = 650`), the `.holding` ring, `suppressNextSubmit`, `spawnCardParticles`, the evaporation animation, and the pure `restoreAtIndex` round-trip, with a native-submit fallback for mouse/keyboard and a `PointerEvent` feature check.
- **Reduced-motion** — one global rule `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`, plus `prefersReducedMotion()` guards in `banish.js` and `ghost.js`.

### Gaps this design closes

1. **Spirit_Name font contradicts Requirement 2.** The current rule is `li .spirit-name { font-family: "Cinzel Decorative", Georgia, serif; ... }` — the decorative gothic display font, with no ligature controls. Requirement 2 demands a readable serif/sans *distinct* from the gothic font, ligatures/contextual-alternates disabled, and ≥16px. This must change.
2. **Icon size** is 24×28px; must be raised to 52–56px in its larger dimension.
3. **Independent float.** Today only `li:nth-child(even)` gets a `-2s` delay, so icons float in two shared phases. Requirement 1.4 wants each icon's float independent, which we derive per `id`.
4. **Hue is not testable.** `(task.id * 47) % 360` is inline Jinja. We extract the same formula into a pure, importable `hueFromId(id)` so Property 1 can be tested and the template keeps rendering the same number.
5. **Age logic is not testable.** The inline aging script must move into a small UMD module `static/age.js` exporting `ageBucket(createdAt, now)`, so the totality and boundary properties can inject `now` and import the function under Node — mirroring how `banish.js` and `ghost.js` already export for tests.

### Non-goals

- Redesigning the ghost mascot (`ghost.js`). We only rely on its existing `reactSummon` / `reactBanish` hooks, which the page already wires.
- Changing the Ouija board, the summon/banish routes, request/response shapes, status codes, or the DB schema contract.
- Adding build tooling, bundlers, or any dependency.

## Architecture

The feature spans four cooperating layers. Only the client-side presentation layers change in substance; the server layer is verified, not rewritten.

```mermaid
flowchart TD
    subgraph Server [FastAPI / main.py]
        DB[(SQLite tasks: id, title, created_at)]
        INIT["init_db() idempotent migration"]
        LIST["list_spirits(conn) -> [{id, title, created_at}]"]
        HOME["GET / -> TemplateResponse"]
        DB --> LIST --> HOME
        INIT --> DB
    end

    subgraph Template [templates/index.html render path]
        LI["per-task <li> with data-id, data-created,\n--spirit-hue (= hueFromId(id)), inline spirit-icon SVG"]
        CSS["CSS layers: icon size/glow, per-id float,\nspirit-name font, appear, ageing, hold ring, reduced-motion"]
    end

    subgraph Client [static/*.js (UMD, vanilla)]
        AGE["age.js: ageBucket(createdAt, now), hueFromId(id)"]
        BANISH["banish.js: hold-to-banish, particles, restoreAtIndex"]
        GHOST["ghost.js hooks: reactSummon / reactBanish"]
    end

    HOME --> LI
    LI --> CSS
    LI -->|data-created| AGE
    AGE -->|adds li.spirit-old / li.spirit-ancient| CSS
    LI -->|banish-form submit / pointer hold| BANISH
    BANISH -->|POST /banish/{id}| HOME
    BANISH -->|on success/empty| GHOST
```

### Component responsibilities

- **Server (`main.py`)** — unchanged in behavior. `init_db()` already runs an idempotent, non-destructive migration (`CREATE TABLE IF NOT EXISTS` plus a conditional `ALTER TABLE ... ADD COLUMN created_at` guarded by a `PRAGMA table_info` check). `list_spirits` already returns `created_at` (or `None` for legacy two-column schemas). We only **verify** this against Requirements 4.1–4.3 and 7.x; no code change is required here.
- **Template render path (`templates/index.html`)** — emits each `<li>` with `data-id`, `data-created`, and `style="--spirit-hue: ..."`, injects the inline `spirit-icon` SVG, and carries all CSS. Changes: icon size, per-id float phase, the Spirit_Name font block, loading a readable web font, and replacing the inline aging IIFE with a `<script src="/static/age.js">` plus a tiny wiring IIFE.
- **`static/age.js` (new, UMD)** — pure, testable module exporting `ageBucket(createdAt, now)` and `hueFromId(id)`. The browser build also binds a page-load pass that reads each `li[data-created]` and applies the bucket class. The UMD wrapper matches the existing `banish.js`/`ghost.js` pattern so Node tests can `require("../static/age.js")`.
- **`static/banish.js`** — unchanged. Documented here so the design records the gesture contract it already satisfies.
- **`static/ghost.js` hooks** — unchanged. `banish.js`'s success path calls `window.setQuietMascot` / `window.updateMascot`, which the page wires to `mascot.reactBanish()` / `celebrateEmpty()`; the initial load calls `mascot.reactSummon()` when the list is non-empty.

### CSS layer ordering

The stylesheet is a single `<style>` block. The reduced-motion `@media` rule sits **last**, so `animation: none !important` wins the cascade over every earlier animated rule. This design preserves that ordering; any new animated rule (e.g. the per-id float) must remain above the global reduced-motion rule and must express motion only through `animation`/`transition` (never through static properties), so that reduced-motion suppression leaves paleness and transparency intact.

## Components and Interfaces

### `static/age.js` (new module)

UMD wrapper identical in shape to `banish.js` / `ghost.js` (assigns `root.Age` in the browser and `module.exports` under Node), so no bundler or new dependency is needed.

```js
// Age bucket boundaries, exported for reuse/testing.
const DAY_MS      = 24 * 60 * 60 * 1000;  // Day_Threshold      (Requirement: glossary)
const ANCIENT_MS  = 72 * 60 * 60 * 1000;  // Ancient_Threshold

/**
 * Pure, total age classifier.
 * @param {string|number|null|undefined} createdAt  SQLite "YYYY-MM-DD HH:MM:SS" (UTC),
 *        an ISO string, an epoch-ms number, or missing/garbage.
 * @param {number} now  Reference time in epoch ms (injectable for tests).
 * @returns {"fresh"|"old"|"ancient"}  Never throws.
 *
 * Boundaries (age = now - parse(createdAt)):
 *   age <  24h             -> "fresh"
 *   24h < age <= 72h       -> "old"
 *   age >  72h             -> "ancient"
 * Missing / unparseable createdAt, or non-finite now -> "fresh".
 */
function ageBucket(createdAt, now) { /* ... */ }

/**
 * Pure, deterministic tint hue from a spirit id. Same formula the template
 * uses today: (id * 47) % 360, normalized into [0, 360).
 * @param {number} id  A spirit id (integer).
 * @returns {number}   Hue in [0, 360).
 */
function hueFromId(id) { /* ... */ }
```

Semantics fixed by the requirements and by matching the current inline script:

- **Parsing** — `createdAt` strings in SQLite's `datetime('now')` form (`"YYYY-MM-DD HH:MM:SS"`, UTC) are normalized to ISO (`"...T...Z"`) before `Date.parse`, exactly as the current inline script does. Numbers are treated as epoch-ms. `null`, `""`, and unparseable values yield `"fresh"`.
- **Boundary convention** — age strictly less than `DAY_MS` is `fresh`; strictly greater than `DAY_MS` and at most `ANCIENT_MS` is `old`; strictly greater than `ANCIENT_MS` is `ancient`. Exactly `DAY_MS` falls to `fresh` (consistent with the existing `age > DAY_MS` test); exactly `ANCIENT_MS` falls to `old` (consistent with `age > 3*DAY_MS`). This keeps the DOM result identical to the current inline logic (`spirit-old` when `age > DAY_MS`, add `spirit-ancient` when `age > 3*DAY_MS`).
- **`hueFromId`** — returns the same value the Jinja expression computes, so the template can switch to calling nothing new on the server side; the server keeps emitting `(task.id * 47) % 360`, and `hueFromId` is the single source of truth the property test pins. (The module's `hueFromId` and the Jinja expression are kept in lockstep by Property 1 plus a note in the template.)

Browser wiring (in `age.js`, guarded by `typeof document !== "undefined"`, matching the other modules):

```js
// On DOM ready: classify every rendered spirit.
function applyAgeClasses(root, now) {
  (root || document).querySelectorAll("main ul li[data-created]").forEach((li) => {
    const bucket = ageBucket(li.getAttribute("data-created"), now ?? Date.now());
    if (bucket === "ancient") li.classList.add("spirit-old", "spirit-ancient");
    else if (bucket === "old") li.classList.add("spirit-old");
    // "fresh" -> no class (default luminous styling)
  });
}
```

### Data attributes (template → client contract)

Each spirit `<li>` carries exactly these hooks (all already present except the icon-size change is CSS-only):

| Attribute / property | Source | Consumed by | Purpose |
|---|---|---|---|
| `data-id="{{ task.id }}"` | `list_spirits` → template | `banish.js` (`restoreAtIndex`, fetch URL) | identify the spirit for banish |
| `data-created="{{ task.created_at|default('', true) }}"` | `list_spirits` → template | `age.js` `ageBucket` | age classification |
| `style="--spirit-hue: {{ (task.id * 47) % 360 }};"` | template (mirrors `hueFromId`) | CSS `hsl(var(--spirit-hue) ...)` | deterministic tint + matching glow |
| per-id float phase (`animation-delay`) | derived from `id` | CSS `float` keyframe | independent float timing (Req 1.4) |

### `static/banish.js` gesture contract (existing, documented)

- **Submit interception** — each `<form class="banish-form">` has its submit `preventDefault`-ed. If `suppressNextSubmit` is set (a hold just fired), the synthetic click is swallowed once; otherwise `banishItem(form.closest("li"))` runs. This is the accessible fallback: mouse click, Enter, and Space all raise a native submit and banish immediately (Req 5.5, 5.6).
- **Pointer hold** — only when `"PointerEvent" in window`. `pointerdown` (primary button, not disabled) adds `.holding` (driving the CSS `hold-fill` ring) and starts a `HOLD_MS = 650` timer. On completion it sets `held`/`suppressNextSubmit` and calls `banishItem` once. `pointerup`/`pointerleave`/`pointercancel` before the threshold call `clearHold`, cancelling without banishing (Req 5.2–5.4). ~650ms satisfies the "approximately 600ms" requirement.
- **No PointerEvent** — the hold branch is skipped entirely; only the native submit path runs (Req 5.6, keyboard-only environments).
- **Evaporation + particles** — `banishItem` adds `.banished` (400ms `vanish` animation) and calls `spawnCardParticles`, which is a no-op under reduced motion or without a DOM (Req 5.1, 6.2). On fetch success the `<li>` stays removed and the mascot is updated; on 404/network failure it is restored at its original index via the pure `restoreAtIndex` (Req 7.7, the existing Property 3).
- **POST** — the request is `fetch("/banish/" + id, { method: "POST" })` (Req 7.5).

### `static/ghost.js` hooks (existing, documented)

The page calls `mascot.reactSummon()` on initial load when spirits are present, and `banish.js` triggers `window.setQuietMascot` / `window.updateMascot` (wired to `reactBanish` / `celebrateEmpty`) after a banish. Both reactions are no-ops under reduced motion. No change to `ghost.js`.

## Data Models

### `tasks` row (SQLite)

Defined by `init_db()`; unchanged by this feature.

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | drives `hueFromId` and float phase |
| `title` | `TEXT NOT NULL CHECK (length(title) <= 200)` | the Spirit_Name text |
| `created_at` | `TEXT DEFAULT (datetime('now'))` | UTC `"YYYY-MM-DD HH:MM:SS"`; `NULL` for rows migrated from a pre-`created_at` schema |

The soft migration adds `created_at` to a pre-existing table via `ALTER TABLE ... ADD COLUMN` (SQLite forbids a non-constant `DEFAULT` in `ALTER`, so migrated legacy rows hold `NULL` → treated as unknown age → `fresh`). The migration is idempotent and non-destructive; this design only **verifies** it.

### Spirit dict (from `list_spirits`)

```python
{"id": int, "title": str, "created_at": str | None}
```

When the running DB lacks the `created_at` column (legacy/test two-column schema), `list_spirits` returns `created_at=None`, which the template renders as `data-created=""` and `ageBucket` classifies as `fresh`. This shape is unchanged by the feature.

### Client view model (derived, not persisted)

- **Hue** — `hueFromId(id) ∈ [0, 360)`, a pure function of `id`.
- **Age bucket** — `ageBucket(created_at, now) ∈ {"fresh", "old", "ancient"}`, mapped to CSS classes (`fresh` → none, `old` → `.spirit-old`, `ancient` → `.spirit-old .spirit-ancient`).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The two new pure functions (`hueFromId`, `ageBucket`) are ideal for property-based testing: pure, total, cheap to run thousands of times, with behavior that varies meaningfully with input. The banish DOM round-trip is already covered and is reused unchanged.

### Property 1: Deterministic hue from id

*For any* integer spirit `id`, `hueFromId(id)` returns the same value on repeated invocation (it is a pure function of `id` alone), and the result lies within `[0, 360)`.

**Validates: Requirements 1.5, 1.6**

### Property 2: Age bucketing is total and never throws

*For any* `createdAt` input (valid timestamp string, epoch-ms number, `null`, empty string, or arbitrary garbage) and *any* reference `now`, `ageBucket(createdAt, now)` returns exactly one of `"fresh"`, `"old"`, or `"ancient"` and never throws.

**Validates: Requirements 4.5**

### Property 3: Missing or unparseable created_at is fresh

*For any* `createdAt` that is `null`, `undefined`, empty, or unparseable, and *any* reference `now`, `ageBucket(createdAt, now)` returns `"fresh"` (unknown age).

**Validates: Requirements 4.4**

### Property 4: Age bucketing is monotonic across the thresholds

*For any* reference `now` and *any* age offset, as the spirit's age increases across the Day_Threshold (24h) and the Ancient_Threshold (72h) the bucket transitions `fresh` → `old` → `ancient` and never regresses. Concretely: an age `< 24h` yields `fresh`; an age `> 24h` and `<= 72h` yields `old`; an age `> 72h` yields `ancient`.

**Validates: Requirements 4.6, 4.7, 4.8**

### Property 5: Banish DOM round-trip restore (existing coverage)

*For any* spirit list and any index `i`, removing the element at `i` and then restoring it via `restoreAtIndex(remaining, element, i)` reproduces the original list order and contents exactly (round-trip identity).

**Validates: Requirements 7.7** — already implemented by `tests/banish.prop.test.js`; reused unchanged.

## Error Handling

| Condition | Behavior | Requirement |
|---|---|---|
| `created_at` missing / `NULL` / empty | Template renders `data-created=""`; `ageBucket` returns `"fresh"`; no ageing class added — spirit renders luminous. Never throws. | 4.4 |
| `created_at` unparseable (garbage string) | `ageBucket` returns `"fresh"` (parse yields `null`). Never throws. | 4.4, 4.5 |
| No `PointerEvent` support (keyboard-only / old browser) | `banish.js` skips the hold branch; the native submit fallback banishes on click/Enter/Space. | 5.6 |
| Reduced motion requested | Global `@media` rule sets `animation: none !important`; `spawnCardParticles` and the hold ring are suppressed; paleness/transparency (static `opacity`) remain. | 1.7, 3.4, 4.11, 6.1–6.3 |
| Banish fetch returns 404 / network error | `<li>` restored at its original index via `restoreAtIndex`; a `#banish-error` alert is shown. | 7.7 |
| Database unreachable | Unchanged server behavior: `GET /` degrades to `db_error=True`, `tasks=[]`; `POST /banish` returns 503; `POST /summon` re-renders with an error and disables controls. The client modules make no assumptions that break this. | 7.3, 7.8 |
| `age.js` / `ghost.js` fails to load | Page still renders; icons simply stay `fresh` (no ageing classes) and mascot reactions are skipped. Graceful degradation, matching the existing defensive guards. | 8.3 (no regression) |

## Testing Strategy

The feature keeps the existing dual approach: Python tests under `pytest` for the server contract, and JavaScript property tests under `node --test` + `fast-check` for the pure client logic. The `npm test` script is `node --test "tests/**/*.test.js"`; new JS tests follow the existing `tests/*.prop.test.js` naming and the conventions in `tests/ghost.prop.test.js` / `tests/banish.prop.test.js`.

### New property tests (JavaScript, fast-check, ≥100 iterations)

**`tests/age.prop.test.js`** — imports `require("../static/age.js")`:

- **Property 2 (totality):** generate arbitrary `createdAt` (strings, integers, floats, `null`, `undefined`, junk) and arbitrary `now`; assert the result is in `{"fresh","old","ancient"}` and the call never throws.
- **Property 3 (missing → fresh):** generate `null`/`undefined`/empty/unparseable `createdAt`; assert `"fresh"`.
- **Property 4 (monotonic boundaries):** generate a `now` and an age offset, construct `createdAt = now - offset`, and assert the bucket matches the threshold band (`<24h` → fresh, `(24h,72h]` → old, `>72h` → ancient). Include generators that straddle both boundaries so the monotonic `fresh→old→ancient` ordering is exercised.

**`tests/hue.prop.test.js`** (or a `hue` block inside `age.prop.test.js`, since `hueFromId` is exported from the same module) — Property 1:

- generate random integer `id`; assert `hueFromId(id) === hueFromId(id)` (determinism), that the result depends on `id` alone, and that it lies in `[0, 360)`.

Each new test carries the tag comment:

```
// Feature: haunted-task-polish, Property N: <property text>
```

### Reused tests (unchanged, must keep passing)

- `tests/banish.prop.test.js` — Property 5 (banish DOM round-trip). Moving the aging logic into `age.js` and resizing the icon do not touch `banish.js` or `restoreAtIndex`.
- `tests/ghost.prop.test.js`, `tests/ghost.reactive.prop.test.js`, `tests/board.*.prop.test.js` — unaffected; this feature does not modify `ghost.js` or `board.js`.
- Python suite — `tests/test_prop_*.py`, `tests/test_http_examples.py`, `tests/test_integration_e2e.py`, `tests/test_schema_init.py` — the server contract (`/summon` 303/empty-rerender/422, `/banish` POST/200/404/503), listing order, persistence across restart, and the idempotent schema init are all verified here and **must not change**. Requirements 4.1–4.3 (idempotent, non-destructive migration) and 7.1–7.8 (HTTP contracts) are confirmed by these existing tests.

### Why not property-test the rest

The remaining acceptance criteria are CSS/visual facts (icon size and glow, the Spirit_Name font and feature-settings, the `appear`/`spirit-shake`/`wailing-glow` keyframes, the reduced-motion suppression) or timer-driven DOM gestures (the hold ring timing). These do not vary meaningfully with generated input and are verified by stylesheet/code review and manual inspection, not PBT. The server contracts and the migration are infrastructure behavior covered by the existing Python integration/example tests.

### Dependency and scope guardrails

- No new third-party libraries (Req 8.4). `age.js` uses only the UMD pattern already present in the repo; tests use the existing `fast-check` dev dependency.
- All polish is plain HTML/CSS/inline SVG/vanilla JS/Python+SQLite (Req 8.3).
- All user-visible strings stay in English (Req 8.5).
- The web font chosen for Spirit_Name (a readable serif/sans served alongside the existing Google Fonts `<link>`, e.g. keeping `IM Fell English` off the name or adding one readable family) must not alter the `h1`/heading use of Cinzel Decorative (Req 2.4) and must apply `font-variant-ligatures: none` + `font-feature-settings: "liga" 0, "calt" 0` to the `.spirit-name` rule (Req 2.1–2.3).
