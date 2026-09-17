import {createHash} from 'node:crypto';
import {buildVoiceContext,fallbackTemplate,finishText,assertFinalText,PROMPT_VERSION,VOICE_SYSTEM} from './voice.mjs';

export const DRAFT_TTL_MS=15*60*1000;
export const hashText=text=>createHash('sha256').update(String(text)).digest('hex');
export function policyFingerprint(settings,epoch=0) {
  // Binding a draft to the complete dealer policy is deliberately conservative.
  // Autopilot itself is a separate gate; its stop/start epoch is included.
  const {autopilot,...stable}=settings;
  return hashText(JSON.stringify({epoch,settings:stable}));
}
export class MessageComposer {
  constructor({writer=null,mode='demo',now=()=>Date.now()}={}) {this.writer=writer;this.mode=mode;this.now=now;}
  async compose(decision,details={}) {
    const context=buildVoiceContext({...details,now:this.now()});
    let template=fallbackTemplate(decision,context),source=this.writer?'deterministic':'offline',model=null,requestId=null,reason=null;
    const generative=['OPEN','ANCHOR','CONCESSION','HOLD','ASK_INFO'].includes(decision.action);
    if(template===null)return {text:null,metadata:{source:'deterministic',promptVersion:PROMPT_VERSION}};
    if(this.writer&&generative) {
      try {
        const response=await this.writer.write({system:VOICE_SYSTEM,context:{
          action:decision.action,priceToken:decision.price===null?null:'{{BOD}}',
          probeNumber:decision.state.peilingen||0,concessionNumber:decision.state.concessies||0,
          model:context.model,tone:context.tone,buyingThisWeek:context.buyingThisWeek,hasAlternatives:context.hasAlternatives,
          sellerText:context.sellerText,history:context.history,allowedFacts:context.allowedFacts,latestFacts:context.latestFacts,
        }});
        template=response.message;
        // Validate before accepting the model result. Substituting amounts alone
        // is insufficient: commitments, appointment claims and facts also matter.
        finishText(template,decision,context,{generated:true});
        source='anthropic';model=response.model||this.writer.model||null;requestId=response.requestId||null;
      }catch(error){
        reason=/^(?:VOICE|WRITER)_[A-Z_]+$/.test(error?.message||'')?error.message:'WRITER_UNAVAILABLE';
        template=fallbackTemplate(decision,context);source='fallback';
      }
    }
    const text=finishText(template,decision,context);
    assertFinalText(text,decision,context);
    const {sellerText,history,...validationContext}=context;
    return {text,metadata:{source,model,requestId,promptVersion:PROMPT_VERSION,guard:'validated',
      fallbackReason:reason,requiresReview:this.mode!=='demo'&&source==='fallback',
      createdAt:this.now(),expiresAt:context.buyingThisWeek&&Number.isSafeInteger(details.settings?.buyingIntentExpiresAt)?Math.min(this.now()+DRAFT_TTL_MS,details.settings.buyingIntentExpiresAt):this.now()+DRAFT_TTL_MS,textHash:hashText(text),validationContext}};
  }
}
