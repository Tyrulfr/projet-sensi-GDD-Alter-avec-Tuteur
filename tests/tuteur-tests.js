/* Integration tests with the real course, correction engine and persistence. */
(function () {
  'use strict';
  var GDD = window.GDD, T = GDD.tuteur, A = GDD.activites;
  var details = [];
  function assert(value, message) { if (!value) { throw new Error(message || 'Assertion échouée'); } }
  function test(nom, fn) {
    try { fn(); details.push({ nom: nom, ok: true }); }
    catch (e) { details.push({ nom: nom, ok: false, message: e.message }); }
  }
  function traceur(sauvegarde) {
    return { init: function () { return { ok: true, sauvegarde: sauvegarde }; },
      enregistrer: function () { return true; }, valider: function () { return true; }, terminer: function () { return true; } };
  }
  function moteur(id, saved) {
    var m = new GDD.Moteur(window.GDD_CONTENU.modules[id || 'm01'], traceur(saved)); m.demarrer(); return m;
  }
  test('Chaque objectif a deux exercices séparés des évaluations', function () {
    Object.keys(T.banque()).forEach(function (oid) {
      var b = T.banque()[oid]; assert(b.questions.length >= 2);
      b.questions.forEach(function (q) { assert(A.corriger(q, A.reponseAttendue(q)).correct); });
    });
  });
  test('Une réponse formative alimente uniquement son objectif', function () {
    var m = moteur(), q = m.module.activites['m01-a1'];
    m.repondre('m01-a1', A.reponseAttendue(q));
    assert(T.statistiques(m, 'os1-1').distinctes === 1);
    assert(T.statistiques(m, 'os1-2').distinctes === 0);
  });
  test('Une erreur produit un état à retravailler', function () {
    var m = moteur(); m.repondre('m01-a1', 'd');
    assert(T.statistiques(m, 'os1-1').libelle === 'À retravailler');
    assert(m.etat.t.o['os1-1'].e === 1);
  });
  test('Répéter la même bonne réponse ne simule pas de nouvelles preuves', function () {
    var m = moteur(), q = m.module.activites['m01-a1'];
    for (var i = 0; i < 10; i++) { m.repondre('m01-a1', A.reponseAttendue(q)); }
    assert(T.statistiques(m, 'os1-1').distinctes === 1);
    assert(T.statistiques(m, 'os1-1').libelle !== 'Réussites à confirmer dans le temps');
  });
  test('Réessayer conserve l’historique des erreurs', function () {
    var m = moteur(); m.repondre('m01-a1', 'd'); m.oublierReponse('m01-a1');
    assert(m.etat.t.o['os1-1'].n === 1 && m.etat.t.h.length === 1);
  });
  test('Le tutorat ne change pas la note ou le nombre de tentatives du quiz', function () {
    var m = moteur(); var q = T.banque()['os1-1'].questions[0];
    var avant = JSON.stringify(m.etat.e);
    T.observer(m, q.id, q, A.reponseAttendue(q), 'accompagnement'); m.sauvegarder();
    assert(JSON.stringify(m.etat.e) === avant);
    assert(m.statut().score === null);
  });
  test('Soumettre une évaluation observe chaque réponse une fois', function () {
    var m = moteur(), l = m.module.lecons.filter(function (l) { return l.type === 'evaluation'; })[0];
    var codes = {};
    l.activites.forEach(function (id) { codes[id] = A.reponseAttendue(m.module.activites[id]); });
    m.soumettreEvaluation(l.id, codes);
    assert(m.etat.t.h.length === l.activites.length);
    m.statut(); m.statut(); assert(m.etat.t.h.length === l.activites.length);
  });
  test('Le suivi et les essais sont restaurés entre deux séances', function () {
    var m = moteur(); m.repondre('m01-a1', 'd');
    var saved = moteur('m01', { etat: m.serialiser() });
    assert(saved.etat.t.o['os1-1'].n === 1 && saved.etat.t.h.length === 1);
  });
  test('Une ancienne sauvegarde sans tutorat reste lisible', function () {
    var m = moteur('m01', { etat: JSON.stringify({ v: 1, p: 0, s: [], a: {}, e: {} }) });
    assert(m.etat.t.v === 1 && Object.keys(m.etat.t.o).length === 0);
  });
  test('Les observations et masques respectent le contrat PPO', function () {
    var m = moteur(); m.repondre('m01-a1', 'd');
    var o = T.observation(m, 'os1-1'), mask = T.masque(m, 'os1-1');
    assert(o.length === 11 && o.every(function (v) { return Number.isFinite(v) && v >= 0 && v <= 1; }));
    assert(mask.length === 12 && mask.some(Boolean) && !mask[8] && !mask[9]);
    assert(mask[T.regles(o, mask)]);
  });
  test('La question suivante varie avec les réussites et la difficulté', function () {
    var m = moteur(), b = T.banque()['os1-1'];
    var simple = T.question(m, 'os1-1', 7); assert(simple.difficulte === 1);
    var difficile = T.question(m, 'os1-1', 8); assert(difficile.difficulte === 2);
    T.observer(m, simple.id, simple, A.reponseAttendue(simple), 'accompagnement');
    assert(T.question(m, 'os1-1', 6).id === b.questions[1].id);
  });
  test('Une erreur maintient un exercice simple avant de monter en difficulté', function () {
    var m = moteur(); var q = T.banque()['os1-1'].questions[0];
    T.observer(m, q.id, q, q.reponse === '0' ? '1' : '0', 'accompagnement');
    assert(T.question(m, 'os1-1', 6).difficulte === 1);
  });
  test('Historique borné et état sous la limite SCORM sur une longue séance', function () {
    ['m01', 'm02'].forEach(function (id) {
      var m = moteur(id);
      for (var i = 0; i < 100; i++) {
        Object.keys(m.module.activites).forEach(function (qid) {
          m.repondre(qid, A.reponseAttendue(m.module.activites[qid]));
        });
      }
      assert(m.etat.t.h.length <= 12);
      assert(m.serialiser().length <= GDD.Moteur.LIMITE_ETAT, 'État trop long : ' + m.serialiser().length);
    });
  });
  test('Une question inconnue ne peut pas créer une preuve dans la sauvegarde', function () {
    var m = moteur(); m.repondre('m01-a1', 'd');
    m.etat.t.o['os1-1'].q.inconnue = true;
    var restored = moteur('m01', { etat: m.serialiser() });
    assert(!Object.prototype.hasOwnProperty.call(restored.etat.t.o['os1-1'].q, 'inconnue'));
  });
  test('La réinitialisation efface aussi le suivi du tuteur', function () {
    var m = moteur(); m.repondre('m01-a1', 'd'); m.reinitialiser();
    assert(Object.keys(m.etat.t.o).length === 0 && !m.etat.t.h.length);
  });
  test('Chaque nouvelle décision locale respecte les masques', function () {
    var m = moteur();
    Object.keys(m.module.activites).forEach(function (id) {
      var q = m.module.activites[id]; m.repondre(id, A.reponseAttendue(q));
      assert(T.masque(m, q.objectif)[m.etat.t.o[q.objectif].a]);
    });
  });
  var echecs = details.filter(function (r) { return !r.ok; }).length;
  document.getElementById('resume-tuteur').textContent = (details.length - echecs) + ' / ' + details.length + ' tests du tuteur réussis';
  details.forEach(function (r) {
    var li = document.createElement('li'); li.className = r.ok ? 'ok' : 'ko';
    li.textContent = (r.ok ? '✓ ' : '✗ ') + r.nom + (r.ok ? '' : ' : ' + r.message);
    document.getElementById('resultats-tuteur').appendChild(li);
  });
  window.RESULTATS_TUTEUR = { total: details.length, echecs: echecs, details: details };
})();
