# Architecture v0.2

## Circuit pédagogique

`reset/step -> observation (11 valeurs) -> Policy.act(observation, mask, rng) -> TutorAction -> exécuteur hors ligne ou LLM`. Les transitions de l'élève simulé remplacent la réponse humaine durant l'entraînement. Le texte généré n'influence pas ces transitions : PPO apprend les effets heuristiques des catégories d'interventions, pas la qualité d'un texte réel.

L'environnement est une approximation de POMDP par un vecteur de croyances et des résumés d'historique. Le MLP n'est pas récurrent et le filtre de croyances n'est pas un estimateur bayésien calibré. Les maîtrises, erreurs conceptuelles et profils restent dans le simulateur. Les croyances initiales proviennent de sondes binomiales observées ; les mises à jour utilisent les réponses simulées. Modifier les états latents après reset ne modifie ni les observations ni les masques sans nouvelle réponse.

## Transitions

Les gains dépendent du niveau, des affinités du profil, de la fatigue, des prérequis, des erreurs conceptuelles et des répétitions. Diagnostiquer puis expliquer peut résoudre une erreur conceptuelle. Réviser un prérequis améliore sa maîtrise et produit une réponse observable. Rappel et synthèse réduisent la fragilité. La variante `spacing` ajoute un effet de délai entre interventions et un oubli susceptible de produire une progression négative. Elle partage toutefois une grande partie du moteur standard : ce n'est pas une validation externe.

## Récompense

Chaque transition expose `info['reward_components']` : gain cible × 3, gain moyen de prérequis × 1,5, diagnostic utile × 0,025, consolidation × 0,2, coût −0,012, aide forte −0,02 et aide excessive −0,01, répétitions −0,015, inadéquation −0,012 et action masquée −0,2. À l'horizon s'ajoute 1,5 × gain de post-test + 0,5 × gain différé. Ces coefficients sont des hypothèses de simulation.

Les pré/post-tests sont des tirages binomiaux de 16 réponses, distincts des réponses pédagogiques et sans banque d'items réelle. Un flux RNG séparé empêche les actions de consommer le bruit d'évaluation. Ils restent dépendants du même modèle latent et les scores terminaux servent aussi à la récompense : leurs bonnes performances ne suffisent pas à valider le tuteur. L'évaluation utilise des scénarios réservés (graines 1000–1119), distincts de l'entraînement.

## Gymnasium et PPO

12 actions discrètes, observations float32 bornées entre 0 et 1 ; les masques ne lisent pas les maîtrises cachées. Un horizon de séance produit `truncated=True`, jamais une terminaison par maîtrise. `step` après l'horizon lève une exception. Les vérificateurs officiels Gymnasium et SB3 sont exécutés en tests. PPO utilise le masque à l'entraînement et à la prédiction. L'entraînement CPU utilise un thread Torch, un MLP 64/64 et des rollouts de 256 pas : 30 000 pas demandés produisent 30 208 pas effectifs.

## Autres disciplines

`GovernanceTutorEnv(curriculum=tuple_de_Skill)` permet d'injecter les notions et prérequis sans réécrire les transitions ou la politique. Le constructeur valide les clés et références. Le CLI, le benchmark et la séance humaine ciblent encore le curriculum gouvernance par défaut. L'identifiant normalisé de compétence impose de réentraîner la politique quand l'ordre ou le domaine change ; ce n'est pas encore une représentation universelle des matières.

## Interface linguistique

L'interface prend une `Skill`, un `TutorAction` et un message. `ACTION_INTENTS` définit le contrat ; `build_messages` impose l'action sélectionnée. Le LLM ne choisit aucune stratégie, n'est pas entraîné et n'est pas appelé par PPO. `lesson --llm` est l'activation explicite ; le CLI envoie un message générique, pas les réponses de l'élève. L'URL est analysée pour autoriser HTTP uniquement vers un hôte local exact ; les secrets viennent de variables d'environnement.

Le validateur rejette les sorties vides, non textuelles, de plus de 120 mots et les nombres de questions incorrects pour trois actions. Ces contrôles mécaniques ne garantissent ni exactitude métier, ni respect sémantique de la stratégie, ni absence de divulgation d'une réponse. La séance utilise le secours local en cas d'erreur. Aucun appel LLM distant n'a été effectué pendant la validation.
