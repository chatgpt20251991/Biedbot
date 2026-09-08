/** Adapted from BIEDBOT_GESPREKSLOGICA.md section 0B, not legacy prompts.js.
 * Money is integer EUR. Decisions are structured and persisted only after send confirmation.
 * Deliberate source bug fixes are documented in docs/GESPREKSLOGICA_MAPPING.md.
 */
export const TERMINAL = new Set(['HOT_LEAD','DECLINED','SUPPRESSED','REVIEW','PURCHASED','LOST']);
export function plafondPct(ask) { return ask <= 7500 ? 80 : ask <= 15000 ? 84 : ask <= 30000 ? 88 : 91; }
function amount(n) { if (!Number.isSafeInteger(n) || n < 1 || n > 10000000) throw new Error('Ongeldig bedrag.'); return n; }
export function berekenAnker(ask, discount) {
  amount(ask);
  if (!Number.isFinite(discount) || discount < 8 || discount > 60) throw new Error('Korting buiten grenzen.');
  return Math.round(ask * (100 - discount) / 100 / 50) * 50;
}
export function calculateLimits(ask, discount, limits = {}) {
  const anchor = berekenAnker(ask, discount);
  // The source Math.max(anchor, …) could exceed 92% with an invalid/rounded anchor.
  const ceiling = Math.min(Math.floor(ask * plafondPct(ask) / 100), Math.floor(ask * .92),
    limits.dealerMax ?? Infinity, limits.marginMax ?? Infinity, limits.budgetAvailable ?? Infinity);
  if (!Number.isSafeInteger(ceiling) || ceiling < 1) throw new Error('Geen inkoopruimte.');
  return {anchor: Math.min(anchor, ceiling), ceiling};
}
export function volgendeConcessie(anchor, ceiling, count, previous = anchor) {
  const raw = anchor + Math.round((ceiling-anchor)*(1-Math.pow(.5, count+1)));
  let n = Math.round(raw/10)*10;
  if (n%100===0) n-=40;
  return Math.min(ceiling, Math.max(previous, anchor, n));
}
export function initialState(ask, discount, limits = {}) {
  return {phase:'NEW', ...calculateLimits(ask,discount,limits), lastOffer:null, peilingen:0, concessies:0,
    lastSellerPrice:null, agreedPrice:null, clarificationCount:0};
}
export function euro(n) { return new Intl.NumberFormat('nl-NL', {maximumFractionDigits:0}).format(n); }

