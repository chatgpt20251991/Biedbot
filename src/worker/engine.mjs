import {classifyLocal,decide,renderDecision} from '../core/negotiation.mjs';
import {withinHours} from '../core/policy.mjs';
export class Engine {
  constructor(store,adapter,{mode='demo',account='demo',now=()=>Date.now(),classifier=null}={}){
    this.store=store;this.adapter=adapter;this.mode=mode;this.account=account;this.now=now;this.classifier=classifier;this.busy=false;this.lastSend=store.getMeta('lastSend:'+account)||0;this.lastOpening=store.getMeta('lastOpening:'+account)||0;this.lastScan=0;
  }
  async tick(){
    if(this.busy)return;this.busy=true;
    try{
      const now=this.now(),s=this.store.settings();
      this.store.setMeta('worker',{heartbeat:now,status:s.autopilot?'running':'paused',mode:this.mode});
      if(!s.autopilot)return;
      if(this.mode!=='demo'){
        // No first live action until the adapter has a released, tested capability contract.
        const gate=await this.adapter.health();if(!gate.ok)throw new Error(gate.message);
        if(!withinHours(now,s))return;
      }
      if(!this.lastScan||now-this.lastScan>(this.mode==='demo'?3600000:1800000)){
        const found=await this.adapter.discover(s);this.store.addCandidates(found,now);this.lastScan=now;
      }
      await this.adapter.sync();
      const input=this.store.nextInput(now);
      if(input){const c=this.store.getConversation(input.conversation);
        const classification=this.classifier?await this.classifier.classify(input.text,c.state):classifyLocal(input.text,c.state);
        const decision=decide(c.state,classification),text=renderDecision(decision,s);
        this.store.queueDecision(input,decision,text,now);
      }
      if(this.mode==='demo'||now-this.lastOpening>=s.newGapSeconds*1000){
        if(this.store.allocate(this.account,now)){this.lastOpening=now;this.store.setMeta('lastOpening:'+this.account,now);}
      }
      if(this.mode!=='demo'&&now-this.lastSend<s.replyGapSeconds*1000)return;
      // Re-read switch after AI wait: an emergency stop must cancel queued work too.
      if(!this.store.settings().autopilot)return;
      const out=this.store.claimSend(now);if(!out)return;
      try {
        const result=await this.adapter.send(out);
        if(!result?.receipt)throw new Error('Ontvangstbevestiging ontbreekt.');
        this.store.sent(out.id,result.receipt,this.now());this.lastSend=this.now();this.store.setMeta('lastSend:'+this.account,this.lastSend);
      }catch(e){this.store.uncertain(out.id,e.message,this.now());}
    }catch(e){this.store.updateSettings({autopilot:false});this.store.setMeta('stopReason',e.message);this.store.audit('WORKER_PAUSED',e.message);}
    finally{this.busy=false;}
  }
}
