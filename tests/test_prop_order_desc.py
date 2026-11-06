"""Tests de propriété — ordre par identifiant décroissant.

Feature: seance-haunted-productivity, Property 4

Property 4: Les esprits sont listés en identifiant décroissant.
Validates: Requirements 1.7, 2.2

On insère une séquence de titres valides dans une base SQLite temporaire
fraîche (une par exemple Hypothesis, pour l'indépendance des exemples), puis
on vérifie que ``list_spirits`` renvoie les esprits triés par ``id`` strictement
décroissant, le plus récemment invoqué en tête.

CRITIQUE : ces tests ne touchent JAMAIS le vrai ``db.sqlite3`` ; chaque exemple
crée et supprime son propre fichier temporaire.
"""

import os
import sqlite3
import tempfile

from hypothesis import given, settings
from hypothesis import strategies as st

import main


def _create_temp_db() -> str:
    """Crée un fichier SQLite temporaire avec le schéma `tasks` et le renvoie.

    Le schéma reproduit celui de ``main.init_db`` (id AUTOINCREMENT, title avec
    CHECK length <= 200). On utilise une connexion directe pour ne pas dépendre
    du drapeau module ``DB_READY`` ni du chemin réel ``DB_PATH``.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tasks ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "title TEXT NOT NULL CHECK (length(title) <= 200))"
        )
        conn.commit()
    finally:
        conn.close()
    return path


# Titres valides : non vides après strip, longueur <= 200. On génère du texte
# puis on filtre pour garantir la validité (évite les titres rejetés en amont).
valid_titles = st.lists(
    st.text(min_size=1, max_size=200).map(str.strip).filter(
        lambda s: 0 < len(s) <= 200
    ),
    min_size=1,
    max_size=20,
)


@settings(max_examples=150, deadline=None)
@given(titles=valid_titles)
def test_spirits_listed_in_descending_id_order(titles):
    """Property 4 — list_spirits renvoie un ordre d'id strictement décroissant.

    Feature: seance-haunted-productivity, Property 4
    Validates: Requirements 1.7, 2.2
    """
    path = _create_temp_db()
    try:
        inserted_ids = []
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        try:
            for title in titles:
                new_id = main.insert_spirit(conn, title)
                inserted_ids.append(new_id)

            spirits = main.list_spirits(conn)
        finally:
            # Fermeture explicite : sous Windows le fichier reste verrouillé
            # tant que la connexion est ouverte, empêchant le nettoyage.
            conn.close()

        returned_ids = [s["id"] for s in spirits]

        # (a) Les ids renvoyés sont strictement décroissants (tri id DESC).
        assert returned_ids == sorted(returned_ids, reverse=True)
        assert all(
            earlier > later
            for earlier, later in zip(returned_ids, returned_ids[1:])
        )

        # On a bien récupéré tous les esprits insérés.
        assert len(returned_ids) == len(inserted_ids)

        # (b) Le premier élément correspond à l'esprit le plus récemment inséré.
        assert returned_ids[0] == max(inserted_ids)
        assert returned_ids[0] == inserted_ids[-1]
        assert spirits[0]["title"] == titles[-1]
    finally:
        # Nettoyage du fichier temporaire pour garder les exemples indépendants.
        if os.path.exists(path):
            os.remove(path)
