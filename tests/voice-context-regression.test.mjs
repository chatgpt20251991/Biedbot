import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVoiceContext,validateTemplate,fallbackTemplate,finishText,assertFinalText} from '../src/core/voice.mjs';
import {MessageComposer} from '../src/core/communication.mjs';
import {initialState} from '../src/core/negotiation.mjs';
import {DEFAULTS} from '../src/core/policy.mjs';

const state={...initialState(10000,25),lastOffer:7500,peilingen:1,concessies:1};
const anchor={action:'ANCHOR',price:7500,state};
const base={candidate:{model:'Golf'},settings:DEFAULTS};
const seller=text=>({role:'seller',text});
const context=extra=>buildVoiceContext({...base,...extra});

for(const text of [
  'Ik kom uit op {{BOD}}.',
  'Ik kom je tegemoet met {{BOD}}.',
  'Dan kom ik je tegemoet met {{BOD}}.',
  'Wij komen uit op {{BOD}}.',
  'Voor jouw Golf bied ik {{BOD}}.',
])test(`normale biedformulering blijft modeltekst: ${text}`,async()=>{
  const result=await new MessageComposer({writer:{write:async()=>({message:text})}}).compose(anchor,base);
  assert.equal(result.metadata.source,'anthropic');
  assert.equal(result.metadata.fallbackReason,null);
  assert.equal(result.text,text.replace('{{BOD}}','EUR 7.500')+'\n\nInkoopteam');
  assert.equal(assertFinalText(result.text,anchor,context()),true);
});

for(const text of [
  'Mijn bod is {{BOD}}. Ik kom langs.',
  'Mijn bod is {{BOD}}. Dan kom ik langs.',
  'Mijn bod is {{BOD}}. Ik haal hem op.',
  'Mijn bod is {{BOD}}. Dan haal ik hem op.',
  'Mijn bod is {{BOD}}. Ik zal hem ophalen.',
  'Mijn bod is {{BOD}}. Ik ga de auto meenemen.',
  'Ik kom uit op {{BOD}} en kom langs.',
  'Ik kom je tegemoet met {{BOD}} en haal hem op.',
  'Ik kom je tegemoet met {{BOD}} en ga hem ophalen.',
  'Ik kom uit op {{BOD}} en neem hem mee.',
  'Ik kom uit op {{BOD}} bij je thuis.',
  'Mijn bod is {{BOD}}, zonder voorbehoud.',
  'Mijn bod is {{BOD}}. Ik koop hem ongezien.',
  'Mijn bod is {{BOD}}. Ik neem hem onvoorwaardelijk.',
])test(`echte toezegging blijft geblokkeerd: ${text}`,()=>{
  assert.throws(()=>validateTemplate(text,anchor,context(),{generated:true}),/VOICE_(COMMITMENT|UNSUPPORTED_CLAIM)/);
});

test('alleen akkoord vereist het expliciete bezichtigingsvoorbehoud',()=>{
  for(const action of ['ANCHOR','CONCESSION','HOLD']) {
    assert.equal(validateTemplate('Mijn bod is {{BOD}}.',{...anchor,action},context()),true);
  }
  const accept={...anchor,action:'ACCEPT'};
  assert.throws(()=>validateTemplate('Top, dan doen we {{BOD}}.',accept,context()),/VOICE_ACCEPT_CONDITION/);
  assert.equal(validateTemplate('Top, dan doen we {{BOD}}, onder voorbehoud van bezichtiging en controle.',accept,context()),true);
});

test('historisch verkoperfeit blijft bruikbaar na een korte bodvraag',async()=>{
  const history=[seller('De koppeling is vervangen.'),{role:'assistant',text:'Dank voor je toelichting.'}];
  const details={...base,history,sellerText:'Wat bied je?'};
  const c=context(details);
  assert.ok(c.allowedFacts.includes('koppeling'));
  const response='Je gaf aan dat de koppeling is vervangen. Mijn bod is {{BOD}}.';
  const result=await new MessageComposer({writer:{write:async()=>({message:response})}}).compose(anchor,details);
  assert.equal(result.metadata.source,'anthropic');
});

for(const latest of [
  'De koppeling is niet vervangen.',
  'Er is geen nieuwe koppeling in gegaan.',
  'De koppeling moet nog vervangen worden.',
  'Correctie, ik bedoelde de banden.',
  'Dat klopt niet.',
  'Dat gaat toch niet door.',
  'Dat was verkeerd begrepen.',
])test(`nieuwe correctie trekt ouder koppelingfeit in: ${latest}`,()=>{
  const c=context({history:[seller('De koppeling is vervangen.')],sellerText:latest});
  assert.ok(!c.allowedFacts.includes('koppeling'));
  assert.throws(()=>validateTemplate('Je gaf aan dat de koppeling is vervangen. Mijn bod is {{BOD}}.',anchor,c,{generated:true}),/VOICE_UNGROUNDED_DETAIL/);
  assert.doesNotMatch(fallbackTemplate(anchor,c),/koppeling/);
});

