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

  // --- Cœur pur : transforms du Spelled_Name (tâche 2) ----------------------
  //
  // Toutes ces fonctions sont PURES : aucun DOM, aucun réseau, aucune mutation
  // de l'argument `name` (les chaînes JS sont immuables ; on renvoie toujours
  // une nouvelle valeur). Elles sont totales — pour toute entrée elles
  // renvoient un Spelled_Name valide (longueur <= MAX_TITLE_LENGTH) sans lever.

  // capName(name) : garde le Spelled_Name sous le plafond en ne conservant que
  // les MAX_TITLE_LENGTH premiers caractères (renvoie `name` inchangé s'il est
  // déjà dans la limite). Aide partagée par setName (Req 2.5, 4.4).
  function capName(name) {
    if (name.length <= MAX_TITLE_LENGTH) {
      return name;
    }
    return name.slice(0, MAX_TITLE_LENGTH);
  }

  // appendChar(name, ch) : ajoute un caractère de l'arc à la fin du
  // Spelled_Name si le résultat respecte le plafond ; sinon renvoie `name`
  // inchangé (pas d'ajout partiel). Pur, ne mute pas `name` (Req 2.1, 2.5).
  function appendChar(name, ch) {
    if (name.length + ch.length <= MAX_TITLE_LENGTH) {
      return name + ch;
    }
    return name;
  }

  // appendMarker(name, marker) : applique un Special_Marker.
  //   - "YES"/"NO" : ajoute le texte littéral du marqueur uniquement si le
  //     résultat tient sous le plafond ; sinon `name` inchangé (Req 2.2, 2.3, 2.5).
  //   - "GOODBYE"  : sentinelle « clear » (MARKERS.GOODBYE === null) — renvoie
  //     la chaîne vide quel que soit le contenu courant (Req 2.4).
  //   - tout autre marqueur inconnu : `name` inchangé (fonction totale).
  function appendMarker(name, marker) {
    if (marker === "GOODBYE") {
      return "";
    }
    var text = MARKERS[marker];
    // text non défini (marqueur inconnu) ou null (GOODBYE déjà traité) : no-op.
    if (typeof text !== "string") {
      return name;
    }
    if (name.length + text.length <= MAX_TITLE_LENGTH) {
      return name + text;
    }
    return name;
  }

  // setName(raw) : adopte une valeur externe (édition du Fallback_Input),
  // ramenée sous le plafond. Renvoie `raw` tel quel s'il tient, sinon ses
  // MAX_TITLE_LENGTH premiers caractères (Req 4.4, 4.5).
  function setName(raw) {
    return capName(raw);
  }

  // --- Cœur pur (tâche 3) : résolution caractère ↔ arc ----------------------
  //
  // charIndex(ch) : renvoie l'index de `ch` dans ARC_CHARS, ou -1 si `ch` n'en
  // est pas un membre exact. Correspondance LITTÉRALE uniquement — aucun repli
  // de casse dans le cœur (l'adaptateur DOM mettra en majuscule les lettres
  // simples avant d'appeler). On exige strictement un caractère unique : une
  // chaîne vide ou de plusieurs caractères ne doit jamais produire une
  // correspondance trompeuse, d'où charIndex("") === -1 et charIndex("AB") === -1
  // même si "AB" apparaît dans ARC_CHARS (Req 3.1, 3.4).
  function charIndex(ch) {
    if (typeof ch !== "string" || ch.length !== 1) {
      return -1;
    }
    return ARC_CHARS.indexOf(ch);
  }

  // lastArcChar(name) : regarde UNIQUEMENT le DERNIER caractère du Spelled_Name.
  // Renvoie ce dernier caractère s'il est membre de l'arc (ARC_CHARS) ; sinon
  // renvoie null — c'est-à-dire lorsque `name` est vide OU que son caractère
  // final n'est pas sur l'arc (lettre minuscule, ponctuation, espace…). On NE
  // remonte PAS en arrière au-delà des caractères de fin hors-arc : la cible de
  // la planchette étant charIndex(lastArcChar(name)), renvoyer null garantit que
  // la planchette reste à sa position courante quand le nom se termine hors arc
  // ou est vide (Req 3.4, 4.6, 4.7).
  function lastArcChar(name) {
    if (name.length === 0) {
      return null;
    }
    var ch = name.charAt(name.length - 1);
    return ARC_CHARS.indexOf(ch) !== -1 ? ch : null;
  }

  // --- Cœur pur (tâche 4) : géométrie de l'arc ------------------------------
  //
  // Système de coordonnées (style SVG) : l'origine (0,0) est en HAUT-GAUCHE,
  // l'axe x pointe vers la DROITE et l'axe y vers le BAS. Les angles sont en
  // RADIANS et croissent dans le sens horaire à l'écran (conséquence du y vers
  // le bas), mesurés depuis l'axe +x. Avec START_ANGLE = PI (côté gauche) qui
  // balaie jusqu'à END_ANGLE = 2*PI (côté droit), sin(angle) est négatif sur
  // tout l'intervalle ]PI, 2*PI[ : les glyphes se placent donc AU-DESSUS du
  // centre (y < CENTER_Y), dessinant un arc peu profond en haut du plateau.
  //
  // `geom` est l'UNIQUE source de vérité partagée entre le placement CSS des
  // glyphes et le calcul de ciblage de la planchette, afin que la planchette
  // atterrisse exactement sur le centre des glyphes. On fige l'objet pour
  // empêcher toute mutation accidentelle (le cœur reste pur).
  var geom = Object.freeze({
    START_ANGLE: Math.PI, // 180° — premier glyphe, à gauche
    END_ANGLE: 2 * Math.PI, // 360° — dernier glyphe, à droite
    RADIUS: 260,
    CENTER_X: 300,
    CENTER_Y: 300 // centre sous l'arc : les glyphes balaient le haut du plateau
  });

  // arcAngle(index, count, g) : angle (radians) du glyphe situé à `index` parmi
  // `count`, interpolé linéairement de START_ANGLE à END_ANGLE. Garde
  // count <= 1 (évite la division par zéro / un seul glyphe) en renvoyant
  // START_ANGLE. `g` est optionnel et vaut le `geom` du module par défaut, ce
  // qui rend la fonction testable avec une autre disposition (Req 3.1, 3.4).
  function arcAngle(index, count, g) {
    g = g || geom;
    if (count <= 1) {
      return g.START_ANGLE;
    }
    return g.START_ANGLE + (g.END_ANGLE - g.START_ANGLE) * index / (count - 1);
  }

  // arcPosition(index, count, g) : centre { x, y } du glyphe à `index` parmi
  // `count`, projeté sur l'arc via arcAngle. `g` optionnel (geom du module par
  // défaut, cohérent avec arcAngle). Pur, totalement défini (Req 3.1, 3.4).
  function arcPosition(index, count, g) {
    g = g || geom;
    var angle = arcAngle(index, count, g);
    return {
      x: g.CENTER_X + g.RADIUS * Math.cos(angle),
      y: g.CENTER_Y + g.RADIUS * Math.sin(angle)
    };
  }

  // --- Adaptateur DOM (tâche 7) : createBoard(options) ----------------------
  //
  // Couche NAVIGATEUR uniquement. `createBoard` ne touche au DOM que lorsqu'il
  // est appelé explicitement (aucune auto-exécution au chargement, contrairement
  // à banish.js) : le câblage inline de index.html (tâche 9) l'invoquera. Toute
  // logique sur le Spelled_Name est déléguée au cœur pur ci-dessus ; l'adaptateur
  // ne fait que lire/écrire le DOM et déplacer la planchette.

  // Détecte la préférence de mouvement réduit. matchMedia peut être absent
  // (environnements de test / navigateurs anciens) → on retombe sur `false`.
  function prefersReducedMotion() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    try {
      return !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  /**
   * createBoard(options) -> controller.
   *
   * @param {Object} options
   * @param {Node}    options.root        Conteneur du Ouija_Board (boutons glyphes + marqueurs).
   * @param {Node}    options.input       Fallback_Input (<input name="title">).
   * @param {Node}    options.planchette  Élément SVG de la planchette à déplacer.
   * @param {boolean} [options.reduceMotion] Forçage optionnel ; défaut depuis matchMedia.
   * @returns {Object} controller — activateChar, activateMarker, syncFromInput,
   *                   value, movePlanchetteTo.
   */
  function createBoard(options) {
    options = options || {};
    var root = options.root || null;
    var input = options.input || null;
    var planchette = options.planchette || null;
    var reduceMotion = (typeof options.reduceMotion === "boolean")
      ? options.reduceMotion
      : prefersReducedMotion();

    // État privé : le Spelled_Name courant. Initialisé depuis la valeur du
    // Fallback_Input si présente (adoptée via le cœur pur, donc plafonnée).
    var name = (input && typeof input.value === "string")
      ? setName(input.value)
      : "";

    // movePlanchetteTo(index) : place la planchette au centre du glyphe `index`
    // via arcPosition(index, ARC_CHARS.length). index < 0 ou null/invalide →
    // on ne bouge pas (Req 3.5, 4.7). Sous reduceMotion, déplacement instantané
    // (transition désactivée) ; sinon on laisse la transition CSS animer.
    function movePlanchetteTo(index) {
      if (!planchette) {
        return;
      }
      if (typeof index !== "number" || isNaN(index) || index < 0) {
        return; // laisser la planchette où elle est
      }
      var pos = arcPosition(index, ARC_CHARS.length);
      // Mouvement réduit : pas de transition (déplacement immédiat). Sinon on
      // efface le style inline pour laisser s'appliquer la transition CSS.
      if (planchette.style) {
        planchette.style.transition = reduceMotion ? "none" : "";
        planchette.style.transform = "translate(" + pos.x + "px, " + pos.y + "px)";
      }
    }

    // Repositionne la planchette sur le dernier caractère d'arc du Spelled_Name
    // courant. Si lastArcChar renvoie null (nom vide ou fin hors arc) →
    // charIndex(null) vaut -1 et movePlanchetteTo ne bouge pas (Req 3.4, 4.6, 4.7).
    function repositionPlanchette() {
      movePlanchetteTo(charIndex(lastArcChar(name)));
    }

    // Écrit le Spelled_Name courant dans le Fallback_Input (board → input).
    function writeToInput() {
      if (input && input.value !== name) {
        input.value = name;
      }
    }

    // Synchronisation effectuée après CHAQUE changement d'état : input + planchette.
    function afterStateChange() {
      writeToInput();
      repositionPlanchette();
    }

    // activateChar(ch) : met en majuscule une lettre simple puis délègue au
    // cœur pur appendChar ; met à jour l'état et synchronise (Req 2.1).
    function activateChar(ch) {
      if (typeof ch !== "string" || ch.length !== 1) {
        return;
      }
      name = appendChar(name, ch.toUpperCase());
      afterStateChange();
    }

    // activateMarker(m) : "YES"/"NO" → append littéral ; "GOODBYE" → clear ;
    // délègue à appendMarker (Req 2.2, 2.3, 2.4).
    function activateMarker(m) {
      name = appendMarker(name, m);
      afterStateChange();
    }

    // syncFromInput() : adopte options.input.value via setName (plafonné), puis
    // réécrit la valeur plafonnée dans l'input si elle a changé (p. ex. entrée
    // trop longue tronquée) et repositionne la planchette (Req 4.4, 4.5, 4.6, 4.7).
    function syncFromInput() {
      if (!input || typeof input.value !== "string") {
        return;
      }
      name = setName(input.value);
      afterStateChange();
    }

    // value() : renvoie le Spelled_Name interne courant.
    function value() {
      return name;
    }

    // --- Câblage des écouteurs (l'adaptateur branche les siens) -------------
    // Gardé par la présence du DOM ; chaque élément est vérifié. Un drapeau en
    // data-attribut évite les doubles liaisons si createBoard est ré-invoqué.
    if (typeof document !== "undefined" && root && typeof root.querySelectorAll === "function") {
      var alreadyBound = (typeof root.getAttribute === "function")
        && root.getAttribute("data-board-bound") === "1";
      if (!alreadyBound) {
        if (typeof root.setAttribute === "function") {
          root.setAttribute("data-board-bound", "1");
        }
        var charButtons = root.querySelectorAll("button[data-char]");
        Array.prototype.forEach.call(charButtons, function (btn) {
          btn.addEventListener("click", function () {
            activateChar(btn.getAttribute("data-char"));
          });
        });
        var markerButtons = root.querySelectorAll("button[data-marker]");
        Array.prototype.forEach.call(markerButtons, function (btn) {
          btn.addEventListener("click", function () {
            activateMarker(btn.getAttribute("data-marker"));
          });
        });
        if (input && typeof input.addEventListener === "function") {
          input.addEventListener("input", function () {
            syncFromInput();
          });
        }
      }
    }

    return {
      activateChar: activateChar,
      activateMarker: activateMarker,
      syncFromInput: syncFromInput,
      value: value,
      movePlanchetteTo: movePlanchetteTo
    };
  }

  // API publique exportée.
  return {
    ARC_CHARS: ARC_CHARS,
    MAX_TITLE_LENGTH: MAX_TITLE_LENGTH,
    MARKERS: MARKERS,
    capName: capName,
    appendChar: appendChar,
    appendMarker: appendMarker,
    setName: setName,
    charIndex: charIndex,
    lastArcChar: lastArcChar,
    geom: geom,
    arcAngle: arcAngle,
    arcPosition: arcPosition,
    createBoard: createBoard
  };
});
