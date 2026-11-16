/* NODE_PATH=/tmp/coeval-browser/node_modules node tests/browser-ergonomie.cjs
   Serve repository on port 8000 before running.
   Ergonomie tablette : liste en tiroir, barre d'action, en-tête compact, carte élève sur une ligne,
   libellés du curseur, critères repliés, justification par ✎, fiche verrouillée, retour à l'enregistrement. */
const {chromium} = require('playwright');
const results = [];
const check = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + info : ''}`); };
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  const errs = [];
  for (const [w, h, label] of [[810, 1080, 'portrait'], [1080, 810, 'paysage'], [390, 844, 'téléphone']]) {
    const p = await b.newPage({viewport: {width: w, height: h}});
    p.on('pageerror', e => errs.push(`${label}: ${e.message}`));
    p.on('dialog', d => d.accept());
    const drawer = w < 1000;
    const listShown = () => p.evaluate(() => { const r = document.querySelector('.ce-list').getBoundingClientRect(); return r.right > 10 && r.left > -10; });
    try {
      await p.goto('http://127.0.0.1:8000/');
      await p.evaluate(() => localStorage.clear());
      await p.reload();
      const me = p.locator('#ceMeInput');
      if (await me.count()) { await me.fill('Alice'); await p.locator('[data-act=set-me]').first().click(); }
      await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      await p.locator('[data-act="demo"]').filter({visible: true}).first().click();
      await p.locator('[data-tab=eval]').click();
      await p.evaluate(() => window.scrollTo(0, 0));

      // 3 · En-tête compact
      const top = await p.evaluate(() => document.querySelector('.ce-cand-head').getBoundingClientRect().top);
      check(`[${label}] en-tête compact : fiche visible tôt`, top < (w < 700 ? 260 : 200), `${Math.round(top)} px`);
      check(`[${label}] pastilles d'état à la place du bandeau`, await p.locator('.ce-notice-mini [data-act=readiness]').count() === 1 && await p.locator('.ce-notice-mini [data-act=backup]').count() === 1);

      // 1 · Liste en tiroir
      if (drawer) {
        check(`[${label}] liste repliée, bouton 👥 visible`, !(await listShown()) && await p.locator('[data-act=list-open]').isVisible());
        await p.locator('[data-act=list-open]').click();
        await p.waitForTimeout(300);
        check(`[${label}] le bouton ouvre la liste`, await listShown());
        await p.keyboard.press('Escape');
        await p.waitForTimeout(300);
        check(`[${label}] Échap ferme la liste`, !(await listShown()));
        await p.locator('[data-act=list-open]').click();
        await p.locator('#ceSearch').fill('ROBERT');
        await p.locator('.ce-cand').first().click();
        await p.waitForTimeout(300);
        check(`[${label}] choisir un élève ferme la liste`, !(await listShown()) && (await p.textContent('.ce-cand-head h2')).includes('ROBERT'));
      } else {
        check(`[${label}] liste toujours visible sur le côté`, await listShown() && !(await p.locator('[data-act=list-open]').isVisible()));
        await p.locator('#ceSearch').fill('ROBERT');
        await p.locator('.ce-cand').first().click();
      }

      // 4 · Carte élève sur une ligne, menu ⋯
      const navH = await p.evaluate(() => document.querySelector('.ce-cand-head .ce-nav').getBoundingClientRect().height);
      check(`[${label}] carte élève compacte`, navH < (w < 520 ? 110 : 60), `${Math.round(navH)} px`);
      await p.locator('.ce-menu>summary').click();
      check(`[${label}] menu ⋯ : situation, Passage, QR`, await p.locator('.ce-menu-pop [data-act=edit-candidate]').isVisible() && await p.locator('.ce-menu-pop [data-act=passage]').isVisible() && await p.locator('.ce-menu-pop [data-act=single-qr]').isVisible());
      await p.locator('.ce-menu>summary').click();

      // 6 · Critères notés repliés
      const folded = await p.locator('.ce-crit-sum').count();
      check(`[${label}] critères notés repliés sur une ligne`, folded === 3 && await p.locator('.ce-slider').count() === 3, `${folded} repliés`);
      await p.locator('[data-act=crit-expand][data-crit=amp]').click();
      check(`[${label}] un toucher déplie le critère`, await p.locator('.ce-slider[data-crit=amp]').count() === 1);
      await p.locator('[data-act=crit-collapse][data-crit=amp]').click();
      check(`[${label}] ▴ le replie`, await p.locator('.ce-slider[data-crit=amp]').count() === 0);

      // 5 · Libellés du curseur : pas de doublon, bornes seulement sur les longues échelles
      const labels = async id => p.$$eval(`.ce-slide-crit[data-crit=${id}] .ce-slide-pts span`, ss => ss.filter(s => getComputedStyle(s).visibility !== 'hidden' && getComputedStyle(s).display !== 'none').map(s => s.textContent));
      const reg = await labels('regul');
      check(`[${label}] pas de valeur répétée à la frontière des degrés`, reg.every((t, i) => i === 0 || t !== reg[i - 1]), reg.join(' '));
      if (w >= 700) {
        const par = await labels('param');
        check(`[${label}] échelle longue : bornes des degrés seulement`, par.join(' ') === '0 1 1,25 2 2,25 3 3,25 4', par.join(' '));
      }

      // 7 · Retour à l'enregistrement, critère gardé ouvert, ✎
      const sl = p.locator('.ce-slider[data-crit=param]');
      await sl.evaluate(e => e.scrollIntoView({block: 'center'}));
      const bb = await sl.boundingBox();
      await p.mouse.click(bb.x + bb.width * .6, bb.y + bb.height / 2);
      check(`[${label}] note enregistrée : retour visuel`, await p.locator('.ce-slide-crit[data-crit=param].ce-saved').count() === 1);
      check(`[${label}] le critère qu'on vient de noter reste ouvert`, await p.locator('.ce-slider[data-crit=param]').count() === 1);
      await p.locator('.ce-slide-crit[data-crit=param] [data-act=note-toggle]').click();
      check(`[${label}] ✎ ouvre la justification et place le curseur dedans`, await p.locator('.ce-slide-crit[data-crit=param] .ce-just[open]').count() === 1
        && await p.evaluate(() => document.activeElement?.dataset.act === 'crit-note'));

      // 2 · Barre d'action : Terminer AFL1 et Suivant, sans masquer la fiche
      check(`[${label}] barre du bas : Terminer AFL1 et Suivant`, await p.locator('.ce-actionbar [data-act=finish]').isVisible() && await p.locator('.ce-actionbar [data-act=step][data-step="1"]').count() === 1);
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await p.waitForTimeout(150);
      const free = await p.evaluate(() => { const bar = document.querySelector('.ce-actionbar').getBoundingClientRect(); const last = document.querySelector('.ce-sheet-end').getBoundingClientRect(); return bar.top - last.bottom; });
      check(`[${label}] en bas de page, la barre ne recouvre pas la fiche`, free >= 0, `${Math.round(free)} px`);
      if (drawer) { await p.locator('[data-act=list-open]').click(); }
      await p.locator('[data-act=clear-filters]').filter({visible: true}).first().click();
      if (drawer) { await p.keyboard.press('Escape'); }
      const name1 = await p.textContent('.ce-cand-head h2');
      await p.locator('.ce-actionbar [data-act=step][data-step="1"]').click();
      check(`[${label}] « Suivant » passe à l'élève suivant`, (await p.textContent('.ce-cand-head h2')) !== name1);

      // 7 · Fiche verrouillée grisée
      if (drawer) await p.locator('[data-act=list-open]').click();
      await p.locator('#ceSearch').fill('ARNAUD');
      await p.locator('.ce-cand').first().click();
      check(`[${label}] fiche terminée : grisée, tout replié, pas de Terminer`, await p.locator('.ce-sheet.locked').count() === 1 && await p.locator('.ce-crit-sum').count() === 6
        && await p.locator('.ce-actionbar [data-act=finish]').count() === 0);

      const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`[${label}] aucun débordement horizontal`, ov <= 0, `${ov} px`);
    } catch (e) { check(`[${label}] exception`, false, e.message.split('\n')[0]); }
    await p.close();
  }
  check('Aucune erreur JavaScript', !errs.length, errs.join(' | '));
  console.log(`${results.filter(Boolean).length}/${results.length} vérifications réussies`);
  await b.close();
  if (results.some(r => !r)) process.exit(1);
})();
