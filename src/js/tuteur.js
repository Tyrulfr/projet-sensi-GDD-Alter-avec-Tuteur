/* GovTutor : suivi observable par objectif, sans état latent ni appel LLM. */
(function (root) {
  'use strict';
  var GDD = root.GDD = root.GDD || {};
  var ACTIONS = ['DIAGNOSE', 'SOCRATIC_QUESTION', 'HINT_SMALL', 'HINT_STRONG',
    'EXPLAIN_CONCEPT', 'WORKED_EXAMPLE', 'PRACTICE_SAME', 'PRACTICE_EASIER',
    'PRACTICE_HARDER', 'REVIEW_PREREQUISITE', 'RETRIEVAL_QUIZ', 'SUMMARIZE'];
  var SKILLS = ['strategy', 'roles', 'metadata', 'catalog', 'quality', 'lineage',
    'classification', 'access', 'privacy', 'retention', 'mdm', 'sharing'];
  var T = GDD.tuteur = { actions: ACTIONS, mode: 'rules' };

  function banque() { return (root.GDD_CONTENU && root.GDD_CONTENU.tutorat || {}).objectifs || {}; }
  function etat() { return { v: 1, o: {}, h: [] }; }
  function objectifVide() { return { n: 0, c: 0, e: 0, r: 0, h: 0, a: -1, d: false, p: "rules", q: {} }; }
  T.etatVide = etat;
  T.banque = banque;

  T.restaurer = function (module, brut) {
    var out = etat();
    if (!brut || brut.v !== 1 || !brut.o || typeof brut.o !== 'object') { return out; }
    module.objectifsSpecifiques.forEach(function (objectif) {
      var old = brut.o[objectif.id];
      if (!old || typeof old !== 'object') { return; }
      var s = objectifVide();
      ['n', 'c', 'e', 'r', 'h'].forEach(function (k) {
        s[k] = Number.isFinite(old[k]) ? Math.max(0, Math.min(999, Math.floor(old[k]))) : 0;
      });
      s.a = Number.isInteger(old.a) && old.a >= 0 && old.a < ACTIONS.length ? old.a : -1;
      s.c = Math.min(s.c, s.n);
      s.e = Math.min(s.e, s.n);
      s.r = Math.min(s.r, s.n);
      s.d = old.d === true;
      s.p = old.p === "rl" ? "rl" : "rules";
      var b = banque()[objectif.id];
      var ids = Object.keys(module.activites).filter(function (id) { return module.activites[id].objectif === objectif.id; });
      if (b) { ids = ids.concat(b.questions.map(function (q) { return q.id; })); }
      ids.forEach(function (id) {
        if (old.q && typeof old.q[id] === 'boolean') { s.q[id] = old.q[id]; }
      });
      out.o[objectif.id] = s;
    });
    if (Array.isArray(brut.h)) {
      out.h = brut.h.filter(function (event) {
        return Array.isArray(event) && out.o[event[0]] && typeof event[1] === 'string' && event[1].length < 80 && typeof event[2] === 'boolean';
      }).slice(-12).map(function (event) {
        return [event[0], event[1], event[2], ['formatif', 'evaluation', 'accompagnement'].indexOf(event[3]) >= 0 ? event[3] : 'inconnu'];
      });
    }
    return out;
  };

  T.statistiques = function (m, oid) {
    var s = m.etat.t && m.etat.t.o[oid] || objectifVide();
    var ids = Object.keys(s.q);
    var corrects = ids.filter(function (id) { return s.q[id]; }).length;
    return { donnees: s, distinctes: ids.length, correctes: corrects,
      estimation: (corrects + 1) / (ids.length + 2),
      libelle: !ids.length ? 'Pas encore observé' : (s.e ? 'À retravailler' : (corrects >= 2 ? 'Réussites à confirmer dans le temps' : 'Première réussite à confirmer')) };
  };

  T.observation = function (m, oid) {
    var stats = T.statistiques(m, oid), s = stats.donnees, b = banque()[oid];
    var total = Object.keys(m.etat.t.o).reduce(function (n, k) { return n + m.etat.t.o[k].n; }, 0);
    var prereq = b && b.prerequis ? T.statistiques(m, b.prerequis).estimation : 1;
    var skill = b ? Math.max(0, SKILLS.indexOf(b.competenceRL)) : 0;
    return [stats.estimation, 1 / Math.sqrt(stats.distinctes + 1), prereq,
      s.n ? s.c / s.n : .5, 0, s.h / 14, (s.n - s.c) / 14,
      total / 14, s.a < 0 ? 0 : s.a / 11, skill / 11, s.d ? 1 : 0].map(function (x) { return Math.min(1, Math.max(0, x)); });
  };

  T.masque = function (m, oid) {
    var o = T.observation(m, oid), b = banque()[oid];
    return ACTIONS.map(function (_, i) {
      if (i === 8) { return o[0] >= .6; }
      if (i === 9) { return !!(b && b.prerequis); }
      if (i === 10) { return T.statistiques(m, oid).donnees.n > 0; }
      if (i === 11) { return o[7] >= 3 / 14; }
      return true;
    });
  };

  T.regles = function (o, mask) {
    var action;
    if (!o[10] && (o[6] > 0 || o[1] > .6)) { action = 0; }
    else if (o[2] < .40 && o[0] < .55) { action = 9; }
    else if (o[0] < .35) { action = o[5] > .15 ? 4 : 5; }
    else if (o[0] < .58) { action = o[3] < .5 ? 2 : 6; }
    else if (o[0] >= .70 && o[7] > .70) { action = 11; }
    else if (o[0] >= .68) { action = 8; }
    else { action = 10; }
    return mask[action] ? action : mask.indexOf(true);
  };

  T.enregistrerAction = function (m, oid, action, policy) {
    var s = m.etat.t.o[oid];
    if (!s) { return; }
    s.a = action;
    s.p = policy || "rules";
    if (action === 0) { s.d = true; }
    if (action === 2 || action === 3) { s.h = Math.min(999, s.h + 1); }
  };

  T.observer = function (m, id, activite, code, source) {
    var oid = activite.objectif;
    if (!m.module.objectifsSpecifiques.some(function (o) { return o.id === oid; })) { return; }
    if (!m.etat.t) { m.etat.t = etat(); }
    var s = m.etat.t.o[oid] || (m.etat.t.o[oid] = objectifVide());
    var correct = GDD.activites.corriger(activite, code).correct;
    s.n = Math.min(999, s.n + 1);
    s.c = Math.min(s.n, s.c + (correct ? 1 : 0));
    s.e = correct ? 0 : Math.min(999, s.e + 1);
    s.r = correct ? Math.min(999, s.r + 1) : 0;
    s.q[id] = correct;
    m.etat.t.h.push([oid, id, correct, source]);
    m.etat.t.h = m.etat.t.h.slice(-12);
    T.enregistrerAction(m, oid, T.regles(T.observation(m, oid), T.masque(m, oid)));
  };

  T.question = function (m, oid, action) {
    var b = banque()[oid];
    if (!b) { return null; }
    var s = T.statistiques(m, oid), difficult = action === 8 || (s.estimation >= .65 && action !== 7);
    var disponibles = b.questions.slice();
    if (s.donnees.e > 0 || action === 7) {
      var minimum = Math.min.apply(null, disponibles.map(function (q) { return q.difficulte; }));
      disponibles = disponibles.filter(function (q) { return q.difficulte === minimum; });
    }
    var questions = disponibles.sort(function (a, bq) {
      var avu = Object.prototype.hasOwnProperty.call(s.donnees.q, a.id);
      var bvu = Object.prototype.hasOwnProperty.call(s.donnees.q, bq.id);
      if (avu !== bvu) { return avu ? 1 : -1; }
      return difficult ? bq.difficulte - a.difficulte : a.difficulte - bq.difficulte;
    });
    return questions[0] || null;
  };

  T.decision = function (m, oid) {
    var o = T.observation(m, oid), mask = T.masque(m, oid);
    var local = { action: T.regles(o, mask), politique: 'rules' };
    var s = T.statistiques(m, oid).donnees;
    if (s.p === "rules" && s.a >= 0 && mask[s.a]) { local.action = s.a; }
    if (T.mode !== 'rl') { return Promise.resolve(local); }
    var controller = new AbortController();
    var timeout = root.setTimeout(function () { controller.abort(); }, 4000);
    return root.fetch('/api/tutor/recommend', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observation: o, mask: mask }), signal: controller.signal
    }).then(function (r) { if (!r.ok) { throw new Error('Service indisponible'); } return r.json(); })
      .then(function (r) {
        if (!Number.isInteger(r.action) || !mask[r.action] || r.policy !== 'rl') { throw new Error('Décision invalide'); }
        return { action: r.action, politique: 'rl' };
      }).catch(function () { return { action: local.action, politique: 'rules', secours: true }; })
      .finally(function () { root.clearTimeout(timeout); });
  };
})(typeof window !== 'undefined' ? window : this);
