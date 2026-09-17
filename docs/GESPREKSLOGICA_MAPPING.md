# Van originele gesprekslogica naar deze app

Update 18 september: de aangeleverde oorspronkelijke SaaS-bron is nu rechtstreeks vergeleken. De concrete herstelkeuzes en de nieuwe volledige toetsgesprekken staan in `GESPREKSSTIJL_HERSTEL.md`. Historische verkopersfeiten en correcties tellen mee; de toonkeuze werkt ook offline. Het expliciete bezichtigingsvoorbehoud blijft verplicht bij akkoord en hoeft niet in iedere voorafgaande bodzin te worden herhaald.

Bronbasis: hoofdstuk 0/0B van `docs/source/BIEDBOT_GESPREKSLOGICA.md` (11 juli-herbouw) en de aangeleverde PDF van 17 juli, met name pagina 10 en 11. De oudere Haiku-openingen met direct een bod en gefingeerde marktanalyse zijn historische achtergrond, geen actieve opdracht.

| Bronprincipe | Huidige implementatie |
|---|---|
| Code kiest strategie; model verwoordt | negotiation.mjs + communication.mjs + AnthropicWriter |
| Warm openen zonder bod | OPEN in voice.mjs; writer-route actief na expliciete opt-in |
| Reageren op inhoud | bounded/redacted sellerText + twaalf recente berichten; dealercontext |
| Anker en prijsklasseplafond | Bestaande calculateLimits/initialState; extra individuele/marge/budgetgrenzen behouden |
| Maximaal twee peilingen, drie krimpende concessies | Bestaande deterministische counters; geen automatische verhoging als de verkoper stil blijft staan |
| Sluiten binnen plafond, mens neemt over | Correct actueel bod of concreet verkopersbedrag; HOT_LEAD is terminaal |
| Geen eigen ophaaldatum of tijd | Prompt, tekstguard en vaste veilige afsluiting |
| Geen cash/spoed, markdown of lange streepjes | Centrale validatie vóór en na prijsinvulling |
| Waarheid schaalt | Geen verzonnen marktwaarde/vergelijkingen; weekclaim alleen na tijdelijke dealerbevestiging |
| Signoff niet dubbel | Schrijver schrijft geen signoff; code plaatst exact één gecontroleerde afzender |
| Custom-template valkuil vermijden | Geen nieuw vrij templateveld; openingsroute gebruikt MessageComposer |

## Bewuste veiligheidswijzigingen ten opzichte van de oude voorbeeldcode

Er wordt niet opnieuw vertrouwd op het teruglezen van getallen uit eigen zinnen om de fase te bepalen. De bevestigde onderhandelstaat zit in SQLite. De phase/lastOffer verandert pas na demo-/adapterreceipt; in handmatige studio pas nadat de dealer het exacte concept als verstuurd bevestigt.

Akkoord gebruikt niet altijd het oorspronkelijke anker. Een akkoord op het laatst bevestigde bod hoort bij dat bod. Een concreet lagere verkopersprijs kan meteen worden bevestigd zonder eerst een hoger bod neer te leggen. Zo hoeft de app een gunstiger aanbod niet onnodig te overbieden. Extra voorwaarden, risicosignalen en ambigue berichtreeksen worden niet stilzwijgend als akkoord behandeld.

De oude claim “dit bedrag is wat auto's werkelijk opbrengen” wordt zonder echte databron niet uitgesproken. Ook “ik koop deze week” en “ik heb alternatieven” staan niet standaard aan. Dat behoudt de eigen bronregel tegen verzonnen onderbouwing.

De originele appcap twintig nieuwe contacten blijft behouden. De oudere documentclaim over vijfentwintig is niet overgenomen als feitelijke platformgarantie. Ook lager volume is geen toestemming.

Financiële tekst heeft onder voorbehoud van bezichtiging/controle een plaats gekregen. Dit is een operationele voorzorg, geen juridisch oordeel dat elk bericht niet-bindend is. Er is geen juridische of commerciële vrijgave gegeven.

De nieuwe handmatige studio is een extra bruikbare werkstand, geen terugdraaiing van de gekozen Edge/autopilot-productrichting. De autonome worker werkt met demo-events; echte platformdispatch blijft een aparte vrijgavestap.

## Verificatie

`communication-audit-regression.test.mjs` legt de vijf concrete klachten vast. `voice.test.mjs` test formuleringen, bronclaims, geld, stijl en geschiedenis. `writer-integration.test.mjs` test de echte API-client met geïnjecteerde HTTP-responses. `composition-races.test.mjs` test wijzigingen tijdens genereren en vlak voor dispatch. `studio.test.mjs` en `studio-api.test.mjs` testen bruikbare handmatige bediening en echte lokale API-opslag. Oude testbestanden zijn niet afgezwakt om de nieuwe implementatie groen te maken.
