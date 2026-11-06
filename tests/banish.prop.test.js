/*
 * banish.prop.test.js — Test de propriété du bannissement client (Séance)
 *
 * Feature: seance-haunted-productivity, Property 8
 * Validates: Requirements 3.4
 *
 * Property 8 : L'échec d'un bannissement restaure la liste à son état initial
 * (round-trip identité). Modèle : une liste est un tableau d'identifiants
 * distincts. Retirer l'élément à l'index i produit `remaining` + l'élément
 * retiré + son index d'origine i. Restaurer via restoreAtIndex(remaining,
 * element, i) DOIT reproduire exactement la liste initiale.
 *
 * Test de logique pure : aucun DOM, aucune base, aucun réseau.
 * (banish.js garde tout accès DOM derrière `typeof document !== "undefined"`,
 *  donc aucune auto-initialisation ne s'exécute sous Node.)
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const { restoreAtIndex } = require("../static/banish.js");

// Retire l'élément à l'index i et renvoie le tableau restant (ordre préservé).
function removeAt(list, i) {
  return list.slice(0, i).concat(list.slice(i + 1));
}

test("Property 8 — round-trip identité : retirer puis restaurer reproduit la liste initiale", () => {
  fc.assert(
    fc.property(
      fc
        .uniqueArray(fc.integer(), { minLength: 1, maxLength: 30 })
        .chain((list) =>
          fc.record({
            list: fc.constant(list),
            // Index valide dans [0, list.length - 1].
            i: fc.integer({ min: 0, max: list.length - 1 }),
          })
        ),
      ({ list, i }) => {
        const element = list[i];
        const remaining = removeAt(list, i);
        const restored = restoreAtIndex(remaining, element, i);
        assert.deepStrictEqual(restored, list);
      }
    ),
    { numRuns: 200 }
  );
});

test("Property 8 — round-trip identité avec identifiants chaînes distincts", () => {
  fc.assert(
    fc.property(
      fc
        .uniqueArray(fc.string(), { minLength: 1, maxLength: 30 })
        .chain((list) =>
          fc.record({
            list: fc.constant(list),
            i: fc.integer({ min: 0, max: list.length - 1 }),
          })
        ),
      ({ list, i }) => {
        const element = list[i];
        const remaining = removeAt(list, i);
        assert.deepStrictEqual(restoreAtIndex(remaining, element, i), list);
      }
    ),
    { numRuns: 200 }
  );
});

test("Property 8 — clamping : tout index borné à [0, length], élément toujours présent", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer(), { minLength: 0, maxLength: 30 }),
      // Élément distinct du contenu de `remaining` pour vérifier sa présence.
      fc.string(),
      // Index potentiellement hors bornes (négatif ou trop grand).
      fc.integer({ min: -50, max: 80 }),
      (remaining, element, rawIdx) => {
        const result = restoreAtIndex(remaining, element, rawIdx);

        // Longueur : toujours remaining.length + 1.
        assert.strictEqual(result.length, remaining.length + 1);
        // L'élément est présent exactement une fois.
        const occurrences = result.filter((x) => x === element).length;
        assert.strictEqual(occurrences, 1);
        // Tous les éléments restants sont préservés, dans l'ordre.
        const withoutElement = result.filter((x) => x !== element);
        assert.deepStrictEqual(withoutElement, remaining);

        // Clamp : index négatif → front (0) ; index > length → fin.
        const pos = result.indexOf(element);
        if (rawIdx < 0) {
          assert.strictEqual(pos, 0, "index négatif doit insérer en tête");
        } else if (rawIdx > remaining.length) {
          assert.strictEqual(
            pos,
            remaining.length,
            "index > length doit insérer en queue"
          );
        } else {
          assert.strictEqual(pos, rawIdx, "index valide doit être respecté");
        }
      }
    ),
    { numRuns: 200 }
  );
});

test("Property 8 — cas concrets : restauration en tête, au milieu et en queue", () => {
  // Tête (index 0).
  assert.deepStrictEqual(
    restoreAtIndex(["b", "c", "d"], "a", 0),
    ["a", "b", "c", "d"]
  );
  // Milieu.
  assert.deepStrictEqual(
    restoreAtIndex(["a", "b", "d"], "c", 2),
    ["a", "b", "c", "d"]
  );
  // Queue (index === length).
  assert.deepStrictEqual(
    restoreAtIndex(["a", "b", "c"], "d", 3),
    ["a", "b", "c", "d"]
  );
  // Index au-delà de length → clampé en queue.
  assert.deepStrictEqual(
    restoreAtIndex(["a", "b", "c"], "d", 99),
    ["a", "b", "c", "d"]
  );
  // Index négatif → clampé en tête.
  assert.deepStrictEqual(
    restoreAtIndex(["b", "c", "d"], "a", -5),
    ["a", "b", "c", "d"]
  );
});
