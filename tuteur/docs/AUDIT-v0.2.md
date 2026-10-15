# Audit et validation GovTutor RL v0.2 — 14 octobre 2026

## Résultat principal

Le programme est installé et exécutable avec les vraies dépendances. Trois checkpoints MaskablePPO ont été entraînés (graines 42, 43, 44 ; chacun 30 208 pas effectifs pour 30 000 demandés). Leur rechargement et leur évaluation fonctionnent. **Ces expériences n'établissent pas une supériorité de PPO sur les baselines. Aucun apprenant humain n'a participé.**

## Audit intégral de l'archive

Lecture des 23 fichiers : README, AGENTS, CODEX_TASK, VALIDATION, pyproject, CI, protocole, exemples, sources et tests. CODEX_TASK est un brief fourni dans l'archive ; la demande de l'utilisateur fixe la mission et les documents servent de contexte. Pas de poids préentraînés dans v0.1.

Problèmes constatés : validation originale limitée à un substitut Gymnasium, entraînement PPO non exécuté, prérequis sans effet limitant sur le gain cible, taux d'erreurs conceptuelles inutilisé, croyances initiales dérivées directement des maîtrises, absence de pénalité de répétition et de récompense explicite de prérequis, RNG d'évaluation partagé avec les interventions, absence d'IC et de variante de transfert, validation LLM insuffisante et contrôle d'URL par préfixe ambigu.

Corrections décrites dans [ARCHITECTURE-v0.2.md](ARCHITECTURE-v0.2.md). L'architecture et les 12 actions sont conservées ; un autre curriculum peut être injecté. Le réseau n'est jamais utilisé pour entraîner ou évaluer.

## Validation technique

- Installation réelle dans `.venv` avec Python 3.12.14 : réussie. Python système 3.9.6 incompatible avec le minimum 3.10 ; utilisation du runtime disponible.
- Archive originale : 8 tests réussis avec les vraies dépendances.
- Version finale : 23 tests réussis, 0 échec (journal `results/logs/pytest.txt`).
- Vérificateurs Gymnasium et Stable-Baselines3 : réussite sur les deux variantes.
- Observations, masques, horizon et actions masquées, reproductibilité, séparation état latent/observations, décomposition des récompenses et sondes indépendantes : tests réussis.
- Entraînement PPO automatisé, sauvegarde puis rechargement : actions identiques avant/après dans le test ; les benchmarks rechargent également les checkpoints réellement entraînés.
- Compilation Python et Ruff : réussite.
- Exécuteur : contrôle local des contrats, tailles de réponses et URL ; aucun test d'un serveur LLM réel effectué.

Les journaux d'entraînement sont conservés dans `results/logs/`. Les versions exactes sont enregistrées dans `requirements-lock.txt` et dans chaque manifeste de modèle.

## Méthode expérimentale

Pour chaque checkpoint : 120 épisodes réservés, graines 1000–1119, horizons de 14 interventions, 12 compétences et 6 profils. Les politiques utilisent les mêmes conditions initiales. La répartition des profils est 24/24/24/24/12/12 ; les moyennes reflètent cette pondération, pas une population réelle. Deux variantes évaluées : standard et espacement/oubli. Les baselines sont répétées à l'identique pour chaque checkpoint : ne pas compter ces répétitions comme de nouveaux échantillons indépendants.

Les IC à 95 % utilisent 2 000 rééchantillonnages bootstrap d'épisodes ; les écarts PPO-baseline sont appariés par scénario. Ils sont conditionnels au checkpoint et au simulateur. Ils ne quantifient pas l'incertitude complète entre entraînements, ni la validité du moteur, et ne corrigent pas les comparaisons multiples. Trois graines sont insuffisantes pour une conclusion robuste générale.

Les tests finaux sont binomiaux synthétiques et distincts des réponses d'entraînement, avec un flux RNG dédié. Ils ne constituent pas une banque d'items indépendante validée. La récompense terminale utilise également ces scores ; changer les graines d'évaluation ne rend pas le modèle cognitif indépendant.

## Résultats mesurés

Les gains ci-dessous sont exprimés en **points de pourcentage de score synthétique**, pas en progression humaine.

### Simulateur standard

| Politique / graine | Gain post-test | Gain différé | Gain maîtrise simulée | Récompense | Indices / épisode |
|---|---:|---:|---:|---:|---:|
| random | 16.15 | 11.35 | 16.67 | 0.6129 | 2.77 |
| rules | 15.26 | 10.78 | 15.90 | 0.4433 | 5.78 |
| PPO 42 | 14.53 | 9.22 | 14.35 | 0.4944 | 0.00 |
| PPO 43 | 13.54 | 10.73 | 12.67 | 0.3669 | 0.00 |
| PPO 44 | 15.36 | 9.64 | 15.50 | 0.4584 | 0.00 |

### Simulateur espacement/oubli

| Politique / graine | Gain post-test | Gain différé | Gain maîtrise simulée | Récompense | Indices / épisode |
|---|---:|---:|---:|---:|---:|
| random | 15.36 | 10.89 | 16.00 | 0.5785 | 2.77 |
| rules | 10.10 | 4.79 | 9.62 | 0.1463 | 5.85 |
| PPO 42 | 8.75 | 2.66 | 7.95 | 0.1828 | 0.00 |
| PPO 43 | 7.60 | 5.63 | 7.36 | 0.0932 | 0.00 |
| PPO 44 | 9.69 | 4.17 | 9.27 | 0.1590 | 0.00 |

