/* =========================================================
   CO-ÉVALUATION BAC — MUSCULATION CA5
   Chaque évaluateur note de son côté (sans voir l'autre),
   puis les évaluations sont échangées (QR, fichier ou code)
   et croisées critère par critère : le jury tranche d'abord
   le degré, puis la note.
   Les calculs sont dans coeval-core.js (testés à part).
   ========================================================= */

(() => {
  "use strict";

  const C = window.CoEvalCore;
  const {GRID, SPLITS, THEMES, ROLES, CHOICE_FIELDS, STATUS, fmt, normName} = C;
  const KEY = "df-coeval-v1";

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  const when = t => t ? new Date(t).toLocaleString("fr-FR", {dateStyle:"short", timeStyle:"short"}) : "—";
  const tag = st => `<span class="ce-tag ${STATUS[st].tone}">${STATUS[st].icon} ${STATUS[st].label}</span>`;
  const dot = (cr, d) => d ? `<span class="ce-dot d${d}">${cr.names ? cr.names[d - 1] : "D" + d}</span>` : "";

  let db = load();
  let tab = "eval";
  let currentId = null;
  let crossId = null;
  let crossView = "table";
  let crossFilter = "all";
  let crossSort = "name";
  let onlyDivergent = false;
  let evalFilter = "all";
  const openCrits = {};
  let stopCamera = null;
  let shareIndex = 0;
  let prepIndex = 0;
  let pendingRestore = null;

  /* =========================
     DONNÉES
  ========================= */

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { console.error(e); }
    if (raw && Array.isArray(raw.epreuves)) {
      if ((raw.version || 1) < C.DATA_VERSION) {
        // Copie de sécurité des données d'avant migration, gardée une fois.
        try {
          const k = KEY + "-avant-v" + C.DATA_VERSION;
          if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(raw));
        } catch (e) { /* place insuffisante : la migration reste possible */ }
        const migrated = C.migrateDb(raw);
        try { localStorage.setItem(KEY, JSON.stringify(migrated)); } catch (e) { console.error(e); }
        return migrated;
      }
      return C.migrateDb(raw);
    }
    return {version:C.DATA_VERSION, me:"", epreuves:[], activeId:null};
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast("⚠️ Enregistrement impossible sur cet appareil : sauvegarde l'épreuve dans un fichier."); }
  }

  function active() {
    return db.epreuves.find(e => e.id === db.activeId) || db.epreuves[0] || null;
  }

  function newEpreuve(title) {
    const e = {id:C.uid(), title, createdAt:Date.now(), candidates:[], mine:{}, others:{}, final:{}, history:[], backupAt:0, backupHash:""};
    db.epreuves.unshift(e);
    db.activeId = e.id;
    save();
    return e;
  }

  function evalOf(ep, candId) {
    return C.get(ep.mine, candId) || (ep.mine[candId] = C.emptyEval());
  }

  function finalStore(ep, candId) {
    const f = C.get(ep.final, candId) || (ep.final[candId] = {crit:{}, choice:{}, validated:null, updatedAt:0});
    f.crit = f.crit || {};
    f.choice = f.choice || {};
    return f;
  }

  const candById = (ep, id) => ep.candidates.find(c => c.id === id);

  /* Avancement d'une fiche. Les données reprises d'une préparation ne comptent pas
     comme un début d'évaluation : le co-évaluateur a encore son AFL1 à faire. */
  const PROGRESS = {
    todo:{label:"Pas commencé"}, partial:{label:"Partiel"}, complete:{label:"Complet"}, done:{label:"Terminé"}
  };
  function progressOf(ev) {
    const s = C.scores(ev);
    const pre = ev?.pre && !ev.pre.unlocked ? ev.pre : null;
    const own = GRID.filter(c => ev?.v?.[c.id] != null && !pre?.crits.includes(c.id)).length;
    const state = ev?.done ? "done" : s.complete ? "complete" : own || (!pre && C.isFilled(ev)) ? "partial" : "todo";
    return {state, filled:s.filled, s};
  }
  /* Pastille dessinée (pas de glyphe : ◐ s'affiche mal sur certains téléphones),
     remplie selon la part des critères notés ; cadenas pour une fiche terminée. */
  const ring = (state, filled) => state === "done" ? `<span class="ce-lock-icon" aria-hidden="true">🔒</span>`
    : `<span class="ce-ring ${state}" style="--f:${state === "complete" ? 100 : state === "todo" ? 0 : Math.max(12, filled / GRID.length * 100)}%" aria-hidden="true"></span>`;
  const minibar = filled => `<span class="ce-minibar" aria-hidden="true"><span style="width:${filled / GRID.length * 100}%"></span></span>`;
  const log = (ep, entry) => C.logHistory(ep, entry, db.me);
  const hasContent = ep => ep.candidates.some(c => C.isFilled(C.get(ep.mine, c.id))) || Object.keys(ep.others).length || Object.keys(ep.final).length;
  const unsaved = ep => hasContent(ep) && ep.backupHash !== C.contentHash(ep);

  function readTextFile(file, then) {
    file.arrayBuffer().then(buf => {
      let text;
      try { text = new TextDecoder("utf-8", {fatal:true}).decode(buf); }
      catch (e) { text = new TextDecoder("windows-1252").decode(buf); }
      then(text);
    }, () => toast("Fichier illisible."));
  }

  /* =========================
     INTERFACE GÉNÉRALE
  ========================= */

  function toast(text) {
    const t = $("ceToast");
    t.textContent = text;
    t.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add("hidden"), 3200);
  }

  function openDialog(html) {
    const dlg = $("ceDialog");
    dlg.innerHTML = `<form method="dialog" class="ce-dialog">${html}</form>`;
    if (!dlg.open) dlg.showModal();
  }

  function closeDialog() {
    const dlg = $("ceDialog");
    if (dlg.open) dlg.close();
  }

  function renderBar() {
    const sel = $("ceEpreuve");
    sel.innerHTML = db.epreuves.length
      ? db.epreuves.map(e => `<option value="${esc(e.id)}"${e.id === active()?.id ? " selected" : ""}>${esc(e.title)} · ${e.candidates.length} candidat(s)</option>`).join("")
      : `<option value="">Aucune épreuve</option>`;
    $("ceMe").textContent = "👤 " + (db.me || "Qui évalue ?");
    document.querySelectorAll(".ce-tabs button").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tab);
      b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false");
    });
  }

  /* Rappel discret de sauvegarde : hors saisie, ou quand toutes mes fiches sont terminées. */
  function renderNotice(ep) {
    const box = $("ceNotice");
    const myDone = ep && ep.candidates.length && ep.candidates.every(c => C.get(ep.mine, c.id)?.done);
    const show = ep && db.me && unsaved(ep) && (tab !== "eval" || myDone);
    box.innerHTML = show
      ? `<div class="ce-notice"><span>💾 Des modifications ne sont pas encore sauvegardées dans un fichier${ep.backupAt ? ` (dernière sauvegarde ${when(ep.backupAt)})` : ""}.</span>
        <button type="button" data-act="backup">Sauvegarder l'épreuve</button></div>`
      : "";
  }

  function render() {
    if (stopCamera && tab !== "share") { stopCamera(); stopCamera = null; }
    renderBar();
    const ep = active();
    renderNotice(ep);
    const main = $("ceMain");
    if (!db.me) { main.innerHTML = welcomeHTML(); return; }
    if (!ep) { if (tab === "share") renderShare(main, null); else main.innerHTML = noEpreuveHTML(); return; }
    if (tab === "eval") renderEval(main, ep);
    else if (tab === "share") renderShare(main, ep);
    else renderCross(main, ep);
  }

  function welcomeHTML() {
    return `<section class="ce-card ce-welcome">
      <h2>Bienvenue 👋</h2>
      <p>Chaque évaluateur utilise <b>son propre appareil</b> et note les candidats <b>sans voir</b> les notes de l'autre.
      Ensuite, vous échangez vos évaluations (QR code, fichier ou code texte) et l'outil <b>croise</b> les critères :
      le jury tranche d'abord le <b>degré</b>, puis la note.</p>
      <label>Ton nom d'évaluateur<input id="ceMeInput" placeholder="ex. M. Le Pannérer" autocomplete="name"></label>
      <button type="button" class="ce-primary" data-act="set-me">Commencer</button>
    </section>`;
  }

  function noEpreuveHTML() {
    return `<section class="ce-card ce-welcome">
      <h2>Crée une épreuve</h2>
      <p>Ex. « Bac Musculation · Terminale · juin 2026 ». Ajoute ensuite la liste des candidats.</p>
      <p><b>Tu es co-évaluateur ?</b> Récupère la préparation de ton collègue : la liste des candidats,
      les répartitions et les notes AFL2/AFL3 arrivent toutes seules, il te restera l'AFL1.</p>
      <div class="ce-actions">
        <button type="button" class="ce-primary" data-act="new-epreuve">+ Nouvelle épreuve</button>
        <button type="button" class="ce-primary" data-act="go-receive">📥 Je suis co-évaluateur : recevoir la préparation</button>
        <label class="ce-button">📂 Restaurer une sauvegarde<input id="ceRestore" type="file" accept=".json,application/json" hidden></label>
      </div>
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
    if (!candById(ep, currentId)) currentId = ep.candidates[0].id;
    const cand = candById(ep, currentId);
    const ev = evalOf(ep, cand.id);
    const s = C.scores(ev);
    const idx = ep.candidates.indexOf(cand);
    const locked = !!ev.done;
    const dis = locked ? " disabled" : "";
    const pre = ev.pre && !ev.pre.unlocked ? ev.pre : null;

    const progress = ep.candidates.map(c => ({c, p:progressOf(C.get(ep.mine, c.id))}));
    const counts = Object.fromEntries(Object.keys(PROGRESS).map(k => [k, progress.filter(x => x.p.state === k).length]));
    if (evalFilter !== "all" && !counts[evalFilter]) evalFilter = "all";
    const list = progress.filter(x => evalFilter === "all" || x.p.state === evalFilter).map(({c, p}) => {
      const meta = PROGRESS[p.state];
      const right = p.state === "done" || p.state === "complete" ? fmt(p.s.total) + "/20" : p.filled + "/" + GRID.length;
      return `<button type="button" class="ce-cand ${p.state}${c.id === cand.id ? " current" : ""}" data-act="pick" data-id="${esc(c.id)}" aria-label="${esc(c.name)} : ${meta.label}, ${p.filled} critère(s) sur ${GRID.length}">
        <span class="ce-pg-icon">${ring(p.state, p.filled)}</span>
        <span class="ce-cand-name">${esc(c.name)}${c.classroom ? ` <i>${esc(c.classroom)}</i>` : ""}</span>
        <span class="ce-cand-right"><small>${right}</small>${p.state === "done" ? "" : minibar(p.filled)}</span></button>`;
    }).join("");
    const legend = Object.entries(PROGRESS).map(([k, m]) => `<button type="button" class="ce-pg-chip ${k}${evalFilter === k ? " on" : ""}" data-act="eval-filter" data-filter="${k}" aria-pressed="${evalFilter === k}"${counts[k] ? "" : " disabled"}>
      ${ring(k, GRID.length / 2)} ${counts[k]} <small>${m.label}</small></button>`).join("");

    const choice = (field, options, label) => {
      const fixed = pre?.choices.includes(field);
      return `<div class="ce-choice"><span>${label}${fixed ? " 🗂️" : ""}</span>${
        Object.entries(options).map(([k, v]) => `<button type="button" class="${ev[field] === k ? "on" : ""}" data-act="set" data-field="${field}" data-value="${k}" aria-pressed="${ev[field] === k}"${locked || fixed ? " disabled" : ""}>${esc(v)}</button>`).join("")
      }</div>`;
    };

    let groups = "", lastGroup = "";
    GRID.forEach(crit => {
      if (crit.group !== lastGroup) {
        if (lastGroup) groups += "</div>";
        lastGroup = crit.group;
        groups += `<div class="ce-group"><h3>${esc(crit.afl === "AFL1" ? `AFL1 · ${crit.group}` : crit.group)}</h3>`;
      }
      groups += pre?.crits.includes(crit.id) ? preCritHTML(crit, ev) : critHTML(crit, ev, locked);
    });
    groups += "</div>";

    const preBar = pre
      ? `<div class="ce-lock pre"><span>🗂️ Répartition, thème, rôle et AFL2/AFL3 évalués avant l'épreuve par <b>${esc(pre.by)}</b>. À toi d'évaluer l'<b>AFL1</b>.</span>
          ${locked ? "" : `<button type="button" class="ce-link" data-act="unlock-pre">Modifier ces données</button>`}</div>`
      : ev.pre?.unlocked ? `<div class="ce-lock open">✏️ Données de préparation de ${esc(ev.pre.by)} déverrouillées : tes modifications seront visibles au croisement.</div>` : "";
    const lockBar = locked
      ? `<div class="ce-lock"><span>🔒 Évaluation terminée le ${when(ev.doneAt)}. Les notes sont verrouillées.</span>
          <button type="button" data-act="reopen">Modifier mon évaluation</button></div>`
      : ev.initial
        ? `<div class="ce-lock open">✏️ Fiche rouverte : chaque modification est consignée dans l'historique, la version initiale est conservée.</div>`
        : "";
    const part = (val, p) => val != null ? fmt(val) : p != null ? fmt(p) + "…" : "—";

    main.innerHTML = `<div class="ce-eval">
      <aside class="ce-list"><div class="ce-list-head">${ep.candidates.length} candidats · évaluation de <b>${esc(db.me)}</b></div>
        <div class="ce-pg-legend">${legend}</div>
        ${evalFilter !== "all" ? `<button type="button" class="ce-link" data-act="eval-filter" data-filter="all">Afficher tous les candidats</button>` : ""}
        ${list}</aside>
      <section class="ce-sheet">
        <div class="ce-card ce-cand-head">
          <div class="ce-nav">
            <button type="button" data-act="step" data-step="-1" aria-label="Candidat précédent" ${idx === 0 ? "disabled" : ""}>←</button>
            <h2>${esc(cand.name)}${cand.classroom ? ` <small>${esc(cand.classroom)}</small>` : ""}</h2>
            <button type="button" data-act="step" data-step="1" aria-label="Candidat suivant" ${idx === ep.candidates.length - 1 ? "disabled" : ""}>→</button>
          </div>
          ${lockBar}
          ${preBar}
          ${choice("theme", THEMES, "Thème")}
          ${choice("split", {"4-4":"AFL2 4 · AFL3 4", "6-2":"AFL2 6 · AFL3 2", "2-6":"AFL2 2 · AFL3 6"}, "Répartition")}
          ${choice("role", ROLES, "Rôle AFL3")}
        </div>
        ${groups}
        <div class="ce-card"><label class="ce-comment">Remarques (facultatif, transmises par fichier)<textarea data-field="comment" rows="2"${locked ? " readonly" : ""}>${esc(ev.comment)}</textarea></label>
          <div class="ce-actions">
            ${locked ? "" : `<button type="button" class="ce-primary" data-act="finish">✔ Terminer mon évaluation</button>`}
            <button type="button" data-act="single-qr">📱 QR de ce candidat</button>
          </div>
        </div>
        <div class="ce-total">
          <span>AFL1 <b>${part(s.afl1, s.afl1p)}</b>/12</span>
          <span>AFL2 <b>${part(s.afl2, s.afl2p)}</b>/${SPLITS[ev.split]?.[0] ?? "?"}</span>
          <span>AFL3 <b>${part(s.afl3, s.afl3p)}</b>/${SPLITS[ev.split]?.[1] ?? "?"}</span>
          <strong>${s.complete ? fmt(s.total) + " / 20" : ev.split ? fmt(s.partial) + " / 20 · incomplet" : "Choisir la répartition"}</strong>
          <small>${s.filled}/${GRID.length} critères</small>
        </div>
      </section>
    </div>`;
  }

  function critHTML(crit, ev, locked) {
    const value = ev.v[crit.id];
    const deg = C.degreeOf(crit, value, ev.d[crit.id]);
    const desc = C.descOf(crit, ev.role);
    const recheck = ev.recheck?.[crit.id] ? `<p class="ce-warn">⚠️ Le rôle AFL3 a changé après cette note : vérifie-la avec les descripteurs affichés.</p>` : "";
    if (!desc) {
      return `<div class="ce-crit"><div class="ce-crit-head"><b>${esc(crit.label)}</b><span>${value != null ? `<strong>${fmt(value)}</strong>` : "—"} /${crit.max}</span></div>
        <p class="ce-hint">Choisis d'abord le rôle AFL3 (partenaire ou juge) en haut de la fiche.</p></div>`;
    }
    const dis = locked ? " disabled" : "";
    const degs = crit.deg.map(([a, b], i) => `<button type="button" class="ce-deg d${i + 1}${deg === i + 1 ? " on" : ""}" data-act="deg" data-crit="${crit.id}" data-deg="${i + 1}" aria-pressed="${deg === i + 1}"${dis}>
      <b>${crit.names ? crit.names[i] : "Degré " + (i + 1)} <small>${a === b ? fmt(a) : fmt(a) + "–" + fmt(b)}</small></b><span>${esc(desc[i])}</span></button>`).join("");
    const chips = deg ? C.stepsOf(crit.deg[deg - 1]).map(x => `<button type="button" class="${value === x ? "on" : ""}" data-act="val" data-crit="${crit.id}" data-deg="${deg}" data-value="${x}" aria-pressed="${value === x}"${dis}>${fmt(x)}</button>`).join("") : "";
    return `<div class="ce-crit${value != null ? " filled" : ""}">
      <div class="ce-crit-head"><b>${esc(crit.label)}</b><span>${value != null ? `<strong>${fmt(value)}</strong>` : "—"} /${crit.max}</span></div>
      ${recheck}
      <div class="ce-degs">${degs}</div>
      ${deg && chips ? `<div class="ce-chips"><span>Note dans le degré ${deg} :</span>${chips}</div>` : ""}
    </div>`;
  }

  /* Critère évalué avant l'épreuve par le collègue : affichage compact, non modifiable ici. */
  function preCritHTML(crit, ev) {
    const v = ev.v[crit.id];
    const d = C.degreeOf(crit, v, ev.d[crit.id]);
    const desc = C.descOf(crit, ev.role);
    return `<div class="ce-crit filled ce-crit-pre"><div class="ce-crit-head"><b>${esc(crit.label)}</b><span>${dot(crit, d)} <strong>${fmt(v)}</strong> /${crit.max}</span></div>
      <p class="ce-hint">🗂️ Évalué avant l'épreuve par ${esc(ev.pre.by)}${desc && d ? ` : ${esc(desc[d - 1])}` : ""}</p></div>`;
  }

  /* Modification d'une fiche déjà terminée une fois : consignée, sans toucher à la version initiale. */
  function logEdit(ep, cand, ev, field, from, to) {
    if (!ev.initial || from === to) return;
    log(ep, {type:"eval-edit", cand:cand.id, candName:cand.name, field, from:String(from ?? ""), to:String(to ?? "")});
  }

  function setValue(ep, critId, deg, value) {
    const cand = candById(ep, currentId);
    const ev = evalOf(ep, currentId);
    if (ev.done || (ev.pre && !ev.pre.unlocked && ev.pre.crits.includes(critId))) return;
    const crit = C.critById(critId);
    const before = ev.v[critId] != null ? `D${C.degreeOf(crit, ev.v[critId], ev.d[critId])} ${fmt(ev.v[critId])}` : "";
    const range = crit.deg[deg - 1];
    ev.d[critId] = deg;
    if (value != null) ev.v[critId] = value;
    else if (range[0] === range[1]) ev.v[critId] = range[0];
    else if (ev.v[critId] == null || !C.inRange(crit, deg, ev.v[critId])) delete ev.v[critId];
    if (ev.recheck) delete ev.recheck[critId];
    const after = ev.v[critId] != null ? `D${deg} ${fmt(ev.v[critId])}` : "";
    logEdit(ep, cand, ev, crit.label, before, after);
    ev.updatedAt = Date.now();
    save();
  }

  function snapshot(ev) {
    return {split:ev.split, theme:ev.theme, role:ev.role, v:{...ev.v}, d:{...ev.d}, comment:ev.comment, at:Date.now()};
  }

  function recapTable(ev, role) {
    const s = C.scores(ev);
    const rows = GRID.map(cr => {
      const v = ev.v[cr.id];
      const d = C.degreeOf(cr, v, ev.d?.[cr.id]);
      return `<tr><td>${esc(cr.label)}</td><td>${v != null ? dot(cr, d) : "—"}</td><td class="num">${fmt(v)} / ${cr.max}</td></tr>`;
    }).join("");
    return `<p><b>Thème :</b> ${esc(THEMES[ev.theme] || "—")} · <b>Répartition :</b> ${esc(ev.split || "—")} · <b>Rôle :</b> ${esc(ROLES[role ?? ev.role] || "—")}</p>
      <div class="ce-table"><table><thead><tr><th>Critère</th><th>Degré</th><th>Note</th></tr></thead><tbody>${rows}
      <tr class="ce-sum"><td>AFL1 · AFL2 · AFL3</td><td></td><td class="num">${fmt(s.afl1)} · ${fmt(s.afl2)} · ${fmt(s.afl3)}</td></tr>
      <tr class="ce-sum"><td>Total</td><td></td><td class="num"><b>${fmt(s.total)} / 20</b></td></tr></tbody></table></div>`;
  }

  function openFinish(ep, cand) {
    const ev = evalOf(ep, cand.id);
    const missing = C.missingFields(ev);
    if (missing.length) {
      openDialog(`<h2>Fiche incomplète</h2><p>Pour terminer l'évaluation de <b>${esc(cand.name)}</b>, il manque :</p>
        <ul>${missing.map(m => `<li>${esc(m)}</li>`).join("")}</ul>
        <div class="ce-actions"><button value="close" class="ce-primary">Compléter la fiche</button></div>`);
      return;
    }
    openDialog(`<h2>Terminer l'évaluation de ${esc(cand.name)} ?</h2>
      ${recapTable(ev)}
      <p class="ce-hint">Après confirmation, la fiche est verrouillée et une copie de cette évaluation initiale est conservée.
      Elle restera consultable après l'harmonisation.</p>
      <div class="ce-actions"><button type="button" class="ce-primary" data-act="confirm-done">🔒 Confirmer et verrouiller</button><button value="close">Annuler</button></div>`);
  }

  /* =========================
     2 · ÉCHANGER
  ========================= */

  function qrImage(text) {
    if (typeof qrcode !== "function") return "";
    const qr = qrcode(0, "M");
    qr.addData(unescape(encodeURIComponent(text)), "Byte");
    qr.make();
    return qr.createSvgTag({cellSize:4, margin:4, scalable:true});
  }

  function qrBlock(parts, index, act) {
    return parts.length ? `<div class="ce-qr">${qrImage(parts[index])}</div>
      <div class="ce-nav ce-qr-nav">
        <button type="button" data-act="${act}" data-step="-1" aria-label="QR précédent" ${index === 0 ? "disabled" : ""}>←</button>
        <b>QR ${index + 1} / ${parts.length}</b>
        <button type="button" data-act="${act}" data-step="1" aria-label="QR suivant" ${index >= parts.length - 1 ? "disabled" : ""}>→</button>
      </div>` : `<p class="ce-hint">Ajoute des candidats pour générer un QR.</p>`;
  }

  function receiveHTML(ep) {
    const others = ep ? Object.entries(ep.others) : [];
    const received = others.map(([name, o]) => {
      const rows = Object.values(o.rows).filter(C.isFilled);
      const done = rows.filter(r => r.done).length;
      let lots = "";
      if (o.parts) {
        const got = [...o.parts.got].sort((a, b) => a - b);
        const missing = Array.from({length:o.parts.total}, (_, i) => i + 1).filter(n => !got.includes(n));
        lots = missing.length
          ? `<span class="ce-warn">⚠️ QR reçus : ${got.join(", ") || "aucun"} sur ${o.parts.total} · manquants : ${missing.join(", ")}</span>`
          : `<span class="ce-ok-text">✓ ${o.parts.total} QR sur ${o.parts.total} reçus</span>`;
      }
      return `<li><div><b>${esc(name)}</b> · ${rows.length} fiche(s) dont ${done} terminée(s)</div>
        <small>Dernière réception : ${when(o.lastAt || o.at)}</small> ${lots}
        <button type="button" class="ce-link" data-act="drop-other" data-name="${esc(name)}">Retirer</button></li>`;
    }).join("");
    let prep = "";
    if (ep?.prepFrom) {
      const pf = ep.prepFrom;
      const got = pf.parts ? [...pf.parts.got].sort((a, b) => a - b) : [];
      const missing = pf.parts ? Array.from({length:pf.parts.total}, (_, i) => i + 1).filter(n => !got.includes(n)) : [];
      prep = `<p class="ce-prep-info">🗂️ Préparation reçue de <b>${esc(pf.by)}</b> le ${when(pf.lastAt)}
        ${missing.length ? `<span class="ce-warn">· QR manquants : ${missing.join(", ")} sur ${pf.parts.total}</span>` : `<span class="ce-ok-text">· complète ✓</span>`}</p>`;
    }
    return `<section class="ce-card">
      <h2>📥 Recevoir d'un collègue</h2>
      <p class="ce-hint">Un seul scanner pour tout : la <b>préparation</b> avant l'épreuve (noms, répartitions, AFL2/AFL3) ou son <b>évaluation</b> pour le croisement.</p>
      <div class="ce-camera"><video id="ceVideo" playsinline muted class="hidden"></video></div>
      <p id="ceCamStatus" class="ce-hint" aria-live="polite"></p>
      <div class="ce-actions">
        <button type="button" class="ce-primary" data-act="scan">📷 Scanner son QR</button>
        <label class="ce-button">📂 Importer un fichier<input id="ceFile" type="file" accept=".json,application/json" hidden></label>
      </div>
      <details><summary>Coller un code</summary>
        <textarea id="cePaste" rows="4" placeholder="Colle ici le ou les codes COEVAL1:…"></textarea>
        <button type="button" data-act="paste">Valider</button>
      </details>
      ${prep}
      ${ep ? `<h3>Évaluations reçues</h3>
      ${others.length ? `<ul class="ce-received">${received}</ul>` : `<p class="ce-hint">Rien reçu pour l'instant.</p>`}` : ""}
    </section>`;
  }

  function renderShare(main, ep) {
    if (!ep) {
      main.innerHTML = `<div class="ce-share">${receiveHTML(null)}
        <section class="ce-card"><h2>Pas encore d'épreuve</h2>
          <p>Co-évaluateur : scanne le QR de <b>préparation</b> de ton collègue. L'épreuve, la liste des candidats,
          les répartitions et les notes AFL2/AFL3 sont créées automatiquement ; il te restera à évaluer l'AFL1.</p>
          <div class="ce-actions"><button type="button" data-act="new-epreuve">+ Créer plutôt une épreuve</button></div></section></div>`;
      return;
    }
    const parts = ep.candidates.length ? C.qrParts(ep, db.me) : [];
    shareIndex = Math.min(shareIndex, Math.max(0, parts.length - 1));
    const prepParts = ep.candidates.length ? C.prepParts(ep, db.me) : [];
    prepIndex = Math.min(prepIndex, Math.max(0, prepParts.length - 1));
    const ready = C.prepReady(ep);
    main.innerHTML = `<div class="ce-share">
      <section class="ce-card ce-prep">
        <h2>🗂️ Préparer le co-évaluateur <small>avant l'épreuve</small></h2>
        <p>Transmet la liste des candidats, la <b>répartition AFL2/AFL3</b>, le thème, le rôle et les <b>notes AFL2 et AFL3</b>
        déjà évaluées. <b>Jamais tes notes AFL1</b> : le co-évaluateur les attribue seul pendant l'épreuve.</p>
        <p class="${ready < ep.candidates.length ? "ce-warn" : "ce-ok-text"}">${ready} candidat(s) sur ${ep.candidates.length} avec répartition, rôle et AFL2/AFL3 renseignés${ready < ep.candidates.length ? " (les autres partent incomplets)" : " ✓"}.</p>
        ${qrBlock(prepParts, prepIndex, "prep-step")}
        <div class="ce-actions">
          <button type="button" data-act="prep-download">💾 Fichier de préparation</button>
          <button type="button" data-act="prep-copy">📋 Copier le code</button>
        </div>
      </section>
      ${receiveHTML(ep)}
      <section class="ce-card">
        <h2>📤 Envoyer mon évaluation <small>pour le croisement</small></h2>
        <p>Ton collègue scanne ${parts.length > 1 ? `les <b>${parts.length} QR</b> (dans n'importe quel ordre)` : "ce QR"} depuis son onglet « Échanger ».</p>
        ${qrBlock(parts, shareIndex, "qr-step")}
        <div class="ce-actions">
          <button type="button" data-act="download">💾 Fichier (avec remarques)</button>
          <button type="button" data-act="copy-code">📋 Copier le code</button>
        </div>
        <p class="ce-hint">Pour un seul candidat : bouton « QR de ce candidat » en bas de sa fiche.</p>
      </section>
      <section class="ce-card">
        <h2>💾 Sauvegarde de l'épreuve</h2>
        <p>Un fichier qui contient tout : candidats, mes évaluations (et leur version initiale), évaluations reçues,
        décisions d'harmonisation, notes validées et historique. Il sert aussi à transmettre les décisions du jury à un autre appareil.</p>
        <p class="${unsaved(ep) ? "ce-warn" : "ce-hint"}">${ep.backupAt ? `Dernière sauvegarde : ${when(ep.backupAt)}` : "Jamais sauvegardée"}${unsaved(ep) ? " · modifications non sauvegardées" : ""}</p>
        <div class="ce-actions">
          <button type="button" class="ce-primary" data-act="backup">💾 Sauvegarder l'épreuve</button>
          <label class="ce-button">📂 Restaurer une sauvegarde<input id="ceRestore" type="file" accept=".json,application/json" hidden></label>
        </div>
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
    const parsed = C.parseCodes(text);
    if (parsed.error) return {done:false, message:parsed.error};
    const res = importInto(parsed.payloads, parsed.payloads[0].title);
    return {...res, done:!res.error && res.done, message:C.mergeMessage(res)};
  }

  /* Importe dans l'épreuve active, ou dans une nouvelle si aucune n'existe (co-évaluateur
     qui reçoit la préparation). Une préparation complète ouvre directement « Évaluer ». */
  function importInto(payloads, title) {
    const created = !active();
    const ep = active() || newEpreuve(title || "Épreuve importée");
    const res = C.importPayloads(ep, payloads, db.me);
    if (res.error && created) db.epreuves = db.epreuves.filter(e => e !== ep);
    if (res.prep && res.done && !res.error) { tab = "eval"; currentId = null; }
    save();
    return res;
  }

  function downloadJSON(name, data, title) {
    const blob = new Blob([JSON.stringify(data)], {type:"application/json"});
    const file = new File([blob], name, {type:"application/json"});
    if (navigator.canShare?.({files:[file]})) {
      navigator.share({files:[file], title}).catch(() => {});
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const slug = s => normName(s).replace(/ /g, "-");

  function download(ep) {
    downloadJSON(`coeval_${slug(ep.title)}_${slug(db.me)}.json`, C.exportFile(ep, db.me), ep.title);
  }

  function backup(ep) {
    const data = C.makeBackup(ep, db.me);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    downloadJSON(`sauvegarde_${slug(ep.title)}_${slug(db.me)}_${stamp}.json`, data, ep.title);
    ep.backupAt = data.savedAt;
    ep.backupHash = C.contentHash(ep);
    save();
    render();
    toast("💾 Sauvegarde créée. Range le fichier en lieu sûr.");
  }

  /* Un seul bouton d'import : fichier d'échange d'un collègue ou sauvegarde complète. */
  function importFile(file) {
    readTextFile(file, text => {
      let d;
      try { d = JSON.parse(text); } catch (e) { toast("Fichier non reconnu."); return; }
      if (d?.type === "coeval-backup") { openRestore(d); return; }
      if (d?.type !== "coeval-musculation" && d?.type !== "coeval-preparation") { toast("Fichier non reconnu."); return; }
      const res = importInto([C.fileToPayload(d)], d.title);
      toast(C.mergeMessage(res));
      render();
    });
  }

  function openRestore(d) {
    const checked = C.checkBackup(d);
    if (checked.error) { toast(checked.error); return; }
    pendingRestore = checked;
    const p = checked.preview;
    const foreign = normName(p.by) !== normName(db.me);
    const target = db.epreuves.find(e => e.id === checked.epreuve.id) || db.epreuves.find(e => normName(e.title) === normName(p.title));
    const options = db.epreuves.map(e => `<option value="${esc(e.id)}"${e === target ? " selected" : ""}>${esc(e.title)} · ${e.candidates.length} candidat(s)</option>`).join("");
    openDialog(`<h2>Restaurer une sauvegarde</h2>
      <ul class="ce-preview">
        <li><b>${esc(p.title)}</b>, sauvegardée le ${when(p.savedAt)} par <b>${esc(p.by || "?")}</b></li>
        <li>${p.candidates} candidat(s) · ${p.mine} fiche(s) de ${esc(p.by || "?")}</li>
        <li>Évaluations reçues : ${p.others.length ? esc(p.others.join(", ")) : "aucune"}</li>
        <li>${p.decisions} décision(s) d'harmonisation · ${p.validated} note(s) validée(s) · ${p.history} entrée(s) d'historique</li>
        ${p.version < C.DATA_VERSION ? `<li>Format ancien (v${p.version}) : converti automatiquement.</li>` : ""}
      </ul>
      ${foreign ? `<p class="ce-warn">Cette sauvegarde est celle de ${esc(p.by || "un autre évaluateur")} : ses fiches seront ajoutées comme évaluation reçue. Tes propres fiches ne sont pas touchées.</p>` : ""}
      <fieldset class="ce-radio">
        <legend>Que faire ?</legend>
        <label><input type="radio" name="ceRestoreMode" value="merge"${db.epreuves.length ? " checked" : " disabled"}> Fusionner (garde, pour chaque fiche, la version la plus récente)</label>
        <label><input type="radio" name="ceRestoreMode" value="replace"${foreign || !db.epreuves.length ? " disabled" : ""}> Remplacer l'épreuve choisie par la sauvegarde</label>
        <label><input type="radio" name="ceRestoreMode" value="new"${db.epreuves.length ? "" : " checked"}> Ajouter comme nouvelle épreuve</label>
      </fieldset>
      ${db.epreuves.length ? `<label>Épreuve concernée<select id="ceRestoreTarget">${options}</select></label>` : ""}
      <div class="ce-actions"><button type="button" class="ce-primary" data-act="do-restore">Restaurer</button><button value="close">Annuler</button></div>`);
  }

  function doRestore() {
    if (!pendingRestore) return;
    const mode = document.querySelector("input[name=ceRestoreMode]:checked")?.value || "new";
    const targetId = $("ceRestoreTarget")?.value || null;
    if (mode === "replace") {
      const t = db.epreuves.find(e => e.id === targetId);
      if (!confirm(`Remplacer définitivement « ${t?.title} » par la sauvegarde ? Les données actuelles de cette épreuve seront perdues.`)) return;
    }
    const res = C.restoreBackup(db, pendingRestore, {mode, targetId}, db.me);
    if (res.error) { toast(res.error); return; }
    pendingRestore = null;
    currentId = crossId = null;
    save();
    closeDialog();
    render();
    toast(mode === "merge" ? "✅ Sauvegarde fusionnée." : mode === "replace" ? "✅ Épreuve remplacée par la sauvegarde." : "✅ Sauvegarde restaurée.");
  }

  /* =========================
     3 · CROISER — tableau de bord
  ========================= */

  function renderCross(main, ep) {
    if (crossView === "stats") { renderStats(main, ep); return; }
    const cand = candById(ep, crossId);
    if (cand) { renderCrossDetail(main, ep, cand); return; }
    crossId = null;
    const names = [db.me, ...Object.keys(ep.others)];
    const items = ep.candidates.map(c => ({c, r:C.retainedFor(ep, c, db.me)}));
    const n = items.length;
    const count = f => items.filter(f).length;
    const st = x => x.r.h.status;
    const mineComplete = ep.candidates.filter(c => C.scores(C.get(ep.mine, c.id)).complete).length;
    const mineDone = ep.candidates.filter(c => C.get(ep.mine, c.id)?.done).length;
    const validated = count(x => x.r.validated);
    const todo = count(x => C.needsAction(x.r));
    const majors = count(x => st(x) === "major");
    const tile = (filter, num, label, tone, extra = "") => `<button type="button" class="ce-tile ${tone}${crossFilter === filter ? " on" : ""}" data-act="filter" data-filter="${filter}" aria-pressed="${crossFilter === filter}">
      <b>${num}</b><span>${label}</span>${extra ? `<small>${extra}</small>` : ""}</button>`;
    const filters = {
      all:() => true, todo:x => C.needsAction(x.r), validated:x => !!x.r.validated,
      degree:x => st(x) === "major" || st(x) === "degree", choices:x => st(x) === "choices",
      points:x => st(x) === "points", incomplete:x => st(x) === "incomplete", accord:x => st(x) === "accord"
    };
    let shown = items.filter(filters[crossFilter] || filters.all);
    if (crossSort === "priority") {
      shown = shown.slice().sort((a, b) => (!!a.r.validated - !!b.r.validated) || STATUS[st(a)].rank - STATUS[st(b)].rank || a.c.name.localeCompare(b.c.name, "fr"));
    }
    const rows = shown.map(({c, r}) => {
      const totals = r.entries.map(x => x.ev ? C.scores(x.ev).total : null);
      const known = totals.filter(t => t != null);
      const gap = known.length > 1 ? Math.max(...known) - Math.min(...known) : null;
      const cellOf = x => {
        const p = progressOf(x.ev);
        const label = p.state === "todo" ? "Pas évalué" : p.state === "partial" ? `Partiel : ${p.filled} critère(s) sur ${GRID.length}` : PROGRESS[p.state].label;
        const text = p.state === "todo" ? "—" : p.state === "partial" ? `${p.filled}/${GRID.length}` : fmt(p.s.total);
        return `<td class="num"><span class="ce-pg ${p.state}" title="${label}">${ring(p.state, p.filled)} ${text}<span class="ce-sr">${label}</span></span></td>`;
      };
      const degCount = GRID.filter(cr => r.h.crits[cr.id].mustDecide).length;
      const detail = degCount ? ` <small>${degCount} critère(s)</small>` : st({r}) === "points" ? ` <small>${GRID.filter(cr => r.h.crits[cr.id].status === "points").length} critère(s)</small>` : "";
      const note = r.validated
        ? `<b class="ce-validated">✅ ${fmt(r.total)}</b><small>validée${r.stale ? " · ⚠️ à revoir" : ""}</small>`
        : r.total != null ? `<span class="ce-prov">${fmt(r.total)}</span><small>provisoire</small>`
        : `<span class="ce-prov">—</span><small>${r.h.pending ? r.h.pending + " à trancher" : r.h.evaluators < 2 ? "en attente" : "incomplète"}</small>`;
      return `<tr data-act="cross-open" data-id="${esc(c.id)}">
        <td><b>${esc(c.name)}</b>${c.classroom ? ` <small>${esc(c.classroom)}</small>` : ""}</td>
        ${r.entries.map(cellOf).join("")}
        <td class="num${gap >= 2 ? " ce-big-gap" : ""}">${fmt(gap)}</td>
        <td>${tag(r.h.status)}${detail}</td>
        <td class="num ce-note">${note}</td></tr>`;
    }).join("");
    main.innerHTML = `<section class="ce-card">
      <div class="ce-cross-head"><h2>Tableau de bord du jury</h2>
        <div class="ce-actions"><button type="button" data-act="stats">📊 Bilan du jury</button></div></div>
      ${names.length < 2 ? `<p class="ce-warn">Aucune évaluation de collègue reçue : va dans « Échanger » pour scanner son QR.</p>` : ""}
      <div class="ce-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${validated}">
        <div style="width:${n ? validated / n * 100 : 0}%"></div></div>
      <p class="ce-hint">${validated} note(s) validée(s) sur ${n} · mes fiches : ${mineComplete} complète(s), ${mineDone} terminée(s)</p>
      <div class="ce-tiles">
        ${tile("all", n, "Candidats", "neutral")}
        ${tile("incomplete", count(x => st(x) === "incomplete"), "En attente / incomplets", "wait")}
        ${tile("accord", count(x => st(x) === "accord"), "✓ Accord", "ok")}
        ${tile("points", count(x => st(x) === "points"), "≈ Écart de points", "mid")}
        ${tile("degree", count(filters.degree), "≠ Désaccord de degré", "bad", majors ? `dont ${majors} majeur(s) ‼` : "")}
        ${tile("choices", count(filters.choices), "⇄ Choix différents", "bad")}
        ${tile("validated", validated, "✅ Validés", "ok")}
      </div>
      <div class="ce-actions">
        <button type="button" class="${crossFilter === "todo" ? "ce-primary" : ""}" data-act="filter" data-filter="todo">⚠️ Candidats à harmoniser (${todo})</button>
        <label class="ce-inline">Ordre <select id="ceSort"><option value="name"${crossSort === "name" ? " selected" : ""}>alphabétique</option><option value="priority"${crossSort === "priority" ? " selected" : ""}>par priorité</option></select></label>
      </div>
      <p class="ce-hint">Colonnes des évaluateurs : ${ring("todo", 0)} pas évalué · ${ring("partial", 5)} partiel (critères notés) · ${ring("complete", 9)} complet · 🔒 terminé.
      Note provisoire : décision du jury, sinon moyenne au ¼ de point quand le degré est commun. En cas de degrés différents, rien n'est proposé : le jury tranche. Touchez un candidat pour harmoniser.</p>
      <div class="ce-table"><table>
        <thead><tr><th>Candidat</th>${names.map(nm => `<th class="num">${esc(nm)}</th>`).join("")}<th class="num">Écart</th><th>Croisement</th><th class="num">Note /20</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${names.length + 4}" class="ce-hint">Aucun candidat pour ce filtre.</td></tr>`}</tbody></table></div>
      <div class="ce-actions">
        <button type="button" data-act="csv">⬇️ CSV synthèse</button>
        <button type="button" data-act="csv-detail">⬇️ CSV détaillé (degrés)</button>
        <button type="button" data-act="csv-history">⬇️ Historique des décisions</button>
        <button type="button" data-act="print-sheets">🖨️ Fiches par candidat</button>
        <button type="button" data-act="print">🖨️ Ce tableau</button>
      </div>
    </section>`;
  }

  /* =========================
     3 · CROISER — harmonisation d'un candidat
  ========================= */

  function renderCrossDetail(main, ep, cand) {
    const r = C.retainedFor(ep, cand, db.me);
    const {h, entries} = r;
    const locked = !!r.validated;
    const idx = ep.candidates.indexOf(cand);
    const totals = entries.map(x => x.ev ? C.scores(x.ev).total : null);
    const known = totals.filter(t => t != null);
    const gap = known.length > 1 ? Math.max(...known) - Math.min(...known) : null;
    const nDeg = GRID.filter(cr => ["major", "degree"].includes(h.crits[cr.id].status)).length;
    const nDiv = h.divergences;
    const shownEv = r.ev;
    const shownS = r.validated ? {total:r.validated.total, afl1:r.validated.afl1, afl2:r.validated.afl2, afl3:r.validated.afl3} : h.scores;

    const evaluators = entries.map((x, i) => `<div class="ce-who"><b>${esc(x.name)}</b>
      <span>${x.ev ? `${fmt(totals[i])} / 20${x.ev.done ? " · 🔒 terminée" : ""}` : "non reçue"}</span></div>`).join("");
    const comments = entries.filter(x => x.ev?.comment).map(x => `<p class="ce-remark"><b>${esc(x.name)} :</b> ${esc(x.ev.comment)}</p>`).join("");
    const noteLine = r.validated
      ? `<div class="ce-final ok">✅ <b>Note validée : ${fmt(r.total)} / 20</b><small>le ${when(r.validated.at)} par ${esc(r.validated.by)}</small></div>
         ${r.stale ? `<p class="ce-warn">⚠️ Des évaluations ont changé depuis la validation : la note validée n'a pas bougé. Modifie-la si besoin.</p>` : ""}`
      : `<div class="ce-final">📝 Note provisoire : <b>${h.scores.total != null ? fmt(h.scores.total) + " / 20" : "incomplète"}</b><small>non validée</small></div>`;

    const choicesCard = choicesHTML(h, entries, locked);
    let last = "";
    const cards = GRID.map(cr => {
      const html = critCardHTML(ep, cand, cr, h, entries, locked);
      if (!html) return "";
      const head = cr.group !== last ? `<h3 class="ce-hgroup">${esc(cr.afl === "AFL1" ? "AFL1 · " + cr.group : cr.group)}</h3>` : "";
      last = cr.group;
      return head + html;
    }).join("");

    const mine = C.get(ep.mine, cand.id);
    let initial = "";
    if (mine?.initial) {
      const changed = GRID.filter(cr => mine.initial.v[cr.id] !== mine.v[cr.id]).map(cr => cr.label);
      ["theme", "split", "role"].forEach(f => { if (mine.initial[f] !== mine[f]) changed.unshift(CHOICE_FIELDS[f].label); });
      initial = `<details class="ce-initial"><summary>Mon évaluation initiale (${fmt(C.scores(mine.initial).total)} / 20, terminée le ${when(mine.doneAt || mine.initial.at)})${changed.length ? " · modifiée depuis" : ""}</summary>
        ${changed.length ? `<p class="ce-warn">Modifié après la première validation : ${esc(changed.join(", "))}</p>` : `<p class="ce-hint">Inchangée depuis.</p>`}
        ${recapTable(mine.initial)}</details>`;
    }

    main.innerHTML = `<section class="ce-card ce-hsum">
      <div class="ce-nav">
        <button type="button" data-act="cross-back">← Tableau</button>
        <button type="button" data-act="cross-step" data-step="-1" aria-label="Candidat précédent" ${idx === 0 ? "disabled" : ""}>←</button>
        <h2>${esc(cand.name)}${cand.classroom ? ` <small>${esc(cand.classroom)}</small>` : ""}</h2>
        <button type="button" data-act="cross-step" data-step="1" aria-label="Candidat suivant" ${idx === ep.candidates.length - 1 ? "disabled" : ""}>→</button>
      </div>
      <div class="ce-kv">
        <span><small>Thème</small><b>${esc(THEMES[shownEv.theme] || "à choisir")}</b></span>
        <span><small>Répartition</small><b>${esc(shownEv.split || "à choisir")}</b></span>
        <span><small>Rôle AFL3</small><b>${esc(ROLES[shownEv.role] || "à choisir")}</b></span>
        <span><small>Écart total</small><b>${fmt(gap)}</b></span>
        <span><small>Critères en désaccord</small><b>${nDiv}${nDeg ? ` (dont ${nDeg} de degré)` : ""}</b></span>
        <span><small>Croisement</small>${tag(h.status)}</span>
      </div>
      <div class="ce-whos">${evaluators}</div>
      ${noteLine}
      <p class="ce-hint">AFL1 ${fmt(shownS.afl1)} / 12 · AFL2 ${fmt(shownS.afl2)} · AFL3 ${fmt(shownS.afl3)}</p>
      ${nDiv ? `<div class="ce-progress small" role="progressbar" aria-valuemin="0" aria-valuemax="${nDiv}" aria-valuenow="${h.treated}"><div style="width:${h.treated / nDiv * 100}%"></div></div>
        <p class="ce-hint"><b>${h.treated} désaccord(s) traité(s) sur ${nDiv}</b> (décision explicite du jury)</p>` : ""}
      <div class="ce-actions">
        <button type="button" data-act="next-crit"${nDiv ? "" : " disabled"}>➡️ Critère suivant à harmoniser</button>
        <button type="button" data-act="only-div" aria-pressed="${onlyDivergent}" class="${onlyDivergent ? "ce-primary" : ""}">${onlyDivergent ? "Voir tous les critères" : "Voir uniquement les désaccords"}</button>
      </div>
      ${comments}
      ${initial}
    </section>
    ${choicesCard}
    <section class="ce-card">${cards || `<p class="ce-hint">Aucun désaccord sur les critères ✓</p>`}</section>
    <section class="ce-card">
      ${locked
        ? `<div class="ce-actions"><button type="button" data-act="unvalidate">✏️ Modifier la note validée</button><button type="button" data-act="print-one">🖨️ Imprimer la fiche</button></div>`
        : `${h.blockers.length ? `<p class="ce-warn">Avant de valider :</p><ul class="ce-blockers">${h.blockers.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
          <div class="ce-actions">
            <button type="button" class="ce-primary" data-act="validate"${h.blockers.length ? " disabled" : ""}>✅ Valider la note harmonisée</button>
            <button type="button" data-act="reset-final">↺ Réinitialiser l'harmonisation</button>
            <button type="button" data-act="print-one">🖨️ Imprimer la fiche</button>
          </div>`}
    </section>`;
  }

  /* Thème, répartition et rôle : côte à côte, à trancher s'ils diffèrent. */
  function choicesHTML(h, entries, locked) {
    const differ = Object.values(h.choices).some(c => c.differ);
    const rows = Object.entries(CHOICE_FIELDS).map(([f, meta]) => {
      const c = h.choices[f];
      const evs = entries.map((x, i) => `<span class="ce-chip-ro"><small>${esc(x.name)}</small>${esc(meta.map[c.vals[i]] || "—")}</span>`).join("");
      const btns = Object.entries(meta.map).map(([k, v]) => `<button type="button" class="${c.value === k ? "on" : ""}" data-act="pick-choice" data-field="${f}" data-value="${k}" aria-pressed="${c.value === k}"${locked ? " disabled" : ""}>${esc(v)}</button>`).join("");
      return `<div class="ce-choice-row${c.differ ? " bad" : ""}">
        <div class="ce-choice-label"><b>${meta.label}</b>${c.differ ? (c.decided ? ` <span class="ce-tag ok">✓ tranché</span>` : ` <span class="ce-tag bad">⇄ à trancher</span>`) : ""}</div>
        <div class="ce-chip-row">${evs}</div>
        <div class="ce-choice"><span>Retenu</span>${btns}</div></div>`;
    }).join("");
    return `<section class="ce-card${differ ? " ce-alert" : ""}">
      ${differ ? `<p class="ce-alert-text">⚠️ <b>Les évaluateurs n'ont pas fait les mêmes choix.</b> Le jury doit confirmer le choix retenu avant la validation ; les pondérations sont recalculées aussitôt.</p>` : `<h3>Choix de l'élève</h3>`}
      ${rows}
    </section>`;
  }

  function critCardHTML(ep, cand, cr, h, entries, locked) {
    const st = h.crits[cr.id];
    if (onlyDivergent && !st.divergent) return "";
    const key = cand.id + ":" + cr.id;
    const open = openCrits[key] ?? (st.divergent && st.source !== "jury");
    const dis = locked ? " disabled" : "";
    const marks = entries.map((x, i) => {
      const m = st.marks[i];
      return `<span class="ce-mark"><small>${esc(x.name)}</small>${m ? `${dot(cr, m.d)} ${fmt(m.v)}` : "—"}</span>`;
    }).join("");
    const sourceLabel = {jury:"décision du jury", moyenne:"moyenne", unique:"seule note"}[st.source] || "";
    const retained = st.value != null ? `<b>${fmt(st.value)}</b> <small>${sourceLabel}</small>` : st.mustDecide ? `<b class="ce-todo">à trancher</b>` : "—";

    // Étape 1 : degrés de chacun et leurs descripteurs, côte à côte.
    const compare = entries.map((x, i) => {
      const m = st.marks[i];
      if (!m) return `<div class="ce-cmp"><b>${esc(x.name)}</b><p class="ce-hint">Pas de note.</p></div>`;
      const desc = C.descOf(cr, x.ev.role);
      return `<div class="ce-cmp d${m.d}"><b>${esc(x.name)}</b> ${dot(cr, m.d)} <span>${fmt(m.v)} pt</span>
        <p>${esc(desc ? desc[m.d - 1] : "")}</p>${cr.descByRole && x.ev.role ? `<small>Grille « ${esc(ROLES[x.ev.role])} »</small>` : ""}</div>`;
    }).join("");
    const roleWarn = cr.id === "role" && h.ev.role
      ? entries.filter(x => x.ev?.v?.role != null && x.ev.role && x.ev.role !== h.ev.role).map(x => x.name) : [];
    const desc = C.descOf(cr, h.ev.role);
    const selDeg = st.decision?.deg || st.deg || 0;
    const degBtns = desc
      ? cr.deg.map(([a, b], i) => `<button type="button" class="ce-deg d${i + 1}${selDeg === i + 1 ? " on" : ""}" data-act="h-deg" data-crit="${cr.id}" data-deg="${i + 1}" aria-pressed="${selDeg === i + 1}"${dis}>
          <b>${cr.names ? cr.names[i] : "Degré " + (i + 1)} <small>${a === b ? fmt(a) : fmt(a) + "–" + fmt(b)}</small></b><span>${esc(desc[i])}</span></button>`).join("")
      : `<p class="ce-hint">Choisis d'abord le rôle AFL3 retenu (plus haut) pour afficher la bonne grille.</p>`;

    // Étape 2 : note précise dans le degré retenu ; la moyenne n'est proposée que si elle y entre.
    let step2 = "";
    if (selDeg && desc) {
      const range = cr.deg[selDeg - 1];
      const meanOk = st.count > 1 && C.inRange(cr, selDeg, st.mean);
      const chips = C.stepsOf(range).map(x => `<button type="button" class="${st.value === x && st.deg === selDeg ? "on" : ""}${meanOk && st.mean === x ? " mean" : ""}" data-act="h-val" data-crit="${cr.id}" data-deg="${selDeg}" data-value="${x}" aria-pressed="${st.value === x}"${dis}>${fmt(x)}${meanOk && st.mean === x ? " <small>moy.</small>" : ""}</button>`).join("");
      step2 = `<div class="ce-step"><h4>Étape 2 · Note dans le degré ${selDeg}</h4>
        <div class="ce-chips">${chips}</div>
        ${meanOk && st.source !== "jury" ? `<button type="button" class="ce-link" data-act="h-val" data-crit="${cr.id}" data-deg="${selDeg}" data-value="${st.mean}"${dis}>Retenir la moyenne des notes initiales (${fmt(st.mean)})</button>`
          : st.count > 1 && !meanOk ? `<p class="ce-hint">La moyenne des notes initiales (${fmt(st.mean)}) n'appartient pas à ce degré : elle n'est pas proposée.</p>` : ""}
      </div>`;
    }

    return `<details class="ce-hcard ${STATUS[st.status].tone}" id="crit-${cr.id}" data-crit="${cr.id}"${open ? " open" : ""}>
      <summary>
        <span class="ce-hcard-title"><b>${esc(cr.label)}</b> <small>/${cr.max}</small></span>
        ${tag(st.status)}
        <span class="ce-marks">${marks}</span>
        <span class="ce-retained">Retenu : ${retained}</span>
      </summary>
      <div class="ce-hcard-body">
        <div class="ce-step"><h4>Étape 1 · Degré retenu</h4>
          <div class="ce-cmps">${compare}</div>
          ${roleWarn.length ? `<p class="ce-warn">⚠️ ${esc(roleWarn.join(", "))} : critère noté avec l'autre grille de rôle. Vérifie le degré avec la grille retenue.</p>` : ""}
          <div class="ce-degs">${degBtns}</div>
        </div>
        ${step2}
        ${st.decision && !locked ? `<button type="button" class="ce-link" data-act="h-reset-crit" data-crit="${cr.id}">↺ Revenir aux notes initiales pour ce critère</button>` : ""}
      </div>
    </details>`;
  }

  function marksText(cr, h, entries) {
    return entries.map((x, i) => {
      const m = h.crits[cr.id].marks[i];
      return `${x.name} : ${m ? `D${m.d} ${fmt(m.v)}` : "—"}`;
    }).join(" · ");
  }

  function decide(ep, cand, critId, deg, value) {
    const cr = C.critById(critId);
    const f = finalStore(ep, cand.id);
    const prev = C.get(f.crit, critId);
    const range = cr.deg[deg - 1];
    let v = value;
    if (v == null) v = range[0] === range[1] ? range[0] : prev?.v != null && C.inRange(cr, deg, prev.v) ? prev.v : null;
    f.crit[critId] = {deg, v};
    f.updatedAt = Date.now();
    if (v != null && (prev?.v !== v || prev?.deg !== deg)) {
      const h = C.harmonize(C.entriesFor(ep, cand, db.me), null);
      log(ep, {type:"decision", cand:cand.id, candName:cand.name, crit:critId, initial:marksText(cr, h, C.entriesFor(ep, cand, db.me)),
        deg, v, from:prev?.v != null ? `D${prev.deg} ${fmt(prev.v)}` : ""});
    }
    openCrits[cand.id + ":" + critId] = true;
    save();
  }

  function nextCrit(ep, cand) {
    const h = C.harmonize(C.entriesFor(ep, cand, db.me), C.get(ep.final, cand.id));
    const todo = GRID.filter(cr => h.crits[cr.id].divergent && h.crits[cr.id].source !== "jury").map(cr => cr.id);
    if (!todo.length) { toast("Tous les désaccords ont reçu une décision du jury ✓"); return; }
    const after = todo.find(id => GRID.findIndex(c => c.id === id) > GRID.findIndex(c => c.id === nextCrit.last));
    const id = after || todo[0];
    nextCrit.last = id;
    openCrits[cand.id + ":" + id] = true;
    const el = $("crit-" + id);
    if (el) { el.open = true; el.scrollIntoView({block:"start", behavior:"smooth"}); }
  }

  function openValidate(ep, cand) {
    const h = C.harmonize(C.entriesFor(ep, cand, db.me), C.get(ep.final, cand.id));
    if (h.blockers.length) { toast(h.blockers[0]); return; }
    const single = GRID.filter(cr => h.crits[cr.id].count === 1).map(cr => cr.label);
    openDialog(`<h2>Valider la note de ${esc(cand.name)} ?</h2>
      ${recapTable(h.ev)}
      <p>${h.treated} désaccord(s) tranché(s) explicitement par le jury sur ${h.divergences}.</p>
      ${single.length ? `<p class="ce-warn">⚠️ Noté(s) par un seul évaluateur : ${esc(single.join(", "))}.</p>` : ""}
      <p class="ce-hint">La note validée est figée : elle devient la note officiellement retenue par le jury sur cet appareil,
      et la validation est inscrite dans l'historique au nom de ${esc(db.me)}.</p>
      <div class="ce-actions"><button type="button" class="ce-primary" data-act="confirm-validate">✅ Confirmer la validation</button><button value="close">Annuler</button></div>`);
  }

  /* =========================
     3 · CROISER — bilan du jury
  ========================= */

  function renderStats(main, ep) {
    const s = C.juryStats(ep, db.me);
    const pct = x => x == null ? "—" : Math.round(x) + " %";
    const back = `<div class="ce-nav"><button type="button" data-act="stats-back">← Tableau de bord</button><h2>Bilan du jury</h2></div>`;
    if (s.names.length < 2) {
      main.innerHTML = `<section class="ce-card">${back}<p class="ce-warn">Il faut au moins une évaluation de collègue pour calculer la concordance.</p></section>`;
      return;
    }
    const evalRows = s.perEval.map(e => `<tr><td>${esc(e.name)}</td><td class="num">${e.filled}</td><td class="num">${e.complete}</td><td class="num">${fmt(e.retainedGap == null ? null : Math.round(e.retainedGap * 100) / 100)}</td></tr>`).join("");
    const pairRows = s.pairs.map(p => `<tr><td>${esc(s.names[p.a])} / ${esc(s.names[p.b])}</td><td class="num">${p.n}</td>
      <td class="num">${fmt(p.meanAbs == null ? null : Math.round(p.meanAbs * 100) / 100)}</td><td class="num">${p.meanSigned == null ? "—" : (p.meanSigned > 0 ? "+" : "") + fmt(Math.round(p.meanSigned * 100) / 100)}</td></tr>`).join("");
    const critRows = s.perCrit.map(c => `<tr><td>${esc(c.label)}</td><td class="num">${c.compared}</td><td class="num">${pct(c.compared ? c.agree / c.compared * 100 : null)}</td>
      <td class="num">${c.degree}${c.major ? ` <small>(dont ${c.major} ‼)</small>` : ""}</td><td class="num">${c.points}</td></tr>`).join("");
    main.innerHTML = `<section class="ce-card">${back}
      <p class="ce-hint">Ces indicateurs décrivent la concordance entre évaluateurs sur cette épreuve. Ils ne mesurent pas la qualité d'un évaluateur.</p>
      <div class="ce-tiles">
        <div class="ce-tile neutral"><b>${s.crossed}</b><span>Candidats croisés</span></div>
        <div class="ce-tile ok"><b>${pct(s.exactDegreePct)}</b><span>Accord exact sur les degrés</span><small>${s.compared} comparaison(s) critère</small></div>
        <div class="ce-tile bad"><b>${s.withDegree}</b><span>Candidats avec ≥ 1 désaccord de degré</span></div>
        <div class="ce-tile mid"><b>${s.needed}</b><span>Dossiers à harmoniser</span></div>
        <div class="ce-tile ok"><b>${s.validated}</b><span>Notes validées</span></div>
      </div>
      <h3>Par évaluateur</h3>
      <div class="ce-table"><table><thead><tr><th>Évaluateur</th><th class="num">Fiches</th><th class="num">Complètes</th><th class="num">Écart moyen avec la note retenue</th></tr></thead><tbody>${evalRows}</tbody></table></div>
      <h3>Par paire d'évaluateurs (totaux initiaux)</h3>
      <div class="ce-table"><table><thead><tr><th>Paire</th><th class="num">Candidats</th><th class="num">Écart moyen absolu</th><th class="num">Écart moyen signé</th></tr></thead><tbody>${pairRows}</tbody></table></div>
      <h3>Par critère</h3>
      <div class="ce-table"><table><thead><tr><th>Critère</th><th class="num">Comparaisons</th><th class="num">Accord de degré</th><th class="num">Désaccords de degré</th><th class="num">Écarts de points</th></tr></thead><tbody>${critRows}</tbody></table></div>
      ${s.names.length === 2 ? diffChart(s) : ""}
      <div class="ce-actions"><button type="button" data-act="csv-stats">⬇️ Export anonymisé (CSV)</button></div>
    </section>`;
  }

  /* Deux évaluateurs : écart moyen par critère (A − B), barres de part et d'autre de zéro.
     Chaque valeur est écrite en clair ; la couleur ne fait que doubler le sens. */
  function diffChart(s) {
    const p = s.pairs[0];
    const [a, b] = [s.names[p.a], s.names[p.b]];
    const crits = p.crit.filter(c => c.n);
    if (!crits.length) return "";
    const maxAbs = Math.max(.25, ...crits.map(c => Math.abs(c.meanSigned)));
    const rows = crits.map(c => {
      const w = Math.abs(c.meanSigned) / maxAbs * 50;
      const val = Math.round(c.meanSigned * 100) / 100;
      const who = val > 0 ? `${a} note plus haut` : val < 0 ? `${b} note plus haut` : "identique en moyenne";
      return `<div class="ce-bar-row" title="${esc(c.label)} : ${val > 0 ? "+" : ""}${fmt(val)} pt en moyenne (${esc(who)}, ${c.n} candidat(s))">
        <span class="ce-bar-label">${esc(c.label)}</span>
        <span class="ce-bar-track"><span class="ce-bar-zero"></span>
          <span class="ce-dbar ${val >= 0 ? "pos" : "neg"}" style="${val >= 0 ? "left:50%" : `left:${50 - w}%`};width:${w}%"></span></span>
        <span class="ce-bar-val">${val > 0 ? "+" : ""}${fmt(val)}</span></div>`;
    }).join("");
    return `<h3>Différence moyenne par critère (${esc(a)} − ${esc(b)}, en points)</h3>
      <p class="ce-hint"><span class="ce-key pos"></span> ${esc(a)} note plus haut · <span class="ce-key neg"></span> ${esc(b)} note plus haut. Touchez une ligne pour le détail.</p>
      <div class="ce-bars">${rows}</div>`;
  }

  /* =========================
     EXPORTS ET IMPRESSION
  ========================= */

  /* CSV pour Excel (séparateur ;). Un texte qui commence par = + - @ est neutralisé. */
  function csvDownload(name, lines) {
    const cell = x => {
      let s = String(x ?? "").replace(/^—$/, "");
      if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const text = "﻿" + lines.map(l => l.map(cell).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], {type:"text/csv;charset=utf-8"}));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function statusText(r) {
    if (r.validated) return r.stale ? "Validée (évaluations modifiées depuis)" : "Validée";
    if (r.h.evaluators < 2) return "En attente d'une évaluation";
    if (r.h.pending || Object.values(r.h.choices).some(c => c.differ && !c.decided)) return "À harmoniser";
    return r.total != null ? "Provisoire" : "Incomplète";
  }

  function csvSummary(ep) {
    const names = [db.me, ...Object.keys(ep.others)];
    const lines = [["Candidat", "Classe", "Thème", "Répartition AFL2/AFL3", "Rôle AFL3", ...names.map(n => "Total " + n), "Écart total",
      "AFL1 retenu", "AFL2 retenu", "AFL3 retenu", "Note harmonisée /20", "Statut", "Croisement", "Validée le", "Validée par"]];
    ep.candidates.forEach(c => {
      const r = C.retainedFor(ep, c, db.me);
      const totals = r.entries.map(x => x.ev ? C.scores(x.ev).total : null);
      const known = totals.filter(t => t != null);
      const s = r.validated || r.h.scores;
      lines.push([c.name, c.classroom, THEMES[r.ev.theme] || "", r.ev.split, ROLES[r.ev.role] || "", ...totals.map(fmt),
        fmt(known.length > 1 ? Math.max(...known) - Math.min(...known) : null), fmt(s.afl1), fmt(s.afl2), fmt(s.afl3), fmt(r.total),
        statusText(r), STATUS[r.h.status].label, r.validated ? when(r.validated.at) : "", r.validated?.by || ""]);
    });
    csvDownload(`coeval_${slug(ep.title)}_synthese.csv`, lines);
  }

  function csvDetail(ep) {
    const names = [db.me, ...Object.keys(ep.others)];
    const lines = [["Candidat", "Classe", "Bloc", "Critère", "Barème", ...names.flatMap(n => ["Degré " + n, "Points " + n]),
      "Croisement", "Écart de points", "Degré retenu", "Points retenus", "Origine", "Statut de la note"]];
    const origin = {jury:"Décision du jury", moyenne:"Moyenne (même degré)", unique:"Seule note"};
    ep.candidates.forEach(c => {
      const r = C.retainedFor(ep, c, db.me);
      GRID.forEach(cr => {
        const st = r.h.crits[cr.id];
        const v = r.ev.v[cr.id];
        const d = v != null ? C.degreeOf(cr, v, r.ev.d?.[cr.id]) : 0;
        lines.push([c.name, c.classroom, cr.afl === "AFL1" ? "AFL1 · " + cr.group : cr.group, cr.label, cr.max,
          ...st.marks.flatMap(m => m ? [C.degreeName(cr, m.d), fmt(m.v)] : ["", ""]),
          STATUS[st.status].label, fmt(st.gap), d ? C.degreeName(cr, d) : "", fmt(v),
          origin[st.source] || (st.mustDecide ? "À trancher" : ""), statusText(r)]);
      });
    });
    csvDownload(`coeval_${slug(ep.title)}_detail.csv`, lines);
  }

  const HISTORY_TYPES = {
    "decision":"Décision sur un critère", "decision-reset":"Retour aux notes initiales", "choice":"Choix retenu",
    "harmonisation-reset":"Harmonisation réinitialisée", "validate":"Note validée", "unvalidate":"Validation annulée",
    "eval-done":"Fiche terminée", "eval-reopen":"Fiche rouverte", "eval-edit":"Fiche modifiée après validation",
    "prep-unlock":"Données de préparation déverrouillées"
  };

  function csvHistory(ep) {
    const lines = [["Date", "Candidat", "Action", "Objet", "Évaluations initiales", "Degré retenu", "Note retenue", "Valeur précédente", "Enregistré par (déclaratif)"]];
    ep.history.forEach(e => {
      const cr = e.crit ? C.critById(e.crit) : null;
      const object = cr ? cr.label : e.field ? (CHOICE_FIELDS[e.field]?.label || e.field) : "";
      lines.push([when(e.at), e.candName || candById(ep, e.cand)?.name || "", HISTORY_TYPES[e.type] || e.type, object, e.initial || "",
        cr && e.deg ? C.degreeName(cr, e.deg) : "", e.v != null ? fmt(e.v) : e.total != null ? fmt(e.total) : e.to || "", e.from || "", e.by || ""]);
    });
    csvDownload(`coeval_${slug(ep.title)}_historique.csv`, lines);
    toast("Historique exporté. Sans authentification, l'auteur indiqué est déclaratif.");
  }

  function csvStats(ep) {
    const s = C.juryStats(ep, db.me);
    const alias = i => "Évaluateur " + (i + 1);
    const round = x => x == null ? null : Math.round(x * 1000) / 1000;
    const lines = [["Section", "Élément", "Indicateur", "Valeur"],
      ["Global", "", "Candidats croisés", s.crossed], ["Global", "", "Accord exact sur les degrés (%)", fmt(round(s.exactDegreePct))],
      ["Global", "", "Candidats avec au moins un désaccord de degré", s.withDegree], ["Global", "", "Dossiers à harmoniser", s.needed],
      ["Global", "", "Notes validées", s.validated]];
    s.perEval.forEach((e, i) => {
      lines.push(["Évaluateur", alias(i), "Fiches", e.filled], ["Évaluateur", alias(i), "Fiches complètes", e.complete],
        ["Évaluateur", alias(i), "Écart moyen avec la note retenue", fmt(round(e.retainedGap))]);
    });
    s.pairs.forEach(p => {
      const pair = `${alias(p.a)} / ${alias(p.b)}`;
      lines.push(["Paire", pair, "Candidats comparés", p.n], ["Paire", pair, "Écart moyen absolu", fmt(round(p.meanAbs))],
        ["Paire", pair, "Écart moyen signé", fmt(round(p.meanSigned))]);
      p.crit.forEach(c => { if (c.n) lines.push(["Paire · critère", `${pair} · ${c.label}`, "Écart moyen signé", fmt(round(c.meanSigned))]); });
    });
    s.perCrit.forEach(c => {
      lines.push(["Critère", c.label, "Comparaisons", c.compared], ["Critère", c.label, "Désaccords de degré", c.degree],
        ["Critère", c.label, "dont majeurs", c.major], ["Critère", c.label, "Écarts de points", c.points]);
    });
    csvDownload(`coeval_${slug(ep.title)}_bilan-anonyme.csv`, lines);
  }

  function sheetHTML(ep, cand) {
    const r = C.retainedFor(ep, cand, db.me);
    const ev = r.ev;
    const s = r.validated || r.h.scores;
    const present = r.entries.filter(x => x.ev);
    const head = present.map(x => `<th>${esc(x.name)}</th>`).join("");
    const rows = GRID.map(cr => {
      const cells = r.entries.map((x, i) => x.ev ? `<td>${r.h.crits[cr.id].marks[i] ? `${C.degreeName(cr, r.h.crits[cr.id].marks[i].d)} · ${fmt(r.h.crits[cr.id].marks[i].v)}` : "—"}</td>` : "").join("");
      const v = ev.v[cr.id];
      return `<tr><td>${esc(cr.label)} <small>/${cr.max}</small></td>${cells}<td><b>${v != null ? `${C.degreeName(cr, C.degreeOf(cr, v, ev.d?.[cr.id]))} · ${fmt(v)}` : "—"}</b></td></tr>`;
    }).join("");
    const totalRow = (label, key, max) => `<tr class="ce-sum"><td>${label}</td>${r.entries.map(x => x.ev ? `<td>${fmt(C.scores(x.ev)[key])}</td>` : "").join("")}<td><b>${fmt(s[key])}</b>${max ? " / " + max : ""}</td></tr>`;
    const [w2, w3] = SPLITS[ev.split] || [];
    return `<section class="ce-sheet-print">
      <h2>${esc(cand.name)}${cand.classroom ? ` · ${esc(cand.classroom)}` : ""}</h2>
      <p>${esc(ep.title)} · Musculation CA5</p>
      <p><b>Thème :</b> ${esc(THEMES[ev.theme] || "—")} · <b>Répartition :</b> ${esc(ev.split || "—")} · <b>Rôle AFL3 :</b> ${esc(ROLES[ev.role] || "—")}</p>
      <table><thead><tr><th>Critère</th>${head}<th>Retenu</th></tr></thead><tbody>${rows}
        ${totalRow("AFL1", "afl1", 12)}${totalRow("AFL2", "afl2", w2)}${totalRow("AFL3", "afl3", w3)}${totalRow("Total", "total", 20)}</tbody></table>
      <p class="ce-sheet-status">${r.validated ? `<b>Note validée par le jury : ${fmt(r.total)} / 20</b> — le ${when(r.validated.at)} (${esc(r.validated.by)})`
        : `<b>Note provisoire, non validée : ${fmt(r.total)} / 20</b>`}</p>
      ${present.filter(x => x.ev.comment).map(x => `<p><b>${esc(x.name)} :</b> ${esc(x.ev.comment)}</p>`).join("")}
      <div class="ce-signs">${present.map(x => `<div>${esc(x.name)}<span></span></div>`).join("")}</div>
    </section>`;
  }

  function printSheets(ep, cands) {
    const box = $("cePrint");
    box.innerHTML = cands.map(c => sheetHTML(ep, c)).join("");
    document.body.classList.add("ce-printing");
    const done = () => { document.body.classList.remove("ce-printing"); box.innerHTML = ""; };
    window.addEventListener("afterprint", done, {once:true});
    window.print();
  }

  /* =========================
     DIALOGUES
  ========================= */

  function openCandidates(ep) {
    openDialog(`<h2>Candidats · ${esc(ep.title)}</h2>
      <label class="ce-button ce-primary">📂 Importer la liste CSV (colonne A : NOM Prénom)<input id="ceCsv" type="file" accept=".csv,text/csv,text/plain" hidden></label>
      <p class="ce-hint">Export Pronote accepté tel quel : seuls le nom (colonne A) et la classe sont repris.</p>
      <label>…ou colle la liste (un candidat par ligne)<textarea id="ceNames" rows="8" placeholder="DUPONT Léa&#10;MARTIN Hugo"></textarea></label>
      <div class="ce-actions"><button type="button" class="ce-primary" data-act="add-names">Ajouter</button><button value="close">Fermer</button></div>
      <ul class="ce-cand-edit">${ep.candidates.map(c => `<li><span>${esc(c.name)}${c.classroom ? ` <small>${esc(c.classroom)}</small>` : ""}</span><button type="button" class="ce-link" data-act="del-cand" data-id="${esc(c.id)}">Supprimer</button></li>`).join("")}</ul>
      <hr><div class="ce-actions">
        <button type="button" class="ce-link" data-act="backup">💾 Sauvegarder l'épreuve</button>
        <button type="button" class="ce-link" data-act="rename-epreuve">Renommer l'épreuve</button>
        <button type="button" class="ce-link ce-danger" data-act="del-epreuve">Supprimer l'épreuve</button></div>`);
  }

  /* =========================
     ÉVÉNEMENTS
  ========================= */

  document.addEventListener("click", ev => {
    const tabBtn = ev.target.closest(".ce-tabs button");
    if (tabBtn) { tab = tabBtn.dataset.tab; crossId = null; crossView = "table"; render(); return; }
    const el = ev.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const ep = active();
    const act = el.dataset.act;
    const cand = ep && candById(ep, tab === "cross" ? crossId : currentId);
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
      case "eval-filter": evalFilter = el.dataset.filter; render(); break;
      case "pick": currentId = el.dataset.id; render(); window.scrollTo({top:0, behavior:"smooth"}); break;
      case "step": {
        const i = ep.candidates.findIndex(c => c.id === currentId) + Number(el.dataset.step);
        if (ep.candidates[i]) { currentId = ep.candidates[i].id; render(); window.scrollTo({top:0, behavior:"smooth"}); }
        break;
      }
      case "set": {
        const e = evalOf(ep, currentId);
        const field = el.dataset.field;
        if (e.done || (e.pre && !e.pre.unlocked && e.pre.choices.includes(field))) return;
        const value = e[field] === el.dataset.value ? "" : el.dataset.value;
        if (field === "role" && e.role && e.v.role != null && value !== e.role) {
          if (!confirm(`Le critère « Rôle » est déjà noté (${fmt(e.v.role)}) avec la grille « ${ROLES[e.role]} ».\nChanger de rôle conserve cette note, mais elle sera signalée à vérifier avec les nouveaux descripteurs. Continuer ?`)) return;
          e.recheck = {...(e.recheck || {}), role:true};
        }
        logEdit(ep, cand, e, CHOICE_FIELDS[field].label, CHOICE_FIELDS[field].map[e[field]] || "", CHOICE_FIELDS[field].map[value] || "");
        e[field] = value;
        e.updatedAt = Date.now(); save(); render(); break;
      }
      case "deg": setValue(ep, el.dataset.crit, Number(el.dataset.deg), null); render(); break;
      case "val": setValue(ep, el.dataset.crit, Number(el.dataset.deg), Number(el.dataset.value)); render(); break;
      case "finish": openFinish(ep, cand); break;
      case "confirm-done": {
        const e = evalOf(ep, currentId);
        e.done = true;
        e.doneAt = Date.now();
        if (!e.initial) e.initial = snapshot(e);
        log(ep, {type:"eval-done", cand:cand.id, candName:cand.name, total:C.scores(e).total});
        save(); closeDialog();
        const next = ep.candidates.slice(ep.candidates.indexOf(cand) + 1).concat(ep.candidates).find(c => !C.get(ep.mine, c.id)?.done);
        if (next) currentId = next.id;
        render(); window.scrollTo({top:0, behavior:"smooth"});
        toast(`🔒 Évaluation de ${cand.name} terminée.${next ? ` Suivant : ${next.name}.` : " Toutes tes fiches sont terminées."}`);
        break;
      }
      case "reopen": {
        const e = evalOf(ep, currentId);
        if (!confirm(`Rouvrir l'évaluation de ${cand.name} ?\nLa version initiale reste conservée et chaque modification sera consignée dans l'historique.`)) return;
        e.done = false;
        e.reopenedAt = Date.now();
        log(ep, {type:"eval-reopen", cand:cand.id, candName:cand.name});
        save(); render(); break;
      }
      case "single-qr": {
        openDialog(`<h2>QR de ${esc(cand.name)}</h2><div class="ce-qr">${qrImage(C.singleQR(ep, cand, db.me))}</div>
          <p class="ce-hint">Ton collègue le scanne dans « Échanger ». Seule cette fiche est mise à jour chez lui.</p>
          <div class="ce-actions"><button value="close" class="ce-primary">Fermer</button></div>`);
        break;
      }
      case "qr-step": shareIndex += Number(el.dataset.step); render(); break;
      case "prep-step": prepIndex += Number(el.dataset.step); render(); break;
      case "prep-download": downloadJSON(`preparation_${slug(ep.title)}_${slug(db.me)}.json`, C.exportPrepFile(ep, db.me), ep.title); break;
      case "prep-copy": {
        const text = C.prepParts(ep, db.me).join("\n");
        (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast("Code de préparation copié."), () => prompt("Copie ce code :", text));
        break;
      }
      case "go-receive": tab = "share"; render(); break;
      case "unlock-pre": {
        const e = evalOf(ep, currentId);
        if (!confirm(`Modifier la répartition, le thème, le rôle ou les notes AFL2/AFL3 évalués par ${e.pre.by} ?\nTes changements apparaîtront comme des écarts au croisement.`)) return;
        e.pre.unlocked = true;
        log(ep, {type:"prep-unlock", cand:cand.id, candName:cand.name, from:e.pre.by});
        save(); render(); break;
      }
      case "download": download(ep); break;
      case "copy-code": {
        const text = C.qrParts(ep, db.me).join("\n");
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
      case "backup": if (ep) backup(ep); break;
      case "do-restore": doRestore(); break;
      case "filter": crossFilter = crossFilter === el.dataset.filter && el.dataset.filter !== "all" ? "all" : el.dataset.filter; render(); break;
      case "stats": crossView = "stats"; render(); window.scrollTo({top:0}); break;
      case "stats-back": crossView = "table"; render(); break;
      case "cross-open": crossId = el.dataset.id; render(); window.scrollTo({top:0}); break;
      case "cross-back": crossId = null; render(); break;
      case "cross-step": {
        const i = ep.candidates.findIndex(c => c.id === crossId) + Number(el.dataset.step);
        if (ep.candidates[i]) { crossId = ep.candidates[i].id; nextCrit.last = null; render(); window.scrollTo({top:0}); }
        break;
      }
      case "only-div": onlyDivergent = !onlyDivergent; render(); break;
      case "next-crit": nextCrit(ep, cand); break;
      case "h-deg": decide(ep, cand, el.dataset.crit, Number(el.dataset.deg), null); render(); break;
      case "h-val": decide(ep, cand, el.dataset.crit, Number(el.dataset.deg), Number(el.dataset.value)); render(); break;
      case "h-reset-crit": {
        const f = finalStore(ep, cand.id);
        const prev = f.crit[el.dataset.crit];
        delete f.crit[el.dataset.crit];
        f.updatedAt = Date.now();
        log(ep, {type:"decision-reset", cand:cand.id, candName:cand.name, crit:el.dataset.crit, from:prev?.v != null ? `D${prev.deg} ${fmt(prev.v)}` : ""});
        save(); render(); break;
      }
      case "pick-choice": {
        const f = finalStore(ep, cand.id);
        const field = el.dataset.field;
        const prev = f.choice[field] || "";
        if (prev === el.dataset.value) return;
        f.choice[field] = el.dataset.value;
        f.updatedAt = Date.now();
        log(ep, {type:"choice", cand:cand.id, candName:cand.name, field, from:CHOICE_FIELDS[field].map[prev] || "", to:CHOICE_FIELDS[field].map[el.dataset.value]});
        save(); render(); break;
      }
      case "validate": openValidate(ep, cand); break;
      case "confirm-validate": {
        const h = C.harmonize(C.entriesFor(ep, cand, db.me), C.get(ep.final, cand.id));
        if (h.blockers.length) { closeDialog(); toast(h.blockers[0]); return; }
        const f = finalStore(ep, cand.id);
        f.validated = C.makeValidation(h, db.me);
        f.updatedAt = Date.now();
        log(ep, {type:"validate", cand:cand.id, candName:cand.name, total:h.scores.total});
        save(); closeDialog(); render(); window.scrollTo({top:0});
        toast(`✅ Note de ${cand.name} validée : ${fmt(h.scores.total)} / 20.`);
        break;
      }
      case "unvalidate": {
        const f = finalStore(ep, cand.id);
        if (!confirm(`Annuler la validation de la note de ${cand.name} (${fmt(f.validated?.total)} / 20) pour la modifier ?\nL'annulation est inscrite dans l'historique.`)) return;
        log(ep, {type:"unvalidate", cand:cand.id, candName:cand.name, from:fmt(f.validated?.total)});
        f.validated = null;
        f.updatedAt = Date.now();
        save(); render(); break;
      }
      case "reset-final": {
        if (!confirm(`Effacer toutes les décisions d'harmonisation de ${cand.name} et revenir aux notes initiales ?`)) return;
        const f = finalStore(ep, cand.id);
        f.crit = {}; f.choice = {};
        f.updatedAt = Date.now();
        log(ep, {type:"harmonisation-reset", cand:cand.id, candName:cand.name});
        save(); render(); break;
      }
      case "csv": csvSummary(ep); break;
      case "csv-detail": csvDetail(ep); break;
      case "csv-history": csvHistory(ep); break;
      case "csv-stats": csvStats(ep); break;
      case "print-sheets": printSheets(ep, ep.candidates); break;
      case "print-one": printSheets(ep, [cand]); break;
      case "print": window.print(); break;
      case "add-names": {
        const n = C.addCandidates(ep, $("ceNames").value.split(/\r?\n/));
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
        if (confirm(`Supprimer définitivement « ${ep.title} » et toutes ses notes ?${unsaved(ep) ? "\n⚠️ Elle n'a pas été sauvegardée dans un fichier depuis les dernières modifications." : ""}`)) {
          db.epreuves = db.epreuves.filter(e => e.id !== ep.id);
          db.activeId = db.epreuves[0]?.id || null;
          save(); closeDialog(); render();
        }
        break;
    }
  });

  document.addEventListener("change", ev => {
    const el = ev.target;
    const ep = active();
    if (el.id === "ceEpreuve") { db.activeId = el.value; currentId = crossId = null; crossView = "table"; save(); render(); return; }
    if (el.id === "ceSort") { crossSort = el.value; render(); return; }
    if (el.id === "ceFile" && el.files[0]) { importFile(el.files[0]); el.value = ""; return; }
    if (el.id === "ceRestore" && el.files[0]) {
      readTextFile(el.files[0], text => {
        let d;
        try { d = JSON.parse(text); } catch (e) { toast("Fichier non reconnu."); return; }
        openRestore(d);
      });
      el.value = "";
      return;
    }
    if (el.id === "ceCsv" && el.files[0]) {
      readTextFile(el.files[0], text => {
        const {names, classes} = C.parseCSV(text);
        const n = C.addCandidates(ep, names, classes);
        save(); toast(`${n} élève(s) ajouté(s) sur ${names.length} lu(s).`); openCandidates(ep); render();
      });
    }
  });

  document.addEventListener("input", ev => {
    const el = ev.target;
    if (el.dataset.field === "comment" && tab === "eval") {
      const e = evalOf(active(), currentId);
      if (e.done) return;
      e.comment = el.value;
      e.updatedAt = Date.now();
      save();
    }
  });

  // Mémorise les critères ouverts ou repliés à la main dans l'écran d'harmonisation.
  document.addEventListener("toggle", ev => {
    const d = ev.target;
    if (d.matches?.("details[data-crit]") && crossId) openCrits[crossId + ":" + d.dataset.crit] = d.open;
  }, true);

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

  // Demande au navigateur de ne pas effacer les données de lui-même (Safari notamment).
  navigator.storage?.persist?.().catch(() => {});

  window.CoEval = {core:C, get db() { return db; }, importText};
  render();
})();
