# Should Dunmer/Imperial minorities cluster into enclaves? (owner question, 2026-09-03)

Scope: the 44 non-Argonian **active** places in `world/sources/catalogue/`
(dunmer 6, imperial 24, mixed 12, khajiit 2 — argonian 364 excluded; "active"
matches the owner's counts, out of 527 "plotted"/live records total).

## Answer, up front

**Enclave, not scattered — and the catalogue mostly already does this.**
Measuring every non-Argonian record's distance to the nearest same-culture
record and to the nearest major-city anchor (`world/sources/anchors/settlement-anchors.json`,
scale ≈7380 m per normalised map unit) shows tight clustering already:

- **Dunmer** (6): 5 of 6 sit within ~1.1 km of **Thorn** or **Stormhold**
  (Ash Causeway, Ash Holding, Guar Ground cluster on Thorn; the Permit Dig and
  Let Upper Floor sit on Stormhold). Only Andrano Hold is remote, at Alten
  Corimont — see per-record table.
- **Imperial** (24): 22 of 24 sit within ~1.7 km of **Gideon** — the single
  strongest cluster in the data. Two outliers: Cold Light (Lilmoth
  lighthouse) and the Whispers Dig / Permit Dig pair (Stormhold, filed under
  `places-dunmer-north.json` because they're physically in Dunmer country).
- **Mixed** (12): three sub-clusters at **Soulrest**, **Lilmoth/Alten
  Meerhleel**, and **Blackrose** — each internally tight (<800 m).
- **Khajiit** (2): Moonmarch (Soulrest, 834 m) and Quin'rawl Anchorage
  (Lilmoth, 583 m) are ~3 km apart from each other but each hard against a
  major anchor — two separate landings, not one scattered pair.

So the catalogue's existing plot already encodes enclaves; the fix needed is
**tightening a handful of outliers and stating personal reasons for the ones
that stay remote**, not a wholesale re-plot.

## Lore evidence

**Dunmer, post-Red Year / post-Accession War (4E 6):**
- House Dres ran the Argonian slave trade for centuries from **Tear**, its
  district capital just north of Thornmarsh, with **Thorn** as the raided
  Argonian town (`world/sources/lore/topics/foreign-powers.md` "House Dres
  and Morrowind"). This is the historical seed for a Dunmer-facing frontier
  around Thorn specifically, not Black Marsh generally.
- The Red Year (4E 5) displaced Dres families; the Accession War (4E 6)
  reversed the slave relationship — Argonians sacked Mournhold and nearly
  broke House Telvanni before House Redoran stopped them. By 4E 201,
  Mournhold is restored and the border is "cold, settled, mutually resented"
  — not an active war (`foreign-powers.md`).
- **Stormhold** was the Ebonheart Pact's Black Marsh capital (2E 572, joined
  by Nords, Dunmer, free Argonians) — the one place with an institutional
  memory of Dunmer co-governance, which is why a Dunmer presence there (the
  Cyrodilic Collections alcove, a "deniable" listening post) reads as
  continuation rather than intrusion.
- `docs/world/92-demographics.md` §Stormhold/Thorn already calls out "large
  Dunmer minorities" at exactly these two anchors as the intended
  demographic signal — the enclave read is a pre-existing decision, not a
  new one.
- Real-world logic: displaced ex-slavers and their descendants who "stayed
  because going home was worse" (Andrano Hold's own founding line) cluster
  where they have some standing — a border holding, a trade post, a
  causeway their own House built — not on scattered Argonian farmland where
  they'd have no defensible position and every neighbour has a grievance.

**Imperial, post-secession (Empire lost Black Marsh 4E ~6, nothing recorded
after 4E 48/Umbriel):**
- The Empire's entire provincial legacy is **penal, fiscal or military**:
  Fort Swampmoth, Blackrose/White Rose Prisons, Castle Giovesse, the
  Governor's Mansion and courthouse, Slough Point customs, toll-towns — "no
  Imperial civic legacy of temples-and-markets to inherit — except at
  **Gideon**, which is the exception canon explicitly draws" (`foreign-powers.md`
  Build implications). Gideon is also canon's frontier-records city, the
  province's only land door from Cyrodiil (Blackwood Road).
- `92-demographics.md` §Gideon: "the strongest Imperial concentration in the
  supplied set… the clearest place to show imported Imperial infrastructure."
- An-Xileel policy is explicitly exclusionary: after taking Lilmoth they
  "forbade all but licensed foreigners from entering the city, confining the
  unlicensed to the docks" (`an-xileel.md`). That is a textbook enclave
  mechanism — foreigners are legally confined to a quarter, not free to
  scatter. The same logic argues for licensed footholds (Cyrodilic
  Collections' Stormhold alcove, Lilmoth's old Imperial quay/Cold Light) over
  free settlement.
- Real-world logic: an occupying power that lost the war keeps only its
  fortified administrative seats and abandons the rural grants (see Vellum
  Estate, Marcian's Terrace — both already Gideon-adjacent, both already
  "gone native" in their own why.founding text).

**Mixed / Khajiit:**
- Soulrest was the Third-Era provincial capital and is canon's most mixed
  zone (Khajiit, Imperial, Bosmer) — `92-demographics.md` confirms it as the
  intended cosmopolitan trade anchor.
- Lilmoth/Blackrose–Lilmoth is the other cosmopolitan waterway node
  (Bosmer, Imperial, Khajiit, Altmer present per demographics).
- Khajiit presence is trade-driven (moon-sugar, Southern Sea crews avoiding
  Altmer/Maormer warships — `foreign-powers.md` Criminal/irregular powers) —
  landings cluster at ports, which the data already shows.

## Per-record table (32 dunmer + imperial records; mixed/khajiit already fine, listed for completeness)

Legend: **keep** = already correctly enclaved; **tighten** = pull toward the
named anchor/cluster on next plot pass; **reason-stated** = remote but has an
explicit personal/institutional reason in its own `why.founding`, leave as is.

| id | culture | verdict | target / reason |
|---|---|---|---|
| place.dunmer-north.the-ash-causeway | dunmer | keep | Thorn cluster (403 m) |
| place.dunmer-north.the-ash-holding | dunmer | keep | Thorn cluster (612 m) |
| place.dunmer-north.the-guar-ground | dunmer | keep | Thorn cluster (452 m) |
| place.dunmer-north.the-sump-hamlet | dunmer | keep | Thorn cluster (894 m) |
| place.dunmer-north.let-upper-floor | dunmer | keep | Stormhold (127 m); reason-stated (deniable Thalmor-adjacent lease) |
| place.pirate-freeholds.dunmer-frontier-holding (Andrano Hold) | dunmer | reason-stated | remote at Alten Corimont (1131 m); founding line explicitly explains isolation ("stayed because going home was worse") — leave, don't force into Thorn |
| place.dunmer-north.the-permit-dig | imperial | keep | Stormhold (267 m) |
| place.dunmer-north.the-whispers-dig | imperial | reason-stated | clandestine/unpermitted by design — isolation is the point, don't cluster |
| place.imperial-fringe.gideon | imperial | keep | is the anchor (3 m) |
| place.imperial-fringe.ashen-tower | imperial | keep | Gideon (753 m) |
| place.imperial-fringe.bonded-shed-of-the-onkobra | imperial | tighten | 1495 m from nearest anchor (Soulrest) but functionally a Gideon customs building — consider re-siting nearer Gideon on next plot pass, or re-tag anchor relation as Gideon-satellite in `relations` |
| place.imperial-fringe.cassian-farm | imperial | tighten | same issue as Bonded Shed (1454 m, paired with it — keep the pair together, just closer to Gideon) |
| place.imperial-fringe.claywater-station | imperial | keep | Gideon (651 m) |
| place.mercantile-coast.cold-light | imperial | reason-stated | Lilmoth lighthouse, stand-alone Imperial harbour infrastructure — isolation is the founding premise, leave |
| place.imperial-fringe.slough-point-quarantine-shed | imperial | keep | Gideon (588 m) |
| place.imperial-fringe.giovesse-lines | imperial | keep | Gideon (872 m) |
| place.imperial-fringe.hollow-arch-toll | imperial | keep | Gideon (1216 m) |
| place.imperial-fringe.collections-dig | imperial | keep | Gideon (947 m) |
| place.imperial-fringe.whispers-house-of-the-low-fen | imperial | keep | Gideon (1741 m, upper end but still fringe-belt) |
| place.imperial-fringe.marcians-terrace | imperial | keep | Gideon (973 m) |
| place.imperial-fringe.mile-house-of-the-eagle | imperial | keep | Gideon (488 m) |
| place.imperial-fringe.guar-holding-of-the-nine-bells | imperial | keep | Gideon (1229 m) |
| place.imperial-fringe.onkobra-field-station | imperial | keep | Gideon (791 m) |
| place.imperial-fringe.gideon-synod-outstation | imperial | keep | Gideon (288 m) |
| place.imperial-fringe.sabinus-claim | imperial | keep | Gideon (1192 m) |
| place.imperial-fringe.slough-point | imperial | keep | Gideon (431 m) |
| place.imperial-fringe.the-cold-forge | imperial | keep | Gideon (310 m) |
| place.imperial-fringe.the-fig-and-ledger | imperial | keep | Gideon (574 m) |
| place.imperial-fringe.the-vellum-estate | imperial | keep | Gideon (1032 m) |
| place.imperial-fringe.watch-of-the-weighed-cart | imperial | keep | Gideon (480 m) |

Mixed (12) and Khajiit (2) — all already anchor-adjacent (<850 m) at Soulrest,
Lilmoth or Blackrose; no changes recommended.

## Recommendation summary

1. **Confirm enclave model as canon-consistent and already the intended
   design** (`92-demographics.md` calls out Thorn/Stormhold, Gideon, Soulrest
   and Lilmoth/Blackrose by name as the minority anchors). No architecture
   change needed.
2. **Tighten 2 records**: `place.imperial-fringe.bonded-shed-of-the-onkobra`
   and `place.imperial-fringe.cassian-farm` — currently anchored to Soulrest
   by nearest-anchor measurement but functionally Gideon customs/estate
   infrastructure per their own `why.founding`; either re-plot nearer Gideon
   or (cheaper) add an explicit `relations` tie so distance tooling doesn't
   flag them as orphaned.
3. **Leave 4 stated-reason outliers alone**: Andrano Hold (Alten Corimont),
   Cold Light (Lilmoth lighthouse), Let Upper Floor and the Whispers Dig
   (both Stormhold-adjacent but deliberately clandestine) — each already
   carries a specific, lore-grounded reason for standing apart from the main
   enclave, which is exactly the "exception needs a personal reason" pattern
   the owner asked about.
4. No records need cutting; none are placed in a way lore contradicts.
