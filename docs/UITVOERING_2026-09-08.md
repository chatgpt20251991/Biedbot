# Uitvoering CODEX_START_HIER.md

Build **0.1.0-pilot.2**, 8 september 2026. De aangewezen repository is [chatgpt20251991/Biedbot](https://github.com/chatgpt20251991/Biedbot). Deze was leeg; de aangeleverde broncode en oorspronkelijke audit zijn de basis van de import. Dit rapport beschrijft uitgevoerd werk en externe acceptatie die nog ontbreekt. Het is geen toestemming voor live inkoop.

## De zes herstelpunten

| Bevinding | Herstel | Regressiebewijs |
|---|---|---|
| Achterhaald ACCEPT na nieuwe input | Bronversie en toestand bij outbox; intrekken bij nieuwe input; hercontrole na classifierwachten, claim en dispatch; late achterhaalde acceptatie wordt REVIEW | Store-regressies vóór/na queue, classifierwachten, dispatch en receipt; bewijs van oorspronkelijke fouten apart |
| Oude reserveringen omzeilen limieten | Atomaire dispatchquota voor Nederlandse kalenderdag én laatste 24 uur; maximaal 20 openingen/80 berichten; sending/uncertain verjaren niet zonder reconciliatie | Oude wachtrij, middernacht/wintertijd, grens tussen claim en dispatch, SQLite-workers en vier echte OS-processen |
| `Akkoord?` wordt koopbevestiging | Volledige, stellige akkoordzin vereist; vragen, onzekerheid, voorwaarden, negaties en ambigue bedragen conservatief; geldige planningsvraag na akkoord behouden | 62 nieuwe Nederlandse regressies en 128 expliciet synthetische evaluatiegevallen |
| Andere chatontvanger na openen | Unieke account-, listing-, seller- en conversation-ID; controle rond openen/klikken; gebonden snapshots en receipt; exacte onveranderde bron vereist | 21 adaptertests inclusief vier extra door onafhankelijke review gevonden races; echte lokale Edge-fixture |
| Windows-ZIP neemt uitgesloten bestanden mee | Eén expliciete bestandslijst bepaalt manifest én ZIP op alle platforms; stabiele ZIP-metadata; pad-/symlinkcontrole | Canarybestanden, exacte archiefstructuur en twee bytegelijke builds |
| ASCII-launcher beschadigt gebruikerspad | UTF-16 VBS, robuuste PowerShell-starter en Unicode-snelkoppeling; gescheiden app/data; installerrollback | Echte PowerShell 5.1-installatie/start/stop/verwijdering met Unicode, spaties en ampersand |

De oude `reproduce-*`-scripts zijn ongewijzigd bewaard en controleren bewust het vroegere defect. Ze zijn geen vrijgavecheck voor deze reparatie. Nieuwe gewone regressietests eisen de veilige uitkomst. Rode en groene uitvoer zijn apart vastgelegd.

## Werkstromen A–E

| Stroom | Uitgevoerd | Nog vereist voor livevrijgave |
|---|---|---|
| A · Windows | Reproduceerbare ZIP; manifest-only installatie; Unicode-start; logs; foutafhandeling en installatieterugdraaiing; offline signed-updateverificatie/staging/pointer/rollback | Tweede onafhankelijke pc, schone Windows 11 zonder Node, echte runtimedownload, uitgeverscertificaat, updatekanaal/launcherintegratie en crash/power-loss/SmartScreen/AV-acceptatie |
| B · Platform | Actuele voorwaarden geraadpleegd; sterker identiteits-/bron-/receiptcontract; lokale browserfixture | Schriftelijk toegestane toegang, werkelijk ingelogd contract en door deelnemers beheerde testgesprekken; geen echte verkopers benaderd |
| C · AI | Procesopt-in voor veilig lokaal beheerde Anthropic-sleutel; model zonder tools of prijsbevoegdheid; budget/foutafhandeling; evaluatierunner en synthetische NL-corpus | Expliciet geregelde sleutel/toegang, echte provider-evaluatie met toegestane geanonimiseerde gesprekken; nul fouten op synthetische tests bewijst geen live foutpercentage |
| D · Commercieel | Afzonderlijke publisher-testbackend: auth, persistente orders/provideroperaties, kalendermaandfacturen met onveranderlijke betaalbinding, webhook-reconciliatie, abonnementsstatus/opzegging en korte exclusieve devicelease | Provider-testmodus end-to-end op werkelijk account inclusief retry-/factuurbindingscontract, hosting/authbeheer, echte voorwaarden/consent/btw/invoices/e-mail-inrichting en beheerde issuer |
| E · Operations | Bron-/dispatch-/receiptbewijs; volledige logische versleutelde SQLite-backup/herstel; retention en wisfunctie; behoud dedup/quota; lokale profiellease en concrete healthchecks | Beoordeling privacy/retentie en opslag, productie sleutelbeheer, apparaat-/netwerk-/slaap-/crashproeven en supportproces |

Details: [platform](MARKTPLAATS_ACCESS_REVIEW_2026-09-08.md), [backend](D_BACKEND.md), [operations](OPERATIONS.md), [updates](UPDATES.md).

## Bewijs en herhalen

Voer met Node 24 vanuit de projectmap `npm run check`, `npm test`, `npm run evaluate`, `npm run test:dom`, `npm run test:browser`, `npm run test:windows` en `npm run package` uit. `npm test` en browserfixtures zetten AI expliciet offline. Injected mocks raken geen provider. De dataset is synthetisch en wordt ook zo in het evaluatierapport beschreven.

Nieuwe uitvoer: `reports/revision-2026-09-08/`, plus de gedateerde NL-, AI- en billingrapporten direct onder `reports/`. Alle 15 oorspronkelijke rapportbestanden en alle 9 oorspronkelijke auditbestanden zijn bytegelijk behouden; gewijzigde broncode is apart reviewbaar in Git.

De Windowsbrowsercontroles gebruiken echte Edge op eigen lokale fixtures en de lokale app. Ze bewijzen geen Marktplaats-selectors of ingelogde accountacceptatie. De Windowslaunchertest draait een echte agent en worker zonder browservenster; zij bewijst geen tweede machine. Fixtureprofielen blijven voor diagnose onder genegeerd `work/browser-fixtures/`, uitgesloten van de distributie. Een eerdere tijdelijke profielmap buiten de werkmap kon door automatische goedkeuringscontrole niet worden opgeruimd en is ongemoeid gelaten.

## Oplevering en besluit

Gewijzigde broncode, een reproduceerbare pilot-ZIP, echte testlogs, checksums en dit overzicht worden geleverd. `docs/RELEASE_STATUS.md` bevat het actuele vrijgavebesluit. De volledige commerciële/live acceptatiecriteria van de oorspronkelijke handoff zijn **nog niet gehaald**; ontbrekende toegang en externe bewijzen zijn geen geslaagde tests. Er zijn geen echte contacten, betalingen, abonnementen of AI-aanroepen uitgevoerd en geen vrijgavegates verwijderd.
