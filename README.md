# La donnée, une affaire collective

Formation de sensibilisation à la gouvernance de la donnée — Université Paris-Saclay.

Une **source unique** de contenus pédagogiques produit deux diffusions :

- **un site web** (essais, démonstrations, validation pédagogique), avec une progression enregistrée dans le navigateur ;
- **un package SCORM 1.2 par module**, autonome, à importer dans un LMS (Moodle / eCampus).

> État : prototype. Les **modules 1 et 2** sont complets ; les modules 3 à 7 sont déclarés « en préparation ».
> Les contenus sont une **proposition à valider**. La compatibilité eCampus **n'est pas encore vérifiée** (voir `docs/rapport-tests.md`).

## Tuteur adaptatif intégré

Les modules 1 et 2 proposent un accompagnement **après les activités corrigées et après le quiz/défi**. Le tuteur suit les réponses par objectif, propose des indices, rappels et exercices supplémentaires adaptés, et conserve son suivi entre les séances dans le même navigateur ou dans la sauvegarde SCORM du module.

Le mode publié sur GitHub Pages utilise des **règles pédagogiques locales**, sans LLM, sans clé API et sans serveur. Les exercices d'accompagnement ne changent pas les notes. L'estimation des acquis reste indicative ; les contenus ajoutés sont à faire valider pédagogiquement.

Le dépôt inclut aussi GovTutor RL v0.2, ses trois checkpoints PPO et ses résultats synthétiques sous `tuteur/`. **Le checkpoint PPO peut réellement piloter l'accompagnement en local**, avec un service Python optionnel ; GitHub Pages ne peut pas héberger ce service. Le modèle n'apprend pas en ligne à partir des réponses humaines.

Voir [le guide d'utilisation et d'intégration](docs/tuteur.md), [le rapport de validation](docs/validation-tuteur.md) et [l'audit scientifique du prototype RL](tuteur/docs/AUDIT-v0.2.md).

## Prérequis

Uniquement Python 3 (déjà présent sur macOS) et un navigateur. Aucune dépendance à installer.

## Commandes

| Commande | Effet |
|---|---|
| `./build.sh` | Valide les contenus, puis génère `index.html` + `contenus/contenu.js` (site web), `exports/module-XX-<titre>-scorm12.zip` (packages SCORM) et, pour les tests locaux, `dist/scorm/` et `dist/simulateur/` |
| `./serve.sh` | Sert le projet sur `http://localhost:8000` (site, simulateur SCORM, tests) |
| `python3 scripts/valider_contenus.py` | Valide uniquement les contenus |

Après `./serve.sh` :

- site web : <http://localhost:8000/>
- simulateur SCORM 1.2 : <http://localhost:8000/dist/simulateur/>
- tests unitaires : <http://localhost:8000/tests/>

## Publication sur GitHub

Pour publier cette copie, configurer GitHub Pages **depuis la branche `main`** (réglage : Settings → Pages → Deploy from a branch → `main` / racine). La page `index.html` à la racine du dépôt est l'accueil de la formation : elle présente les modules et permet de les suivre.

Les fichiers générés publiés (`index.html`, `contenus/contenu.js`, `exports/*.zip`) sont donc versionnés. **Après toute modification des contenus ou du code : lancer `./build.sh`, puis committer.** Le workflow `.github/workflows/publier.yml` vérifie à chaque `push` que les contenus sont valides et que ces fichiers sont bien à jour ; sinon, l'exécution échoue avec un message explicite.

Adresses prévues une fois GitHub Pages activé pour cette copie :

- formation : <https://tyrulfr.github.io/projet-sensi-GDD-Alter-avec-Tuteur/>
- tests unitaires : <https://tyrulfr.github.io/projet-sensi-GDD-Alter-avec-Tuteur/tests/>
- packages SCORM (aussi accessibles depuis la page Parcours) :
  - module 1 : <https://tyrulfr.github.io/projet-sensi-GDD-Alter-avec-Tuteur/exports/module-01-la-donnee-dans-mon-quotidien-scorm12.zip>
  - module 2 : <https://tyrulfr.github.io/projet-sensi-GDD-Alter-avec-Tuteur/exports/module-02-une-donnee-plusieurs-usages-scorm12.zip>

Le simulateur SCORM n'est disponible qu'en local (`./serve.sh`).

## Organisation

```text
index.html                accueil de la formation (GÉNÉRÉ par ./build.sh)
contenus/                 SOURCE PÉDAGOGIQUE UNIQUE (à modifier pour faire évoluer la formation)
  catalogue.json          formation, objectifs, liste des 7 modules
  modules/module-01.json  leçons, blocs, activités, quiz, synthèse du module 1
  modules/module-02.json  idem pour le module 2 (schéma de circulation, chronologie, défi final)
  contenu.js              version compilée des contenus (GÉNÉRÉ)
exports/                  packages SCORM 1.2, un ZIP par module (GÉNÉRÉ)
src/
  index.html              gabarit commun site / SCORM
  js/util.js              utilitaires (formats SCORM, texte enrichi)
  js/activites.js         correction des activités (indépendante de l'affichage)
  js/moteur.js            moteur de parcours : progression, notation, statut, sauvegarde
  js/suivi-local.js       adaptateur de suivi « navigateur » (site web)
  js/suivi-scorm12.js     adaptateur de suivi SCORM 1.2 (LMS)
  js/composants.js        composants d'affichage (blocs, activités, feedback)
  js/app.js               pages et navigation
  css/theme.css           thème configurable (couleurs, police)
  css/main.css            mise en page
scripts/                  validation et construction (Python, sans dépendance)
outils/simulateur-scorm/  faux LMS SCORM 1.2 pour les tests
tests/                    tests unitaires du moteur (navigateur)
concepteur/               guide de rédaction des contenus
docs/                     conception et rapport de tests
dist/                     fichiers de test générés (non versionnés)
```

## Documentation

- `docs/conception.md` : architecture, modèle de progression, règles SCORM, décisions à valider.
- `docs/rapport-tests.md` : tests réalisés, résultats, limites.
- `concepteur/README.md` : comment modifier un texte, ajouter une leçon ou une question.

## Essayer la politique PPO en local

Depuis la racine du dépôt, avec Python 3.10 minimum (3.12 recommandé) :

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e './tuteur[dev]'
./build.sh
python -m govtutor_rl.cli serve --site . --checkpoint tuteur/models/governance_ppo.zip --port 8000
```

Ouvrir <http://127.0.0.1:8000/>, puis un module. Dans « Ton accompagnement personnalisé », ouvrir « Historique récent et réglages du tuteur » et activer la politique RL locale. Pour les prochains accompagnements, elle sélectionne les interventions ; les textes sont exécutés localement. Sans cette activation, les règles restent utilisées.

## Tests du tuteur

```bash
# Tests Python (avec l'environnement précédent)
python -m pytest -q tuteur/tests

# Tests du moteur, du tuteur et du parcours dans Chromium (Node.js 20+)
npm install
npx playwright install chromium
npm test
# Avec le vrai checkpoint PPO et le serveur démarré par le test
npm run test:rl
```

Les scripts de tests lancent leur serveur sur un port local libre. Les rapports et la capture sont produits dans `dist/`. La CI vérifie les deux modes. Tester les modules dans le simulateur SCORM ne remplace pas leur validation sur eCampus.
