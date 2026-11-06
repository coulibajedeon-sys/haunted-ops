# Implementation Plan: Séance – Haunted Productivity

## Overview

Cette liste fait évoluer le code existant (`main.py`, `templates/index.html`, `db.sqlite3`) pour couvrir les 6 requirements. L'implémentation est incrémentale : on commence par le schéma et la logique métier pure (testable par propriétés via Hypothesis), puis les routes FastAPI, ensuite le template et le JS client (animation 400 ms, fetch + rollback, mascotte), enfin le thème gothique mesurable et le câblage de bout en bout. Chaque étape s'appuie sur la précédente et se termine par une intégration sans code orphelin.

Langage d'implémentation : **Python** (FastAPI, Jinja2) côté serveur ; **JavaScript vanilla** côté client. Tests de propriétés : **Hypothesis** (≥100 itérations, annotés `Feature: seance-haunted-productivity, Property {n}`).

## Tasks

- [x] 1. Mettre en place le schéma SQLite et l'initialisation robuste
  - [x] 1.1 Faire évoluer `init_db` et le schéma de la table `tasks`
    - Modifier `init_db()` dans `main.py` pour créer la table `tasks` avec `id INTEGER PRIMARY KEY AUTOINCREMENT`, `title TEXT NOT NULL CHECK (length(title) <= 200)`
    - Rendre `init_db()` idempotent (réappels sans effet de bord) et capturer l'échec d'initialisation dans un drapeau module `DB_READY`
    - Conserver `get_db()` avec `row_factory = sqlite3.Row`
    - _Requirements: 4.1, 4.2, 4.5_

  - [x]* 1.2 Écrire les tests unitaires du schéma et de l'initialisation
    - Vérifier l'idempotence de `init_db` (double appel), la contrainte `NOT NULL` et `CHECK length<=200`, et le passage de `DB_READY` à False en cas d'échec simulé
    - _Requirements: 4.1, 4.2, 4.5_

