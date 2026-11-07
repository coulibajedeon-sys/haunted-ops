/*
 * age.js — Vieillissement visuel des esprits (Séance)
 *
 * Feature: haunted-task-polish
 * Requirements couverts : 1.5, 1.6, 4.4, 4.5, 4.6, 4.7, 4.8, 8.3, 8.4
 *
 * Module UMD PUR extrait de l'ancien script inline de templates/index.html,
 * afin d'être importable sous Node (tests de propriétés) et exposé en global
 * dans le navigateur, exactement comme banish.js / ghost.js. Il fournit deux
 * fonctions pures et totales :
 *
 *   - ageBucket(createdAt, now) : classe un esprit en "fresh" | "old" | "ancient"
 *     selon son âge, en portant à l'identique la logique de parsing `parseCreated`
 *     de l'ancien <script> inline (Req 4.4–4.8).
 *   - hueFromId(id) : teinte déterministe à partir de l'`id` (= (id*47)%360),
 *     miroir de l'expression Jinja `(task.id * 47) % 360` (Req 1.5, 1.6).
 *
 * La passe DOM `applyAgeClasses(root, now)` (câblage navigateur, tâche 1.2)
 * complète ce cœur pur : gardée par `typeof document !== "undefined"`, elle
 * parcourt chaque `<li data-created>` rendu et y ajoute les classes d'âge
 * (`spirit-old` / `spirit-ancient`) via `ageBucket`. Elle s'auto-câble au DOM
 * prêt comme banish.js, et reste sans effet sous Node (tests purs) — les
 * fonctions pures et le wrapper UMD demeurent intacts (Req 4.4, 4.9, 4.10).
 */

