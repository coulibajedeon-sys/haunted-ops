"""Tests unitaires du schéma SQLite et de l'initialisation (tâche 1.2).

Couvre les critères d'acceptation :
- Req 4.1 : initialisation idempotente de la table ``tasks`` au démarrage.
- Req 4.2 : schéma (id auto-incrémenté, titre NON NUL ≤ 200 caractères).
- Req 4.5 : ``DB_READY`` passe à False si l'initialisation échoue.

CRITIQUE : ces tests ne touchent jamais la vraie base ``db.sqlite3``. Chaque
test redirige ``main.DB_PATH`` vers un fichier temporaire (fixture ``tmp_path``)
pour sa durée puis restaure l'état initial.
"""

import sqlite3

import pytest

import main


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """Redirige ``main.DB_PATH`` vers une base temporaire isolée.

    Restaure automatiquement ``DB_PATH`` et ``DB_READY`` après le test grâce à
    ``monkeypatch`` (DB_PATH) et à une sauvegarde/restauration explicite de
    ``DB_READY``. Renvoie le chemin (str) du fichier temporaire.
    """
    db_file = tmp_path / "test_db.sqlite3"
    original_ready = main.DB_READY
    monkeypatch.setattr(main, "DB_PATH", str(db_file))
    yield str(db_file)
    # Restaure le drapeau module (DB_PATH est restauré par monkeypatch).
    main.DB_READY = original_ready


def _table_exists(conn, name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    return row is not None


# ---------------------------------------------------------------------------
# Req 4.1 — idempotence de init_db
# ---------------------------------------------------------------------------


def test_init_db_idempotent_returns_true_twice(temp_db):
    """Un double appel à init_db réussit sans erreur ni effet de bord."""
    assert main.init_db() is True
    assert main.init_db() is True
    assert main.DB_READY is True


def test_init_db_creates_tasks_table(temp_db):
    """La table ``tasks`` existe après initialisation."""
    main.init_db()
    with main.get_db() as conn:
        assert _table_exists(conn, "tasks")


def test_init_db_idempotent_preserves_data(temp_db):
    """Réappeler init_db ne détruit pas les lignes déjà présentes."""
    main.init_db()
    with main.get_db() as conn:
        conn.execute("INSERT INTO tasks (title) VALUES (?)", ("Casper",))
        conn.commit()
    # Second appel : CREATE TABLE IF NOT EXISTS → aucun effet de bord.
    main.init_db()
    with main.get_db() as conn:
        count = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    assert count == 1


# ---------------------------------------------------------------------------
# Req 4.2 — contraintes du schéma
# ---------------------------------------------------------------------------


def test_title_not_null_constraint(temp_db):
    """Insérer un titre NULL viole la contrainte NOT NULL."""
    main.init_db()
    with main.get_db() as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO tasks (title) VALUES (?)", (None,))
            conn.commit()


def test_title_check_length_rejects_201(temp_db):
    """Un titre de 201 caractères viole la contrainte CHECK length<=200."""
    main.init_db()
    too_long = "x" * 201
    with main.get_db() as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO tasks (title) VALUES (?)", (too_long,))
            conn.commit()


def test_title_check_length_accepts_200(temp_db):
    """Un titre de 200 caractères (frontière) est accepté."""
    main.init_db()
    boundary = "x" * 200
    with main.get_db() as conn:
        conn.execute("INSERT INTO tasks (title) VALUES (?)", (boundary,))
        conn.commit()
        stored = conn.execute("SELECT title FROM tasks").fetchone()[0]
    assert stored == boundary


def test_id_is_autoincrement(temp_db):
    """L'identifiant est auto-incrémenté (Req 4.2)."""
    main.init_db()
    with main.get_db() as conn:
        c1 = conn.execute("INSERT INTO tasks (title) VALUES (?)", ("un",))
        c2 = conn.execute("INSERT INTO tasks (title) VALUES (?)", ("deux",))
        conn.commit()
        id1, id2 = c1.lastrowid, c2.lastrowid
    assert id1 >= 1
    assert id2 == id1 + 1


# ---------------------------------------------------------------------------
# Req 4.5 — DB_READY passe à False si l'initialisation échoue
# ---------------------------------------------------------------------------


def test_db_ready_false_on_init_failure(temp_db, monkeypatch):
    """Si get_db lève une erreur SQLite, init_db renvoie False et DB_READY=False."""
    # Mettre DB_READY à True au départ pour vérifier qu'il bascule bien à False.
    main.DB_READY = True

    def boom():
        raise sqlite3.Error("connexion impossible")

    monkeypatch.setattr(main, "get_db", boom)

    assert main.init_db() is False
    assert main.DB_READY is False
