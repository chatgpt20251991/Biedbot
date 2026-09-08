/** Server-side component, not activated in the downloadable dealer application.
 * Publisher API keys and signing keys must NEVER be put in a dealer installer.
 * All side effects below need an explicitly configured customer, price and consent.
 */
import {createHash} from 'node:crypto';
const id=(s,prefix)=>{if(typeof s!=='string'||!new RegExp('^'+prefix+'_[a-zA-Z0-9]{3,80}$').test(s))throw new Error('Ongeldig provider-ID.');return s;};
const cents=n=>{if(!Number.isSafeInteger(n)||n<1||n>10000000)throw new Error('Ongeldig bedrag in centen.');return(n/100).toFixed(2);};
function https(s){const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||['localhost','127.0.0.1','::1'].includes(u.hostname))throw new Error('Publieke HTTPS-URL vereist.');return u.href;}
export class MollieGateway {
  #key;
  get mode(){return this.#key.startsWith('test_')?'test':'live';}
  constructor({apiKey,fetchFn=fetch,enableLive=false}={}){if(typeof apiKey!=='string'||! /^(test|live)_[a-zA-Z0-9]+$/.test(apiKey))throw new Error('Mollie-sleutel ontbreekt.');if(apiKey.startsWith('live_')&&!enableLive)throw new Error('Live betalen staat uit.');this.#key=apiKey;this.fetch=fetchFn;}
  async request(path,{method='GET',body,operationId}={}){
    if(!/^\/v2\/[a-zA-Z0-9_/-]+$/.test(path))throw new Error('Ongeldig API-pad.');
    if(method!=='GET'&&(!operationId||typeof operationId!=='string'||operationId.length>200))throw new Error('Idempotente operatie-ID vereist.');
    const r=await this.fetch('https://api.mollie.com'+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+this.#key,'Content-Type':'application/json',...(operationId?{'Idempotency-Key':createHash('sha256').update(operationId).digest('hex')}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok)throw new Error(`Mollie HTTP ${r.status}; status ophalen voordat je een betalingsactie herhaalt.`);
    if(r.status===204)return {ok:true};return r.json();
  }
  async createCustomer({company,email,orderId}){if(typeof company!=='string'||company.length<2||company.length>100||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email))throw new Error('Bedrijfsnaam en e-mail vereist.');return this.request('/v2/customers',{method:'POST',operationId:'customer:'+orderId,body:{name:company,email}});}
  async firstPayment({customerId,dealerId,orderId,totalCents,redirectUrl,webhookUrl,description,recurringConsent,taxReviewed}){
    id(customerId,'cst');if(recurringConsent!==true||taxReviewed!==true)throw new Error('Abonnementsvoorwaarden, toestemming en bedrag inclusief juiste belastingen eerst vastleggen.');
    if(!dealerId||!orderId||typeof description!=='string'||!description||description.length>255)throw new Error('Onvolledige bestelling.');
    return this.request('/v2/payments',{method:'POST',operationId:'first:'+orderId,body:{customerId,sequenceType:'first',amount:{currency:'EUR',value:cents(totalCents)},description,redirectUrl:https(redirectUrl),webhookUrl:https(webhookUrl),metadata:{dealerId,orderId}}});
  }
  /** A webhook/redirect does not prove payment. Always re-fetch and match your saved order. */
  async verifiedPayment(paymentId,expected){const p=await this.request('/v2/payments/'+id(paymentId,'tr'));
    if(p.id!==paymentId||p.customerId!==expected.customerId||p.metadata?.dealerId!==expected.dealerId||p.metadata?.orderId!==expected.orderId||p.amount?.currency!=='EUR'||p.amount?.value!==cents(expected.totalCents))throw new Error('Betaling komt niet overeen met de opgeslagen bestelling.');
    if(['hasChargebacks','hasRefunds'].some(key=>p[key]!==undefined&&typeof p[key]!=='boolean'))throw new Error('Ongeldige terugboekingsinformatie.');
    const reversal=[p.amountRefunded,p.amountChargedBack].some(a=>{if(!a)return false;if(a.currency!=='EUR'||typeof a.value!=='string'||!/^\d+\.\d{2}$/.test(a.value))throw new Error('Ongeldige terugboekingsinformatie.');return Number(a.value)>0;});
    return {paid:p.status==='paid'&&!p.hasChargebacks&&!p.hasRefunds&&!reversal,status:p.status,payment:p};
  }
  async subscribe({customerId,mandateId,monthlyTotalCents,startDate,webhookUrl,orderId,description}){
    id(customerId,'cst');id(mandateId,'mdt');if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||Number.isNaN(Date.parse(startDate))||new Date(startDate).toISOString().slice(0,10)!==startDate)throw new Error('Geldige afgesproken abonnementsstart vereist.');
    if(typeof description!=='string'||!description||description.length>255)throw new Error('Omschrijving vereist.');
    const mandate=await this.request(`/v2/customers/${customerId}/mandates/${mandateId}`);if(mandate.status!=='valid'||mandate.id!==mandateId)throw new Error('Geldige machtiging vereist.');
    return this.request(`/v2/customers/${customerId}/subscriptions`,{method:'POST',operationId:'subscription:'+orderId,body:{amount:{currency:'EUR',value:cents(monthlyTotalCents)},interval:'1 month',startDate,description,mandateId,webhookUrl:https(webhookUrl)}});
  }
  cancel({customerId,subscriptionId,operationId}){return this.request(`/v2/customers/${id(customerId,'cst')}/subscriptions/${id(subscriptionId,'sub')}`,{method:'DELETE',operationId});}
}
