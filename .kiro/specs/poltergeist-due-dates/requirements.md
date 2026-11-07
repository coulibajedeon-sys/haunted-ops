# Requirements Document

## Introduction

The poltergeist-due-dates feature lets a user attach an optional due date (and optional time) to a task when summoning it through the existing `/summon` form. Overdue and soon-due tasks "haunt" the interface: a single pure function derives an integer **haunting level** (0 to 3) purely from timestamps, and the whole page reacts to that level with intensifying effects (candle glow flicker, intermittent board tremble, a faint red vignette, a gothic "Haunting level" gauge, shaking/glowing overdue task cards, and a worried ghost mascot). Level 0 is calm, with no haunting effects.

The due date is strictly additive. Requests that omit the due field behave **exactly** as they do today: the same title validation (empty re-renders at 200 with an error; too long returns HTTP 422), the same successful 303 redirect, and all existing tests continue to pass. The backend adds a `due_at` column to the existing SQLite `tasks` table through a safe, idempotent, non-destructive startup migration that mirrors the pattern already used for `created_at`.

Because every haunting decision is derived from timestamps, the core is a pure, injectable-time function suitable for property-based testing with fast-check (JS) and Hypothesis (Python). Accessibility is first-class: the haunting level is always announced as text and never conveyed by color alone, and under `prefers-reduced-motion` there is no trembling or shaking — only static styling plus the text gauge.

## Glossary

