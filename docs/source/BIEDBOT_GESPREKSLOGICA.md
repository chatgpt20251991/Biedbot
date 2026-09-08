# BIEDBOT — COMPLETE GESPREKSLOGICA

Alles over hoe de bot praat op Marktplaats: prompts, onderhandelingslogica,
guards, regels en de psychologie erachter.

Bestand: `engine/prompts.js`
Model: `claude-haiku-4-5-20251001`
Laatst bijgewerkt: 2 juni 2026



---

# 0. LET OP: HET SYSTEEM IS HERBOUWD (11 juli 2026)

De onderhandeling draait niet meer op `prompts.js` met Haiku. Er is een nieuw
bestand `engine/onderhandelaar.js` met een fundamenteel andere opzet:

- **De strategie zit volledig in code** als fase-machine (welke fase, welk
  bedrag, accepteren/vasthouden/weglopen). Deterministisch en testbaar.
- **Het model doet nog maar twee dingen:** (1) `classificeer()` leest het
  laatste verkoper-bericht en geeft een klasse terug, (2) `verwoord()` schrijft
  het ene bericht netjes op.
- **Model = Sonnet**, niet Haiku meer.
- `prompts.js` blijft als back-up staan maar doet niet meer mee zodra
  `BotEngine.js` naar `onderhandelaar.js` wijst.

Reden voor de herbouw: Haiku (en elk model op een vage opdracht) zwabbert als
het zélf de strategie mag bepalen. Door de beslissingen in code te zetten kan
het model de onderhandeling niet meer verpesten.

**Niet zeker:** of de wire-patch die `BotEngine.js` omzet daadwerkelijk is
gedraaid. Te controleren met:
```powershell
Select-String -Path "C:\bietbot_saas\biedbot_saas\biedbot_saas\engine\BotEngine.js" -Pattern "onderhandelaar"
```
Geeft dat een hit, dan is het nieuwe systeem live.

Alles vanaf hoofdstuk 5 hieronder beschrijft het **oude** `prompts.js`-systeem.
Nuttig als achtergrond (de psychologie is grotendeels overgenomen), maar het is
niet wat er draait.

---

# 0B. DE NIEUWE ARCHITECTUUR — `onderhandelaar.js`

## Het plafond per prijsklasse

```js
export function plafondPct(vraag) {
  if (vraag <= 7500)  return 80;
  if (vraag <= 15000) return 84;
  if (vraag <= 30000) return 88;
  return 91;
}
```

Goedkopere autos hebben meer marge, dure autos minder. Bij een auto van 5.000
ga je nooit boven 80% van de vraagprijs; bij 40.000 mag je tot 91%.

## Anker en plafond

```js
// Het lage openings-anker (vast % onder vraagprijs, afgerond op 50)
export function berekenAnker(vraag, kortingPct) {
  return Math.round((vraag * (100 - kortingPct)) / 100 / 50) * 50;
}

// Absolute bovengrens: plafond-% van de vraag, nooit onder anker,
// nooit boven 92%
export function berekenPlafond(vraag, anker) {
  const banded = Math.floor((vraag * plafondPct(vraag)) / 100);
  return Math.max(anker, Math.min(banded, Math.floor(vraag * 0.92)));
}
```

## Het "berekende" getal

```js
// Net, oneven-aanvoelend getal (geen rond honderdtal) -> voelt berekend
function netGetal(n) {
  let r = Math.round(n / 10) * 10;
  if (r % 100 === 0) r -= 40;
  return r;
}
```

Psychologie: EUR 26.000 klinkt als een gok, EUR 25.960 klinkt alsof je het
hebt uitgerekend.

## Bedragen herkennen

```js
export function bedragenUit(tekst) {
  const out = [];
  const re = /(?:€|eur)\s*([0-9][0-9.\s]{2,7})|(\b[0-9]{4,6}\b)/gi;
  let m;
  while ((m = re.exec(tekst || "")) !== null) {
    const raw = String(m[1] || m[2] || "").replace(/[.\s]/g, "");
    const n = parseInt(raw, 10);
    if (n >= 1000 && n <= 200000) out.push(n);
  }
  return out;
}
```

Vangt zowel `€` als `EUR` als een kaal getal van 4-6 cijfers.

## De peil-zin (vast, niet door het model bedacht)

```js
const PEIL_ZIN =
  "Begrijp ik. Mijn bod komt uit wat deze auto's echt opbrengen, dus veel " +
  "ruimte heb ik niet. Wat is je scherpste prijs waarvoor je hem echt wegdoet, " +
  "voor iemand die deze week klaarstaat?";

const PEIL_MARK = "scherpste prijs waarvoor je";
```

`PEIL_MARK` wordt gebruikt om in eerdere eigen berichten te herkennen dat er al
gepeild is.

## Fase-detectie uit eigen berichten

