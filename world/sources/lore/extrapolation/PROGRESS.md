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
| 4 | Per-settlement 4E 201 extrapolation | **done** — [settlement-register.md](settlement-register.md): magnitude ladder, every canon settlement's 4E 201 status, the 15 Arena-name placements, drifting villages, xanmeer states, currency, White Rose, Fort Swampmoth |
| 5 | Per-faction extrapolation | **done** — [../topics/guilds-and-orders.md](../topics/guilds-and-orders.md): Synod, College of Whispers, Fighters/Thieves Guild, Dark Brotherhood, Cyrodilic Collections, the Conclaves, the Wild Ones |
| — | **Hist placement** (G2.10/G5.7, Phase 11 blocker) | **done** — [../topics/hist-placement.md](../topics/hist-placement.md): rules R1–R6 + a per-settlement register |
| 6 | Ecology/encounter/loot lore feed (Phase 13) | **done** — [../topics/ecology-encounters-loot.md](../topics/ecology-encounters-loot.md) |
| 7 | Re-verify + quest-plan deltas | **done** — D1–D16 in [quest-plan-deltas.md](quest-plan-deltas.md); **not applied** (a follow-up agent owns `docs/quests/`) |

**Gap register status: zero `OPEN`.** Everything is `FILLED`, `DECIDED`, `DEFER`
(with a phase and a reason) or `MYSTERY`. See [gap-register.md](gap-register.md).

## Owner decisions in force

Round 1 (2026-08-24) — all five recommendations accepted and **binding**:
An-Xileel **successor state** (Q1); Hist speak through a **great Root Talk
convocation at Helstrom** (Q2); Blackrose Prison is a **ruin reoccupied by the
Blackguards' heirs** (Q3); Lilmoth **rebuilt but not restored** (Q4); register
**melancholy and dignified, horror kept local** (Q5) — plus the owner's addition
that **the trauma of 4E 48 plays at the emotional distance our 2026 has from the
First World War**, which is developed in
[argonia-4e201-state.md](argonia-4e201-state.md) **§9** and binds all lore, world
and quest work.

Round 2 (raised 2026-08-24, awaiting owner): **Q6** Wild One vigil-communities ·
**Q7** whether the state runs a live coercive institution · **Q8** whether
Mazzatun's Hist is waking · **Q9** Gideon's disputed Hist cutting. All four have
a working tiered answer in the dossiers, so nothing is blocked.

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

## Packet 4–6 sweep log (second fetch round)

**Guilds and orders**: Lore:Mages Guild, Lore:Synod, Lore:College of Whispers,
Lore:Fighters Guild, Lore:Thieves Guild, Lore:Dark Brotherhood, Lore:Fourth Era,
Lore:Cyrodilic Collections → `topics/guilds-and-orders.md`.
*Key finds*: the Mages Guild dissolved at the start of the 4E into the Synod and
the College of Whispers; **Hierem — the Imperial minister who performed the
Umbriel ritual at the Lilmoth city tree in 4E 47 — was the Synod's most
influential patron**; the Fighters Guild had no active chapters by the 4E and
Black Marsh was never on its Council of Province Generals; the Thieves Guild
"operates along provincial lines with little if any apparent coordination".

**Fauna / flora detail for Phase 13**: Lore:Hackwing, Lore:Death Hopper,
Lore:Bog Dog, Lore:Swamp Jelly, Lore:Ripper Eel, Lore:Sea-Drake, Lore:Crocodile,
Lore:Alit, Lore:Guar, Lore:Giant Snake, Lore:Lamia, Lore:Dreugh, Lore:Voriplasm,
Lore:Terror Bird (not native), Lore:Argonian Cuisine, Lore:Solstice (island),
Lore:Keshu the Black Fin, Lore:Heita-Meen, Lore:Drugs
→ `topics/ecology-encounters-loot.md`.
*Key finds*: hackwings wound-and-return "when the victim is almost dead from
blood loss"; death hoppers ambush from under water and spit poison at range;
**ripper eels are trained to hunt Argonians crossing Lilmoth's canals, countered
by eel-slime**; swamp jellies are docile and flavour-named, except in Deepmire
where they kill on contact; crocodiles are *rormasu* in Jel and are domesticated
by the Dead-Water tribe; Solstice is **Oztet-Ta**, "Sprouting Root".

*Pages fetched and found to add nothing Black Marsh-relevant*: Lore:Vicecanon,
Lore:Shellback, Lore:Diamond Marines (all missing/stubs), Lore:Nightbloom,
Lore:Dragon's Tongue, Lore:Flint Vine, Lore:Somnalius Fern (catch-all flora
lists), Lore:Great War, Lore:Thalmor (no in-province presence recorded).

### Sweep gaps still open (next agent: fetch these)

- `Lore:Tribes of Murkmire` book series (individual volumes), `Lore:Tribes of
  Blackwood` volumes — partly mined via `tribes.md` already; volumes not
  individually fetched.
- `Lore:Varieties of Faith: The Argonians` (quest-plan source L33) and
  `Lore:The Seasons of Argonia` — returned stubs via `extracts`; **retry with
  `action=parse`**. `Lore:Argonian Cuisine` was recovered this round.
- ESO `Online:` namespace zone pages for Shadowfen/Murkmire/Blackwood — richer
  local detail than `Lore:`, era-tag hard as 2E.
- The two Greg Keyes novels are not on UESP in full; our 4E 40s detail comes via
  `Lore:Lilmoth`, `Lore:An-Xileel`, `Lore:Umbriel`, `Lore:Kingdom of Black Marsh`.

**Note for whoever picks these up**: none of them is blocking. The gap register is
closed and every remaining fetch is enrichment, not a dependency.

## Outputs by packet

| Packet | File |
|---|---|
| 2 | [gap-register.md](gap-register.md) — closed, zero `OPEN` |
| 3 | [argonia-4e201-state.md](argonia-4e201-state.md) — the province synthesis; **§9 is the binding trauma directive** |
| 4 | [settlement-register.md](settlement-register.md) |
| 5 | [../topics/guilds-and-orders.md](../topics/guilds-and-orders.md) |
| Blocker | [../topics/hist-placement.md](../topics/hist-placement.md) |
| 6 | [../topics/ecology-encounters-loot.md](../topics/ecology-encounters-loot.md) |
| 7 | [quest-plan-deltas.md](quest-plan-deltas.md) — D1–D16, **not applied** |
| — | [owner-questions.md](owner-questions.md) — Round 1 decided, Round 2 open |
