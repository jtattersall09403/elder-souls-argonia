# Phase 11 catalogue critique — lore fidelity, era correctness, citation hygiene

**Date:** 2026-09-02 · **Scope:** `world/sources/catalogue/*` (729 place records,
8 region files + taxonomy + type-recipes) · **Binding era:** 4E 201
(decision [0002](../../../decisions/0002-era-and-source-confidence.md)) ·
**Method:** mechanical citation lint over every string field in all 10 files;
full-corpus keyword census for era markers (not a sample — all 729 records);
26 canon-named records checked line-by-line against the live UESP article text
via the MediaWiki API; 71 explicit duration claims arithmetic-checked against
the canon timeline.

**Verdict: PASS WITH FIXES.** The substance is unusually good. Of 26 canon-named
records checked against the actual UESP article, 21 are accurate in every detail
checked and several are better-grounded than the dossiers they cite. The 10-tree
Hist roster is 12/12 exact; foreign foundations carry zero Hist; Murkmire,
naga-kur-deeps and imperial-penal-south have **zero** two-culture blends; 20 of 24
quest provisions are met. The defects cluster in four classes, none of which
requires re-authoring: **broken or imprecise citations** (50 instances, all
one-line fixes), **era arithmetic against the Knahaten Flu and the Red Year** (6
records), **three genuine canon-dressed inventions**, and one systemic
**two-culture blend across 108 hist-heartland records** whose root cause is that
the rule never assigned the interior a kit. Three canon settlements
(Root-Whisper Village, Hutan-Tzel, Deepmire's Refuge) are missing outright.

---

## 1. Canon-dressed invention (worst class) — 3 findings

A record whose `provenance` is `canon-named` and whose sources cite a canon page,
but where the canon page does not support the claim. This is the worst class
because a future agent will treat the claim as fixed and build on it.

### L1 (HIGH) — `place.dunmer-north.tenmar-wall` and `place.dunmer-north.ten-maur-wolk` are one canon place split into two

`Lore:Ten-Maur-Wolk` states plainly: *"When the Third Empire took over and
constructed maps of the province, they gave the site an Imperialized name:
**Tenmar Wall**."* Tenmar Wall **is** Ten-Maur-Wolk — the Imperial exonym for the
Boethiah/Vaermina Daedric ruin, not a separate settlement.

The catalogue has both, both `canon-named`, and `tenmar-wall` cites
`uesp:Lore:Ten-Maur-Wolk` while describing a *town* at a three-way road hinge and
asserting "canon names as a neighbour of Helstrom, Stormhold and Alten Corimont
at once". The cited page names no such neighbours and describes no town.

**Fix (one of two):** (a) merge — make Tenmar Wall an `alias` on the Ten-Maur-Wolk
record, and move the road-hinge settlement to a new `lore-implied` ID with its own
non-canon name; or (b) keep both but cite `Arena:Tenmar Wall` (Arena does render
it as a walkable settlement) on the town record, drop `uesp:Lore:Ten-Maur-Wolk`
from it, and add one sentence in `why.founding` acknowledging that the town grew
at the ruin the Empire renamed. (b) is cheaper and keeps the road hinge.

### L2 (HIGH) — `place.dunmer-north.ten-maur-wolk` invents a Dunmer slave camp on a canon Daedric site

Record: *"A Daedric site beside the northern road hinge, and a former **Dunmer
slave camp** — two kinds of atrocity on one piece of ground."* Provenance
`canon-named`, sources `Lore:Ten-Maur-Wolk`, `Lore:Boethiah`, `Lore:Vaermina`.

Canon says the builders were *"Dark Elven **dissidents** from the north"* who
raised a temple to Boethiah and Vaermina. Dissidents fleeing Tribunal orthodoxy
are close to the opposite of a Dres slaving station, and no source connects
Ten-Maur-Wolk to the slave trade. The record has borrowed the province's Dunmer-
slavery theme (which is canon, at Stormhold and Thorn) and attached it to a canon
place that does not carry it.

**Fix:** replace "a former Dunmer slave camp" with "raised by Dunmer dissidents
who fled the Tribunal, and abandoned by them"; keep the two-atrocities beat by
sourcing the second atrocity to the road (the Dres route north) rather than to
the ruin.

### L3 (MODERATE) — `place.hist-heartland.umpholo-mission` cites a page that does not exist for a claim it quotes

Sources include `Lore:Umpholo (the mission died of swamp rot within a month)` —
presented as a canon quotation. **There is no `Lore:Umpholo` page in any UESP
namespace.** The claim itself *is* canon (The Argonian Account, Bks 3–4), and the
repo already records it correctly at
`world/sources/lore/regions/secondary-settlements.md:49`. The record has dressed a
correctly-sourced dossier fact in a fabricated page citation.

This is the same shape as L4 below and is aggravated by the fact that the repo
**already knew**: `world/sources/lore/extrapolation/PROGRESS.md:35` states that
Greenspring, Seafalls, Branchmont, Riverwalk, Portdun Mont, Longmont, Rockspring,
Chasepoint, Chasecreek, Rockpoint, Alten Markmont, Murkwater, **Slough Point** and
**Hixinoag** "have **no Lore page** — they are Arena/novel names only. That is
itself a finding: those places are ours to author." The catalogue then cites
`uesp:Lore:Slough Point`, `uesp:Lore:Hixinoag`, `uesp:Lore:Greenspring`,
`uesp:Lore:Seafalls`, `uesp:Lore:Murkwater` and `Lore:Alten Markmont` anyway.

**Fix:** replace with `world/sources/lore/regions/secondary-settlements.md §Umpholo`
+ `Books:The Argonian Account, Book 3`. See §2 for the systemic version.

### Near-miss, cleared on inspection

- `place.imperial-fringe.orma-tactile-ruin` — the "born without eye sockets,
  masters of touch, skull used as a door marker" claim is **verbatim accurate**
  against `Lore:Orma`, including "no longer inhabit the province by the late Third
  Era". Best-sourced record checked.
- `place.imperial-fringe.onkobra-kwama-mine` — "Dunmer husbandry" initially looked
  like a contradiction of canon's Argonian slave takeover of the kwama mines, but
  `culture: argonian` and Owing-held mine hands make it clear the record means the
  *technique* not the *owners*. Correct. Suggest adding the takeover to
  `why.founding` in one clause so the next reader doesn't re-run this check.
- The Blackrose cluster (`rebellion-earthworks`/Welloc's Lines, `vampiric-cloud-ground`,
  `kothringi-ruin-basin`, `lilmothiit-quarry`, `yespest-site`, `akaviri-works`) —
  invented *names* over canon *subjects*, all of which (Welloc, the vampiric cloud
  spell, the Lilmothiit foundations, Yespest, Versidue-Shaie) are correctly
  sourced in `world/sources/lore/blackrose.md`. Not a defect. But see L4.

### L4 (PROCESS) — `canon-named` is being used for two different things

Decision 0041 defines the provenance vocabulary but never defines the terms. In
practice the catalogue uses `canon-named` for both (a) *the name is canon*
(Bogmother, Mazzatun, Thorn) and (b) *the subject is canon, the name is ours*
(Welloc's Lines, The Given Field, The Robbed City, The Ripple Spire, The Hand-Read
Halls, Ash-Hand, The Wrong Name — at least 14 records). Both are legitimate; they
are not the same guarantee, and a downstream agent cannot tell them apart. This
is what made L1–L3 hard to find and is the root cause worth fixing.

**Fix:** add one line to 0041 §"provenance" defining `canon-named` as "the place
**and** its name are canon" and introduce `canon-anchored` for (b) — or, cheaper
and non-breaking, require that a `canon-named` record's `name` field appear
verbatim in at least one cited source, and add that as an `npm test` lint. That
lint would have caught all three findings above.

---

## 2. Broken and imprecise citations

### 2a. Repo paths that do not resolve — 17 instances, 6 paths

All six are one-line renames. Every target exists under a slightly different name;
none of the cited facts are wrong.

| Broken path | Correct path | n | Records |
|---|---|---|---|
| `docs/world/50-hydrology.md` | `docs/world/50-hydrology-climate.md` | 7 | `dunmer-north.the-drawdown-flats`, `imperial-fringe.the-eight-steps`, `imperial-fringe.the-second-empire-locks`, `pirate-freeholds.lake-drawdown-flat`, `saxhleel-coast.delta-drowning-narrows`, `saxhleel-coast.tide-run-channel`, `saxhleel-coast.tide-run-delta` |
| `docs/world/20-region-grammar.md` | `docs/world/20-province-design.md` | 4 | `imperial-fringe.the-black-tarn`, `imperial-fringe.the-cold-lights`, `imperial-fringe.the-embankment-that-drowned`, `imperial-fringe.the-ring-of-nine-wells` |
| `docs/world/55-time-and-sky.md` | `docs/world/55-light-sky-time.md` | 3 | `pirate-freeholds.rim-pass-station`, `saxhleel-coast.headland-storm-shelter`, `saxhleel-coast.lagoon-storm-shelter` |
| `docs/world/30-systems.md` | `docs/world/30-lore-systems.md` | 1 | `imperial-fringe.the-empty-steading` |
| `docs/world/55-time-light-weather.md` | `docs/world/55-light-sky-time.md` | 1 | `imperial-fringe.the-standing-mist` |
| `world/sources/lore/topics/argonia-4e201-state.md` | `world/sources/lore/extrapolation/argonia-4e201-state.md` | 1 | `pirate-freeholds.freehold-pest-house` |

The remaining 41 distinct repo paths cited across the catalogue all resolve.

### 2b. UESP page titles that do not exist — 33 titles

Checked all 165 distinct wiki titles cited anywhere in the catalogue against the
live UESP API (`action=query&redirects=1`). 132 resolve. The 33 below do not, in
the namespace cited. Most exist under a different namespace — the citation format
has been guessed rather than checked, and `Lore:` has been used as a default.

**Wrong namespace — mechanical fix, 12 titles:**

| Cited | Actual | Example records |
|---|---|---|
| `Lore:Alten Markmont` | `Arena:Alten Markmont` | `hist-heartland.alten-markmont` |
| `Lore:Greenspring` | `Arena:Greenspring` | `hist-heartland.greenspring` |
| `Lore:Seafalls` | `Arena:Seafalls` | `saxhleel-coast.seafalls` + 5 others |
| `Lore:Murkwater` | `Online:Murkwater` | `dunmer-north.murkwater` |
| `Lore:Argonian Houseboat` | `Online:Argonian Houseboat` | `naga-kur-deeps.raft-village-lashed` |
| `Lore:Hissmir Fish-Eye Rye` | `Online:Hissmir Fish-Eye Rye` | 5 tradehouse records |
| `Lore:Hist-Tsoko` | `Online:Hist-Tsoko` | `hist-heartland.root-talk-ground` |
| `Lore:Teeth of Sithis` | `Online:Teeth of Sithis` | `naga-kur-deeps.sithis-temple-mass-sacrifice` |
| `Lore:Trials of the Burnished Scales` | `Online:Trials of the Burnished Scales` | `dunmer-north.hissmir` |
| `Lore:Twyllbek Ruins` | `Online:Twyllbek Ruins` | `imperial-fringe.twyllbek-ruins` + 2 |
| `Lore:White Rose Prison` | `Online:White Rose Prison` | `pirate-freeholds.bone-repatriation-waystation` |
| `Lore:Xal Irasotl` | `Online:Xal Irasotl` | `hist-heartland.tended-xanmeer-clan-north` |
| `Lore:Xul-Thuxis` | `Online:Xul-Thuxis` | `imperial-fringe.glenbridge-sermon-xanmeer` + 1 |

**Wrong title form — 4 titles:** `Lore:Bright-Throat` → `Lore:Bright-Throat Tribe`;
`Lore:Dead-Water` → `Online:Dead-Water Tribe`; `Lore:Xi-Tsei Massacre` →
`Lore:Xi-Tsei`; `Lore:Zuuk` → **`Lore:Zuuk (place)`** (`Lore:Zuuk` is a
disambiguation between Lord Zuuk the person and the settlement — the record means
the settlement).

**Redirects into a section — cite the anchor, 2 titles:** `Lore:Rootworm` redirects
to `Lore:Bestiary R` (22 records — the single most-cited broken title; cite
`Lore:Bestiary R#Rootworm`); `Lore:Onkobra Kwama Mine` redirects to
`Lore:Onkobra River`.

**No UESP page at all — 15 titles.** These are the ones that matter, because they
present dossier extrapolation as wiki-checkable canon:
`Lore:Umpholo` (L3), `Lore:Slough Point`, `Lore:Hixinoag`, `Lore:Giovesse`,
`Lore:Blackwood Road`, `Lore:Hereguard Plantation`, `Lore:Keel-Sakka`,
`Lore:Lut-Eileel`, `Lore:Kota-Vimleel`, `Lore:Lakemire Xanmeer`, `Lore:Riverbacks`,
`Lore:Blight Bog`, `Lore:Pusbottom`, `Lore:Shells and Stones`, `Lore:Sky-Moons`,
`Lore:Lucinia Falco`, `Lore:Argonian Invasion of Morrowind`.

Every one of these names *is* attested somewhere in the repo's dossiers (Keel-Sakka
and Hereguard in `lilmoth.md:55`; Lut-Eileel and Kota-Vimleel in `tribes.md`;
Blackwood Road in `gideon.md:12`; Slough Point in `foreign-powers.md:29`;
Moonmarch in `sky-moons-calendar.md:74`) — they are mentions inside *other* wiki
articles, not articles of their own.

