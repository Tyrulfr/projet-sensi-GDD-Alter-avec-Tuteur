# Validation de l’intégration GovTutor — 15 octobre 2026

## Résultats locaux mesurés

- `./build.sh` : contenus et tutorat validés, zéro erreur et zéro avertissement ; site et deux packages SCORM générés, manifestes XML bien formés et références présentes.
- Tests du moteur de formation dans Chromium : **27/27 réussis**.
- Tests du suivi et de l’adaptation du tuteur dans Chromium : **16/16 réussis**.
- Tests Python du prototype et du service HTTP : **33/33 réussis** (Gymnasium/SB3, PPO, sauvegarde/rechargement, validation des requêtes et contrôle d’origine).
- Parcours réel sans API : réponse erronée, exercice hors note, adaptation, reprise après rechargement, absence du serveur et secours local : réussite.
- Parcours avec serveur Python démarré par le test : rechargement du checkpoint `governance_ppo.zip`, activation explicite, vraie prédiction PPO masquée et secours après panne simulée : réussite.
- Aperçu SCORM sans LMS : avertissement de non-persistance affiché ; test avec API SCORM simulée : suivi du tuteur retrouvé dans `cmi.suspend_data`.
- Compilation Python et Ruff sur le code du tuteur/validateur : réussite.

Le test de taille initial imposait moins de 1 000 caractères pour le parcours complet. Le suivi par objectif porte cet état à environ 1 081 caractères dans le scénario testé. La vérification demande maintenant moins de la moitié des 4 096 caractères disponibles, et un test supplémentaire vérifie les deux modules après une longue séance. Les tentatives et questions répétées ne font pas croître l’historique sans limite.

Les rapports du navigateur sont produits dans `dist/rapport-navigateur.json` ; une copie de la dernière exécution autonome est versionnée dans `docs/resultats-tests-tuteur.json`. La CI reconstruit et teste séparément les modes autonome et PPO, puis conserve le rapport et une capture comme artefacts.

## Reproduction

Voir les commandes d’installation dans le README. Avec les dépendances installées :

```bash
./build.sh
python -m pytest -q tuteur/tests
npm test
npm run test:rl
```

## Limites vérifiées et points non vérifiés

Aucun appel LLM n’est effectué. Aucun apprenant réel, résultat d’efficacité pédagogique, mesure neurologique, déploiement du service Python public ni validation eCampus réelle ne fait partie de cette validation. La nouvelle banque de 16 exercices et ses niveaux doivent être validés pédagogiquement.

Le site publié fonctionne avec les règles. Le mode PPO exige le service local et une activation explicite. Le suivi web reste propre à un navigateur et le suivi SCORM propre à un module. Pas encore de compte apprenant, tableau de bord central, synchronisation inter-appareils ou apprentissage automatique en ligne sur les réponses humaines.

Les résultats historiques de simulation et leurs limites sont conservés dans `tuteur/docs/AUDIT-v0.2.md` ; ils ne constituent pas une mesure de cette formation avec des personnes.
