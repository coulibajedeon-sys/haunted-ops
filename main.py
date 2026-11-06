import sqlite3
from contextlib import closing

from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

DB_PATH = "db.sqlite3"

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# Sert les ressources statiques client (ghost.js, banish.js) sous /static afin
# que le template puisse les référencer via <script src="/static/...">. Les
# fichiers vivent dans le répertoire `static/` à la racine du projet (tâche 9.1).
app.mount("/static", StaticFiles(directory="static"), name="static")

# Drapeau module indiquant si l'initialisation de la base a réussi.
# Les routes consultent ce drapeau pour désactiver les opérations
# d'ajout/suppression si la base est indisponible (Req 4.5).
DB_READY = False


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Crée la table `tasks` si elle n'existe pas encore.

    La fonction est idempotente : des réappels successifs n'ont aucun
    effet de bord (CREATE TABLE IF NOT EXISTS). En cas d'échec, le
    drapeau module `DB_READY` reste/passe à False et l'exception est
    capturée pour permettre une dégradation gracieuse (Req 4.5).
    """
    global DB_READY
    try:
        with closing(get_db()) as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS tasks ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "title TEXT NOT NULL CHECK (length(title) <= 200))"
            )
            conn.commit()
        DB_READY = True
    except sqlite3.Error:
        DB_READY = False
    return DB_READY


init_db()


# Longueur maximale autorisée pour le titre d'un esprit (Req 1.5).
MAX_TITLE_LENGTH = 200


def normalize_and_validate(raw_title: str) -> tuple[bool, str, str | None]:
    """Normalise et valide un titre d'esprit.

    Fonction **pure** (sans effet de bord) : elle applique `strip` au titre
    reçu puis détermine sa validité selon les règles de Séance.

    Args:
        raw_title: le titre brut tel que saisi par l'utilisateur.

    Returns:
        Un triplet ``(is_valid, cleaned_title, error_kind)`` où :
        - ``is_valid`` vaut ``True`` si le titre normalisé est acceptable.
        - ``cleaned_title`` est le titre après ``strip`` (toujours renvoyé,
          y compris en cas d'erreur, pour permettre le réaffichage).
        - ``error_kind`` vaut ``None`` si valide, ``"empty"`` si le titre
          normalisé est vide (vide/espaces uniquement, Req 1.4), ou
          ``"too_long"`` si sa longueur dépasse 200 caractères (Req 1.5).
    """
    cleaned = raw_title.strip()
    if not cleaned:
        return (False, cleaned, "empty")
    if len(cleaned) > MAX_TITLE_LENGTH:
        return (False, cleaned, "too_long")
    return (True, cleaned, None)


# ---------------------------------------------------------------------------
# Dépôt de données (CRUD)
#
# Ces fonctions encapsulent l'accès à la table `tasks`. Elles reçoivent une
# connexion déjà ouverte (`conn`) afin de rester composables et testables
# (ex. round-trip de persistance via une nouvelle connexion). Elles ne gèrent
# pas elles-mêmes la dégradation gracieuse : une base indisponible lève une
# exception que l'appelant (routes) capture pour exposer `db_error`/`DB_READY`.
# ---------------------------------------------------------------------------


def list_spirits(conn) -> list[dict]:
    """Renvoie tous les esprits triés par identifiant décroissant.

    Le plus récemment invoqué apparaît en tête (Req 1.7, 2.2). Chaque esprit
    est un dict ``{"id": int, "title": str}``. Lève une exception si la base
    est indisponible (Req 2.6, géré par l'appelant).
    """
    rows = conn.execute("SELECT id, title FROM tasks ORDER BY id DESC").fetchall()
    return [dict(row) for row in rows]


def insert_spirit(conn, title: str) -> int:
    """Insère un esprit (titre déjà validé/normalisé) et renvoie son id.

    Le titre est validé en amont via ``normalize_and_validate`` ; cette
    fonction se contente de persister la ligne et de valider la transaction
    (Req 1.2, 2.1), puis renvoie l'identifiant auto-incrémenté généré.
    """
    cursor = conn.execute("INSERT INTO tasks (title) VALUES (?)", (title,))
    conn.commit()
    return cursor.lastrowid


def delete_spirit(conn, task_id: int) -> bool:
    """Supprime l'esprit d'identifiant ``task_id``.

    Renvoie ``True`` si une ligne a bien été supprimée, ``False`` sinon — ce
    dernier cas déclenche une réponse HTTP 404 côté route (Req 3.1, 3.5).
    """
    cursor = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    return cursor.rowcount > 0


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    """Affiche la page principale avec la liste des esprits.

    Récupère les esprits via ``list_spirits`` (triés par id décroissant,
    Req 2.1, 2.2) et transmet ``tasks``, ``error`` et ``db_error`` au
    template. En cas d'échec SQLite lors de la récupération, on dégrade
    gracieusement : ``db_error=True`` et ``tasks=[]`` (Req 2.5, 2.6).
    """
    error = None
    db_error = False
    try:
        with closing(get_db()) as conn:
            tasks = list_spirits(conn)
    except sqlite3.Error:
        tasks = []
        db_error = True
    return templates.TemplateResponse(
        request,
        "index.html",
        {"tasks": tasks, "error": error, "db_error": db_error},
    )


def _render_index(request, tasks, error, db_error, title=""):
    """Rend le template index avec les mêmes clés de contexte que ``home``.

    Ajoute ``title`` pour permettre le repeuplement du champ de saisie lors
    d'un re-render d'erreur (valeur saisie conservée, Req 1.4).
    """
    return templates.TemplateResponse(
        request,
        "index.html",
        {"tasks": tasks, "error": error, "db_error": db_error, "title": title},
    )


@app.post("/summon")
def summon(request: Request, title: str = Form(...)):
    """Invoque un nouvel esprit à partir du titre soumis.

    Court-circuite si la base est indisponible (``DB_READY`` False) : aucune
    opération d'écriture, re-render avec message d'erreur (Req 4.5). Sinon,
    valide via ``normalize_and_validate`` et applique le comportement défini
    dans la table Error Handling du design :
    - ``empty`` → re-render (200) avec ``error`` et valeur saisie conservée,
      aucune insertion (Req 1.4) ;
    - ``too_long`` → réponse HTTP 422 avec message de limite (Req 1.6) ;
    - valide → ``insert_spirit`` puis redirection 303 vers ``/`` (Req 1.2, 1.3).
    """
    # Court-circuit : base indisponible → opérations désactivées (Req 4.5).
    if not DB_READY:
        return _render_index(
            request,
            tasks=[],
            error="La séance est interrompue : la base est indisponible.",
            db_error=True,
            title=title,
        )

    is_valid, cleaned, error_kind = normalize_and_validate(title)

    if error_kind == "empty":
        # Rejet sans insertion, erreur visible, valeur conservée (Req 1.4).
        try:
            with closing(get_db()) as conn:
                tasks = list_spirits(conn)
            db_error = False
        except sqlite3.Error:
            tasks = []
            db_error = True
        return _render_index(
            request,
            tasks=tasks,
            error="Le titre de l'esprit ne peut pas être vide.",
            db_error=db_error,
            title=title,
        )

    if error_kind == "too_long":
        # Rejet avec statut HTTP 422 + message de limite (Req 1.6).
        raise HTTPException(
            status_code=422,
            detail=f"Le titre de l'esprit ne peut pas dépasser {MAX_TITLE_LENGTH} caractères.",
        )

    # Titre valide → insertion puis redirection 303 (Req 1.2, 1.3).
    with closing(get_db()) as conn:
        insert_spirit(conn, cleaned)
    return RedirectResponse("/", status_code=303)


@app.post("/banish/{task_id}")
def banish(task_id: int):
    """Bannit l'esprit d'identifiant ``task_id`` (appelé via fetch client).

    Court-circuite si la base est indisponible (``DB_READY`` False) : aucune
    opération de suppression, renvoie une erreur explicite (Req 4.5). Sinon,
    délègue à ``delete_spirit`` et applique le contrat du design :
    - une ligne supprimée → réponse JSON 200 (``{"ok": True}``) consommée par
      ``banish.js`` pour retirer l'élément sans recharger la page (Req 3.1) ;
    - identifiant absent (``delete_spirit`` renvoie False) → ``HTTPException``
      404 déclenchant la restauration DOM côté client (Req 3.5).
    """
    # Court-circuit : base indisponible → opérations désactivées (Req 4.5).
    if not DB_READY:
        raise HTTPException(
            status_code=503,
            detail="La séance est interrompue : la base est indisponible.",
        )

    with closing(get_db()) as conn:
        deleted = delete_spirit(conn, task_id)

    if not deleted:
        # Aucun esprit avec cet identifiant → 404 (Req 3.5).
        raise HTTPException(status_code=404, detail="Esprit introuvable.")

    # Suppression réussie → 200 JSON pour l'appel fetch (Req 3.1).
    return {"ok": True}