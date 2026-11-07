# Requirements Document

## Introduction

Haunted Task Polish is a visual and behavioral polish pass over the existing task ("spirit") list in Séance, a haunted productivity app built with FastAPI, Jinja2 templates, SQLite, plain HTML/CSS, inline SVG, and vanilla JavaScript. This feature refines how summoned spirits look and behave: larger per-task ghost icons with deterministic tints, a readable task-name font, a fade-in-from-fog summon animation, age-based visual styling driven by a `created_at` timestamp, an accessible hold-to-banish gesture, and consistent respect for `prefers-reduced-motion`.

This is a polish pass, not a rewrite. The HTTP contract for summoning and banishing stays exactly as it is, no new libraries are introduced, and all existing tests must continue to pass. All user-visible text is in English.

Several of these behaviors already appear partially implemented in the codebase. `main.py` already defines a `created_at TEXT DEFAULT (datetime('now'))` column and performs an idempotent soft migration in `init_db()`. `templates/index.html` already carries CSS and client JavaScript for larger spirit icons, deterministic hue, age-based classes, summon fade-in, and `prefers-reduced-motion` handling (collectively referred to as "Polish B"). `static/banish.js` already contains an evaporation animation, particle effects, and a hold-to-banish gesture with an accessible fallback. Accordingly, the implementation of this feature reconciles and hardens the existing code against the requirements below rather than building each behavior from scratch.

## Glossary

- **Seance_App**: The complete FastAPI application defined in `main.py` plus its templates and static assets.
- **Spirit**: A persisted task row in the SQLite `tasks` table, rendered as one `<li>` in the Spirit_List. Has an `id`, a `title`, and a `created_at` timestamp.
- **Spirit_List**: The rendered `<ul>` of Spirit items on the main page.
- **Spirit_Icon**: The per-task inline SVG ghost shown inside each Spirit's `<li>`.
- **Spirit_Name**: The user-typed task title text displayed next to the Spirit_Icon.
- **Hue_Function**: The pure, deterministic function mapping a Spirit `id` to a hue value used to tint that Spirit's Spirit_Icon.
- **Age_Bucket_Function**: The pure, total client-side function that, given a `created_at` value and a reference "now", returns an age bucket of `fresh`, `old`, or `ancient`.
- **Summon_Endpoint**: The `POST /summon` route that accepts form field `title`.
- **Banish_Endpoint**: The `POST /banish/{task_id}` route.
- **Hold_To_Banish**: The pointer-device gesture where the user holds the Banish button for a configured duration to confirm banishment, with a visible filling ring.
- **Reduced_Motion**: The user preference expressed by the CSS media query `prefers-reduced-motion: reduce`.
- **Day_Threshold**: 24 hours (one day) of elapsed age, the boundary between the `fresh` and `old` buckets.
- **Ancient_Threshold**: 72 hours (three days) of elapsed age, the boundary between the `old` and `ancient` buckets.

## Requirements

### Requirement 1: Larger tinted spirit icons

**User Story:** As a user, I want each spirit to show a larger, softly glowing ghost icon in its own color, so that the task list feels alive and each spirit is visually distinct.

#### Acceptance Criteria

1. THE Seance_App SHALL render a Spirit_Icon as an inline SVG within each Spirit's `<li>` in the Spirit_List.
2. THE Seance_App SHALL render each Spirit_Icon at a rendered size between 52 and 56 pixels in its larger dimension.
3. THE Seance_App SHALL apply a soft glow to each Spirit_Icon in the same tint as that Spirit_Icon's body.
4. THE Seance_App SHALL apply a slow floating animation to each Spirit_Icon that is independent of other Spirit_Icons' float timing.
5. THE Hue_Function SHALL return the same hue value for the same Spirit `id` on every invocation.
6. WHEN two Spirits have different `id` values, THE Hue_Function SHALL derive each Spirit_Icon tint solely from that Spirit's `id`.
7. WHILE Reduced_Motion is requested, THE Seance_App SHALL suppress the Spirit_Icon floating animation.

### Requirement 2: Readable task-name font

