/*
 * oracle.js — Oracle_Board client (Séance)
 *
 * Feature: oracle-board
 * Requirements couverts (tâche 2.1 — squelette + helpers) : 4.5, 7.4, 10.1, 10.2
 * Requirements couverts (tâche 2.2 — createOracle + flux ask) : 4.1, 4.2, 4.3,
 *   4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 10.4
 *
 * Oracle_Board : second usage du plateau de Ouija existant. Lorsqu'un
 * utilisateur active une Question_Button, une fonction PURE (oracleAnswer, qui
 * vit dans static/board.js) calcule une courte réponse en majuscules à partir
 * du Task_List courant, puis la planchette la « channelise » en glissant
 * d'elle-même, lettre par lettre, le long de l'arc de glyphes existant.
 *
 * Ce module est l'ADAPTATEUR DOM : il ne porte AUCUNE logique de réponse (celle-
 * ci reste dans le cœur pur de board.js, `require()`-able et testé par
 * propriétés). Il se contente de lire le DOM (liste des esprits), d'écrire la
 * réponse dans l'Answer_Region et de piloter la planchette via le
 * Board_Controller. Même motif UMD que age.js / board.js / ghost.js :
 *   - `window.Oracle` dans le navigateur ;
 *   - `module.exports` sous Node (pour require / tests) ;
 *   - tout accès au DOM protégé par `typeof document !== "undefined"`, de sorte
 *     que le module se charge proprement sous Node SANS effet de bord DOM.
 *
 * NOTE : les helpers Node-safe (prefersReducedMotion, delay, readTasks) de la
 * tâche 2.1 restent inchangés. La tâche 2.2 ajoute par-dessus le flux complet
 * createOracle(options) — résolution des cibles DOM, calcul de l'Oracle_Answer
 * via le cœur pur, animation d'épellation de la planchette, désactivation /
 * restauration des contrôles et réaction de la mascotte — en gardant l'absence
 * d'effet de bord DOM au chargement (tout accès est protégé et différé à l'appel).
 */

