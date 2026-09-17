import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageComposer} from '../src/core/communication.mjs';
import {initialState,classifyLocal,decide} from '../src/core/negotiation.mjs';
import {PRICE_TOKEN} from '../src/core/voice.mjs';
import {runStyleScenario,styleFixtures,STYLE_WRITER_ACTIONS} from '../scripts/conversation-style-review.mjs';

const moneyActions=new Set(['ANCHOR','HOLD','CONCESSION','ACCEPT']);
const now=Date.parse(styleFixtures.now);
const examples=new Map(styleFixtures.cases.map(s=>[s.id,s]));
const outputs=new Map();
const run=(id,mode='offline')=>{
  const key=id+':'+mode;
  if(!outputs.has(key))outputs.set(key,runStyleScenario(examples.get(id),{mode}));
  return outputs.get(key);
};
const mentionedMoney=text=>[...(text||'').matchAll(/\bEUR\s+(\d{1,3}(?:\.\d{3})*|\d+)/g)].map(m=>Number(m[1].replaceAll('.','')));

for(const scenario of styleFixtures.cases)for(const mode of ['offline','testwriter']) {
  test(`gespreksopbouw (${mode}): ${scenario.title}`,async()=>{
    const result=await run(scenario.id,mode);
    assert.equal(result.steps.length,scenario.steps.length+1);
    assert.equal(result.steps[0].action,'OPEN');
    assert.deepEqual(mentionedMoney(result.steps[0].text),[],'opening bevat geen prijs');
    assert.doesNotMatch(result.steps[0].text,/\b(?:bod|bieden|betalen|vraagprijs)\b/i);
    assert.match(result.steps[0].text,/onderhoud/i);
    assert.match(result.steps[0].text,/reden|waarom/i);
    assert.equal(result.state.phase,scenario.finalPhase);
    assert.ok(result.state.peilingen<=2);
    assert.ok(result.state.concessies<=3);
    for(const [index,step] of result.steps.entries()) {
      const expected=index===0?{action:'OPEN'}:scenario.steps[index-1];
      assert.equal(step.action,expected.action,`zet ${index}`);
      assert.notEqual(step.evidenceSource,'fallback',`onverwachte terugval in zet ${index}: ${step.composition.fallbackReason}`);
      if(step.text!==null) {
        assert.ok(step.text.endsWith('\n\n'+styleFixtures.settings.signoff));
        assert.equal(step.text.split('\n\n'+styleFixtures.settings.signoff).length,2,'afzender precies eenmaal');
        assert.doesNotMatch(step.text,/marktanalyse|marktwaarde|\bcash\b|\bcontant\b|\bspoed\b/i);
      }
      if(moneyActions.has(step.action)) {
        assert.deepEqual(mentionedMoney(step.text),[step.price],'precies het codebedrag, eenmaal');
        assert.ok(Number.isSafeInteger(step.price)&&step.price>0&&step.price<=step.state.ceiling);
      }else assert.deepEqual(mentionedMoney(step.text),[],'geen ongepland bedrag');
      if(['ANCHOR','HOLD','CONCESSION'].includes(step.action)) {
        assert.doesNotMatch(step.text,/onder voorbehoud|als de auto bij het bekijken/i,'geen herhaald vast voorbehoud bij elke onderhandelzet');
      }
      if(step.action==='ACCEPT') {
        assert.match(step.text,/voorbehoud/i);
        assert.match(step.text,/bezichtig|controle/i);
        assert.doesNotMatch(step.text,/\b(?:morgen|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/i);
      }
      if(expected.sameOffer)assert.equal(step.state.lastOffer,step.previousState.lastOffer);
      if(expected.agreesWith==='lastOffer')assert.equal(step.price,step.previousState.lastOffer);
      if(expected.agreedPrice)assert.equal(step.price,expected.agreedPrice);
      if(mode==='offline') {
        assert.equal(step.evidenceSource,'offline');
        for(const word of expected.offlineMentions||[])assert.ok(step.text.toLowerCase().includes(word),`relevante inhoud ontbreekt: ${word}`);
      }else {
        assert.equal(step.evidenceSource,STYLE_WRITER_ACTIONS.has(step.action)?'testwriter':'deterministic');
      }
    }
  });
}

test('schrijver krijgt recente verkoperscontext en het profiel, nooit een numerieke prijsopdracht',async()=>{
  const result=await run('history-and-correction','testwriter');
  for(const {step,payload} of result.requests) {
    const context=payload.context;
    assert.equal(context.model,styleFixtures.candidate.model);
    assert.equal(context.tone,styleFixtures.settings.tone);
    assert.equal(context.priceToken,context.action==='OPEN'?null:PRICE_TOKEN);
    for(const field of ['price','ceiling','anchor','budget','dealerMax','marginMax'])assert.equal(Object.hasOwn(context,field),false,field);
    assert.ok(context.history.length<=12);
    if(step>=0) {
      assert.equal(context.sellerText,examples.get(result.id).steps[step].seller);
      assert.equal(context.history.at(-1).role,'seller');
      assert.equal(context.history.at(-1).text,context.sellerText);
    }
  }
});

test('oude bronfeiten blijven geldig tot een latere verkoperscorrectie',async()=>{
  const scenario=examples.get('history-and-correction');
  const result=await run(scenario.id,'testwriter');
  for(const {step,payload} of result.requests.filter(r=>r.step>=0)) {
    const expected=scenario.steps[step];
    for(const fact of expected.factsInclude||[])assert.ok(payload.context.allowedFacts.includes(fact),`${fact} ontbreekt bij zet ${step}`);
    for(const fact of expected.factsExclude||[])assert.ok(!payload.context.allowedFacts.includes(fact),`${fact} is ingetrokken bij zet ${step}`);
    for(const fact of expected.latestFactsInclude||[])assert.ok(payload.context.latestFacts.includes(fact),`${fact} is nieuwe inhoud bij zet ${step}`);
  }
  assert.match(result.steps[2].text,/koppeling/i,'eerder verkopersfeit mag zonder onterechte terugval worden gebruikt');
  assert.doesNotMatch(result.steps[3].text,/koppeling (?:is|werd) vervangen|nieuwe koppeling/i,'ingetrokken bewering komt niet terug');
});

test('biedvragen en nieuwe informatie lokken geen extra peiling of eenzijdige verhoging uit',async()=>{
  for(const id of ['offer-question-and-hold','history-and-correction']) {
    const result=await run(id);
    for(const step of result.steps.filter(s=>s.action==='HOLD')) {
      assert.equal(step.state.lastOffer,step.previousState.lastOffer);
      assert.equal(step.state.peilingen,step.previousState.peilingen);
      assert.equal(step.state.concessies,step.previousState.concessies);
      assert.doesNotMatch(step.text,/(?:scherpste|laagste) prijs|welk bedrag.*(?:werken|verkopen)/i);
    }
  }
});

test('vaste prijs leidt tot maximaal twee verschillende peilingen en daarna afsluiten',async()=>{
  const result=await run('fixed-price-and-stop');
  const probes=result.steps.filter(s=>s.action==='PROBE');
  assert.equal(probes.length,2);
  assert.notEqual(probes[0].text,probes[1].text);
  assert.equal(result.state.concessies,0);
  assert.equal(result.steps.at(-1).action,'DECLINE');
});

test('krimpende concessies eindigen met akkoord op de laatste verhoging',async()=>{
  const result=await run('concessions-and-current-agreement');
  const offers=result.steps.filter(s=>['ANCHOR','CONCESSION'].includes(s.action)).map(s=>s.price);
  assert.equal(offers.length,4);
  const increases=offers.slice(1).map((price,i)=>price-offers[i]);
  assert.ok(increases.every(n=>n>0));
  assert.ok(increases[0]>increases[1]&&increases[1]>increases[2]);
  assert.equal(result.state.agreedPrice,offers.at(-1));
  assert.notEqual(result.state.agreedPrice,offers[0]);
});

test('ongewijzigde vraagprijs geeft geen concessie; lagere verkopersprijs wordt niet overboden',async()=>{
  const result=await run('asking-price-then-seller-offer');
  assert.equal(result.steps[2].action,'PROBE');
  assert.equal(result.steps[2].state.concessies,0);
  assert.equal(result.steps.at(-1).price,8000);
  assert.equal(result.state.agreedPrice,8000);
});

test('onbekend feit in een verkopersvraag vraagt menselijke beoordeling, geen generieke prijsvraag',async()=>{
  const state={...initialState(10000,25),lastOffer:7500,phase:'NEGOTIATING'};
  const sellerText='Wat is jullie adres?';
  const decision=decide(state,classifyLocal(sellerText,state));
  let calls=0;
  const result=await new MessageComposer({writer:{write:async()=>{calls++;throw new Error('should not write');}}}).compose(decision,{settings:styleFixtures.settings,sellerText});
  assert.equal(decision.action,'REVIEW');
  assert.equal(result.text,null);
  assert.equal(calls,0);
  assert.equal(decision.state.lastOffer,7500);
});

test('ongeldig hoger bedrag van een testwriter passeert de echte composer niet',async()=>{
  const state=initialState(10000,25);
  const decision=decide(state,classifyLocal('Wat bied je?',state));
  const result=await new MessageComposer({now:()=>now,writer:{write:async()=>({message:'Mijn bod is EUR 12000.'})}}).compose(decision,{settings:styleFixtures.settings,candidate:styleFixtures.candidate});
  assert.equal(result.metadata.source,'fallback');
  assert.ok(result.metadata.fallbackReason);
  assert.deepEqual(mentionedMoney(result.text),[decision.price]);
  assert.ok(decision.price<=state.ceiling);
});

test('testwriter mag een ingetrokken onderhoudsfeit niet opnieuw bevestigen',async()=>{
  const result=await runStyleScenario(examples.get('history-and-correction'),{mode:'testwriter',writerOverride:(payload,step)=>{
    if(step===2)return 'Je gaf aan dat de koppeling is vervangen. Mijn bod blijft {{BOD}}.';
    return step<0?styleFixtures.openingWriterText:examples.get('history-and-correction').steps[step].writerText;
  }});
  const corrected=result.steps[3];
  assert.equal(corrected.evidenceSource,'fallback');
  assert.equal(corrected.composition.fallbackReason,'VOICE_UNGROUNDED_DETAIL');
  assert.doesNotMatch(corrected.text,/koppeling (?:is|werd) vervangen|nieuwe koppeling/i);
  assert.equal(corrected.price,corrected.previousState.lastOffer);
});