**User Story:** As a user, I want my typed task names shown in a clearly readable font, so that I can distinguish similar letters and digits such as I, O, and 1.

#### Acceptance Criteria

1. THE Seance_App SHALL render each Spirit_Name using a serif or sans-serif font that is distinct from the decorative gothic display font.
2. THE Seance_App SHALL disable ligatures and contextual alternates for Spirit_Name text.
3. THE Seance_App SHALL render Spirit_Name text at a font size greater than or equal to 16 pixels.
4. THE Seance_App SHALL render the page title and headings using the Cinzel Decorative gothic display font.
5. THE Seance_App SHALL render Spirit_Name text in a color that maintains readable contrast against the Spirit card background.

### Requirement 3: Summon fade-in animation

**User Story:** As a user, I want a newly summoned spirit to fade in from fog, so that summoning feels atmospheric.

#### Acceptance Criteria

1. WHEN a Spirit is newly rendered in the Spirit_List, THE Seance_App SHALL animate that Spirit from blurred to sharp.
2. WHEN a Spirit is newly rendered in the Spirit_List, THE Seance_App SHALL animate that Spirit with a small upward float during its appearance.
3. WHEN a Spirit is newly rendered in the Spirit_List, THE Seance_App SHALL apply a brief glow that fades out as the appearance completes.
4. WHILE Reduced_Motion is requested, THE Seance_App SHALL suppress the summon fade-in animation.

### Requirement 4: Ageing spirits with created_at timestamp

**User Story:** As a user, I want older spirits to look faded and restless, so that I can sense at a glance how long a task has lingered.

#### Acceptance Criteria

1. THE Seance_App SHALL run the `created_at` schema migration on every application startup with an idempotent result.
2. WHEN the `created_at` schema migration runs, THE Seance_App SHALL preserve all existing Spirit rows without data loss.
3. WHEN the `created_at` schema migration runs, THE Seance_App SHALL perform no destructive database operation.
4. IF a Spirit row has no `created_at` value, THEN THE Age_Bucket_Function SHALL treat that Spirit as unknown age and classify it as `fresh`.
5. THE Age_Bucket_Function SHALL return exactly one of `fresh`, `old`, or `ancient` for every input of `created_at` and reference "now".
6. WHEN a Spirit's age is less than the Day_Threshold, THE Age_Bucket_Function SHALL return `fresh`.
7. WHEN a Spirit's age is greater than the Day_Threshold and less than or equal to the Ancient_Threshold, THE Age_Bucket_Function SHALL return `old`.
8. WHEN a Spirit's age is greater than the Ancient_Threshold, THE Age_Bucket_Function SHALL return `ancient`.
9. WHERE a Spirit is bucketed as `old`, THE Seance_App SHALL render that Spirit paler, slightly transparent, with a faint tremble animation.
10. WHERE a Spirit is bucketed as `ancient`, THE Seance_App SHALL render that Spirit with the `old` styling plus a faint wailing glow animation.
11. WHILE Reduced_Motion is requested, THE Seance_App SHALL suppress the tremble and wailing glow animations while retaining paleness and transparency as static styles.

### Requirement 5: Hold-to-banish gesture

**User Story:** As a user, I want to hold the Banish button to confirm banishment on a pointer device while still being able to banish instantly by click or keyboard, so that I avoid accidental banishment without losing accessibility.

#### Acceptance Criteria

1. WHEN a Spirit is banished, THE Seance_App SHALL play the existing evaporation animation with particles on that Spirit's card.
2. WHILE the user holds the Banish button on a pointer device, THE Seance_App SHALL display a filling ring indicating hold progress over approximately 600 milliseconds.
3. WHEN the user completes a hold of approximately 600 milliseconds on a pointer device, THE Seance_App SHALL banish that Spirit.
4. IF the user releases the Banish button on a pointer device before the hold duration completes, THEN THE Seance_App SHALL cancel the Hold_To_Banish gesture without banishing that Spirit.
5. WHEN the user activates the Banish button with a mouse click, THE Seance_App SHALL banish that Spirit immediately.
6. WHEN the user activates the Banish button with the Enter key or the Space key, THE Seance_App SHALL banish that Spirit immediately without requiring a hold.
7. WHEN the user activates the Banish button, THE Seance_App SHALL send the banish request to the Banish_Endpoint using HTTP POST.

