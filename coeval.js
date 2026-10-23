/* =========================================================
   CO-ÉVALUATION BAC — MUSCULATION CA5
   Chaque évaluateur note de son côté (sans voir l'autre),
   puis les évaluations sont échangées (QR, fichier ou code)
   et croisées critère par critère.
   ========================================================= */

(() => {
  "use strict";

  const KEY = "df-coeval-v1";
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

  const SPLITS = {"4-4":[4, 4], "6-2":[6, 2], "2-6":[2, 6]};
  const THEMES = {"1":"Puissance", "2":"Tonification", "3":"Volume"};
  const ROLES = {partenaire:"Partenaire d'entraînement", juge:"Juge"};

  /* =========================
     DONNÉES
  ========================= */

  const $ = id => document.getElementById(id);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  const normName = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const fmt = n => n == null || Number.isNaN(n) ? "—" : (Math.round(n * 100) / 100).toString().replace(".", ",");
  const q4 = n => Math.round(n * 4) / 4;

  let db = load();
  let tab = "eval";
  let currentId = null;
  let crossId = null;
  let stopCamera = null;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && Array.isArray(raw.epreuves)) return raw;
    } catch (e) { console.error(e); }
    return {me:"", epreuves:[], activeId:null};
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast("⚠️ Enregistrement impossible sur cet appareil."); }
  }

  function active() {
    return db.epreuves.find(e => e.id === db.activeId) || db.epreuves[0] || null;
  }

  function newEpreuve(title) {
    const e = {id:uid(), title, createdAt:Date.now(), candidates:[], mine:{}, others:{}, final:{}};
    db.epreuves.unshift(e);
    db.activeId = e.id;
    save();
    return e;
  }

  function emptyEval() {
    return {split:"", theme:"", role:"", v:{}, d:{}, comment:"", updatedAt:0};
  }

  function evalOf(ep, candId) {
    return ep.mine[candId] || (ep.mine[candId] = emptyEval());
  }

  function addCandidates(ep, names, classes) {
    let added = 0;
    names.forEach((raw, i) => {
      const name = String(raw || "").replace(/\s+/g, " ").trim();
      if (!name || ep.candidates.some(c => normName(c.name) === normName(name))) return;
      ep.candidates.push({id:uid(), name, classroom:String(classes?.[i] || "").trim()});
      added++;
    });
    ep.candidates.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return added;
  }

  /* Liste d'élèves au format CSV (export Pronote) : nom en colonne A,
     classe reprise si une colonne « Classe » existe. */
  function parseCSV(text) {
    text = text.replace(/^\ufeff/, "");
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

  function readTextFile(file, then) {
    file.arrayBuffer().then(buf => {
      let text;
      try { text = new TextDecoder("utf-8", {fatal:true}).decode(buf); }
      catch (e) { text = new TextDecoder("windows-1252").decode(buf); }
      then(text);
    });
  }

  /* =========================
     CALCULS
  ========================= */

  function scores(ev) {
    const v = ev?.v || {};
    const sum = ids => ids.reduce((s, id) => s + (v[id] ?? 0), 0);
    const filled = GRID.filter(c => v[c.id] != null).length;
    const [w2, w3] = SPLITS[ev?.split] || [null, null];
    const afl1 = sum(["amp", "resp", "post", "param", "ress", "regul"]);
    const afl2 = w2 == null ? null : sum(["projet", "recueil"]) / 4 * w2;
    const afl3 = w3 == null ? null : (v.role ?? 0) / 2 * w3;
    const total = afl2 == null ? null : afl1 + afl2 + afl3;
    return {afl1, afl2, afl3, total, filled, complete:filled === GRID.length && !!ev.split && !!ev.role};
  }

  function degreeOf(crit, value, stored) {
    if (stored) return stored;
    if (value == null) return 0;
    const i = crit.deg.findIndex(([a, b]) => value >= a && value <= b);
    return i + 1;
  }

  function stepsOf([a, b]) {
    const out = [];
    for (let x = a; x <= b + 1e-9; x += .25) out.push(q4(x));
    return out;
  }

  function descOf(crit, ev) {
    if (crit.descByRole) return crit.descByRole[ev?.role] || null;
    return crit.desc;
  }

  /* =========================
     INTERFACE GÉNÉRALE
  ========================= */

  function toast(text) {
    const t = $("ceToast");
    t.textContent = text;
    t.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add("hidden"), 2600);
  }

  function renderBar() {
    const sel = $("ceEpreuve");
    sel.innerHTML = db.epreuves.length
      ? db.epreuves.map(e => `<option value="${e.id}"${e.id === active()?.id ? " selected" : ""}>${esc(e.title)} · ${e.candidates.length} candidat(s)</option>`).join("")
      : `<option value="">Aucune épreuve</option>`;
    $("ceMe").textContent = "👤 " + (db.me || "Qui évalue ?");
    document.querySelectorAll(".ce-tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  }

  function render() {
    if (stopCamera && tab !== "share") { stopCamera(); stopCamera = null; }
    renderBar();
    const ep = active();
    const main = $("ceMain");
    if (!db.me) { main.innerHTML = welcomeHTML(); return; }
    if (!ep) { main.innerHTML = noEpreuveHTML(); return; }
    if (tab === "eval") renderEval(main, ep);
    else if (tab === "share") renderShare(main, ep);
    else renderCross(main, ep);
  }

  function welcomeHTML() {
    return `<section class="ce-card ce-welcome">
      <h2>Bienvenue 👋</h2>
      <p>Chaque évaluateur utilise <b>son propre appareil</b> et note les candidats <b>sans voir</b> les notes de l'autre.
      Ensuite, vous échangez vos évaluations (QR code, fichier ou code texte) et l'outil <b>croise</b> les critères :
      écarts, désaccords de degré et note harmonisée.</p>
      <label>Ton nom d'évaluateur<input id="ceMeInput" placeholder="ex. M. Le Pannérer" autocomplete="name"></label>
      <button type="button" class="ce-primary" data-act="set-me">Commencer</button>
    </section>`;
  }

  function noEpreuveHTML() {
    return `<section class="ce-card ce-welcome">
      <h2>Crée une épreuve</h2>
      <p>Ex. « Bac Musculation · Terminale · juin 2026 ». Ajoute ensuite la liste des candidats
      (ou récupère-la en scannant le QR de ton collègue dans l'onglet « Échanger »).</p>
      <button type="button" class="ce-primary" data-act="new-epreuve">+ Nouvelle épreuve</button>
    </section>`;
  }

  /* =========================
     1 · ÉVALUER
  ========================= */

  function renderEval(main, ep) {
    if (!ep.candidates.length) {
      main.innerHTML = `<section class="ce-card ce-welcome"><h2>Aucun candidat</h2>
        <p>Ajoute les candidats, ou scanne le QR d'un collègue dans « Échanger » pour récupérer sa liste.</p>
        <button type="button" class="ce-primary" data-act="candidates">👥 Ajouter des candidats</button></section>`;
      return;
    }
    if (!ep.candidates.some(c => c.id === currentId)) currentId = ep.candidates[0].id;
    const cand = ep.candidates.find(c => c.id === currentId);
    const ev = evalOf(ep, cand.id);
    const s = scores(ev);
    const idx = ep.candidates.indexOf(cand);

    const list = ep.candidates.map(c => {
      const sc = scores(ep.mine[c.id]);
      const state = sc.complete ? "done" : sc.filled ? "partial" : "";
      return `<button type="button" class="ce-cand ${state}${c.id === cand.id ? " current" : ""}" data-act="pick" data-id="${c.id}">
        <span>${esc(c.name)}${c.classroom ? ` <i>${esc(c.classroom)}</i>` : ""}</span><small>${sc.complete ? fmt(sc.total) + "/20" : sc.filled + "/" + GRID.length}</small></button>`;
    }).join("");

    const choice = (field, options, label) => `<div class="ce-choice"><span>${label}</span>${
      Object.entries(options).map(([k, v]) => `<button type="button" class="${ev[field] === k ? "on" : ""}" data-act="set" data-field="${field}" data-value="${k}">${esc(v)}</button>`).join("")
    }</div>`;

    let groups = "", lastGroup = "";
    GRID.forEach(crit => {
      if (crit.group !== lastGroup) {
        if (lastGroup) groups += "</div>";
        lastGroup = crit.group;
        const head = crit.afl === "AFL1" ? `AFL1 · ${crit.group}` : crit.group;
        groups += `<div class="ce-group"><h3>${esc(head)}</h3>`;
      }
      groups += critHTML(crit, ev);
    });
    groups += "</div>";

    main.innerHTML = `<div class="ce-eval">
      <aside class="ce-list"><div class="ce-list-head">${ep.candidates.length} candidats · évaluation de <b>${esc(db.me)}</b></div>${list}</aside>
      <section class="ce-sheet">
        <div class="ce-card ce-cand-head">
          <div class="ce-nav">
            <button type="button" data-act="step" data-step="-1" ${idx === 0 ? "disabled" : ""}>←</button>
            <h2>${esc(cand.name)}</h2>
            <button type="button" data-act="step" data-step="1" ${idx === ep.candidates.length - 1 ? "disabled" : ""}>→</button>
          </div>
          ${choice("theme", THEMES, "Thème")}
          ${choice("split", {"4-4":"AFL2 4 · AFL3 4", "6-2":"AFL2 6 · AFL3 2", "2-6":"AFL2 2 · AFL3 6"}, "Répartition")}
          ${choice("role", ROLES, "Rôle AFL3")}
        </div>
        ${groups}
        <div class="ce-card"><label class="ce-comment">Remarques (facultatif)<textarea data-field="comment" rows="2">${esc(ev.comment)}</textarea></label></div>
        <div class="ce-total">
          <span>AFL1 <b>${fmt(s.afl1)}</b>/12</span>
          <span>AFL2 <b>${fmt(s.afl2)}</b>/${SPLITS[ev.split]?.[0] ?? "?"}</span>
          <span>AFL3 <b>${fmt(s.afl3)}</b>/${SPLITS[ev.split]?.[1] ?? "?"}</span>
          <strong>${s.total == null ? "Choisir la répartition" : fmt(s.total) + " / 20"}</strong>
          <small>${s.filled}/${GRID.length} critères</small>
        </div>
      </section>
    </div>`;
  }

  function critHTML(crit, ev) {
    const value = ev.v[crit.id];
    const deg = degreeOf(crit, value, ev.d[crit.id]);
    const desc = descOf(crit, ev);
    if (!desc) {
      return `<div class="ce-crit"><div class="ce-crit-head"><b>${esc(crit.label)}</b><span>/${crit.max}</span></div>
        <p class="ce-hint">Choisis d'abord le rôle AFL3 (partenaire ou juge) en haut de la fiche.</p></div>`;
    }
    const degs = crit.deg.map(([a, b], i) => `<button type="button" class="ce-deg d${i + 1}${deg === i + 1 ? " on" : ""}" data-act="deg" data-crit="${crit.id}" data-deg="${i + 1}">
      <b>${crit.names ? crit.names[i] : "Degré " + (i + 1)} <small>${a === b ? fmt(a) : fmt(a) + "–" + fmt(b)}</small></b><span>${esc(desc[i])}</span></button>`).join("");
    const chips = deg ? stepsOf(crit.deg[deg - 1]).map(x => `<button type="button" class="${value === x ? "on" : ""}" data-act="val" data-crit="${crit.id}" data-deg="${deg}" data-value="${x}">${fmt(x)}</button>`).join("") : "";
    return `<div class="ce-crit${value != null ? " filled" : ""}">
      <div class="ce-crit-head"><b>${esc(crit.label)}</b><span>${value != null ? `<strong>${fmt(value)}</strong>` : "—"} /${crit.max}</span></div>
      <div class="ce-degs">${degs}</div>
      ${deg && chips ? `<div class="ce-chips"><span>Note dans le degré ${deg} :</span>${chips}</div>` : ""}
    </div>`;
  }

  function setValue(ep, critId, deg, value) {
    const ev = evalOf(ep, currentId);
    const crit = GRID.find(c => c.id === critId);
    if (value == null) {
      const range = crit.deg[deg - 1];
      ev.d[critId] = deg;
      if (range[0] === range[1]) ev.v[critId] = range[0];
      else if (ev.v[critId] == null || ev.v[critId] < range[0] || ev.v[critId] > range[1]) delete ev.v[critId];
    } else {
      ev.d[critId] = deg;
      ev.v[critId] = value;
    }
    ev.updatedAt = Date.now();
    save();
  }

  /* =========================
     2 · ÉCHANGER
  ========================= */

  function exportPayload(ep) {
    const rows = ep.candidates.map(c => {
      const ev = ep.mine[c.id] || emptyEval();
      const cells = GRID.map(cr => ev.v[cr.id] == null ? 0 : degreeOf(cr, ev.v[cr.id], ev.d[cr.id]) * 100 + Math.round(ev.v[cr.id] * 4) + 1);
      return cells.some(Boolean) || ev.split || ev.role ? [c.name, ev.split, ev.theme, ev.role, cells] : [c.name];
    });
    return {title:ep.title, by:db.me, at:Date.now(), rows};
  }

  function qrParts(ep) {
    const p = exportPayload(ep);
    const batch = uid().slice(0, 8);
    const chunks = [];
    for (let i = 0; i < Math.max(1, p.rows.length); i += PER_QR) chunks.push(p.rows.slice(i, i + PER_QR));
    return chunks.map((rows, i) => QR_PREFIX + JSON.stringify({t:p.title, e:p.by, a:p.at, k:batch, p:[i + 1, chunks.length], r:rows}));
  }

  function qrImage(text) {
    if (typeof qrcode !== "function") return "";
    const qr = qrcode(0, "M");
    qr.addData(unescape(encodeURIComponent(text)), "Byte");
    qr.make();
    return qr.createSvgTag({cellSize:4, margin:4, scalable:true});
  }

  let shareIndex = 0;

  function renderShare(main, ep) {
    const parts = ep.candidates.length ? qrParts(ep) : [];
    shareIndex = Math.min(shareIndex, Math.max(0, parts.length - 1));
    const others = Object.entries(ep.others);
    main.innerHTML = `<div class="ce-share">
      <section class="ce-card">
        <h2>📤 Envoyer mon évaluation</h2>
        <p>Ton collègue scanne ${parts.length > 1 ? `les <b>${parts.length} QR</b> (dans n'importe quel ordre)` : "ce QR"} depuis son onglet « Échanger ».
        Le QR contient aussi la liste des candidats : il sert à la partager avant l'épreuve.</p>
        ${parts.length ? `<div class="ce-qr">${qrImage(parts[shareIndex])}</div>
        <div class="ce-nav ce-qr-nav">
          <button type="button" data-act="qr-step" data-step="-1" ${shareIndex === 0 ? "disabled" : ""}>←</button>
          <b>QR ${shareIndex + 1} / ${parts.length}</b>
          <button type="button" data-act="qr-step" data-step="1" ${shareIndex >= parts.length - 1 ? "disabled" : ""}>→</button>
        </div>` : `<p class="ce-hint">Ajoute des candidats pour générer un QR.</p>`}
        <div class="ce-actions">
          <button type="button" data-act="download">💾 Fichier</button>
          <button type="button" data-act="copy-code">📋 Copier le code</button>
        </div>
      </section>
      <section class="ce-card">
        <h2>📥 Recevoir l'évaluation d'un collègue</h2>
        <div class="ce-camera"><video id="ceVideo" playsinline muted class="hidden"></video></div>
        <p id="ceCamStatus" class="ce-hint"></p>
        <div class="ce-actions">
          <button type="button" class="ce-primary" data-act="scan">📷 Scanner son QR</button>
          <label class="ce-button">📂 Importer un fichier<input id="ceFile" type="file" accept=".json,application/json" hidden></label>
        </div>
        <details><summary>Coller un code</summary>
          <textarea id="cePaste" rows="4" placeholder="Colle ici le ou les codes COEVAL1:…"></textarea>
          <button type="button" data-act="paste">Valider</button>
        </details>
        <h3>Évaluations reçues</h3>
        ${others.length ? `<ul class="ce-received">${others.map(([name, o]) => `<li><b>${esc(name)}</b> · ${Object.keys(o.rows).length} candidat(s) · ${new Date(o.at).toLocaleString("fr-FR")}
          ${o.parts && o.parts.got.length < o.parts.total ? `<span class="ce-warn">QR reçus ${o.parts.got.sort((a, b) => a - b).join(", ")} sur ${o.parts.total}</span>` : ""}
          <button type="button" class="ce-link" data-act="drop-other" data-name="${esc(name)}">Retirer</button></li>`).join("")}</ul>`
          : `<p class="ce-hint">Rien reçu pour l'instant.</p>`}
      </section>
    </div>`;
  }

  function startScan() {
    const video = $("ceVideo"), status = $("ceCamStatus");
    if (stopCamera) { stopCamera(); stopCamera = null; }
    if (!navigator.mediaDevices?.getUserMedia || typeof jsQR !== "function") {
      status.textContent = "Caméra indisponible : utilise le fichier ou colle le code.";
      return;
    }
    let stream = null, raf = 0, stopped = false, lastText = "";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", {willReadFrequently:true});
    stopCamera = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      video.classList.add("hidden");
    };
    navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}}, audio:false})
      .then(async s => {
        if (stopped) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        video.srcObject = s;
        video.classList.remove("hidden");
        await video.play();
        status.textContent = "Présente le QR de ton collègue devant la caméra.";
        const loop = () => {
          if (stopped) return;
          if (video.videoWidth) {
            const scale = Math.min(1, 800 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, {inversionAttempts:"dontInvert"});
            const text = code ? decodeQR(code) : "";
            if (text && text !== lastText) {
              lastText = text;
              const res = importText(text);
              status.textContent = res.message;
              if (res.done) { stopCamera(); stopCamera = null; render(); toast(res.message); return; }
              if (navigator.vibrate) navigator.vibrate(60);
            }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch(() => { status.textContent = "Caméra refusée : utilise le fichier ou colle le code."; });
  }

  function decodeQR(code) {
    try {
      if (code.binaryData?.length && window.TextDecoder) return new TextDecoder("utf-8").decode(new Uint8Array(code.binaryData));
    } catch (e) { /* repli sur code.data */ }
    return code.data || "";
  }

  function importText(text) {
    const lines = String(text).split(/\s*(?=COEVAL1:)/).map(s => s.trim()).filter(s => s.startsWith(QR_PREFIX));
    if (!lines.length) return {done:false, message:"Ce QR n'est pas une évaluation de co-évaluation."};
    let last = null, added = 0;
    for (const line of lines) {
      let p;
      try { p = JSON.parse(line.slice(QR_PREFIX.length)); }
      catch (e) { return {done:false, message:"Code illisible ou incomplet."}; }
      last = mergeOther({title:p.t, by:p.e, at:p.a, batch:p.k, part:p.p, rows:p.r});
      if (last.error) return {done:false, message:last.error};
      added += last.added;
    }
    return {...last, message:last.message.replace(/ · \d+ candidat\(s\) ajouté\(s\)/, "").replace(/\.$/, added ? ` · ${added} candidat(s) ajouté(s).` : ".")};
  }

  function mergeOther(p) {
    let ep = active();
    if (!ep) ep = newEpreuve(p.title || "Épreuve importée");
    const by = String(p.by || "Collègue").trim();
    if (normName(by) === normName(db.me)) return {error:"C'est ta propre évaluation (même nom d'évaluateur)."};
    const added = addCandidates(ep, p.rows.map(r => r[0]));
    const other = ep.others[by] && ep.others[by].batch === p.batch
      ? ep.others[by]
      : (ep.others[by] = {at:p.at, batch:p.batch, rows:{...(ep.others[by]?.rows || {})}, parts:null});
    p.rows.forEach(([name, split, theme, role, cells]) => {
      const ev = {split:split || "", theme:theme || "", role:role || "", v:{}, d:{}};
      GRID.forEach((cr, i) => {
        const c = cells?.[i] || 0;
        if (!c) return;
        ev.d[cr.id] = Math.floor(c / 100);
        ev.v[cr.id] = ((c % 100) - 1) / 4;
      });
      other.rows[normName(name)] = ev;
    });
    other.at = p.at;
    if (p.part) {
      const [n, total] = p.part;
      other.parts = other.parts && other.parts.total === total ? other.parts : {total, got:[]};
      if (!other.parts.got.includes(n)) other.parts.got.push(n);
    }
    save();
    const got = other.parts ? other.parts.got.length : 1;
    const total = other.parts ? other.parts.total : 1;
    const done = got >= total;
    return {done, added, message:done
      ? `✅ Évaluation de ${by} reçue${added ? ` · ${added} candidat(s) ajouté(s)` : ""}.`
      : `QR ${got}/${total} de ${by} reçu… montre le suivant.`};
  }

  function download(ep) {
    const data = {type:"coeval-musculation", version:1, ...exportPayload(ep),
      comments:Object.fromEntries(ep.candidates.map(c => [c.name, ep.mine[c.id]?.comment || ""]).filter(([, v]) => v))};
    const name = `coeval_${normName(ep.title).replace(/ /g, "-")}_${normName(db.me).replace(/ /g, "-")}.json`;
    const blob = new Blob([JSON.stringify(data)], {type:"application/json"});
    const file = new File([blob], name, {type:"application/json"});
    if (navigator.canShare?.({files:[file]})) {
      navigator.share({files:[file], title:ep.title}).catch(() => {});
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (d.type !== "coeval-musculation") throw new Error("type");
        const res = mergeOther({title:d.title, by:d.by, at:d.at, batch:"file-" + d.at, part:null, rows:d.rows});
        toast(res.error || res.message);
      } catch (e) { toast("Fichier non reconnu."); }
      render();
    };
    reader.readAsText(file);
  }

  /* =========================
     3 · CROISER
  ========================= */

  function evaluatorsFor(ep, cand) {
    const key = normName(cand.name);
    const list = [{name:db.me, ev:ep.mine[cand.id] || null, me:true}];
    Object.entries(ep.others).forEach(([name, o]) => list.push({name, ev:o.rows[key] || null}));
    return list;
  }

  function finalEval(ep, cand) {
    const evs = evaluatorsFor(ep, cand).filter(x => x.ev);
    const base = ep.mine[cand.id] || evs[0]?.ev || emptyEval();
    const fin = ep.final[cand.id] || {};
    const v = {};
    GRID.forEach(cr => {
      if (fin[cr.id] != null) { v[cr.id] = fin[cr.id]; return; }
      const vals = evs.map(x => x.ev.v[cr.id]).filter(x => x != null);
      if (vals.length) v[cr.id] = q4(vals.reduce((a, b) => a + b, 0) / vals.length);
    });
    return {split:fin.split || base.split, role:fin.role || base.role, theme:base.theme, v, d:{}};
  }

  function conflicts(ep, cand) {
    const evs = evaluatorsFor(ep, cand).filter(x => x.ev && scores(x.ev).filled);
    if (evs.length < 2) return {pending:true, degree:0, points:0, choices:[]};
    let degree = 0, points = 0;
    GRID.forEach(cr => {
      const vals = evs.map(x => x.ev.v[cr.id]).filter(x => x != null);
      if (vals.length < 2) return;
      const degs = evs.map(x => x.ev.v[cr.id] == null ? null : degreeOf(cr, x.ev.v[cr.id], x.ev.d[cr.id])).filter(Boolean);
      if (new Set(degs).size > 1) degree++;
      else if (Math.max(...vals) - Math.min(...vals) >= .5) points++;
    });
    const choices = ["split", "role", "theme"].filter(f => new Set(evs.map(x => x.ev[f]).filter(Boolean)).size > 1);
    return {pending:false, degree, points, choices};
  }

  function renderCross(main, ep) {
    const names = [db.me, ...Object.keys(ep.others)];
    if (crossId && ep.candidates.some(c => c.id === crossId)) { renderCrossDetail(main, ep, ep.candidates.find(c => c.id === crossId)); return; }
    const rows = ep.candidates.map(c => {
      const evs = evaluatorsFor(ep, c);
      const totals = evs.map(x => x.ev ? scores(x.ev).total : null);
      const known = totals.filter(t => t != null);
      const gap = known.length > 1 ? Math.max(...known) - Math.min(...known) : null;
      const cf = conflicts(ep, c);
      const fin = scores(finalEval(ep, c)).total;
      const flag = cf.pending ? `<span class="ce-tag wait">En attente</span>`
        : cf.degree || cf.choices.length ? `<span class="ce-tag bad">${cf.degree ? cf.degree + " désaccord(s) de degré" : ""}${cf.choices.length ? (cf.degree ? " · " : "") + "choix différents" : ""}</span>`
        : cf.points ? `<span class="ce-tag mid">${cf.points} écart(s) de points</span>` : `<span class="ce-tag ok">Accord</span>`;
      return `<tr data-act="cross-open" data-id="${c.id}">
        <td><b>${esc(c.name)}</b>${ep.final[c.id]?.validated ? " ✅" : ""}</td>
        ${totals.map(t => `<td class="num">${fmt(t)}</td>`).join("")}
        <td class="num${gap >= 2 ? " ce-big-gap" : ""}">${fmt(gap)}</td>
        <td>${flag}</td>
        <td class="num"><b>${fmt(fin)}</b></td></tr>`;
    }).join("");
    main.innerHTML = `<section class="ce-card">
      <div class="ce-cross-head"><h2>Croisement des évaluations</h2>
        <div class="ce-actions"><button type="button" data-act="csv">⬇️ Export CSV</button><button type="button" data-act="print">🖨️ Imprimer</button></div></div>
      ${names.length < 2 ? `<p class="ce-warn">Aucune évaluation de collègue reçue : va dans « Échanger » pour scanner son QR.</p>` : ""}
      <p class="ce-hint">Note retenue = moyenne des évaluateurs arrondie au ¼ de point, modifiable critère par critère. Touchez un candidat pour le détail.</p>
      <div class="ce-table"><table>
        <thead><tr><th>Candidat</th>${names.map(n => `<th>${esc(n)}</th>`).join("")}<th>Écart</th><th>Croisement</th><th>Retenue /20</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </section>`;
  }

  function renderCrossDetail(main, ep, cand) {
    const evs = evaluatorsFor(ep, cand);
    const fin = finalEval(ep, cand);
    const finS = scores(fin);
    const idx = ep.candidates.indexOf(cand);
    const cell = (cr, ev) => {
      if (!ev || ev.v[cr.id] == null) return `<td class="num">—</td>`;
      const d = degreeOf(cr, ev.v[cr.id], ev.d[cr.id]);
      return `<td class="num"><span class="ce-dot d${d}">${cr.names ? cr.names[d - 1] : "D" + d}</span> ${fmt(ev.v[cr.id])}</td>`;
    };
    const choiceRow = (field, label, map) => {
      const vals = evs.map(x => x.ev?.[field] || "");
      const diff = new Set(vals.filter(Boolean)).size > 1;
      const opts = Object.entries(map).map(([k, v]) => `<option value="${k}"${fin[field] === k ? " selected" : ""}>${esc(v)}</option>`).join("");
      return `<tr class="${diff ? "ce-row-bad" : ""}"><td>${label}</td>${vals.map(v => `<td>${esc(map[v] || "—")}</td>`).join("")}<td></td>
        <td>${field === "theme" ? esc(map[fin.theme] || "—") : `<select data-act="final-choice" data-field="${field}">${opts}</select>`}</td></tr>`;
    };
    let last = "";
    const critRows = GRID.map(cr => {
      const vals = evs.map(x => x.ev?.v[cr.id]).filter(x => x != null);
      const degs = evs.map(x => x.ev?.v[cr.id] == null ? null : degreeOf(cr, x.ev.v[cr.id], x.ev.d[cr.id])).filter(Boolean);
      const gap = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : null;
      const cls = vals.length > 1 && new Set(degs).size > 1 ? "ce-row-bad" : gap >= .5 ? "ce-row-mid" : "";
      const overridden = ep.final[cand.id]?.[cr.id] != null;
      const opts = [`<option value="">${overridden ? "Moyenne" : "Moyenne (" + fmt(fin.v[cr.id]) + ")"}</option>`]
        .concat(stepsOf([0, cr.max]).map(x => `<option value="${x}"${overridden && fin.v[cr.id] === x ? " selected" : ""}>${fmt(x)}</option>`)).join("");
      const head = cr.group !== last ? `<tr class="ce-group-row"><td colspan="${evs.length + 3}">${esc(cr.afl === "AFL1" ? "AFL1 · " + cr.group : cr.group)}</td></tr>` : "";
      last = cr.group;
      return `${head}<tr class="${cls}"><td>${esc(cr.label)} <small>/${cr.max}</small></td>${evs.map(x => cell(cr, x.ev)).join("")}
        <td class="num">${fmt(gap)}</td>
        <td><select data-act="final" data-crit="${cr.id}" class="${overridden ? "on" : ""}">${opts}</select></td></tr>`;
    }).join("");
    const totalRow = (label, key, max) => `<tr class="ce-sum"><td>${label}</td>${evs.map(x => `<td class="num">${x.ev ? fmt(scores(x.ev)[key]) : "—"}</td>`).join("")}<td></td><td class="num"><b>${fmt(finS[key])}</b>${max ? " /" + max : ""}</td></tr>`;
    const [w2, w3] = SPLITS[fin.split] || [];
    const comments = evs.filter(x => x.me && x.ev?.comment).map(x => `<p><b>${esc(x.name)} :</b> ${esc(x.ev.comment)}</p>`).join("");
    main.innerHTML = `<section class="ce-card">
      <div class="ce-nav">
        <button type="button" data-act="cross-back">← Tableau</button>
        <button type="button" data-act="cross-step" data-step="-1" ${idx === 0 ? "disabled" : ""}>←</button>
        <h2>${esc(cand.name)}</h2>
        <button type="button" data-act="cross-step" data-step="1" ${idx === ep.candidates.length - 1 ? "disabled" : ""}>→</button>
      </div>
      <p class="ce-hint"><span class="ce-tag bad">rouge</span> degrés différents · <span class="ce-tag mid">orange</span> même degré, écart ≥ 0,5 pt</p>
      <div class="ce-table"><table>
        <thead><tr><th>Critère</th>${evs.map(x => `<th>${esc(x.name)}</th>`).join("")}<th>Écart</th><th>Retenu</th></tr></thead>
        <tbody>
          ${choiceRow("theme", "Thème", THEMES)}
          ${choiceRow("split", "Répartition", {"4-4":"4-4", "6-2":"6-2", "2-6":"2-6"})}
          ${choiceRow("role", "Rôle AFL3", ROLES)}
          ${critRows}
          ${totalRow("AFL1", "afl1", 12)}
          ${totalRow("AFL2", "afl2", w2)}
          ${totalRow("AFL3", "afl3", w3)}
          ${totalRow("Total", "total", 20)}
        </tbody></table></div>
      ${comments}
      <div class="ce-actions">
        <button type="button" class="ce-primary" data-act="validate">${ep.final[cand.id]?.validated ? "✅ Note validée" : "Valider la note harmonisée"}</button>
        <button type="button" data-act="reset-final">Revenir aux moyennes</button>
      </div>
    </section>`;
  }

  function finalStore(ep, candId) {
    return ep.final[candId] || (ep.final[candId] = {});
  }

  function csv(ep) {
    const names = [db.me, ...Object.keys(ep.others)];
    const head = ["Candidat", "Thème", "Répartition", "Rôle AFL3", ...GRID.map(c => c.label + " (retenu)"), "AFL1", "AFL2", "AFL3", ...names.map(n => "Total " + n), "Note retenue /20", "Validée"];
    const lines = [head];
    ep.candidates.forEach(c => {
      const fin = finalEval(ep, c), s = scores(fin);
      const evs = evaluatorsFor(ep, c);
      lines.push([c.name, THEMES[fin.theme] || "", fin.split, ROLES[fin.role] || "", ...GRID.map(cr => fmt(fin.v[cr.id])), fmt(s.afl1), fmt(s.afl2), fmt(s.afl3),
        ...evs.map(x => x.ev ? fmt(scores(x.ev).total) : ""), fmt(s.total), ep.final[c.id]?.validated ? "oui" : "non"]);
    });
    const text = "﻿" + lines.map(l => l.map(x => `"${String(x).replace(/"/g, '""').replace(/^—$/, "")}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], {type:"text/csv;charset=utf-8"}));
    a.download = `coeval_${normName(ep.title).replace(/ /g, "-")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* =========================
     DIALOGUES
  ========================= */

  function openCandidates(ep) {
    const dlg = $("ceDialog");
    dlg.innerHTML = `<form method="dialog" class="ce-dialog">
      <h2>Candidats · ${esc(ep.title)}</h2>
      <label class="ce-button ce-primary">📂 Importer la liste CSV (colonne A : NOM Prénom)<input id="ceCsv" type="file" accept=".csv,text/csv,text/plain" hidden></label>
      <p class="ce-hint">Export Pronote accepté tel quel : seuls le nom (colonne A) et la classe sont repris.</p>
      <label>…ou colle la liste (un candidat par ligne)<textarea id="ceNames" rows="8" placeholder="DUPONT Léa&#10;MARTIN Hugo"></textarea></label>
      <div class="ce-actions"><button type="button" class="ce-primary" data-act="add-names">Ajouter</button><button value="close">Fermer</button></div>
      <ul class="ce-cand-edit">${ep.candidates.map(c => `<li><span>${esc(c.name)}${c.classroom ? ` <small>${esc(c.classroom)}</small>` : ""}</span><button type="button" class="ce-link" data-act="del-cand" data-id="${c.id}">Supprimer</button></li>`).join("")}</ul>
      <hr><div class="ce-actions"><button type="button" class="ce-link" data-act="rename-epreuve">Renommer l'épreuve</button><button type="button" class="ce-link ce-danger" data-act="del-epreuve">Supprimer l'épreuve</button></div>
    </form>`;
    if (!dlg.open) dlg.showModal();
  }

  /* =========================
     ÉVÉNEMENTS
  ========================= */

  document.addEventListener("click", ev => {
    const tabBtn = ev.target.closest(".ce-tabs button");
    if (tabBtn) { tab = tabBtn.dataset.tab; crossId = null; render(); return; }
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const ep = active();
    const act = el.dataset.act;
    switch (act) {
      case "set-me": {
        const v = $("ceMeInput").value.trim();
        if (!v) { toast("Indique ton nom."); return; }
        db.me = v; save(); render(); break;
      }
      case "new-epreuve": {
        const t = prompt("Nom de l'épreuve :", "Bac Musculation · " + new Date().getFullYear());
        if (t && t.trim()) { newEpreuve(t.trim()); render(); openCandidates(active()); }
        break;
      }
      case "candidates": if (ep) openCandidates(ep); break;
      case "pick": currentId = el.dataset.id; render(); window.scrollTo({top:0, behavior:"smooth"}); break;
      case "step": {
        const i = ep.candidates.findIndex(c => c.id === currentId) + Number(el.dataset.step);
        if (ep.candidates[i]) { currentId = ep.candidates[i].id; render(); window.scrollTo({top:0, behavior:"smooth"}); }
        break;
      }
      case "set": {
        const e = evalOf(ep, currentId);
        e[el.dataset.field] = e[el.dataset.field] === el.dataset.value ? "" : el.dataset.value;
        e.updatedAt = Date.now(); save(); render(); break;
      }
      case "deg": setValue(ep, el.dataset.crit, Number(el.dataset.deg), null); render(); break;
      case "val": setValue(ep, el.dataset.crit, Number(el.dataset.deg), Number(el.dataset.value)); render(); break;
      case "qr-step": shareIndex += Number(el.dataset.step); render(); break;
      case "download": download(ep); break;
      case "copy-code": {
        const text = qrParts(ep).join("\n");
        (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast("Code copié."), () => prompt("Copie ce code :", text));
        break;
      }
      case "scan": startScan(); break;
      case "paste": {
        const res = importText($("cePaste").value);
        toast(res.message); render(); break;
      }
      case "drop-other":
        if (confirm(`Retirer l'évaluation de ${el.dataset.name} ?`)) { delete ep.others[el.dataset.name]; save(); render(); }
        break;
      case "cross-open": crossId = el.dataset.id; render(); window.scrollTo({top:0}); break;
      case "cross-back": crossId = null; render(); break;
      case "cross-step": {
        const i = ep.candidates.findIndex(c => c.id === crossId) + Number(el.dataset.step);
        if (ep.candidates[i]) { crossId = ep.candidates[i].id; render(); }
        break;
      }
      case "validate": {
        const f = finalStore(ep, crossId);
        f.validated = !f.validated; save(); render(); break;
      }
      case "reset-final": delete ep.final[crossId]; save(); render(); break;
      case "csv": csv(ep); break;
      case "print": window.print(); break;
      case "add-names": {
        const n = addCandidates(ep, $("ceNames").value.split(/\r?\n/));
        save(); toast(n + " candidat(s) ajouté(s)."); openCandidates(ep); render(); break;
      }
      case "del-cand":
        if (confirm("Supprimer ce candidat et ses notes ?")) {
          ep.candidates = ep.candidates.filter(c => c.id !== el.dataset.id);
          delete ep.mine[el.dataset.id]; delete ep.final[el.dataset.id];
          save(); openCandidates(ep); render();
        }
        break;
      case "rename-epreuve": {
        const t = prompt("Nouveau nom :", ep.title);
        if (t && t.trim()) { ep.title = t.trim(); save(); openCandidates(ep); render(); }
        break;
      }
      case "del-epreuve":
        if (confirm(`Supprimer définitivement « ${ep.title} » et toutes ses notes ?`)) {
          db.epreuves = db.epreuves.filter(e => e.id !== ep.id);
          db.activeId = db.epreuves[0]?.id || null;
          save(); $("ceDialog").close(); render();
        }
        break;
    }
  });

  document.addEventListener("change", ev => {
    const el = ev.target;
    const ep = active();
    if (el.id === "ceEpreuve") { db.activeId = el.value; currentId = crossId = null; save(); render(); return; }
    if (el.id === "ceFile" && el.files[0]) { importFile(el.files[0]); return; }
    if (el.id === "ceCsv" && el.files[0]) {
      readTextFile(el.files[0], text => {
        const {names, classes} = parseCSV(text);
        const n = addCandidates(ep, names, classes);
        save(); toast(`${n} élève(s) ajouté(s) sur ${names.length} lu(s).`); openCandidates(ep); render();
      });
      return;
    }
    if (el.dataset.act === "final") {
      const f = finalStore(ep, crossId);
      if (el.value === "") delete f[el.dataset.crit]; else f[el.dataset.crit] = Number(el.value);
      save(); render(); return;
    }
    if (el.dataset.act === "final-choice") { finalStore(ep, crossId)[el.dataset.field] = el.value; save(); render(); }
  });

  document.addEventListener("input", ev => {
    const el = ev.target;
    if (el.dataset.field === "comment" && tab === "eval") {
      const e = evalOf(active(), currentId);
      e.comment = el.value; save();
    }
  });

  $("ceNewEpreuve").addEventListener("click", () => {
    if (!db.me) { toast("Indique d'abord ton nom."); return; }
    const t = prompt("Nom de l'épreuve :", "Bac Musculation · " + new Date().getFullYear());
    if (t && t.trim()) { newEpreuve(t.trim()); render(); openCandidates(active()); }
  });
  $("ceCandidates").addEventListener("click", () => { const ep = active(); if (ep) openCandidates(ep); else toast("Crée d'abord une épreuve."); });
  $("ceMe").addEventListener("click", () => {
    const v = prompt("Ton nom d'évaluateur :", db.me);
    if (v && v.trim()) { db.me = v.trim(); save(); render(); }
  });

  window.CoEval = {GRID, scores, importText, exportPayload, qrParts, parseCSV};
  render();
})();
