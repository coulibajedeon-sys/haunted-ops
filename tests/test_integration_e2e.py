"""Tests d'intégration de bout en bout (tâche 9.2).

Couvre, au travers de requêtes HTTP réelles via ``TestClient`` :
- Req 2.3 / 3.3 / 6.1 : cycle complet summon → listing (ordre id DESC) →
  banish, message « quiet » sur liste vide, et présence/non-masquage de la
  mascotte dans la page rendue côté serveur.

CRITIQUE — ISOLATION DE LA BASE : chaque test s'exécute contre une base
SQLite temporaire (fixture ``tmp_path``). La fixture ``client`` redirige
``main.DB_PATH`` vers ce fichier, réinitialise le schéma via ``main.init_db()``
(ce qui repasse ``main.DB_READY`` à True sur la base temporaire), fournit un
``TestClient`` lié à ``main.app``, puis restaure ``DB_PATH`` et ``DB_READY``.
La vraie base ``db.sqlite3`` n'est JAMAIS touchée.
"""

import re

import pytest
from fastapi.testclient import TestClient

import main

# Message « quiet » exact tel qu'il figure dans #mascot-msg du template :
# l'ellipse est le caractère Unicode U+2026 (« … »), pas trois points ASCII.
QUIET_MSG = "The house is quiet\u2026 for now."

# Regex de capture des identifiants depuis les <li data-id="N"> rendus.
_DATA_ID_RE = re.compile(r'<li\s+data-id="(\d+)"')


def _ids_in_order(html: str) -> list[int]:
    """Renvoie les identifiants des <li data-id="N"> dans l'ordre d'apparition."""
    return [int(m) for m in _DATA_ID_RE.findall(html)]


def _mascot_msg(html: str) -> str:
    """Extrait le contenu textuel de #mascot-msg de la page rendue."""
    m = re.search(r'id="mascot-msg"[^>]*>(.*?)</p>', html, re.DOTALL)
    return m.group(1).strip() if m else ""


@pytest.fixture
def client(tmp_path, monkeypatch):
    """TestClient lié à une base temporaire isolée.

    Redirige ``main.DB_PATH`` vers un fichier SQLite jetable, initialise le
    schéma (``DB_READY`` → True sur la base temporaire), fournit le client,
    puis restaure l'état module. La vraie ``db.sqlite3`` reste intacte.
    """
    db_file = tmp_path / "e2e_db.sqlite3"
    original_ready = main.DB_READY
    monkeypatch.setattr(main, "DB_PATH", str(db_file))
    main.init_db()
    try:
        with TestClient(main.app) as test_client:
            yield test_client
    finally:
        # DB_PATH est restauré par monkeypatch ; on restaure le drapeau.
        main.DB_READY = original_ready


def _summon(client, title: str):
    """Invoque un esprit sans suivre la redirection (pour vérifier le 303)."""
    return client.post("/summon", data={"title": title}, follow_redirects=False)


# ---------------------------------------------------------------------------
# 1. Cycle complet : liste vide → summon x2 (ordre id DESC) → banish
#    Req 2.3, 3.3, 6.1
# ---------------------------------------------------------------------------


