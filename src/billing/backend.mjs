/** Independent publisher-side TEST service. Importing does not start a server.
 * No provider key, signing key, live switch, tax decision or email dispatcher here.
 */
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';

class BillingError extends Error{constructor(code,status=400){super(code);this.status=status;}}
const fail=(code,status)=>{throw new BillingError(code,status);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{3,100}$/.test(value);
const money=value=>Number.isSafeInteger(value)&&value>0&&value<=10000000;
const providerId=(value,prefix)=>typeof value==='string'&&new RegExp(`^${prefix}_[a-zA-Z0-9]{3,80}$`).test(value);
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
/** UTC calendar-date service boundaries. Preserve the original day, including an
 * end-of-month anchor, rather than adding a fixed number of milliseconds/days. */
export function billingPeriod(startDate,index){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!Number.isSafeInteger(index)||index<0||index>1200)fail('INVALID_SERVICE_PERIOD');
  const anchor=new Date(startDate);if(!Number.isFinite(anchor.getTime())||anchor.toISOString().slice(0,10)!==startDate)fail('INVALID_SERVICE_PERIOD');
  const year=anchor.getUTCFullYear(),month=anchor.getUTCMonth(),day=anchor.getUTCDate(),lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate(),monthEnd=day===lastDay;
  const boundary=offset=>{const last=new Date(Date.UTC(year,month+offset+1,0)).getUTCDate();return new Date(Date.UTC(year,month+offset,monthEnd?last:Math.min(day,last))).toISOString().slice(0,10);};
  const startDay=boundary(index),endDay=boundary(index+1);
  return {index,startDay,endDay,startsAt:Date.parse(startDay),endsAt:Date.parse(endDay)};
}
function providerTime(createdAt){
  if(typeof createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(createdAt))fail('PAYMENT_TIMESTAMP_REQUIRED',502);
  const time=Date.parse(createdAt),day=createdAt.slice(0,10);
  if(!Number.isFinite(time)||new Date(Date.parse(day)).toISOString().slice(0,10)!==day)fail('INVALID_PAYMENT_TIMESTAMP',502);
  return time;
}
function reversedPayment(payment){
  if(['hasChargebacks','hasRefunds'].some(key=>payment[key]!==undefined&&typeof payment[key]!=='boolean'))fail('INVALID_REVERSAL_FLAGS',502);
  let reversed=!!payment.hasRefunds||!!payment.hasChargebacks;
  for(const amount of [payment.amountRefunded,payment.amountChargedBack])if(amount){
    if(amount.currency!=='EUR'||typeof amount.value!=='string'||!/^\d+\.\d{2}$/.test(amount.value))fail('INVALID_REVERSAL_AMOUNT',502);
    if(Number(amount.value)>0)reversed=true;
  }
  return reversed;
}
const cleanOrder=row=>row&&({id:row.id,dealerId:row.dealer_id,status:row.status,paymentStatus:row.payment_status,subscriptionStatus:row.subscription_status,
  setupTotalCents:row.setup_cents,monthlyTotalCents:row.monthly_cents,termsVersion:row.terms_version,paidThrough:row.paid_through,checkoutUrl:row.checkout_url});

