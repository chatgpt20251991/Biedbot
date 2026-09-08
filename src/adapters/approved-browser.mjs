/** Adapter implementation. The shipped release has NO verified live Marktplaats selector contract.
 * Only deterministic local fixture tests are activated. This module does not fake platform permission.
 */
import {CDPBrowser} from './cdp.mjs';
function safeUrl(raw,origin){const u=new URL(raw);if(u.origin!==origin||u.username||u.password)throw new Error('URL buiten toegestane bron.');return u.href;}
// Re-used inside the same browser task as the click: no identity check across an await boundary.
function identityCheck(c,expected){
  const one=(selector,attribute)=>{if(!selector)throw new Error('Identiteitscontract ontbreekt.');const nodes=document.querySelectorAll(selector);if(nodes.length!==1)throw new Error('Identiteitsbewijs ontbreekt of is niet uniek.');const value=attribute?nodes[0].getAttribute(attribute):nodes[0].textContent?.trim();if(!value)throw new Error('Identiteitsbewijs ontbreekt.');return value;};
  const r={origin:location.origin,account:one(c.account),seller:one(c.seller,c.sellerIdAttribute),listing:one(c.listingIdentity,c.listingIdAttribute)};
  if(r.origin!==c.origin||document.querySelector(c.blocked)||r.account!==c.expectedAccount)throw new Error('Account, pagina of platformcontrole wijkt af.');
  if(r.seller!==expected.seller||r.listing!==expected.listing)throw new Error('Verkeerde ontvanger of advertentie.');
  if(expected.chat){r.conversation=one(c.conversationIdentity,c.conversationIdAttribute);if(expected.conversation&&r.conversation!==expected.conversation)throw new Error('Gespreksidentiteit wijkt af.');}
  return r;
}
export class ApprovedBrowserAdapter {
  constructor({store,contract,profileDir,fixtureTest=false,browserPath}){
    this.store=store;this.contract=contract;this.profileDir=profileDir;this.fixtureTest=fixtureTest;this.browserPath=browserPath;
  }
  async health(){
    const c=this.contract;
    if(!c)return {ok:false,message:'Live Marktplaats-koppeling nog niet vrijgegeven; selectorcontract ontbreekt.'};
    const u=new URL(c.origin);
    if(this.fixtureTest&&!(u.hostname==='127.0.0.1'&&u.protocol==='http:'))throw new Error('Fixturemodus is uitsluitend loopback.');
    if(!this.fixtureTest)return {ok:false,message:'Productievrijgave ontbreekt: toestemming, selectorvalidatie en echte Windows-/accounttest vereist.'};
    return {ok:true,mode:'fixture'};
  }
  async init(){const h=await this.health();if(!h.ok)throw new Error(h.message);if(!this.browser)this.browser=await new CDPBrowser().launch({profileDir:this.profileDir,browserPath:this.browserPath,fixtureTest:this.fixtureTest});}
  async guard(){
    const c=this.contract;const r=await this.browser.evaluate(`(()=>{const c=${JSON.stringify(c)};return {origin:location.origin, account:document.querySelector(c.account)?.textContent?.trim(), warning:!!document.querySelector(c.blocked), seller:document.querySelector(c.seller)?.getAttribute(c.sellerIdAttribute)};})()`);
    if(r.origin!==c.origin||r.warning||r.account!==c.expectedAccount)throw new Error('Account, pagina of platformcontrole wijkt af.');
    return r;
  }
  async identity(expected){return this.browser.evaluate(`(${identityCheck.toString()})(${JSON.stringify(this.contract)},${JSON.stringify(expected)})`);}
  async discover(){
    await this.init();const c=this.contract;await this.browser.navigate(safeUrl(c.searchUrl,c.origin));await this.guard();
    const list=await this.browser.evaluate(`(()=>{const c=${JSON.stringify(c)};return [...document.querySelectorAll(c.listing)].map(el=>({
      id:el.getAttribute('data-id'), sellerId:el.getAttribute('data-seller-id'),sellerType:el.getAttribute('data-seller-type'),
      title:el.querySelector(c.title)?.textContent?.trim(),model:el.getAttribute('data-model'),brand:el.getAttribute('data-brand'),
      ask:Number(el.getAttribute('data-price')),year:Number(el.getAttribute('data-year')),mileage:Number(el.getAttribute('data-mileage')),
      distanceKm:Number(el.getAttribute('data-distance')),url:el.querySelector(c.link)?.href, evidence:'Contract-gebonden bron; geen gerealiseerde verkoopprijs'
    }));})()`);
    return list.filter(x=>{try{safeUrl(x.url,c.origin);return x.id&&x.sellerId&&x.title&&x.ask>0;}catch{return false;}});
  }
  async readSnapshot(expected=null){const c=this.contract;const snapshot=await this.browser.evaluate(`(()=>{const c=${JSON.stringify(c)},expected=${JSON.stringify(expected)};
    const identity=expected?(${identityCheck.toString()})(c,expected):null;
    return {identity,url:location.href,messages:[...document.querySelectorAll(c.message)].map(x=>({id:x.getAttribute(c.messageIdAttribute),role:x.getAttribute(c.directionAttribute),text:x.textContent.trim()}))};})()`);
    const ids=new Set();for(const m of snapshot.messages){if(!m.id||ids.has(m.id)||!['seller','assistant'].includes(m.role))throw new Error('Berichtidentiteit of richting ontbreekt of is dubbel.');ids.add(m.id);}return snapshot;}
  async snapshot(expected=null){return (await this.readSnapshot(expected)).messages;}
  async sync(){
    if(!this.browser)return [];
    const conversations=this.store.db.prepare('SELECT id FROM conversations').all();
    for(const {id} of conversations){const url=this.store.getMeta(`conversationUrl:${id}`);if(!url)continue;
      await this.browser.navigate(safeUrl(url,this.contract.origin));const conversation=this.store.getMeta(`conversationIdentity:${id}`);if(!conversation)throw new Error('Gespreksbinding ontbreekt.');
      // The source identity and messages are read in one browser task. A separate
      // guard followed by an awaited snapshot could import another chat's price.
      for(const msg of await this.snapshot({seller:this.store.candidate(id).sellerId,listing:id,chat:true,conversation})){
        if(!msg.id||!['seller','assistant'].includes(msg.role))throw new Error('Berichtidentiteit of richting ontbreekt.');
        if(msg.role==='seller')this.store.ingest(msg.id,id,msg.text);
      }
    }return [];
  }
  async send(o,{beforeDispatch}={}){
    await this.init();const c=this.contract, candidate=this.store.candidate(o.conversation);
    const url=o.action==='OPEN'?candidate.url:this.store.getMeta(`conversationUrl:${o.conversation}`);
    if(!url)throw new Error('Gespreks-URL ontbreekt.');await this.browser.navigate(safeUrl(url,c.origin));
    const expected={seller:candidate.sellerId,listing:o.conversation,chat:o.action!=='OPEN',conversation:this.store.getMeta(`conversationIdentity:${o.conversation}`)};
    if(expected.chat&&!expected.conversation)throw new Error('Gespreksbinding ontbreekt.');
    await this.identity(expected);
    if(o.action==='OPEN'){
      await this.browser.evaluate(`(()=>{(${identityCheck.toString()})(${JSON.stringify(c)},${JSON.stringify(expected)});const list=document.querySelectorAll(${JSON.stringify(c.openChat)});if(list.length!==1)throw new Error('Chatknop niet uniek');list[0].click();})()`);
    }
    await this.browser.waitFor(`document.querySelectorAll(${JSON.stringify(c.input)}).length===1`);
    const beforeSnapshot=await this.readSnapshot({...expected,chat:true}),opened=beforeSnapshot.identity;
    expected.chat=true;expected.conversation=opened.conversation;
    const before=beforeSnapshot.messages;
    if(before.some(m=>m.role==='assistant'&&m.text===o.text))throw new Error('Identiek eerder bericht gevonden: eerst reconciliëren.');
    if(o.input_id){
      const source=this.store.db?.prepare('SELECT conversation,text FROM inbox WHERE id=?').get(o.input_id);
      if(!source||source.conversation!==o.conversation||!before.some(m=>m.id===o.input_id&&m.role==='seller'&&m.text===source.text))throw new Error('Bronbericht ontbreekt of is gewijzigd; eerst opnieuw beoordelen.');
    }
    for(const m of before)if(m.role==='seller')this.store.ingest(m.id,o.conversation,m.text);
    const authorize=beforeDispatch|| (this.store.authorizeDispatch?()=>this.store.authorizeDispatch(o.id):()=>true);
    if(authorize()!==true)throw new Error('Verzending ingetrokken na nieuwste input of quotacontrole; autorisatie moet synchroon zijn.');
    await this.browser.evaluate(`(()=>{const c=${JSON.stringify(c)},text=${JSON.stringify(o.text)};
      const guard=()=>(${identityCheck.toString()})(c,${JSON.stringify(expected)});guard();
      const inputs=document.querySelectorAll(c.input),buttons=document.querySelectorAll(c.send);
      if(inputs.length!==1||buttons.length!==1||buttons[0].disabled)throw new Error('Verzendformulier wijkt af');
      const el=inputs[0];const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
      if(!(el instanceof HTMLTextAreaElement)||!setter)throw new Error('Onbekend invoerveld');
      setter.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));if(el.value!==text)throw new Error('Tekst wijkt af');guard();
      const current=[...document.querySelectorAll(c.message)].map(x=>({id:x.getAttribute(c.messageIdAttribute),role:x.getAttribute(c.directionAttribute),text:x.textContent.trim()}));
      if(JSON.stringify(current)!==${JSON.stringify(JSON.stringify(before))})throw new Error('Gesprek veranderde vlak voor verzenden.');buttons[0].click();
    })()`);
    const ids=before.map(x=>x.id);
    await this.browser.waitFor(`(()=>{const c=${JSON.stringify(c)},ids=${JSON.stringify(ids)};return [...document.querySelectorAll(c.message)].some(x=>x.getAttribute(c.directionAttribute)==='assistant'&&!ids.includes(x.getAttribute(c.messageIdAttribute))&&x.textContent.trim()===${JSON.stringify(o.text)});})()`);
    const confirmed=await this.readSnapshot(expected);
    const receipts=confirmed.messages.filter(x=>x.role==='assistant'&&!ids.includes(x.id)&&x.text===o.text),receipt=receipts[0];
    if(receipts.length!==1)throw new Error('Ontvangstbewijs ontbreekt of is niet uniek.');
    if(!receipt?.id)throw new Error('Geen nieuwe, identificeerbare verzendbevestiging.');
    this.store.setMeta(`conversationUrl:${o.conversation}`,safeUrl(confirmed.url,c.origin));this.store.setMeta(`conversationIdentity:${o.conversation}`,expected.conversation);
    return {receipt:receipt.id,evidence:{...confirmed.identity,messageIds:ids,sourceInput:o.input_id||null,receipt:receipt.id}};
  }
  async close(){await this.browser?.close();}
}
