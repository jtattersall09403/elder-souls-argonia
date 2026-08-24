# Lore-extrapolation workstream — PROGRESS

Workstream charter: [docs/world/45-lore-extrapolation.md](../../../../docs/world/45-lore-extrapolation.md).
Run in packets; update this file at the end of every packet so any future agent
resumes cleanly. **This workstream never commits** — the main line reviews.

## Canon-tier vocabulary (used in every file this workstream writes)

| Tier | Meaning |
|---|---|
| `CANON_EXPLICIT` | A source says it. Cite the UESP page. |
| `CANON_DERIVED` | One-step logical consequence of cited sources. Cite + state the step. |
| `EXTRAPOLATED` | Our reasoned headcanon. State the reasoning and the source anchors. |
| `AGENT_INVENTED` | Pure invention. Allowed only where extrapolation has nothing to grip; flag for owner. |

Never blur tiers. Never upgrade a tier without new citation.

## Method note — how to fetch UESP

Plain page fetches get 403. Use the MediaWiki API with a project user-agent:

```
https://en.uesp.net/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=Lore:Helstrom
```
Book pages (`Lore:Pocket Guide…`, `Lore:The Argonian Account…`) return empty
extracts because they are transcluded — use `action=parse&prop=wikitext` for those.
Offline snapshot fallback: `elder-scrolls-asset-pipeline/skyrim-source/mod-sources/lore/uesp_morrowind_blackmarsh_extract.jsonl.xz`
(6,299 pages, raw wikitext, fields `title/ns/region/text`).

Page discovery that worked: `action=query&prop=links&plnamespace=130` on
`Lore:Black Marsh` yields the full province link graph (~300 Lore pages) — the
sweep list below came from it. Many neighbour settlements named on city pages
(Greenspring, Seafalls, Branchmont, Riverwalk, Portdun Mont, Longmont,
Rockspring, Chasepoint, Chasecreek, Rockpoint, Alten Markmont, Murkwater,
Slough Point, Hixinoag) have **no Lore page** — they are Arena/novel names only.
That is itself a finding: those places are ours to author.

---

## Packet status

| Packet | Scope | Status |
|---|---|---|
| 1 | UESP sweep → dossiers | **done** (2026-08-24) |
| 2 | Gap register | **done** (2026-08-24) |
| 3 | Province-level 4E 201 synthesis | **done** (2026-08-24) |
| 4 | Per-settlement 4E 201 extrapolation | **partial** — 8 majors + Alten Corimont done in [argonia-4e201-state.md](argonia-4e201-state.md) §4; secondary settlements outlined only |
| 5 | Per-faction extrapolation | **partial** — An-Xileel, Archeins, Shadowscales/Nisswo, Dres, Imperial remnant done; guilds (Mages/Fighters/Synod/College/Thieves/DB) outlined only |
| 6 | Ecology/encounter/loot lore feed (Phase 13) | not started |
| 7 | Re-verify + quest-plan delta application | deltas recorded, **not applied** (follow-up agent owns `docs/quests/`) |

## Packet 1 — UESP sweep log

All pages below were fetched from the live API on 2026-08-24 and mined into the
dossiers named in the right column. "—" means fetched and found to contain
nothing new or nothing Black Marsh-relevant.

**Province / survey**: Lore:Black Marsh, Lore:Argonian, Lore:Hist, Lore:Hist Sap,
Lore:Jel, Lore:Kingdom of Black Marsh, Lore:Duskfall, Lore:Xanmeer,
PGE1/The Wild Region, PGE3/Argonia (= /Black Marsh, same text),
The Improved Emperor's Guide to Tamriel/Black Marsh, The Argonian Account 1–4
→ `black-marsh-province.md`, `topics/hist-and-sap.md`,
`topics/material-culture.md`, `topics/history-timeline.md`, `duskfall.md`.

**Regions**: Lore:Shadowfen, Lore:Murkmire, Lore:Thornmarsh, Lore:Middle Argonia,
Lore:Gloomire, Lore:Blackwood, Lore:Deepmire, Lore:Murkwood, Lore:Ultherus Swamp
→ `regions/*.md`.

**Waters**: Lore:Oliis Bay, Lore:Topal Bay, Lore:Southern Sea, Lore:Padomaic Ocean,
Lore:Onkobra River, Lore:Panther River, Lore:Niben River, Lore:Keel-Sakka River
→ `regions/waters.md`.

