# Requirements Document

## Introduction

Séance est un assistant de productivité hanté développé dans le cadre du Kiroween Costume Contest. L'application permet aux utilisateurs de gérer leurs tâches sous forme d'esprits : chaque tâche est un esprit que l'on *invoque* pour le faire apparaître, et que l'on *bannit* pour le compléter. Une mascotte fantôme accompagne l'utilisateur avec des messages contextuels effrayants. L'interface adopte un thème gothique sombre avec brouillard animé, lueur de bougie et police hantée. Le backend repose sur FastAPI, les templates Jinja2, et SQLite pour la persistance locale.

## Glossary

- **Spirit** : Une tâche représentée sous forme d'esprit dans l'interface.
- **Séance** : L'application elle-même ; aussi le nom de la page principale.
- **App** : Le serveur FastAPI qui gère les requêtes HTTP.
- **Database** : La base de données SQLite locale (`db.sqlite3`).
- **Ghost_Mascot** : La mascotte fantôme animée affichant des messages contextuels.
- **Summon_Form** : Le formulaire permettant d'invoque un nouvel esprit.
- **Spirit_List** : La liste des esprits actuellement invoqués.
- **Banish_Button** : Le bouton permettant de bannir (compléter) un esprit.
- **User** : La personne utilisant l'interface web de Séance.

---

## Requirements

### Requirement 1: Spirit Summoning

**User Story:** En tant qu'utilisateur, je veux invoquer un esprit en saisissant un titre, afin d'ajouter une nouvelle tâche à ma liste hantée.

#### Acceptance Criteria

1. THE Summon_Form SHALL afficher un champ de texte et un bouton "Summon" sur la page principale.
2. WHEN l'utilisateur soumet le Summon_Form avec un titre non vide et ne contenant pas uniquement des espaces, THE App SHALL enregistrer le nouvel esprit dans la Database avec son titre.
3. WHEN un esprit est invoqué avec succès, THE App SHALL rediriger l'utilisateur vers la page principale avec le nouvel esprit visible dans la Spirit_List.
4. IF l'utilisateur soumet le Summon_Form avec un titre vide ou composé uniquement d'espaces, THEN THE App SHALL rejeter la soumission, afficher un message d'erreur visible à l'utilisateur, et conserver la valeur saisie dans le champ de texte sans créer d'entrée en base.
5. THE App SHALL limiter le titre d'un esprit à 200 caractères maximum.
6. IF le titre dépasse 200 caractères, THEN THE App SHALL rejeter la soumission, renvoyer une réponse d'erreur HTTP 422, et afficher un message d'erreur visible indiquant la limite de caractères.
7. WHEN un esprit est invoqué avec succès, THE Spirit_List SHALL afficher le nouvel esprit en tête de liste (ordre décroissant par identifiant).

---

### Requirement 2: Spirit Listing

**User Story:** En tant qu'utilisateur, je veux voir tous mes esprits invoqués sur la page principale, afin de connaître mes tâches en attente.

#### Acceptance Criteria

1. WHEN l'utilisateur charge la page principale, THE App SHALL récupérer tous les esprits présents dans la Database et les transmettre au template.
2. THE Spirit_List SHALL afficher chaque esprit dans l'ordre d'invocation décroissant (par identifiant décroissant, du plus récent au plus ancien).
3. WHEN la Spirit_List est vide, THE Ghost_Mascot SHALL afficher le message : *"The house is quiet… for now."*
4. WHEN la page principale est chargée et que la Spirit_List contient au moins un esprit, THE Ghost_Mascot SHALL afficher un message d'ambiance aléatoire parmi une liste prédéfinie d'au moins 5 messages effrayants distincts.
5. THE Spirit_List SHALL afficher le titre de chaque esprit accompagné d'un Banish_Button.
6. IF la récupération des esprits depuis la Database échoue, THEN THE App SHALL afficher un message d'erreur à l'utilisateur et ne présenter aucun esprit dans la Spirit_List.

---

### Requirement 3: Spirit Banishment

**User Story:** En tant qu'utilisateur, je veux bannir un esprit, afin de marquer une tâche comme accomplie et la faire disparaître avec une animation.

#### Acceptance Criteria

