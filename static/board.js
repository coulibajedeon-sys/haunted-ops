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

  // --- Cœur pur (tâche 4) : géométrie à deux rangées ------------------------
  //
  // Système de coordonnées (style SVG) : l'origine (0,0) est en HAUT-GAUCHE,
  // l'axe x pointe vers la DROITE et l'axe y vers le BAS. Les angles sont en
  // RADIANS, mesurés depuis l'axe +x, et croissent dans le sens horaire à
  // l'écran (conséquence du y vers le bas).
  //
  // MODÈLE À DEUX RANGÉES (Layout_Geometry) : les 36 glyphes se répartissent en
  // deux régions distinctes sur un plateau de STAGE_W × STAGE_H :
  //   - LETTRES (index 0..25) : disposées sur un ARC de lettres, interpolées de
  //     ARC_START_ANGLE (π·1.02) à ARC_END_ANGLE (π·1.98) sur un cercle de rayon
  //     ARC_RADIUS (268) centré en (ARC_CENTER_X=350, ARC_CENTER_Y=300). L'arc est
  //     symétrique autour de x=350 (balayage symétrique autour de 1.5π) et logé
  //     dans la bande supérieure du plateau. Sur l'intervalle ]PI, 2*PI[, sin(angle)
  //     est négatif : les lettres se placent AU-DESSUS du centre, dessinant un
  //     arc peu profond dans la bande supérieure du plateau.
  //   - CHIFFRES (index 26..35) : disposés sur une RANGÉE horizontale droite à
  //     y constant (DIGIT_ROW_Y), répartis uniformément de DIGIT_ROW_X_START à
  //     DIGIT_ROW_X_END, sous l'arc des lettres.
  //
  // `geom` est l'UNIQUE source de vérité partagée entre le placement CSS des
  // glyphes et le calcul de ciblage de la planchette, afin que la planchette
  // atterrisse exactement sur le centre des glyphes — DANS LES DEUX RÉGIONS. Le
  // CSS de index.html réutilise exactement ces mêmes constantes (mêmes nombres).
  // On fige l'objet pour empêcher toute mutation accidentelle (le cœur reste pur).
  var geom = Object.freeze({
    // Dimensions du plateau (stage) partagées avec le CSS de index.html.
    STAGE_W: 700,
    STAGE_H: 380,
    // --- Arc des lettres (index 0..25) ---
    LETTER_COUNT: 26,
    ARC_START_ANGLE: Math.PI * 1.02, // première lettre (A), côté gauche
    ARC_END_ANGLE: Math.PI * 1.98, // dernière lettre (Z), côté droit
    ARC_RADIUS: 268,
    ARC_CENTER_X: 350, // STAGE_W / 2
    ARC_CENTER_Y: 300, // centre sous l'arc : les lettres balaient la bande haute
    // --- Rangée des chiffres (index 26..35) ---
    DIGIT_COUNT: 10,
    DIGIT_ROW_Y: 300, // y constant, sous l'arc des lettres
    DIGIT_ROW_X_START: 120,
    DIGIT_ROW_X_END: 580 // répartis uniformément sur la largeur du plateau
  });

  // arcAngle(index, count, g) : angle (radians) de la LETTRE située à `index`,
  // interpolé linéairement sur le SEUL arc des lettres, de ARC_START_ANGLE à
  // ARC_END_ANGLE. La paramètre `count` est conservé pour compatibilité de
  // signature mais l'interpolation s'appuie sur LETTER_COUNT. Garde
  // LETTER_COUNT <= 1 (évite la division par zéro / une seule lettre) en
  // renvoyant ARC_START_ANGLE. `g` est optionnel et vaut le `geom` du module par
  // défaut, ce qui rend la fonction testable avec une autre disposition
  // (Req 1.2, 1.4).
  function arcAngle(index, count, g) {
    g = g || geom;
    if (g.LETTER_COUNT <= 1) {
      return g.ARC_START_ANGLE;
    }
    var t = index / (g.LETTER_COUNT - 1);
    return g.ARC_START_ANGLE + (g.ARC_END_ANGLE - g.ARC_START_ANGLE) * t;
  }

  // arcPosition(index, count, g) : centre { x, y } du glyphe à `index`, calculé
  // PAR RÉGION (fonction par morceaux). Pure, totale et toujours finie — ne lève
  // jamais, quel que soit `index` (0..35 et au-delà) :
  //   - LETTRES (index < LETTER_COUNT) : projetées sur l'arc via arcAngle, avec
  //     cos/sin autour de (ARC_CENTER_X, ARC_CENTER_Y) et rayon ARC_RADIUS.
  //   - CHIFFRES (index >= LETTER_COUNT) : placés sur la rangée droite ; d est
  //     l'index de chiffre 0..9, interpolé de DIGIT_ROW_X_START à
  //     DIGIT_ROW_X_END à y = DIGIT_ROW_Y. On garde denom = DIGIT_COUNT - 1
  //     contre une disposition dégénérée à un seul chiffre.
  // `count` est accepté pour compatibilité de signature (movePlanchetteTo appelle
  // arcPosition(index, ARC_CHARS.length)) ; le placement est piloté par la
  // région de l'index (Req 1.2, 1.4, 1.5).
  function arcPosition(index, count, g) {
    g = g || geom;
    if (index < g.LETTER_COUNT) {
      var angle = arcAngle(index, count, g);
      return {
        x: g.ARC_CENTER_X + g.ARC_RADIUS * Math.cos(angle),
        y: g.ARC_CENTER_Y + g.ARC_RADIUS * Math.sin(angle)
      };
    }
    // Région des chiffres : index 26..35 -> 0..9 le long de la rangée droite.
    var d = index - g.LETTER_COUNT; // 0..9
    var denom = (g.DIGIT_COUNT - 1) || 1; // garde les dispositions à un chiffre
    var frac = d / denom; // 0..1
    return {
      x: g.DIGIT_ROW_X_START + (g.DIGIT_ROW_X_END - g.DIGIT_ROW_X_START) * frac,
      y: g.DIGIT_ROW_Y
    };
  }

  // --- Cœur pur (tâche 4.1) : centre d'un élément dans son conteneur --------
  //
  // elementCenterInContainer(targetRect, containerRect) : helper PUR, totalement
  // Node-safe (aucun DOM réel), qui calcule le point { x, y } du CENTRE d'un
  // élément cible EXPRIMÉ DANS LE REPÈRE DU CONTENEUR. Il n'opère que sur des
  // objets plats { left, top, width, height } (par ex. le résultat de
  // getBoundingClientRect(), mais aussi n'importe quel rect synthétique de test).
  //
  //   x = targetRect.left + targetRect.width  / 2 - containerRect.left
  //   y = targetRect.top  + targetRect.height / 2 - containerRect.top
  //
  // Autrement dit : centre de la cible (coin + demi-taille) moins l'origine du
  // conteneur, ce qui ramène le point dans l'espace local du conteneur. Pur et
  // total : ne lève jamais, ne mute rien, et renvoie des coordonnées finies dès
  // lors que les rects d'entrée sont finis (Req 2.1, 2.2).
  function elementCenterInContainer(targetRect, containerRect) {
    return {
      x: targetRect.left + targetRect.width / 2 - containerRect.left,
      y: targetRect.top + targetRect.height / 2 - containerRect.top
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

    // Élément DOM courant visé par la planchette. Mémorisé à chaque déplacement
    // réussi afin que l'écouteur de redimensionnement (tâche 4.3) puisse
    // re-mesurer et repositionner sur LA MÊME cible après un changement de
    // viewport/scale. null tant qu'aucune cible n'a été visée (nom vide, etc.).
    var lastTargetEl = null;

    // applyBoardScale() : CORRECTIF RESPONSIVE (issues 1 & 2). Le stage `.ouija`
    // est dessine dans un repere FIXE de geom.STAGE_W (700) de large puis mis a
    // l'echelle via `transform: scale(var(--board-scale))`. L'ancien scale etait
    // base sur le viewport (media query), donc il ne correspondait PAS a la
    // largeur reellement disponible du conteneur (main max-width 640, .ouija
    // max-width:100%), d'ou le debordement de Z a droite et la derive de ~60px
    // de la planchette (le scale suppose par movePlanchetteToElement, cr.width/
    // STAGE_W, ne matchait pas le scale CSS applique). On calcule donc ICI le
    // scale a partir de la largeur DISPONIBLE mesuree (offsetWidth du parent, ou
    // clientWidth du root) et on l'ecrit dans --board-scale. Ainsi le scale CSS
    // == cr.width/STAGE_W par construction, les glyphes tiennent dans la bordure
    // avec des marges egales, et la planchette atterrit pile sur le glyphe.
    function applyBoardScale() {
      if (typeof document === "undefined" || !root || !root.style) {
        return 1;
      }
      // Largeur disponible : celle du parent (le flux), sinon le root lui-meme.
      var avail = 0;
      if (root.parentElement && typeof root.parentElement.clientWidth === "number") {
        avail = root.parentElement.clientWidth;
      }
      if (!avail && typeof root.clientWidth === "number") {
        avail = root.clientWidth;
      }
      var stageW = geom.STAGE_W || 700;
      var scale = avail > 0 ? Math.min(1, avail / stageW) : 1;
      if (!scale || !isFinite(scale)) {
        scale = 1;
      }
      root.style.setProperty("--board-scale", String(scale));
      return scale;
    }

    // movePlanchetteToElement(el) : place la planchette sur le CENTRE RÉEL à
    // l'écran de l'élément `el`, mesuré via getBoundingClientRect() relativement
    // au conteneur du plateau (`root`). Remplace l'ancienne math pure
    // arcPosition : la planchette atterrit désormais exactement sur le glyphe ou
    // le bouton marqueur affiché, quelle que soit la disposition (Req 2.1, 2.2).
    //
    // RAISONNEMENT SUR LE SCALE (décision documentée) :
    //   `.ouija` (= root) porte `transform: scale(var(--board-scale, 1))`.
    //   getBoundingClientRect() renvoie des pixels À L'ÉCRAN, donc DÉJÀ MIS À
    //   L'ÉCHELLE, aussi bien pour la cible que pour le conteneur (tous deux
    //   vivent dans le stage mis à l'échelle). Le delta (centre-cible −
    //   origine-conteneur) est donc en pixels SCALÉS. Or la planchette, enfant
    //   du stage, reçoit sa `transform: translate(x, y)` inline À L'INTÉRIEUR du
    //   stage mis à l'échelle : le scale() du stage multiplie ce translate. Il
    //   faut donc exprimer le translate en unités NON scalées du stage, en
    //   divisant le delta scalé par le scale courant. On récupère le scale via
    //   cr.width / geom.STAGE_W (largeur rendue / largeur de référence 700),
    //   avec garde anti division par zéro. Ainsi la fenêtre de la planchette se
    //   pose sur le centre de la cible à n'importe quelle largeur de viewport.
    function movePlanchetteToElement(el) {
      if (!planchette || !el || !root) {
        return;
      }
      if (typeof el.getBoundingClientRect !== "function"
          || typeof root.getBoundingClientRect !== "function") {
        return;
      }
      var tr = el.getBoundingClientRect();
      var cr = root.getBoundingClientRect();
      var c = elementCenterInContainer(
        { left: tr.left, top: tr.top, width: tr.width, height: tr.height },
        { left: cr.left, top: cr.top, width: cr.width, height: cr.height }
      );
      // scale = largeur rendue (scalée) / largeur de référence du stage (700).
      var scale = (cr.width && geom.STAGE_W) ? (cr.width / geom.STAGE_W) : 1;
      if (!scale) {
        scale = 1;
      }
      var x = c.x / scale;
      var y = c.y / scale;
      // Mouvement réduit : pas de transition (déplacement immédiat). Sinon on
      // efface le style inline pour laisser s'appliquer la transition CSS.
      if (planchette.style) {
        planchette.style.transition = reduceMotion ? "none" : "";
        planchette.style.transform = "translate(" + x + "px, " + y + "px)";
      }
      lastTargetEl = el;
    }

    // movePlanchetteTo(index) : conserve l'API par index pour les LETTRES et
    // CHIFFRES. On résout l'index 0..35 vers son caractère d'arc puis vers le
    // bouton DOM correspondant (button[data-char="X"]) et on délègue à
    // movePlanchetteToElement, qui mesure le rect réel. index < 0 / invalide /
    // aucun élément trouvé → on ne bouge pas (préserve la règle « pas de
    // mouvement » quand lastArcChar est null, Req 3.5, 4.7). Les accès DOM sont
    // gardés : sous Node (require) planchette/root sont null → aucun appel DOM.
    function movePlanchetteTo(index) {
      if (!planchette || !root) {
        return;
      }
      if (typeof index !== "number" || isNaN(index) || index < 0 || index >= ARC_CHARS.length) {
        return; // laisser la planchette où elle est
      }
      if (typeof document === "undefined" || typeof root.querySelector !== "function") {
        return;
      }
      var ch = ARC_CHARS.charAt(index);
      var el = root.querySelector('button[data-char="' + ch + '"]');
      if (!el) {
        return; // aucun glyphe correspondant → pas de mouvement
      }
      movePlanchetteToElement(el);
    }

    // Repositionne la planchette sur le dernier caractère d'arc du Spelled_Name
    // courant. Si lastArcChar renvoie null (nom vide ou fin hors arc) →
    // charIndex(null) vaut -1 et movePlanchetteTo ne bouge pas (Req 3.4, 4.6,
    // 4.7). Met à jour lastTargetEl pour que le redimensionnement suive la
    // bonne cible : on remet null quand il n'y a pas de glyphe cible (nom vide
    // / fin hors arc), sinon l'élément résolu.
    function repositionPlanchette() {
      var idx = charIndex(lastArcChar(name));
      if (idx < 0 || typeof document === "undefined"
          || !root || typeof root.querySelector !== "function") {
        if (idx < 0) {
          lastTargetEl = null;
        }
        movePlanchetteTo(idx);
        return;
      }
      var ch = ARC_CHARS.charAt(idx);
      var el = root.querySelector('button[data-char="' + ch + '"]');
      lastTargetEl = el || null;
      if (el) {
        movePlanchetteToElement(el);
      }
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
        applyBoardScale();
        var charButtons = root.querySelectorAll("button[data-char]");
        Array.prototype.forEach.call(charButtons, function (btn) {
          btn.addEventListener("click", function () {
            activateChar(btn.getAttribute("data-char"));
          });
        });
        var markerButtons = root.querySelectorAll("button[data-marker]");
        Array.prototype.forEach.call(markerButtons, function (btn) {
          btn.addEventListener("click", function () {
            // Met d'abord à jour le Spelled_Name (YES/NO ajoutent leur texte,
            // GOODBYE efface). activateMarker → afterStateChange →
            // repositionPlanchette viserait le dernier caractère d'arc du
            // nouveau nom (S pour "YES", O pour "NO"), ce qui est précisément le
            // bug que l'on corrige côté MARQUEUR. On vise donc explicitement le
            // BOUTON MARQUEUR cliqué APRÈS activateMarker, de sorte que le clic
            // marqueur l'emporte (Req 2.1, 2.3).
            activateMarker(btn.getAttribute("data-marker"));
            // GOODBYE efface le nom (lastArcChar null) : on vise malgré tout le
            // bouton GOODBYE cliqué — choix cohérent « cliquer un marqueur pose
            // la planchette sur ce marqueur », plutôt que de la laisser figée.
            movePlanchetteToElement(btn);
          });
        });
        if (input && typeof input.addEventListener === "function") {
          input.addEventListener("input", function () {
            syncFromInput();
          });
        }
        // Redimensionnement de la fenêtre : la largeur rendue du stage (et donc
        // le scale) change, déplaçant les centres réels des éléments. On
        // re-mesure et repositionne la planchette sur LA MÊME cible courante
        // (lastTargetEl) si elle existe encore dans le DOM. Gardé par la
        // présence de window (environnements de test / Node). Pas de debounce
        // nécessaire ici (repositionnement idempotent et peu coûteux).
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
          window.addEventListener("resize", function () {
            applyBoardScale();
            if (lastTargetEl
                && (typeof lastTargetEl.isConnected !== "boolean" || lastTargetEl.isConnected)) {
              movePlanchetteToElement(lastTargetEl);
            }
          });
        }
      }
    }

    return {
      activateChar: activateChar,
      activateMarker: activateMarker,
      syncFromInput: syncFromInput,
      value: value,
      movePlanchetteTo: movePlanchetteTo,
      movePlanchetteToElement: movePlanchetteToElement
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
    elementCenterInContainer: elementCenterInContainer,
    createBoard: createBoard
  };
});
