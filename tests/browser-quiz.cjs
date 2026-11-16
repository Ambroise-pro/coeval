/* NODE_PATH=/tmp/coeval-browser/node_modules node tests/browser-quiz.cjs
   Serve repository on port 8000 before running.
   Questions d'entretien pour placer la régulation des paramètres selon le mobile. */
const {chromium} = require('playwright');
const results = [];
const check = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + info : ''}`); };
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  const errs = [];
  for (const [w, h, label] of [[810, 1080, 'tablette'], [390, 844, 'téléphone']]) {
    const p = await b.newPage({viewport: {width: w, height: h}});
    p.on('pageerror', e => errs.push(`${label}: ${e.message}`));
    p.on('dialog', d => d.accept());
    const openList = async () => { const b = p.locator('[data-act=list-open]'); if (await b.isVisible() && !(await p.evaluate(() => document.body.classList.contains('ce-list-open')))) await b.click(); };
    const pick = async name => { await openList(); await p.locator('#ceSearch').fill(name); await p.locator('.ce-cand').first().click(); const x = p.locator('[data-act=crit-expand-all]'); if (await x.count()) await x.click(); };
    try {
      await p.goto('http://127.0.0.1:8000/');
      await p.evaluate(() => localStorage.clear());
      await p.reload();
      const me = p.locator('#ceMeInput');
      if (await me.count()) { await me.fill('Alice'); await p.locator('[data-act=set-me]').first().click(); }
      await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      await p.locator('[data-act="demo"]').filter({visible: true}).first().click();
      await p.locator('[data-tab=eval]').click();
      await p.selectOption('#ceAfl', 'afl1-todo');
      // Élève sans régulation notée, de thème connu
      const cand = await p.evaluate(() => {
        const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId);
        const c = e.candidates.find(c => (!c.situation || c.situation === 'present') && !e.mine[c.id]?.done && e.mine[c.id]?.v?.regul == null && e.mine[c.id]?.theme);
        return c && {id: c.id, name: c.name, theme: e.mine[c.id].theme};
      });
      check(`[${label}] élève de test trouvé`, !!cand, cand && cand.name);
      await p.selectOption('#ceAfl', '');
      await pick(cand.name.split(' ')[0]);
      const keys = await p.locator('.ce-slide-crit[data-crit=param] .ce-degbox-key').allTextContents();
      check(`[${label}] Choix des paramètres : repère simplifié en gras dans chaque degré`, keys.length === 4 && keys[2].includes('75 à 90'), keys.join(' | '));
      const openBtn = p.locator('.ce-slide-crit[data-crit=regul] [data-act=quiz-open]');
      check(`[${label}] questionnaire masqué, bouton sous la régulation`, await openBtn.count() === 1 && await p.locator('.ce-quiz-item').count() === 0);
      await openBtn.evaluate(e => e.scrollIntoView({block: 'center'}));
      await openBtn.click();
      const quiz = p.locator('#ceDialog .ce-quiz');
      check(`[${label}] le bouton ouvre le questionnaire en popup`, await p.evaluate(() => document.getElementById('ceDialog').open) && await quiz.count() === 1);
      const themeName = {1: 'Puissance', 2: 'Tonification', 3: 'Volume'}[cand.theme];
      check(`[${label}] questions adaptées au mobile (${themeName})`, (await quiz.locator('.ce-quiz-sub').textContent()).includes(themeName));
      check(`[${label}] on commence par les deux questions du degré 4`, await quiz.locator('.ce-quiz-item').count() === 2
        && (await quiz.locator('.ce-quiz-level').getAttribute('data-level')) === '4');
      const pick1 = await p.evaluate(id => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); return e.mine[id].quizPick?.regul; }, cand.id);
      check(`[${label}] questions tirées enregistrées pour l'élève`, pick1 && Object.keys(pick1).length === 6);
      const hint = await quiz.locator('.ce-quiz-item').first().locator('.ce-quiz-exp').textContent();
      check(`[${label}] réponse attendue affichée`, hint.length > 25, hint);
      check(`[${label}] pas de degré tant qu'on n'a pas répondu`, (await quiz.locator('[data-act=quiz-place]').count()) === 0);
      const ans = async (q, yes) => {
        const btn = typeof q === 'number' ? p.locator('#ceDialog .ce-quiz-item').nth(q).locator(`[data-ans="${yes ? 1 : 0}"]`)
          : p.locator(`#ceDialog .ce-quiz-item[data-topic=${q}] [data-ans="${yes ? 1 : 0}"]`);
        await btn.evaluate(e => e.scrollIntoView({block: 'center'}));
        await btn.click();
      };
      await ans(0, 1); await ans(1, 0);
      check(`[${label}] une réponse non satisfaisante en D4 : les questions du degré 3 apparaissent`, await p.locator('#ceDialog .ce-quiz-item').count() === 4
        && await p.locator('#ceDialog .ce-quiz-level[data-level="3"]').count() === 1 && await p.locator('#ceDialog .ce-quiz-level[data-level="2"]').count() === 0);
      await ans(2, 1); await ans(3, 1);
      check(`[${label}] D3 satisfait : le degré 2 n'est pas posé`, await p.locator('#ceDialog .ce-quiz-level[data-level="2"]').count() === 0);
      check(`[${label}] le popup reste ouvert pendant les réponses`, await p.evaluate(() => document.getElementById('ceDialog').open));
      const result = await p.locator('#ceDialog .ce-quiz-result').textContent();
      check(`[${label}] degré proposé D3 · 1,25`, result.includes('D3 · 1,25'), result.trim());
      const place = p.locator('#ceDialog [data-act=quiz-place]');
      await place.evaluate(e => e.scrollIntoView({block: 'center'}));
      await place.click();
      const ev = await p.evaluate(id => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); return e.mine[id]; }, cand.id);
      check(`[${label}] placé sur le curseur`, ev.d.regul === 3 && ev.v.regul === 1.25, JSON.stringify({d: ev.d.regul, v: ev.v.regul}));
      check(`[${label}] justification ajoutée`, /^Entretien : 3\/4/.test(ev.notes?.regul || '') && ev.notes.regul.includes('Non satisfait'), ev.notes?.regul);
      check(`[${label}] réponses conservées`, Object.keys(ev.quiz?.regul || {}).length === 4);
      check(`[${label}] curseur affiche D3 · 1,25`, (await p.textContent('.ce-slide-crit[data-crit=regul] .ce-slide-val')).includes('D3 · 1,25'));
      check(`[${label}] popup fermé après placement, avancement sous le bouton`, !(await p.evaluate(() => document.getElementById('ceDialog').open))
        && (await p.textContent('.ce-slide-crit[data-crit=regul] .ce-quiz-open')).includes('4/4 réponses · proposé D3 · 1,25'));
      await openBtn.click();
      check(`[${label}] indication « placé » à la réouverture`, await p.locator('#ceDialog .ce-quiz-ok').count() === 1);
      // Une réponse corrigée propose un autre degré ; une note déjà justifiée n'est pas écrasée.
      await ans(1, 1);
      check(`[${label}] nouvelle proposition après correction`, (await p.textContent('#ceDialog .ce-quiz-result')).includes('D4 · 2'));
      await p.locator('#ceDialog [data-act=quiz-place]').click();
      const ev2 = await p.evaluate(id => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); return e.mine[id]; }, cand.id);
      check(`[${label}] placé en D4 sans écraser la justification`, ev2.d.regul === 4 && ev2.v.regul === 2 && ev2.notes.regul === ev.notes.regul);
      await p.reload();
      await p.locator('[data-tab=eval]').click();
      await pick(cand.name.split(' ')[0]);
      await p.locator('.ce-slide-crit[data-crit=regul] [data-act=quiz-open]').click();
      check(`[${label}] réponses affichées après rechargement`, await p.locator('#ceDialog .ce-quiz-ans button.on').count() === 2);
      await p.locator('#ceDialog [data-act=quiz-close]').click();
      check(`[${label}] bouton ✕ ferme le popup`, !(await p.evaluate(() => document.getElementById('ceDialog').open)));
      // « Autre question » : une autre question sur le même point, sa réponse est effacée.
      await p.locator('.ce-slide-crit[data-crit=regul] [data-act=quiz-open]').click();
      const topic = await p.locator('#ceDialog .ce-quiz-item').first().getAttribute('data-topic');
      const before = await p.locator(`#ceDialog .ce-quiz-item[data-topic=${topic}]`).getAttribute('data-q');
      await p.locator(`#ceDialog .ce-quiz-item[data-topic=${topic}] [data-act=quiz-swap]`).click();
      const after = await p.locator(`#ceDialog .ce-quiz-item[data-topic=${topic}]`).getAttribute('data-q');
      const evS = await p.evaluate(id => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); return e.mine[id]; }, cand.id);
      check(`[${label}] « Autre question » change la question et efface sa réponse`, before !== after && evS.quizPick.regul[topic] === after && evS.quiz.regul[before] === undefined
        && await p.locator(`#ceDialog .ce-quiz-item[data-topic=${topic}] button.on`).count() === 0 && await p.locator('#ceDialog .ce-quiz-item').count() === 2);
      await p.locator('#ceDialog [data-act=quiz-close]').click();
      // Rotation : l'élève suivant reçoit d'autres questions.
      const other = await p.evaluate(id => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId);
        const c = e.candidates.find(c => c.id !== id && (!c.situation || c.situation === 'present') && !e.mine[c.id]?.done && !e.mine[c.id]?.quizPick); return c && c.name; }, cand.id);
      await pick(other.split(' ')[0]);
      await p.locator('.ce-slide-crit[data-crit=regul] [data-act=quiz-open]').click();
      const picks = await p.evaluate(() => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); return Object.values(e.mine).map(m => m?.quizPick?.regul).filter(Boolean); });
      const differ = picks.length === 2 && Object.values(picks[0]).every(id => !Object.values(picks[1]).includes(id));
      check(`[${label}] rotation : l'élève suivant n'a aucune question en commun`, differ, JSON.stringify(picks));
      await p.locator('#ceDialog [data-act=quiz-close]').click();
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`[${label}] aucun débordement horizontal`, ov <= 0, `${ov} px`);
    } catch (e) { check(`[${label}] exception`, false, e.message); }
    await p.close();
  }
  check('Aucune erreur JavaScript', !errs.length, errs.join(' | '));
  console.log(`${results.filter(Boolean).length}/${results.length} vérifications réussies`);
  await b.close();
  if (results.some(r => !r)) process.exit(1);
})();
