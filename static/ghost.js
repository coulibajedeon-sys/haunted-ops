/*
 * ghost.js — Ghost_Mascot de Séance
 *
 * Gère les messages contextuels de la mascotte fantôme (#mascot-msg) :
 *   - état « quiet » quand la liste d'esprits est vide ;
 *   - message d'ambiance aléatoire (≠ du précédent) dès qu'un esprit est présent.
 *
 * La logique de sélection est **pure** et exportée afin d'être testable par
 * propriétés (tâche 7.2, Property 6). Le câblage dans la page (inclusion du
 * script, initialisation au chargement) relève de la tâche 9.1 et n'est PAS
 * réalisé ici : ce fichier se contente de fournir l'API et d'auto-initialiser
 * de façon défensive si le DOM est déjà disponible.
 *
 * Requirements: 2.3, 2.4, 6.2, 6.3, 6.4
 */
(function (root) {
  "use strict";

  // Message affiché lorsque la maison est « calme » (liste vide).
  // IMPORTANT : utilise le même caractère d'ellipse Unicode (…, U+2026) que
  // templates/index.html (Req 2.3, 6.2, 6.4).
  var QUIET = "The house is quiet\u2026 for now.";

  // Au moins 5 messages d'ambiance DISTINCTS (Req 2.4, 6.3).
  var SPOOKY = [
    "Something stirs in the walls\u2026",
    "A cold draft passes through the room\u2026",
    "The candle flickers without a breeze\u2026",
    "You are not alone in here\u2026",
    "The floorboards creak behind you\u2026",
    "A whisper calls your name\u2026"
  ];

  /**
   * Sélectionne un message d'ambiance aléatoire dans `pool`, différent de
   * `previous` lorsque c'est possible.
   *
   * Fonction **pure** (hors source d'aléa injectable) : pour des `pool` et
   * `previous` donnés, elle renvoie toujours un élément de `pool`, et ne
   * renvoie jamais `previous` tant que `pool` contient au moins deux éléments
   * distincts de lui (Req 6.3).
   *
   * @param {string}   previous Le dernier message affiché (ou null/undefined).
   * @param {string[]} [pool]   L'ensemble des messages candidats (défaut SPOOKY).
   * @param {function} [rng]    Générateur pseudo-aléatoire renvoyant [0, 1)
   *                            (défaut Math.random). Injectable pour les tests.
   * @returns {string} Un message de `pool`, différent de `previous` si possible.
   */
  function pickSpooky(previous, pool, rng) {
    var candidates = pool || SPOOKY;
    var random = rng || Math.random;

    // Pool vide : rien à renvoyer.
    if (!candidates || candidates.length === 0) {
      return QUIET;
    }
    // Un seul élément : pas de choix possible, on le renvoie tel quel.
    if (candidates.length === 1) {
      return candidates[0];
    }

    // Écarte le message précédent pour garantir la non-répétition (Req 6.3).
    // Si tous les éléments sont égaux à `previous`, on retombe sur le pool
    // complet (impossible de différer).
    var filtered = candidates.filter(function (msg) {
      return msg !== previous;
    });
    var choices = filtered.length > 0 ? filtered : candidates;

    var index = Math.floor(random() * choices.length);
    // Garde-fou si rng() renvoie exactement 1 (hors contrat Math.random).
    if (index >= choices.length) {
      index = choices.length - 1;
    }
    return choices[index];
  }

  // =========================================================================
  // Part 2 — cœur PUR du fantôme réactif (yeux + expressions + bulles).
  //
  // Mêmes conventions que ci-dessus : logique testable SANS DOM, l'adaptateur
  // navigateur (createMascot) applique ces résultats au SVG. Toutes les
  // fonctions sont pures et totales (ne lèvent jamais, ne mutent rien).
  // =========================================================================

  // Les cinq expressions du fantôme (Req Part 2.2).
  var EXPRESSIONS = ["idle", "curious", "surprised", "happy", "sleepy"];

  // Expressions TRANSITOIRES : jouées un court instant puis retour à "idle"
  // par l'adaptateur (timer). Les autres ("idle", "curious", "sleepy") sont des
  // états « stables » pilotés par l'activité.
  var TRANSIENT = { surprised: true, happy: true };

  // Phrases thématiques par expression (bulle de dialogue, Req Part 2.3). Au
  // moins une par expression ; plusieurs pour varier.
  var PHRASES = {
    idle: ["Who goes there?", "The veil is thin tonight\u2026"],
    curious: ["Spelling something?", "I sense a name forming\u2026"],
    surprised: ["A new spirit arrives!", "Oh! Who have you summoned?"],
    happy: ["Rest in peace\u2026", "Another soul set free.", "The house is at peace."],
    sleepy: ["Zzz\u2026", "So very tired\u2026"]
  };

  /**
   * nextExpression(current, event) — machine à états PURE des expressions.
   *
   * Événements reconnus :
   *   "type"   → curious (l'utilisateur tape / clique sur le plateau) ;
   *   "summon" → surprised (une tâche vient d'être invoquée) ;
   *   "banish" → happy (une tâche vient d'être bannie) ;
   *   "idle"   → sleepy (aucune activité depuis 20 s) ;
   *   "rest"   → idle (fin d'une expression transitoire / retour au calme) ;
   *   "wake"   → idle (réveil depuis sleepy dès qu'il se passe quelque chose).
   *
   * Totale : tout événement inconnu laisse `current` inchangé, et une entrée
   * `current` non reconnue retombe sur "idle". Renvoie TOUJOURS un membre de
   * EXPRESSIONS (Req Part 2.2).
   *
   * @param {string} current Expression courante.
   * @param {string} event   Événement déclencheur.
   * @returns {string} La nouvelle expression (membre de EXPRESSIONS).
   */
  function nextExpression(current, event) {
    var base = EXPRESSIONS.indexOf(current) !== -1 ? current : "idle";
    switch (event) {
      case "type":
        return "curious";
      case "summon":
        return "surprised";
      case "banish":
        return "happy";
      case "idle":
        return "sleepy";
      case "rest":
      case "wake":
        return "idle";
      default:
        return base;
    }
  }

  /** Une expression est-elle transitoire (retour auto à idle) ? */
  function isTransient(expression) {
    return Object.prototype.hasOwnProperty.call(TRANSIENT, expression)
      && TRANSIENT[expression] === true;
  }

  /**
   * pupilOffset(targetX, targetY, originX, originY, maxRadius) — décalage PUR
   * des pupilles pour « regarder vers » un point cible, borné au socle de
   * l'œil (Req Part 2.1).
   *
   * Calcule le vecteur (cible − origine), le NORMALISE puis le met à l'échelle
   * à `maxRadius` quand sa longueur dépasse `maxRadius` ; sinon on le garde tel
   * quel (regard proportionnel pour les cibles proches). Le résultat { dx, dy }
   * a donc une norme toujours <= maxRadius → la pupille reste dans le socle.
   *
   * Totale et finie : cible == origine (vecteur nul) → { dx:0, dy:0 } ;
   * maxRadius non fini ou <= 0 → { dx:0, dy:0 } ; entrées non numériques → 0.
   *
   * @returns {{dx:number, dy:number}} Décalage borné, norme <= maxRadius.
   */
  function pupilOffset(targetX, targetY, originX, originY, maxRadius) {
    var r = (typeof maxRadius === "number" && isFinite(maxRadius) && maxRadius > 0)
      ? maxRadius : 0;
    var vx = (typeof targetX === "number" && typeof originX === "number")
      ? targetX - originX : 0;
    var vy = (typeof targetY === "number" && typeof originY === "number")
      ? targetY - originY : 0;
    if (!isFinite(vx)) { vx = 0; }
    if (!isFinite(vy)) { vy = 0; }
    if (r === 0) {
      return { dx: 0, dy: 0 };
    }
    var len = Math.sqrt(vx * vx + vy * vy);
    if (len === 0) {
      return { dx: 0, dy: 0 };
    }
    if (len <= r) {
      return { dx: vx, dy: vy };
    }
    var k = r / len;
    return { dx: vx * k, dy: vy * k };
  }

  /**
   * phraseFor(expression, rng) — phrase thématique PURE pour une expression.
   * Renvoie toujours une chaîne : pour une expression inconnue, retombe sur une
   * phrase « idle ». `rng` injectable (défaut Math.random) choisit la variante.
   */
  function phraseFor(expression, rng) {
    var random = rng || Math.random;
    // Accès par PROPRIÉTÉ PROPRE uniquement : un `expression` valant "toString"
    // / "constructor" / etc. ne doit JAMAIS retomber sur une méthode héritée du
    // prototype (sinon `list` serait une fonction, pas un tableau). Totalité
    // garantie : on retombe sur la liste "idle" pour toute clé non prévue.
    var list = (Object.prototype.hasOwnProperty.call(PHRASES, expression)
      && Array.isArray(PHRASES[expression]))
      ? PHRASES[expression]
      : PHRASES.idle;
    if (!list.length) {
      return "";
    }
    var i = Math.floor(random() * list.length);
    if (i < 0) { i = 0; }
    if (i >= list.length) { i = list.length - 1; }
    return list[i];
  }

  /**
   * Fabrique une mascotte liée à un élément DOM (`#mascot-msg` par défaut).
   *
   * L'objet retourné conserve le dernier message affiché afin que la
   * sélection suivante en diffère (Req 6.3). Il expose :
   *   - update(count) : met à jour le message selon le nombre d'esprits ;
   *   - quiet()       : force l'état « quiet » (liste vide) ;
   *   - spook()       : affiche un nouveau message d'ambiance ;
   *   - current()     : renvoie le dernier message affiché.
   *
   * @param {Object}      [options]
   * @param {HTMLElement} [options.el]  Élément cible (défaut : #mascot-msg).
   * @param {string[]}    [options.pool] Pool de messages (défaut SPOOKY).
   * @param {function}    [options.rng]  Source d'aléa (défaut Math.random).
   */
  function createMascot(options) {
    var opts = options || {};
    var el =
      opts.el ||
      (typeof document !== "undefined"
        ? document.getElementById("mascot-msg")
        : null);
    var pool = opts.pool || SPOOKY;
    var rng = opts.rng || Math.random;

    // Dernier message rendu, pour garantir la non-répétition.
    var last = null;

    function render(message) {
      last = message;
      if (el) {
        el.textContent = message;
      }
      return message;
    }

﻿    // Reactions visuelles du fantome SVG (issue 4). On pose une classe
    // transitoire sur .ghost-svg, puis on la retire a la fin de l'animation.
    // Sous prefers-reduced-motion, on ne pose rien (fantome statique). Gardes
    // defensifs : SVG absent ou environnement Node => no-op sur.
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
    function ghostSvg() {
      if (typeof document === "undefined") {
        return null;
      }
      var scope = null;
      if (el && typeof el.closest === "function") {
        scope = el.closest("#mascot");
      }
      if (!scope && typeof document.getElementById === "function") {
        scope = document.getElementById("mascot");
      }
      var r = scope || document;
      return (typeof r.querySelector === "function") ? r.querySelector(".ghost-svg") : null;
    }
    function playReaction(cls, ms) {
      if (prefersReducedMotion()) {
        return;
      }
      var svg = ghostSvg();
      if (!svg || !svg.classList) {
        return;
      }
      svg.classList.remove(cls);
      if (typeof svg.getBoundingClientRect === "function") {
        void svg.getBoundingClientRect();
      }
      svg.classList.add(cls);
      if (typeof setTimeout === "function") {
        setTimeout(function () {
          if (svg.classList) {
            svg.classList.remove(cls);
          }
        }, ms);
      }
    }
    function reactSummon() {
      playReaction("summoning", 650);
      dispatchExpression("summon"); // -> surprised (wide eyes, round mouth)
      armIdleTimer();
    }
    function reactBanish() {
      playReaction("banishing", 750);
      spawnParticles();
      dispatchExpression("banish"); // -> happy
      armIdleTimer();
    }

    // -------- Part 2 : expressions, yeux qui suivent, bulle, particules -----

    // Formes de bouche par expression (path `d` reecrit sur .ghost-mouth).
    var MOUTHS = {
      idle: "M27 40 q5 2 10 0",        // ligne calme, leger sourire
      curious: "M28 40 q4 1 8 0",      // petite bouche attentive
      surprised: "M32 41 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", // petit rond
      happy: "M26 39 q6 6 12 0",       // grand sourire
      sleepy: "M29 41 q3 1 6 0"        // petite bouche somnolente
    };

    var currentExpression = "idle";

    function svgEl() {
      return ghostSvg();
    }
    function bubbleEl() {
      if (typeof document === "undefined") {
        return null;
      }
      var scope = null;
      if (el && typeof el.closest === "function") {
        scope = el.closest("#mascot");
      }
      if (!scope && typeof document.getElementById === "function") {
        scope = document.getElementById("mascot");
      }
      var r = scope || document;
      return (typeof r.querySelector === "function")
        ? r.querySelector(".mascot-bubble") : null;
    }

    var bubbleTimer = null;
    /**
     * Affiche une bulle thematique pour `expression` pendant ~3s (Req Part 2.3).
     * aria-live sur l'element → annonce par les lecteurs d'ecran. Texte toujours
     * affiche, y compris sous prefers-reduced-motion (seule l'animation CSS est
     * neutralisee par la regle globale).
     */
    function showBubble(expression) {
      var b = bubbleEl();
      if (!b) {
        return;
      }
      var phrase = phraseFor(expression, rng);
      b.textContent = phrase;
      b.hidden = false;
      if (bubbleTimer && typeof clearTimeout === "function") {
        clearTimeout(bubbleTimer);
      }
      if (typeof setTimeout === "function") {
        bubbleTimer = setTimeout(function () {
          if (b) {
            b.hidden = true;
            b.textContent = "";
          }
        }, 3000);
      }
    }

    /**
     * Applique une expression au SVG : pose la classe expr-*, reecrit la bouche
     * et affiche la bulle. PUR cote decision (nextExpression) ; ici on ne fait
     * qu'ecrire le DOM. Fonctionne meme sous reduced-motion (changement
     * d'expression + texte, Req Part 2.6).
     */
    function applyExpression(expression) {
      currentExpression = expression;
      var svg = svgEl();
      if (svg && svg.classList) {
        for (var i = 0; i < EXPRESSIONS.length; i++) {
          svg.classList.remove("expr-" + EXPRESSIONS[i]);
        }
        svg.classList.add("expr-" + expression);
      }
      if (svg && typeof svg.querySelector === "function") {
        var mouth = svg.querySelector(".ghost-mouth");
        var mouthD = Object.prototype.hasOwnProperty.call(MOUTHS, expression)
          ? MOUTHS[expression] : null;
        if (mouth && mouthD && typeof mouth.setAttribute === "function") {
          mouth.setAttribute("d", mouthD);
        }
      }
      showBubble(expression);
    }

    var restTimer = null;
    /**
     * Declenche un evenement d'expression via la machine PURE nextExpression,
     * applique le resultat, et programme le retour a "idle" pour les
     * expressions transitoires (surprised/happy).
     */
    function dispatchExpression(event) {
      var next = nextExpression(currentExpression, event);
      applyExpression(next);
      if (restTimer && typeof clearTimeout === "function") {
        clearTimeout(restTimer);
        restTimer = null;
      }
      if (isTransient(next) && typeof setTimeout === "function") {
        restTimer = setTimeout(function () {
          applyExpression(nextExpression(currentExpression, "rest"));
        }, 1400);
      }
    }

    // ---- Yeux qui suivent la planchette (Req Part 2.1) ---------------------
    // Centres des pupilles au repos (coords du viewBox SVG 64x72).
    var EYE_ORIGINS = [ { x: 25, y: 28 }, { x: 39, y: 28 } ];
    var PUPIL_MAX = 2.0; // rayon max de deplacement dans le socle

    /**
     * Oriente les pupilles vers un point cible exprime dans le repere du
     * conteneur du plateau { x, y, width, height }. On mappe ce point en une
     * DIRECTION (gauche/droite, haut/bas) puis on applique pupilOffset (coeur
     * pur) pour borner le deplacement au socle. Sous reduced-motion : aucun
     * mouvement (Req Part 2.6).
     */
    function lookAt(pos) {
      if (prefersReducedMotion() || !pos) {
        return;
      }
      var svg = svgEl();
      if (!svg || typeof svg.querySelectorAll !== "function") {
        return;
      }
      var w = (pos.width > 0) ? pos.width : 1;
      var h = (pos.height > 0) ? pos.height : 1;
      // Position normalisee [-1, 1] de la cible dans le conteneur, rapportee a
      // un point d'ancrage (centre du conteneur). On s'en sert comme DIRECTION
      // du regard (droite si la planchette est a droite, etc.).
      var nx = (pos.x / w) * 2 - 1;
      var ny = (pos.y / h) * 2 - 1;
      var off = pupilOffset(nx, ny, 0, 0, PUPIL_MAX);
      var pupils = svg.querySelectorAll(".ghost-pupil");
      Array.prototype.forEach.call(pupils, function (p) {
        if (p.style) {
          p.style.transform = "translate(" + off.dx + "px, " + off.dy + "px)";
        }
      });
    }

    /** Ramene les pupilles au centre (regard au repos). */
    function centerEyes() {
      var svg = svgEl();
      if (!svg || typeof svg.querySelectorAll !== "function") {
        return;
      }
      var pupils = svg.querySelectorAll(".ghost-pupil");
      Array.prototype.forEach.call(pupils, function (p) {
        if (p.style) {
          p.style.transform = "translate(0px, 0px)";
        }
      });
    }

    // ---- Particules de bannissement (Req Part 2.4) -------------------------
    function particlesLayer() {
      var svg = svgEl();
      var span = null;
      if (el && typeof el.closest === "function") {
        var scope = el.closest("#mascot");
        if (scope && typeof scope.querySelector === "function") {
          span = scope.querySelector(".ghost-particles");
        }
      }
      if (!span && typeof document !== "undefined" && document.getElementById) {
        var m = document.getElementById("mascot");
        if (m && typeof m.querySelector === "function") {
          span = m.querySelector(".ghost-particles");
        }
      }
      return span;
    }
    function spawnParticles() {
      if (prefersReducedMotion() || typeof document === "undefined") {
        return; // Req Part 2.6 : pas de particules sous mouvement reduit
      }
      var layer = particlesLayer();
      if (!layer || typeof document.createElement !== "function") {
        return;
      }
      var n = 5;
      for (var i = 0; i < n; i++) {
        var dot = document.createElement("span");
        dot.className = "ghost-particle";
        // Dispersion horizontale pseudo-aleatoire via --pdx (px).
        var dx = Math.round((rng() * 28) - 14);
        var delay = Math.round(rng() * 120);
        if (dot.style) {
          dot.style.setProperty("--pdx", dx + "px");
          dot.style.left = (rng() * 16 - 8) + "px";
          dot.style.animationDelay = delay + "ms";
        }
        layer.appendChild(dot);
        (function (node) {
          if (typeof setTimeout === "function") {
            setTimeout(function () {
              if (node && node.parentNode) {
                node.parentNode.removeChild(node);
              }
            }, 1100 + delay);
          }
        })(dot);
      }
    }

    // ---- Inactivite -> sleepy (Req Part 2.5) -------------------------------
    var idleTimer = null;
    var IDLE_MS = 20000;
    function armIdleTimer() {
      if (typeof setTimeout !== "function") {
        return;
      }
      if (idleTimer && typeof clearTimeout === "function") {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(function () {
        applyExpression(nextExpression(currentExpression, "idle")); // -> sleepy
        centerEyes();
      }, IDLE_MS);
    }
    /**
     * Signale une activite utilisateur (frappe/clic sur le plateau). Reveille
     * le fantome si endormi, passe en "curious" et re-arme le minuteur
     * d'inactivite.
     */
    function activity() {
      if (currentExpression === "sleepy") {
        applyExpression(nextExpression(currentExpression, "wake"));
      }
      dispatchExpression("type"); // -> curious
      armIdleTimer();
    }

    /** Affiche l'état « quiet » (liste vide, Req 6.2, 6.4). */
    function quiet() {
      return render(QUIET);
    }

    /** Affiche un message d'ambiance différent du précédent (Req 2.4, 6.3). */
    function spook() {
      return render(pickSpooky(last, pool, rng));
    }

    /**
     * Met à jour la mascotte selon le nombre d'esprits présents.
     * 0 esprit → « quiet » ; au moins 1 → message d'ambiance (Req 6.2–6.4).
     *
     * @param {number} count Nombre d'esprits dans la Spirit_List.
     */
    function update(count) {
      if (!count || count <= 0) {
        return quiet();
      }
      return spook();
    }

    /**
     * Celebration d'etat vide (Req Part 2.5) : quand la Spirit_List devient
     * vide apres le dernier bannissement, expression "happy" + message dedie
     * "The house is at peace." (et la bulle thematique associee).
     */
    function celebrateEmpty() {
      applyExpression("happy");
      showBubble("happy");
      return render("The house is at peace.");
    }

    // Demarre a l'etat idle (expression + minuteur d'inactivite), de facon
    // defensive : no-op propre si le SVG ou le DOM sont absents (Node/tests).
    applyExpression("idle");
    armIdleTimer();

    return {
      update: update,
      quiet: quiet,
      spook: spook,
      current: function () {
        return last;
      },
      reactSummon: reactSummon,
      reactBanish: reactBanish,
      // --- Part 2 : API reactive ---
      setExpression: applyExpression,
      expression: function () { return currentExpression; },
      lookAt: lookAt,
      centerEyes: centerEyes,
      activity: activity,
      celebrateEmpty: celebrateEmpty
    };
  }

  // API publique exportée.
  var api = {
    QUIET: QUIET,
    SPOOKY: SPOOKY,
    pickSpooky: pickSpooky,
    createMascot: createMascot,
    // --- Part 2 : coeur PUR du fantome reactif (testable sans DOM) ---
    EXPRESSIONS: EXPRESSIONS,
    PHRASES: PHRASES,
    nextExpression: nextExpression,
    isTransient: isTransient,
    pupilOffset: pupilOffset,
    phraseFor: phraseFor
  };

  // Export côté navigateur (window) pour le câblage de page (tâche 9.1).
  if (root) {
    root.Ghost = api;
  }

  // Export côté Node (CommonJS) pour les tests de propriétés (tâche 7.2).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
