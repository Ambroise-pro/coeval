/* NODE_PATH=/tmp/coeval-browser/node_modules node tests/browser-fullscreen-filter-note.cjs
   Serve repository on port 8000 before running.
   Plein écran ; filtre « AFL évaluée / à évaluer » ; justification de la note dans le degré. */
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
    const ep = () => p.evaluate(() => { const db = CoEval.db; return db.epreuves.find(e => e.id === db.activeId); });
    try {
      await p.goto('http://127.0.0.1:8000/');
      await p.evaluate(() => localStorage.clear());
      await p.reload();
      const me = p.locator('#ceMeInput');
      if (await me.count()) { await me.fill('Alice'); await p.locator('[data-act=set-me]').first().click(); }
      await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      await p.locator('[data-act="demo"]').filter({visible: true}).first().click();

      // Plein écran
      await p.click('#ceFull');
      await p.waitForTimeout(300);
      const on = await p.evaluate(() => !!document.fullscreenElement);
      check(`[${label}] plein écran activé`, on && (await p.textContent('#ceFull')).includes('Quitter'));
      await p.click('#ceFull');
      await p.waitForTimeout(300);
      check(`[${label}] plein écran quitté`, !(await p.evaluate(() => !!document.fullscreenElement)) && (await p.textContent('#ceFull')).includes('Plein écran'));

      // Filtre AFL
      await p.locator('[data-tab=eval]').click();
      const expect = await p.evaluate(() => {
        const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId);
        const done = (c, ids) => ids.every(id => e.mine[c.id]?.v?.[id] != null);
        const elig = c => !c.situation || c.situation === 'present';
        const afl1 = ['amp', 'resp', 'post', 'param', 'ress', 'regul'];
        return {todo1: e.candidates.filter(c => elig(c) && !done(c, afl1)).length, done2: e.candidates.filter(c => elig(c) && done(c, ['projet', 'recueil'])).length};
      });
      await p.selectOption('#ceAfl', 'afl1-todo');
      const n1 = await p.locator('.ce-cand').count();
      check(`[${label}] filtre « AFL1 à évaluer »`, n1 === expect.todo1 && n1 > 0, `${n1} élève(s)`);
      await p.selectOption('#ceAfl', 'afl2-done');
      const n2 = await p.locator('.ce-cand').count();
      check(`[${label}] filtre « AFL2 évaluée »`, n2 === expect.done2, `${n2} élève(s)`);
      await p.locator('[data-act=clear-filters]').filter({visible: true}).first().click();
      check(`[${label}] « Afficher tous les élèves » efface le filtre AFL`, (await p.$eval('#ceAfl', s => s.value)) === '');

      // Justification
      await p.locator('#ceSearch').fill('SIMON');
      await p.locator('.ce-cand').first().click();
      const just = p.locator('.ce-slide-crit[data-crit=post] .ce-just');
      await just.locator('summary').click();
      await just.locator('textarea').fill('1,75 et non 2 : une compensation lombaire en fin de série');
      await p.waitForTimeout(100);
      const simon = async () => { const e = await ep(); const c = e.candidates.find(x => x.name.startsWith('SIMON')); return e.mine[c.id]; };
      check(`[${label}] justification enregistrée`, (await simon()).notes?.post === '1,75 et non 2 : une compensation lombaire en fin de série');
      await p.reload();
      await p.locator('[data-tab=eval]').click();
      await p.locator('#ceSearch').fill('SIMON');
      await p.locator('.ce-cand').first().click();
      check(`[${label}] justification conservée et affichée`, (await p.$eval('.ce-slide-crit[data-crit=post] .ce-just textarea', t => t.value)).includes('compensation lombaire')
        && await p.locator('.ce-slide-crit[data-crit=post] .ce-just[open]').count() === 1);

      // Au croisement : justification du collègue visible sur sa carte et dans le récapitulatif.
      await p.evaluate(() => {
        const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId);
        const name = Object.keys(e.others)[0];
        const row = e.others[name].rows['chevalier manon'];
        row.notes = {param: 'Charge régulée à chaque série, choix individualisé'};
        localStorage.setItem('df-coeval-v1', JSON.stringify(db));
      });
      await p.reload();
      await p.locator('[data-tab=cross]').click();
      await p.click('tr[data-act=cross-open]:has-text("CHEVALIER")');
      const harmo = p.locator('[data-act=detail-mode][data-mode=harmo]');
      if (await harmo.count()) await harmo.click();
      check(`[${label}] croisement : justification du collègue sur sa carte`, (await p.textContent('#crit-param')).includes('✎ Charge régulée à chaque série'));
      const recapBtn = p.locator('[data-act=detail-mode][data-mode=recap]');
      if (await recapBtn.count()) await recapBtn.first().click();
      check(`[${label}] récapitulatif : justification sous la note`, (await p.textContent('main')).includes('✎ Charge régulée à chaque série'));

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
