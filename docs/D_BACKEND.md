# Afzonderlijke publisher-testbackend

8 september 2026. **Uitvoerbare lokale basis; geen gepubliceerde checkout en geen bewijs van een betaalprovidertransactie.**

`src/billing/backend.mjs` bevat een afzonderlijke SQLite-backend en een HTTP-server die uitsluitend op `127.0.0.1` luistert. Importeren start niets. De dealerapp en haar demo-worker starten deze backend niet. De constructor weigert een live-Mollie-gateway. Er zijn geen echte API-sleutels, klanten, betalingen, abonnementen, e-mails of hosted endpoints aangemaakt.

## Werkende onderdelen

- Lokale beheerfunctie `createDealer` maakt een account met een gezouten scrypt-wachtwoordhash. Er is bewust geen publieke registratie- of beheerdersroute. Inloggen levert een willekeurige bearer-token op; alleen de hash staat in SQLite. Sessies verlopen na acht uur. Er geldt een limiet op mislukte inlogpogingen. Host en Origin worden gecontroleerd, responses zijn `no-store`, request bodies maximaal 16 KiB.
- `createOrder` bewaart dealer, idempotency-ID, actuele toestemmingen, voorwaardenversies, prijs in gehele eurocenten en een snapshot van de serverconfiguratie. De client kan geen prijs of belastingbedrag meegeven. Een herhaald verzoek levert dezelfde order op. Alle voorwaarden-, privacy-, terugkerende betaling- en opzegtoestemmingen moeten expliciet waar zijn.
- Checkout creëert een Mollie-testklant en een eerste testbetaling via de bestaande gateway. Vóór elke externe schrijfoperatie staat een stabiele operatie in SQLite. Parallelle verzoeken claimen dezelfde operatie niet tegelijk. Provider-idempotency blijft aanvullend aanwezig. Onzekere writes worden niet automatisch herhaald, ook na herstart niet.
- De webhook gebruikt uitsluitend het betaal-ID als aanleiding om de betaling opnieuw op te halen. Het opgeslagen bedrag, de valuta, klant, dealer, order, testmodus en `first`-sequence moeten overeenkomen. Een geposte `status=paid` verleent geen rechten. Na betaling moet de machtiging geldig zijn en wordt de vaste abonnementaanvraag als afzonderlijke operatie opgeslagen. Daarna worden abonnement en machtiging opnieuw bij de provider gelezen.
- Een geverifieerde eerste betaling geeft toegang tot de afgesproken eerste abonnementsdatum. Daarna bepalen opgeslagen kalendermaandfacturen de betaalde serviceperiode. Herhaalde callbacks verlengen dezelfde factuur niet opnieuw. Refunds, chargebacks, ongeldige machtigingen, afwijkende providergegevens en providerfouten blokkeren nieuwe licentie-uitgifte. Een oudere vertraagde callback kan nieuwere reconciliatie niet terugdraaien. Een eenmaal vastgelegde refund/chargeback blijft een blokkade totdat die buiten deze automatische flow is beoordeeld; een latere `paid`-respons zonder reversalvelden wist dat bewijs niet.
- Opzegging blokkeert nieuwe rechten onmiddellijk. DELETE naar het abonnement wordt met een vaste operatie-ID uitgevoerd, waarna de providerstatus opnieuw wordt gecontroleerd. Een nog open, annuleerbare eerste betaling wordt eveneens geannuleerd en opnieuw gecontroleerd. Een niet-annuleerbare of onzekere operatie blijft `cancel_pending`. Betaalde bedragen worden niet automatisch terugbetaald.
- `issueLease` vraagt een publisher-issuer om een ondertekende licentie voor één installatie en maximaal twintig contacten. De private signing key is geen backendconfiguratie- of databaseveld: de issuer is een geïnjecteerde callback. Een lease duurt maximaal vijf minuten en vereist providerbewijs dat minder dan vijf minuten oud is. Een licentie geeft geen platformtoestemming.

## Kalendertermijnen en terugkerende betalingen

De SQLite-tabellen `invoices` en `invoice_payments` leggen verwachte kalenderperioden en afzonderlijke betaalpogingen vast. Elke factuur krijgt een vaste order, periode-index, begin- en einddatum en verwacht bedrag in eurocenten uit het bewaarde abonnement. Er worden geen maanden van dertig of eenendertig dagen opgeteld. De oorspronkelijke maanddag blijft het anker; een start op de laatste maanddag blijft aan het maanduiteinde gekoppeld. Voorbeelden: 31 januari 2027 → 28 februari → 31 maart; 31 januari 2028 → 29 februari → 31 maart. Deze lokale serviceperioden gebruiken expliciete UTC-datumgrenzen; de uiteindelijke providerplanning en tijdzone moeten in de provider-testacceptatie worden bevestigd.

