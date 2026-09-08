# Platformtoegang: controle 8 september 2026

De officiële [Marktplaats-gebruiksvoorwaarden](https://www.marktplaats.nl/i/help/over-marktplaats/voorwaarden-en-privacybeleid/algemene_voorwaarden_marktplaats.pdf?v=7), geldig vanaf 22 juli 2026, zijn geraadpleegd. Artikelen 7.1–7.3 beperken hergebruik en systematische opvraging van advertentiegegevens. Artikel 7.4 gaat specifiek over automatisch advertenties plaatsen met toestemming; dat levert op zichzelf geen bewijs van toegestane automatische inkoopberichten. Artikelen 10.1–10.3 beschrijven gebruiksverplichtingen en mogelijke maatregelen.

Voor deze repository is geen schriftelijk toegangscontract, erkende messaging-API, geldig ingelogd selectorcontract of door deelnemers beheerd testgesprek aangeleverd. Daarom blijft de productieadapter dicht. Dit is een technische vrijgavebeslissing, geen juridische beoordeling van een individuele toepassing.

Vervolg: leg met de platformaanbieder toegestane data- en messagingtoegang vast, verkrijg een testaccount en expliciet toegestane testgesprekken, en laat toepasselijke voorwaarden/privacy beoordelen. Verzamel vervolgens identiteits- en verzendbewijs op die omgeving. Er is niemand benaderd.

## Uitvoerbaar fixturecontract

`tests/fixture-server.mjs` beschrijft uitsluitend onze eigen loopback-HTML. Het contract gebruikt unieke account-, seller-, listing- en conversation-identiteiten. `src/adapters/approved-browser.mjs` controleert vóór chatopening, na chatopening, in dezelfde JavaScript-taak als de klik en na ontvangstbewijs. Ontbrekende/dubbele identiteiten, een gewijzigde gesprekssnapshot of meerdere nieuwe identieke receipts stoppen de actie. Nieuwe verkoperberichten worden vóór dispatch in de store geïmporteerd.

`conversationIdentity:<advertentie-id>` en de gecontroleerde gespreks-URL binden vervolgberichten. Verzending retourneert bron-/ontvangstidentiteiten voor de outboxaudit. Deze velden zijn geen Marktplaats-selectors. UI-controles kunnen geen onzichtbare, nog niet afgeleverde providerinput uitsluiten; crash/netwerk/platform-races vereisen echte toegestane acceptatietests. Onzekerheid veroorzaakt stoppen en menselijke reconciliatie.
