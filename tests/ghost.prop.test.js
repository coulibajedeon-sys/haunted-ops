/*
 * ghost.prop.test.js — Tests de propriétés pour la sélection de messages spooky.
 *
 * Feature: seance-haunted-productivity, Property 6
 * Property 6 : La sélection d'un message spooky appartient à l'ensemble et
 *              diffère du précédent.
 * Validates: Requirements 2.4, 6.3
 *
 * Runner : node:test (runner intégré Node) ; PBT : fast-check (>= 100 itérations).
 * Test pur : aucune base, aucun navigateur, aucun réseau.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const Ghost = require("../static/ghost.js");
const { QUIET, SPOOKY, pickSpooky } = Ghost;

// ---------------------------------------------------------------------------
// Property 6 (fast-check) — appartenance au pool + non-répétition.
// ---------------------------------------------------------------------------
test("Property 6 — pickSpooky renvoie un membre du pool, distinct du précédent", () => {
  // Codes pour désigner la provenance de `previous` :
  //   >= 0        → previous = pool[i] (présent dans le pool)
  //   -1          → previous absent du pool (chaîne fraîche non présente)
  //   -2          → previous = null
  //   -3          → previous = undefined
  const prevSelector = fc.oneof(
    fc.nat({ max: 7 }), // index dans le pool (borné par maxLength)
    fc.constant(-1),
    fc.constant(-2),
    fc.constant(-3)
  );

  fc.assert(
    fc.property(
      // Pool de >= 2 chaînes DISTINCTES (garantit un vrai choix possible).
      fc.uniqueArray(fc.string(), { minLength: 2, maxLength: 8 }),
      prevSelector,
      // rng déterministe dans [0, 1) ; pickSpooky l'appelle une seule fois.
      fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }),
      (pool, selector, r) => {
        // Détermine `previous` en couvrant chaque cas.
        let previous;
        let previousInPool;
        if (selector >= 0) {
          const i = selector % pool.length;
          previous = pool[i];
          previousInPool = true;
        } else if (selector === -1) {
          // Chaîne garantie absente du pool (sentinelle non générable ici).
          previous = "\u0000__absent_sentinel__\u0000";
          previousInPool = pool.includes(previous); // quasi toujours false
        } else if (selector === -2) {
          previous = null;
          previousInPool = false;
        } else {
          previous = undefined;
          previousInPool = false;
        }

        const rng = () => r;
        const result = pickSpooky(previous, pool, rng);

        // (a) Le résultat appartient toujours au pool.
        assert.ok(
          pool.includes(result),
          `result "${result}" devrait appartenir au pool`
        );

        // (b) Si previous est dans le pool (>= 2 éléments distincts), le
        //     résultat doit en différer.
        if (previousInPool) {
          assert.notStrictEqual(
            result,
            previous,
            `result ne doit pas répéter le précédent "${previous}"`
          );
        }
      }
    ),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Cas concrets complémentaires.
// ---------------------------------------------------------------------------
test("Le pool SPOOKY par défaut contient >= 5 messages distincts", () => {
  assert.ok(Array.isArray(SPOOKY), "SPOOKY doit être un tableau");
  const distinct = new Set(SPOOKY);
  assert.ok(
    distinct.size >= 5,
    `SPOOKY doit avoir >= 5 messages distincts (trouvé ${distinct.size})`
  );
});

test("QUIET vaut exactement le message attendu (ellipse Unicode U+2026)", () => {
  assert.strictEqual(QUIET, "The house is quiet\u2026 for now.");
});

test("Appels répétés sur SPOOKY ne répètent jamais deux fois de suite", () => {
  let previous = null;
  for (let n = 0; n < 500; n++) {
    const current = pickSpooky(previous, SPOOKY, Math.random);
    assert.ok(
      SPOOKY.includes(current),
      `itération ${n}: "${current}" doit appartenir à SPOOKY`
    );
    if (previous !== null) {
      assert.notStrictEqual(
        current,
        previous,
        `itération ${n}: répétition consécutive de "${previous}"`
      );
    }
    previous = current;
  }
});
