# Requirements Document

## Introduction

The Ouija Board Visual Polish feature is a presentation-only enhancement of the already-working Ouija summoning board (feature `ouija-summoning-board`) in the existing "Séance" app (FastAPI + Jinja2 + SQLite + vanilla JavaScript). The board already composes a spelled-out task name on an arc of 36 glyphs (A–Z and 0–9), handles the YES/NO/GOODBYE markers, enforces a 200-character cap, keeps a text fallback input synchronized in both directions, and submits to the existing `POST /summon` endpoint. All of that logic is complete and tested.

This feature improves only how the board looks and animates. It fixes glyph spacing and overlap, redesigns the planchette as a classic transparent-window planchette in inline SVG, corrects typography (readable engraved font, ligatures disabled), applies an aged dark wooden spirit-board appearance with gold engraved glyphs and an ornate border, adds corner candlelight, and removes the duplicate ghost emoji from the page title so only the mascot ghost remains.

The scope is strictly visual. The board's Spelled_Name composition logic, marker behavior, 200-character cap, bidirectional synchronization, and submit-to-`/summon` behavior are unchanged. The server (`main.py`) is unchanged. No existing test file is modified, and every existing test (JavaScript property tests `tests/board.prop.test.js`, `tests/ghost.prop.test.js`, `tests/banish.prop.test.js`, and the Python pytest suite) keeps passing. The only JavaScript change permitted is adjusting the board's layout geometry (the `arcPosition` / `arcAngle` / `geom` glyph-placement values) when, and only when, that adjustment is required to keep the planchette aligned with the new visual layout; the pure-core string and resolution functions must not change. Only plain HTML, CSS, inline SVG, and the existing vanilla JavaScript are used, with no new frameworks, no external image files, no paid APIs, and no new network dependencies. New motion respects the user's reduced-motion preference, and all visible text is in English.

## Glossary

- **Ouija_Board**: The interactive UI component rendered on the main page that displays the Character_Arc, Special_Markers, Planchette, and associated controls.
- **Character_Arc**: The visual arrangement of selectable glyphs on the Ouija_Board, consisting of the 26 uppercase letters A–Z and the 10 digits 0–9.
- **Glyph**: A single selectable character on the Character_Arc (one letter or one digit).
- **Special_Marker**: One of the three non-character controls on the Ouija_Board: YES, NO, and GOODBYE.
- **Planchette**: The inline SVG pointer that moves across the Ouija_Board to indicate the character most recently added to the Spelled_Name.
- **Planchette_Window**: The transparent circular opening at the center of the Planchette through which the targeted Glyph is visible.
- **Spelled_Name**: The sequence of characters composing the task name currently being summoned.
- **Last_Arc_Character**: The last character of the Spelled_Name when that character is present on the Character_Arc.
- **Fallback_Input**: The standard HTML text input that provides an accessible way to enter the Spelled_Name, synchronized with the Ouija_Board.
- **Board_Controller**: The client-side JavaScript module (`static/board.js`) that manages Ouija_Board state, Planchette movement, synchronization with the Fallback_Input, and submission.
- **Pure_Core_Functions**: The behavior-bearing, DOM-free functions of the Board_Controller: `appendChar`, `appendMarker`, `setName`, `charIndex`, and `lastArcChar`.
- **Layout_Geometry**: The presentation-only glyph-placement values and functions of the Board_Controller (`geom`, `arcAngle`, `arcPosition`) used to position glyphs and the Planchette.
- **Summon_Endpoint**: The existing server route at `POST /summon` that accepts a form field named `title` (max length 200).
- **Ghost_Mascot**: The ghost figure and contextual message rendered in the `#mascot` block beneath the page title.
- **Page_Title**: The main `<h1>` heading of the page.
- **Reduced_Motion_Preference**: The user setting exposed to the browser via the `prefers-reduced-motion: reduce` media query.
- **Fog_Layer**: The existing animated background layer rendered behind page content.
- **Theme_Variables**: The existing CSS custom properties `--bg`, `--text`, `--glow`, and `--spirit`.
- **MAX_TITLE_LENGTH**: The maximum permitted length of the Spelled_Name, equal to 200 characters.

## Requirements

### Requirement 1: Non-Overlapping, Legible Glyph Layout

**User Story:** As a user, I want every letter and digit on the board to be clearly spaced and readable, so that I can distinguish and select each glyph without characters overlapping.

#### Acceptance Criteria

1. WHEN the main page loads, THE Ouija_Board SHALL render all 36 Glyphs (the 26 letters A–Z and the 10 digits 0–9) such that no Glyph's rendered bounding box overlaps the rendered bounding box of any other Glyph.
2. WHEN the main page loads, THE Ouija_Board SHALL arrange the 26 letter Glyphs along the upper arc and the 10 digit Glyphs on a separate straight row positioned below the letter arc.
3. THE Ouija_Board SHALL render each Glyph at a minimum rendered font size of 16 pixels.
4. WHEN a character that is present on the Character_Arc is appended to the Spelled_Name, THE Planchette SHALL target the rendered position of that character's Glyph in the layout defined by this requirement.
5. WHEN the Spelled_Name ends with a Last_Arc_Character, THE Planchette_Window SHALL be centered over the rendered position of that character's Glyph.

### Requirement 2: Classic Planchette Redesign

**User Story:** As a user, I want the pointer to look like a classic wooden planchette with a window over the current letter, so that the board feels authentic.

#### Acceptance Criteria