### Requirement 6: Respect prefers-reduced-motion

**User Story:** As a user who prefers reduced motion, I want animations suppressed across the task list, so that I can use the app without motion discomfort.

#### Acceptance Criteria

1. WHILE Reduced_Motion is requested, THE Seance_App SHALL suppress the Spirit_Icon float, summon fade-in, tremble, and wailing glow animations.
2. WHILE Reduced_Motion is requested, THE Seance_App SHALL suppress banish evaporation particles and the Hold_To_Banish filling animation.
3. WHILE Reduced_Motion is requested, THE Seance_App SHALL retain static styles including paleness and transparency.

### Requirement 7: Preserve HTTP contracts

**User Story:** As a maintainer, I want the summon and banish HTTP contracts unchanged, so that existing clients and tests keep working.

#### Acceptance Criteria

1. THE Summon_Endpoint SHALL accept a form field named `title` via HTTP POST.
2. WHEN a valid `title` is submitted to the Summon_Endpoint, THE Seance_App SHALL respond with HTTP status 303.
3. WHEN an empty `title` is submitted to the Summon_Endpoint, THE Seance_App SHALL re-render the page without creating a Spirit.
4. IF a `title` longer than 200 characters is submitted to the Summon_Endpoint, THEN THE Seance_App SHALL respond with HTTP status 422.
5. THE Banish_Endpoint SHALL accept requests via HTTP POST at path `/banish/{task_id}`.
6. WHEN an existing Spirit is banished via the Banish_Endpoint, THE Seance_App SHALL respond with HTTP status 200 and body `{"ok": true}`.
7. IF a banish request targets a non-existent Spirit, THEN THE Seance_App SHALL respond with HTTP status 404.
8. IF the database is unreachable when a banish request is received, THEN THE Seance_App SHALL respond with HTTP status 503.

### Requirement 8: Preserve existing tests and dependency constraints

**User Story:** As a maintainer, I want all existing tests to pass and no new libraries added, so that the polish pass stays safe and self-contained.

#### Acceptance Criteria

1. WHEN the Python test suite is run with pytest, THE Seance_App SHALL pass every existing Python property test under `tests/test_prop_*.py`.
2. WHEN the JavaScript test suite is run with `npm test`, THE Seance_App SHALL pass every existing JavaScript property test under `tests/*.prop.test.js`.
3. THE Seance_App SHALL implement all polish behavior using only plain HTML, CSS, inline SVG, existing vanilla JavaScript, and Python with SQLite.
4. THE Seance_App SHALL introduce no new third-party libraries.
5. THE Seance_App SHALL render all user-visible text in English.

## Correctness Properties

These properties are high-value invariants to be verified by property tests. Several are already covered by existing tests in the repository; the implementation reconciles the existing code with these properties.

1. **Deterministic hue from id (Requirement 1.5, 1.6)**: For all Spirit `id` values, `Hue_Function(id)` returns the same hue on repeated invocation, and the hue is a pure function of `id` alone. The hue result lies within the valid hue range `[0, 360)`.

2. **Age bucketing is total and monotonic (Requirement 4.4–4.8)**: For all `created_at` and reference "now" inputs, `Age_Bucket_Function` returns exactly one of `fresh`, `old`, or `ancient` and never throws (total function). As age increases across the Day_Threshold (1 day) and the Ancient_Threshold (3 days), the bucket transitions monotonically `fresh` → `old` → `ancient` and never regresses. A missing or unparseable `created_at` yields `fresh` (unknown age).

3. **Banish DOM round-trip restore (Requirement 5, existing coverage)**: Removing a Spirit element from the Spirit_List at a given index and then restoring it at that same index reproduces the original list order and contents exactly (round-trip identity). This is already covered by `tests/banish.prop.test.js`.
