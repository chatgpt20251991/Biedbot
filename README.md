# BiedBot Edge — lokale dealer-pilot

**Versie 0.1.0-pilot.1 | gebouwd 7 september 2026 | DEMO, niet live vrijgegeven**

Dit pakket bevat uitvoerbare applicatiecode, een lokale worker, SQLite-opslag, een dealerinterface, een deterministische onderhandelaar en geautomatiseerde tests. Het is niet alleen een HTML-mockup. De standaarduitvoering gebruikt fictieve advertenties en verkopers. Er wordt niets naar Marktplaats verstuurd.

## Begin hier

Open `START_HIER.html`. Op Windows: pak de volledige ZIP uit en dubbelklik `INSTALLER_BiedBot.cmd`. Die persoonlijke installatie maakt een bureaubladsnelkoppeling en haalt zo nodig een officiële Node.js-runtime op. De runtime wordt met SHA-256 en een geldige Windows-handtekening gecontroleerd. Deze installer is in deze Linux-bouwomgeving NIET op Windows uitgevoerd. Er is geen ondertekende BiedBot-EXE meegeleverd.

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

**Niet installeren/vermarkten als een werkende live Marktplaats-inkoper.** De oorspronkelijke volledige codebase is niet teruggevonden; dit is een nieuwe implementatie op basis van de overdracht en gespreksspecificatie. De live-adapter heeft geen gevalideerd ingelogd Marktplaats-selectorcontract. Windows-installatie, echte platformcommunicatie, Claude-aanroepen en Mollie-betalingen zijn niet in productie getest. De browsernavigatietest is in deze omgeving geblokkeerd door beheerdersbeleid; DOM-rendering is afzonderlijk getest.

Geen automatische updater, productie-opschoning, gepubliceerde checkout, hosted licentieserver, externe privacycontrole of ondertekende EXE. Geen bugvrij-garantie. Zie `docs/RELEASE_STATUS.md` en `docs/TESTRESULTATEN.md` voor de exacte grenzen.

## Ontwikkelen / opnieuw testen

```sh
npm run check
npm test
npm run test:dom
npm run test:browser
npm run package
```

`test:dom` rendert eigen HTML/JS in Chromium met gemockte fetch, zonder paginanavigatie. `test:browser` test echte navigatie naar een eigen lokale fixture; de aangeleverde uitslag daarvan is **geblokkeerd**, niet geslaagd. Geen test benadert echte verkopers. Op Windows/Linux met een toegankelijke testbrowser moet deze test opnieuw worden uitgevoerd.

## Bestanden

`src/core` bevat regels, transacties en licentievalidatie. `src/worker` bevat de autonome worker. `src/adapters` bevat demo, CDP, browsercontract en Anthropic. `src/billing` bevat de Mollie-component. `scripts` bevat installatie, controles en packaging. `tests` bevat de tests; `reports` bevat echte resultaten. `docs/CODEX_HANDOFF.md` is de werkopdracht voor vervolgbouw, niet het bewijs van een gestarte Codex-taak.

## Gegevens en afsluiten

Windowsgegevens: `%LOCALAPPDATA%\BiedBotEdge`. App/runtime: `%LOCALAPPDATA%\BiedBotEdgeApp`. Sluit de agent af via **Agent & controle → Agent afsluiten**. Alleen het venster sluiten kan de worker laten doordraaien. Na een volledige herstart staat Autopilot bewust uit. De computer moet aan en wakker zijn.

Gesprekken in SQLite zijn niet integraal versleuteld op schijf. Gebruik de Windows-gebruikersafscherming en laat opslagbeveiliging vóór productie beoordelen. De versleutelde export beschermt alleen dat exportbestand; het is geen complete herstelbare image van de installatie of browsercookies.
