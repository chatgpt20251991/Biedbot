/** Product limits, not published platform quotas and not an account-safety guarantee. */
export const VERSION = '0.1.0-pilot.1';
export const HARD_NEW_CONTACT_CAP = 20;
export const HARD_TOTAL_MESSAGE_CAP = 80;
export const DEFAULTS = Object.freeze({
  company: 'Mijn autobedrijf', signoff: 'Inkoopteam', town: '',
  dailyCap: 20, totalMessageCap: 80, discountPct: 25,
  minPrice: 3000, maxPrice: 40000, maxMileage: 180000,
  minYear: 2014, radiusKm: 100, brands: ['Volkswagen', 'Audi', 'BMW', 'Toyota'],
  minMargin: 1500, riskReserve: 500, budget: 75000,
  hoursStart: 9, hoursEnd: 21, newGapSeconds: 1800, replyGapSeconds: 120,
  requireMarginEvidence: false, retentionDays: 30,
  includeBusinessSellers: false, autopilot: false,
  aiProvider: 'offline', aiModel: 'claude-sonnet-4-6', aiMaxRequestsDaily: 120,
  onboardingDone: false, buyingThisWeek: false,
  trialDays: 7, pricingSetup: 249, pricingMonthly: 149
});
const integer = (v, min, max, key) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`Ongeldige instelling ${key}: ${min}–${max}.`);
  return v;
};
export function validateSettings(input, previous = DEFAULTS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Instellingen ontbreken.');
  const unknown = Object.keys(input).filter(k => !Object.hasOwn(DEFAULTS, k));
  if (unknown.length) throw new Error(`Onbekende instelling: ${unknown.join(', ')}`);
  const v = {...previous, ...input};
  for (const key of ['company','signoff','town']) {
    if (typeof v[key] !== 'string' || v[key].length > 100 || /[\u0000-\u001f<>]/.test(v[key])) throw new Error(`Ongeldige ${key}.`);
    v[key] = v[key].trim();
  }
  if (!v.company || !v.signoff) throw new Error('Bedrijfsnaam en afzender zijn verplicht.');
  integer(v.dailyCap, 1, HARD_NEW_CONTACT_CAP, 'daglimiet');
  integer(v.totalMessageCap, v.dailyCap, HARD_TOTAL_MESSAGE_CAP, 'totale berichtenlimiet');
  integer(v.discountPct, 8, 60, 'korting');
  integer(v.minPrice, 1000, 200000, 'minimumprijs');
  integer(v.maxPrice, v.minPrice, 200000, 'maximumprijs');
  integer(v.maxMileage, 1000, 999999, 'kilometerstand');
  integer(v.minYear, 1980, new Date().getFullYear() + 1, 'bouwjaar');
  integer(v.radiusKm, 1, 1000, 'afstand');
  integer(v.minMargin, 0, 100000, 'doelmarge');
  integer(v.riskReserve, 0, 100000, 'risicoreserve');
  integer(v.budget, 1000, 10000000, 'inkoopbudget');
  integer(v.hoursStart, 7, 20, 'beginuur');
  integer(v.hoursEnd, v.hoursStart + 1, 22, 'einduur');
  integer(v.newGapSeconds, 300, 86400, 'contactinterval');
  integer(v.replyGapSeconds, 60, 86400, 'antwoordinterval');
  integer(v.retentionDays, 7, 365, 'bewaartermijn');
  integer(v.aiMaxRequestsDaily, 1, 500, 'AI-limiet');
  for (const key of ['autopilot','requireMarginEvidence','includeBusinessSellers','onboardingDone','buyingThisWeek']) {
    if (typeof v[key] !== 'boolean') throw new Error(`Ongeldige schakelaar ${key}.`);
  }
  if (v.includeBusinessSellers) throw new Error('Deze pilot selecteert alleen expliciet particuliere verkopers.');
  if (!['offline','anthropic'].includes(v.aiProvider)) throw new Error('Onbekende AI-aanbieder.');
  if (typeof v.aiModel !== 'string' || !/^claude-[a-z0-9.-]{3,80}$/.test(v.aiModel)) throw new Error('Ongeldig model-ID.');
  if (!Array.isArray(v.brands) || v.brands.length > 30 || v.brands.some(x => typeof x !== 'string' || !/^[\p{L}\d .-]{1,35}$/u.test(x))) throw new Error('Ongeldige merken.');
  integer(v.trialDays, 1, 30, 'proefperiode');
  integer(v.pricingSetup, 0, 10000, 'eenmalige prijs');
  integer(v.pricingMonthly, 1, 10000, 'abonnementsprijs');
  return v;
}
export function localParts(now) {
  const d = new Date(now);
  if (!Number.isFinite(d.getTime())) throw new Error('Ongeldige tijd.');
  const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23' }).formatToParts(d).map(x=>[x.type,x.value]));
  return {day:`${p.year}-${p.month}-${p.day}`, hour:Number(p.hour)};
}
export function withinHours(now, s) { const h = localParts(now).hour; return h >= s.hoursStart && h < s.hoursEnd; }
export function boundedCap(...values) { return Math.min(HARD_NEW_CONTACT_CAP, ...values.map(x => Number.isInteger(x) && x > 0 ? x : 0)); }
