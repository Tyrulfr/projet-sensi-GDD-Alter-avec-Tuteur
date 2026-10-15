/*
 * Moteur de parcours d'un module : navigation, progression, réponses, notation,
 * statut. Il ne connaît ni le DOM ni SCORM : il délègue l'enregistrement à un
 * « traceur » (voir suivi-local.js et suivi-scorm12.js) qui expose :
 *   init() -> { ok, sauvegarde: { etat, position } | null, apprenant, lectureSeule }
 *   enregistrer(paquet) -> booléen
 *   valider() -> booléen        (commit)
 *   terminer(statut) -> booléen (fin de session)
 */
(function (root) {
  'use strict';
  var GDD = root.GDD = root.GDD || {};
  var A = GDD.activites;

  var VERSION_ETAT = 1;
  /* cmi.suspend_data est limité à 4096 caractères en SCORM 1.2. */
  var LIMITE_ETAT = 4096;

  function etatVide() {
    return { v: VERSION_ETAT, p: 0, s: [], a: {}, e: {}, t: GDD.tuteur ? GDD.tuteur.etatVide() : null };
  }

  function Moteur(module, traceur) {
    this.module = module;
    this.traceur = traceur;
    this.lecons = module.lecons;
    this.etat = etatVide();
    this.interactionsEnAttente = [];
    this.ferme = false;
  }

  Moteur.LIMITE_ETAT = LIMITE_ETAT;

  Moteur.prototype.demarrer = function () {
    var info = this.traceur.init() || { ok: false };
    this.infoSuivi = info;
    if (info.sauvegarde && info.sauvegarde.etat) {
      this.restaurer(info.sauvegarde.etat);
    }
    return info;
  };

  /* Restaure un état sérialisé en ignorant les éléments inconnus (contenu modifié entre deux sessions). */
  Moteur.prototype.restaurer = function (texte) {
    var brut;
    try { brut = typeof texte === 'string' ? JSON.parse(texte) : texte; } catch (e) { return false; }
    if (!brut || brut.v !== VERSION_ETAT) { return false; }
    var self = this;
    var etat = etatVide();
    etat.p = Math.min(Math.max(parseInt(brut.p, 10) || 0, 0), this.lecons.length - 1);
    (brut.s || []).forEach(function (id) {
      if (self.indexLecon(id) >= 0 && etat.s.indexOf(id) < 0) { etat.s.push(id); }
    });
    Object.keys(brut.a || {}).forEach(function (id) {
      if (self.module.activites[id]) { etat.a[id] = String(brut.a[id]); }
    });
    Object.keys(brut.e || {}).forEach(function (id) {
      var e = brut.e[id];
      if (self.indexLecon(id) >= 0 && e && typeof e.b === 'number') {
        etat.e[id] = { b: e.b, d: typeof e.d === 'number' ? e.d : e.b, n: parseInt(e.n, 10) || 1, r: e.r || {} };
      }
    });
    etat.t = GDD.tuteur ? GDD.tuteur.restaurer(this.module, brut.t) : null;
    this.etat = etat;
    return true;
  };

  Moteur.prototype.serialiser = function () {
    var copie = JSON.parse(JSON.stringify(this.etat));
    var texte = JSON.stringify(copie);
    if (texte.length > LIMITE_ETAT && copie.t) {
      copie.t.h = [];
      texte = JSON.stringify(copie);
    }
    /* Dégradation progressive si la limite SCORM est dépassée. */
    if (texte.length > LIMITE_ETAT) {
      Object.keys(copie.e).forEach(function (id) { copie.e[id].r = {}; });
      texte = JSON.stringify(copie);
    }
    if (texte.length > LIMITE_ETAT) {
      copie.a = {};
      texte = JSON.stringify(copie);
    }
    return texte;
  };

  Moteur.prototype.indexLecon = function (id) {
    for (var i = 0; i < this.lecons.length; i++) { if (this.lecons[i].id === id) { return i; } }
    return -1;
  };

  Moteur.prototype.leconsObligatoires = function () {
    var obligatoire = this.module.validation.leconsObligatoires !== false;
    return this.lecons.filter(function (l) {
      return l.type === 'lecon' && obligatoire && l.obligatoire !== false;
    });
  };

  Moteur.prototype.estVue = function (id) {
    return this.etat.s.indexOf(id) >= 0;
  };

  Moteur.prototype.estAccessible = function (index) {
    if (this.module.validation.navigation !== 'sequentielle') { return true; }
    for (var i = 0; i < index; i++) {
      var l = this.lecons[i];
      if (l.type === 'lecon' && l.obligatoire !== false && !this.estVue(l.id)) { return false; }
    }
    return true;
  };

  Moteur.prototype.definirPosition = function (index) {
    if (this.etat.p !== index) {
      this.etat.p = index;
      this.sauvegarder();
    }
  };

  Moteur.prototype.marquerVue = function (id) {
    if (!this.estVue(id)) {
      this.etat.s.push(id);
      this.sauvegarder();
    }
  };

  Moteur.prototype.reponseEnregistree = function (idActivite) {
    return this.etat.a[idActivite] || null;
  };

  /* Activité formative : correction immédiate, pas de note. */
  Moteur.prototype.repondre = function (idActivite, code) {
    var activite = this.module.activites[idActivite];
    var resultat = A.corriger(activite, code);
    this.etat.a[idActivite] = code;
    if (GDD.tuteur) { GDD.tuteur.observer(this, idActivite, activite, code, "formatif"); }
    this.sauvegarder();
    return resultat;
  };

  Moteur.prototype.oublierReponse = function (idActivite) {
    delete this.etat.a[idActivite];
    this.sauvegarder();
  };

  Moteur.prototype.resultatEvaluation = function (idLecon) {
    return this.etat.e[idLecon] || null;
  };

  /* Évaluation notée : codes = { idQuestion: reponseEncodee }. */
  Moteur.prototype.soumettreEvaluation = function (idLecon, codes) {
    var self = this;
    var lecon = this.lecons[this.indexLecon(idLecon)];
    var total = 0, obtenu = 0, bonnes = 0;
    var items = lecon.activites.map(function (idQ) {
      var q = self.module.activites[idQ];
      var points = (q.notation && q.notation.points) || 1;
      var res = A.corriger(q, codes[idQ]);
      total += points;
      if (res.correct) { obtenu += points; bonnes++; }
      return { id: idQ, activite: q, code: codes[idQ], correct: res.correct, details: res.details, points: points };
    });
    var score = total ? Math.round((obtenu / total) * 100) : 0;
    var precedent = this.etat.e[idLecon];
    this.etat.e[idLecon] = {
      b: precedent ? Math.max(precedent.b, score) : score,
      d: score,
      n: precedent ? precedent.n + 1 : 1,
      r: codes
    };
    var maintenant = new Date();
    items.forEach(function (it) {
      if (GDD.tuteur) { GDD.tuteur.observer(self, it.id, it.activite, it.code, "evaluation"); }
      self.interactionsEnAttente.push({
        id: it.id,
        type: A.typeScorm(it.activite),
        reponse: it.code,
        attendu: A.reponseAttendue(it.activite),
        resultat: it.correct ? 'correct' : 'wrong',
        poids: it.points,
        date: maintenant,
        objectif: it.activite.objectif
      });
    });
    this.marquerVue(idLecon);
    this.sauvegarder();
    return { score: score, meilleur: this.etat.e[idLecon].b, bonnes: bonnes, total: items.length, items: items };
  };

  /*
   * Statut du module.
   *   completion : 'non-commence' | 'en-cours' | 'termine'
   *   reussite   : 'inconnue' | 'reussi' | 'echoue'
   */
  Moteur.prototype.statut = function () {
    var self = this;
    var obligatoires = this.leconsObligatoires();
    var vues = obligatoires.filter(function (l) { return self.estVue(l.id); }).length;
    var idEval = this.module.validation.evaluation;
    var resEval = idEval ? this.etat.e[idEval] : null;
    var seuil = this.module.validation.seuilReussite;
    var commence = this.etat.s.length > 0 || Object.keys(this.etat.a).length > 0 || this.etat.p > 0;

    var completion = 'non-commence';
    if (commence) { completion = 'en-cours'; }
    if (vues === obligatoires.length && (!idEval || resEval)) { completion = 'termine'; }

    /* Sans seuil, le module est seulement « terminé » (completed) ; le score reste enregistré. */
    var avecSeuil = typeof seuil === 'number';
    var reussite = 'inconnue';
    if (completion === 'termine' && idEval && resEval && avecSeuil) {
      reussite = resEval.b >= seuil ? 'reussi' : 'echoue';
    }
    return {
      completion: completion,
      reussite: reussite,
      score: resEval ? resEval.b : null,
      seuil: avecSeuil ? seuil : null,
      vues: vues,
      obligatoires: obligatoires.length,
      progression: Math.round(((vues + (resEval ? 1 : 0)) / (obligatoires.length + (idEval ? 1 : 0))) * 100)
    };
  };

  Moteur.prototype.sauvegarder = function () {
    if (this.ferme) { return false; }
    var paquet = {
      etat: this.serialiser(),
      position: this.lecons[this.etat.p].id,
      statut: this.statut(),
      interactions: this.interactionsEnAttente.splice(0)
    };
    var ok = this.traceur.enregistrer(paquet);
    this.traceur.valider();
    return ok;
  };

  Moteur.prototype.terminer = function () {
    if (this.ferme) { return true; }
    this.sauvegarder();
    this.ferme = true;
    return this.traceur.terminer(this.statut());
  };

  Moteur.prototype.reinitialiser = function () {
    this.etat = etatVide();
    this.sauvegarder();
  };

  GDD.Moteur = Moteur;
})(typeof window !== 'undefined' ? window : this);
