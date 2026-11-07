# Requirements Document

## Introduction

The Oracle Board feature adds a spirit-oracle mode to the already-working Ouija summoning board (feature `ouija-summoning-board`, later polished by `ouija-board-visual-polish` and `ouija-board-planchette-and-layout-fixes`) in the existing "Séance" app (FastAPI + Jinja2 + SQLite + vanilla JavaScript). Today the board lets a user *compose* a task name on an arc of 36 glyphs (A–Z and 0–9), using the YES/NO/GOODBYE markers, a 200-character cap, a synchronized text fallback input, and submission to `POST /summon`. That behavior is complete and tested and stays untouched.

This feature gives the board a second purpose: it *answers questions by spelling the answer itself*. Four preset question buttons are added to the page. When the user picks one, a pure function computes a short uppercase answer from the current task list using deterministic rules (no AI API, no randomness except an optional seeded one). The planchette then glides by itself, letter by letter, along the existing glyph layout to spell that answer, pausing briefly on each character and then resting. The spelled answer is also written to an `aria-live="polite"` region so screen-reader users receive it immediately, and the ghost mascot reacts (curious while spelling, happy at the end). While the planchette is spelling, the question buttons and the text input are disabled; they are re-enabled when the animation finishes. When the user prefers reduced motion, the gliding is skipped and the answer text appears instantly.

The scope is additive. The server module `main.py` is unchanged, and the `POST /summon` and `POST /banish/{task_id}` contracts (form field `title`, the 200-character cap, the JSON/redirect responses) are unchanged. Every existing test keeps passing without modification: the JavaScript property suites under `tests/*.prop.test.js` and the Python pytest suite. The new answer-computing logic lives in reusable pure functions that run under Node, and new property tests cover them. Only plain HTML, CSS, inline SVG, and the existing vanilla JavaScript are used — no new framework, no external image file, no paid or networked API, and no new library. All visible text is in English.

## Glossary

- **Oracle_Board**: The spirit-oracle mode added to the existing Ouija_Board, by which the board answers a preset question by spelling the answer with the Planchette.
- **Ouija_Board**: The interactive UI component on the main page that displays the Character_Arc, Special_Markers, Planchette, and associated controls (existing feature).
- **Character_Arc**: The 36 selectable glyphs on the Ouija_Board — the 26 uppercase letters A–Z and the 10 digits 0–9 — each rendered as a `button[data-char]`.
- **Glyph**: A single selectable character on the Character_Arc (one letter or one digit).
- **Planchette**: The inline SVG pointer that moves across the board; the existing Board_Controller moves it by writing `transform: translate(x, y)` so its window centers on a target Glyph.
- **Preset_Question**: One of the four fixed questions offered to the user: "Which first?", "What is oldest?", "How many spirits?", and "Is it quiet?".
- **Question_Button**: A focusable, operable control that selects one Preset_Question and starts the Oracle_Board answering it.
- **Question_Id**: A stable identifier for a Preset_Question, independent of its display label, used by `oracleAnswer`.
- **Task_List**: The current list of summoned tasks, each a record with at least an `id`, a `title`, and a `created_at` value (a `datetime('now')` text timestamp or an absent/empty value for an unknown age), ordered by `id` descending as rendered by the server.
- **Oracle_Answer**: The short, uppercase string the Oracle_Board spells in response to a Preset_Question.
- **Answer_Charset**: The only characters an Oracle_Answer may contain: the uppercase letters A–Z, the digits 0–9, and the space character.
- **Answer_Length_Limit**: The maximum length of an Oracle_Answer, equal to 24 characters.
- **oracleAnswer**: The pure function `oracleAnswer(tasks, questionId, now)` that computes the Oracle_Answer from the Task_List, a Question_Id, and a reference time.
- **Spelling_Animation**: The self-driven, letter-by-letter movement of the Planchette that spells an Oracle_Answer, pausing on each spellable character before coming to rest.
- **Answer_Region**: An `aria-live="polite"` element that displays the Oracle_Answer as text.
- **Board_Controller**: The client-side module `static/board.js` that manages board state, Planchette movement (`createBoard`, `movePlanchetteToElement`, `movePlanchetteTo`), the pure geometry (`geom`, `arcPosition`, `scaledArcPosition`), and the pure Spelled_Name core.
- **Ghost_Mascot**: The ghost figure and contextual message in the `#mascot` block, controlled by `static/ghost.js` (`createMascot`, `setExpression`, `celebrateEmpty`, `activity`).
- **Reduced_Motion_Preference**: The user setting exposed to the browser via the `prefers-reduced-motion: reduce` media query.
- **Summon_Endpoint**: The existing server route `POST /summon`, accepting a form field `title` (max length 200).
- **Pure_Core**: Behavior-bearing, DOM-free, Node-safe functions (no document, no network, no mutation of inputs), of which `oracleAnswer` is the new member.