export class BillingBackend{
  constructor({dbPath=':memory:',gateway,issuer,config,now=()=>Date.now()}={}){
    if(gateway?.mode!=='test')fail('ONLY_PROVIDER_TEST_MODE');
    if(typeof issuer!=='function')fail('PUBLISHER_ISSUER_REQUIRED');
    const c=config;
    if(!c||c.providerTest!==true||!['termsVersion','privacyVersion','cancellationPolicyVersion','taxReviewId','invoiceReviewId'].every(k=>identifier(c[k]))||
      !money(c.setupTotalCents)||!money(c.monthlyTotalCents)||!safeUrl(c.redirectUrl)||!safeUrl(c.webhookUrl)||c.emailMode!=='disabled-fixture')fail('REVIEWED_CONFIGURATION_REQUIRED');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(c.subscriptionStartDate)||!Number.isFinite(Date.parse(c.subscriptionStartDate))||new Date(c.subscriptionStartDate).toISOString().slice(0,10)!==c.subscriptionStartDate)fail('SUBSCRIPTION_DATE_REQUIRED');
    this.gateway=gateway;this.issuer=issuer;this.config=Object.freeze({...c});this.now=now;
    this.db=new DatabaseSync(dbPath);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dealers(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,company TEXT NOT NULL,password_salt TEXT NOT NULL,password_hash TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,dealer_id TEXT NOT NULL REFERENCES dealers(id),expires INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS login_limits(email_hash TEXT PRIMARY KEY,window_start INTEGER NOT NULL,attempts INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,dealer_id TEXT NOT NULL REFERENCES dealers(id),request_key TEXT NOT NULL,request_hash TEXT NOT NULL,
        status TEXT NOT NULL,payment_status TEXT NOT NULL DEFAULT 'none',subscription_status TEXT NOT NULL DEFAULT 'none',
        setup_cents INTEGER NOT NULL,monthly_cents INTEGER NOT NULL,terms_version TEXT NOT NULL,config_json TEXT NOT NULL,
        created INTEGER NOT NULL,customer_id TEXT,payment_id TEXT UNIQUE,subscription_id TEXT UNIQUE,checkout_url TEXT,
        paid_through INTEGER NOT NULL DEFAULT 0,verified_at INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,UNIQUE(dealer_id,request_key)) STRICT;
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,input_hash TEXT NOT NULL,status TEXT NOT NULL,result_json TEXT,created INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),kind TEXT NOT NULL,created INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS device_leases(dealer_id TEXT PRIMARY KEY REFERENCES dealers(id),order_id TEXT NOT NULL REFERENCES orders(id),install_id TEXT NOT NULL,expires INTEGER NOT NULL,lease_id TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),period_index INTEGER NOT NULL,start_day TEXT NOT NULL,end_day TEXT NOT NULL,starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,total_cents INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'scheduled',UNIQUE(order_id,period_index)) STRICT;
      CREATE TABLE IF NOT EXISTS invoice_payments(payment_id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL REFERENCES invoices(id),provider_created INTEGER NOT NULL,status TEXT NOT NULL,paid INTEGER NOT NULL,reversed INTEGER NOT NULL,verified_at INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS payment_checks(payment_id TEXT PRIMARY KEY,revision INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS payment_invoice_bindings(payment_id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL REFERENCES invoices(id),provider_created INTEGER NOT NULL,evidence_ref TEXT NOT NULL,bound_at INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS unbound_payments(payment_id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),provider_created INTEGER NOT NULL,status TEXT NOT NULL,observed_at INTEGER NOT NULL) STRICT;
    `);
    const columns=new Set(this.db.prepare('PRAGMA table_info(orders)').all().map(x=>x.name));
    for(const column of ['initial_paid','initial_reversed','subscription_valid'])if(!columns.has(column))this.db.exec(`ALTER TABLE orders ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
  }
  close(){this.db.close();}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  event(orderId,kind,suffix=kind){this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?)').run(`${orderId}:${suffix}`,orderId,kind,this.now());}
  /** Explicit local administration method, deliberately not an HTTP registration API. */
  createDealer({dealerId,email,company,password}){
    if(!identifier(dealerId)||typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof company!=='string'||company.length<2||company.length>100||typeof password!=='string'||password.length<12||password.length>200)fail('INVALID_DEALER');
    const salt=randomBytes(16).toString('hex'),digest=scryptSync(password,salt,64).toString('hex');
    this.db.prepare('INSERT INTO dealers VALUES(?,?,?,?,?)').run(dealerId,email.trim().toLowerCase(),company,salt,digest);
    return {dealerId};
  }
  login({email,password}){
    if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length>200)fail('INVALID_CREDENTIALS',401);
    email=email.trim().toLowerCase();const key=hash(email),now=this.now();
    this.tx(()=>{
      const limit=this.db.prepare('SELECT * FROM login_limits WHERE email_hash=?').get(key);
      if(limit&&now-limit.window_start<900000&&limit.attempts>=5)fail('LOGIN_RATE_LIMIT',429);
      this.db.prepare('INSERT INTO login_limits VALUES(?,?,1) ON CONFLICT(email_hash) DO UPDATE SET window_start=excluded.window_start,attempts=?').run(key,limit&&now-limit.window_start<900000?limit.window_start:now,limit&&now-limit.window_start<900000?limit.attempts+1:1);
    });
    const dealer=this.db.prepare('SELECT * FROM dealers WHERE email=?').get(email),digest=scryptSync(password,dealer?.password_salt||'biedbot-missing-dealer',64);
    if(!dealer||!timingSafeEqual(digest,Buffer.from(dealer.password_hash,'hex')))fail('INVALID_CREDENTIALS',401);
    const token=randomBytes(32).toString('base64url'),expires=now+8*3600000;
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),dealer.id,expires);
    this.db.prepare('DELETE FROM login_limits WHERE email_hash=?').run(key);
    return {token,expires,dealerId:dealer.id};
  }
  authenticate(token){
    if(typeof token!=='string'||token.length>100)fail('AUTH_REQUIRED',401);
    const session=this.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(hash(token),this.now());
    if(!session)fail('AUTH_REQUIRED',401);return session.dealer_id;
  }
  logout(token){if(typeof token==='string')this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));}
  owned(dealerId,orderId){const row=this.db.prepare('SELECT * FROM orders WHERE id=? AND dealer_id=?').get(orderId,dealerId);if(!row)fail('ORDER_NOT_FOUND',404);return row;}
  order(dealerId,orderId){return cleanOrder(this.owned(dealerId,orderId));}
  invoices(dealerId,orderId){this.owned(dealerId,orderId);return this.db.prepare('SELECT id,period_index,start_day,end_day,total_cents,status FROM invoices WHERE order_id=? ORDER BY period_index').all(orderId);}
  planInvoices(dealerId,orderId,throughIndex){
    const order=this.owned(dealerId,orderId);if(!Number.isSafeInteger(throughIndex)||throughIndex<0||throughIndex>1200)fail('INVALID_SERVICE_PERIOD');
    return this.tx(()=>{for(let index=0;index<=throughIndex;index++)this.planInvoice(order,index);return this.invoices(dealerId,orderId);});
  }
  planInvoice(order,index){
    const period=billingPeriod(JSON.parse(order.config_json).subscriptionStartDate,index),id=`${order.id}:month:${index}`;
    this.db.prepare("INSERT OR IGNORE INTO invoices(id,order_id,period_index,start_day,end_day,starts_at,ends_at,total_cents) VALUES(?,?,?,?,?,?,?,?)").run(id,order.id,index,period.startDay,period.endDay,period.startsAt,period.endsAt,order.monthly_cents);
    return this.db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  }
  refreshEntitlement(orderId){
    const order=this.db.prepare('SELECT * FROM orders WHERE id=?').get(orderId),config=JSON.parse(order.config_json);
    let through=Date.parse(config.subscriptionStartDate),expected=0;
    let hold=!!this.db.prepare('SELECT 1 FROM invoice_payments JOIN invoices ON invoices.id=invoice_payments.invoice_id WHERE invoices.order_id=? AND invoice_payments.verified_at=0').get(orderId);
    const invoices=this.db.prepare('SELECT * FROM invoices WHERE order_id=? ORDER BY period_index').all(orderId);
    for(const invoice of invoices){if(invoice.status==='reversed')hold=true;if(invoice.period_index===expected&&invoice.status==='paid'){through=invoice.ends_at;expected++;}}
    const closed=['canceled','cancel_pending'].includes(order.status);
    const eligible=!!order.initial_paid&&!order.initial_reversed&&!!order.subscription_valid&&!hold;
    const status=closed?order.status:!eligible?(order.payment_status==='paid'?'suspended':order.payment_status):through<=this.now()?'past_due':'active';
    this.db.prepare('UPDATE orders SET status=?,paid_through=? WHERE id=?').run(status,through,orderId);
    return this.order(order.dealer_id,orderId);
  }
  beginPaymentCheck(paymentId){return this.db.prepare('INSERT INTO payment_checks VALUES(?,1) ON CONFLICT(payment_id) DO UPDATE SET revision=revision+1 RETURNING revision').get(paymentId).revision;}
  currentPaymentCheck(paymentId,ticket){return this.db.prepare('SELECT revision FROM payment_checks WHERE payment_id=?').get(paymentId)?.revision===ticket;}
  createOrder(dealerId,{requestKey,termsVersion,acceptTerms,recurringConsent,acceptPrivacy,acceptCancellation,...extra}){
    if(Date.parse(this.config.subscriptionStartDate)<=this.now())fail('FUTURE_SUBSCRIPTION_DATE_REQUIRED');
    if(!identifier(requestKey)||Object.keys(extra).length||termsVersion!==this.config.termsVersion||[acceptTerms,recurringConsent,acceptPrivacy,acceptCancellation].some(x=>x!==true))fail('EXPLICIT_CURRENT_CONSENT_REQUIRED');
    const inputHash=hash(JSON.stringify({termsVersion,acceptTerms,recurringConsent,acceptPrivacy,acceptCancellation,config:this.config}));
    return this.tx(()=>{
      const old=this.db.prepare('SELECT * FROM orders WHERE dealer_id=? AND request_key=?').get(dealerId,requestKey);
      if(old){if(old.request_hash!==inputHash)fail('IDEMPOTENCY_CONFLICT',409);return cleanOrder(old);}
      const orderId=randomUUID();
      this.db.prepare(`INSERT INTO orders(id,dealer_id,request_key,request_hash,status,setup_cents,monthly_cents,terms_version,config_json,created) VALUES(?,?,?,?,'created',?,?,?,?,?)`).run(orderId,dealerId,requestKey,inputHash,this.config.setupTotalCents,this.config.monthlyTotalCents,termsVersion,JSON.stringify(this.config),this.now());
      this.event(orderId,'CONSENT_RECORDED');return this.order(dealerId,orderId);
    });
  }
  async operation(key,input,fn){
    const fingerprint=hash(JSON.stringify(input));
    const prior=this.tx(()=>{
      const old=this.db.prepare('SELECT * FROM operations WHERE id=?').get(key);
      if(old){if(old.input_hash!==fingerprint)fail('IDEMPOTENCY_CONFLICT',409);if(old.status==='done')return JSON.parse(old.result_json);fail(old.status==='pending'?'OPERATION_IN_PROGRESS':'OPERATION_UNCERTAIN',409);}
      this.db.prepare("INSERT INTO operations VALUES(?,?,'pending',NULL,?)").run(key,fingerprint,this.now());return null;
    });
    if(prior!==null)return prior;
    try{const result=await fn();this.db.prepare("UPDATE operations SET status='done',result_json=? WHERE id=?").run(JSON.stringify(result),key);return result;}
    catch(error){this.db.prepare("UPDATE operations SET status='uncertain' WHERE id=?").run(key);throw error;}
  }
  /** Call only after an operator confirms no publisher process is still executing. */
  recoverOperations(){return this.db.prepare("UPDATE operations SET status='uncertain' WHERE status='pending'").run().changes;}
  async checkout(dealerId,orderId){
    let order=this.owned(dealerId,orderId);if(['canceled','cancel_pending','suspended'].includes(order.status))fail('ORDER_CLOSED',409);
    const config=JSON.parse(order.config_json),dealer=this.db.prepare('SELECT email,company FROM dealers WHERE id=?').get(dealerId);
    const customer=await this.operation(`customer:${orderId}`,{dealerId,orderId,...dealer},()=>this.gateway.createCustomer({...dealer,orderId}));
    if(!providerId(customer.id,'cst'))fail('INVALID_PROVIDER_CUSTOMER',502);
    this.db.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(customer.id,orderId);
    if(['canceled','cancel_pending','suspended'].includes(this.owned(dealerId,orderId).status))fail('ORDER_CLOSED',409);
    const args={customerId:customer.id,dealerId,orderId,totalCents:order.setup_cents,redirectUrl:config.redirectUrl,webhookUrl:config.webhookUrl,description:`BiedBot testbestelling ${orderId}`,recurringConsent:true,taxReviewed:true};
    const payment=await this.operation(`payment:${orderId}`,args,()=>this.gateway.firstPayment(args));
    if(!providerId(payment.id,'tr')||payment.mode!=='test')fail('INVALID_PROVIDER_TEST_PAYMENT',502);
    const checkoutUrl=payment._links?.checkout?.href;
    if(!safeUrl(checkoutUrl)||new URL(checkoutUrl).hostname!=='www.mollie.com')fail('INVALID_PROVIDER_CHECKOUT',502);
    this.db.prepare("UPDATE orders SET payment_id=?,checkout_url=?,status=CASE WHEN status='created' THEN 'open' ELSE status END WHERE id=?").run(payment.id,checkoutUrl,orderId);
    this.event(orderId,'CHECKOUT_CREATED');return this.order(dealerId,orderId);
  }
  async reconcilePayment(paymentId){
    if(!providerId(paymentId,'tr'))fail('INVALID_PAYMENT_ID');
    const paymentTicket=this.beginPaymentCheck(paymentId);
    const order=this.db.prepare('SELECT * FROM orders WHERE payment_id=?').get(paymentId);
    if(!order){
      const known=this.db.prepare('SELECT invoices.order_id FROM payment_invoice_bindings JOIN invoices ON invoices.id=payment_invoice_bindings.invoice_id WHERE payment_id=?').get(paymentId);
      if(known){
        this.db.prepare('UPDATE orders SET verified_at=0 WHERE id=?').run(known.order_id);
        // Keep uncertainty attached to the actual invoice proof. An unrelated first
        // payment callback must not refresh this unknown recurring payment away.
        this.db.prepare('UPDATE invoice_payments SET verified_at=0 WHERE payment_id=?').run(paymentId);
      }
      return this.reconcileRecurring(paymentId,paymentTicket);
    }
    const ticket=this.db.prepare('UPDATE orders SET revision=revision+1,verified_at=0 WHERE id=? RETURNING revision').get(order.id).revision;
    const verified=await this.gateway.verifiedPayment(paymentId,{customerId:order.customer_id,dealerId:order.dealer_id,orderId:order.id,totalCents:order.setup_cents});
    if(verified.payment.mode!=='test'||verified.payment.sequenceType!=='first')fail('PAYMENT_MODE_OR_SEQUENCE_MISMATCH',502);
    const config=JSON.parse(order.config_json);let subscription=null,rights=verified.paid&&!order.initial_reversed;
    const current=this.db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
    if(current.revision!==ticket||!this.currentPaymentCheck(paymentId,paymentTicket))return {ignored:true};
    if(['canceled','cancel_pending'].includes(current.status))rights=false;
    if(rights){
      const mandateId=verified.payment.mandateId;if(!providerId(mandateId,'mdt'))fail('VALID_MANDATE_REQUIRED',409);
    }
    // Subscription creation is its own persistent operation; re-fetch current state
    // before granting any lease. A callback's claimed status is never consulted.
    if(rights&&!current.subscription_id){
      const latest=this.db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
      if(latest.revision!==ticket||['canceled','cancel_pending'].includes(latest.status))return {ignored:true};
      // The operation persists the immutable request before the provider side effect.
      const key=`subscribe-provider:${order.id}`,args={customerId:order.customer_id,mandateId:verified.payment.mandateId,monthlyTotalCents:order.monthly_cents,startDate:config.subscriptionStartDate,webhookUrl:config.webhookUrl,orderId:order.id,description:`BiedBot testabonnement ${order.id}`};
      subscription=await this.operation(key,args,()=>this.gateway.subscribe(args));
      if(!providerId(subscription.id,'sub'))fail('INVALID_SUBSCRIPTION',502);
      this.db.prepare('UPDATE orders SET subscription_id=? WHERE id=?').run(subscription.id,order.id);
    }
    let subscriptionStatus=current.subscription_status;
    if(rights){
      const subscriptionId=current.subscription_id||subscription.id;
      const proof=await this.subscriptionProof({...order,subscription_id:subscriptionId},verified.payment.mandateId);
      subscriptionStatus=proof.status;rights=proof.valid;
    }
    return this.tx(()=>{
      const fresh=this.db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);if(fresh.revision!==ticket||!this.currentPaymentCheck(paymentId,paymentTicket))return {ignored:true};
      this.db.prepare('UPDATE orders SET payment_status=?,subscription_status=?,initial_paid=?,initial_reversed=MAX(initial_reversed,?),subscription_valid=?,verified_at=? WHERE id=?').run(verified.status,subscriptionStatus,Number(verified.paid),Number(reversedPayment(verified.payment)),Number(rights),this.now(),order.id);
      if(fresh.subscription_id)this.planInvoice(fresh,0);
      const result=this.refreshEntitlement(order.id);
      // Keep the holder until expiry: an already issued signature remains valid.
      // Rights block renewal; deleting this row would let another device overlap.
      this.event(order.id,rights?'PAYMENT_VERIFIED':'ENTITLEMENT_STOPPED',`${result.status}:${verified.status}:${subscriptionStatus}`);
      return result;
    });
  }
  async subscriptionProof(order,mandateId){
    if(!providerId(mandateId,'mdt')||!providerId(order.subscription_id,'sub'))fail('VALID_MANDATE_REQUIRED',409);
    const [remote,mandate]=await Promise.all([
      this.gateway.request(`/v2/customers/${order.customer_id}/subscriptions/${order.subscription_id}`),
      this.gateway.request(`/v2/customers/${order.customer_id}/mandates/${mandateId}`)
    ]);
    if(remote.id!==order.subscription_id||remote.customerId!==order.customer_id||remote.mode!=='test'||remote.amount?.currency!=='EUR'||remote.amount?.value!==(order.monthly_cents/100).toFixed(2)||remote.interval!=='1 month'||remote.mandateId!==mandateId||remote.startDate!==JSON.parse(order.config_json).subscriptionStartDate)fail('SUBSCRIPTION_MISMATCH',502);
    if(mandate.id!==mandateId)fail('MANDATE_MISMATCH',502);
    return {status:remote.status,valid:remote.status==='active'&&mandate.status==='valid'};
  }
  recurringOrder(payment,paymentId){
    if(payment?.id!==paymentId||payment.mode!=='test'||payment.sequenceType!=='recurring'||!providerId(payment.customerId,'cst')||!providerId(payment.subscriptionId,'sub'))fail('RECURRING_IDENTITY_MISMATCH',502);
    const order=this.db.prepare('SELECT * FROM orders WHERE customer_id=? AND subscription_id=?').get(payment.customerId,payment.subscriptionId);
    if(!order)fail('UNKNOWN_SUBSCRIPTION',404);
    if(payment.amount?.currency!=='EUR'||payment.amount?.value!==(order.monthly_cents/100).toFixed(2)||!['open','pending','authorized','paid','failed','expired','canceled'].includes(payment.status))fail('RECURRING_AMOUNT_OR_STATUS_MISMATCH',502);
    const created=providerTime(payment.createdAt);
    if(created<order.created||created>this.now()+300000)fail('PAYMENT_TIMESTAMP_OUTSIDE_ORDER',502);
    reversedPayment(payment);return order;
  }
  /** Privileged local reconciliation only, never a seller/dealer HTTP mutation.
   * The reviewer must identify the actual invoice from provider/accounting evidence;
   * createdAt alone is insufficient for retries that cross a service-period boundary.
   */
  async bindRecurringPayment({dealerId,orderId,paymentId,invoiceId,evidenceRef}){
    const order=this.owned(dealerId,orderId);
    if(!providerId(paymentId,'tr')||!identifier(evidenceRef))fail('PAYMENT_BINDING_REVIEW_REQUIRED');
    const invoice=this.db.prepare('SELECT * FROM invoices WHERE id=? AND order_id=?').get(invoiceId,orderId);
    if(!invoice)fail('PLANNED_INVOICE_REQUIRED',404);
    const payment=await this.gateway.request(`/v2/payments/${paymentId}`),providerOrder=this.recurringOrder(payment,paymentId);
    if(providerOrder.id!==orderId)fail('PAYMENT_ORDER_BINDING_MISMATCH',502);
    const created=providerTime(payment.createdAt);if(created<invoice.starts_at)fail('PAYMENT_BEFORE_SERVICE_PERIOD',502);
    await this.subscriptionProof(order,payment.mandateId);
    return this.tx(()=>{
      const old=this.db.prepare('SELECT * FROM payment_invoice_bindings WHERE payment_id=?').get(paymentId);
      if(old&&(old.invoice_id!==invoiceId||old.provider_created!==created||old.evidence_ref!==evidenceRef))fail('PAYMENT_PERIOD_BINDING_CHANGED',409);
      this.db.prepare('INSERT OR IGNORE INTO payment_invoice_bindings VALUES(?,?,?,?,?)').run(paymentId,invoiceId,created,evidenceRef,this.now());
      this.db.prepare('DELETE FROM unbound_payments WHERE payment_id=?').run(paymentId);
      this.event(orderId,'PAYMENT_BOUND',`binding:${paymentId}`);return {paymentId,invoiceId,evidenceRef};
    });
  }
  async reconcileRecurring(paymentId,paymentTicket){
    const payment=await this.gateway.request(`/v2/payments/${paymentId}`);
    if(!this.currentPaymentCheck(paymentId,paymentTicket))return {ignored:true};
    const order=this.recurringOrder(payment,paymentId);
    const ticket=this.db.prepare('UPDATE orders SET revision=revision+1,verified_at=0 WHERE id=? RETURNING revision').get(order.id).revision;
    const created=providerTime(payment.createdAt),binding=this.db.prepare('SELECT * FROM payment_invoice_bindings WHERE payment_id=?').get(paymentId);
    if(!binding){
      this.db.prepare('INSERT INTO unbound_payments VALUES(?,?,?,?,?) ON CONFLICT(payment_id) DO UPDATE SET status=excluded.status,observed_at=excluded.observed_at').run(paymentId,order.id,created,payment.status,this.now());
      fail('PAYMENT_INVOICE_BINDING_REQUIRED',409);
    }
    const invoice=this.db.prepare('SELECT * FROM invoices WHERE id=? AND order_id=?').get(binding.invoice_id,order.id);
    if(!invoice||binding.provider_created!==created)fail('PAYMENT_PERIOD_BINDING_CHANGED',502);
    const reversed=reversedPayment(payment);
    const [initial,proof]=await Promise.all([
      this.gateway.verifiedPayment(order.payment_id,{customerId:order.customer_id,dealerId:order.dealer_id,orderId:order.id,totalCents:order.setup_cents}),
      this.subscriptionProof(order,payment.mandateId)
    ]);
    if(initial.payment.mode!=='test'||initial.payment.sequenceType!=='first'||initial.payment.mandateId!==payment.mandateId)fail('INITIAL_PAYMENT_MISMATCH',502);
    return this.tx(()=>{
      if(!this.currentPaymentCheck(paymentId,paymentTicket))return {ignored:true};
      // The reviewed binding, not the callback or payment date, identifies the month.
      const old=this.db.prepare('SELECT * FROM invoice_payments WHERE payment_id=?').get(paymentId);
      if(old&&(old.invoice_id!==invoice.id||old.provider_created!==created))fail('PAYMENT_PERIOD_BINDING_CHANGED',502);
      this.db.prepare('INSERT INTO invoice_payments VALUES(?,?,?,?,?,?,?) ON CONFLICT(payment_id) DO UPDATE SET status=excluded.status,paid=excluded.paid,reversed=MAX(invoice_payments.reversed,excluded.reversed),verified_at=excluded.verified_at').run(paymentId,invoice.id,created,payment.status,Number(payment.status==='paid'&&!reversed),Number(reversed),this.now());
      const attempts=this.db.prepare('SELECT * FROM invoice_payments WHERE invoice_id=?').all(invoice.id);
      const status=attempts.some(x=>x.reversed)?'reversed':attempts.some(x=>x.paid)?'paid':attempts.some(x=>['failed','expired','canceled'].includes(x.status))?'past_due':'pending';
      this.db.prepare('UPDATE invoices SET status=? WHERE id=?').run(status,invoice.id);
      if(status==='paid')this.planInvoice(order,invoice.period_index+1);
      const current=this.db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
      // Keep every independently verified invoice; only the newest concurrent account
      // proof may replace subscription/initial-payment freshness and status.
      if(current.revision===ticket)this.db.prepare('UPDATE orders SET payment_status=?,subscription_status=?,initial_paid=?,initial_reversed=MAX(initial_reversed,?),subscription_valid=?,verified_at=? WHERE id=?').run(initial.status,proof.status,Number(initial.paid),Number(reversedPayment(initial.payment)),Number(proof.valid),this.now(),order.id);
      this.event(order.id,'INVOICE_'+status.toUpperCase(),`invoice:${invoice.period_index}:${status}`);
      return {...this.refreshEntitlement(order.id),invoiceId:invoice.id};
    });
  }
  async cancel(dealerId,orderId){
    const order=this.owned(dealerId,orderId);
    this.tx(()=>{this.db.prepare("UPDATE orders SET status='cancel_pending',revision=revision+1 WHERE id=?").run(orderId);this.event(orderId,'CANCELLATION_REQUESTED');});
    if(!order.payment_id&&this.db.prepare("SELECT 1 FROM operations WHERE id=? AND status IN ('pending','uncertain')").get(`payment:${orderId}`))fail('PAYMENT_OPERATION_NEEDS_RECONCILIATION',409);
    if(!order.subscription_id&&this.db.prepare("SELECT 1 FROM operations WHERE id=? AND status IN ('pending','uncertain')").get(`subscribe-provider:${orderId}`))fail('SUBSCRIPTION_OPERATION_NEEDS_RECONCILIATION',409);
    if(order.subscription_id){
      const args={customerId:order.customer_id,subscriptionId:order.subscription_id,operationId:`cancel:${orderId}`};
      await this.operation(`cancel:${orderId}`,args,()=>this.gateway.cancel(args));
      const remote=await this.gateway.request(`/v2/customers/${order.customer_id}/subscriptions/${order.subscription_id}`);
      if(remote.id!==order.subscription_id||remote.customerId!==order.customer_id||remote.mode!=='test'||remote.status!=='canceled')fail('CANCELLATION_NOT_CONFIRMED',409);
    }
    if(order.payment_id){
      const expected={customerId:order.customer_id,dealerId,orderId,totalCents:order.setup_cents};
      const payment=await this.gateway.verifiedPayment(order.payment_id,expected);
      if(payment.payment.mode!=='test'||payment.payment.sequenceType!=='first')fail('PAYMENT_MODE_OR_SEQUENCE_MISMATCH',502);
      if(!['paid','canceled','expired','failed'].includes(payment.status)){
        if(payment.payment.isCancelable!==true)fail('PAYMENT_CANNOT_YET_BE_CANCELED',409);
        await this.operation(`cancel-payment:${orderId}`,{paymentId:order.payment_id},()=>this.gateway.request(`/v2/payments/${order.payment_id}`,{method:'DELETE',operationId:`cancel-payment:${orderId}`}));
        const canceled=await this.gateway.verifiedPayment(order.payment_id,expected);
        if(canceled.payment.mode!=='test'||canceled.status!=='canceled')fail('PAYMENT_CANCELLATION_NOT_CONFIRMED',409);
      }
    }
    this.db.prepare("UPDATE orders SET status='canceled',subscription_status='canceled' WHERE id=?").run(orderId);this.event(orderId,'CANCELLATION_CONFIRMED');return this.order(dealerId,orderId);
  }
  issueLease(dealerId,orderId,installId){
    if(!identifier(installId))fail('INVALID_INSTALL_ID');
    return this.tx(()=>{
      const order=this.owned(dealerId,orderId),now=this.now();
      if(order.status!=='active'||order.subscription_status!=='active'||order.payment_status!=='paid'||order.paid_through<=now||order.verified_at+300000<=now||order.verified_at>now)fail('FRESH_PAID_ENTITLEMENT_REQUIRED',403);
      const old=this.db.prepare('SELECT * FROM device_leases WHERE dealer_id=?').get(dealerId);
      if(old&&old.install_id!==installId&&old.expires>now)fail('ANOTHER_DEVICE_HAS_LEASE',409);
      const leaseId=randomUUID(),expiresAt=Math.min(now+300000,order.paid_through,order.verified_at+300000);
      const token=this.issuer({version:1,dealerId,installId,status:'active',issuedAt:now,expiresAt,newContactCap:20,leaseId});
      if(typeof token!=='string'||token.length>16384||!token.includes('.'))fail('INVALID_ISSUER_RESULT',503);
      this.db.prepare('INSERT INTO device_leases VALUES(?,?,?,?,?) ON CONFLICT(dealer_id) DO UPDATE SET order_id=excluded.order_id,install_id=excluded.install_id,expires=excluded.expires,lease_id=excluded.lease_id').run(dealerId,orderId,installId,expiresAt,leaseId);
      return {token,expiresAt,platformAuthorized:false,testMode:true};
    });
  }
}