**Eight majors + ports**: Lore:Helstrom, Lore:Gideon (+Lore:Twyllbek redirect),
Lore:Archon, Lore:Thorn, Lore:Blackrose, Lore:Lilmoth, Lore:Stormhold,
Lore:Soulrest, Lore:Alten Corimont → the city dossiers (all extended in place).

**Secondary places**: Lore:Mazzatun, Lore:Hissmir, Lore:Bogmother,
Lore:Hatching Pools, Lore:Stillrise Village, Lore:Loriasel, Lore:Ten-Maur-Wolk
(= Tenmar Wall), Lore:Gandranen Ruins, Lore:Alten Meerhleel, Lore:Rockpark,
Lore:Hutan-Tzel (= Rockguard), Lore:Glenbridge, Lore:Stonewastes,
Lore:Bright-Throat Village, Lore:Dead-Water Village, Lore:Root-Whisper Village,
Lore:Xinchei-Konu, Lore:Norg-Tzel, Lore:Fort Swampmoth, Lore:Blackrose Prison,
Lore:Arnesia, Lore:Noota Nara, Lore:Toll-Town (missing), Lore:Zuuk (stub)
→ `regions/secondary-settlements.md`.

**Peoples / factions**: Lore:Naga-Kur, Lore:Sul-Xan, Lore:Xit-Xaht, Lore:Naka-Desh,
Lore:Archein, Lore:Shadowscales, Lore:Nisswo, Lore:Sithis, Lore:Lilmothiit,
Lore:Kothringi, Lore:Yespest, Lore:Orma, Lore:Horwalli, Lore:Barsaebic Ayleids,
Lore:An-Xileel, Lore:House Dres, Lore:Ebonheart Pact, Lore:East Empire Company,
Lore:Cyrodilic Collections, Lore:Red Bramman
→ `tribes.md`, `an-xileel.md`, `topics/sithis-nisswo-shadowscales.md`,
`topics/lost-peoples.md`, `topics/foreign-powers.md`.

**Events**: Lore:Blackwater War, Lore:Battle of Argonia, Lore:Knahaten Flu,
Lore:Second Akaviri Invasion, Lore:Arnesian War, Lore:Oblivion Crisis,
Lore:Accession War, Lore:Umbriel, Lore:Fourth Era
→ `topics/history-timeline.md`.

**Fauna / flora / hazards**: Lore:Rootworm, Lore:Lizard-Steed, Lore:Marsh Giant,
Lore:Miregaunt, Lore:Wamasu, Lore:Haj Mota, Lore:Voriplasm, Lore:Swamp Leviathan,
Lore:Kotu Gava, Lore:Stormhold Crystal (in Lore:Jasper)
→ `topics/fauna-hazards.md`.

### Sweep gaps still open (next agent: fetch these)

- `Lore:Tribes of Murkmire` book series (individual volumes), `Lore:Tribes of
  Blackwood` volumes — partly mined via `tribes.md` already; volumes not
  individually fetched this run.
- `Lore:Varieties of Faith: The Argonians` (quest-plan source L33), `Lore:Argonian
  Cuisine`, `Lore:The Seasons of Argonia`, `Lore:Loremaster's Archive: Murkmire
  Q&A` Pts 1–2 (returned stubs via `extracts`; retry with `action=parse`).
- `Lore:Solstice` / Izta-Ahuak (off-map but the Tide-Born rites are a useful
  contrast for our coastal Argonians).
- ESO `Online:` namespace zone pages for Shadowfen/Murkmire/Blackwood — richer
  local detail than `Lore:`, era-tag hard as 2E.
- The two Greg Keyes novels are not on UESP in full; our 4E 40s detail comes via
  `Lore:Lilmoth`, `Lore:An-Xileel`, `Lore:Umbriel`, `Lore:Kingdom of Black Marsh`.

## Packet 2–3 outputs

- [gap-register.md](gap-register.md) — what the game must know that canon doesn't say.
- [argonia-4e201-state.md](argonia-4e201-state.md) — the province synthesis.
- [owner-questions.md](owner-questions.md) — decisions escalated, with recommendations.
- [quest-plan-deltas.md](quest-plan-deltas.md) — proposed `docs/quests/` changes (not applied).
