# Vrijgavestatus 0.2.0-pilot.1

10 september 2026. **Uitvoerbare lokale herstelbuild. Geschikt voor een technische demo, gesprekstests en handmatige concepten; niet vrijgegeven voor autonome live inkoop of betaalde dealeruitrol.**

Deze versie is gebouwd uit de aangeleverde broncode. Geen nieuw GitHub- of Codex-resultaat wordt geclaimd. De publicatie- en Windowsrapporten van 8 september blijven historische bronbestanden.

## Actueel uitgevoerd

| Controle | Uitkomst | Bewijs |
|---|---|---|
| Oorspronkelijke code vóór herstel | 401 tests geslaagd | Nieuw vastgelegde baseline |
| Vijf audit-reproducties vóór herstel | 0 van 5 geslaagd | audit-before.tap |
| Node-tests na herstel | 530 van 530 geslaagd | unit-final.tap |
| Bestaande Chromium-DOM | 14 van 14 geslaagd | dom/browser-dom-tests.json |
| Nieuwe studio Chromium-DOM | 10 van 10 geslaagd | studio-dom/studio-dom-tests.json |
| Lokale classificatiecorpus | 128 synthetische gevallen, 0 false accepts, 0 verkeerde prijzen, 0 false rejects | classifier-local.json |
| Adversarieel model dat altijd akkoord zegt | 128 synthetische gevallen, 0 false accepts, 0 verkeerde prijzen, 11 false rejects | classifier-adversarial.json |
| Actuele echte browsernavigatie | Geblokkeerd door ERR_BLOCKED_BY_ADMINISTRATOR | browser/browser-tests.json |
| Nieuwe Windowsversie/launcher | Niet uitgevoerd | Nog acceptatie nodig |
| Echte Anthropic-aanroep | Niet uitgevoerd | HTTP-/integratietests met mocks |
| Marktplaats/koop/betaling | Niet uitgevoerd of geactiveerd | Live adapter blijft dicht |

De nieuwe versietests zijn op Linux met Node 22.16 uitgevoerd. DOM-tests gebruiken echt Chromium, maar eigen HTML in about:blank en gemockte fetch. Ze bewijzen layout en interactie, niet browsernetwerk- of platformgedrag. Echte lokale HTTP, cookies, CSRF, SQLite en studio-overgangen zijn apart in de Node-suite getest. De twee corpusmetingen zijn regressies op synthetische data, geen voorspelling van foutenpercentages in het veld. De 11 false rejects bij een expres onbetrouwbaar model zijn niet weggelaten.

## Gerepareerd en toegevoegd

Een aparte Claude-schrijver is nu daadwerkelijk verbonden met opening, anker, concessie, vasthouden en informatievragen. De nieuwste gesprekscontext wordt meegestuurd. Geld blijft een codebesluit. De prijsplaceholder wordt exact één keer gebruikt, waarna deterministische invulling en hercontrole plaatsvinden. Bronzin, state, policy, expiry en teksthash binden een concept aan zijn geldige situatie.

De studio oefent met dezelfde kern of levert expliciet handmatige concepten. Handmatige bevestigingen zijn geen platformontvangstbewijzen. Geldige financiële toezeggingen uit de studio zijn niet automatisch opgenomen in de fictieve autopilotbudgetreservering.

Nieuwe veiligheidsgevallen omvatten stop/start tijdens Claude, nieuw bericht tijdens Claude, takeover, budgetwijziging, tekstmanipulatie, late output, historische queue-items, aparte schrijfkosten-opt-in, bronprivacy, backupmigratie en expliciete stopformuleringen. Een financiële wijziging pauzeert bestaande onderhandelingen voor review; oude prijzen worden niet achteraf gecorrigeerd alsof ze nooit verstuurd waren.

## Resterende acceptatievoorwaarden

**Gesprekstoon:** gebruik je eigen Claude API in de studio en beoordeel echte, toegestane en zoveel mogelijk geanonimiseerde gesprekken. Deze build claimt geen woord-voor-woord reconstructie van niet-aangeleverde oude Claude-uitvoer. Laat een modelterugval zichtbaar en meet ongewenste review/terugval, niet alleen aantallen geslaagde technische tests.

**Windows:** voer installer, nieuwe masked-key-launcher, appvenster, herstart/slaap, rollback en verwijdering uit op schone Windowscomputers. De nieuwe launcher is geschreven maar niet op Windows uitgevoerd. Laat de beveiligingsinstellingen van de computer intact.

**Platform:** sluit alleen aantoonbaar toegestane toegang aan; valideer echte account-, advertentie-, verkoper-, conversatie-, bericht- en ontvangstidentiteiten. Geen live schakelaar, stealthomzeiling of betrouwbare toezegging op basis van onbewezen selectors.

**Financieel/commercieel:** de betaal-/licentiemodules zijn behouden, niet als werkende checkout uitgerold. Provider-testmodus, prijsaanbod, privacy/voorwaarden, facturatie, opzegging en support zijn externe vrijgavepunten. SHA-256 in de ZIP is integriteitscontrole, geen uitgevershandtekening. Beheerde signing en updatelevering blijven nodig.

**Geen waterdichtheidsclaim:** numerieke prijzen en state zijn hard begrensd in de geteste route; willekeurige taal en omstandigheden buiten de app zijn niet volledig bewijsbaar. Een lokaal kwaadwillend proces onder hetzelfde gebruikersaccount valt buiten deze bescherming. Een bericht dat extern al onderweg is kan niet worden teruggehaald met de stopknop.