def test_full_cycle_summon_list_order_then_banish(client):
    # --- État initial : la maison est vide et calme (Req 2.3) ---
    resp = client.get("/")
    assert resp.status_code == 200
    html = resp.text
    assert _ids_in_order(html) == []
    assert QUIET_MSG in _mascot_msg(html)

    # --- Invocation de deux esprits valides (Req 1.2/1.3 → support 3.3) ---
    r1 = _summon(client, "Spectre Alpha")
    assert r1.status_code == 303
    assert r1.headers["location"] == "/"
    r2 = _summon(client, "Spectre Beta")
    assert r2.status_code == 303

    # --- Listing : les deux titres présents, ordre id DESC (plus récent en tête) ---
    html = client.get("/").text
    assert "Spectre Alpha" in html
    assert "Spectre Beta" in html
    ids = _ids_in_order(html)
    assert len(ids) == 2
    # Ordre décroissant : le plus récemment invoqué (id le plus grand) d'abord.
    assert ids == sorted(ids, reverse=True)
    # Beta a été invoqué en dernier → id le plus grand → apparaît avant Alpha.
    pos_beta = html.index("Spectre Beta")
    pos_alpha = html.index("Spectre Alpha")
    assert pos_beta < pos_alpha

    # --- Bannissement du plus récent (premier <li>, id le plus grand) ---
    banished_id = ids[0]
    remaining_id = ids[1]
    banish_resp = client.post(f"/banish/{banished_id}")
    assert banish_resp.status_code == 200
    assert banish_resp.json() == {"ok": True}

    # --- Re-listing serveur : l'esprit banni a disparu, l'autre demeure (Req 3.3) ---
    html = client.get("/").text
    remaining_ids = _ids_in_order(html)
    assert banished_id not in remaining_ids
    assert remaining_id in remaining_ids
    assert "Spectre Beta" not in html
    assert "Spectre Alpha" in html


# ---------------------------------------------------------------------------
# 2. Message « quiet » sur liste vide et retour au calme après dernier banish
#    Req 2.3 / 3.6 / 6.4
# ---------------------------------------------------------------------------


def test_quiet_message_on_empty_and_after_last_banish(client):
    # Base vide → message calme exact (ellipse U+2026) dans #mascot-msg.
    html = client.get("/").text
    assert QUIET_MSG in _mascot_msg(html)

    # Invoquer un unique esprit puis vérifier qu'on n'est plus à l'état calme.
    assert _summon(client, "Lone Wraith").status_code == 303
    html = client.get("/").text
    ids = _ids_in_order(html)
    assert len(ids) == 1
    assert QUIET_MSG not in _mascot_msg(html)

    # Bannir le dernier esprit → la page serveur revient à l'état calme (Req 3.6/6.4).
    banish_resp = client.post(f"/banish/{ids[0]}")
    assert banish_resp.status_code == 200
    assert banish_resp.json() == {"ok": True}

    html = client.get("/").text
    assert _ids_in_order(html) == []
    assert QUIET_MSG in _mascot_msg(html)


# ---------------------------------------------------------------------------
# 3. Présence de la mascotte et non-masquage via CSS
#    Req 6.1
# ---------------------------------------------------------------------------


def test_mascot_present_and_not_hidden_by_css(client):
    html = client.get("/").text

    # Conteneurs présents dans le DOM rendu.
    assert 'id="mascot"' in html
    assert 'id="mascot-msg"' in html

    # Références aux scripts client servis depuis /static.
    assert "/static/ghost.js" in html
    assert "/static/banish.js" in html

    # Le <style> inline ne doit pas masquer #mascot / #mascot-msg.
    # On isole le bloc de style puis on vérifie qu'aucune règle ne pose
    # display:none / visibility:hidden / opacity:0 sur ces sélecteurs.
    style_match = re.search(r"<style>(.*?)</style>", html, re.DOTALL)
    assert style_match, "Le bloc <style> inline est attendu dans la page."
    style = style_match.group(1)

    # Capture des blocs de règles ciblant #mascot ou #mascot-msg.
    mascot_rule_bodies = re.findall(
        r"#mascot(?:-msg)?\b[^{]*\{([^}]*)\}", style
    )
    assert mascot_rule_bodies, "Au moins une règle CSS cible #mascot/#mascot-msg."

    hidden_pattern = re.compile(
        r"display\s*:\s*none"
        r"|visibility\s*:\s*hidden"
        r"|opacity\s*:\s*0(?![.0-9])",
        re.IGNORECASE,
    )
    for body in mascot_rule_bodies:
        assert not hidden_pattern.search(body), (
            "Une règle CSS masque la mascotte, ce qui viole Req 6.1 : " + body
        )
