# BiedBot Edge 0.2.0-pilot.1: test- en bouwrapport

## Uitkomst

530 van 530 Node-tests slagen. Dat zijn de 401 oorspronkelijke tests plus 129 nieuwe tests. Daarnaast slagen 14 bestaande Chromium-DOM-controles en 10 nieuwe studio-DOM-controles. De vijf audit-reproducties faalden eerst alle vijf op de aangeleverde code en slagen na de reparatie.

De Node-suite gebruikt werkelijke code, SQLite, lokale HTTP, subprocessen en waar toepasselijk gemockte externe providers. De DOM-test gebruikt echt Chromium met eigen HTML/JavaScript in about:blank, met gemockte netwerkresponsen. De actuele browsernavigatie werd geblokkeerd door ERR_BLOCKED_BY_ADMINISTRATOR. Dat is geen geslaagde browser-end-to-endtest.

## Nieuw bewezen gedrag

De tekstschrijver is aangesloten op de onderhandelingsmotor. Een testwriter ontvangt de daadwerkelijke verkoperscontext en de symbolische prijs. Onjuiste modelbedragen, extra financiële toezeggingen, bekende verzonnen claims, ongeldige stijl, afgekapt JSON, extra velden, tool-output en providerfouten worden geweigerd of omgezet naar een zichtbaar gelabelde veilige terugval. Een terugval buiten de demo vereist review.

Een nieuwe verkopersreactie, stop, stop/start, overname, gewijzigd afzenderprofiel of verlaagd budget tijdens schrijven leidt niet alsnog tot dispatch van de oude modeltekst. Genereren houdt geen SQLite-schrijftransactie open. De onderhandelstaat wordt niet vooraf als verstuurd geboekt. Manipulatie van het opgeslagen bedrag wordt bij de laatste controle afgewezen. Niet-gecomponeerde historische items gaan niet via de nieuwe worker weg.

De studio produceert geen platformacties of echte contacten. Oefenen is geïsoleerd. In handmatige modus verandert het laatste eigen bod pas na bevestiging van het exacte, actuele concept. Verouderde of gewijzigde concepten worden afgewezen. Expliciete overname stopt verder genereren. Opnieuw schrijven behoudt de prijsbeslissing maar geeft een verse geldigheid.

Er zijn regressies voor normale biedvragen, concrete verkopersbedragen, leaseauto/onderhoud/koppeling, vaste prijs, stopverzoeken, verkeerd gelezen berichtreeksen, te veel concessies, niet kloppende voorwaarden, privacyminimering van modelcontext, browsersecrets, backupherstel uit pilot.2 en retention van studio-inhoud.

## Aanvullende classificatiemeting

Op de vaste synthetische set van 128 gevallen: lokale regels 0 onterechte akkoorden, 0 verkeerde prijzen en 0 gemiste akkoorden. Met een geïnjecteerd model dat ten onrechte overal akkoord zegt: 0 onterechte akkoorden, 0 verkeerde prijzen en 11 gemiste akkoorden. Deze tweede uitkomst laat de conservatieve afwijzing zien; die gemiste akkoorden zijn niet verzwegen. Beide metingen voorspellen geen foutenfrequentie bij echte verkopers.

## Niet bewezen of geactiveerd

Geen echte Claude-aanroep, geen Marktplaats-praktijktest, geen actuele Windowsacceptatie, geen betaalprovidertransactie of commerciële uitrol. De Windowsrapporten van pilot.2 blijven historisch bewijs. De nieuwe Windowslauncher is geschreven maar niet op Windows uitgevoerd. De live platformadapter blijft niet vrijgegeven.

Alle 24 oorspronkelijke bewijsbestanden zijn bytegelijk behouden. Bewijs en herhaalbare tests staan in de ZIP onder reports/communication-rebuild, tests en scripts. De gebruiker moet echte modeltoon en geautoriseerde platformtoegang nog beoordelen voordat autonoom live gebruik aan de orde is.

Geen algemene waterdichtheids- of bugvrijgarantie. De app kan niet bewijzen wat een gebruiker handmatig op een andere website typt, geen bericht terughalen dat al verstuurd is en niet alle ambiguïteit in vrije Nederlandse taal uitsluiten.