```js
export function leesFase(alleEigenBerichten, anker) {
  let ankerGestuurd = false;
  let peilingen = 0;
  let concessies = 0;
  let laatsteBod = null;
  for (const t of alleEigenBerichten || []) {
    if (typeof t !== "string") continue;
    const beds = bedragenUit(t);
    if (beds.length) {
      ankerGestuurd = true;
      laatsteBod = Math.max(...beds);
      if (beds.some((n) => n > anker)) concessies++;
    }
    if (t.includes(PEIL_MARK)) peilingen++;
  }
  return { ankerGestuurd, peilingen, concessies, laatsteBod };
}
```

De bot leidt zijn eigen positie af uit wat hij eerder stuurde. Geen aparte
state-opslag nodig.

## Aflopende concessies

```js
export function volgendeConcessie(anker, plafond, concessiesGedaan) {
  const gap = plafond - anker;
  if (gap <= 0) return anker;
  const frac = 1 - Math.pow(0.5, concessiesGedaan + 1); // 0.5, 0.75, 0.875
  const bod = netGetal(anker + Math.round(gap * frac));
  return Math.min(Math.max(bod, anker), plafond);
}
```

Krimpende stappen: eerst de helft van de ruimte, dan driekwart, dan 87,5%.
Psychologie: aflopende concessies signaleren dat je tegen je grens zit, en
laten de verkoper voelen dat hij eruit heeft gehaald wat erin zat.

## HET BREIN — de beslissing

```js
// klasse: AKKOORD | BEDRAG | VAST | VRAAG | AFHAAK
// actie:  ANKER | PEILEN | CONCESSIE | AKKOORD | AFWIJZEN
export function beslis(klasse, sellerBedrag, anker, plafond, fase) {
  const MAX_PEIL = 2;
  const MAX_CONCESSIE = 3;

  if (klasse === "AFHAAK") return { actie: "AFWIJZEN", bod: null, prijs: null };

  // Anker nog niet verstuurd -> eerst het anker neerleggen (fase 1)
  if (!fase.ankerGestuurd) return { actie: "ANKER", bod: anker, prijs: null };

  if (klasse === "AKKOORD") return { actie: "AKKOORD", bod: anker, prijs: anker };

  if (klasse === "BEDRAG" && sellerBedrag) {
    // Binnen onze bovengrens? Pakken, op ZIJN prijs.
    if (sellerBedrag <= plafond)
      return { actie: "AKKOORD", bod: sellerBedrag, prijs: sellerBedrag };
    // Boven plafond: een stap tegemoet, of afhaken als de stappen op zijn
    if (fase.concessies < MAX_CONCESSIE)
      return {
        actie: "CONCESSIE",
        bod: volgendeConcessie(anker, plafond, fase.concessies),
        prijs: null,
      };
    return { actie: "AFWIJZEN", bod: null, prijs: null };
  }

  // VAST of VRAAG (houdt vast / stelt een vraag, geen bruikbaar bedrag)
  if (fase.peilingen < MAX_PEIL) return { actie: "PEILEN", bod: null, prijs: null };
  return { actie: "AFWIJZEN", bod: null, prijs: null };
}
```

Harde grenzen: **max 2 keer peilen, max 3 concessies.** Daarna weglopen.

## Fase 0 — de prijs-loze opening

Grote wijziging: het eerste bericht noemt **geen bedrag meer**. Het is een
ijsbreker die twee dingen vraagt:

1. Wat is er aan onderhoud gedaan, zijn er recent grote dingen vervangen?
2. Waarom verkoop je hem?

Doel: een reactie krijgen plus informatie, en subtiel laten blijken dat je deze
week iets koopt en meerdere op het oog hebt. Het anker wordt wel berekend en
teruggegeven zodat BotEngine het kan opslaan, maar het gaat pas in bericht 2
de deur uit ("brug + anker").

Fallback als het model faalt:
```
Ik kijk deze week naar een paar exemplaren van de [model] en wil er een halen.
Kun je iets vertellen over het onderhoud, en of er recent grote dingen
vervangen zijn? En wat is de reden dat je hem verkoopt?
```

## De stijl-constraint (gedeeld door alle berichten)

```js
const STIJL =
  "Niet smekend, niet vleien, niet vijandig, geen uitroeptekens. " +
  "VERBODEN: gedachtestreepjes, markdown, sterretjes, de woorden " +
  "contant/cash/spoed, placeholders tussen haakjes, en het voorstellen " +
  "van een datum of tijd. " +
  "Schrijf vloeiend Nederlands, maximaal 3 korte zinnen.";
```

## De model-aanroep

```js
async function verwoord(instructie, signoffNaam) {
  try {
    const resp = await claude.messages.create({
      model: MODEL,          // Sonnet
      max_tokens: 220,
      messages: [{ role: "user", content: instructie }],
    });
    let b = schoonmaken((resp.content && resp.content[0] && resp.content[0].text) || "");
    if (!b) return null;
    if (signoffNaam && !b.toLowerCase().includes(signoffNaam.toLowerCase())) {
      b += "\n\n" + signoffNaam;
    }
    return b;
  } catch (e) {
    console.error("[onderhandelaar] verwoord faalde:", e.message);
    return null;
  }
}
```

