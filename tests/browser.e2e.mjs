import assert from 'node:assert/strict';import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {CDPBrowser} from '../src/adapters/cdp.mjs';import {ApprovedBrowserAdapter} from '../src/adapters/approved-browser.mjs';import {Store} from '../src/core/store.mjs';import {startServer} from '../src/server.mjs';import {fixtureServer} from './fixture-server.mjs';
process.env.BIEDBOT_AI_PROVIDER='offline';
const REPORTS=process.env.BIEDBOT_REPORT_DIR||'reports/revision-2026-09-08';
mkdirSync('work/browser-fixtures',{recursive:true});
const dir=mkdtempSync(join('work/browser-fixtures','biedbot-browser-')),results=[];let app,browser,fixture,adapter,store;
async function check(name,fn){const start=Date.now();await fn();results.push({name,status:'passed',durationMs:Date.now()-start});console.log('PASS',name);}
try{
  fixture=await fixtureServer();store=new Store(join(dir,'fixture.sqlite'));adapter=new ApprovedBrowserAdapter({store,contract:fixture.contract,profileDir:join(dir,'fixture-profile'),fixtureTest:true});
  await check('Echte Chromium: fixturecontract scant kandidaat',async()=>{const c=await adapter.discover();assert.equal(c.length,1);assert.equal(c[0].ask,10000);store.addCandidates(c);});
  let outgoing;
  await check('Andere verkoper na chatopening stopt vóór tekstinvoer en verzending',async()=>{fixture.flags.wrongSellerAfterOpen=true;await assert.rejects(()=>adapter.send({conversation:'fixture-1',action:'OPEN',text:'Mag nooit verzonden worden'}),/Verkeerde ontvanger/);assert.equal((await adapter.snapshot()).length,0);fixture.flags.wrongSellerAfterOpen=false;});
  await check('Echte Chromium: opening invullen, eenmaal versturen, receipt lezen',async()=>{store.reserveOpen('fixture-1');outgoing=store.claimSend();const result=await adapter.send(outgoing);assert.match(result.receipt,/^out-/);store.sent(outgoing.id,result.receipt);});
  await check('Echte Chromium: inbox importeren met stabiele bericht-ID',async()=>{await adapter.sync();assert.equal(store.db.prepare('SELECT COUNT(*) n FROM inbox').get().n,1);await adapter.sync();assert.equal(store.db.prepare('SELECT COUNT(*) n FROM inbox').get().n,1);});
  await check('Identiek bericht wordt niet blind opnieuw verstuurd',async()=>{await assert.rejects(()=>adapter.send(outgoing),/Identiek/);});
  await check('Afwijkende accountidentiteit blokkeert browseractie',async()=>{fixture.flags.wrongAccount=true;await assert.rejects(()=>adapter.discover(),/Account/);fixture.flags.wrongAccount=false;});
  await check('Platformwaarschuwing blokkeert browseractie',async()=>{fixture.flags.blocked=true;await assert.rejects(()=>adapter.discover(),/platformcontrole/);fixture.flags.blocked=false;});
  await check('Andere verkoper blokkeert verzending',async()=>{fixture.flags.wrongSeller=true;await assert.rejects(()=>adapter.send(outgoing),/Verkeerde ontvanger/);fixture.flags.wrongSeller=false;});
  await check('Fixturemodus kan niet naar externe website navigeren',async()=>{const a=new ApprovedBrowserAdapter({store,contract:{...fixture.contract,origin:'https://www.marktplaats.nl'},fixtureTest:true});await assert.rejects(()=>a.health(),/uitsluitend loopback/);});
  await adapter.close();adapter=null;store.close();store=null;await fixture.close();fixture=null;
  app=await startServer({dataDir:join(dir,'app')});browser=await new CDPBrowser().launch({profileDir:join(dir,'ui-profile'),fixtureTest:true});
  await browser.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false},browser.session);
  await browser.call('Page.addScriptToEvaluateOnNewDocument',{source:"window.__errors=[];window.addEventListener('error',e=>__errors.push(e.message));window.addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));"},browser.session);
  await check('Onboarding laadt vanuit beveiligde lokale app',async()=>{await browser.navigate(app.appUrl,{allowFragmentRemoval:true});await browser.waitFor("!!document.querySelector('#onboarding')");assert.equal(await browser.evaluate("document.querySelector('h1').textContent.includes('Jij de')"),true);});
  await check('Bedrijfsinstellingen worden daadwerkelijk opgeslagen',async()=>{await browser.evaluate(`(()=>{const f=document.querySelector('#onboarding');f.elements.company.value='Autobedrijf Voorbeeld';f.elements.signoff.value='Inkoopteam';f.elements.town.value='Delft';f.elements.understand.checked=true;f.requestSubmit();})()`);await browser.waitFor("!!document.querySelector('[data-action=toggle]')");assert.equal(app.store.settings().company,'Autobedrijf Voorbeeld');});
  await check('Autopilotknop start echte workerthread, niet alleen animatie',async()=>{await browser.evaluate("document.querySelector('[data-action=toggle]').click()");await browser.waitFor("document.body.textContent.includes('DEMO ACTIEF')");const end=Date.now()+20000;while(Date.now()<end&&app.store.dashboard().totals.hot<1)await new Promise(r=>setTimeout(r,300));assert.ok(app.store.dashboard().totals.hot>=1);assert.ok(app.store.dashboard().totals.sent>=3);});
  await new Promise(r=>setTimeout(r,2000));
  mkdirSync(REPORTS,{recursive:true});
  await check('Desktopdashboard renderen zonder JavaScriptfouten',async()=>{assert.deepEqual(await browser.evaluate('window.__errors'),[]);const png=await browser.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},browser.session);writeFileSync(join(REPORTS,'dashboard-desktop.png'),Buffer.from(png.data,'base64'));});
  await check('Gesprekkenpagina heeft automatische berichten en prijsplafond',async()=>{await browser.evaluate("document.querySelector('[data-page=inbox]').click()");await browser.waitFor("!!document.querySelector('.chat-money')");assert.ok(await browser.evaluate("document.body.textContent.includes('Hard plafond')"));const png=await browser.call('Page.captureScreenshot',{format:'png'},browser.session);writeFileSync(join(REPORTS,'gesprekken-desktop.png'),Buffer.from(png.data,'base64'));});
  await check('Alle navigatiepagina’s zijn bruikbaar',async()=>{for(const page of ['scout','deals','settings','health','billing','today']){await browser.evaluate(`document.querySelector('[data-page=${page}]').click()`);await browser.waitFor(`document.querySelector('[data-page=${page}]').getAttribute('aria-current')==='page'`);assert.ok(await browser.evaluate("document.querySelector('main').textContent.length>300"));}});
  await check('Mobiel formaat: geen horizontale pagina-overflow',async()=>{await browser.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},browser.session);await new Promise(r=>setTimeout(r,300));const sizes=await browser.evaluate('({full:document.documentElement.scrollWidth,view:window.innerWidth})');assert.ok(sizes.full<=sizes.view+1,JSON.stringify(sizes));const png=await browser.call('Page.captureScreenshot',{format:'png'},browser.session);writeFileSync(join(REPORTS,'dashboard-mobiel.png'),Buffer.from(png.data,'base64'));});
  await check('Noodstop zet worker werkelijk uit',async()=>{await browser.evaluate("document.querySelector('[data-action=stop]').click()");await browser.waitFor("document.body.textContent.includes('KLAAR VOOR START')");assert.equal(app.store.settings().autopilot,false);});
  await check('Volledige backupknop gebruikt herstelbaar formaat zonder bestandsdownload in test',async()=>{
    await browser.evaluate("document.querySelector('[data-page=health]').click()");
    await browser.evaluate(`window.prompt=()=> 'fixture-backup-password';window.__backup=null;const originalUrl=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{blob.text().then(text=>window.__backup=JSON.parse(text));return originalUrl(blob);};const originalClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)originalClick.call(this);};document.querySelector('[data-action=backup-full]').click();`);
    await browser.waitFor("window.__backup?.format==='biedbot-sqlite-aes256gcm-v1'");
    assert.ok(await browser.evaluate('window.__backup.data.length>100'));
  });
  await check('Gespreksinhoud wissen werkt via interface en bewaart niet-benaderenstatus',async()=>{
    await browser.evaluate("document.querySelector('[data-page=inbox]').click()");
    const id=await browser.evaluate("document.querySelector('[data-action=erase]').dataset.id");
    await browser.evaluate("window.confirm=()=>true;document.querySelector('[data-action=erase]').click()");
    await browser.waitFor("document.querySelector('.chat h2')?.textContent==='Gespreksinhoud gewist'");
    assert.equal(app.store.getConversation(id).state.phase,'SUPPRESSED');assert.equal(app.store.settings().autopilot,false);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM messages WHERE conversation=?').get(id).n,0);
  });
  await check('Geen runtimefouten na navigatie en noodstop',async()=>assert.deepEqual(await browser.evaluate('window.__errors'),[]));
}catch(e){results.push({name:'BROWSER_TEST_FAILURE',status:'failed',error:e.stack});console.error(e);process.exitCode=1;}
finally{await adapter?.close();store?.close();await fixture?.close();await browser?.close();await app?.close();mkdirSync(REPORTS,{recursive:true});writeFileSync(join(REPORTS,'browser-tests.json'),JSON.stringify({executedAt:new Date().toISOString(),platform:process.platform,node:process.version,fixtureDirectory:dir,profileRetention:'Local fixture data retained under ignored work/browser-fixtures for diagnosis; excluded from distribution.',scope:`Echte Chromium op ${process.platform}; lokale fixtures en demo. Geen live Marktplaats of twee-pc installatieacceptatie.`,passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,results},null,2));}
