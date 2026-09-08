import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../src/core/store.mjs';
import {Engine} from '../src/worker/engine.mjs';
import {classifyLocal,decide,renderDecision} from '../src/core/negotiation.mjs';
import {seeded,firstSent,temp,NOW} from './helpers.mjs';

function acceptance(store) {
  firstSent(store);
  store.ingest('price','a-1','Voor EUR 8000 mag hij weg',NOW+1);
  const input=store.nextInput(NOW+1);
  const decision=decide(store.getConversation('a-1').state,classifyLocal(input.text));
  assert.equal(decision.action,'ACCEPT');
  return {input,decision,text:renderDecision(decision,store.settings())};
}
function queuedAcceptance(store) {
  const {input,decision,text}=acceptance(store);
  assert.equal(store.queueDecision(input,decision,text,NOW+1),true);
  return store.db.prepare("SELECT * FROM outbox WHERE action='ACCEPT'").get();
}

test('nieuwe input vóór queue verwerpt oud ACCEPT en bewaart nieuwste input',t=>{
  const s=seeded(t,1),{input,decision,text}=acceptance(s);
  s.ingest('withdrawal','a-1','Niet akkoord',NOW+2);
  assert.equal(s.queueDecision(input,decision,text,NOW+3),false);
  assert.equal(s.claimSend(NOW+3),null);
  assert.equal(s.nextInput(NOW+3).id,'withdrawal');
});
test('gelijke berichttijd: laatst ingelezen input maakt oud ACCEPT ongeldig',t=>{
  const s=seeded(t,1),{input,decision,text}=acceptance(s);
  s.ingest('withdrawal','a-1','Niet akkoord',NOW+1);
  assert.equal(s.queueDecision(input,decision,text,NOW+2),false);
  assert.equal(s.nextInput(NOW+2).id,'withdrawal');
});
test('nieuwe input na queue trekt ACCEPT direct in',t=>{
  const s=seeded(t,1),out=queuedAcceptance(s);
  s.ingest('withdrawal','a-1','Niet akkoord',NOW+2);
  assert.equal(s.db.prepare('SELECT status FROM outbox WHERE id=?').get(out.id).status,'cancelled');
  assert.equal(s.claimSend(NOW+3),null);
  assert.equal(s.nextInput(NOW+3).id,'withdrawal');
});
test('ingelezen duplicaat trekt geldig ACCEPT niet in',t=>{
  const s=seeded(t,1);queuedAcceptance(s);
  assert.equal(s.ingest('price','a-1','Voor EUR 8000 mag hij weg',NOW+1),false);
  assert.equal(s.claimSend(NOW+2).action,'ACCEPT');
});
test('input tijdens classifierwachten voorkomt oud ACCEPT',async t=>{
  const s=seeded(t,1);acceptance(s);s.updateSettings({autopilot:true});
  let sent=0;
  const adapter={discover:async()=>[],sync:async()=>[],send:async()=>{sent++;return {receipt:'unexpected'};}};
  const classifier={classify:async()=>{s.ingest('withdrawal','a-1','Niet akkoord',NOW+2);return {kind:'PRICE',price:8000,confidence:1};}};
  await new Engine(s,adapter,{now:()=>NOW+3,classifier}).tick();
  assert.equal(sent,0);
  assert.notEqual(s.getConversation('a-1').state.phase,'HOT_LEAD');
});
test('input na claim maar vóór dispatch stopt bij laatste controle',t=>{
  const s=seeded(t,1);queuedAcceptance(s);const out=s.claimSend(NOW+2);
  s.ingest('withdrawal','a-1','Niet akkoord',NOW+3);
  assert.equal(s.authorizeDispatch(out.id,NOW+4),false);
  assert.equal(s.db.prepare('SELECT status FROM outbox WHERE id=?').get(out.id).status,'cancelled');
  assert.equal(s.claimSend(NOW+4),null);
});
test('adapterwachten hercontroleert input via beforeDispatch',async t=>{
  const s=seeded(t,1);queuedAcceptance(s);s.updateSettings({autopilot:true});let sent=0;
  const adapter={discover:async()=>[],sync:async()=>[],send:async(out,{beforeDispatch})=>{
    s.ingest('withdrawal','a-1','Niet akkoord',NOW+3);
    if(!beforeDispatch())return {cancelled:true};
    sent++;return {receipt:'unexpected'};
  }};
  await new Engine(s,adapter,{now:()=>NOW+4}).tick();
  assert.equal(sent,0);
  assert.equal(s.settings().autopilot,true);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='uncertain'").get().n,0);
});
test('nieuwe input tijdens mogelijke dispatch maakt ACCEPT geen HOT_LEAD',t=>{
  const s=seeded(t,1);queuedAcceptance(s);const out=s.claimSend(NOW+2);
  assert.equal(s.authorizeDispatch(out.id,NOW+2),true);
  s.ingest('withdrawal','a-1','Niet akkoord',NOW+3);
  s.sent(out.id,'platform-receipt',NOW+4);
  assert.equal(s.getConversation('a-1').state.phase,'REVIEW');
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM audit WHERE kind='HOT_LEAD'").get().n,0);
  assert.equal(s.db.prepare('SELECT receipt FROM outbox WHERE id=?').get(out.id).receipt,'platform-receipt');
});
test('onzekere ACCEPT met nieuwe input wordt nooit automatisch herhaald',t=>{
  const s=seeded(t,1);queuedAcceptance(s);const out=s.claimSend(NOW+2);
  s.uncertain(out.id,'Verbinding weg',NOW+3);s.ingest('withdrawal','a-1','Niet akkoord',NOW+4);
  assert.equal(s.db.prepare('SELECT status FROM outbox WHERE id=?').get(out.id).status,'uncertain');
  assert.equal(s.claimSend(NOW+5),null);
  assert.equal(s.nextInput(NOW+5),null);
});
test('oude plus nieuwe reserveringen leveren maximaal 20 dispatches op',t=>{
  const s=seeded(t,40),later=NOW+25*3600000;
  for(let i=1;i<=20;i++)assert.ok(s.reserveOpen(`a-${i}`,'demo',NOW));
  for(let i=21;i<=40;i++)s.reserveOpen(`a-${i}`,'demo',later);
  let count=0,out;
  while((out=s.claimSend(later))){count++;s.sent(out.id,`receipt-${count}`,later);}
  assert.equal(count,20);
});
test('open claim blijft meetellen na 25 uur, ook zonder receipt',t=>{
  const s=seeded(t,40),later=NOW+25*3600000;
  for(let i=1;i<=20;i++)s.reserveOpen(`a-${i}`,'demo',NOW);
  for(let i=1;i<=20;i++)assert.ok(s.claimSend(NOW));
  for(let i=21;i<=40;i++)s.reserveOpen(`a-${i}`,'demo',later);
  assert.equal(s.claimSend(later),null);
});
test('oude reacties delen de atomaire totale dispatchcap met openingen',t=>{
  const s=seeded(t,21),later=NOW+25*3600000;s.updateSettings({totalMessageCap:20});
  firstSent(s,NOW-25*3600000);s.ingest('info','a-1','Onderhoud gedaan',NOW);
  const i=s.nextInput(NOW),d=decide(s.getConversation('a-1').state,classifyLocal(i.text));
  assert.ok(s.queueDecision(i,d,renderDecision(d,s.settings()),NOW));
  for(let n=2;n<=21;n++)s.reserveOpen(`a-${n}`,'demo',later);
  let count=0,out;while((out=s.claimSend(later))){count++;s.sent(out.id,`total-${count}`,later);}
  assert.equal(count,20);
});
test('Nederlandse kalenderdag blijft begrensd buiten rollende 24 uur bij wintertijd',t=>{
  const s=seeded(t,21),start=Date.parse('2026-10-24T22:01:00Z'),end=Date.parse('2026-10-25T22:30:00Z');
  for(let i=1;i<=20;i++)s.reserveOpen(`a-${i}`,'demo',start);
  let out;while((out=s.claimSend(start)))s.sent(out.id,'dst-'+out.id,start);
  assert.equal(s.reserveOpen('a-21','demo',end),null);
  assert.equal(s.claimSend(end),null);
});
test('middernacht bewaart rollende cap voor oude wachtrij',t=>{
  const s=seeded(t,40),old=Date.parse('2026-09-05T10:00Z'),first=Date.parse('2026-09-07T21:59Z'),next=first+120000;
  for(let i=1;i<=20;i++)s.reserveOpen(`a-${i}`,'demo',old);
  for(let i=21;i<=40;i++)s.reserveOpen(`a-${i}`,'demo',first);
  for(let i=0;i<20;i++){const out=s.claimSend(first);assert.ok(out);s.sent(out.id,'midnight-'+out.id,first);}
  assert.equal(s.claimSend(next),null);
});
test('vier onafhankelijke SQLite-workers claimen oude en nieuwe wachtrij atomair',async t=>{
  const file=join(temp(t),'dispatch.sqlite'),init=seeded(null,40,file),later=NOW+25*3600000;
  for(let i=1;i<=20;i++)init.reserveOpen(`a-${i}`,'demo',NOW);
  for(let i=21;i<=40;i++)init.reserveOpen(`a-${i}`,'demo',later);
  init.close();
  const storeUrl=new URL('../src/core/store.mjs',import.meta.url).href;
  const counts=await Promise.all(Array.from({length:4},()=>new Promise((resolve,reject)=>{
    const worker=new Worker(`const {parentPort}=require('node:worker_threads');(async()=>{const {Store}=await import(${JSON.stringify(storeUrl)});const store=new Store(${JSON.stringify(file)});let count=0,out;while((out=store.claimSend(${later}))){count++;store.sent(out.id,'concurrent-'+out.id,${later});}store.close();parentPort.postMessage(count);})();`,{eval:true});
    worker.on('message',resolve);worker.on('error',reject);
  })));
  assert.equal(counts.reduce((a,b)=>a+b,0),20);
});
test('vier werkelijke OS-processen delen één atomaire dispatchcap',async t=>{
  const file=join(temp(t),'process-dispatch.sqlite'),init=seeded(null,40,file),later=NOW+25*3600000;
  for(let i=1;i<=20;i++)init.reserveOpen(`a-${i}`,'demo',NOW);
  for(let i=21;i<=40;i++)init.reserveOpen(`a-${i}`,'demo',later);
  init.close();
  const storeUrl=new URL('../src/core/store.mjs',import.meta.url).href;
  const results=await Promise.all(Array.from({length:4},()=>new Promise((resolve,reject)=>{
    const code=`import {Store} from ${JSON.stringify(storeUrl)};const s=new Store(${JSON.stringify(file)});let count=0,out;while((out=s.claimSend(${later}))){count++;s.sent(out.id,'process-'+out.id,${later});}s.close();process.stdout.write(String(count));`;
    const child=spawn(process.execPath,['--input-type=module','--eval',code],{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';
    child.stdout.on('data',bytes=>{stdout+=bytes;});child.stderr.on('data',bytes=>{stderr+=bytes;});child.on('error',reject);
    child.on('exit',status=>status===0?resolve(Number(stdout)):reject(new Error(stderr)));
  })));
  assert.equal(results.reduce((a,b)=>a+b,0),20);
});
test('source-to-send bewijs bewaart input, status en exacte dispatch',t=>{
  const s=seeded(t,1);queuedAcceptance(s);const out=s.claimSend(NOW+2);
  assert.equal(s.authorizeDispatch(out.id,NOW+3),true);s.sent(out.id,'verified-receipt',NOW+4);
  const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(out.id);
  assert.equal(row.input_id,'price');assert.ok(row.source_version>0);
  assert.equal(JSON.parse(row.source_state).phase,'WAITING_INFO');
  assert.equal(row.claimed_at,NOW+2);assert.equal(row.dispatch_at,NOW+3);assert.equal(row.receipt,'verified-receipt');
});
test('laatste dispatchcontrole herleest een verlaagde berichtenlimiet',t=>{
  const s=seeded(t,20);for(let i=1;i<=20;i++)s.reserveOpen(`a-${i}`,'demo',NOW);
  const claimed=Array.from({length:20},()=>s.claimSend(NOW));
  s.updateSettings({dailyCap:1,totalMessageCap:1});
  let sent=0;for(const out of claimed)if(s.authorizeDispatch(out.id,NOW+1)){sent++;s.sent(out.id,'lower-'+out.id,NOW+1);}
  assert.equal(sent,1);assert.equal(s.claimSend(NOW+2),null);
});
test('kill switch tijdens adapterwachten cancelt zonder uncertain of retry',async t=>{
  const s=seeded(t,1);queuedAcceptance(s);s.updateSettings({autopilot:true});
  const adapter={discover:async()=>[],sync:async()=>[],send:async(out,{beforeDispatch})=>{
    s.updateSettings({autopilot:false});assert.equal(beforeDispatch(),false);throw new Error('Veilig ingetrokken');
  }};
  await new Engine(s,adapter,{now:()=>NOW+4}).tick();
  assert.equal(s.db.prepare("SELECT status FROM outbox WHERE action='ACCEPT'").get().status,'cancelled');
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM audit WHERE kind='DELIVERY_UNCERTAIN'").get().n,0);
});
test('inputrevisies worden na bewaartermijnverwijdering niet opnieuw gebruikt',t=>{
  const s=seeded(t,1);queuedAcceptance(s);
  const before=s.db.prepare("SELECT source_version FROM outbox WHERE action='ACCEPT'").get().source_version;
  s.db.exec('DELETE FROM inbox');
  s.ingest('after-retention','a-1','Niet akkoord',NOW+2);
  assert.ok(s.inputVersion('a-1',NOW+2)>before);
});
test('oud outboxschema migreert met historische receipt en beschermt oude claims',t=>{
  const file=join(temp(t),'legacy.sqlite'),s=seeded(null,1,file);
  const out=firstSent(s);s.close();
  const db=new DatabaseSync(file);
  for(const name of ['source_version','source_state','claimed_at','dispatch_at','invalidated_at','receipt_evidence'])db.exec(`ALTER TABLE outbox DROP COLUMN ${name}`);
  db.close();
  const migrated=new Store(file);t.after(()=>migrated.close());
  const row=migrated.db.prepare('SELECT * FROM outbox WHERE id=?').get(out.id);
  assert.equal(row.status,'sent');assert.equal(row.receipt,'receipt-first');assert.equal(row.dispatch_at,NOW);
  assert.equal(migrated.getConversation('a-1').state.phase,'WAITING_INFO');
});
test('geopende account- en gespreksbewijzen blijven naast het ontvangstbewijs bewaard',t=>{
  const s=seeded(t,1);queuedAcceptance(s);const out=s.claimSend(NOW+2);
  const evidence={account:'fixture-account',seller:'s-1',listing:'a-1',conversation:'chat-1',receipt:'receipt'};
  s.sent(out.id,'receipt',NOW+3,evidence);
  assert.deepEqual(JSON.parse(s.db.prepare('SELECT receipt_evidence FROM outbox WHERE id=?').get(out.id).receipt_evidence),evidence);
});