Let op de signoff-check: `toLowerCase()` aan beide kanten, dus geen dubbele
naam meer.

## De afsluitende berichten

**AKKOORD:**
```
Top, dan doen we EUR [bedrag]. Wanneer schikt het bij jou?
```
Geen datum of tijd zelf voorstellen.

**AFWIJZEN na 2x peilen (deur op een kier):**
```
Helder, dan komen we er deze keer niet uit. Bedenk je je deze week, dan hoor
ik het graag, anders pak ik een van de andere.
```

**AFWIJZEN zonder peilen (netjes afsluiten):**
```
Helder, bedankt voor je reactie en succes met de verkoop.
```

## De wire-patch naar BotEngine.js — 3 edits

1. `import { genereerOpening, genereerCounter } from "./prompts.js"`
   wordt `from "./onderhandelaar.js"`
2. `mijnLaatsteBod` krijgt een anker-fallback, zodat de prijs-loze opening
   doorloopt naar het anker-bericht in plaats van te bailen:
   ```js
   const mijnLaatsteBod = _onderVraag.length
     ? Math.max(..._onderVraag)
     : (_bedragen.length ? Math.min(..._bedragen)
        : Math.round(chat.vraagprijs * (100 - parseFloat(this.campagne.korting_pct)) / 100 / 50) * 50);
   ```
3. `signoffNaam: this.account.bot_signoff_name` wordt doorgegeven aan
   `genereerCounter`

## Bevestigd bij het lezen van de echte BotEngine.js

- De `_bedragen`-regex vangt al `EUR` af
- De oude counter-rem (`ankerBod * 1.05`) kijkt alleen naar `€`, niet naar
  `EUR` — die blokkeert de nieuwe concessies dus niet
- Korting-veld heet `this.campagne.korting_pct`

## De onderhandel-leidraad in woorden

1. **Prijs-loze ijsbreker** — vraag onderhoud + reden verkoop, laat blijken dat
   je deze week koopt en opties hebt
2. **Brug + anker** — introduceer het bod, onderbouwd met wat autos echt
   opbrengen
3. **Vasthouden + peilen** — "wat is je scherpste prijs?" (max 2x)
4. **Aflopende concessies** — krimpende stappen richting het plafond (max 3)
5. **Sluiten** — zodra hij binnen het plafond zakt, accepteer op ZIJN prijs
6. **Weglopen** — kalm, deur op een kier

Meta-regels: **warmte zonder behoeftigheid** (de kalme partij met opties heeft
de macht), **laat hem voelen dat hij won** (krimpende concessies), en
**waarheid schaalt, leugens breken** (echt marktonderzoek, want een verkoper
die een verzonnen analyse doorprikt is weg, en handelaren praten onderling).

---

# 1. DE KERNFILOSOFIE (oud systeem, prompts.js) — "FrameTheDeal"

De hele bot draait op één principe:

> **Het bod wordt gepresenteerd als MARKTWAARDE op basis van onderzoek,
> niet als een gunst die jij vraagt.**

Daaruit volgt alles:
- Je verdedigt je bod nooit
- Je geeft geen extra uitleg
- Je smeekt niet, je vleit niet
- Je hebt walk-away power: je koopt sowieso iets, alleen niet per se van hem
- De vraagprijs van de verkoper is *hoop*; jouw bod is *wat er betaald wordt*

---

# 2. OPENINGSBERICHT

## 2.1 De 6 verplichte psychologische elementen

Elk openingsbericht moet deze zes bevatten, in natuurlijke volgorde:

1. **WALK-AWAY ANCHOR** — "Ik haal deze week een [model] op." Niet "ik zoek"
   of "ik overweeg". Je gaat er sowieso één halen.

2. **AUTORITEIT VIA MARKTANALYSE** — een concreet aantal vergeleken auto's
   (tussen 8 en 14), met jaartal-range en kilometer-criterium. Varieer het
   exacte aantal per bericht.

3. **VERKOOPPRIJZEN-FRAME (cruciaal)** — benadruk dat je naar de WERKELIJKE
   VERKOOPPRIJZEN keek, niet naar vraagprijzen. Dit ontmantelt zijn vraagprijs
   als referentiepunt. Bijv: "vooral gekeken naar waarvoor ze daadwerkelijk
   weggingen, niet wat ervoor gevraagd werd".

4. **REFRAME** — "vraagprijs is hoop, bod is wat ik betaal". Bewoording mag
   variëren, kern is dat zijn vraagprijs wishful thinking is.

5. **CONCRETE PLANNING** — een logische ophaaldag (werkdag, 2-4 dagen vooruit,
   geen weekend). Vraag om zijn 06-nummer.

6. **FINALE WALK-AWAY** — als hij niet voor [deadline] reageert, ga je voor een
   andere. Je koopt sowieso, alleen niet per se die van hem.

