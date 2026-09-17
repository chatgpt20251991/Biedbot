# Werkende herstelbuild 0.2.0-pilot.1

Dit is de actuele applicatie, niet nog een niet-uitgevoerde herstelopdracht. Begin met README.md en docs/RELEASE_STATUS.md. De oude opdracht is historisch opgeslagen in docs/history/CODEX_START_HIER-pilot.2.md.

Behoud de Edge-distributie en lanceringsrichting. Gebruik de 11 juli-gesprekslogica uit de gebruikersbron, niet de oudere harde Haiku-openingen. Laat de schrijver geen geld, contracttoestemming of strategische fase bepalen.

## Belangrijkste code

- `src/core/voice.mjs`: prompt, context, brongebaseerde terugval, tekstguards en codeprijsinvulling.
- `src/core/communication.mjs`: compose-route, herkomst, expiry, teksthash en policyfingerprint.
- `src/adapters/anthropic.mjs`: afzonderlijke classifier en writer; echte HTTP-client, geen tools.
- `src/worker/writer.mjs`: aparte expliciete netwerk-/kosten-opt-in.
- `src/worker/engine.mjs`: beslissing, asynchrone compositie en finale dispatchgates.
- `src/core/store.mjs`: additive migration, definitieve state en queue; geen write-transactie tijdens AI-wacht.
- `src/core/studio.mjs`: oefenmodus en handmatige exacte conceptbevestiging, zonder platformadapter.
- `src/server.mjs` en `src/ui/`: bestaande app plus studio-API en interactieve interface.
- `scripts/Start-Claude.ps1`: opt-in via afgeschermde invoer, niet op Windows uitgevoerd in deze build.

## Niet omzeilen

Engine-dispatch vereist `composition_status=ready`. De legacy-optie in de lage Store-testhelper is uitsluitend voor compatibiliteit van oude directe adaptercontracttests; gebruik die niet als bypass in een nieuwe worker. Een fallback buiten demo vereist review. Herstel nooit oude outboxitems als automatisch verzendbaar na een backup.

Stopverzoeken en menselijke overname zijn terminaal. Een financière settingswijziging pauzeert actieve onderhandeling. Bewaar een onzekere verzending voor reconciliatie; geen retry op goed geluk. Uitgevoerde externe verzendingen kun je niet terugdraaien door lokale state te resetten.

De studio verstuurt niets naar Marktplaats. Handmatige gebruikersbevestiging is geen receipt van de website. Bewerkte of eerder lopende onderhandelingen vereisen handmatig overnemen; begin geen financiële state op nul bij een bestaand extern bod. De oefenstand en handmatige studio hebben geen gezamenlijke echte aankoopboekhouding.

`reports/communication-rebuild/` bevat nieuw bewijs; `reports/original-evidence.sha256.json` blijft het oorspronkelijke 24-bestandencontract. Behoud dat bewijs. Geen nieuwe GitHub-publicatie, Codex-taak, providerbetaling of platformvrijgave is uitgevoerd.
