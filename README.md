# BiedBot Edge — lokale dealer-pilot

**Versie 0.1.0-pilot.2 | herstelbuild 8 september 2026 | DEMO, niet live vrijgegeven**

De herstelopdracht uit `CODEX_START_HIER.md` is lokaal uitgevoerd voor [chatgpt20251991/Biedbot](https://github.com/chatgpt20251991/Biedbot). Publicatie is geblokkeerd door ontbrekende GitHub-schrijftoegang (403); de wijzigingen zijn nog niet gepubliceerd. De zes oorspronkelijke defecten zijn hersteld met regressietests. Alle oorspronkelijke bestanden in `reports/` en `audit-overdracht/` zijn bytegelijk behouden. Nieuwe resultaten staan in gedateerde rapporten. Zie [uitvoeringsoverzicht](docs/UITVOERING_2026-09-08.md) voor opgelost/resterend.

Dit pakket bevat uitvoerbare applicatiecode, een lokale worker, SQLite-opslag, een dealerinterface, een deterministische onderhandelaar en geautomatiseerde tests. Het is niet alleen een HTML-mockup. De standaarduitvoering gebruikt fictieve advertenties en verkopers. Er wordt niets naar Marktplaats verstuurd.

## Begin hier

Open `START_HIER.html`. Op Windows: pak de volledige ZIP uit en dubbelklik `INSTALLER_BiedBot.cmd`. Die persoonlijke installatie maakt een Unicode-veilige bureaubladsnelkoppeling en haalt zo nodig een officiële Node.js-runtime op. De runtime wordt met SHA-256 en een geldige Windows-handtekening gecontroleerd. Installeren, starten en verwijderen zijn op deze Windowsmachine in geïsoleerde Unicode-/spatiepaden getest. Twee schone onafhankelijke dealercomputers zijn nog niet bewezen. Er is geen ondertekende BiedBot-EXE meegeleverd.

Met Node.js 22.16 of hoger al geïnstalleerd: dubbelklik `START_BiedBot.cmd`, of voer `npm run demo` uit. Er is geen `npm install` nodig. Op Linux/macOS werkt de HTTP-agent ook; deze zijn niet de beoogde dealerdistributie.

Eenmalig het bedrijfsprofiel invullen, daarna **Start de demo**. De worker selecteert zelfstandig fictieve auto's, stuurt demoberichten, verwerkt reacties en maakt overdrachten. Geen goedkeuring per bericht. De demo is offline; er zijn geen Claude-kosten of afschrijvingen.

## Wat deze versie werkelijk doet

- Lokale HTTP-app op een willekeurige poort, alleen 127.0.0.1, met cookie-authenticatie en CSRF-beveiliging.
- Werkelijke Node workerthread, geen front-endanimatie die zich als backend voordoet.
- SQLite-transacties, gereserveerd budget, advertentie-/verkoperdeduplicatie, 20 nieuwe contacten en afzonderlijke totale berichtenlimiet.
- Daglimiet in Europe/Amsterdam én rollende laatste 24 uur. Dit zijn productlimieten, geen bewezen veilige Marktplaats-quota.
- Nieuwste onderhandelstrategie uit het aangeleverde gespreksbestand: ijsbreker, anker, twee peilingen, drie aflopende concessies, handoff.
- Alle eigen en ontvangen demoberichten opgeslagen. Opt-out, risico of overname trekt klaarstaande acties in.
- Onzekere verzending wordt niet blind herhaald. Een crash kan zo geen automatische dubbele biedingen veroorzaken.
- Dashboard, inkoopprofiel, autokansen, inbox, dealdesk, audittrail, supportexport en versleutelde JSON-export.
- Anthropic-classificatieclient, Mollie-gateway en ondertekende licentiecomponent als afzonderlijke geteste broncodemodules. Niet gekoppeld aan live diensten.

## Wat nog niet gereed is

**Niet installeren/vermarkten als een werkende live Marktplaats-inkoper.** De aangewezen repository was leeg; de aangeleverde broncode is de basis. De live-adapter heeft geen gevalideerd ingelogd Marktplaats-selectorcontract. Echte platformcommunicatie, Claude-aanroepen en Mollie-betalingen zijn niet in productie getest. Lokale browsernavigatie, DOM en de echte demo-worker zijn op Windows getest.

De volledige herstelbare backup, retention/wisfunctie, aparte publisher-testbackend en offline updatebouwstenen zijn beschreven in [operations](docs/OPERATIONS.md), [backend](docs/D_BACKEND.md) en [updates](docs/UPDATES.md). Een gepubliceerde checkout, live licentieserver, extern beoordeelde privacy-inrichting en ondertekende distributie ontbreken. Zie de actuele `docs/RELEASE_STATUS.md`; `docs/TESTRESULTATEN.md` blijft het historische pilotrapport.

## Ontwikkelen / opnieuw testen

```sh
npm run check
npm test
npm run test:dom
npm run test:browser
npm run test:windows
npm run evaluate
npm run package
```

`test:dom` rendert eigen HTML/JS in Chromium met gemockte fetch. `test:browser` test echte navigatie naar eigen lokale fixtures en de HTTP-agent. Beide zijn op deze Windowsmachine geslaagd. Geen test benadert echte verkopers. Fixtureprofielen blijven ter diagnose in de genegeerde map `work/browser-fixtures/` en zijn uitgesloten van de distributie. Windowsfixtures gebruiken een tijdelijke debugger op 127.0.0.1 in hun eigen profiel.

## Bestanden

`src/core` bevat regels, transacties en licentievalidatie. `src/worker` bevat de autonome worker. `src/adapters` bevat demo, CDP, browsercontract en Anthropic. `src/billing` bevat de Mollie-component. `scripts` bevat installatie, controles en packaging. `tests` bevat de tests; `reports` bevat echte resultaten. `docs/CODEX_HANDOFF.md` is de werkopdracht voor vervolgbouw, niet het bewijs van een gestarte Codex-taak.

## Gegevens en afsluiten

Windowsgegevens: `%LOCALAPPDATA%\BiedBotEdge`. App/runtime: `%LOCALAPPDATA%\BiedBotEdgeApp`. Sluit de agent af via **Agent & controle → Agent afsluiten**. Alleen het venster sluiten kan de worker laten doordraaien. Na een volledige herstart staat Autopilot bewust uit. De computer moet aan en wakker zijn.

Gesprekken in SQLite zijn niet integraal versleuteld op schijf. Gebruik de Windows-gebruikersafscherming en laat opslagbeveiliging vóór productie beoordelen. De bestaande exportknop is een beperkte dashboardexport. Gebruik `/api/backup/full` of `scripts/backup.mjs` voor volledige herstelbare databasebackups. Browsercookies en providersleutels horen daar niet bij.

Anthropic blijft standaard offline. Een expliciete procesopt-in `BIEDBOT_AI_PROVIDER=anthropic` met een veilig beheerde `ANTHROPIC_API_KEY` is nodig voor echte classifieraanroepen. Een appinstelling alleen activeert niets. De evaluatieset is synthetisch; uitkomsten bewijzen geen prestaties bij echte verkopers.
