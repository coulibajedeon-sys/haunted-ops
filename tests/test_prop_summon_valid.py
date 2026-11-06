"""Tests de propriété — Séance / Haunted Productivity.

Feature: seance-haunted-productivity, Property 1

Property 1: Invocation d'un titre valide persiste le titre normalisé.
Validates: Requirements 1.2

Ces tests n'utilisent JAMAIS la vraie base ``db.sqlite3`` : chaque exemple
Hypothesis crée une base SQLite temporaire (fichier isolé via ``tempfile``),
initialise le schéma identique à ``main.init_db`` directement sur la
connexion temporaire, puis vérifie le round-trip d'insertion/listing.
"""

import os
import sqlite3
import tempfile
from contextlib import closing, contextmanager

from hypothesis import given, settings
from hypothesis import strategies as st

import main


def _create_schema(conn):
    """Crée la table ``tasks`` identique au schéma de ``main.init_db``."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "title TEXT NOT NULL CHECK (length(title) <= 200))"
    )
    conn.commit()


@contextmanager
def temp_db():
    """Fournit une connexion SQLite sur une base temporaire fraîche.

    Garantit qu'on ne touche jamais ``db.sqlite3`` : la base vit dans un
    fichier temporaire supprimé à la sortie du contexte.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    try:
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        with closing(conn):
            _create_schema(conn)
            yield conn
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


# Génère un "cœur" de texte sans espace en tête/queue : premier et dernier
# caractères non-whitespace, longueur 1..200. Après strip() le titre reste
# donc identique, non vide, et de longueur <= 200 (titre valide).
_non_ws = st.characters(blacklist_categories=("Cc", "Cs", "Zs", "Zl", "Zp"))


@st.composite
def valid_raw_titles(draw):
    """Titres bruts dont le strip() est non vide et de longueur <= 200.

    On construit un cœur non vide (bords non-whitespace) de longueur <= 200,
    puis on l'entoure optionnellement d'espaces/tabulations/retours — ce qui
    n'altère ni la validité ni la valeur normalisée attendue.
    """
    core_len = draw(st.integers(min_value=1, max_value=200))
    if core_len == 1:
        core = draw(_non_ws)
    else:
        first = draw(_non_ws)
        last = draw(_non_ws)
        middle = draw(
            st.text(
                alphabet=st.characters(blacklist_categories=("Cc", "Cs")),
                min_size=core_len - 2,
                max_size=core_len - 2,
            )
        )
        core = first + middle + last

    ws = st.text(alphabet=" \t\n\r\f\v", max_size=5)
    leading = draw(ws)
    trailing = draw(ws)
    return leading + core + trailing


# deadline=None : chaque exemple crée/supprime un fichier SQLite temporaire ;
# l'I/O disque (variable sous Windows) ne doit pas déclencher de faux échec de
# délai. On garde >= 100 itérations (200) comme exigé.
@settings(max_examples=200, deadline=None)
@given(raw=valid_raw_titles())
def test_valid_title_persists_normalized(raw):
    """Property 1 — un titre valide est normalisé puis persisté tel quel.

    Feature: seance-haunted-productivity, Property 1
    Validates: Requirements 1.2
    """
    is_valid, cleaned, error_kind = main.normalize_and_validate(raw)

    # La normalisation applique strip() et accepte le titre.
    assert is_valid is True
    assert error_kind is None
    assert cleaned == raw.strip()
    assert cleaned != ""
    assert len(cleaned) <= main.MAX_TITLE_LENGTH

    # Round-trip base : insertion puis listing renvoient le titre normalisé.
    with temp_db() as conn:
        new_id = main.insert_spirit(conn, cleaned)
        spirits = main.list_spirits(conn)

    assert any(s["id"] == new_id for s in spirits)
    stored = next(s for s in spirits if s["id"] == new_id)
    assert stored["title"] == cleaned
