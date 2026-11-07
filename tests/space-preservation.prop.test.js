/*
 * space-preservation.prop.test.js — Preservation property tests (bugfix:
 * ouija-space-glyph-digit-row).
 *
 * Property 2 (Preservation): for every input that does NOT trigger the bug
 * condition, behavior is identical before and after the fix. These tests
 * capture the CURRENT non-buggy behavior on UNFIXED code so the upcoming fix
 * cannot regress it.
 *
 * Observation-first methodology: each assertion below was observed on the
 * current (unfixed) pure core / oracle adapter first, then encoded. Every test
 * here MUST PASS on unfixed code — passing is what confirms the baseline.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.6
 *   - 3.1 arc-only spelling: same target index + geometry + pacing
 *   - 3.2 no new selectable space char (ARC_CHARS unchanged, charIndex(' ')=-1)
 *   - 3.3 responsive glyph <-> planchette alignment (scaledArcPosition stable)
 *   - 3.6 Reduced_Motion instant path: no glide for ANY character incl. spaces
 *
 * NOTE: Req 3.4 (/summon, /banish) is preserved by leaving main.py untouched;
 * the Python pytest/hypothesis suite is its preservation guard. The existing
 * tests/board.geom.prop.test.js, tests/board.prop.test.js and
 * tests/board.rect.prop.test.js already encode much of the arc/digit geometry
 * surface and are part of the baseline (run separately — no update needed).
 *
 * Runner : node:test ; PBT : fast-check (>= 200 iterations, aligned with the
 * repo's other suites). PURE where possible; the Reduced_Motion property drives
 * the real createOracle with injected fakes (no DOM, no network).
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const Board = require("../static/board.js");
const Oracle = require("../static/oracle.js");

const { ARC_CHARS, charIndex, arcPosition, scaledArcPosition, geom } = Board;

// Total glyph count the controller actually passes: arcPosition(index, 36).
const COUNT = ARC_CHARS.length; // 36
const anyArcIndex = fc.integer({ min: 0, max: COUNT - 1 });

// ===========================================================================
// Preservation — Req 3.2: ARC_CHARS is unchanged and gains NO selectable space.
//
// The fix adds an INVISIBLE space rest point but must never add a space to the
// selectable arc set. Observed on unfixed code: ARC_CHARS is exactly the 26
// uppercase letters A-Z followed by the 10 digits 0-9 (length 36, no space),
// and charIndex(' ') === -1. We lock both so the letter/digit controls can
// never gain a selectable space character.
// ===========================================================================

test("Preservation (Req 3.2) — ARC_CHARS is exactly A-Z0-9, length 36, no space", () => {
  assert.strictEqual(ARC_CHARS, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  assert.strictEqual(ARC_CHARS.length, 36, "ARC_CHARS must stay length 36");
  assert.strictEqual(ARC_CHARS.indexOf(" "), -1, "ARC_CHARS must contain no space");
});

test("Preservation (Req 3.2) — charIndex(' ') === -1 (space is not a selectable arc char)", () => {
  assert.strictEqual(charIndex(" "), -1, "a space must remain a non-arc character");
  // And a space is never one of the resolvable arc indices, for any generated
  // string of blanks — a run of spaces must never match a single arc char.
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 8 }), (n) => {
      assert.strictEqual(charIndex(" ".repeat(n)), -1, "any blank string must resolve to -1");
    }),
    { numRuns: 200 }
  );
});

// ===========================================================================
// Preservation — Req 3.1, 3.3: arc-char target stability.
//
// For every arc char (A-Z, 0-9), charIndex returns its index and arcPosition /
// scaledArcPosition return a FIXED, finite point. We document the observed
// model-space geometry and assert it is byte-for-byte stable over indices
// 0..35, so the fix cannot shift any glyph's move target or pacing.
// ===========================================================================

// Observed (unfixed) model-space centers for the boundary indices. These exact
// numbers are the current behavior the fix must preserve.
const EXPECTED_MODEL = {
  0: { x: 82.52883678122322, y: 283.172140766144 }, // 'A'
  25: { x: 617.4711632187768, y: 283.172140766144 }, // 'Z'
  26: { x: 120, y: 300 }, // '0'
  35: { x: 580, y: 300 } // '9'
};

test("Preservation (Req 3.1) — each arc char maps to its index and a fixed model point", () => {
  // charIndex is the identity on ARC_CHARS: char at index i resolves back to i.
  for (let i = 0; i < COUNT; i++) {
    const ch = ARC_CHARS.charAt(i);
    assert.strictEqual(charIndex(ch), i, `charIndex('${ch}') must be ${i}`);
  }
  // Boundary centers match the observed values exactly (letters symmetric about
  // STAGE_W/2 = 350; digits on the straight row at y = DIGIT_ROW_Y).
  for (const idx of Object.keys(EXPECTED_MODEL)) {
    const p = arcPosition(Number(idx), COUNT);
    assert.deepStrictEqual(
      p,
      EXPECTED_MODEL[idx],
      `arcPosition(${idx}) must stay at the observed model point`
    );
  }
});

test("Preservation (Req 3.1) — arcPosition over 0..35 is finite, fixed, and distinct per index", () => {
  const seen = new Set();
  for (let i = 0; i < COUNT; i++) {
    const p = arcPosition(i, COUNT);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `index ${i} center must be finite`);
    // Letters (0..25) ride the upper arc (y <= DIGIT_ROW_Y); digits (26..35) sit
    // exactly on the straight row at DIGIT_ROW_Y — unchanged piecewise regions.
    if (i < geom.LETTER_COUNT) {
      assert.ok(p.y <= geom.DIGIT_ROW_Y, `letter ${i} must stay on/above the digit row`);
    } else {
      assert.strictEqual(p.y, geom.DIGIT_ROW_Y, `digit index ${i} must be on the row`);
    }
    const key = `${p.x.toFixed(9)},${p.y.toFixed(9)}`;
    assert.ok(!seen.has(key), `index ${i} must have a distinct center`);
    seen.add(key);
  }
  assert.strictEqual(seen.size, COUNT, "all 36 move targets must be distinct");
});

// Idempotence of the target resolution: repeated calls return structurally equal
// points (no hidden state, same pacing target every time) — stability guard.
test("Preservation (Req 3.1) — arcPosition is deterministic (same index → same point)", () => {
  fc.assert(
    fc.property(anyArcIndex, (i) => {
      assert.deepStrictEqual(arcPosition(i, COUNT), arcPosition(i, COUNT));
    }),
    { numRuns: 200 }
  );
});

// ===========================================================================
// Preservation — Req 3.3: responsive alignment is stable.
//
// For random (index 0..35, width, height), scaledArcPosition returns finite
// values, projects the model point by the real box fraction, and keeps digits
// (and letters) ordered left-to-right. This is the same function glyph layout
// and the planchette target both use, so alignment is preserved at any width.
// ===========================================================================

test("Preservation (Req 3.3) — scaledArcPosition is finite and matches the box-fraction projection", () => {
  fc.assert(
    fc.property(
      anyArcIndex,
      fc.integer({ min: 200, max: 4000 }),
      fc.integer({ min: 120, max: 3000 }),
      (i, w, h) => {
        const model = arcPosition(i, COUNT);
        const scaled = scaledArcPosition(i, w, h);
        assert.ok(Number.isFinite(scaled.x) && Number.isFinite(scaled.y), "projected point must be finite");
        // Projection is the exact box fraction: fx = x/STAGE_W, fy = y/STAGE_H.
        const expX = (model.x / geom.STAGE_W) * w;
        const expY = (model.y / geom.STAGE_H) * h;
        assert.ok(Math.abs(scaled.x - expX) < 1e-9, `x projection must match (got ${scaled.x}, exp ${expX})`);
        assert.ok(Math.abs(scaled.y - expY) < 1e-9, `y projection must match (got ${scaled.y}, exp ${expY})`);
      }
    ),
    { numRuns: 200 }
  );
});

test("Preservation (Req 3.3) — digits and letters stay ordered left-to-right at any viewport", () => {
  const LETTERS = Array.from({ length: 26 }, (_, i) => i); // 0..25
  const DIGITS = Array.from({ length: 10 }, (_, i) => i + 26); // 26..35
  fc.assert(
    fc.property(fc.integer({ min: 200, max: 4000 }), fc.integer({ min: 120, max: 3000 }), (w, h) => {
      // Digits are strictly increasing in x (even, centered, non-overlapping row).
      const digitX = DIGITS.map((idx) => scaledArcPosition(idx, w, h).x);
      for (let i = 1; i < digitX.length; i++) {
        assert.ok(digitX[i] > digitX[i - 1], `digit ${i} must sit right of digit ${i - 1}`);
      }
      // Letters sweep the arc left-to-right (A left of Z) — endpoints ordered.
      const letterX = LETTERS.map((idx) => scaledArcPosition(idx, w, h).x);
      assert.ok(letterX[0] < letterX[25], "letter A must sit left of letter Z");
    }),
    { numRuns: 200 }
  );
});

// scaledArcPosition falls back to the STAGE box for non-finite / non-positive
// dimensions (observed total behavior) — never throws, stays finite.
test("Preservation (Req 3.3) — scaledArcPosition falls back to STAGE dims for bad sizes", () => {
  const badSizes = [0, -1, NaN, Infinity, -Infinity, "x", null, undefined];
  for (const bad of badSizes) {
    const p = scaledArcPosition(0, bad, bad);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `fallback for ${String(bad)} must be finite`);
    // Falls back to STAGE_W x STAGE_H, i.e. the raw model point.
    assert.deepStrictEqual(p, arcPosition(0, COUNT));
  }
});

// ===========================================================================
// Preservation — Req 3.6: Reduced_Motion shows the full answer instantly with
// NO glide for any character, INCLUDING spaces.
//
// We drive the real createOracle with reduceMotion: true, injecting a fake
// board whose oracleAnswer returns a phrase containing a space, a fake reply
// strip / answer region, and a controller that records BOTH movePlanchetteTo
// and movePlanchetteToSpaceRest. On the reduced-motion path the oracle calls
// showStripInstant and performs NO planchette movement at all — so neither
// glide method is ever invoked, for spaces or any other character.
// ===========================================================================

function makeInstantPathController() {
  const calls = { moveTo: 0, spaceRest: 0 };
  return {
    calls,
    movePlanchetteTo() {
      calls.moveTo += 1;
    },
    // Expose the (post-fix) space-rest method too, so we can prove the reduced
    // -motion path never calls it either. On unfixed code the oracle has no
    // space route, but the instant path must not move regardless.
    movePlanchetteToSpaceRest() {
      calls.spaceRest += 1;
    }
  };
}

function makeFakeReplyStrip() {
  // Node has no document; resetStrip falls back to setting textContent and
  // returns no spans, so revealChar is a harmless no-op.
  return { textContent: "", classList: { add() {}, remove() {} } };
}

function askReducedMotion(phrase, controller) {
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
    answerRegion: { textContent: "" },
    replyStrip: makeFakeReplyStrip(),
    controller: controller,
    mascot: null,
    board: fakeBoard,
    getTasks: function () {
      return [];
    },
    reduceMotion: true,
    stepDelay: 0
  });
  // Reduced-motion path is synchronous (showStripInstant, then return) — ask()
  // returns undefined, performing no glide.
  const ret = oracle.ask("oldest");
  oracle.destroy();
  return ret;
}

test("Preservation (Req 3.6) — Reduced_Motion performs NO planchette glide (incl. spaces)", () => {
  for (const phrase of ["OLDEST ALPHA", "3 SPIRITS", "FIRST A SPIRIT", "HELLO"]) {
    const controller = makeInstantPathController();
    const ret = askReducedMotion(phrase, controller);
    assert.strictEqual(ret, undefined, "reduced-motion ask() returns synchronously (no spell promise)");
    assert.strictEqual(
      controller.calls.moveTo,
      0,
      `reduced motion must not call movePlanchetteTo for "${phrase}" (got ${controller.calls.moveTo})`
    );
    assert.strictEqual(
      controller.calls.spaceRest,
      0,
      `reduced motion must not call movePlanchetteToSpaceRest for "${phrase}" (got ${controller.calls.spaceRest})`
    );
  }
});

test("Preservation (Req 3.6) — Reduced_Motion writes the full answer to the answer region instantly", () => {
  const phrase = "OLDEST ALPHA";
  const controller = makeInstantPathController();
  const answerRegion = { textContent: "" };
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
    answerRegion: answerRegion,
    replyStrip: makeFakeReplyStrip(),
    controller: controller,
    mascot: null,
    board: fakeBoard,
    getTasks: function () {
      return [];
    },
    reduceMotion: true,
    stepDelay: 0
  });
  oracle.ask("oldest");
  // The full answer (with its internal space) is announced at once — no glide.
  assert.strictEqual(answerRegion.textContent, phrase, "full answer must appear instantly");
  assert.strictEqual(controller.calls.moveTo, 0);
  assert.strictEqual(controller.calls.spaceRest, 0);
  assert.strictEqual(oracle.isSpelling(), false, "reduced motion never enters the spelling animation");
  oracle.destroy();
});