async function readBody(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384)fail('BODY_TOO_LARGE',413);chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
export async function startBillingServer({backend,port=0}={}){
  if(!(backend instanceof BillingBackend))fail('BACKEND_REQUIRED');let origin;
  const server=createServer(async(req,res)=>{
    const respond=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
    try{
      if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin)fail('ORIGIN_OR_HOST_REJECTED',403);
      const url=new URL(req.url,origin);if(url.search)fail('QUERY_NOT_SUPPORTED');
      if(req.method==='POST'&&url.pathname==='/webhook'){
        const text=await readBody(req),data=req.headers['content-type']?.startsWith('application/json')?JSON.parse(text):Object.fromEntries(new URLSearchParams(text));
        await backend.reconcilePayment(data.id);return respond(200,{received:true,testMode:true});
      }
      let input;if(req.method==='POST'){if(!req.headers['content-type']?.startsWith('application/json'))fail('JSON_REQUIRED',415);input=JSON.parse(await readBody(req));if(!input||typeof input!=='object'||Array.isArray(input))fail('JSON_OBJECT_REQUIRED');}
      if(req.method==='POST'&&url.pathname==='/login')return respond(200,backend.login(input));
      const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1],dealerId=backend.authenticate(token);
      if(req.method==='POST'&&url.pathname==='/logout'){backend.logout(token);return respond(200,{ok:true});}
      if(req.method==='POST'&&url.pathname==='/orders')return respond(201,backend.createOrder(dealerId,input));
      const route=url.pathname.match(/^\/orders\/([a-zA-Z0-9-]+)(?:\/(checkout|cancel|lease|reconcile|invoices))?$/);
      if(route){const [,orderId,action]=route;
        if(req.method==='GET'&&!action)return respond(200,backend.order(dealerId,orderId));
        if(req.method==='GET'&&action==='invoices')return respond(200,backend.invoices(dealerId,orderId));
        if(req.method==='POST'&&action==='checkout')return respond(200,await backend.checkout(dealerId,orderId));
        if(req.method==='POST'&&action==='cancel')return respond(200,await backend.cancel(dealerId,orderId));
        if(req.method==='POST'&&action==='lease')return respond(200,backend.issueLease(dealerId,orderId,input.installId));
        if(req.method==='POST'&&action==='reconcile'){const order=backend.owned(dealerId,orderId);return respond(200,await backend.reconcilePayment(order.payment_id));}
      }
      fail('NOT_FOUND',404);
    }catch(error){respond(error instanceof BillingError?error.status:503,{error:error instanceof BillingError?error.message:'SERVICE_CHECK_REQUIRED'});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
  return {origin,server,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
