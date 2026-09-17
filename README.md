# BiedBot Edge 0.2.1-pilot.1

Deze herstelversie brengt de gesprekken dichter bij de oorspronkelijke BiedBot-opzet: kalm en zelfverzekerd openen, aansluiten op de verkoper en beheerst onderhandelen. De bedragen en prijsgrenzen blijven beslissingen van de code.

De schrijver kan eerdere verkopersinformatie gebruiken, houdt rekening met correcties en past de gekozen toon toe. Normale zinnen zoals “Ik kom je tegemoet” worden niet meer als ophaalafspraak afgewezen. Voorafgaande biedreacties hoeven niet steeds hetzelfde voorbehoud te herhalen; bij akkoord blijft bezichtiging en controle uitdrukkelijk vermeld.

## Eerst de gesprekken bekijken

Open `reports/conversation-style/GESPREKKEN.html`. Het overzicht bevat volledige synthetische gesprekken met de echte offline uitvoer en een afzonderlijke, duidelijk gelabelde testschrijver. Het is materiaal om de stijl te beoordelen. Er zijn in deze herstelronde geen echte Claude-antwoorden gegenereerd.

Je kunt ook zelf de verkoper spelen in **Gespreksstudio > Oefenen**. De app toont per bericht of het door Claude, offline gespreksregels of een vaste stap is geschreven. Als een AI-antwoord is afgewezen, staat de reden erbij in gewone taal.

## Starten op Windows

Pak de hele ZIP uit en open `START_HIER.html`. Sluit een eerder draaiende BiedBot af via **Agent & controle > Agent afsluiten**. Maak bij bestaande gegevens eerst een volledige versleutelde backup.

Gebruik `INSTALLER_BiedBot.cmd` voor de persoonlijke installatie. Met Node.js 22.16 of hoger werkt ook `START_BiedBot.cmd`. `npm install` is niet nodig. De gewone start is offline: er is geen API-sleutel nodig en er worden geen echte verkopers benaderd.

Vul het bedrijfsprofiel in en kies onder **Inkoopprofiel** de gewenste gesprekstoon. Bevestig koopintentie deze week en alternatieven uitsluitend als die daadwerkelijk kloppen. Open daarna de gespreksstudio. Alle standaard demo-activiteiten blijven gescheiden van echte contacten.

## Claude laten schrijven

De bestaande afzonderlijke start `START_MET_CLAUDE.cmd` vraagt expliciet toestemming voor betaald Anthropic-gebruik en daarna afgeschermd om je eigen sleutel. De sleutel wordt niet in de appdatabase of een configuratiebestand bewaard. Tijdens het draaien staat hij wel in het geheugen en de procesomgeving; afsluiten beëindigt die sessie.

Deze start activeert zowel classificatie als schrijven. Een sleutel alleen of alleen een actieve classifier schakelt de schrijver niet in. De daglimiet telt AI-verzoeken, geen euro's. Gesprekstekst kan naar Anthropic worden gestuurd; eenvoudige maskering is geen volledige anonimisering.

Op Linux/macOS gebruikt de bestaande aansluiting `ANTHROPIC_API_KEY`, `BIEDBOT_AI_PROVIDER=anthropic` en `BIEDBOT_WRITER_PROVIDER=anthropic` in de procesomgeving. Gebruik geen sleutel als opdrachtregelargument of in een chat. Het schrijfmodel is configureerbaar met `BIEDBOT_WRITER_MODEL`.

## Eigen gesprek: alleen concepten

De handmatige studiostand is voor een nieuw gesprek zonder eerder uitgebracht bod. Kopieer het concept en verstuur het zelf. Bevestig **Ik heb dit zelf verstuurd** uitsluitend als exact die tekst werkelijk is verzonden. BiedBot kan handmatige verzending op een andere website niet controleren. Nieuwe input, verlopen concepten of gewijzigde instellingen maken oude bevestigingen ongeldig.

Bij bestaande onderhandelingen of buiten de app aangepaste teksten: neem zelf over. De handmatige studio is geen volledig aankoop- of budgetregister. Automatische live verzending blijft afhankelijk van een afzonderlijk geverifieerde platformaansluiting.

## Verificatie en grenzen

Zie `docs/RELEASE_STATUS.md` voor de actuele testresultaten en `docs/GESPREKSSTIJL_HERSTEL.md` voor de bronvergelijking en gemaakte keuzes. Historische rapporten zijn behouden en gelden niet automatisch als bewijs voor deze versie.

```sh
npm run check
npm test
npm run test:dom
npm run test:studio
npm run test:browser
npm run test:windows
npm run review:conversations
npm run package
```

De controles gebruiken lokale testgegevens en geïnjecteerde modelantwoorden. Gebruikersacceptatie van de stijl en evaluatie met echte modeluitvoer zijn afzonderlijke stappen. Deze build is niet vrijgegeven voor autonome live inkoop of een betaalde dealeruitrol. De prijsgrenzen, maximaal twee peilingen/drie concessies, menselijke overdracht, noodstop en bescherming tegen achterhaalde concepten blijven behouden.

De oude SaaS-database en de los aangeleverde relay worden niet aangepast door deze herstelversie. Er worden geen bestaande accounts, betalingen of abonnementen geactiveerd.
