# Testrapport BiedBot Edge

Build 0.1.0-pilot.1. Uitgevoerd 2026-09-07T02:40:50.406Z.

## Hoofdresultaat

**197/197 Node-tests geslaagd, 0 gefaald. 14 Chromium-DOMtests geslaagd. Volledige browsernavigatie geblokkeerd; Windows en echte Marktplaats niet getest.**

De tests draaien op linux, v22.16.0, Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie). De hele lokale HTTP-app start bovendien een echte workerthread die autonoom een demo-overdracht opslaat. Geen berichtgoedkeuring of kunstmatige front-endteller.

## Wat is getest

Prijsbanden, ankerafronding, 10.000 berekende prijsgevallen, concessies, laatste bod bij akkoord, prijsloze opening, negaties, uitnodigingen, onderhoudstekst, andere bieders, telefoon-/km-/jaargetallen, onbekende AI-uitvoer, harde caps, budget, deduplicatie, vier gelijktijdige reserverende workers, 24 uur en lokale dag, ontvangstbewijs, onzeker verzendresultaat, herstart, opt-out, laatste verkoperbericht, menselijke overname, HTTP-authenticatie, Host/Origin/CSRF, inputvalidatie, encrypted export, AI-budget, providerfouten, licentiehandtekening, verlopen/cross-device licentie, Mollie-idempotency en betaling-/mandaatcontrole.

## Browser: onderscheid is essentieel

1. De volledige test tegen een eigen lokale fixturewebsite werd geprobeerd. Chromium blokkeerde de eerste navigatie met net::ERR_BLOCKED_BY_ADMINISTRATOR. Dat is een geblokkeerde test, geen geslaagde browserintegratie. De beheerdersbeperking is niet aangepast. Zie reports/browser-tests.json.
2. De eigen interface is daarna via het DOM van een lege Chromium-pagina getest, zonder navigatie of browsernetwerk. Fetch-responsen zijn in deze UI-test gemockt. Onboarding, API-verzoekvelden, navigatie, inbox, noodstop, runtimefouten en mobiele breedte zijn gecontroleerd. Zie reports/browser-dom-tests.json.
3. De lokale HTTP-backend en echte applicatieworker zijn los daarvan wél echt uitgevoerd en getest; daarvoor is geen browsermock gebruikt.

## Niet bewezen

Windows-installatie/PowerShell-uitvoering, actuele ingelogde Marktplaats-DOM, daadwerkelijke ontvangst bij een verkoper, accountveiligheid, live Claude-taalbegrip, echte Mollie-webhooks/incasso, externe security review, update/signing en langdurig productiebedrijf. Er is geen code-coveragepercentage gemeten en geen garantie dat er geen bugs meer zijn.

## Resultaatbestanden

reports/unit-tests.tap is de definitieve Node-run; reports/test-summary.json is de machineleesbare samenvatting; reports/browser-dom-tests.json en reports/browser-tests.json houden UI en navigatie gescheiden. Historische eerste runs staan in reports/history en kunnen bewust oude, later herstelde failures bevatten. Een klaarstaand CI-workflowbestand is geen uitgevoerde CI-run.
