/*
 * board.rect.prop.test.js — Test d'EXPLORATION (bugfix) pour le helper pur
 * `elementCenterInContainer(targetRect, containerRect)` du Ouija_Board.
 *
 * Feature: ouija-board-planchette-and-layout-fixes
 * Validates: Requirements 2.1, 2.2
 *
 * -------------------------------------------------------------------------
 * PHASE D'EXPLORATION (bugfix) — CE TEST DOIT ÉCHOUER SUR LE CODE NON CORRIGÉ.
 * -------------------------------------------------------------------------
 * Sur le code actuel (non corrigé), le symbole `elementCenterInContainer`
 * N'EXISTE PAS encore sur `../static/board.js`. L'appeler lève donc une
 * TypeError (« ... is not a function ») et le test ÉCHOUE. Cet échec est la
 * CONDITION DE SUCCÈS de l'étape d'exploration : il prouve que la surface de
 * correction (le helper pur de mesure de rect) est bien absente. Une fois le
 * helper ajouté et exporté (Part 2, tâche 4.1), ce même test PASSERA et
 * validera la correction. Ne PAS corriger board.js pour le faire passer ici ;
 * ne PAS modifier les fichiers de test existants.
 *
 * -------------------------------------------------------------------------
 * REPRODUCTION MANUELLE (preuve d'exploration — mis-targeting YES/NO)
 * -------------------------------------------------------------------------
 * On unfixed code, load /, click YES → the planchette glides to the S glyph on
 * the arc (wrong, should be the YES marker); click NO → glides to O. Root
 * cause: the move target is charIndex(lastArcChar(name)) via arcPosition, and
 * 'YES'/'NO' end in arc letters S/O; markers have no arc index. The fix adds
 * elementCenterInContainer + rect measurement (Part 2).
 *
 * -------------------------------------------------------------------------
 * Comportement ATTENDU (post-fix) encodé ci-dessous
 * -------------------------------------------------------------------------
 * elementCenterInContainer(target, container) renvoie {x, y} tel que
 *   x === target.left + target.width  / 2 - container.left
 *   y === target.top  + target.height / 2 - container.top
 * (centre de l'élément cible moins l'origine du conteneur), avec x, y finis.
 *
 * Runner : node:test (runner intégré Node) ; PBT : fast-check (>= 100
 * itérations, ici 200 pour s'aligner sur board.prop.test.js /
 * board.geom.prop.test.js). Test PUR : aucune base, aucun navigateur, aucun
 * réseau (board.js garde tout accès DOM derrière
 * `typeof document !== "undefined"`, donc aucune auto-initialisation ne
 * s'exécute sous Node).
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const Board = require("../static/board.js");
const { elementCenterInContainer } = Board;

// ---------------------------------------------------------------------------
// Générateurs de rects : objets plats {left, top, width, height} avec des
// nombres finis. left/top bornés à [-2000, 2000] (positions à l'écran, décalées
// de défilement incluses), width/height bornés à [0, 2000] et NON négatifs.
// noNaN:true garantit l'absence de NaN ; les bornes finies excluent ±Infinity.
// ---------------------------------------------------------------------------
const coord = fc.double({ min: -2000, max: 2000, noNaN: true });
const size = fc.double({ min: 0, max: 2000, noNaN: true });

const rect = fc.record({
  left: coord,
  top: coord,
  width: size,
  height: size
});

// ---------------------------------------------------------------------------
// Property 1 (design.md)
// Feature: ouija-board-planchette-and-layout-fixes, Property 1: elementCenterInContainer
// returns the target element center minus the container origin, with finite coordinates.
// Validates: Requirements 2.1, 2.2
// ---------------------------------------------------------------------------
test("Property 1 — elementCenterInContainer renvoie centre-cible − origine-conteneur (fini)", () => {
  fc.assert(
    fc.property(rect, rect, (target, container) => {
      const result = elementCenterInContainer(target, container);

      assert.strictEqual(typeof result, "object", "le résultat doit être un objet");
      assert.notStrictEqual(result, null, "le résultat ne doit pas être null");

      const expectedX = target.left + target.width / 2 - container.left;
      const expectedY = target.top + target.height / 2 - container.top;

      assert.strictEqual(
        result.x,
        expectedX,
        `x doit valoir target.left + target.width/2 - container.left (${expectedX})`
      );
      assert.strictEqual(
        result.y,
        expectedY,
        `y doit valoir target.top + target.height/2 - container.top (${expectedY})`
      );

      assert.ok(Number.isFinite(result.x), `x (${result.x}) doit être fini`);
      assert.ok(Number.isFinite(result.y), `y (${result.y}) doit être fini`);
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// Cas concrets (node:test simple) — exemples fixes avec nombres exacts.
// Feature: ouija-board-planchette-and-layout-fixes, Property 1: concrete cases.
// Validates: Requirements 2.1, 2.2
// ---------------------------------------------------------------------------
test("Property 1 (concret) — cible à l'origine du conteneur, cible centrée, cible décalée", () => {
  // (a) Cible posée à l'origine du conteneur (mêmes left/top) : le résultat est
  //     simplement la demi-taille de la cible.
  assert.deepStrictEqual(
    elementCenterInContainer(
      { left: 0, top: 0, width: 40, height: 40 },
      { left: 0, top: 0, width: 400, height: 400 }
    ),
    { x: 20, y: 20 },
    "cible 40×40 à l'origine → centre (20, 20)"
  );

  // (b) Cible centrée dans un conteneur 400×400 : une cible 40×40 placée en
  //     (180,180) a son centre en (200,200) ; origine conteneur (10,10) → (190,190).
  assert.deepStrictEqual(
    elementCenterInContainer(
      { left: 190, top: 190, width: 40, height: 40 },
      { left: 10, top: 10, width: 400, height: 400 }
    ),
    { x: 200, y: 200 },
    "cible centrée → (200, 200) relatif au conteneur décalé de (10,10)"
  );

  // (c) Cible décalée avec conteneur décalé : (100 + 60/2 − 50, 200 + 80/2 − 30).
  assert.deepStrictEqual(
    elementCenterInContainer(
      { left: 100, top: 200, width: 60, height: 80 },
      { left: 50, top: 30, width: 500, height: 500 }
    ),
    { x: 80, y: 210 },
    "cible décalée → (100+30-50, 200+40-30) = (80, 210)"
  );
});

// ---------------------------------------------------------------------------
// Property 2 (design.md — Testing Strategy, Property-Based Tests)
// Feature: ouija-board-planchette-and-layout-fixes, Property 2: when the target
// element is fully inside the container, elementCenterInContainer returns a
// center that lies within [0, container.width] x [0, container.height].
// Validates: Requirements 2.1, 2.2
//
// Générateur dédié : on construit un couple (container, target) GARANTI
// « cible entièrement à l'intérieur du conteneur », en tirant d'abord un
// conteneur puis en plaçant la cible à l'intérieur de ses bornes :
//   container.left <= target.left  et  target.left + target.width  <= container.left + container.width
//   container.top  <= target.top   et  target.top  + target.height <= container.top  + container.height
// On tire l'origine de la cible dans la marge disponible (fractions de la place
// restante) et sa taille dans l'espace restant, ce qui rend le contenant exact
// par construction (aucun filtre à rejeter).
// ---------------------------------------------------------------------------
const insideCase = fc
  .record({
    cLeft: coord,
    cTop: coord,
    cWidth: size,
    cHeight: size,
    // Fractions dans [0,1] pour positionner l'origine de la cible et choisir sa
    // taille dans la place restante — garantit le confinement par construction.
    offXFrac: fc.double({ min: 0, max: 1, noNaN: true }),
    offYFrac: fc.double({ min: 0, max: 1, noNaN: true }),
    wFrac: fc.double({ min: 0, max: 1, noNaN: true }),
    hFrac: fc.double({ min: 0, max: 1, noNaN: true })
  })
  .map(function (r) {
    var container = { left: r.cLeft, top: r.cTop, width: r.cWidth, height: r.cHeight };
    var offX = r.cWidth * r.offXFrac; // origine cible dans [0, cWidth]
    var offY = r.cHeight * r.offYFrac;
    var tWidth = (r.cWidth - offX) * r.wFrac; // taille dans l'espace restant
    var tHeight = (r.cHeight - offY) * r.hFrac;
    var target = {
      left: r.cLeft + offX,
      top: r.cTop + offY,
      width: tWidth,
      height: tHeight
    };
    return { target: target, container: container };
  });

test("Property 2 — cible entièrement contenue → centre dans [0, w] × [0, h]", () => {
  fc.assert(
    fc.property(insideCase, (sample) => {
      const { target, container } = sample;

      // Précondition de confinement (vraie par construction du générateur).
      assert.ok(container.left <= target.left, "pré: container.left <= target.left");
      assert.ok(
        target.left + target.width <= container.left + container.width,
        "pré: target droite <= container droite"
      );
      assert.ok(container.top <= target.top, "pré: container.top <= target.top");
      assert.ok(
        target.top + target.height <= container.top + container.height,
        "pré: target bas <= container bas"
      );

      const result = elementCenterInContainer(target, container);

      assert.ok(Number.isFinite(result.x), `x (${result.x}) doit être fini`);
      assert.ok(Number.isFinite(result.y), `y (${result.y}) doit être fini`);

      assert.ok(result.x >= 0, `x (${result.x}) doit être >= 0`);
      assert.ok(
        result.x <= container.width,
        `x (${result.x}) doit être <= container.width (${container.width})`
      );
      assert.ok(result.y >= 0, `y (${result.y}) doit être >= 0`);
      assert.ok(
        result.y <= container.height,
        `y (${result.y}) doit être <= container.height (${container.height})`
      );
    }),
    { numRuns: 200 }
  );
});
