"""Tests de propriété — persistance au redémarrage (round-trip de cycle de vie).

Feature: seance-haunted-productivity, Property 9

Property 9: La persistance survit au redémarrage.
Validates: Requirements 4.3

On simule un « redémarrage » de l'application : les esprits sont écrits via une
première connexion (connexion d'écriture), qui est ensuite COMMIT puis FERMÉE.
On ouvre alors une connexion SQLite neuve et indépendante vers le MÊME fichier
de base, et on relit via ``main.list_spirits``. Les données doivent survivre
intactes à ce cycle de vie : même ensemble ``(id, title)``, même cardinalité,
et ordre par ``id`` décroissant.

CRITIQUE : ces tests ne touchent JAMAIS le vrai ``db.sqlite3``. Chaque exemple
Hypothesis crée son propre fichier temporaire ; les connexions sont fermées
dans un ``finally`` avant ``os.remove`` (sous Windows le fichier reste
verrouillé tant qu'une connexion est ouverte).
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
def test_persistence_survives_restart(titles):
    """Property 9 — les données survivent à un redémarrage (round-trip).

    Feature: seance-haunted-productivity, Property 9
    Validates: Requirements 4.3

    Écrit via la connexion #1 (puis COMMIT + CLOSE), relit via une connexion #2
    neuve et indépendante vers le même fichier : l'ensemble ``(id, title)``,
    la cardinalité et l'ordre ``id DESC`` sont préservés.
    """
    path = _create_temp_db()
    try:
        # --- Connexion #1 : écriture, commit, puis fermeture (= « arrêt »). ---
        expected = []  # (id, title) tels qu'écrits avant le redémarrage.
        write_conn = sqlite3.connect(path)
        write_conn.row_factory = sqlite3.Row
        try:
            for title in titles:
                new_id = main.insert_spirit(write_conn, title)
                expected.append((new_id, title))
        finally:
            # Fermeture explicite : simule l'arrêt de l'application et libère
            # le verrou de fichier (indispensable sous Windows).
            write_conn.close()

        # --- Connexion #2 : neuve, indépendante (= « redémarrage »). ---
        read_conn = sqlite3.connect(path)
        read_conn.row_factory = sqlite3.Row
        try:
            spirits = main.list_spirits(read_conn)
        finally:
            read_conn.close()

        read_back = [(s["id"], s["title"]) for s in spirits]

        # (a) La cardinalité est préservée après le redémarrage.
        assert len(read_back) == len(expected)

        # (b) L'ensemble des (id, title) relus correspond exactement à l'écrit.
        assert set(read_back) == set(expected)

        # (c) L'ordre renvoyé est bien par id strictement décroissant.
        read_ids = [rid for rid, _ in read_back]
        assert read_ids == sorted(read_ids, reverse=True)
    finally:
        # Nettoyage du fichier temporaire pour garder les exemples indépendants.
        if os.path.exists(path):
            os.remove(path)
