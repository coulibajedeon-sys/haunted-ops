/*
 * board.prop.test.js — Tests de propriétés pour le Ouija_Board (Séance)
 *
 * Feature: ouija-summoning-board
 * Validates: Requirements 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.4, 4.3, 4.4,
 *            4.5, 4.7, 5.3
 *
 * Ce fichier couvre les 8 propriétés de correction décrites dans design.md
 * (Property 1 à Property 8) ainsi que les tests unitaires de cas limites du
 * cœur PUR de board.js :
 *   - composition du Spelled_Name (appendChar / appendMarker / setName / capName)
 *   - résolution caractère ↔ arc (charIndex / lastArcChar)
 *
 * Runner : node:test (runner intégré Node) ; PBT : fast-check (>= 100 itérations,
 * ici 200 pour s'aligner sur ghost.prop.test.js et banish.prop.test.js).
 * Test PUR : aucune base, aucun navigateur, aucun réseau (board.js garde tout
 * accès DOM derrière `typeof document !== "undefined"`, donc aucune
 * auto-initialisation ne s'exécute sous Node).
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const Board = require("../static/board.js");
const {
  ARC_CHARS,
  MAX_TITLE_LENGTH,
  MARKERS,
  appendChar,
  appendMarker,
  setName,
  charIndex,
  lastArcChar
} = Board;

// ---------------------------------------------------------------------------
// Générateurs partagés.
// ---------------------------------------------------------------------------

// Un caractère quelconque de l'arc (A–Z puis 0–9).
const arcChar = fc.constantFrom(...ARC_CHARS.split(""));

// Un caractère UNIQUE garanti hors-arc : minuscules, ponctuation, espace,
// Unicode. On filtre pour exclure tout ce que ARC_CHARS contient déjà.
const offArcChar = fc
  .oneof(
    // Lettres minuscules a–z.
    fc.integer({ min: 0x61, max: 0x7a }).map((c) => String.fromCharCode(c)),
    // Ponctuation / symboles ASCII courants.
    fc.constantFrom(..." !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".split("")),
    // Quelques points de code Unicode non-arc (accents, symboles, CJK).
    fc.constantFrom("é", "ü", "ñ", "ß", "\u2026", "\u00e7", "字", "☺", "\n", "\t")
  )
  .filter((ch) => ARC_CHARS.indexOf(ch) === -1);

// Noms de longueurs variées, y compris jusqu'AU plafond (200) pour éprouver les
// règles de cap. Un Spelled_Name bien formé est toujours construit via le
// plateau et respecte donc déjà le plafond (length <= MAX_TITLE_LENGTH) : c'est
// la précondition des invariants « ne dépasse jamais / ne raccourcit jamais ».
// On borne donc à MAX_TITLE_LENGTH tout en couvrant la frontière (195–200).
const anyName = fc.oneof(
  fc.string({ maxLength: 10 }),
  fc.string({ maxLength: MAX_TITLE_LENGTH }),
  fc.string({ minLength: 195, maxLength: MAX_TITLE_LENGTH })
);

// ---------------------------------------------------------------------------
// Property 1 (tâche 2.2)
// Feature: ouija-summoning-board, Property 1: Appending an arc character grows
// the name by that character when under the cap.
// Validates: Requirements 2.1
// ---------------------------------------------------------------------------
test("Property 1 — appendChar ajoute le caractère et allonge de 1 sous le plafond", () => {
  fc.assert(
    fc.property(
      // Nom strictement sous le plafond (length < MAX_TITLE_LENGTH).
      fc.string({ maxLength: MAX_TITLE_LENGTH - 1 }),
      arcChar,
      (name, ch) => {
        const result = appendChar(name, ch);
        assert.strictEqual(result, name + ch, "le caractère doit être ajouté en fin");
        assert.strictEqual(
          result.length,
          name.length + 1,
          "la longueur doit croître d'exactement 1"
        );
      }
    ),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 2 (tâche 2.3)
// Feature: ouija-summoning-board, Property 2: Appending never exceeds the
// maximum length and never shrinks the name.
// Validates: Requirements 2.5
// ---------------------------------------------------------------------------
test("Property 2 — appendChar ne dépasse jamais le plafond et ne raccourcit jamais", () => {
  fc.assert(
    fc.property(anyName, arcChar, (name, ch) => {
      const result = appendChar(name, ch);
      assert.ok(
        result.length <= MAX_TITLE_LENGTH,
        `la longueur ${result.length} doit rester <= ${MAX_TITLE_LENGTH}`
      );
      assert.ok(
        result.length >= name.length,
        "le résultat ne doit jamais être plus court que l'entrée"
      );
      // Si l'ajout ferait dépasser le plafond, `name` est renvoyé inchangé.
      if (name.length + 1 > MAX_TITLE_LENGTH) {
        assert.strictEqual(result, name, "au plafond, le nom doit rester inchangé");
      }
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 3 (tâche 2.4)
// Feature: ouija-summoning-board, Property 3: YES and NO append their literal
// text under the cap rule.
// Validates: Requirements 2.2, 2.3, 2.5
// ---------------------------------------------------------------------------
test("Property 3 — appendMarker(YES|NO) ajoute le texte littéral sous la règle du plafond", () => {
  fc.assert(
    fc.property(anyName, fc.constantFrom("YES", "NO"), (name, m) => {
      const result = appendMarker(name, m);
      if (name.length + m.length <= MAX_TITLE_LENGTH) {
        assert.strictEqual(result, name + m, `${m} doit être ajouté littéralement`);
      } else {
        assert.strictEqual(result, name, "au plafond, le nom doit rester inchangé");
      }
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 4 (tâche 2.5)
// Feature: ouija-summoning-board, Property 4: GOODBYE always clears the name.
// Validates: Requirements 2.4
// ---------------------------------------------------------------------------
test("Property 4 — appendMarker(GOODBYE) efface toujours le nom", () => {
  fc.assert(
    fc.property(anyName, (name) => {
      assert.strictEqual(appendMarker(name, "GOODBYE"), "", "GOODBYE doit vider le nom");
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 5 (tâche 3.2)
// Feature: ouija-summoning-board, Property 5: Character-to-arc-index lookup is
// sound and exhaustive over the arc.
// Validates: Requirements 3.1, 3.4
// ---------------------------------------------------------------------------
test("Property 5 — charIndex est exact sur l'arc et -1 hors arc", () => {
  // (a) Pour tout index i de l'arc, charIndex(ARC_CHARS[i]) === i.
  fc.assert(
    fc.property(fc.nat({ max: ARC_CHARS.length - 1 }), (i) => {
      assert.strictEqual(
        charIndex(ARC_CHARS[i]),
        i,
        `charIndex de l'arc à l'index ${i} doit valoir ${i}`
      );
    }),
    { numRuns: 200 }
  );

  // (b) Pour tout caractère unique hors-arc, charIndex(ch) === -1.
  fc.assert(
    fc.property(offArcChar, (ch) => {
      assert.strictEqual(charIndex(ch), -1, `charIndex("${ch}") doit valoir -1 (hors arc)`);
    }),
    { numRuns: 200 }
  );

  // Sous-assertions concrètes : chaîne vide et multi-caractères -> -1.
  assert.strictEqual(charIndex(""), -1, 'charIndex("") doit valoir -1');
  assert.strictEqual(charIndex("AB"), -1, 'charIndex("AB") doit valoir -1 (multi-caractères)');
});

// ---------------------------------------------------------------------------
// Property 6 (tâche 3.3)
// Feature: ouija-summoning-board, Property 6: The planchette target is the last
// arc character of the name (honoring Req 4.7 — dernier caractère uniquement).
// Validates: Requirements 3.1, 3.4, 4.5, 4.7
// ---------------------------------------------------------------------------
test("Property 6 — lastArcChar renvoie le dernier caractère s'il est sur l'arc, sinon null", () => {
  // (a) Nom se terminant par un caractère de l'arc -> ce caractère.
  fc.assert(
    fc.property(
      // Préfixe quelconque (arc ou hors-arc) + un dernier caractère d'arc.
      fc.string({ maxLength: 50 }),
      arcChar,
      (prefix, ch) => {
        const name = prefix + ch;
        assert.strictEqual(
          lastArcChar(name),
          ch,
          `le dernier caractère d'arc "${ch}" doit être la cible`
        );
      }
    ),
    { numRuns: 200 }
  );

  // (b) Nom vide OU se terminant par un caractère hors-arc -> null.
  fc.assert(
    fc.property(
      fc.string({ maxLength: 50 }),
      // Soit on ajoute un caractère hors-arc final, soit le nom reste vide.
      fc.oneof(offArcChar, fc.constant("")),
      (prefix, tail) => {
        const name = tail === "" ? "" : prefix + tail;
        if (name.length === 0) {
          assert.strictEqual(lastArcChar(name), null, "nom vide -> null");
        } else {
          assert.strictEqual(
            lastArcChar(name),
            null,
            `dernier caractère hors-arc "${tail}" -> null`
          );
        }
      }
    ),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 7 (tâche 5.2)
// Feature: ouija-summoning-board, Property 7: Board append and fallback adoption
// agree (round trip) — adopter la valeur produite par un ajout plateau la laisse
// inchangée.
// Validates: Requirements 4.3, 4.4
// ---------------------------------------------------------------------------
test("Property 7 — setName(appendChar(name, ch)) === appendChar(name, ch) sous le plafond", () => {
  fc.assert(
    fc.property(
      // name.length + 1 <= MAX_TITLE_LENGTH garanti par maxLength = 199.
      fc.string({ maxLength: MAX_TITLE_LENGTH - 1 }),
      arcChar,
      (name, ch) => {
        const appended = appendChar(name, ch);
        assert.strictEqual(
          setName(appended),
          appended,
          "adopter une valeur déjà sous le plafond ne doit rien changer"
        );
      }
    ),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 8 (tâche 2.6)
// Feature: ouija-summoning-board, Property 8: Adopting a fallback value enforces
// the maximum length.
// Validates: Requirements 4.4, 5.3
// ---------------------------------------------------------------------------
test("Property 8 — setName borne au plafond et laisse inchangé ce qui tient", () => {
  fc.assert(
    fc.property(
      // Chaînes libres, dont certaines au-delà de 200 caractères.
      fc.oneof(fc.string({ maxLength: 200 }), fc.string({ minLength: 201, maxLength: 400 })),
      (raw) => {
        const result = setName(raw);
        assert.ok(
          result.length <= MAX_TITLE_LENGTH,
          `la longueur ${result.length} doit rester <= ${MAX_TITLE_LENGTH}`
        );
        if (raw.length <= MAX_TITLE_LENGTH) {
          assert.strictEqual(result, raw, "une valeur sous le plafond doit rester inchangée");
        }
      }
    ),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Cas limites unitaires (tâche 5.1) — assertions node:test simples.
// ---------------------------------------------------------------------------

// Validates: Requirement 1.1
test("ARC_CHARS = 26 majuscules A–Z puis 10 chiffres 0–9, longueur 36", () => {
  assert.strictEqual(ARC_CHARS, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  assert.strictEqual(ARC_CHARS.length, 36, "l'arc doit compter exactement 36 caractères");
  // Vérifie l'ordre : lettres d'abord, chiffres ensuite.
  assert.strictEqual(ARC_CHARS.slice(0, 26), "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  assert.strictEqual(ARC_CHARS.slice(26), "0123456789");
});

// Validates: Requirements 2.2, 2.3, 2.4
test("MARKERS expose YES/NO littéraux, GOODBYE sentinelle, et GOODBYE efface", () => {
  assert.strictEqual(MARKERS.YES, "YES");
  assert.strictEqual(MARKERS.NO, "NO");
  assert.strictEqual(MARKERS.GOODBYE, null, "GOODBYE est la sentinelle clear (null)");
  assert.strictEqual(appendMarker("anything", "GOODBYE"), "", "GOODBYE doit vider le nom");
});

// Validates: Requirement 2.5
test("appendChar respecte le plafond à la frontière (199 -> 200, 200 inchangé)", () => {
  assert.strictEqual(
    appendChar("X".repeat(199), "Y").length,
    200,
    "199 + 1 doit atteindre exactement 200"
  );
  assert.strictEqual(
    appendChar("X".repeat(200), "Y"),
    "X".repeat(200),
    "au plafond (200), l'ajout est un no-op"
  );
});

// Validates: Requirements 3.4, 4.7
test("lastArcChar sur cas concrets (vide, suffixe arc, suffixe hors-arc)", () => {
  assert.strictEqual(lastArcChar(""), null, "nom vide -> null");
  assert.strictEqual(lastArcChar("abcZ"), "Z", "dernier caractère d'arc -> Z");
  assert.strictEqual(lastArcChar("Zx"), null, "suffixe hors-arc -> null (pas de retour en arrière)");
  assert.strictEqual(lastArcChar("HELLO2"), "2", "dernier caractère d'arc chiffre -> 2");
});