## 2.2 De actuele Haiku-prompt (letterlijk)

```
Schrijf een Marktplaats-openingsbericht aan een autoverkoper. Maximale
onderhandelingspsychologie, geen AI-signalen.

ADVERTENTIE: "${titel}"
VRAAGPRIJS: EUR ${prijs.toLocaleString("nl-NL")}
MIJN BOD: EUR ${bod.toLocaleString("nl-NL")}
MODEL: ${model}
NAAM ONDER BERICHT: ${signoffNaam}
HUIDIGE DATUM: ${_vandaag} (kies ALLEEN dagen 2-4 werkdagen vooruit vanaf
vandaag, geen voorbije dagen, geen zaterdag/zondag, geen "volgende week"
verder dan 5 dagen)

VERPLICHTE PSYCHOLOGISCHE STACK (alle 6 elementen MOETEN erin, in
natuurlijke volgorde):

1. WALK-AWAY ANCHOR: meld dat je deze week een ${model} ophaalt of koopt.
   Niet "ik zoek" of "ik overweeg" - je gaat er sowieso een halen.

2. AUTORITEIT VIA MARKTANALYSE: noem een concreet aantal vergeleken autos
   (tussen 8 en 14), met jaartal-range en kilometer-criterium. Voorbeeld:
   "marktanalyse van 11 soortgelijke (2018-2020, vergelijkbare km) van
   afgelopen 6 weken". Varieer het exacte aantal en de range per bericht.

3. VERKOOPPRIJZEN-FRAME (cruciaal): benadruk dat je naar de WERKELIJKE
   VERKOOPPRIJZEN keek, niet naar vraagprijzen. Bijvoorbeeld: "vooral
   gekeken naar waarvoor ze daadwerkelijk weggingen, niet wat ervoor
   gevraagd werd". Dit ontmantelt zijn vraagprijs als referentiepunt.

4. REFRAME: een zin in de geest van "vraagprijs is hoop, bod is wat ik
   betaal". Bewoording mag varieren, kern is dat zijn vraagprijs wishful
   thinking is en jouw bod de realiteit.

5. CONCRETE PLANNING: noem een logische ophaaldag (kies zelf een werkdag
   2 tot 4 dagen vooruit, vermijd zaterdag/zondag). Vraag om zijn
   06-nummer om af te stemmen.

6. FINALE WALK-AWAY: sluit af met dat als hij niet voor (logische deadline,
   bv. zondag of einde van de week) reageert, je voor een andere ${model}
   gaat. Maak duidelijk: je koopt sowieso, alleen niet per se die van hem.

ABSOLUUT VERBODEN:
- Em-dash of en-dash, gebruik kommas of punten
- "contant", "cash", "spoed", "interesse", "haalbaar", "bespreekbaar"
- "Ik ben (naam) en heb interesse" (templated AI-zin)
- Inruil, RDW-overdracht, betalingsmethode noemen
- Smeken, vleien, plichtplegingen
- Markdown (sterren, underscores, drie streepjes)
- Placeholders zoals (datum) of (tijd)
- Plakwoorden zonder spatie

TOON: professioneel, kalm, definitief. Iemand die wekelijks autos koopt.
Niet vijandig, niet behulpzaam, feitelijk.

LENGTE: 4 tot 6 zinnen.

GEEF ALLEEN HET BERICHT. Eindig met de naam "${signoffNaam}" op een
nieuwe regel.
```

## 2.3 Instellingen

- `max_tokens: 350` (was 200 — dat kapte berichten af halverwege)
- Datum-context via `_vandaag` (dag + datum + maand in het Nederlands)

## 2.4 Voorbeeld van goede output

```
Ik haal deze week één SQ5 op. Voor de jouwe €26.250, gebaseerd op een
marktanalyse van 11 soortgelijke (2018-2020, 354pk, vergelijkbare km) van
de laatste 6 weken. Vooral gekeken naar waarvoor ze daadwerkelijk weggingen,
niet naar wat ervoor gevraagd werd. Vraagprijs is hoop, bod is wat ik betaal.
Stuur je 06 even door, dan plannen we vrijdag. Krijg ik niks voor zondag,
dan is het aanbod weg.

jansen
```

## 2.5 De 10 uitgewerkte varianten (fine-tuned)

Alle tien bevatten dezelfde 5 kernelementen, in andere volgorde en met een
andere opening — zodat verkopers geen patroon herkennen.

**1. Walk-away → autoriteit → reframe → finaliteit → deadline**
> Ik kijk deze week naar SQ5's en koop er één. Op basis van 11 vergelijkbare
> (2018-2020, 354pk, soortgelijke km) van afgelopen 6 weken kom ik uit op
> €26.250. Vraagprijs is wat jij hoopt, bod is wat ik betaal. Dat is het.
> Geen reactie voor zondag = niet meer op mijn lijst.

