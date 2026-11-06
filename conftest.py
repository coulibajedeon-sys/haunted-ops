import os
import sys

# Assure que `import main` fonctionne quel que soit le répertoire courant de
# pytest : on ajoute la racine du projet (dossier contenant ce conftest) au
# début de sys.path. Création sûre pour exécution concurrente.
_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
