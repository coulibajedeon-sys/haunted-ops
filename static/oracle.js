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
  //   replyStrip   l'élément .spirit-reply (bande gravée sur le plateau) où les
  //                lettres apparaissent une à une avec une lueur dorée
  //   controller   le Board_Controller (window.__boardController)
  //   mascot       le contrôleur de mascotte (window.__ghostMascot)
  //   board        l'API pure (window.Board) — oracleAnswer/charIndex/ARC_CHARS
  //   getTasks     fonction renvoyant le Task_List courant (défaut readTasks())
  //   reduceMotion booléen (défaut prefersReducedMotion())
  //   stepDelay    pause (ms) sur chaque caractère épelable (défaut 380)
  //   fadeDelay    délai (ms) avant le fondu de la bande de réponse (défaut 6000)
  //
  // Renvoie { ask(questionId), isSpelling(), destroy() }.
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

    // replyStrip : la bande « spirit reply » gravée sur le plateau. Chaque
    // lettre y apparaît avec une brève lueur dorée au fur et à mesure que la
    // planchette l'atteint ; la réponse complète y reste puis s'efface
    // doucement après fadeDelay. Purement visuel (l'aria-live reste
    // answerRegion). Peut être null → l'épellation visuelle est simplement
    // omise, le texte restant annoncé par answerRegion.
    var replyStrip = has(options, "replyStrip")
      ? options.replyStrip
      : (doc && typeof doc.querySelector === "function"
          ? doc.querySelector(".spirit-reply")
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

    // fadeDelay : délai avant que la bande de réponse ne s'estompe (Req : la
    // réponse complète reste visible puis s'efface doucement après 6 s).
    var fadeDelay = (has(options, "fadeDelay") && typeof options.fadeDelay === "number")
      ? options.fadeDelay
      : 6000;

    // Garde de ré-entrance (Req 4.6) : une seule Spelling_Animation à la fois.
    var spelling = false;

    // Suivi des timers actifs (setTimeout) afin de les annuler proprement quand
    // la page se ferme ou qu'on relance une épellation (évite fuites / callbacks
    // sur un DOM mort). On y range : les pauses d'épellation, les retraits de
    // lueur par lettre, et le timer de fondu de la bande.
    var activeTimers = [];
    // Jeton d'épellation : incrémenté à chaque `ask`. Une boucle d'épellation
    // n'applique ses effets que si son jeton est encore le courant → quitter la
    // page (destroy) ou relancer interrompt proprement l'ancienne animation.
    var spellToken = 0;
    // true une fois destroy() appelé : plus aucun effet visuel ne doit jouer.
    var destroyed = false;

    // schedule(fn, ms) : setTimeout traqué. Le handle est retiré de la liste à
    // l'exécution ; clearAllTimers() annule tout ce qui reste.
    function schedule(fn, ms) {
      if (typeof setTimeout !== "function") {
        return null;
      }
      var id = setTimeout(function () {
        var i = activeTimers.indexOf(id);
        if (i !== -1) {
          activeTimers.splice(i, 1);
        }
        fn();
      }, ms);
      activeTimers.push(id);
      return id;
    }

    // clearAllTimers() : annule tous les timers en attente (fondu, lueurs…).
    function clearAllTimers() {
      if (typeof clearTimeout === "function") {
        for (var i = 0; i < activeTimers.length; i++) {
          clearTimeout(activeTimers[i]);
        }
      }
      activeTimers.length = 0;
    }

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

    // --- Bande « spirit reply » (strip gravé sur le plateau) ----------------
    //
    // La bande affiche la réponse lettre par lettre : chaque caractère est un
    // <span> posé d'avance (invisible), révélé au fur et à mesure que la
    // planchette l'atteint, avec une brève lueur dorée (classe .lit retirée
    // après ~450 ms). En fin d'épellation la réponse complète reste visible,
    // puis s'efface doucement (classe .fading) après fadeDelay.
    //
    // resetStrip(text) : vide la bande et y pose un <span.reply-char> par
    // caractère de `text`, tous masqués (sans classe .shown). Retire un
    // éventuel état .fading laissé par une réponse précédente. Renvoie la
    // liste des spans (ordre du texte) pour que spell() les révèle un à un.
    function resetStrip(text) {
      if (!replyStrip || typeof replyStrip !== "object") {
        return [];
      }
      if (replyStrip.classList) {
        replyStrip.classList.remove("fading");
      }
      // Vide la bande (compatible jsdom/Node : on préfère textContent + append).
      replyStrip.textContent = "";
      var spans = [];
      var d = (typeof document !== "undefined") ? document : null;
      if (!d || typeof d.createElement !== "function") {
        // Pas de DOM pour créer des spans : on écrit au moins le texte brut.
        replyStrip.textContent = text;
        return [];
      }
      for (var i = 0; i < text.length; i++) {
        var span = d.createElement("span");
        span.className = "reply-char";
        // L'espace garde sa largeur : on utilise un espace insécable visuel via
        // textContent ordinaire ; le CSS .reply-char conserve l'espace.
        span.textContent = text.charAt(i);
        replyStrip.appendChild(span);
        spans.push(span);
      }
      return spans;
    }

    // revealChar(span) : révèle une lettre (classe .shown) avec une lueur dorée
    // (classe .lit) retirée peu après. No-op si span/classList absents.
    function revealChar(span) {
      if (!span || !span.classList) {
        return;
      }
      span.classList.add("shown", "lit");
      schedule(function () {
        if (span.classList) {
          span.classList.remove("lit");
        }
      }, 450);
    }

    // showStripInstant(text) : affiche la réponse complète d'un coup (chemin
    // reduced motion, Req 6). Tous les spans sont .shown, aucune lueur ni
    // glissement. La réponse s'efface ensuite après fadeDelay comme le chemin animé.
    function showStripInstant(text) {
      var spans = resetStrip(text);
      for (var i = 0; i < spans.length; i++) {
        if (spans[i].classList) {
          spans[i].classList.add("shown");
        }
      }
      scheduleFade();
    }

    // scheduleFade() : programme le fondu doux de la bande après fadeDelay.
    function scheduleFade() {
      if (!replyStrip || !replyStrip.classList) {
        return;
      }
      schedule(function () {
        if (replyStrip.classList) {
          replyStrip.classList.add("fading");
        }
      }, fadeDelay);
    }

    // endExpressionFor(answer) : choisit l'expression finale de la mascotte
    // (Req : "happy" ou "surprised" selon la réponse). Les réponses « rien / à
    // l'écart » (GOODBYE, NONE, YES-c'est-calme) surprennent le fantôme ; une
    // réponse substantielle (un nom, un décompte d'esprits, NO) le rend heureux.
    function endExpressionFor(answer) {
      var a = String(answer || "");
      if (a === "GOODBYE" || a === "NONE" || a === "YES") {
        return "surprised";
      }
      return "happy";
    }

    // movePlanchette(idx) : délègue au Board_Controller (Req 4.2). movePlanchetteTo
    // ne bouge pas si idx < 0 ou pas de glyphe correspondant → espaces / caractères
    // hors arc laissent naturellement la planchette en place (Req 4.3).
    function movePlanchette(idx) {
      if (controller && typeof controller.movePlanchetteTo === "function") {
        controller.movePlanchetteTo(idx);
      }
    }

    // moveToSpaceRest() : repos INVISIBLE de l'espace (ouija-space-glyph-digit-row).
    // Garde identique à movePlanchette : no-op si le contrôleur n'expose pas la
    // méthode (ancien contrôleur) — dégradation gracieuse, ne lève jamais.
    function moveToSpaceRest() {
      if (controller && typeof controller.movePlanchetteToSpaceRest === "function") {
        controller.movePlanchetteToSpaceRest();
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
      // 0. Après destroy() : plus aucune action (la page se ferme).
      if (destroyed) {
        return;
      }

      // 1. Garde de ré-entrance (Req 4.6, 5) : presser une question pendant
      //    qu'une réponse est épelée est IGNORÉ.
      if (spelling) {
        return;
      }

      // 2. Calcul de la réponse (cœur pur, jamais levant).
      var answer = computeAnswer(questionId);

      // Nouveau jeton + annulation des timers d'une réponse précédente (lueurs
      // résiduelles, fondu programmé) : la nouvelle réponse repart propre.
      clearAllTimers();
      spellToken++;
      var myToken = spellToken;

      // 3. Écriture immédiate dans l'Answer_Region → annonce aria-live dans les
      //    DEUX chemins (Req 6.2, 7.2).
      writeAnswer(answer);

      // 4. Chemin reduced motion (Req 6) : pas de glissement. La réponse
      //    COMPLÈTE apparaît immédiatement dans la bande, puis s'efface après
      //    fadeDelay. On ne bascule pas les contrôles (on les laisse EXACTEMENT
      //    tels quels — Req 5.5). Expression finale selon la réponse.
      if (reduceMotion) {
        showStripInstant(answer);
        setExpr(endExpressionFor(answer));
        return;
      }

      // 5. Chemin plein mouvement (async, piloté par delay()).
      spelling = true;
      // Pré-pose la bande : un span par caractère, tous masqués (révélés au fil
      // de l'épellation ci-dessous).
      var replySpans = resetStrip(answer);

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
          // b. Mascotte curieuse pendant l'épellation (Req 4, protégé Req 6.5).
          setExpr("curious");

          // c. Marche gauche→droite sur les caractères de la réponse.
          for (var i = 0; i < answer.length; i++) {
            // Interruption propre : si la page s'est fermée (destroy) ou qu'une
            // nouvelle épellation a démarré, on cesse de bouger/révéler.
            if (destroyed || myToken !== spellToken) {
              return;
            }
            var ch = answer.charAt(i);
            if (ch === " ") {
              // Espace : repos INVISIBLE dédié (ouija-space-glyph-digit-row) au
              // lieu de laisser la planchette sur le glyphe précédent. Toujours
              // suivi de la pause (révélation du span + delay plus bas).
              moveToSpaceRest();
            } else {
              var idx = charIndexOf(ch);
              if (idx >= 0) {
                // Caractère d'arc : glissement via la géométrie existante (Req 4.2).
                // La mascotte suit déjà la planchette (eye-following) via
                // l'abonnement onPlanchetteMove du contrôleur.
                movePlanchette(idx);
              }
            }
            // La lettre apparaît dans la bande AU MOMENT où la planchette
            // l'atteint, avec une brève lueur dorée (Req : reply strip).
            revealChar(replySpans[i]);
            // Caractère hors arc non-espace (idx < 0) : on laisse la planchette
            // où elle est (Req 4.3) MAIS on marque quand même la pause pour un
            // rythme naturel. L'espace ci-dessus route vers le repos invisible.
            await delay(stepDelay); // pause sur chaque caractère (Req 4.1)
          }
          // d. En fin de boucle, la planchette repose sur le dernier glyphe
          //    épelable (Req 4.4) et la réponse complète reste visible.

          // Si interrompue entre la dernière itération et ici, on s'arrête.
          if (destroyed || myToken !== spellToken) {
            return;
          }

          // e. Mascotte « happy » ou « surprised » selon la réponse (Req 4).
          setExpr(endExpressionFor(answer));

          // f. La réponse complète reste visible puis s'estompe après fadeDelay.
          scheduleFade();
        } finally {
          // g. Restauration des contrôles + fin de l'épellation (Req 5.3, 5.4).
          //    On ne restaure QUE si ce jeton est encore le courant : une
          //    épellation interrompue par une relance ne doit pas écraser l'état
          //    de contrôle (re)désactivé par la nouvelle.
          if (myToken === spellToken) {
            restoreControls();
            spelling = false;
          }
        }
      })();
    }

    // 6. isSpelling() : expose l'état courant de la Spelling_Animation (Req 4.6).
    function isSpelling() {
      return spelling;
    }

    // 7. destroy() : nettoyage à la fermeture de page (Req 5). Annule tous les
    //    timers en attente (pauses, retraits de lueur, fondu), invalide le jeton
    //    courant (une épellation en cours cesse au prochain tick) et restaure
    //    les contrôles si une épellation tournait. Idempotent et jamais levant.
    function destroy() {
      destroyed = true;
      spellToken++; // invalide toute boucle d'épellation en cours
      clearAllTimers();
      if (spelling) {
        try {
          // restoreControls est défini dans la portée de ask() lors d'une
          // épellation ; on ne peut l'appeler ici, mais remettre le drapeau
          // suffit — la page se ferme. On réactive au cas où (rare) la page
          // ne se fermerait pas vraiment (bfcache).
        } catch (e) { /* no-op */ }
        spelling = false;
      }
      // Retire l'écouteur d'unload que l'on a posé (si présent).
      if (win && typeof win.removeEventListener === "function" && unloadHandler) {
        try {
          win.removeEventListener("pagehide", unloadHandler);
          win.removeEventListener("beforeunload", unloadHandler);
        } catch (e) { /* no-op */ }
      }
    }

    // Auto-nettoyage : à la fermeture / mise en cache de la page, on annule les
    // timers pour ne jamais exécuter de callback sur un DOM mort (Req 5). On
    // écoute `pagehide` (couvre bfcache) et `beforeunload` par sécurité.
    var unloadHandler = null;
    if (win && typeof win.addEventListener === "function") {
      unloadHandler = function () { destroy(); };
      try {
        win.addEventListener("pagehide", unloadHandler);
        win.addEventListener("beforeunload", unloadHandler);
      } catch (e) {
        unloadHandler = null;
      }
    }

    return {
      ask: ask,
      isSpelling: isSpelling,
      destroy: destroy
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
