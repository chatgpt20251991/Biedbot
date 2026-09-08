import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULTS, validateSettings, localParts, boundedCap, HARD_TOTAL_MESSAGE_CAP } from './policy.mjs';
import { initialState, opening, scoreCandidate, TERMINAL, classifyLocal } from './negotiation.mjs';
export class Store {
  constructor(file=':memory:') {
    if(file!==':memory:') mkdirSync(dirname(file),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(file,{timeout:5000});
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY, data TEXT NOT NULL, score INTEGER NOT NULL, eligible INTEGER NOT NULL, reasons TEXT NOT NULL, created INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, seller_key TEXT NOT NULL UNIQUE, account TEXT NOT NULL, state TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, notes TEXT NOT NULL DEFAULT '') STRICT;
      CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES conversations(id), text TEXT NOT NULL, due INTEGER NOT NULL, processed INTEGER NOT NULL DEFAULT 0) STRICT;
      CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES conversations(id), account TEXT NOT NULL, input_id TEXT UNIQUE, action TEXT NOT NULL, price INTEGER, text TEXT NOT NULL, after_state TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','sending','sent','uncertain','cancelled')), created INTEGER NOT NULL, day TEXT NOT NULL, sent_at INTEGER, receipt TEXT, error TEXT) STRICT;
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES conversations(id), role TEXT NOT NULL CHECK(role IN ('seller','assistant')), text TEXT NOT NULL, created INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, created INTEGER NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS ai_requests(id TEXT PRIMARY KEY, created INTEGER NOT NULL, status TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0) STRICT;
      CREATE INDEX IF NOT EXISTS outbox_quota ON outbox(account,created,status);
      CREATE INDEX IF NOT EXISTS inbox_due ON inbox(processed,due);
    `);
    this.tx(()=>{
      if(!this.getMeta('settings')) this.setMeta('settings',{...DEFAULTS});
      if(!this.getMeta('installId')) this.setMeta('installId',randomUUID());
      if(!this.getMeta('salt')) this.setMeta('salt',randomBytes(32).toString('hex'));
      if(!this.getMeta('createdAt')) this.setMeta('createdAt',Date.now());
    });
    if(file!==':memory:') try {chmodSync(file,0o600);}catch{}
  }
  close(){this.db.close();}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  getMeta(k){const r=this.db.prepare('SELECT value FROM meta WHERE key=?').get(k);return r?JSON.parse(r.value):null;}
  setMeta(k,v){this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,JSON.stringify(v));}
  settings(){return this.getMeta('settings');}
  updateSettings(input){return this.tx(()=>{const s=validateSettings(input,this.settings());this.setMeta('settings',s);this.audit('SETTINGS_UPDATED',Object.keys(input).join(', '));return s;});}
  audit(kind,detail='',now=Date.now()){
    const clean=String(detail).replace(/(?:sk-[\w-]+|Bearer\s+\S+|\b06[\d -]{8,12})/gi,'[REDACTED]').slice(0,400);
    this.db.prepare('INSERT INTO audit(created,kind,detail) VALUES(?,?,?)').run(now,kind,clean);
  }
  sellerKey(sellerId){return createHmac('sha256',this.getMeta('salt')).update(String(sellerId)).digest('hex');}
  candidate(id){const r=this.db.prepare('SELECT * FROM candidates WHERE id=?').get(id);return r?{...JSON.parse(r.data),score:r.score,eligible:!!r.eligible,reasons:JSON.parse(r.reasons)}:null;}
  addCandidates(list,now=Date.now()){
    if(!Array.isArray(list)||list.length>1000)throw new Error('Ongeldige kandidatenlijst.');
    return this.tx(()=>{let count=0;const s=this.settings();for(const c of list){
      if(!c||typeof c.id!=='string'||!/^[-a-zA-Z0-9:]{1,100}$/.test(c.id)||typeof c.sellerId!=='string'||!c.sellerId||c.sellerId.length>100)continue;
      if(typeof c.title!=='string'||c.title.length>250||typeof c.model!=='string'||c.model.length>60)continue;
      const assessment=scoreCandidate(c,s);
      count+=Number(this.db.prepare('INSERT OR IGNORE INTO candidates VALUES(?,?,?,?,?,?)').run(c.id,JSON.stringify(c),assessment.score,+assessment.eligible,JSON.stringify(assessment.reasons),now).changes);
    } if(count)this.audit('SCOUT_FOUND',`${count} kandidaten`,now); return count;});
  }
  rescore(){const s=this.settings();return this.tx(()=>{for(const r of this.db.prepare('SELECT id,data FROM candidates').all()){
    const a=scoreCandidate(JSON.parse(r.data),s);this.db.prepare('UPDATE candidates SET score=?,eligible=?,reasons=? WHERE id=?').run(a.score,+a.eligible,JSON.stringify(a.reasons),r.id);
  }});}
  getConversation(id){const r=this.db.prepare('SELECT * FROM conversations WHERE id=?').get(id);return r?{...r,state:JSON.parse(r.state)}:null;}
  outstandingBudget(){let n=0;for(const r of this.db.prepare('SELECT state FROM conversations').all()){
    const s=JSON.parse(r.state);if(!['DECLINED','SUPPRESSED','LOST'].includes(s.phase)) n+=s.agreedPrice??s.ceiling;
  }return n;}
  usage(account,now=Date.now()){
    const day=localParts(now).day, since=now-86400000;
    const q=this.db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN action='OPEN' THEN 1 ELSE 0 END) openings FROM outbox WHERE account=? AND status!='cancelled' AND (day=? OR COALESCE(sent_at,created)>?)`).get(account,day,since);
    return {openings:Number(q.openings||0),total:Number(q.total||0)};
  }
  reserveOpen(id,account='demo',now=Date.now()){
    return this.tx(()=>{
      const s=this.settings(),c=this.candidate(id);
      if(!c||!scoreCandidate(c,s).eligible)return null;
      const usage=this.usage(account,now);
      if(usage.openings>=boundedCap(s.dailyCap)||usage.total>=Math.min(s.totalMessageCap,HARD_TOTAL_MESSAGE_CAP))return null;
      if(this.db.prepare('SELECT id FROM conversations WHERE id=? OR seller_key=?').get(id,this.sellerKey(c.sellerId)))return null;
      const assessed=scoreCandidate(c,s), available=s.budget-this.outstandingBudget();
      if(available<assessed.ceiling)return null;
      const state=initialState(c.ask,s.discountPct,{dealerMax:assessed.ceiling,budgetAvailable:available});
      const after={...state,phase:'WAITING_INFO'};
      this.db.prepare('INSERT INTO conversations(id,seller_key,account,state,created,updated) VALUES(?,?,?,?,?,?)').run(id,this.sellerKey(c.sellerId),account,JSON.stringify(state),now,now);
      const oid=randomUUID();
      this.db.prepare(`INSERT INTO outbox(id,conversation,account,input_id,action,price,text,after_state,status,created,day) VALUES(?,?,?,NULL,'OPEN',NULL,?,?,'queued',?,?)`).run(oid,id,account,opening(c,s),JSON.stringify(after),now,localParts(now).day);
      this.audit('CONTACT_RESERVED',id,now);return oid;
    });
  }
  allocate(account='demo',now=Date.now()){
    for(const r of this.db.prepare('SELECT id FROM candidates WHERE eligible=1 ORDER BY score DESC,created ASC').all()){
      const id=this.reserveOpen(r.id,account,now);if(id)return id;
    }return null;
  }
  ingest(id,conversation,text,due=Date.now()){
    if(typeof text!=='string'||text.length>6000||typeof id!=='string'||id.length>200)throw new Error('Ongeldig bericht.');
    if(!this.getConversation(conversation))return false;
    return this.tx(()=>{
      const n=this.db.prepare('INSERT OR IGNORE INTO inbox(id,conversation,text,due) VALUES(?,?,?,?)').run(id,conversation,text,due).changes;
      if(n){
        this.db.prepare("INSERT OR IGNORE INTO messages VALUES(?,?,'seller',?,?)").run(id,conversation,text,due);
        // An opt-out supersedes queued work immediately, not after its next turn.
        const incomingKind=classifyLocal(text).kind;
        if(['OPT_OUT','RISK','SOLD'].includes(incomingKind)){
          const c=this.getConversation(conversation);
          this.db.prepare('UPDATE conversations SET state=?,updated=? WHERE id=?').run(JSON.stringify({...c.state,phase:incomingKind==='OPT_OUT'?'SUPPRESSED':incomingKind==='SOLD'?'DECLINED':'REVIEW'}),due,conversation);
          this.db.prepare("UPDATE outbox SET status='cancelled' WHERE conversation=? AND status='queued'").run(conversation);
          this.db.prepare('UPDATE inbox SET processed=1 WHERE id=?').run(id);
          this.audit(incomingKind==='OPT_OUT'?'SELLER_OPT_OUT':'SELLER_PRIORITY_STOP',conversation,due);
        }
      }
      return !!n;
    });
  }
  nextInput(now=Date.now()){
    return this.db.prepare(`SELECT i.* FROM inbox i WHERE i.processed=0 AND i.due<=? AND NOT EXISTS(SELECT 1 FROM outbox o WHERE o.conversation=i.conversation AND o.status IN ('queued','sending','uncertain')) AND NOT EXISTS(SELECT 1 FROM inbox n WHERE n.conversation=i.conversation AND n.processed=0 AND n.due<=? AND (n.due>i.due OR (n.due=i.due AND n.rowid>i.rowid))) ORDER BY i.due,i.id LIMIT 1`).get(now,now)||null;
  }
  queueDecision(input,decision,text,now=Date.now()){
    return this.tx(()=>{
      const i=this.db.prepare('SELECT * FROM inbox WHERE id=?').get(input.id);
      if(!i||i.processed)return false;
      const c=this.getConversation(i.conversation);
      if(TERMINAL.has(c.state.phase)){this.db.prepare('UPDATE inbox SET processed=1 WHERE conversation=? AND (due<? OR (due=? AND rowid<=(SELECT rowid FROM inbox WHERE id=?)))').run(i.conversation,i.due,i.due,i.id);return false;}
      if(this.db.prepare("SELECT id FROM outbox WHERE conversation=? AND status IN ('queued','sending','uncertain')").get(c.id))return false;
      if(!text){
        this.db.prepare('UPDATE conversations SET state=?,updated=? WHERE id=?').run(JSON.stringify(decision.state),now,c.id);
        this.db.prepare('UPDATE inbox SET processed=1 WHERE conversation=? AND (due<? OR (due=? AND rowid<=(SELECT rowid FROM inbox WHERE id=?)))').run(i.conversation,i.due,i.due,i.id);
        this.audit(decision.action,`${c.id}: ${decision.reason||''}`,now);return true;
      }
      if(this.usage(c.account,now).total>=Math.min(HARD_TOTAL_MESSAGE_CAP,this.settings().totalMessageCap))return false;
      this.db.prepare(`INSERT INTO outbox(id,conversation,account,input_id,action,price,text,after_state,status,created,day) VALUES(?,?,?,?,?,?,?,?,'queued',?,?)`).run(randomUUID(),c.id,c.account,i.id,decision.action,decision.price,text,JSON.stringify(decision.state),now,localParts(now).day);
      this.db.prepare('UPDATE inbox SET processed=1 WHERE conversation=? AND (due<? OR (due=? AND rowid<=(SELECT rowid FROM inbox WHERE id=?)))').run(i.conversation,i.due,i.due,i.id);
      return true;
    });
  }
  claimSend(now=Date.now()){
    return this.tx(()=>{
      const r=this.db.prepare("SELECT * FROM outbox WHERE status='queued' ORDER BY CASE WHEN action='OPEN' THEN 1 ELSE 0 END,created,id LIMIT 1").get();
      if(!r)return null;
      // A queued message is not allowed to ignore a subsequent stop / takeover.
      const c=this.getConversation(r.conversation);
      if(TERMINAL.has(c.state.phase)) {this.db.prepare("UPDATE outbox SET status='cancelled' WHERE id=?").run(r.id);return null;}
      this.db.prepare("UPDATE outbox SET status='sending' WHERE id=? AND status='queued'").run(r.id);
      this.audit('SEND_ATTEMPT',`${r.conversation}: ${r.action}`,now);
      return {...r,after_state:JSON.parse(r.after_state)};
    });
  }
  sent(id,receipt,now=Date.now()){
    if(typeof receipt!=='string'||!receipt||receipt.length>200)throw new Error('Geen platformbevestiging.');
    return this.tx(()=>{
      const o=this.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
      if(!o||o.status==='sent')return false;
      if(o.status!=='sending')throw new Error('Ongeldige outbox-overgang.');
      this.db.prepare("UPDATE outbox SET status='sent',sent_at=?,receipt=?,day=? WHERE id=?").run(now,receipt,localParts(now).day,id);
      this.db.prepare("INSERT OR IGNORE INTO messages VALUES(?,?,'assistant',?,?)").run(id,o.conversation,o.text,now);
      const current=this.getConversation(o.conversation);
      // If the operator stopped the conversation while sending, preserve that stop.
      if(!TERMINAL.has(current.state.phase))this.db.prepare('UPDATE conversations SET state=?,updated=? WHERE id=?').run(o.after_state,now,o.conversation);
      this.audit(o.action==='ACCEPT'?'HOT_LEAD':'SEND_CONFIRMED',`${o.conversation}: ${o.action}`,now);
      return true;
    });
  }
  uncertain(id,error,now=Date.now()){
    return this.tx(()=>{
      const o=this.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);if(!o||o.status==='sent')return;
      this.db.prepare("UPDATE outbox SET status='uncertain',error=? WHERE id=?").run(String(error).slice(0,250),id);
      this.setMeta('stopReason','Verzendstatus onzeker. Eerst controleren; geen automatische herhaling.');
      const s=this.settings();this.setMeta('settings',{...s,autopilot:false});
      this.audit('DELIVERY_UNCERTAIN',o.conversation,now);
    });
  }
  recover(){
    const rows=this.db.prepare("SELECT id FROM outbox WHERE status='sending'").all();
    for(const r of rows)this.uncertain(r.id,'Proces herstart tijdens verzending.');
    return rows.length;
  }
  takeover(id,phase='REVIEW',now=Date.now()){
    if(!['REVIEW','PURCHASED','LOST'].includes(phase))throw new Error('Ongeldige dealstatus.');
    return this.tx(()=>{const c=this.getConversation(id);if(!c)throw new Error('Gesprek niet gevonden.');
      this.db.prepare('UPDATE conversations SET state=?,updated=? WHERE id=?').run(JSON.stringify({...c.state,phase}),now,id);
      this.db.prepare("UPDATE outbox SET status='cancelled' WHERE conversation=? AND status='queued'").run(id);
      this.audit('MANUAL_STATUS',`${id}: ${phase}`,now);
    });
  }
  dashboard(now=Date.now()){
    const s=this.settings();
    const candidates=this.db.prepare('SELECT id FROM candidates ORDER BY score DESC LIMIT 200').all().map(x=>this.candidate(x.id));
    const conversations=this.db.prepare('SELECT id FROM conversations ORDER BY updated DESC LIMIT 200').all().map(x=>{
      const c=this.getConversation(x.id);return {...c,candidate:this.candidate(x.id),messages:this.db.prepare('SELECT role,text,created FROM messages WHERE conversation=? ORDER BY created,rowid').all(x.id)};
    });
    const usage=this.usage(this.getMeta('mode')==='live'?(this.getMeta('platformAccount')||'unbound'):'demo',now);
    return {settings:s,installId:this.getMeta('installId'),mode:this.getMeta('mode')||'demo',worker:this.getMeta('worker'),
      stopReason:this.getMeta('stopReason'),createdAt:this.getMeta('createdAt'),candidates,conversations,usage,
      committedBudget:this.outstandingBudget(),outbox:this.db.prepare('SELECT action,status,created,conversation,error FROM outbox ORDER BY created DESC LIMIT 100').all(),
      activity:this.db.prepare('SELECT created,kind,detail FROM audit ORDER BY id DESC LIMIT 60').all(),
      ai:{requests:Number(this.db.prepare('SELECT COUNT(*) n FROM ai_requests WHERE created>?').get(now-86400000).n)},
      gates:{liveBuildReleased:false,platformAuthorization:false,realBrowserTest:false,billingConfigured:false},
      totals:{eligible:candidates.filter(c=>c.eligible).length,hot:conversations.filter(c=>c.state.phase==='HOT_LEAD').length,
        purchased:conversations.filter(c=>c.state.phase==='PURCHASED').length,review:conversations.filter(c=>c.state.phase==='REVIEW').length,
        sent:Number(this.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='sent'").get().n)}};
  }
  diagnostics(){return {installId:this.getMeta('installId'),worker:this.getMeta('worker'),mode:this.getMeta('mode')||'demo',
    sqlite:this.db.prepare('PRAGMA quick_check').get(), counts:{candidates:this.db.prepare('SELECT COUNT(*) n FROM candidates').get().n,outbox:this.db.prepare('SELECT COUNT(*) n FROM outbox').get().n},
    events:this.db.prepare('SELECT created,kind FROM audit ORDER BY id DESC LIMIT 50').all()};}
  exportData(){return {version:1,exportedAt:new Date().toISOString(),...this.dashboard()};}
  resetDemo(){
    if((this.getMeta('mode')||'demo')!=='demo')throw new Error('Alleen demo kan worden herstart.');
    return this.tx(()=>{
      this.db.exec('DELETE FROM messages; DELETE FROM inbox; DELETE FROM outbox; DELETE FROM conversations; DELETE FROM candidates; DELETE FROM audit; DELETE FROM ai_requests;');
      this.setMeta('settings',{...this.settings(),autopilot:false});this.setMeta('stopReason',null);this.setMeta('demoSeeded',false);
      this.audit('DEMO_RESET');
    });
  }
  reserveAi(now=Date.now()) {return this.tx(()=>{
    const used=this.db.prepare('SELECT COUNT(*) n FROM ai_requests WHERE created>?').get(now-86400000).n;
    if(used>=this.settings().aiMaxRequestsDaily)throw new Error('Dagbudget AI-aanroepen bereikt.');
    const id=randomUUID();this.db.prepare("INSERT INTO ai_requests(id,created,status) VALUES(?,?,'reserved')").run(id,now);return id;
  });}
  completeAi(id,status,usage={}){this.db.prepare('UPDATE ai_requests SET status=?,input_tokens=?,output_tokens=? WHERE id=?').run(status,Math.max(0,Math.floor(usage.input_tokens||0)),Math.max(0,Math.floor(usage.output_tokens||0)),id);}
}