- **Seance_App**: The existing FastAPI application in `main.py` that serves the page and handles `/summon` and `/banish`.
- **Summon_Endpoint**: The existing `POST /summon` route that accepts a task `title` via form data and, on success, inserts a task and returns a 303 redirect to `/`.
- **Tasks_Table**: The existing SQLite table `tasks` with columns `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `title` (TEXT NOT NULL CHECK length <= 200), and `created_at` (TEXT).
- **Due_Column**: The new nullable column `due_at` (TEXT) added to the Tasks_Table for storing a task's due timestamp.
- **Due_Migration**: The idempotent startup routine inside `init_db()` that adds the Due_Column when absent, using a `PRAGMA table_info` check followed by `ALTER TABLE tasks ADD COLUMN`.
- **Due_Input**: The optional form field submitted with `/summon` carrying a due date and optional time entered by the user.
- **Due_Parser**: The pure function that converts a raw Due_Input value into a normalized stored representation or a parse error, without side effects.
- **Haunting_Core**: The pure function `hauntingLevel(tasks, now)` that returns an integer from 0 to 3 computed only from task due timestamps and the reference instant `now`.
- **Haunting_Level**: The integer result (0, 1, 2, or 3) produced by the Haunting_Core.
- **Overdue_Threshold**: The condition under which a task's `due_at` is at or before `now` (the task is overdue).
- **Soon_Threshold**: The duration before `due_at` within which a task is considered "soon due" but not yet overdue.
- **Haunting_Gauge**: The gothic-themed on-page indicator that shows the current Haunting_Level and always includes a text label.
- **Overdue_Card**: A rendered task list item whose `due_at` is overdue relative to `now`.
- **Ghost_Mascot**: The existing SVG mascot (`static/ghost.js`) that displays contextual expressions.
- **Reduced_Motion**: The user environment where `prefers-reduced-motion: reduce` is active.
- **Existing_Test_Suite**: The current JS property tests (`tests/*.prop.test.js`, run under Node with fast-check) and Python tests (`tests/test_*.py`, run with pytest and Hypothesis) that pass before this feature.

## Requirements

### Requirement 1: Optional due date on the summon form

**User Story:** As a user, I want to optionally set a due date and time when I summon a task, so that the interface can warn me as the deadline approaches and passes.

#### Acceptance Criteria

1. THE Seance_App SHALL render the summon form with an optional Due_Input control that accepts a calendar date and an optional time-of-day, with all labels and helper text in English.
2. WHERE the Due_Input control is present, THE Seance_App SHALL mark the Due_Input as optional such that submitting the summon form with the Due_Input left empty is accepted without a validation error.
3. WHEN a summon request omits the Due_Input value or provides an empty Due_Input value, THE Summon_Endpoint SHALL store the task with `due_at` set to NULL.
4. WHEN a summon request includes a Due_Input value that the Due_Parser accepts as a valid date (with optional time), THE Summon_Endpoint SHALL store the task with `due_at` set to the normalized due timestamp produced by the Due_Parser.
5. IF a summon request includes a Due_Input value that the Due_Parser rejects as invalid, THEN THE Summon_Endpoint SHALL reject the request, leave the task unsaved, and return an error response indicating that the due date value is invalid.
6. WHEN a summon request includes a date without a time-of-day, THE Due_Parser SHALL normalize `due_at` to the end of that calendar day (23:59:59) so that the stored timestamp is deterministic.
7. THE Seance_App SHALL present all Due_Input labels, helper text, and gauge text in English.

### Requirement 2: Backward-compatible summon contract

**User Story:** As a maintainer, I want the summon behavior to be unchanged for requests without a due date, so that existing clients and tests keep working exactly as before.

#### Acceptance Criteria

1. WHEN a summon request omits the Due_Input value, THE Summon_Endpoint SHALL apply the existing title validation rules and produce identical HTTP status codes, response bodies, and persistence effects to the pre-Due_Input behavior.
2. IF a summon request omits the Due_Input value AND the submitted title is an empty string after leading and trailing whitespace is stripped, THEN THE Summon_Endpoint SHALL re-render the page with HTTP status 200, display the existing empty-title error, and insert no task into the data store.
3. IF a summon request omits the Due_Input value AND the submitted title exceeds 200 characters after whitespace is stripped, THEN THE Summon_Endpoint SHALL return HTTP status 422 with the existing too-long error message and insert no task into the data store.
4. WHEN a summon request omits the Due_Input value AND the normalized title is between 1 and 200 characters inclusive after strip, THE Summon_Endpoint SHALL insert exactly one task and return an HTTP 303 redirect to `/`.
5. THE Summon_Endpoint SHALL accept the Due_Input as an optional form field defaulting to absent, such that a request sending only `title` produces no error attributable to the missing Due_Input field.
6. WHEN a summon request omits the Due_Input value AND the normalized title is valid, THE Summon_Endpoint SHALL store the inserted task with its due value absent (`due_at` NULL).

### Requirement 3: Safe, idempotent due_at migration

**User Story:** As a maintainer, I want the due_at column added safely on startup, so that existing data is preserved and the migration can run repeatedly without harm.

#### Acceptance Criteria

1. WHEN `init_db()` runs, THE Due_Migration SHALL read the set of existing column names of the Tasks_Table using `PRAGMA table_info(tasks)` before making any schema change.
2. IF the Tasks_Table does not contain the Due_Column, THEN THE Due_Migration SHALL add the Due_Column using `ALTER TABLE tasks ADD COLUMN due_at TEXT` with no DEFAULT clause.
3. WHEN the Due_Migration adds the Due_Column to a table with existing rows, THE Due_Migration SHALL leave `due_at` as NULL for every pre-existing row while leaving each row's `id`, `title`, and `created_at` unchanged.
4. IF the Tasks_Table already contains the Due_Column, THEN THE Due_Migration SHALL execute no ALTER statement and SHALL leave every existing `due_at` value byte-for-byte unchanged.
5. THE Due_Migration SHALL execute no DROP, DELETE, UPDATE, or TRUNCATE operation against the Tasks_Table, preserving every existing row and the values of `id`, `title`, and `created_at`.
6. WHEN `init_db()` runs N times (N >= 2) on the same database, THE Due_Migration SHALL leave the Tasks_Table with exactly one `due_at` column, identical to the schema after a single run.
7. IF the `ALTER TABLE tasks ADD COLUMN due_at TEXT` statement fails, THEN THE Due_Migration SHALL propagate the failure to the caller of `init_db()` and SHALL leave every existing row and its `id`, `title`, and `created_at` values unchanged.

### Requirement 4: Pure due-date parsing

**User Story:** As a maintainer, I want a pure function that parses and normalizes due input, so that storage is consistent and the logic is testable without a database.

#### Acceptance Criteria

1. WHEN the Due_Parser receives a Due_Input that is empty or contains only whitespace characters, THE Due_Parser SHALL return a result indicating no due date and SHALL NOT return a parse-error result.
2. WHEN the Due_Parser receives a Due_Input containing a valid calendar date without a time component, THE Due_Parser SHALL normalize the value to a stored timestamp string representing 23:59:59 of that calendar day.
3. WHEN the Due_Parser receives a Due_Input containing a valid calendar date with a time component, THE Due_Parser SHALL normalize the value to a stored timestamp string that preserves the supplied year, month, day, hour, minute, and second without altering the time component.
4. IF the Due_Parser receives a non-empty Due_Input whose non-whitespace content does not match a supported date or date-with-time format, THEN THE Due_Parser SHALL return a parse-error result that identifies the input as unparseable and SHALL NOT produce a stored timestamp.
5. IF the Due_Parser receives a Due_Input that matches a supported format but represents a non-existent calendar date or time, THEN THE Due_Parser SHALL return a parse-error result identifying the value as invalid and SHALL NOT produce a stored timestamp.
6. WHEN the Due_Parser normalizes any valid Due_Input to a stored timestamp string, THE Due_Parser SHALL produce an output that, when supplied again as Due_Input, yields a stored timestamp string equal to the first, for all valid inputs.
7. THE Due_Parser SHALL compute every result solely from the supplied Due_Input value without reading the system clock, environment, or any other external state, and without producing side effects.

### Requirement 5: Pure haunting-level computation

**User Story:** As a user, I want the interface to quantify how "haunted" it is from my deadlines, so that the pressure I see matches how overdue my tasks are.

#### Acceptance Criteria

1. THE Haunting_Core SHALL be a pure function `hauntingLevel(tasks, now)` that computes the Haunting_Level solely from each task's `due_at` and the supplied `now` instant.
2. THE Soon_Threshold SHALL be 24 hours, and a task SHALL be "soon due" WHEN its parseable `due_at` falls in the half-open interval `[now, now + Soon_Threshold)`.
3. A task SHALL be "overdue" WHEN its parseable `due_at` is strictly earlier than `now`.
4. WHEN no task has a parseable `due_at` value, THE Haunting_Core SHALL return Haunting_Level 0.
5. WHEN no task is overdue and no task is soon due, THE Haunting_Core SHALL return Haunting_Level 0.
6. WHEN at least one task is soon due and no task is overdue, THE Haunting_Core SHALL return Haunting_Level 1.
7. WHEN at least one task is overdue and the count of overdue tasks is below Overdue_Level3_Count, THE Haunting_Core SHALL return Haunting_Level 2.
8. WHEN the count of overdue tasks reaches or exceeds Overdue_Level3_Count (3), THE Haunting_Core SHALL return Haunting_Level 3.
9. IF a task's `due_at` is NULL, missing, or unparseable, THEN THE Haunting_Core SHALL exclude that task from both the overdue count and the soon-due check so that it contributes nothing to the Haunting_Level.
10. FOR ALL inputs, THE Haunting_Core SHALL return an integer in the set {0, 1, 2, 3}.
11. WHILE the set of task due timestamps is held constant, THE Haunting_Core SHALL return a Haunting_Level that is non-decreasing as `now` advances (monotonic in time).
12. THE Haunting_Core SHALL return the same Haunting_Level for the same multiset of due timestamps regardless of the order of the tasks (order independence).

### Requirement 6: Whole-page reaction to haunting level

**User Story:** As a user, I want the page to visibly intensify as my deadlines slip, so that I feel urgency without reading every task.

#### Acceptance Criteria

1. WHILE the Haunting_Level equals 0, THE Seance_App SHALL present the page with the baseline ambiance only, displaying no red vignette, no board tremble, no overdue-card shake, and a calm Ghost_Mascot expression.
2. WHILE the Haunting_Level is 1, 2, or 3, THE Seance_App SHALL set the candle glow flicker intensity to one distinct level per Haunting_Level value, such that each successive Haunting_Level produces a visibly stronger flicker than the level below it.
3. WHILE the Haunting_Level is at least 2, THE Seance_App SHALL overlay a red vignette on the page edges at an opacity no greater than 0.25, increasing in opacity from Haunting_Level 2 to Haunting_Level 3.
4. WHILE the Haunting_Level is at least 2, THE Seance_App SHALL animate the board with a tremble that lasts no longer than 1 second per occurrence and repeats intermittently at intervals of no less than 3 seconds.
5. THE Seance_App SHALL render the Haunting_Gauge using gothic theme styling and showing the current Haunting_Level as one of the four discrete values 0, 1, 2, or 3.
6. WHILE a task is an Overdue_Card, THE Seance_App SHALL apply a continuous shaking and glowing treatment to that Overdue_Card for as long as it remains overdue.
7. WHILE the Haunting_Level is at least 2, THE Ghost_Mascot SHALL display a worried expression, and WHILE the Haunting_Level is 0 or 1, THE Ghost_Mascot SHALL display a non-worried expression.
8. IF the Haunting_Level cannot be determined or falls outside the range 0 to 3, THEN THE Seance_App SHALL present the page with the baseline ambiance only and indicate no active haunting effects.

### Requirement 7: Accessible, non-color-only communication

**User Story:** As a user relying on assistive technology or reduced motion, I want the haunting level conveyed as text and without forced motion, so that the interface is usable and comfortable for me.

#### Acceptance Criteria

1. THE Haunting_Gauge SHALL include a visible text label stating the current Haunting_Level as a defined textual value (one of the named Haunting_Level states) so that the level is conveyed by text and not by color alone.
2. WHEN the Haunting_Level changes, THE Seance_App SHALL update the Haunting_Gauge text label to the new Haunting_Level value and announce the new value as text to assistive technology via a polite ARIA live region within 1 second of the change.
3. WHILE Reduced_Motion is active, THE Seance_App SHALL present zero trembling animation on the board and zero shaking animation on any Overdue_Card, holding each element in its static resting position.
4. WHILE Reduced_Motion is active, THE Seance_App SHALL convey the Haunting_Level through static styling and the Haunting_Gauge text label with no motion-based indication.
5. THE Seance_App SHALL convey overdue status of each Overdue_Card through a text indicator or distinct shape indicator in addition to color, such that the overdue state is identifiable without relying on color perception.
6. IF assistive technology cannot access the Haunting_Level announcement because the live region is unavailable, THEN THE Seance_App SHALL retain the current Haunting_Level in the visible Haunting_Gauge text label so that the level remains readable.

### Requirement 8: Preservation of the existing test suite

**User Story:** As a maintainer, I want all existing tests to keep passing, so that this feature adds behavior without regressing the application.

#### Acceptance Criteria

1. WHEN the Existing_Test_Suite (all `tests/*.prop.test.js` run under Node with fast-check and all `tests/test_*.py` run under pytest with Hypothesis) is run after this feature is implemented, THE Existing_Test_Suite SHALL report zero failing tests and zero errors without any modification to existing test files.
2. IF an existing test file would require modification for the Existing_Test_Suite to pass, THEN THE Seance_App SHALL be considered non-compliant and THE implementation SHALL retain the original behavior that keeps that test passing.
3. WHEN a request to `/summon`, `/banish`, or `/` does not use the Due_Input, THE Seance_App SHALL return the same response status, response body structure, and persisted state that the pre-feature implementation returned for that identical request.
4. THE Seance_App SHALL preserve the call signatures (parameter count, order, and names) and return contracts (return type and value semantics) of `normalize_and_validate`, `insert_spirit`, `list_spirits`, and `delete_spirit` for existing callers that do not supply the Due_Input.
5. IF an existing caller invokes `normalize_and_validate`, `insert_spirit`, `list_spirits`, or `delete_spirit` without the Due_Input, THEN THE Seance_App SHALL produce the same return value and the same error-raising behavior as the pre-feature implementation for that identical invocation.

### Requirement 9: Property-based testability with simulated time

**User Story:** As a maintainer, I want property tests that simulate time, so that the haunting logic and due parsing are verified across many scenarios rather than a few examples.

#### Acceptance Criteria

1. THE Haunting_Core SHALL accept the reference instant `now` as an explicit parameter and SHALL NOT read the system clock, so that supplying the same `now` and task inputs produces identical output across repeated invocations.
2. THE Seance_App SHALL expose the Haunting_Core as an importable pure function under Node using the UMD/CommonJS module pattern (as used by the existing age module), such that it can be required and invoked in a Node process with no DOM or browser globals present.
3. THE Seance_App SHALL expose the Due_Parser and the due-related persistence logic as modules importable under pytest without initializing, connecting to, or writing to the production database, such that Hypothesis tests can target an isolated or in-memory store.
4. WHEN property tests supply task due timestamps drawn from the full representable instant range and `now` values drawn from the same range, THE Haunting_Core SHALL satisfy the totality, bounded-output, time-monotonicity, and order-independence properties defined in Requirement 5 for every supplied combination.
5. WHEN property tests supply arbitrary Due_Input values, THE Due_Parser SHALL satisfy the round-trip property defined in Requirement 4 for every value it reports as valid.
6. IF the Haunting_Core receives a `now` value or a task due timestamp that is absent, non-finite, or not a valid instant, THEN THE Haunting_Core SHALL reject that value as invalid input, excluding an invalid task timestamp from the computation and, for an invalid `now`, returning an outcome indicating invalid input without reading the system clock.