/** Conservative financial extraction: years, km, phone numbers and reference numbers are not bids. */
export function extractPrices(text) {
  if (typeof text !== 'string' || text.length > 10000) return [];
  const cleaned = text.replace(/(?:\+31|0031|\b06)[\d ()-]{7,18}/g,' ').replace(/\b\d[\d., ]*\s*(?:km|kilometer|pk|cc)\b/gi,' ');
  const result=[];
  const re=/(?:€\s*|\bEUR\s*)(\d{1,3}(?:[. ]\d{3})+(?:,\d{2})?|\d{1,6}(?:[,.]\d{1,2})?)\b|\b(\d{1,3}(?:[. ]\d{3})+(?:,\d{2})?|\d{1,6}(?:,\d{1,2})?)\s*(?:euro|eur)\b/gi;
  for (const m of cleaned.matchAll(re)) {
    let raw = (m[1]||m[2]).replace(/\s/g,'');
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/.test(raw)) raw=raw.replace(/\./g,'');
    const n=Number(raw.replace(',','.'));
    if (Number.isSafeInteger(n) && n>=100 && n<=200000) result.push(n);
  }
  // Bare exact prices or explicit price context, not arbitrary numbers in long descriptions.
  const plain = cleaned.trim().replace(/[.!]$/,'');
  const match = plain.match(/^(?:(?:voor|minimaal|vraagprijs(?: is)?|mijn prijs(?: is)?|ik wil|ik vraag|ik dacht aan|voor jou)\s+)?(\d{4,6}|\d{1,3}(?:\.\d{3})+)$/i)
    || cleaned.match(/\b(?:voor|minimaal|vraagprijs(?: is)?|mijn prijs(?: is)?|ik wil|ik vraag)\s+(\d{4,6}|\d{1,3}(?:\.\d{3})+)\b/i);
  if (match) {
    const n=Number(match[1].replace(/\./g,''));
    if(n>=1000 && n<=200000 && !(n>=1900 && n<=2099)) result.push(n);
  }
  return [...new Set(result)];
}
const OPT_OUT = /\b(stop(?:pen)?\s+(?:met\s+)?(?:berichten|appen)|niet meer (?:berichten|appen|sturen|benaderen)|verwijder (?:mijn|me)|geen berichten|laat me (?:met rust|gerust))\b/i;
const INJECTION = /(?:ignore|negeer|vergeet).{0,50}(?:instruct|prompt|regels|plafond)|\bsystem\s*:|\bdeveloper\s*:|api[- ]?key|<\/?(?:system|assistant)>/i;
export function classifyLocal(text, state={}) {
  if(typeof text!=='string' || text.length>6000) return {kind:'UNKNOWN', confidence:0};
  if(OPT_OUT.test(text)) return {kind:'OPT_OUT',confidence:1};
  if(INJECTION.test(text)) return {kind:'UNKNOWN', confidence:0, reason:'Onbetrouwbare opdracht in verkopertekst'};
  if(/\b(?:al verkocht|is verkocht|heb (?:hem|de auto) verkocht)\b/i.test(text)) return {kind:'SOLD',confidence:1};
  if(/\b(?:aanbetaling|betaallink|cadeaukaart|bitcoin|escrow|western union)\b|https?:\/\//i.test(text)) return {kind:'RISK',confidence:1};
  if(/\b(?:nee dank|geen interesse|niet ge[iï]nteresseerd|laat maar)\b/i.test(text)) return {kind:'REFUSE',confidence:.99};
  if(/\b(?:schade|motor kapot|defect|olieverbruik|total loss)\b/i.test(text) && !/\b(?:geen|zonder)\s+(?:schade|defect|olieverbruik)\b/i.test(text)) return {kind:'RISK',confidence:.9};
  if(/(?:ander|eerder|iemand).{0,20}(?:bod|biedt)|\bal (?:een )?bod\b/i.test(text)) return {kind:'FIRM',confidence:.97};
  const prices=extractPrices(text);
  if(prices.length>1) return {kind:'UNKNOWN',confidence:.4,reason:'Meerdere bedragen'};
  if(prices.length===1) {
    if(/\b(?:niet|geen)\b/i.test(text) || /\?|\b(?:als|mits|aanbetaling|inruil)\b/i.test(text)) return {kind:'UNKNOWN',confidence:.4,reason:'Voorwaardelijk of betwist bedrag'};
    return {kind:'PRICE',price:prices[0],confidence:.99,evidence:text};
  }
  if(/\b(?:niet\b.{0,25}\bakkoord|niet goed|geen deal|geen akkoord|nee|nog niet|weet niet)\b/i.test(text)) return {kind:'FIRM',confidence:.95};
  if(/\b(?:als|mits|maar|tenzij|misschien|eventueel)\b/i.test(text)) return {kind:'UNKNOWN',confidence:.4};
  // An invitation or question alone is NOT an agreement.
  if(/^(?:(?:ok[eé]?|ja)[ ,.!]*)?(?:dat is goed|is goed|akkoord|afgesproken|deal|prima)(?=$|[,.!?]|\s+(?:wanneer|dan|je|u|op|met)\b)/i.test(text.trim())) return {kind:'ACCEPT',confidence:.98};
  if(/\?|\b(?:waarom|wanneer|ben je|bent u|handelaar|hoezo)\b/i.test(text)) return {kind:'QUESTION',confidence:.9,
    topic:/\b(?:handelaar|autobedrijf|particulier|zakelijk)\b/i.test(text)?'identity':/\b(?:bot|ai|automaat)\b/i.test(text)?'automation':'other'};
  if(/\b(?:prijs is vast|vaste prijs|niet lager|hou vast|houd vast|te laag)\b/i.test(text)) return {kind:'FIRM',confidence:.95};
  if(/\b(?:onderhoud|onderhouden|facturen|olie|beurt|verkoop|nieuwe auto|bonnen|distributie|boekje)\b/i.test(text)) return {kind:'INFO',confidence:.9};
  return {kind:'UNKNOWN',confidence:.2};
}
export function validateClassification(value, text) {
  const local=classifyLocal(text);
  if(['OPT_OUT','SOLD','RISK','REFUSE'].includes(local.kind) || INJECTION.test(text)) return local;
  const kinds=['ACCEPT','PRICE','FIRM','QUESTION','INFO','UNKNOWN'];
  if(!value || !kinds.includes(value.kind) || !Number.isFinite(value.confidence) || value.confidence<.9) return {kind:'UNKNOWN',confidence:0};
  if(value.kind==='PRICE') {
    if(local.kind!=='PRICE') return {kind:'UNKNOWN',confidence:0};
    if(extractPrices(text).length!==1 || !extractPrices(text).includes(value.price)) return {kind:'UNKNOWN',confidence:0};
    if(typeof value.evidence!=='string' || !text.includes(value.evidence)) return {kind:'UNKNOWN',confidence:0};
    if(/\b(?:niet|geen|als|mits|inruil)\b/i.test(text)||text.includes('?')) return {kind:'UNKNOWN',confidence:0};
  }
  if(value.kind==='ACCEPT' && local.kind!=='ACCEPT') return {kind:'UNKNOWN',confidence:0};
  return {kind:value.kind, confidence:value.confidence, ...(value.kind==='PRICE'?{price:value.price}:{}),
    ...(value.kind==='QUESTION'?{topic:local.topic||'other'}:{})};
}
export function decide(state, c) {
  const s=structuredClone(state);
  const out=(action, changes={}, price=null, reason='')=>({action, price, state:{...s,...changes},reason});
  if(TERMINAL.has(s.phase)) return out('NONE');
  if(!c||!Number.isFinite(c.confidence)||!['OPT_OUT','SOLD','REFUSE','RISK','UNKNOWN','QUESTION','ACCEPT','PRICE','FIRM','INFO'].includes(c.kind))c={kind:'UNKNOWN',confidence:0};
  if(c.kind==='OPT_OUT') return out('SILENT_STOP',{phase:'SUPPRESSED'},null,'Verkoper wil niet meer worden benaderd');
  if(c.kind==='SOLD') return out('SILENT_STOP',{phase:'DECLINED'},null,'Voertuig verkocht');
  if(c.kind==='REFUSE') return out('DECLINE',{phase:'DECLINED'});
  if(c.kind==='RISK') return out('REVIEW',{phase:'REVIEW'},null,'Risico of betalingsverzoek: geen automatische toezegging');
  if(c.kind==='UNKNOWN' || c.confidence<.9) {
    if(s.clarificationCount>=1) return out('REVIEW',{phase:'REVIEW'},null,'Betekenis blijft onzeker');
    return out('CLARIFY',{clarificationCount:s.clarificationCount+1});
  }
  if(c.kind==='QUESTION') {
    if(c.topic==='identity') return out('IDENTITY');
    if(c.topic==='automation') return out('AUTOMATION');
    return out('REVIEW',{phase:'REVIEW'},null,'Vraag vereist een feit dat niet geverifieerd is');
  }
  if(c.kind==='ACCEPT') {
    if(s.lastOffer===null) return out('CLARIFY',{clarificationCount:s.clarificationCount+1},null,'Nog geen prijs aangeboden');
    return out('ACCEPT',{phase:'HOT_LEAD',agreedPrice:s.lastOffer},s.lastOffer);
  }
  if(c.kind==='PRICE' && (!Number.isSafeInteger(c.price)||c.price<100||c.price>200000)) return out('REVIEW',{phase:'REVIEW'},null,'Ongeldig verkopersbedrag');
  // A seller may offer below our anchor; never raise their price on their behalf.
  if(c.kind==='PRICE' && c.price<=s.ceiling) return out('ACCEPT',{phase:'HOT_LEAD',agreedPrice:c.price,lastSellerPrice:c.price},c.price);
  if(s.lastOffer===null) return out('ANCHOR',{phase:'NEGOTIATING',lastOffer:s.anchor,lastSellerPrice:c.kind==='PRICE'?c.price:s.lastSellerPrice},s.anchor);
  if(c.kind==='PRICE') {
    // Repeated or increasing demand is not movement. Avoid one-sided automatic bidding.
    if(s.lastSellerPrice!==null && c.price>=s.lastSellerPrice) {
      if(s.peilingen>=2) return out('DECLINE',{phase:'DECLINED'});
      return out('PROBE',{peilingen:s.peilingen+1});
    }
    if(s.concessies>=3) return out('DECLINE',{phase:'DECLINED'});
    const bid=volgendeConcessie(s.anchor,s.ceiling,s.concessies,s.lastOffer);
    if(bid<=s.lastOffer) return out('DECLINE',{phase:'DECLINED'});
    return out('CONCESSION',{lastOffer:bid,lastSellerPrice:c.price,concessies:s.concessies+1},bid);
  }
  if(s.peilingen>=2) return out('DECLINE',{phase:'DECLINED'});
  return out('PROBE',{peilingen:s.peilingen+1});
}
export function opening(candidate, settings) {
  // No invented research, purchase plans, personal identity or sale prices.
  return `Ik bekijk je ${candidate.model || 'auto'} voor de inkoop van ${settings.company}. Kun je iets vertellen over het onderhoud en recent vervangen onderdelen? Wat is de reden van verkoop?\n\n${settings.signoff}`;
}
export function renderDecision(d, settings) {
  const p=d.price===null?'':euro(d.price);
  const messages={
    ANCHOR:`Dank voor de toelichting. Mijn inkoopbod is EUR ${p}, onder voorbehoud van bezichtiging en controle van de auto. Hoe kijk je daartegenaan?`,
    CONCESSION:`Ik kan je tegemoetkomen tot EUR ${p}, onder voorbehoud van bezichtiging en controle van de auto. Verder wil ik niet vooruitlopen op de controle.`,
    PROBE:'Begrijp ik. Wat is je scherpste prijs waarvoor je de auto zou verkopen?',
    ACCEPT:`Top, dan houden we EUR ${p} aan, onder voorbehoud van bezichtiging en controle van de auto. Wanneer schikt het bij jou? Mijn collega neemt de verdere afstemming over.`,
    DECLINE:d.state.peilingen>0?'Helder, dan komen we er deze keer niet uit. Bedankt voor je reactie en succes met de verkoop.':'Helder, bedankt voor je reactie en succes met de verkoop.',
    CLARIFY:'Ik wil je goed begrijpen. Welk bedrag heb je concreet in gedachten voor de auto?',
    IDENTITY:`Dit is de inkoopassistent van ${settings.company}. Wij kopen zakelijk in.`,
    AUTOMATION:`Je spreekt met de digitale inkoopassistent van ${settings.company}. Mijn collega neemt het over zodra we een prijs voor bezichtiging hebben afgesproken.`
  };
  if(['NONE','REVIEW','SILENT_STOP'].includes(d.action)) return null;
  if(!Object.hasOwn(messages,d.action)) throw new Error('Onbekende onderhandelactie.');
  const text=messages[d.action]+`\n\n${settings.signoff}`;
  assertOutbound(text,d);
  return text;
}
export function assertOutbound(text,d) {
  if(typeof text!=='string'||text.length>1000||/[\u2013\u2014*<>\[\]]/.test(text)||/\b(?:cash|contant|spoed)\b/i.test(text)) throw new Error('Bericht voldoet niet aan stijlregels.');
  if(d.price!==null && (d.price>d.state.ceiling||d.price<1)) throw new Error('Prijsplafond overschreden.');
  const nums=extractPrices(text);
  if(d.price!==null && (nums.length!==1||nums[0]!==d.price)) throw new Error('Financiële tekst wijkt af van besluit.');
  if(d.price===null && nums.length) throw new Error('Onverwacht bedrag in bericht.');
  return true;
}
export function scoreCandidate(c,s) {
  const reasons=[];
  if(c.sellerType!=='private') reasons.push('Particulier niet bevestigd');
  if(!Number.isSafeInteger(c.ask)||c.ask<s.minPrice||c.ask>s.maxPrice) reasons.push('Buiten prijsrange');
  if(!Number.isInteger(c.year)||c.year<s.minYear) reasons.push('Bouwjaar ontbreekt of te oud');
  if(!Number.isInteger(c.mileage)||c.mileage<0||c.mileage>s.maxMileage) reasons.push('Kilometerstand ontbreekt of te hoog');
  if(!Number.isFinite(c.distanceKm)||c.distanceKm<0||c.distanceKm>s.radiusKm) reasons.push('Afstand ontbreekt of te groot');
  if(s.brands.length&&!s.brands.some(b=>b.toLowerCase()===String(c.brand).toLowerCase())) reasons.push('Merk past niet');
  let lim;
  try {
    const marginMax=Number.isFinite(c.resaleLow)&&Number.isFinite(c.costs)?Math.floor(c.resaleLow-c.costs-s.riskReserve-s.minMargin):undefined;
    if(s.requireMarginEvidence && marginMax===undefined) reasons.push('Geen margeonderbouwing');
    lim=calculateLimits(c.ask,s.discountPct,{marginMax});
  } catch {reasons.push('Geen financieel geldig bod');lim={anchor:0,ceiling:0};}
  const estimate=Number.isFinite(c.resaleLow)&&Number.isFinite(c.costs)?c.resaleLow-c.costs-s.riskReserve-lim.ceiling:null;
  // Heuristic rank, NOT a calibrated conversion probability.
  const score=Math.round(Math.max(0,Math.min(100, 45 + (Number.isFinite(c.fit)?Math.max(0,Math.min(1,c.fit)):.5)*20 + (Number.isFinite(c.distanceKm)?Math.max(0,1-c.distanceKm/Math.max(1,s.radiusKm)):0)*15 + (estimate===null?0:Math.min(20,estimate/150)))));
  return {eligible:reasons.length===0, reasons, score, estimate, ...lim};
}
