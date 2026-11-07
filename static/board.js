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

  // --- Cœur pur (correctif alignement) : projection du modèle vers le box réel
  //
  // scaledArcPosition(index, width, height, g) : prend le centre { x, y } du
  // glyphe `index` exprimé dans le repère de référence STAGE_W×STAGE_H (via
  // arcPosition) et le projette LINÉAIREMENT sur un conteneur de taille réelle
  // (width × height), mesuré APRÈS layout. Contrairement à l'ancien modèle à
  // `transform: scale()` (qui gardait une boîte de layout de 700px et la
  // mettait à l'échelle autour de `top center`, d'où un décalage entre le
  // cadre visible et l'arc), cette projection place chaque glyphe à la MÊME
  // fraction du box réel : fx = x/STAGE_W, fy = y/STAGE_H, puis on multiplie
  // par la largeur/hauteur RÉELLES. Le centre de l'arc devient donc exactement
  // width/2 (car ARC_CENTER_X = STAGE_W/2 → fraction 0.5), sans marge ni
  // décalage parasite.
  //
  // Pure, totale, Node-safe : n'opère que sur des nombres, ne touche aucun DOM,
  // ne lève jamais et renvoie des coordonnées finies dès lors que width/height
  // sont finis et strictement positifs (sinon retombe sur le centre du box).
  function scaledArcPosition(index, width, height, g) {
    g = g || geom;
    var p = arcPosition(index, g.LETTER_COUNT + g.DIGIT_COUNT, g);
    var w = (typeof width === "number" && isFinite(width) && width > 0) ? width : g.STAGE_W;
    var h = (typeof height === "number" && isFinite(height) && height > 0) ? height : g.STAGE_H;
    return {
      x: (p.x / g.STAGE_W) * w,
      y: (p.y / g.STAGE_H) * h
    };
  }

  // --- Cœur pur (Oracle_Board, tâche 1.1) : réponses de l'oracle ------------
  //
  // Feature: oracle-board — le plateau répond lui-même à une Preset_Question en
  // épelant la réponse. La LOGIQUE de la réponse vit ici, dans le cœur pur de
  // board.js (aucun DOM, aucun réseau, aucune mutation d'argument), afin d'être
  // `require()`-able sous Node et couverte par des tests de propriétés. Seules
  // les constantes et le sanitiseur sont ajoutés ici (tâche 1.1) ; oldestTask,
  // makeRng et oracleAnswer suivront (tâche 1.2).

  // Answer_Length_Limit : longueur maximale d'une Oracle_Answer (Req 2.4, 3.5).
  var ANSWER_MAX = 24;

  // Answer_Charset : seuls caractères autorisés dans une Oracle_Answer — les
  // lettres A–Z, les chiffres 0–9 et l'espace. Aligné sur ARC_CHARS (A–Z0–9)
  // plus l'espace ; l'espace n'a pas de glyphe et sera simplement sauté par
  // l'animation (Req 2.3, 4.3).
  var ANSWER_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";

  // QUESTIONS : table stable Question_Id ↔ libellé anglais, afin que le gabarit
  // (templates/index.html) et la fonction s'accordent sur les quatre
  // Preset_Questions (Req 1.1, 2.1).
  var QUESTIONS = {
    "which-first": "Which first?",
    "oldest": "What is oldest?",
    "count": "How many spirits?",
    "quiet": "Is it quiet?"
  };

  // sanitizeToAnswer(title) : réduit une chaîne utilisateur arbitraire à
  // l'Answer_Charset (Req 3.5, 3.6). PURE et TOTALE — ne lève jamais, ne mute
  // jamais son argument (les chaînes JS sont immuables), accepte n'importe
  // quelle entrée (y compris non-chaîne, via String(...)).
  //
  // Étapes :
  //   1. Mise en MAJUSCULES via String(title).toUpperCase().
  //   2. Remplace chaque séquence de caractères HORS [A-Z0-9] par UN seul
  //      espace (la ponctuation et les accents deviennent des séparateurs
  //      plutôt que du bruit).
  //   3. Supprime les espaces en tête/queue et réduit les suites internes
  //      d'espaces à un seul (le point 2 produit déjà des espaces simples, mais
  //      le trim des bords reste nécessaire).
  //   4. Tronque à ANSWER_MAX, puis retire un éventuel espace final laissé par
  //      la troncature (afin de ne jamais terminer sur un espace parasite).
  //   5. Si le résultat est vide (le titre n'avait aucun A–Z/0–9 après
  //      pliage), renvoie le repli non vide, dans le charset, "A SPIRIT"
  //      (Req 3.6).
  function sanitizeToAnswer(title) {
    var upper = String(title).toUpperCase();
    // Tout run de caractères hors [A-Z0-9] → un espace unique.
    var folded = upper.replace(/[^A-Z0-9]+/g, " ");
    // Trim des bords (les runs internes sont déjà des espaces simples).
    var collapsed = folded.replace(/^ +| +$/g, "");
    // Troncature au plafond, puis retrait d'un espace final laissé par la coupe.
    var truncated = collapsed.slice(0, ANSWER_MAX).replace(/ +$/g, "");
    if (truncated.length === 0) {
      return "A SPIRIT";
    }
    return truncated;
  }

  // --- Cœur pur (Oracle_Board, tâche 1.2) : plus ancienne tâche, PRNG, oracle
  //
  // Suite du cœur pur de l'Oracle_Board : oldestTask, makeRng et oracleAnswer.
  // Toutes PURES et TOTALES — aucun DOM, aucun réseau, aucune mutation
  // d'argument, ne lèvent jamais, et `require()`-ables sous Node.

  // oldestTask(list) : renvoie la tâche la PLUS ANCIENNE de `list` (Req 3.2).
  //   - Si CHAQUE tâche possède un `created_at` non vide : renvoie celle dont
  //     le `created_at` est lexicographiquement le PLUS PETIT. Le texte
  //     SQLite datetime('now') ("YYYY-MM-DD HH:MM:SS") se trie
  //     chronologiquement comme simple chaîne, donc une comparaison de chaînes
  //     suffit (pas de parsing). En cas d'ÉGALITÉ de timestamps, on garde le
  //     plus petit `id` comme étant le plus ancien (le plus grand `id` est le
  //     plus récent).
  //   - Sinon (un `created_at` manquant/vide — cas NULL migré de main.py) :
  //     renvoie le DERNIER élément de `list`, le plus ancien dans l'ordre de
  //     rendu `id` DESC du serveur.
  // Garde défensive : si `list` n'est pas un tableau non vide, renvoie
  // undefined sans lever (oracleAnswer ne l'appelle que sur une liste non vide,
  // l'empty étant déjà traité).
  function oldestTask(list) {
    if (!Array.isArray(list) || list.length === 0) {
      return undefined;
    }
    // Tous les `created_at` sont-ils présents et non vides ?
    var allHaveCreatedAt = true;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var c = t && t.created_at;
      if (typeof c !== "string" || c.length === 0) {
        allHaveCreatedAt = false;
        break;
      }
    }
    if (!allHaveCreatedAt) {
      // Repli : ordre du serveur (id DESC) → le dernier est le plus ancien.
      return list[list.length - 1];
    }
    // Tous datés : plus petit created_at ; égalité → plus petit id.
    var oldest = list[0];
    for (var j = 1; j < list.length; j++) {
      var cand = list[j];
      if (cand.created_at < oldest.created_at) {
        oldest = cand;
      } else if (cand.created_at === oldest.created_at) {
        // Égalité de timestamps : le plus petit id est le plus ancien.
        var candId = typeof cand.id === "number" ? cand.id : Infinity;
        var oldId = typeof oldest.id === "number" ? oldest.id : Infinity;
        if (candId < oldId) {
          oldest = cand;
        }
      }
    }
    return oldest;
  }

  // makeRng(seed) : petit PRNG déterministe (Mulberry32) renvoyant une fonction
  // () => number dans [0,1). Utilisé UNIQUEMENT lorsqu'un appelant fournit une
  // graine (tests ou règles futures) ; la production n'en passe pas, donc le
  // chemin par défaut n'utilise aucune aléa (déterminisme inconditionnel,
  // Req 2.6, 2.7). Pur : pour une même graine, produit toujours la même suite.
  function makeRng(seed) {
    var a = (seed >>> 0) || 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // oracleAnswer(tasks, questionId, now, rng) : calcule l'Oracle_Answer de
  // façon DÉTERMINISTE à partir du Task_List, d'un Question_Id et d'un temps de
  // référence (Req 2.1). PURE et TOTALE — pour TOUTE entrée elle renvoie une
  // chaîne dans l'Answer_Charset et de longueur <= ANSWER_MAX, sans jamais
  // lever ni muter ses arguments (Req 2.2, 2.3, 2.4, 2.8).
  //
  // Règles (voir design.md) :
  //   0. `tasks` non tableau → liste vide (Req 2.8).
  //   1. Liste vide → "GOODBYE" pour TOUT Question_Id, y compris inconnu (Req 2.5).
  //   2. quiet → "NO" (la liste est non vide ici ; le cas vide est déjà traité) (Req 3.4).
  //   3. count → String(list.length) (chiffres décimaux) (Req 3.3).
  //   4. which-first → sanitizeToAnswer(list[0].title) (premier dans l'ordre serveur) (Req 3.1).
  //   5. oldest → sanitizeToAnswer(oldestTask(list).title) (Req 3.2).
  //   6. Question_Id inconnu → règle which-first (reste total et dans le charset) (Req 2.8).
  // Le résultat final est plafonné défensivement à ANSWER_MAX via slice (Req 2.4).
  //
  // `now` est accepté pour la stabilité de signature et d'éventuelles règles
  // futures ; les règles actuelles n'en dépendent pas (Req 2.6). `rng` est une
  // source d'aléa seedée OPTIONNELLE (Req 2.7) : les règles livrées n'en ont
  // pas besoin et la fonction n'appelle JAMAIS Math.random.
  function oracleAnswer(tasks, questionId, now, rng) {
    var list = Array.isArray(tasks) ? tasks : [];
    var result;
    if (list.length === 0) {
      result = "GOODBYE";
    } else if (questionId === "quiet") {
      result = "NO";
    } else if (questionId === "count") {
      result = String(list.length);
    } else if (questionId === "oldest") {
      var old = oldestTask(list);
      result = sanitizeToAnswer(old ? old.title : "");
    } else {
      // which-first ET tout Question_Id inconnu (repli sûr, Req 2.8).
      result = sanitizeToAnswer(list[0] ? list[0].title : "");
    }
    // Plafond défensif : garantit length <= ANSWER_MAX pour toute entrée.
    return result.slice(0, ANSWER_MAX);
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

    // layoutGlyphs() : CORRECTIF ALIGNEMENT (racine commune des deux bugs).
    //
    // ANCIEN modèle (supprimé) : le plateau était dessiné dans une boîte de
    // layout FIXE de geom.STAGE_W (700) puis mis à l'échelle via
    // `transform: scale(var(--board-scale))` avec `transform-origin: top
    // center`. La boîte de layout restait 700px et était mise à l'échelle
    // AUTOUR de son centre, alors que le cadre bois visible, lui, était borné
    // à la colonne réelle (≈645px). Résultat : l'arc des glyphes et le cadre
    // n'avaient pas le même centre → l'arc dérivait d'environ +55px vers la
    // DROITE (A collé au bord gauche, Z débordant à droite), et la planchette,
    // dont le translate était « dé-scalé » par cr.width/700, dérivait du même
    // ~65px dans le même sens.
    //
    // NOUVEAU modèle : plus AUCUN `transform: scale()`. Le conteneur `.ouija`
    // (= root) est une boîte fluide en `box-sizing: border-box`, dont la
    // largeur réelle (clientWidth, mesurée APRÈS layout) est l'UNIQUE source de
    // vérité. On positionne chaque glyphe en pixels RÉELS via
    // scaledArcPosition(index, clientWidth, clientHeight) : le centre de l'arc
    // devient exactement clientWidth/2 (ARC_CENTER_X = STAGE_W/2 → fraction
    // 0.5), donc A et Z sont symétriques dans le cadre et tiennent dedans. Les
    // glyphes gardent `transform: translate(-50%, -50%)` (centrage CSS) ; on ne
    // fixe que leur left/top. La planchette, elle, est posée par mesure réelle
    // du rect (movePlanchetteToElement) relativement au MÊME box, sans aucune
    // division par un scale.
    //
    // clientWidth/clientHeight excluent la bordure (box-sizing: border-box) :
    // c'est exactement le repère dans lequel les enfants position:absolute sont
    // placés, donc l'origine (0,0) des glyphes et de la planchette coïncide
    // avec le coin intérieur du cadre. Gardé par la présence du DOM.
    function layoutGlyphs() {
      if (typeof document === "undefined" || !root
          || typeof root.querySelectorAll !== "function") {
        return;
      }
      var w = (typeof root.clientWidth === "number" && root.clientWidth > 0)
        ? root.clientWidth
        : geom.STAGE_W;
      var h = (typeof root.clientHeight === "number" && root.clientHeight > 0)
        ? root.clientHeight
        : geom.STAGE_H;
      var glyphs = root.querySelectorAll("button[data-index]");
      Array.prototype.forEach.call(glyphs, function (btn) {
        var idx = parseInt(btn.getAttribute("data-index"), 10);
        if (isNaN(idx)) {
          return;
        }
        var p = scaledArcPosition(idx, w, h);
        if (btn.style) {
          btn.style.left = p.x + "px";
          btn.style.top = p.y + "px";
        }
      });
    }

    // movePlanchetteToElement(el) : place le CENTRE de la fenêtre de la
    // planchette exactement sur le CENTRE RÉEL à l'écran de l'élément `el`.
    //
    // On mesure le rect de la cible ET du conteneur (root) via
    // getBoundingClientRect(), on calcule le centre de la cible dans le repère
    // du conteneur (elementCenterInContainer, pur), puis on retranche la DEMI-
    // largeur et la DEMI-hauteur de la planchette elle-même afin que le CENTRE
    // de sa fenêtre — et non son coin haut-gauche — atterrisse sur le point
    // cible (Req 2.1, 2.2). Aucune division par un scale : il n'y a plus de
    // `transform: scale()` sur le conteneur, donc les pixels mesurés SONT les
    // pixels de translate. La planchette et la cible vivent dans le même box,
    // sans décalage parasite.
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
      // Demi-taille de la planchette : on mesure son propre rect (déjà en
      // pixels écran, sans scale). Fallback sur la moitié de width/height
      // nominaux (96/2) si la mesure est indisponible (environnement de test).
      var pw = 96;
      var ph = 96;
      if (typeof planchette.getBoundingClientRect === "function") {
        var pr = planchette.getBoundingClientRect();
        if (pr && pr.width > 0) { pw = pr.width; }
        if (pr && pr.height > 0) { ph = pr.height; }
      }
      var x = c.x - pw / 2;
      var y = c.y - ph / 2;
      // Mouvement réduit : pas de transition (déplacement immédiat). Sinon on
      // efface le style inline pour laisser s'appliquer la transition CSS.
      if (planchette.style) {
        planchette.style.transition = reduceMotion ? "none" : "";
        planchette.style.transform = "translate(" + x + "px, " + y + "px)";
      }
      lastTargetEl = el;
      // Notifie les abonnés (mascotte : les yeux suivent la planchette) de la
      // nouvelle position du CENTRE de la fenêtre, dans le repère du conteneur.
      notifyPlanchetteMove(c.x, c.y, cr.width, cr.height);
    }

    // Abonnements au déplacement de la planchette (Part 2 : yeux du fantôme).
    // Chaque abonné reçoit { x, y, width, height } : centre de la fenêtre dans
    // le repère du conteneur + dimensions réelles du conteneur. Pur côté
    // board.js (aucune dépendance au fantôme) : ghost.js s'abonne via le
    // contrôleur retourné.
    var moveListeners = [];
    function notifyPlanchetteMove(x, y, width, height) {
      for (var i = 0; i < moveListeners.length; i++) {
        try {
          moveListeners[i]({ x: x, y: y, width: width, height: height });
        } catch (e) {
          // Un abonné défaillant ne doit jamais casser le plateau.
        }
      }
    }
    function onPlanchetteMove(fn) {
      if (typeof fn === "function") {
        moveListeners.push(fn);
      }
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
        layoutGlyphs();
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
            // La largeur réelle du conteneur change : on re-dispose les glyphes
            // dans le nouveau box (centre = clientWidth/2), puis on repositionne
            // la planchette sur LA MÊME cible courante si elle existe encore.
            layoutGlyphs();
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
      movePlanchetteToElement: movePlanchetteToElement,
      layoutGlyphs: layoutGlyphs,
      onPlanchetteMove: onPlanchetteMove
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
    scaledArcPosition: scaledArcPosition,
    elementCenterInContainer: elementCenterInContainer,
    // Oracle_Board : cœur pur. Constantes + sanitiseur (tâche 1.1) puis
    // oldestTask, makeRng et oracleAnswer (tâche 1.2). Aucun export existant
    // n'est modifié ni renommé.
    ANSWER_MAX: ANSWER_MAX,
    ANSWER_CHARSET: ANSWER_CHARSET,
    QUESTIONS: QUESTIONS,
    sanitizeToAnswer: sanitizeToAnswer,
    oldestTask: oldestTask,
    makeRng: makeRng,
    oracleAnswer: oracleAnswer,
    createBoard: createBoard
  };
});
