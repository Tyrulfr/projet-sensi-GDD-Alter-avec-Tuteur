# Validation réelle v0.2 — 14 octobre 2026

23 tests réussis, aucun échec. Gymnasium et SB3 validés. Trois entraînements PPO réels (30 208 pas chacun), checkpoints rechargés et évalués sur 120 épisodes par variante. Aucun appel LLM externe, aucun apprenant humain.

Voir [le rapport complet](docs/AUDIT-v0.2.md), les manifestes `models/*.json`, les résultats `results/*.{csv,json}` et les journaux `results/logs/`.

La v0.1 originale n’avait été validée qu’avec un substitut Gymnasium ; ses 8 tests ont maintenant été réexécutés avec les vraies bibliothèques et passent.
