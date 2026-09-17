# Gespreksstijlherstel, 18 september 2026

Deze herstelronde gebruikt de aangeleverde Edge 0.2.0-pilot.1 als uitvoerbare basis. De oorspronkelijke SaaS-bron uit `1789098029609_biedbot_saas.7z` bepaalt de gewenste gespreksopbouw: warm en prijsloos openen, aansluiten op de verkoper, een beheerst bod, maximaal twee peilingen en drie aflopende concessies, daarna sluiten of afhaken.

De SaaS-code importeert daadwerkelijk `onderhandelaar.js`. Die module ontving voor het schrijven van biedreacties niet de verkopershistorie, ondanks de opdracht daarop aan te sluiten. `customTemplate` en `toon` werden daar niet toegepast. Daarom worden de bedoelde opbouw en stem overgenomen, samen met expliciet geteste contextverwerking; de oude module wordt niet als geheel in Edge geplaatst.

## Berichtgedrag

- De schrijver ontvangt de actuele verkopersreactie, maximaal twaalf recente geredigeerde berichten, de gekozen toon en bekende verkopersfeiten. Eerdere uitspraken van de bot gelden niet als bewijs. Latere correcties van de verkoper gaan voor.
- Zakelijk blijft kalm en duidelijk; vriendelijk erkent iets warmer; kort beperkt zich tot de kern. Ook de offline teksten passen deze keuze toe.
- Uitdrukkingen zoals “Ik kom uit op” en “Ik kom je tegemoet” mogen als onderhandeling worden gebruikt. Eigen ophaalafspraken, ongeziene koop en extra financiële toezeggingen blijven geblokkeerd.
- Het expliciete voorbehoud voor bezichtiging en controle blijft onderdeel van de definitieve prijsbevestiging. Het is niet meer verplicht in iedere voorafgaande bodzin. Dit is een keuze in de producttekst, geen oordeel over juridische binding.
- Een beschikbaarheidsmelding met inhoudelijke informatie over onderhoud of verkoopreden leidt niet opnieuw tot dezelfde informatievragen.
- De interface onderscheidt AI-tekst, offline tekst, vaste gespreksstappen en terugval na afgewezen AI-output. Terugval krijgt een begrijpelijke uitleg.

## Grenzen

De code kiest bedragen, fasen en limieten. De AI schrijft een symbolische prijsplaatsaanduiding; de code vult exact het toegestane bedrag in. Akkoord, peilen, afhaken en identiteit blijven vaste stappen zoals in de oorspronkelijke opzet. Marktgegevens, onderhoud, alternatieven en koopintentie worden niet verzonnen. Onzekere verzending, nieuwe input, stop en menselijke overname houden hun bestaande bescherming.

De standaardstart blijft offline. Bestaande afzonderlijke toestemming voor betaald Anthropic-gebruik blijft nodig. Deze herstelronde schakelt geen accounts, betaald modelgebruik of echte verzending in. De losse relay en de oude SaaS-database zijn niet aangepast.

## Gesprekken beoordelen

`npm run review:conversations` maakt een HTML-overzicht en JSON met volledige synthetische gesprekken. Daarin staan de echte offline uitvoer en afzonderlijk gelabelde uitvoer met een vaste testschrijver. Deze testschrijver controleert de aansluiting en tekstvalidatie; hij is geen echte Claude-aanroep. Voorbeelden zijn beoordelingsmateriaal en zijn nog niet door de gebruiker als gewenste stijl geaccepteerd.

De codecontroles toetsen onder meer contextbehoud, correcties, toonverschillen, prijsgrenzen en stoppen. Een groen resultaat bewijst deze gevallen; het bewijst niet de kwaliteit van vrije modeluitvoer of werking op Marktplaats. Echte modelkwaliteit en gebruikersacceptatie blijven afzonderlijke controles.

## Herkomst

- GitHub-basis: `chatgpt20251991/Biedbot`, commit `f98076bfd69b1c5db459b88ac8f7195e69e3a674`.
- Afzonderlijke import van de aangeleverde Edge 0.2.0: commit `534a628`.
- SHA-256 Edge-ZIP: `90ce2c9921ce2156d9dabf9ee0f636ee9250f4e0f1815fac2c618b585a054eb8`.
- SHA-256 SaaS-archief: `2568964eeeed7c2a1b08b5c3d125816f41371a65abe959b375234aa6be1f902d`.
- SHA-256 oorspronkelijke `onderhandelaar.js`: `c2886d29c014ef32bdf451023efe29aaa88ca987e477c21510afb3704ea9c189`.

Oorspronkelijke SaaS-vindplaatsen: `engine/BotEngine.js:9`, `:307`, `:419`; `engine/onderhandelaar.js:191`, `:222`, `:281`, `:312`, `:336`. De oorspronkelijke pakketten en historische testbewijzen blijven behouden.
