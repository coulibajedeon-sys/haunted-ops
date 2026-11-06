/*
 * banish.js — Bannissement client (Séance)
 *
 * Feature: seance-haunted-productivity
 * Requirements couverts : 3.2, 3.3, 3.4, 3.6
 *
 * Comportement (voir design.md, flux « Bannissement ») :
 *  1. Interception du submit de chaque <form class="banish-form"> (preventDefault).
 *  2. Ajout de la classe `.banished` sur le <li> → animation de disparition 400 ms.
 *  3. À la FIN de l'animation (400 ms) : fetch('/banish/{id}', { method: 'POST' }),
 *     où {id} provient de <li data-id="...">.
 *  4. Réponse 2xx → retrait du <li> du DOM sans recharger la page, puis mise à jour
 *     de la mascotte (état « quiet » si la liste devient vide).
 *  5. Réponse 404 ou erreur réseau → restauration du <li> à sa position d'origine
 *     dans la liste + message d'erreur dans une zone dédiée.
 *
 * La logique de restauration à l'index d'origine est exposée sous forme de
 * fonction pure (`restoreAtIndex`) testable par propriétés (tâche 7.4,
 * Property 8 — round-trip DOM). Un wrapper DOM (`restoreElementToList`) applique
 * cette logique à un vrai conteneur.
 */

