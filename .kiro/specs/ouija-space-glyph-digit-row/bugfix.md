# Bugfix Requirements Document

## Introduction

The Ouija board shows a glyph in the visible row that looks wrong: an empty circle appears among the characters with no character inside it, and it sits in the digit row area between "4" and "5". The user understands this empty circle to be a "space" glyph — a target the planchette can rest on when spelling oracle answers that contain spaces (for example "OLDEST ALPHA" or "3 SPIRITS").

Empirically, the current board renders exactly 26 letter glyphs (A–Z) on the arc and exactly 10 digit glyphs (0–9) in the straight digit row, with no space button in the markup and no space position in the shared geometry. The visible digit row therefore must never contain a character-less circle. Separately, when an oracle answer contains a space, the planchette does not rest on a dedicated position: because a space is not an arc character, the controller leaves the planchette on the previous glyph during the pause.

This bugfix removes any empty, character-less glyph from the visible digit row (which must contain only 0–9, evenly spaced and centered) while giving the planchette a dedicated, invisible rest position for spaces (near the arc center, below the letters). Spelling of answers that contain spaces must keep working, with a short pause on the space. The server contract (`main.py`, `/summon`, `/banish`) and all currently passing tests must be preserved; a test is updated only if it asserts the old space-glyph position.

## Bug Analysis

### Current Behavior (Defect)

What currently goes wrong, expressed over the rendered board and the spelling animation.

1.1 WHEN the Ouija board is rendered THEN the digit row contains a visible glyph circle that has no character inside it, breaking the "digits 0–9 only" layout.

1.2 WHEN a character-less glyph is present in the digit row THEN the digit row is no longer exactly the ten evenly spaced, centered digits 0–9, and the empty circle can crowd or overlap neighboring digits.

1.3 WHEN the Oracle spells an answer that contains a space (for example "OLDEST ALPHA" or "3 SPIRITS") THEN the planchette does not move to any dedicated space position for that space character; it remains on the previously spelled glyph during the pause (there is no invisible space rest position to target).

### Expected Behavior (Correct)

What should happen instead for the same conditions.

2.1 WHEN the Ouija board is rendered THEN the system SHALL display a digit row containing exactly the ten digits 0–9, each with its character, evenly spaced and horizontally centered, with no empty or character-less glyph present.

2.2 WHEN the Ouija board is rendered THEN the system SHALL keep the letter arc (A–Z), the digit row (0–9), and the YES/NO/GOODBYE markers evenly spaced and centered, with no glyph overlapping another glyph.

2.3 WHEN the Oracle spells an answer that contains a space THEN the system SHALL move the planchette to a dedicated, invisible rest position (near the arc center, below the letters) for the duration of that space, so the space has a resting target without rendering any visible glyph.

2.4 WHEN the Oracle spells an answer that contains a space THEN the system SHALL hold a short pause on the space (the same per-character pacing as other characters) and SHALL continue spelling the remaining characters correctly, so answers such as "OLDEST ALPHA" and "3 SPIRITS" are spelled in full.

2.5 WHEN the invisible space rest position is targeted THEN the system SHALL NOT render a visible glyph, button, or circle for it anywhere on the board, and SHALL NOT add it to the selectable glyph set used by the letter/digit controls.

2.6 WHEN all visible text on the board is rendered THEN the system SHALL present it in English.

### Unchanged Behavior (Regression Prevention)

Existing behavior that must be preserved for inputs that do not trigger the bug.

3.1 WHEN the Oracle spells an answer that contains only arc characters (A–Z and 0–9, no space) THEN the system SHALL CONTINUE TO move the planchette onto each character's glyph exactly as before, with the same geometry and pacing.

3.2 WHEN a user activates a letter, digit, or YES/NO/GOODBYE marker THEN the system SHALL CONTINUE TO behave exactly as before (append the character, apply the marker, or clear the spelled name), with no new selectable space character introduced into the arc character set.

3.3 WHEN the board is laid out at any supported viewport width THEN the system SHALL CONTINUE TO align every letter and digit glyph with the planchette target geometry, so the planchette still lands on the center of each glyph.

3.4 WHEN a summon or banish request is made THEN the system SHALL CONTINUE TO use the existing `main.py` endpoints and the unchanged `/summon` and `/banish` contracts, with identical request/response behavior.

3.5 WHEN the existing Node property tests (`tests/*.prop.test.js`) and the Python tests run THEN the system SHALL CONTINUE TO pass them all; a test is changed only if it asserts the old character-less space-glyph position.

3.6 WHEN the Reduced_Motion preference is set THEN the system SHALL CONTINUE TO show the full oracle answer instantly (no planchette glide), exactly as before.

## Bug Condition and Properties

The fix is specified against two concrete surfaces: the rendered glyph set, and the planchette resolution for a space character.

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X is either a Rendered_Board or a (Answer, charIndex) spelling step
  OUTPUT: boolean

  // Case A — a glyph in the visible digit row has no character.
  IF X is a Rendered_Board THEN
    RETURN EXISTS glyph IN X.digitRow WHERE isEmpty(glyph.character)
  END IF

  // Case B — spelling a space has no dedicated resting target.
  IF X is a spelling step THEN
    RETURN X.character = " " AND resolveTarget(" ") has no dedicated position
  END IF

  RETURN false
END FUNCTION
```

### Fix Checking

```pascal
// Property: Fix Checking — digit row holds only 0..9, no empty glyph
FOR ALL X WHERE isBugCondition(X) AND X is a Rendered_Board DO
  board ← F'(X)
  ASSERT board.digitRow = ["0","1","2","3","4","5","6","7","8","9"]
  ASSERT NOT EXISTS glyph IN board.digitRow WHERE isEmpty(glyph.character)
  ASSERT no glyph overlaps another glyph
END FOR

// Property: Fix Checking — a space resolves to an invisible rest position
FOR ALL X WHERE isBugCondition(X) AND X is a spelling step DO
  result ← F'(X)
  ASSERT result.restPosition is defined AND is near the arc center, below the letters
  ASSERT result.rendersVisibleGlyph = false
  ASSERT result.pausesOnSpace = true
END FOR
```

### Preservation Checking

```pascal
// Property: Preservation Checking — non-buggy inputs are unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Where **F** is the board/spelling behavior before the fix and **F'** is the behavior after the fix. Non-buggy inputs include every arc character (A–Z, 0–9) during spelling, all glyph activations, the layout/alignment of letters and digits, the `/summon` and `/banish` contracts, and the Reduced_Motion path.
