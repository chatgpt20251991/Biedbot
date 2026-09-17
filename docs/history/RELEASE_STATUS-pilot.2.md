# Vrijgavestatus · 0.1.0-pilot.2

8 september 2026. **GO voor een lokale technische demo. NO-GO voor onbeheerde live inkoop of betaalde dealeruitrol.**

De zes fouten uit `CODEX_START_HIER.md` zijn hersteld. Werkstromen A–E zijn lokaal uitgewerkt; onafhankelijke review heeft extra bron-/receipt- en betaalrechtenraces gevonden en laten repareren. Het volledige uitvoeringsoverzicht staat in [UITVOERING_2026-09-08.md](UITVOERING_2026-09-08.md).

## Daadwerkelijk uitgevoerd

401/401 Node-tests, 20 browsercontroles, 14 DOM-controles en 8 geïsoleerde Windowsacceptatiegevallen geslaagd. Node v24.15.0, Windows 10.0.26200. De eindcontrole `npm run verify` heeft exitcode 0. Alle 24 oorspronkelijke rapport-/auditbestanden zijn opnieuw op bytegelijke SHA-256 gecontroleerd. Nieuwe tests hebben waar van toepassing eerst aantoonbaar gefaald op de oorspronkelijke code.

| Onderdeel | Feitelijke status |
|---|---|
| Nieuwe input, outbox, caps, prijsacceptatie | Regressies en echte SQLite-transacties, workers en OS-processen geslaagd |
| Browser/ontvanger/bron/receipt | Echte Edge op uitsluitend eigen lokale fixtures; exacte broncontrole en atomair gebonden snapshots |
| Interface | Lokale HTTP-app met echte worker; desktop/mobiel, volledige backup en inhoud wissen getest |
| Windowsdistributie | Lokale acceptatie op één Windows 11-host, plus een onafhankelijke GitHub Windows-runner; Unicode/spaties/ampersand, start/shutdown, foutlogs, installerrollback en deïnstallatie bewezen |
| ZIP | Manifestgestuurde bestandsselectie; canary-uitsluitingen en herhaalbaarheid getest; SHA-256 is geen uitgevershandtekening |
| AI | Configureerbare Anthropic-classifier, standaard offline; mocks en 128 synthetische NL scenario's; geen echte AI-aanroep |
| Checkout/licentie | Afzonderlijke loopback publisher-backend met echte SQLite/HTTP en geïnjecteerde provider; geen betaalprovidertransactie |
| Operations | Volledige versleutelde logische databasebackup/herstel, retention/wissen, dedup/quota-behoud, profiellease en concrete healthchecks |
| Updates | Geteste offline Ed25519-verificatie, staging, atomische pointers en rollback; geen actief updatekanaal of launcher-integratie |
| GitHub | Oorspronkelijke import en herstelbuild gepubliceerd op `main`; herstelcommit `e02ab477511cd5e8284cf1e0ad83abb2c4ba3799` heeft exact dezelfde bestandsboom als de geteste lokale commit `f63f85b`. De aanvullende Windows-testfixturefix is ook gepubliceerd. Zie de [geslaagde Actions-run](https://github.com/chatgpt20251991/Biedbot/actions/runs/34186387488) en [publicatiebewijs](../reports/github-publication-2026-09-08.json). Geen PR: dit is de eerste import in de lege repository. |

De [GitHub Actions-run na herstel van de Windows-testfixture](https://github.com/chatgpt20251991/Biedbot/actions/runs/34186387488) is geslaagd: alle vier combinaties van Linux/Windows met Node 22/24 en de afzonderlijke Windows browser-/installatiejob. De eerste run vond dat PowerShell het gemaskeerde ProgramFiles-pad herstelde; de negatieve browserfixture stelt dat pad nu na PowerShell-initialisatie in. Timeouts tellen nooit als een geslaagde verwachte fout en een afgebroken run kan geen oude groene acceptatiesamenvatting behouden. Dit bewijst geen fysieke Windows 11-dealercomputer, live platformtoegang, echte AI-call of betaling. Publicatiedocumentatie en het bijgewerkte manifest wijzigen geen app- of testcode; die vervolgcommit slaat CI expliciet over. Het oorspronkelijke lokale bewijs blijft intact.

## Openstaande vrijgavevoorwaarden en precieze vervolgstap

1. **GitHub:** de eerdere 403 is opgelost door de ChatGPT Codex Connector te installeren. De bron is gepubliceerd en opnieuw opgehaald voor een bytegelijke vergelijking. Controleer de actuele Actions-resultaten voor de gewenste codeversie; de Git-bundle bewaart zowel de lokale als de gepubliceerde geschiedenis. Er is geen token in de bron of distributie geplaatst.
2. **Windows:** voer de acceptatie opnieuw uit op een schone Windows 11 zonder Node en op een tweede onafhankelijke computer; bewijs echte download, Edge-appvenster, slaap/herstart en SmartScreen/AV. Deze hosttest bewijst dat niet.
3. **Platform:** verkrijg aantoonbaar toegestane data-/messagingtoegang, testaccounts en expliciet toegestane gesprekken. Valideer het echte account-/advertentie-/seller-/conversation-/message-/receiptcontract. Er is geen live schakelaar vrijgegeven.
4. **AI:** regel expliciete providertoegang en veilig sleutelbeheer; evalueer toegestane geanonimiseerde Nederlandse gesprekken bij de echte provider. Synthetische nul-foutenresultaten voorspellen geen live false-accept-rate.
5. **Betalen/licenties:** bewijs de volledige flow in echte provider-testmodus, inclusief het factuur-/retrybindingscontract, refund/chargeback, opzegging en issuer. Vul klantvoorwaarden, privacy/consent, belasting/facturen, e-mail en hostingbeheer in. Onbekende herhaalbetalingen mogen geen serviceperiode betalen.
6. **Signing/operations:** richt een beheerde signingidentiteit, sleutelrotatie en updatekanaal in; integreer de veilige updatebouwstenen met de launcher en test crash/power-loss/rollback. Rond privacy/retentiedoelen, opslagbescherming, sleutelbeheer en support af.

De oude vrijgavestatus blijft bewaard in [history/RELEASE_STATUS-pilot.1.md](history/RELEASE_STATUS-pilot.1.md). De oorspronkelijke acceptatiecriteria zijn niet afgezwakt. Geen ongevraagde verkopersberichten, echte AI-calls, betalingen, abonnementen of e-mails zijn uitgevoerd. De demo blijft de enige actieve platformadapter.