**2. Autoriteit voorop**
> 11 vergelijkbare SQ5's uit 2018-2020 met 354pk en soortgelijke km afgelopen
> 6 weken vergeleken, handelswaarde komt uit op €26.250. Ik koop deze week één.
> Dat is mijn bod, geen onderhandeling. Voor zondag ja of nee, daarna kijk ik
> verder.

**3. Reframe als opening (status meteen gevestigd)**
> Vraagprijs is wat jij hoopt, bod is wat ik betaal. Voor deze SQ5 is dat
> €26.250, gebaseerd op 11 vergelijkbare (2018-2020, 354pk) van laatste 6 weken.
> Ik kijk deze week en koop er één. Beslis voor zondag, geen tweede aanbod.

**4. Deadline-anker voorop**
> Tot zondag staat mijn bod op deze SQ5: €26.250. Dat is mijn handelswaarde na
> vergelijking met 11 soortgelijke (2018-2020, 354pk) van afgelopen 6 weken.
> Ik kijk deze week en koop er één. Vraagprijs is hoop, bod is realiteit.
> Geen tweede ronde.

**5. Walk-away verzacht aan begin, hard aan eind**
> Ik kijk rustig naar meerdere SQ5's en koop er deze week één, geen haast aan
> mijn kant. Voor de jouwe €26.250, na vergelijking met 11 soortgelijke uit
> 2018-2020 met 354pk. Vraagprijs versus bod is wensdenken versus rekenen.
> Zondag is mijn deadline, daarna sluit ik dit aanbod.

**6. Cold open op verkoper-realiteit**
> 'm staat vermoedelijk al een tijdje en je weet zelf dat €34.990 boven markt
> zit. Ik koop deze week één SQ5, en op basis van 11 vergelijkbare
> (2018-2020, 354pk, soortgelijke km) van laatste 6 weken kom ik op €26.250.
> Vraagprijs is hoop, bod is wat ik betaal. Voor zondag besluit, geen tweede
> aanbod.
>
> (Let op: alleen gebruiken bij advertenties die echt ≥30 dagen staan.)

**7. Concession-blocker**
> Ik onderhandel niet in stappen, ik bied wat 'ie waard is. Voor deze SQ5:
> €26.250, gebaseerd op 11 vergelijkbare (2018-2020, 354pk) van laatste
> 6 weken. Ik kijk deze week en koop er één. Vraagprijs is wat jij hoopt,
> bod is wat ik betaal. Voor zondag of niet, geen tweede ronde.

**8. Loss aversion vooraan**
> Elke week stilstand kost je advertentie, afschrijving en rente. Ik bied
> vandaag €26.250, handelswaarde na vergelijking met 11 soortgelijke SQ5's
> (2018-2020, 354pk) van laatste 6 weken. Eén SQ5 koop ik deze week.
> Vraagprijs blijft hoop, bod is concreet geld. Zondag is einde aanbod.

**9. Kort en hard**
> Ik koop deze week één SQ5. 11 vergelijkbare uit 2018-2020 met 354pk
> afgelopen 6 weken vergeleken: handelswaarde €26.250. Vraagprijs is hoop,
> bod is wat ik betaal. Zondag deadline, geen tweede aanbod.

**10. Assumptive close ingebouwd**
> Ik haal deze week één SQ5 op. Voor de jouwe €26.250, na vergelijking met
> 11 soortgelijke (2018-2020, 354pk, vergelijkbare km) van laatste 6 weken.
> Vraagprijs is hoop, bod is wat ik betaal. Stuur je 06 dan plannen we voor
> vrijdag, krijg ik niks voor zondag dan is 't aanbod weg.

**Sterkste drie:** #1 (best gebalanceerd, veiligst voor productie),
#6 (sterkste opener maar alleen bij oude advertenties), #9 (kortst en hardst,
werkt bij ervaren handelaren).

---

# 3. BODBEREKENING

```js
function berekenBod(prijs, kortingPct) {
  return Math.round((prijs * (100 - kortingPct)) / 100 / 50) * 50;
}
```

Afronding op €50. Kortingspercentage komt uit de campagne-instelling.
Historisch gebruikt: 25% korting op vraagprijs (later configureerbaar gemaakt).

---

# 4. COUNTER-LOGICA (het onderhandelen)

## 4.1 De kernberekening

```js
// Anker = het laagste bod dat je zelf ooit deed in dit gesprek
const eersteEigenBod = (() => {
  for (const t of alleEigenBerichten) {
    const m = t.match(/€\s*([\d.]+)/);
    if (m) return parseInt(m[1].replace(/\./g, ""), 10);
  }
  return mijnBod;
})();

const ankerBod = Math.min(eersteEigenBod, mijnBod);

// Absolute bovengrens: max 3% boven anker, EN nooit boven 92% van vraagprijs
const maxBod = Math.min(
  Math.round(ankerBod * (1 + maxCounterPct / 100)),   // maxCounterPct = 3.0
  Math.floor(vraagprijs * (walkAwayPct / 100))         // walkAwayPct = 92.0
);
```