Alleen aaneengesloten betaalde facturen vanaf de abonnementsstart verlengen het recht. Een al betaalde latere maand overbrugt geen ontbrekende eerdere maand. Een geslaagde herstelbetaling kan die ontbrekende factuur betalen, waarna reeds betaalde aansluitende termijnen meetellen. Meerdere betaalpogingen en callbacks voor dezelfde factuur voegen geen extra maand toe. `failed`, `expired`, `canceled`, openstaande betalingen en terugboekingen tellen niet als betaald. Er zijn nul dagen grace: bij het einde van de betaalde periode wordt nieuwe uitgifte geweigerd.

Een mislukte controle van een bekende recurring betaling maakt juist dat factuurbewijs onzeker. Een geslaagde callback voor alleen de eerste betaling kan die onzekerheid niet opheffen; de betreffende maandbetaling moet zelf opnieuw worden geverifieerd.

**Een betaal-ID wordt nooit uitsluitend op basis van `createdAt` aan een maand gekoppeld.** Een retry kan na een maandgrens zijn aangemaakt. Zolang een ondubbelzinnige binding ontbreekt, bewaart de backend alleen een `unbound_payments`-hint en retourneert de webhook `409 PAYMENT_INVOICE_BINDING_REQUIRED`. Zo wordt geen zelfgekozen maand betaald verklaard.

Een lokale publisher-beheerder kan de bestaande serviceperioden voorbereiden met `planInvoices(dealerId, orderId, throughIndex)` en de actuele providerbetaling beoordelen. Daarna legt `bindRecurringPayment({dealerId, orderId, paymentId, invoiceId, evidenceRef})` de binding vast. Deze methode haalt de betaling opnieuw op en controleert klant, bekend abonnement, testmodus, sequence, valuta, exact bedrag, provideridentiteit en machtigings-/abonnementscontract. Het gekozen factuurrecord moet al bestaan. De beheerder moet het juiste factuur-ID uit provider- of boekhoudbewijs bepalen; de vereiste `evidenceRef` legt de verwijzing naar die beoordeling vast. De datum van aanmaak bewijst de factuurperiode niet. De binding, oorspronkelijke providertijd en bewijsreferentie zijn daarna onveranderlijk.

De bindmethode is uitsluitend lokale publisher-administratie en heeft geen dealer-HTTP-route. Een HTTP-webhook, klant of verkoper kan daardoor niet zelf een factuurperiode aanwijzen. Na binding voert `reconcilePayment(paymentId)` de normale onafhankelijke providercontroles uit en verwerkt de betaling idempotent in precies die factuur. Ook de eerste betaling, actuele machtiging en abonnementsstatus worden opnieuw gecontroleerd. Een retry in november voor een oktoberfactuur betaalt daarmee uitsluitend oktober; voor november is nog een eigen betaalde termijn vereist.

Dit is een uitgevoerde lokale operatorflow met synthetisch reviewbewijs. Het is geen bewijs dat de echte Mollie-responses reeds automatisch en betrouwbaar aan BiedBot-facturen gekoppeld kunnen worden. Een automatisch correlatiecontract vereist echte provider-testacceptatie met de juiste factuurreferenties. Er is geen tweede eigen incassoscheduler toegevoegd naast het managed abonnement.

## Devicehouder en intrekking

Een bestaande, ondertekende offline licentie blijft tot het ondertekende vervaltijdstip geldig. Intrekking heeft dus maximaal vijf minuten vertraging voor een al uitgegeven token. Bij opzegging, refund of een andere order wordt de devicehouder in SQLite tot dat vervaltijdstip behouden. Dat voorkomt dat een tweede apparaat via een andere actieve order tegelijkertijd een geldig token krijgt. Nieuwe of verlengde tokens worden meteen geweigerd wanneer de betreffende order geen rechten meer heeft.

## Configuratie en routes

De constructor vereist een gateway met `mode === 'test'`, een issuer-functie, en een expliciete configuratie met `providerTest`, `termsVersion`, `privacyVersion`, `cancellationPolicyVersion`, `taxReviewId`, `invoiceReviewId`, `setupTotalCents`, `monthlyTotalCents`, `redirectUrl`, `webhookUrl`, `subscriptionStartDate` en `emailMode: 'disabled-fixture'`. De HTTPS-URLs gaan alleen als providerconfiguratie mee; er wordt geen URL gepubliceerd. De review-ID's zijn verwijzingen die de publisher zelf moet onderbouwen. Ze vormen geen automatische juridische of fiscale goedkeuring. In de tests zijn het zichtbaar fictieve waarden.

