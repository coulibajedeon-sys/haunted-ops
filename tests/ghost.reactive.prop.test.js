/*
 * ghost.reactive.prop.test.js — Tests de propriétés du cœur PUR du fantôme
 * réactif (Part 2) : machine à états des expressions, décalage des pupilles,
 * sélection des phrases.
 *
 * Feature: ghost-reactive-mascot (Part 2)
 * Logique pure uniquement : aucun DOM, aucune base, aucun réseau. ghost.js
 * garde tout accès DOM derrière `typeof document !== "undefined"`, donc rien ne
 * s'exécute sous Node au require.
 *
 * Runner : node:test ; PBT : fast-check (>= 100 itérations, ici 200 pour
 * s'aligner sur les autres suites du dépôt).
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const Ghost = require("../static/ghost.js");
const {
  EXPRESSIONS,
  PHRASES,
  nextExpression,
  isTransient,
  pupilOffset,
  phraseFor
} = Ghost;

// ---------------------------------------------------------------------------
// Property 1 — nextExpression renvoie TOUJOURS une expression valide.
// (totalité : toute entrée (current, event), même inconnue, reste dans l'ensemble.)
// ---------------------------------------------------------------------------
const anyEvent = fc.oneof(
  fc.constantFrom("type", "summon", "banish", "idle", "rest", "wake"),
  fc.string(), // événements inconnus
  fc.constant(undefined)
);
const anyCurrent = fc.oneof(
  fc.constantFrom.apply(fc, EXPRESSIONS),
  fc.string(), // états courants invalides
  fc.constant(undefined)
);

test("Property 1 — nextExpression(current, event) est toujours une expression valide", () => {
  fc.assert(
    fc.property(anyCurrent, anyEvent, (current, event) => {
      const result = nextExpression(current, event);
      assert.ok(
        EXPRESSIONS.indexOf(result) !== -1,
        `"${result}" doit appartenir à EXPRESSIONS`
      );
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 2 — transitions déterministes par événement (indépendantes de l'état
// courant pour les événements reconnus).
// ---------------------------------------------------------------------------
test("Property 2 — chaque événement reconnu mappe vers l'expression attendue", () => {
  const expected = {
    type: "curious",
    summon: "surprised",
    banish: "happy",
    idle: "sleepy",
    rest: "idle",
    wake: "idle"
  };
  fc.assert(
    fc.property(anyCurrent, fc.constantFrom("type", "summon", "banish", "idle", "rest", "wake"), (current, event) => {
      assert.strictEqual(nextExpression(current, event), expected[event]);
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 3 — événement inconnu : l'expression courante VALIDE est préservée,
// une courante invalide retombe sur "idle".
// ---------------------------------------------------------------------------
test("Property 3 — événement inconnu préserve l'état valide, sinon idle", () => {
  const unknownEvent = fc
    .string()
    .filter((s) => ["type", "summon", "banish", "idle", "rest", "wake"].indexOf(s) === -1);
  fc.assert(
    fc.property(anyCurrent, unknownEvent, (current, event) => {
      const result = nextExpression(current, event);
      if (EXPRESSIONS.indexOf(current) !== -1) {
        assert.strictEqual(result, current, "un état valide doit être préservé");
      } else {
        assert.strictEqual(result, "idle", "un état invalide retombe sur idle");
      }
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 4 — isTransient n'est vrai que pour surprised/happy.
// ---------------------------------------------------------------------------
test("Property 4 — seules surprised et happy sont transitoires", () => {
  fc.assert(
    fc.property(fc.constantFrom.apply(fc, EXPRESSIONS), (expr) => {
      const t = isTransient(expr);
      if (expr === "surprised" || expr === "happy") {
        assert.strictEqual(t, true, `${expr} doit être transitoire`);
      } else {
        assert.strictEqual(t, false, `${expr} ne doit pas être transitoire`);
      }
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 5 — pupilOffset : la norme du décalage reste <= maxRadius, et les
// coordonnées sont finies (la pupille ne sort jamais du socle, Req Part 2.1).
// ---------------------------------------------------------------------------
const num = fc.double({ min: -1000, max: 1000, noNaN: true });
const radius = fc.double({ min: 0, max: 50, noNaN: true });

test("Property 5 — pupilOffset borne la norme à maxRadius (fini)", () => {
  fc.assert(
    fc.property(num, num, num, num, radius, (tx, ty, ox, oy, r) => {
      const off = pupilOffset(tx, ty, ox, oy, r);
      assert.strictEqual(typeof off, "object");
      assert.ok(Number.isFinite(off.dx), `dx (${off.dx}) doit être fini`);
      assert.ok(Number.isFinite(off.dy), `dy (${off.dy}) doit être fini`);
      const norm = Math.sqrt(off.dx * off.dx + off.dy * off.dy);
      // Tolérance flottante : la norme ne dépasse pas maxRadius (+ epsilon).
      assert.ok(
        norm <= r + 1e-9,
        `norme ${norm} doit rester <= maxRadius ${r}`
      );
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 6 — pupilOffset pointe dans la bonne direction : pour un vecteur non
// nul et un rayon > 0, le décalage est colinéaire et de même sens que le
// vecteur cible − origine (produit scalaire >= 0, produit vectoriel ~ 0).
// ---------------------------------------------------------------------------
test("Property 6 — pupilOffset est colinéaire et de même sens que la direction cible", () => {
  fc.assert(
    fc.property(num, num, num, num, fc.double({ min: 0.1, max: 50, noNaN: true }), (tx, ty, ox, oy, r) => {
      const vx = tx - ox;
      const vy = ty - oy;
      fc.pre(Math.sqrt(vx * vx + vy * vy) > 1e-6); // vecteur non nul
      const off = pupilOffset(tx, ty, ox, oy, r);
      const dot = off.dx * vx + off.dy * vy;
      assert.ok(dot >= -1e-9, `même sens attendu (dot=${dot} >= 0)`);
      const cross = off.dx * vy - off.dy * vx;
      // Colinéarité : produit vectoriel ~ 0 (tolérance relative à l'échelle).
      const scale = Math.max(1, Math.abs(vx), Math.abs(vy)) * r;
      assert.ok(
        Math.abs(cross) <= 1e-6 * scale + 1e-6,
        `colinéaire attendu (cross=${cross})`
      );
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 7 — pupilOffset dégénéré : vecteur nul, rayon <= 0 ou entrées non
// numériques → { dx:0, dy:0 }.
// ---------------------------------------------------------------------------
test("Property 7 — cas dégénérés de pupilOffset renvoient (0,0)", () => {
  // Vecteur nul.
  assert.deepStrictEqual(pupilOffset(5, 5, 5, 5, 10), { dx: 0, dy: 0 });
  // Rayon nul / négatif.
  assert.deepStrictEqual(pupilOffset(10, 0, 0, 0, 0), { dx: 0, dy: 0 });
  assert.deepStrictEqual(pupilOffset(10, 0, 0, 0, -3), { dx: 0, dy: 0 });
  // Entrées non numériques.
  assert.deepStrictEqual(pupilOffset(undefined, 0, 0, 0, 5), { dx: 0, dy: 0 });
  assert.deepStrictEqual(pupilOffset(0, 0, 0, 0, 5), { dx: 0, dy: 0 });
});

// ---------------------------------------------------------------------------
// Property 8 — phraseFor renvoie toujours une chaîne non vide appartenant à la
// liste de l'expression (ou à la liste idle pour une expression inconnue).
// ---------------------------------------------------------------------------
const rngGen = fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true });

test("Property 8 — phraseFor renvoie un membre de la liste de l'expression", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constantFrom.apply(fc, EXPRESSIONS), fc.string()),
      rngGen,
      (expr, r) => {
        const phrase = phraseFor(expr, () => r);
        assert.strictEqual(typeof phrase, "string");
        assert.ok(phrase.length > 0, "la phrase ne doit pas être vide");
        // Accès par propriété PROPRE uniquement : une clé comme "valueOf" /
        // "toString" ne doit pas atteindre une méthode héritée du prototype
        // (ce que phraseFor garantit déjà). La liste attendue est donc celle de
        // l'expression si elle est une entrée PROPRE tableau, sinon "idle".
        const list = (Object.prototype.hasOwnProperty.call(PHRASES, expr)
          && Array.isArray(PHRASES[expr]))
          ? PHRASES[expr]
          : PHRASES.idle;
        assert.ok(list.indexOf(phrase) !== -1, `"${phrase}" doit appartenir à la liste`);
      }
    ),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Cas concrets : chaque expression a >= 1 phrase ; EXPRESSIONS contient les 5
// expressions attendues.
// ---------------------------------------------------------------------------
test("EXPRESSIONS = idle, curious, surprised, happy, sleepy", () => {
  assert.deepStrictEqual(EXPRESSIONS, ["idle", "curious", "surprised", "happy", "sleepy"]);
  EXPRESSIONS.forEach((e) => {
    assert.ok(Array.isArray(PHRASES[e]) && PHRASES[e].length >= 1, `PHRASES.${e} non vide`);
  });
});