(function (root, factory) {
  // Export universel : Node (module.exports) pour les tests + global navigateur.
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.Oracle = api;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  // --- Helpers Node-safe (tâche 2.1) ----------------------------------------

  // prefersReducedMotion() : détecte la Reduced_Motion_Preference via la même
  // media query que board.js (« (prefers-reduced-motion: reduce) »). matchMedia
  // peut être absent (Node, environnements de test, vieux navigateurs) ou lever
  // → on retombe toujours sur `false` (Req 7.4, 10.2). Identique dans l'esprit
  // au prefersReducedMotion de board.js pour garder un comportement cohérent.
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

  // delay(ms) : renvoie une Promise résolue après `ms` millisecondes via
  // setTimeout. Utilisé par l'animation d'épellation (tâche 2.2) pour marquer
  // une pause sur chaque glyphe. Si setTimeout est absent (environnement
  // dégradé), on résout IMMÉDIATEMENT afin que le flux ne reste jamais bloqué.
  // Pur vis-à-vis du DOM : ne touche à aucun élément.
  function delay(ms) {
    return new Promise(function (resolve) {
      if (typeof setTimeout !== "function") {
        resolve();
        return;
      }
      setTimeout(resolve, ms);
    });
  }

  // readTasks(doc) : lecteur de Task_List par défaut. À partir d'un document
  // (par défaut le `document` global s'il existe), parcourt chaque ligne rendue
  // `main ul li` et la projette en objet { id, title, created_at }, en
  // PRÉSERVANT l'ordre du DOM (qui est l'ordre serveur, id DESC, le plus récent
  // d'abord). Correspond à list_spirits de main.py et aux <li data-id
  // data-created> du gabarit (Req 4.5, 10.1).
  //
  // Contrats :
  //   - LECTURE SEULE : ne mute jamais le DOM (ni la liste, ni l'input).
  //   - Node-safe / défensif : renvoie [] quand document est absent ou que les
  //     éléments / API attendus manquent, sans jamais lever.
  //   - id   : Number(li.dataset.id), avec repli getAttribute("data-id") si
  //            dataset est indisponible.
  //   - title: textContent de .spirit-name (replis getAttribute impossibles ici
  //            car c'est du texte d'élément) ; à défaut d'élément .spirit-name,
  //            le textContent du <li> rogné (trim).
  //   - created_at : li.dataset.created || "" (repli getAttribute("data-created")),
  //            "" quand l'âge est inconnu (NULL migré).
  function readTasks(doc) {
    // Par défaut : document global s'il existe, sinon rien (Node) → [].
    var d = doc || (typeof document !== "undefined" ? document : null);
    if (!d || typeof d.querySelectorAll !== "function") {
      return [];
    }
    var rows = d.querySelectorAll("main ul li");
    if (!rows || typeof rows.length !== "number") {
      return [];
    }
    var tasks = [];
    // Boucle indexée (compatible NodeList/HTMLCollection) ; ordre du DOM conservé.
    for (var i = 0; i < rows.length; i++) {
      var li = rows[i];
      if (!li) {
        continue;
      }
      tasks.push({
        id: Number(readData(li, "id")),
        title: readTitle(li),
        created_at: readData(li, "created") || ""
      });
    }
    return tasks;
  }

  // readData(el, key) : lit un data-* via dataset en priorité, avec repli
  // getAttribute("data-" + key) si dataset est indisponible. Renvoie "" plutôt
  // que null/undefined pour rester total. Lecture seule.
  function readData(el, key) {
    if (el.dataset && typeof el.dataset[key] === "string") {
      return el.dataset[key];
    }
    if (typeof el.getAttribute === "function") {
      var v = el.getAttribute("data-" + key);
      if (typeof v === "string") {
        return v;
      }
    }
    return "";
  }

  // readTitle(li) : extrait le titre de l'esprit. Priorité au textContent de
  // .spirit-name (le span qui porte le titre dans le gabarit) ; à défaut, le
  // textContent du <li> entier rogné. Renvoie "" si rien n'est lisible.
  // Strictement en lecture.
  function readTitle(li) {
    var nameEl = (typeof li.querySelector === "function")
      ? li.querySelector(".spirit-name")
      : null;
    if (nameEl && typeof nameEl.textContent === "string") {
      return nameEl.textContent;
    }
    if (typeof li.textContent === "string") {
      return li.textContent.trim();
    }
    return "";
  }

  // --- Adaptateur DOM (tâche 2.2) : createOracle(options) -------------------
  //
  // createOracle(options) câble l'Oracle_Board : il résout ses cibles (boutons
  // de question, input de repli, Answer_Region, Board_Controller, mascotte),
  // calcule l'Oracle_Answer via le cœur PUR window.Board.oracleAnswer, écrit le
  // texte dans l'Answer_Region (aria-live) puis — hors reduced motion — pilote
  // la planchette pour épeler la réponse glyphe par glyphe en désactivant les
  // contrôles le temps de l'animation, avec réaction de la mascotte (curious
  // puis happy). TOUT accès DOM / contrôleur / mascotte est protégé afin que :
  //   - le module se charge proprement sous Node (aucun effet de bord au load) ;
  //   - un contrôleur ou une mascotte absent dégrade sans lever (Req 6.5).
  //
  // Options (toutes optionnelles ; repli DOM/globals quand omises) :
  //   buttons      NodeList/array des button[data-question]
  //   input        le Fallback_Input (input[name="title"])
  //   answerRegion l'élément #oracle-answer (aria-live="polite")
  //   controller   le Board_Controller (window.__boardController)
  //   mascot       le contrôleur de mascotte (window.__ghostMascot)
  //   board        l'API pure (window.Board) — oracleAnswer/charIndex/ARC_CHARS
  //   getTasks     fonction renvoyant le Task_List courant (défaut readTasks())
  //   reduceMotion booléen (défaut prefersReducedMotion())
  //   stepDelay    pause (ms) sur chaque caractère épelable (défaut 380)
  //
  // Renvoie { ask(questionId), isSpelling() }.
  function createOracle(options) {
    options = options || {};

    // --- Résolution des cibles (repli DOM/globals, tout protégé) ------------
    // doc : document global s'il existe, sinon null (Node). Sert aux replis.
    var doc = (typeof document !== "undefined") ? document : null;
    var win = (typeof window !== "undefined") ? window : null;

    // buttons : NodeList/array des boutons de question. Normalisé en tableau.
    var buttons = toArray(
      has(options, "buttons")
        ? options.buttons
        : (doc && typeof doc.querySelectorAll === "function"
            ? doc.querySelectorAll("button[data-question]")
            : [])
    );

    // input : le Fallback_Input (peut être null → simplement ignoré).
    var input = has(options, "input")
      ? options.input
      : (doc && typeof doc.querySelector === "function"
          ? doc.querySelector('input[name="title"]')
          : null);

    // answerRegion : l'Answer_Region aria-live (peut être null → pas d'écriture).
    var answerRegion = has(options, "answerRegion")
      ? options.answerRegion
      : (doc && typeof doc.getElementById === "function"
          ? doc.getElementById("oracle-answer")
          : null);

    // controller : Board_Controller pour bouger la planchette (facultatif).
    var controller = has(options, "controller")
      ? options.controller
      : (win ? win.__boardController : null);

    // mascot : contrôleur de mascotte pour setExpression (facultatif).
    var mascot = has(options, "mascot")
      ? options.mascot
      : (win ? win.__ghostMascot : null);

    // board : API pure (oracleAnswer, charIndex). Défaut window.Board.
    var board = has(options, "board")
      ? options.board
      : (win ? win.Board : null);

    // getTasks : lecteur de Task_List. Défaut readTasks() (lecture seule DOM).
    var getTasks = (has(options, "getTasks") && typeof options.getTasks === "function")
      ? options.getTasks
      : function () { return readTasks(); };

    // reduceMotion : honore la Reduced_Motion_Preference (Req 7). Override possible.
    var reduceMotion = has(options, "reduceMotion")
      ? !!options.reduceMotion
      : prefersReducedMotion();

    // stepDelay : pause sur chaque caractère épelable (Req 4.1). Défaut 380 ms.
    var stepDelay = (has(options, "stepDelay") && typeof options.stepDelay === "number")
      ? options.stepDelay
      : 380;

    // Garde de ré-entrance (Req 4.6) : une seule Spelling_Animation à la fois.
    var spelling = false;

    // setExpr(expr) : helper protégé pour la mascotte (Req 6.3, 6.4, 6.5). No-op
    // si la mascotte ou setExpression manque — la réponse s'affiche quand même.
    function setExpr(expr) {
      if (mascot && typeof mascot.setExpression === "function") {
        try {
          mascot.setExpression(expr);
        } catch (e) {
          /* dégradation silencieuse : la mascotte ne doit jamais casser le flux */
        }
      }
    }

    // writeAnswer(text) : écrit l'Oracle_Answer dans l'Answer_Region. Comme la
    // région est aria-live="polite", le lecteur d'écran l'annonce immédiatement
    // dans LES DEUX chemins (Req 6.2, 7.2). Protégé si la région est absente.
    function writeAnswer(text) {
      if (answerRegion && typeof answerRegion === "object") {
        answerRegion.textContent = text;
      }
    }

    // movePlanchette(idx) : délègue au Board_Controller (Req 4.2). movePlanchetteTo
    // ne bouge pas si idx < 0 ou pas de glyphe correspondant → espaces / caractères
    // hors arc laissent naturellement la planchette en place (Req 4.3).
    function movePlanchette(idx) {
      if (controller && typeof controller.movePlanchetteTo === "function") {
        controller.movePlanchetteTo(idx);
      }
    }

    // charIndexOf(ch) : index du caractère sur l'arc via le cœur pur (board.charIndex).
    // Repli -1 (aucun mouvement) si l'API pure est absente.
    function charIndexOf(ch) {
      if (board && typeof board.charIndex === "function") {
        return board.charIndex(ch);
      }
      return -1;
    }

    // computeAnswer(questionId) : calcule l'Oracle_Answer via le cœur PUR
    // board.oracleAnswer (Req 7.3 : même calcul dans les deux chemins). Protégé :
    // si board/oracleAnswer manque ou lève, on retombe sur "" et on continue
    // d'écrire le texte (ne JAMAIS lever — Req 6.5).
    function computeAnswer(questionId) {
      if (board && typeof board.oracleAnswer === "function") {
        try {
          return board.oracleAnswer(getTasks(), questionId, Date.now());
        } catch (e) {
          return "";
        }
      }
      return "";
    }

    // ask(questionId) : point d'entrée. Voir le flux détaillé dans le design.
    function ask(questionId) {
      // 1. Garde de ré-entrance (Req 4.6) : on ignore si une épellation tourne.
      if (spelling) {
        return;
      }

      // 2. Calcul de la réponse (cœur pur, jamais levant).
      var answer = computeAnswer(questionId);

      // 3. Écriture immédiate dans l'Answer_Region → annonce aria-live dans les
      //    DEUX chemins (Req 6.2, 7.2).
      writeAnswer(answer);

      // 4. Chemin reduced motion (Req 7) : pas de glissement, pas de bascule des
      //    contrôles (on les laisse EXACTEMENT tels quels — Req 5.5). On peut
      //    marquer la mascotte happy une fois (protégé). Le texte est déjà affiché.
      if (reduceMotion) {
        setExpr("happy");
        return;
      }

      // 5. Chemin plein mouvement (async, piloté par delay()).
      spelling = true;

      // a. Capture de l'état `disabled` préexistant de l'input et de CHAQUE bouton
      //    (Req 5.3, 5.4 : un contrôle désactivé pour une autre raison — db-error —
      //    doit le rester). Puis désactivation de tout (Req 5.1, 5.2).
      var inputWasDisabled = input ? !!input.disabled : false;
      var buttonsWereDisabled = buttons.map(function (b) {
        return b ? !!b.disabled : false;
      });
      if (input) {
        input.disabled = true; // NB : on ne touche JAMAIS input.value (Req 4.5).
      }
      buttons.forEach(function (b) {
        if (b) {
          b.disabled = true;
        }
      });

      // Restauration symétrique : chaque contrôle retrouve son état antérieur
      // capturé (Req 5.3, 5.4). Appelée dans le finally pour garantir la
      // restauration même si un mouvement lève.
      function restoreControls() {
        if (input) {
          input.disabled = inputWasDisabled;
        }
        buttons.forEach(function (b, i) {
          if (b) {
            b.disabled = buttonsWereDisabled[i];
          }
        });
      }

      // Corps async : parcourt la réponse gauche→droite, bouge la planchette sur
      // chaque glyphe épelable et marque une pause stepDelay à chaque caractère.
      // try/finally garantit la remise à zéro du drapeau et la restauration des
      // contrôles même si un mouvement lève (robustesse).
      return (async function spell() {
        try {
          // b. Mascotte curieuse pendant l'épellation (Req 6.3, protégé Req 6.5).
          setExpr("curious");

          // c. Marche gauche→droite sur les caractères de la réponse.
          for (var i = 0; i < answer.length; i++) {
            var ch = answer.charAt(i);
            var idx = charIndexOf(ch);
            if (idx >= 0) {
              // Caractère d'arc : glissement via la géométrie existante (Req 4.2).
              movePlanchette(idx);
            }
            // Espace / caractère hors arc (idx < 0) : on laisse la planchette où
            // elle est (Req 4.3) MAIS on marque quand même la pause pour un
            // rythme naturel.
            await delay(stepDelay); // pause sur chaque caractère (Req 4.1)
          }
          // d. En fin de boucle, la planchette repose sur le dernier glyphe
          //    épelable (Req 4.4).

          // e. Mascotte heureuse à la fin (Req 6.4, protégé Req 6.5).
          setExpr("happy");
        } finally {
          // f. Restauration des contrôles + fin de l'épellation (Req 5.3, 5.4).
          restoreControls();
          spelling = false;
        }
      })();
    }

    // 6. isSpelling() : expose l'état courant de la Spelling_Animation (Req 4.6).
    function isSpelling() {
      return spelling;
    }

    return {
      ask: ask,
      isSpelling: isSpelling
    };
  }

  // has(obj, key) : true si la propriété est fournie explicitement (y compris
  // une valeur falsy comme false/null), pour distinguer « omis » de « fourni ».
  function has(obj, key) {
    return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
  }

  // toArray(listLike) : normalise une NodeList/array/valeur en tableau JS réel,
  // de façon défensive (jamais levant). Renvoie [] pour null/undefined.
  function toArray(listLike) {
    if (!listLike) {
      return [];
    }
    if (Array.isArray(listLike)) {
      return listLike;
    }
    if (typeof listLike.length === "number") {
      var out = [];
      for (var i = 0; i < listLike.length; i++) {
        out.push(listLike[i]);
      }
      return out;
    }
    return [];
  }

  return {
    prefersReducedMotion: prefersReducedMotion,
    delay: delay,
    readTasks: readTasks,
    createOracle: createOracle
  };
});