### Différences appariées — PPO graine 42, simulateur standard

- Post-test PPO − random : -1.61 points ; IC95 [-2.76 ; -0.52].
- Post-test PPO − rules : -0.73 points ; IC95 [-1.41 ; -0.05].

Le gain post-test de PPO reste inférieur à l'aléatoire pour les trois graines. La graine 44 est proche des règles ; son IC de différence inclut zéro. Aucun checkpoint ne démontre ici une amélioration fiable des apprentissages simulés par rapport aux deux références. La dégradation sur espacement/oubli montre une sensibilité aux hypothèses du moteur. Les politiques PPO n'utilisent aucun indice dans ces évaluations : les coûts d'aide et le compromis avec la progression méritent une étude d'ablation. Une récompense supérieure aux règles ne signifie donc pas forcément une progression supérieure.

Les distributions complètes par épisode et IC sont dans les six paires CSV/JSON sous `results/`. Leurs bornes ne sont pas tronquées pour masquer les gains négatifs. Les minimums, maximums, moyennes et écarts types de récompense sont exportés dans `results/reward-distributions.json`. Le benchmark de la graine 42 est identique après un second entraînement indépendant avec la même graine sur cette machine.

## Limites scientifiques et techniques

1. Coefficients cognitifs heuristiques non calibrés, sondes binomiales sans items validés, et rétention fictive. L'erreur conceptuelle est un indicateur binaire simplifié ; le diagnostic n'identifie pas une typologie d'erreurs.
2. Le RL ne voit pas le texte de l'intervention. Les effets attribués aux actions ne prouvent pas que les phrases de l'exécuteur produisent ces effets.
3. Le filtre de croyance et l'incertitude sont des approximations ; la fatigue est une variable synthétique supposée observable. Pas de modèle de réponse libre ni de politique récurrente.
4. La variante de transfert partage beaucoup de code avec le simulateur standard. Pas de validation indépendante, ni de comparaison avec un LLM autonome : aucun service LLM n'a été appelé.
5. Une séance interactive répète seulement deux QCM par compétence. Le contenu, notamment réglementaire, n'a pas été validé par un expert pendant cette mission. La banque d'items indépendante reste à construire.
6. Injection d'un curriculum possible, mais CLI et évaluation métier restent orientés gouvernance ; l'indice de compétence nécessite un réentraînement si le curriculum change.
7. Contrôles LLM mécaniques seulement ; aucun validateur sémantique garantissant le respect de l'action, la véracité ou l'absence de réponse divulguée.
8. Reproductibilité démontrée sur cette machine et ces versions ; le déterminisme n'est pas garanti entre systèmes, versions Torch et matériels.

## Prochaines améliorations priorisées

1. **P0 — Mesure indépendante :** construire et faire valider des items pré/post/différés séparés des exercices et de la récompense ; réserver un ensemble de scénarios qui ne sert pas au réglage des hyperparamètres.
2. **P0 — Objectif et baselines :** tracer la distribution des actions, ablater les coûts d'aide/répétition et les bonus de diagnostic ; améliorer les règles de référence avant de chercher une victoire PPO. Augmenter les graines et stratifier les résultats par profil/compétence.
3. **P1 — Modèle cognitif :** confronter plusieurs moteurs structurellement indépendants et calibrer ensuite sur des données consenties ; estimer la fatigue, les prérequis et les erreurs à partir de réponses observables.
4. **P1 — Mémoire :** comparer croyances bayésiennes et politique récurrente, puis entraînement sur une distribution de simulateurs et généralisation vers des domaines réservés.
5. **P1 — Exécuteur :** contrat JSON d'intervention avec validateur sémantique, sources approuvées, tests de conformité et erreurs de réseau ; évaluer un LLM local autonome comme baseline explicitement distincte.
6. **P2 — Usage humain :** enrichir les cas pratiques, créer une interface avec suivi transparent des stratégies, puis conduire un pilote supervisé avec protocole et mesure indépendante. Aucune prétention d'efficacité humaine avant cette étape.

## Reproduction

Depuis la racine du projet, créer un environnement Python 3.12 et installer les dépendances. Utiliser le lock pour reproduire les versions, puis installer le paquet local :

```bash
python -m pip install -r requirements-lock.txt
python -m pip install -e .
python -m pytest -q
python -m govtutor_rl.cli train --steps 30000 --seed 42 --output models/governance_ppo
python -m govtutor_rl.cli evaluate --checkpoint models/governance_ppo --episodes 120 --seed 1000
python -m govtutor_rl.cli evaluate --checkpoint models/governance_ppo --episodes 120 --seed 1000 --simulator spacing --output results/spacing.csv
```

Répéter avec `--seed 43` et `--seed 44` et des chemins distincts. Le modèle sauvegardé inclut les poids ; le manifeste précise les versions, actions, curriculum et pas effectifs. Aucune clé API n'est nécessaire.
