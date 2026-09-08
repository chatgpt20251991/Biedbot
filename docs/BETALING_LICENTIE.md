# Betaling, demo en licentie

## Werkelijk opgenomen

`MollieGateway` ondersteunt customer creation, een eerste betaling met terugkerende toestemming, hercontrole van paymentstatus, een subscription met een geldig mandaat en annulering. Bedragen worden aangeleverd in integer centen inclusief de vooraf juist vastgestelde belastingen. Er is geen klantbedrag aan de desktopapp toevertrouwd en er is geen live sleutel ingebouwd. De module is alleen met gemockte API-responsen getest.

Een webhookmelding of terugkeer naar een successpagina is geen betaalbewijs. `verifiedPayment` haalt het paymentobject opnieuw op en vergelijkt payment-ID, customer, dealer, order, valuta en bedrag met de opgeslagen order. Terugbetaalde/gechargebackte betalingen geven niet zomaar een actief recht. POST-operaties hebben deterministische idempotencykeys. Een netwerkfout veroorzaakt geen eindeloze create-retry.

`issueLicense` en `verifyLicense` gebruiken Ed25519 met dealer-ID, install-ID, geldigheidsduur en maximaal 20 contacten. Alleen de issuer beheert de privésleutel. Een licentie is geen toestemming van Marktplaats. Ondertekende tokens zijn geen anti-piracygarantie tegen iemand die eigen broncode wijzigt. De gratis demo hoeft niet via een betaalstatus of tijdslimiet te worden ontgrendeld.

## Nog nodig vóór commerciële activering

Een gehoste backend met authenticatie, opgeslagen order-/subscriptionledger, atomaire webhookdeduplicatie, hercontrole bij refunds/chargebacks, facturatie/btw, subscription-opzegging, licentie-uitgifte/vernieuwing, sleutelrotatie en monitoring. De huidige modulefuncties zijn niet dat volledige gedeployde systeem. Er is geen actieve checkoutknop in de app en geen geld ontvangen of afgeschreven.

Mollie beschrijft dat recurring begint met klanttoestemming via een eerste betaling; vervolgincasso kan via een mandaat en subscription. Een webhookendpoint moet publiek bereikbaar zijn; localhost volstaat niet. Het periodieke abonnementsbedrag en de eerste termijn moeten helder worden gecommuniceerd.

Primaire bronnen, geraadpleegd 7 september 2026:
- https://docs.mollie.com/docs/recurring-payments
- https://docs.mollie.com/reference/create-payment
- https://docs.mollie.com/reference/create-subscription

Voorstel, nog niet gepubliceerd: gratis offline demo, later zeven dagen live pilot, daarna eventueel €249 inrichting + €149 per maand exclusief btw. Er is geen marktonderzoek gedaan dat dit prijspunt valideert.