## Requirements

### Requirement 1: Preset Question Buttons

**User Story:** As a user, I want a few one-tap questions near the board, so that I can ask the spirits something without typing.

#### Acceptance Criteria

1. WHEN the main page loads, THE Oracle_Board SHALL render exactly four Question_Buttons with the English labels "Which first?", "What is oldest?", "How many spirits?", and "Is it quiet?".
2. THE Oracle_Board SHALL render the four Question_Buttons below or beside the Ouija_Board, without overlapping the Character_Arc, the Special_Markers, or the Planchette.
3. THE Oracle_Board SHALL render each Question_Button as a native `button` element of type `button` so that activating it never submits the summon form.
4. WHEN a user navigates to a Question_Button using a keyboard, THE Oracle_Board SHALL expose it as a focusable, operable control with a visible focus indication.
5. WHEN a user activates a Question_Button, THE Oracle_Board SHALL begin answering that button's Preset_Question.

### Requirement 2: Deterministic Pure Answer Computation

**User Story:** As a maintainer, I want the oracle's answer computed by a pure, testable function, so that the behavior is deterministic and verifiable without a browser or an AI service.

#### Acceptance Criteria

1. THE Board_Controller SHALL expose a function `oracleAnswer(tasks, questionId, now)` that returns the Oracle_Answer for the given Task_List, Question_Id, and reference time.
2. THE `oracleAnswer` function SHALL be a Pure_Core member: it SHALL NOT access the DOM, make a network request, call any AI service, or mutate its arguments, and it SHALL be loadable and callable under Node via `require`.
3. THE `oracleAnswer` function SHALL return a string containing only characters from the Answer_Charset (uppercase A–Z, digits 0–9, and the space).
4. THE `oracleAnswer` function SHALL return a string whose length is at most the Answer_Length_Limit of 24 characters.
5. WHEN the Task_List is empty, THE `oracleAnswer` function SHALL return the literal answer "GOODBYE" for every Question_Id.
6. WHEN `oracleAnswer` is called twice with equal Task_List, Question_Id, and reference-time arguments, THE two returned Oracle_Answers SHALL be identical (determinism).
7. WHERE randomness is used by `oracleAnswer`, THE randomness SHALL be derived solely from a caller-supplied seed so that the result remains reproducible, and no other source of randomness SHALL be used.
8. THE `oracleAnswer` function SHALL return a valid Oracle_Answer (within the Answer_Charset and the Answer_Length_Limit, never throwing) for any Task_List and any Question_Id, including an unrecognized Question_Id.

### Requirement 3: Answer Rules Per Question

**User Story:** As a user, I want each question to produce a sensible answer drawn from my current tasks, so that the oracle feels like it is reading my list.

#### Acceptance Criteria

