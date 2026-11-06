/*
 * board.js — Ouija_Board client (Séance)
 *
 * Feature: ouija-summoning-board
 * Requirements couverts (tâche 1 — squelette) : 1.1, 7.1
 *
 * Board_Controller : module client qui gère la composition du Spelled_Name via
 * un plateau de Ouija (arc de caractères A–Z + 0–9, marqueurs YES/NO/GOODBYE),
 * le déplacement de la planchette, la synchronisation avec le Fallback_Input et
 * la soumission au Summon_Endpoint existant (POST /summon, champ `title`).
 *
 * Architecture (voir design.md, « Layering Inside board.js ») : même motif à deux
 * couches que ghost.js et banish.js :
 *   1. Cœur PUR (aucun DOM, aucun réseau) — transforms du Spelled_Name,
 *      résolution de la planchette et géométrie de l'arc, exportés pour les
 *      tests de propriétés sous Node.
 *   2. Adaptateur DOM (navigateur uniquement) — rendu/liaison, déplacement de la
 *      planchette, synchronisation de l'input, soumission du formulaire. Tout
 *      accès au DOM est protégé par `typeof document !== "undefined"` afin que
 *      le module puisse être `require()` sous Node sans effet de bord.
 *
 * NOTE (tâche 1) : ce fichier ne contient pour l'instant que le squelette UMD et
 * les constantes publiques (ARC_CHARS, MAX_TITLE_LENGTH, MARKERS). Les transforms
 * du cœur pur (tâches 2–3), la géométrie (tâche 4) et l'adaptateur DOM (tâche 7)
 * seront ajoutés ultérieurement. Le module doit se charger proprement sous Node
 * (require) comme dans le navigateur, sans exécuter de code DOM sous Node.
 */

(function (root, factory) {
  // Export universel : Node (module.exports) pour les tests + global navigateur.
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.Board = api;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  // --- Constantes publiques -------------------------------------------------

  // Character_Arc : exactement les 26 lettres majuscules A–Z puis les 10
  // chiffres 0–9, soit 36 caractères distincts et sélectionnables (Req 1.1).
  var ARC_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  // Longueur maximale du Spelled_Name, alignée sur la limite du Summon_Endpoint
  // (champ `title`, max 200) — MAX_TITLE_LENGTH.
  var MAX_TITLE_LENGTH = 200;

  // Special_Markers : YES/NO ajoutent leur texte littéral ; GOODBYE est une
  // sentinelle de remise à zéro (clear) du Spelled_Name (Req 2.2–2.4).
  var MARKERS = {
    YES: "YES",
    NO: "NO",
    GOODBYE: null // sentinelle « clear » : efface le Spelled_Name
  };

  // --- Cœur pur (tâches 2–4) : à implémenter ultérieurement -----------------
  // appendChar, appendMarker, capName, setName,
  // charIndex, lastArcChar, arcAngle, arcPosition.

  // --- Adaptateur DOM (tâche 7) : à implémenter ultérieurement --------------
  // createBoard(options) -> controller (navigateur uniquement, gardé par
  // `typeof document !== "undefined"`).

  // API publique exportée (surface minimale de la tâche 1).
  return {
    ARC_CHARS: ARC_CHARS,
    MAX_TITLE_LENGTH: MAX_TITLE_LENGTH,
    MARKERS: MARKERS
  };
});
