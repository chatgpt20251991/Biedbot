/** Vulnerability reproduction on the unchanged pilot. NOT a release acceptance test.
 * Exit 0 means all three reported defects are reproduced. After fixing them, replace
 * these assertions with regression tests that require safe behavior.
 * Run from BiedBot_Edge: node audit-overdracht/reproduce-core-findings.mjs
 * No network, accounts, browser or persistent dealer data are used.
 */
import assert from 'node:assert/strict';
import {Store} from '../src/core/store.mjs';
import {classifyLocal,decide,renderDecision,initialState} from '../src/core/negotiation.mjs';
const now=Date.parse('2026-09-07T10:00:00Z');
function makeStore(count){
 const s=new Store(':memory:');
 s.updateSettings({budget:1000000});
 s.addCandidates(Array.from({length:count},(_,i)=>({id:`a-${i+1}`,sellerId:`s-${i+1}`,title:'Volkswagen Golf 2019',brand:'Volkswagen',model:'Golf',ask:10000,year:2019,mileage:80000,distanceKm:15,sellerType:'private',fit:.8})),now);
 return s;
}
const findings=[];
{
 const s=makeStore(1);
 try {
  s.reserveOpen('a-1','demo',now);
  const opening=s.claimSend(now);s.sent(opening.id,'mock-opening',now);
  s.ingest('seller-price','a-1','Voor EUR 8000 mag hij weg',now+1);
  const input=s.nextInput(now+1);
  const d=decide(s.getConversation('a-1').state,classifyLocal(input.text));
  assert.equal(d.action,'ACCEPT');
  assert.equal(s.queueDecision(input,d,renderDecision(d,s.settings()),now+1),true);
  s.ingest('seller-withdrawal','a-1','Niet akkoord',now+2);
  const out=s.claimSend(now+3);
  assert.equal(out?.action,'ACCEPT','Expected the documented vulnerable behavior');
  s.sent(out.id,'mock-incorrect-accept',now+3);
  assert.equal(s.getConversation('a-1').state.phase,'HOT_LEAD');
  findings.push({id:1,reproduced:true,newestSellerText:'Niet akkoord',dispatchedAction:out.action,finalPhase:s.getConversation('a-1').state.phase});
 } finally {s.close();}
}
{
 const s=makeStore(40),later=now+25*3600000;
 try {
  for(let i=1;i<=20;i++)assert.ok(s.reserveOpen(`a-${i}`,'demo',now));
  assert.equal(s.usage('demo',later).openings,0);
  for(let i=21;i<=40;i++)assert.ok(s.reserveOpen(`a-${i}`,'demo',later));
  let sent=0,out;
  while((out=s.claimSend(later))){s.sent(out.id,`mock-daycap-${++sent}`,later);}
  assert.equal(sent,40,'Expected the documented vulnerable behavior');
  assert.equal(s.usage('demo',later).openings,40);
  findings.push({id:2,reproduced:true,configuredCap:s.settings().dailyCap,openingsSentSameDay:sent,queueAgeHours:25});
 } finally {s.close();}
}
{
 const text='Akkoord?',state={...initialState(10000,20),phase:'NEGOTIATING',lastOffer:8000};
 const classification=classifyLocal(text,state),decision=decide(state,classification);
 assert.equal(classification.kind,'ACCEPT');
 assert.equal(decision.action,'ACCEPT');
 assert.equal(decision.price,8000);
 findings.push({id:3,reproduced:true,text,classification:classification.kind,action:decision.action,price:decision.price});
}
console.log(JSON.stringify({scope:'Local in-memory reproduction; 3 defects confirmed, not 3 safe regression passes',node:process.version,platform:process.platform,findings},null,2));
