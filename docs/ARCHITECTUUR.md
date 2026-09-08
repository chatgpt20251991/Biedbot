# Architectuur en operationele grenzen

```
Windows-pc van de dealer
  Edge/Chrome appvenster → lokale HTTP-agent (127.0.0.1)
                          → SQLite + transactionele outbox
                          → afzonderlijke Node workerthread
                          → DemoAdapter (deze release)
                          → toekomstige geverifieerde platformadapter
```

Geen browser-VPS en geen proxy. De officiële Node-runtime wordt tijdens de persoonlijke installatie opgehaald; er zijn geen npm-runtimepakketten. De UI gebruikt lokale bestanden en systeemfonts. Browserprofielen, database en appversies worden apart gehouden. De demo heeft geen cloud nodig. Voor gedeelde betaling/licenties en een beheerde AI-dienst is later wel een kleine publieke backend nodig; de Mollie-webhook kan niet op de localhost van een dealer worden ontvangen.

## Berichttransactie

Reserveer uniek voertuig en verkoper + budget + quotum → outbox `queued` → exclusief `sending` → adapteractie → unieke ontvangstbevestiging → `sent` + berichtgeschiedenis + volgende gespreksfase. Bij crash of onbekend resultaat: `uncertain`, geen automatische retry. Er wordt nadrukkelijk GEEN exactly-once-garantie over een externe browser geclaimd. De veilige reactie op onzekerheid is stoppen en reconciliëren.

Een definitieve status, stopverzoek, risicobericht of overname heeft voorrang op klaarstaande acties. Een al gestart extern verzoek kan niet achteraf worden teruggeroepen. De nieuwste verkoperreactie wint bij meerdere binnengekomen berichten. Een afgesproken prijs is niet hetzelfde als een definitief ingekochte auto; de fysieke controle blijft bij de dealer.

## Inkoopkapitaal

Geplande/open onderhandelingen reserveren maximaal het plafond; bij prijsakkoord reserveert de app de overeengekomen prijs. Aangekocht blijft binnen deze pilot bezet totdat het voorraad-/verkoopproces later expliciet wordt aangesloten. Dit voorkomt overcommitment, maar is geen volledig voorraadboekhoudpakket. Minimummarge werkt alleen wanneer een onderbouwde verkoopraming én kosten aanwezig zijn. Zonder die gegevens wordt geen margeraming getoond.

## Lokale beveiliging

Alleen loopback, willekeurige poort, strikte Host-/Origin-checks, HttpOnly SameSite-cookie, afzonderlijk CSRF-token, beperkte statische bestanden en CSP. De bootstrapcode staat kort in een URL-fragment en in een lokaal launchbestand. API- en issuerkeys zitten niet in dit pakket. Diagnostiek laat gespreksteksten weg. Exports zijn expliciet en lokaal.

De SQLite-database is niet compleet versleuteld op schijf. De HMAC-verkoperssleutel voorkomt leesbare ID's in één index, maar maakt het totale dossier niet anoniem. De kandidaat- en gespreksgegevens bevatten nog informatie. Malware onder hetzelfde Windows-gebruikersaccount valt buiten de beschermingsgrens. Ook externe privacycontrole, beperkte bewaartermijnen en een compleet verwijderproces zijn nog productievereisten.

## Updates, shutdown en computergebruik

Elke uitgevoerde applicatiestart start met Autopilot uit. Afsluiten via de UI sluit de worker gecontroleerd. Alleen een venster sluiten kan de agent laten doorwerken. Slapen/uitzetten onderbreekt uitvoering. Windows-autostart is bewust nog niet als stille standaard geïnstalleerd. Er is nog geen ondertekende automatische updater: een nieuwe pakketinstallatie vereist eerst afsluiten; geen update midden in een verzending.

## Multi-dealer

Een persoonlijke installatie heeft eigen SQLite, profielmappen, instellingen en install-ID. Dit is geen centrale multi-tenant Supabase-app en geen accountpool om platformquota te vermenigvuldigen. Hetzelfde Marktplaats-account op twee machines veilig coördineren vraagt later server-side device-binding en een lease. Tot die voorziening er is: één platformaccount niet vanuit twee agents tegelijk laten draaien.