1. WHEN l'utilisateur clique sur le Banish_Button d'un esprit, THE App SHALL supprimer l'entrée correspondante dans la Database.
2. WHEN l'utilisateur clique sur le Banish_Button, THE Spirit_List SHALL déclencher une animation de disparition d'une durée de 400 ms sur l'élément, puis envoyer la requête de suppression au serveur à l'issue de cette animation.
3. WHEN la suppression est confirmée par le serveur, THE App SHALL rafraîchir la Spirit_List pour refléter l'état courant de la Database sans recharger la page entière.
4. IF la requête de suppression échoue (réponse 404 ou erreur réseau), THEN THE App SHALL restaurer l'élément dans la Spirit_List à sa position d'origine et afficher un message d'erreur indiquant l'échec du bannissement.
5. IF l'identifiant d'un esprit à bannir n'existe pas dans la Database, THEN THE App SHALL renvoyer une réponse HTTP 404.
6. WHEN tous les esprits sont bannis et que la Spirit_List devient vide, THE Ghost_Mascot SHALL afficher le message : *"The house is quiet… for now."*

---

### Requirement 4: Local Data Persistence

**User Story:** En tant qu'utilisateur, je veux que mes esprits soient conservés entre les sessions, afin de retrouver ma liste après avoir fermé et rouvert l'application.

#### Acceptance Criteria

1. WHEN l'App démarre, THE App SHALL initialiser la table `tasks` dans la Database si elle n'existe pas encore.
2. THE Database SHALL stocker pour chaque esprit : un identifiant entier auto-incrémenté, un titre textuel non nul d'une longueur maximale de 200 caractères.
3. WHEN l'App est redémarrée, THE Spirit_List SHALL afficher exactement les esprits (identifiants et titres correspondants) présents dans la Database avant l'arrêt, y compris en tenant compte des bannissements effectués avant l'arrêt.
4. THE App SHALL utiliser exclusivement la Database locale SQLite pour la persistance des données, sans dépendance à un service externe.
5. IF l'initialisation de la Database échoue au démarrage, THEN THE App SHALL afficher un message d'erreur à l'utilisateur et désactiver les opérations d'ajout et de suppression d'esprits.

---

### Requirement 5: Gothic Theme and Haunted Interface

**User Story:** En tant qu'utilisateur, je veux une interface visuellement effrayante et soignée, afin d'être immergé dans l'ambiance du concours Kiroween.

#### Acceptance Criteria

1. THE App SHALL servir une interface dont l'arrière-plan de la page d'index est sombre, avec une luminosité perçue inférieure à 20 % (mesurée selon la formule de luminance relative WCAG sur la couleur d'arrière-plan dominante).
2. WHEN la page d'index est chargée, THE App SHALL afficher en couche de fond un effet de brouillard animé non interactif, dont l'opacité oscille entre 0,3 et 0,6 sur un cycle de 6 à 12 secondes en boucle infinie.
3. THE App SHALL afficher le titre principal avec la police Cinzel Decorative ; si cette police est indisponible, THE App SHALL utiliser une police serif décorative de substitution déclarée dans la même règle CSS font-family.
4. THE App SHALL appliquer sur le titre principal et les boutons un effet de lueur (glow) dont la teinte est ambrée (hue 30–50°) ou violette (hue 270–300°).
5. WHEN un esprit est affiché dans la Spirit_List, THE Spirit_List SHALL lui appliquer en boucle infinie une animation de flottement vertical dont le déplacement est compris entre 4 px et 8 px et dont la durée d'un cycle est comprise entre 3 s et 5 s.
6. IF la préférence système `prefers-reduced-motion` est activée, THEN THE App SHALL désactiver toutes les animations CSS (brouillard, flottement, lueur pulsée) de sorte qu'aucun élément de la page ne soit en mouvement.

---

### Requirement 6: Contextual Ghost Mascot

**User Story:** En tant qu'utilisateur, je veux voir une mascotte fantôme avec des messages appropriés, afin de renforcer l'ambiance hantée de l'application.

#### Acceptance Criteria

1. THE Ghost_Mascot SHALL être rendu dans le DOM de la page principale et ne pas être masqué via CSS.
2. WHEN la Spirit_List est vide, THE Ghost_Mascot SHALL afficher le message *"The house is quiet… for now."*
3. WHEN un Spirit est ajouté à la Spirit_List, THE Ghost_Mascot SHALL afficher un message d'ambiance sélectionné aléatoirement parmi au moins 5 messages prédéfinis, de sorte que le message affiché soit différent du message précédemment affiché.
4. WHEN la Spirit_List redevient vide, THE Ghost_Mascot SHALL revenir à l'affichage du message *"The house is quiet… for now."*
5. THE Ghost_Mascot SHALL être représenté par un emoji ou une illustration SVG intégrée, sans dépendance à une ressource externe payante.
6. IF `prefers-reduced-motion` est activé, THEN THE Ghost_Mascot SHALL afficher ses messages sans animation.
