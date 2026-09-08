import test from 'node:test';import assert from 'node:assert/strict';import {startServer} from '../src/server.mjs';import {temp} from './helpers.mjs';
test('lokale HTTP-app start echte workerthread en bereikt autonoom een demo-overdracht',async t=>{
 const a=await startServer({dataDir:temp(t),worker:true});t.after(()=>a.close());
 const auth=await fetch(a.origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:a.bootToken})});const cookie=auth.headers.get('set-cookie').split(';')[0],{csrf}=await auth.json();
 const headers={'Content-Type':'application/json',cookie,'X-Biedbot-Csrf':csrf};
 const post=async(p,data)=>{const r=await fetch(a.origin+'/api/'+p,{method:'POST',headers,body:JSON.stringify(data)});assert.equal(r.status,200);return r.json();};
 await post('settings',{company:'Runtime testdealer',signoff:'Testinkoop',onboardingDone:true,budget:1000000});
 await post('autopilot',{enabled:true});
 const until=Date.now()+20000;let d;while(Date.now()<until){d=a.store.dashboard();if(d.totals.hot>0)break;await new Promise(r=>setTimeout(r,200));}
 assert.ok(d.totals.hot>0,'Werkelijke worker moet een HOT_LEAD opslaan.');assert.ok(d.totals.sent>=3);assert.ok(d.worker?.heartbeat>0);
 await post('autopilot',{enabled:false});const sent=a.store.dashboard().totals.sent;await new Promise(r=>setTimeout(r,1200));assert.equal(a.store.dashboard().totals.sent,sent);
 await post('demo/reset',{confirm:'DEMO HERSTARTEN'});assert.equal(a.store.dashboard().conversations.length,0);assert.equal(a.store.settings().autopilot,false);
});
