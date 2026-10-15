(function () {
  'use strict';
  var U = GDD.util, A = GDD.activites;
  var resultats = [];

  function test(nom, fn) {
    try { fn(); resultats.push({ nom: nom, ok: true }); }
    catch (e) { resultats.push({ nom: nom, ok: false, message: e.message }); }
  }
  function egal(obtenu, attendu, msg) {
    if (JSON.stringify(obtenu) !== JSON.stringify(attendu)) {
      throw new Error((msg || '') + ' attendu ' + JSON.stringify(attendu) + ', obtenu ' + JSON.stringify(obtenu));
    }
  }
  function vrai(v, msg) { if (!v) { throw new Error(msg || 'condition fausse'); } }

  /* Traceur de test : mémorise ce qui lui est transmis. */
  function TraceurTest(sauvegarde) {
    this.paquets = []; this.fin = null; this.sauvegarde = sauvegarde || null;
  }
  TraceurTest.prototype.init = function () { return { ok: true, persistant: true, sauvegarde: this.sauvegarde }; };
  TraceurTest.prototype.enregistrer = function (p) { this.paquets.push(p); return true; };
  TraceurTest.prototype.valider = function () { return true; };
  TraceurTest.prototype.terminer = function (s) { this.fin = s; return true; };

  /* Fausse API LMS minimale pour tester l'adaptateur SCORM 1.2. */
  function FausseApi(initial) {
    var d = initial || {}, journal = [], self = this;
    this.d = d; this.journal = journal; this.erreur = '0';
    this.LMSInitialize = function () { journal.push('init'); return 'true'; };
    this.LMSFinish = function () { journal.push('finish'); return 'true'; };
    this.LMSCommit = function () { journal.push('commit'); return 'true'; };
    this.LMSGetValue = function (k) {
      self.erreur = '0';
      if (k === 'cmi.interactions._count') { return String(self.nbInter || 0); }
      return d[k] !== undefined ? d[k] : '';
    };
    this.LMSSetValue = function (k, v) {
      d[k] = v;
      var m = /^cmi\.interactions\.(\d+)\.id$/.exec(k);
      if (m) { self.nbInter = Math.max(self.nbInter || 0, +m[1] + 1); }
      journal.push('set ' + k); return 'true';
    };
    this.LMSGetLastError = function () { return self.erreur; };
    this.LMSGetErrorString = function () { return ''; };
  }

  function bonnesReponses(module, idEval) {
    var codes = {};
    module.lecons.filter(function (l) { return l.id === idEval; })[0].activites.forEach(function (id) {
      codes[id] = A.reponseAttendue(module.activites[id]);
    });
    return codes;
  }

  function lancer(module) {
    var idEval = module.validation.evaluation;
    var lecons = module.lecons.filter(function (l) { return l.type === 'lecon'; });

    test('Format SCORM du temps de session (CMITimespan)', function () {
      egal(U.scormTimespan(0), '00:00:00');
      egal(U.scormTimespan(3723000), '01:02:03');
      egal(U.scormTimespan(125 * 3600 * 1000), '125:00:00');
      egal(U.scormTimespan(1e12), '9999:59:59');
      vrai(/^\d{2}:\d{2}:\d{2}$/.test(U.scormTime(new Date())), 'CMITime');
    });

    test('Texte enrichi : échappement HTML et gras', function () {
      egal(U.richText('a <b> **c**'), '<p>a &lt;b&gt; <strong>c</strong></p>');
      egal(U.richText('un\n\ndeux'), '<p>un</p><p>deux</p>');
      egal(U.richText('un\ndeux'), '<p>un<br>deux</p>');
    });

    test('Texte enrichi : listes à puces', function () {
      egal(U.richText('Intro :\n\n- a ;\n- **b**'), '<p>Intro :</p><ul><li>a ;</li><li><strong>b</strong></li></ul>');
      egal(U.richText('Pour corriger :\n- a'), '<p>Pour corriger :<br>- a</p>', 'liste non séparée par une ligne vide');
    });

    test('Chaque activité du module accepte sa réponse attendue', function () {
      Object.keys(module.activites).forEach(function (id) {
        var act = module.activites[id];
        vrai(A.corriger(act, A.reponseAttendue(act)).correct, id);
      });
    });

    test('Réponses incorrectes ou incomplètes', function () {
      var qcm = module.activites['m01-a1'];
      vrai(!A.corriger(qcm, 'a,b').correct, 'réponse partielle refusée');
      vrai(!A.corriger(qcm, 'a,b,c,d').correct, 'réponse en trop refusée');
      egal(A.encoder(qcm, []), null);
      egal(A.encoder(qcm, ['c', 'a', 'b']), 'a,b,c', 'tri de l\'encodage');
      var vf = module.activites['m01-a3'];
      vrai(!A.corriger(vf, 't').correct);
      egal(A.encoder(vf, null), null);
      var cl = module.activites['m01-a2'];
      egal(A.encoder(cl, { 1: 'p' }), null, 'classement incomplet');
      var r = A.corriger(cl, '1.p,2.p,3.p,4.n,5.p,6.n');
      vrai(!r.correct); egal(r.details['2'], false); egal(r.details['1'], true);
    });

    test('Types SCORM des interactions', function () {
      egal(A.typeScorm(module.activites['m01-q1']), 'choice');
      egal(A.typeScorm(module.activites['m01-q3']), 'true-false');
      egal(A.typeScorm(module.activites['m01-a2']), 'matching');
    });

    test('Statut initial : non commencé', function () {
      var m = new GDD.Moteur(module, new TraceurTest()); m.demarrer();
      var s = m.statut();
      egal([s.completion, s.reussite, s.score, s.progression], ['non-commence', 'inconnue', null, 0]);
    });

    test('Navigation séquentielle', function () {
      var m = new GDD.Moteur(module, new TraceurTest()); m.demarrer();
      vrai(m.estAccessible(0)); vrai(!m.estAccessible(1)); vrai(!m.estAccessible(module.lecons.length - 1));
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      vrai(m.estAccessible(module.lecons.length - 1), 'quiz accessible après les leçons');
    });

    test('Leçons vues sans quiz : en cours, sans réussite', function () {
      var m = new GDD.Moteur(module, new TraceurTest()); m.demarrer();
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      var s = m.statut();
      egal([s.completion, s.reussite], ['en-cours', 'inconnue']);
      egal(GDD.TraceurScorm12.statutScorm(s), 'incomplete');
    });

    test('Quiz réussi (100 %) : terminé et réussi -> passed', function () {
      var t = new TraceurTest(); var m = new GDD.Moteur(module, t); m.demarrer();
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      var r = m.soumettreEvaluation(idEval, bonnesReponses(module, idEval));
      egal(r.score, 100);
      var s = m.statut();
      egal([s.completion, s.reussite, s.score], ['termine', 'reussi', 100]);
      egal(GDD.TraceurScorm12.statutScorm(s), 'passed');
      var dernier = t.paquets[t.paquets.length - 1];
      vrai(t.paquets.some(function (p) { return p.interactions.length === 4; }), 'interactions transmises une fois');
      egal(dernier.interactions.length, 0, 'pas de doublon d\'interactions');
    });

    test('Quiz sous le seuil (50 %) -> failed, puis meilleur score conservé', function () {
      var m = new GDD.Moteur(module, new TraceurTest()); m.demarrer();
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      var codes = bonnesReponses(module, idEval);
      codes['m01-q1'] = 'a'; codes['m01-q3'] = 't';
      egal(m.soumettreEvaluation(idEval, codes).score, 50);
      egal(GDD.TraceurScorm12.statutScorm(m.statut()), 'failed');
      egal(m.soumettreEvaluation(idEval, bonnesReponses(module, idEval)).score, 100);
      codes['m01-q2'] = 'a';
      var r3 = m.soumettreEvaluation(idEval, codes);
      egal([r3.score, r3.meilleur], [25, 100]);
      egal(m.statut().reussite, 'reussi', 'une tentative moins bonne ne fait pas perdre la réussite');
      egal(m.resultatEvaluation(idEval).n, 3);
    });

    test('Seuil exact : 75 % >= 70 % réussi', function () {
      var m = new GDD.Moteur(module, new TraceurTest()); m.demarrer();
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      var codes = bonnesReponses(module, idEval); codes['m01-q4'] = 'a';
      egal(m.soumettreEvaluation(idEval, codes).score, 75);
      egal(m.statut().reussite, 'reussi');
    });

    test('Sauvegarde puis reprise de l\'état', function () {
      var t = new TraceurTest(); var m = new GDD.Moteur(module, t); m.demarrer();
      m.marquerVue(lecons[0].id); m.repondre('m01-a1', 'a,b'); m.definirPosition(1);
      var sauve = t.paquets[t.paquets.length - 1];
      egal(sauve.position, module.lecons[1].id);
      var m2 = new GDD.Moteur(module, new TraceurTest({ etat: sauve.etat })); m2.demarrer();
      vrai(m2.estVue(lecons[0].id)); egal(m2.reponseEnregistree('m01-a1'), 'a,b'); egal(m2.etat.p, 1);
    });

    test('Reprise robuste : identifiants inconnus et données corrompues ignorés', function () {
      var m = new GDD.Moteur(module, new TraceurTest({ etat: '{"v":1,"p":99,"s":["inconnue","m01-l1"],"a":{"x":"a"},"e":{}}' }));
      m.demarrer();
      egal(m.etat.s, ['m01-l1']); egal(m.etat.a, {}); egal(m.etat.p, module.lecons.length - 1);
      var m2 = new GDD.Moteur(module, new TraceurTest({ etat: 'pas du json' })); m2.demarrer();
      egal(m2.etat.s, []);
    });

    test('suspend_data : parcours complet bien sous la limite de 4096 caractères', function () {
      var m = new GDD.Moteur(module, new TraceurTest()); m.demarrer();
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      Object.keys(module.activites).forEach(function (id) { m.repondre(id, A.reponseAttendue(module.activites[id])); });
      m.soumettreEvaluation(idEval, bonnesReponses(module, idEval));
      var n = m.serialiser().length;
      /* Le tutorat ajoute un suivi par objectif ; conserver au moins 50 % de marge SCORM. */
      vrai(n < GDD.Moteur.LIMITE_ETAT / 2, n + ' caractères');
    });

    test('suspend_data : dégradation si la limite est dépassée', function () {
      var m = new GDD.Moteur(module, new TraceurTest()); m.demarrer();
      m.marquerVue(lecons[0].id);
      var gros = new Array(5000).join('x');
      m.etat.a['m01-a1'] = gros;
      var texte = m.serialiser();
      vrai(texte.length <= GDD.Moteur.LIMITE_ETAT, texte.length + ' caractères');
      vrai(JSON.parse(texte).s.length === 1, 'progression conservée');
    });

    test('Adaptateur SCORM 1.2 : initialisation, envoi, fermeture', function () {
      var api = new FausseApi({ 'cmi.core.lesson_status': 'not attempted', 'cmi.core.entry': 'ab-initio', 'cmi.core.lesson_mode': 'normal' });
      window.API = api;
      var tr = new GDD.TraceurScorm12();
      var m = new GDD.Moteur(module, tr);
      var info = m.demarrer();
      vrai(info.ok); egal(api.d['cmi.core.lesson_status'], 'incomplete');
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      m.soumettreEvaluation(idEval, bonnesReponses(module, idEval));
      egal(api.d['cmi.core.lesson_status'], 'passed');
      egal([api.d['cmi.core.score.raw'], api.d['cmi.core.score.min'], api.d['cmi.core.score.max']], ['100', '0', '100']);
      egal(api.d['cmi.interactions.0.id'], 'm01-q1');
      egal(api.d['cmi.interactions.2.type'], 'true-false');
      egal(api.d['cmi.interactions.1.student_response'], 'a,b');
      egal(api.d['cmi.interactions.3.result'], 'correct');
      vrai(api.d['cmi.suspend_data'].length > 0);
      m.terminer();
      vrai(/^\d{2,4}:\d{2}:\d{2}$/.test(api.d['cmi.core.session_time']), 'session_time ' + api.d['cmi.core.session_time']);
      egal(api.d['cmi.core.exit'], '', 'sortie normale une fois réussi');
      m.terminer();
      egal(api.journal.filter(function (x) { return x === 'finish'; }).length, 1, 'un seul LMSFinish');
      egal(api.journal.filter(function (x) { return x === 'init'; }).length, 1, 'un seul LMSInitialize');
      delete window.API;
    });

    test('Adaptateur SCORM 1.2 : sortie en cours -> suspend, puis reprise', function () {
      var api = new FausseApi({ 'cmi.core.lesson_status': 'not attempted', 'cmi.core.lesson_mode': 'normal' });
      window.API = api;
      var m = new GDD.Moteur(module, new GDD.TraceurScorm12()); m.demarrer();
      m.marquerVue(lecons[0].id); m.definirPosition(1); m.terminer();
      egal(api.d['cmi.core.exit'], 'suspend');
      egal(api.d['cmi.core.lesson_location'], module.lecons[1].id);
      var api2 = new FausseApi({ 'cmi.core.lesson_status': 'incomplete', 'cmi.core.entry': 'resume', 'cmi.core.lesson_mode': 'normal', 'cmi.suspend_data': api.d['cmi.suspend_data'] });
      window.API = api2;
      var m2 = new GDD.Moteur(module, new GDD.TraceurScorm12()); m2.demarrer();
      vrai(m2.estVue(lecons[0].id)); egal(m2.etat.p, 1);
      delete window.API;
    });

    test('Adaptateur SCORM 1.2 : mode consultation (review) sans écriture de résultats', function () {
      var api = new FausseApi({ 'cmi.core.lesson_status': 'passed', 'cmi.core.lesson_mode': 'review' });
      window.API = api;
      var m = new GDD.Moteur(module, new GDD.TraceurScorm12()); var info = m.demarrer();
      vrai(info.lectureSeule);
      m.marquerVue(lecons[0].id); m.terminer();
      egal(api.d['cmi.core.lesson_status'], 'passed');
      vrai(api.d['cmi.suspend_data'] === undefined, 'aucune écriture');
      delete window.API;
    });

    test('Adaptateur SCORM 1.2 : absence d\'API détectée', function () {
      delete window.API;
      var info = new GDD.TraceurScorm12().init();
      egal([info.ok, info.raison], [false, 'api-introuvable']);
    });
  }

  /* Module 2 : défi sans seuil de réussite -> statut « completed » quel que soit le score. */
  function lancerModule2(module) {
    var idEval = module.validation.evaluation;
    var lecons = module.lecons.filter(function (l) { return l.type === 'lecon'; });

    test('M2 : chaque activité accepte sa réponse attendue', function () {
      Object.keys(module.activites).forEach(function (id) {
        var act = module.activites[id];
        vrai(A.corriger(act, A.reponseAttendue(act)).correct, id);
      });
    });

    test('M2 : bonnes réponses du défi conformes au scénario (B, A, C)', function () {
      egal(bonnesReponses(module, idEval), { 'm02-q1': 'b', 'm02-q2': 'a', 'm02-q3': 'c' });
    });

    test('M2 : défi réussi à 3/3 -> terminé, sans réussite/échec, score 100', function () {
      var m = new GDD.Moteur(module, new TraceurTest()); m.demarrer();
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      var r = m.soumettreEvaluation(idEval, bonnesReponses(module, idEval));
      egal([r.bonnes, r.total, r.score], [3, 3, 100]);
      var s = m.statut();
      egal([s.completion, s.reussite, s.score, s.seuil, s.progression], ['termine', 'inconnue', 100, null, 100]);
      egal(GDD.TraceurScorm12.statutScorm(s), 'completed');
    });

    test('M2 : défi à 0/3 -> toujours completed (jamais failed), score 0', function () {
      var m = new GDD.Moteur(module, new TraceurTest()); m.demarrer();
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      var r = m.soumettreEvaluation(idEval, { 'm02-q1': 'a', 'm02-q2': 'b', 'm02-q3': 'a' });
      egal(r.score, 0);
      egal(GDD.TraceurScorm12.statutScorm(m.statut()), 'completed');
    });

    test('M2 : leçons vues sans défi -> incomplete', function () {
      var m = new GDD.Moteur(module, new TraceurTest()); m.demarrer();
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      egal(GDD.TraceurScorm12.statutScorm(m.statut()), 'incomplete');
    });

    test('M2 : adaptateur SCORM 1.2 -> completed, score brut, 3 interactions, sortie normale', function () {
      var api = new FausseApi({ 'cmi.core.lesson_status': 'not attempted', 'cmi.core.entry': 'ab-initio', 'cmi.core.lesson_mode': 'normal' });
      window.API = api;
      var m = new GDD.Moteur(module, new GDD.TraceurScorm12()); m.demarrer();
      lecons.forEach(function (l) { m.marquerVue(l.id); });
      var codes = bonnesReponses(module, idEval); codes['m02-q3'] = 'b';
      m.soumettreEvaluation(idEval, codes);
      egal(api.d['cmi.core.lesson_status'], 'completed');
      egal([api.d['cmi.core.score.raw'], api.d['cmi.core.score.min'], api.d['cmi.core.score.max']], ['67', '0', '100']);
      egal(api.d['cmi.interactions.2.id'], 'm02-q3');
      egal(api.d['cmi.interactions.2.result'], 'wrong');
      m.terminer();
      egal(api.d['cmi.core.exit'], '', 'sortie normale une fois terminé');
      delete window.API;
    });

    test('M2 : reprise après interruption en leçon 2', function () {
      var t = new TraceurTest(); var m = new GDD.Moteur(module, t); m.demarrer();
      m.marquerVue(lecons[0].id); m.repondre('m02-a1', 'f'); m.definirPosition(1);
      var m2 = new GDD.Moteur(module, new TraceurTest({ etat: t.paquets[t.paquets.length - 1].etat })); m2.demarrer();
      vrai(m2.estVue(lecons[0].id)); egal(m2.etat.p, 1); vrai(!m2.estAccessible(3), 'défi verrouillé');
    });
  }

  function afficher() {
    var ol = document.getElementById('resultats');
    var echecs = 0;
    resultats.forEach(function (r) {
      var li = document.createElement('li');
      li.className = r.ok ? 'ok' : 'ko';
      li.textContent = (r.ok ? '✓ ' : '✗ ') + r.nom + (r.ok ? '' : ' : ' + r.message);
      if (!r.ok) { echecs++; }
      ol.appendChild(li);
    });
    var resume = document.getElementById('resume');
    resume.textContent = (resultats.length - echecs) + ' / ' + resultats.length + ' tests réussis';
    resume.className = echecs ? 'ko' : 'ok';
    window.RESULTATS_TESTS = { total: resultats.length, echecs: echecs, details: resultats };
  }

  function charger(fichier) {
    return fetch('../contenus/modules/' + fichier).then(function (r) { return r.json(); });
  }
  Promise.all([charger('module-01.json'), charger('module-02.json')])
    .then(function (mods) { lancer(mods[0]); lancerModule2(mods[1]); afficher(); })
    .catch(function (e) { document.getElementById('resume').textContent = 'Impossible de charger le contenu : ' + e.message; });
})();