**Fix, all 33:** re-point at the dossier that actually records the fact, plus the
containing wiki article where one exists (e.g. `Lore:Lilmoth` for Keel-Sakka and
Hereguard, `Lore:Gideon` for the Blackwood Road, `Lore:Murkmire` for Lakemire).

**Fix, systemic:** add a citation lint to `npm test` that (i) resolves every
`docs/`, `world/`, `packages/` path in every catalogue string against the
filesystem, and (ii) checks every `Namespace:Title` citation against a checked-in
allowlist of verified UESP titles. Part (i) is ~15 lines and would have caught all
17 of §2a at authoring time; part (ii) needs a one-off title dump, which this audit
has effectively produced. This is the highest-value fix in the whole review.

---

## 3. Era correctness (4E 201)

Ran a full-corpus census rather than a sample: every record scanned for 2E/3E/4E
markers, ESO-era institutions, Umbriel, the Knahaten Flu, the An-Xileel and the
Thalmor; then all 71 explicit duration claims arithmetic-checked.

**The frame is sound.** The Imperial-withdrawal horizon is used with real
discipline: "two centuries ago" appears 11 times and is correct every time
(withdrawal ≈ 4E 1–17, so ≈ 200 years before 4E 201). `mercantile-coast.cold-light`
("Imperial harbour works lit the Topal approach for four centuries") is exactly
right — Tiber Septim's annexation 2E 896 to withdrawal ≈ 4E 1 is 431 years. Umbriel
is consistently and correctly placed at 4E 48 across 38 records. No ESO-era
political institution is presented as extant: the only two hits, the Mages Guild
and the Fighters Guild, appear as *dissolved* or *inherited-by-the-Synod*.

