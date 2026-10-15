/*
 * Application : pages, navigation et liaison moteur <-> interface.
 * window.GDD_CONFIG = { mode: 'web' } ou { mode: 'scorm', module: 'm01' }
 * window.GDD_CONTENU = { catalogue: {...}, modules: { m01: {...} } }
 */
(function (root) {
  'use strict';
  var GDD = root.GDD;
  var UI = GDD.ui, A = GDD.activites, h = UI.h;
  var config = root.GDD_CONFIG || { mode: 'web' };
  var contenu = root.GDD_CONTENU;
  var catalogue = contenu.catalogue;
  var modeScorm = config.mode === 'scorm';

  var etat = {
    moteurs: {},
    revele: {},          /* nombre de blocs affichés par leçon en cours */
    resultats: {},       /* résultat d'évaluation de la session */
    repasser: {},        /* évaluation en cours de nouvelle tentative */
    chrono: {},          /* nombre d'étapes affichées par chronologie */
    defi: {},            /* défi « une question à la fois » en cours : { i, codes, verifie } */
    avertissement: null,
    session: null,       /* SCORM : 'terminee' après LMSFinish */
    focus: null
  };

  var conteneur, annonces;

  /* ---------- Moteurs ---------- */

  function moteur(idModule) {
    if (etat.moteurs[idModule]) { return etat.moteurs[idModule]; }
    var module = contenu.modules[idModule];
    if (!module) { return null; }
    var m;
    if (modeScorm) {
      m = new GDD.Moteur(module, new GDD.TraceurScorm12({ debug: !!config.debug }));
      var info = m.demarrer();
      if (!info.ok) {
        m = new GDD.Moteur(module, new GDD.TraceurMemoire());
        m.demarrer();
        etat.avertissement = 'Aperçu hors plateforme : la connexion au LMS n\'a pas été trouvée. Ta progression ne sera pas enregistrée.';
      } else if (info.lectureSeule) {
        etat.avertissement = 'Mode consultation : la plateforme n\'enregistre pas de nouveaux résultats.';
      }
    } else {
      m = new GDD.Moteur(module, new GDD.TraceurLocal(catalogue.id, idModule));
      var infoLocal = m.demarrer();
      if (!infoLocal.persistant) {
        etat.avertissement = 'Ton navigateur bloque l\'enregistrement local : la progression sera perdue à la fermeture.';
      }
    }
    etat.moteurs[idModule] = m;
    return m;
  }

  function infosModule(entree) {
    var m = entree.etat === 'disponible' ? contenu.modules[entree.id] : null;
    return m ? { id: m.id, numero: m.numero, titre: m.titre, duree: m.duree, objectif: m.objectif, disponible: true }
      : { id: entree.id, numero: entree.numero, titre: entree.titre, duree: entree.duree, objectif: entree.objectif, disponible: false };
  }

  /* ---------- Liens ---------- */

  function lienModule(id) { return modeScorm ? '#/' : '#/module/' + id; }
  function lienLecon(id, index) { return modeScorm ? '#/lecon/' + (index + 1) : '#/module/' + id + '/lecon/' + (index + 1); }
  function aller(lien) {
    if (root.location.hash === lien) { afficher(); } else { root.location.hash = lien; }
  }

  function lienBouton(texte, href, classe) {
    return h('a', { class: 'bouton ' + (classe || 'bouton-principal'), href: href }, texte);
  }

  function annoncer(texte) {
    annonces.textContent = '';
    root.setTimeout(function () { annonces.textContent = texte; }, 50);
  }

  /* ---------- Gabarit ---------- */

  function entete() {
    var titre = modeScorm
      ? h('span', { class: 'entete-titre', text: catalogue.titre })
      : h('a', { class: 'entete-titre', href: '#/', text: catalogue.titre });
    var nav = modeScorm ? null : h('nav', { 'aria-label': 'Navigation principale' }, h('ul', null, [
      h('li', null, h('a', { href: '#/' }, 'Accueil')),
      h('li', null, h('a', { href: '#/parcours' }, 'Parcours'))
    ]));
    return h('div', { class: 'entete-inner' }, [
      h('div', null, [h('span', { class: 'entete-institution', text: catalogue.institution }), titre]),
      nav
    ]);
  }

  function avertissement() {
    if (etat.avertissement) {
      return h('p', { class: 'note note-alerte', role: 'note' }, etat.avertissement);
    }
    if (!modeScorm) {
      return h('p', { class: 'note', role: 'note' },
        'Version de démonstration : ta progression est enregistrée uniquement dans ce navigateur. Elle ne constitue pas un suivi officiel de formation.');
    }
    return null;
  }

  /* ---------- Pages ---------- */

  function pageAccueil() {
    var modules = catalogue.modules.map(infosModule);
    var dureeTotale = modules.reduce(function (s, m) { return s + (m.duree || 0); }, 0);
    var suivant = null;
    modules.forEach(function (mi) {
      if (!suivant && mi.disponible && moteur(mi.id).statut().completion !== 'termine') { suivant = mi; }
    });
    var dejaCommence = modules.some(function (mi) { return mi.disponible && moteur(mi.id).statut().completion !== 'non-commence'; });

    document.title = catalogue.titre;
    return [
      h('section', { class: 'hero' }, [
        h('p', { class: 'hero-surtitre', text: catalogue.sousTitre }),
        h('h1', { tabindex: '-1', text: catalogue.titre }),
        h('div', { class: 'hero-intro', html: GDD.util.richText(catalogue.introduction) }),
        h('ul', { class: 'hero-infos' }, [
          h('li', null, [h('strong', null, 'Durée : '), 'environ ' + dureeTotale + ' minutes']),
          h('li', null, [h('strong', null, 'Format : '), modules.length + ' modules courts et indépendants']),
          h('li', null, [h('strong', null, 'Public : '), catalogue.public])
        ]),
        h('div', { class: 'actions' }, [
          suivant ? lienBouton(dejaCommence ? 'Reprendre la formation' : 'Commencer la formation', lienModule(suivant.id)) : null,
          lienBouton('Voir le parcours', '#/parcours', 'bouton-secondaire')
        ])
      ]),
      avertissement(),
      h('section', { class: 'carte' }, [
        h('h2', { text: 'À l\'issue de la formation, tu sauras' }),
        h('ul', { class: 'liste-objectifs' }, catalogue.objectifs.map(function (o) { return h('li', { text: o }); }))
      ]),
      h('h2', { text: 'Les modules de la formation' }),
      listeModules('h3')
    ];
  }

  function listeModules(niveauTitre) {
    var liste = h('ol', { class: 'liste-modules' });
    catalogue.modules.map(infosModule).forEach(function (mi) {
      var st = mi.disponible ? moteur(mi.id).statut() : null;
      liste.appendChild(h('li', { class: 'carte carte-module' + (mi.disponible ? '' : ' est-a-venir') }, [
        h('div', { class: 'carte-module-entete' }, [
          h('span', { class: 'carte-module-numero', text: 'Module ' + mi.numero }),
          st ? UI.badge(st) : h('span', { class: 'badge badge-a-venir', text: 'En préparation' })
        ]),
        h(niveauTitre, { class: 'carte-module-titre', text: mi.titre }),
        h('p', { text: mi.objectif }),
        h('p', { class: 'carte-module-duree', text: 'Durée estimée : ' + mi.duree + ' min' }),
        st ? UI.barreProgression(st.progression, 'Progression du module ' + mi.numero) : null,
        st && st.score !== null ? h('p', { class: 'carte-module-score', text: 'Meilleur score : ' + st.score + ' %' }) : null,
        mi.disponible ? h('div', { class: 'actions' }, lienBouton(st.completion === 'non-commence' ? 'Commencer' : 'Accéder au module', lienModule(mi.id))) : null
      ]));
    });
    return liste;
  }

  function sectionTelechargements() {
    var exports = config.exports || {};
    var ids = Object.keys(exports);
    if (!ids.length) { return null; }
    return h('section', { class: 'carte' }, [
      h('h2', { text: 'Packages SCORM 1.2 (administrateurs de plateforme)' }),
      h('p', { text: 'Chaque module est disponible sous forme d\'archive à importer dans un LMS (Moodle, eCampus).' }),
      h('ul', null, ids.map(function (id) {
        var mod = contenu.modules[id];
        return h('li', null, h('a', { href: exports[id], download: '' }, 'Module ' + mod.numero + ' : ' + mod.titre + ' (ZIP)'));
      }))
    ]);
  }

  function pageParcours() {
    document.title = 'Parcours - ' + catalogue.titre;
    return [
      h('h1', { tabindex: '-1', text: 'Parcours de formation' }),
      h('p', { class: 'chapo', text: 'Les modules sont indépendants : tu peux les suivre dans l\'ordre proposé ou selon tes besoins.' }),
      avertissement(),
      listeModules('h2'),
      sectionTelechargements(),
      h('div', { class: 'actions actions-discretes' }, h('button', {
        type: 'button', class: 'bouton bouton-lien',
        onclick: function () {
          if (root.confirm('Effacer toute ta progression enregistrée dans ce navigateur ?')) {
            GDD.TraceurLocal.effacerTout(catalogue.id);
            etat.moteurs = {}; etat.revele = {}; etat.resultats = {}; etat.repasser = {}; etat.chrono = {}; etat.defi = {};
            afficher();
            annoncer('Progression effacée.');
          }
        }
      }, 'Effacer ma progression sur ce navigateur'))
    ];
  }

  function pageModule(m) {
    var mod = m.module;
    var st = m.statut();
    document.title = mod.titre + ' - ' + catalogue.titre;
    var position = m.etat.p;
    var libelleAction = st.completion === 'non-commence' ? 'Commencer le module'
      : (st.completion === 'termine' ? 'Revoir le module' : 'Reprendre où j\'en étais');
    var cible = st.completion === 'termine' ? 0 : position;

    var lecons = h('ol', { class: 'liste-lecons' });
    m.lecons.forEach(function (l, i) {
      var accessible = m.estAccessible(i);
      var vue = m.estVue(l.id);
      var res = l.type === 'evaluation' ? m.resultatEvaluation(l.id) : null;
      var etatTexte = vue ? (res ? 'Fait : meilleur score ' + res.b + ' %' : 'Terminée') : (accessible ? 'À faire' : 'Disponible après les leçons précédentes');
      lecons.appendChild(h('li', { class: 'lecon-item' + (vue ? ' est-vue' : '') + (accessible ? '' : ' est-verrouillee') }, [
        h('span', { class: 'lecon-icone', 'aria-hidden': 'true', text: vue ? '✓' : (accessible ? '○' : '🔒') }),
        h('span', { class: 'lecon-libelle' }, [
          accessible ? h('a', { href: lienLecon(mod.id, i), text: l.titre }) : h('span', { text: l.titre }),
          h('span', { class: 'lecon-etat', text: ' : ' + etatTexte })
        ])
      ]));
    });

    return [
      modeScorm ? null : h('p', { class: 'fil' }, h('a', { href: '#/parcours' }, '← Parcours')),
      h('p', { class: 'surtitre', text: 'Module ' + mod.numero }),
      h('h1', { tabindex: '-1', text: mod.titre }),
      mod.sousTitre ? h('p', { class: 'chapo', text: mod.sousTitre }) : null,
      h('p', { class: mod.sousTitre ? null : 'chapo', text: mod.objectif }),
      avertissement(),
      h('section', { class: 'carte carte-statut', 'aria-label': 'Ma progression' }, [
        h('div', { class: 'carte-statut-ligne' }, [UI.badge(st), h('span', { text: 'Durée estimée : ' + mod.duree + ' min' })]),
        UI.barreProgression(st.progression, 'Progression du module'),
        st.score !== null ? h('p', { text: 'Meilleur score : ' + st.score + ' %' + (st.seuil !== null ? ' (seuil de réussite : ' + st.seuil + ' %)' : '') }) : null,
        h('div', { class: 'actions' }, lienBouton(libelleAction, lienLecon(mod.id, cible)))
      ]),
      h('section', { class: 'carte' }, [
        h('h2', { text: 'Dans ce module, tu vas apprendre à' }),
        h('ul', { class: 'liste-objectifs' }, mod.objectifsSpecifiques.map(function (o) { return h('li', { text: o.texte }); }))
      ]),
      UI.tuteurBilan(m),
      h('section', { class: 'carte' }, [h('h2', { text: 'Étapes du module' }), lecons])
    ];
  }

  function enteteLecon(m, index) {
    var l = m.lecons[index];
    var nbLecons = m.lecons.filter(function (x) { return x.type === 'lecon'; }).length;
    var rang = m.lecons.slice(0, index + 1).filter(function (x) { return x.type === 'lecon'; }).length;
    return h('div', { class: 'lecon-entete' }, [
      h('p', { class: 'fil' }, h('a', { href: lienModule(m.module.id) }, '← Module ' + m.module.numero + ' : ' + m.module.titre)),
      h('p', { class: 'surtitre', text: l.type === 'lecon' ? 'Leçon ' + rang + ' sur ' + nbLecons : (l.surtitre || 'Évaluation') }),
      h('h1', { tabindex: '-1', text: l.titre }),
      UI.barreProgression(m.statut().progression, 'Progression du module')
    ]);
  }

  function navigationLecon(m, index) {
    var mod = m.module;
    var suivante = m.lecons[index + 1];
    return h('nav', { class: 'nav-lecon', 'aria-label': 'Navigation entre les leçons' }, [
      index > 0 ? lienBouton('← Précédent', lienLecon(mod.id, index - 1), 'bouton-secondaire') : lienBouton('← Retour au module', lienModule(mod.id), 'bouton-secondaire'),
      suivante ? lienBouton(suivante.type === 'evaluation' ? (suivante.libelleAcces || 'Passer au quiz') + ' →' : 'Leçon suivante →', lienLecon(mod.id, index + 1))
        : lienBouton('Retour au module', lienModule(mod.id))
    ]);
  }

  function pageLecon(m, index) {
    var l = m.lecons[index];
    if (!l) { return pageIntrouvable(); }
    if (!m.estAccessible(index)) {
      return [
        h('h1', { tabindex: '-1', text: l.titre }),
        h('p', { class: 'note' }, 'Cette étape sera disponible lorsque tu auras parcouru les leçons précédentes.'),
        lienBouton('Retour au module', lienModule(m.module.id))
      ];
    }
    m.definirPosition(index);
    document.title = l.titre + ' - ' + m.module.titre;
    if (l.type === 'evaluation') { return pageEvaluation(m, index); }

    var total = l.blocs.length;
    var dejaVue = m.estVue(l.id);
    var dernierRepondu = -1;
    l.blocs.forEach(function (b, i) {
      if (b.type === 'activite' && m.reponseEnregistree(b.ref)) { dernierRepondu = i; }
    });
    var nb = dejaVue ? total : Math.min(Math.max(etat.revele[l.id] || 1, dernierRepondu + 1), total);
    var bloque = null;

    var blocs = h('div', { class: 'lecon-blocs' });
    l.blocs.slice(0, nb).forEach(function (b, i) {
      var el;
      if (b.type === 'chronologie') {
        var cle = l.id + '-' + i;
        var enCours = !dejaVue && i === nb - 1;
        var visibles = enCours ? (etat.chrono[cle] || 1) : b.etapes.length;
        if (visibles < b.etapes.length) { bloque = 'Découvre toutes les étapes du scénario pour continuer.'; }
        el = UI.chronologie(b, {
          visibles: visibles,
          prefixeId: 'chrono-' + cle,
          suivante: function () {
            etat.chrono[cle] = visibles + 1;
            etat.focus = 'chrono-' + cle + '-' + visibles;
            afficher();
          }
        });
      } else if (b.type === 'activite') {
        var act = m.module.activites[b.ref];
        var code = m.reponseEnregistree(b.ref);
        if (!code && i === nb - 1) { bloque = 'Réponds à la question pour continuer.'; }
        el = h('div', { class: 'bloc bloc-activite' }, [
          h('p', { class: 'bloc-etiquette' }, [h('span', { 'aria-hidden': 'true', text: '✎ ' }), 'À toi de jouer']),
          UI.activite(b.ref, act, {
            mode: 'formatif',
            code: code,
            valider: function (c) {
              var r = m.repondre(b.ref, c);
              etat.focus = 'fb-' + b.ref;
              afficher();
              annoncer(r.correct ? 'Bonne réponse.' : 'Réponse à revoir.');
            },
            reessayer: function () {
              etat.revele[l.id] = Math.max(etat.revele[l.id] || 1, i + 1);
              m.oublierReponse(b.ref);
              etat.focus = 'act-' + b.ref;
              afficher();
            }
          }).element,
          code ? UI.tuteurCarte(m, act.objectif) : null
        ]);
      } else {
        el = UI.bloc(b);
      }
      el.id = 'bloc-' + l.id + '-' + i;
      el.setAttribute('tabindex', '-1');
      blocs.appendChild(el);
    });

    var pied;
    if (nb < total) {
      pied = h('div', { class: 'actions actions-continuer' }, [
        h('span', { class: 'etape', text: 'Étape ' + nb + ' sur ' + total }),
        bloque ? h('p', { class: 'aide', text: bloque }) : h('button', {
          type: 'button', class: 'bouton bouton-principal',
          onclick: function () {
            etat.revele[l.id] = nb + 1;
            etat.focus = 'bloc-' + l.id + '-' + nb;
            afficher();
          }
        }, 'Continuer')
      ]);
    } else {
      if (!dejaVue) { m.marquerVue(l.id); annoncer('Leçon terminée.'); }
      pied = navigationLecon(m, index);
    }

    return [enteteLecon(m, index), avertissement(), blocs, pied];
  }

  function correctionsDepuis(m, lecon, codes) {
    return lecon.activites.map(function (idQ) {
      var q = m.module.activites[idQ];
      var r = A.corriger(q, codes[idQ]);
      return { id: idQ, activite: q, code: codes[idQ], correct: r.correct };
    });
  }

  function pageEvaluation(m, index) {
    var l = m.lecons[index];
    var precedent = m.resultatEvaluation(l.id);
    if (precedent && !etat.repasser[l.id]) { return pageResultat(m, index, precedent); }
    if (l.presentation === 'une-par-une') { return pageDefi(m, index); }

    var composants = [];
    var liste = h('div', { class: 'evaluation-questions' });
    l.activites.forEach(function (idQ, i) {
      var c = UI.activite(idQ, m.module.activites[idQ], { mode: 'evaluation', titre: 'Question ' + (i + 1) + ' sur ' + l.activites.length });
      composants.push({ id: idQ, composant: c });
      liste.appendChild(h('div', { class: 'bloc bloc-activite' }, c.element));
    });
    var message = h('div', { class: 'activite-message', role: 'status', tabindex: '-1' });

    return [
      enteteLecon(m, index),
      avertissement(),
      l.introduction ? h('p', { class: 'chapo', text: l.introduction }) : null,
      liste,
      message,
      h('div', { class: 'actions' }, h('button', {
        type: 'button', class: 'bouton bouton-principal',
        onclick: function () {
          var codes = {}, manquantes = [];
          composants.forEach(function (c, i) {
            var code = c.composant.lireReponse();
            if (code === null) { manquantes.push(i + 1); } else { codes[c.id] = code; }
          });
          if (manquantes.length) {
            message.innerHTML = '';
            message.appendChild(h('p', { class: 'message-alerte', text: (manquantes.length > 1 ? 'Questions sans réponse : ' : 'Question sans réponse : ') + manquantes.join(', ') + '.' }));
            message.focus();
            return;
          }
          var res = m.soumettreEvaluation(l.id, codes);
          etat.resultats[l.id] = res;
          etat.repasser[l.id] = false;
          etat.focus = 'resultat-titre';
          afficher();
          annoncer('Score obtenu : ' + res.score + ' %.');
        }
      }, 'Valider mes réponses'))
    ];
  }

  /* Défi : une question à la fois, correction immédiate, score à la fin. */
  function pageDefi(m, index) {
    var l = m.lecons[index];
    var d = etat.defi[l.id] || (etat.defi[l.id] = { i: 0, codes: {}, verifie: false });
    var n = l.activites.length;
    var idQ = l.activites[d.i];
    var q = m.module.activites[idQ];
    var composant = UI.activite(idQ, q, {
      mode: 'evaluation',
      corrige: d.verifie,
      code: d.verifie ? d.codes[idQ] : null,
      titre: 'Question ' + (d.i + 1) + ' sur ' + n
    });
    var message = h('div', { class: 'activite-message', role: 'status', tabindex: '-1' });
    var bouton;
    if (!d.verifie) {
      bouton = h('button', {
        type: 'button', class: 'bouton bouton-principal',
        onclick: function () {
          var code = composant.lireReponse();
          if (code === null) {
            message.innerHTML = '';
            message.appendChild(h('p', { class: 'message-alerte', text: 'Choisis une réponse avant de vérifier.' }));
            message.focus();
            return;
          }
          d.codes[idQ] = code;
          d.verifie = true;
          etat.focus = 'fb-' + idQ;
          afficher();
          annoncer(A.corriger(q, code).correct ? 'Bonne réponse.' : 'Réponse à revoir.');
        }
      }, 'Vérifier ma réponse');
    } else if (d.i < n - 1) {
      bouton = h('button', {
        type: 'button', class: 'bouton bouton-principal',
        onclick: function () {
          d.i++; d.verifie = false;
          etat.focus = 'act-' + l.activites[d.i];
          afficher();
        }
      }, 'Question suivante →');
    } else {
      bouton = h('button', {
        type: 'button', class: 'bouton bouton-principal',
        onclick: function () {
          var res = m.soumettreEvaluation(l.id, d.codes);
          delete etat.defi[l.id];
          etat.repasser[l.id] = false;
          etat.focus = 'resultat-titre';
          afficher();
          annoncer('Résultat : ' + res.bonnes + ' bonnes réponses sur ' + res.total + '.');
        }
      }, 'Voir mon résultat →');
    }
    var faites = d.i + (d.verifie ? 1 : 0);
    return [
      enteteLecon(m, index),
      avertissement(),
      d.i === 0 && !d.verifie && l.introduction ? h('p', { class: 'chapo', text: l.introduction }) : null,
      UI.barreProgression(Math.round(faites / n * 100), 'Progression dans le défi', faites + ' / ' + n),
      h('div', { class: 'bloc bloc-activite' }, composant.element),
      message,
      h('div', { class: 'actions' }, bouton)
    ];
  }

  function messageResultat(lecon, score) {
    var messages = (lecon.messagesResultat || []).slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < messages.length; i++) { if (score >= messages[i].min) { return messages[i].texte; } }
    return null;
  }

  function moduleSuivant(mod) {
    var entree = catalogue.modules.filter(function (e) { return e.numero === mod.numero + 1; })[0];
    return entree && entree.etat === 'disponible' && contenu.modules[entree.id] ? contenu.modules[entree.id] : null;
  }

  function pageResultat(m, index, enregistre) {
    var l = m.lecons[index];
    var mod = m.module;
    var st = m.statut();
    var items = correctionsDepuis(m, l, enregistre.r || {});
    var n = items.length;
    var bonnes = items.filter(function (i) { return i.correct; }).length;
    var avecSeuil = st.seuil !== null;
    var reussi = avecSeuil && enregistre.d >= st.seuil;
    var defi = l.presentation === 'une-par-une';

    var corrections = h('div', { class: 'evaluation-questions' });
    if (n && items.every(function (i) { return i.code; })) {
      items.forEach(function (it, i) {
        corrections.appendChild(h('div', { class: 'bloc bloc-activite' }, UI.activite(it.id, it.activite, {
          mode: 'evaluation', corrige: true, code: it.code, titre: 'Question ' + (i + 1) + ' sur ' + n
        }).element));
      });
    }

    var suivant = modeScorm ? null : moduleSuivant(mod);
    var actions = h('div', { class: 'actions' }, [
      h('button', {
        type: 'button', class: 'bouton bouton-secondaire',
        onclick: function () { etat.repasser[l.id] = true; delete etat.defi[l.id]; etat.focus = null; afficher(); }
      }, l.libelleRecommencer || 'Repasser le quiz'),
      modeScorm ? h('button', {
        type: 'button', class: 'bouton bouton-principal',
        onclick: function () { terminerSession(m); }
      }, 'Terminer et enregistrer mes résultats')
        : lienBouton('Retour au parcours', '#/parcours', suivant ? 'bouton-secondaire' : 'bouton-principal'),
      suivant ? lienBouton('Module ' + suivant.numero + ' : ' + suivant.titre + ' →', lienModule(suivant.id)) : null
    ]);

    var texteMessage = messageResultat(l, enregistre.d);
    var message = avecSeuil
      ? h('p', { class: 'resultat-message' }, [
        h('span', { 'aria-hidden': 'true', text: reussi ? '✓ ' : '↻ ' }),
        reussi ? 'Seuil de réussite atteint (' + st.seuil + ' %). ' + (texteMessage || 'Bravo !')
          : 'Le seuil de réussite (' + st.seuil + ' %) n\'est pas encore atteint. ' + (texteMessage || 'Relis les corrections ci-dessous, puis recommence quand tu le souhaites.')
      ])
      : (texteMessage ? h('p', { class: 'resultat-message', text: texteMessage }) : null);

    var meilleur = avecSeuil ? enregistre.b + ' %' : Math.round(enregistre.b * n / 100) + ' / ' + n;
    return [
      enteteLecon(m, index),
      avertissement(),
      h('section', { class: 'carte resultat ' + (avecSeuil ? (reussi ? 'resultat-reussi' : 'resultat-echec') : 'resultat-neutre'), 'aria-labelledby': 'resultat-titre' }, [
        h('h2', { id: 'resultat-titre', tabindex: '-1', text: 'Ton résultat' }),
        avecSeuil
          ? h('p', { class: 'resultat-score' }, [h('span', { class: 'resultat-valeur', text: enregistre.d + ' %' }),
            h('span', { text: ' : ' + bonnes + ' bonne' + (bonnes > 1 ? 's' : '') + ' réponse' + (bonnes > 1 ? 's' : '') + ' sur ' + n })])
          : h('p', { class: 'resultat-score' }, [h('span', { class: 'resultat-valeur', text: bonnes + ' / ' + n }),
            h('span', { text: ' bonne' + (bonnes > 1 ? 's' : '') + ' réponse' + (bonnes > 1 ? 's' : '') + ' (' + enregistre.d + ' %)' })]),
        message,
        enregistre.n > 1 ? h('p', { text: 'Meilleur résultat sur ' + enregistre.n + ' tentatives : ' + meilleur + '.' }) : null,
        h('p', null, ['Statut du module : ', UI.badge(st)])
      ]),
      UI.tuteurBilan(m),
      UI.tuteurRevision(m),
      defi
        ? h('details', { class: 'recapitulatif' }, [h('summary', null, 'Revoir les corrections'), corrections])
        : h('div', null, [h('h2', { text: 'Correction' }), corrections]),
      mod.synthese ? h('section', { class: 'bloc bloc-aretenir' }, [
        h('h2', { class: 'bloc-etiquette' }, [h('span', { 'aria-hidden': 'true', text: '★ ' }), 'L\'essentiel du module']),
        h('ul', null, mod.synthese.map(function (s) { return h('li', { text: s }); }))
      ]) : null,
      actions
    ];
  }

  function terminerSession(m) {
    var ok = m.terminer();
    etat.session = ok ? 'terminee' : 'echec';
    etat.focus = null;
    afficher();
  }

  function pageFinSession() {
    document.title = 'Session terminée - ' + catalogue.titre;
    return [
      h('h1', { tabindex: '-1', text: 'Session terminée' }),
      etat.session === 'terminee'
        ? h('p', { class: 'chapo', text: 'Tes résultats ont été transmis à la plateforme. Tu peux maintenant fermer cette fenêtre ou revenir à la plateforme.' })
        : h('p', { class: 'note note-alerte', text: 'La plateforme n\'a pas confirmé l\'enregistrement. Ferme la fenêtre puis rouvre le module ; si le problème persiste, contacte l\'assistance de la plateforme.' })
    ];
  }

  function pageIntrouvable() {
    return [
      h('h1', { tabindex: '-1', text: 'Page introuvable' }),
      lienBouton(modeScorm ? 'Retour au module' : 'Retour à l\'accueil', '#/')
    ];
  }

  /* ---------- Routage ---------- */

  function route() {
    var segments = (root.location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (modeScorm) {
      var m = moteur(config.module);
      if (etat.session) { return pageFinSession(); }
      if (segments[0] === 'lecon') { return pageLecon(m, (parseInt(segments[1], 10) || 1) - 1); }
      return pageModule(m);
    }
    if (segments.length === 0) { return pageAccueil(); }
    if (segments[0] === 'parcours') { return pageParcours(); }
    if (segments[0] === 'module') {
      var mw = moteur(segments[1]);
      if (!mw) { return pageIntrouvable(); }
      if (segments[2] === 'lecon') { return pageLecon(mw, (parseInt(segments[3], 10) || 1) - 1); }
      return pageModule(mw);
    }
    return pageIntrouvable();
  }

  function afficher() {
    var vue = route();
    conteneur.innerHTML = '';
    (Array.isArray(vue) ? vue : [vue]).forEach(function (n) { if (n) { conteneur.appendChild(n); } });
    var cible = etat.focus ? document.getElementById(etat.focus) : conteneur.querySelector('h1');
    etat.focus = null;
    if (cible) {
      if (!cible.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(cible.tagName)) {
        cible.setAttribute('tabindex', '-1');
      }
      cible.focus({ preventScroll: true });
      var reduit = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (cible.tagName === 'H1') { root.scrollTo(0, 0); }
      else { cible.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' }); }
    }
  }

  function demarrer() {
    conteneur = document.getElementById('contenu');
    annonces = document.getElementById('annonces');
    document.getElementById('entete').appendChild(entete());
    if (modeScorm) {
      moteur(config.module);
      var fermer = function () {
        var m = etat.moteurs[config.module];
        if (m && !m.ferme) { m.terminer(); }
      };
      root.addEventListener('pagehide', fermer);
      root.addEventListener('beforeunload', fermer);
      document.addEventListener('visibilitychange', function () {
        var m = etat.moteurs[config.module];
        if (document.visibilityState === 'hidden' && m && !m.ferme) { m.sauvegarder(); }
      });
    }
    root.addEventListener('hashchange', afficher);
    afficher();
  }

  GDD.app = { demarrer: demarrer, etat: etat, moteur: moteur };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})(window);
