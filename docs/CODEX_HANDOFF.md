# Codex-werkopdracht: van geteste demo naar vrijgegeven lokale inkoper

Dit document is een uitvoerbare ontwikkelbriefing voor een volgende sessie. Er is vanuit deze chat GEEN Codex-taak gestart. De huidige broncode is lokaal gebouwd en de applicatieworker is daadwerkelijk getest. Een passende oorspronkelijke GitHub-repository was niet gevonden. Deze map kan als zelfstandig project in Codex worden geopend.

## Begin met bewijs, niet met een extra redesign

Lees README en AGENTS.md. Controleer de echte reports. De eerste prioriteit is een schone Windows-installatie. Het meegeleverde GitHub Actions-workflowbestand bevat Windows-/Linuxkernchecks, maar er is geen Actions-run uitgevoerd of repository gepusht.

## Werkstromen

**A. Windowsdistributie.** Test de PowerShell5-installer op Windows11 zonder Node. Zorg voor duidelijke logs en herstel bij geblokkeerde handtekeningcheck, offline download en ontbrekende Edge. Schrijf echte installatie/de-installatieacceptatiebewijzen. Bouw daarna een ondertekende distributie met secure updates en rollback. Geen AV-exclusions of stille adminrechten.

**B. Platformadapter.** Verifieer toegestane data-/messagingtoegang. De huidige fixturevelden zijn GEEN Marktplaats-selectors. Neem de oorspronkelijke scraper/messenger alleen over nadat de precieze bron is geïnspecteerd. Maak een contract met advertentie-ID, geverifieerde particulierstatus, seller-ID, account-ID, gesprek-ID, bericht-ID/richting en post-sendbewijs. Doe geen ongevraagde massatest. Los ambiguïteit op met stoppen, niet met “klik het eerste matchende element”.

**C. AI.** Koppel Anthropic server-side of met veilig lokaal beheerde dealersleutel. Geef het model geen browsertools, licentierechten of prijsbeslissingen. Bouw een evaluatieset met veel meer Nederlandse echte/toegestane geanonimiseerde gesprekssituaties. Bewijs false-accept-rate en foutafhandeling; synthetische demo-uitkomsten zijn geen commercieel succesbewijs.

**D. Commercieel.** Implementeer echte authentication/checkout/orderledger/subscriptionstatus/licentiebackend. Verifieer providerwebhooks en wees idempotent. Configureer belasting, toestemmingen, e-mails en opzegging. Er zijn gatewayfuncties, geen gedeployde betaalsite. Publiceer niets zonder ingevulde klantvoorwaarden en providerconfiguratie.

**E. Security/operations.** Sla source-to-send bewijs op, voeg bewaartermijn/wisfunctie en herstelbare versleutelde backup toe, minimaliseer PII, voeg device lease en veilige profielscheiding toe, en voer crash/slaap/netwerk/updatescenario's uit. Periodieke gezondheid moet betekenisvol zijn, geen willekeurige “groene” score.

## Done betekent

Alle kern- en browserfixturetests groen; Windowsinstallatie op ten minste twee onafhankelijke machines bevestigd; echte toegestane platformtest doorlopen; live AI geëvalueerd; betaal-/licentieflow in provider-testmodus end-to-end bewezen; signing/update/privacy/monitoring afgerond; resterende risico’s schriftelijk gedeeld. Alleen dan een beperkte betaalde pilot vrijgeven.

OpenAI beschrijft niet-interactieve Codex-uitvoering in de officiële documentatie. De lokale uitvoeringsrechten/authenticatie blijven nodig; aanwezigheid van dit handoffbestand start geen job.
Bron: https://developers.openai.com/codex/noninteractive/
