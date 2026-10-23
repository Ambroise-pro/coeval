/* =========================================================
   CO-ÉVALUATION BAC — NOYAU
   Grille, barème, croisement, harmonisation, échanges,
   sauvegardes, migration et statistiques.
   Aucun accès à la page : chargé par l'application
   (window.CoEvalCore) et par les tests (node --test tests/).
   ========================================================= */

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CoEvalCore = factory();
})(typeof self !== "undefined" ? self : this, () => {
  "use strict";

  const DATA_VERSION = 2;    // structure enregistrée dans le navigateur et dans les sauvegardes
  const FORMAT_VERSION = 2;  // format des QR, codes et fichiers d'échange
  const QR_PREFIX = "COEVAL1:";
  const PER_QR = 8;

  /* =========================
     GRILLE (FCE Musculation CA5)
  ========================= */

  const D4 = (a, b, c, d) => [a, b, c, d];
  const ROLE_LEVELS = ["Passif", "Suiveur", "Acteur", "Moteur"];

  const GRID = [
    {id:"amp", afl:"AFL1", group:"Produire", label:"Amplitude", max:1,
      deg:D4([0, .25], [.25, .5], [.5, .75], [.75, 1]),
      desc:D4("Butée articulaire", "Amplitude limitée", "Amplitude correcte", "Amplitude optimale")},
    {id:"resp", afl:"AFL1", group:"Produire", label:"Respiration", max:1,
      deg:D4([0, .25], [.25, .5], [.5, .75], [.75, 1]),
      desc:D4("Respiration absente (apnée…)", "Présente mais non intégrée", "Partiellement intégrée ou inversée", "Efficace (expire sur le temps d'effort…)")},
    {id:"post", afl:"AFL1", group:"Produire", label:"Posture", max:2,
      deg:D4([0, .5], [.5, 1], [1, 1.5], [1.5, 2]),
      desc:D4("Ne maîtrise pas les postures de sécurité dans l'effort", "Nombreuses postures compensatoires dans la série (> 30 %)", "Quelques postures compensatoires (10 à 20 %)", "Pas de posture compensatoire")},
    {id:"param", afl:"AFL1", group:"Produire", label:"Choix des paramètres", max:4,
      deg:D4([0, 1], [1.25, 2], [2.25, 3], [3.25, 4]),
      desc:D4(
        "Paramètres incohérents avec le thème, matériel inadapté ; charges mal installées et/ou non sécurisées",
        "Charge incohérente avec les ressources ou le thème ; implication irrégulière : 50 à 75 % des répétitions prévues validées",
        "Charge adaptée aux ressources et à l'effort ; paramètres cohérents avec le thème : 75 à 90 % validées",
        "Charge adaptée, optimisée et régulée en cours d'action ; choix individualisé : > 90 % validées")},
    {id:"ress", afl:"AFL1", group:"Analyser", label:"Identification des ressentis", max:2,
      deg:D4([0, .5], [.75, 1], [1, 1.5], [1.75, 2]),
      desc:D4(
        "Pas d'analyse (copier/coller du partenaire) ; n'exploite ni les observations ni le ressenti",
        "Analyse incomplète ; un seul type de ressenti (souvent psychologique), observations partielles",
        "Données chiffrées exploitables ; analyse binaire (garde ou modifie) ; au moins deux types de ressentis + observations",
        "Analyse fine reliée à l'activité ; tous les types de ressentis associés aux observations pour réguler le bon paramètre")},
    {id:"regul", afl:"AFL1", group:"Analyser", label:"Régulation des paramètres", max:2,
      deg:D4([0, .5], [.5, 1], [1, 1.5], [1.5, 2]),
      desc:D4(
        "Absentes ou incohérentes : charge mettant en jeu l'intégrité physique ou insignifiante",
        "Inadaptées aux indicateurs relevés : charge trop lourde, trop légère, non personnalisée",
        "Grâce à des ressentis ou des données chiffrées : charge adaptée mais non affinée ; début d'analyse",
        "Croisement indicateurs chiffrés / ressentis : charge adaptée et régulée ; régulation différée (conception future)")},
    {id:"projet", afl:"AFL2", group:"AFL2 · S'entraîner", label:"Concevoir un projet d'entraînement", max:2,
      deg:D4([0, .5], [1, 1], [1.5, 1.5], [2, 2]),
      desc:D4(
        "Choix non référencés, potentiellement dangereux ; séquence copiée ou inadaptée aux ressources / au thème",
        "Reproduit de manière stéréotypée, avec quelques incohérences, un projet d'entraînement",
        "Séquences cohérentes à partir de paramètres simples ; conçoit son projet de manière pertinente",
        "Personnalisation et régulations adaptées ; conçoit, régule et justifie son projet")},
    {id:"recueil", afl:"AFL2", group:"AFL2 · S'entraîner", label:"Recueil de données", max:2,
      deg:D4([0, .5], [1, 1], [1.5, 1.5], [2, 2]),
      desc:D4(
        "Incomplet, ne permet pas une construction adaptée de la séance",
        "Complet mais avec des incohérences au regard des capacités",
        "Complet et adapté aux capacités de l'élève",
        "Complet, adapté, propose des régulations liées au projet (postures, respiration, charges, séries, répétitions…)")},
    {id:"role", afl:"AFL3", group:"AFL3 · Coopérer", label:"Rôle", max:2,
      deg:D4([0, .5], [1, 1], [1.5, 1.5], [2, 2]),
      names:ROLE_LEVELS,
      descByRole:{
        partenaire:D4(
          "Agit seul et pour lui-même et/ou interagit dangereusement avec ses partenaires",
          "Collabore au niveau organisationnel, ponctuellement et/ou de manière inadaptée",
          "Disponible et réactif pour observer et aider à partir d'indicateurs simples",
          "Conseille à partir d'indicateurs précis et pertinents ; relie données et observations"),
        juge:D4(
          "N'aide pas : répétitions non fiables, n'identifie ni l'amplitude ni les postures",
          "Irrégulier, a besoin d'aide : répétitions approximatives, identifie partiellement amplitude OU postures",
          "Investi : indique les répétitions, identifie précisément amplitude OU postures",
          "Autonome : indique les répétitions, identifie constamment amplitude ET postures")
      }}
  ];

  const AFL1_IDS = ["amp", "resp", "post", "param", "ress", "regul"];
  const AFL2_IDS = ["projet", "recueil"];
  /* Évalué avant l'épreuve et transmis au co-évaluateur (préparation) : jamais l'AFL1. */
  const PREP_CRITS = ["projet", "recueil", "role"];
  const PREP_CHOICES = ["split", "theme", "role"];
  const SPLITS = {"4-4":[4, 4], "6-2":[6, 2], "2-6":[2, 6]};
  const THEMES = {"1":"Puissance", "2":"Tonification", "3":"Volume"};
  const ROLES = {partenaire:"Partenaire d'entraînement", juge:"Juge"};
  const CHOICE_FIELDS = {
    theme:{label:"Thème", map:THEMES},
    split:{label:"Répartition AFL2/AFL3", map:{"4-4":"AFL2 4 · AFL3 4", "6-2":"AFL2 6 · AFL3 2", "2-6":"AFL2 2 · AFL3 6"}},
    role:{label:"Rôle AFL3", map:ROLES}
  };

  /* Statuts de croisement, du plus urgent au plus calme. La couleur (tone)
     est toujours doublée d'un pictogramme et d'un libellé. */
  const STATUS = {
    major:{rank:0, label:"Désaccord majeur", icon:"‼", tone:"bad"},
    degree:{rank:1, label:"Désaccord de degré", icon:"≠", tone:"bad"},
    choices:{rank:2, label:"Choix différents", icon:"⇄", tone:"bad"},
    points:{rank:3, label:"Écart de points", icon:"≈", tone:"mid"},
    incomplete:{rank:4, label:"Incomplet", icon:"…", tone:"wait"},
    accord:{rank:5, label:"Accord", icon:"✓", tone:"ok"}
  };
  const DIVERGENT = ["major", "degree", "points"];
  const MUST_DECIDE = ["major", "degree"];

  /* =========================
     OUTILS
  ========================= */

  const uid = () => typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const normName = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const q4 = n => Math.round(n * 4) / 4;
  /* Affichage sans arrondi : les notes pondérées sont des multiples de 0,125 au plus fin. */
  const fmt = n => n == null || Number.isNaN(n) ? "—" : String(Math.round(n * 1000) / 1000).replace(".", ",");
  const hash = s => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const get = (o, k) => own(o, k) ? o[k] : undefined;
  const obj = o => o && typeof o === "object" && !Array.isArray(o) ? o : {};
  const critById = id => GRID.find(c => c.id === id);
  const RESERVED = /^(__proto__|constructor|prototype)$/;

  /* =========================
     CRITÈRES ET BARÈME
  ========================= */

  function inRange(crit, deg, value) {
    const r = crit.deg[deg - 1];
    return !!r && value != null && value >= r[0] - 1e-9 && value <= r[1] + 1e-9;
  }

  /* Degré d'une note. Le degré enregistré prime quand il est compatible :
     aux bornes partagées (ex. 0,25 en amplitude) il lève l'ambiguïté. */
  function degreeOf(crit, value, stored) {
    const valid = stored >= 1 && stored <= 4;
    if (value == null) return valid ? stored : 0;
    if (valid && inRange(crit, stored, value)) return stored;
    return crit.deg.findIndex(([a, b]) => value >= a - 1e-9 && value <= b + 1e-9) + 1;
  }

  function stepsOf([a, b]) {
    const out = [];
    for (let x = a; x <= b + 1e-9; x += .25) out.push(q4(x));
    return out;
  }

  function descOf(crit, role) {
    if (crit.descByRole) return crit.descByRole[role] || null;
    return crit.desc;
  }

  function degreeName(crit, deg) {
    return deg ? crit.names ? crit.names[deg - 1] : "Degré " + deg : "—";
  }

  /* Note admise : un quart de point compris dans l'un des quatre degrés.
     (En AFL2/AFL3, 0,75, 1,25 et 1,75 n'appartiennent à aucun degré : refusées.) */
  const isValidValue = (crit, v) => typeof v === "number" && Math.abs(v * 4 - Math.round(v * 4)) < 1e-9
    && crit.deg.some(([a, b]) => v >= a - 1e-9 && v <= b + 1e-9);

  function emptyEval() {
    return {split:"", theme:"", role:"", v:{}, d:{}, comment:"", updatedAt:0, done:false};
  }

  function isFilled(ev) {
    return !!ev && (GRID.some(c => ev.v?.[c.id] != null) || !!ev.split || !!ev.role || !!ev.theme);
  }

  /* Points d'une évaluation. Une note manquante n'est jamais comptée comme 0 :
     les blocs incomplets valent null, les sommes partielles restent disponibles
     pour l'affichage pendant la saisie. Aucun arrondi intermédiaire. */
  function scores(ev) {
    const v = ev?.v || {};
    const has = id => v[id] != null;
    const sum = ids => ids.reduce((s, id) => s + (v[id] ?? 0), 0);
    const [w2, w3] = SPLITS[ev?.split] || [null, null];
    const afl1p = sum(AFL1_IDS);
    const afl2p = w2 == null ? null : sum(AFL2_IDS) / 4 * w2;
    const afl3p = w3 == null ? null : (v.role ?? 0) / 2 * w3;
    const afl1 = AFL1_IDS.every(has) ? afl1p : null;
    const afl2 = afl2p != null && AFL2_IDS.every(has) ? afl2p : null;
    const afl3 = afl3p != null && has("role") ? afl3p : null;
    const filled = GRID.filter(c => has(c.id)).length;
    const complete = filled === GRID.length && !!ev?.split && !!ev?.role;
    return {
      afl1, afl2, afl3, afl1p, afl2p, afl3p, filled, complete,
      total: complete ? afl1 + afl2 + afl3 : null,
      partial: afl2p == null ? afl1p : afl1p + afl2p + afl3p
    };
  }

  /* Ce qui manque pour terminer une fiche. */
  function missingFields(ev) {
    const out = [];
    Object.entries(CHOICE_FIELDS).forEach(([f, meta]) => { if (!ev?.[f]) out.push(meta.label); });
    GRID.forEach(c => { if (ev?.v?.[c.id] == null) out.push(c.label); });
    return out;
  }

  function encodeCell(crit, v, d) {
    return v == null ? 0 : degreeOf(crit, v, d) * 100 + Math.round(v * 4) + 1;
  }

  function decodeCell(crit, c) {
    if (typeof c !== "number" || !c) return null;
    const v = ((c % 100) - 1) / 4;
    if (!isValidValue(crit, v)) return null;
    return {v, d:degreeOf(crit, v, Math.floor(c / 100))};
  }

  /* =========================
     CROISEMENT ET HARMONISATION
  ========================= */

  /* Évaluateurs d'un candidat : moi d'abord, puis chaque collègue reçu.
     Une fiche vide compte comme absente. */
  function entriesFor(ep, cand, me) {
    const key = normName(cand.name);
    const mine = get(ep.mine, cand.id);
    return [{name:me, me:true, ev:isFilled(mine) ? mine : null}]
      .concat(Object.entries(ep.others).map(([name, o]) => {
        const ev = get(o.rows, key);
        return {name, ev:isFilled(ev) ? ev : null};
      }));
  }

  /* Un évaluateur sans aucune fiche pour ce candidat n'est pas attendu (un troisième
     évaluateur peut n'en noter qu'une partie) ; il faut au moins deux fiches. */
  function critCompare(crit, entries) {
    const marks = entries.map(x => {
      const v = x.ev?.v?.[crit.id];
      return v == null ? null : {v, d:degreeOf(crit, v, x.ev.d?.[crit.id])};
    });
    const got = marks.filter(Boolean);
    const vals = got.map(m => m.v), degs = got.map(m => m.d);
    const gap = got.length > 1 ? Math.max(...vals) - Math.min(...vals) : null;
    const degGap = got.length > 1 ? Math.max(...degs) - Math.min(...degs) : null;
    let status;
    if (got.length < 2) status = "incomplete";
    else if (degGap >= 2) status = "major";
    else if (degGap === 1) status = "degree";
    else if (gap >= .5 - 1e-9) status = "points";
    else status = got.length < entries.filter(x => x.ev).length ? "incomplete" : "accord";
    return {
      marks, gap, degGap, status, count:got.length,
      mean:got.length ? q4(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
      commonDeg:got.length && !degGap ? degs[0] : 0
    };
  }

  /* Note harmonisée provisoire.
     - Décision du jury (degré + note) : toujours prioritaire.
     - Même degré chez tous : moyenne au ¼ de point, forcément dans ce degré.
     - Degrés différents : aucune valeur automatique, le jury doit trancher. */
  function harmonize(entries, fin) {
    fin = fin || {};
    const present = entries.filter(x => x.ev);
    const choices = {};
    Object.keys(CHOICE_FIELDS).forEach(f => {
      const vals = entries.map(x => x.ev?.[f] || "");
      const distinct = [...new Set(vals.filter(Boolean))];
      const decided = get(fin.choice, f) || "";
      const differ = distinct.length > 1;
      choices[f] = {vals, distinct, differ, decided, value:decided || (differ ? "" : distinct[0] || "")};
    });
    const crits = {}, v = {}, d = {};
    let divergences = 0, treated = 0, pending = 0;
    GRID.forEach(cr => {
      const cmp = critCompare(cr, entries);
      const dec = get(fin.crit, cr.id) || null;
      let value = null, deg = 0, source = "";
      if (dec && dec.v != null) { value = dec.v; deg = degreeOf(cr, dec.v, dec.deg); source = "jury"; }
      else if (cmp.commonDeg) { value = cmp.mean; deg = cmp.commonDeg; source = cmp.count > 1 ? "moyenne" : "unique"; }
      const mustDecide = MUST_DECIDE.includes(cmp.status);
      const divergent = DIVERGENT.includes(cmp.status);
      if (divergent) { divergences++; if (source === "jury") treated++; }
      if (mustDecide && source !== "jury") pending++;
      crits[cr.id] = {...cmp, value, deg, source, decision:dec, mustDecide, divergent};
      if (value != null) { v[cr.id] = value; d[cr.id] = deg; }
    });
    const ev = {theme:choices.theme.value, split:choices.split.value, role:choices.role.value, v, d};
    const blockers = [];
    if (present.length < 2) blockers.push("Il faut au moins deux évaluations pour harmoniser");
    Object.entries(CHOICE_FIELDS).forEach(([f, meta]) => {
      if (choices[f].differ && !choices[f].decided) blockers.push(`${meta.label} : choix différents à trancher`);
      else if (!choices[f].value) blockers.push(`${meta.label} : non renseigné`);
    });
    if (pending) blockers.push(`${pending} critère(s) en désaccord de degré à trancher`);
    const unscored = GRID.filter(cr => v[cr.id] == null && !crits[cr.id].mustDecide).length;
    if (unscored) blockers.push(`${unscored} critère(s) sans note`);
    let status = "incomplete";
    if (present.length >= 2) {
      const all = GRID.map(cr => crits[cr.id].status);
      if (Object.values(choices).some(c => c.differ)) all.push("choices");
      status = all.sort((a, b) => STATUS[a].rank - STATUS[b].rank)[0];
    }
    return {ev, scores:scores(ev), crits, choices, blockers, divergences, treated, pending, status, evaluators:present.length};
  }

  const evKey = ev => JSON.stringify([ev.theme, ev.split, ev.role, GRID.map(c => ev.v?.[c.id] ?? null)]);

  function makeValidation(h, me, note) {
    const s = h.scores;
    const out = {at:Date.now(), by:me, ev:clone(h.ev), total:s.total, afl1:s.afl1, afl2:s.afl2, afl3:s.afl3};
    if (note) out.note = note;
    return out;
  }

  /* Note retenue d'un candidat : la note validée (figée) si elle existe,
     sinon la note provisoire. « stale » signale qu'une évaluation a changé
     depuis la validation. */
  function retainedFor(ep, cand, me) {
    const entries = entriesFor(ep, cand, me);
    const fin = get(ep.final, cand.id) || null;
    const h = harmonize(entries, fin);
    const validated = fin?.validated || null;
    return {
      entries, fin, h, validated,
      ev:validated ? validated.ev : h.ev,
      total:validated ? validated.total : h.scores.total,
      stale:!!validated && evKey(validated.ev) !== evKey(h.ev)
    };
  }

  const needsAction = r => !r.validated && ["major", "degree", "choices", "points"].includes(r.h.status);

  /* =========================
     CANDIDATS
  ========================= */

  function addCandidates(ep, names, classes) {
    let added = 0;
    names.forEach((raw, i) => {
      const name = String(raw || "").replace(/\s+/g, " ").trim();
      const classroom = String(classes?.[i] || "").trim();
      if (!name) return;
      const existing = ep.candidates.find(c => normName(c.name) === normName(name));
      if (existing) { if (!existing.classroom && classroom) existing.classroom = classroom; return; }
      ep.candidates.push({id:uid(), name, classroom});
      added++;
    });
    ep.candidates.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return added;
  }

  /* Liste d'élèves au format CSV (export Pronote) : nom en colonne A,
     classe reprise si une colonne « Classe » existe. */
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/)[0] || "";
    const sep = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const header = rows[0] && /^(eleves?|noms?|candidats?|nom prenom|nom et prenom)$/.test(normName(rows[0][0]));
    const classCol = header ? rows[0].findIndex(h => normName(h) === "classe") : -1;
    const body = (header ? rows.slice(1) : rows).filter(r => String(r[0] || "").trim());
    return {names:body.map(r => r[0]), classes:body.map(r => classCol >= 0 ? r[classCol] : "")};
  }

  /* =========================
     ÉCHANGES (QR, CODE, FICHIER)
     Ligne candidat : [nom, répartition, thème, rôle, cellules, modifié (s), terminée, classe]
     Les quatre premiers champs restent ceux du format 1.
  ========================= */

  function exportRows(ep, candidates) {
    return (candidates || ep.candidates).map(c => {
      const ev = get(ep.mine, c.id);
      if (!isFilled(ev)) return c.classroom ? [c.name, "", "", "", 0, 0, 0, c.classroom] : [c.name];
      const cells = GRID.map(cr => encodeCell(cr, ev.v[cr.id], ev.d?.[cr.id]));
      const row = [c.name, ev.split || "", ev.theme || "", ev.role || "", cells, Math.round((ev.updatedAt || 0) / 1000), ev.done ? 1 : 0];
      if (c.classroom) row.push(c.classroom);
      return row;
    });
  }

  /* Lot stable tant que les données ne changent pas : les QR d'un même envoi
     restent reconnus ensemble même si l'écran est réaffiché entre deux scans. */
  function qrParts(ep, me, now = Date.now()) {
    const rows = exportRows(ep);
    const batch = hash(JSON.stringify([ep.title, me, rows]));
    const chunks = [];
    for (let i = 0; i < Math.max(1, rows.length); i += PER_QR) chunks.push(rows.slice(i, i + PER_QR));
    return chunks.map((r, i) => QR_PREFIX + JSON.stringify({v:FORMAT_VERSION, t:ep.title, e:me, a:now, k:batch, p:[i + 1, chunks.length], r}));
  }

  /* QR d'un seul candidat : complète une évaluation déjà reçue sans toucher aux lots. */
  function singleQR(ep, cand, me, now = Date.now()) {
    return QR_PREFIX + JSON.stringify({v:FORMAT_VERSION, t:ep.title, e:me, a:now, s:1, r:exportRows(ep, [cand])});
  }

  function exportFile(ep, me, now = Date.now()) {
    const comments = {};
    ep.candidates.forEach(c => { const t = get(ep.mine, c.id)?.comment; if (t) comments[c.name] = t; });
    return {type:"coeval-musculation", version:FORMAT_VERSION, title:ep.title, by:me, at:now, rows:exportRows(ep), comments};
  }

  function parseCodes(text) {
    const lines = String(text).split(/\s*(?=COEVAL1:)/).map(s => s.trim()).filter(s => s.startsWith(QR_PREFIX));
    if (!lines.length) return {error:"Ce QR n'est pas une évaluation de co-évaluation."};
    const payloads = [];
    for (const line of lines) {
      let p;
      try { p = JSON.parse(line.slice(QR_PREFIX.length)); }
      catch (e) { return {error:"Code illisible ou incomplet."}; }
      if (!p || typeof p !== "object") return {error:"Code illisible ou incomplet."};
      payloads.push({v:p.v || 1, title:p.t, by:p.e, at:p.a, batch:p.k, part:p.p, single:!!p.s, prep:p.m === "prep", rows:p.r});
    }
    return {payloads};
  }

  function fileToPayload(d) {
    return {v:d.version || 1, title:d.title, by:d.by, at:d.at, batch:"file-" + d.at, part:null, single:false,
      prep:d.type === "coeval-preparation", rows:d.rows, comments:d.comments};
  }

  /* =========================
     PRÉPARATION DU CO-ÉVALUATEUR
     Avant l'épreuve : liste des candidats, répartition, thème, rôle et notes
     AFL2/AFL3 déjà évaluées. Les notes AFL1 ne sont jamais transmises.
  ========================= */

  function prepRows(ep) {
    return exportRows(ep).map(r => {
      if (r.length < 5) return r;
      const cells = Array.isArray(r[4]) ? r[4].map((c, i) => PREP_CRITS.includes(GRID[i].id) ? c : 0) : 0;
      const row = [r[0], r[1], r[2], r[3], cells, r[5], 0];
      if (r[7]) row.push(r[7]);
      return row;
    });
  }

  function prepParts(ep, me, now = Date.now()) {
    const rows = prepRows(ep);
    const batch = "p" + hash(JSON.stringify([ep.title, me, rows]));
    const chunks = [];
    for (let i = 0; i < Math.max(1, rows.length); i += PER_QR) chunks.push(rows.slice(i, i + PER_QR));
    return chunks.map((r, i) => QR_PREFIX + JSON.stringify({v:FORMAT_VERSION, m:"prep", t:ep.title, e:me, a:now, k:batch, p:[i + 1, chunks.length], r}));
  }

  function exportPrepFile(ep, me, now = Date.now()) {
    return {type:"coeval-preparation", version:FORMAT_VERSION, title:ep.title, by:me, at:now, rows:prepRows(ep)};
  }

  /* Candidats prêts à transmettre : répartition choisie et AFL2/AFL3 notés. */
  function prepReady(ep) {
    return ep.candidates.filter(c => {
      const ev = get(ep.mine, c.id);
      return !!ev && !!ev.split && !!ev.role && PREP_CRITS.every(id => ev.v?.[id] != null);
    }).length;
  }

  /* Pré-remplit mes fiches avec la préparation reçue. Les champs repris sont notés
     dans ev.pre (et verrouillés à l'écran). Jamais d'écrasement silencieux : une fiche
     terminée, une valeur que j'ai saisie moi-même ou une préparation plus ancienne
     sont conservées et comptées. */
  function mergePrep(ep, p, me) {
    const by = String(p.by || "Collègue").trim();
    if (normName(by) === normName(me)) return {error:"C'est ta propre préparation (même nom d'évaluateur)."};
    if (RESERVED.test(by)) return {error:"Nom d'évaluateur invalide."};
    if ((p.v || 1) > FORMAT_VERSION) return {error:"Ces données viennent d'une version plus récente de l'application : mets-la à jour."};
    if (!Array.isArray(p.rows) || p.rows.some(r => !Array.isArray(r) || typeof r[0] !== "string")) return {error:"Données illisibles."};
    const added = addCandidates(ep, p.rows.map(r => r[0]), p.rows.map(r => typeof r[7] === "string" ? r[7] : ""));
    let filled = 0, kept = 0, locked = 0, older = 0;
    p.rows.forEach(([name, split, theme, role, cells, t]) => {
      const cand = ep.candidates.find(c => normName(c.name) === normName(name));
      if (!cand) return;
      const inc = {split:own(SPLITS, split) ? split : "", theme:own(THEMES, theme) ? theme : "", role:own(ROLES, role) ? role : "", v:{}, d:{}};
      if (Array.isArray(cells)) GRID.forEach((cr, i) => {
        if (!PREP_CRITS.includes(cr.id)) return;
        const m = decodeCell(cr, cells[i]);
        if (m) { inc.v[cr.id] = m.v; inc.d[cr.id] = m.d; }
      });
      if (!inc.split && !inc.theme && !inc.role && !Object.keys(inc.v).length) return;
      const ev = get(ep.mine, cand.id) || (ep.mine[cand.id] = emptyEval());
      if (ev.done) { locked++; return; }
      const time = typeof t === "number" && t > 0 ? t * 1000 : p.at || 0;
      if (ev.pre && (ev.pre.at || 0) > time) { older++; return; }
      const prev = ev.pre && !ev.pre.unlocked ? ev.pre : {choices:[], crits:[]};
      const pre = {by, at:time, choices:[], crits:[]};
      if (ev.pre?.unlocked) pre.unlocked = true;
      let conflict = false;
      PREP_CHOICES.forEach(f => {
        if (!inc[f]) return;
        if (ev[f] && ev[f] !== inc[f] && !prev.choices.includes(f)) { conflict = true; return; }
        ev[f] = inc[f];
        pre.choices.push(f);
      });
      PREP_CRITS.forEach(id => {
        if (inc.v[id] == null) return;
        if (ev.v[id] != null && ev.v[id] !== inc.v[id] && !prev.crits.includes(id)) { conflict = true; return; }
        ev.v[id] = inc.v[id];
        ev.d[id] = inc.d[id];
        pre.crits.push(id);
      });
      if (conflict) kept++;
      if (pre.choices.length || pre.crits.length) {
        ev.pre = pre;
        ev.updatedAt = Math.max(ev.updatedAt || 0, Date.now());
        filled++;
      }
    });
    const info = ep.prepFrom && ep.prepFrom.by === by && ep.prepFrom.batch === p.batch
      ? ep.prepFrom : (ep.prepFrom = {by, batch:p.batch || "", at:p.at || 0, parts:null});
    info.lastAt = Date.now();
    let dup = false;
    if (p.part) {
      const [n, total] = p.part;
      info.parts = info.parts && info.parts.total === total ? info.parts : {total, got:[]};
      if (info.parts.got.includes(n)) dup = true;
      else info.parts.got.push(n);
    }
    const got = info.parts ? info.parts.got.length : 1;
    const total = info.parts ? info.parts.total : 1;
    return {by, prep:true, added, filled, kept, locked, older, dup, got, total, done:got >= total};
  }

  /* Fusionne l'évaluation reçue d'un collègue.
     Jamais d'écrasement silencieux : une fiche plus ancienne que celle déjà reçue
     est ignorée (et comptée), une ligne vide n'efface pas une fiche reçue. */
  function mergeOther(ep, p, me) {
    const by = String(p.by || "Collègue").trim();
    if (normName(by) === normName(me)) return {error:"C'est ta propre évaluation (même nom d'évaluateur)."};
    if (RESERVED.test(by)) return {error:"Nom d'évaluateur invalide."};
    if ((p.v || 1) > FORMAT_VERSION) return {error:"Ces données viennent d'une version plus récente de l'application : mets-la à jour."};
    if (!Array.isArray(p.rows) || p.rows.some(r => !Array.isArray(r) || typeof r[0] !== "string")) return {error:"Données illisibles."};
    const added = addCandidates(ep, p.rows.map(r => r[0]), p.rows.map(r => typeof r[7] === "string" ? r[7] : ""));
    const prev = get(ep.others, by);
    let other;
    if (p.single) other = prev || (ep.others[by] = {at:p.at || 0, batch:"", rows:{}, parts:null});
    else if (prev && p.batch && prev.batch === p.batch) other = prev;
    else other = ep.others[by] = {at:p.at || 0, batch:p.batch || "", rows:{...(prev?.rows || {})}, parts:null};
    let updated = 0, older = 0;
    p.rows.forEach(([name, split, theme, role, cells, t, done]) => {
      const key = normName(name);
      if (!key) return;
      const ev = {
        split:own(SPLITS, split) ? split : "", theme:own(THEMES, theme) ? theme : "", role:own(ROLES, role) ? role : "",
        v:{}, d:{}, comment:"", updatedAt:typeof t === "number" && t > 0 ? t * 1000 : p.at || 0, done:!!done
      };
      if (Array.isArray(cells)) GRID.forEach((cr, i) => {
        const m = decodeCell(cr, cells[i]);
        if (m) { ev.v[cr.id] = m.v; ev.d[cr.id] = m.d; }
      });
      const old = get(other.rows, key);
      const comment = p.comments ? get(p.comments, name) : undefined;
      ev.comment = typeof comment === "string" ? comment : old?.comment || "";
      if (!isFilled(ev)) { if (!old) other.rows[key] = ev; return; }
      if (isFilled(old) && (old.updatedAt || 0) > ev.updatedAt) { older++; return; }
      other.rows[key] = ev;
      updated++;
    });
    other.at = Math.max(other.at || 0, p.at || 0);
    other.lastAt = Date.now();
    let dup = false;
    if (p.part && !p.single) {
      const [n, total] = p.part;
      other.parts = other.parts && other.parts.total === total ? other.parts : {total, got:[]};
      if (other.parts.got.includes(n)) dup = true;
      else other.parts.got.push(n);
    }
    const got = other.parts ? other.parts.got.length : 1;
    const total = other.parts ? other.parts.total : 1;
    return {by, added, updated, older, dup, got, total, done:got >= total, single:!!p.single};
  }

  function importPayloads(ep, payloads, me) {
    let last = null;
    const sum = {added:0, updated:0, older:0, filled:0, kept:0, locked:0};
    for (const p of payloads) {
      const res = p.prep ? mergePrep(ep, p, me) : mergeOther(ep, p, me);
      if (res.error) return res;
      Object.keys(sum).forEach(k => { sum[k] += res[k] || 0; });
      last = res;
    }
    return {...last, ...sum};
  }

  function mergeMessage(res) {
    if (res.error) return res.error;
    const extra = [
      res.added && `${res.added} candidat(s) ajouté(s)`,
      res.older && `${res.older} fiche(s) plus ancienne(s) ignorée(s)`,
      res.kept && `${res.kept} fiche(s) où tu avais saisi autre chose : tes valeurs sont conservées`,
      res.locked && `${res.locked} fiche(s) déjà terminée(s) non modifiée(s)`
    ].filter(Boolean).join(" · ");
    if (res.prep) {
      const head = res.done ? `✅ Préparation de ${res.by} reçue : ${res.filled} fiche(s) pré-remplie(s) (répartition, AFL2, AFL3)`
        : res.dup ? `QR de préparation déjà reçu (${res.got}/${res.total}) : montre le suivant`
        : `QR de préparation ${res.got}/${res.total} de ${res.by} reçu : montre le suivant`;
      return head + (extra ? ` · ${extra}` : "") + ".";
    }
    const head = res.single ? `✅ Fiche de ${res.by} reçue`
      : res.done ? `✅ Évaluation de ${res.by} reçue`
      : res.dup ? `QR déjà reçu (${res.got}/${res.total} de ${res.by}) : montre le suivant`
      : `QR ${res.got}/${res.total} de ${res.by} reçu : montre le suivant`;
    return head + (extra ? ` · ${extra}` : "") + ".";
  }

  /* =========================
     HISTORIQUE (traçabilité déclarative, sans authentification)
  ========================= */

  function logHistory(ep, entry, me, now = Date.now()) {
    ep.history = ep.history || [];
    const last = ep.history[ep.history.length - 1];
    if (entry.type === "eval-edit" && last && last.type === "eval-edit" && last.cand === entry.cand
      && last.field === entry.field && now - last.at < 120000) {
      last.to = entry.to;
      last.at = now;
      return last;
    }
    const e = {id:uid(), at:now, by:me, ...entry};
    ep.history.push(e);
    return e;
  }

  /* =========================
     MIGRATION (version 1 → 2), idempotente
  ========================= */

  function normEval(ev) {
    if (!ev || typeof ev !== "object") return emptyEval();
    ev.v = obj(ev.v); ev.d = obj(ev.d);
    GRID.forEach(cr => {
      if (ev.v[cr.id] != null && !isValidValue(cr, ev.v[cr.id])) delete ev.v[cr.id];
      if (ev.v[cr.id] == null && !(ev.d[cr.id] >= 1 && ev.d[cr.id] <= 4)) delete ev.d[cr.id];
    });
    ["split", "theme", "role", "comment"].forEach(k => { ev[k] = typeof ev[k] === "string" ? ev[k] : ""; });
    ev.updatedAt = typeof ev.updatedAt === "number" ? ev.updatedAt : 0;
    ev.done = !!ev.done;
    return ev;
  }

  function migrateEpreuve(ep, me) {
    ep.candidates = Array.isArray(ep.candidates) ? ep.candidates.filter(c => c && typeof c.id === "string" && typeof c.name === "string") : [];
    ep.candidates.forEach(c => { c.classroom = typeof c.classroom === "string" ? c.classroom : ""; });
    ep.mine = obj(ep.mine); ep.others = obj(ep.others); ep.final = obj(ep.final);
    ep.history = Array.isArray(ep.history) ? ep.history : [];
    Object.keys(ep.mine).forEach(k => { ep.mine[k] = normEval(ep.mine[k]); });
    Object.keys(ep.others).forEach(name => {
      if (RESERVED.test(name)) { delete ep.others[name]; return; }
      const o = ep.others[name] = obj(ep.others[name]);
      o.rows = obj(o.rows);
      Object.keys(o.rows).forEach(k => { o.rows[k] = normEval(o.rows[k]); });
    });
    Object.keys(ep.final).forEach(cid => {
      const f = obj(ep.final[cid]);
      const fin = {crit:obj(f.crit), choice:obj(f.choice), validated:null, updatedAt:typeof f.updatedAt === "number" ? f.updatedAt : 0};
      // Version 1 : notes forcées rangées directement sous l'id du critère,
      // répartition et rôle retenus parfois au même niveau.
      GRID.forEach(cr => {
        if (typeof f[cr.id] === "number" && isValidValue(cr, f[cr.id])) fin.crit[cr.id] = {deg:degreeOf(cr, f[cr.id]), v:f[cr.id]};
      });
      if (own(SPLITS, f.split) && !fin.choice.split) fin.choice.split = f.split;
      if (own(ROLES, f.role) && !fin.choice.role) fin.choice.role = f.role;
      if (f.validated && typeof f.validated === "object") fin.validated = f.validated;
      else if (f.validated === true) {
        const cand = ep.candidates.find(c => c.id === cid);
        if (cand) fin.validated = makeValidation(harmonize(entriesFor(ep, cand, me), fin), me, "validée avant la version 2");
      }
      ep.final[cid] = fin;
    });
    return ep;
  }

  function migrateDb(raw) {
    if (!raw || !Array.isArray(raw.epreuves)) return null;
    raw.me = typeof raw.me === "string" ? raw.me : "";
    raw.epreuves = raw.epreuves.filter(e => e && typeof e.id === "string");
    raw.epreuves.forEach(ep => { ep.title = String(ep.title || "Épreuve"); migrateEpreuve(ep, raw.me); });
    raw.version = DATA_VERSION;
    return raw;
  }

  /* =========================
     SAUVEGARDE ET RESTAURATION
  ========================= */

  const contentHash = ep => hash(JSON.stringify({...ep, backupAt:undefined, backupHash:undefined}));

  function makeBackup(ep, me, now = Date.now()) {
    return {type:"coeval-backup", version:DATA_VERSION, savedAt:now, by:me, epreuve:clone(ep)};
  }

  function checkBackup(d) {
    if (!d || d.type !== "coeval-backup") return {error:"Ce fichier n'est pas une sauvegarde d'épreuve."};
    if (typeof d.version !== "number" || d.version < 1) return {error:"Version de sauvegarde inconnue."};
    if (d.version > DATA_VERSION) return {error:"Sauvegarde créée par une version plus récente de l'application : mets-la à jour."};
    const ep = d.epreuve;
    if (!ep || typeof ep !== "object" || typeof ep.id !== "string" || typeof ep.title !== "string" || !Array.isArray(ep.candidates)) {
      return {error:"Sauvegarde incomplète ou abîmée."};
    }
    if (ep.candidates.some(c => !c || typeof c.id !== "string" || typeof c.name !== "string")) return {error:"Liste de candidats invalide."};
    if (new Set(ep.candidates.map(c => c.id)).size !== ep.candidates.length) return {error:"Candidats en double dans la sauvegarde."};
    for (const k of ["mine", "others", "final"]) {
      if (ep[k] != null && (typeof ep[k] !== "object" || Array.isArray(ep[k]))) return {error:"Sauvegarde abîmée (" + k + ")."};
    }
    const by = typeof d.by === "string" ? d.by : "";
    const work = migrateEpreuve(clone(ep), by);
    const finals = Object.values(work.final);
    return {
      epreuve:work,
      preview:{
        title:work.title, by, savedAt:d.savedAt || 0, version:d.version,
        candidates:work.candidates.length,
        mine:work.candidates.filter(c => isFilled(get(work.mine, c.id))).length,
        others:Object.keys(work.others),
        decisions:finals.reduce((s, f) => s + Object.keys(f.crit).length + Object.keys(f.choice).length, 0),
        validated:finals.filter(f => f.validated).length,
        history:work.history.length
      }
    };
  }

  /* Sauvegarde d'un autre évaluateur : ses fiches deviennent une évaluation reçue. */
  function asReceived(ep, author, me) {
    const rows = {};
    let at = 0;
    ep.candidates.forEach(c => {
      const ev = get(ep.mine, c.id);
      if (isFilled(ev)) { rows[normName(c.name)] = ev; at = Math.max(at, ev.updatedAt || 0); }
    });
    Object.keys(ep.others).forEach(n => { if (normName(n) === normName(me)) delete ep.others[n]; });
    if (Object.keys(rows).length) ep.others[author] = {at, batch:"", rows, parts:null, lastAt:Date.now()};
    ep.mine = {};
    return ep;
  }

  function mergeEpreuve(T, I) {
    const idMap = {};
    I.candidates.forEach(c => {
      let t = T.candidates.find(x => normName(x.name) === normName(c.name));
      if (!t) {
        t = {id:T.candidates.some(x => x.id === c.id) ? uid() : c.id, name:c.name, classroom:c.classroom || ""};
        T.candidates.push(t);
      } else if (!t.classroom && c.classroom) t.classroom = c.classroom;
      idMap[c.id] = t.id;
    });
    T.candidates.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    Object.entries(I.mine).forEach(([cid, ev]) => {
      const tid = idMap[cid];
      if (!tid || !isFilled(ev)) return;
      const cur = get(T.mine, tid);
      if (!isFilled(cur) || (ev.updatedAt || 0) > (cur.updatedAt || 0)) T.mine[tid] = {...ev, initial:ev.initial || cur?.initial || null};
      else if (!cur.initial && ev.initial) cur.initial = ev.initial;
    });
    Object.entries(I.others).forEach(([name, o]) => {
      const cur = get(T.others, name);
      if (!cur) { T.others[name] = o; return; }
      Object.entries(o.rows).forEach(([key, ev]) => {
        const c = get(cur.rows, key);
        if (isFilled(ev) && (!isFilled(c) || (ev.updatedAt || 0) > (c.updatedAt || 0))) cur.rows[key] = ev;
      });
      cur.at = Math.max(cur.at || 0, o.at || 0);
    });
    Object.entries(I.final).forEach(([cid, f]) => {
      const tid = idMap[cid];
      if (!tid) return;
      const cur = get(T.final, tid);
      if (!cur || (f.updatedAt || 0) > (cur.updatedAt || 0)) T.final[tid] = f;
    });
    const seen = new Set(T.history.map(h => h.id));
    I.history.forEach(h => { if (!seen.has(h.id)) T.history.push({...h, cand:idMap[h.cand] || h.cand}); });
    T.history.sort((a, b) => a.at - b.at);
    return T;
  }

  /* mode : "merge" (dans opts.targetId), "replace" (opts.targetId) ou "new". */
  function restoreBackup(db, checked, opts, me) {
    let inc = clone(checked.epreuve);
    const foreign = normName(checked.preview.by) !== normName(me);
    if (foreign) inc = asReceived(inc, checked.preview.by || "Collègue", me);
    const idx = db.epreuves.findIndex(e => e.id === opts.targetId);
    if (opts.mode === "replace") {
      if (idx < 0) return {error:"Épreuve à remplacer introuvable."};
      if (foreign) return {error:"Remplacement impossible : cette sauvegarde est celle d'un autre évaluateur. Choisis la fusion."};
      inc.id = db.epreuves[idx].id;
      db.epreuves[idx] = inc;
      db.activeId = inc.id;
      return {ep:inc, foreign};
    }
    if (opts.mode === "merge" && idx >= 0) {
      mergeEpreuve(db.epreuves[idx], inc);
      db.activeId = db.epreuves[idx].id;
      return {ep:db.epreuves[idx], foreign};
    }
    if (db.epreuves.some(e => e.id === inc.id)) inc.id = uid();
    db.epreuves.unshift(inc);
    db.activeId = inc.id;
    return {ep:inc, foreign};
  }

  /* =========================
     BILAN DU JURY
     Indicateurs de concordance, pas une mesure de la qualité d'un évaluateur.
  ========================= */

  function juryStats(ep, me) {
    const names = [me, ...Object.keys(ep.others)];
    const perEval = names.map(name => ({name, filled:0, complete:0, retainedN:0, retainedSum:0}));
    const pairs = [];
    for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) {
      pairs.push({a, b, n:0, sumAbs:0, sumSigned:0, crit:Object.fromEntries(GRID.map(c => [c.id, {n:0, sumSigned:0}]))});
    }
    const perCrit = GRID.map(c => ({id:c.id, label:c.label, compared:0, agree:0, degree:0, major:0, points:0}));
    let compared = 0, agree = 0, withDegree = 0, needed = 0, validated = 0, crossed = 0;
    ep.candidates.forEach(cand => {
      const r = retainedFor(ep, cand, me);
      const totals = r.entries.map(x => x.ev ? scores(x.ev).total : null);
      r.entries.forEach((x, i) => {
        if (!x.ev) return;
        perEval[i].filled++;
        if (scores(x.ev).complete) perEval[i].complete++;
      });
      pairs.forEach(p => {
        const ta = totals[p.a], tb = totals[p.b];
        if (ta != null && tb != null) { p.n++; p.sumAbs += Math.abs(ta - tb); p.sumSigned += ta - tb; }
        GRID.forEach(cr => {
          const va = r.entries[p.a].ev?.v?.[cr.id], vb = r.entries[p.b].ev?.v?.[cr.id];
          if (va != null && vb != null) { p.crit[cr.id].n++; p.crit[cr.id].sumSigned += va - vb; }
        });
      });
      if (r.h.evaluators >= 2) crossed++;
      let deg = false;
      GRID.forEach((cr, k) => {
        const st = r.h.crits[cr.id];
        if (st.count < 2) return;
        perCrit[k].compared++; compared++;
        if (!st.degGap) { perCrit[k].agree++; agree++; }
        if (st.status === "major") { perCrit[k].major++; perCrit[k].degree++; deg = true; }
        else if (st.status === "degree") { perCrit[k].degree++; deg = true; }
        else if (st.status === "points") perCrit[k].points++;
      });
      if (deg) withDegree++;
      if (["major", "degree", "choices", "points"].includes(r.h.status)) needed++;
      if (r.validated && r.validated.total != null) {
        validated++;
        totals.forEach((t, i) => { if (t != null) { perEval[i].retainedN++; perEval[i].retainedSum += Math.abs(t - r.validated.total); } });
      }
    });
    return {
      names, crossed, withDegree, needed, validated, compared,
      exactDegreePct:compared ? agree / compared * 100 : null,
      perEval:perEval.map(e => ({...e, retainedGap:e.retainedN ? e.retainedSum / e.retainedN : null})),
      pairs:pairs.map(p => ({
        a:p.a, b:p.b, n:p.n,
        meanAbs:p.n ? p.sumAbs / p.n : null, meanSigned:p.n ? p.sumSigned / p.n : null,
        crit:GRID.map(c => ({id:c.id, label:c.label, max:c.max, n:p.crit[c.id].n, meanSigned:p.crit[c.id].n ? p.crit[c.id].sumSigned / p.crit[c.id].n : null}))
      })),
      perCrit
    };
  }

  return {
    DATA_VERSION, FORMAT_VERSION, QR_PREFIX, PER_QR,
    GRID, ROLE_LEVELS, AFL1_IDS, AFL2_IDS, PREP_CRITS, PREP_CHOICES, SPLITS, THEMES, ROLES, CHOICE_FIELDS, STATUS, DIVERGENT, MUST_DECIDE,
    uid, normName, q4, fmt, hash, clone, own, get, critById,
    inRange, degreeOf, stepsOf, descOf, degreeName, isValidValue, emptyEval, isFilled, scores, missingFields,
    encodeCell, decodeCell,
    entriesFor, critCompare, harmonize, makeValidation, retainedFor, needsAction, evKey,
    addCandidates, parseCSV,
    exportRows, qrParts, singleQR, exportFile, parseCodes, fileToPayload, mergeOther, importPayloads, mergeMessage,
    prepRows, prepParts, exportPrepFile, prepReady, mergePrep,
    logHistory, migrateEpreuve, migrateDb, contentHash, makeBackup, checkBackup, mergeEpreuve, restoreBackup,
    juryStats
  };
});
