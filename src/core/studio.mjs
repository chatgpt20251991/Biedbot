import {randomUUID} from 'node:crypto';
import {initialState,classifyLocal,decide,TERMINAL} from './negotiation.mjs';
import {MessageComposer,hashText} from './communication.mjs';
import {safeModel} from './voice.mjs';

/** No platform adapter, no outbox and no automatic real contacts. Practice and
 * copy-assisted work never share state with the demo autopilot. */
export class ConversationStudio {
  constructor(store,{writer=null,classifier=null,now=()=>Date.now()}={}) {
    this.store=store;this.now=now;this.classifier=classifier;
    this.composer=new MessageComposer({writer,mode:'demo',now});
  }
  read(){return this.store.getMeta('conversationStudio');}
  save(session){this.store.setMeta('conversationStudio',session);return session;}
  assertRequest(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Ongeldige studio-invoer.');
  }
  async start(input) {
    this.assertRequest(input);
    const allowed=['model','ask','mode','dealerMax'];
    if(Object.keys(input).some(k=>!allowed.includes(k)))throw new Error('Onbekend studioveld.');
    if(!['practice','assistive'].includes(input.mode)||typeof input.model!=='string'||safeModel(input.model)!==input.model.trim())throw new Error('Kies een geldige werkstand en automodelnaam.');
    if(!Number.isSafeInteger(input.ask)||input.ask<1000||input.ask>200000)throw new Error('Vraagprijs moet een heel eurobedrag van 1000 tot 200000 zijn.');
    if(input.dealerMax!==undefined&&(!Number.isSafeInteger(input.dealerMax)||input.dealerMax<100||input.dealerMax>input.ask))throw new Error('Ongeldig persoonlijk maximum.');
    const settings=this.store.settings();
    const state=initialState(input.ask,settings.discountPct,{dealerMax:input.dealerMax,budgetAvailable:settings.budget});
    const session={id:randomUUID(),revision:1,mode:input.mode,candidate:{model:input.model.trim(),ask:input.ask},state,
      history:[],pending:null,latest:null,notice:null,createdAt:this.now(),updatedAt:this.now(),sourcePolicy:this.store.policyFingerprint()};
    this.save(session);
    return this.generate(session,{action:'OPEN',price:null,state:{...state,phase:'WAITING_INFO'}});
  }
  async receive(input) {
    this.assertRequest(input);
    if(Object.keys(input).some(k=>!['id','text','requestId'].includes(k)))throw new Error('Onbekend studioveld.');
    const current=this.read();
    if(!current||input.id!==current.id)throw new Error('Start eerst een gesprek.');
    if(typeof input.text!=='string'||!input.text.trim()||input.text.length>6000)throw new Error('Gebruik een bericht van maximaal 6000 tekens.');
    if(typeof input.requestId!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(input.requestId))throw new Error('Bericht-ID ontbreekt.');
    if(current.history.some(x=>x.id===input.requestId))return current;
    if(TERMINAL.has(current.state.phase))throw new Error('Dit gesprek is gestopt. Start een nieuw oefengesprek of handel het zelf af.');
    if(current.history.length>=64)throw new Error('Gesprekslimiet bereikt. Neem het gesprek zelf over.');
    if(current.sourcePolicy!==this.store.policyFingerprint())throw new Error('Inkoopprofiel gewijzigd. Start opnieuw met de nieuwe grenzen.');
    const session=structuredClone(current);session.revision++;session.pending=null;session.updatedAt=this.now();
    session.history.push({id:input.requestId,role:'seller',text:input.text.trim(),created:this.now()});
    this.save(session); // Invalidate any older in-flight draft before waiting on AI.
    let c=this.classifier?await this.classifier.classify(input.text,session.state):classifyLocal(input.text,session.state);
    const sinceLast=session.history.slice(session.history.findLastIndex(x=>x.role==='assistant')+1);
    if(c.kind==='ACCEPT'&&sinceLast.slice(0,-1).some(x=>classifyLocal(x.text).kind==='PRICE'||/\b(?:mits|voorwaarde|extra kosten|inruil|tenzij|als je)\b/i.test(x.text)))c={kind:'RISK',confidence:1};
    return this.generate(session,decide(session.state,c),c);
  }
  async generate(session,decision,classification=null) {
    const snapshot=session.revision;
    const lastSeller=session.history.findLast(x=>x.role==='seller')?.text||'';
    const result=await this.composer.compose(decision,{candidate:session.candidate,settings:this.store.settings(),history:session.history,sellerText:lastSeller});
    const current=this.read();
    if(!current||current.id!==session.id||current.revision!==snapshot||current.sourcePolicy!==this.store.policyFingerprint())return current;
    session.latest={action:decision.action,price:decision.price,reason:decision.reason||'',classification,composition:result.metadata};
    if(result.text===null){session.state=decision.state;session.pending=null;}
    else if(session.mode==='practice'){
      session.history.push({id:randomUUID(),role:'assistant',text:result.text,created:this.now(),composition:result.metadata,simulated:true});
      session.state=decision.state;
    }else{
      session.pending={id:randomUUID(),text:result.text,textHash:hashText(result.text),afterState:decision.state,
        sourceRevision:snapshot,sourcePolicy:session.sourcePolicy,composition:result.metadata};
    }
    session.updatedAt=this.now();return this.save(session);
  }
  async regenerate(input) {
    this.assertRequest(input);const current=this.read();
    if(Object.keys(input).some(k=>k!=='id')||!current||input.id!==current.id||current.mode!=='assistive'||!current.pending)throw new Error('Geen handmatig concept om opnieuw te schrijven.');
    if(current.sourcePolicy!==this.store.policyFingerprint())throw new Error('Inkoopprofiel gewijzigd. Neem het gesprek zelf over.');
    const session=structuredClone(current),pending=session.pending;
    session.revision++;session.pending=null;session.updatedAt=this.now();this.save(session);
    return this.generate(session,{action:session.latest.action,price:session.latest.price,reason:session.latest.reason,state:pending.afterState},session.latest.classification);
  }
  confirm(input) {
    this.assertRequest(input);const s=this.read(),p=s?.pending;
    if(!s||s.mode!=='assistive'||s.id!==input.id||!p||p.id!==input.draftId||p.textHash!==input.textHash)throw new Error('Concept is niet meer geldig.');
    if(input.confirm!=='IK HEB DIT ZELF VERSTUURD')throw new Error('Bevestig alleen een bericht dat je zelf daadwerkelijk hebt verstuurd.');
    if(s.revision!==p.sourceRevision||s.sourcePolicy!==this.store.policyFingerprint()||p.composition.expiresAt<this.now())throw new Error('Concept is verlopen of je instellingen zijn gewijzigd.');
    s.history.push({id:p.id,role:'assistant',text:p.text,created:this.now(),composition:p.composition,operatorConfirmed:true});
    s.state=p.afterState;s.pending=null;s.revision++;s.updatedAt=this.now();return this.save(s);
  }
  stop() {
    const s=this.read();if(!s)return null;
    s.state.phase='REVIEW';s.revision++;s.pending=null;s.notice='Overgenomen. BiedBot maakt geen vervolgbericht meer.';return this.save(s);
  }
  clear(){this.store.setMeta('conversationStudio',null);return null;}
}
