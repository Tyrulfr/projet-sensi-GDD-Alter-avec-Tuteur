"""Validate authored tutor materials independently of the optional Python RL stack."""
import json
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SKILLS = {'strategy', 'roles', 'metadata', 'catalog', 'quality', 'lineage', 'classification',
          'access', 'privacy', 'retention', 'mdm', 'sharing'}


def valider(modules):
    data = json.loads((RACINE / 'contenus' / 'tutorat.json').read_text(encoding='utf-8'))
    objectifs = data['objectifs']
    erreurs = []
    ids = set()
    attendus = {o['id'] for m in modules.values() for o in m['objectifsSpecifiques']}
    if set(objectifs) != attendus:
        erreurs.append('Les objectifs du tuteur doivent correspondre aux objectifs des modules disponibles')
    for m in modules.values():
        locaux = {o['id'] for o in m['objectifsSpecifiques']}
        lecons = {l['id'] for l in m['lecons'] if l['type'] == 'lecon'}
        for oid in locaux:
            b = objectifs.get(oid, {})
            if b.get('lecon') not in lecons or b.get('competenceRL') not in SKILLS:
                erreurs.append(f'{oid}: référence de leçon ou compétence RL invalide')
            if b.get('prerequis') and b['prerequis'] not in locaux - {oid}:
                erreurs.append(f'{oid}: prérequis absent du module ou autoréférence')
            for texte in ('concept', 'indice', 'exemple'):
                if not isinstance(b.get(texte), str) or not b[texte].strip():
                    erreurs.append(f'{oid}: {texte} vide')
            if len(b.get('questions', [])) < 2:
                erreurs.append(f'{oid}: deux exercices minimum sont nécessaires')
            for q in b.get('questions', []):
                if q['id'] in ids or q['id'] in m['activites']:
                    erreurs.append(f'{oid}: identifiant de question dupliqué')
                ids.add(q['id'])
                choix = [c['id'] for c in q['choix']]
                if (q['type'] != 'choix-unique' or len(choix) < 2 or len(set(choix)) != len(choix)
                        or q['reponse'] not in choix or q['objectif'] != oid or q['difficulte'] not in (1, 2)):
                    erreurs.append(f'{oid}: question incohérente')
            vus = set()
            actuel = oid
            while actuel in objectifs:
                if actuel in vus:
                    erreurs.append(f'{oid}: cycle de prérequis')
                    break
                vus.add(actuel)
                actuel = objectifs[actuel].get('prerequis')
    return erreurs
