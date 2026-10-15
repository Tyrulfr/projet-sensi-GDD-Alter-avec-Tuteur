# GovTutor RL — Tuteur expérimental de gouvernance de la donnée

**Un vrai projet Python exécutable** qui entraîne une politique de Reinforcement Learning à choisir une intervention pédagogique. La politique est **séparée du LLM**, qui reste optionnel et n'est jamais entraîné ici.

> **Statut : prototype de recherche.** Les élèves, leurs gains et la rétention sont synthétiques. Aucun résultat n'établit l'efficacité sur des humains. Ne pas employer tel quel pour noter ou profiler des apprenants.

## Ce qui fonctionne

- 12 compétences de gouvernance de la donnée, 24 QCM pédagogiques, avec graphe simple de prérequis.
- 12 interventions pédagogiques discrètes (`TutorAction`).
- Simulateur `Gymnasium` à état latent, observations bruitées, six profils d'apprentissage, masques d'actions.
- Entraînement `MaskablePPO` via `sb3-contrib` ; pas besoin de clé API ou de GPU.
- Évaluation des politiques `random`, `rules` et `rl`, avec export CSV + JSON.
- Session QCM dans un terminal avec exécuteur hors ligne par défaut.
- Adaptateur facultatif pour un endpoint de type OpenAI Chat Completions (appel réseau sur demande uniquement).
- Tests automatiques et `AGENTS.md` destiné à Codex.

## Prérequis

Python **3.10+**. Commandes à partir de la racine du projet :

```bash
python -m venv .venv
# Linux / macOS :
source .venv/bin/activate
# Windows PowerShell : .venv\\Scripts\\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
```

## Démarrage en quatre commandes

```bash
# Voir les notions et prérequis
python -m govtutor_rl.cli skills

# Comparer les baselines sans entraînement
python -m govtutor_rl.cli evaluate --episodes 120

# Entraîner la politique (CPU ; durée dépend de la machine)
python -m govtutor_rl.cli train --steps 30000 --output models/governance_ppo

# Comparer random, rules et policy RL sur de nouvelles graines
python -m govtutor_rl.cli evaluate --checkpoint models/governance_ppo --episodes 120
```

Sorties : `models/governance_ppo.zip`, `models/governance_ppo.json`, `results/benchmark.csv`, `results/benchmark.json`.

## Tester une séance de gouvernance

```bash
# Fonctionne hors ligne avec une politique à règles
python -m govtutor_rl.cli lesson --skill quality

# Ou sélectionner les interventions via la politique entraînée
python -m govtutor_rl.cli lesson --skill privacy --checkpoint models/governance_ppo
```

Le tuteur affiche sa stratégie, une intervention hors ligne, puis un QCM de vérification. Les QCM réutilisés ne constituent pas une mesure indépendante de progression.

## Ajouter un LLM (facultatif, opt-in)

Configurer un service **compatible avec `/chat/completions`** ; le port local est accepté en HTTP, une URL distante doit être en HTTPS.

```bash
export GOVTUTOR_LLM_BASE_URL='http://localhost:8000/v1'
export GOVTUTOR_LLM_MODEL='nom-du-modele-local'
# Optionnel selon le serveur :
export GOVTUTOR_LLM_API_KEY='cle_api'
python -m govtutor_rl.cli lesson --skill catalog --checkpoint models/governance_ppo --llm
```

Sans `--llm`, **aucun texte n'est envoyé au réseau**. En mode `--llm`, le programme n'envoie que la compétence, la stratégie et une requête générique ; il n'envoie pas les réponses de l'élève. Le LLM est un exécuteur non validé : vérifier les sorties avant tout usage pédagogique réel.

## Tests

```bash
pytest -q
```

## Architecture

```
Curriculum -> Student simulator -> belief observation
                                   |
                                   v
                           Policy MaskablePPO
                                   |
                                   v
                     Intervention pédagogique (12 actions)
                                   |
                                   v
                   Exécuteur local ou LLM optionnel
                                   |
                                   v
                     Réponse de l'élève / simulateur
                                   |
                                   v
                   Reward synthétique + nouvelle observation
```

`src/govtutor_rl/env.py` : environnement RL et transitions, `training.py` : entraînement, `evaluation.py` : benchmarks, `executor.py` : exécution linguistique, `interactive.py` : démonstration console, `curriculum.py` : contenu métier. Lire `docs/PROTOCOL.md` pour le protocole, les limites et les pistes de recherche.

## Contenus et références métier

Les notions comprennent gouvernance stratégique, rôles de propriétaire et steward, métadonnées, catalogue, qualité, lignage, classification, accès, protection des données personnelles, conservation, MDM et data products. Il s'agit d'un contenu introductif synthétique, à faire relire par un expert. Pour la partie RGPD, utiliser les ressources officielles CNIL : https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement et https://www.cnil.fr/fr/comment-gerer-vos-donnees .

## Codex

Ce projet peut être ouvert directement dans un workspace Codex après extraction de l'archive ou import GitHub. `AGENTS.md` donne à Codex les commandes de tests et les contraintes d'architecture. Aucun envoi direct à Codex n'est déclenché par ce paquet ; la connexion au workspace est une étape distincte.

## Version 0.2 vérifiée

Voir [le rapport mesuré](docs/AUDIT-v0.2.md) et [les choix d'architecture](docs/ARCHITECTURE-v0.2.md). Les prérequis, erreurs conceptuelles et répétitions influencent maintenant les transitions ; les récompenses sont décomposées et le benchmark exporte des IC bootstrap à 95 % et des différences appariées.

```bash
# Expérience standard et transfert avec espacement / oubli
python -m govtutor_rl.cli evaluate --checkpoint models/governance_ppo --episodes 120
python -m govtutor_rl.cli evaluate --checkpoint models/governance_ppo --episodes 120 --simulator spacing --output results/spacing.csv
```

Le paquet livré contient les checkpoints entraînés, leurs manifestes et les résultats CSV/JSON. `requirements-lock.txt` décrit les versions utilisées sur cette machine ; pour les reproduire dans un environnement Python 3.12 vierge : `python -m pip install -r requirements-lock.txt`, puis `python -m pip install -e .`. L'installation normale `pip install -e '.[dev]'` reste disponible.

L'amélioration de PPO face aux baselines n'est pas acquise : consulter les mesures, y compris celles défavorables au RL. La démonstration terminal est l'interface simple disponible ; elle ne mesure pas un apprentissage humain indépendant.
