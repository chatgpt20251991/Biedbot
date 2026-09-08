# Lokale operations en herstel

Bijgewerkt op 8 september 2026. Dit is een technische demo-implementatie met lokale tests. Geen productieprivacyacceptatie, platformtoestemming, ondertekend updatekanaal of globale licentielease.

## Volledige databasebackup

`src/core/operations.mjs` maakt onder één SQLite-transactie een volledige **logische** backup van alle applicatietabellen: instellingen, kandidaten, gesprekken, inbox, outbox met bron-/ontvangstbewijs, berichten, audit en AI-verbruiksboekhouding. De dashboardlimieten van 200 resultaten gelden niet. Herstel maakt een nieuwe SQLite-database met het bekende applicatieschema; het voert geen SQL uit het backupbestand uit.

AES-256-GCM versleutelt de inhoud met een verse salt en nonce. Scrypt gebruikt vaste parameters N=16384, r=8, p=1. Formaat en KDF zijn als authenticated associated data gebonden. Verkeerd wachtwoord, veranderde inhoud, ongeldige base64, onbekende velden en verkeerde sleutellengtes stoppen herstel. De limiet is 32 MiB ongecodeerde backupinhoud en 500.000 records. Er is geen compressie/decompressie.

De backup bevat de versleutelde installatiesalt die nodig is om bestaande verkoper-HMAC's te blijven herkennen. Providersleutels, browserprofielen, cookies, sessietokens, browserprofielverwijzingen en procesleases worden niet opgenomen. Het backupbestand bevat persoonsgegevens in versleutelde vorm; beheer wachtwoord en bestand afzonderlijk. Het is geen volledige computerimage.

Gebruik vanuit de uitgepakte distributie:

```powershell
# Zet BIEDBOT_BACKUP_PASSWORD vooraf in de eigen procesomgeving; geen wachtwoordargument.
node scripts/backup.mjs create "C:\eigen-data\biedbot-demo.sqlite" "C:\eigen-backups\BiedBot-backup.json"
node scripts/backup.mjs restore "C:\eigen-backups\BiedBot-backup.json" "C:\nieuw-leeg-profiel"
```

Het uitvoerbestand wordt exclusief aangemaakt: bestaande backups worden niet overschreven. Herstel accepteert uitsluitend een nieuwe of bestaande lege map. Daarbinnen is exclusieve eigendom nodig. Bestandsgrootte wordt vóór het inlezen gecontroleerd. De destination bevat daarna `biedbot-demo.sqlite`. Start die kopie met `BIEDBOT_DATA_DIR` naar de herstelmap; vergelijk de gegevens vóór activering. Koppel een toegestaan browserprofiel apart opnieuw wanneer die integratie ooit wordt vrijgegeven.

Na herstel staat Autopilot uit. Klaargezette acties worden ingetrokken; bijbehorende input wordt opnieuw beoordeelbaar. Een tijdens de backup lopende verzending wordt `uncertain` en krijgt geen automatische herhaling. Reconciliatie blijft vereist; de software verzint geen ontvangstbewijs. Een bestaande `uncertain` blijft eveneens geblokkeerd.

De geauthenticeerde route `POST /api/backup/full` met JSON `{ "password": "..." }` levert hetzelfde volledige formaat. De bestaande `/api/backup` en de huidige knop voor versleutelde export blijven het oudere dashboardexportformaat leveren; dat is geen herstelbare databasebackup. De CLI is de herstelroute. Geen HTTP-route kan een willekeurig bestaand bestand overschrijven.

## Bewaartermijn en inhoud wissen

De server voert bij het starten en vervolgens elk uur onderhoud uit op basis van `retentionDays`. Verouderde gesprekken met status DECLINED, SUPPRESSED of LOST verliezen hun bericht-, inbox-, kandidaat- en broninhoud. Actieve gesprekken en REVIEW, HOT_LEAD en PURCHASED worden niet automatisch gewist. Lopende of onzekere verzendingen blokkeren wissen totdat ze zijn gecontroleerd. Verouderde, nooit benaderde kandidaten worden verwijderd en oude auditdetails worden leeggemaakt.

`POST /api/data/retention` voert dit onderhoud handmatig uit. `POST /api/data/erase` met `{ "id": "advertentie-id", "confirm": "WIS GESPREKSINHOUD" }` wist één gesprek. Deze laatste route pauzeert Autopilot en stopt de worker vóór de wijziging. Authenticatie, Host/Origincontrole en CSRF zijn voor beide routes verplicht.

Advertentie-ID, verkoper-HMAC, eigen account-ID en de minimale quotaboekhouding blijven bewaard. Daardoor ontstaat na wissen geen nieuw contact met dezelfde advertentie of dezelfde verkoper, en kan wissen de dag-/24-uurslimiet niet vrijmaken. Ruwe receipt- en inputidentiteiten worden vervangen door SHA-256-digests; oorspronkelijke bericht- en bronhashes blijven als minimaal technisch bewijs. Dit zijn pseudonieme gegevens, geen anonimiseringsgarantie. Het wettelijke doel en de bewaartermijn van deze minimale gegevens moeten vóór productie worden vastgesteld.

De wisfunctie verwijdert inhoud uit de actieve database. Losse backups, exports, Windows-herstelpunten en browserprofielen zijn aparte gegevensbronnen. SQLite gebruikt `secure_delete`, maar deze code garandeert geen forensische verwijdering van opslagmedia, WAL-kopieën of eerdere backups.

## Gezondheid en profielscheiding

`GET /api/health` rapporteert concrete controles: SQLite `quick_check`, actuele workerheartbeat, onzekere verzendingen en verzendingen die langer dan 60 seconden vaststaan. Een heartbeat ouder dan tien seconden geeft aandacht wanneer een worker verwacht wordt. Geen willekeurige groene score; `liveReleased` blijft false. Deze route publiceert geen gesprekstekst.

`data.lease` bindt één draaiende server aan één fysiek datapad, ook wanneer `startServer()` direct wordt aangeroepen. Andere profielen gebruiken afzonderlijke databases en leases. Een token voorkomt vrijgave door een andere eigenaar. Een klein exclusief guardmapje serialiseert ook herstel van een lease waarvan het proces aantoonbaar is gestopt. Lege/beschadigde leases en een achtergebleven `data.lease.guard` blokkeren conservatief. Controleer bij zo'n melding eerst dat geen BiedBot-proces dit dataprofiel gebruikt, maak een backup en verwijder uitsluitend de betreffende achtergebleven lease/guard. Dit is een lokale proceslease; exclusiviteit tussen verschillende computers vereist nog een backend.

## Bewijs en resterende acceptatie

`tests/operations.test.mjs` controleert een herstelronde met 230 gesprekken, alle bijbehorende records, integriteit/tampering, verkeerd wachtwoord, veilige bestemming, onzeker herstel, behouden quota en verkoperdeduplicatie na wissen, bewaartermijnselectie, profiellease en beveiligde API's. De daadwerkelijke resultaten staan in `reports/revision-2026-09-08/operations-*.tap`.

Een tweede onafhankelijke Windowsmachine, echte slaap-/stroomuitval tijdens een hardware-write, schijfvol/antivirusinteractie, productieprivacybeoordeling, beheerde sleutelopslag en globale device lease zijn hiermee niet bewezen. Signing, updates en rollback blijven aparte vrijgavevoorwaarden.
