# Protocole RL et plan d'évaluation

## Question expérimentale

Une politique discrète, apprenant à sélectionner des actions pédagogiques en fonction d'un état estimé, surpasse-t-elle une sélection aléatoire ou une politique à règles en environnement simulé de gouvernance de la donnée ?

## Variables

- **État caché** : 12 maîtrises latentes, profil, vitesse, fragilité de rétention.
- **Observation** : 11 variables normalisées ; croyance bruitée, incertitude, prérequis, taux de réussite, fatigue, historique et type de compétence.
- **Action** : 12 interventions (diagnostic, question, indices, explication, exemple, exercices, retour prérequis, rappel, synthèse).
- **Transition** : gains bornés avec efficacité dépendant du profil et du niveau latent.
- **Reward dense** : 3 × gain latent simulé − coût − pénalités ; **reward terminal** : 1,5 × gain de post-test synthétique + 0,5 × gain au test différé synthétique.
- **Politique** : MaskablePPO, MLP 64/64, gamma 0,97.

## LIMITATIONS IMPORTANTES

1. L'évaluateur et la politique sont tous deux exposés au même moteur de simulation durant l'apprentissage. Une bonne performance peut refléter un *reward hacking* ou un *overfit au simulateur*.
2. Les gains ne représentent pas des résultats humains : pré/post-test artificiels binomiaux ; évaluateur de rétention fictif.
3. La dimension de compétence est codée comme un indice normalisé : elle ne généralise pas aux matières hors distribution.
4. Le mode `lesson` répète deux QCM par notion et ses croyances ne sont pas calibrées. Il s'agit d'une démonstration conversationnelle, pas d'une évaluation valable.
5. La sélection RL n'est pas nécessairement pédagogiquement meilleure qu'une simple règle ; lire les mesures et les intervalles d'incertitude avant d'affirmer quoi que ce soit.
6. Les masques sont des règles prudentes sur les observations ; ils n'utilisent pas la maîtrise latente.

## Déroulé expérimental

- Fixer les versions des bibliothèques, les paramètres et la graine.
- Entraîner sur plusieurs graines indépendantes, conserver toutes les politiques.
- Comparer `random`, `rules`, `rl` avec des graines d'évaluation distinctes (mêmes conditions initiales, stochasticité des actions éventuellement différente).
- Mesurer gain du post-test, gain de rétention et gains de maîtrise simulée, ainsi que coût de l'usage d'indices.
- Répéter les évaluations sur des simulateurs avec règles structurellement différentes, pas uniquement sur les six profils embarqués.
- Une étude réelle nécessitera items indépendants et validation humaine, consentement, cadre de protection des données et contrôle des erreurs du LLM.