| Route | Gebruik |
|---|---|
| `POST /login` | E-mail en wachtwoord naar sessie-token |
| `POST /logout` | Sessietoken intrekken |
| `POST /orders` | Order met actuele expliciete toestemmingen en `requestKey` |
| `GET /orders/:id` | Eigen orderstatus en vastgelegde bedragen |
| `GET /orders/:id/invoices` | Vooraf geplande kalenderfacturen en betaalstatus |
| `POST /orders/:id/checkout` | Vastgelegde provider-testcheckout uitvoeren |
| `POST /orders/:id/reconcile` | Huidige providerstatus voor eigen order ophalen |
| `POST /orders/:id/cancel` | Stoppen en geverifieerd opzeggen |
| `POST /orders/:id/lease` | Kort licentietoken voor `installId` |
| `POST /webhook` | Bekend betaal-ID als hint; overige betaalclaims genegeerd |

Behalve login en webhook vereisen de routes `Authorization: Bearer ...`. De JSON-routes accepteren `application/json`. De webhook accepteert ook een formbody met `id`. Er worden geen sessies in cookies geplaatst.

Na een bevestigde procescrash kan de lokale beheerder `recoverOperations()` gebruiken om onafgemaakte `pending`-operaties als `uncertain` vast te leggen. Doe dit uitsluitend nadat is vastgesteld dat geen ander proces die publisheroperaties nog uitvoert. De methode verzendt niets opnieuw. Onzekere betalingen of abonnementen vereisen provideronderzoek en een apart gecontroleerd herstelpad; zo'n beheerinterface is nog niet aanwezig.

## Uitgevoerd bewijs

```sh
node --test --test-reporter=tap tests/billing-backend.test.mjs tests/license-billing.test.mjs tests/billing-review-regression.test.mjs
```

De laatste afzonderlijke billingrun staat in `reports/billing-recurring-final-2026-09-08.tap`: 78 tests geslaagd, nul gefaald. De eerdere basisrun met 47 tests blijft bewaard in `reports/billing-backend-2026-09-08.tap`. De tests starten een echte loopback-HTTP-server en gebruiken echte SQLite-transacties en cryptografische handtekeningen. De providertransportfunctie is in alle gevallen geïnjecteerd en synthetisch. Geen test spreekt `api.mollie.com` echt aan.

De gevallen omvatten de volledige lokale HTTP-volgorde login → order → checkout → webhook → lease; foute toestemmingen en clientprijzen; accountisolatie; parallelle checkout-claims; persistente onzekerheid na herstart; dubbele callbacks; refund/chargeback; verlopen providerbewijs; ingetrokken machtiging; stale callback na refund; opzegging tijdens customer- en subscriptionwachten; exclusieve devicehouders over verschillende orders; en installatiegebonden handtekeningverificatie. De recurring-tests controleren bovendien februari/schrikkeljaar/31e-maandankers, nul dagen grace, onbekende bindingshints, dubbele en gelijktijdige betaalpogingen, omgekeerde callbackvolgorde, herstel na mislukte betaling, retry over een maandgrens, onveranderlijke factuurkoppeling, frauduleuze afwijkingen en het behoud van stop- en terugboekingsstatussen.

## Nog niet geleverd of bewezen

Er is geen provider-testmodus end-to-end uitgevoerd met een echt Mollie-testaccount, bereikbare webhook of echte testmachtiging. Verifieer de actuele providerresponse-contracten in een expliciet toegestane testomgeving voordat deze integratie wordt vrijgegeven.

De lokale ledger voor afzonderlijke maandfacturen, herstelbetalingen en verlenging is uitgevoerd met synthetische providerdata. De mapping naar de definitieve providerfactuur, daadwerkelijke automatische factuuruitgifte, fiscale behandeling en gecontroleerde verwijzing naar de juiste serviceperiode zijn nog afhankelijk van echte provider- en publisherconfiguratie. Een onbekende recurring binding vereist expliciete beoordeling en levert geen extra rechten op. Een ingetrokken machtiging schort het recht op; het opnieuw laten toestemmen van de klant en aanmaken van een nieuwe echte machtiging vereist een toegestane providerflow.

Evenmin aanwezig: automatische facturen, fiscale berekening, e-maildispatcher, bewijs van geaccepteerde echte klantvoorwaarden, password-reset/MFA, production auth-hardening, beveiligde publisher-keyopslag/KMS, publieke TLS-hosting, webhook edge-beveiliging/rate limits, bewaarbeleid voor de publisherledger, end-to-end dealeractivatie en een beoordeelde productieherstelprocedure. Alleen hashes van wachtwoorden en sessietokens zijn beschermd; dealer-e-mail en bedrijfsnaam staan leesbaar in de afgeschermde publisherdatabase.

## Providerbronnen

Geraadpleegd op 8 september 2026: [Mollie webhooks](https://docs.mollie.com/reference/payments-api-webhooks), [API-idempotency](https://docs.mollie.com/reference/api-idempotency), [recurring payments](https://docs.mollie.com/docs/recurring-payments), [abonnement en kalenderinterval](https://docs.mollie.com/reference/create-subscription) en [betaling annuleren](https://docs.mollie.com/reference/cancel-payment). De implementatie haalt de actuele entity na callbacks en annulering opnieuw op en vergelijkt die met de vooraf vastgelegde order.
