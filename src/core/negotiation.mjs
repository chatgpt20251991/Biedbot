/** Adapted from BIEDBOT_GESPREKSLOGICA.md section 0B, not legacy prompts.js.
 * Money is integer EUR. Decisions are structured and persisted only after send confirmation.
 * Deliberate source bug fixes are documented in docs/GESPREKSLOGICA_MAPPING.md.
 */
import {buildVoiceContext, fallbackTemplate, finishText} from './voice.mjs';

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
    lastSellerPrice:ask, agreedPrice:null, clarificationCount:0};
}
export function euro(n) { return new Intl.NumberFormat('nl-NL', {maximumFractionDigits:0}).format(n); }

/** Recognises a complete seller offer, never an amount inside a repair bill,
 * quote, question, condition or third-party bid. K notation needs an explicit k. */
const PRICE_VALUE=String.raw`(?:(?:€|eur)\s*)?(?:\d{1,3}(?:[. ]\d{3})+|\d{3,6}|\d{1,3}(?:[,.]\d{1,2})?\s*k)(?:,00)?(?:\s*(?:euro|eur))?`;
const PRICE_START=String.raw`(?:(?:voor(?: jou)?|minimaal|vraagprijs(?: is)?|mijn (?:minimum)?prijs(?: is)?|ik wil(?: er)?(?: minimaal)?|ik vraag(?: er)?|ik dacht aan)\s+)?`;
const PRICE_END=String.raw`(?:\s+(?:mag (?:hij|hem|de auto) weg|mag (?:je|u) (?:hem|'m|de auto) (?:ophalen|halen|meenemen)|is (?:hij|hem|de auto) van (?:jou|u)|voor (?:hebben|krijgen)|is mijn (?:minimumprijs|prijs)))?`;
const WHOLE_PRICE=new RegExp(`^${PRICE_START}(${PRICE_VALUE})${PRICE_END}[.!]*$`,'i');
function wholeSellerPrice(text) {
  const match=String(text).normalize('NFKC').trim().match(WHOLE_PRICE);
  if(!match)return null;
  const original=match[1];let raw=original.replace(/eur(?:o)?|€/gi,'').replace(/\s/g,'');
  let value;
  if(/k$/i.test(raw))value=Number(raw.slice(0,-1).replace(',','.'))*1000;
  else value=Number(raw.replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));
  if(!Number.isSafeInteger(value)||value<100||value>200000)return null;
  if(value>=1900&&value<=2099&&!/€|eur/i.test(original))return null;
  return value;
}

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
  const whole=wholeSellerPrice(text);if(whole!==null)result.push(whole);
  return [...new Set(result)];
}
const OPT_OUT = /\b(stop(?:pen)?\s+(?:met\s+)?(?:berichten|appen)|niet meer (?:berichten|appen|sturen|benaderen|benaderd worden|gecontacteerd worden)|verwijder (?:mijn|me)|geen berichten|laat me (?:met rust|gerust)|hou op met (?:appen|berichten)|val me niet lastig|rot op)\b/i;
const INJECTION = /(?:ignore|negeer|vergeet).{0,50}(?:instruct|prompt|regels|plafond)|\bsystem\s*:|\bdeveloper\s*:|api[- ]?key|<\/?(?:system|assistant)>/i;
// Match the complete affirmative clause and only a bounded scheduling continuation.
// A question mark on the agreement itself, qualifications and arbitrary trailing text
// must never become a purchase commitment. Unknown formulations go to clarification.
const MONEY_TEXT=String.raw`(?:(?:€|eur)\s*)?(?:\d{1,3}(?:[. ]\d{3})+|\d{3,6})(?:,00)?(?:\s*(?:euro|eur))?`;
const AGREEMENT=String.raw`(?:(?:ok[eé]?|ja)[ ,!]*)?(?:dat is goed|is goed|akkoord|afgesproken|deal|prima|ik ga akkoord)(?:\s+met\s+(?:je|jouw|uw|het)\s+(?:laatste\s+)?(?:bod|voorstel)|\s+(?:met|voor)\s+${MONEY_TEXT})?`;
const VISIT=String.raw`(?:komen(?: kijken)?|langskomen|(?:de auto )?(?:ophalen|bekijken))`;
const DAY=String.raw`(?:vandaag|morgen|overmorgen|(?:aanstaande )?(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)(?:ochtend|middag|avond)?)`;
const PLANNING=String.raw`(?:(?:wanneer|hoe laat) (?:(?:(?:kun|kan) je|kunt u|kan u|kunnen (?:we|jullie)) ${VISIT}|kom je|komt u|schikt het(?: (?:bij|voor))? (?:jou|u))|(?:(?:kun|kan) je|kunt u|kan u|je kunt|u kunt)(?: ${DAY})? ${VISIT})[?!.]*`;
const AFFIRMATIVE=new RegExp(String.raw`^${AGREEMENT}(?:\s*[,!.]\s*${AGREEMENT})?(?:(?:\s*[,!.]\s*|\s+)${PLANNING})?[.!]*$`,'i');
const SELLER_PRICE=new RegExp(String.raw`^(?:(?:voor(?: jou)?|minimaal|vraagprijs(?: is)?|mijn prijs(?: is)?|ik wil(?: minimaal)?|ik vraag|ik dacht aan)\s+)?${MONEY_TEXT}(?:\s+(?:mag (?:hij|de auto) weg|is (?:hij|de auto) van (?:jou|u)))?[.!]*$`,'i');
export function classifyLocal(text, state={}) {
  if(typeof text!=='string' || text.length>6000) return {kind:'UNKNOWN', confidence:0};
  text=text.normalize('NFKC').trim().replace(/\s+/g,' ');
  if(OPT_OUT.test(text)) return {kind:'OPT_OUT',confidence:1};
  if(INJECTION.test(text)) return {kind:'UNKNOWN', confidence:0, reason:'Onbetrouwbare opdracht in verkopertekst'};
  if(/\b(?:al verkocht|is verkocht|heb (?:hem|de auto) verkocht)\b/i.test(text)) return {kind:'SOLD',confidence:1};
  if(/\b(?:aanbetaling|betaallink|cadeaukaart|bitcoin|escrow|western union)\b|https?:\/\//i.test(text)) return {kind:'RISK',confidence:1};
  if(/\b(?:nee dank|geen interesse|niet ge[iï]nteresseerd|laat maar)\b/i.test(text)) return {kind:'REFUSE',confidence:.99};
  // Negating one issue must not hide a different defect in the same sentence.
  const hazards=[...text.matchAll(/\b(?:schade|motor kapot|defect|olieverbruik|total loss)\b/gi)];
  if(hazards.some(m=>!/\b(?:geen|zonder)\s*$/i.test(text.slice(Math.max(0,m.index-15),m.index))))return {kind:'RISK',confidence:.9};
  if(/\b(?:usd|chf|dollar|bitcoin)\b|[$£¥]/i.test(text))return {kind:'UNKNOWN',confidence:0,reason:'Valuta niet eenduidig EUR'};
  if(/(?:ander|eerder|iemand).{0,20}(?:bod|biedt)|\bal (?:een )?bod\b/i.test(text)) return {kind:'FIRM',confidence:.97};
  const prices=extractPrices(text);
  if(prices.length>1) return {kind:'UNKNOWN',confidence:.4,reason:'Meerdere bedragen'};
  if(prices.length===1) {
    if(!AFFIRMATIVE.test(text)&&!SELLER_PRICE.test(text)&&wholeSellerPrice(text)===null) return {kind:'UNKNOWN',confidence:.4,reason:'Geen eenduidig onvoorwaardelijk verkopersbedrag'};
    return {kind:'PRICE',price:prices[0],confidence:.99,evidence:text};
  }
  if(/\b(?:niet\b.{0,25}\bakkoord|niet goed|geen deal|geen akkoord|nee|nog niet|weet niet)\b/i.test(text)) return {kind:'FIRM',confidence:.95};
  if(/\b(?:als|mits|maar|tenzij|misschien|eventueel)\b/i.test(text)) return {kind:'UNKNOWN',confidence:.4};
  if(AFFIRMATIVE.test(text)) return {kind:'ACCEPT',confidence:.98};
  if(/\b(?:wat|hoeveel)\b.{0,45}\b(?:bied(?:en|t)?|bode?n?|geven|betalen|over)\b|\bdoe (?:maar |eens )?een bod\b/i.test(text))return {kind:'QUESTION',confidence:.98,topic:'offer'};
  if(/\?|\b(?:waarom|wanneer|ben je|bent u|handelaar|hoezo)\b/i.test(text)) return {kind:'QUESTION',confidence:.9,
    topic:/\b(?:handelaar|autobedrijf|particulier|zakelijk)\b/i.test(text)?'identity':/\b(?:bot|ai|automaat)\b/i.test(text)?'automation':'other'};
  if(/\b(?:(?:vraag)?prijs (?:is|staat|blijft) vast|vaste prijs|niet lager|ik (?:zak|ga) niet (?:lager|omlaag)|lager ga ik niet|hou vast|houd vast|te laag)\b/i.test(text)) return {kind:'FIRM',confidence:.95};
  if(/\b(?:onderhoud|onderhouden|facturen|olie|beurt|verkoop|nieuwe auto|bonnen|distributie|boekje|koppeling|eigenaar|leaseauto|apk)\b/i.test(text)) return {kind:'INFO',confidence:.9};
  // Availability must not hide an answered maintenance question or a seller's
  // question. Otherwise we ask for information that was just provided.
  if(/\b(?:nog beschikbaar|nog te koop|is beschikbaar)\b/i.test(text))return {kind:'INFO',confidence:.98,topic:'availability'};
  return {kind:'UNKNOWN',confidence:.2};
}
export function validateClassification(value, text) {
  if(typeof text!=='string'||text.length>6000) return {kind:'UNKNOWN',confidence:0};
  const local=classifyLocal(text);
  if(['OPT_OUT','SOLD','RISK','REFUSE'].includes(local.kind) || INJECTION.test(text)) return local;
  const kinds=['ACCEPT','PRICE','FIRM','QUESTION','INFO','UNKNOWN'];
  if(!value || !kinds.includes(value.kind) || !Number.isFinite(value.confidence) || value.confidence<.9 || value.confidence>1) return {kind:'UNKNOWN',confidence:0};
  if(value.kind==='PRICE') {
    if(local.kind!=='PRICE') return {kind:'UNKNOWN',confidence:0};
    if(extractPrices(text).length!==1 || !extractPrices(text).includes(value.price)) return {kind:'UNKNOWN',confidence:0};
    if(typeof value.evidence!=='string' || !text.includes(value.evidence)) return {kind:'UNKNOWN',confidence:0};
  }
  if(value.kind==='ACCEPT' && local.kind!=='ACCEPT') return {kind:'UNKNOWN',confidence:0};
  return {kind:value.kind, confidence:value.confidence, ...(value.kind==='PRICE'?{price:value.price}:{}),
    ...(['QUESTION','INFO'].includes(value.kind)?{topic:local.topic||'other'}:{})};
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
    return out('CLARIFY',{clarificationCount:s.clarificationCount+1},null,c.reason||'Betekenis onduidelijk');
  }
  if(c.kind==='QUESTION') {
    if(c.topic==='identity') return out('IDENTITY');
    if(c.topic==='automation') return out('AUTOMATION');
    if(c.topic==='offer')return s.lastOffer===null?out('ANCHOR',{phase:'NEGOTIATING',lastOffer:s.anchor},s.anchor):out('HOLD',{},s.lastOffer);
    return out('REVIEW',{phase:'REVIEW'},null,'Vraag vereist een feit dat niet geverifieerd is');
  }
  if(c.kind==='INFO'&&c.topic==='availability'&&s.lastOffer===null&&(s.infoQuestions||0)<1)return out('ASK_INFO',{infoQuestions:(s.infoQuestions||0)+1});
  if(c.kind==='INFO'&&s.lastOffer!==null)return out('HOLD',{},s.lastOffer);
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
  const context=buildVoiceContext({candidate,settings});
  const decision={action:'OPEN',price:null,state:{phase:'NEW'}};
  return finishText(fallbackTemplate(decision,context),decision,context);
}
export function renderDecision(d, settings, details={}) {
  const context=buildVoiceContext({settings,...details});
  const template=fallbackTemplate(d,context);
  const text=finishText(template,d,context);
  if(text!==null)assertOutbound(text,d);
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
