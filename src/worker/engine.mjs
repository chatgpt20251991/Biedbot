import {classifyLocal,decide} from '../core/negotiation.mjs';
import {MessageComposer} from '../core/communication.mjs';
import {withinHours} from '../core/policy.mjs';

/** Decision, writing and dispatch are separate steps. A provider wait never holds
 * a SQLite transaction or grants permission to send an outdated message. */
export class Engine {
  constructor(store,adapter,{mode='demo',account='demo',now=()=>Date.now(),classifier=null,writer=null,composer=null}={}) {
    this.store=store;this.adapter=adapter;this.mode=mode;this.account=account;this.now=now;
    this.classifier=classifier;this.composer=composer||new MessageComposer({writer,mode,now});
    this.busy=false;this.lastSend=store.getMeta('lastSend:'+account)||0;
    this.lastOpening=store.getMeta('lastOpening:'+account)||0;this.lastScan=0;
  }
  async tick() {
    if(this.busy)return;this.busy=true;
    try {
      const now=this.now(),s=this.store.settings();
      this.store.setMeta('worker',{heartbeat:now,status:s.autopilot?'running':'paused',mode:this.mode});
      if(!s.autopilot)return;
      if(this.mode!=='demo') {
        const gate=await this.adapter.health();if(!gate.ok)throw new Error(gate.message);
        if(!withinHours(now,s))return;
      }
      if(!this.lastScan||now-this.lastScan>(this.mode==='demo'?3600000:1800000)) {
        const found=await this.adapter.discover(s);this.store.addCandidates(found,now);this.lastScan=now;
      }
      await this.adapter.sync();
      const input=this.store.nextInput(now);
      if(input) {
        const c=this.store.getConversation(input.conversation);
        input.source_policy=this.store.policyFingerprint();
        let classification=this.classifier?await this.classifier.classify(input.text,c.state):classifyLocal(input.text,c.state);
        // Multiple seller messages must not turn an intervening counterproposal
        // plus a bare "akkoord" into acceptance of our older, lower offer.
        const pending=this.store.pendingSellerMessages(c.id,this.now());
        if(classification.kind==='ACCEPT'&&pending.some(x=>x.id!==input.id&&
          (classifyLocal(x.text).kind==='PRICE'||/\b(?:mits|voorwaarde|inruil|extra kosten|als je|tenzij)\b/i.test(x.text)))) {
          classification={kind:'RISK',confidence:1,reason:'Akkoord verwijst mogelijk naar ander voorstel in berichtreeks'};
        }
        const decision=decide(c.state,classification);
        const silent=['NONE','REVIEW','SILENT_STOP'].includes(decision.action);
        this.store.queueDecision(input,decision,silent?null:'',this.now(),{deferComposition:!silent});
      }
      // Recheck before reserving generation or quota after waiting on a model.
      if(!this.store.settings().autopilot)return;
      if(this.mode==='demo'||now-this.lastOpening>=s.newGapSeconds*1000) {
        if(this.store.allocate(this.account,this.now(),{deferComposition:true})) {
          this.lastOpening=now;this.store.setMeta('lastOpening:'+this.account,now);
        }
      }
      const draft=this.store.claimComposition(this.now());
      if(draft) {
        const history=this.store.conversationHistory(draft.conversation,this.now());
        const incoming=draft.input_id?this.store.db.prepare('SELECT text FROM inbox WHERE id=?').get(draft.input_id):null;
        const decision={action:draft.action,price:draft.price,state:draft.after_state,
          reason:incoming?classifyLocal(incoming.text).reason||'':''};
        const result=await this.composer.compose(decision,{
          candidate:this.store.candidate(draft.conversation)||{},settings:this.store.settings(),
          sellerText:incoming?.text||'',history,
        });
        this.store.completeComposition(draft.id,result,this.now());
      }
      if(this.mode!=='demo'&&now-this.lastSend<s.replyGapSeconds*1000)return;
      if(!this.store.settings().autopilot)return;
      const out=this.store.claimSend(this.now(),{requireComposed:true});if(!out)return;
      let cancelled=false,authorized=false;
      try {
        const beforeDispatch=()=> {
          const latest=this.store.settings(),at=this.now();
          if(!latest.autopilot||(this.mode!=='demo'&&!withinHours(at,latest))) {
            this.store.cancelSend(out.id,'Autopilot gestopt of buiten contacturen',at);cancelled=true;return false;
          }
          const allowed=this.store.authorizeDispatch(out.id,at);cancelled=!allowed;authorized=allowed;return allowed;
        };
        const result=await this.adapter.send(out,{beforeDispatch});
        if(cancelled||result?.cancelled)return;
        if(this.mode!=='demo'&&!authorized)throw new Error('Adapter heeft definitieve verzendcontrole niet uitgevoerd.');
        if(!result?.receipt)throw new Error('Ontvangstbevestiging ontbreekt.');
        this.store.sent(out.id,result.receipt,this.now(),result.evidence??null);
        this.lastSend=this.now();this.store.setMeta('lastSend:'+this.account,this.lastSend);
      }catch(error){if(!cancelled)this.store.uncertain(out.id,error.message,this.now());}
    }catch(error) {
      this.store.updateSettings({autopilot:false});
      this.store.setMeta('stopReason',error.message);this.store.audit('WORKER_PAUSED',error.message);
    }finally{this.busy=false;}
  }
}
