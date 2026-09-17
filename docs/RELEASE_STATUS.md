# Vrijgavestatus 0.2.1-pilot.1

18 september 2026. Lokale herstelbuild voor gesprekstests en handmatige concepten. De gespreksschrijver is gerepareerd en de lokale eindcontroles zijn geslaagd. Gebruikersacceptatie van de toon en echte modeluitvoer zijn nog afzonderlijk te beoordelen. Autonome live inkoop en betaalde dealeruitrol zijn niet vrijgegeven.

## Actueel uitgevoerd

Alle onderstaande controles zijn na samenvoeging van de code uitgevoerd op deze Windows-host met Node 24.19.0. De eindrun staat in `reports/conversation-style/final-verification/verification-summary.json`; `allPassed` is `true`.

| Controle | Uitkomst |
|---|---|
| Syntax en pakketcontract | Geslaagd |
| Node-tests | 597/597 geslaagd, niets overgeslagen |
| Synthetische Nederlandse classificatieset | 128 gevallen; 0 false accepts, 0 verkeerde prijzen, 0 false rejects |
| Bestaande interface, echte Chromium-DOM met gemockte fetch | 14/14 |
| Gespreksstudio, echte Chromium-DOM met gemockte fetch | 10/10 |
| Echte lokale browsernavigatie, HTTP en demowerker | 20/20 |
| Geïsoleerde Windows-installatieacceptatie | 9/9 |
| Volledige gespreksvoorbeelden | 7 scenario's, 14 studio-uitvoeringen, 0 onverwachte testwriterterugvallen |
| Historische bewijsbestanden | Alle 24 onveranderd |

Windowsacceptatie gebruikt PowerShell 5.1, een aanwezige officieel ondertekende Node-runtime, Unicode/spaties in een geïsoleerd pad, uitpakken, installatie, foutafhandeling, herstel na mislukte activatie, starten, afsluiten en verwijderen met gegevensbehoud. Alle 44 bestanden uit dat testpakket zijn op inhoud gecontroleerd; vier stagingpaden waren minstens 260 tekens lang. Dit is één host, geen tweede onafhankelijke computer of volledige installatie zonder aanwezige Node. Uitgeverssigning, SmartScreen, echte runtime-download en een productie-updatekanaal zijn hiermee niet bewezen.

## Herstel en regressies

De schrijver gebruikt eerdere verkopersfeiten, waarbij nieuwere correcties voorgaan. Ook correcties voorbij de ingekorte modeltekst tellen mee: feitcodes worden vóór het inkorten bepaald uit maximaal 6.000 tekens per bronbericht. Assistanttekst is geen bewijs. De modelpayload blijft begrensd tot twaalf recente berichten van maximaal 650 tekens en de laatste reactie van maximaal 2.000 tekens.

Normale biedidiomen blijven toegestaan, terwijl eigen ophaalafspraken en bijkomende toezeggingen worden afgewezen. De toonkeuze werkt ook offline. Concessies variëren per stap. Alleen de definitieve prijsbevestiging vereist telkens expliciet het bezichtigingsvoorbehoud; eerdere biedzinnen kunnen kort blijven. Prijsberekening, caps, fasegrenzen, overdracht en bescherming tegen achterhaalde concepten zijn behouden.

De algemene beschikbaarheidsherkenning overschrijft geen inhoudelijk onderhoudsantwoord of vraag meer. De interface legt uit waarom een AI-tekst is vervangen. Een gevonden Windows-probleem bij lange stagingpaden is hersteld zonder systeeminstellingen te wijzigen.

De oorspronkelijke 530 tests zijn aangevuld met 67 tests. Eén bestaande test eiste letterlijk het woord “reden”; die toetst nu of naar de verkoopreden wordt gevraagd, zodat ook “Waarom verkoop je hem?” geldig is. De andere controles op prijsloos openen, onderhoud en verzonnen onderzoek zijn behouden. De eerste test- en installatiefouten blijven als afzonderlijk bewijs in `reports/conversation-style/verification/` staan. De geslaagde eindrun vervangt die bestanden niet.

## Wat deze resultaten niet aantonen

Er is geen echte Anthropic-aanroep, Marktplaats-verzending of betaling uitgevoerd. De rechterkolom in het gespreksoverzicht gebruikt een handgeschreven testwriter en is nadrukkelijk geen Claude-uitvoer. De voorbeelden zijn niet door de gebruiker als gewenste stijl goedgekeurd. Vrije modeltaal heeft geen algemene correctheidsgarantie.

De gewone start blijft offline; bestaande afzonderlijke toestemming voor betaald modelgebruik blijft nodig. De oorspronkelijke SaaS-installatie, database, accounts en de losse relay zijn niet aangepast. Platformtoegang, echte modelkwaliteit, een tweede Windowscomputer en commerciële vrijgave blijven afzonderlijke stappen.

Lees `docs/GESPREKSSTIJL_HERSTEL.md` voor de keuzes en `reports/conversation-style/GESPREKKEN.html` voor het reviewbare resultaat.
