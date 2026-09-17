# BiedBot: volledige broncode en autonome herstelopdracht

Overdracht voorbereid op 8 september 2026. **Er is geen externe Codex-taak gestart of bevestigd.** Dit bestand en deze ZIP zijn een overdracht, geen bewijs van een draaiende ontwikkeltaak.

## Opdracht

Open `BiedBot_Edge/` als project. Werk zelfstandig door aan de fouten hieronder en daarna aan de bestaande ontwikkelbriefing `BiedBot_Edge/docs/CODEX_HANDOFF.md`. Maak concrete, reviewbare codewijzigingen, regressietests en een nieuwe distributie. Vraag niet voor iedere lokale, omkeerbare stap bevestiging. Noteer ontbrekende toegang of testomgevingen en werk verder aan uitvoerbare onderdelen. Garandeer geen bugvrije of dealerklare versie zonder de vereiste acceptatiebewijzen.

Lees eerst `AGENTS.md`, `README.md`, `docs/RELEASE_STATUS.md`, `docs/GESPREKSLOGICA_MAPPING.md` en `docs/CODEX_HANDOFF.md`. De oorspronkelijke 71 ZIP-bestanden zijn in deze overdracht bytegelijk behouden. Er zijn in dit pakket **geen reparaties uitgevoerd**. De extra auditbestanden staan in `audit-overdracht/`; eerdere `reports/` blijven intact.

## Eerst herstellen

| Prioriteit | Bevinding | Bewijs en hersteldoel |
|---|---|---|
| 1 | Een klaargezette `ACCEPT` wordt verzonden nadat een nieuw verkoperbericht “Niet akkoord” binnenkomt. | Op ongewijzigde code gereproduceerd met lokale SQLite in geheugen. `src/core/store.mjs`: `ingest`, `queueDecision`, `claimSend`, `sent`. Nieuwere input moet een achterhaald besluit intrekken of opnieuw laten beoordelen, ook tijdens classifierwachten en vlak vóór dispatch. Onzekere verzending niet blind herhalen. |
| 1 | Openingsberichten die meer dan 24 uur wachten vallen buiten de quotatelling; 20 oude plus 20 nieuwe reserveringen kunnen op dezelfde dag alle 40 worden verzonden. | Gereproduceerd. Controleer limieten atomair bij dispatch en behandel oude reserveringen en gelijktijdige claimers correct. Bewaar zowel de Nederlandse kalenderdag als de rollende 24-uursgrens en de cap voor alle berichten. Geen grotere limieten instellen als oplossing. |
| 1 | `Akkoord?` wordt als definitief akkoord op het laatst verzonden bod behandeld. | Gereproduceerd in `src/core/negotiation.mjs`. Een vragende of onzekere formulering mag geen koopbevestiging of HOT_LEAD opleveren. Voeg onderscheidende Nederlandse scenario's toe voor vragen, negaties, voorwaarden en echte prijsacceptatie; bewaar terechte akkoorden met een aansluitende planningsvraag. |
| 1 | Na `openChat` leest de adapter de verkoper opnieuw, maar vergelijkt die niet opnieuw met de bedoelde ontvanger. | Opnieuw bevestigd met lokale CDP-mock, zonder echte browser of Marktplaats. `src/adapters/approved-browser.mjs`: tweede `guard` in `send`. Valideer account-, advertentie-, verkoper- en gespreksidentiteit op de daadwerkelijk geopende chat vóór een side effect en vóór het accepteren van een ontvangstbewijs. Stop bij afwijking of ontbrekend bewijs. |
| 1 | Windows-verpakking gebruikt `Compress-Archive` op hoofdmapinhoud in plaats van de gefilterde manifestlijst. | Statische broncontrole, niet uitgevoerd op Windows. `scripts/package.mjs`. Daardoor kunnen uitgesloten `.env`, `.pem`, SQLitebestanden of gelijksoortige bestanden toch in de Windows-ZIP belanden. Gebruik hetzelfde expliciete pakketbestandcontract op beide platforms; test archiefinhoud met onschuldige canarybestanden. Bewaar ook de bedoelde mapstructuur. |
| 2 | De Windows-launcher wordt met ASCII geschreven terwijl volledige gebruikerspaden in de VBS staan. | Statische broncontrole, niet uitgevoerd op Windows. `scripts/Install.ps1`. Niet-ASCII gebruikersnamen kunnen in het pad veranderen in `?`. Gebruik een ondersteunde Unicodecodering of een robuust startmechanisme; verifieer starten en deïnstalleren op Windows met Unicode en spaties in het gebruikerspad. |

