import {randomBytes,randomUUID,scryptSync,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {mkdirSync,rmdirSync,existsSync,lstatSync,realpathSync,readdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {Store} from './store.mjs';
import {validateSettings} from './policy.mjs';
import {processAlive} from './instance.mjs';

export const BACKUP_FORMAT='biedbot-sqlite-aes256gcm-v1';
export const MAX_BACKUP_BYTES=32*1024*1024;
const TABLES=['meta','candidates','conversations','inbox','outbox','messages','audit','ai_requests'];
const META=new Set(['settings','installId','salt','createdAt','mode','demoSeeded','inboxSequence','lastRetentionAt']);
const AAD=Buffer.from(`${BACKUP_FORMAT}:scrypt-N16384-r8-p1`);
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const passwordCheck=password=>{if(typeof password!=='string'||password.length<12||password.length>200)throw new Error('Gebruik een wachtwoord van 12 tot 200 tekens.');};

/** Full logical SQLite snapshot: all application rows, never the dashboard's limited view. */
export function createBackup(store,password,now=Date.now()){
  passwordCheck(password);
  const snapshot=store.tx(()=>({schema:1,createdAt:now,tables:Object.fromEntries(TABLES.map(name=>[name,
    store.db.prepare(`SELECT * FROM ${name}`).all().filter(row=>name!=='meta'||META.has(row.key))
  ]))}));
  const plain=Buffer.from(JSON.stringify(snapshot));
  if(plain.length>MAX_BACKUP_BYTES)throw new Error('Backup groter dan de ondersteunde 32 MiB.');
  const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(password,salt,32);
  try{
    const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(AAD);
    const data=Buffer.concat([cipher.update(plain),cipher.final()]);
    return {format:BACKUP_FORMAT,kdf:'scrypt-N16384-r8-p1',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
  }finally{key.fill(0);plain.fill(0);}
}
function decode(value,length,max=MAX_BACKUP_BYTES){
  if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||!value.length||value.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('Ongeldige backupcodering of grootte.');
  const bytes=Buffer.from(value,'base64');
  if(bytes.toString('base64')!==value||bytes.length>max||(length!==null&&bytes.length!==length))throw new Error('Ongeldige backupparameters.');
  return bytes;
}
function decryptBackup(envelope,password){
  passwordCheck(password);
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||Object.keys(envelope).sort().join(',')!=='data,format,iv,kdf,salt,tag'||envelope.format!==BACKUP_FORMAT||envelope.kdf!=='scrypt-N16384-r8-p1')throw new Error('Onbekend of onvolledig backupformaat.');
  const salt=decode(envelope.salt,16,16),iv=decode(envelope.iv,12,12),tag=decode(envelope.tag,16,16),data=decode(envelope.data,null);
  const key=scryptSync(password,salt,32);let plain;
  try{
    const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(AAD);decipher.setAuthTag(tag);
    plain=Buffer.concat([decipher.update(data),decipher.final()]);
    const snapshot=JSON.parse(plain.toString('utf8'));
    if(snapshot.schema!==1||!Number.isSafeInteger(snapshot.createdAt)||!snapshot.tables||Object.keys(snapshot.tables).sort().join(',')!==[...TABLES].sort().join(','))throw new Error('Onbekend databaseschema.');
    let rows=0;for(const name of TABLES){if(!Array.isArray(snapshot.tables[name]))throw new Error('Ongeldige backuptabel.');rows+=snapshot.tables[name].length;}
    if(rows>500000)throw new Error('Te veel backuprecords.');
    return snapshot;
  }catch{throw new Error('Backup beschadigd, ongeldig of wachtwoord onjuist.');}
  finally{key.fill(0);plain?.fill(0);}
}

/** Never overwrites a profile. Restore requires an empty, exclusively leased directory. */
export function restoreBackup(envelope,password,destination,now=Date.now()){
  const snapshot=decryptBackup(envelope,password),directory=resolve(destination);
  if(existsSync(directory)&&(lstatSync(directory).isSymbolicLink()||!lstatSync(directory).isDirectory()||readdirSync(directory).length))throw new Error('Herstel vereist een nieuwe lege map.');
  mkdirSync(directory,{recursive:true,mode:0o700});
  const release=acquireDataLease(directory);
  const database=join(directory,'biedbot-demo.sqlite');let store,ownedDatabase=false;
  try{
    if(readdirSync(directory).some(name=>name!=='data.lease'))throw new Error('Herstelmap is niet meer leeg.');
    writeFileSync(database,Buffer.alloc(0),{flag:'wx',mode:0o600});ownedDatabase=true;
    store=new Store(database);
    store.tx(()=>{
      store.db.exec('DELETE FROM meta');
      for(const name of TABLES){
        const columns=store.db.prepare(`PRAGMA table_info(${name})`).all().map(x=>x.name);
        const insert=store.db.prepare(`INSERT INTO ${name} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
        for(const row of snapshot.tables[name]){
          if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!==[...columns].sort().join(',')||(name==='meta'&&!META.has(row.key)))throw new Error('Backup bevat onbekende of ontbrekende velden.');
          if(columns.some(column=>row[column]!==null&&!['string','number'].includes(typeof row[column])))throw new Error('Backup bevat een ongeldig veldtype.');
          insert.run(...columns.map(column=>row[column]));
        }
      }
      const settings=validateSettings(store.settings());
      if(typeof store.getMeta('salt')!=='string'||!(/^[a-f0-9]{64}$/i.test(store.getMeta('salt'))))throw new Error('Deduplicatiebron ontbreekt.');
      if(typeof store.getMeta('installId')!=='string'||!Number.isSafeInteger(store.getMeta('createdAt')))throw new Error('Installatie-identiteit ontbreekt.');
      for(const [table,columns] of Object.entries({meta:['value'],candidates:['data','reasons'],conversations:['state'],outbox:['after_state','source_state','receipt_evidence']})){
        for(const row of snapshot.tables[table])for(const column of columns)if(row[column]!==null)JSON.parse(row[column]);
      }
      if(store.db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Backuprelaties ongeldig.');
      store.setMeta('settings',{...settings,autopilot:false});
      store.setMeta('worker',null);
      store.setMeta('stopReason','Backup hersteld. Controleer de inhoud en verbind een profiel opnieuw voordat je activeert.');
      // Restored reservations are re-evaluated; a restore is not permission to send them.
      store.db.exec("UPDATE inbox SET processed=0 WHERE id IN (SELECT input_id FROM outbox WHERE status='queued'); UPDATE outbox SET status='cancelled',error='Ingetrokken bij backupherstel' WHERE status='queued';");
      store.audit('BACKUP_RESTORED','Volledige logische SQLite-backup; profielen en providersleutels uitgesloten',now);
    });
    store.recover();
    if(store.db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('Herstelde database-integriteit ongeldig.');
    const result={database,records:Object.fromEntries(TABLES.map(name=>[name,Number(store.db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n)])),autopilot:false};
    store.close();store=null;return result;
  }catch(error){
    store?.close();
    // Only these newly created files are eligible for cleanup; never remove a profile tree.
    if(ownedDatabase)for(const suffix of ['','-wal','-shm'])try{unlinkSync(database+suffix);}catch{}
    throw error;
  }finally{release();}
}

export function acquireDataLease(directory){
  mkdirSync(directory,{recursive:true,mode:0o700});
  const canonical=realpathSync(directory),path=join(canonical,'data.lease'),guard=join(canonical,'data.lease.guard'),token=randomUUID();
  // Serialize even stale-lease recovery. Two starters must not both replace a dead owner.
  try{mkdirSync(guard);}catch{throw new Error('Dataprofiel is vergrendeld; inspecteer de bestaande lease.');}
  try{
    if(existsSync(path)){
      let prior;try{prior=JSON.parse(readFileSync(path,'utf8'));}catch{throw new Error('Dataprofiel is vergrendeld; inspecteer de bestaande lease.');}
      if(!Number.isSafeInteger(prior.pid)||prior.pid<1||processAlive(prior.pid))throw new Error('Dataprofiel is al in gebruik.');
      unlinkSync(path);
    }
    try{writeFileSync(path,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});}catch{throw new Error('Dataprofiel is al in gebruik.');}
  }finally{rmdirSync(guard);}
  return ()=>{try{if(JSON.parse(readFileSync(path,'utf8')).token===token)unlinkSync(path);}catch{}};
}

function eraseInside(store,id,now){
  const conversation=store.getConversation(id);if(!conversation)throw new Error('Gesprek niet gevonden.');
  if(store.db.prepare("SELECT id FROM outbox WHERE conversation=? AND status IN ('sending','uncertain')").get(id))throw new Error('Eerst onzekere of lopende verzending reconciliëren.');
  store.db.prepare("UPDATE outbox SET status='cancelled' WHERE conversation=? AND status='queued'").run(id);
  store.db.prepare('DELETE FROM messages WHERE conversation=?').run(id);
  store.db.prepare('DELETE FROM inbox WHERE conversation=?').run(id);
  const state=JSON.stringify({phase:'SUPPRESSED',agreedPrice:null,ceiling:0});
  store.db.prepare("UPDATE conversations SET state=?,notes='',updated=? WHERE id=?").run(state,now,id);
  store.db.prepare('UPDATE candidates SET data=?,score=0,eligible=0,reasons=? WHERE id=?').run(JSON.stringify({id,title:'Gespreksinhoud gewist',model:'',sellerId:'redacted:'+conversation.seller_key}),JSON.stringify(['Inhoud gewist; niet opnieuw benaderen']),id);
  for(const out of store.db.prepare('SELECT * FROM outbox WHERE conversation=?').all(id)){
    let evidence;try{if(JSON.parse(out.receipt_evidence)?.redacted)evidence=out.receipt_evidence;}catch{}
    evidence??=JSON.stringify({redacted:true,sourceHash:digest(out.source_state||''),messageHash:digest(out.text),receiptHash:out.receipt?digest(out.receipt):null});
    store.db.prepare("UPDATE outbox SET input_id=?,text='',after_state=?,source_state=?,receipt=?,receipt_evidence=?,error=NULL WHERE id=?").run(out.input_id?'sha256:'+digest(out.input_id):null,state,state,out.receipt?'sha256:'+digest(out.receipt):null,evidence,out.id);
  }
  for(const key of [`conversationUrl:${id}`,`conversationIdentity:${id}`])store.db.prepare('DELETE FROM meta WHERE key=?').run(key);
  store.db.prepare("UPDATE audit SET detail='' WHERE instr(detail,?)>0").run(id);
  store.audit('CONVERSATION_ERASED',`advertentie=${id}; deduplicatie en quota behouden`,now);
}
export function eraseConversation(store,id,now=Date.now()){
  if(typeof id!=='string'||!id)throw new Error('Gespreksidentiteit ontbreekt.');
  return store.tx(()=>{eraseInside(store,id,now);return {erased:true,retained:['listing-id','seller-hmac','quota-ledger']};});
}
export function runRetention(store,now=Date.now()){
  const cutoff=now-store.settings().retentionDays*86400000;
  return store.tx(()=>{
    let erased=0,blocked=0;
    for(const row of store.db.prepare('SELECT id,state FROM conversations WHERE updated<?').all(cutoff)){
      if(!['DECLINED','SUPPRESSED','LOST'].includes(JSON.parse(row.state).phase))continue;
      if(store.db.prepare("SELECT id FROM outbox WHERE conversation=? AND status IN ('sending','uncertain')").get(row.id)){blocked++;continue;}
      if(store.candidate(row.id)?.sellerId?.startsWith('redacted:'))continue;
      eraseInside(store,row.id,now);erased++;
    }
    store.db.prepare("DELETE FROM candidates WHERE created<? AND id NOT IN (SELECT id FROM conversations)").run(cutoff);
    store.db.prepare("UPDATE audit SET detail='' WHERE created<?").run(cutoff);
    store.setMeta('lastRetentionAt',now);store.audit('RETENTION_RUN',`${erased} gesprekken gewist; ${blocked} verzendingen wachten op reconciliatie`,now);
    return {erased,blocked,cutoff};
  });
}
export function healthReport(store,{now=Date.now(),workerEnabled=true}={}){
  const integrity=store.db.prepare('PRAGMA quick_check').get().quick_check;
  const worker=store.getMeta('worker'),age=worker?.heartbeat?now-worker.heartbeat:null;
  const uncertain=Number(store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='uncertain'").get().n);
  const stalled=Number(store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='sending' AND COALESCE(dispatch_at,claimed_at,created)<?").get(now-60000).n);
  const checks={database:integrity==='ok',worker:workerEnabled?(age!==null&&age>=0&&age<10000&&worker.status!=='failed'):!store.settings().autopilot,delivery:uncertain===0&&stalled===0};
  return {status:Object.values(checks).every(Boolean)?(store.settings().autopilot?'running':'paused'):'attention',checks,workerEnabled,heartbeatAgeMs:age,uncertain,stalled,lastRetentionAt:store.getMeta('lastRetentionAt'),mode:store.getMeta('mode')||'demo',liveReleased:false};
}
