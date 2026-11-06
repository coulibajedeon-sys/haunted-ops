"""Test de propriété — frontière de 200 caractères.

Feature: seance-haunted-productivity, Property 3

**Property 3 : La limite de 200 caractères est respectée à la frontière.**
**Validates: Requirements 1.5**

La règle porte sur la longueur du titre *normalisé* (après ``strip``). Pour un
titre non vide de longueur normalisée ``L`` :
  - ``L <= 200``  => accepté (``is_valid`` True, ``error_kind`` None) ;
  - ``L  > 200``  => rejeté avec ``error_kind == "too_long"``.

On génère un cœur de caractères non-blancs (lettres) afin que ``strip`` ne les
retire pas : la longueur générée est donc exactement la longueur normalisée.
On balaie une plage de longueurs qui encadre la frontière, et on couvre
explicitement 199, 200 et 201 via ``@example``. On ajoute aussi des espaces
autour pour confirmer que la limite s'applique bien à la longueur normalisée
et non à la longueur brute.
"""

from hypothesis import example, given, settings
from hypothesis import strategies as st

import main

MAX = main.MAX_TITLE_LENGTH  # 200


# Caractères qui survivent à strip() : des lettres (jamais retirées par strip).
_core_char = st.characters(whitelist_categories=("Lu", "Ll"))

# Longueurs encadrant la frontière de 200 (de 1 à 210 inclus).
_lengths = st.integers(min_value=1, max_value=MAX + 10)


@st.composite
def _core_and_padding(draw):
    """Génère (core, pad_left, pad_right).

    ``core`` est une chaîne non-blanche de longueur voulue (balayant la
    frontière). ``pad_left``/``pad_right`` sont des espaces optionnels qui,
    une fois ajoutés autour, doivent être retirés par ``strip`` sans changer
    la longueur normalisée.
    """
    length = draw(_lengths)
    core = draw(st.text(alphabet=_core_char, min_size=length, max_size=length))
    pad_left = draw(st.sampled_from(["", " ", "  ", "\t", " \n "]))
    pad_right = draw(st.sampled_from(["", " ", "  ", "\t", " \n "]))
    return core, pad_left, pad_right


def _assert_boundary(core, pad_left, pad_right):
    raw = pad_left + core + pad_right
    is_valid, cleaned, error_kind = main.normalize_and_validate(raw)

    # Les espaces de bord n'affectent pas la longueur normalisée.
    assert cleaned == core
    normalized_len = len(cleaned)

    if normalized_len <= MAX:
        assert is_valid is True
        assert error_kind is None
    else:
        assert is_valid is False
        assert error_kind == "too_long"


@settings(max_examples=200)
@given(data=_core_and_padding())
# Couverture explicite des longueurs frontières, sans et avec espaces de bord.
@example(data=("A" * (MAX - 1), "", ""))   # 199 -> valide
@example(data=("A" * MAX, "", ""))          # 200 -> valide (frontière incluse)
@example(data=("A" * (MAX + 1), "", ""))    # 201 -> too_long
@example(data=("A" * MAX, "   ", "   "))    # 200 normalisés + espaces -> valide
@example(data=("A" * (MAX + 1), " ", " "))  # 201 normalisés + espaces -> too_long
def test_property_200_char_boundary(data):
    core, pad_left, pad_right = data
    _assert_boundary(core, pad_left, pad_right)