- [x] 2. Implémenter la logique métier pure et l'accès aux données
  - [x] 2.1 Implémenter `normalize_and_validate`
    - Fonction pure dans `main.py` : `normalize_and_validate(raw_title: str) -> tuple[bool, str, str | None]`
    - `strip` du titre ; renvoie `error_kind="empty"` si vide/espaces, `"too_long"` si longueur normalisée > 200, sinon `(True, cleaned, None)`
    - _Requirements: 1.2, 1.4, 1.5_

  - [x]* 2.2 Test de propriété — invocation d'un titre valide persiste le titre normalisé
    - **Property 1: Invocation d'un titre valide persiste le titre normalisé**
    - **Validates: Requirements 1.2**
    - Hypothesis, ≥100 itérations, tag `Feature: seance-haunted-productivity, Property 1`

  - [x]* 2.3 Test de propriété — rejet des titres composés uniquement d'espaces
    - **Property 2: Les titres composés uniquement d'espaces sont rejetés**
    - **Validates: Requirements 1.4**
    - Générateur couvrant chaîne vide et whitespace unicode ; ≥100 itérations, tag `Feature: seance-haunted-productivity, Property 2`

  - [x]* 2.4 Test de propriété — frontière de 200 caractères
    - **Property 3: La limite de 200 caractères est respectée à la frontière**
    - **Validates: Requirements 1.5**
    - Couvrir les longueurs 199/200/201 ; ≥100 itérations, tag `Feature: seance-haunted-productivity, Property 3`

  - [x] 2.5 Implémenter le dépôt de données (CRUD)
    - Ajouter `list_spirits(conn)` (tri `id DESC`), `insert_spirit(conn, title)` (renvoie l'id), `delete_spirit(conn, task_id)` (renvoie True/False)
    - _Requirements: 1.7, 2.1, 2.2, 3.1_

  - [x]* 2.6 Test de propriété — ordre par identifiant décroissant
    - **Property 4: Les esprits sont listés en identifiant décroissant**
    - **Validates: Requirements 1.7, 2.2**
    - ≥100 itérations, tag `Feature: seance-haunted-productivity, Property 4`

  - [x]* 2.7 Test de propriété — le listing récupère exactement l'ensemble stocké
    - **Property 5: Le listing récupère exactement l'ensemble stocké**
    - **Validates: Requirements 2.1**
    - ≥100 itérations, tag `Feature: seance-haunted-productivity, Property 5`

  - [x]* 2.8 Test de propriété — le bannissement retire la cible et préserve les autres
    - **Property 7: Le bannissement retire la cible et préserve les autres esprits**
    - **Validates: Requirements 3.1**
    - ≥100 itérations, tag `Feature: seance-haunted-productivity, Property 7`

  - [x]* 2.9 Test de propriété — persistance au redémarrage
    - **Property 9: La persistance survit au redémarrage (round-trip de cycle de vie)**
    - **Validates: Requirements 4.3**
    - Écrire via une connexion, relire via une nouvelle connexion ; ≥100 itérations, tag `Feature: seance-haunted-productivity, Property 9`

- [x] 3. Checkpoint — Vérifier la logique métier et les données
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implémenter les routes FastAPI
  - [x] 4.1 Mettre à jour la route `GET /` (home)
    - Récupérer les esprits via `list_spirits` (id DESC), passer `tasks`, `error`, `db_error` au template
    - Capturer l'échec SQLite → `db_error=True`, `tasks=[]`
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

  - [x] 4.2 Mettre à jour la route `POST /summon`
    - Appeler `normalize_and_validate` ; si `empty` → re-render (200) avec `error` et valeur saisie conservée, aucune insertion ; si `too_long` → réponse HTTP 422 + message de limite ; si valide → `insert_spirit` puis redirection 303 vers `/`
    - Court-circuiter si `DB_READY` est False (erreur + opérations désactivées)
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 4.5_

  - [x] 4.3 Mettre à jour la route `POST /banish/{task_id}`
    - Appeler `delete_spirit` ; si une ligne supprimée → renvoyer 200 (appels fetch) ; si id absent → `HTTPException(404)`
    - _Requirements: 3.1, 3.5_

  - [x]* 4.4 Écrire les tests d'exemple HTTP (TestClient)
    - Vérifier 303 au summon valide (1.3), 422 au titre trop long (1.6), re-render 200 + valeur conservée au titre vide (1.4), 404 au bannissement d'un id inexistant (3.5), `db_error` sur échec de listing (2.6)
    - _Requirements: 1.3, 1.4, 1.6, 2.6, 3.5_

- [x] 5. Checkpoint — Vérifier les routes serveur
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Mettre à jour le template Jinja2
  - [x] 6.1 Faire évoluer `Summon_Form`, `Spirit_List` et le bloc d'erreur
    - `Summon_Form` avec `maxlength="200"`, `required`, repeuplement de la valeur et affichage de `error` si présent
    - `Spirit_List` (`<ul>` triée id DESC) : chaque `<li>` avec `data-id`, `👻 titre` et `Banish_Button` dans un `<form class="banish-form">`
    - Afficher le bloc `db_error` et désactiver les formulaires si la base est indisponible
    - _Requirements: 1.1, 2.5, 2.6, 4.5_

  - [x] 6.2 Ajouter le conteneur `Ghost_Mascot`
    - Ajouter `#mascot` (emoji 👻) et `#mascot-msg` jamais masqués via CSS ; état initial selon la présence d'esprits
    - _Requirements: 6.1, 6.5_

- [x] 7. Implémenter la logique client (JS vanilla)
  - [x] 7.1 Implémenter la mascotte (`ghost.js`)
    - Liste `SPOOKY` d'au moins 5 messages distincts + `QUIET` ; fonction de sélection aléatoire différente du précédent ; état « quiet » quand la liste est vide ; mise à jour à l'ajout/suppression
    - _Requirements: 2.3, 2.4, 6.2, 6.3, 6.4_

  - [x]* 7.2 Test de propriété — sélection d'un message spooky
    - **Property 6: La sélection d'un message spooky appartient à l'ensemble et diffère du précédent**
    - **Validates: Requirements 2.4, 6.3**
    - Modéliser la fonction de sélection (ensemble + dernier message), couvrir chaque message précédent possible ; ≥100 itérations, tag `Feature: seance-haunted-productivity, Property 6`

  - [x] 7.3 Implémenter le bannissement client (`banish.js`)
    - Intercepter le submit, ajouter `.banished` (animation 400 ms), puis `fetch('/banish/{id}', {method:'POST'})` à la fin de l'animation
    - Succès 2xx → retirer le `<li>` du DOM sans recharger la page + mise à jour mascotte (état quiet si liste vide)
    - Échec 404/réseau → restaurer le `<li>` à son index d'origine + message d'erreur
    - _Requirements: 3.2, 3.3, 3.4, 3.6_

  - [x]* 7.4 Test de propriété — restauration de la liste après échec de bannissement
    - **Property 8: L'échec d'un bannissement restaure la liste à son état initial (round-trip DOM)**
    - **Validates: Requirements 3.4**
    - Modéliser l'ordre/contenu de la liste et la restauration à l'index d'origine ; ≥100 itérations, tag `Feature: seance-haunted-productivity, Property 8`

- [x] 8. Appliquer le thème gothique mesurable (CSS)
  - [x] 8.1 Régler le thème sombre et le brouillard animé
    - Fond sombre (luminance relative WCAG < 20 %) ; brouillard non interactif avec opacité oscillant entre 0,3 et 0,6 sur un cycle de 6 à 12 s en boucle
    - _Requirements: 5.1, 5.2_

  - [x] 8.2 Appliquer police, lueur et flottement
    - Titre en `Cinzel Decorative` avec fallback serif décoratif dans la même règle `font-family` ; glow ambré (hue 30–50°) ou violet (hue 270–300°) sur titre et boutons ; flottement vertical des esprits 4–8 px sur 3–5 s en boucle
    - _Requirements: 5.3, 5.4, 5.5_

  - [x] 8.3 Respecter `prefers-reduced-motion`
    - Désactiver toutes les animations CSS (brouillard, flottement, lueur pulsée, mascotte) sous `prefers-reduced-motion: reduce`
    - _Requirements: 5.6, 6.6_

- [x] 9. Intégration et câblage
  - [x] 9.1 Câbler template, mascotte et bannissement de bout en bout
    - Inclure `ghost.js` et `banish.js` dans `index.html`, initialiser la mascotte au chargement selon la présence d'esprits, connecter le flux summon → liste → mascotte et banish → fetch → mascotte
    - _Requirements: 2.3, 3.3, 3.6, 6.1_

  - [x]* 9.2 Écrire les tests d'intégration de bout en bout
    - Vérifier le cycle summon → listing (ordre id DESC) → banish, le message « quiet » sur liste vide (2.3, 3.6, 6.4) et la présence/non-masquage de la mascotte (6.1)
    - _Requirements: 2.3, 3.3, 6.1_

- [x] 10. Checkpoint final — Vérifier l'ensemble
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Les tâches marquées `*` sont des tests, optionnelles et pouvant être ignorées pour un MVP rapide.
- Chaque tâche référence des requirements précis pour la traçabilité.
- Les checkpoints assurent une validation incrémentale.
- Les tests de propriétés (Hypothesis, ≥100 itérations) valident les 9 propriétés de correction ; chaque propriété est son propre sous-tâche et porte le tag `Feature: seance-haunted-productivity, Property {n}`.
- Les tests unitaires/exemples valident les statuts HTTP, messages fixes et chemins d'erreur base de données.
- Les aspects purement visuels (thème, animations) sont couverts par inspection/snapshot et ne sont pas exprimés en propriétés universelles.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.5"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.6", "2.7", "2.8", "2.9"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4", "6.1", "6.2"] },
    { "id": 5, "tasks": ["7.1", "7.3", "8.1"] },
    { "id": 6, "tasks": ["7.2", "7.4", "8.2", "8.3"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2"] }
  ]
}
```
