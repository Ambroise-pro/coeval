/* Épreuve d'exemple : node --test tests/ */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../coeval-core.js");
const D = require("../coeval-demo.js");

test("classe d'exemple : 26 élèves, tous les cas de croisement, valeurs dans la grille", () => {
  const ep = D.makeDemo("Alice", Date.UTC(2026, 5, 10, 12));
  assert.equal(ep.candidates.length, 26);
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
  assert.equal(r.names.length, 26);
  assert.ok(r.classes.every(c => c === "TG2"));
});
