/** Local evidence only: real studio/composer output with offline or injected fixture writer. */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from '../src/core/store.mjs';
import {ConversationStudio} from '../src/core/studio.mjs';

export const styleFixtures=JSON.parse(readFileSync(new URL('../tests/fixtures/conversation-style.json',import.meta.url),'utf8'));
export const STYLE_WRITER_ACTIONS=new Set(['OPEN','ANCHOR','CONCESSION','HOLD','ASK_INFO']);
const now=Date.parse(styleFixtures.now);
const provenance=(mode,metadata)=>mode==='testwriter'&&metadata.source==='anthropic'?'testwriter':metadata.source;

export async function runStyleScenario(scenario,{mode='offline',writerOverride=null}={}) {
  if(!['offline','testwriter'].includes(mode))throw new Error('Only local offline or fixture-writer modes are supported.');
  const store=new Store(':memory:');
  const requests=[];
  let currentStep=-1;
  const writer=mode==='testwriter'?{model:'synthetic-fixture-writer-no-api',write:async payload=>{
    requests.push({step:currentStep,payload:structuredClone(payload)});
    const message=writerOverride?await writerOverride(payload,currentStep):currentStep<0?styleFixtures.openingWriterText:scenario.steps[currentStep].writerText;
    if(typeof message!=='string')throw new Error('WRITER_FIXTURE_MISSING');
    return {message,model:'synthetic-fixture-writer-no-api',requestId:`fixture-${scenario.id}-${currentStep+1}`};
  }}:null;
  try {
    store.updateSettings(styleFixtures.settings);
    const studio=new ConversationStudio(store,{writer,now:()=>now});
    let session=await studio.start({...styleFixtures.candidate,mode:'practice'});
    const steps=[];
    const capture=(seller,previousState)=>{
      const latest=session.latest;
      const last=session.history.at(-1);
      const text=last?.role==='assistant'?last.text:null;
      steps.push({seller,text,action:latest.action,price:latest.price,classification:latest.classification,
        previousState,state:structuredClone(session.state),
        evidenceSource:provenance(mode,latest.composition),
        composition:structuredClone(latest.composition)});
    };
    capture(null,null);
    for(const [index,step] of scenario.steps.entries()) {
      currentStep=index;
      const previousState=structuredClone(session.state);
      session=await studio.receive({id:session.id,text:step.seller,requestId:`style-${scenario.id}-${index}`});
      capture(step.seller,previousState);
    }
    return {id:scenario.id,title:scenario.title,mode,criteria:scenario.criteria,steps,requests,
      history:session.history.map(({role,text})=>({role,text})),state:structuredClone(session.state)};
  }finally{store.close();}
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceLabel={offline:'Werkelijke offline-uitvoer',testwriter:'Handgeschreven testwriter door de echte tekstcontrole',deterministic:'Vaste codezet',fallback:'Terugval na afgewezen testwriter'};

function conversationHtml(run) {
  return `<div class="conversation"><h3>${run.mode==='offline'?'Offline':'Testwriter (mock)'}</h3>${run.steps.map(step=>`${step.seller?`<div class="message seller"><small>Verkoper · synthetische invoer</small>${esc(step.seller)}</div>`:''}<div class="message assistant"><small>${esc(sourceLabel[step.evidenceSource]||step.evidenceSource)} · ${esc(step.action)}${step.price!==null?' · EUR '+esc(step.price):''}</small>${step.text===null?'<em>Geen bericht; gesprek gestopt of naar beoordeling.</em>':esc(step.text)}${step.composition.fallbackReason?`<strong class="warning">Reden: ${esc(step.composition.fallbackReason)}</strong>`:''}</div>`).join('')}<p class="end">Eindstatus: <strong>${esc(run.state.phase)}</strong> · ${run.state.peilingen} peilingen · ${run.state.concessies} concessies${run.state.agreedPrice!==null?' · Prijs voor bezichtiging: EUR '+esc(run.state.agreedPrice):''}</p></div>`;
}

export async function writeConversationStyleReview(outputDir) {
  const results=[];
  for(const scenario of styleFixtures.cases) {
    const offline=await runStyleScenario(scenario);
    const testwriter=await runStyleScenario(scenario,{mode:'testwriter'});
    results.push({id:scenario.id,title:scenario.title,criteria:scenario.criteria,offline,testwriter});
  }
  const generatedAt=new Date().toISOString();
  const report={schemaVersion:1,generatedAt,fixtureTime:styleFixtures.now,scope:styleFixtures.scope,
    evidence:{networkUsed:false,realModelCalled:false,platformMessageSent:false,userStyleApproval:false,
      method:'ConversationStudio met een SQLite-geheugendatabase en de echte MessageComposer. De rechterkolom injecteert vaste synthetische tekst in het writer-interface. De composer vermeldt intern anthropic voor die writer-route; dat veld is hier geen bewijs van een Anthropic-aanroep.',
      interpretation:'De voorbeelden tonen echt lokaal programmagedrag en toetsen invarianten. Ze bewijzen geen natuurlijke kwaliteit van een echt model of succes bij echte verkopers.'},
    settings:styleFixtures.settings,candidate:styleFixtures.candidate,results};
  mkdirSync(outputDir,{recursive:true});
  writeFileSync(join(outputDir,'gesprekken.json'),JSON.stringify(report,null,2)+'\n');
  const fallbacks=results.flatMap(r=>r.testwriter.steps).filter(s=>s.evidenceSource==='fallback').length;
  const html=`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BiedBot · Gesprekken ter beoordeling</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f4f6f2;color:#19382e;font:16px/1.6 system-ui,sans-serif}main{max-width:1240px;margin:auto;padding:36px 24px}h1{font-size:clamp(28px,5vw,46px);line-height:1.15;margin:12px 0 20px}h2{font-size:23px;line-height:1.3}h3{font-size:17px;margin:0 0 18px}.intro{max-width:920px}.badge,small{font-size:12px;color:#536a60}.note{padding:18px 22px;border-left:4px solid #967323;background:#fff7df}.case{margin:30px 0;padding:24px;border:1px solid #ccd9cf;border-radius:16px;background:#fff}.criteria{padding-left:22px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:24px}.conversation{min-width:0}.message{white-space:pre-wrap;padding:13px 16px;border:1px solid #d4dfd6;border-radius:12px;margin:12px 0}.seller{background:#fff;margin-right:24px}.assistant{background:#edf5e7;margin-left:24px}small{display:block;white-space:normal;margin-bottom:7px}.end{font-size:13px;color:#4f6259}.warning{display:block;color:#8a3123;margin-top:10px}code{overflow-wrap:anywhere}footer{font-size:13px;color:#536a60;margin-top:28px}@media(max-width:800px){.columns{grid-template-columns:1fr}.case{padding:18px}main{padding:24px 14px}}</style></head><body><main><div class="badge">BIEDBOT · ZEVEN SYNTHETISCHE TOETSGESPREKKEN</div><h1>Gesprekken ter beoordeling</h1><div class="intro"><p>Links staat de werkelijke uitvoer van de offline gespreksmotor. Rechts doorloopt een <strong>handgeschreven testwriter</strong> dezelfde studio, beslisregels en tekstcontrole. Die rechterkolom is geen Claude-uitvoer.</p><p class="note">Nog geen goedkeuring van de gesprekstoon. Deze voorbeelden maken opbouw, tekst en grenzen bespreekbaar. Er zijn geen API-aanroepen of platformberichten verstuurd. Een groen technisch resultaat bewijst nog geen goede praktijkgesprekken.</p><p>Vraagprijs EUR ${styleFixtures.candidate.ask}; anker en plafond komen uit de echte deterministische code. De testwriter krijgt alleen de prijsplaceholder voor het nieuwe bod. Akkoord, peilingen en afhaken blijven vaste codezetten.</p><p>Scenario's: ${results.length} · Uitvoeringen: ${results.length*2} · Testwriterterugvallen: <strong>${fallbacks}</strong>. Terugvallen blijven zichtbaar; ze worden niet als modeluitvoer getoond.</p></div>${results.map(r=>`<section class="case"><h2>${esc(r.title)}</h2><ul class="criteria">${r.criteria.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><div class="columns">${conversationHtml(r.offline)}${conversationHtml(r.testwriter)}</div></section>`).join('')}<footer>Gegenereerd: ${esc(generatedAt)}. Fictieve gespreksklok: ${esc(styleFixtures.now)}.<br>Reproduceren: <code>node scripts/conversation-style-review.mjs</code>. Gegevens en writercontext: <code>gesprekken.json</code>.</footer></main></body></html>`;
  writeFileSync(join(outputDir,'GESPREKKEN.html'),html);
  return {outputDir,scenarios:results.length,runs:results.length*2,testwriterFallbacks:fallbacks};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  console.log(JSON.stringify(await writeConversationStyleReview(join(repo,'reports','conversation-style')),null,2));
}