(function (root, factory) {
  // Export universel : Node (module.exports) pour les tests + global navigateur.
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.Age = api;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  // Seuils de vieillissement (Day_Threshold / Ancient_Threshold du glossaire).
  var DAY_MS = 24 * 60 * 60 * 1000;      // 1 jour  -> frontière fresh / old
  var ANCIENT_MS = 72 * 60 * 60 * 1000;  // 3 jours -> frontière old / ancient

  /**
   * Parse une valeur `createdAt` en epoch-ms, ou null si inconnue/illisible.
   *
   * Portage FIDÈLE de la logique inline `parseCreated` de templates/index.html :
   * trim, remplace l'espace de "YYYY-MM-DD HH:MM:SS" (UTC) par "T", puis ajoute
   * "Z" si aucun suffixe de fuseau n'est présent, avant Date.parse. Les nombres
   * sont traités comme des epoch-ms. null/undefined/""/illisible -> null.
   *
   * @param {string|number|null|undefined} raw
   * @returns {number|null} epoch-ms, ou null si l'âge est inconnu.
   */
  function parseCreated(raw) {
    // null / undefined / "" / 0 : âge inconnu. (Les nombres valides sont
    // traités juste après ; 0 = epoch n'a pas de sens ici -> inconnu.)
    if (raw === null || raw === undefined || raw === "") {
      return null;
    }
    // Un nombre fini est interprété directement comme un epoch-ms.
    if (typeof raw === "number") {
      return isFinite(raw) ? raw : null;
    }
    // "YYYY-MM-DD HH:MM:SS" (UTC) -> "YYYY-MM-DDTHH:MM:SSZ".
    var iso = String(raw).trim().replace(" ", "T");
    if (iso === "") {
      return null;
    }
    if (!/[zZ]|[+\-]\d\d:?\d\d$/.test(iso)) {
      iso += "Z";
    }
    var t = Date.parse(iso);
    return isNaN(t) ? null : t;
  }

  /**
   * Classifieur d'âge PUR et TOTAL : ne lève jamais, renvoie toujours
   * exactement "fresh" | "old" | "ancient".
   *
   * age = now - parse(createdAt). Frontières (cohérentes avec l'ancien DOM
   * `age > DAY_MS` / `age > 3*DAY_MS`) :
   *   age <  DAY_MS                 -> "fresh"
   *   DAY_MS < age <= ANCIENT_MS    -> "old"   (DAY_MS exact -> "fresh")
   *   age >  ANCIENT_MS             -> "ancient" (ANCIENT_MS exact -> "old")
   *
   * createdAt inconnu/illisible, ou `now` non fini -> "fresh" (Req 4.4).
   *
   * @param {string|number|null|undefined} createdAt
   * @param {number} now  Instant de référence en epoch-ms (injectable pour tests).
   * @returns {"fresh"|"old"|"ancient"}
   */
  function ageBucket(createdAt, now) {
    if (typeof now !== "number" || !isFinite(now)) {
      return "fresh";
    }
    var t = parseCreated(createdAt);
    if (t === null) {
      return "fresh"; // âge inconnu -> reste "fresh"
    }
    var age = now - t;
    if (age > ANCIENT_MS) {
      return "ancient";
    }
    if (age > DAY_MS) {
      return "old";
    }
    return "fresh";
  }

  /**
   * Teinte déterministe PURE à partir d'un `id` d'esprit, miroir exact de
   * l'expression Jinja `(task.id * 47) % 360` pour les entiers valides.
   *
   * Défensif pour rester toujours FINI et dans [0, 360) : les `id` non finis
   * retombent sur 0 ; les flottants sont tronqués ; le modulo est normalisé
   * pour éviter un résultat négatif (JS `%` garde le signe du dividende).
   *
   * @param {number} id
   * @returns {number} Teinte dans [0, 360).
   */
  function hueFromId(id) {
    var n = (typeof id === "number" && isFinite(id)) ? Math.trunc(id) : 0;
    // ((x % 360) + 360) % 360 -> normalise dans [0, 360) même pour n < 0.
    var hue = ((n * 47) % 360 + 360) % 360;
    return hue;
  }

  /**
   * Passe DOM (NAVIGATEUR uniquement) : classe chaque esprit rendu selon son âge.
   *
   * Parcourt les `<li data-created>` de la Spirit_List (`main ul li[data-created]`),
   * calcule `ageBucket(data-created, now)` et ajoute les classes :
   *   "ancient" -> `spirit-old` + `spirit-ancient` (Req 4.10)
   *   "old"     -> `spirit-old`                    (Req 4.9)
   *   "fresh"   -> aucune classe (style lumineux par défaut, Req 4.4)
   *
   * Entièrement DÉFENSIVE : gardée par `typeof document`, et tolère l'absence de
   * `querySelectorAll` / `forEach` / `classList` (optional chaining / typeof),
   * de sorte qu'elle ne lève jamais et reste inerte sous Node (tests purs).
   *
   * @param {Document|Element} [root]  Racine de recherche (défaut : document).
   * @param {number} [now]  Instant de référence en epoch-ms (défaut : Date.now()).
   */
  function applyAgeClasses(root, now) {
    if (typeof document === "undefined") {
      return; // Node / pas de DOM : ne touche jamais au document.
    }
    var scope = root || document;
    var list = (scope && typeof scope.querySelectorAll === "function")
      ? scope.querySelectorAll("main ul li[data-created]")
      : null;
    if (!list || typeof list.forEach !== "function") {
      return;
    }
    var ref = (typeof now === "number" && isFinite(now)) ? now : Date.now();
    list.forEach(function (li) {
      if (!li || typeof li.getAttribute !== "function" || !li.classList) {
        return;
      }
      var bucket = ageBucket(li.getAttribute("data-created"), ref);
      if (bucket === "ancient") {
        li.classList.add("spirit-old", "spirit-ancient");
      } else if (bucket === "old") {
        li.classList.add("spirit-old");
      }
      // "fresh" -> aucune classe ajoutée.
    });
  }

  // Auto-câblage dans le navigateur une fois le DOM prêt (même schéma que
  // banish.js). Sans effet sous Node grâce à la garde `typeof document`.
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        applyAgeClasses(document, Date.now());
      });
    } else {
      applyAgeClasses(document, Date.now());
    }
  }

  return {
    DAY_MS: DAY_MS,
    ANCIENT_MS: ANCIENT_MS,
    ageBucket: ageBucket,
    hueFromId: hueFromId,
    applyAgeClasses: applyAgeClasses,
  };
});
