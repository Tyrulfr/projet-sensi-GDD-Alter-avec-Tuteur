/* Accompagnement contextualisé : mêmes composants accessibles que la formation. */
(function (root) {
  'use strict';
  var GDD = root.GDD, UI = GDD.ui, h = UI.h, T = GDD.tuteur;
  var NOMS = ['Faire le point', 'Question guidée', 'Petit indice', 'Indice détaillé',
    'Reprendre la notion', 'Un autre exemple', 'Un nouvel exercice', 'Repartir simplement',
    'Aller un peu plus loin', 'Revoir une base', 'Vérifier le rappel', 'Consolider'];

  function titre(m, oid) {
    var o = m.module.objectifsSpecifiques.filter(function (o) { return o.id === oid; })[0];
    return o ? o.texte : oid;
  }
  function lienLecon(m, oid) {
    var b = T.banque()[oid];
    var index = b ? m.indexLecon(b.lecon) : -1;
    if (index < 0 || !m.estAccessible(index)) { return null; }
    var href = (root.GDD_CONFIG || {}).mode === 'scorm'
      ? '#/lecon/' + (index + 1) : '#/module/' + m.module.id + '/lecon/' + (index + 1);
    return h('a', { href: href, text: 'Revoir le passage de la formation' });
  }

  UI.tuteurCarte = function (m, oid) {
    var b = T.banque()[oid];
    if (!b) { return null; }
    var zone = h('aside', { class: 'tuteur carte', 'aria-label': 'Accompagnement pédagogique' }, [
      h('h3', { text: 'Ton tuteur' }), h('p', { role: 'status', text: 'Préparation de ton accompagnement…' })
    ]);
    var tentative = T.statistiques(m, oid).donnees.n;
    T.decision(m, oid).then(function (decision) {
      if (T.statistiques(m, oid).donnees.n !== tentative) { return; }
      var action = decision.action;
      if (decision.politique === 'rl' && m.etat.t.o[oid] &&
          (m.etat.t.o[oid].a !== action || m.etat.t.o[oid].p !== 'rl')) {
        T.enregistrerAction(m, oid, action, 'rl');
        m.sauvegarder();
      }
      var messages = [
        'Vérifions ce qui te pose difficulté avec une autre situation.',
        'Quelle distinction pourrait te permettre de trancher ? ' + b.indice,
        b.indice,
        b.indice + ' ' + b.exemple,
        b.concept,
        b.exemple,
        'Appliquons cette notion à une nouvelle situation.',
        'Reprenons une distinction simple avant de poursuivre. ' + b.indice,
        'Essayons une situation de transfert pour confirmer ta compréhension.',
        b.prerequis && T.banque()[b.prerequis] ? T.banque()[b.prerequis].concept : b.concept,
        'Sans relire la correction, essaie de retrouver le principe dans une autre situation.',
        'Pour consolider : ' + b.concept
      ];
      zone.innerHTML = '';
      zone.appendChild(h('p', { class: 'surtitre', text: 'Ton tuteur · ' + NOMS[action] }));
      zone.appendChild(h('h3', { text: titre(m, oid) }));
      zone.appendChild(h('p', { text: messages[action] }));
      if (decision.secours) {
        zone.appendChild(h('p', { class: 'message-alerte', role: 'status', text: 'Le service RL est indisponible. L’accompagnement continue avec les règles pédagogiques locales.' }));
      }
      var explications = h('details', { class: 'tuteur-details' }, [
        h('summary', { text: 'Comprendre cet accompagnement' }),
        h('p', { text: (decision.politique === 'rl' ? 'Décision de la politique PPO expérimentale.' : 'Décision par règles pédagogiques locales.') +
          ' Observation : ' + T.statistiques(m, oid).libelle.toLowerCase() + '. ' +
          'Les réussites sur plusieurs questions différentes comptent davantage que la répétition d’une seule réponse.' }),
        h('p', { text: 'Cet exercice d’accompagnement ne change pas la note du module.' })
      ]);
      zone.appendChild(explications);
      var question = T.question(m, oid, action);
      if (question) {
        var exercice = h('div', { class: 'tuteur-exercice' });
        var qid = question.id + '-tuteur';
        var code = null;
        function dessiner() {
          exercice.innerHTML = '';
          var comp = UI.activite(qid, question, {
            mode: 'formatif', titre: 'Pour t’entraîner · niveau ' + question.difficulte,
            code: code,
            valider: function (nouveau) {
              code = nouveau;
              T.observer(m, question.id, question, code, 'accompagnement');
              m.sauvegarder();
              dessiner();
              var fb = exercice.querySelector('[role="status"]');
              if (fb) { fb.focus(); }
            }
          });
          exercice.appendChild(comp.element);
          if (code) {
            exercice.appendChild(h('p', { role: 'status', text: T.statistiques(m, oid).libelle + '. La note du module reste inchangée.' }));
            exercice.appendChild(h('button', {
              type: 'button', class: 'bouton bouton-secondaire',
              onclick: function () {
                var nouveau = UI.tuteurCarte(m, oid);
                zone.replaceWith(nouveau);
                nouveau.setAttribute('tabindex', '-1'); nouveau.focus();
              }
            }, 'Adapter la suite de mon entraînement'));
          }
        }
        dessiner(); zone.appendChild(exercice);
      }
      var lien = lienLecon(m, action === 9 && b.prerequis ? b.prerequis : oid);
      if (lien) { zone.appendChild(h('p', null, lien)); }
    });
    return zone;
  };

  UI.tuteurRevision = function (m) {
    var candidats = m.module.objectifsSpecifiques.filter(function (o) {
      return T.banque()[o.id] && T.statistiques(m, o.id).distinctes > 0;
    });
    candidats.sort(function (a, b) {
      return T.statistiques(m, a.id).estimation - T.statistiques(m, b.id).estimation;
    });
    return candidats.length ? UI.tuteurCarte(m, candidats[0].id) : null;
  };

  UI.tuteurBilan = function (m) {
    var bilan = h('section', { class: 'carte tuteur-bilan', 'aria-label': 'Suivi par objectif' }, [
      h('h2', { text: 'Ton accompagnement personnalisé' }),
      h('p', { text: 'Tes réponses servent à choisir les points à retravailler. Ce suivi est une estimation, pas une certification des acquis.' })
    ]);
    var liste = h('ul', { class: 'tuteur-objectifs' });
    m.module.objectifsSpecifiques.forEach(function (o) {
      var s = T.statistiques(m, o.id);
      liste.appendChild(h('li', null, [h('strong', { text: o.texte }),
        h('span', { class: 'tuteur-etat', text: s.libelle + (s.distinctes ? ' · ' + s.correctes + ' réussite(s) sur ' + s.distinctes + ' question(s) différente(s)' : '') })]));
    });
    bilan.appendChild(liste);
    var suivi = (root.GDD_CONFIG || {}).mode === 'scorm'
      ? (m.traceur.type === 'scorm12' && !(m.infoSuivi || {}).lectureSeule ? 'Ce suivi est enregistré avec ta session dans la plateforme.' : 'Mode aperçu ou consultation : ce suivi ne sera pas enregistré dans la plateforme.')
      : 'Ce suivi est enregistré dans ce navigateur. Il correspond à son utilisateur actuel et ne se synchronise pas entre appareils.';
    bilan.appendChild(h('p', { class: 'aide', text: suivi }));
    var details = h('details', { class: 'tuteur-details' }, [
      h('summary', { text: 'Historique récent et réglages du tuteur' }),
      h('p', { text: 'Aucun texte de réponse ni aucune identité n’est envoyé à un LLM. Le mode par défaut fonctionne entièrement dans le navigateur.' })
    ]);
    var evenements = m.etat.t ? m.etat.t.h : [];
    var historique = h('ol');
    evenements.slice().reverse().forEach(function (event) {
      historique.appendChild(h('li', { text: titre(m, event[0]) + ' — ' + (event[2] ? 'réponse correcte' : 'réponse à revoir') + ' (' + event[3] + ')' }));
    });
    details.appendChild(evenements.length ? historique : h('p', { text: 'Aucune réponse observée pour le moment.' }));
    var statut = h('p', { role: 'status', text: T.mode === 'rl' ? 'Mode : politique PPO locale expérimentale.' : 'Mode : règles pédagogiques locales.' });
    var bouton = h('button', {
      type: 'button', class: 'bouton bouton-secondaire',
      onclick: function () {
        if (T.mode === 'rl') {
          T.mode = 'rules'; statut.textContent = 'Mode : règles pédagogiques locales.';
          bouton.textContent = 'Activer la politique RL locale'; return;
        }
        bouton.disabled = true;
        var controller = new AbortController();
        var timer = root.setTimeout(function () { controller.abort(); }, 4000);
        root.fetch('/api/tutor/status', { signal: controller.signal }).then(function (r) {
          if (!r.ok) { throw new Error('Service absent'); } return r.json();
        }).then(function (r) {
          if (r.policy !== 'rl') { throw new Error('Politique RL absente'); }
          T.mode = 'rl';
          statut.textContent = 'Politique PPO locale activée pour les prochains accompagnements. Elle reçoit uniquement 11 indicateurs numériques et un masque d’actions. Son efficacité sur cette formation n’est pas validée.';
          bouton.textContent = 'Revenir aux règles locales';
        }).catch(function () {
          statut.textContent = 'Le service Python avec un checkpoint PPO doit être lancé en local. Les règles restent actives ; sur GitHub Pages, le tuteur fonctionne sans ce service.';
        }).finally(function () { root.clearTimeout(timer); bouton.disabled = false; });
      }
    }, T.mode === 'rl' ? 'Revenir aux règles locales' : 'Activer la politique RL locale');
    details.appendChild(statut); details.appendChild(bouton);
    bilan.appendChild(details);
    return bilan;
  };
})(window);