1. WHEN the main page loads, THE Ouija_Board SHALL render the Planchette as an inline SVG element shaped as a rounded heart or teardrop form.
2. THE Planchette SHALL contain a Planchette_Window rendered as a transparent circular opening at the center of the Planchette through which the Glyph beneath the Planchette remains visible.
3. THE Planchette SHALL render a drop shadow and a candlelight glow using the `--glow` Theme_Variable.
4. WHEN the Board_Controller moves the Planchette for the most recently added Last_Arc_Character, THE Planchette_Window SHALL come to rest centered over that character's Glyph position.
5. THE Ouija_Board SHALL render the Planchette using only inline SVG and CSS without referencing any external image file.

### Requirement 3: Readable Engraved Typography Without Decorative Ligatures

**User Story:** As a user, I want the glyphs and marker words to read clearly, so that "NO" and "GOODBYE" do not render with decorative swashes or merged letters.

#### Acceptance Criteria

1. THE Ouija_Board SHALL render all Glyphs and all Special_Marker labels with the CSS declaration `font-variant-ligatures: none` applied so that letter combinations render as separate letters without decorative ligatures.
2. THE Ouija_Board SHALL render all Glyphs and all Special_Marker labels in an engraved-style font with a serif fallback.
3. THE Ouija_Board SHALL render the YES, NO, and GOODBYE Special_Marker labels as the readable English text "YES", "NO", and "GOODBYE" without decorative swashes.
4. THE Ouija_Board SHALL display all visible text in English.

### Requirement 4: Aged Wooden Spirit-Board Appearance

**User Story:** As a user, I want the board to look like an aged dark wooden spirit board, so that the page feels like a real séance artifact.

#### Acceptance Criteria

1. THE Ouija_Board SHALL render an aged dark wood-grain surface using only CSS gradients or inline SVG without referencing any external image file.
2. THE Ouija_Board SHALL render the Glyphs and Special_Marker labels in a gold engraved-looking color.
3. THE Ouija_Board SHALL render an ornate decorative border around the board surface using only CSS or inline SVG.
4. THE Ouija_Board SHALL use the existing Theme_Variables `--bg`, `--text`, `--glow`, and `--spirit` for its base colors and accents.

### Requirement 5: Corner Candlelight

**User Story:** As a user, I want flickering candlelight in the corners, so that the board feels lit by candles during the séance.

#### Acceptance Criteria

1. WHEN the main page loads, THE Ouija_Board SHALL render a candlelight glow in its corners using only CSS.
2. WHILE Reduced_Motion_Preference is not set, THE Ouija_Board SHALL animate the corner candlelight with a flickering effect.
3. WHILE Reduced_Motion_Preference is set, THE Ouija_Board SHALL render the corner candlelight as a static glow without flicker animation.

### Requirement 6: Single Ghost On The Page

**User Story:** As a user, I want only one ghost on the page, so that the title and mascot do not show duplicate ghosts.

#### Acceptance Criteria

1. WHEN the main page loads, THE Page_Title SHALL render the heading text without a ghost emoji character.
2. WHEN the main page loads, THE Ghost_Mascot SHALL remain rendered beneath the Page_Title.

### Requirement 7: Preserve Board Logic And Alignment

**User Story:** As a maintainer, I want the board's tested logic left intact, so that the visual changes do not alter behavior.

#### Acceptance Criteria

1. THE Ouija_Board feature SHALL keep the Pure_Core_Functions `appendChar`, `appendMarker`, `setName`, `charIndex`, and `lastArcChar` unchanged in behavior.
2. THE Ouija_Board feature SHALL preserve the Spelled_Name composition behavior, the Special_Marker behavior, the MAX_TITLE_LENGTH cap of 200 characters, and the bidirectional synchronization between the Ouija_Board and the Fallback_Input.
3. WHERE the Layout_Geometry values or functions `geom`, `arcAngle`, and `arcPosition` are adjusted, THE Ouija_Board feature SHALL change them only to keep the Planchette aligned with the glyph layout defined in Requirement 1.
4. WHEN a user activates the Summon_Control, THE Board_Controller SHALL submit the Spelled_Name to the Summon_Endpoint in a form field named `title` as before.
5. THE Ouija_Board feature SHALL leave the server module `main.py` unchanged.

### Requirement 8: Preserve Existing Tests And Tooling Constraints

**User Story:** As a maintainer, I want the visual work to pass all existing tests without modifying them, so that the app stays green.

#### Acceptance Criteria

1. THE Ouija_Board feature SHALL keep the existing JavaScript property tests `tests/board.prop.test.js`, `tests/ghost.prop.test.js`, and `tests/banish.prop.test.js` passing without any modification to those test files.
2. THE Ouija_Board feature SHALL keep the existing Python pytest suite passing without any modification to those test files.
3. THE Ouija_Board feature SHALL implement all visual changes using only plain HTML, CSS, inline SVG, and the existing vanilla JavaScript.
4. THE Ouija_Board feature SHALL add no new framework, no external image file, no paid API, and no new network dependency.

### Requirement 9: Preserve Accessibility, Graceful Degradation, And Background

**User Story:** As a keyboard, screen reader, or mobile user, I want the accessible behaviors to keep working after the visual changes, so that the board remains usable for everyone.

#### Acceptance Criteria

1. THE Fallback_Input SHALL remain a standard HTML text input with a programmatically associated English label and a maxlength attribute whose value equals MAX_TITLE_LENGTH.
2. WHEN a user navigates the Ouija_Board using a keyboard, THE Ouija_Board SHALL expose the Glyphs, Special_Markers, and Summon_Control as focusable, operable controls with a visible focus indication.
3. IF the Board_Controller is unavailable in the client, THEN THE Fallback_Input SHALL remain usable to submit a task through the Summon_Endpoint such that a valid submitted task is persisted and appears in the task list.
4. THE Ouija_Board feature SHALL render the Ouija_Board such that the Fog_Layer remains behind the board content and visible.
