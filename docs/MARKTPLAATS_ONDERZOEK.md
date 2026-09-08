# Marktplaats: bevindingen voor deze bouw

Geraadpleegd: 7 september 2026. Primaire bronnen; geen verborgen API onderzocht, geen echte gebruiker benaderd. Dit is technisch/productonderzoek, geen juridische goedkeuring.

## Algemene voorwaarden en Pro uit elkaar houden

De algemene voorwaarden noemen beperkingen op systematisch opvragen/hergebruik van de advertentiedatabase en mogelijke maatregelen, waaronder het beperken van reacties. De aparte regel over persoonsgegevens en benaderen om eigen producten/diensten aan te bieden mag niet zonder uitleg gelijk worden gesteld aan ieder koopverzoek bij een auto-advertentie. De afzonderlijke Pro-voorwaarden zijn expliciet op Pro gericht: daar staat een scripts/bots-beperking en is voor meerdere accounts voor één onderneming schriftelijke toestemming vereist. Deze Pro-bepaling is niet op zichzelf een universele beschrijving van ieder normaal kopersaccount.

Bronnen:
- Algemene voorwaarden, I.7 en I.10: https://www.marktplaats.nl/i/help/over-marktplaats/voorwaarden-en-privacybeleid/algemene-gebruiksvoorwaarden.dot.html
- Pro-voorwaarden, 2.3 en 5.3: https://www.marktplaats.nl/i/help/over-marktplaats/voorwaarden-en-privacybeleid/admarkt-voorwaarden.dot.html

## Geen aangetoond veilig getal

Er is in de geraadpleegde publieke documentatie geen officieel gegarandeerd quotum gevonden van 20, 25 of 100 nieuwe chats per dag dat een account veilig maakt. De operationele cijfers in de overdracht/gesprekslogica zijn projectclaims, geen bewijs van een algemeen platformrecht. De nieuwe code gebruikt 20 als interne bovengrens. Een eigen computer verandert dat niet in toestemming of blokkeervrijheid.

## LMS: bruikbaar maar niet de ontbrekende eerste koperactie

De openbare LMS-documentatie beschrijft lead- en gespreksintegraties, vooral voor verkopers. De chat-webhookdocumentatie vermeldt dat tegengestelde gesprekken, waarbij een aangesloten gebruiker als koper reageert, in de bidirectionele API kunnen voorkomen; de webhook wordt niet voor die richting verzonden. Dat bewijst niet dat een openbare koper-API het eerste bericht op willekeurige advertenties mag aanmaken. Die eerste-contactfunctie en toegestane quotas zijn nog niet bevestigd.

Bronnen:
- https://api.marktplaats.nl/docs/v2/lms/index.html
- https://api.marktplaats.nl/docs/v2/lms/chat-message-webhook.yaml
- https://api.marktplaats.nl/docs/v2/advertisement.html

## Technische consequentie voor BiedBot

Er is een adaptergrens tussen ontdekken, synchroniseren, verzenden en controleren. Zonder een werkelijk gecontroleerd contract wordt geen live-versie vrijgegeven. De huidige bron bevat een lokale testfixture en browseradapter, maar geen vermeend actuele selectors voor het ingelogde Marktplaats-inboxscherm. De openbare advertentiewebsite lezen is daarvoor onvoldoende. De autorisatie, accountidentiteit en echte verzendbevestiging moeten bij integratie aantoonbaar vaststaan.

Geen anti-detectbrowser, proxyrotatie, accountfarm, captcha-omzeiling of sms-activators in dit pakket.

## Lokale browserarchitectuur

Een apart browserprofiel voorkomt het overnemen van de gewone dealerbrowser. CDP-communicatie in de adapter gebruikt OS-pipes, geen open remote-debugging-TCP-poort. Chrome documenteert extra beperkingen voor remote debugging met een standaardprofiel; daarom vereist de adapter een eigen profielmap.

Bron: https://developer.chrome.com/blog/remote-debugging-port
