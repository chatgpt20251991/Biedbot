import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyLocal, decide, initialState, renderDecision} from '../src/core/negotiation.mjs';
import {DEFAULTS} from '../src/core/policy.mjs';

test('audit: vervangen koppeling en eigenaarschap is relevante informatie', () => {
  assert.equal(classifyLocal('Ik ben de tweede eigenaar en er is vorig jaar een nieuwe koppeling in gegaan.').kind, 'INFO');
});
test('audit: expliciete bodvraag krijgt het codebepaalde anker', () => {
  const d = decide(initialState(10000,25),classifyLocal('Wat zou je ervoor willen geven?'));
  assert.equal(d.action,'ANCHOR'); assert.equal(d.price,7500);
});
test('audit: natuurlijke verkopersprijs wordt niet opnieuw uitgevraagd', () => {
  const c=classifyLocal('Voor 8000 mag je hem ophalen.');
  assert.equal(c.kind,'PRICE'); assert.equal(c.price,8000);
});
test('audit: een brug sluit aan op de leaseauto in de reactie', () => {
  const d=decide(initialState(10000,25),classifyLocal('Onderhoud is bijgehouden. Ik krijg een leaseauto.'));
  assert.match(renderDecision(d,DEFAULTS,{sellerText:'Onderhoud is bijgehouden. Ik krijg een leaseauto.'}),/leaseauto/i);
});
test('audit: akkoord verzint geen collega', () => {
  const d=decide({...initialState(10000,25),lastOffer:7500}, {kind:'ACCEPT',confidence:1});
  assert.doesNotMatch(renderDecision(d,DEFAULTS),/collega/i);
});
