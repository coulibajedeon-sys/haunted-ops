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
    }
    function reactBanish() {
      playReaction("banishing", 750);
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

    return {
      update: update,
      quiet: quiet,
      spook: spook,
      current: function () {
        return last;
      },
      reactSummon: reactSummon,
      reactBanish: reactBanish
    };
  }

  // API publique exportée.
  var api = {
    QUIET: QUIET,
    SPOOKY: SPOOKY,
    pickSpooky: pickSpooky,
    createMascot: createMascot
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