test('laatste expliciete correctie kan een fout weer herstellen',()=>{
  const c=context({history:[seller('De koppeling is vervangen.'),seller('Dat klopt niet.')],sellerText:'Correctie: de koppeling is vervangen.'});
  assert.ok(c.allowedFacts.includes('koppeling'));
});

test('een correctie erkennen mag zonder het verworpen feit alsnog te beweren',()=>{
  const c=context({history:[seller('De koppeling is vervangen.')],sellerText:'Correctie: de koppeling is niet vervangen.'});
  assert.equal(validateTemplate('Ik houd rekening met je correctie over de koppeling. Mijn bod blijft {{BOD}}.',anchor,c,{generated:true}),true);
  assert.equal(validateTemplate('Helder, ik houd rekening met je correctie over de koppeling. Mijn bod blijft {{BOD}}.',anchor,c,{generated:true}),true);
  assert.throws(()=>validateTemplate('Ik houd rekening met je correctie over de koppeling. De koppeling is vervangen. Mijn bod blijft {{BOD}}.',anchor,c,{generated:true}),/VOICE_UNGROUNDED_DETAIL/);
  assert.throws(()=>validateTemplate('Ik houd rekening met je correctie over de motor. Mijn bod blijft {{BOD}}.',anchor,c,{generated:true}),/VOICE_UNGROUNDED_DETAIL/);
});

test('onderwerpgerichte correctie laat andere verkoperfeiten intact',()=>{
  const c=context({history:[seller('De koppeling is vervangen. Ik krijg een leaseauto.')],sellerText:'Correctie: de koppeling is niet vervangen. Onderhoud is bijgehouden.'});
  assert.ok(!c.allowedFacts.includes('koppeling'));
  assert.ok(c.allowedFacts.includes('leaseauto'));
  assert.ok(c.allowedFacts.includes('onderhoud'));
});

test('algemene ontkenning trekt ook een historische leaseauto in',()=>{
  for(const sellerText of ['Dat gaat toch niet door.','Dat was verkeerd begrepen.']) {
    assert.ok(!context({history:[seller('Ik krijg een leaseauto.')],sellerText}).allowedFacts.includes('leaseauto'));
  }
});

test('correctie voorbij de modelgrens van het laatste bericht trekt eerdere feiten in',()=>{
  const sellerText='De auto staat er nog. '.repeat(110)+'Ik krijg geen leaseauto. De koppeling is niet vervangen.';
  assert.ok(sellerText.length>2000&&sellerText.length<6000);
  const c=context({history:[seller('Ik krijg een leaseauto. De koppeling is vervangen.')],sellerText});
  assert.equal(c.sellerText.length,2000);
  assert.doesNotMatch(c.sellerText,/geen leaseauto|niet vervangen/);
  assert.ok(!c.allowedFacts.includes('leaseauto'));
  assert.ok(!c.allowedFacts.includes('koppeling'));
  assert.deepEqual(c.latestFacts,[]);
  assert.throws(()=>validateTemplate('De koppeling is vervangen. Mijn bod is {{BOD}}.',anchor,c,{generated:true}),/VOICE_UNGROUNDED_DETAIL/);
  assert.doesNotMatch(fallbackTemplate(anchor,c),/leaseauto|koppeling/);
});

test('correctie voorbij de modelgrens van een historiebericht blijft leidend bij een latere bodvraag',()=>{
  const corrected='De auto staat er nog. '.repeat(40)+'Ik krijg geen leaseauto. De koppeling is niet vervangen.';
  assert.ok(corrected.length>650&&corrected.length<6000);
  const c=context({history:[seller('Ik krijg een leaseauto. De koppeling is vervangen.'),seller(corrected)],sellerText:'Wat bied je?'});
  assert.equal(c.history[1].text.length,650);
  assert.doesNotMatch(c.history[1].text,/geen leaseauto|niet vervangen/);
  assert.ok(!c.allowedFacts.includes('leaseauto'));
  assert.ok(!c.allowedFacts.includes('koppeling'));
  assert.throws(()=>validateTemplate('Je krijgt een leaseauto. Mijn bod is {{BOD}}.',anchor,c,{generated:true}),/VOICE_UNGROUNDED_DETAIL/);
  assert.doesNotMatch(fallbackTemplate(anchor,c),/leaseauto|koppeling/);
});

