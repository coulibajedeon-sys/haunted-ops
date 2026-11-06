"""Test de propriété — rejet des titres composés uniquement d'espaces.

Feature: seance-haunted-productivity, Property 2
Validates: Requirements 1.4

Property 2 : tout titre composé uniquement de caractères d'espacement (y
compris la chaîne vide) est REJETÉ par ``main.normalize_and_validate`` avec
``is_valid is False`` et ``error_kind == "empty"``.
"""

from hypothesis import example, given, settings
from hypothesis import strategies as st

import main

# Jeu de caractères d'espacement candidats : espaces/tabulations/retours ASCII
# plus une sélection d'espaces Unicode (NBSP, espaces U+2000–U+200A, séparateurs
# de ligne/paragraphe, espace idéographique).
_CANDIDATE_WHITESPACE = [
    " ",       # ESPACE
    "\t",      # TABULATION
    "\n",      # NOUVELLE LIGNE
    "\r",      # RETOUR CHARIOT
    "\x0b",    # TABULATION VERTICALE
    "\x0c",    # SAUT DE PAGE
    "\xa0",    # NO-BREAK SPACE (U+00A0)
    "\u2000", "\u2001", "\u2002", "\u2003", "\u2004",
    "\u2005", "\u2006", "\u2007", "\u2008", "\u2009", "\u200a",
    "\u2028",  # LINE SEPARATOR
    "\u2029",  # PARAGRAPH SEPARATOR
    "\u3000",  # IDEOGRAPHIC SPACE
]

# ``str.strip()`` ne retire que les caractères qu'il considère comme de
# l'espacement. On conserve uniquement ceux effectivement retirés par strip()
# afin que la propriété (rejet via normalisation à vide) soit garantie ; les
# caractères non retirés (p. ex. certains dépendent de la version de Python)
# sont exclus du générateur.
WHITESPACE_CHARS = [c for c in _CANDIDATE_WHITESPACE if c.strip() == ""]

# Stratégie : joindre 0..N caractères d'espacement (longueur 0 → chaîne vide).
whitespace_only = st.lists(
    st.sampled_from(WHITESPACE_CHARS), min_size=0, max_size=12
).map("".join)


@settings(max_examples=200)
@given(raw=whitespace_only)
@example(raw="")
@example(raw="   ")
@example(raw="\t\n\r \x0b\x0c")
@example(raw="\xa0\u2003\u3000")
def test_whitespace_only_titles_are_rejected(raw):
    """Un titre vide ou uniquement composé d'espaces est rejeté (Req 1.4)."""
    is_valid, cleaned, error_kind = main.normalize_and_validate(raw)
    assert is_valid is False
    assert error_kind == "empty"
    # Après strip, le titre normalisé doit être vide.
    assert cleaned == ""
