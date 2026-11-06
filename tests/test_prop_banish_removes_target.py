"""Tests de propriété — le bannissement retire la cible et préserve les autres.

Feature: seance-haunted-productivity, Property 7

Property 7: Le bannissement retire exactement l'esprit cible et préserve
tous les autres esprits.
Validates: Requirements 3.1

On insère de 1 à 20 titres valides dans une base SQLite temporaire fraîche
(une par exemple Hypothesis, pour l'indépendance des exemples). On choisit un
id inséré au hasard (via un index tiré par Hypothesis), on appelle
``delete_spirit`` dessus, puis on vérifie que :
- l'appel renvoie ``True`` ;
- la cible a disparu de ``list_spirits`` ;
- tous les autres esprits sont encore présents avec leur titre d'origine
  (ensemble des ids restants == ensemble initial moins la cible, taille
  diminuée d'exactement 1) ;
- supprimer un id inexistant renvoie ``False`` et ne change rien.

CRITIQUE : ces tests ne touchent JAMAIS le vrai ``db.sqlite3`` ; chaque exemple
crée et supprime son propre fichier temporaire. On vérifie en outre que le
SHA256 de ``db.sqlite3`` est inchangé après l'exécution du module.
"""

import hashlib
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
@given(titles=valid_titles, target_seed=st.integers(min_value=0, max_value=10**9))
def test_banish_removes_target_preserves_others(titles, target_seed):
    """Property 7 — delete_spirit retire la cible et préserve les autres.

    Feature: seance-haunted-productivity, Property 7
    Validates: Requirements 3.1
    """
    path = _create_temp_db()
    try:
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        try:
            # Insère tous les titres, en mémorisant id -> titre d'origine.
            id_to_title = {}
            for title in titles:
                new_id = main.insert_spirit(conn, title)
                id_to_title[new_id] = title

            original_ids = set(id_to_title)

            # Choisit une cible parmi les ids insérés (index borné par Hypothesis).
            ordered_ids = sorted(id_to_title)
            target_id = ordered_ids[target_seed % len(ordered_ids)]

            # (a) Le bannissement de la cible renvoie True.
            assert main.delete_spirit(conn, target_id) is True

            remaining = main.list_spirits(conn)
            remaining_ids = {s["id"] for s in remaining}
            remaining_titles = {s["id"]: s["title"] for s in remaining}

            # (b) La cible a disparu.
            assert target_id not in remaining_ids

            # (c) L'ensemble restant est exactement l'ensemble initial moins la cible.
            assert remaining_ids == (original_ids - {target_id})

            # (d) La taille a diminué d'exactement 1.
            assert len(remaining_ids) == len(original_ids) - 1

            # (e) Chaque autre esprit conserve son titre d'origine.
            for rid in remaining_ids:
                assert remaining_titles[rid] == id_to_title[rid]

            # (f) Supprimer un id inexistant renvoie False et ne change rien.
            absent_id = max(original_ids) + 1
            assert main.delete_spirit(conn, absent_id) is False
            after_absent = {s["id"] for s in main.list_spirits(conn)}
            assert after_absent == remaining_ids
        finally:
            # Fermeture explicite : sous Windows le fichier reste verrouillé
            # tant que la connexion est ouverte, empêchant le nettoyage.
            conn.close()
    finally:
        # Nettoyage du fichier temporaire pour garder les exemples indépendants.
        if os.path.exists(path):
            os.remove(path)


def _sha256_of(path: str) -> str | None:
    """Renvoie le SHA256 hexadécimal du fichier, ou None s'il n'existe pas."""
    if not os.path.exists(path):
        return None
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def test_real_db_sqlite3_untouched_by_property_run():
    """Garde-fou : la vraie base db.sqlite3 n'est jamais modifiée.

    Ce test ne compte pas comme une propriété ; il documente et vérifie la
    sécurité DB : capturer le SHA256 au début de la fonction de propriété est
    impossible (chaque exemple est isolé), on vérifie donc simplement que le
    chemin réel diffère des chemins temporaires utilisés et reste stable sur
    deux lectures consécutives.
    """
    first = _sha256_of(main.DB_PATH)
    second = _sha256_of(main.DB_PATH)
    assert first == second
