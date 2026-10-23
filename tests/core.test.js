/* Tests du noyau : node --test tests/ (aucune dépendance). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../coeval-core.js");

const ALL_MAX = Object.fromEntries(C.GRID.map(c => [c.id, c.max]));

function ep(names = ["DUPONT Léa"]) {
  const e = {id:"e1", title:"Bac", candidates:[], mine:{}, others:{}, final:{}, history:[]};
  C.addCandidates(e, names);
  return e;
}
function evalOf(v, extra = {}) {
  return {split:"4-4", theme:"1", role:"juge", v:{...v}, d:{}, comment:"", updatedAt:1000, done:false, ...extra};
}
const full = (over = {}) => ({amp:.75, resp:.75, post:1.5, param:3.25, ress:1.75, regul:1.5, projet:1.5, recueil:1.5, role:1.5, ...over});

test("la grille vaut 20 points pour chaque répartition", () => {
  for (const split of Object.keys(C.SPLITS)) {
    assert.equal(C.scores(evalOf(ALL_MAX, {split})).total, 20);
  }
  assert.equal(C.scores(evalOf({}, {split:"6-2"})).total, null);
});

test("les plages de degrés sont croissantes, dans [0, max], sans valeur inventée", () => {
  const unreachable = {};
  for (const c of C.GRID) {
    assert.equal(c.deg[0][0], 0, c.id);
    assert.equal(c.deg[3][1], c.max, c.id);
    for (let i = 0; i < 4; i++) {
      assert.ok(c.deg[i][0] <= c.deg[i][1], c.id);
      if (i) assert.ok(c.deg[i][0] >= c.deg[i - 1][1], `${c.id} D${i + 1} chevauche D${i}`);
      for (const x of C.stepsOf(c.deg[i])) assert.equal(C.degreeOf(c, x, i + 1), i + 1, `${c.id} ${x}`);
    }
    const gaps = C.stepsOf([0, c.max]).filter(x => !C.isValidValue(c, x));
    if (gaps.length) unreachable[c.id] = gaps;
  }
  // Valeurs que la grille n'attribue à aucun degré : figées ici pour repérer tout changement de grille.
  assert.deepEqual(unreachable, {projet:[.75, 1.25, 1.75], recueil:[.75, 1.25, 1.75], role:[.75, 1.25, 1.75]});
});

test("une note manquante n'est jamais comptée comme zéro", () => {
  const s = C.scores(evalOf(full({param:undefined})));
  assert.equal(s.total, null);
  assert.equal(s.afl1, null);
  assert.equal(s.filled, 8);
  assert.equal(s.partial, s.afl1p + s.afl2p + s.afl3p);
});

test("pas d'arrondi intermédiaire : 6-2 peut donner 0,375", () => {
  const s = C.scores(evalOf(full({projet:.25, recueil:0}), {split:"6-2"}));
  assert.equal(s.afl2, .375);
  assert.equal(C.fmt(12.375), "12,375");
});

test("codage des cellules : aller-retour et valeurs refusées", () => {
  for (const c of C.GRID) for (let d = 1; d <= 4; d++) for (const v of C.stepsOf(c.deg[d - 1])) {
    assert.deepEqual(C.decodeCell(c, C.encodeCell(c, v, d)), {v, d});
  }
  assert.equal(C.decodeCell(C.critById("amp"), 309), null); // 2 points > max 1
  assert.equal(C.decodeCell(C.critById("amp"), 0), null);
});

test("statuts : accord, écart de points, degré, majeur, incomplet", () => {
  const amp = C.critById("amp"), param = C.critById("param");
  const e = (v, d) => ({ev:{v:{amp:v, param:v}, d:{amp:d, param:d}}});
  assert.equal(C.critCompare(amp, [e(.75, 4), e(1, 4)]).status, "accord");
  assert.equal(C.critCompare(param, [e(3.25, 4), e(4, 4)]).status, "points");
  assert.equal(C.critCompare(amp, [e(.5, 3), e(.75, 4)]).status, "degree");
  assert.equal(C.critCompare(amp, [e(.25, 1), e(.75, 4)]).status, "major");
  assert.equal(C.critCompare(amp, [e(.75, 4), {ev:null}]).status, "incomplete");
  // Même note à la borne partagée, mais degrés différents : le désaccord reste visible.
  assert.equal(C.critCompare(amp, [e(.25, 1), e(.25, 2)]).status, "degree");
});

test("harmonisation : pas de valeur automatique en cas de désaccord de degré", () => {
  const e = ep();
  const cand = e.candidates[0];
  e.mine[cand.id] = evalOf(full({param:2}), {d:{param:2}});
  e.others.Bruno = {rows:{[C.normName(cand.name)]:evalOf(full({param:3}), {d:{param:3}})}};
  let h = C.harmonize(C.entriesFor(e, cand, "Alice"), null);
  assert.equal(h.crits.param.status, "degree");
  assert.equal(h.crits.param.value, null);
  assert.equal(h.scores.total, null);
  assert.equal(h.pending, 1);
  assert.match(h.blockers.join(), /désaccord de degré/);
  h = C.harmonize(C.entriesFor(e, cand, "Alice"), {crit:{param:{deg:3, v:2.5}}});
  assert.equal(h.crits.param.source, "jury");
  assert.equal(h.pending, 0);
  assert.deepEqual(h.blockers, []);
  assert.equal(h.status, "degree"); // le désaccord reste tracé après décision
  assert.equal(h.treated, 1);
});

test("harmonisation : même degré → moyenne au ¼ de point dans ce degré", () => {
  const e = ep();
  const cand = e.candidates[0];
  e.mine[cand.id] = evalOf(full({param:3.25}));
  e.others.Bruno = {rows:{[C.normName(cand.name)]:evalOf(full({param:3.75}))}};
  const h = C.harmonize(C.entriesFor(e, cand, "Alice"), null);
  assert.equal(h.crits.param.status, "points");
  assert.equal(h.crits.param.value, 3.5);
  assert.equal(h.crits.param.source, "moyenne");
  assert.ok(h.scores.total != null);
});

test("même total, degrés différents : statut de désaccord", () => {
  const e = ep();
  const cand = e.candidates[0];
  e.mine[cand.id] = evalOf(full({amp:.5, resp:1}), {d:{amp:3, resp:4}});
  e.others.Bruno = {rows:{[C.normName(cand.name)]:evalOf(full({amp:.75, resp:.75}), {d:{amp:4, resp:4}})}};
  const [a, b] = C.entriesFor(e, cand, "Alice").map(x => C.scores(x.ev).total);
  assert.equal(a, b);
  assert.equal(C.harmonize(C.entriesFor(e, cand, "Alice"), null).status, "degree");
});

test("choix différents : à trancher avant validation, puis recalcul des pondérations", () => {
  const e = ep();
  const cand = e.candidates[0];
  e.mine[cand.id] = evalOf(full(), {split:"6-2"});
  e.others.Bruno = {rows:{[C.normName(cand.name)]:evalOf(full(), {split:"2-6"})}};
  let h = C.harmonize(C.entriesFor(e, cand, "Alice"), null);
  assert.equal(h.status, "choices");
  assert.equal(h.scores.total, null);
  assert.match(h.blockers.join(), /Répartition/);
  h = C.harmonize(C.entriesFor(e, cand, "Alice"), {choice:{split:"2-6"}});
  assert.deepEqual(h.blockers, []);
  assert.equal(h.scores.afl2, 1.5 * 2 / 4 * 2 / 2 * 2); // (1,5 + 1,5) / 4 × 2
  assert.equal(h.scores.afl3, 1.5 / 2 * 6);
});

test("note validée figée et signalée si les évaluations changent ensuite", () => {
  const e = ep();
  const cand = e.candidates[0];
  e.mine[cand.id] = evalOf(full());
  e.others.Bruno = {rows:{[C.normName(cand.name)]:evalOf(full())}};
  const h = C.harmonize(C.entriesFor(e, cand, "Alice"), null);
  e.final[cand.id] = {crit:{}, choice:{}, validated:C.makeValidation(h, "Alice"), updatedAt:1};
  let r = C.retainedFor(e, cand, "Alice");
  assert.equal(r.total, h.scores.total);
  assert.equal(r.stale, false);
  e.others.Bruno.rows[C.normName(cand.name)].v.amp = 1;
  r = C.retainedFor(e, cand, "Alice");
  assert.equal(r.total, h.scores.total);
  assert.equal(r.stale, true);
});

test("QR : 8 candidats par QR, lot stable, réception dans le désordre, doublon", () => {
  const names = Array.from({length:30}, (_, i) => "ELEVE " + String(i).padStart(2, "0"));
  const a = ep(names);
  a.candidates.forEach(c => { a.mine[c.id] = evalOf(full()); });
  const parts = C.qrParts(a, "Alice", 1);
  assert.equal(parts.length, 4);
  assert.deepEqual(C.qrParts(a, "Alice", 2).map(p => JSON.parse(p.slice(8)).k), parts.map(p => JSON.parse(p.slice(8)).k));
  const b = ep([]);
  const order = [3, 0, 2, 2, 1];
  let res;
  order.forEach(i => { res = C.importPayloads(b, C.parseCodes(parts[i]).payloads, "Bruno"); });
  assert.equal(res.done, true);
  assert.equal(b.candidates.length, 30);
  assert.equal(Object.keys(b.others.Alice.rows).length, 30);
  assert.deepEqual(b.others.Alice.parts.got.sort(), [1, 2, 3, 4]);
});

test("QR interrompu puis repris, et réception d'une évaluation déjà importée", () => {
  const names = Array.from({length:10}, (_, i) => "ELEVE " + i);
  const a = ep(names);
  a.candidates.forEach(c => { a.mine[c.id] = evalOf(full()); });
  const parts = C.qrParts(a, "Alice", 1);
  const b = ep([]);
  let r = C.importPayloads(b, C.parseCodes(parts[0]).payloads, "Bruno");
  assert.equal(r.done, false);
  r = C.importPayloads(b, C.parseCodes(parts[1]).payloads, "Bruno");
  assert.equal(r.done, true);
  const before = JSON.stringify(b.others.Alice.rows);
  r = C.importPayloads(b, C.parseCodes(parts.join("\n")).payloads, "Bruno");
  assert.equal(r.added, 0);
  assert.equal(b.candidates.length, 10);
  assert.equal(JSON.stringify(b.others.Alice.rows), before);
});

test("une fiche plus ancienne n'écrase pas une fiche plus récente", () => {
  const a = ep();
  const c = a.candidates[0];
  a.mine[c.id] = evalOf(full({amp:1}), {updatedAt:5000000});
  const recent = C.qrParts(a, "Alice", 6000000);
  a.mine[c.id] = evalOf(full({amp:.25}), {updatedAt:1000000});
  const old = C.qrParts(a, "Alice", 7000000);
  const b = ep([]);
  C.importPayloads(b, C.parseCodes(recent[0]).payloads, "Bruno");
  const res = C.importPayloads(b, C.parseCodes(old[0]).payloads, "Bruno");
  assert.equal(res.older, 1);
  assert.equal(b.others.Alice.rows[C.normName(c.name)].v.amp, 1);
});

test("une ligne vide n'efface pas une fiche reçue ; sa propre évaluation est refusée", () => {
  const a = ep();
  const c = a.candidates[0];
  a.mine[c.id] = evalOf(full());
  const b = ep([]);
  C.importPayloads(b, C.parseCodes(C.qrParts(a, "Alice")[0]).payloads, "Bruno");
  a.mine = {};
  C.importPayloads(b, C.parseCodes(C.qrParts(a, "Alice")[0]).payloads, "Bruno");
  assert.equal(b.others.Alice.rows[C.normName(c.name)].v.amp, .75);
  assert.match(C.importPayloads(b, C.parseCodes(C.qrParts(a, "Bruno")[0]).payloads, "bruno").error, /propre évaluation/);
});

test("format plus récent refusé ; ancien format (v1) accepté ; nom réservé refusé", () => {
  const b = ep([]);
  const newer = "COEVAL1:" + JSON.stringify({v:9, t:"Bac", e:"Alice", a:1, k:"x", p:[1, 1], r:[["A"]]});
  assert.match(C.importPayloads(b, C.parseCodes(newer).payloads, "Bruno").error, /plus récente/);
  const v1 = "COEVAL1:" + JSON.stringify({t:"Bac", e:"Alice", a:1, k:"x", p:[1, 1], r:[["MARTIN Hugo", "4-4", "2", "juge", [403, 404, 307, 314, 408, 407, 407, 407, 407]]]});
  const res = C.importPayloads(b, C.parseCodes(v1).payloads, "Bruno");
  assert.equal(res.done, true);
  assert.equal(b.others.Alice.rows["martin hugo"].v.amp, .5);
  const evil = "COEVAL1:" + JSON.stringify({t:"Bac", e:"__proto__", a:1, k:"x", p:[1, 1], r:[["A"]]});
  assert.ok(C.importPayloads(b, C.parseCodes(evil).payloads, "Bruno").error);
  assert.equal({}.rows, undefined);
});

test("QR d'un seul candidat : complète sans toucher aux lots", () => {
  const a = ep(["A", "B"]);
  a.candidates.forEach(c => { a.mine[c.id] = evalOf(full()); });
  const b = ep([]);
  C.importPayloads(b, C.parseCodes(C.qrParts(a, "Alice", 1)[0]).payloads, "Bruno");
  const parts = JSON.stringify(b.others.Alice.parts);
  a.mine[a.candidates[0].id] = evalOf(full({amp:1}), {updatedAt:9e9});
  const res = C.importPayloads(b, C.parseCodes(C.singleQR(a, a.candidates[0], "Alice")).payloads, "Bruno");
  assert.equal(res.single, true);
  assert.equal(b.others.Alice.rows.a.v.amp, 1);
  assert.equal(JSON.stringify(b.others.Alice.parts), parts);
});

test("fichier d'échange : remarques transmises", () => {
  const a = ep();
  a.mine[a.candidates[0].id] = evalOf(full(), {comment:"Très bon juge"});
  const b = ep([]);
  C.importPayloads(b, [C.fileToPayload(C.exportFile(a, "Alice"))], "Bruno");
  assert.equal(b.others.Alice.rows[C.normName("DUPONT Léa")].comment, "Très bon juge");
});

test("trois évaluateurs : statuts et moyenne sur trois", () => {
  const e = ep();
  const cand = e.candidates[0];
  const key = C.normName(cand.name);
  e.mine[cand.id] = evalOf(full({param:3.25}));
  e.others.B = {rows:{[key]:evalOf(full({param:3.5}))}};
  e.others.C = {rows:{[key]:evalOf(full({param:4}))}};
  const h = C.harmonize(C.entriesFor(e, cand, "A"), null);
  assert.equal(h.evaluators, 3);
  assert.equal(h.crits.param.status, "points");
  assert.equal(h.crits.param.value, 3.5); // (3,25 + 3,5 + 4) / 3 = 3,58 → 3,5
  delete e.others.C.rows[key].v.amp;
  assert.equal(C.harmonize(C.entriesFor(e, cand, "A"), null).crits.amp.status, "incomplete");
  delete e.others.C.rows[key];
  assert.equal(C.harmonize(C.entriesFor(e, cand, "A"), null).crits.amp.status, "accord", "C n'a pas évalué ce candidat");
  delete e.others.B.rows[key];
  const one = C.harmonize(C.entriesFor(e, cand, "A"), null);
  assert.equal(one.status, "incomplete", "une seule fiche");
  assert.match(one.blockers.join(), /deux évaluations/);
});

test("migration v1 → v2 : notes forcées, rôle retenu, validation conservée, idempotente", () => {
  const v1 = {me:"Alice", activeId:"e1", epreuves:[{
    id:"e1", title:"Bac", createdAt:1, candidates:[{id:"c1", name:"DUPONT Léa", classroom:""}],
    mine:{c1:{split:"4-4", theme:"1", role:"juge", v:full(), d:{}, comment:"", updatedAt:1}},
    others:{Bruno:{at:1, batch:"x", rows:{"dupont lea":{split:"4-4", theme:"1", role:"juge", v:full(), d:{}}}, parts:null}},
    final:{c1:{amp:1, choice:{split:"6-2"}, role:"partenaire", validated:true}}
  }]};
  const db = C.migrateDb(JSON.parse(JSON.stringify(v1)));
  const fin = db.epreuves[0].final.c1;
  assert.equal(db.version, 2);
  assert.deepEqual(fin.crit.amp, {deg:4, v:1});
  assert.equal(fin.choice.split, "6-2");
  assert.equal(fin.choice.role, "partenaire");
  assert.ok(fin.validated && fin.validated.total != null);
  assert.equal(db.epreuves[0].mine.c1.done, false);
  const again = C.migrateDb(JSON.parse(JSON.stringify(db)));
  assert.deepEqual(again.epreuves[0].final, db.epreuves[0].final);
});

test("sauvegarde : contrôle, aperçu, restauration (nouvelle, fusion, remplacement)", () => {
  const e = ep(["A", "B"]);
  e.mine[e.candidates[0].id] = evalOf(full(), {updatedAt:10});
  e.final[e.candidates[0].id] = {crit:{amp:{deg:4, v:1}}, choice:{}, validated:null, updatedAt:5};
  C.logHistory(e, {type:"decision", cand:e.candidates[0].id}, "Alice");
  const backup = JSON.parse(JSON.stringify(C.makeBackup(e, "Alice")));
  assert.match(C.checkBackup({type:"autre"}).error, /pas une sauvegarde/);
  assert.match(C.checkBackup({...backup, version:99}).error, /plus récente/);
  assert.match(C.checkBackup({...backup, epreuve:{...backup.epreuve, candidates:"x"}}).error, /abîmée/);
  const checked = C.checkBackup(backup);
  assert.equal(checked.preview.candidates, 2);
  assert.equal(checked.preview.mine, 1);
  assert.equal(checked.preview.decisions, 1);

  const db = {me:"Alice", epreuves:[], activeId:null};
  C.restoreBackup(db, checked, {mode:"new"}, "Alice");
  assert.equal(db.epreuves.length, 1);
  const local = db.epreuves[0];
  local.mine[local.candidates[0].id].v.amp = .5;
  local.mine[local.candidates[0].id].updatedAt = 20;
  C.restoreBackup(db, checked, {mode:"merge", targetId:local.id}, "Alice");
  assert.equal(local.mine[local.candidates[0].id].v.amp, .5, "la fiche locale plus récente est gardée");
  assert.equal(local.history.length, 1, "pas de doublon d'historique");
  C.restoreBackup(db, checked, {mode:"replace", targetId:local.id}, "Alice");
  assert.equal(db.epreuves[0].mine[db.epreuves[0].candidates[0].id].v.amp, .75);
});

test("sauvegarde d'un autre évaluateur : devient une évaluation reçue, remplacement interdit", () => {
  const e = ep(["A"]);
  e.mine[e.candidates[0].id] = evalOf(full());
  e.others.Alice = {rows:{a:evalOf(full({amp:.25}))}};
  const checked = C.checkBackup(JSON.parse(JSON.stringify(C.makeBackup(e, "Bruno"))));
  const db = {me:"Alice", epreuves:[ep(["A"])], activeId:null};
  db.epreuves[0].id = "local";
  assert.ok(C.restoreBackup(db, checked, {mode:"replace", targetId:"local"}, "Alice").error);
  C.restoreBackup(db, checked, {mode:"merge", targetId:"local"}, "Alice");
  const t = db.epreuves[0];
  assert.equal(t.others.Bruno.rows.a.v.amp, .75);
  assert.equal(t.others.Alice, undefined);
  assert.deepEqual(t.mine, {});
});

test("historique : modifications successives regroupées", () => {
  const e = ep();
  C.logHistory(e, {type:"eval-edit", cand:"c", field:"amp", from:"0,5", to:"0,75"}, "A", 1000);
  C.logHistory(e, {type:"eval-edit", cand:"c", field:"amp", to:"1"}, "A", 2000);
  C.logHistory(e, {type:"eval-edit", cand:"c", field:"resp", to:"1"}, "A", 3000);
  assert.equal(e.history.length, 2);
  assert.equal(e.history[0].from, "0,5");
  assert.equal(e.history[0].to, "1");
});

test("bilan du jury : concordance des degrés et écarts", () => {
  const e = ep(["A", "B"]);
  const [a, b] = e.candidates;
  e.mine[a.id] = evalOf(full()); e.mine[b.id] = evalOf(full({amp:.25}), {d:{amp:1}});
  e.others.Bruno = {rows:{a:evalOf(full()), b:evalOf(full({amp:1}))}};
  const s = C.juryStats(e, "Alice");
  assert.equal(s.crossed, 2);
  assert.equal(s.withDegree, 1);
  assert.equal(s.perCrit.find(x => x.id === "amp").major, 1);
  assert.equal(s.exactDegreePct, 17 / 18 * 100);
  assert.equal(s.pairs[0].meanAbs, .375);
  assert.equal(s.pairs[0].crit.find(x => x.id === "amp").meanSigned, -.375);
});

test("CSV Pronote : en-tête, classe, séparateur, guillemets", () => {
  const r = C.parseCSV('﻿Élève;Classe\r\n"DUPONT; Léa";TG1\r\nMARTIN Hugo;TG2\r\n');
  assert.deepEqual(r.names, ["DUPONT; Léa", "MARTIN Hugo"]);
  assert.deepEqual(r.classes, ["TG1", "TG2"]);
});
