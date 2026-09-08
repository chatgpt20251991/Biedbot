import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {ApprovedBrowserAdapter} from '../src/adapters/approved-browser.mjs';
import {classifyLocal,decide,renderDecision} from '../src/core/negotiation.mjs';
import {seeded,firstSent,NOW} from './helpers.mjs';

function fixture(t,{foreignSnapshot=0,editedPrice=false,missingPrice=false}={}){
  const store=seeded(t,1);firstSent(store,NOW);
  const origin='http://127.0.0.1:8765',state={account:'dealer',seller:'s-1',listing:'a-1',conversation:'chat-1',sends:0};
  const messages=[{id:'price',role:'seller',text:'Voor EUR 8000 mag hij weg'}];
  store.setMeta('conversationUrl:a-1',origin+'/chat/1');store.setMeta('conversationIdentity:a-1','chat-1');
  const contract={origin,expectedAccount:'dealer',account:'#account',blocked:'.blocked',seller:'#seller',sellerIdAttribute:'data-seller-id',listingIdentity:'#listing',listingIdAttribute:'data-listing-id',conversationIdentity:'#conversation',conversationIdAttribute:'data-conversation-id',input:'#input',send:'#send',message:'.message',messageIdAttribute:'data-id',directionAttribute:'data-direction'};
  class Textarea{set value(v){this.text=v;}get value(){return this.text||'';}dispatchEvent(){}}
  const input=new Textarea();let snapshots=0;
  const document={querySelector(selector){return this.querySelectorAll(selector)[0]||null;},querySelectorAll(selector){
    for(const key of ['account','seller','listing','conversation'])if(selector==='#'+key)return [{textContent:state[key],getAttribute:()=>state[key]}];
    if(selector==='#input')return [input];
    if(selector==='#send')return [{disabled:false,click(){state.sends++;messages.push({id:'receipt',role:'assistant',text:input.value});}}];
    if(selector==='.message')return messages.map(message=>({textContent:message.text,getAttribute:name=>name==='data-id'?message.id:message.role}));
    return [];
  }};
  const context={document,location:{origin,get href(){return origin+'/chat/'+(state.conversation==='chat-1'?'1':'other');}},HTMLTextAreaElement:Textarea,Event:class{}};
  const browser={async navigate(){},async waitFor(){},async evaluate(expression){
    const snapshot=expression.includes('document.querySelectorAll(c.message)')&&expression.includes('map(x=>({id:')&&!expression.includes('buttons[0].click');
    if(snapshot)snapshots++;
    if(snapshot&&snapshots===foreignSnapshot){
      const original={...state};Object.assign(state,{seller:'other-seller',listing:'other-listing',conversation:'other-chat'});
      try{return runInNewContext(expression,context);}finally{Object.assign(state,original);}
    }
    return runInNewContext(expression,context);
  }};
  const adapter=new ApprovedBrowserAdapter({store,contract,fixtureTest:true});adapter.browser=browser;
  function acceptance(){store.ingest('price','a-1',messages[0].text,NOW+1);const i=store.nextInput(NOW+1),d=decide(store.getConversation('a-1').state,classifyLocal(i.text));assert.equal(d.action,'ACCEPT');store.queueDecision(i,d,renderDecision(d,store.settings()),NOW+1);if(editedPrice)messages[0].text='Niet akkoord';if(missingPrice)messages.length=0;return store.claimSend(NOW+2);}
  return {store,state,adapter,acceptance};
}
test('inboxsnapshot bindt bronbericht atomair aan verkoper en gesprek',async t=>{
  const f=fixture(t,{foreignSnapshot:1});await assert.rejects(()=>f.adapter.sync());
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM inbox').get().n,0);
});
test('receipt uit tijdelijk ander gesprek wordt niet als bewijs opgeslagen',async t=>{
  const f=fixture(t,{foreignSnapshot:2}),out=f.acceptance();await assert.rejects(()=>f.adapter.send(out));
  assert.equal(f.state.sends,1);
});
test('gewijzigde verkopertekst onder hetzelfde bericht-ID trekt oude acceptatie in',async t=>{
  const f=fixture(t,{editedPrice:true}),out=f.acceptance();await assert.rejects(()=>f.adapter.send(out));assert.equal(f.state.sends,0);
});
test('ontbrekend prijsbronbericht staat geen ACCEPT-dispatch toe',async t=>{
  const f=fixture(t,{missingPrice:true}),out=f.acceptance();await assert.rejects(()=>f.adapter.send(out));assert.equal(f.state.sends,0);
});
test('bevestigde prijsbron en receipt uit hetzelfde gesprek blijven toegestaan',async t=>{
  const f=fixture(t),out=f.acceptance(),result=await f.adapter.send(out);
  f.store.sent(out.id,result.receipt,NOW+3,result.evidence);
  assert.equal(f.state.sends,1);assert.equal(f.store.getConversation('a-1').state.phase,'HOT_LEAD');
  assert.equal(result.evidence.sourceInput,'price');assert.equal(result.evidence.conversation,'chat-1');
});
test('Promise als dispatchautorisatie wordt niet als toestemming behandeld',async t=>{
  const f=fixture(t),out=f.acceptance();await assert.rejects(()=>f.adapter.send(out,{beforeDispatch:()=>Promise.resolve(true)}),/synchroon/);assert.equal(f.state.sends,0);
});
