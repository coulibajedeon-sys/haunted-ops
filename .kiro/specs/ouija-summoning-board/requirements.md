# Requirements Document

## Introduction

The Ouija Summoning Board is a new signature feature layered on top of the existing "Séance" app (FastAPI + Jinja2 + SQLite + vanilla JavaScript). It replaces the plain text input as the primary way to summon a task with an interactive, Ouija-style board: an arc of letters A–Z, digits 0–9, and the special markers YES, NO, and GOODBYE. A planchette rendered as inline SVG glides to each character as the spelled name grows, producing a spelling-out effect. A conventional text input remains available as an accessible fallback and stays synchronized with the board in both directions. The spelled name is submitted to the existing `/summon` endpoint, which is left unchanged.

This feature adds one cohesive capability on top of the working app without rewriting it. The existing `/summon` HTTP contract, the existing templates, and all existing tests remain intact. New client behavior is implemented in a new file under `static/`, served under `/static` like `ghost.js` and `banish.js`. Visual styling reuses the existing dark gothic theme (CSS variables `--bg`, `--text`, `--glow`, `--spirit`, the fog layer, and the Cinzel Decorative / IM Fell English fonts) defined inline in `templates/index.html`.

## Glossary

- **Ouija_Board**: The interactive UI component rendered on the main page that displays the character arc, special markers, planchette, and associated controls.
- **Character_Arc**: The visual arrangement of selectable glyphs on the Ouija_Board, consisting of the 26 uppercase letters A–Z and the 10 digits 0–9.
- **Special_Marker**: One of the three non-character controls on the Ouija_Board: YES, NO, and GOODBYE.
- **Planchette**: The inline SVG pointer that moves across the Ouija_Board to indicate the character most recently added to the Spelled_Name.
- **Spelled_Name**: The sequence of characters composing the task name currently being summoned, built through Ouija_Board interaction and/or the Fallback_Input.
- **Fallback_Input**: The standard HTML text input that provides an accessible, keyboard- and screen-reader-friendly way to enter the Spelled_Name.
- **Summon_Control**: The button on the Ouija_Board that submits the Spelled_Name to the Summon_Endpoint.
- **Summon_Endpoint**: The existing server route at `POST /summon` that accepts a form field named `title` (max length 200) and performs the task-creation contract.
- **Board_Controller**: The client-side JavaScript module that manages Ouija_Board state, Planchette movement, synchronization with the Fallback_Input, and submission.
- **Reduced_Motion_Preference**: The user setting exposed to the browser via the `prefers-reduced-motion: reduce` media query.
- **MAX_TITLE_LENGTH**: The maximum permitted length of the Spelled_Name, equal to 200 characters, matching the Summon_Endpoint limit.

## Requirements

### Requirement 1: Render the Ouija Board

**User Story:** As a user, I want a Ouija-style board displayed on the main page, so that I can summon a task by spelling its name on the board.

#### Acceptance Criteria

1. WHEN the main page loads, THE Ouija_Board SHALL render a Character_Arc containing exactly the 26 uppercase letters A through Z and the 10 digits 0 through 9, for a total of 36 distinct, individually selectable characters.
2. WHEN the main page loads, THE Ouija_Board SHALL render exactly three Special_Markers labeled with the English text YES, NO, and GOODBYE.
3. WHEN the main page loads, THE Ouija_Board SHALL render a Planchette as an inline SVG element positioned over the Character_Arc.
4. WHEN the main page loads, THE Ouija_Board SHALL render a Summon_Control labeled with English text that, when activated, submits the current Spelled_Name.
5. IF the Summon_Control is activated WHILE the Spelled_Name contains zero characters, THEN THE Ouija_Board SHALL reject the submission, retain the current Spelled_Name, and display an error indication that a name is required.
6. THE Ouija_Board SHALL display all visible text in English.

### Requirement 2: Build the Spelled Name from Board Interaction

**User Story:** As a user, I want each character I choose on the board to append to the task name, so that I can spell the name one character at a time.

#### Acceptance Criteria

1. WHEN a user activates a character on the Character_Arc, THE Board_Controller SHALL append that character to the Spelled_Name.
2. WHEN a user activates the YES Special_Marker, THE Board_Controller SHALL append the text "YES" to the Spelled_Name.
3. WHEN a user activates the NO Special_Marker, THE Board_Controller SHALL append the text "NO" to the Spelled_Name.
4. WHEN a user activates the GOODBYE Special_Marker, THE Board_Controller SHALL clear the Spelled_Name so that its length is 0 characters.
5. IF appending the activated character or Special_Marker text would cause the Spelled_Name length to exceed MAX_TITLE_LENGTH, THEN THE Board_Controller SHALL leave the Spelled_Name unchanged.
6. IF appending the activated character or Special_Marker text would cause the Spelled_Name length to exceed MAX_TITLE_LENGTH, THEN THE Board_Controller SHALL present an indication that the maximum length has been reached.

### Requirement 3: Move the Planchette to the Spelled Character

**User Story:** As a user, I want the planchette to glide to each character as the name is spelled, so that the board feels like a real séance.

#### Acceptance Criteria