**Betekenis:**
- `ankerBod` — je verlaat dit nooit zonder concrete reden
- `maxBod` — absolute plafond, ook al zou Haiku hoger willen
- Herhalingsdetectie: als het ankerbedrag al 2× in het gesprek staat, moet
  de bot kiezen tussen AFWIJZEN of accepteren (niet eindeloos herhalen)

## 4.2 De drie labels

| Situatie | Label | Actie |
|---|---|---|
| Verkoper noemt bedrag = anker | AKKOORD | Bevestigen, afspraak plannen |
| Verkoper biedt boven anker maar ≤ maxBod | COUNTER | Blijf op anker |
| Verkoper houdt vast aan vraagprijs | AFWIJZEN | Open deur laten, niet doorduwen |

**Belangrijk:** AFWIJZEN is een geldige uitkomst, geen fout. De meeste
verkopers houden vast — dat hoort AFWIJZEN te zijn.

## 4.3 De counter-prompt (letterlijk)

```
Marktplaats onderhandeling. FrameTheDeal stijl.

VRAAGPRIJS: €${vraagprijs}
MIJN ANKER: €${ankerBod} (mag NIET overschreden tenzij verkoper concreet zakt)
ABSOLUTE BOVENGRENS: €${maxBod}

KRITIEKE REGEL — schendt deze regel ook 1x dan is jouw output ongeldig:
- Het ENIGE bedrag dat je in BERICHT mag noemen is EUR ${ankerBod}.
- NOOIT noem je een hoger bedrag, NOOIT de vraagprijs, NOOIT een tussenbedrag.
- Schrijft de verkoper EUR X waar X > anker, dan blijf je op EUR ${ankerBod}
  of kies AFWIJZEN.
- "Tegemoetkomen met de vraagprijs" of "ergens in het midden" is VERBODEN.

GESPREK:
${conversatie}

[Als bod al 2x genoemd:]
⚠️ JE HEBT €${ankerBod} AL ${bodCount}x GENOEMD — kies AFWIJZEN of accepteer.

REGELS:
1. NOOIT bod verhogen zonder concrete reden van verkoper
2. Verkoper biedt €X waar €X = anker → AKKOORD ("Top, ik neem contact op.")
3. Verkoper biedt €X waar €X > anker, ≤ maxBod → COUNTER blijf op anker
4. Verkoper houdt vast aan vraagprijs → AFWIJZEN
5. NOOIT placeholders [...], NOOIT datums voorstellen
6. Vraag van verkoper niet beantwoord → herhaal kort dat bod staat

VERBODEN:
- "[jouw plaats]", "[datum]"
- "Mocht je naar €X kunnen" (= overbieden)
- "maandag/dinsdag" + tijd
- "Ik kom uit ..."
- "contant", "cash", "spoed"
- Markdown

OUTPUT (strikt):
LABEL: [AKKOORD/COUNTER/AFWIJZEN]
BERICHT: [max 2 zinnen]
```

Instelling: `max_tokens: 220`

---

# 5. DE TWEE GUARDS (code-niveau, niet prompt)

Dit is cruciaal: **je kunt Haiku niet vertrouwen met alleen prompt-regels.**
Hij is getraind om verzoenend te zijn en valt daarop terug onder druk — hij
bood ooit letterlijk de volle vraagprijs aan met de uitleg "dit is een eerlijke
deal voor beiden". Daarom zit de echte bescherming in JavaScript ná de
AI-output.

## 5.1 COUNTER-GUARD — voorkomt overbieden

```js
// Draait NA schoonmaken(), VOOR de return
const _bedragen = [...bericht.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d{4,6})/g)]
  .map(m => parseInt(m[1].replace(/[.,]/g, ""), 10))
  .filter(n => n >= 1000 && n <= 200000);

const _teHoog = _bedragen.find(n => n > ankerBod);

if (_teHoog) {
  console.log("[COUNTER-GUARD] Haiku noemde " + _teHoog + " > anker " + ankerBod);
  bericht = "Mijn bod blijft EUR " + ankerBod.toLocaleString("nl-NL") +
            ". Werkt het niet, geen probleem.";
  label = "COUNTER";
}
```

**Wat het doet:** haalt elk bedrag uit de tekst die Haiku produceerde. Zit er
één boven het anker, dan wordt de hele tekst vervangen door een vaste,
veilige zin. Het is wiskundig onmogelijk geworden om te overbieden.

**Bewezen in productie:**
```
Bot:      €15.850 op een €21.150 Audi Q2
Verkoper: "Nee dank u"
Bot:      "Mijn voorstel van €15.850 staat vast"
Verkoper: "Er is al bod geweest van 18,5 dus geen interesse"
Bot:      "Mijn bod blijft EUR 15.850. Werkt het niet, geen probleem."
                    ↑ guard vuurde hier
```

## 5.2 AKKOORD_DETECT — herkent wanneer de verkoper ja zegt

