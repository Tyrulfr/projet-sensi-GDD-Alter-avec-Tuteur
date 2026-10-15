# Instructions pour Codex

Ce dépôt contient une preuve de concept **entièrement synthétique** d'un tuteur en gouvernance de la donnée piloté par une politique PPO externe au LLM.

## Commandes de vérification

```bash
python -m pip install -e '.[dev]'
pytest -q
python -m govtutor_rl.cli skills
python -m govtutor_rl.cli evaluate --episodes 24
python -m govtutor_rl.cli train --steps 3000 --output models/smoke
python -m govtutor_rl.cli evaluate --checkpoint models/smoke --episodes 24
```

## Contrats d'architecture

- Ne jamais fournir à la politique les maîtrises latentes du simulateur. La politique reçoit uniquement `env._obs()`.
- Le choix de l'action appartient à la politique (`actions.py`), pas au LLM (`executor.py`).
- Toute nouvelle action doit être ajoutée à `TutorAction`, aux masques, transitions, prompts et tests.
- Préserver l'exécution **sans LLM et sans réseau**, par défaut.
- Pour un fournisseur LLM, expliciter la transmission des données avant l'activation ; ne pas envoyer de données d'élèves réels dans un déploiement non conforme.
- Ne jamais présenter les scores synthétiques comme de la preuve d'apprentissage humain.
- Garder les scénarios d'évaluation et les graines reproductibles ; ne pas utiliser les mêmes questions de QCM répétés comme validation indépendante.
- Pour les contenus RGPD, suivre la CNIL et distinguer les obligations légales des bonnes pratiques métier.

## Travaux pour la prochaine version

1. Ajouter des modèles d'élèves structurellement différents (et pas seulement des paramètres de même moteur).
2. Ajouter une banque d'items d'évaluation indépendants par compétence, validée par des experts.
3. Calibrer un modèle de transition à partir de données consenties et pseudonymisées ; évaluer les risques.
4. Concevoir un tableau de bord d'expérimentation et tracer les choix d'action sans divulguer de données personnelles.
5. Intégrer un validateur de réponse LLM fondé sur des documents métier approuvés.
6. Effectuer une étude pilote sous supervision avant toute prétention d'efficacité pédagogique.
