/* Isolated two-device exchange and print checks; same setup as browser-smoke.cjs. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const errors=[];
 const a=await browser.newContext(),b=await browser.newContext({permissions:['camera']});
 const sender=await a.newPage(),receiver=await b.newPage();
 for(const page of [sender,receiver]){page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto('http://127.0.0.1:8000/');}
 await sender.locator('[data-act="demo"]').click();
 await receiver.locator('#ceMeInput').fill('Professeur destinataire');await receiver.locator('[data-act="set-me"]').click();
 const codes=await sender.evaluate(()=>{const e=CoEval.db.epreuves[0];return CoEval.core.qrParts(e,CoEval.db.me).join('\n');});
 await receiver.evaluate(code=>CoEval.importText(code),codes);
 assert.equal(await receiver.evaluate(()=>CoEval.db.epreuves.length),0);
 await receiver.locator('[data-act="confirm-exchange"]').click();await receiver.locator('[data-act="go-dashboard"]').click();
 assert.equal(await receiver.evaluate(()=>CoEval.db.epreuves[0].candidates.length),28);
 // Stable receipts work via QR rendering and paste on the other device.
 await receiver.locator('[data-tab="cross"]').click();
 const more=receiver.locator('details').filter({has:receiver.locator('[data-act="receipt"]')});await more.locator('summary').first().click();
 await receiver.locator('[data-act="receipt"]').click();const ack=await receiver.locator('#ceDialog textarea').inputValue();assert.ok(ack.startsWith('COEVAL-ACK:'));
 await sender.evaluate(code=>CoEval.importText(code),ack);assert.equal(await sender.evaluate(()=>CoEval.db.epreuves[0].receipts.length),1);
 await receiver.locator('#ceDialog button[value="close"]').click();
 // Import cancellation leaves all data untouched.
 const before=await receiver.evaluate(()=>JSON.stringify(CoEval.db));await receiver.evaluate(code=>CoEval.importText(code),codes);await receiver.locator('#ceDialog button[value="close"]').click();assert.equal(await receiver.evaluate(()=>JSON.stringify(CoEval.db)),before);
 // Native-share success and downloaded-copy confirmation are distinct.
 await sender.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{}});});
 await sender.locator('#ceNotice [data-act="backup"]').click();await sender.waitForFunction(()=>CoEval.db.epreuves[0].backupAt>0);
 await sender.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});});
 const downloadPromise=sender.waitForEvent('download');await sender.locator('#ceNotice [data-act="backup"]').click();const downloaded=await downloadPromise;assert.ok(downloaded.suggestedFilename().endsWith('.json'));
 await sender.locator('[data-act="confirm-backup"]').click();assert.equal(await sender.locator('#ceDialog').evaluate(e=>e.open),false);
 // Pupil feedback prints only validated retained marks, without colleague details/history.
 await sender.locator('[data-tab="cross"]').click();await sender.locator('summary').filter({hasText:'Bilan, exports, impression'}).click();await sender.locator('[data-act="feedback"]').click();await sender.locator('[data-feedback]').first().fill('Bonne maîtrise, poursuivre les efforts.');await sender.locator('#ceDialog button[value="close"]').click();
 await sender.evaluate(()=>{window.print=()=>{window.printedContent=document.getElementById('cePrint').innerHTML;window.dispatchEvent(new Event('afterprint'));};});
 await sender.locator('[data-act="print-feedback"]').click();const printed=await sender.evaluate(()=>window.printedContent);assert.match(printed,/Note validée/);assert.match(printed,/Bonne maîtrise/);assert.ok(!printed.includes('Décisions et étapes'));
 // Cross detail remains functional after workflow changes.
 await sender.locator('tr[data-act="cross-open"]').first().click();await sender.locator('[data-act="cross-back"]').click();
 // Camera starts and is stopped when its dialog closes.
 await receiver.locator('[data-tab="home"]').click();await receiver.locator('[data-act="readiness"]').first().click();await receiver.locator('[data-act="test-camera"]').click();await receiver.waitForFunction(()=>document.getElementById('ceCameraTest')?.textContent.includes('opérationnelle'));
 await receiver.evaluate(()=>window.cameraTrack=document.getElementById('ceTestVideo').srcObject.getTracks()[0]);await receiver.locator('#ceDialog button[value="close"]').click();await receiver.waitForFunction(()=>window.cameraTrack.readyState==='ended');
 // Mobile marking layout, including sticky pupil identity.
 await sender.setViewportSize({width:390,height:844});await sender.locator('[data-tab="eval"]').click();await sender.locator('#ceSearch').fill('ROBERT');await sender.locator('[data-act="passage"]').click();assert.ok(await sender.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await sender.screenshot({path:'/tmp/coeval-passage.png',fullPage:true});
 assert.deepEqual(errors,[]);await browser.close();console.log('Two-device browser checks passed: transactional exchange, receipt, cancellation, backup success/download, pupil feedback, cross detail, camera lifecycle, mobile marking.');
})().catch(e=>{console.error(e);process.exit(1);});
