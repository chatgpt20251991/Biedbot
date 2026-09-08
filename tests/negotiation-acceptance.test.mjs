import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyLocal,validateClassification,decide,initialState} from '../src/core/negotiation.mjs';

const offered={...initialState(10000,25),phase:'NEGOTIATING',lastOffer:8170};
const negative=[
  'Akkoord?', 'Akkoord?!', 'Akkoord ?', 'AKKOORD？', 'Is goed?', 'Prima?', 'Deal?',
  'Oké dat is goed?', 'Akkoord? Wanneer kom je?', 'Akkoord, toch?',
  'Akkoord, of begrijp ik dat verkeerd?', 'Akkoord met mijn vraagprijs?',
  'Akkoord, is dat wat je bedoelt?', 'Akkoord, denk ik.', 'Akkoord, eventueel.',
  'Akkoord met extra kosten.', 'Akkoord op voorwaarde dat je vandaag komt.',
  'Akkoord, dan moet de prijs hoger.', 'Akkoord. Ik twijfel nog.',
  'Akkoord. Ik ga toch niet akkoord.', 'Akkoord als je eerst komt kijken.',
  'Is goed, tenzij ik een hoger bod krijg.', 'Prima, maar alleen met inruil.',
  'Akkoord. Wanneer ga je akkoord met mijn vraagprijs?',
  'Akkoord, wanneer bied je meer?', 'Akkoord, je bent zeker gek.',
  'Prima. Dat was een grapje.', 'Akkoord, op papier misschien.',
  'Niet akkoord', 'Geen akkoord', 'Nee, dat is niet goed.',
  'Ik ben nog niet akkoord.', 'Is het akkoord?', 'Ben je akkoord',
  'De auto is prima onderhouden.', 'Je zei "akkoord", ik nog niet.',
  'Voor EUR 8170?', 'Akkoord voor EUR 8170?',
  'Akkoord voor EUR 8170 als je vandaag komt.',
  'Akkoord voor EUR 8170. Wanneer betaal je EUR 9000?',
  'Akkoord met EUR 8170, denk ik.', 'Akkoord met EUR 8170 aan reparaties.',
  'Akkoord, je mag voor EUR 8170 alleen de motor hebben.',
  'Akkoord. Voor EUR 8170 moet ik er nog over nadenken.',
];
for(const text of negative)test(`geen koopbevestiging bij: ${text}`,()=>{
  const local=classifyLocal(text,offered);
  assert.notEqual(decide(offered,local).action,'ACCEPT',text);
  assert.notEqual(decide(offered,local).state.phase,'HOT_LEAD',text);
  const model=validateClassification({kind:'ACCEPT',confidence:1},text);
  assert.notEqual(decide(offered,model).action,'ACCEPT','model mag lokale onzekerheid niet overrulen');
});

const positive=[
  'Akkoord', 'Akkoord.', 'Is goed, akkoord.', 'Oké dat is goed, wanneer kunt u langskomen?',
  'Prima.', 'Deal!', 'Afgesproken.', 'Ja, akkoord.',
  'Akkoord, wanneer kun je komen?', 'Akkoord. Wanneer schikt het jou?',
  'Is goed. Kan je morgen langskomen?', 'Prima, kun je zaterdag komen kijken?',
  'Akkoord! Hoe laat kun je komen?', 'Akkoord met je bod.',
  'Ik ga akkoord met uw laatste bod.', 'Akkoord, je kunt morgen langskomen.',
];
for(const text of positive)test(`laatste bod geldig aanvaard: ${text}`,()=>{
  const local=classifyLocal(text,offered),d=decide(offered,local);
  assert.equal(local.kind,'ACCEPT');assert.equal(d.action,'ACCEPT');
  assert.equal(d.price,8170);assert.equal(d.state.agreedPrice,8170);
  assert.equal(validateClassification({kind:'ACCEPT',confidence:1},text).kind,'ACCEPT');
});

for(const text of ['Akkoord met EUR 8170, wanneer kun je komen?','Akkoord voor EUR 8170. Kan je morgen langskomen?'])test(`expliciet bedrag met planningsvraag: ${text}`,()=>{
  const local=classifyLocal(text,offered),d=decide(offered,local);
  assert.equal(local.kind,'PRICE');assert.equal(d.action,'ACCEPT');assert.equal(d.price,8170);
  assert.equal(validateClassification({kind:'PRICE',price:8170,evidence:'EUR 8170',confidence:1},text).kind,'PRICE');
});
