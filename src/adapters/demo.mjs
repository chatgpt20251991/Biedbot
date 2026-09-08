/** Entirely synthetic. No Marktplaats network activity, scraped listings or real sellers. */
const models=[['Volkswagen','Golf',13950],['Audi','A3',15950],['BMW','1 Serie',14950],['Toyota','Yaris',10950],['Volkswagen','Polo',8950],['Audi','A1',11950],['Toyota','Corolla',17950],['BMW','3 Serie',21950]];
export function demoCandidates(count=48){return Array.from({length:count},(_,i)=>{
  const [brand,model,base]=models[i%models.length],ask=base+(i%3)*500;
  return {id:`demo-auto-${i+1}`,sellerId:`fictieve-verkoper-${i+1}`,title:`${brand} ${model} ${2016+i%6} | demonstratie`,
    brand,model,ask,year:2016+i%6,mileage:62000+(i*7193)%115000,distanceKm:12+(i*17)%115,
    sellerType:i%13===12?'business':'private',resaleLow:ask+1400,costs:650,fit:(i%6)/5,
    evidence:'Fictief rekenvoorbeeld, geen echte taxatie',town:['Delft','Rijswijk','Rotterdam','Gouda'][i%4],scenario:i%5};
});}
export class DemoAdapter {
  constructor(store,{replyDelay=1500,now=()=>Date.now()}={}){this.store=store;this.replyDelay=replyDelay;this.now=now;}
  async discover(){return demoCandidates();}
  async health(){return {ok:true,mode:'demo',message:'Geïsoleerde simulatie'};}
  async sync(){return [];}
  async send(o,{beforeDispatch}={}){
    if(beforeDispatch&&beforeDispatch()!==true)return {cancelled:true};
    const c=this.store.candidate(o.conversation),s=o.after_state;let reply=null;
    if(o.action==='OPEN')reply='Onderhoud is bijgehouden, de olie en remmen zijn vervangen. Ik verkoop hem omdat ik een nieuwe auto heb.';
    if(o.action==='ANCHOR'){
      if(c.scenario===0)reply='Is goed, akkoord.';
      else if(c.scenario===1)reply=`Voor EUR ${Math.min(s.ceiling,s.lastOffer+250)} mag hij weg`;
      else if(c.scenario===2)reply=`Mijn prijs is EUR ${c.ask-100}`;
      else if(c.scenario===3)reply='Nee dank je, geen interesse.';
      else reply='Stop met berichten, laat me met rust.';
    }
    if(o.action==='PROBE')reply=`Mijn prijs is EUR ${c.ask-800}`;
    if(o.action==='CONCESSION')reply='Prima, akkoord.';
    // Receipt itself is deterministic for retry diagnostics, not proof of any real delivery.
    if(reply)this.store.ingest(`demo-reply-${o.id}`,o.conversation,reply,this.now()+this.replyDelay);
    return {receipt:`demo-receipt-${o.id}`};
  }
}