### E1 (MODERATE) — Knahaten Flu distance is under-counted in five records

The Flu ran 2E 560–603. From 4E 201 that is **≈ 1,570 years**. Five records treat
it as a few-hundred-year-old event:

| Record | Claim | Should be |
|---|---|---|
| `dunmer-north.the-shut-village` | "the practice outlived the reason by **three centuries**" | ≈ sixteen centuries |
| `imperial-penal-south.plague-cordon` | villages "still describe themselves as being outside, **two and a half centuries** later" | ≈ sixteen centuries |
| `naga-kur-deeps.kothringi-ruin-village-deeps` | "the best unclaimed landing in the zone and has been for **six centuries**" | ≈ sixteen centuries |
| `dunmer-north.the-two-hundred-roofs` | "the Flu emptied in one season and **nobody has since reoccupied**" | plausible only if the taboo is stated; 1,570 years of an unclaimed prime landing needs the reason on the page |
| `imperial-penal-south.rose-supply-town` | "The Rose needed feeding for **eight centuries**" | Blackrose Prison dates to Versidue-Shaie (2E ~300); ≈ 1,230 years |

**Fix:** the first three are single-word edits ("three centuries" → "sixteen
centuries", etc.). For the fourth, add the taboo clause the sibling records already
carry. For the fifth, "eight centuries" → "twelve centuries", or soften to
"for as long as the Empire held the province".

This is a real class, not pedantry: the Flu is cited in 43 records and is the
province's foundational depopulation event. If the catalogue's internal sense of
"how long ago" is wrong by a factor of five, downstream ruin-condition, vegetation-
overgrowth and NPC-memory decisions inherit the error.

### E2 (MODERATE) — Red Year distance is wrong in one record

`dunmer-north.the-sump-hamlet`: "Dunmer refugees from the Red Year, **four
generations back**". The Red Year is 4E 5; 4E 201 is 196 years later ≈ **7–8
generations**. The record repeats "four generations of occupation" in
`occupantsMotive`, so both need the same edit. Related and worth a look:
`pirate-freeholds.dunmer-frontier-holding` says "Dunmer families **three centuries**
settled" — defensible only if they predate the Red Year as a Dres frontier
holding, which the record's `why.founding` does in fact imply. Clear, but add the
half-clause.

### E3 (LOW–MODERATE) — ESO 2E 582 quest outcomes carried as live 4E 201 civic identity

Decision 0002 says 2E sources "remain usable for places, tribes and ecology but
must be down-weighted for political state". Three records import a 2E 582 *event
outcome* as a present-day social fact:

- `dunmer-north.murkwater` — "liberated by [the Shadowscales] in 2E 582 and quietly
  proud of it **ever since**" (1,619 years of pride).
- `dunmer-north.stillrise-village` — "the array was preserved rather than destroyed
  in 2E 582, so the argument that started then is **still running, with the same
  participants**." *Partially cleared*: the villagers are technically dead under a
  Clavicus Vile bargain, so the same participants is defensible — but the record
  should say so, because as written it reads as an era error.
- `dunmer-north.hatching-pools` — "rebuilt after the **Dominion massacre** and again
  after Umbriel". The Dominion attack is ESO content (2E 582); Umbriel is 4E 48. The
  pairing implies comparable recency across a 1,600-year gap.

**Fix:** for Murkwater, "ever since" → "and the story is still told, which is not
the same as the place still mattering". For Stillrise, add the six words that make
the undead premise explicit. For the Hatching Pools, drop the Dominion clause or
demote it to a carving.

### E4 (LOW) — `mercantile-coast.rockpark` under-counts its own timeline

`world/sources/lore/topics/history-timeline.md:64` dates Rockpark's collapse to
~3E 145 — **≈ 490 years** before 4E 201. The record says "stocked with **two
centuries** of untouched goods". Fix: "five centuries", or re-word to "untouched
since the town died".

### E5 (LOW) — `saxhleel-coast.archon-thalmor-post` is compliant but mislabelled

`world/sources/lore/topics/foreign-powers.md:82` is explicit: "Canon records **no
Thalmor presence inside Black Marsh in the 4E**", and
`argonia-4e201-state.md:486` prescribes interest that is "real, deniable, and
conducted at arm's length… a visible Thalmor presence would contradict the
province's whole posture." The record's *content* obeys this perfectly — two
agents, an unwitting local hire, a loft. But the **ID says `thalmor`** and
`culture: altmer`, which makes the installation legible as Thalmor to every
downstream system that reads IDs or culture (asset selection, faction tagging,
the eventual quest-condition vocabulary).

**Fix:** rename to `place.saxhleel-coast.archon-listening-loft`, set `culture` to
the cover (`imperial` or `argonian`), and keep the Dominion attribution in
`why.founding` only. Cheap now; a rename after Phase 12 plots coordinates is not.

### Cleared on inspection

Umbriel (4E 48, 38 records), the Blackwater War (1E 2820), the All Flags Navy
(1E 2260), Versidue-Shaie / the Akaviri Potentate, the 3E 427 uprisings and the
6-years-later abandonment, the four-century Dres slaving window, and the An-Xileel
"promised clean province" framing in `hist-heartland.waiting-vigil-village` — all
checked, all era-correct. `dunmer-north.the-whispers-dig` and
`imperial-fringe.gideon-synod-outstation` correctly use the 4E successor bodies
(College of Whispers, Synod) rather than the Mages Guild.

---

## 4. Canon spot-check results (26 records)

Checked against live UESP article text, not against the dossiers, so this also
tests the dossiers.

**Accurate in every detail checked (21):** Bogmother (temple village, SW of
Stormhold, venerable relics, the stone causeway), Mazzatun (Xit-Xaht, stone after
Duskfall, the Hist enslaved with sap — matches Tsono-Xuhil and Amber Plasm),
Stormhold (built over Silyanorn, Barsaebic, Dunmer slavery foothold), Silyanorn
Diggings, Outer Silyanorn, Gandranen (Ayleid sorcerer, Hermaeus Mora, halls that
attract anachronistic books — the "Anachronistic Library" record is an excellent
read of canon), Loriasel (Barsaebic citadel, Ten Ancestors, lamias below),
Hatching Pools (Keepers of the Shell, Hist-sap pools), Ten-Maur-Wolk *as a Daedric
site*, Thorn (Dres, saltrice fields, Tear road), Zuuk (Kothringi, 2E 561, one
week), Stillrise Village (Clavicus Vile, soul gems), Archon (Padomaic estuary,
EEC), Alten Corimont (All Flags Navy freebooters), Hissmir (Trials of the Burnished
Scales, non-Argonians may attempt them, lukiul pilgrims — verbatim), Soulrest (3E
provincial capital, Topal Bay peninsula), Lilmoth (Oliis Bay, sunken Imperial
villas, 4E 48), Gideon (Blackwood Road from Leyawiin, Nibenese, Barsaebic layer),
Castle Giovesse (fortress near Gideon, held Empress Tavia), The Silent Halls
(Sul-Xan-held), Xinchei-Konu (ku-vastei, the jekka-wass keeper, weather-changing —
verbatim), Orma (see §1).

**Divergences (5):** L1, L2, L3 above, plus —

- **`imperial-fringe.rockgrove` (LOW, omission)** — the record makes Rockgrove a
  Sul-Xan holding, which `Lore:Sul-Xan` supports ("the conquered Rockgrove"). But
  `Lore:Rockgrove` gives it a live Argonian counterparty the catalogue drops
  entirely: the **Ca-Uxith tribe**, charged by their Hist to watch the xanmeer,
  whose stone-talkers preserve the ruins against the **geyser field** beneath it.
  That is a free adjacent settlement, a free hazard and a free faction tension.
  Recommend adding a Ca-Uxith watch-village record rather than editing Rockgrove.
- **`imperial-fringe.xi-tsei-massacre-ground` (LOW, siting)** — `Lore:Xi-Tsei`
  places it "on the southern strip of Blackwood, which falls under the province of
  **Cyrodiil**". The catalogue places it inside Argonia. Defensible (the border
  moved, and the province needs the site) but should be stated in `why.founding` so
  it reads as a deliberate call rather than an error.

