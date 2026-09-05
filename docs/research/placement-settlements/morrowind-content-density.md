# Morrowind content density — the numbers, and our targets derived from them

Researched 2026-08-26 (owner directive: match Morrowind's quests-per-km²,
POIs-per-km² and quests-per-city). Sources: UESP MediaWiki API category counts
(fetched with project user-agent), UESP faction/city pages, OpenMW measurement
documentation, plus the Tamriel Rebuilt quest audit already cited in
[../quests/00-overview.md](../../quests/00-overview.md) §2. This file is the
evidence; the **binding targets** live in world plan
[95-build-sequence](../../world/95-build-sequence.md) (Phase 11/13 density gates)
and quests [90 §65b](../../quests/90-production-sequence.md) (per-packet quotas).

## 1. Vvardenfell's size

Cell = 8192 units ≈ 117 m per side (Construction Set / OpenMW docs).
Vvardenfell spans roughly 37×40 cells including a lot of water; published
land-area figures range **~16 km² to ~26 km²** depending on whether coastal
water cells count. **Working figure: ~20 km² of playable land.**

Our province (hydrology-meta.json, decision 0015 ×1 scale): 1345 px ×
5.4835 m/px ≈ **7.4 km × 7.4 km = 54.4 km²**, ocean fraction 0.322 →
**~37 km² of land** — roughly **1.5–2.3× Vvardenfell's land**, of which a
deliberate share is D4–D5 deep interior.

## 2. Morrowind's POI count (UESP category-member counts, 2026-08-26)

| Category | Count |
|---|---:|
| Settlements (city, towns, villages, forts-as-towns…) | 35 |
| Caves | 93 |
| Ancestral tombs | 92 |
| Mines (ore + egg) | 44 |
| Daedric ruins | 38 |
| Dwemer ruins | 26 |
| Imperial forts | 15 |
| Ashlander camps | 14 |
| Velothi towers | 13 |
| Dunmer strongholds | 11 |
| Grottos | 11 |
| Landmarks | 11 |
| Shipwrecks (no category; known set) | ~10 |
| **Total named places** | **≈ 410** |

≈ 410 places on ~20 km² → **≈ 20 named POIs per km²** — one named place per
~220 m × 220 m of land. That spacing *is* the famous Morrowind feel: from any
road, something named is visible or a minute's walk away.

## 3. Morrowind's quest count and distribution

- **~506 finite journaled quests** in GOTY (Tamriel Rebuilt audit; already our
  benchmark); base-game share on Vvardenfell ≈ **~400** → **≈ 20 quests per
  km²** — numerically the same density as POIs, but distributed *entirely
  differently*: quests concentrate at settlements; most wilderness POIs have
  no quest and are pure exploration reward.
- **Quests originating per settlement** (from the faction quest-giver tables
  mined in [morrowind-cast-structure.md](../quests-and-cast/morrowind-cast-structure.md) plus
  city pages):
  - **Vivec** (the one metropolis): ~90–100.
  - **Balmora** (large town): ~45–55 (Caius 9, Eydis 9, Ajira 7, Ranis 6,
    Habasi 6, Nileno 7, Morag Tong access, ~5 local).
  - **Ald'ruhn** (large town): ~45–55 (Redoran ~30, FG 6, MG 9, TG 6, local).
  - **Sadrith Mora / Wolverine Hall**: ~35–45. **Caldera, Suran, Gnisis**:
    ~8–15 each.
  - **Villages** (Seyda Neen, Khuul, Hla Oad…): ~3–8 each.
  - **Ashlander camps**: ~5–15 (Urshilaku main-quest-heavy).
- Every structure in a settlement is enterable and every NPC is named — a
  large part of why towns read as "alive" independent of quest count.

## 4. Derived targets for Argonia (binding version in the world plan)

Matching Morrowind density on 1.5–2× the land means **more total content than
the previous mature target**, phased by region packet:

| Metric | Morrowind | Our target |
|---|---|---|
| Named POIs per km² of authored land | ~20 | **18–22** in settled/traversed regions (D0–D3); **8–12** in D4–D5 (landmark- and ruin-heavy, quest-light — Red Mountain's own pattern); province total **≈ 550–750** named places at maturity |
| Route spacing | something named every ~200–300 m of road | **same**, measured along the compiled road/boat-lane graph: next named POI ≤ 300 m of travel, a new *visible* landmark each ~minute of walking; boat lanes count shoreline POIs |
| Quests per km² | ~20 | **~20 at maturity** across authored land — which at our land area means a **mature finite-quest target of ≈ 550–740** (the 450–550 figure first written here took the bottom of the band; the 2026-09-04 skeleton, built settlement by settlement at the floor of each Morrowind band, lands at 715, i.e. Morrowind's own density on 1.8× the land) (Milestone 1 unchanged at ~170–210) |
| Quests per settlement (magnitude ladder, [settlement-register](../../../world/sources/lore/extrapolation/settlement-register.md)) | see §3 | **M5 majors ≈ 35–60 each** (Helstrom top of range — our nearest Vivec-analogue), **M4 towns 10–20**, **M3 villages 3–8**, **M2 hamlets 1–3**, **M1 camps 0–2**, Ashlander-camp analogues (tribal villages on quest routes) up to ~10 |
| Enterable structures | 100% | **100% of settlement structures enterable** (interiors may be one-cell simple; Phase 11/12 must budget for it) |
| Named NPCs | all | every settlement NPC named, C4 texture rules ([35-cast](../../quests/35-cast.md) §59) |

Cross-check: 8 M5 × ~45 + ~6 M4 × 15 + ~40 M3 × 5 + hamlets/camps + wilderness
and Daedric/mythic ≈ **480–560** — consistent with the per-km² figure. The
numbers agree from both directions, which is the sanity test.

## 5. What density is actually *for* — three nuances the raw numbers miss

1. **Perceived density is route density.** Morrowind's slow walking, no quest
   markers and short draw distance made 20/km² feel abundant. We have boats
   and scheduled travel, so the preserved metric is the **route-spacing row**
   above, checked along roads and boat lanes, not raw area division.
2. **Quests cluster; POIs spread.** Copying "20 quests/km²" uniformly would be
   wrong: Morrowind put quests behind settlement doors and left the wilds as
   *reasons to travel* (the POI density) with quests pointing across them.
   Keep that shape — the danger gradient does it for us (D5: many ruins, few
   quests).
3. **Discovery is diegetic.** No markers means density must be *findable*:
   rumours, notes on bodies, overheard desks, grave-stakes, Ahnjazzi-style
   route talk. Every unmarked POI needs at least one in-world pointer
   (dialogue, document, sightline) — the Phase 13 loot/rumour feed and the
   QW-loop briefs carry this.
