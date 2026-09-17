# BiedBot Edge 0.2.0-pilot.1

**Gebouwd op de aangeleverde workerapp. Nieuwe lanceringsrichting behouden; gespreksmotor hersteld.**

Deze ZIP bevat de complete lokale applicatie en broncode, niet alleen een mockup of opdracht voor Codex. Er is een echte Node-server, workerthread, SQLite-opslag, dealerinterface, gespreksstudio, Claude-classifier en aparte Claude-schrijver. De standaardstand is offline. Automatisch verzenden naar Marktplaats en een betaalde dealeruitrol zijn niet vrijgegeven.

## Beginnen op Windows

Pak de hele ZIP uit. Open `START_HIER.html` voor de handleiding en een echte screenshot. Sluit een eerdere BiedBot-agent af via **Agent & controle > Agent afsluiten**, niet alleen via het vensterkruisje. Maak bij bestaande gegevens eerst een volledige versleutelde backup.

Dubbelklik `INSTALLER_BiedBot.cmd`. De bestaande persoonlijke installer is behouden en neemt de nieuwe versie mee. Hij kan zo nodig een officiële Node-runtime ophalen. Deze nieuwe versie en nieuwe Claude-launcher zijn in deze bouwronde niet op Windows uitgevoerd; het Windowsbewijs van pilot.2 is historisch bewijs, geen actuele acceptatie.

Met Node.js 22.16 of hoger al geïnstalleerd werkt ook `START_BiedBot.cmd`, of `npm run demo`. `npm install` is niet nodig. De lokale URL staat in het terminalvenster. De app luistert uitsluitend op `127.0.0.1` op een willekeurige poort en gebruikt een lokale sessie.

Vul je bedrijfsprofiel in. Open **Gespreksstudio**. Kies **Oefenen** om zelf de verkoper te spelen. Probeer bijvoorbeeld “Ik krijg een leaseauto”, “Wat zou je ervoor willen geven?” en “Voor 8000 mag je hem ophalen”. De interface toont het gekozen bod, het plafond, de fase en of de tekst echt van Claude komt.

## Claude werkelijk laten schrijven

Sluit eerst de agent af. Start `START_MET_CLAUDE.cmd`. Dit vraagt expliciet toestemming voor betaald API-gebruik en daarna afgeschermd om je eigen Anthropic API-sleutel. Die sleutel wordt niet in de appdatabase, een configuratiebestand of een log geschreven. Hij staat tijdens het draaien wel in het geheugen/de procesomgeving van de agent. Sluit de agent af om die sessie te beëindigen. Beveiliging tegen kwaadaardige software onder hetzelfde Windows-account wordt niet gegarandeerd.

Deze startwijze zet zowel classificeren als schrijven aan. Een sleutel alleen, of alleen de oudere classifier-instelling, zet de nieuwe schrijver niet stilzwijgend aan. Er is een gezamenlijke limiet voor het aantal AI-verzoeken per dag; dat is geen eurobudget. Gebruik hiervoor jouw eigen geschikte Anthropic API-toegang.

Op Linux/macOS: stel `ANTHROPIC_API_KEY` in je eigen procesomgeving in, plus `BIEDBOT_AI_PROVIDER=anthropic` en `BIEDBOT_WRITER_PROVIDER=anthropic`, en start `npm run demo`. Gebruik geen sleutel als CLI-argument en deel hem niet in een chat. Model-ID is configureerbaar met `BIEDBOT_WRITER_MODEL`; de meegeleverde standaard uit het bronmateriaal is `claude-sonnet-4-6`.

**Geen echte Claude-aanroep is in deze bouwronde gedaan.** De daadwerkelijke HTTP-client, payload, guard en integratie zijn getest met geïnjecteerde responses. De studio is de plek om met je eigen API-toegang de echte formuleringen te beoordelen. API-gebruik kan gesprekstekst naar Anthropic sturen. Eenvoudige maskering van telefoon, e-mail en links vervangt geen anonimisering of privacybeoordeling.

## Eigen berichten gebruiken zonder een live adapter

Kies **Eigen gesprek: maak alleen concepten**. Begin bij een nieuw gesprek zonder eerder uitgebracht bod. Er wordt niets automatisch naar Marktplaats gestuurd. Kopieer het concept en verstuur het zelf. Bevestig daarna alleen met **Ik heb dit zelf verstuurd** als je exact die tekst daadwerkelijk verstuurd hebt. Pas dan wordt dat bod als jouw laatste bod vastgelegd.