Probleem dat dit oplost: een verkoper die zegt "Oké dat is goed, wanneer kunt
u langskomen?" noemt geen bedrag. De prompt-regels vingen dat niet, dus de
bot herhaalde stug zijn bod — terwijl de deal eigenlijk rond was.

```js
// Pak de laatste verkoper-regel uit de conversatie
const _laatsteVerkoperTekst = (() => {
  const regels = conversatie.split(/\n/);
  for (let i = regels.length - 1; i >= 0; i--) {
    const r = regels[i].trim();
    if (/^(VERKOPER|SELLER):/i.test(r))
      return r.replace(/^(VERKOPER|SELLER):\s*/i, "").toLowerCase();
  }
  return "";
})();

const _akkoordSignalen = [
  /\bok[eé]?\b.*\b(goed|prima|deal|akkoord)\b/,
  /\b(is goed|prima|akkoord|deal|afgesproken|top)\b/,
  /\bwanneer (kun ?je|komt u|kom je|schikt)/,
  /\bkom (maar|langs|gerust)\b/,
  /\b(stuur|geef) (je|uw) (adres|gegevens|nummer|06)/,
  /\b(haal hem|komt u hem) (op|halen)\b/,
];

if (_akkoordSignalen.some(rx => rx.test(_laatsteVerkoperTekst))) {
  bericht = "Top, akkoord op EUR " + ankerBod.toLocaleString("nl-NL") +
            ". Wanneer schikt het bij jou? Stuur even je adres en een paar " +
            "tijdstippen die werken, dan plannen we het in.";
  label = "AKKOORD";
}
```

**Ontwerpbeslissing:** de bot noemt zelf GEEN datum of tijd. Hij vraagt de
verkoper om opties. Daarna is zijn taak klaar — de lead gaat naar de mens,
en de bot mag niet meer reageren in dat gesprek.

**STATUS: nog nooit succesvol getriggerd in een echte run.** Onbekend of het
`VERKOPER:`-formaat matcht met hoe `leesGesprek()` de conversatie-string
opbouwt. Dit moet nog geverifieerd worden.

---

# 6. TEKST-SCHOONMAAK

Draait op elke AI-output voordat het verstuurd wordt:

```js
function schoonmaken(tekst) {
  // Geen em-dash of en-dash (AI-signaal op Marktplaats)
  tekst = tekst.replace(/[\u2014\u2013]/g, ",");
  // Dedup directe herhaling van zelfde woord (bv "jansen jansen")
  tekst = tekst.replace(/\b(\w+)\s+\1\b/gi, "$1");

  return tekst
    .replace(/\*\*[^*]+\*\*:?/g, "")        // markdown bold weg
    .replace(/__[^_]+__:?/g, "")            // markdown underline weg
    .replace(/^---+$/gm, "")                // horizontale lijnen weg
    .replace(/Toelichting:[\s\S]*$/i, "")   // meta-commentaar weg
    .replace(/Uitleg:[\s\S]*$/i, "")
    .replace(/Strategie:[\s\S]*$/i, "")
    .replace(/Reden:[\s\S]*$/i, "")
    .replace(/Opmerking:[\s\S]*$/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")        // omringende quotes weg
    .replace(/\n\s*\n\s*\n+/g, "\n\n")      // 3+ lege regels → 2
    .replace(/(\b[A-Z][a-z]+)(\d)/g, "$1 $2")  // "Golf2019" → "Golf 2019"
    .replace(/(\d)([A-Z][a-z])/g, "$1 $2")     // "2019Golf" → "2019 Golf"
    .replace(/  +/g, " ")
    .trim();
}
```

**Waarom de em-dash eruit moet:** een lange streep (—) is een sterk
AI-signaal. Mensen typen die niet op Marktplaats. Zodra verkopers dat gaan
herkennen, weten ze dat het een bot is.

---

# 7. MODELHERKENNING

```js
const MODELLEN_REGEX = /(Golf|Polo|Passat|Tiguan|Touran|Beetle|Kever|Transporter|Caddy|Up|T-Roc|T-Cross|Sharan|Touareg|Arteon|ID\.\d|Astra|Corsa|Insignia|Adam|Karl|Meriva|Mokka|Zafira|Crossland|Grandland|Eos|Scirocco|Multivan|Agila|Antara|Vectra|Vivaro|Combo|A1|A2|A3|A4|A5|A6|A7|A8|Q2|Q3|Q4|Q5|Q7|Q8|TT|R8|RS[0-9]|S[0-9]|e-tron|[1-8]-Serie|X[1-7]|M[2-8]|i[3-8]|iX|Z[34]|A-Klasse|B-Klasse|C-Klasse|E-Klasse|S-Klasse|G-Klasse|CLA|CLS|GLA|GLB|GLC|GLE|GLS|GT|EQ[A-S]|SLK|SLC|SL|AMG)/i;

function extractModel(titel) {
  const m = titel.match(MODELLEN_REGEX);
  if (m) return m[1];
  return (titel.split(/\s+/)[1] || "auto").slice(0, 15);
}
```

