/* =========================================================
   CO-ÉVALUATION BAC — ÉPREUVE D'EXEMPLE
   Classe fictive de 26 élèves (TG2) pour découvrir l'application :
   préparation AFL2/AFL3 faite, fiches AFL1 à tous les stades,
   évaluations d'un collègue fictif et cas variés à harmoniser.
   Données reproductibles (générateur pseudo-aléatoire à graine fixe).
   ========================================================= */

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./coeval-core.js"));
  else root.CoEvalDemo = factory(root.CoEvalCore);
})(typeof self !== "undefined" ? self : this, C => {
  "use strict";

  const COLLEAGUE = "Collègue (exemple)";
  const CLASSROOM = "TG2";
  const NAMES = [
    "ARNAUD Léo", "BENALI Yasmine", "BERNARD Inès", "BLANC Théo", "CHEVALIER Manon", "COLIN Maxime",
    "DIALLO Aminata", "DUBOIS Lucas", "DUPONT Léa", "FAURE Nathan", "FONTAINE Chloé", "GARNIER Enzo",
    "GIRARD Camille", "HADDAD Rayan", "LAMBERT Jade", "LEFEBVRE Tom", "LEROY Sarah", "MARTIN Hugo",
    "MARTINEZ Lina", "MOREAU Noah", "NGUYEN Emma", "PERRIN Louis", "PETIT Zoé", "ROUSSEAU Adam",
    "TRAN Mila", "VINCENT Jules"
  ];
  const AFL1 = C.AFL1_IDS;

  function rng(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeDemo(me, now = Date.now()) {
    const rand = rng(2026);
    const pick = list => list[Math.floor(rand() * list.length)];
    const day = 86400000;
    const ep = {
      id:C.uid(), title:"EXEMPLE · Bac Musculation · TG2 (26 élèves)", createdAt:now - 14 * day,
      candidates:NAMES.map(name => ({id:C.uid(), name, classroom:CLASSROOM})),
      mine:{}, others:{}, final:{}, history:[], demo:true
    };
    ep.candidates.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const set = (ev, id, deg, v) => {
      const cr = C.critById(id);
      const steps = C.stepsOf(cr.deg[deg - 1]);
      ev.v[id] = v ?? steps[Math.floor(rand() * steps.length)];
      ev.d[id] = deg;
    };
    const clamp = d => Math.max(1, Math.min(4, d));
    const rows = {};

    ep.candidates.forEach((c, i) => {
      if (i >= 24) return;   // deux élèves sans aucune donnée (absents à la préparation)
      const level = pick([2, 3, 3, 3, 4, 4]);
      const degOf = () => clamp(level + pick([-1, 0, 0, 0, 1]));
      const mine = {
        split:pick(["4-4", "4-4", "6-2", "2-6"]), theme:pick(["1", "2", "3"]), role:pick(["partenaire", "juge"]),
        v:{}, d:{}, comment:"", updatedAt:now - 7 * day, done:false
      };
      // Préparation : AFL2 et AFL3 évalués avant l'épreuve.
      C.PREP_CRITS.forEach(id => set(mine, id, Math.max(2, degOf())));
      // Jour de l'épreuve : AFL1 terminé (0-17), complet (18-20), partiel (21-23).
      const afl1 = i < 21 ? AFL1 : AFL1.slice(0, 3);
      afl1.forEach(id => set(mine, id, degOf()));
      if (i < 21) mine.updatedAt = now - 2 * 3600000 + i * 60000;
      if (i < 18) {
        mine.done = true;
        mine.doneAt = mine.updatedAt;
        mine.initial = {split:mine.split, theme:mine.theme, role:mine.role, v:{...mine.v}, d:{...mine.d}, comment:"", at:mine.doneAt};
      }
      ep.mine[c.id] = mine;

      // Collègue : terminé (0-19), partiel (20-21), rien ensuite.
      if (i > 21) return;
      const col = {split:mine.split, theme:mine.theme, role:mine.role, v:{}, d:{}, comment:"", updatedAt:now - 3600000 + i * 60000, done:i < 20};
      C.PREP_CRITS.forEach(id => { col.v[id] = mine.v[id]; col.d[id] = mine.d[id]; });
      (i < 20 ? AFL1 : AFL1.slice(0, 2)).forEach(id => {
        const cr = C.critById(id);
        const deg = mine.d[id] || degOf();
        const steps = C.stepsOf(cr.deg[deg - 1]);
        const base = mine.v[id] ?? pick(steps);
        const k = steps.indexOf(base);
        // Le plus souvent la même note, parfois un quart de point d'écart dans le même degré.
        const v = rand() < .7 ? base : steps[Math.max(0, Math.min(steps.length - 1, k + pick([-1, 1])))];
        set(col, id, deg, v);
      });
      rows[C.normName(c.name)] = col;
    });

    // Cas à harmoniser, placés sur des élèves précis.
    const cand = i => ep.candidates[i];
    const both = i => [ep.mine[cand(i).id], rows[C.normName(cand(i).name)]];
    const force = (i, id, [dm, vm], [dc, vc]) => { const [m, c] = both(i); set(m, id, dm, vm); set(c, id, dc, vc); };
    force(2, "post", [3, 1.5], [4, 2]);                        // désaccord de degré
    force(4, "param", [2, 2], [4, 3.5]);                       // désaccord majeur (2 degrés)
    force(6, "param", [4, 3.25], [4, 4]);                      // écart de points (même degré)
    force(8, "resp", [3, .75], [4, .75]);                      // même note, degrés différents (borne partagée)
    force(10, "ress", [2, 1], [3, 1.5]);                       // désaccord de degré…
    force(10, "regul", [4, 1.5], [4, 2]);                      // … et écart de points
    force(12, "amp", [3, .5], [4, .75]);                       // même total, degrés différents
    force(12, "resp", [4, 1], [4, .75]);
    both(14)[1].split = both(14)[0].split === "6-2" ? "4-4" : "6-2";   // répartitions différentes
    both(3)[1].comment = "Très bonne régulation des charges, juge fiable.";
    both(4)[1].comment = "Charges installées sans parade sur la dernière série.";
    ep.mine[cand(4).id].comment = "Paramètres peu cohérents avec le thème choisi.";
    [2, 3, 4, 6, 8, 10, 12, 14].forEach(i => {
      const m = ep.mine[cand(i).id];
      if (m.initial) m.initial = {split:m.split, theme:m.theme, role:m.role, v:{...m.v}, d:{...m.d}, comment:m.comment, at:m.doneAt};
    });

    ep.others[COLLEAGUE] = {at:now - 3600000, batch:"", rows, parts:null, lastAt:now - 3600000};

    // Une note déjà validée et un désaccord déjà tranché, pour voir l'historique.
    const validate = i => {
      const c = cand(i);
      const h = C.harmonize(C.entriesFor(ep, c, me), ep.final[c.id]);
      if (h.blockers.length) return;
      ep.final[c.id] = {crit:{}, choice:{}, validated:{...C.makeValidation(h, me), at:now - 1800000}, updatedAt:now - 1800000};
      C.logHistory(ep, {type:"validate", cand:c.id, candName:c.name, total:h.scores.total}, me, now - 1800000);
    };
    validate(0);
    validate(1);
    const c2 = cand(2);
    ep.final[c2.id] = {crit:{post:{deg:4, v:1.5}}, choice:{}, validated:null, updatedAt:now - 1200000};
    C.logHistory(ep, {type:"decision", cand:c2.id, candName:c2.name, crit:"post",
      initial:`${me} : D3 1,5 · ${COLLEAGUE} : D4 2`, deg:4, v:1.5, from:""}, me, now - 1200000);
    return ep;
  }

  /* Liste au format d'un export Pronote (séparateur point-virgule). */
  function demoCSV() {
    return "Élève;Classe\r\n" + NAMES.map(n => `${n};${CLASSROOM}`).join("\r\n") + "\r\n";
  }

  return {makeDemo, demoCSV, NAMES, COLLEAGUE};
});