---

## 5. hist-placement conformance of the 10-tree roster

**The roster itself is exact.** All ten hero Hist plus both reserves from
`hist-placement.md` §3b exist in the catalogue with matching IDs and power slots —
**12/12, nothing missing, nothing renamed**. Helstrom correctly holds no slot.
This is the single most rule-bound thing in the catalogue and it is clean.

**Foreign foundations: 0 violations.** Blackrose Prison, White Rose Prison, Fort
Swampmoth, Castle Giovesse, Hereguard Plantation and Slough Point all carry zero
Hist assertions, per `hist-placement.md:165` (`CANON_DERIVED`). White Rose's only
Hist mention is the canon-correct bones-to-the-dirt hook. Clean.

### H1 (MODERATE) — the blue-flower marker is claimed twice

`hist-placement.md` §5 fixes flower colour as *red as standard, **blue for the
Naga-Kur***, and `naga-kur-deeps.dead-water-village` builds its whole signature on
it: "the one tree in the province you can identify from its light alone".
`mercantile-coast.ashroot-village` then also gives its Hist blue flowers. Two
catalogue records directly contradict each other, and the one that loses is a
roster tree whose distinctiveness is the point.

**Fix:** `ashroot-village` → red. One word.

### H2 (MODERATE) — three register entries have no catalogue record

