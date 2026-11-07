/*
 * space-rest.prop.test.js — Bug condition exploration test (bugfix:
 * ouija-space-glyph-digit-row).
 *
 * Property 1 (Bug Condition): the visible digit row is EXACTLY 0-9 (no empty /
 * extra glyph, no overlap), AND a space during spelling resolves to a dedicated
 * invisible rest position.
 *
 * CRITICAL — this is an EXPLORATION test written BEFORE the fix. It MUST FAIL on
 * the current (unfixed) client code: the failure confirms the Case B behavioral
 * gap (a space has no dedicated planchette rest, so the planchette stays on the
 * previous glyph). Do NOT fix the test or the code here — the failure is the
 * expected outcome of this task. When the fix lands this same test validates it.
 *
 * Runner : node:test ; PBT : fast-check (aligned with the repo's other suites).
 *
 * Case A (digit-row regression guard) passes on the current markup and locks the
 * "digits 0-9 only, no overlap" invariant. Case B (primary gap) fails on unfixed
 * code. Covers Bug Condition Cases A/B and expectedBehavior from design.md.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const fc = require("fast-check");

const Board = require("../static/board.js");
const Oracle = require("../static/oracle.js");

// ---------------------------------------------------------------------------
// Helpers — parse the digit row out of templates/index.html (Case A).
//
// The digit row is a Jinja loop over "0123456789" emitting one
// <button class="glyph digit" data-char data-index ...>{{ ch }}</button> per
// digit. We read the template, expand that single Jinja loop literally (the
// characters are the loop variable itself), and collect the rendered digit
// buttons so we can assert the row is EXACTLY 0..9 with no empty/extra glyph.
// ---------------------------------------------------------------------------

function readTemplate() {
  return fs.readFileSync(
    path.join(__dirname, "..", "templates", "index.html"),
    "utf8"
  );
}

// Extract the <div class="digit-row"> ... </div> block.
function digitRowBlock(html) {
  const start = html.indexOf('<div class="digit-row"');
  assert.ok(start !== -1, "templates/index.html must contain a .digit-row block");
  const end = html.indexOf("</div>", start);
  assert.ok(end !== -1, ".digit-row block must be closed");
  return html.slice(start, end);
}

// Render the digit-row Jinja loop over "0123456789" into the concrete glyphs the
// browser would receive: a { char, index, text, d } per emitted button.
function renderDigitGlyphs(html) {
  const block = digitRowBlock(html);
  // Pull the loop source string ( {% for ch in "...." %} ).
  const forMatch = block.match(/\{%\s*for\s+ch\s+in\s+"([^"]*)"\s*%\}/);
  assert.ok(forMatch, ".digit-row must iterate a literal character string");
  const chars = forMatch[1];
  // Pull the single <button ...>{{ ch }}</button> template line.
  const btnMatch = block.match(/<button\b[^>]*>\s*\{\{\s*ch\s*\}\}\s*<\/button>/);
  assert.ok(btnMatch, ".digit-row must emit one button per character");
  const btnTemplate = btnMatch[0];

  const glyphs = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars.charAt(i);
    const rendered = btnTemplate
      .replace(/\{\{\s*ch\s*\}\}/g, ch)
      .replace(/\{\{\s*loop\.index0\s*\+\s*26\s*\}\}/g, String(i + 26))
      .replace(/\{\{\s*loop\.index0\s*\}\}/g, String(i));
    const textMatch = rendered.match(/>([^<]*)<\/button>/);
    glyphs.push({
      char: ch,
      index: i + 26,
      d: i,
      text: textMatch ? textMatch[1].trim() : ""
    });
  }
  return glyphs;
}

// ---------------------------------------------------------------------------
// Helpers — drive the oracle spell() loop with a fake controller (Case B).
//
// We inject a fake `board` whose oracleAnswer returns the exact phrase we want
// to spell and whose charIndex delegates to the real pure core, plus a fake
// controller that records every move. A space is an internal separator, so a
// faithful spelling of "OLDEST ALPHA" / "3 SPIRITS" must route each internal
// space to exactly one dedicated space-rest move.
// ---------------------------------------------------------------------------

function makeFakeController() {
  const calls = { moveTo: [], spaceRest: 0 };
  return {
    calls,
    movePlanchetteTo(idx) {
      calls.moveTo.push(idx);
    }
    // NOTE: intentionally NO movePlanchetteToSpaceRest here — on unfixed code
    // the oracle loop has no space route to call it anyway. When the fix lands,
    // task 3.3 routes spaces here and this fake will expose the method (see the
    // withSpaceRest variant used by the assertion below).
  };
}

function makeFakeControllerWithSpaceRest() {
  const base = makeFakeController();
  base.movePlanchetteToSpaceRest = function () {
    base.calls.spaceRest += 1;
  };
  return base;
}

// A minimal fake reply strip (Node has no document; resetStrip falls back to
// setting textContent and returns no spans, so revealChar is a harmless no-op).
function makeFakeReplyStrip() {
  return { textContent: "", classList: { add() {}, remove() {} } };
}

function makeFakeAnswerRegion() {
  return { textContent: "" };
}

// Spell `phrase` through a real createOracle with injected fakes and return the
// recorded controller calls once the spelling promise resolves.
async function spellPhrase(phrase, controller) {
  const fakeBoard = {
    ARC_CHARS: Board.ARC_CHARS,
    charIndex: Board.charIndex,
    oracleAnswer: function () {
      return phrase;
    }
  };
  const oracle = Oracle.createOracle({
    buttons: [],
    input: null,
    answerRegion: makeFakeAnswerRegion(),
    replyStrip: makeFakeReplyStrip(),
    controller: controller,
    mascot: null,
    board: fakeBoard,
    getTasks: function () {
      return [];
    },
    reduceMotion: false,
    stepDelay: 0
  });
  // ask() returns the spell() promise in the full-motion path.
  await oracle.ask("oldest");
  oracle.destroy();
  return controller.calls;
}

function internalSpaceCount(phrase) {
  // Leading/trailing spaces are already trimmed by sanitizeToAnswer, so count
  // every space in the (already-internal) phrase.
  let n = 0;
  for (let i = 0; i < phrase.length; i++) {
    if (phrase.charAt(i) === " ") {
      n += 1;
    }
  }
  return n;
}

// ===========================================================================
// Case B — PRIMARY GAP. MUST FAIL on unfixed code.
// ===========================================================================

// B1 — Root-cause fixtures: today a space is not an arc character and there is
// no dedicated space position helper. These two facts are WHY a space has no
// resting target. (These assertions describe the current broken state; they are
// here to document the root cause alongside the failing behavioral assertion.)
test("Case B (root cause) — charIndex(' ') === -1 and no spacePosition helper exists", () => {
  // A space is not an arc char — confirmed root cause #1.
  assert.strictEqual(Board.charIndex(" "), -1, "charIndex(' ') must be -1 on unfixed code");
  // On FIXED code the pure core will export a spacePosition helper giving the
  // space a dedicated, invisible rest point. Its ABSENCE today is the gap.
  assert.strictEqual(
    typeof Board.spacePosition,
    "function",
    "board.js must export a spacePosition(width,height) helper so a space has a dedicated rest point"
  );
});

// B2 — Behavioral gap: spelling a phrase containing an internal space must route
// that space to exactly one dedicated space-rest move. On UNFIXED code the loop
// skips the move for a space (idx < 0), so spaceRest stays 0 → this FAILS.
test("Case B — a space routes to exactly one dedicated space-rest move", async () => {
  for (const phrase of ["OLDEST ALPHA", "3 SPIRITS"]) {
    const controller = makeFakeControllerWithSpaceRest();
    const calls = await spellPhrase(phrase, controller);
    const expectedSpaces = internalSpaceCount(phrase);
    assert.strictEqual(
      calls.spaceRest,
      expectedSpaces,
      `spelling "${phrase}" must trigger ${expectedSpaces} space-rest move(s); ` +
        `got ${calls.spaceRest}. On unfixed code the space produces no planchette ` +
        `move, so the planchette stays on the previous glyph.`
    );
  }
});

// ===========================================================================
// Case A — DIGIT-ROW REGRESSION GUARD. Passes on current markup.
// ===========================================================================

// A1 — The rendered digit row is EXACTLY ["0".."9"], every glyph has its
// character, and there is no 37th / extra glyph.
test("Case A — digit row is exactly 0-9 with no empty or extra glyph", () => {
  const glyphs = renderDigitGlyphs(readTemplate());
  assert.strictEqual(glyphs.length, 10, "digit row must have exactly ten glyphs");
  assert.deepStrictEqual(
    glyphs.map((g) => g.char),
    ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    "digit row characters must be exactly 0..9"
  );
  glyphs.forEach((g) => {
    assert.notStrictEqual(g.text, "", `digit glyph at index ${g.index} must not be empty`);
    assert.strictEqual(g.text, g.char, `digit glyph text must equal its character (${g.char})`);
  });
});

// A2 — Overlap guard: no two digit-row glyph centers coincide and every digit
// stays within the row span [DIGIT_ROW_X_START, DIGIT_ROW_X_END] at
// y = DIGIT_ROW_Y. Uses the pure geometry core (arcPosition / scaledArcPosition)
// over random viewport sizes.
test("Case A — no two digit centers coincide and digits stay within the row span", () => {
  const g = Board.geom;
  // Model-space centers (arcPosition) for the ten digit indices 26..35.
  const DIGIT_INDEXES = [26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  const centers = DIGIT_INDEXES.map((idx) => Board.arcPosition(idx, g.LETTER_COUNT + g.DIGIT_COUNT, g));

  // Every digit sits on the straight row at y = DIGIT_ROW_Y, within the span.
  centers.forEach((p, i) => {
    assert.strictEqual(p.y, g.DIGIT_ROW_Y, `digit ${i} must be on the row at y=DIGIT_ROW_Y`);
    assert.ok(
      p.x >= g.DIGIT_ROW_X_START - 1e-9 && p.x <= g.DIGIT_ROW_X_END + 1e-9,
      `digit ${i} x=${p.x} must stay within [${g.DIGIT_ROW_X_START}, ${g.DIGIT_ROW_X_END}]`
    );
  });

  // No two centers coincide (distinct, strictly increasing x).
  for (let i = 1; i < centers.length; i++) {
    assert.ok(
      centers[i].x > centers[i - 1].x,
      `digit centers must be strictly ordered and distinct (index ${i})`
    );
  }

  // Projected into random real viewports the centers stay distinct and finite.
  fc.assert(
    fc.property(
      fc.integer({ min: 200, max: 4000 }),
      fc.integer({ min: 120, max: 3000 }),
      (w, h) => {
        const proj = DIGIT_INDEXES.map((idx) => Board.scaledArcPosition(idx, w, h));
        for (let i = 0; i < proj.length; i++) {
          assert.ok(isFinite(proj[i].x) && isFinite(proj[i].y), "projected center must be finite");
          if (i > 0) {
            assert.ok(proj[i].x > proj[i - 1].x, "projected digit centers must stay distinct/ordered");
          }
        }
      }
    ),
    { numRuns: 200 }
  );
});
