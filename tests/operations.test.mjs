import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Store} from '../src/core/store.mjs';
import {createBackup,restoreBackup,eraseConversation,runRetention,healthReport,acquireDataLease,BACKUP_FORMAT} from '../src/core/operations.mjs';
import {startServer} from '../src/server.mjs';
import {seeded,firstSent,temp,candidate,NOW} from './helpers.mjs';
const PASSWORD='Lokaal-testwachtwoord-2026!';
function restore(t,backup,password=PASSWORD){const directory=join(temp(t),'restored');return {...restoreBackup(backup,password,directory,NOW+1),directory};}

test('volledige backup herstelt meer dan 200 gesprekken en alle bronrecords',t=>{
  const store=seeded(t,230);firstSent(store);const base=store.getConversation('a-1');
  store.tx(()=>{for(let i=2;i<=230;i++){
    store.db.prepare('INSERT INTO conversations(id,seller_key,account,state,created,updated) VALUES(?,?,?,?,?,?)').run(`a-${i}`,store.sellerKey(`s-${i}`),'demo',JSON.stringify(base.state),NOW,NOW);
    store.db.prepare("INSERT INTO messages VALUES(?,?,'seller',?,?)").run(`source-${i}`,`a-${i}`,`Inhoud ${i}`,NOW);
  }});
  assert.equal(store.dashboard(NOW).conversations.length,200);
  const backup=createBackup(store,PASSWORD,NOW),result=restore(t,backup),restored=new Store(result.database);t.after(()=>restored.close());
  assert.equal(result.records.conversations,230);assert.equal(result.records.candidates,230);assert.equal(result.records.messages,230);
  assert.equal(restored.db.prepare("SELECT text FROM messages WHERE id='source-230'").get().text,'Inhoud 230');
  assert.equal(restored.sellerKey('s-1'),store.sellerKey('s-1'));assert.equal(restored.settings().autopilot,false);
  assert.equal(backup.format,BACKUP_FORMAT);assert.ok(!JSON.stringify(backup).includes('Inhoud 230'));
});
test('backup sluit providerkeys, profielverwijzingen en sessiemetadata uit',t=>{
  const s=seeded(t,1);s.setMeta('apiKey','secret-provider-key');s.setMeta('browserCookies','private-cookie');s.setMeta('conversationUrl:a-1','private-profile-link');s.setMeta('worker',{heartbeat:NOW});
  const result=restore(t,createBackup(s,PASSWORD,NOW)),r=new Store(result.database);t.after(()=>r.close());
  for(const key of ['apiKey','browserCookies','conversationUrl:a-1'])assert.equal(r.getMeta(key),null);
  assert.equal(r.getMeta('worker'),null);
});
test('herstelde sending wordt uncertain; klaarstaande acties worden niet alsnog verstuurd',t=>{
  const s=seeded(t,2);s.updateSettings({autopilot:true});s.reserveOpen('a-1','demo',NOW);s.claimSend(NOW);s.reserveOpen('a-2','demo',NOW);
  const result=restore(t,createBackup(s,PASSWORD,NOW)),r=new Store(result.database);t.after(()=>r.close());
  assert.equal(r.settings().autopilot,false);assert.equal(r.claimSend(NOW+1),null);
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='uncertain'").get().n,1);
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='cancelled'").get().n,1);
});
test('verkeerd wachtwoord of gewijzigde ciphertext laat bestemming onaangeroerd',t=>{
  const s=seeded(t,1),b=createBackup(s,PASSWORD,NOW),dest=join(temp(t),'untouched');
  assert.throws(()=>restoreBackup(b,'Ander-testwachtwoord!',dest),/beschadigd|wachtwoord/);assert.equal(existsSync(dest),false);
  const data=Buffer.from(b.data,'base64');data[0]^=1;
  assert.throws(()=>restoreBackup({...b,data:data.toString('base64')},PASSWORD,dest),/beschadigd|wachtwoord/);assert.equal(existsSync(dest),false);
});
test('onbekende velden, KDF, salt en niet-canonieke base64 worden afgewezen',t=>{
  const s=seeded(t,1),b=createBackup(s,PASSWORD,NOW),dest=join(temp(t),'invalid');
  for(const invalid of [{...b,kdf:'scrypt-N999999999'},{...b,extra:'unknown'},{...b,salt:'AA=='},{...b,data:'!!!!'}])assert.throws(()=>restoreBackup(invalid,PASSWORD,dest));
  assert.equal(existsSync(dest),false);
});
test('restore overschrijft nooit bestaande bestanden',t=>{
  const s=seeded(t,1),dir=temp(t),file=join(dir,'keep.txt');writeFileSync(file,'untouched');
  assert.throws(()=>restoreBackup(createBackup(s,PASSWORD,NOW),PASSWORD,dir),/lege map/);assert.equal(readFileSync(file,'utf8'),'untouched');
});
test('wissen behoudt verkoperdeduplicatie en werkelijke quota zonder gesprekstekst',t=>{
  const s=seeded(t,2);firstSent(s);s.ingest('private-message','a-1','Mijn prive telefoon 0612345678',NOW+1);
  const usage=s.usage('demo',NOW+2);assert.equal(eraseConversation(s,'a-1',NOW+2).erased,true);
  assert.deepEqual(s.usage('demo',NOW+2),usage);assert.equal(s.getConversation('a-1').state.phase,'SUPPRESSED');
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM messages').get().n,0);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM inbox').get().n,0);
  assert.ok(!JSON.stringify(s.exportData()).includes('0612345678'));
  s.addCandidates([candidate(3,{sellerId:'s-1'})],NOW+3);assert.equal(s.reserveOpen('a-3','demo',NOW+3),null);
  const row=s.db.prepare('SELECT text,receipt_evidence FROM outbox').get();assert.equal(row.text,'');assert.equal(JSON.parse(row.receipt_evidence).redacted,true);
});
test('wissen faalt atomair bij onzeker verzendbewijs',t=>{
  const s=seeded(t,1);s.reserveOpen('a-1','demo',NOW);const out=s.claimSend(NOW);s.uncertain(out.id,'timeout',NOW);
  assert.throws(()=>eraseConversation(s,'a-1',NOW+1),/reconciliëren/);
  assert.equal(s.db.prepare('SELECT text FROM outbox WHERE id=?').get(out.id).text,out.text);
});
test('retention wist vervallen afgesloten inhoud, bewaart actieve en recente gesprekken',t=>{
  const s=seeded(t,3),old=NOW-40*86400000;
  firstSent(s,old);s.takeover('a-1','LOST',old);
  s.reserveOpen('a-2','demo',old);let out=s.claimSend(old);s.sent(out.id,'active',old);
  s.reserveOpen('a-3','demo',NOW);out=s.claimSend(NOW);s.sent(out.id,'recent',NOW);s.takeover('a-3','LOST',NOW);
  const result=runRetention(s,NOW);assert.equal(result.erased,1);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM messages WHERE conversation='a-1'").get().n,0);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM messages WHERE conversation='a-2'").get().n,1);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM messages WHERE conversation='a-3'").get().n,1);
});
test('gezondheid controleert ontbrekende heartbeat, uncertain en vastgelopen dispatch',t=>{
  const s=seeded(t,1);assert.equal(healthReport(s,{now:NOW}).checks.worker,false);
  s.setMeta('worker',{heartbeat:NOW,status:'paused'});assert.equal(healthReport(s,{now:NOW}).status,'paused');
  s.reserveOpen('a-1','demo',NOW);const out=s.claimSend(NOW);
  assert.equal(healthReport(s,{now:NOW+61000}).stalled,1);s.uncertain(out.id,'timeout',NOW+61000);
  assert.equal(healthReport(s,{now:NOW+61001}).uncertain,1);assert.equal(healthReport(s,{now:NOW+61001}).status,'attention');
  assert.ok(!JSON.stringify(healthReport(s,{now:NOW})).includes(out.text));
});
test('datalease scheidt profielen en weigert een tweede eigenaar',t=>{
  const a=temp(t),b=temp(t),release=acquireDataLease(a);t.after(release);
  assert.throws(()=>acquireDataLease(a),/in gebruik/);const other=acquireDataLease(b);other();
  release();acquireDataLease(a)();
});
test('server onderhoud- en backup-API vereisen sessie en CSRF',async t=>{
  const directory=temp(t),app=await startServer({dataDir:directory,worker:false});t.after(()=>app.close());
  await assert.rejects(()=>startServer({dataDir:directory,worker:false}),/in gebruik/);
  assert.equal((await fetch(app.origin+'/api/health')).status,401);
  const auth=await fetch(app.origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:app.bootToken})});
  const cookie=auth.headers.get('set-cookie').split(';')[0],{csrf}=await auth.json(),headers={'Content-Type':'application/json',cookie,'x-biedbot-csrf':csrf};
  assert.equal((await fetch(app.origin+'/api/data/retention',{method:'POST',headers:{...headers,'x-biedbot-csrf':''},body:'{}'})).status,403);
  assert.equal((await fetch(app.origin+'/api/health',{headers})).status,200);
  const backup=await fetch(app.origin+'/api/backup/full',{method:'POST',headers,body:JSON.stringify({password:PASSWORD})});assert.equal(backup.status,200);assert.equal((await backup.json()).format,BACKUP_FORMAT);
  assert.ok(app.store.getMeta('lastRetentionAt')>0);
});
test('backup-CLI maakt en herstelt bestanden en overschrijft geen bestaande backup',t=>{
  const dir=temp(t),database=join(dir,'source.sqlite'),backup=join(dir,'backup.json'),destination=join(dir,'restored');
  const s=seeded(null,1,database);firstSent(s);s.close();
  const run=(...args)=>spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/backup.mjs',import.meta.url)),...args],{env:{...process.env,BIEDBOT_BACKUP_PASSWORD:PASSWORD},encoding:'utf8'});
  let result=run('create',database,backup);assert.equal(result.status,0,result.stderr);
  const bytes=readFileSync(backup);result=run('create',database,backup);assert.equal(result.status,1);assert.deepEqual(readFileSync(backup),bytes);
  result=run('restore',backup,destination);assert.equal(result.status,0,result.stderr);
  const restored=new Store(join(destination,'biedbot-demo.sqlite'));t.after(()=>restored.close());assert.equal(restored.db.prepare('SELECT COUNT(*) n FROM messages').get().n,1);
});
test('actieve instelling zonder echte worker wordt geen groene running-melding',t=>{
  const s=seeded(t,1);s.updateSettings({autopilot:true});const h=healthReport(s,{now:NOW,workerEnabled:false});
  assert.equal(h.checks.worker,false);assert.equal(h.status,'attention');
});
test('wis-API stopt de worker en bewaart quota na verwijderen van inhoud',async t=>{
  const app=await startServer({dataDir:temp(t),worker:false});t.after(()=>app.close());
  app.store.addCandidates([candidate(1)],NOW);firstSent(app.store,NOW);
  const auth=await fetch(app.origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:app.bootToken})});
  const cookie=auth.headers.get('set-cookie').split(';')[0],{csrf}=await auth.json();
  const response=await fetch(app.origin+'/api/data/erase',{method:'POST',headers:{'Content-Type':'application/json',cookie,'x-biedbot-csrf':csrf},body:JSON.stringify({id:'a-1',confirm:'WIS GESPREKSINHOUD'})});
  assert.equal(response.status,200);assert.equal(app.store.settings().autopilot,false);
  assert.equal(app.store.usage('demo',NOW).total,1);assert.equal(app.store.db.prepare("SELECT COUNT(*) n FROM messages WHERE conversation='a-1'").get().n,0);
});
