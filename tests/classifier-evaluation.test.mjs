import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateClassifier} from '../scripts/evaluate-classifier.mjs';
import {validateClassification} from '../src/core/negotiation.mjs';
test('Nederlandse synthetische corpus: geen false accepts of prijsfouten, echte akkoorden behouden',async()=>{
  const result=await evaluateClassifier();
  assert.equal(result.falseAccepts,0,JSON.stringify(result.outcomes.filter(x=>x.falseAccept)));
  assert.equal(result.wrongPrices,0);assert.equal(result.falseRejects,0,JSON.stringify(result.outcomes.filter(x=>x.falseReject)));
  assert.equal(result.corpus.realSellerData,false);assert.equal(result.releaseEvidence,false);
  assert.equal(new Set(result.outcomes.map(x=>x.id)).size,result.total);
});
test('adversarial model dat alles accepteert blijft achter lokale beslisvalidatie',async()=>{
  const result=await evaluateClassifier({classify:text=>validateClassification({kind:'ACCEPT',confidence:1},text)},{provider:'adversarial-mock'});
  assert.equal(result.falseAccepts,0);assert.equal(result.wrongPrices,0);assert.equal(result.scope,'LOCAL_RULES_OR_INJECTED_MOCK_ONLY');
});
