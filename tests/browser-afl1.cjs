/* NODE_PATH=/tmp/coeval-browser/node_modules node tests/browser-afl1.cjs
   Serve repository on port 8000 before running.
   Terminer l'AFL1 sans AFL2/AFL3, AFL2/AFL3 ensuite ; motif de décision ; fiche de retour avec degrés. */
const {chromium} = require('playwright');
const results = [];
const check = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + info : ''}`); };
const URL = 'http://127.0.0.1:8000/';
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  const p = await b.newPage({viewport: {width: 810, height: 1080}});
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  const ep = () => p.evaluate(() => { const db = CoEval.db; return db.epreuves.find(e => e.id === db.activeId); });
  const mine = async () => { const e = await ep(); return e.mine[e.candidates[0].id]; };
  try {
    await p.goto(URL);
    // Professeur, un élève : AFL1 notée, ni choix ni AFL2/AFL3. Un collègue a tout noté (degré différent en amplitude).
    await p.evaluate(() => {
      const afl1 = {amp: .75, resp: .75, post: 1.5, param: 3.25, ress: 1.75, regul: 1.5};
      const d1 = {amp: 4, resp: 4, post: 4, param: 4, ress: 4, regul: 3};
      const e = {id: 'e', title: 'Bac', role: 'prof', createdAt: 1, candidates: [{id: 'c', name: 'DUPONT Léa', classroom: 'TG2'}],
        mine: {c: {split: '', theme: '', role: '', v: {...afl1}, d: {...d1}, comment: '', updatedAt: 1, done: false}},
        others: {Bruno: {at: 1, batch: '', parts: null, rows: {'dupont lea': {split: '4-4', theme: '1', role: 'juge', v: {...afl1, amp: .5, projet: 1.5, recueil: 1.5, role: 1.5}, d: {...d1, amp: 3, projet: 3, recueil: 3, role: 3}, comment: '', updatedAt: 2, done: true}}}},
        final: {}, history: []};
      localStorage.setItem('df-coeval-v1', JSON.stringify({version: 2, me: 'Alice', epreuves: [e], activeId: 'e'}));
    });
    await p.reload();
    await p.locator('[data-tab=eval]').click();
    check('Bouton « Terminer l’évaluation AFL1 »', (await p.textContent('[data-act=finish]')).includes("Terminer l'évaluation AFL1"));
    await p.click('[data-act=finish]');
    const dlg = await p.textContent('#ceDialog');
    check('Pas bloqué par l’AFL2/AFL3 manquante', dlg.includes("Terminer l'évaluation AFL1 de DUPONT") && !dlg.includes('incomplète') && dlg.includes('Cela ne bloque pas'), dlg.slice(0, 120).replace(/\s+/g, ' '));
    await p.click('[data-act=confirm-done]');
    check('AFL1 terminée et verrouillée', (await mine()).done && await p.locator('.ce-slider:not(:disabled)').count() === 0);

    // Après coup, dans « Préparer » : choix et AFL2/AFL3 restent modifiables.
    await p.locator('[data-tab=prep]').click();
    for (const [f, v] of [['theme', '1'], ['split', '4-4'], ['role', 'juge']]) await p.click(`[data-act=set][data-field=${f}][data-value="${v}"]`);
    for (const id of ['projet', 'recueil', 'role']) {
      const s = p.locator(`.ce-slider[data-crit=${id}]`);
      await s.focus(); await p.keyboard.press('End'); await p.waitForTimeout(80);
      if (id !== 'role') { await s.focus(); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(80); }
    }
    const m = await mine();
    check('AFL2/AFL3 et choix saisis après la fin de l’AFL1', m.split === '4-4' && m.role === 'juge' && m.v.projet === 1.5 && m.v.recueil === 1.5 && m.v.role === 2 && m.done, JSON.stringify({split: m.split, v: m.v}));
    check('Pas compté comme « modification après validation »', !(await ep()).history.some(h => h.type === 'eval-edit'));

    // Motif de décision dans Croiser.
    await p.locator('[data-tab=cross]').click();
    await p.click('tr[data-act=cross-open]');
    const harmo = p.locator('[data-act=detail-mode][data-mode=harmo]');
    if (await harmo.count()) await harmo.click();
    await p.click('#crit-amp .ce-adopt:has-text("Bruno")');
    const motif = p.locator('#crit-amp input[data-act=motif]');
    check('Champ « Motif » après une décision du jury', await motif.count() === 1);
    await motif.fill('Butée en fin de série observée par les deux');
    await motif.press('Tab');
    await p.waitForTimeout(100);
    const e1 = await ep();
    check('Motif rangé avec la décision et dans l’historique', e1.final.c.crit.amp.motif === 'Butée en fin de série observée par les deux'
      && e1.history.filter(h => h.type === 'decision' && h.crit === 'amp').pop()?.motif === 'Butée en fin de série observée par les deux');
    await p.click('#crit-role .ce-adopt:has-text("Alice")');   // second désaccord de degré (rôle) à trancher aussi
    await p.click('[data-act=validate]');
    await p.click('[data-act=confirm-validate]');
    const recap = await p.textContent('main');
    check('Récapitulatif : motif affiché avec la décision', recap.includes('« Butée en fin de série observée par les deux »') && recap.includes('Motif : « Butée'));

    // Fiche de retour : degrés atteints et signification, sans les noms du jury.
    await p.evaluate(() => { window.print = () => { window.__fb = document.querySelector('#cePrint').innerText; window.dispatchEvent(new Event('afterprint')); }; });
    await p.click('[data-act=cross-back]');
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    await p.locator('[data-act=print-feedback]').filter({visible: true}).first().click();
    const fb = await p.evaluate(() => window.__fb || '');
    check('Fiche de retour : degré atteint et texte du critère', fb.includes('Degré atteint') && fb.includes('Amplitude correcte') && fb.includes('Charge adaptée, optimisée'), fb.slice(0, 100).replace(/\s+/g, ' '));
    check('Fiche de retour : pas de détail du jury', !fb.includes('Bruno') && !fb.includes('Décision du jury'));
  } catch (e) { check('exception', false, e.message); }
  check('Aucune erreur JavaScript', !errs.length, errs.join(' | '));
  console.log(`${results.filter(Boolean).length}/${results.length} vérifications réussies`);
  await b.close();
  if (results.some(r => !r)) process.exit(1);
})();