1. WHEN a character that is present on the Character_Arc is appended to the Spelled_Name, THE Planchette SHALL begin moving toward that character's position on the Character_Arc within 100 milliseconds of the append.
2. WHILE Reduced_Motion_Preference is not set, THE Planchette SHALL animate its movement between the current position and the target position over a duration between 150 and 600 milliseconds.
3. WHILE Reduced_Motion_Preference is set, THE Planchette SHALL move to the target position without animation, completing the position change within 100 milliseconds.
4. WHEN the Planchette completes its movement for the most recently added character of the Spelled_Name, THE Planchette SHALL remain centered over that character's position on the Character_Arc until the next character is appended.
5. IF a character appended to the Spelled_Name is not present on the Character_Arc, THEN THE Planchette SHALL remain at its current position and SHALL NOT change the Spelled_Name position indication.

### Requirement 4: Accessible Fallback Input Synchronized with the Board

**User Story:** As a keyboard, screen reader, or mobile user, I want a standard text input that stays in sync with the board, so that I can summon tasks without relying on pointer interaction with the board.

#### Acceptance Criteria

1. THE Fallback_Input SHALL be a standard HTML text input with a visible text label in English that is programmatically associated with the input so assistive technology announces the label when the input receives focus.
2. THE Fallback_Input SHALL carry a maxlength attribute whose value equals MAX_TITLE_LENGTH (200).
3. WHEN the Spelled_Name changes through Ouija_Board interaction, THE Board_Controller SHALL update the Fallback_Input value to equal the Spelled_Name.
4. WHEN a user edits the Fallback_Input and the resulting value length is less than or equal to MAX_TITLE_LENGTH, THE Board_Controller SHALL update the Spelled_Name to equal the Fallback_Input value.
5. IF a user edits the Fallback_Input to a value whose length exceeds MAX_TITLE_LENGTH, THEN THE Board_Controller SHALL update the Spelled_Name to equal the first MAX_TITLE_LENGTH characters of that value.
6. WHEN a user edits the Fallback_Input and the resulting Spelled_Name ends with a character present on the Character_Arc, THE Planchette SHALL indicate that character's position on the Character_Arc.
7. IF a user edits the Fallback_Input and the resulting Spelled_Name is empty or ends with a character not present on the Character_Arc, THEN THE Planchette SHALL remain at its current position on the Character_Arc.

### Requirement 5: Submit the Spelled Name to the Existing Endpoint

**User Story:** As a user, I want the summon action to submit my spelled name to the existing endpoint, so that the task is created exactly as before.

#### Acceptance Criteria

1. WHEN a user activates the Summon_Control, THE Board_Controller SHALL submit the Spelled_Name to the Summon_Endpoint using an HTTP POST request.
2. THE Board_Controller SHALL submit the Spelled_Name in a form field named `title`.
3. THE Board_Controller SHALL submit a `title` value whose length is between 1 and MAX_TITLE_LENGTH characters inclusive.
4. IF the Spelled_Name is empty or contains only whitespace characters WHEN a user activates the Summon_Control, THEN THE Board_Controller SHALL NOT submit a request to the Summon_Endpoint and SHALL display an error indication that a name is required.
5. WHEN a summon request to the Summon_Endpoint responds with an HTTP 303 redirect, THE Board_Controller SHALL navigate to the redirect target returned by the response.
6. IF a summon request to the Summon_Endpoint fails to complete or returns a response other than HTTP 303, THEN THE Board_Controller SHALL preserve the current Spelled_Name without clearing it and SHALL display an error indication that the summon did not succeed.
7. THE Ouija_Board SHALL preserve the existing Summon_Endpoint contract in which a successful summon responds with an HTTP 303 redirect, an empty or whitespace-only title responds with an HTTP 200 re-render containing an error message, and a title longer than MAX_TITLE_LENGTH responds with HTTP 422.

### Requirement 6: Dark Gothic Theme Consistency

**User Story:** As a user, I want the board to match the existing gothic look, so that the page feels like one cohesive séance experience.

#### Acceptance Criteria

1. THE Ouija_Board SHALL apply the candlelight amber glow to its headings and primary buttons using the existing `--glow` CSS variable.
2. THE Ouija_Board SHALL use the existing CSS variables `--bg`, `--text`, and `--spirit` for its background, text, and accent colors.
3. THE Ouija_Board SHALL render its headings and labels using the existing Cinzel Decorative and IM Fell English font families with a serif fallback.
4. THE Ouija_Board SHALL render against the existing fog background layer such that the fog layer remains behind the board content and visible.

### Requirement 7: Preserve the Existing Application

**User Story:** As a maintainer, I want the new feature added without altering existing behavior, so that current tests and the existing app keep working.

#### Acceptance Criteria

1. WHEN a client requests the Board_Controller script under the `/static` path, THE Ouija_Board feature SHALL serve the Board_Controller as a static JavaScript resource with a success response.
2. IF the Board_Controller is unavailable in the client, THEN THE Fallback_Input SHALL remain usable to submit a task through the Summon_Endpoint such that a valid submitted task is persisted and appears in the task list.
3. THE Ouija_Board feature SHALL preserve the existing Summon_Endpoint request/response contract unchanged, accepting the same request inputs and producing the same observable responses as before the feature was added.
4. THE Ouija_Board feature SHALL keep all existing Python property tests and JavaScript property tests passing without any modification to those tests.
