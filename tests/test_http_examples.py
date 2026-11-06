"""Tests d'exemple HTTP via TestClient (tâche 4.4).

Couvre les critères d'acceptation des routes FastAPI :
- Req 1.3 : summon d'un titre valide → redirection 303 vers "/".
- Req 1.6 : titre trop long (201 car.) → réponse HTTP 422 + message de limite.
- Req 1.4 : titre vide/espaces → re-render 200, erreur visible, valeur
  conservée, aucune insertion.
- Req 3.5 : bannissement d'un id inexistant → 404 ; plus un happy-path
  summon → banish → disparition (Req 3.1).
- Req 2.6 : échec de listing → GET / reste 200 et rend le message db_error.

CRITIQUE — isolation de la base : l'application lit/écrit la base via
``main.DB_PATH`` au moment de l'appel (``get_db()`` ouvre ``main.DB_PATH``).
Pour ne jamais corrompre la vraie ``db.sqlite3``, la fixture ``client`` :
  1. redirige ``main.DB_PATH`` vers un fichier SQLite dans ``tmp_path`` ;
  2. appelle ``main.init_db()`` pour créer le schéma et fixer ``DB_READY`` ;
  3. fournit un ``TestClient(main.app)`` (redirections désactivées) ;
  4. restaure ``DB_PATH`` (via monkeypatch) et ``DB_READY`` (sauvegarde
     explicite) après chaque test.
La fixture est à portée fonction : chaque test part d'une base temporaire
fraîche et isolée.
"""

import sqlite3

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    """TestClient isolé sur une base SQLite temporaire fraîche.

    Garantit que la vraie ``db.sqlite3`` n'est jamais touchée : on redirige
    ``main.DB_PATH`` vers ``tmp_path`` et on recrée le schéma pour ce test.
    ``follow_redirects=False`` permet d'inspecter la redirection 303.
    """
    db_file = tmp_path / "http_test.sqlite3"
    original_ready = main.DB_READY
    monkeypatch.setattr(main, "DB_PATH", str(db_file))
    # Crée le schéma dans la base temporaire et positionne DB_READY=True.
    main.init_db()
    with TestClient(main.app, follow_redirects=False) as test_client:
        yield test_client
    # DB_PATH est restauré par monkeypatch ; on restaure le drapeau module.
    main.DB_READY = original_ready


def _count_spirits():
    """Compte les lignes présentes dans la base temporaire courante."""
    with main.get_db() as conn:
        return conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]


# ---------------------------------------------------------------------------
# Req 1.3 — summon valide → redirection 303 vers "/"
# ---------------------------------------------------------------------------


def test_summon_valid_title_redirects_303(client):
    """Un titre valide provoque une redirection 303 vers la page principale."""
    before = _count_spirits()
    response = client.post("/summon", data={"title": "Casper le gentil"})

    assert response.status_code == 303
    assert response.headers["location"] == "/"
    # L'esprit a bien été inséré.
    assert _count_spirits() == before + 1


# ---------------------------------------------------------------------------
# Req 1.6 — titre trop long (201 car.) → 422 + message de limite
# ---------------------------------------------------------------------------


def test_summon_too_long_title_returns_422(client):
    """Un titre de 201 caractères renvoie 422 avec le message de limite."""
    before = _count_spirits()
    too_long = "x" * 201
    response = client.post("/summon", data={"title": too_long})

    assert response.status_code == 422
    # Le message d'erreur mentionne la limite de 200 caractères.
    assert "200" in response.text
    # Aucune insertion n'a eu lieu.
    assert _count_spirits() == before


# ---------------------------------------------------------------------------
# Req 1.4 — titre vide/espaces → re-render 200, erreur, valeur conservée
# ---------------------------------------------------------------------------


def test_summon_whitespace_title_rerenders_200_preserves_value(client):
    """Un titre composé uniquement d'espaces est rejeté sans insertion.

    La réponse est un re-render 200 (pas une redirection), le message
    d'erreur est présent dans le HTML, la valeur saisie est repeuplée dans le
    champ et aucune ligne n'est créée en base (Req 1.4).
    """
    before = _count_spirits()
    submitted = "   "
    response = client.post("/summon", data={"title": submitted})

    # Re-render 200 et NON une redirection.
    assert response.status_code == 200
    assert "location" not in {k.lower() for k in response.headers}

    html = response.text
    # Message d'erreur visible.
    assert "vide" in html
    # Valeur saisie conservée dans l'attribut value du champ.
    assert f'value="{submitted}"' in html
    # Aucune insertion.
    assert _count_spirits() == before

    # Vérification croisée via GET / : la liste reste vide.
    home = client.get("/")
    assert home.status_code == 200
    assert "The house is quiet" in home.text


# ---------------------------------------------------------------------------
# Req 3.5 / 3.1 — bannissement d'un id inexistant → 404 ; happy-path
# ---------------------------------------------------------------------------


def test_banish_nonexistent_id_returns_404(client):
    """Bannir un identifiant absent renvoie 404 (Req 3.5)."""
    response = client.post("/banish/999999")
    assert response.status_code == 404


def test_banish_existing_spirit_succeeds_and_disappears(client):
    """Happy-path : summon valide puis banish retire l'esprit (Req 3.1).

    On lit l'identifiant inséré directement dans la base temporaire, on
    bannit via POST /banish/{id} (attendu 200 + JSON {"ok": true}), puis on
    vérifie que GET / ne liste plus l'esprit.
    """
    title = "Esprit frappeur"
    redirect = client.post("/summon", data={"title": title})
    assert redirect.status_code == 303

    # Récupère l'id de l'esprit fraîchement inséré.
    with main.get_db() as conn:
        row = conn.execute(
            "SELECT id FROM tasks WHERE title = ? ORDER BY id DESC", (title,)
        ).fetchone()
    assert row is not None
    task_id = row["id"]

    # Avant bannissement, l'esprit apparaît sur la page d'accueil.
    before_home = client.get("/")
    assert title in before_home.text

    # Bannissement → 200 + JSON ok.
    banished = client.post(f"/banish/{task_id}")
    assert banished.status_code == 200
    assert banished.json() == {"ok": True}

    # L'esprit a disparu de la liste et de la base.
    after_home = client.get("/")
    assert title not in after_home.text
    assert _count_spirits() == 0


# ---------------------------------------------------------------------------
# Req 2.6 — échec de listing → GET / reste 200 et rend db_error
# ---------------------------------------------------------------------------


def test_home_renders_db_error_on_listing_failure(client, monkeypatch):
    """Si le listing échoue (sqlite3.Error), GET / reste 200 et rend db_error.

    On force ``list_spirits`` à lever une ``sqlite3.Error`` : la route doit
    dégrader gracieusement (tasks=[], db_error=True) et afficher le message
    d'indisponibilité de la base (Req 2.6).
    """

    def boom(_conn):
        raise sqlite3.Error("listing indisponible")

    monkeypatch.setattr(main, "list_spirits", boom)

    response = client.get("/")

    assert response.status_code == 200
    html = response.text
    # Le bloc db_error est rendu (message d'indisponibilité de la base).
    assert "database is unreachable" in html
    # Aucun esprit n'est présenté (aucune ligne <li data-id="...">).
    assert "data-id" not in html
