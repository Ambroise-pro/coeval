/* Same Playwright/Chromium setup as browser-smoke.cjs. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  for(const touch of [false,true]) {
   const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1280,height:900},hasTouch:touch,isMobile:touch});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8000/');await page.locator('[data-act="demo"]').click();await page.locator('[data-tab="eval"]').click();await page.locator('#ceSearch').fill('ROBERT');
   const slider=page.locator('.ce-slider:not(:disabled)').last();await slider.scrollIntoViewIfNeeded();
   const crit=await slider.getAttribute('data-crit');
   const read=()=>page.evaluate(id=>{const ep=CoEval.db.epreuves.find(e=>e.id===CoEval.db.activeId),c=ep.candidates.find(c=>c.name.includes('ROBERT'));return {v:ep.mine[c.id].v[id],d:ep.mine[c.id].d[id]};},crit);
   assert.equal((await read()).v,undefined);
   const point=async ratio=>slider.evaluate((input,r)=>{const t=input.closest('.ce-slide').querySelector('.ce-slide-track').getBoundingClientRect(),b=input.getBoundingClientRect(),positions=input.dataset.pos.split(',').map(Number);let k=0;positions.forEach((p,i)=>{if(Math.abs(p-r*1000)<Math.abs(positions[k]-r*1000))k=i;});const [d,v]=input.dataset.steps.split(',')[k].split(':').map(Number);return {x:t.left+t.width*r,y:b.top+b.height/2,v,d};},ratio);
   let target=await point(.8);
   if(touch) await page.touchscreen.tap(target.x,target.y);
   else {
    await page.mouse.move(target.x,target.y);await page.mouse.down();
    assert.equal(Number(await slider.getAttribute('data-idx'))>0,true,'preview moves on first press');
    assert.equal((await read()).v,undefined,'save happens on release');
    await page.mouse.up();
   }
   assert.deepEqual(await read(),{v:target.v,d:target.d},'first click/tap saves the clicked step');
   // A second click/tap also directly repositions an already-filled slider.
   target=await point(.2);
   if(touch) await page.touchscreen.tap(target.x,target.y);else await page.mouse.click(target.x,target.y);
   assert.deepEqual(await read(),{v:target.v,d:target.d});
   if(!touch) {
    const from=await point(.3),to=await point(1.2),last=await point(1);
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();
    assert.deepEqual(await read(),{v:last.v,d:last.d},'drag outside the track clamps to last step');
    await page.keyboard.press('Home');const first=await read();await page.keyboard.press('ArrowRight');assert.notDeepEqual(await read(),first,'keyboard focus survives rerender');
   } else {
    const old=await read(),start=await point(.6),cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert.deepEqual(await read(),old,'cancelled touch does not change the stored mark');
   }
   // Locked sheets remain protected.
   await page.locator('#ceSearch').fill('ARNAUD');const locked=page.locator('.ce-slider').first();assert.equal(await locked.isDisabled(),true);
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Slider checks passed: first click, first touch, reposition, captured drag, keyboard, cancellation, locked sheet.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
