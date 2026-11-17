/* NODE_PATH=/tmp/coeval-browser/node_modules node tests/browser-guide.cjs
   Serve repository on port 8000 before running. SHOTS=<dossier> pour enregistrer des captures.
   Parcours du co-évaluateur qui découvre l'application : kit (un seul lien/QR), nom, aide,
   mode guidé (un critère par écran, compteur de répétitions, observation, entretien),
   récapitulatif, validation, élève suivant, fin de séance → envoi au professeur. */
const {chromium} = require('playwright');
const results = [];
const check = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + info : ''}`); };
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  const errs = [];
  // 1 · Le professeur prépare et affiche le kit.
  const prof = await b.newPage({viewport: {width: 1080, height: 810}});
  prof.on('pageerror', e => errs.push('prof: ' + e.message));
  prof.on('dialog', d => d.accept());
  await prof.goto('http://127.0.0.1:8000/');
  await prof.evaluate(() => localStorage.clear());
  await prof.reload();
  await prof.locator('#ceMeInput').fill('M. Prof');
  await prof.locator('[data-act=set-me]').first().click();
  await prof.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  await prof.locator('[data-act="demo"]').filter({visible: true}).first().click();
  // Ordre de passage fixé par le professeur : SIMON, puis DUPONT, puis ROBERT.
  await prof.evaluate(() => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId);
    [['SIMON', 1], ['DUPONT', 2], ['ROBERT', 3]].forEach(([n, o]) => { e.candidates.find(c => c.name.startsWith(n)).order = o; });
    localStorage.setItem('df-coeval-v1', JSON.stringify(db)); });
  await prof.reload();
  await prof.locator('[data-tab=prep]').click();
  await prof.locator('[data-act=prep-share]').first().click();
  await prof.waitForFunction(() => !!document.getElementById('ceKitQr')?.dataset.link);
  const link = await prof.$eval('#ceKitQr', el => el.dataset.link);
  check('kit : un seul QR et un lien', (await prof.locator('#ceKitQr svg').count()) === 1 && link.includes('#kit=z'), `${link.length} caractères`);
  if (SHOTS) await prof.screenshot({path: `${SHOTS}/1-kit.png`});
  // Ordre de passage du professeur, pour vérifier qu'il arrive avec le kit.
  const order = await prof.evaluate(() => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); return e.candidates.filter(c => c.order).map(c => [c.name, c.order]); });

  for (const [w, h, label] of [[810, 1080, 'tablette'], [390, 844, 'téléphone']]) {
    const ctx = await b.newContext({viewport: {width: w, height: h}});
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${label}: ${e.message}`));
    p.on('dialog', d => d.accept());
    const ev = name => p.evaluate(n => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); const c = e.candidates.find(x => x.name === n); return {ev: e.mine[c.id], c}; }, name);
    try {
      // 2 · Le co-évaluateur ouvre le lien : invitation, son nom, c'est prêt.
      await p.goto(link.replace(/^https?:\/\/[^/]+/, 'http://127.0.0.1:8000'));
      await p.locator('#ceMeInput').waitFor();
      check(`[${label}] invitation : épreuve et professeur affichés`, (await p.textContent('main')).includes('M. Prof') && (await p.textContent('main')).includes('28 élèves'));
      check(`[${label}] le code est retiré de l'adresse`, !(await p.evaluate(() => location.hash)));
      if (SHOTS && w === 810) await p.screenshot({path: `${SHOTS}/2-invitation.png`});
      await p.locator('#ceMeInput').fill('Mme Coeval');
      await p.locator('[data-act=set-me]').click();
      // 3 · Aide de premier lancement.
      await p.locator('.ce-tour').waitFor();
      check(`[${label}] aide de premier lancement`, (await p.textContent('.ce-tour')).includes('Bienvenue'));
      if (SHOTS && w === 810) await p.screenshot({path: `${SHOTS}/3-aide.png`});
      await p.locator('[data-act=tour]').click(); await p.locator('[data-act=tour]').click(); await p.locator('[data-act=tour-end]').click();
      const st = await p.evaluate(() => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); return {role: e.role, n: e.candidates.length, prepared: e.candidates.filter(c => e.mine[c.id]?.theme && e.mine[c.id]?.v?.projet != null).length, orders: e.candidates.filter(c => c.order).map(c => [c.name, c.order])}; });
      check(`[${label}] classe et préparations installées (rôle co-évaluateur)`, st.role === 'coeval' && st.n === 28 && st.prepared > 20, JSON.stringify({n: st.n, prepared: st.prepared}));
      check(`[${label}] ordre de passage transmis`, JSON.stringify(st.orders) === JSON.stringify(order), `${st.orders.length} ordre(s)`);
      // 4 · Mode guidé : prochain passage, sans onglets.
      check(`[${label}] mode guidé : onglets masqués, prochain passage`, !(await p.locator('.ce-tabs').isVisible()) && (await p.textContent('.ce-g-hero')).includes('Prochain passage'));
      const name = (await p.textContent('.ce-g-name')).replace(/\s+TG\d.*$/, '').trim();
      check(`[${label}] premier passage = n° 1 de l'ordre du professeur`, name.startsWith('SIMON') && (await p.textContent('.ce-g-kicker')).includes('n° 1'), name);
      if (SHOTS && w === 810) await p.screenshot({path: `${SHOTS}/4-prochain.png`});
      await p.locator('[data-act=g-start]').click();
      // Amplitude : observation (un toucher Oui sur D4 → D4 proposé).
      check(`[${label}] étape 1/6 Amplitude, repères « Que regarder ? »`, (await p.textContent('.ce-g-title')).includes('Amplitude') && await p.locator('.ce-tips[open] li').count() === 3);
      await p.locator('.ce-g-tool .ce-quiz-item').first().locator('[data-ans="1"]').click();
      await p.locator('.ce-g-tool [data-act=quiz-place]').click();
      check(`[${label}] observation → note placée`, (await ev(name)).ev.v.amp === 1 && (await ev(name)).ev.d.amp === 4);
      await p.locator('.ce-g-bar [data-act=g-step]').last().click();
      // Respiration : une touche sur les points → note, puis passage automatique.
      check(`[${label}] étape 2/6 Respiration`, (await p.textContent('.ce-g-title')).includes('Respiration'));
      await p.locator('.ce-g-deg.d3 [data-act=g-set]').last().click();
      check(`[${label}] une touche = degré + points`, (await ev(name)).ev.d.resp === 3 && (await ev(name)).ev.v.resp === .75);
      await p.waitForTimeout(800);
      check(`[${label}] passage automatique au critère suivant`, (await p.textContent('.ce-g-title')).includes('Posture'));
      // Posture : compteur de répétitions.
      if (SHOTS && w === 810) await p.screenshot({path: `${SHOTS}/5-compteur-vide.png`});
      for (const m of 'vvvvvcvvvv') await p.locator(`.ce-reps-btns [data-mark=${m}]`).click();
      await p.locator('[data-act=rep-series]').click();
      for (const m of 'vvvcvvvvx') await p.locator(`.ce-reps-btns [data-mark=${m}]`).click();
      const stats = await p.textContent('.ce-reps-stats');
      check(`[${label}] compteur : réalisées et compensations`, /Réalisées\s*18\//.test(stats) && stats.includes('compensations 2'), stats.replace(/\s+/g, ' '));
      if (SHOTS && w === 810) await p.screenshot({path: `${SHOTS}/6-compteur.png`});
      await p.locator('.ce-reps-prop li.focus [data-act=rep-place]').click();
      let e = (await ev(name)).ev;
      check(`[${label}] compteur → Posture proposée et placée (D3)`, e.d.post === 3 && e.notes?.post?.startsWith('Compteur'), `D${e.d.post} ${e.v.post}`);
      await p.locator('.ce-g-bar [data-act=g-step]').last().click();
      // Choix des paramètres : le même comptage propose la note.
      check(`[${label}] étape 4/6 Choix des paramètres : compteur repris`, (await p.textContent('.ce-g-title')).includes('Choix des paramètres') && /Réalisées\s*18\//.test(await p.textContent('.ce-reps-stats')));
      await p.locator('.ce-reps-prop li.focus [data-act=rep-place]').click();
      e = (await ev(name)).ev;
      check(`[${label}] compteur → Choix des paramètres placé`, e.v.param != null && e.notes?.param?.includes('prévue'), `D${e.d.param} ${e.v.param}`);
      await p.locator('.ce-g-bar [data-act=g-step]').last().click();
      // Ressentis et régulation : entretien descendant.
      for (const crit of ['ress', 'regul']) {
        check(`[${label}] ${crit} : questions d'entretien intégrées`, await p.locator('.ce-g-tool .ce-quiz-item').count() === 2);
        await p.locator('.ce-g-tool .ce-quiz-item').nth(0).locator('[data-ans="1"]').click();
        await p.locator('.ce-g-tool .ce-quiz-item').nth(1).locator('[data-ans="1"]').click();
        await p.locator('.ce-g-tool [data-act=quiz-place]').click();
        await p.locator('.ce-g-bar [data-act=g-step]').last().click();
      }
      // 5 · Récapitulatif et validation.
      check(`[${label}] récapitulatif complet`, (await p.textContent('.ce-g-recap')).includes('Récapitulatif') && await p.locator('.ce-g-recap li.missing').count() === 0);
      if (SHOTS && w === 810) await p.screenshot({path: `${SHOTS}/7-recap.png`});
      await p.locator('[data-act=g-validate]').click();
      check(`[${label}] fiche validée (verrouillée)`, (await ev(name)).ev.done === true);
      const next = (await p.textContent('.ce-g-name')).replace(/\s+TG\d.*$/, '').trim();
      check(`[${label}] élève suivant = n° 2`, next.startsWith('DUPONT'), next);
      check(`[${label}] avancement mis à jour`, (await p.textContent('.ce-g-progress')).includes('1/'));
      // Absent : sort de la file.
      await p.locator('[data-act=g-absent]').click();
      check(`[${label}] « Absent » passe à l'élève suivant`, (await p.textContent('.ce-g-name')).replace(/\s+TG\d.*$/, '').trim() !== next);
      // Choisir un élève : la fiche terminée s'ouvre au récapitulatif.
      await p.locator('.ce-g-row [data-act=g-choose]').click();
      await p.locator(`#ceDialog [data-act=g-pick]:has-text("${name}")`).click();
      check(`[${label}] fiche terminée : récapitulatif en lecture seule`, await p.locator('.ce-g-recap').count() === 1 && await p.locator('[data-act=reopen]').count() === 1);
      // 6 · Fin de séance : toutes les fiches terminées → envoyer.
      await p.evaluate(() => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); e.candidates.forEach(c => { const m = e.mine[c.id] || (e.mine[c.id] = {v: {}, d: {}}); m.done = true; }); localStorage.setItem('df-coeval-v1', JSON.stringify(db)); });
      await p.reload();
      check(`[${label}] fin de séance : un seul bouton « Envoyer au professeur »`, (await p.textContent('.ce-g-done')).includes('Envoyer au professeur'));
      if (SHOTS && w === 810) await p.screenshot({path: `${SHOTS}/8-fin.png`});
      await p.locator('.ce-g-done [data-act=g-send]').click();
      check(`[${label}] envoi : QR affichés`, (await p.textContent('main')).includes('Envoyer mon évaluation') && await p.locator('.ce-qr svg').count() === 1);
      // Écran complet accessible, et retour au mode guidé.
      await p.locator('[data-tab=eval]').click();
      await p.locator('.ce-g-top .ce-menu>summary').click();
      await p.locator('[data-act=g-mode][data-mode=full]').click();
      check(`[${label}] « Écran complet » : fiche habituelle`, await p.locator('.ce-cand-head').count() === 1 && await p.locator('.ce-g-endcard').count() === 1);
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`[${label}] aucun débordement horizontal`, ov <= 0, `${ov} px`);
    } catch (err) { check(`[${label}] exception`, false, err.message.split('\n')[0]); }
    await ctx.close();
  }
  // Le professeur qui scanne son propre kit est prévenu.
  await prof.goto(link.replace(/^https?:\/\/[^/]+/, 'http://127.0.0.1:8000'));
  await prof.reload();
  check('Le professeur garde l\'écran complet', await prof.locator('.ce-tabs').isVisible());
  check('Aucune erreur JavaScript', !errs.length, errs.join(' | '));
  console.log(`${results.filter(Boolean).length}/${results.length} vérifications réussies`);
  await b.close();
  if (results.some(r => !r)) process.exit(1);
})();