1. WHEN a user asks "Which first?" with a non-empty Task_List, THE `oracleAnswer` function SHALL return an answer derived from the name of the task the app presents first (the first task in the server-rendered order), reduced to the Answer_Charset and truncated to the Answer_Length_Limit.
2. WHEN a user asks "What is oldest?" with a non-empty Task_List, THE `oracleAnswer` function SHALL return an answer derived from the name of the oldest task, where age is determined by `created_at` when present and otherwise by the task's position in the server-rendered order, reduced to the Answer_Charset and truncated to the Answer_Length_Limit.
3. WHEN a user asks "How many spirits?", THE `oracleAnswer` function SHALL return the count of tasks in the Task_List rendered as decimal digits.
4. WHEN a user asks "Is it quiet?", THE `oracleAnswer` function SHALL return "YES" when the Task_List is empty and "NO" when the Task_List is non-empty.
5. WHEN deriving an answer from a task name, THE `oracleAnswer` function SHALL uppercase letters, map or drop characters outside the Answer_Charset, collapse the result to the Answer_Charset, and truncate it to the Answer_Length_Limit.
6. IF deriving an answer from a task name yields no Answer_Charset characters, THEN THE `oracleAnswer` function SHALL return a non-empty fallback answer within the Answer_Charset and the Answer_Length_Limit.

### Requirement 4: Self-Spelling Planchette Animation

**User Story:** As a user, I want the planchette to glide by itself and spell the answer, so that the board feels like it is channeling a spirit.

#### Acceptance Criteria