- **Root-Whisper Village** (Deepmire, the **Dreaming Tree**) — `CANON_EXPLICIT` in
  the settlement register; **zero** matches for "Root-Whisper" or "Dreaming Tree"
  in all 729 records. The most significant single omission found in this review.
- **Hutan-Tzel / Rockguard** — no record; one passing mention of "Hutan" inside
  `hist-heartland.tended-xanmeer-clan-north`.
- **Deepmire "the Refuge"** — no record (also an unmet quest provision, §12b/UW04:
  the cursed plateau, its xanmeers, the leviathan bones and the Umbriel memorial
  exist only as scattered fragments in three other regions, none of which is the
  plateau). `quest.provision.umbriel-witness-site` is currently satisfied by
  `saxhleel-coast.umbriel-shore-memorial`, a coastal memorial rather than the D4
  traversal spike the provision asks for.

### H3 (LOW) — sealed living trees are under-provisioned, not over

`hist-placement.md:166` recommends **two or three** xanmeers province-wide holding
a living sealed tree. The catalogue has **one** (`hist-heartland.sealed-xanmeer-living`);
the other 29 xanmeer-family records all read as empty. Under rather than over is
the safe direction, but the dossier's "finding one is a genuine event" reads
better at two or three. Cheap to add at Phase 12 —
`mercantile-coast.sealed-meer-murkmire` or `naga-kur-deeps.sealed-xanmeer-vakka-deeps`.

