import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BillingBackend,startBillingServer,billingPeriod} from '../src/billing/backend.mjs';
import {MollieGateway} from '../src/billing/mollie.mjs';
import {issueLicense,verifyLicense} from '../src/core/license.mjs';

const NOW=Date.parse('2026-09-08T12:00:00Z'),keys=generateKeyPairSync('ed25519');
const config={providerTest:true,termsVersion:'terms-fixture-1',privacyVersion:'privacy-fixture-1',cancellationPolicyVersion:'cancel-fixture-1',taxReviewId:'tax-fixture-1',invoiceReviewId:'invoice-fixture-1',setupTotalCents:30129,monthlyTotalCents:18029,redirectUrl:'https://example.com/test-ready',webhookUrl:'https://example.com/test-webhook',emailMode:'disabled-fixture',subscriptionStartDate:'2026-10-06'};
const consent={requestKey:'order-request-001',termsVersion:config.termsVersion,acceptTerms:true,recurringConsent:true,acceptPrivacy:true,acceptCancellation:true};
const dealer={dealerId:'dealer-one',email:'one@example.test',company:'Fictieve Dealer Een',password:'synthetic-password-one'};
function fixture(t,{persistent=false,now=NOW,configOverrides={}}={}){
  const state={now,payments:new Map(),subscriptions:new Map(),calls:[],mandateStatus:'valid',before:null};
  const directory=persistent?mkdtempSync(join(tmpdir(),'biedbot-billing-test-')):null,dbPath=directory?join(directory,'ledger.sqlite'):':memory:';
  const fetchFn=async(url,options)=>{
    const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;
    state.calls.push({path,method:options.method,body,idempotency:options.headers['Idempotency-Key']});
    assert.equal(new URL(url).host,'api.mollie.com');assert.equal(options.redirect,'error');
    const intercepted=await state.before?.({path,options,body});if(intercepted)return intercepted;
    if(path==='/v2/customers'&&options.method==='POST')return Response.json({id:'cst_customer001'});
    if(path==='/v2/payments'&&options.method==='POST'){
      const payment={...body,id:`tr_payment${String(state.payments.size+1).padStart(3,'0')}`,mode:'test',status:'open',isCancelable:true,mandateId:'mdt_mandate001',_links:{checkout:{href:'https://www.mollie.com/checkout/test001'}}};state.payments.set(payment.id,payment);return Response.json(payment);
    }
    const paymentId=path.match(/^\/v2\/payments\/(tr_[A-Za-z0-9]+)$/)?.[1];if(paymentId){const payment=state.payments.get(paymentId);if(options.method==='DELETE')payment.status='canceled';return Response.json(payment);}
    if(path.includes('/mandates/'))return Response.json({id:'mdt_mandate001',status:state.mandateStatus});
    if(path.endsWith('/subscriptions')&&options.method==='POST'){
      const subscription={...body,id:`sub_subscription${String(state.subscriptions.size+1).padStart(3,'0')}`,customerId:'cst_customer001',status:'active',mode:'test'};state.subscriptions.set(subscription.id,subscription);return Response.json(subscription);
    }
    const subscriptionId=path.match(/\/subscriptions\/(sub_[A-Za-z0-9]+)$/)?.[1];
    if(subscriptionId){const subscription=state.subscriptions.get(subscriptionId);if(options.method==='DELETE')subscription.status='canceled';return Response.json(subscription);}
    throw new Error('Unhandled mock provider request');
  };
  const gateway=new MollieGateway({apiKey:'test_canaryPublisherKey',fetchFn});
  const options={dbPath,gateway,issuer:payload=>issueLicense(payload,keys.privateKey),config:{...config,...configOverrides},now:()=>state.now};
  const backend=new BillingBackend(options);backend.createDealer(dealer);state.backend=backend;
  t.after(()=>{state.backend.close();if(directory)rmSync(directory,{recursive:true,force:true});});
  return {...state,state,gateway,backend,options,async open(){const order=backend.createOrder(dealer.dealerId,consent);await backend.checkout(dealer.dealerId,order.id);return order;},async paid(){const order=await this.open();state.payments.get('tr_payment001').status='paid';await backend.reconcilePayment('tr_payment001');return order;},
    recurring(overrides={}){const id=overrides.id||`tr_recurring${String(state.payments.size).padStart(3,'0')}`;const payment={id,customerId:'cst_customer001',subscriptionId:'sub_subscription001',mandateId:'mdt_mandate001',mode:'test',sequenceType:'recurring',amount:{currency:'EUR',value:'180.29'},status:'paid',createdAt:'2026-10-06T12:00:00Z',...overrides};state.payments.set(id,payment);state.now=Math.max(state.now,Date.parse(payment.createdAt)||0);return payment;},
    async bind(payment,index=0){const order=backend.db.prepare('SELECT * FROM orders WHERE subscription_id=?').get(payment.subscriptionId);backend.planInvoices(order.dealer_id,order.id,index);return backend.bindRecurringPayment({dealerId:order.dealer_id,orderId:order.id,paymentId:payment.id,invoiceId:`${order.id}:month:${index}`,evidenceRef:'synthetic-reviewed-invoice'});}};
}
test('publisher backend weigert live gateway en ontbrekende reviewconfiguratie',()=>{
  const issuer=()=>'';
  assert.throws(()=>new BillingBackend({gateway:new MollieGateway({apiKey:'live_fake',enableLive:true}),issuer,config}),/TEST_MODE/);
  assert.throws(()=>new BillingBackend({gateway:new MollieGateway({apiKey:'test_fake'}),issuer,config:{...config,taxReviewId:''}}),/CONFIGURATION/);
  assert.throws(()=>new BillingBackend({gateway:new MollieGateway({apiKey:'test_fake'}),issuer,config:{...config,emailMode:'send'}}),/CONFIGURATION/);
});
test('wachtwoorden en sessietokens worden alleen als hashes opgeslagen',t=>{
  const f=fixture(t),session=f.backend.login(dealer);
  assert.equal(f.backend.authenticate(session.token),dealer.dealerId);
  const data=JSON.stringify({dealers:f.backend.db.prepare('SELECT * FROM dealers').all(),sessions:f.backend.db.prepare('SELECT * FROM sessions').all()});
  assert.ok(!data.includes(dealer.password));assert.ok(!data.includes(session.token));assert.ok(!JSON.stringify(f.gateway).includes('test_canaryPublisherKey'));
  f.backend.logout(session.token);assert.throws(()=>f.backend.authenticate(session.token),/AUTH/);
});
test('loginrate limiet en sessieverval worden afgedwongen',t=>{
  const f=fixture(t);for(let i=0;i<5;i++)assert.throws(()=>f.backend.login({...dealer,password:'wrong'}),/CREDENTIALS/);
  assert.throws(()=>f.backend.login(dealer),/RATE_LIMIT/);f.state.now+=900001;
  const session=f.backend.login(dealer);f.state.now+=8*3600000;assert.throws(()=>f.backend.authenticate(session.token),/AUTH/);
});
test('geen checkout zonder huidige voorwaarden, privacy, opzegging en recurring toestemming',t=>{
  const f=fixture(t);
  for(const input of [{...consent,acceptTerms:false},{...consent,recurringConsent:false},{...consent,termsVersion:'old'},{...consent,acceptPrivacy:false},{...consent,acceptCancellation:false},{...consent,setupTotalCents:1}])assert.throws(()=>f.backend.createOrder(dealer.dealerId,input),/CONSENT/);
  assert.equal(f.state.calls.length,0);assert.equal(f.backend.db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
});
test('idempotente order bevriest serverprijzen en voorwaarden',t=>{
  const f=fixture(t),one=f.backend.createOrder(dealer.dealerId,consent),two=f.backend.createOrder(dealer.dealerId,consent);
  assert.equal(one.id,two.id);assert.equal(one.setupTotalCents,30129);assert.equal(one.monthlyTotalCents,18029);
  const saved=JSON.parse(f.backend.db.prepare('SELECT config_json FROM orders').get().config_json);assert.equal(saved.taxReviewId,config.taxReviewId);
  assert.equal(f.backend.db.prepare('SELECT COUNT(*) n FROM events').get().n,1);
});
test('dubbele checkout heeft één customer en één providerbetaling',async t=>{
  const f=fixture(t),order=await f.open();await f.backend.checkout(dealer.dealerId,order.id);
  assert.equal(f.state.calls.filter(x=>x.path==='/v2/customers').length,1);assert.equal(f.state.calls.filter(x=>x.path==='/v2/payments').length,1);
  const payment=f.state.calls.find(x=>x.path==='/v2/payments');assert.equal(payment.body.amount.value,'301.29');assert.equal(payment.body.sequenceType,'first');assert.ok(payment.idempotency);
});
test('parallelle checkout-claims doen geen dubbele providerwrite',async t=>{
  const f=fixture(t),order=f.backend.createOrder(dealer.dealerId,consent);let release,entered;
  const reached=new Promise(resolve=>entered=resolve),wait=new Promise(resolve=>release=resolve);
  f.state.before=async({path,options})=>{if(path==='/v2/payments'&&options.method==='POST'){entered();await wait;}};
  const first=f.backend.checkout(dealer.dealerId,order.id);await reached;
  await assert.rejects(()=>f.backend.checkout(dealer.dealerId,order.id),/IN_PROGRESS/);release();await first;
  assert.equal(f.state.calls.filter(x=>x.path==='/v2/payments').length,1);
});
test('onzekere providerwrite blijft na herstart geblokkeerd zonder retry',async t=>{
  const f=fixture(t,{persistent:true}),order=f.backend.createOrder(dealer.dealerId,consent);
  f.state.before=async({path})=>{if(path==='/v2/payments')throw new Error('synthetic dropped connection');};
  await assert.rejects(()=>f.backend.checkout(dealer.dealerId,order.id));f.backend.close();f.state.backend=new BillingBackend(f.options);
  await assert.rejects(()=>f.state.backend.checkout(dealer.dealerId,order.id),/UNCERTAIN/);
  assert.equal(f.state.calls.filter(x=>x.path==='/v2/payments').length,1);
});
test('actuele betaalstatus bepaalt recht; open betaling geeft geen lease',async t=>{
  const f=fixture(t),order=await f.open();await f.backend.reconcilePayment('tr_payment001');
  assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
  assert.equal(f.state.calls.filter(x=>x.path.endsWith('/subscriptions')).length,0);
});
test('geverifieerde testbetaling en machtiging geeft kort ondertekend installatiegebonden recht',async t=>{
  const f=fixture(t),order=await f.paid(),lease=f.backend.issueLease(dealer.dealerId,order.id,'install-one');
  const payload=verifyLicense(lease.token,keys.publicKey,{dealerId:dealer.dealerId,installId:'install-one',now:NOW});
  assert.equal(payload.newContactCap,20);assert.equal(lease.expiresAt,NOW+300000);assert.equal(lease.platformAuthorized,false);
  assert.throws(()=>verifyLicense(lease.token,keys.publicKey,{dealerId:dealer.dealerId,installId:'install-other',now:NOW}));
});
test('devicelease is exclusief en nieuwe uitgifte vereist recente providercontrole',async t=>{
  const f=fixture(t),order=await f.paid();f.backend.issueLease(dealer.dealerId,order.id,'install-one');
  assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-two'),/ANOTHER_DEVICE/);
  f.state.now+=300001;assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
  await f.backend.reconcilePayment('tr_payment001');assert.ok(f.backend.issueLease(dealer.dealerId,order.id,'install-two').token);
});
test('herhaalde webhook maakt één abonnement en verlengt betaalde periode niet',async t=>{
  const f=fixture(t),order=await f.paid(),until=f.backend.order(dealer.dealerId,order.id).paidThrough;
  f.state.now+=60000;await f.backend.reconcilePayment('tr_payment001');await f.backend.reconcilePayment('tr_payment001');
  assert.equal(f.state.calls.filter(x=>x.path.endsWith('/subscriptions')&&x.method==='POST').length,1);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,until);
  assert.equal(f.backend.db.prepare("SELECT COUNT(*) n FROM events WHERE kind='PAYMENT_VERIFIED'").get().n,1);
});
for(const reversal of ['amountRefunded','amountChargedBack'])test(`${reversal} stopt verlenging en bewaart bestaande devicehouder tot tokenverval`,async t=>{
  const f=fixture(t),order=await f.paid();f.backend.issueLease(dealer.dealerId,order.id,'install-one');
  f.state.payments.get('tr_payment001')[reversal]={currency:'EUR',value:'1.00'};
  await f.backend.reconcilePayment('tr_payment001');assert.equal(f.backend.order(dealer.dealerId,order.id).status,'suspended');
  assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);assert.equal(f.backend.db.prepare('SELECT * FROM device_leases').get().expires,NOW+300000);
});
test('ingetrokken machtiging schort bestaand abonnementrecht op',async t=>{
  const f=fixture(t),order=await f.paid();f.state.mandateStatus='invalid';await f.backend.reconcilePayment('tr_payment001');
  assert.equal(f.backend.order(dealer.dealerId,order.id).status,'suspended');assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
});
test('verkeerd providerbedrag, identiteit en live entity geven geen recht',async t=>{
  const f=fixture(t),order=await f.open(),payment=f.state.payments.get('tr_payment001');payment.status='paid';
  for(const override of [{amount:{currency:'EUR',value:'0.01'}},{customerId:'cst_other001'},{mode:'live'},{sequenceType:'recurring'}]){
    const saved=structuredClone(payment);Object.assign(payment,override);await assert.rejects(()=>f.backend.reconcilePayment('tr_payment001'));Object.assign(payment,saved);
    assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
  }
});
test('providerfout na eerdere activatie dwingt nieuwe verificatie af',async t=>{
  const f=fixture(t),order=await f.paid();f.state.before=async()=>{throw new Error('provider unavailable');};
  await assert.rejects(()=>f.backend.reconcilePayment('tr_payment001'));assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
});
test('oud vertraagd paid antwoord heractiveert refund niet',async t=>{
  const f=fixture(t),order=await f.paid();let release,entered,first=true;
  const reached=new Promise(resolve=>entered=resolve),wait=new Promise(resolve=>release=resolve);
  f.state.before=async({path})=>{if(path==='/v2/payments/tr_payment001'&&first){first=false;const captured=structuredClone(f.state.payments.get('tr_payment001'));entered();await wait;return Response.json(captured);}};
  const stale=f.backend.reconcilePayment('tr_payment001');await reached;
  f.state.payments.get('tr_payment001').amountRefunded={currency:'EUR',value:'301.29'};await f.backend.reconcilePayment('tr_payment001');release();await stale;
  assert.equal(f.backend.order(dealer.dealerId,order.id).status,'suspended');
});
test('opzegging is persistent idempotent en paid-webhook kan niet heractiveren',async t=>{
  const f=fixture(t),order=await f.paid();f.backend.issueLease(dealer.dealerId,order.id,'install-one');
  await f.backend.cancel(dealer.dealerId,order.id);await f.backend.cancel(dealer.dealerId,order.id);await f.backend.reconcilePayment('tr_payment001');
  assert.equal(f.backend.order(dealer.dealerId,order.id).status,'canceled');assert.equal(f.state.calls.filter(x=>x.method==='DELETE').length,1);
  assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
});
test('onzekere opzegging stopt rechten meteen en herhaalt DELETE niet',async t=>{
  const f=fixture(t),order=await f.paid();f.state.before=async({options})=>{if(options.method==='DELETE')throw new Error('lost delete response');};
  await assert.rejects(()=>f.backend.cancel(dealer.dealerId,order.id));await assert.rejects(()=>f.backend.cancel(dealer.dealerId,order.id),/UNCERTAIN/);
  assert.equal(f.backend.order(dealer.dealerId,order.id).status,'cancel_pending');assert.equal(f.state.calls.filter(x=>x.method==='DELETE').length,1);
});
test('open checkout wordt bij opzegging aantoonbaar bij provider geannuleerd',async t=>{
  const f=fixture(t),order=await f.open();await f.backend.cancel(dealer.dealerId,order.id);
  assert.equal(f.state.payments.get('tr_payment001').status,'canceled');assert.equal(f.backend.order(dealer.dealerId,order.id).status,'canceled');
  assert.equal(f.state.calls.filter(x=>x.method==='DELETE'&&x.path==='/v2/payments/tr_payment001').length,1);
});
test('opzegging tijdens customerwachten voorkomt betaalcreatie',async t=>{
  const f=fixture(t),order=f.backend.createOrder(dealer.dealerId,consent);let release,entered;
  const reached=new Promise(resolve=>entered=resolve),wait=new Promise(resolve=>release=resolve);
  f.state.before=async({path})=>{if(path==='/v2/customers'){entered();await wait;}};
  const checkout=f.backend.checkout(dealer.dealerId,order.id);await reached;await f.backend.cancel(dealer.dealerId,order.id);release();
  await assert.rejects(()=>checkout,/CLOSED/);assert.equal(f.state.calls.filter(x=>x.path==='/v2/payments').length,0);
});
test('opzegging tijdens subscriptionwachten bewaart cancel_pending en annuleert daarna juiste abonnement',async t=>{
  const f=fixture(t),order=await f.open();f.state.payments.get('tr_payment001').status='paid';let release,entered;
  const reached=new Promise(resolve=>entered=resolve),wait=new Promise(resolve=>release=resolve);
  f.state.before=async({path,options})=>{if(path.endsWith('/subscriptions')&&options.method==='POST'){entered();await wait;}};
  const reconciliation=f.backend.reconcilePayment('tr_payment001');await reached;
  await assert.rejects(()=>f.backend.cancel(dealer.dealerId,order.id),/NEEDS_RECONCILIATION/);release();await reconciliation;
  assert.equal(f.backend.order(dealer.dealerId,order.id).status,'cancel_pending');
  await f.backend.cancel(dealer.dealerId,order.id);assert.equal(f.state.subscriptions.get('sub_subscription001').status,'canceled');
});
test('opzegging maakt reeds ondertekende devicehouder niet vrij via een andere actieve order',async t=>{
  const f=fixture(t),first=await f.paid(),lease=f.backend.issueLease(dealer.dealerId,first.id,'install-one');
  await f.backend.cancel(dealer.dealerId,first.id);
  const second=f.backend.createOrder(dealer.dealerId,{...consent,requestKey:'order-request-002'});await f.backend.checkout(dealer.dealerId,second.id);
  f.state.payments.get('tr_payment002').status='paid';await f.backend.reconcilePayment('tr_payment002');
  assert.throws(()=>f.backend.issueLease(dealer.dealerId,second.id,'install-two'),/ANOTHER_DEVICE/);
  assert.ok(verifyLicense(lease.token,keys.publicKey,{dealerId:dealer.dealerId,installId:'install-one',now:NOW}));
  f.state.now+=300001;await f.backend.reconcilePayment('tr_payment002');assert.ok(f.backend.issueLease(dealer.dealerId,second.id,'install-two').token);
});
test('reconciliatie van onbetaalde order B laat actieve devicehouder van order A intact',async t=>{
  const f=fixture(t),first=await f.paid();f.backend.issueLease(dealer.dealerId,first.id,'install-one');
  const second=f.backend.createOrder(dealer.dealerId,{...consent,requestKey:'order-request-002'});await f.backend.checkout(dealer.dealerId,second.id);await f.backend.reconcilePayment('tr_payment002');
  assert.equal(f.backend.db.prepare('SELECT order_id FROM device_leases').get().order_id,first.id);
  assert.throws(()=>f.backend.issueLease(dealer.dealerId,first.id,'install-two'),/ANOTHER_DEVICE/);
});
test('echte loopback HTTP-flow authenticatie checkout webhook en lease met geïnjecteerde provider',async t=>{
  const f=fixture(t),app=await startBillingServer({backend:f.backend});t.after(()=>app.close());
  const post=(path,body,token,extra={})=>fetch(app.origin+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{ }),...extra},body:JSON.stringify(body)});
  assert.equal((await post('/orders',consent)).status,401);
  assert.equal((await post('/login',dealer,null,{origin:'https://evil.example'})).status,403);
  const login=await post('/login',dealer),session=await login.json();assert.equal(login.status,200);
  const created=await post('/orders',consent,session.token),order=await created.json();assert.equal(created.status,201);
  assert.equal((await post(`/orders/${order.id}/checkout`,{},session.token)).status,200);
  assert.equal((await post('/webhook',{id:'tr_payment001',status:'paid'})).status,200);
  assert.equal((await post(`/orders/${order.id}/lease`,{installId:'install-one'},session.token)).status,403);
  f.state.payments.get('tr_payment001').status='paid';
  const webhook=await fetch(app.origin+'/webhook',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'id=tr_payment001&status=failed'});assert.equal(webhook.status,200);
  const lease=await post(`/orders/${order.id}/lease`,{installId:'install-one'},session.token);assert.equal(lease.status,200);assert.equal((await lease.json()).testMode,true);
  f.backend.createDealer({...dealer,dealerId:'dealer-two',email:'two@example.test'});const other=f.backend.login({email:'two@example.test',password:dealer.password});
  assert.equal((await post(`/orders/${order.id}/lease`,{installId:'install-one'},other.token)).status,404);
});

