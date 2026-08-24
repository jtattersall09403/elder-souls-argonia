# Lore dossiers

Canon records feeding world generation (danger, cultures, routes), the Phase 11
causal models, quests and dialogue. **Filenames are the map — read only what your
task touches.**

## Sourcing rules

- Primary source: **UESP**. Prefer the live MediaWiki API (plain page fetches get
  403); the vault snapshot
  (`elder-scrolls-asset-pipeline/skyrim-source/mod-sources/lore/uesp_morrowind_blackmarsh_extract.jsonl.xz`,
  6,299 pages of raw wikitext) is the offline fallback. Working API recipes are
  in [extrapolation/PROGRESS.md](extrapolation/PROGRESS.md).
- **Cite the UESP page name on every fact.**
- **Tier every statement**: `CANON_EXPLICIT` / `CANON_DERIVED` / `EXTRAPOLATED` /
  `AGENT_INVENTED`. Never blur tiers. (Older files use the master plan §13
  vocabulary — `CANON_FIXED`, `GAME_DERIVED`, `LORE_INFERRED`, `AGENT_AUTHORED`;
  treat these as equivalent and migrate opportunistically.)
- Era policy is decision 0002: **production era 4E 201**. Earlier-era facts are
  history; ESO (2E) political states must not leak into the present.
- The old planning repo (`~/workspace/elder-souls-claude/.../corpus/60-lore`) is
  **unverified** — mine it for leads only.
- Before quest/dialogue authoring against a dossier, re-verify on live UESP.

## Start here

- **[black-marsh-province.md](black-marsh-province.md)** — the province overview
  and the router to everything below.
- **[extrapolation/argonia-4e201-state.md](extrapolation/argonia-4e201-state.md)**
  — what the province is like *in our era*, where canon runs out.

## Cities

[helstrom](helstrom.md) · [gideon](gideon.md) · [archon](archon.md) ·
[thorn](thorn.md) · [blackrose](blackrose.md) · [lilmoth](lilmoth.md) ·
[stormhold](stormhold.md) · [soulrest](soulrest.md) ·
[alten-corimont](alten-corimont.md)

## Regions

[shadowfen](regions/shadowfen.md) · [murkmire](regions/murkmire.md) ·
[thornmarsh-and-east](regions/thornmarsh-and-east.md) ·
[middle-argonia](regions/middle-argonia.md) ·
[blackwood-and-gloommire](regions/blackwood-and-gloommire.md) ·
[waters](regions/waters.md) (bays, rivers, seas — the province's primary
structure) ·
[secondary-settlements](regions/secondary-settlements.md) (gazetteer of
everything below the eight majors, plus the canon adjacency graph)

## Topics

| File | Covers |
|---|---|
| [topics/history-timeline.md](topics/history-timeline.md) | Every dated event to 4E 201. **Read before asserting anything about the era.** |
| [topics/hist-and-sap.md](topics/hist-and-sap.md) | The Hist, sap, *gloor*, hatching, communion, the Hist as political actor |
| [topics/hist-placement.md](topics/hist-placement.md) | **Which Hist stands where, in what state, and who speaks for it** — the placement rule plus a per-settlement register. Required before writing any Argonian settlement's causal record. |
| [topics/guilds-and-orders.md](topics/guilds-and-orders.md) | Synod, College of Whispers, Fighters/Thieves Guild, Dark Brotherhood, Cyrodilic Collections, the Conclaves and the cult of Seth, the Wild Ones |
| [topics/ecology-encounters-loot.md](topics/ecology-encounters-loot.md) | Phase 13 feed: regional encounter composition, territory-holders, loot provenance, underwater ecology, seasonal keying |
| [topics/sithis-nisswo-shadowscales.md](topics/sithis-nisswo-shadowscales.md) | Religion: the two Sithises, the Clutch of Nisswo, Shadowscales, death rites, the Scalded Throne |
| [topics/material-culture.md](topics/material-culture.md) | Building, craft, food, drugs, dress, music, sport, calendar, tribal offices, Jel register — **the prop-and-dialogue brief** |
| [topics/fauna-hazards.md](topics/fauna-hazards.md) | Creatures, diseases, flora, minerals, environmental hazards (Phase 13 feed) |
| [topics/foreign-powers.md](topics/foreign-powers.md) | Empire, Dres/Morrowind, Pact, Dominion, EEC, Cyrodilic Collections, pirates and criminals |
| [topics/lost-peoples.md](topics/lost-peoples.md) | Kothringi, Lilmothiit, Orma, Yespest, Horwalli, Barsaebic Ayleids (and Fenlords), Cantemiric Velothi |
| [topics/prisons.md](topics/prisons.md) | Blackrose Prison, White Rose, Stormhold's prison — the province as prison state |
| [tribes.md](tribes.md) | Argonian tribes, breeds and tribal politics |
| [an-xileel.md](an-xileel.md) · [duskfall.md](duskfall.md) · [eye-of-argonia.md](eye-of-argonia.md) | Faction and mystery dossiers |

## The extrapolation workstream

Fills the gap between what canon says and what the game needs to know
(charter: [docs/world/45-lore-extrapolation.md](../../../docs/world/45-lore-extrapolation.md)).

| File | Purpose |
|---|---|
| [extrapolation/PROGRESS.md](extrapolation/PROGRESS.md) | Packet status, sweep log, API recipes, canon-tier definitions, **owner decisions in force**. **Resume here.** |
| [extrapolation/gap-register.md](extrapolation/gap-register.md) | What the game must know that canon doesn't state. **Closed — zero `OPEN`.** |
| [extrapolation/argonia-4e201-state.md](extrapolation/argonia-4e201-state.md) | The 4E 201 synthesis: government, cities, economy, routes, danger. **§9 is the binding trauma directive.** |
| [extrapolation/settlement-register.md](extrapolation/settlement-register.md) | Magnitude ladder; every settlement's 4E 201 status; currency; drifting villages; xanmeer states; White Rose and Fort Swampmoth |
| [extrapolation/owner-questions.md](extrapolation/owner-questions.md) | Round 1 **decided and binding**; Round 2 (Q6–Q9) open |
| [extrapolation/quest-plan-deltas.md](extrapolation/quest-plan-deltas.md) | D1–D16 proposed `docs/quests/` changes — **not applied**; a follow-up agent owns these |

## Binding decisions (2026-08-24)

Set by the owner; do not re-litigate. Full text at the foot of
[extrapolation/owner-questions.md](extrapolation/owner-questions.md).

1. The **An-Xileel are a successor state** — inherited offices, titles and name
   (Archwardens, the Organism); the movement broke at 4E 48.
2. The Hist speak through an occasional **great Root Talk convocation at
   Helstrom** — an occasion, not a council.
3. **Blackrose Prison is a ruin reoccupied by the Blackguards' heirs.**
4. **Lilmoth is rebuilt but not restored**, on a mass grave, its third Hist grown
   from the second's root.
5. Register is **melancholy and dignified, horror kept local** — and the trauma of
   4E 48 plays at **the emotional distance our own 2026 has from the First World
   War**: no living witnesses, but memorials, family stories, place-names,
   politics shaped by it, and institutions visibly bent around the wound.

## Dossier backlog

Enrichment only — nothing here blocks. *Varieties of Faith: The Argonians* (L33)
and *The Seasons of Argonia* (retry via `action=parse`, not `extracts`); the
individual *Tribes of Murkmire* and *Tribes of Blackwood* volumes; Umbriel in
depth (L15); Ruins of Mazzatun (L23); ESO `Online:` zone pages (2E, era-tag hard).
