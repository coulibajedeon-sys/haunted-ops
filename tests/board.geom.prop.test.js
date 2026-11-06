/*
 * board.geom.prop.test.js — Tests de propriétés pour la géométrie à deux rangées
 * (Layout_Geometry) du Ouija_Board.
 *
 * Feature: ouija-board-visual-polish
 * Validates: Requirements 1.1, 1.2, 1.4, 7.3
 *
 * Ce fichier (NOUVEAU, optionnel) couvre les 3 propriétés de correction décrites
 * dans design.md (« Correctness Properties ») pour le modèle de placement
 * piecewise `arcPosition(index, count)` : arc large pour les 26 lettres
 * (index 0..25) puis rangée horizontale droite pour les 10 chiffres
 * (index 26..35). Il importe les symboles déjà exportés par board.js (`geom`,
 * `arcAngle`, `arcPosition`) et NE modifie aucun fichier de test existant.
 *
 * Les propriétés gardent uniquement contre une géométrie dégénérée (NaN/Infinity,
 * centres dupliqués, lettres débordant sur la rangée des chiffres) ; elles ne
 * vérifient PAS un pixel-layout précis (ce sont des concerns visuels).
 *
 * Runner : node:test (runner intégré Node) ; PBT : fast-check (>= 100 itérations,
 * ici 200 pour s'aligner sur board.prop.test.js / ghost.prop.test.js).
 * Test PUR : aucune base, aucun navigateur, aucun réseau (board.js garde tout
 * accès DOM derrière `typeof document !== "undefined"`, donc aucune
 * auto-initialisation ne s'exécute sous Node).
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const Board = require("../static/board.js");
const { ARC_CHARS, geom, arcPosition } = Board;

// Nombre total de glyphes de l'arc (36 = 26 lettres + 10 chiffres). On s'aligne
// exactement sur ce que le contrôleur appelle réellement : arcPosition(index, 36).
const COUNT = ARC_CHARS.length; // 36

// Générateurs d'indices couvrant précisément chaque région.
const anyIndex = fc.integer({ min: 0, max: COUNT - 1 }); // [0, 36)
const letterIndex = fc.integer({ min: 0, max: 25 }); // [0, 26)
const digitIndex = fc.integer({ min: 26, max: COUNT - 1 }); // [26, 36)

// ---------------------------------------------------------------------------
// Property 1 (design.md)
// Feature: ouija-board-visual-polish, Property 1: Glyph positions are finite
// and well-formed.
// Validates: Requirements 1.4, 7.3
// ---------------------------------------------------------------------------
test("Property 1 — arcPosition renvoie un {x,y} numérique et fini pour tout index 0..35", () => {
  fc.assert(
    fc.property(anyIndex, (i) => {
      const p = arcPosition(i, COUNT);
      assert.strictEqual(typeof p, "object", "le résultat doit être un objet");
      assert.notStrictEqual(p, null, "le résultat ne doit pas être null");
      assert.strictEqual(typeof p.x, "number", "x doit être un nombre");
      assert.strictEqual(typeof p.y, "number", "y doit être un nombre");
      assert.ok(Number.isFinite(p.x), `x (${p.x}) doit être fini (ni NaN ni Infinity)`);
      assert.ok(Number.isFinite(p.y), `y (${p.y}) doit être fini (ni NaN ni Infinity)`);
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Property 2 (design.md)
// Feature: ouija-board-visual-polish, Property 2: Every glyph has a distinct
// center.
// Validates: Requirements 1.1, 1.4
// ---------------------------------------------------------------------------
const EPSILON = 1e-9;

test("Property 2 — deux index distincts produisent des centres distincts", () => {
  fc.assert(
    fc.property(anyIndex, anyIndex, (i, j) => {
      fc.pre(i !== j); // précondition : index réellement distincts
      const a = arcPosition(i, COUNT);
      const b = arcPosition(j, COUNT);
      const sameX = Math.abs(a.x - b.x) < EPSILON;
      const sameY = Math.abs(a.y - b.y) < EPSILON;
      assert.ok(
        !(sameX && sameY),
        `les index ${i} et ${j} doivent avoir des centres distincts ` +
          `(obtenu ${JSON.stringify(a)} vs ${JSON.stringify(b)})`
      );
    }),
    { numRuns: 200 }
  );
});

// Complément exhaustif (node:test simple) : toutes les 36×36 paires sont
// distinctes. On construit un Set de clés "x,y" arrondies ; sa taille doit
// valoir 36 si et seulement si tous les centres sont uniques.
// Validates: Requirements 1.1, 1.4
test("Property 2 (exhaustif) — les 36 centres sont tous uniques", () => {
  const keys = new Set();
  for (let i = 0; i < COUNT; i++) {
    const p = arcPosition(i, COUNT);
    // Arrondi à 6 décimales pour neutraliser le bruit flottant tout en gardant
    // la distinction réelle des centres.
    const key = `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
    keys.add(key);
  }
  assert.strictEqual(keys.size, COUNT, `attendu ${COUNT} centres uniques, obtenu ${keys.size}`);
});

// ---------------------------------------------------------------------------
// Property 3 (design.md)
// Feature: ouija-board-visual-polish, Property 3: Letters and digits occupy
// separated regions.
// Validates: Requirements 1.2
// ---------------------------------------------------------------------------
test("Property 3 — les chiffres sont sur la rangée droite, jamais sous l'arc des lettres", () => {
  fc.assert(
    fc.property(letterIndex, digitIndex, (i, j) => {
      const letter = arcPosition(i, COUNT);
      const digit = arcPosition(j, COUNT);
      // (a) Tout chiffre est posé sur la rangée droite : y constant = DIGIT_ROW_Y.
      assert.strictEqual(
        digit.y,
        geom.DIGIT_ROW_Y,
        `le chiffre à l'index ${j} doit avoir y === DIGIT_ROW_Y (${geom.DIGIT_ROW_Y})`
      );
      // (b) Toute lettre est sur/au-dessus de la rangée des chiffres (y croît vers
      //     le bas), donc y_lettre <= DIGIT_ROW_Y : les lettres ne débordent
      //     jamais sous la rangée des chiffres.
      assert.ok(
        letter.y <= geom.DIGIT_ROW_Y,
        `la lettre à l'index ${i} (y=${letter.y}) doit rester <= DIGIT_ROW_Y (${geom.DIGIT_ROW_Y})`
      );
    }),
    { numRuns: 200 }
  );
});
