import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {ApprovedBrowserAdapter} from '../src/adapters/approved-browser.mjs';

function fixture({afterOpen={},afterSend={},beforeClick={},beforeDispatch}={}) {
  const origin='http://127.0.0.1:8765', messages=[],meta=new Map();
  const state={origin,account:'dealer',seller:'seller-1',listing:'listing-1',conversation:'chat-1',warning:false,sends:0};
  const contract={origin,expectedAccount:'dealer',account:'#account',blocked:'.blocked',seller:'#seller',sellerIdAttribute:'data-seller-id',listingIdentity:'#listing',listingIdAttribute:'data-listing-id',conversationIdentity:'#conversation',conversationIdAttribute:'data-conversation-id',openChat:'#open-chat',input:'#input',send:'#send',message:'.message',messageIdAttribute:'data-id',directionAttribute:'data-direction'};
  class Textarea {set value(v){this.text=v;}get value(){return this.text||'';}dispatchEvent(){Object.assign(state,beforeClick);}}
  const input=new Textarea();
  const identity=key=>({textContent:state[key],getAttribute:()=>state[key]});
  const document={querySelector(selector){return this.querySelectorAll(selector)[0]||null;},querySelectorAll(selector){
    if(selector==='.blocked')return state.warning?[{}]:[];
    for(const [s,k] of [['#account','account'],['#seller','seller'],['#listing','listing'],['#conversation','conversation']])if(s===selector)return state[k]==null?[]:[identity(k)];
    if(selector==='#open-chat')return [{click(){Object.assign(state,afterOpen);}}];
    if(selector==='#input')return [input];
    if(selector==='#send')return [{disabled:false,click(){state.sends++;messages.push({id:'receipt-1',role:'assistant',text:input.value});Object.assign(state,afterSend);}}];
    if(selector==='.message')return messages.map(m=>({textContent:m.text,getAttribute:a=>a==='data-id'?m.id:m.role}));
    return [];
  }};
  const browser={async navigate(){},async waitFor(){},async evaluate(expression){return runInNewContext(expression,{document,location:{get origin(){return state.origin;},href:origin+'/chat/1'},HTMLTextAreaElement:Textarea,Event:class {}});}};
  const store={candidate:()=>({id:'listing-1',sellerId:'seller-1',url:origin+'/ad/1'}),getMeta:k=>meta.get(k),setMeta:(k,v)=>meta.set(k,v),ingest(){}};
  const adapter=new ApprovedBrowserAdapter({store,contract,fixtureTest:true});adapter.browser=browser;
  return {state,meta,send:()=>adapter.send({id:'out-1',conversation:'listing-1',action:'OPEN',text:'Dag, is de auto beschikbaar?'},{beforeDispatch})};
}
for(const [label,change] of [['verkoper',{seller:'other'}],['account',{account:'other'}],['advertentie',{listing:'other'}],['ontbrekende advertentie',{listing:null}],['ontbrekend gesprek',{conversation:null}]])test(`chatopening met ${label} stopt vóór verzending`,async()=>{
  const f=fixture({afterOpen:change});await assert.rejects(f.send);assert.equal(f.state.sends,0);
});
for(const change of [{seller:'other'},{conversation:'other'},{listing:'other'},{account:'other'}])test(`identiteitswijziging tijdens formulierinvoer stopt klik ${JSON.stringify(change)}`,async()=>{
  const f=fixture({beforeClick:change});await assert.rejects(f.send);assert.equal(f.state.sends,0);
});
for(const change of [{seller:'other'},{conversation:'other'},{listing:null},{account:'other'}])test(`ontvangstbewijs onder andere identiteit wordt geweigerd ${JSON.stringify(change)}`,async()=>{
  const f=fixture({afterSend:change});await assert.rejects(f.send);assert.equal(f.state.sends,1);assert.equal(f.meta.size,0);
});
test('dispatch callback kan verzending na snapshot intrekken',async()=>{const f=fixture({beforeDispatch:()=>false});await assert.rejects(f.send);assert.equal(f.state.sends,0);});
test('volledige stabiele identiteit levert receipt en gesprekbinding',async()=>{const f=fixture({beforeDispatch:()=>true});assert.equal((await f.send()).receipt,'receipt-1');assert.equal(f.state.sends,1);assert.equal(f.meta.get('conversationIdentity:listing-1'),'chat-1');});
