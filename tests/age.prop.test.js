/*
 * age.prop.test.js — Tests de propriété du vieillissement des esprits (Séance)
 *
 * Feature: haunted-task-polish
 * Validates: Requirements 4.4, 4.5, 4.6, 4.7, 4.8, 8.2
 *
 * Trois propriétés sur la fonction pure et totale `ageBucket(createdAt, now)`
 * exportée par static/age.js :
 *   - Property 2 : le classement d'âge est total et ne lève jamais.
 *   - Property 3 : un created_at manquant / illisible est classé "fresh".
 *   - Property 4 : le classement est monotone à travers les seuils
 *     (fresh -> old -> ancient), sans régression.
 *
 * Test de logique pure : aucun DOM, aucune base, aucun réseau.
 * (age.js garde tout accès DOM derrière `typeof document !== "undefined"`,
 *  donc aucune auto-initialisation ne s'exécute sous Node.)
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const { ageBucket, DAY_MS, ANCIENT_MS } = require("../static/age.js");

// Les trois seules valeurs de bucket autorisées.
const BUCKETS = ["fresh", "old", "ancient"];

// Générateur de created_at "arbitraire" : mélange de chaînes, entiers,
// flottants, null/undefined/""/garbage, et formats temporels plausibles
// (ISO-like et format SQLite "YYYY-MM-DD HH:MM:SS").
const arbCreatedAt = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double(),
  fc.constantFrom(null, undefined, "", "garbage"),
  // Chaînes ISO-like et format SQLite (UTC) crédibles.
  fc.constantFrom(
    "2023-01-01T00:00:00Z",
    "2023-06-15T12:30:45.123Z",
    "2024-12-31T23:59:59+00:00",
    "2023-01-01 00:00:00",
    "2024-02-29 08:15:00",
    "1999-10-31 18:00:00",
    "not-a-date",
    "2023-13-45 99:99:99"
  )
);

// Générateur de `now` arbitraire : epoch-ms entiers/flottants, plus des
// valeurs non finies (NaN, Infinity) pour éprouver la totalité.
const arbNow = fc.oneof(
  fc.integer(),
  fc.double(),
  fc.constantFrom(NaN, Infinity, -Infinity)
);

// Feature: haunted-task-polish, Property 2: Age bucketing is total and never throws
test("Property 2 — le classement d'âge est total et ne lève jamais", () => {
  fc.assert(
    fc.property(arbCreatedAt, arbNow, (createdAt, now) => {
      let result;
      // Ne doit jamais lever, quelle que soit l'entrée.
      assert.doesNotThrow(() => {
        result = ageBucket(createdAt, now);
      });
      // Le résultat est exactement l'une des trois valeurs autorisées.
      assert.ok(
        BUCKETS.includes(result),
        `bucket inattendu: ${JSON.stringify(result)}`
      );
    }),
    { numRuns: 200 }
  );
});

// Feature: haunted-task-polish, Property 3: Missing or unparseable created_at is fresh
test("Property 3 — created_at manquant ou illisible est classé \"fresh\"", () => {
  const arbMissing = fc.oneof(
    fc.constantFrom(null, undefined, "", "   ", "garbage", "not-a-date"),
    // Chaînes alphabétiques quelconques : illisibles comme dates.
    fc.stringMatching(/^[a-zA-Z]+$/)
  );
  // `now` fini et arbitraire (le fallback non-fini est couvert par Property 2).
  const arbFiniteNow = fc.oneof(
    fc.integer(),
    fc.double({ noNaN: true, noDefaultInfinity: true })
  );

  fc.assert(
    fc.property(arbMissing, arbFiniteNow, (createdAt, now) => {
      assert.strictEqual(ageBucket(createdAt, now), "fresh");
    }),
    { numRuns: 200 }
  );
});

// Feature: haunted-task-polish, Property 4: Age bucketing is monotonic across the thresholds
test("Property 4 — le classement est monotone à travers les seuils", () => {
  // `now` fini en epoch-ms. On construit createdAt = now - offset (nombre),
  // car ageBucket interprète un nombre comme un epoch-ms : cela évite tout
  // bruit de parsing de chaîne ou de fuseau horaire.
  const arbFiniteNow = fc.double({
    min: -8.64e15, // ~ bornes de Date en ms, pour rester dans des valeurs plausibles
    max: 8.64e15,
    noNaN: true,
    noDefaultInfinity: true,
  });

  // Offsets d'âge couvrant large, ET des offsets proches des deux frontières
  // afin d'exercer l'ordre fresh -> old -> ancient sans régression.
  const arbOffset = fc.oneof(
    { weight: 3, arbitrary: fc.double({ min: 0, max: 10 * ANCIENT_MS, noNaN: true, noDefaultInfinity: true }) },
    // Autour de Day_Threshold (24h).
    { weight: 2, arbitrary: fc.double({ min: DAY_MS - 5000, max: DAY_MS + 5000, noNaN: true, noDefaultInfinity: true }) },
    // Autour de Ancient_Threshold (72h).
    { weight: 2, arbitrary: fc.double({ min: ANCIENT_MS - 5000, max: ANCIENT_MS + 5000, noNaN: true, noDefaultInfinity: true }) }
  );

  fc.assert(
    fc.property(arbFiniteNow, arbOffset, (now, offset) => {
      const createdAt = now - offset;
      // Si la soustraction déborde en non-fini, ageBucket renvoie "fresh"
      // (now reste fini mais createdAt non fini -> parse null -> "fresh").
      if (!isFinite(createdAt)) {
        assert.strictEqual(ageBucket(createdAt, now), "fresh");
        return;
      }

      // L'âge effectivement vu par ageBucket (now - parse(createdAt)).
      const age = now - createdAt; // == offset (à la précision flottante près)
      const bucket = ageBucket(createdAt, now);

      // Convention EXACTE de age.js :
      //   age >  ANCIENT_MS            -> "ancient"
      //   DAY_MS < age <= ANCIENT_MS   -> "old"
      //   age <= DAY_MS                -> "fresh"  (DAY_MS exact -> "fresh")
      if (age > ANCIENT_MS) {
        assert.strictEqual(bucket, "ancient", `age=${age} attendu ancient`);
      } else if (age > DAY_MS) {
        assert.strictEqual(bucket, "old", `age=${age} attendu old`);
      } else {
        assert.strictEqual(bucket, "fresh", `age=${age} attendu fresh`);
      }
    }),
    { numRuns: 300 }
  );
});

// Feature: haunted-task-polish, Property 4: Age bucketing is monotonic across the thresholds
test("Property 4 — frontières exactes et ordre fresh -> old -> ancient", () => {
  const now = 1_700_000_000_000; // epoch-ms fixe et fini.

  // Frontières exactes (convention age.js : age > seuil).
  assert.strictEqual(ageBucket(now - DAY_MS, now), "fresh", "DAY_MS exact -> fresh");
  assert.strictEqual(ageBucket(now - ANCIENT_MS, now), "old", "ANCIENT_MS exact -> old");

  // Juste au-delà de chaque frontière.
  assert.strictEqual(ageBucket(now - (DAY_MS + 1), now), "old", "DAY_MS+1 -> old");
  assert.strictEqual(ageBucket(now - (ANCIENT_MS + 1), now), "ancient", "ANCIENT_MS+1 -> ancient");

  // Ordre monotone : fresh (0) -> old (entre les seuils) -> ancient (au-delà).
  assert.strictEqual(ageBucket(now - 0, now), "fresh");
  assert.strictEqual(ageBucket(now - (DAY_MS + ANCIENT_MS) / 2, now), "old");
  assert.strictEqual(ageBucket(now - (ANCIENT_MS * 2), now), "ancient");
});
