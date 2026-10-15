# Accompagnement GovTutor dans la formation

## Où l'apprenant le rencontre

- Sur la page de chaque module disponible : bilan par objectif, historique récent et réglage facultatif de politique.
- Après la correction d'une activité formative : une carte « Ton tuteur », une intervention et une question d'entraînement.
- Après soumission du quiz ou du défi : bilan et entraînement ciblé sur l'objectif observé le plus fragile. Aucune aide nouvelle n'est injectée pendant une évaluation notée.
- Après la réponse à l'exercice du tuteur : correction, mise à jour du suivi, puis bouton pour adapter la suite. Les exercices ne modifient ni le score, ni le statut de réussite, ni le nombre de tentatives du quiz.

La banque propose 16 questions sur les 8 objectifs des modules 1 et 2, avec deux niveaux déclarés. Après une erreur, le tuteur propose un exercice simple ; après une réussite il peut changer de situation ou augmenter le niveau. Les niveaux sont des propositions d'auteur, pas des difficultés mesurées sur des apprenants.

## Suivi et reprise

`moteur.repondre` observe une réponse formative ; `moteur.soumettreEvaluation` observe chaque réponse au moment de la soumission. Les simples affichages de pages et corrections ne comptent pas comme de nouvelles réponses.

L'état `moteur.etat.t` contient pour chaque objectif : nombre d'essais, réussites, suites d'erreurs/réussites, aides recommandées, dernière action et résultat le plus récent par question. L'historique est borné aux 12 derniers événements. Une même réponse répétée peut remplacer son résultat, mais ne crée pas de nouvelle question distincte pour l'estimation.

L'estimation numérique `(questions distinctes réussies + 1) / (questions distinctes observées + 2)` sert uniquement à orienter les interventions. L'interface affiche des libellés prudents, pas un pourcentage de maîtrise validé. La mention de diagnostic signifie qu'une action de diagnostic a été sélectionnée ; elle ne signifie pas qu'une erreur conceptuelle a été identifiée de façon fiable.

Les sauvegardes v1 existantes restent lisibles ; aucune maîtrise n'est inventée rétroactivement à partir d'anciens scores. Le suivi commence avec les nouvelles réponses.

- **Site web :** même `localStorage` que la progression ; un profil par navigateur/origine. Pas de compte, synchronisation, suivi central des apprenants ou tableau de bord formateur.
- **SCORM :** même `cmi.suspend_data` que le module. L'historique est supprimé en priorité si la limite de 4096 caractères est atteinte. Les tests actuels conservent le suivi et une marge sur les deux modules. L'aperçu sans LMS et le mode consultation indiquent que les changements ne seront pas conservés dans la plateforme.
- La réinitialisation du moteur efface aussi le suivi du tuteur. Chaque module SCORM conserve son état séparément ; le tutorat ne partage pas encore ses estimations entre modules.

## Deux modes de décision clairement distincts

### Mode autonome, publié

`src/js/tuteur.js` sélectionne une action avec des règles explicites, à partir des réponses observées. `src/js/tuteur-ui.js` exécute l'action avec les textes de `contenus/tutorat.json`. Aucun réseau ni LLM n'est nécessaire pour cet accompagnement. Il fonctionne sur GitHub Pages et dans les packages SCORM reconstruits.

### Mode PPO optionnel, en local

Lancer le service de la commande du README, puis activer « la politique RL locale » dans le bilan d'un module. Le bouton vérifie la présence d'un modèle chargé via `GET /api/tutor/status`. Les décisions suivantes passent par `POST /api/tutor/recommend`. Sans serveur, ou si une prédiction échoue, l'accompagnement poursuit avec les règles ; le secours est signalé.

Le serveur recharge réellement `MaskablePPO` et utilise `model.predict(..., deterministic=True, action_masks=mask)`. Il reçoit seulement :

```json
{
  "observation": [0.5, 0.7, 1.0, 0.5, 0.0, 0.0, 0.0, 0.1, 0.0, 0.18, 0.0],
  "mask": [true, true, true, true, true, true, true, true, false, false, true, false]
}
```

Les 11 indicateurs reprennent le contrat du prototype : estimation cible, incertitude heuristique, estimation d'un prérequis, réussite moyenne, fatigue (fixée à zéro car non mesurée), indices, erreurs, nombre d'essais normalisé, dernière action, compétence RL rapprochée et diagnostic déjà proposé. Le masque limite les actions à celles applicables. Le serveur vérifie tailles, types, bornes et présence d'une action autorisée.

Le rapprochement `competenceRL` entre objectifs du cours et notions du simulateur est manuel et approximatif. Le tracker humain diffère du simulateur d'entraînement. **Le checkpoint n'est pas validé pédagogiquement sur cette formation.** Son rôle est expérimental ; aucun résultat humain ne justifie sa préférence aux règles.

L'activation dure la session de page et ne déclenche pas de nouvel entraînement. Le LLM reste une extension distincte du prototype Python ; le pont de formation n'en appelle aucun. Aucun message libre, identité ou réponse brute n'est transmis par cette API. Le service écoute uniquement sur `127.0.0.1`, refuse les origines externes et n'est pas destiné à un déploiement public multi-utilisateur.

## Modifier les contenus et reconstruire

`contenus/tutorat.json` associe chaque objectif à une leçon de référence, un éventuel prérequis, un concept, un indice, un exemple et deux questions. Le validateur contrôle les objectifs, références, réponses, niveaux et cycles de prérequis avant la construction.

`./build.sh` inclut ces contenus dans le site et dans chaque package SCORM, avec uniquement les objectifs de son module. Les nouveaux scripts et leur empreinte sont inclus dans les exports. Ne pas éditer directement `index.html`, `contenus/contenu.js` ou les ZIP générés.

## Suite prioritaire

Faire relire les 16 questions et interventions ; préparer une mesure indépendante pré/post-test ; examiner les traces réelles consenties avant de régler ou réentraîner PPO. Ensuite seulement envisager un LLM rédacteur, un service hébergé authentifié, un suivi multi-appareils et un tableau de bord formateur. L'intégration actuelle n'affirme aucune mesure neurologique ni efficacité d'apprentissage humain.
