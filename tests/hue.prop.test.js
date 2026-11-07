/*
 * hue.prop.test.js — Test de propriété de la teinte déterministe (Séance)
 *
 * Feature: haunted-task-polish, Property 1: Deterministic hue from id
 * Validates: Requirements 1.5, 1.6
 *
 * Property 1 : Pour tout `id` entier d'esprit, hueFromId(id) renvoie la même
 * valeur à chaque invocation (fonction pure de l'`id` seul) et le résultat se
 * situe dans l'intervalle de teinte valide [0, 360). La formule de référence,
 * miroir de l'expression Jinja `(task.id * 47) % 360`, normalisée dans
 * [0, 360) : (((id * 47) % 360) + 360) % 360.
 *
 * Test de logique pure : aucun DOM, aucune base, aucun réseau.
 * (age.js garde tout accès DOM derrière `typeof document !== "undefined"`,
 *  donc aucune auto-initialisation ne s'exécute sous Node.)
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const { hueFromId } = require("../static/age.js");

// Formule de référence : miroir exact de l'expression Jinja `(id * 47) % 360`,
// normalisée dans [0, 360) (JS `%` garde le signe du dividende).
function referenceHue(id) {
  return (((id * 47) % 360) + 360) % 360;
}

// Feature: haunted-task-polish, Property 1: Deterministic hue from id
test("Property 1 — hue déterministe : même id -> même teinte à chaque appel", () => {
  fc.assert(
    fc.property(
      // Inclut les négatifs et les grandes valeurs via fc.integer().
      fc.integer(),
      (id) => {
        // Déterminisme / pureté : fonction de l'`id` seul.
        assert.strictEqual(hueFromId(id), hueFromId(id));
      }
    ),
    { numRuns: 200 }
  );
});

// Feature: haunted-task-polish, Property 1: Deterministic hue from id
test("Property 1 — teinte dans l'intervalle valide [0, 360) et numérique", () => {
  fc.assert(
    fc.property(fc.integer(), (id) => {
      const hue = hueFromId(id);
      assert.strictEqual(typeof hue, "number");
      assert.ok(Number.isFinite(hue), "la teinte doit être finie");
      assert.ok(hue >= 0, "la teinte doit être >= 0");
      assert.ok(hue < 360, "la teinte doit être < 360");
    }),
    { numRuns: 200 }
  );
});

// Feature: haunted-task-polish, Property 1: Deterministic hue from id
test("Property 1 — correspond à la formule de référence (id * 47) % 360 normalisée", () => {
  fc.assert(
    fc.property(fc.integer(), (id) => {
      assert.strictEqual(hueFromId(id), referenceHue(id));
    }),
    { numRuns: 200 }
  );
});

// Feature: haunted-task-polish, Property 1: Deterministic hue from id
test("Property 1 — cas concrets : zéro, positif, négatif, grande valeur", () => {
  assert.strictEqual(hueFromId(0), 0);
  // 1 * 47 = 47
  assert.strictEqual(hueFromId(1), 47);
  // 8 * 47 = 376 -> 376 % 360 = 16
  assert.strictEqual(hueFromId(8), 16);
  // -1 * 47 = -47 -> ((-47 % 360) + 360) % 360 = 313
  assert.strictEqual(hueFromId(-1), 313);
  // Grande valeur : reste dans [0, 360).
  const big = hueFromId(1000000);
  assert.ok(big >= 0 && big < 360);
});
