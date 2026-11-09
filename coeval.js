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
  const W = window.CoEvalWorkflow;
  const {GRID, SPLITS, THEMES, ROLES, CHOICE_FIELDS, STATUS, fmt, normName} = C;
  const KEY = "df-coeval-v1";

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  const when = t => t ? new Date(t).toLocaleString("fr-FR", {dateStyle:"short", timeStyle:"short"}) : "—";
  const tag = st => `<span class="ce-tag ${STATUS[st].tone}" title="${STATUS[st].label}">${STATUS[st].icon}<span class="ce-tag-label"> ${STATUS[st].label}</span></span>`;
  const dot = (cr, d) => d ? `<span class="ce-dot d${d}">${cr.names ? cr.names[d - 1] : "D" + d}</span>` : "";

  let db = load();
  let tab = "home";
  let storageError = false, offlineReady = false, lastInput = null, pendingCsv = null, pendingExchange = null, pendingBackup = null, stopTestCamera = null;
  let currentId = null;
  let crossId = null;
  let crossView = "table";
  let crossFilter = "all";
  let crossSort = "name";
  let onlyDivergent = true;
  let queue = null;
  let detailMode = null;
  let editChoices = null;  // candidat dont on modifie le thème, la répartition et le rôle   // "recap" ou "harmo" ; par défaut : récapitulatif si la note est validée   // harmonisation enchaînée : {ids, i, done}
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
    try { localStorage.setItem(KEY, JSON.stringify(db)); storageError = false; }
    catch (e) { storageError = true; }
    renderNotice(active());
    return !storageError;
  }

  function active() {
    return db.epreuves.find(e => e.id === db.activeId && !e.archived) || db.epreuves.find(e => !e.archived) || null;
  }

  function newEpreuve(title, role = "prof") {
    const e = {id:C.uid(), title, role, createdAt:Date.now(), candidates:[], mine:{}, others:{}, final:{}, history:[], backupAt:0, backupHash:""};
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

  /* Deux parcours : le professeur de la classe prépare (choix, AFL2, AFL3), note l'AFL1,
     reçoit le co-évaluateur, croise et valide ; le co-évaluateur reçoit la préparation,
     note l'AFL1 et envoie son évaluation. */
  const roleOf = ep => ep?.role || (ep?.prepFrom ? "coeval" : "prof");
  const ROLE_LABEL = {prof:"Professeur", coeval:"Co-évaluateur"};
  const TABS = {
    prof:[["home", "Vue d’ensemble"], ["prep", "1 · Préparer"], ["eval", "2 · Évaluer"], ["cross", "3 · Croiser"]],
    coeval:[["home", "Vue d’ensemble"], ["share", "1 · Recevoir"], ["eval", "2 · Évaluer"], ["send", "3 · Envoyer"]]
  };

  /* Préférences d'affichage propres à cet appareil (pas des données d'épreuve). */
  const UI_KEY = "coeval-ui";
  const ui = (() => { try { return JSON.parse(localStorage.getItem(UI_KEY) || "{}") || {}; } catch (e) { return {}; } })();
  const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* sans importance */ } };

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
  const ring = (state, filled, total = GRID.length) => state === "done" ? `<span class="ce-lock-icon" aria-hidden="true">🔒</span>`
    : `<span class="ce-ring ${state}" style="--f:${state === "complete" ? 100 : state === "todo" ? 0 : Math.max(12, filled / total * 100)}%" aria-hidden="true"></span>`;
  const minibar = (filled, total = GRID.length) => `<span class="ce-minibar" aria-hidden="true"><span style="width:${filled / total * 100}%"></span></span>`;

  /* Avancement selon l'écran : Préparer (choix + AFL2/AFL3) ou Évaluer (AFL1). */
  const SCOPE_LABELS = {
    prep:{todo:"À préparer", partial:"En cours", complete:"Prête", done:"Terminé"},
    afl1:{todo:"Pas commencé", partial:"Partiel", complete:"AFL1 complète", done:"Terminé"}
  };
  function scopeProgress(ev, scope) {
    const s = C.scores(ev);
    if (scope === "prep") {
      const items = [ev?.theme, ev?.split, ev?.role, ...C.PREP_CRITS.map(id => ev?.v?.[id])];
      const filled = items.filter(x => x != null && x !== "").length;
      return {state:filled === items.length ? "complete" : filled ? "partial" : "todo", filled, total:items.length, s};
    }
    const filled = C.AFL1_IDS.filter(id => ev?.v?.[id] != null).length;
    return {state:ev?.done ? "done" : filled === C.AFL1_IDS.length ? "complete" : filled ? "partial" : "todo", filled, total:C.AFL1_IDS.length, s};
  }
  const log = (ep, entry) => C.logHistory(ep, entry, db.me);
  const hasContent = ep => ep.candidates.length || Object.keys(ep.others).length || Object.keys(ep.final).length || ep.trash?.length;
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
    stopTestCamera?.(); stopTestCamera = null;
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
    sel.innerHTML = db.epreuves.some(e => !e.archived)
      ? db.epreuves.filter(e => !e.archived).map(e => `<option value="${esc(e.id)}"${e.id === active()?.id ? " selected" : ""}>${esc(e.title)} · ${e.candidates.length} candidat(s)</option>`).join("")
      : `<option value="">Aucune épreuve</option>`;
    const ep = active();
    $("ceMe").textContent = "👤 " + (db.me || "Qui évalue ?") + (ep && db.me ? ` · ${ROLE_LABEL[roleOf(ep)]}` : "");
    const tabs = ep ? TABS[roleOf(ep)] : tab === "share" ? TABS.coeval : [];
    if (ep && !tabs.some(([t]) => t === tab)) tab = "eval";
    const nav = document.querySelector(".ce-tabs");
    nav.classList.toggle("hidden", !db.me || !tabs.length);
    nav.innerHTML = tabs.map(([t, label]) => `<button type="button" role="tab" data-tab="${t}" class="${t === tab ? "active" : ""}" aria-selected="${t === tab}">${label}</button>`).join("");
  }

  /* Rappel discret de sauvegarde : hors saisie, ou quand toutes mes fiches sont terminées. */
  function renderNotice(ep) {
    const box = $("ceNotice");
    if (!box) return;
    box.innerHTML = `${storageError ? '<div class="ce-storage-error" role="alert"><b>Enregistrement impossible sur cet appareil.</b> Garde cette page ouverte et exporte immédiatement une copie de secours. <button type="button" data-act="backup">Exporter l’épreuve</button></div>' : ''}
      ${ep && db.me ? `<div class="ce-notice"><span>${storageError?'Données en mémoire uniquement':'Enregistré sur cet appareil'} · ${offlineReady?'Disponible hors connexion':'Hors connexion : à vérifier'}</span><button type="button" data-act="readiness">Vérifier</button><button type="button" data-act="backup">Copie de secours${unsaved(ep)?' à actualiser':''}</button></div>` : ''}`;
  }

  function render() {
    if (stopCamera && tab !== "share" && tab !== "cross") { stopCamera(); stopCamera = null; }
    document.body.classList.toggle("ce-passage", !!ui.passage && tab === "eval");
    renderBar();
    const ep = active();
    renderNotice(ep);
    const main = $("ceMain");
    if (!db.me) { main.innerHTML = welcomeHTML(); return; }
    if (!ep) { if (tab === "share") renderShare(main, null); else main.innerHTML = noEpreuveHTML(); return; }
    if (tab === "home") renderDashboard(main, ep);
    else if (tab === "prep") renderEval(main, ep, "prep");
    else if (tab === "eval") renderEval(main, ep, "afl1");
    else if (tab === "share") renderShare(main, ep);
    else if (tab === "send") renderSend(main, ep);
    else renderCross(main, ep);
  }

  function welcomeHTML() {
    return `<section class="ce-card ce-welcome">
      <h2>Bienvenue 👋</h2>
      <p>Le professeur de la classe prépare et valide ; le co-évaluateur note l'AFL1. Chacun sur son appareil, sans voir l'autre.</p>
      <label>Ton nom d'évaluateur<input id="ceMeInput" placeholder="ex. M. Le Pannérer" autocomplete="name"></label>
      <button type="button" class="ce-primary" data-act="set-me">Commencer</button><button type="button" data-act="demo">Essayer avec une classe fictive</button>
    </section>`;
  }

  function noEpreuveHTML() {
    return `<section class="ce-card ce-welcome">
      <h2>Quel est ton rôle ?</h2>
      <div class="ce-roles">
        <button type="button" class="ce-role" data-act="new-epreuve"><b>👩‍🏫 Je suis le professeur de la classe</b>
          <span>Je prépare l'AFL2 et l'AFL3, je note l'AFL1, puis je croise avec mon collègue et je valide les notes.</span></button>
        <button type="button" class="ce-role" data-act="go-receive"><b>🤝 Je suis co-évaluateur</b>
          <span>Je reçois la préparation du professeur, je note l'AFL1 et je lui envoie mon évaluation.</span></button>
      </div>
      <button type="button" data-act="demo">Essayer avec une classe d’exemple</button><button type="button" data-act="manage">Archives et corbeille</button><details class="ce-more"><summary>Autres options</summary>
        <div class="ce-actions">
          <button type="button" data-act="demo">🧪 Essayer avec une classe d'exemple (28 élèves)</button>
          <label class="ce-button">📂 Restaurer une sauvegarde<input id="ceRestore" type="file" accept=".json,application/json" hidden></label>
        </div>
      </details>
    </section>`;
  }

  /* =========================
     1 · ÉVALUER
  ========================= */

  function renderEval(main, ep, scope = "afl1") {
    const prepScope = scope === "prep";
    if (!ep.candidates.length) {
      main.innerHTML = roleOf(ep) === "coeval"
        ? `<section class="ce-card ce-welcome"><h2>Aucun candidat</h2>
          <p>Reçois d'abord la préparation du professeur (onglet « 1 · Recevoir »).</p>
          <button type="button" class="ce-primary" data-act="go-tab" data-tab="share">📥 Recevoir la préparation</button></section>`
        : `<section class="ce-card ce-welcome"><h2>Aucun candidat</h2>
          <p>Importe la liste de la classe (export Pronote) ou colle les noms.</p>
          <button type="button" class="ce-primary" data-act="candidates">👥 Ajouter des candidats</button></section>`;
      return;
    }
    if (!candById(ep, currentId)) currentId = ep.candidates[0].id;
    const visible = viewCandidates(ep);
    if (visible.length && !visible.some(c => c.id === currentId)) currentId = visible[0].id;
    if(!visible.length) {main.innerHTML=`<div class="ce-eval"><aside class="ce-list">${listControls(ep)}</aside><section class="ce-card"><h2>Aucun élève pour ces filtres</h2><button type="button" data-act="clear-filters">Afficher tous les élèves</button></section></div>`;return;}
    const cand = candById(ep, currentId);
    const ev = evalOf(ep, cand.id);
    const s = C.scores(ev);
    const idx = visible.indexOf(cand);
    const locked = !!ev.done || !W.eligible(cand);
    const dis = locked ? " disabled" : "";
    const pre = ev.pre && !ev.pre.unlocked ? ev.pre : null;

    const labels = SCOPE_LABELS[scope];
    const progress = ep.candidates.map(c => ({c, p:scopeProgress(C.get(ep.mine, c.id), scope)}));
    const counts = Object.fromEntries(Object.keys(PROGRESS).map(k => [k, progress.filter(x => x.p.state === k).length]));

    const list = visible.map(c => ({c,p:scopeProgress(C.get(ep.mine,c.id),scope)})).map(({c, p}) => {
      const right = !prepScope && (p.state === "done" || p.state === "complete") && p.s.complete ? fmt(p.s.total) + "/20"
        : prepScope && p.state === "complete" ? "✓" : p.filled + "/" + p.total;
      return `<button type="button" class="ce-cand ${p.state}${c.id === cand.id ? " current" : ""}" data-act="pick" data-id="${esc(c.id)}" aria-label="${esc(c.name)} : ${labels[p.state]}, ${p.filled} sur ${p.total}">
        <span class="ce-pg-icon">${ring(p.state, p.filled, p.total)}</span>
        <span class="ce-cand-name">${esc(c.name)}${c.classroom ? ` <i>${esc(c.classroom)}</i>` : ""}${!W.eligible(c)?` <small>${W.SITUATIONS[c.situation]||"Situation particulière"}</small>`:""}</span>
        <span class="ce-cand-right"><small>${right}</small>${p.state === "done" ? "" : minibar(p.filled, p.total)}</span></button>`;
    }).join("");
    const legend = Object.keys(PROGRESS).filter(k => counts[k]).map(k => `<button type="button" class="ce-pg-chip ${k}${evalFilter === k ? " on" : ""}" data-act="eval-filter" data-filter="${k}" aria-pressed="${evalFilter === k}">
      ${ring(k, 1, 2)} ${counts[k]} <small>${labels[k]}</small></button>`).join("");
    const ready = C.prepReady(ep);
    const listTop = prepScope ? `<button type="button" class="ce-primary ce-wide" data-act="prep-share">📤 Transmettre au co-évaluateur <small>(${ready}/${ep.candidates.length} prêtes)</small></button>` : "";

    // Choix déjà fixés (fiche terminée ou repris de la préparation) : une seule ligne.
    const allSet = !!(ev.theme && ev.split && ev.role);
    const fixedChoices = prepScope ? locked : locked || (pre && ["theme", "split", "role"].every(f => pre.choices.includes(f))) || (allSet && editChoices !== cand.id);
    const canEdit = !locked && !(pre && ["theme", "split", "role"].every(f => pre.choices.includes(f)));
    const choiceLine = `<p class="ce-choice-line"><span>${locked ? "🔒 " : ""}${esc(THEMES[ev.theme] || "Thème ?")} · ${esc(ev.split || "répartition ?")} · ${esc({partenaire:"Partenaire", juge:"Juge"}[ev.role] || "rôle ?")}${pre ? ` · 🗂️ ${esc(pre.by)}` : ""}</span>
      ${locked ? `<button type="button" class="ce-link" data-act="reopen">Modifier</button>`
        : pre ? `<button type="button" class="ce-link" data-act="unlock-pre" title="AFL2/AFL3 faits par ${esc(pre.by)} : modifier">Modifier</button>`
        : canEdit ? `<button type="button" class="ce-link" data-act="edit-choices">Modifier</button>` : ""}
</p>`;
    const choice = (field, options, label) => {
      const fixed = pre?.choices.includes(field);
      return `<div class="ce-choice"><span>${label}${fixed ? " 🗂️" : ""}</span>${
        Object.entries(options).map(([k, v]) => `<button type="button" class="${ev[field] === k ? "on" : ""}" data-act="set" data-field="${field}" data-value="${k}" aria-pressed="${ev[field] === k}"${locked || fixed ? " disabled" : ""}>${esc(v)}</button>`).join("")
      }</div>`;
    };

    const scopeIds = prepScope ? C.PREP_CRITS : C.AFL1_IDS;
    let groups = "", lastGroup = "";
    GRID.filter(crit => scopeIds.includes(crit.id)).forEach(crit => {
      if (crit.group !== lastGroup) {
        if (lastGroup) groups += "</div>";
        lastGroup = crit.group;
        groups += `<div class="ce-group"><h3>${esc(crit.afl === "AFL1" ? `AFL1 · ${crit.group}` : crit.group)}</h3>`;
      }
      groups += pre?.crits.includes(crit.id) ? preCritHTML(crit, ev) : critHTML(crit, ev, locked);
    });
    groups += "</div>";

    // Repris d'une préparation ou terminée : signalé dans la ligne des choix (place gagnée pour l'AFL1).
    const preBar = ev.pre?.unlocked && !locked ? `<div class="ce-lock open">✏️ Données de ${esc(ev.pre.by)} modifiables.</div>` : "";
    const lockBar = !locked && ev.initial ? `<div class="ce-lock open">✏️ Fiche rouverte (modifications tracées).</div>` : "";
    const part = (val, p) => val != null ? fmt(val) : p != null ? fmt(p) + "…" : "—";

    main.innerHTML = `<div class="ce-eval">
      <aside class="ce-list">${listTop}${listControls(ep)}<div class="ce-pg-legend">${legend}</div>${list || "<p>Aucun élève pour ces filtres.</p>"}</aside>
      <section class="ce-sheet">
        ${!visible.length?'<p class="ce-warn">Aucun résultat : la fiche ci-dessous reste celle de l’élève précédemment sélectionné.</p>':""}<div class="ce-card ce-cand-head">
          <div class="ce-nav">
            <button type="button" data-act="step" data-step="-1" aria-label="Candidat précédent" ${idx <= 0 ? "disabled" : ""}>←</button>
            <h2>${esc(cand.name)}${cand.classroom ? ` <small>${esc(cand.classroom)}</small>` : ""}</h2>
            <button type="button" data-act="step" data-step="1" aria-label="Candidat suivant" ${idx < 0 || idx === visible.length - 1 ? "disabled" : ""}>→</button>
          </div>
          <div class="ce-actions"><button type="button" data-act="edit-candidate" data-id="${esc(cand.id)}">${W.SITUATIONS[cand.situation||'present']} · Modifier</button>${!prepScope?`<button type="button" data-act="passage" aria-pressed="${!!ui.passage}">${ui.passage?'Quitter le mode Passage':'Mode Passage'}</button>`:''}<button type="button" data-act="undo-input"${lastInput?.ep===ep.id&&lastInput?.cand===cand.id&&lastInput.after===JSON.stringify(ev)?'':' disabled'}>Annuler la dernière saisie</button></div>
          ${!W.eligible(cand)?'<p class="ce-warn">Situation particulière : les notes sont conservées. Réactive « À évaluer » pour reprendre le passage.</p>':''}
          ${lockBar}
          ${preBar}
          ${fixedChoices ? choiceLine : `${choice("theme", THEMES, "Thème")}
          ${choice("split", {"4-4":"4-4", "6-2":"6-2", "2-6":"2-6"}, "AFL2-AFL3")}
          ${choice("role", {partenaire:"Partenaire", juge:"Juge"}, "Rôle")}
          ${allSet && !prepScope ? `<button type="button" class="ce-link" data-act="edit-choices">✓ Terminé</button>` : ""}`}
        </div>
        ${groups}
        ${prepScope ? `<div class="ce-card">
          <button type="button" class="ce-primary ce-wide" data-act="step" data-step="1"${idx < 0 || idx === visible.length - 1 ? " disabled" : ""}>Élève suivant →</button>
        </div>
        <div class="ce-total">
          <span>AFL2 <b>${part(s.afl2, s.afl2p)}</b>/${SPLITS[ev.split]?.[0] ?? "?"}</span>
          <span>AFL3 <b>${part(s.afl3, s.afl3p)}</b>/${SPLITS[ev.split]?.[1] ?? "?"}</span>
          <strong>${scopeProgress(ev, "prep").state === "complete" ? "✓ Préparation complète" : "Préparation " + scopeProgress(ev, "prep").filled + "/6"}</strong>
        </div>` : `<div class="ce-card">
          ${!locked && C.missingFields(ev).length?`<p class="ce-hint">À compléter : ${C.missingFields(ev).map(esc).join(', ')}.</p>`:''}
          ${locked ? "" : `<button type="button" class="ce-primary ce-wide" data-act="finish">✔ Terminer mon évaluation</button>`}
          <details class="ce-more"${ev.comment ? " open" : ""}><summary>💬 Remarque${ev.comment ? " (1)" : ""}</summary>
            <textarea data-field="comment" rows="2" aria-label="Remarque"${locked ? " readonly" : ""}>${esc(ev.comment)}</textarea></details>
          <button type="button" class="ce-link" data-act="single-qr">📱 QR de ce candidat</button>
        </div>
        <div class="ce-total">
          <span>AFL1 <b>${part(s.afl1, s.afl1p)}</b>/12</span>
          <span>AFL2 <b>${part(s.afl2, s.afl2p)}</b>/${SPLITS[ev.split]?.[0] ?? "?"}</span>
          <span>AFL3 <b>${part(s.afl3, s.afl3p)}</b>/${SPLITS[ev.split]?.[1] ?? "?"}</span>
          <strong>${s.complete ? fmt(s.total) + " / 20" : ev.split ? fmt(s.partial) + " / 20 · incomplet" : "Choisir la répartition"}</strong>
          <small>AFL1 ${scopeProgress(ev, "afl1").filled}/6</small>
        </div>`}
      </section>
    </div>`;
  }

  /* Curseur par critère : ses crans sont les points de chaque degré, degré après degré.
     Une valeur commune à deux degrés (ex. 0,25 en D1 et en D2) donne deux crans distincts.
     La note est enregistrée au relâchement ; pendant le glissement, seul l'affichage change. */
  /* Les descriptions restent visibles au-dessus du curseur, sans boutons de points. */
  function degBoxes(crit, desc, deg) {
    return `<div class="ce-degs ce-degpts">${crit.deg.map((range, i) => {
      const d = i + 1;
      const name = crit.names ? crit.names[i] : "Degré " + d;
      return `<div class="ce-degbox d${d}${deg === d ? " on" : ""}" data-d="${d}">
        <b>${esc(name)}</b><span class="ce-degbox-desc">${esc(desc[i])}</span></div>`;
    }).join("")}</div>`;
  }

  function sliderSteps(crit) {
    const steps = [];
    crit.deg.forEach((range, i) => C.stepsOf(range).forEach(v => steps.push({d:i + 1, v})));
    return steps;
  }

  /* Chaque degré occupe un quart de la piste, sous sa case ; ses crans y sont répartis. */
  function sliderPositions(steps) {
    return steps.map(st => {
      const own = steps.filter(x => x.d === st.d);
      const j = own.indexOf(st);
      return Math.round(((st.d - 1) + (j + .5) / own.length) / 4 * 1000);
    });
  }

  const stepText = (crit, st) => `${crit.names ? crit.names[st.d - 1] : "D" + st.d} · ${fmt(st.v)}`;

  function sliderHTML(crit, ev, value, deg, desc, recheck, locked) {
    const steps = sliderSteps(crit);
    const idx = value != null ? steps.findIndex(st => st.d === deg && st.v === value) : -1;
    const P = sliderPositions(steps);
    const pos = k => P[k] / 10;
    const colors = ["var(--ce-d1)", "var(--ce-d2)", "var(--ce-d3)", "var(--ce-d4)"];
    const gradient = `linear-gradient(90deg,${colors.map((c, i) => `${c} ${i * 25}%,${c} ${(i + 1) * 25}%`).join(",")})`;
    const cur = idx >= 0 ? steps[idx] : null;
    return `<div class="ce-crit ce-slide-crit${value != null ? " filled" : ""}" data-crit="${crit.id}">
      <div class="ce-crit-head"><b>${esc(crit.label)}</b><span><strong class="ce-slide-val">${cur ? esc(stepText(crit, cur)) : "à noter"}</strong> /${crit.max}</span></div>
      ${recheck}
      ${degBoxes(crit, desc, deg)}
      <div class="ce-slide${cur ? ` d${cur.d}` : " unset"}">
        <div class="ce-slide-track" style="background:${gradient}">${steps.map((st, k) => `<span class="ce-tick" style="left:${pos(k)}%"></span>`).join("")}</div>
        <div class="ce-slide-pts" aria-hidden="true">${steps.map((st, k) => `<span class="d${st.d}${k === idx ? " on" : ""}" data-k="${k}" style="left:${pos(k)}%">${fmt(st.v)}</span>`).join("")}</div>
        <input type="range" class="ce-slider" min="0" max="1000" step="1" value="${P[idx >= 0 ? idx : 0]}" data-crit="${crit.id}" data-idx="${idx >= 0 ? idx : 0}"
          data-pos="${P.join(",")}" data-steps="${steps.map(st => st.d + ":" + st.v).join(",")}" aria-label="${esc(crit.label)}" aria-valuetext="${cur ? esc(stepText(crit, cur)) + " point(s)" : "non noté"}"${locked ? " disabled" : ""}>
      </div>
    </div>`;
  }

  /* Cale le curseur sur le cran le plus proche ; renvoie son degré et ses points. */
  function sliderSnap(input) {
    const P = input.dataset.pos.split(",").map(Number);
    let best = 0;
    P.forEach((p, k) => { if (Math.abs(p - input.value) < Math.abs(P[best] - input.value)) best = k; });
    input.dataset.idx = best;
    input.value = P[best];
  }

  const sliderStep = input => {
    const [d, v] = input.dataset.steps.split(",")[Number(input.dataset.idx)].split(":");
    return {d:Number(d), v:Number(v)};
  };

  /* Clavier : une flèche = un cran (la piste est découpée en 1000 unités). */
  function sliderKey(input, key) {
    const P = input.dataset.pos.split(",");
    const k = Number(input.dataset.idx);
    const next = {ArrowLeft:k - 1, ArrowDown:k - 1, ArrowRight:k + 1, ArrowUp:k + 1, Home:0, End:P.length - 1, PageDown:k - 1, PageUp:k + 1}[key];
    if (next == null) return false;
    input.dataset.idx = Math.max(0, Math.min(P.length - 1, next));
    input.value = P[input.dataset.idx];
    return true;
  }

  /* Pendant le glissement : met à jour l'affichage sans enregistrer. */
  function sliderPreview(input, snapped) {
    if (!snapped) sliderSnap(input);
    const box = input.closest(".ce-slide-crit");
    const crit = C.critById(input.dataset.crit);
    const st = sliderStep(input);
    box.querySelector(".ce-slide-val").textContent = stepText(crit, st);
    // La case du degré visé s'allume, et son point aussi.
    box.querySelectorAll(".ce-degbox").forEach(b => b.classList.toggle("on", Number(b.dataset.d) === st.d));
    box.querySelectorAll(".ce-slide-pts span").forEach(sp => sp.classList.toggle("on", sp.dataset.k === input.dataset.idx));
    const slide = box.querySelector(".ce-slide");
    slide.className = `ce-slide d${st.d}`;
    input.setAttribute("aria-valuetext", stepText(crit, st) + " point(s)");
  }

  /* Au relâchement (ou au clavier) : enregistre degré et note. */
  function sliderCommit(input) {
    const ep = active();
    const ev = evalOf(ep, currentId);
    const st = sliderStep(input);
    if (ev.v[input.dataset.crit] === st.v && ev.d[input.dataset.crit] === st.d) return;
    setValue(ep, input.dataset.crit, st.d, st.v);
    const y = window.scrollY;
    render();
    window.scrollTo({top:y});
  }

  /* Place la fiche de l'élève en haut de l'écran : l'AFL1 se note sans défiler. */
  function scrollToSheet() {
    const head = document.querySelector(".ce-cand-head");
    if (head) window.scrollTo({top:Math.max(0, head.getBoundingClientRect().top + window.scrollY - 6)});
  }

  function critHTML(crit, ev, locked) {
    const value = ev.v[crit.id];
    const deg = C.degreeOf(crit, value, ev.d[crit.id]);
    const desc = C.descOf(crit, ev.role);
    const recheck = ev.recheck?.[crit.id] ? `<p class="ce-warn">⚠️ Rôle changé : vérifie cette note.</p>` : "";
    if (!desc) {
      return `<div class="ce-crit"><div class="ce-crit-head"><b>${esc(crit.label)}</b><span>${value != null ? `<strong>${fmt(value)}</strong>` : "—"} /${crit.max}</span></div>
        <p class="ce-hint">Choisis d'abord le rôle AFL3 (partenaire ou juge) en haut de la fiche.</p></div>`;
    }
    return sliderHTML(crit, ev, value, deg, desc, recheck, locked);
  }

  /* Harmonisation : les descriptions accompagnent toujours le choix du degré. */
  function degButtons(crit, desc, selected, act, dis) {
    return `<div class="ce-degs">${crit.deg.map(([a, b], i) => `<button type="button" class="ce-deg d${i + 1}${selected === i + 1 ? " on" : ""}" data-act="${act}" data-crit="${crit.id}" data-deg="${i + 1}" aria-pressed="${selected === i + 1}"${desc[i] ? ` title="${esc(desc[i])}"` : ""}${dis}>
      <b>${crit.names ? crit.names[i] : "Degré " + (i + 1)} <small>${a === b ? fmt(a) : fmt(a) + "–" + fmt(b)}</small></b><span>${esc(desc[i])}</span></button>`).join("")}</div>`;
  }

  /* Critère évalué avant l'épreuve par le collègue : affichage compact, non modifiable ici. */
  function preCritHTML(crit, ev) {
    const v = ev.v[crit.id];
    const d = C.degreeOf(crit, v, ev.d[crit.id]);
    return `<div class="ce-crit filled ce-crit-pre"><div class="ce-crit-head"><b>${esc(crit.label)}</b><span>🗂️ ${dot(crit, d)} <strong>${fmt(v)}</strong> /${crit.max}</span></div>
      </div>`;
  }

  /* Modification d'une fiche déjà terminée une fois : consignée, sans toucher à la version initiale. */
  function logEdit(ep, cand, ev, field, from, to) {
    if (!ev.initial || from === to) return;
    log(ep, {type:"eval-edit", cand:cand.id, candName:cand.name, field, from:String(from ?? ""), to:String(to ?? "")});
  }

  function setValue(ep, critId, deg, value) {
    const cand = candById(ep, currentId);
    const ev = evalOf(ep, currentId);
    if (!W.eligible(cand) || ev.done || (ev.pre && !ev.pre.unlocked && ev.pre.crits.includes(critId))) return;
    const previous = C.clone(ev);
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
    rememberInput(ep, cand, previous, ev);
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
        ${roleOf(ep) === "prof" && missing.some(m => ["Thème", "Répartition AFL2/AFL3", "Rôle AFL3", ...C.PREP_CRITS.map(id => C.critById(id).label)].includes(m))
          ? `<p class="ce-hint">Thème, répartition, rôle et AFL2/AFL3 se complètent dans « 1 · Préparer ».</p>` : ""}
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

  function receiveHTML(ep, title = "📥 Recevoir") {
    const others = ep ? Object.entries(ep.others) : [];
    const missingOf = parts => parts ? Array.from({length:parts.total}, (_, i) => i + 1).filter(n => !parts.got.includes(n)) : [];
    const received = others.map(([name, o]) => {
      const rows = Object.values(o.rows).filter(C.isFilled);
      const missing = missingOf(o.parts);
      return `<li><b>${esc(name)}</b> · ${rows.length} fiche(s)
        ${missing.length ? `<span class="ce-warn">⚠️ QR manquants : ${missing.join(", ")}</span>` : `<span class="ce-ok-text">✓</span>`}
        <button type="button" data-act="receipt" data-name="${esc(name)}">Confirmer la réception</button>
        <button type="button" class="ce-link" data-act="drop-other" data-name="${esc(name)}">Retirer</button></li>`;
    }).join("");
    let prep = "";
    if (ep?.prepFrom) {
      const missing = missingOf(ep.prepFrom.parts);
      prep = `<li>🗂️ Préparation de <b>${esc(ep.prepFrom.by)}</b>
        ${missing.length ? `<span class="ce-warn">⚠️ QR manquants : ${missing.join(", ")}</span>` : `<span class="ce-ok-text">✓</span>`}</li>`;
    }
    return `<section class="ce-card">
      <h2>${title}</h2>
      <div class="ce-camera"><video id="ceVideo" playsinline muted class="hidden"></video></div>
      <p id="ceCamStatus" class="ce-hint" aria-live="polite"></p>
      <div class="ce-actions">
        <button type="button" class="ce-primary" data-act="scan">📷 Scanner le QR du collègue</button>
      </div>
      <p class="ce-hint">Côte à côte : QR. À distance : fichier ou code.</p><details class="ce-more"><summary>Fichier ou code pour un envoi à distance</summary>
        <div class="ce-actions"><label class="ce-button">📂 Importer un fichier<input id="ceFile" type="file" accept=".json,application/json" hidden></label></div>
        <textarea id="cePaste" rows="3" placeholder="…ou colle ici le code COEVAL1:…" aria-label="Code à coller"></textarea>
        <button type="button" data-act="paste">Valider le code</button>
      </details>
      ${prep || others.length ? `<ul class="ce-received">${prep}${received}</ul>` : ""}
    </section>`;
  }

  const backupHTML = ep => `<details class="ce-card ce-more ce-backup"><summary>💾 Sauvegarde${unsaved(ep) ? ` <span class="ce-warn">· copie de secours à actualiser</span>` : ep.backupAt ? ` <small>· ${when(ep.backupAt)}</small>` : ""}</summary>
      <p class="ce-hint">Enregistrement automatique sur cet appareil. La copie de secours contient fiches, évaluations reçues, décisions et historique. ${ep.backupAt?`Dernière copie confirmée : ${when(ep.backupAt)}.`:"Aucune copie de secours confirmée."}</p>
      <div class="ce-actions">
        <button type="button" class="ce-primary" data-act="backup">💾 Sauvegarder l’épreuve</button><button type="button" data-act="backup-download">Télécharger directement</button>
        <label class="ce-button">📂 Restaurer une sauvegarde<input id="ceRestore" type="file" accept=".json,application/json" hidden></label>
      </div>
    </details>`;

  /* Co-évaluateur · 1 · Recevoir la préparation du professeur. */
  function renderShare(main, ep) {
    if (!ep) {
      main.innerHTML = `<div class="ce-share">${receiveHTML(null, "📥 Recevoir la préparation")}
        <section class="ce-card"><p>Scanne le QR de <b>préparation</b> du professeur : la classe, les répartitions et l'AFL2/AFL3 arrivent ; il te restera l'AFL1.</p>
          <button type="button" class="ce-link" data-act="new-epreuve">Je suis plutôt le professeur de la classe</button></section></div>`;
      return;
    }
    const pf = ep.prepFrom;
    main.innerHTML = `<div class="ce-share">
      ${receiveHTML(ep, "📥 Recevoir la préparation")}
      <section class="ce-card">
        <h2>${pf ? "✓ Préparation reçue" : "En attente de la préparation"}</h2>
        <p>${pf ? `De <b>${esc(pf.by)}</b> : ${ep.candidates.length} élève(s), ${C.prepReady(ep)} avec répartition et AFL2/AFL3.` : "Demande au professeur de te montrer son QR « Transmettre au co-évaluateur »."}</p>
        ${pf ? `<button type="button" class="ce-primary" data-act="go-tab" data-tab="eval">Étape suivante : 2 · Évaluer l'AFL1 →</button>` : ""}
      </section>
    </div>`;
  }

  /* Co-évaluateur · 3 · Envoyer mon évaluation au professeur. */
  function renderSend(main, ep) {
    const parts = ep.candidates.length ? C.qrParts(ep, db.me) : [];
    shareIndex = Math.min(shareIndex, Math.max(0, parts.length - 1));
    const done = ep.candidates.filter(c => C.get(ep.mine, c.id)?.done).length;
    main.innerHTML = `<div class="ce-share">
      <section class="ce-card">
        <h2>📤 Envoyer mon évaluation au professeur</h2>
        <p class="${done < ep.candidates.length ? "ce-warn" : "ce-ok-text"}">${done} fiche(s) terminée(s) sur ${ep.candidates.length}.</p>
        <p class="ce-hint">Le professeur scanne ${parts.length > 1 ? `les ${parts.length} QR, dans n'importe quel ordre,` : "ce QR"} dans son onglet « 3 · Croiser ».</p>
        ${qrBlock(parts, shareIndex, "qr-step")}
        <p class="ce-hint">Côte à côte : QR. À distance : fichier ou code.</p><details class="ce-more"><summary>Fichier ou code pour un envoi à distance</summary>
          <div class="ce-actions"><button type="button" data-act="download">💾 Fichier (avec remarques)</button><button type="button" data-act="copy-code">📋 Copier le code</button></div>
        </details>
      </section>
      <section class="ce-card"><h2>Confirmation du collègue</h2>${ep.lastExport?`<p>Dernier ${ep.lastExport.method==='shared'?'partage effectué':'téléchargement demandé'} : ${when(ep.lastExport.at)}${ep.lastExport.fingerprint!==W.fingerprint(ep)?' · notes modifiées depuis':''}.</p>`:''}<p>Afficher ou exporter les QR ne confirme pas leur réception.</p>${(ep.receipts||[]).map(r=>`<p>${esc(r.by)} · ${when(r.at)} · ${r.fingerprint===W.fingerprint(ep)?'version actuelle reçue':'notes modifiées depuis ce reçu'}</p>`).join('')}${receiveHTML(ep,'Recevoir un accusé de réception')}</section>
      ${backupHTML(ep)}
    </div>`;
  }

  /* Professeur : transmettre la préparation (fenêtre, depuis « Préparer »). */
  function openPrepShare(ep) {
    const parts = ep.candidates.length ? C.prepParts(ep, db.me) : [];
    prepIndex = Math.min(prepIndex, Math.max(0, parts.length - 1));
    const ready = C.prepReady(ep);
    openDialog(`<div class="ce-prepshare"><h2>📤 Transmettre au co-évaluateur</h2>
      <p>La classe, les répartitions, le thème, le rôle et l'AFL2/AFL3 — <b>jamais tes notes AFL1</b>.</p>
      <p class="${ready < ep.candidates.length ? "ce-warn" : "ce-ok-text"}">${ready} élève(s) prêt(s) sur ${ep.candidates.length}${ready < ep.candidates.length ? " : les autres partent incomplets" : " ✓"}.</p>
      <p class="ce-hint">Le co-évaluateur choisit « Je suis co-évaluateur » puis scanne ${parts.length > 1 ? "les QR, dans n'importe quel ordre" : "ce QR"}.</p>
      ${qrBlock(parts, prepIndex, "prep-step")}
      <p class="ce-hint">Côte à côte : QR. À distance : fichier ou code.</p><details class="ce-more"><summary>Fichier ou code pour un envoi à distance</summary>
        <div class="ce-actions"><button type="button" data-act="prep-download">💾 Fichier</button><button type="button" data-act="prep-copy">📋 Copier le code</button></div>
      </details>
      <div class="ce-actions"><button value="close" class="ce-primary">Fermer</button></div></div>`);
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
              if (res.pending) { stopCamera?.(); stopCamera = null; return; }
              if (res.done) { stopCamera?.(); stopCamera = null; render(); toast(res.message); return; }
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
    if (String(text).startsWith('COEVAL-ACK:')) {
      try { return receiveReceipt(JSON.parse(text.slice(11))); } catch(e) { return {done:false,message:'Accusé illisible.'}; }
    }
    const parsed = C.parseCodes(text);
    if (parsed.error) return {done:false, message:parsed.error};
    return previewExchange(parsed.payloads, parsed.payloads[0].title);
  }
  function receiveReceipt(receipt) {
    try {
      if(!active()) throw new Error('Ouvre l’épreuve concernée.');
      W.acceptReceipt(active(),receipt,db.me); save(); render();
      const message='Réception confirmée par '+receipt.by+'.';toast(message);return {done:true,message};
    } catch(e) {toast(e.message);return {done:false,message:e.message};}
  }

  async function downloadJSON(name, data, title, forceDownload = false) {
    const blob = new Blob([JSON.stringify(data)], {type:"application/json"});
    const file = new File([blob], name, {type:"application/json"});
    if (!forceDownload && navigator.canShare?.({files:[file]})) {
      try { await navigator.share({files:[file], title}); return 'shared'; }
      catch (e) { toast(e.name === 'AbortError' ? 'Partage annulé : aucune copie de secours confirmée.' : 'Partage impossible. Réessaie ou utilise un navigateur permettant le téléchargement.'); return 'cancelled'; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return 'download';
  }

  const slug = s => normName(s).replace(/ /g, "-");

  async function download(ep) {
    const fingerprint=W.fingerprint(ep);
    const result=await downloadJSON(`coeval_${slug(ep.title)}_${slug(db.me)}.json`, C.exportFile(ep, db.me), ep.title);
    if(result!=='cancelled'){ep.lastExport={at:Date.now(),method:result,fingerprint};save();render();toast(result==='shared'?'Évaluation partagée. La réception reste à confirmer.':'Téléchargement demandé. Transmets le fichier au collègue.');}
  }

  async function backup(ep, forceDownload = false) {
    const data = C.makeBackup(ep, db.me), hash = C.contentHash(ep);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const result = await downloadJSON(`sauvegarde_${slug(ep.title)}_${slug(db.me)}_${stamp}.json`, data, ep.title, forceDownload);
    if (result === 'cancelled') return;
    if (result === 'shared') { ep.backupAt = data.savedAt; ep.backupHash = hash; save(); }
    render();
    if(result === 'download') {
      pendingBackup={epId:ep.id,hash,at:data.savedAt};
      openDialog(`<h2>Vérifier la copie de secours</h2><p>Le téléchargement a été demandé. Vérifie que le fichier JSON existe et est conservé en lieu sûr avant de confirmer.</p><div class="ce-actions"><button type="button" data-act="confirm-backup">J’ai vérifié le fichier</button><button value="close">Pas encore</button></div>`);
    }
    toast(result === 'shared' ? 'Partage effectué. Vérifie que le fichier est conservé en lieu sûr.' : 'Téléchargement demandé. Vérifie le fichier dans tes téléchargements ; sa conservation ne peut pas être confirmée ici.');
  }

  /* Un seul bouton d'import : fichier d'échange d'un collègue ou sauvegarde complète. */
  function importFile(file) {
    readTextFile(file, text => {
      let d;
      try { d = JSON.parse(text); } catch (e) { toast("Fichier non reconnu."); return; }
      if (d?.type === "coeval-receipt") { receiveReceipt(d); return; }
      if (d?.type === "coeval-backup") { openRestore(d); return; }
      if (d?.type !== "coeval-musculation" && d?.type !== "coeval-preparation") { toast("Fichier non reconnu."); return; }
      previewExchange([C.fileToPayload(d)], d.title);
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
      if (!confirm(`Remplacer « ${t?.title} » par la sauvegarde ? Une copie de l’épreuve actuelle sera conservée dans la corbeille.`)) return;
    }
    const replaced=mode==="replace" ? C.clone(db.epreuves.find(e=>e.id===targetId)) : null;
    const res = C.restoreBackup(db, pendingRestore, {mode, targetId}, db.me);
    if (res.error) { toast(res.error); return; }
    if(replaced){replaced.id=C.uid();replaced.title+=" · avant restauration";(db.trash ||= []).push(replaced);}
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
    const validated = count(x => x.r.validated);
    const todo = count(x => W.eligible(x.c) && C.needsAction(x.r));
    const majors = count(x => st(x) === "major");
    const ready = C.accordReady(ep, db.me);
    const chip = (filter, num, label, tone) => num ? `<button type="button" class="ce-fchip ${tone}${crossFilter === filter ? " on" : ""}" data-act="filter" data-filter="${filter}" aria-pressed="${crossFilter === filter}">
      <b>${num}</b> ${label}</button>` : "";
    const filters = {
      all:() => true, todo:x => W.eligible(x.c) && C.needsAction(x.r), validated:x => !!x.r.validated,
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
      const detail = degCount > 1 ? ` <small>×${degCount}</small>` : "";
      const note = r.validated
        ? `<b class="ce-validated">✅ ${fmt(r.total)}</b>${r.stale ? "<small>⚠️ à revoir</small>" : ""}`
        : r.total != null ? `<span class="ce-prov" title="Note provisoire">${fmt(r.total)}</span>`
        : `<span class="ce-prov">—</span>`;
      return `<tr data-act="cross-open" data-id="${esc(c.id)}">
        <td><b>${esc(c.name)}</b>${c.classroom ? ` <small>${esc(c.classroom)}</small>` : ""}</td>
        <td>${!W.eligible(c)?`<span class="ce-tag">${W.SITUATIONS[c.situation]||"Situation particulière"}</span>`:tag(r.h.status)}${detail}</td>
        <td class="num ce-note">${note}</td>
        ${r.entries.map(cellOf).join("")}
        <td class="num${gap >= 2 ? " ce-big-gap" : ""}">${fmt(gap)}</td></tr>`;
    }).join("");
    const receive = Object.keys(ep.others).length
      ? `<details class="ce-card ce-more"><summary>📥 Recevoir ou mettre à jour l'évaluation du co-évaluateur</summary>${receiveHTML(ep, "")}</details>`
      : receiveHTML(ep, "📥 Recevoir l'évaluation du co-évaluateur");
    main.innerHTML = `${receive}<section class="ce-card">
      <div class="ce-cross-head"><h2>Croisement</h2><span class="ce-hint">${validated}/${n} notes validées</span></div>
      <div class="ce-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${validated}">
        <div style="width:${n ? validated / n * 100 : 0}%"></div></div>
      ${names.length < 2 ? `<p class="ce-warn">Rien reçu du co-évaluateur : scanne son QR ci-dessus.</p>` : ""}
      <div class="ce-actions ce-cross-actions">
        ${todo ? `<button type="button" class="ce-primary" data-act="queue-start">▶ Harmoniser les ${todo} cas</button>` : ""}
        ${ready.length ? `<button type="button" data-act="bulk-accords">✅ Valider les ${ready.length} accord(s)</button>` : ""}
        ${validated ? `<button type="button" data-act="pv">📄 Procès-verbal</button>` : ""}
      </div>
      <div class="ce-fchips">
        ${chip("todo", todo, "⚠️ À harmoniser", "bad")}
        ${chip("degree", count(filters.degree), majors ? `≠ Degré (‼ ${majors})` : "≠ Degré", "bad")}
        ${chip("choices", count(filters.choices), "⇄ Choix", "bad")}
        ${chip("points", count(x => st(x) === "points"), "≈ Écart", "mid")}
        ${chip("accord", count(x => st(x) === "accord"), "✓ Accord", "ok")}
        ${chip("incomplete", count(x => st(x) === "incomplete"), "… Incomplets", "wait")}
        ${chip("validated", validated, "✅ Validés", "ok")}
      </div>
      <div class="ce-table"><table>
        <thead><tr><th>Candidat</th><th>État</th><th class="num">Note</th>${names.map(nm => `<th class="num">${esc(nm)}</th>`).join("")}<th class="num">Écart</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${names.length + 4}" class="ce-hint">Aucun candidat pour ce filtre.</td></tr>`}</tbody></table></div>
      <details class="ce-more"><summary>Bilan, exports, impression</summary>
        <div class="ce-actions">
          <button type="button" data-act="stats">📊 Bilan du jury</button>
          <button type="button" data-act="csv">⬇️ CSV synthèse</button>
          <button type="button" data-act="csv-detail">⬇️ CSV détaillé (degrés)</button>
          <button type="button" data-act="csv-history">⬇️ Historique des décisions</button>
          <button type="button" data-act="print-sheets">🖨️ Fiches par candidat</button><button type="button" data-act="feedback">Rédiger les retours aux élèves</button><button type="button" data-act="print-feedback">Imprimer les retours aux élèves</button>
          <button type="button" data-act="pv">📄 Procès-verbal</button>
          <button type="button" data-act="print">🖨️ Ce tableau</button>
          <button type="button" data-act="backup">💾 Sauvegarder l'épreuve</button>
          <label class="ce-button">📂 Restaurer une sauvegarde<input id="ceRestore" type="file" accept=".json,application/json" hidden></label>
          <label class="ce-inline">Ordre <select id="ceSort"><option value="name"${crossSort === "name" ? " selected" : ""}>alphabétique</option><option value="priority"${crossSort === "priority" ? " selected" : ""}>par priorité</option></select></label>
        </div>
      </details>
    </section>`;
  }

  /* =========================
     3 · CROISER — harmonisation d'un candidat
  ========================= */

  function detailNav(ep, cand) {
    const idx = ep.candidates.indexOf(cand);
    return `<div class="ce-nav">
        <button type="button" data-act="cross-back">← Tableau</button>
        <button type="button" data-act="cross-step" data-step="-1" aria-label="Candidat précédent" ${idx <= 0 ? "disabled" : ""}>←</button>
        <h2>${esc(cand.name)}${cand.classroom ? ` <small>${esc(cand.classroom)}</small>` : ""}</h2>
        <button type="button" data-act="cross-step" data-step="1" aria-label="Candidat suivant" ${idx === ep.candidates.length - 1 ? "disabled" : ""}>→</button>
      </div>`;
  }

  /* Récapitulatif d'un élève : évaluation de chaque enseignant, note retenue et son origine,
     décisions prises. Sert à l'écran et sur la fiche imprimée. */
  function recapBodyHTML(ep, cand, r) {
    const {h, entries} = r;
    const ev = r.ev;
    const present = entries.map((x, i) => ({...x, i})).filter(x => x.ev);
    const history = (ep.history || []).filter(e => e.cand === cand.id);
    const lastDecision = id => history.filter(e => e.type === "decision" && e.crit === id).pop();
    const origin = cr => {
      const st = h.crits[cr.id];
      if (st.source === "jury") { const d = lastDecision(cr.id); return `⚖️ Décision du jury${d?.by ? ` (${esc(d.by)})` : ""}`; }
      if (st.source === "moyenne") return st.gap ? "≈ Moyenne (même degré)" : "✓ Accord";
      if (st.source === "unique") return "Seule note";
      return st.mustDecide ? "⚠️ À trancher" : "—";
    };
    const head = `<tr><th>Critère</th><th>Retenu</th>${present.map(x => `<th>${esc(x.name)}</th>`).join("")}</tr>`;
    const short = {theme:THEMES, split:{"4-4":"4-4", "6-2":"6-2", "2-6":"2-6"}, role:{partenaire:"Partenaire", juge:"Juge"}};
    const choiceRows = Object.entries(CHOICE_FIELDS).map(([f, meta]) => {
      const c = h.choices[f];
      return `<tr class="${c.differ ? "ce-row-bad" : ""}"><td>${meta.label}</td>
        <td><b>${esc(short[f][ev[f]] || "—")}</b>${c.differ ? `<small>${c.decided ? "⚖️ Décision du jury" : "⚠️ À trancher"}</small>` : ""}</td>
        ${present.map(x => `<td>${esc(short[f][x.ev[f]] || "—")}</td>`).join("")}</tr>`;
    }).join("");
    let last = "";
    const critRows = GRID.map(cr => {
      const st = h.crits[cr.id];
      const group = cr.group !== last ? `<tr class="ce-group-row"><td colspan="${present.length + 2}">${esc(cr.afl === "AFL1" ? "AFL1 · " + cr.group : cr.group)}</td></tr>` : "";
      last = cr.group;
      const v = ev.v[cr.id];
      const d = v != null ? C.degreeOf(cr, v, ev.d?.[cr.id]) : 0;
      const cls = ["major", "degree"].includes(st.status) ? "ce-row-bad" : st.status === "points" ? "ce-row-mid" : "";
      return `${group}<tr class="${cls}"><td>${esc(cr.label)} <small>/${cr.max}</small></td>
        <td><b>${v != null ? `${dot(cr, d)} ${fmt(v)}` : "—"}</b><small>${origin(cr)}</small></td>
        ${present.map(x => { const m = st.marks[x.i]; return `<td>${m ? `${dot(cr, m.d)} ${fmt(m.v)}` : "—"}</td>`; }).join("")}</tr>`;
    }).join("");
    const s = r.validated || h.scores;
    const [w2, w3] = SPLITS[ev.split] || [];
    const totalRow = (label, key, max) => `<tr class="ce-sum"><td>${label}</td><td><b>${fmt(s[key])}</b>${max ? ` / ${max}` : ""}</td>${present.map(x => `<td>${fmt(C.scores(x.ev)[key])}</td>`).join("")}</tr>`;
    const remarks = present.filter(x => x.ev.comment).map(x => `<p class="ce-remark"><b>${esc(x.name)} :</b> ${esc(x.ev.comment)}</p>`).join("");
    const step = e => {
      const cr = e.crit ? C.critById(e.crit) : null;
      const what = cr ? ` · ${esc(cr.label)}` : e.field ? ` · ${esc(CHOICE_FIELDS[e.field]?.label || e.field)}` : "";
      let detail = "";
      if (e.type === "decision") detail = ` : <b>${cr ? esc(C.degreeName(cr, e.deg)) : "D" + e.deg} · ${fmt(e.v)}</b>${e.initial ? `<br><small>Notes initiales — ${esc(e.initial)}</small>` : ""}`;
      else if (e.type === "choice" || e.type === "eval-edit") detail = ` : ${esc(e.from || "—")} → <b>${esc(e.to || "—")}</b>`;
      else if (e.type === "validate") detail = ` : <b>${fmt(e.total)} / 20</b>${e.bulk ? " (validation groupée des accords)" : ""}`;
      else if (e.type === "unvalidate" || e.type === "decision-reset") detail = e.from ? ` (était ${esc(e.from)})` : "";
      else if (e.type === "eval-done" && e.total != null) detail = ` : ${fmt(e.total)} / 20`;
      return `<li><small>${when(e.at)}${e.by ? ` · ${esc(e.by)}` : ""}</small><span>${HISTORY_TYPES[e.type] || esc(e.type)}${what}${detail}</span></li>`;
    };
    return `<div class="ce-table"><table class="ce-recap"><thead>${head}</thead><tbody>
        <tr class="ce-group-row"><td colspan="${present.length + 2}">Choix de l'élève</td></tr>${choiceRows}
        ${critRows}
        ${totalRow("AFL1", "afl1", 12)}${totalRow("AFL2", "afl2", w2)}${totalRow("AFL3", "afl3", w3)}${totalRow("Total", "total", 20)}
      </tbody></table></div>
      ${remarks ? `<h3>Remarques</h3>${remarks}` : ""}
      <h3>Décisions et étapes</h3>
      ${history.length ? `<ul class="ce-timeline">${history.map(step).join("")}</ul>` : `<p class="ce-hint">Aucune décision enregistrée sur cet appareil : la note retenue découle des évaluations (accords et moyennes).</p>`}`;
  }

  function renderRecap(main, ep, cand, r) {
    const noteLine = r.validated
      ? `<div class="ce-final ok">✅ <b>Note validée : ${fmt(r.total)} / 20</b><small>le ${when(r.validated.at)} par ${esc(r.validated.by)}</small></div>
         ${r.stale ? `<p class="ce-warn">⚠️ Des évaluations ont changé depuis la validation.</p>` : ""}`
      : `<div class="ce-final">📝 Note provisoire : <b>${r.h.scores.total != null ? fmt(r.h.scores.total) + " / 20" : "incomplète"}</b> <small>non validée</small></div>`;
    main.innerHTML = `<section class="ce-card ce-hsum ce-recap-head">
      ${detailNav(ep, cand)}
      <p class="ce-sumline">📋 Récapitulatif ${tag(r.h.status)}</p>
      ${noteLine}
      <div class="ce-actions">
        <button type="button" data-act="print-one">🖨️ Imprimer la fiche</button>
        ${r.validated ? `<button type="button" data-act="unvalidate">✏️ Modifier la note</button>`
          : `<button type="button" class="ce-primary" data-act="detail-mode" data-mode="harmo">⚖️ Harmoniser</button>`}
      </div>
    </section>
    <section class="ce-card">${recapBodyHTML(ep, cand, r)}</section>`;
  }

  function renderCrossDetail(main, ep, cand) {
    const r = C.retainedFor(ep, cand, db.me);
    if ((detailMode ?? (r.validated ? "recap" : "harmo")) === "recap") { renderRecap(main, ep, cand, r); return; }
    const {h, entries} = r;
    const locked = !!r.validated;
    const totals = entries.map(x => x.ev ? C.scores(x.ev).total : null);
    const known = totals.filter(t => t != null);
    const gap = known.length > 1 ? Math.max(...known) - Math.min(...known) : null;
    const nDeg = GRID.filter(cr => ["major", "degree"].includes(h.crits[cr.id].status)).length;
    const nDiv = h.divergences;
    const shownEv = r.ev;

    const evaluators = entries.filter(x => x.ev).map(x => `${esc(x.name)} <b>${fmt(C.scores(x.ev).total)}</b>`).join(" · ");
    const comments = entries.filter(x => x.ev?.comment).map(x => `<p class="ce-remark"><b>${esc(x.name)} :</b> ${esc(x.ev.comment)}</p>`).join("");
    const noteLine = r.validated
      ? `<div class="ce-final ok">✅ <b>Note validée : ${fmt(r.total)} / 20</b><small>le ${when(r.validated.at)} par ${esc(r.validated.by)}</small></div>
         ${r.stale ? `<p class="ce-warn">⚠️ Des évaluations ont changé depuis la validation : la note validée n'a pas bougé. Modifie-la si besoin.</p>` : ""}`
      : `<div class="ce-final">📝 Note provisoire : <b>${h.scores.total != null ? fmt(h.scores.total) + " / 20" : "incomplète"}</b></div>`;

    const choicesCard = Object.values(h.choices).some(c => c.differ) ? choicesHTML(h, entries, locked) : "";
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

    const inQueue = queue && queue.ids[queue.i] === cand.id;
    const queueBar = inQueue ? `<div class="ce-queue">
        <span>▶ Harmonisation <b>${queue.i + 1}/${queue.ids.length}</b></span>
        <div class="ce-progress small"><div style="width:${queue.i / queue.ids.length * 100}%"></div></div>
        <button type="button" class="ce-link" data-act="queue-skip">Passer ›</button>
        <button type="button" class="ce-link" data-act="queue-stop">Arrêter</button></div>` : "";
    main.innerHTML = `${queueBar}<div class="ce-harmo"><div class="ce-harmo-side"><section class="ce-card ce-hsum">
      ${detailNav(ep, cand)}
      <p class="ce-sumline">${tag(h.status)} <span>${esc(THEMES[shownEv.theme] || "thème ?")} · ${esc(shownEv.split || "répartition ?")} · ${esc(ROLES[shownEv.role] || "rôle ?")}</span></p>
      <p class="ce-hint">${evaluators || "Aucune évaluation"}${gap != null ? ` · écart ${fmt(gap)}` : ""}</p>
      ${noteLine}
      ${nDiv ? `<div class="ce-progress small" role="progressbar" aria-valuemin="0" aria-valuemax="${nDiv}" aria-valuenow="${h.treated}"><div style="width:${h.treated / nDiv * 100}%"></div></div>
        <p class="ce-hint"><b>${h.treated}/${nDiv} désaccord(s) tranché(s)</b>${nDeg ? ` · ${nDeg} de degré` : ""}</p>
        <div class="ce-actions"><button type="button" data-act="next-crit">➡️ Critère suivant</button></div>` : ""}
      ${comments}
      ${initial}
      <button type="button" class="ce-link" data-act="detail-mode" data-mode="recap">📋 Récapitulatif</button>
    </section></div><div class="ce-harmo-main">
    ${choicesCard}
    <section class="ce-card">${cards || `<p class="ce-ok-text">✓ Aucun désaccord sur les critères</p>`}
      <button type="button" class="ce-link" data-act="only-div" aria-pressed="${!onlyDivergent}">${onlyDivergent ? `Voir les ${GRID.length} critères` : "Voir seulement les désaccords"}</button>
    </section>
    <section class="ce-card">
      ${locked
        ? `<div class="ce-actions"><button type="button" data-act="unvalidate">✏️ Modifier la note validée</button><button type="button" data-act="print-one">🖨️ Imprimer la fiche</button></div>`
        : `${h.blockers.length ? `<p class="ce-warn">Avant de valider :</p><ul class="ce-blockers">${h.blockers.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
          <button type="button" class="ce-primary ce-wide" data-act="validate"${h.blockers.length ? " disabled" : ""}>✅ Valider la note${inQueue && queue.i < queue.ids.length - 1 ? " et passer au suivant" : ""}</button>
          <div class="ce-actions">
            <button type="button" class="ce-link" data-act="reset-final">↺ Tout réinitialiser</button>
            <button type="button" class="ce-link" data-act="print-one">🖨️ Imprimer la fiche</button>
          </div>`}
    </section></div></div>`;
  }

  /* Thème, répartition et rôle : côte à côte, à trancher s'ils diffèrent. */
  function choicesHTML(h, entries, locked) {
    const differ = Object.values(h.choices).some(c => c.differ);
    const rows = Object.entries(CHOICE_FIELDS).filter(([f]) => h.choices[f].differ).map(([f, meta]) => {
      const c = h.choices[f];
      const evs = entries.map((x, i) => `<span class="ce-chip-ro"><small>${esc(x.name)}</small>${esc(meta.map[c.vals[i]] || "—")}</span>`).join("");
      const btns = Object.entries(meta.map).map(([k, v]) => `<button type="button" class="${c.value === k ? "on" : ""}" data-act="pick-choice" data-field="${f}" data-value="${k}" aria-pressed="${c.value === k}"${locked ? " disabled" : ""}>${esc(v)}</button>`).join("");
      return `<div class="ce-choice-row${c.differ ? " bad" : ""}">
        <div class="ce-choice-label"><b>${meta.label}</b>${c.differ ? (c.decided ? ` <span class="ce-tag ok">✓ tranché</span>` : ` <span class="ce-tag bad">⇄ à trancher</span>`) : ""}</div>
        <div class="ce-chip-row">${evs}</div>
        <div class="ce-choice"><span>Retenu</span>${btns}</div></div>`;
    }).join("");
    return `<section class="ce-card${differ ? " ce-alert" : ""}">
      <p class="ce-alert-text">⚠️ <b>Choix différents</b> : à trancher avant de valider.</p>
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

    // Notes de chacun, côte à côte avec leur descripteur. En cas de désaccord, toucher une carte
    // retient cette note (degré et points) : le cas le plus courant se tranche en un geste.
    const adopt = st.divergent;
    const picked = (d, v) => st.source === "jury" && st.value === v && st.deg === d;
    const compare = entries.map((x, i) => {
      const m = st.marks[i];
      if (!m) return `<div class="ce-cmp"><b>${esc(x.name)}</b><p class="ce-hint">Pas de note.</p></div>`;
      const desc = C.descOf(cr, x.ev.role);
      const inner = `<span class="ce-adopt-head"><b>${esc(x.name)}</b> ${dot(cr, m.d)} <span>${fmt(m.v)} pt</span></span>
        <p>${esc(desc ? desc[m.d - 1] : "")}</p>${cr.descByRole && x.ev.role ? `<small>Grille « ${esc(ROLES[x.ev.role])} »</small>` : ""}`;
      if (!adopt) return `<div class="ce-cmp d${m.d}">${inner}</div>`;
      const on = picked(m.d, m.v);
      return `<button type="button" class="ce-cmp ce-adopt d${m.d}${on ? " on" : ""}" data-act="h-val" data-crit="${cr.id}" data-deg="${m.d}" data-value="${m.v}" aria-pressed="${on}"${dis}>
        ${inner}<span class="ce-adopt-cta">${on ? "✓ Retenu" : `Retenir ${fmt(m.v)}`}</span></button>`;
    }).join("");
    const meanAdopt = adopt && st.status === "points" && !st.marks.some(m => m && m.v === st.mean)
      ? `<button type="button" class="ce-cmp ce-adopt mean${picked(st.commonDeg, st.mean) ? " on" : ""}" data-act="h-val" data-crit="${cr.id}" data-deg="${st.commonDeg}" data-value="${st.mean}" aria-pressed="${picked(st.commonDeg, st.mean)}"${dis}>
          <span class="ce-adopt-head"><b>Moyenne</b> ${dot(cr, st.commonDeg)} <span>${fmt(st.mean)} pt</span></span><span class="ce-adopt-cta">${picked(st.commonDeg, st.mean) ? "✓ Retenu" : `Retenir ${fmt(st.mean)}`}</span></button>` : "";
    const custom = st.source === "jury" && !st.marks.some(m => m && picked(m.d, m.v)) && !picked(st.commonDeg, st.mean);
    const roleWarn = cr.id === "role" && h.ev.role
      ? entries.filter(x => x.ev?.v?.role != null && x.ev.role && x.ev.role !== h.ev.role).map(x => x.name) : [];
    const desc = C.descOf(cr, h.ev.role);
    const selDeg = st.decision?.deg || st.deg || 0;
    const degBtns = desc ? degButtons(cr, desc, selDeg, "h-deg", dis) : `<p class="ce-hint">Choisis d'abord le rôle AFL3 retenu.</p>`;

    // Étape 2 : note précise dans le degré retenu ; la moyenne n'est proposée que si elle y entre.
    let step2 = "";
    if (selDeg && desc) {
      const range = cr.deg[selDeg - 1];
      const meanOk = st.count > 1 && C.inRange(cr, selDeg, st.mean);
      const chips = C.stepsOf(range).map(x => `<button type="button" class="${st.value === x && st.deg === selDeg ? "on" : ""}${meanOk && st.mean === x ? " mean" : ""}" data-act="h-val" data-crit="${cr.id}" data-deg="${selDeg}" data-value="${x}" aria-pressed="${st.value === x}"${dis}>${fmt(x)}${meanOk && st.mean === x ? " <small>moy.</small>" : ""}</button>`).join("");
      step2 = `<div class="ce-step"><h4>2 · Note</h4>
        <div class="ce-chips">${chips}</div>
        ${meanOk && st.source !== "jury" ? `<button type="button" class="ce-link" data-act="h-val" data-crit="${cr.id}" data-deg="${selDeg}" data-value="${st.mean}"${dis}>Retenir la moyenne (${fmt(st.mean)})</button>`
          : st.count > 1 && !meanOk ? `<p class="ce-hint">Moyenne (${fmt(st.mean)}) hors de ce degré : non proposée.</p>` : ""}
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
        <div class="ce-cmps">${compare}${meanAdopt}</div>
        ${roleWarn.length ? `<p class="ce-warn">⚠️ ${esc(roleWarn.join(", "))} : noté avec l'autre grille de rôle.</p>` : ""}
        ${adopt ? `<details class="ce-more ce-other"${custom ? " open" : ""}><summary>Autre note (degré, puis points)</summary>` : ""}
        <div class="ce-step"><h4>1 · Degré</h4>${degBtns}</div>
        ${step2}
        ${adopt ? `</details>` : ""}
        ${st.decision && !locked ? `<button type="button" class="ce-link" data-act="h-reset-crit" data-crit="${cr.id}">↺ Annuler la décision</button>` : ""}
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
    const lines = [["Candidat", "Classe", "Situation", "Groupe", "Ordre de passage", "Thème", "Répartition AFL2/AFL3", "Rôle AFL3", ...names.map(n => "Total " + n), "Écart total",
      "AFL1 retenu", "AFL2 retenu", "AFL3 retenu", "Note harmonisée /20", "Statut", "Croisement", "Validée le", "Validée par"]];
    ep.candidates.forEach(c => {
      const r = C.retainedFor(ep, c, db.me);
      const totals = r.entries.map(x => x.ev ? C.scores(x.ev).total : null);
      const known = totals.filter(t => t != null);
      const s = r.validated || r.h.scores;
      lines.push([c.name, c.classroom, W.SITUATIONS[c.situation||"present"], c.group||"", c.order||"", THEMES[r.ev.theme] || "", r.ev.split, ROLES[r.ev.role] || "", ...totals.map(fmt),
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
    "undo-input":"Saisie annulée", "candidate-edit":"Informations élève modifiées", "receive":"Évaluations reçues",
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
    const present = r.entries.filter(x => x.ev);
    return `<section class="ce-sheet-print">
      <h2>${esc(cand.name)}${cand.classroom ? ` · ${esc(cand.classroom)}` : ""}</h2>
      <p>${esc(ep.title)} · Musculation CA5</p>
      <p class="ce-sheet-status">${r.validated ? `<b>Note validée par le jury : ${fmt(r.total)} / 20</b> — le ${when(r.validated.at)} (${esc(r.validated.by)})`
        : `<b>Note provisoire, non validée : ${fmt(r.total)} / 20</b>`}</p>
      ${recapBodyHTML(ep, cand, r)}
      <div class="ce-signs">${present.map(x => `<div>${esc(x.name)}<span></span></div>`).join("")}</div>
    </section>`;
  }

  /* Procès-verbal du jury : notes retenues de toute l'épreuve, à signer. */
  function pvHTML(ep) {
    const names = [db.me, ...Object.keys(ep.others)];
    const items = ep.candidates.map(c => ({c, r:C.retainedFor(ep, c, db.me)}));
    const validated = items.filter(x => x.r.validated && x.r.total != null);
    const missing = items.length - validated.length;
    const decided = items.reduce((n, x) => n + x.r.h.treated, 0);
    const mean = validated.length ? validated.reduce((s, x) => s + x.r.total, 0) / validated.length : null;
    const today = new Date().toLocaleDateString("fr-FR", {dateStyle:"long"});
    const rows = items.map(({c, r}) => `<tr><td>${esc(c.name)}</td><td>${esc(c.classroom)}</td><td>${esc(THEMES[r.ev.theme] || "—")}</td>
      <td>${esc(r.ev.split || "—")}</td><td>${esc(ROLES[r.ev.role] || "—")}</td>
      <td class="num">${r.validated ? `<b>${fmt(r.total)}</b>` : "<i>non validée</i>"}</td>
      <td class="num">${r.h.treated || ""}</td><td>${r.validated ? when(r.validated.at) : ""}</td></tr>`).join("");
    return `<section class="ce-pv">
      <h1>Procès-verbal de co-évaluation</h1>
      <p><b>${esc(ep.title)}</b> · Baccalauréat EPS · Musculation (CA5)</p>
      <p>Jury : ${names.map(esc).join(", ")} · édité le ${today}</p>
      <p class="ce-pv-summary">${items.length} candidat(s) · <b>${validated.length} note(s) validée(s)</b>${missing ? ` · <b>${missing} sans note validée</b>` : ""}
        · ${decided} désaccord(s) tranché(s) par le jury${mean != null ? ` · moyenne des notes validées : ${fmt(Math.round(mean * 100) / 100)} / 20` : ""}</p>
      <table><thead><tr><th>Candidat</th><th>Classe</th><th>Thème</th><th>AFL2/AFL3</th><th>Rôle AFL3</th><th class="num">Note /20</th><th class="num">Désaccords tranchés</th><th>Validée le</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <p class="ce-pv-note">Notes harmonisées critère par critère : en cas de désaccord de degré, le degré puis la note ont été décidés explicitement par le jury.
        Le détail des décisions figure dans l'historique de l'épreuve (export CSV). Identité des auteurs déclarative (sans authentification).</p>
      <p>Fait à ............................................ le ............................................</p>
      <div class="ce-signs">${names.map(n => `<div>${esc(n)}<span></span></div>`).join("")}</div>
    </section>`;
  }

  function printPV(ep) {
    const box = $("cePrint");
    box.innerHTML = pvHTML(ep);
    document.body.classList.add("ce-printing");
    window.addEventListener("afterprint", () => { document.body.classList.remove("ce-printing"); box.innerHTML = ""; }, {once:true});
    window.print();
  }

  function openBulk(ep) {
    const ready = C.accordReady(ep, db.me);
    if (!ready.length) { toast("Aucun accord à valider."); return; }
    openDialog(`<h2>Valider ${ready.length} accord(s) ?</h2>
      <p class="ce-hint">Mêmes degrés et moins de 0,5 point d'écart sur chaque critère, mêmes choix : la note retenue est la moyenne au ¼ de point.</p>
      <div class="ce-table"><table><thead><tr><th>Candidat</th><th class="num">Note retenue</th></tr></thead>
        <tbody>${ready.map(x => `<tr><td>${esc(x.cand.name)}</td><td class="num"><b>${fmt(x.r.h.scores.total)}</b></td></tr>`).join("")}</tbody></table></div>
      <p class="ce-hint">Chaque validation est inscrite dans l'historique au nom de ${esc(db.me)} et reste modifiable.</p>
      <div class="ce-actions"><button type="button" class="ce-primary" data-act="confirm-bulk">✅ Valider les ${ready.length}</button><button value="close">Annuler</button></div>`);
  }

  /* Passe au candidat suivant de la file (en sautant ceux validés entre-temps). */
  function queueNext(ep) {
    queue.i++;
    while (queue.i < queue.ids.length && C.get(ep.final, queue.ids[queue.i])?.validated) queue.i++;
    if (queue.i >= queue.ids.length) {
      const n = queue.done;
      queue = null; crossId = null;
      toast(`✓ Harmonisation terminée${n ? ` : ${n} note(s) validée(s)` : ""}.`);
    } else crossId = queue.ids[queue.i];
    detailMode = null;
    nextCrit.last = null;
  }

  function printSheets(ep, cands) {
    const box = $("cePrint");
    box.innerHTML = cands.map(c => sheetHTML(ep, c)).join("");
    document.body.classList.add("ce-printing");
    const done = () => { document.body.classList.remove("ce-printing"); box.innerHTML = ""; };
    window.addEventListener("afterprint", done, {once:true});
    window.print();
  }

  function rememberInput(ep, cand, before, after) {
    lastInput = {ep:ep.id, cand:cand.id, before:C.clone(before), after:JSON.stringify(after)};
  }
  function undoInput(ep) {
    if (!lastInput || lastInput.ep !== ep.id || lastInput.cand !== currentId || JSON.stringify(ep.mine[currentId]) !== lastInput.after) {
      toast('La fiche a changé depuis cette saisie ; aucune donnée écrasée.'); return;
    }
    ep.mine[currentId] = {...lastInput.before, updatedAt:Date.now()};
    log(ep, {type:'undo-input', cand:currentId, candName:candById(ep,currentId).name});
    lastInput = null; save(); render(); toast('Dernière saisie annulée.');
  }
  function viewCandidates(ep) {
    return W.candidates(ep, {search:ui.search || '', group:ui.group || '', filter:c=>evalFilter==='all'||scopeProgress(C.get(ep.mine,c.id),tab==='prep'?'prep':'afl1').state===evalFilter});
  }
  function listControls(ep) {
    const groups=[...new Set(ep.candidates.map(c=>c.group).filter(Boolean))].sort();
    return `<div class="ce-list-tools"><label>Rechercher un élève<input id="ceSearch" type="search" value="${esc(ui.search||'')}" placeholder="Nom ou classe"></label>
      <label>Groupe<select id="ceGroup"><option value="">Tous les groupes</option>${groups.map(g=>`<option${ui.group===g?' selected':''}>${esc(g)}</option>`).join('')}</select></label>
      <button type="button" data-act="clear-filters">Afficher tous les élèves</button></div>`;
  }
  function renderDashboard(main,ep) {
    const s=W.summary(ep,db.me), prof=roleOf(ep)==='prof';
    const next=!s.total?['candidates','Ajouter les élèves']:prof&&s.prepared<s.expected?['prep','Compléter la préparation']:s.done<s.expected?['eval',`Reprendre les ${s.expected-s.done} évaluations à terminer`]:prof?['cross','Recevoir et croiser les évaluations']:['send','Envoyer mes évaluations'];
    main.innerHTML=`<section class="ce-card"><h2>${esc(ep.title)}</h2><p>${s.total} élèves · ${s.special} situation(s) particulière(s)</p>
      <div class="ce-dashboard-grid"><div><b>${s.prepared}/${s.expected}</b><span>Préparations complètes</span></div><div><b>${s.done}/${s.expected}</b><span>Mes évaluations terminées</span></div><div><b>${s.validated}/${s.expected}</b><span>Notes validées</span></div></div>
      <div class="ce-actions"><button type="button" class="ce-primary" data-act="dashboard-next" data-target="${next[0]}">${next[1]}</button><button type="button" data-act="readiness">Avant l’épreuve</button><button type="button" data-act="manage">Archives et corbeille</button></div>
      <p class="ce-hint">Les situations absent, dispensé et reporté sont suivies séparément, sans transformer les notes en zéro. Les notes déjà saisies restent conservées.</p>
      <h3>Évaluations du collègue</h3>${s.received.length?s.received.map(r=>`<div class="ce-reception"><b>${esc(r.name)}</b> : ${s.expected-r.missing.length}/${s.expected} fiches reçues, ${r.complete} terminées.${r.missing.length?`<details><summary>${r.missing.length} élèves encore attendus</summary>${r.missing.map(c=>`<button type="button" data-act="open-student" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</details>`:'<p>Toutes les fiches attendues ont été reçues.</p>'}</div>`).join(''):'<p>Aucune évaluation reçue.</p>'}
      ${backupHTML(ep)}</section>`;
  }
  async function checkOffline() {
    try {
      const registration=await navigator.serviceWorker?.getRegistration();
      const cache=await caches.open('coeval-14');
      const files=['./','index.html','coeval.css','coeval-core.js','coeval-demo.js','coeval-workflow.js','coeval.js','qrcode.js','jsQR.js','manifest.webmanifest'];
      offlineReady=!!registration?.active && (await Promise.all(files.map(f=>cache.match(f)))).every(Boolean);
    } catch(e) { offlineReady=false; }
    renderNotice(active());
    const status=$('ceOfflineCheck');if(status) status.textContent=offlineReady?'Application disponible hors connexion sur cet appareil.':'Disponibilité hors connexion non confirmée. Recharge en ligne puis revérifie.';
  }
  function openReadiness() {
    openDialog(`<h2>Avant l’épreuve</h2><ul class="ce-checklist"><li id="ceOfflineCheck">Vérification des fichiers hors connexion…</li><li>${active()?esc(active().title)+' : '+active().candidates.length+' élèves chargés.':'Aucune épreuve chargée.'}</li><li>${active()?.backupAt?'Dernière copie de secours confirmée : '+when(active().backupAt):'Effectue une copie de secours et vérifie le fichier obtenu.'}</li></ul>
      <p>Vérifie aussi l’autonomie de l’appareil. Pour tester le mode avion, ferme cette fenêtre après vérification puis recharge l’application sans réseau.</p>
      <button type="button" data-act="test-camera">Tester la caméra</button><p id="ceCameraTest" role="status"></p><video id="ceTestVideo" playsinline muted class="hidden"></video>
      <div class="ce-actions"><button type="button" data-act="check-offline">Revérifier le mode hors connexion</button><button type="button" data-act="backup">Créer une copie de secours</button><button value="close">Fermer</button></div>`);
    checkOffline();
  }
  async function testCamera() {
    const status=$('ceCameraTest'),video=$('ceTestVideo');
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw new Error();
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(!$('ceDialog').open || $('ceTestVideo') !== video) {stream.getTracks().forEach(t=>t.stop());return;}
      stopTestCamera?.();
      stopTestCamera=()=>{stream.getTracks().forEach(t=>t.stop());video.srcObject=null;};
      video.srcObject=stream;video.classList.remove('hidden');await video.play();status.textContent='Caméra opérationnelle. La fermeture de cette fenêtre arrête la caméra.';
    } catch(e) {status.textContent='Caméra indisponible ou autorisation refusée. Utilise un fichier ou un code ; la caméra demande un contexte sécurisé.';}
  }
  function openCandidateEditor(ep,id) {
    const c=candById(ep,id);if(!c)return;
    openDialog(`<h2>Modifier ${esc(c.name)}</h2><label>Nom<input id="ceEditName" value="${esc(c.name)}" required></label><label>Classe<input id="ceEditClass" value="${esc(c.classroom)}"></label><label>Groupe<input id="ceEditGroup" value="${esc(c.group)}" placeholder="Ex. Groupe 1"></label><label>Ordre de passage<input id="ceEditOrder" type="number" min="0" step="1" value="${esc(c.order||0)}"></label><p class="ce-hint">0 : ordre alphabétique, après les passages numérotés.</p><label>Situation<select id="ceEditSituation">${Object.entries(W.SITUATIONS).map(([k,v])=>`<option value="${k}"${(c.situation||'present')===k?' selected':''}>${v}</option>`).join('')}</select></label>
      <p class="ce-hint">Ces informations d’organisation sont locales et incluses dans les sauvegardes complètes. Pour les homonymes, utilisez les mêmes noms distinctifs sur les deux appareils.</p><p id="ceEditError" role="alert"></p><div class="ce-actions"><button type="button" class="ce-primary" data-act="save-candidate" data-id="${esc(id)}">Enregistrer</button><button value="close">Annuler</button></div>`);
  }
  function openCsvPreview(ep,names,classes) {
    pendingCsv={ep:ep.id,rows:W.csvPreview(ep,names,classes)};
    const rows=pendingCsv.rows;
    openDialog(`<h2>Vérifier la liste avant import</h2><p>${rows.filter(r=>r.status==='new').length} nouveaux élèves · ${rows.filter(r=>r.status==='duplicate').length} doublons ou homonymes à vérifier · ${rows.filter(r=>r.status==='empty').length} lignes vides ignorées.</p>
      <p>Les noms déjà présents ne sont pas fusionnés automatiquement. Pour deux homonymes, annule puis ajoute un suffixe distinctif dans la liste.</p><div class="ce-table ce-preview-scroll"><table><thead><tr><th>Nom</th><th>Classe</th><th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)||'—'}</td><td>${esc(r.classroom)}</td><td>${{new:'Ajouter',duplicate:'Ignorer : nom déjà présent',empty:'Ignorer'}[r.status]}</td></tr>`).join('')}</tbody></table></div><div class="ce-actions"><button type="button" class="ce-primary" data-act="confirm-csv"${rows.some(r=>r.status==='new')?'':' disabled'}>Ajouter les nouveaux élèves</button><button value="close">Annuler</button></div>`);
  }
  function openManage() {
    openDialog(`<h2>Archives et corbeille</h2><p>Les éléments conservés ici restent sur cet appareil. Une archive peut être rouverte sans perte de notes.</p><h3>Épreuves archivées</h3>${db.epreuves.filter(e=>e.archived).map(e=>`<p>${esc(e.title)} <button type="button" data-act="unarchive" data-id="${esc(e.id)}">Rouvrir</button></p>`).join('')||'<p>Aucune archive.</p>'}
      <h3>Épreuves supprimées</h3>${(db.trash||[]).map(e=>`<p>${esc(e.title)} <button type="button" data-act="restore-ep" data-id="${esc(e.id)}">Restaurer</button></p>`).join('')||'<p>Aucune épreuve supprimée.</p>'}
      <h3>Élèves supprimés de l’épreuve active</h3>${(active()?.trash||[]).map(x=>`<p>${esc(x.cand.name)} <button type="button" data-act="restore-candidate" data-id="${esc(x.id)}">Restaurer avec ses notes</button></p>`).join('')||'<p>Aucun élève supprimé.</p>'}
      <button value="close">Fermer</button>`);
  }
  function emptyImportEpreuve(title,prep) {
    return {id:C.uid(),title:title||'Épreuve importée',role:prep?'coeval':'prof',createdAt:Date.now(),candidates:[],mine:{},others:{},final:{},history:[],backupAt:0,backupHash:''};
  }
  function previewExchange(payloads,title,targetId=active()?.id) {
    const target=db.epreuves.find(e=>e.id===targetId&&!e.archived)||null;
    const ep=target||emptyImportEpreuve(title,payloads.some(p=>p.prep));
    const preview=W.previewImport(ep,payloads,db.me);
    if(preview.error) {toast(preview.error);return {error:preview.error,done:false,message:preview.error};}
    pendingExchange={payloads,title,targetId:target?.id||null};
    const r=preview.result;
    openDialog(`<h2>Vérifier la réception</h2><p>Envoi : <b>${esc(title||'Sans titre')}</b> · ${[...new Set(payloads.map(p=>p.by))].map(esc).join(', ')}</p>
      <label>Importer dans<select id="ceImportTarget"><option value="">Nouvelle épreuve</option>${db.epreuves.filter(e=>!e.archived).map(e=>`<option value="${esc(e.id)}"${target?.id===e.id?' selected':''}>${esc(e.title)}</option>`).join('')}</select></label>
      ${target&&normName(title)!==normName(target.title)?'<p class="ce-warn">Le nom de l’épreuve diffère. Vérifie la destination avant de confirmer.</p>':''}
      <p>${r.added||0} élèves ajoutés · ${r.updated||r.filled||0} fiches actualisées · ${r.older||0} anciennes fiches ignorées · ${r.kept||0} conflits conservés · ${r.locked||0} fiches verrouillées conservées.</p><p>${r.got}/${r.total} partie(s) du lot reçue(s) après cet import.</p>
      <div class="ce-actions"><button type="button" class="ce-primary" data-act="confirm-exchange">Confirmer la réception</button><button value="close">Annuler</button></div>`);
    return {done:false,pending:true,message:'Vérifie l’aperçu puis confirme la réception.'};
  }
  function commitExchange() {
    if(!pendingExchange)return;
    const {payloads,title,targetId}=pendingExchange;
    const target=db.epreuves.find(e=>e.id===targetId);
    if(targetId&&!target){toast('Épreuve introuvable.');return;}
    const before=target||emptyImportEpreuve(title,payloads.some(p=>p.prep));
    // Recalcule au moment de confirmer pour ne pas écraser les modifications ultérieures.
    const preview=W.previewImport(before,payloads,db.me);
    if(preview.error){toast(preview.error);return;}
    if(target) db.epreuves[db.epreuves.indexOf(target)]=preview.ep;else db.epreuves.unshift(preview.ep);
    db.activeId=preview.ep.id;pendingExchange=null;
    log(preview.ep,{type:'receive',from:preview.result.by});
    save();closeDialog();
    tab=preview.result.prep?(preview.result.done?'eval':'share'):'cross';render();
    openDialog(`<h2>Réception effectuée</h2><p>${esc(C.mergeMessage(preview.result))}</p><p>Consulte le tableau de bord pour voir les élèves encore attendus.</p><div class="ce-actions">${!preview.result.done?'<button type="button" data-act="continue-scan">Scanner le QR suivant</button>':''}<button type="button" data-act="go-dashboard">Tableau de bord</button><button value="close">Fermer</button></div>`);
  }
  function openReceipt(ep,name) {
    try {
      const r=W.receipt(ep,name,db.me),text='COEVAL-ACK:'+JSON.stringify(r);
      openDialog(`<h2>Accusé de réception pour ${esc(name)}</h2><p>Ce QR confirme la version des notes reçues. Le collègue le scanne dans « Envoyer ».</p><div class="ce-qr">${qrImage(text)}</div><label>Code à transmettre<textarea readonly rows="3">${esc(text)}</textarea></label><p class="ce-hint">Identité déclarative, sans authentification.</p><button value="close">Fermer</button>`);
    }catch(e){toast(e.message);}
  }
  function printFeedback(ep) {
    const selected=ep.candidates.filter(c=>C.retainedFor(ep,c,db.me).validated);
    if(!selected.length){toast('Valide une note avant de produire une fiche de retour.');return;}
    const box=$('cePrint');
    box.innerHTML=selected.map(c=>{
      const r=C.retainedFor(ep,c,db.me),s=r.validated;
      return `<section class="ce-sheet-print"><h2>${esc(c.name)} · ${esc(c.classroom)}</h2><p>${esc(ep.title)} · Retour d’évaluation</p><h3>Note validée : ${fmt(s.total)} / 20</h3>${r.stale?'<p>Attention : des évaluations ont changé depuis la validation. Cette fiche reprend la version validée.</p>':''}${recapTable(r.ev)}<h3>Retour du professeur</h3><p style="white-space:pre-wrap">${esc(c.feedback||'Aucun commentaire complémentaire.')}</p></section>`;
    }).join('');
    document.body.classList.add('ce-printing');window.addEventListener('afterprint',()=>{document.body.classList.remove('ce-printing');box.innerHTML='';},{once:true});window.print();
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
      <ul class="ce-cand-edit">${ep.candidates.map(c => `<li><span>${esc(c.name)}${c.classroom ? ` <small>${esc(c.classroom)}</small>` : ""}</span><button type="button" data-act="edit-candidate" data-id="${esc(c.id)}">Modifier</button><button type="button" class="ce-link" data-act="del-cand" data-id="${esc(c.id)}">Mettre à la corbeille</button></li>`).join("")}</ul>
      <hr><div class="ce-choice"><span>Mon rôle</span>${Object.entries(ROLE_LABEL).map(([k, v]) => `<button type="button" class="${roleOf(ep) === k ? "on" : ""}" data-act="set-role" data-role="${k}" aria-pressed="${roleOf(ep) === k}">${v}</button>`).join("")}</div>
      <div class="ce-actions">
        <button type="button" class="ce-link" data-act="backup">💾 Sauvegarder l'épreuve</button>
        <button type="button" class="ce-link" data-act="demo">🧪 Classe d'exemple</button>
        <button type="button" class="ce-link" data-act="rename-epreuve">Renommer l'épreuve</button>
        <button type="button" data-act="archive">Archiver l’épreuve</button><button type="button" data-act="manage">Archives et corbeille</button><button type="button" class="ce-link ce-danger" data-act="del-epreuve">Mettre l’épreuve à la corbeille</button></div>`);
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
      case "go-dashboard": closeDialog();tab='home';render();break;
      case "dashboard-next":
        if(el.dataset.target==='candidates') openCandidates(ep);
        else {tab=el.dataset.target;ui.search='';ui.group='';evalFilter='all';currentId=W.candidates(ep).find(c=>W.eligible(c)&&!C.get(ep.mine,c.id)?.done)?.id||null;render();}break;
      case "passage": ui.passage=!ui.passage;saveUi();render();if(ui.passage)scrollToSheet();break;
      case "undo-input": undoInput(ep);break;
      case "clear-filters": ui.search='';ui.group='';evalFilter='all';saveUi();render();break;
      case "open-student": currentId=el.dataset.id;ui.search='';ui.group='';evalFilter='all';tab='eval';render();break;
      case "readiness": openReadiness();break;
      case "test-camera": testCamera();break;
      case "check-offline": checkOffline();break;
      case "edit-candidate": openCandidateEditor(ep,el.dataset.id);break;
      case "save-candidate": {
        try {const c=W.editCandidate(ep,el.dataset.id,{name:$('ceEditName').value,classroom:$('ceEditClass').value,group:$('ceEditGroup').value,order:$('ceEditOrder').value,situation:$('ceEditSituation').value});log(ep,{type:'candidate-edit',cand:c.id,candName:c.name});save();closeDialog();render();}
        catch(e){$('ceEditError').textContent=e.message;}break;
      }
      case "confirm-csv": {
        if(!pendingCsv||pendingCsv.ep!==ep?.id)return;
        const rows=pendingCsv.rows.filter(r=>r.status==='new');const n=C.addCandidates(ep,rows.map(r=>r.name),rows.map(r=>r.classroom));pendingCsv=null;save();closeDialog();render();toast(n+' élèves ajoutés.');break;
      }
      case "confirm-exchange": commitExchange();break;
      case "continue-scan": closeDialog();startScan();break;
      case "receipt": openReceipt(ep,el.dataset.name);break;
      case "manage": openManage();break;
      case "archive": ep.archived=true;save();closeDialog();tab='home';render();openManage();break;
      case "unarchive": {const e=db.epreuves.find(e=>e.id===el.dataset.id);if(e){e.archived=false;db.activeId=e.id;}save();closeDialog();tab='home';render();break;}
      case "restore-ep": {const e=db.trash?.find(e=>e.id===el.dataset.id);if(e&&!db.epreuves.some(x=>x.id===e.id)){e.archived=false;db.epreuves.unshift(e);db.trash=db.trash.filter(x=>x!==e);db.activeId=e.id;save();closeDialog();tab='home';render();}break;}
      case "restore-candidate": try{W.restoreCandidate(ep,el.dataset.id);save();render();openManage();}catch(e){toast(e.message);}break;
      case "print-feedback": printFeedback(ep);break;
      case "feedback": openDialog(`<h2>Retour aux élèves</h2><p>Commentaires destinés aux élèves, distincts des remarques échangées entre évaluateurs. L’impression porte sur les notes validées.</p>${ep.candidates.map(c=>`<label>${esc(c.name)}<textarea data-feedback="${esc(c.id)}" rows="2">${esc(c.feedback||'')}</textarea></label>`).join('')}<button value="close">Fermer</button>`);break;
      case "set-me": {
        const v = $("ceMeInput").value.trim();
        if (!v) { toast("Indique ton nom."); return; }
        db.me = v; save(); render(); break;
      }
      case "new-epreuve": {
        const t = prompt("Nom de l'épreuve :", "Bac Musculation · " + new Date().getFullYear());
        if (t && t.trim()) { newEpreuve(t.trim()); tab = "prep"; render(); openCandidates(active()); }
        break;
      }
      case "candidates": if (ep) openCandidates(ep); break;
      case "eval-filter": evalFilter = evalFilter === el.dataset.filter ? "all" : el.dataset.filter; render(); break;
      case "pick": currentId = el.dataset.id; editChoices = null; render(); scrollToSheet(); break;
      case "edit-choices": editChoices = editChoices === currentId ? null : currentId; render(); break;
      case "step": {
        const list=viewCandidates(ep);
        const i = list.findIndex(c => c.id === currentId) + Number(el.dataset.step);
        if (list[i]) { currentId = list[i].id; editChoices = null; render(); scrollToSheet(); }
        break;
      }
      case "set": {
        const e = evalOf(ep, currentId);
        const previous=C.clone(e);
        const field = el.dataset.field;
        if (!W.eligible(cand) || e.done || (e.pre && !e.pre.unlocked && e.pre.choices.includes(field))) return;
        const value = e[field] === el.dataset.value ? "" : el.dataset.value;
        if (field === "role" && e.role && e.v.role != null && value !== e.role) {
          if (!confirm(`Le critère « Rôle » est déjà noté (${fmt(e.v.role)}) avec la grille « ${ROLES[e.role]} ».\nChanger de rôle conserve cette note, mais elle sera signalée à vérifier avec les nouveaux descripteurs. Continuer ?`)) return;
          e.recheck = {...(e.recheck || {}), role:true};
        }
        logEdit(ep, cand, e, CHOICE_FIELDS[field].label, CHOICE_FIELDS[field].map[e[field]] || "", CHOICE_FIELDS[field].map[value] || "");
        e[field] = value;
        e.updatedAt = Date.now(); rememberInput(ep,cand,previous,e); save(); render(); break;
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
        const list=viewCandidates(ep);
        const next = list.slice(list.indexOf(cand) + 1).concat(list).find(c => W.eligible(c) && !C.get(ep.mine, c.id)?.done);
        if (next) currentId = next.id;
        editChoices = null;
        render(); scrollToSheet();
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
      case "prep-step": prepIndex += Number(el.dataset.step); if (document.querySelector("#ceDialog .ce-prepshare")) openPrepShare(ep); else render(); break;
      case "prep-download": downloadJSON(`preparation_${slug(ep.title)}_${slug(db.me)}.json`, C.exportPrepFile(ep, db.me), ep.title); break;
      case "prep-copy": {
        const text = C.prepParts(ep, db.me).join("\n");
        (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast("Code de préparation copié."), () => prompt("Copie ce code :", text));
        break;
      }
      case "go-receive": tab = "share"; render(); break;
      case "go-tab": tab = el.dataset.tab; render(); window.scrollTo({top:0}); break;
      case "prep-share": openPrepShare(ep); break;
      case "set-role": ep.role = el.dataset.role; save(); closeDialog(); tab = ep.role === "prof" ? "prep" : "eval"; render(); toast(`Rôle : ${ROLE_LABEL[ep.role]}.`); break;
      case "demo": {
        const old = db.epreuves.find(e => e.demo);
        if (old && !confirm("Une épreuve d'exemple existe déjà. La remplacer par une nouvelle (les essais faits dessus seront perdus) ?")) return;
        if(!db.me) db.me="Évaluateur démo";
        const demo = window.CoEvalDemo.makeDemo(db.me);
        demo.role = "prof";
        demo.backupHash = C.contentHash(demo);
        db.epreuves = [demo, ...db.epreuves.filter(e => !e.demo)];
        db.activeId = demo.id;
        currentId = crossId = null;
        crossView = "table"; crossFilter = "all"; evalFilter = "all";
        save(); closeDialog();
        tab = "cross"; render(); window.scrollTo({top:0});
        toast("🧪 Classe d'exemple créée (fictive).");
        break;
      }
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
        if(!res.pending){toast(res.message); render();} break;
      }
      case "drop-other":
        if (confirm(`Retirer l'évaluation de ${el.dataset.name} ?`)) { delete ep.others[el.dataset.name]; save(); render(); }
        break;
      case "backup": if (ep) backup(ep); break;
      case "backup-download": if(ep) backup(ep,true); break;
      case "confirm-backup": {
        const target=db.epreuves.find(e=>e.id===pendingBackup?.epId);
        if(target){target.backupAt=pendingBackup.at;target.backupHash=pendingBackup.hash;save();}
        pendingBackup=null;closeDialog();render();break;
      }
      case "do-restore": doRestore(); break;
      case "filter": crossFilter = crossFilter === el.dataset.filter && el.dataset.filter !== "all" ? "all" : el.dataset.filter; render(); break;
      case "stats": crossView = "stats"; render(); window.scrollTo({top:0}); break;
      case "stats-back": crossView = "table"; render(); break;
      case "cross-open": crossId = el.dataset.id; detailMode = null; render(); window.scrollTo({top:0}); break;
      case "cross-back": crossId = null; queue = null; detailMode = null; render(); break;
      case "detail-mode": detailMode = el.dataset.mode; render(); window.scrollTo({top:0}); break;
      case "queue-start": {
        const ids = C.harmonizeQueue(ep, db.me);
        if (!ids.length) { toast("Rien à harmoniser ✓"); return; }
        queue = {ids, i:0, done:0};
        crossId = ids[0]; detailMode = null; nextCrit.last = null;
        render(); window.scrollTo({top:0}); break;
      }
      case "queue-skip": queueNext(ep); render(); window.scrollTo({top:0}); break;
      case "queue-stop": queue = null; crossId = null; render(); break;
      case "bulk-accords": openBulk(ep); break;
      case "confirm-bulk": {
        const ready = C.accordReady(ep, db.me);
        ready.forEach(({cand: c, r}) => {
          const f = finalStore(ep, c.id);
          f.validated = C.makeValidation(r.h, db.me);
          f.updatedAt = Date.now();
          log(ep, {type:"validate", cand:c.id, candName:c.name, total:r.h.scores.total, bulk:true});
        });
        save(); closeDialog(); render();
        toast(`✅ ${ready.length} accord(s) validé(s).`);
        break;
      }
      case "pv": printPV(ep); break;
      case "cross-step": {
        const i = ep.candidates.findIndex(c => c.id === crossId) + Number(el.dataset.step);
        if (ep.candidates[i]) { crossId = ep.candidates[i].id; queue = null; detailMode = null; nextCrit.last = null; render(); window.scrollTo({top:0}); }
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
        save(); closeDialog();
        detailMode = null;
        if (queue && queue.ids[queue.i] === cand.id) {
          queue.done++;
          queueNext(ep);
          if (queue) toast(`✅ ${cand.name} : ${fmt(h.scores.total)} / 20 · suivant : ${candById(ep, crossId).name}`);
        } else toast(`✅ Note de ${cand.name} validée : ${fmt(h.scores.total)} / 20.`);
        render(); window.scrollTo({top:0});
        break;
      }
      case "unvalidate": {
        const f = finalStore(ep, cand.id);
        if (!confirm(`Annuler la validation de la note de ${cand.name} (${fmt(f.validated?.total)} / 20) pour la modifier ?\nL'annulation est inscrite dans l'historique.`)) return;
        log(ep, {type:"unvalidate", cand:cand.id, candName:cand.name, from:fmt(f.validated?.total)});
        f.validated = null;
        detailMode = null;
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
        openCsvPreview(ep, $("ceNames").value.split(/\r?\n/)); break;
      }
      case "del-cand":
        W.trashCandidate(ep,el.dataset.id);
        save();openCandidates(ep);render();toast('Élève placé dans la corbeille avec ses notes.');
        break;
      case "rename-epreuve": {
        const t = prompt("Nouveau nom :", ep.title);
        if (t && t.trim()) { ep.title = t.trim(); save(); openCandidates(ep); render(); }
        break;
      }
      case "del-epreuve":
        if (confirm(`Placer « ${ep.title} » dans la corbeille ? Tu pourras la restaurer depuis « Archives et corbeille ».`)) {
          (db.trash ||= []).push(ep);
          db.epreuves = db.epreuves.filter(e => e.id !== ep.id);
          db.activeId = db.epreuves[0]?.id || null;
          save(); closeDialog(); render();
        }
        break;
    }
  });

  document.addEventListener("change", ev => {
    const el = ev.target;
    if (el.classList?.contains("ce-slider")) { sliderCommit(el); return; }
    const ep = active();
    if (el.id === "ceEpreuve") { db.activeId = el.value; currentId = crossId = null; crossView = "table"; save(); render(); return; }
    if (el.id === 'ceGroup') {ui.group=el.value;saveUi();render();return;}
    if (el.id === 'ceImportTarget' && pendingExchange) {const p=pendingExchange;previewExchange(p.payloads,p.title,el.value);return;}
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
        openCsvPreview(ep,names,classes);
      });
    }
  });

  document.addEventListener("input", ev => {
    const el = ev.target;
    if (el.classList?.contains("ce-slider")) { sliderPreview(el); return; }
    if(el.id==='ceSearch') {
      const start=el.selectionStart;ui.search=el.value;saveUi();render();$('ceSearch')?.focus();if($('ceSearch')) $('ceSearch').setSelectionRange(start,start);return;
    }
    if(el.dataset.feedback) {const c=candById(active(),el.dataset.feedback);if(c){c.feedback=el.value;c.organizationAt=Date.now();save();}return;}
    if (el.dataset.field === "comment" && tab === "eval") {
      const e = evalOf(active(), currentId);
      if (e.done) return;
      e.comment = el.value;
      e.updatedAt = Date.now();
      save();
    }
  });

  // Fin d'un toucher sur un curseur : on enregistre le cran visé, même s'il n'a pas bougé
  // (premier toucher sur la position de départ d'un critère pas encore noté).
  const commitRelease = ev => {
    const el = ev.target;
    if (el.classList?.contains("ce-slider") && !el.disabled) { sliderPreview(el); sliderCommit(el); }
  };
  document.addEventListener("keydown", ev => {
    const el = ev.target;
    if (!el.classList?.contains("ce-slider") || el.disabled) return;
    if (sliderKey(el, ev.key)) { ev.preventDefault(); sliderPreview(el, true); sliderCommit(el); }
  });
  document.addEventListener("pointerup", commitRelease);
  document.addEventListener("keyup", ev => { if (ev.key === "Enter" || ev.key === " ") commitRelease(ev); });

  // Mémorise les critères ouverts ou repliés à la main dans l'écran d'harmonisation.
  document.addEventListener("toggle", ev => {
    const d = ev.target;
    if (d.matches?.("details[data-crit]") && crossId) openCrits[crossId + ":" + d.dataset.crit] = d.open;
  }, true);

  $("ceNewEpreuve").addEventListener("click", () => {
    if (!db.me) { toast("Indique d'abord ton nom."); return; }
    const t = prompt("Nom de l'épreuve :", "Bac Musculation · " + new Date().getFullYear());
    if (t && t.trim()) { newEpreuve(t.trim()); tab = "prep"; render(); openCandidates(active()); }
  });
  $("ceCandidates").addEventListener("click", () => { const ep = active(); if (ep) openCandidates(ep); else toast("Crée d'abord une épreuve."); });
  $("ceMe").addEventListener("click", () => {
    const v = prompt("Ton nom d'évaluateur :", db.me);
    if (v && v.trim()) { db.me = v.trim(); save(); render(); }
  });

  // Demande au navigateur de ne pas effacer les données de lui-même (Safari notamment).
  navigator.storage?.persist?.().catch(() => {});

  $('ceDialog').addEventListener('close',()=>{stopTestCamera?.();stopTestCamera=null;});
  const manage=document.createElement('button');manage.type='button';manage.textContent='Archives et corbeille';manage.dataset.act='manage';document.querySelector('.ce-bar').append(manage);
  navigator.serviceWorker?.addEventListener('controllerchange',checkOffline);
  if(navigator.serviceWorker) navigator.serviceWorker.ready.then(checkOffline);
  window.addEventListener('online',checkOffline);
  window.CoEval = {core:C, get db() { return db; }, importText};
  render();
})();