(function (root, factory) {
  // Export universel : Node (module.exports) pour les tests + global navigateur.
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.Banish = api;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  // Durée de l'animation `.banished` définie en CSS (Req 3.2). Le fetch est
  // envoyé à l'ISSUE de cette animation.
  var ANIMATION_MS = 400;

  /**
   * Fonction PURE de restauration à l'index d'origine.
   *
   * Étant donné un tableau représentant l'ordre courant des éléments restants
   * (la cible en ayant été retirée), l'élément cible et son index d'origine
   * dans la liste complète, renvoie un NOUVEAU tableau où la cible est
   * ré-insérée à sa position d'origine.
   *
   * Invariant (Property 8) : si l'on retire un élément à l'index `i` d'une
   * liste puis qu'on le restaure via `restoreAtIndex(reste, element, i)`, on
   * retrouve exactement la liste initiale (round-trip identité).
   *
   * @param {Array} remaining  Ordre courant des éléments restants (sans la cible).
   * @param {*} element        L'élément à restaurer.
   * @param {number} originalIndex  Index d'origine de la cible dans la liste complète.
   * @returns {Array} Nouveau tableau avec `element` inséré à `originalIndex`.
   */
  function restoreAtIndex(remaining, element, originalIndex) {
    var source = Array.prototype.slice.call(remaining);
    // Clamp défensif : l'index est borné à [0, longueur] pour rester valide
    // même si la liste a changé entre-temps.
    var idx = originalIndex;
    if (typeof idx !== "number" || isNaN(idx) || idx < 0) {
      idx = 0;
    }
    if (idx > source.length) {
      idx = source.length;
    }
    var result = source.slice(0, idx);
    result.push(element);
    return result.concat(source.slice(idx));
  }

  /**
   * Applique la restauration à un vrai conteneur DOM.
   *
   * Réinsère `element` dans `listEl` à `originalIndex` en s'appuyant sur
   * `restoreAtIndex` pour calculer l'ordre cible, de sorte que l'ordre et le
   * contenu de la liste redeviennent identiques à l'état d'avant le retrait.
   *
   * @param {Node} listEl  Le conteneur de liste (ex. <ul>).
   * @param {Node} element L'élément retiré (ex. <li>) à restaurer.
   * @param {number} originalIndex Index d'origine de l'élément.
   */
  function restoreElementToList(listEl, element, originalIndex) {
    if (!listEl || !element) {
      return;
    }
    // Enfants courants (hors cible) dans l'ordre du DOM.
    var remaining = Array.prototype.filter.call(listEl.children, function (child) {
      return child !== element;
    });
    var ordered = restoreAtIndex(remaining, element, originalIndex);
    var targetPos = ordered.indexOf(element);
    // Le voisin devant lequel insérer est l'élément suivant dans l'ordre cible.
    var referenceNode = ordered[targetPos + 1] || null;
    listEl.insertBefore(element, referenceNode);
  }

  /**
   * Met à jour la mascotte en coordination avec ghost.js (si présent).
   *
   * Ne lève jamais d'erreur si ghost.js est absent (référence défensive,
   * Req 3.6, 6.4). Si la liste est vide, bascule la mascotte en état « quiet ».
   *
   * @param {boolean} isEmpty  La liste est-elle désormais vide ?
   */
  function updateMascot(isEmpty) {
    try {
      var g = (typeof window !== "undefined") ? window : null;
      if (!g) {
        return;
      }
      if (isEmpty) {
        if (typeof g.setQuietMascot === "function") {
          g.setQuietMascot();
          return;
        }
        if (typeof g.updateMascot === "function") {
          g.updateMascot({ empty: true });
          return;
        }
      } else {
        if (typeof g.updateMascot === "function") {
          g.updateMascot({ empty: false });
          return;
        }
      }
    } catch (e) {
      // Référence défensive : une mascotte indisponible ne doit pas casser
      // le bannissement (Req 3.6).
    }
  }

  /**
   * Affiche un message d'erreur de bannissement dans une zone dédiée.
   * Crée/réutilise un conteneur #banish-error s'il n'existe pas déjà.
   *
   * @param {string} message
   */
  function showBanishError(message) {
    if (typeof document === "undefined") {
      return;
    }
    var box = document.getElementById("banish-error");
    if (!box) {
      box = document.createElement("p");
      box.id = "banish-error";
      box.className = "error";
      box.setAttribute("role", "alert");
      var main = document.querySelector("main") || document.body;
      main.appendChild(box);
    }
    box.textContent = message;
    box.style.display = "";
  }

  /** Efface le message d'erreur de bannissement s'il existe. */
  function clearBanishError() {
    if (typeof document === "undefined") {
      return;
    }
    var box = document.getElementById("banish-error");
    if (box) {
      box.textContent = "";
      box.style.display = "none";
    }
  }

  /** La Spirit_List est-elle vide (aucun <li> restant) ? */
  function listIsEmpty(listEl) {
    if (!listEl) {
      return true;
    }
    return listEl.querySelectorAll("li").length === 0;
  }

  /**
   * Exécute la séquence de bannissement pour un <li> donné.
   *
   * @param {Node} li      Le <li> ciblé (doit porter data-id).
   * @param {Object} [opts] Options d'injection pour les tests (fetch, delay).
   * @returns {Promise|undefined} Une promesse résolue à la fin de la séquence.
   */
  function banishItem(li, opts) {
    opts = opts || {};
    var doFetch = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
    var delay = typeof opts.delay === "number" ? opts.delay : ANIMATION_MS;

    if (!li) {
      return;
    }
    var listEl = li.parentNode;
    var id = li.getAttribute("data-id");
    // Mémoriser l'index d'origine AVANT tout retrait, pour une restauration fidèle.
    var originalIndex = listEl
      ? Array.prototype.indexOf.call(listEl.children, li)
      : 0;

    clearBanishError();
    // Déclenche l'animation de disparition de 400 ms (Req 3.2).
    li.classList.add("banished");

    return new Promise(function (resolve) {
      setTimeout(function () {
        // À l'issue de l'animation, retirer d'abord du DOM puis confirmer côté
        // serveur ; en cas d'échec on restaure à l'index d'origine (Req 3.4).
        if (listEl && li.parentNode === listEl) {
          listEl.removeChild(li);
        }

        if (!doFetch) {
          // Pas de fetch disponible (environnement de test sans réseau) :
          // on considère cela comme un échec → restauration.
          handleFailure();
          return;
        }

        doFetch("/banish/" + id, { method: "POST" })
          .then(function (response) {
            if (response && response.ok) {
              // Succès 2xx : l'élément reste retiré, on met à jour la mascotte
              // (Req 3.3, 3.6).
              li.classList.remove("banished");
              updateMascot(listIsEmpty(listEl));
              resolve({ ok: true });
            } else {
              // 404 ou autre statut non-2xx → restauration (Req 3.4).
              handleFailure();
            }
          })
          .catch(function () {
            // Erreur réseau → restauration (Req 3.4).
            handleFailure();
          });

        function handleFailure() {
          li.classList.remove("banished");
          restoreElementToList(listEl, li, originalIndex);
          showBanishError("The spirit resists banishment. Please try again.");
          resolve({ ok: false });
        }
      }, delay);
    });
  }

  /**
   * Branche les gestionnaires de submit sur tous les <form class="banish-form">.
   * Intercepte la soumission par défaut (Req 3.2) et lance `banishItem`.
   *
   * @param {Node|Document} [scope] Racine de recherche (défaut : document).
   */
  function init(scope) {
    if (typeof document === "undefined") {
      return;
    }
    var rootEl = scope || document;
    var forms = rootEl.querySelectorAll("form.banish-form");
    Array.prototype.forEach.call(forms, function (form) {
      if (form.getAttribute("data-banish-bound") === "1") {
        return; // évite les doubles liaisons
      }
      form.setAttribute("data-banish-bound", "1");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var li = form.closest("li");
        banishItem(li);
      });
    });
  }

  // Auto-initialisation dans le navigateur une fois le DOM prêt.
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        init();
      });
    } else {
      init();
    }
  }

  return {
    ANIMATION_MS: ANIMATION_MS,
    restoreAtIndex: restoreAtIndex,
    restoreElementToList: restoreElementToList,
    updateMascot: updateMascot,
    showBanishError: showBanishError,
    clearBanishError: clearBanishError,
    listIsEmpty: listIsEmpty,
    banishItem: banishItem,
    init: init,
  };
});