for(const [anchor,index,start,end] of [
  ['2027-01-31',0,'2027-01-31','2027-02-28'],['2027-01-31',1,'2027-02-28','2027-03-31'],
  ['2028-01-31',0,'2028-01-31','2028-02-29'],['2028-01-31',1,'2028-02-29','2028-03-31'],
  ['2027-01-30',1,'2027-02-28','2027-03-30'],['2027-04-30',0,'2027-04-30','2027-05-31'],
  ['2028-02-29',12,'2029-02-28','2029-03-31'],['2027-12-31',1,'2028-01-31','2028-02-29'],
])test(`kalendertermijn ${anchor} plus ${index} maanden: ${start} tot ${end}`,()=>{
  const period=billingPeriod(anchor,index);assert.equal(period.startDay,start);assert.equal(period.endDay,end);
});
test('eerste serviceperiode eindigt exact op abonnementsstart; nul dagen grace',async t=>{
  const f=fixture(t),order=await f.paid();assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-10-06'));
  const invoice=f.backend.invoices(dealer.dealerId,order.id)[0];assert.deepEqual([invoice.start_day,invoice.end_day,invoice.status],['2026-10-06','2026-11-06','scheduled']);
  f.state.now=Date.parse('2026-10-06');await f.backend.reconcilePayment('tr_payment001');assert.equal(f.backend.order(dealer.dealerId,order.id).status,'past_due');
  assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
});
test('terugkerende betaling betaalt één vooraf bepaalde kalendertermijn; duplicaat verlengt niet',async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring();await f.bind(payment);await f.backend.reconcilePayment(payment.id);
  const until=Date.parse('2026-11-06');assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,until);
  await f.backend.reconcilePayment(payment.id);await f.backend.reconcilePayment(payment.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,until);assert.equal(f.backend.db.prepare('SELECT COUNT(*) n FROM invoice_payments').get().n,1);
  assert.equal(f.backend.invoices(dealer.dealerId,order.id)[0].status,'paid');assert.ok(f.backend.issueLease(dealer.dealerId,order.id,'install-one').token);
});
test('latere termijn eerst betaald overbrugt geen onbetaalde maand; latere recovery sluit het gat',async t=>{
  const f=fixture(t),order=await f.paid(),second=f.recurring({createdAt:'2026-11-06T12:00:00Z'});await f.bind(second,1);await f.backend.reconcilePayment(second.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-10-06'));assert.equal(f.backend.order(dealer.dealerId,order.id).status,'past_due');
  const first=f.recurring({createdAt:'2026-10-06T12:00:00Z'});await f.bind(first);await f.backend.reconcilePayment(first.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-12-06'));assert.equal(f.backend.order(dealer.dealerId,order.id).status,'active');
});
test('mislukte termijn en betaald nieuw retry-ID blijven in dezelfde factuur',async t=>{
  const f=fixture(t),order=await f.paid(),failed=f.recurring({status:'failed'});await f.bind(failed);await f.backend.reconcilePayment(failed.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).status,'past_due');assert.equal(f.backend.invoices(dealer.dealerId,order.id)[0].status,'past_due');
  const recovery=f.recurring({createdAt:'2026-10-08T12:00:00Z'});await f.bind(recovery);await f.backend.reconcilePayment(recovery.id);await f.backend.reconcilePayment(failed.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-11-06'));assert.equal(f.backend.invoices(dealer.dealerId,order.id)[0].status,'paid');
  assert.equal(f.backend.db.prepare('SELECT COUNT(DISTINCT invoice_id) n FROM invoice_payments').get().n,1);
});
test('betaalde status na eerdere failed-status op hetzelfde ID herstelt precies één termijn',async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring({status:'failed'});await f.bind(payment);await f.backend.reconcilePayment(payment.id);
  payment.status='paid';await f.backend.reconcilePayment(payment.id);assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-11-06'));
});
test('termijn vanaf 31 januari gaat via februari terug naar 31 maart',async t=>{
  const f=fixture(t,{now:Date.parse('2027-01-20'),configOverrides:{subscriptionStartDate:'2027-01-31'}}),order=await f.paid();
  const january=f.recurring({createdAt:'2027-01-31T12:00:00Z'});await f.bind(january);await f.backend.reconcilePayment(january.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2027-02-28'));
  const february=f.recurring({createdAt:'2027-02-28T12:00:00Z'});await f.bind(february,1);await f.backend.reconcilePayment(february.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2027-03-31'));
});
for(const reversal of ['amountRefunded','amountChargedBack'])test(`recurring ${reversal} trekt termijnverlenging in en oud paid kan blokkade niet wissen`,async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring();await f.bind(payment);await f.backend.reconcilePayment(payment.id);
  payment[reversal]={currency:'EUR',value:'1.00'};await f.backend.reconcilePayment(payment.id);
  assert.equal(f.backend.invoices(dealer.dealerId,order.id)[0].status,'reversed');assert.equal(f.backend.order(dealer.dealerId,order.id).status,'suspended');
  delete payment[reversal];await f.backend.reconcilePayment(payment.id);assert.equal(f.backend.order(dealer.dealerId,order.id).status,'suspended');
  assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
});
test('concurrent oud paid antwoord voor dezelfde termijn overschrijft recente refund niet',async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring();await f.bind(payment);await f.backend.reconcilePayment(payment.id);let release,entered,first=true;
  const reached=new Promise(resolve=>entered=resolve),wait=new Promise(resolve=>release=resolve);
  f.state.before=async({path})=>{if(path===`/v2/payments/${payment.id}`&&first){first=false;const copy=structuredClone(payment);entered();await wait;return Response.json(copy);}};
  const stale=f.backend.reconcilePayment(payment.id);await reached;payment.amountRefunded={currency:'EUR',value:'180.29'};await f.backend.reconcilePayment(payment.id);release();await stale;
  assert.equal(f.backend.invoices(dealer.dealerId,order.id)[0].status,'reversed');assert.equal(f.backend.order(dealer.dealerId,order.id).status,'suspended');
});
test('recurring valuta, bedrag, identiteit, mode, sequence, datum en mandate mismatches verlengen nooit',async t=>{
  const f=fixture(t),order=await f.paid();
  for(const override of [{amount:{currency:'USD',value:'180.29'}},{amount:{currency:'EUR',value:'1.00'}},{customerId:'cst_wrong001'},{subscriptionId:'sub_wrong001'},{mode:'live'},{sequenceType:'first'},{mandateId:'mdt_wrong001'},{createdAt:'2026-09-01T12:00:00Z'},{createdAt:'invalid'}]){
    const payment=f.recurring(override);await assert.rejects(()=>f.backend.reconcilePayment(payment.id));
    assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-10-06'));
  }
  assert.equal(f.backend.db.prepare('SELECT COUNT(*) n FROM invoice_payments').get().n,0);
});
test('provider wijzigt binding van bestaand recurring ID: andere maand wordt geweigerd',async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring();await f.bind(payment);await f.backend.reconcilePayment(payment.id);
  payment.createdAt='2026-11-06T12:00:00Z';f.state.now=Date.parse(payment.createdAt);await assert.rejects(()=>f.backend.reconcilePayment(payment.id),/BINDING_CHANGED/);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-11-06'));
});
test('opzegging verhindert heractivatie door latere echte recurring paid-status',async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring();await f.bind(payment);await f.backend.cancel(dealer.dealerId,order.id);await f.backend.reconcilePayment(payment.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).status,'canceled');assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
});
test('verlopen mandate of niet-actief abonnement verhindert recurring licentie-uitgifte',async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring();await f.bind(payment);f.state.mandateStatus='invalid';await f.backend.reconcilePayment(payment.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).status,'suspended');
  f.state.mandateStatus='valid';f.state.subscriptions.get('sub_subscription001').status='suspended';await f.backend.reconcilePayment(payment.id);
  assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
});
test('recurring factuur en betaalbinding blijven na procesherstart bestaan',async t=>{
  const f=fixture(t,{persistent:true}),order=await f.paid(),payment=f.recurring();await f.bind(payment);await f.backend.reconcilePayment(payment.id);
  f.backend.close();f.state.backend=new BillingBackend(f.options);await f.state.backend.reconcilePayment(payment.id);
  assert.equal(f.state.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-11-06'));assert.equal(f.state.backend.db.prepare('SELECT COUNT(*) n FROM invoice_payments').get().n,1);
});
test('ongebonden recurring betaalhint mag zelf geen serviceperiode kiezen',async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring();
  await assert.rejects(()=>f.backend.reconcilePayment(payment.id),/BINDING_REQUIRED/);
  assert.equal(f.backend.db.prepare('SELECT COUNT(*) n FROM unbound_payments').get().n,1);
  assert.equal(f.backend.db.prepare('SELECT COUNT(*) n FROM invoice_payments').get().n,0);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-10-06'));
  await f.bind(payment);await f.backend.reconcilePayment(payment.id);
  assert.equal(f.backend.db.prepare('SELECT COUNT(*) n FROM unbound_payments').get().n,0);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-11-06'));
});
test('retry na de maandgrens betaalt na expliciete binding de oude factuur zonder nieuwe maand',async t=>{
  const f=fixture(t),order=await f.paid(),failed=f.recurring({status:'failed'});await f.bind(failed);await f.backend.reconcilePayment(failed.id);
  const retry=f.recurring({createdAt:'2026-11-08T12:00:00Z'});
  await assert.rejects(()=>f.backend.reconcilePayment(retry.id),/BINDING_REQUIRED/);
  await f.bind(retry,0);await f.backend.reconcilePayment(retry.id);
  assert.equal(f.backend.invoices(dealer.dealerId,order.id)[0].status,'paid');
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-11-06'));assert.equal(f.backend.order(dealer.dealerId,order.id).status,'past_due');
  const current=f.recurring({createdAt:'2026-11-06T12:00:00Z'});await f.bind(current,1);await f.backend.reconcilePayment(current.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-12-06'));
});
test('betaalbinding vereist geplande factuur en reviewreferentie en is onveranderlijk',async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring({createdAt:'2026-11-08T12:00:00Z'});
  const args={dealerId:dealer.dealerId,orderId:order.id,paymentId:payment.id,invoiceId:`${order.id}:month:0`,evidenceRef:'review-invoice001'};
  await assert.rejects(()=>f.backend.bindRecurringPayment({...args,evidenceRef:''}),/REVIEW_REQUIRED/);
  await assert.rejects(()=>f.backend.bindRecurringPayment({...args,invoiceId:'missing-invoice'}),/PLANNED_INVOICE/);
  await f.backend.bindRecurringPayment(args);await f.backend.bindRecurringPayment(args);f.backend.planInvoices(dealer.dealerId,order.id,1);
  await assert.rejects(()=>f.backend.bindRecurringPayment({...args,invoiceId:`${order.id}:month:1`}),/BINDING_CHANGED/);
  assert.equal(f.backend.db.prepare('SELECT COUNT(*) n FROM payment_invoice_bindings').get().n,1);
});
test('gelijktijdige callbacks voor verschillende termijnen bewaren beide betalingsbewijzen',async t=>{
  const f=fixture(t),order=await f.paid(),first=f.recurring(),second=f.recurring({createdAt:'2026-11-06T12:00:00Z'});await f.bind(first,0);await f.bind(second,1);
  let release,entered,hold=true;const reached=new Promise(resolve=>entered=resolve),wait=new Promise(resolve=>release=resolve);
  f.state.before=async({path})=>{if(path==='/v2/payments/tr_payment001'&&hold){hold=false;entered();await wait;}};
  const older=f.backend.reconcilePayment(first.id);await reached;await f.backend.reconcilePayment(second.id);release();await older;
  assert.equal(f.backend.db.prepare('SELECT COUNT(*) n FROM invoice_payments').get().n,2);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-12-06'));
});
test('eerste-payment refund blijft blokkeren bij herverificatie vanuit een betaalde maandtermijn',async t=>{
  const f=fixture(t),order=await f.paid(),initial=f.state.payments.get('tr_payment001');initial.amountRefunded={currency:'EUR',value:'301.29'};
  await f.backend.reconcilePayment(initial.id);delete initial.amountRefunded;
  const payment=f.recurring();await f.bind(payment);await f.backend.reconcilePayment(payment.id);
  assert.equal(f.backend.order(dealer.dealerId,order.id).status,'suspended');assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
});
test('providerfout bij bekende recurring betaling blokkeert nieuwe lease tot verse controle',async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring();await f.bind(payment);await f.backend.reconcilePayment(payment.id);
  f.state.before=async({path})=>{if(path===`/v2/payments/${payment.id}`)throw new Error('synthetic outage');};
  await assert.rejects(()=>f.backend.reconcilePayment(payment.id));assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/);
  f.state.before=null;await f.backend.reconcilePayment('tr_payment001');
  assert.throws(()=>f.backend.issueLease(dealer.dealerId,order.id,'install-one'),/ENTITLEMENT/,'eerste betaling vernieuwt onzeker maandbewijs niet');
  await f.backend.reconcilePayment(payment.id);assert.ok(f.backend.issueLease(dealer.dealerId,order.id,'install-one').token);
});
test('ongeldige providerkalenderdatum wordt niet naar volgende maand genormaliseerd',async t=>{
  const f=fixture(t),order=await f.paid(),payment=f.recurring({createdAt:'2027-02-30T12:00:00Z'});
  await assert.rejects(()=>f.backend.reconcilePayment(payment.id),/TIMESTAMP/);
  assert.equal(f.backend.order(dealer.dealerId,order.id).paidThrough,Date.parse('2026-10-06'));
});
