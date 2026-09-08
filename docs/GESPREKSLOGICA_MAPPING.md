# Herkomst en bewuste wijzigingen in de gesprekslogica

Revisie 8 september 2026: volledige akkoordzinnen worden gevalideerd, inclusief vragen, negaties, voorwaarden en planningsstaarten. Een losse `Akkoord?` veroorzaakt geen prijsacceptatie. Een verkopersprijs moet een volledige, ondubbelzinnige prijszin zijn. Nieuwe regressies en de expliciet synthetische 128-scenario-evaluatie staan onder de gedateerde rapporten; echte AI-acceptatie blijft vereist.

Basis: aangeleverd `BIEDBOT_GESPREKSLOGICA.md`, met name hoofdstuk 0 en 0B, herbouw 11 juli 2026. Dit is de nieuwere deterministische aanpak. De latere oude Haiku-prompts en oude samenvattingsflow zijn niet opnieuw actief gemaakt. De kop “Alles vanaf hoofdstuk 5 is oud” wordt gelezen samen met de expliciete labels “oud systeem” elders, niet als toestemming om tegenstrijdige oude strategieën te mengen.

## Behouden

De strategie staat in code. `plafondPct` kent 80/84/88/91 procent per prijsklasse. Het anker wordt op 50 euro afgerond. De eerste boodschap noemt geen prijs en vraagt naar onderhoud en reden van verkoop. Daarna volgt het anker. Maximaal twee peilingen en drie aflopende concessies. De concessiereeks gebruikt 50%, 75% en 87,5% van de ruimte, met afronding en begrenzing. Een lagere verkopersprijs binnen het plafond wordt niet voor hem verhoogd. Akkoord leidt tot overdracht en het stoppen van de bot. Er worden geen eigen datums of tijdstippen verzonnen. De korte, zakelijke Nederlandse stijl zonder markdown of contant-/spoedtaal blijft behouden.

## Expliciet aangepast, niet letterlijk uit de bron overgenomen

| Bron / risico | Nieuwe implementatie |
|---|---|
| `Math.max(anker, min(banded, 92%))` kan een te hoog/afgerond anker laten winnen | Plafond eerst hard bepalen; anker naar dat plafond begrenzen |
| `AKKOORD` bevestigt altijd het oorspronkelijke anker | Bevestig het laatste daadwerkelijk verzonden eigen bod |
| Gespreksfase wordt teruggelezen uit losse teksten | Gestructureerde fase, peilingen, concessies en laatste prijs persistent opslaan |
| Oud akkoorddetectiepatroon ziet uitnodigingen als akkoord | Uitnodiging alleen is een vraag, geen prijsakkoord |
| “Prima” of “goed” in onderhoudstekst kan verkeerd gelezen worden | Striktere akkoordcontext; “goed onderhouden” is geen akkoord |
| Kaartje “geen akkoord”, bedragen bij eerdere bieders of kenteken-/km-getallen | Conservatieve herkenning, geen automatische acceptatie daarvan |
| Zelf blijven bieden bij herhaalde hoge vraagprijs | Geen nieuwe concessie zonder dalende verkopersvraag; hoogstens peilen en stoppen |
| Oud prijskader noemt 25 per dag | De gebruiker vroeg eerder om 20: hard 20, niet een officieel geverifieerde platformlimiet |
| Alleen openingscap | Extra 80 totale berichten als productguardrail; rollend 24 uur én Nederlandse kalenderdag |
| Meerdere inkomende berichten vóór de volgende tick | Nieuwste bericht bepaalt, oudere ongelezen prijsvoorstellen worden niet alsnog later geaccepteerd |
| Stopverzoek wacht op normale inboxronde | Meteen niet-benaderenstatus en intrekken van klaarstaande acties |
| Model schrijft ook financiële zinnen | In deze pilot zijn financiële zinnen vaste, controleerbare tekst; optionele AI alleen als geverifieerde classifier |
| “Mijn bod is wat auto’s echt opbrengen” zonder data | Geen claim over gerealiseerde verkoopprijzen zonder bewijs; nu geen dergelijke claims |
| Planning direct bij akkoord | Vraag wanneer het schikt; menselijke handoff; geen afspraak zelf bevestigen |
| Onvoorwaardelijke kooptaal | Prijs wordt onder voorbehoud van bezichtiging en controle bevestigd. Dit is een bewuste productsafeguard, geen juridische garantie |

## Grenzen van de AI-implementatie

`src/adapters/anthropic.mjs` ondersteunt het opgegeven Sonnet-model-ID als configureerbare module en behandelt verkopertekst als onbetrouwbare data. Er zijn geen tools of browserrechten aan het taalmodel gegeven. Bedragen moeten letterlijk onderbouwd en door code gevalideerd zijn. De uitgeleverde demo gebruikt geen echt taalmodel; ze werkt zonder API-sleutel via regels en fictieve verkopersscenario’s. Deze broncodemodule is nog niet aan de productieworker gekoppeld.

De prijsscore is een rangschikking, geen wetenschappelijk gekalibreerde conversiekans. Fictieve demo-verkoopramingen zijn geen marktprijzen. Reparaties of onderhoud worden niet als fysiek gecontroleerd gepresenteerd.
