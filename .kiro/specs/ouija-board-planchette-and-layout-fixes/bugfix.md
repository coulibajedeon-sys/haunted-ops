# Bugfix Requirements Document

## Introduction

This is a scoped fix round on the already-working Ouija board of the **haunted-ops**
Séance app (FastAPI + Jinja2 + vanilla JS). The board lets a user spell a task name on
a Ouija plateau (26 letters A–Z + 10 digits 0–9, plus YES/NO/GOODBYE markers), glides a
planchette toward the active glyph, keeps a Fallback_Input in sync, and submits `title`
to the existing `POST /summon` endpoint.

Three defects remain in the current build:

1. **Planchette mis-targeting on YES/NO.** The planchette is moved by
   `movePlanchetteTo(index) → arcPosition(index, 36)` (pure arc/digit math) using the
   target `index = charIndex(lastArcChar(name))`. Clicking **YES** appends `"YES"` and
   **NO** appends `"NO"`; both end in an arc letter (`S` / `O`), so the planchette glides
   to the letter `S` / `O` on the arc instead of to the YES/NO marker button. GOODBYE
   clears the name so it happens to look fine. The planchette only ever lands where the
   pure arc math says a glyph *should* be, which also drifts from the real on-screen
   element whenever layout/scale changes.
2. **Arc not centered / glyphs clipping at the edges and overlapping near the apex.** The
   current letter arc is not symmetric about the board center and some pills (near M/N and
   at the ends) crowd or overlap and can sit against the inner border at some viewport
   widths.
3. **Planchette does not read as a classic planchette** (it reads like a map pin), and the
   `Q` renders with a decorative swash in the engraved serif stack.

### Global Constraints (apply to every requirement and task)

- MUST NOT modify `main.py` or the `POST /summon` contract.
- MUST keep the pure-function core of `static/board.js` testable under Node.
- MUST keep ALL existing tests passing: `npm test` is currently **24/24**; Python
  `pytest` is currently **25 passed**.
- MUST NOT change the behavior of `appendChar`, `appendMarker`, `setName`, `capName`,
  `charIndex`, or `lastArcChar`.
- MUST NOT edit the existing content of any existing test file.
- ONLY `static/board.js` and `templates/index.html` may change, plus ONE NEW optional
  test file (`tests/board.rect.prop.test.js`).
- Plain HTML / CSS / inline SVG / vanilla JS only. No frameworks, no external images, no
  `url()` / `@import`. English only. MUST respect `prefers-reduced-motion`.

### Bug Condition (methodology)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type Interaction   // a click/type/resize against the board
  OUTPUT: boolean

  // The planchette's resting point disagrees with the real on-screen center
  // of the element the interaction targets.
  RETURN (X is click on YES or NO marker)                    // lands on letter S/O instead
      OR (X moves the planchette and the pure arc/digit math
          disagrees with getBoundingClientRect of the target) // layout/scale drift
END FUNCTION
```

The fix (`F'`) targets the **real on-screen center** of the target element via
`getBoundingClientRect()` measured relative to the board container, for ALL glyphs and
markers, and recomputes on window resize.

**Targeting decision (from user):** when **typing** "YES"/"NO" with the keyboard, the
planchette targets the **last typed letter's glyph** element (`S`, `O`, …) — NOT the
marker. The YES/NO/GOODBYE markers are targeted only when their **buttons are clicked**.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user clicks the YES marker button THEN the system glides the planchette to the letter `S` glyph on the arc (because `"YES"` ends in `S`), not to the YES marker button.

1.2 WHEN the user clicks the NO marker button THEN the system glides the planchette to the letter `O` glyph on the arc (because `"NO"` ends in `O`), not to the NO marker button.

1.3 WHEN the board is rendered or resized THEN the system positions the planchette using pure `arcPosition(index, 36)` math, which can disagree with the glyph's real on-screen center under layout changes or scaling.

1.4 WHEN the letter arc is rendered THEN the system places letters on an arc that is not symmetric about the board horizontal center and whose end/apex pills can sit against or outside the inner border, and adjacent letters near the apex (e.g. M/N) can overlap.

1.5 WHEN the planchette is displayed THEN the system renders a shape that reads as a map pin rather than a classic planchette, and the `Q` glyph renders with a decorative swash.

### Expected Behavior (Correct)

2.1 WHEN the user clicks the YES, NO, or GOODBYE marker button THEN the system SHALL glide the planchette to the real on-screen center of that clicked marker button, measured via `getBoundingClientRect()` relative to the board container.

2.2 WHEN the user types a character (or the last arc character of the name changes) THEN the system SHALL glide the planchette to the real on-screen center of the glyph element for the last arc character (so typing "YES"/"NO" targets the `S` / `O` glyph, by design), and SHALL NOT move when the name is empty or ends off-arc (`lastArcChar` is `null`).

2.3 WHEN the viewport is resized THEN the system SHALL recompute the target element and container rects on the next move (and reposition the planchette to the current target on resize) so the planchette stays on the correct element.

2.4 WHEN the letter arc is rendered at any viewport width THEN the system SHALL place the 26 letters on an arc symmetric about the board horizontal center, with every glyph pill fully inside the inner border and with no adjacent-letter overlap.

2.5 WHEN the planchette is displayed THEN the system SHALL render a classic planchette (wide rounded heart/guitar-pick tapering to a soft point, a clear circular center window framing the glyph, aged-wood body, gold outline) and SHALL render `Q` without a decorative swash.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `appendChar`, `appendMarker`, `setName`, `capName`, `charIndex`, or `lastArcChar` is called THEN the system SHALL CONTINUE TO return exactly the same results as today (no behavior change to the pure Spelled_Name core).

3.2 WHEN the user submits the form THEN the system SHALL CONTINUE TO POST `title` to `/summon` unchanged (303 on success, 200 on render, 422 on validation), with `main.py` and the `/summon` contract untouched.

3.3 WHEN `npm test` and `pytest` run THEN the system SHALL CONTINUE TO pass all existing tests (24/24 JS, 25 Python), including `tests/board.geom.prop.test.js` (every letter `y <= DIGIT_ROW_Y`, all 36 centers distinct, digits on the right-hand row) and `tests/board.prop.test.js`.

3.4 WHEN the digit row is rendered THEN the system SHALL CONTINUE TO use the unchanged `DIGIT_*` constants and place the 10 digits on the straight right-hand row.

3.5 WHEN `prefers-reduced-motion: reduce` is set THEN the system SHALL CONTINUE TO move the planchette instantly (no transition) and disable decorative animation.
