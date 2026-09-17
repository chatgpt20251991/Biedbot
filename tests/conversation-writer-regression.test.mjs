import test from 'node:test';
import assert from 'node:assert/strict';
import {ConversationStudio} from '../src/core/studio.mjs';
import {Engine} from '../src/worker/engine.mjs';
import {seeded,firstSent,NOW} from './helpers.mjs';

const opening='Ik bekijk je Golf. Kun je iets vertellen over het onderhoud? Wat is de reden van verkoop?';
const anchor='Dank voor de toelichting. Mijn bod is {{BOD}}, als de auto bij het bekijken is zoals beschreven.';
const start={model:'Golf',ask:10000,mode:'practice'};
const reply=(session,text,requestId)=>({id:session.id,text,requestId});
const confirmation=session=>({id:session.id,draftId:session.pending.id,textHash:session.pending.textHash,confirm:'IK HEB DIT ZELF VERSTUURD'});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('writer receives latest seller input and redacted history with earlier relevant seller facts',async t=>{
  const store=seeded(t,1),sent=[];store.updateSettings({autopilot:true});firstSent(store);
  store.ingest('history-facts','a-1','Onderhoud is bijgehouden en de koppeling is vervangen. Mail test@example.nl of bel 0612345678.',NOW+1);
  store.ingest('latest-fact','a-1','Ik krijg een leaseauto.',NOW+2);
  let received;
  const adapter={discover:async()=>[],sync:async()=>{},send:async(out,{beforeDispatch})=>{
    assert.equal(beforeDispatch(),true);sent.push(out);return {receipt:'isolated-receipt-'+out.id};
  }};
  await new Engine(store,adapter,{now:()=>NOW+3,writer:{write:async payload=>{
    received=payload.context;return {message:anchor,model:'fixture-writer',requestId:'request-context'};
  }}}).tick();
  assert.equal(received.sellerText,'Ik krijg een leaseauto.');
  assert.equal(received.history.at(-1).text,'Ik krijg een leaseauto.');
  assert.ok(received.history.some(x=>x.role==='assistant'));
  const transmitted=JSON.stringify(received);
  assert.doesNotMatch(transmitted,/test@example\.nl|0612345678/);
  assert.match(transmitted,/\[e-mailadres\]/);
  assert.equal(received.priceToken,'{{BOD}}');
  for(const privateField of ['ceiling','budget','dealerMax','price'])assert.equal(received[privateField],undefined);
  assert.ok(received.allowedFacts.includes('koppeling'),'the earlier replacement remains available to the writer');
  assert.ok(received.allowedFacts.includes('onderhoud'),'earlier maintenance answer remains available');
  assert.ok(received.allowedFacts.includes('leaseauto'));
  assert.deepEqual(received.latestFacts,['leaseauto']);
  assert.equal(sent.length,1);
  const message=store.dashboard(NOW+3).conversations.find(x=>x.id==='a-1').messages.at(-1);
  assert.equal(message.composition.source,'anthropic');
  assert.equal(message.composition.requestId,'request-context');
  assert.equal(message.composition.validationContext.sellerText,undefined);
  assert.equal(message.composition.validationContext.history,undefined);
});

test('availability plus answered opening questions does not ask the same questions again offline',async t=>{
  const store=seeded(t,1),studio=new ConversationStudio(store,{now:()=>NOW});
  let session=await studio.start(start);
  session=await studio.receive(reply(session,'Ja, nog beschikbaar. Onderhoud is bijgehouden en ik krijg een leaseauto.','answered-opening'));
  const answer=session.history.at(-1);
  assert.equal(answer.role,'assistant');
  assert.equal(answer.composition.source,'offline');
  assert.doesNotMatch(answer.text,/\b(?:hoe|kun|kan|wat|waarom)\b[^?]{0,200}\b(?:onderhoud|verkoopt|verkoop)\b[^?]*\?/i,
    'availability does not erase the maintenance and sale-reason answers');
});

test('studio exposes actual offline, generated and failed-writer sources on each message',async t=>{
  const offline=new ConversationStudio(seeded(t,1),{now:()=>NOW});
  assert.equal((await offline.start(start)).latest.composition.source,'offline');
  let requests=0;
  const studio=new ConversationStudio(seeded(t,1),{now:()=>NOW,writer:{write:async()=>{
    requests++;
    if(requests===1)return {message:opening,model:'fixture-writer',requestId:'opening-request'};
    throw new Error('WRITER_TIMEOUT');
  }}});
  let session=await studio.start(start);
  assert.equal(session.history.at(-1).composition.source,'anthropic');
  session=await studio.receive(reply(session,'Ik krijg een leaseauto.','failed-generation'));
  const meta=session.history.at(-1).composition;
  assert.equal(meta.source,'fallback');
  assert.equal(meta.fallbackReason,'WRITER_TIMEOUT');
  assert.equal(meta.model,null);
  assert.equal(requests,2);
});

test('a newer seller reply invalidates an older in-flight studio draft without advancing the unconfirmed offer',async t=>{
  const store=seeded(t,1),begun=deferred(),oldResponse=deferred();let calls=0;
  const studio=new ConversationStudio(store,{now:()=>NOW,writer:{write:async()=>{
    calls++;
    if(calls===1)return {message:opening,requestId:'opening'};
    if(calls===2){begun.resolve();return oldResponse.promise;}
    return {message:anchor,requestId:'latest-response'};
  }}});
  let session=await studio.start({...start,mode:'assistive'});
  session=studio.confirm(confirmation(session));
  const old=studio.receive(reply(session,'Ik krijg een leaseauto.','old-seller-input'));
  await begun.promise;
  session=await studio.receive(reply(session,'Onderhoud is bijgehouden.','new-seller-input'));
  assert.equal(session.pending.composition.requestId,'latest-response');
  assert.equal(session.state.lastOffer,null);
  const latestDraft=session.pending.id;
  oldResponse.resolve({message:anchor,requestId:'outdated-response'});
  await old;
  session=studio.read();
  assert.equal(session.pending.id,latestDraft);
  assert.equal(session.pending.composition.requestId,'latest-response');
  assert.equal(session.history.filter(x=>x.role==='assistant').length,1);
  assert.equal(session.state.lastOffer,null);
  assert.equal(studio.confirm(confirmation(session)).state.lastOffer,7500);
});