Wordt gebruikt om in het bericht "een A3" of "een SQ5" te kunnen zeggen in
plaats van de hele advertentietitel.

---

# 8. TOON-VARIANTEN (per klant instelbaar)

```js
const TOON_INSTRUCTIES = {
  zakelijk: "Kort en zakelijk, geen vleien. Definitief.",
  vriendelijk: "Vriendelijk maar duidelijk. Mag iets warmer maar nog steeds bod-anker.",
  kort: "Maximaal direct, geen plichtplegingen. 1-2 zinnen.",
};
```

Default is `zakelijk`.

---

# 9. KRITIEKE VALKUIL — de customTemplate-branch

In `genereerOpening` zit dit:

```js
if (customTemplate && typeof customTemplate === "string" && customTemplate.trim().length > 0) {
  const bericht = customTemplate
    .replace(/\{verkoper\}/g, verkoperNaam || "")
    .replace(/\{titel\}/g, titel)
    .replace(/\{vraagprijs\}/g, prijs.toLocaleString("nl-NL"))
    .replace(/\{bod\}/g, bod.toLocaleString("nl-NL"))
    .replace(/\{bedrijfsnaam\}/g, bedrijfsnaam)
    .replace(/\{signoff\}/g, signoffNaam);
  return { bericht, bod, model };   // ← Haiku wordt VOLLEDIG overgeslagen
}
```

**`accounts.opening_template` MOET NULL blijven.** Zodra daar een tekst in
staat, wordt de hele psychologie-prompt overgeslagen en verstuurt de bot een
kaal sjabloon. Dit is één keer misgegaan en leverde dit op:

> Beste JWeurt, Ik ben jansen en heb interesse in de Audi Q5. Vraagprijs
> €25.500. Mijn voorstel: €19.150. Auto direct in te ruilen, contante
> betaling mogelijk, RDW-overdracht regel ik. Wanneer schikt het om langs
> te komen? Met vriendelijke groet, jansen jansen

Alles fout: templated, noemt "contant" (verboden woord), noemt inruil en
RDW (amateuristisch bij een professional-frame), en dubbele naam.

---

# 10. HARDE OPERATIONELE GRENS

**Maximaal 25 nieuwe berichten per dag per Marktplaats-account.**

Boven die grens beperkt Marktplaats het account: je kunt dan alleen nog
reageren in gesprekken die al liepen, en nieuwe contacten kunnen niet meer
reageren. De rest van het account werkt gewoon door, dus het is een gerichte
verzendlimiet, geen volledige blokkade.

Dit moet als harde cap in de code, niet alleen als DB-instelling:

```js
const dagmax = Math.min(campagne.max_berichten_per_dag, 25);
```

Zodat een klant zichzelf niet in de voet kan schieten door 100 in te vullen.

---

# 11. WAT NOG OPEN STAAT

1. **AKKOORD_DETECT verifiëren** — heeft nog nooit getriggerd. Moet getest
   worden tegen het echte formaat dat `leesGesprek()` produceert. Als het
   `VERKOPER:`-prefix niet klopt, matcht de regex nooit.

2. **Lead-handoff afmaken** — bij AKKOORD moet de benadering-status naar
   `akkoord_lead` en moet de bot stoppen met dat gesprek. Een eerdere poging
   brak de worker door een meerregelige SQL template-literal. Opnieuw doen
   met de SQL op één regel.

3. **Counter audit-trail** — counters worden nu wel verstuurd maar niet
   weggeschreven naar de `berichten`-tabel. Geen geschiedenis van wat de bot
   heeft gezegd zonder de Marktplaats-inbox open te klikken.

4. **Dagmax-cap in code** — zie punt 10.

---

# 12. SAMENVATTING VAN DE GESPREKSFLOW

```
Nieuwe advertentie gevonden
        ↓
berekenBod(vraagprijs, kortingPct)  →  bod afgerond op €50
        ↓
extractModel(titel)  →  "SQ5"
        ↓
genereerOpening()  →  Haiku met 6-elementen psychologie-prompt
        ↓
schoonmaken()  →  dashes weg, dedup, markdown weg
        ↓
Verstuurd via messenger.stuurOpening()
        ↓
        ↓  [verkoper reageert]
        ↓
leesGesprek()  →  conversatie-string opbouwen
        ↓
genereerCounter()
        ↓
   Haiku bepaalt LABEL + BERICHT
        ↓
   schoonmaken()
        ↓
   COUNTER-GUARD    →  bedrag > anker? vervang door veilige zin
        ↓
   AKKOORD_DETECT   →  akkoord-signaal? forceer AKKOORD + afspraak-vraag
        ↓
   AKKOORD → status akkoord_lead, bot stopt, mens neemt over
   COUNTER → verstuurd, blijft op anker
   AFWIJZEN → open deur, niet doorduwen
```