## Reproduceren en regressietesten

Gebruik Node 24 vanuit `BiedBot_Edge/`:

```sh
node audit-overdracht/reproduce-core-findings.mjs
node audit-overdracht/reproduce-adapter-mock.mjs
npm run check
npm test
npm run test:dom
npm run test:browser
```

De twee `reproduce-*` scripts bevestigen bewust het **gebrekkige gedrag** van de oorspronkelijke pilot. Exitcode 0 betekent “bevinding gereproduceerd”, niet “veilig” of “vrijgegeven”. Zet deze gevallen om in normale regressietests die de gewenste veilige uitkomst eisen voordat je repareert. Een gerepareerde versie hoort de oude kwetsbaarheidsasserties niet meer te halen; behoud het oorspronkelijke bewijs apart.

Voeg betekenisvolle tests toe voor nieuwe input vóór queue, na queue en tijdens wachten; de cap bij oude wachtrijen, middernacht en gelijktijdige processen; vragende akkoorden; een andere verkoper na chatopening; Windowspakketuitsluitingen; en een Unicode-installatiepad. Pas geen verwachte testuitkomst aan om een fout te verbergen.

## Wat werkelijk is gecontroleerd

- Eerdere lokale review van 7 september: 197 bestaande Node-tests geslaagd, 0 mislukt, op Linux met Node 24. De onbewerkte uitvoer staat in `audit-overdracht/unit-tests-current.tap` (de bestandsnaam zegt TAP, de inhoud is de oorspronkelijke npm/Node-uitvoer).
- De bijbehorende syntaxcontrole meldde 29 gecontroleerde JavaScriptbestanden.
- DOM- en browsertests konden in die review niet starten omdat Edge/Chrome ontbreekt; de foutlogs zijn bijgevoegd. Dit is geen geslaagde browsercontrole.
- De eerste drie gebreken en de adaptermock zijn op 8 september opnieuw uitgevoerd tegen deze ongewijzigde bron. De JSON-resultaten en relatief importeerbare scripts zijn bijgevoegd.
- Windowsbevindingen zijn uitsluitend statisch gecontroleerd. Er is geen Windows-installatieacceptatie, Windows-packagerun, live Marktplaats-test, echte AI-aanroep of betaalprovidertransactie bewezen door dit pakket.

## Daarna doorbouwen

Volg alle werkstromen A t/m E van `docs/CODEX_HANDOFF.md`: Windowsdistributie, toegestane platformadapter, echte AI-integratie en evaluatie, checkout/licentiebackend en operations. Houd prijsbeslissingen deterministisch en waarheidsgetrouw, maximaal twee peilingen/drie concessies en menselijke overdracht. Wijzig of activeer geen live accounts, betalingen, abonnementen of contacten vanuit deze overdracht. Maak integraties en testflows reviewbaar met gescheiden fixtures en provider-testmodus waar toegang is geregeld; verwijder geen releasegates om ontbrekend bewijs te verhullen. Voer geen ongevraagde berichtentest op echte verkopers uit.

Lever gewijzigde broncode, een nieuwe reproduceerbare distributie, echte testlogs, een concrete vergelijking van opgelost/resterend en een bijgewerkte vrijgavestatus. Houd oorspronkelijke rapporten en bewijzen intact. Laat geblokkeerde externe of Windowschecks expliciet als onbewezen staan en meld de precieze vervolgstap.
