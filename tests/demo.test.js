/* Épreuve d'exemple : node --test tests/ */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../coeval-core.js");
const D = require("../coeval-demo.js");

test("classe d'exemple : 28 élèves, tous les cas de croisement, valeurs dans la grille", () => {
  const ep = D.makeDemo("Alice", Date.UTC(2026, 5, 10, 12));
  assert.equal(ep.candidates.length, 28);
  const statuses = new Set(ep.candidates.map(c => C.retainedFor(ep, c, "Alice").h.status));
  for (const st of ["accord", "points", "degree", "major", "choices", "incomplete"]) assert.ok(statuses.has(st), st);
  for (const e of [...Object.values(ep.mine), ...Object.values(ep.others[D.COLLEAGUE].rows)]) {
    for (const cr of C.GRID) {
      const v = e.v[cr.id];
      if (v != null) assert.equal(C.degreeOf(cr, v, e.d[cr.id]), e.d[cr.id], cr.id);
    }
  }
  assert.equal(Object.values(ep.final).filter(f => f.validated).length, 2);
  assert.deepEqual(D.makeDemo("Alice", 1).candidates.map(c => c.name), ep.candidates.map(c => c.name));
});

test("liste CSV d'exemple lisible comme un export Pronote", () => {
  const r = C.parseCSV(D.demoCSV());
  assert.equal(r.names.length, 28);
  assert.ok(r.classes.every(c => c === "TG2"));
});

test("croisement : accords validables d'un coup et file d'harmonisation par priorité", () => {
  const ep = D.makeDemo("Alice", Date.UTC(2026, 10, 9, 12));
  const ready = C.accordReady(ep, "Alice");
  assert.ok(ready.length > 0);
  assert.ok(ready.every(x => x.r.h.status === "accord" && !x.r.validated && !x.r.h.blockers.length));
  const queue = C.harmonizeQueue(ep, "Alice");
  const statuses = queue.map(id => C.retainedFor(ep, ep.candidates.find(c => c.id === id), "Alice").h.status);
  assert.equal(statuses[0], "major", "le désaccord majeur en premier");
  const ranks = statuses.map(st => C.STATUS[st].rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.ok(!queue.some(id => ready.some(x => x.cand.id === id)), "aucun accord dans la file");
});