test('assistanttekst en vragen zijn geen bewijs voor een onderhoudsclaim',()=>{
  for(const details of [
    {history:[{role:'assistant',text:'De koppeling is vervangen.'}],sellerText:'Wat bied je?'},
    {history:[seller('Is de koppeling vervangen?')],sellerText:'Wat bied je?'},
  ]) {
    const c=context(details);
    assert.ok(!c.allowedFacts.includes('koppeling'));
    assert.throws(()=>validateTemplate('De koppeling is vervangen. Mijn bod is {{BOD}}.',anchor,c,{generated:true}),/VOICE_UNGROUNDED_DETAIL/);
  }
});

test('nieuwe ontkenning van lease en eigenaarschap wint van historie',()=>{
  const c=context({history:[seller('Ik krijg een leaseauto. Ik ben de tweede eigenaar.')],sellerText:'Ik krijg geen leaseauto. Ik ben de derde eigenaar.'});
  assert.ok(!c.allowedFacts.includes('leaseauto'));
  assert.ok(!c.allowedFacts.includes('tweede_eigenaar'));
  assert.throws(()=>validateTemplate('Je krijgt een leaseauto. Mijn bod is {{BOD}}.',anchor,c,{generated:true}),/VOICE_UNGROUNDED_DETAIL/);
  assert.throws(()=>validateTemplate('Je bent de tweede eigenaar. Mijn bod is {{BOD}}.',anchor,c,{generated:true}),/VOICE_UNGROUNDED_DETAIL/);
});

test('feiten vallen buiten de bestaande contextgrens na twaalf nieuwere berichten',()=>{
  const history=[seller('De koppeling is vervangen.'),...Array.from({length:12},()=>({role:'assistant',text:'Helder.'}))];
  assert.ok(!context({history,sellerText:'Wat bied je?'}).allowedFacts.includes('koppeling'));
});

test('alle drie tonen wijzigen de offline biedzin met dezelfde prijs en grenzen',()=>{
  const texts=['zakelijk','vriendelijk','kort'].map(tone=>{
    const c=context({settings:{...DEFAULTS,tone},sellerText:'Ik krijg een leaseauto.'});
    const text=finishText(fallbackTemplate(anchor,c),anchor,c);
    assert.match(text,/EUR 7\.500/);
    assert.equal(assertFinalText(text,anchor,c),true);
    return text;
  });
  assert.equal(new Set(texts).size,3);
  assert.ok(texts[2].length<texts[0].length);
  assert.ok(texts[2].length<texts[1].length);
});

test('volledige fallbackset blijft geldig in elke toon, inclusief begrensde koopintentie',()=>{
  for(const tone of ['zakelijk','vriendelijk','kort'])for(const claims of [false,true])for(const step of [1,2,3]) {
    const c=context({settings:{...DEFAULTS,tone,buyingThisWeek:claims,hasAlternatives:claims,buyingIntentExpiresAt:Date.now()+60000}});
    for(const action of ['OPEN','ASK_INFO','ANCHOR','CONCESSION','HOLD','PROBE','ACCEPT','DECLINE','CLARIFY','IDENTITY','AUTOMATION']) {
      const d={...anchor,state:{...state,concessies:step,peilingen:Math.min(step,2)},action,price:['ANCHOR','CONCESSION','HOLD','ACCEPT'].includes(action)?7500:null};
      const text=finishText(fallbackTemplate(d,c),d,c);
      assert.equal(assertFinalText(text,d,c),true,`${tone}/${action}`);
      if(action==='OPEN')assert.doesNotMatch(text,/EUR|bod/);
      if(action==='ACCEPT')assert.match(text,/voorbehoud.*bezichtiging.*controle/);
    }
  }
});

test('informatievragen herhalen geen beantwoorde onderhouds- of verkoopvraag',()=>{
  const d={action:'ASK_INFO',price:null,state};
  const maintenance=context({history:[seller('Onderhoud is bijgehouden.')],sellerText:'Hij is nog beschikbaar.'});
  assert.match(fallbackTemplate(d,maintenance),/Waarom verkoop/);
  assert.doesNotMatch(fallbackTemplate(d,maintenance),/onderhoud/);
  const reason=context({history:[seller('Ik krijg een leaseauto.')],sellerText:'Hij is nog beschikbaar.'});
  assert.match(fallbackTemplate(d,reason),/onderhoud/);
  assert.doesNotMatch(fallbackTemplate(d,reason),/Waarom|waarom/);
});