Bewerk de tekst niet buiten de app en bevestig hem vervolgens alsof hij onveranderd was. Bij een afwijking of reeds lopende onderhandeling: neem zelf over. BiedBot kan niet controleren wat je handmatig op een andere website hebt verstuurd. Een nieuwe reactie, verlopen concept of gewijzigde instellingen maken een oude bevestiging ongeldig. Handmatige studio-gesprekken staan los van het budgetregister van de fictieve autopilot; de studio is geen compleet order- of aankoopregister.

## Wat is hersteld

De code bepaalt bedragen en fasen; Claude mag tekst formuleren, maar geen nieuwe bedragen kiezen. Het model krijgt een symbolisch `{{BOD}}`, geen vrij te kiezen bod. Code valideert de tekst, vult het vastgestelde bedrag in en controleert de opgeslagen tekst opnieuw vóór dispatch. Context en de laatste berichten gaan mee naar de schrijver. Openingen bevatten geen bod. De toon blijft warm zonder behoeftigheid, zonder verzonnen marktanalyse of eigen ophaalafspraken.

De offline terugval herkent onder meer een leaseauto, bijgehouden onderhoud, een nieuwe koppeling en een tweede eigenaar. Ontbrekende of ongeldige modeluitvoer wordt zichtbaar als terugval gelabeld. Buiten de demo vraagt een modelterugval menselijke beoordeling in plaats van stilzwijgende automatische verzending. Akkoord, stop, overdracht en andere veiligheidsstappen zijn bewust deterministisch.

De gespreksmotor begrijpt nu de aangetoonde probleemzinnen, stelt niet overal een generieke prijsvraag en accepteert het actuele bod in plaats van een oud anker. Een tegenbod gevolgd door een los “akkoord” in dezelfde berichtenreeks wordt niet blind gelezen als instemming met het oudere eigen bod.

## Wat is extra beschermd

Concepten zijn gekoppeld aan de bronreactie, gespreksstaat, instellingen en teksthash. De geldigheid is maximaal vijftien minuten. Een noodstop, nieuwe input, menselijke overname, verlopen koopintentie of beleidswijziging trekt oude concepten in. Financiële profielwijzigingen zetten lopende onderhandelingen in review; eerder verstuurde prijzen worden niet achteraf herschreven.

Het oorspronkelijke uitgaande-berichtenregister met ontvangstbewijzen blijft intact. Bij een onzekere verzending volgt geen blinde retry. Een wacht op Claude houdt geen SQLite-schrijftransactie open. Historische klaarstaande sjablonen moeten in de nieuwe worker eerst opnieuw worden gecomponeerd. Afzonderlijke instellingen bevestigen een echte koopintentie deze week en echte alternatieven. De weekclaim verloopt automatisch op de volgende maandag in Amsterdam.

Er is geen algemene garantie dat vrije Nederlandse tekst altijd correct wordt begrepen. Tekstguards, gecontroleerde terugval en menselijke overname beperken risico, maar bewijzen geen waterdichte semantische beoordeling.

## Testen en bewijs

```sh
npm run check
npm test
npm run test:dom
npm run test:studio
npm run test:browser
npm run test:windows
npm run package
```

Deze bouwronde: **530/530 Node-tests**, **14/14 Chromium-DOM-tests voor de bestaande interface**, **10/10 nieuwe studio-DOM-tests**. Browser-DOM gebruikt eigen broncode in `about:blank` met gemockte netwerkresponsen. De echte lokale HTTP-/SQLite-studio is apart getest. Browsernavigatie in deze bouwomgeving is door beheerdersbeleid geblokkeerd; dat is geen geslaagde end-to-endtest. Windowsacceptatie is niet opnieuw uitgevoerd.

Alle 401 oorspronkelijke tests slagen, plus 129 nieuwe. De vijf kernfouten uit de audit zijn eerst rood en daarna groen vastgelegd. De 24 oorspronkelijke bewijsbestanden zijn bytegelijk behouden. Zie `reports/communication-rebuild/` en `docs/RELEASE_STATUS.md`.

## Niet stilzwijgend gewijzigd of geactiveerd

De Edge-opzet, lokale opslag, installer, onboarding, demo, financiële grenzen, stopknop, betaal-/licentiebouwstenen en het bestaande prijsvoorstel blijven behouden. De interne limieten van twintig nieuwe contacten en tachtig berichten zijn geen bewezen veilige Marktplaats-quota. Er is geen providerbetaling, abonnement, e-mail, echte verkoper, GitHub-publicatie, domeindeployment of externe Codex-taak geactiveerd.

De live adapter blijft afhankelijk van toegestane platformtoegang en een echt getest bron-/ontvanger-/receiptcontract. Betaling, publisher signing en beheerde updates vereisen externe configuratie en acceptatie. Lees de releasevoorwaarden voordat je dit als product verkoopt.
