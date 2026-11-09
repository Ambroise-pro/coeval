/* NODE_PATH=/tmp/coeval-browser/node_modules node tests/browser-smoke.cjs
   Serve repository on port 8000 before running. Uses an isolated browser profile. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const errors=[];
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const act=a=>page.locator(`[data-act="${a}"]`).filter({visible:true}).first();
 await page.goto('http://127.0.0.1:8000/');await act('demo').click();
 await page.locator('[data-tab="home"]').click();await page.getByRole('heading',{name:/EXEMPLE/}).waitFor();
 assert.equal(await page.locator('.ce-dashboard-grid>div').count(),3);
 await page.locator('[data-tab="eval"]').click();
 await page.locator('#ceSearch').fill('ROBERT');assert.equal(await page.locator('.ce-cand').count(),1);
 await page.locator('#ceSearch').fill('introuvable');assert.equal(await page.locator('.ce-sheet').count(),0);
 await act('clear-filters').click();await page.locator('#ceSearch').fill('ROBERT');
 await act('passage').click();assert.ok(await page.locator('body').evaluate(e=>e.classList.contains('ce-passage')));
 await act('edit-candidate').click();await page.locator('#ceEditGroup').fill('Atelier A');await page.locator('#ceEditOrder').fill('1');await act('save-candidate').click();
 await page.locator('#ceGroup').selectOption({label:'Atelier A'});assert.equal(await page.locator('.ce-cand').count(),1);
 // A real slider edit followed by undo restores the value.
 const before=await page.evaluate(()=>{let e=CoEval.db.epreuves.find(e=>e.id===CoEval.db.activeId);let c=e.candidates.find(c=>c.name.includes('ROBERT'));return JSON.stringify(e.mine[c.id].v);});
 await page.locator('.ce-slider:not(:disabled)').first().focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Tab');
 await act('undo-input').click();
 assert.equal(await page.evaluate(()=>{let e=CoEval.db.epreuves.find(e=>e.id===CoEval.db.activeId);let c=e.candidates.find(c=>c.name.includes('ROBERT'));return JSON.stringify(e.mine[c.id].v);}),before);
 // Administration and reversible deletion.
 await page.locator('#ceCandidates').click();const n=await page.locator('.ce-cand-edit li').count();await page.locator('[data-act="del-cand"]').first().click();assert.equal(await page.locator('.ce-cand-edit li').count(),n-1);
 await page.locator('#ceDialog [data-act="manage"]').click();await act('restore-candidate').click();await page.locator('#ceDialog button[value="close"]').click();
 assert.equal(await page.evaluate(()=>CoEval.db.epreuves.find(e=>e.id===CoEval.db.activeId).candidates.length),n);
 // CSV preview is non-mutating until explicit confirmation.
 await page.locator('#ceCandidates').click();await page.locator('#ceCsv').setInputFiles({name:'liste.csv',mimeType:'text/csv',buffer:Buffer.from('Nom;Classe\nNouvel Élève;TG3\nNouvel Élève;TG3')});
 await page.getByRole('heading',{name:'Vérifier la liste avant import'}).waitFor();
 assert.match(await page.locator('#ceDialog').innerText(),/1 nouveaux élèves/);
 assert.equal(await page.evaluate(()=>CoEval.db.epreuves.find(e=>e.id===CoEval.db.activeId).candidates.length),n);
 await act('confirm-csv').click();assert.equal(await page.evaluate(()=>CoEval.db.epreuves.find(e=>e.id===CoEval.db.activeId).candidates.length),n+1);
 // Cancelled native share must not mark a backup complete.
 const backupBefore=await page.evaluate(()=>CoEval.db.epreuves.find(e=>e.id===CoEval.db.activeId).backupAt||0);
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('cancel','AbortError');}});});
 await act('backup').click();await page.waitForFunction(()=>document.getElementById('ceToast').textContent.includes('Partage annulé'));
 assert.equal(await page.evaluate(()=>CoEval.db.epreuves.find(e=>e.id===CoEval.db.activeId).backupAt||0),backupBefore);
 // Persistent warning if storage fails.
 await page.evaluate(()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};});
 await act('edit-candidate').click();await page.locator('#ceEditSituation').selectOption('absent');await act('save-candidate').click();await page.locator('.ce-storage-error').waitFor();
 await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageSet;});
 // Archive and reopen.
 await page.locator('#ceCandidates').click();await act('archive').click();assert.equal(await page.locator('[data-act="unarchive"]').count(),1);await act('unarchive').click();
 await page.reload();await page.locator('[data-tab="home"]').waitFor();
 // Browser-level offline readiness and navigation with no network.
 await act('readiness').click();await page.waitForFunction(()=>document.getElementById('ceOfflineCheck')?.textContent.includes('Application disponible'));
 await page.locator('#ceDialog button[value="close"]').click();await context.setOffline(true);await page.reload();await page.locator('[data-tab="eval"]').click();await page.locator('#ceSearch').waitFor();await context.setOffline(false);
 // Real mobile layout, no horizontal overflow.
 await page.setViewportSize({width:390,height:844});await page.locator('[data-tab="home"]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.screenshot({path:'/tmp/coeval-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await browser.close();console.log('Browser smoke passed: dashboard, search, passage, undo, groups, trash, CSV preview, cancelled backup, storage failure, archive, offline reload, mobile.');
})().catch(e=>{console.error(e);process.exit(1);});
