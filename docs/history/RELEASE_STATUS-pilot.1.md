# Vrijgavestatus

Datum: 7 september 2026. Build: 0.1.0-pilot.1.

## Besluit

**GO voor een technische, fictieve productdemonstratie. NO-GO voor onbeheerde live inkoop bij betalende dealers.** De Windows-installer is geschreven, maar de eerste Windows-installatie is nog een acceptatietest. Deze twee uitspraken mogen niet worden vervangen door “dealer-ready, bugvrij en morgen live”.

| Onderdeel | Implementatie | Feitelijk getest |
|---|---|---|
| Onderhandelaar, caps, budget, stop/handoff | Werkende code | Automatische Node-tests en 10.000 berekende prijsgevallen |
| Lokale SQLite, uitgaande wachtrij, crashveiligheid | Werkende code | Transacties, parallelle reserveringen, restart en uncertain-state |
| HTTP-agent + echte workerthread | Werkend | Via lokale HTTP-app autonoom tot demo-overdracht |
| Interface desktop/mobiel | Werkend | Echte Chromium DOM/rendering; API-responsen gemockt in DOM-test |
| Lokale fixture-browsertest | Script en adapter aanwezig | Geblokkeerd: `net::ERR_BLOCKED_BY_ADMINISTRATOR` |
| Marktplaats zoeken, inbox en verzenden | Adapterstructuur, geen gevalideerd livecontract | Niet getest op echte ingelogde Marktplaats |
| Windows-installer | Bootstrap, runtimecontrole, snelkoppeling | Niet op Windows uitgevoerd |
| Sonnet-classificatie | Afzonderlijke API-client | Mockverzoeken, foutgevallen, budget en outputvalidatie; geen echt verzoek |
| Mollie, abonnementen, licentie | Afzonderlijke modules | Mocks/cryptografische tests; geen betaalprovider of issuer gedeployed |
| Automatische updates en rollback | Nog geen productie-implementatie | Niet getest |
| Productie-dataverwijdering | Instelling als beleid; nog geen cron/retentionproces | Niet als productievoorziening geleverd |
| Ondertekende distributie | Niet aanwezig | Geen reputatie/SmartScreen/AV-acceptatietest |
| Juridisch, privacy en platformtoegang | Onderzoeksnotities en releasechecklist | Geen juridische goedkeuring of contractafspraak |

## Er is geen heimelijke live-schakelaar

`src/worker/runner.mjs` kiest de geïsoleerde DemoAdapter. Instellingen kunnen hem niet naar live omzetten. De browseradapter weigert een niet-vrijgegeven productierun. De keuze voorkomt dat een onbevestigde selector of gebrekkige sessiecontrole echte verkopers raakt.

De demo is dus géén assistieve variant met een “verzend”-knop. De worker doet alles automatisch, maar in een gescheiden testomgeving. Voor productie is een daadwerkelijk bewezen platformadapter nodig, niet het verwijderen van een waarschuwing.

## Ontbrekende verificaties vóór betaalde uitrol

1. Installeer op een schone Windows 11-computer, normale gebruiker zonder Node, met Edge. Controleer boot, reset, afsluiten, herstel en deïnstallatie. Herhaal op een tweede onafhankelijke pc.
2. Verifieer toepasselijke platformvoorwaarden, toegestane data-/messagingtoegang en eventuele afspraken. Een softwarelicentie is geen platformtoestemming.
3. Maak een gecontroleerd, actueel browsercontract met juiste account-ID, unieke advertentie-ID, verkoper-ID, bericht-ID, richting en bevestigde verzending. Geen selectors gokken of generieke knoppen aanklikken.
4. Test met toegestane, door deelnemers beheerde testgesprekken. Geen ongevraagde massatest. Test onder andere dubbel versturen, nieuwe berichten tijdens verwerking, uitloggen, captcha, instabiel internet, slaapstand, tijdzone en crash precies rondom verzenden.
5. Evalueer de echte AI met Nederlandse gespreksscenario’s, negaties, sarcasme, meerdere bedragen en voorwaarden. Mocks bewijzen geen taalbegrip.
6. Deploy server-side checkout, opgeslagen orderledger, idempotente webhookverwerking en licentie-uitgifte. Test annulering, chargeback, refund, verlopen mandaat, btw/invoice-instellingen en herhaalde callbacks.
7. Signing, updatekanaal met handtekening en rollback, gegevensverwijdering, verwerkersafspraken en supportproces afronden. Laat eerst een beperkte pilot slagen voordat meerdere dealers onbeheerd werken.

## Codex en bestaande repository

Er is naar een passende gekoppelde GitHub-repository en naar opgeslagen broncode gezocht. Alleen de overdracht, gespreksspecificatie en een schedulerpatch waren relevant; de volledige oorspronkelijke engine/scraper/messenger is niet aangetroffen. Er is geen bestaande klantinstallatie gewijzigd en er is geen externe Codex-taak gestart. De aanwezige worker is de daadwerkelijk uitgevoerde applicatieworker, niet een verzonnen achtergrondontwikkelaar.
