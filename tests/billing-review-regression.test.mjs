import test from 'node:test';
import assert from 'node:assert/strict';
import {BillingBackend} from '../src/billing/backend.mjs';
import {MollieGateway} from '../src/billing/mollie.mjs';

const now=Date.parse('2026-09-08T12:00:00Z');
const config={providerTest:true,termsVersion:'fixture-terms',privacyVersion:'fixture-privacy',cancellationPolicyVersion:'fixture-cancel',taxReviewId:'fixture-tax',invoiceReviewId:'fixture-invoice',setupTotalCents:30129,monthlyTotalCents:18029,redirectUrl:'https://example.com/return',webhookUrl:'https://example.com/webhook',emailMode:'disabled-fixture',subscriptionStartDate:'2026-10-06'};
function fixture(t){
  let order;
  const payment={id:'tr_first001',customerId:'cst_test001',mode:'test',sequenceType:'first',status:'paid',amount:{currency:'EUR',value:'301.29'},mandateId:'mdt_test001'};
  const gateway=new MollieGateway({apiKey:'test_syntheticReview',fetchFn:async url=>{
    if(url.endsWith('/payments/tr_first001'))return Response.json({...payment,metadata:{dealerId:'dealer-review',orderId:order.id}});
    if(url.endsWith('/mandates/mdt_test001'))return Response.json({id:'mdt_test001',status:'valid'});
    if(url.endsWith('/subscriptions/sub_test001'))return Response.json({id:'sub_test001',customerId:'cst_test001',mode:'test',status:'active',amount:{currency:'EUR',value:'180.29'},interval:'1 month',mandateId:'mdt_test001',startDate:config.subscriptionStartDate});
    throw new Error('Unexpected synthetic provider request');
  }});
  const backend=new BillingBackend({gateway,issuer:()=> 'fixture.signature',config,now:()=>now});t.after(()=>backend.close());
  backend.createDealer({dealerId:'dealer-review',email:'review@example.test',company:'Review fixture',password:'Synthetic-review-password!'});
  order=backend.createOrder('dealer-review',{requestKey:'review-order-001',termsVersion:config.termsVersion,acceptTerms:true,recurringConsent:true,acceptPrivacy:true,acceptCancellation:true});
  backend.db.prepare("UPDATE orders SET payment_id='tr_first001',customer_id='cst_test001',subscription_id='sub_test001' WHERE id=?").run(order.id);
  return {backend,payment,order};
}
test('eerder bewezen refund op eerste betaling blijft blokkeren bij oude paid-inhoud',async t=>{
  const f=fixture(t);await f.backend.reconcilePayment(f.payment.id);
  f.payment.amountRefunded={currency:'EUR',value:'301.29'};await f.backend.reconcilePayment(f.payment.id);
  assert.equal(f.backend.order('dealer-review',f.order.id).status,'suspended');
  delete f.payment.amountRefunded;await f.backend.reconcilePayment(f.payment.id);
  assert.throws(()=>f.backend.issueLease('dealer-review',f.order.id,'review-install'),/ENTITLEMENT/);
});
test('leeg reversalbedrag is geen bewijs dat eerste betaling niet teruggeboekt is',async t=>{
  const f=fixture(t);f.payment.amountRefunded={currency:'EUR',value:''};
  await assert.rejects(()=>f.backend.reconcilePayment(f.payment.id));
  assert.throws(()=>f.backend.issueLease('dealer-review',f.order.id,'review-install'),/ENTITLEMENT/);
});
