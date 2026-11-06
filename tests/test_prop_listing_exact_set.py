"""Tests de propriété — le listing récupère exactement l'ensemble stocké.

Feature: seance-haunted-productivity, Property 5

Property 5: Le listing récupère EXACTEMENT l'ensemble stocké — ni plus, ni
moins, sans titre altéré.
Validates: Requirements 2.1

On insère de 0 à 20 titres valides dans une base SQLite temporaire fraîche
(une par exemple Hypothesis, pour l'indépendance des exemples), en mémorisant
la correspondance id -> titre inséré. On vérifie ensuite que ``list_spirits`` :
- renvoie EXACTEMENT l'ensemble des ids insérés (ni plus, ni moins) ;
- renvoie un nombre de lignes identique au nombre d'insertions ;
- pour chaque ligne renvoyée, restitue le titre exact inséré pour cet id
  (round-trip exact, robuste aux doublons grâce au clé par id) ;
- renvoie une liste vide ``[]`` lorsque la base est vide.

CRITIQUE : ces tests ne touchent JAMAIS le vrai ``db.sqlite3`` ; chaque exemple
crée et supprime son propre fichier temporaire, et la connexion est fermée dans
un bloc ``finally`` avant ``os.remove`` (sous Windows le fichier reste
verrouillé tant que la connexion est ouverte).
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


# Titres valides : non vides après strip, longueur <= 200. La liste autorise
# min_size=0 afin de couvrir le cas d'une base vide (listing == []).
valid_titles = st.lists(
    st.text(min_size=1, max_size=200).map(str.strip).filter(
        lambda s: 0 < len(s) <= 200
    ),
    min_size=0,
    max_size=20,
)


@settings(max_examples=150, deadline=None)
@given(titles=valid_titles)
def test_listing_retrieves_exact_stored_set(titles):
    """Property 5 — list_spirits restitue exactement l'ensemble stocké.

    Feature: seance-haunted-productivity, Property 5
    Validates: Requirements 2.1
    """
    path = _create_temp_db()
    try:
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        try:
            # Insère tous les titres, en mémorisant id -> titre d'origine.
            # La clé par id est robuste aux doublons de titres.
            id_to_title = {}
            for title in titles:
                new_id = main.insert_spirit(conn, title)
                id_to_title[new_id] = title

            spirits = main.list_spirits(conn)
        finally:
            # Fermeture explicite : sous Windows le fichier reste verrouillé
            # tant que la connexion est ouverte, empêchant le nettoyage.
            conn.close()

        returned_ids = [s["id"] for s in spirits]

        # (a) Cas base vide : listing == [].
        if not titles:
            assert spirits == []
            return

        # (b) L'ensemble des ids renvoyés == exactement l'ensemble inséré.
        assert set(returned_ids) == set(id_to_title)

        # (c) Le nombre de lignes renvoyées == exactement le nombre d'insertions
        #     (pas de doublon ni d'omission ; les ids sont uniques).
        assert len(returned_ids) == len(id_to_title)
        assert len(set(returned_ids)) == len(returned_ids)

        # (d) Round-trip exact : chaque id renvoie le titre inséré pour cet id.
        for spirit in spirits:
            assert spirit["title"] == id_to_title[spirit["id"]]
    finally:
        # Nettoyage du fichier temporaire pour garder les exemples indépendants.
        if os.path.exists(path):
            os.remove(path)