1. WHILE Reduced_Motion_Preference is not set, WHEN the Oracle_Board answers a Preset_Question, THE Planchette SHALL move by itself to each spellable character of the Oracle_Answer in order, pausing briefly on each character before moving to the next.
2. THE Spelling_Animation SHALL target each spellable character using the existing Planchette positioning (the Board_Controller resolving a `data-char` Glyph and moving the Planchette to that Glyph's measured center relative to the board container), so the Planchette rests over the correct Glyph for each character.
3. WHERE an Oracle_Answer character is a space or any character not present on the Character_Arc, THE Spelling_Animation SHALL leave the Planchette at its current position for that character (no Glyph to target) and continue with the next character.
4. WHEN the Spelling_Animation reaches the last spellable character, THE Planchette SHALL come to rest on that character.
5. THE Oracle_Board SHALL NOT alter the Spelled_Name composed in the Fallback_Input as a result of running the Spelling_Animation.
6. WHEN the Oracle_Board answers a Preset_Question while a previous Spelling_Animation is still running, THE Oracle_Board SHALL not run two Spelling_Animations concurrently.

### Requirement 5: Controls Disabled During Spelling

**User Story:** As a user, I want the controls to pause while the spirit spells, so that I do not disturb the answer mid-spelling.

#### Acceptance Criteria

1. WHILE a Spelling_Animation is running, THE Oracle_Board SHALL disable all four Question_Buttons.
2. WHILE a Spelling_Animation is running, THE Oracle_Board SHALL disable the Fallback_Input.
3. WHEN a Spelling_Animation finishes, THE Oracle_Board SHALL re-enable the four Question_Buttons and the Fallback_Input that it disabled.
4. WHERE the Fallback_Input was already disabled before a Spelling_Animation started (for example because the database is unreachable), THE Oracle_Board SHALL leave that control disabled after the Spelling_Animation finishes.
5. WHEN a Spelling_Animation finishes in the reduced-motion path, THE Oracle_Board SHALL leave the Question_Buttons and the Fallback_Input in the same enabled state they had before the answer was requested.

### Requirement 6: Accessible Answer Text And Mascot Reaction

**User Story:** As a screen-reader user, I want the spelled answer announced as text, and as a sighted user I want the mascot to react, so that the oracle is understandable and expressive for everyone.

#### Acceptance Criteria

1. THE Oracle_Board SHALL render an Answer_Region as an element with `aria-live="polite"`.
2. WHEN the Oracle_Board answers a Preset_Question, THE Oracle_Board SHALL write the Oracle_Answer as text into the Answer_Region.
3. WHILE the Spelling_Animation is running, THE Ghost_Mascot SHALL display a curious reaction.
4. WHEN the Spelling_Animation finishes, THE Ghost_Mascot SHALL display a happy reaction.
5. WHERE the Ghost_Mascot controller is unavailable in the client, THE Oracle_Board SHALL still write the Oracle_Answer into the Answer_Region and complete without error.

### Requirement 7: Reduced-Motion Behavior

**User Story:** As a user who prefers reduced motion, I want the answer shown instantly without gliding, so that the board respects my motion setting.

#### Acceptance Criteria

1. WHILE Reduced_Motion_Preference is set, WHEN the Oracle_Board answers a Preset_Question, THE Oracle_Board SHALL skip the letter-by-letter gliding of the Planchette.
2. WHILE Reduced_Motion_Preference is set, WHEN the Oracle_Board answers a Preset_Question, THE Oracle_Board SHALL write the complete Oracle_Answer into the Answer_Region immediately.
3. WHILE Reduced_Motion_Preference is set, THE Oracle_Board SHALL determine the Oracle_Answer using the same `oracleAnswer` computation used in the animated path.

### Requirement 8: Preserve Server Contracts, Existing Behavior, And Tests

**User Story:** As a maintainer, I want the oracle added without disturbing the server, the summon/banish behavior, or the test suites, so that the app stays green.

#### Acceptance Criteria

1. THE Oracle_Board feature SHALL leave the server module `main.py` unchanged.
2. THE Oracle_Board feature SHALL leave the `POST /summon` contract (form field `title`, the 200-character cap, the redirect and error responses) and the `POST /banish/{task_id}` contract unchanged.
3. THE Oracle_Board feature SHALL keep the existing Spelled_Name composition, the Special_Marker behavior, the 200-character cap, and the bidirectional synchronization between the Ouija_Board and the Fallback_Input unchanged in behavior.
4. THE Oracle_Board feature SHALL keep every existing JavaScript property test under `tests/*.prop.test.js` passing without modifying those test files.
5. THE Oracle_Board feature SHALL keep the existing Python pytest suite passing without modifying those test files.

### Requirement 9: Property Tests For The Pure Core

**User Story:** As a maintainer, I want property tests over the oracle logic, so that its charset, length, empty-list, and determinism guarantees are enforced automatically.

#### Acceptance Criteria

1. THE Oracle_Board feature SHALL add a JavaScript property test suite that exercises `oracleAnswer` using the repository's existing test runner and property-testing library (`node:test` with `fast-check`).
2. THE property test suite SHALL assert that for arbitrary Task_Lists and Question_Ids, every Oracle_Answer contains only Answer_Charset characters.
3. THE property test suite SHALL assert that for arbitrary Task_Lists and Question_Ids, every Oracle_Answer has length at most the Answer_Length_Limit of 24 characters.
4. THE property test suite SHALL assert that for an empty Task_List, `oracleAnswer` returns "GOODBYE" for every Question_Id.
5. THE property test suite SHALL assert that `oracleAnswer` is deterministic: equal arguments produce equal answers across repeated calls.
6. THE property test suite SHALL run at least 100 iterations per property, consistent with the repository's existing suites.

### Requirement 10: Tooling And Delivery Constraints

**User Story:** As a maintainer, I want the oracle built with the existing stack only, so that it adds no new dependencies or assets.

#### Acceptance Criteria

1. THE Oracle_Board feature SHALL implement all changes using only plain HTML, CSS, inline SVG, and the existing vanilla JavaScript.
2. THE Oracle_Board feature SHALL add no new framework, no external image file, no paid or networked API, and no new runtime or test library beyond those already used by the repository.
3. THE Oracle_Board feature SHALL display all visible text in English.
4. WHILE Reduced_Motion_Preference is set, THE Oracle_Board SHALL respect it as specified in Requirement 7 using the same mechanism the board already uses to detect reduced motion.
