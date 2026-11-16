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
      await p.locator('#ceSearch').fill(cand.name.split(' ')[0]);
      await p.locator('.ce-cand').first().click();
      const quiz = p.locator('.ce-slide-crit[data-crit=regul] .ce-quiz');
      check(`[${label}] questions affichées sous la régulation, ouvertes`, await quiz.count() === 1 && await quiz.evaluate(d => d.open));
      const themeName = {1: 'Puissance', 2: 'Tonification', 3: 'Volume'}[cand.theme];
      check(`[${label}] questions adaptées au mobile (${themeName})`, (await quiz.locator('summary').textContent()).includes(themeName));
      const hint = await quiz.locator('.ce-quiz-item[data-q=q2b] .ce-quiz-exp').textContent();
      const expected = {1: ['80 à 90', '4 à 8'], 2: ['40 à 60', '15 à 25'], 3: ['60 à 80', '8 à 15']}[cand.theme];
      check(`[${label}] paramètres attendus propres au mobile (% RM, répétitions)`, hint.includes(expected[0] + '\u00a0% de la RM') && hint.includes('Répétitions : ' + expected[1]) && await quiz.locator('.ce-quiz-item[data-q=q2b] li').count() === 5, hint);
      check(`[${label}] pas de degré tant qu'on n'a pas répondu`, (await quiz.locator('[data-act=quiz-place]').count()) === 0);
      const ans = async (q, yes) => {
        const btn = p.locator(`.ce-slide-crit[data-crit=regul] .ce-quiz-item[data-q=${q}] [data-ans="${yes ? 1 : 0}"]`);
        await btn.evaluate(e => e.scrollIntoView({block: 'center'}));
        await btn.click();
      };
      for (const [q, y] of [['q2a', 1], ['q2b', 1], ['q3a', 1], ['q3b', 1], ['q4a', 1], ['q4b', 0]]) await ans(q, y);
      const result = await p.locator('.ce-slide-crit[data-crit=regul] .ce-quiz-result').textContent();
      check(`[${label}] degré proposé D3 · 1,25`, result.includes('D3 · 1,25'), result.trim());
      const place = p.locator('.ce-slide-crit[data-crit=regul] [data-act=quiz-place]');
      await place.evaluate(e => e.scrollIntoView({block: 'center'}));
      await place.click();
      const ev = await p.evaluate(id => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); return e.mine[id]; }, cand.id);
      check(`[${label}] placé sur le curseur`, ev.d.regul === 3 && ev.v.regul === 1.25, JSON.stringify({d: ev.d.regul, v: ev.v.regul}));
      check(`[${label}] justification ajoutée`, /^Entretien : 5\/6/.test(ev.notes?.regul || '') && ev.notes.regul.includes('prochaine séance'), ev.notes?.regul);
      check(`[${label}] réponses conservées`, JSON.stringify(ev.quiz?.regul) === JSON.stringify({q2a: true, q2b: true, q3a: true, q3b: true, q4a: true, q4b: false}));
      check(`[${label}] curseur affiche D3 · 1,25`, (await p.textContent('.ce-slide-crit[data-crit=regul] .ce-slide-val')).includes('D3 · 1,25'));
      check(`[${label}] indication « placé »`, await p.locator('.ce-slide-crit[data-crit=regul] .ce-quiz-ok').count() === 1);
      // Une réponse corrigée propose un autre degré ; une note déjà justifiée n'est pas écrasée.
      await ans('q4b', 1);
      check(`[${label}] nouvelle proposition après correction`, (await p.textContent('.ce-slide-crit[data-crit=regul] .ce-quiz-result')).includes('D4 · 2'));
      await p.locator('.ce-slide-crit[data-crit=regul] [data-act=quiz-place]').click();
      const ev2 = await p.evaluate(id => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); return e.mine[id]; }, cand.id);
      check(`[${label}] placé en D4 sans écraser la justification`, ev2.d.regul === 4 && ev2.v.regul === 2 && ev2.notes.regul === ev.notes.regul);
      await p.reload();
      await p.locator('[data-tab=eval]').click();
      await p.locator('#ceSearch').fill(cand.name.split(' ')[0]);
      await p.locator('.ce-cand').first().click();
      check(`[${label}] réponses affichées après rechargement`, await p.locator('.ce-slide-crit[data-crit=regul] .ce-quiz-ans button.on').count() === 6);
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