### Note on roster closure

32 distinct places assert a living Hist against a 12-entry hero roster. That is
**not** a violation — §3 R1 requires one tree per tribal settlement — but the
dossier nowhere says the roster is open, so it reads as closed and a future agent
will read it that way. One sentence in `hist-placement.md` §3b ("the hero roster
is the ten that carry powers; ordinary village Hist are unlimited under R1")
closes the ambiguity.

---

## 5b. The two-culture rule

**Rule text** (`material-culture.md` § Build implications):

> "Two distinct Argonian building kits are canon and regionally assigned —
> **Shadowfen mud/wattle** and **Murkmire reed/stilt**. **Do not blend them.**"

Reinforced three times in 0041, including the constructive guarantee at l.800–802:
three kit configs "so the cultures cannot blend by construction".

### C1 (HIGH) — `hist-heartland` blends all three kits in 108 of 110 records

Every hist-heartland record but two carries the identical un-overridden
`vibe.materials` string:

> `"living root, woven withy, mud-and-wattle, thatch, tended xanmeer stone left unquarried"`

That is Shadowfen mud/wattle **+** Murkmire withy/thatch **+** xanmeer stone in
one line, 108 times, with no per-place variation. Two defects for the price of
one: it is a literal three-way blend against the rule, and being boilerplate it
erases exactly the regional distinctiveness the rule exists to protect.

The root cause is that the rule assigns mud→Shadowfen and reed/stilt→Murkmire and
is **silent on the interior**, so the authoring pass hedged by including both. The
fix is to *decide* the interior's kit — the lore-correct answer is almost certainly
a third kit (grown/trained living root, which is what the dossiers give the
interior and what no coastal region has), not a blend of the two coastal ones —
and then to vary the string per place.

This is the largest finding in the review by record count and the one most
expensive to leave: `assetPlan`/kit-config selection in Phase 12 reads these
strings.

**Fix:** add an interior kit to `material-culture.md` (`settlement-root-v1`
alongside `settlement-mud-v1` / `settlement-stilt-v1` / `settlement-imperial-v1`),
then re-derive the 108 materials lines from it.

### C2 (LOW) — 43 records outside hist-heartland use "mud and reed" as vernacular shorthand

dunmer-north 17/84, imperial-fringe 19/108, saxhleel-coast 5/99, pirate-freeholds
2/53. Murkmire (`mercantile-coast` 0/140), `naga-kur-deeps` 0/65 and
`imperial-penal-south` 0/70 are **exemplary — zero blends**. The 43 are mostly
generic Argonian-vernacular phrasing rather than kit specs, but each needs a kit
decision before a compiler can pick a config.

### Cleared: Argonian × Imperial/Dunmer layering is handled well

23 records mix Argonian and foreign materials and all but two are explicitly
*layered*, several stating the rule in-text — `saxhleel-coast.archon` ("Imperial
ashlar quay below, Saxhleel reed-and-stilt above — the two building cultures
**stacked, never blended**"), `dunmer-north.thorn` ("**the two never blend**"),
`dunmer-north.the-sump-hamlet` ("**stacked vertically**"),
`imperial-fringe.the-borrowed-house`, `imperial-fringe.gideon` (quarter-segregated).
This is the rule being understood, not merely obeyed. The two loose ends
(`hist-heartland.duskfall-unmade-site`, `hist-heartland.heretic-stone-restarted`,
both stone-heresy records colliding with the boilerplate) resolve as a side effect
of fixing C1.

---

## 5c. Quest provisions — `docs/quests/20-world-provisions.md` §12b

24 rows: **20 met, 1 partial, 3 unmet.** Coverage is good. The lore-bearing gaps:

- **Deepmire "the Refuge" — UNMET** (see H2). The only outright missing
  quest-required *location*, and it carries UW04's sole traversal spike.
- **Hissmir "Root Stewards" — PARTIAL.** The settlement exists; the named body
  returns **0 hits** province-wide. §12b names it explicitly.
- **`washed-out` NPC material variant — UNMET as specified.** §12b calls it usable
  "province-wide on anyone held long in an Owing"; exactly one record mentions it
  (`imperial-fringe.the-second-hearth`). It needs registering as a variant against
  the 40 Owing sites, not left as one place's flavour text.
- **Player stronghold — CONTRADICTORY.** §12b says *one* site; the catalogue has
  two `strongholdCandidate` records (`hist-heartland.xal-meeruth-station`,
  `pirate-freeholds.rockpoint`). Only `rockpoint` carries `LOC stronghold.site`.
  Fine as primary+reserve — but say so explicitly, in 0041 or on both records.

Well-satisfied and worth noting because they are the hard ones: Glenbridge with
Rectavius sealed beneath, Bramman's river as a hidden channel (72 records, with
`mercantile-coast.screen-watch` as the pilots' village), the White Rose
bones-to-the-dirt repatriation chain (3 waystations), the Conclave of Baal →
Murkwood fixing, the seasonal-only wintertide rootworm terminus at Gideon, and the
root-transit network with `FAST root.helstrom_hub` / `root.east_line`.

---

## 6. Ranked fix list

| # | Severity | Fix | Effort |
|---|---|---|---|
| 1 | HIGH | **C1** — decide the interior building kit (`settlement-root-v1`) in `material-culture.md` and re-derive the 108 blended hist-heartland `vibe.materials` lines | owner/agent decision + a scripted re-derive |
| 2 | HIGH | Add the citation lint to `npm test`: resolve every repo path in catalogue strings; check every `Namespace:Title` against a verified allowlist | ~half a day, prevents the whole of §2 recurring |
| 3 | HIGH | **L1** — reconcile Tenmar Wall / Ten-Maur-Wolk | 1 record |
| 4 | HIGH | **L2** — remove the invented Dunmer slave camp from Ten-Maur-Wolk | 1 sentence |
| 5 | HIGH | **L4** — define `canon-named` in 0041, split off `canon-anchored`; lint that a `canon-named` record's name appears in a cited source | 1 doc edit + 1 test |
| 6 | HIGH | **H2** — author Root-Whisper Village (the Dreaming Tree), Hutan-Tzel/Rockguard, and Deepmire "the Refuge" (also unblocks §12b/UW04) | 3 new records |
| 7 | MODERATE | 17 repo-path renames per the §2a table | mechanical |
| 8 | MODERATE | 33 UESP title corrections per §2b; the 15 no-such-page titles re-pointed at dossiers | mechanical + 15 judgement calls |
| 9 | MODERATE | **E1/E2** — five Knahaten Flu duration edits + one Red Year edit | 6 words |
| 10 | MODERATE | **L3** — fix the fabricated `Lore:Umpholo` quotation | 1 record |
| 11 | MODERATE | **H1** — `ashroot-village` Hist flower blue → red | 1 word |
| 12 | LOW | **H3** — add 1–2 sealed living-tree xanmeers; **§5c** — the Root Stewards, the `washed-out` variant, the two stronghold candidates | 4 small edits |
| 13 | LOW | **E3** (three ESO-outcome records), **E4** (Rockpark), **E5** (Thalmor post ID/culture) | 5 records |
| 14 | LOW | **C2** — kit decision for the 43 "mud and reed" vernacular records outside hist-heartland | mechanical once C1 lands |
| 15 | LOW | Add the Ca-Uxith watch-village near Rockgrove; state the Xi-Tsei border call; add one sentence to `hist-placement.md` §3b saying the hero roster is not the full Hist population | 1 new record + 2 sentences |

---

## Sources checked

Live UESP MediaWiki API (`en.uesp.net/w/api.php`, project user-agent) for 165
distinct cited titles and full article text for 26; era policy
[0002](../../../decisions/0002-era-and-source-confidence.md);
[0041](../../../decisions/0041-phase11-settlement-decisions.md) §provenance;
dossiers `world/sources/lore/{blackrose,lilmoth,soulrest,gideon,tribes}.md`,
`topics/{hist-placement,material-culture,labour-and-bondage,foreign-powers,lost-peoples,history-timeline,fauna-hazards,sky-moons-calendar}.md`,
`regions/{middle-argonia,murkmire,secondary-settlements}.md`,
`extrapolation/{settlement-register,argonia-4e201-state,PROGRESS}.md`;
`docs/quests/20-world-provisions.md` §12b.

**Note for the reconciliation agent:** 92 records in `places-pirate-freeholds.json`
and `places-saxhleel-coast.json` have a `null`/empty `name`. Out of scope for this
dimension, flagged in passing — it will block any text-catalogue extraction under
engineering standard 3.
