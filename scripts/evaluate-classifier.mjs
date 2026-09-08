import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {classifyLocal,validateClassification,decide,initialState} from '../src/core/negotiation.mjs';
import {NL_CASES,NL_CORPUS} from '../tests/fixtures/nl-classification-cases.mjs';
import {Store} from '../src/core/store.mjs';
import {createWorkerClassifier} from '../src/worker/classifier.mjs';

export async function evaluateClassifier(classifier={classify:classifyLocal},{provider='offline-local',cases=NL_CASES}={}){
  const outcomes=[];
  for(const item of cases){
    const state={...initialState(10000,25),phase:'NEGOTIATING',lastOffer:item.lastOffer};
    let classification,error=null;
    try{classification=await classifier.classify(item.text,state);}catch{classification={kind:'UNKNOWN',confidence:0};error='classifier-failed';}
    const decision=decide(state,classification),accepted=decision.action==='ACCEPT';
    outcomes.push({id:item.id,category:item.category,expected:item.expected,kind:classification.kind,action:decision.action,price:decision.price,error,
      falseAccept:accepted&&!item.expected.accept,falseReject:!accepted&&item.expected.accept,
      wrongPrice:accepted&&item.expected.accept&&decision.price!==item.expected.price});
  }
  const negatives=cases.filter(x=>!x.expected.accept).length,positives=cases.length-negatives;
  const n=field=>outcomes.filter(x=>x[field]).length;
  const falseAccepts=n('falseAccept'),falseRejects=n('falseReject'),wrongPrices=n('wrongPrice'),errors=n('error');
  return {createdAt:new Date().toISOString(),corpus:NL_CORPUS,provider,
    scope:provider==='anthropic'?'LIVE_PROVIDER_ON_SYNTHETIC_INPUT':'LOCAL_RULES_OR_INJECTED_MOCK_ONLY',
    total:cases.length,negativeCases:negatives,positiveCases:positives,falseAccepts,falseAcceptRate:negatives?falseAccepts/negatives:null,
    falseRejects,falseRejectRate:positives?falseRejects/positives:null,wrongPrices,errors,
    releaseEvidence:false,limitations:['Synthetische regressieset; geen echte geanonimiseerde gesprekken.','Geen schatting van foutenfrequentie bij echte verkopers.','Geen bewijs van commercieel resultaat.'],outcomes};
}
async function main(){
  const args=process.argv.slice(2),provider=args.includes('--anthropic')?'anthropic':args.includes('--adversarial-mock')?'adversarial-mock':'offline-local';
  const allowed=new Set(['--anthropic','--adversarial-mock','--allow-network','--output']);
  for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw new Error('Onbekende evaluatieoptie');if(args[i]==='--output')i++;}
  if(args.includes('--anthropic')&&args.includes('--adversarial-mock'))throw new Error('Kies één classifier');
  if(provider==='anthropic'&&!args.includes('--allow-network'))throw new Error('Echte Anthropic-evaluatie vereist expliciet --allow-network en eigen providerconfiguratie');
  let store,classifier={classify:classifyLocal};
  if(provider==='adversarial-mock')classifier={classify:text=>validateClassification({kind:'ACCEPT',confidence:1},text)};
  try{
    if(provider==='anthropic'){store=new Store(':memory:');store.updateSettings({aiMaxRequestsDaily:Math.min(500,NL_CASES.length)});classifier=createWorkerClassifier({store});if(!classifier)throw new Error('BIEDBOT_AI_PROVIDER=anthropic is niet ingesteld');}
    const report=await evaluateClassifier(classifier,{provider});
    const index=args.indexOf('--output');if(index>=0&&!args[index+1])throw new Error('Uitvoerpad ontbreekt');
    const path=resolve(index>=0?args[index+1]:`reports/nl-evaluation-${provider}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({path,total:report.total,falseAccepts:report.falseAccepts,falseAcceptRate:report.falseAcceptRate,falseRejects:report.falseRejects,wrongPrices:report.wrongPrices,errors:report.errors,scope:report.scope,releaseEvidence:false}));
    if(report.falseAccepts||report.wrongPrices||report.errors)process.exitCode=1;
  }finally{store?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Evaluatie gestopt: controleer expliciete provideropties en lokale configuratie. Er is geen vrijgavebewijs.');process.exitCode=1;});
