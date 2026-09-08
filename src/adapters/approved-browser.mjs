/** Adapter implementation. The shipped release has NO verified live Marktplaats selector contract.
 * Only deterministic local fixture tests are activated. This module does not fake platform permission.
 */
import {CDPBrowser} from './cdp.mjs';
function safeUrl(raw,origin){const u=new URL(raw);if(u.origin!==origin||u.username||u.password)throw new Error('URL buiten toegestane bron.');return u.href;}
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
  async snapshot(){const c=this.contract;return this.browser.evaluate(`(()=>{const c=${JSON.stringify(c)};return [...document.querySelectorAll(c.message)].map(x=>({id:x.getAttribute(c.messageIdAttribute),role:x.getAttribute(c.directionAttribute),text:x.textContent.trim()}));})()`);}
  async sync(){
    if(!this.browser)return [];
    const conversations=this.store.db.prepare('SELECT id FROM conversations').all();
    for(const {id} of conversations){const url=this.store.getMeta(`conversationUrl:${id}`);if(!url)continue;
      await this.browser.navigate(safeUrl(url,this.contract.origin));const guard=await this.guard();
      if(guard.seller!==this.store.candidate(id).sellerId)throw new Error('Verkoper verschilt van de gesprekseigenaar.');
      for(const msg of await this.snapshot()){
        if(!msg.id||!['seller','assistant'].includes(msg.role))throw new Error('Berichtidentiteit of richting ontbreekt.');
        if(msg.role==='seller')this.store.ingest(msg.id,id,msg.text);
      }
    }return [];
  }
  async send(o){
    await this.init();const c=this.contract, candidate=this.store.candidate(o.conversation);
    const url=o.action==='OPEN'?candidate.url:this.store.getMeta(`conversationUrl:${o.conversation}`);
    if(!url)throw new Error('Gespreks-URL ontbreekt.');await this.browser.navigate(safeUrl(url,c.origin));
    const guard=await this.guard();if(guard.seller!==candidate.sellerId)throw new Error('Verkeerde ontvanger.');
    if(o.action==='OPEN'){
      await this.browser.evaluate(`(()=>{const list=document.querySelectorAll(${JSON.stringify(c.openChat)});if(list.length!==1)throw new Error('Chatknop niet uniek');list[0].click();})()`);
    }
    await this.browser.waitFor(`document.querySelectorAll(${JSON.stringify(c.input)}).length===1`);
    await this.guard();const before=await this.snapshot();
    if(before.some(m=>m.role==='assistant'&&m.text===o.text))throw new Error('Identiek eerder bericht gevonden: eerst reconciliëren.');
    await this.browser.evaluate(`(()=>{const c=${JSON.stringify(c)},text=${JSON.stringify(o.text)};
      const inputs=document.querySelectorAll(c.input),buttons=document.querySelectorAll(c.send);
      if(inputs.length!==1||buttons.length!==1||buttons[0].disabled)throw new Error('Verzendformulier wijkt af');
      const el=inputs[0];const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
      if(!(el instanceof HTMLTextAreaElement)||!setter)throw new Error('Onbekend invoerveld');
      setter.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));if(el.value!==text)throw new Error('Tekst wijkt af');buttons[0].click();
    })()`);
    const ids=before.map(x=>x.id);
    await this.browser.waitFor(`(()=>{const c=${JSON.stringify(c)},ids=${JSON.stringify(ids)};return [...document.querySelectorAll(c.message)].some(x=>x.getAttribute(c.directionAttribute)==='assistant'&&!ids.includes(x.getAttribute(c.messageIdAttribute))&&x.textContent.trim()===${JSON.stringify(o.text)});})()`);
    const receipt=(await this.snapshot()).find(x=>x.role==='assistant'&&!ids.includes(x.id)&&x.text===o.text);
    if(!receipt?.id)throw new Error('Geen nieuwe, identificeerbare verzendbevestiging.');
    const conversationUrl=await this.browser.evaluate('location.href');this.store.setMeta(`conversationUrl:${o.conversation}`,safeUrl(conversationUrl,c.origin));
    return {receipt:receipt.id};
  }
  async close(){await this.browser?.close();}
}
