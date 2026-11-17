/* NODE_PATH=/tmp/coeval-browser/node_modules node tests/browser-prep-guide.cjs
   Serve repository on port 8000 before running. SHOTS=<dossier> pour enregistrer des captures.
   Assistant de préparation du professeur : épreuve → élèves → préparation de chaque élève
   → ordre de passage → QR du kit ; le co-évaluateur reçoit tout dans l'ordre choisi. */
const {chromium} = require('playwright');
const results = [];
const check = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + info : ''}`); };
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  const errs = [];
  for (const [w, h, label] of [[810, 1080, 'tablette'], [390, 844, 'téléphone']]) {
    const ctx = await b.newContext({viewport: {width: w, height: h}});
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${label}: ${e.message}`));
    p.on('dialog', d => d.accept(d.defaultValue()));
    const ep = () => p.evaluate(() => { const db = CoEval.db; return db.epreuves.find(e => e.id === db.activeId); });
    const shot = async n => { if (SHOTS && w === 810) await p.screenshot({path: `${SHOTS}/${n}.png`}); };
    try {
      await p.goto('http://127.0.0.1:8000/');
      await p.evaluate(() => localStorage.clear());
      await p.reload();
      await p.locator('#ceMeInput').fill('M. Prof');
      await p.locator('[data-act=set-me]').first().click();
      await p.locator('[data-act=new-epreuve]').first().click();
      // Étape 1 : élèves
      await p.locator('.ce-p-steps').waitFor();
      check(`[${label}] nouvelle épreuve : étape 1 « Élèves »`, (await p.textContent('.ce-p-steps .here')).includes('Élèves') && await p.locator('.ce-p-steps [data-step="2"]').isDisabled());
      await shot('p1-eleves');
      await p.locator('#ceNames').fill('MARTIN Hugo\nDUPONT Léa\nBERNARD Inès');
      await p.locator('[data-act=add-names]').click();
      await p.locator('[data-act=confirm-csv]').click();
      check(`[${label}] élèves ajoutés, étape suivante possible`, (await ep()).candidates.length === 3 && (await p.textContent('.ce-p-card')).includes('3 élève(s)') && !(await p.locator('.ce-p-card [data-act=p-step][data-step="2"]').isDisabled()));
      await p.locator('.ce-p-card [data-act=p-step][data-step="2"]').click();
      // Étape 2 : préparer chaque élève (mobile, répartition, rôle, AFL2, AFL3)
      check(`[${label}] étape 2 : consigne et fiche de préparation`, (await p.textContent('.ce-p-help')).includes('0/3') && await p.locator('.ce-cand-head').count() === 1);
      await shot('p2-preparation');
      for (let i = 0; i < 3; i++) {
        for (const [f, v] of [['theme', '3'], ['split', '4-4'], ['role', 'partenaire']]) {
          const bt = p.locator(`[data-act=set][data-field=${f}][data-value="${v}"]`);
          if (await bt.count()) await bt.first().click();
        }
        for (const id of ['projet', 'recueil', 'role']) {
          const sl = p.locator(`.ce-slider[data-crit=${id}]`);
          await sl.evaluate(e => e.scrollIntoView({block: 'center'}));
          const pt = await sl.evaluate(input => { const t = input.closest('.ce-slide').querySelector('.ce-slide-track').getBoundingClientRect(), b = input.getBoundingClientRect(); return {x: t.left + t.width * .8, y: b.top + b.height / 2}; });
          await p.mouse.click(pt.x, pt.y);
        }
        if (i < 2) await p.locator('.ce-actionbar [data-act=step][data-step="1"]').click();
      }
      check(`[${label}] trois fiches prêtes`, (await p.textContent('.ce-p-steps [data-step="2"]')).includes('3/3') && await p.locator('.ce-p-steps [data-step="2"].ok').count() === 1);
      await p.locator('.ce-p-help [data-act=p-step]').click();
      // Étape 3 : ordre de passage, en touchant les élèves
      check(`[${label}] étape 3 : ordre de passage (facultatif)`, (await p.textContent('.ce-p-card h2')).includes('Ordre de passage') && await p.locator('.ce-p-order button').count() === 3);
      for (const n of ['MARTIN', 'BERNARD', 'DUPONT']) await p.locator(`.ce-p-order button:has-text("${n}")`).click();
      let order = (await ep()).candidates.map(c => [c.name.split(' ')[0], c.order]).sort((a, b) => a[1] - b[1]).map(x => x.join(':')).join(' ');
      check(`[${label}] ordre = ordre des touchers`, order === 'MARTIN:1 BERNARD:2 DUPONT:3', order);
      await shot('p3-ordre');
      await p.locator('.ce-p-order button:has-text("MARTIN")').click();
      order = (await ep()).candidates.filter(c => c.order).map(c => [c.name.split(' ')[0], c.order]).sort((a, b) => a[1] - b[1]).map(x => x.join(':')).join(' ');
      check(`[${label}] retirer un élève renumérote les autres`, order === 'BERNARD:1 DUPONT:2', order);
      await p.locator('.ce-p-order button:has-text("MARTIN")').click();
      await p.locator('.ce-p-card [data-act=p-step][data-step="4"]').click();
      // Étape 4 : kit
      await p.waitForFunction(() => !!document.getElementById('ceKitQr')?.dataset.link);
      check(`[${label}] étape 4 : QR du kit, consignes, tout est prêt`, await p.locator('#ceKitQr svg').count() === 1 && await p.locator('.ce-p-howto li').count() === 3 && (await p.textContent('.ce-p-card')).includes('Les 3 élèves sont préparés'));
      check(`[${label}] étape 4 cochée`, !!(await ep()).kitShownAt);
      await shot('p4-kit');
      await p.locator('.ce-p-card details.ce-more>summary').click();
      await p.locator('[data-act=prep-share][data-kit="0"]').click();
      check(`[${label}] autre méthode : QR de préparation sans doublon de kit`, await p.locator('#ceDialog .ce-qr svg').count() === 1 && await p.locator('#ceDialog #ceKitQr').count() === 0);
      await p.locator('#ceDialog button[value="close"]').last().click();
      const link = await p.$eval('#ceKitQr', el => el.dataset.link);
      // Le co-évaluateur reçoit la classe dans l'ordre choisi.
      const c2 = await b.newContext({viewport: {width: w, height: h}});
      const q = await c2.newPage();
      q.on('pageerror', e => errs.push(`${label} coéval: ${e.message}`));
      await q.goto(link);
      await q.locator('#ceMeInput').fill('Mme Coeval');
      await q.locator('[data-act=set-me]').click();
      await q.locator('[data-act=tour-end]').first().click();
      check(`[${label}] co-évaluateur : premier passage = n° 1, préparations reçues`, (await q.textContent('.ce-g-name')).includes('BERNARD') && (await q.textContent('.ce-g-chips')).includes('Volume'));
      await c2.close();
      // Une préparation incomplète est signalée à l'étape 4, avec un accès direct à l'élève.
      await p.evaluate(() => { const db = CoEval.db, e = db.epreuves.find(x => x.id === db.activeId); const c = e.candidates.find(x => x.name.startsWith('DUPONT')); delete e.mine[c.id].v.projet; localStorage.setItem('df-coeval-v1', JSON.stringify(db)); });
      await p.reload();
      await p.locator('[data-tab=prep]').click();
      await p.locator('.ce-p-steps [data-step="4"]').click();
      check(`[${label}] élève incomplet signalé`, (await p.textContent('.ce-p-missing')).includes('1 élève(s)'));
      await p.locator('.ce-p-fix button:has-text("DUPONT")').click();
      check(`[${label}] « corriger » ouvre sa fiche de préparation`, (await p.textContent('.ce-p-steps .here')).includes('Préparation') && (await p.textContent('.ce-cand-head h2')).includes('DUPONT'));
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`[${label}] aucun débordement horizontal`, ov <= 0, `${ov} px`);
    } catch (err) { check(`[${label}] exception`, false, err.message.split('\n')[0]); }
    await ctx.close();
  }
  check('Aucune erreur JavaScript', !errs.length, errs.join(' | '));
  console.log(`${results.filter(Boolean).length}/${results.length} vérifications réussies`);
  await b.close();
  if (results.some(r => !r)) process.exit(1);
})();
