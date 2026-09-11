# 0041 round log — Phase 11 settlement rounds (provenance)

Moved out of `docs/decisions/0041-phase11-settlement-decisions.md` 2026-09-11. History only; the live decision, cross-cutting rules and taste ledger stay in 0041.

## Part 0 delivery notes (2026-09-02)

- Items 1–3 + 6a/6b delivered (commits `e8a10c1`, `f3637cc`, `cc15ae4`,
  schema commits). Kits: `settlement-mud-v1` / `settlement-stilt-v1` /
  `settlement-imperial-v1` — three configs so the cultures cannot blend by
  construction. Sourcing log: `docs/research/placement-settlements/settlement-kit-sourcing-log.md`.
- **Compiler rule (from kit vetting):** architecture pieces snap to the
  3.64 m grid around a **centred pivot** — the settlement compiler places
  kit pieces by grid transform, NEVER the flora bottom-anchor path
  (`vet_kit`'s "pivot above base" findings on architecture are expected).
- Still-open asset gaps after sourcing: xanmeer ornamental frontage,
  dugout/twin-hull canoes, grave-stakes, salterns/kilns.

## Part 2 reconciliation record (2026-09-02)

Aggregate pass over the eight region derivations (722 records in, **729 out**;
no ID deleted or renamed). All eight `places-*.json` are now registered ID
sources under standard 2, so `npm test` enforces shape and uniqueness.

| Region | Records |
|---|---|
| mercantile-coast | 140 |
| hist-heartland | 110 |
| imperial-fringe | 108 |
| saxhleel-coast | 99 |
| dunmer-north | 84 |
| imperial-penal-south | 70 |
| naga-kur-deeps | 65 |
| pirate-freeholds | 53 |
| **Province** | **729** |

**Types**: 236 POI types, **234 used**, 2 unused (`festival-ground`,
`dry-season-herd-ground` — flagged as a coverage gap, not cut).

**Bands widened**, each with a `countBandNote` in `type-recipes.json`:
`stone-calendar` 1→2, `quarantine-village` 1→3, `tunnel-rat-gallery` 1→2,
`heretic-stone-village` 1→2, `drifting-village` 1→2 (and
`settlement-register.md` §5 G3.3 revised to match — its "exactly one" was a
cost recommendation, not canon).

**Retype**: Alten Meerhleel `neutral-free-port` → `port-town` (Alten Corimont
is canon's named freehold and keeps the singular type). ID unchanged; `why`,
`vibe` and `assetPlan` rewritten to the port-town recipe.

**Filled**: Hissmir, the Loriasel lamia caverns, the Deepmire leviathan bone
field, Still-Waiting, the Orma tactile ruin, and two collapsing pinnacles.
**Consciously under-filled**: `port-town` at 1 of 2 (no honest homeless
candidate). Details in `docs/research/placement-settlements/settlement-type-recipes.md`.

**Hero Hist**: register closed at exactly **ten** power slots (roster in
`world/sources/lore/topics/hist-placement.md` §3b). Five were added — the four
canon city/hatchery trees the dossier names (Stormhold, Hatching Pools,
Lilmoth, Gideon) plus Archon's harbour tree. Two grove records are marked
reserves with `powerSlot: null`. Helstrom deliberately holds none.

**Contestables**: wrecker-beach confirmed on mercantile-coast, murkwood-verge
confirmed in imperial-penal-south (no double-claim existed); both player-
stronghold candidates stay flagged for the owner (Q&A item 6).

### Findings handed to the critique pass — not fixed here

1. **Band discipline has broken down at the aggregate.** 68 POI types are over
   their band and 49 are under it, even though the total lands inside the
   600–740 envelope. The eight agents each stayed plausible locally and
   collectively rewrote the distribution. The band sum is now **637–739**
   against a 740 ceiling: **any further widening must be paid for by narrowing
   another band.** Worst over-claims: `hist-less-refuge` and
   `bone-repatriation-waystation` (2→6 each), `mass-grave-memorial` (4→8),
   `sealed-xanmeer` (4→7), `ferry-stage` (6→9). `hero-hist-grove` is 4→6 and
   was deliberately left over-band rather than retype a hero tree.
2. **`rewardProfile.valueTier` uses four incompatible vocabularies** —
   `tier-N` (dunmer-north, imperial-fringe), bare integers (mercantile-coast,
   imperial-penal-south), `TN` (pirate-freeholds, saxhleel-coast) and
   `low/medium/high/unique` (hist-heartland, naga-kur-deeps). Left unnormalised
   on purpose: a 3-band word scale does not map losslessly onto a 5-band
   numeric one, so the collapse is a design call for the reward pass, not a
   find-and-replace. It must be settled before anything reads this field.
3. **Richness parity is NOT uniform across the eight slices** (owner directive,
   2026-09-02). Medians/means per record:

   | Region | `why` chars | `sources` | non-empty `relations` | `vibe` keys |
   |---|---|---|---|---|
   | dunmer-north | 506 | 3.1 | 2.1 | 8 |
   | imperial-penal-south | 494 | 3.5 | 0.3 | 5 |
   | imperial-fringe | 480 | 2.6 | 1.8 | 8 |
   | mercantile-coast | 476 | 3.1 | 0.2 | 5 |
   | pirate-freeholds | 456 | 3.8 | 0.2 | 8 |
   | saxhleel-coast | 416 | 3.6 | 0.1 | 8 |
   | hist-heartland | 309 | 1.3 | 0.1 | 8 |
   | naga-kur-deeps | 301 | 1.3 | 0.0 | 8 |

   Two specific, fixable gaps: **hist-heartland and naga-kur-deeps run ~35 %
   thinner on `why` and cite roughly one source per record against the other
   six regions' three-plus** — they are the two interior slices, and the
   interior must not be the thin part of the province. And **`relations` is
   effectively empty everywhere except dunmer-north and imperial-fringe**,
   which is a province-wide gap, not a regional one: the catalogue currently
   describes 729 places and almost no connections between them. Both are
   authoring work, not reconciliation work, so they are recorded here rather
   than papered over. Note also that mercantile-coast and imperial-penal-south
   write a 5-key `vibe` where the other six write 8.

## Enrichment pass (2026-09-02) — findings 2 and 3 closed

A single agent fixed the three defects the reconciliation quantified. No IDs,
types or statuses changed; the zones' authored sparseness and voice are intact.

**1. Interior richness parity** (owner directive: all slices equally rich).
The two interior files were thickened record by record — longer causal chains
(who pays, who inherits the duty, the second-order consequence, which *named*
neighbour it lands on), not padding — and cited against dossiers, UESP pages
and `type-recipes.json`.

| Region | `why` chars (before → after) | `sources`/record (before → after) |
|---|---|---|
| hist-heartland | 309 → **729** | 1.3 → **4.3** |
| naga-kur-deeps | 301 → **729** | 1.3 → **4.2** |
| dunmer-north | 506 (unchanged) | 3.1 |
| imperial-penal-south | 494 | 3.5 |
| imperial-fringe | 480 | 2.6 |
| mercantile-coast | 475 | 3.1 |
| pirate-freeholds | 456 | 3.8 |
| saxhleel-coast | 416 | 3.6 |

The interior now sits *above* the old norm rather than at it. That is
deliberate: parity means no slice is the thin one, and the added material is
consequence, not adjectives. The other six were left alone — they were never
the defect.

**2. The relations layer** — was ~500 links concentrated in two regions, now
**2,368 directional place-ID links + 162 travelServiceEdges**, every record
carrying a `reachedVia` and every M2+ settlement ≥3 relations (was 32 of 172).

| Region | links | per record | cross-region |
|---|---|---|---|
| dunmer-north | 435 | 5.2 | 20 |
| imperial-fringe | 486 | 4.5 | 15 |
| mercantile-coast | 466 | 3.3 | 20 |
| hist-heartland | 338 | 3.1 | 15 |
| saxhleel-coast | 298 | 3.0 | 10 |
| imperial-penal-south | 229 | 3.3 | 12 |
| naga-kur-deeps | 201 | 3.1 | 8 |
| pirate-freeholds | 160 | 3.0 | 10 |
| **total** | **2,368** | 3.5 | **110** |

Cross-region chains woven by hand: **the Owing chain** (Vellum Estate → the
Turned-Out → the four regional hiring/eviction camps → the plantations,
paddies and diggings that buy the labour, with the freed-worker shelters as
its rivals); **the Soulrest gold chain** (tunnel-rat gallery → goldworks
concession → Collections bond → Soulrest → Archon's bonded row);
**bone repatriation** (six regional waystations → the Carriers' Rest →
Helstrom and the hero groves); **Hissmir** as the province-wide destination of
every Hist-less refuge; **the rootworm net** (Helstrom line-head → Gideon,
the east estuary, north Shadowfen); salt, timber and shipyard rivalries across
the two coasts; ferry, portage, lighter and pilot service edges at every
crossing. Conventions are in `world/sources/catalogue/README.md`.
`visibleFrom` stays empty except Archon's lighthouse/Portdun Mont pair — the
no-long-sightlines finding makes any other claim a Part 3 decision.

**3. `valueTier`** — settled on **`tier-1`…`tier-5`**, defined in the
catalogue README, after confirming neither quests/85 nor world/76 already
carries a value scale (76's D0–D5 is danger). 543 of 729 records converted.
The 3-band word scale maps rank-preservingly (`low/medium/high/unique` →
`tier-1/2/3/5`); it cannot express `tier-4`, so the interior has none and
promoting individual interior sites is a reward-pass call, not a rename.
Distribution: t1 161, t2 338, t3 191, t4 32, t5 7.

**Left for the critique pass:** the band-discipline finding (1) is untouched.
Several `sources` entries elsewhere in the catalogue cite files that do not
exist (`docs/world/20-region-grammar.md`, `docs/world/30-systems.md`,
`docs/world/55-time-and-sky.md`, `docs/world/55-time-light-weather.md`,
`world/sources/lore/topics/argonia-4e201-state.md`) — a citation-path lint
would catch these cheaply. `reachedVia` for POIs is currently a per-region
land/water/guided anchor chosen by taxonomy type; Part 3 should re-point it at
the actual nearest node once positions exist. And the two 5-key `vibe` files
(mercantile-coast, imperial-penal-south) still write 5 where the rest write 8.

## Touchpoint ① — owner rulings (2026-09-03)

The owner reviewed the catalogue summary
(`phase11-catalogue-summary-touchpoint1.md`). Rulings, all
binding:

1. **Catalogue size accepted, with headroom noted.** 527 live vs Skyrim's
   ~415–426 map markers on similar land (our authored land 33.5 km² vs
   Skyrim ~37 km²) is deliberate — we run Morrowind-style density
   (Vvardenfell ~18/km²), which is denser than Skyrim (~11/km²). The owner
   is content but notes **we hold headroom to cut later** if the workload
   bites; nothing else changes now.
2. **Deferred pool purpose confirmed**: the 272 deferred records are the
   swap/revive pool for plotting and later packets.
3. **Budgets: ceilings are SOFT, floors are HARD** (naga-kur-deeps at 39
   accepted). Encoded in `test_catalogue.py`'s budget comments — a ceiling
   breach needs a recorded exception; a floor breach always fails.
4. **Dungeon-entrance ruling generalised province-wide** — every region's
   dungeons are teleport-to interiors behind region-appropriate
   entrances/exteriors, not just the marsh. Recorded in module 70 §47.
5. **Player stronghold: keep BOTH candidates plotted**; the owner decides
   at Part 6.
6. **Environment tweaks approved**: naga-kur-deeps black water and a
   committed Oliis Bay tidal amplitude are green-lit as systems-side jobs
   (queue them before/with Part 6 exemplar work in those zones).
7. **Load-bearing calls 1–5 provisionally accepted** — the owner reserves
   the right to challenge any after the plot (touchpoint ②) or builds.
8. **Communication rule (all future owner-facing summaries):** assume the
   owner knows NOTHING of the game's content. Spell out every in-world
   term at first mention (the Knahaten Flu, the Owing, cordons, region
   codenames). Saved to agent memory as well.
9. **Text-quality workstream commissioned** (decision 0043): Morrowind
   voice/grammar/per-culture register research → binding style guide in
   `docs/text/` + reviewer-agent process. Names and all player-visible
   text get reviewed against it.
10. **Reviews commissioned at this touchpoint — all three returned same day:**
    - **D4–D5 "landmark-heavy, quest-light": KEEP** (traceable to
      morrowind-content-density.md §5.2 → module 95's budget line, not a
      snuck-in decision; 91 % of dangerous-band records carry quest hooks —
      quests are *given* in safe hubs and *resolved* in dangerous land,
      which is the Morrowind/Dark Souls pattern and correct for fixed
      danger). One directive for Part 3: when thinning, **take
      proportionally more out of D4–D5 than D0–D3**, or the
      sparse-and-monumental contrast dilutes.
    - **Asset gap check** (`phase11-asset-gap-check.md`):
      nothing needs buying. Dunmer/Velothi is covered by 288 BM&V pieces
      already in the vault, but **no `settlement-dunmer-v1` kit is built
      yet** (43 northern records point at unpackaged pieces) — a Part 6
      prerequisite, as is **building `settlement-root-v1`** (permanent
      kitbash: treehouse shell + root masses + passerelles + Argonian
      props; fixes the interior's forbidden mud-kit stand-in) and
      **facade-front tagging** on the ~25 meshes we place (no
      facade-facing signal exists in the mined data).
    - **Prison south: coherent.** Blackrose Prison in 4E 201 is a ruin
      squatted by prison-born descendants, not a working gaol (owner
      decision Q3 in `topics/prisons.md`); no record anywhere asserts a
      live prison. Two clarifiers applied (catalogue README naming row;
      prisons.md closes the untaken White Rose work-camp option).

## Part 3 delivery record (2026-09-03)

`worldgen.macro_plot` plots all **527 live records** (0 homeless unresolved;
report `world/sources/sites/macro-plot.md`). Shape of the solve, and the
calls made while tuning it:

- **Supply** = the 1,172 scour sites + a seeded lattice of plain ground
  (~140 m pitch, classified firm / shallow marsh / channel bank off the
  rasters) + a **roadside strand** every 110 m along every road and boat
  lane. The strand was added when the plain lattice left only 45 % of
  fine-tempo places within 300 m of a route; with it, **73 %** (Morrowind's
  "something every 200–300 m of road").
- **Demand** = each record's `sitingPrefs.landformClasses` / `regionClasses`;
  four region files (hist-heartland, naga-kur-deeps, imperial-penal-south,
  mercantile-coast — 227 records) never got landform wishes at derivation, so
  theirs come from the type recipe and the record's `whySiteWon` says so.
  Free-text hard constraints are read for eight hints (submerged, on-route,
  concealed, commanding, remote, inside-parent, navigable, above-flood) and a
  "within N km" radius; everything else in that prose is Part 6 material.
- **Order**: the nine owner-approved anchors are pinned exactly; then tiers
  0→4, best-scoring pair first within a tier; then the homeless batch is
  re-tried in four honest stages (lower score bar → neighbouring zone within
  350 m of its own → spacing ×0.75 → ×0.5). Final plot: 9 records placed at
  the lower bar, 5 in a neighbouring zone, none needed tighter spacing.
- **Spacing is sized to the zones as the culture raster draws them**
  (0.8–9 km² of land each; the prison south holds 21 places on 0.94 km²), so
  the first draft's 650–1,100 m settlement separations were unachievable and
  210 records fell through to the tightest stage. Now M5 800 / M4 450 /
  M3 300 / M2 220 / M1 150 m, layers 200/160/110 m, same-type ≥300 m
  (≥700 m for landmarks); and **a settlement's separation binds only against
  other settlements** — a city's hinterland is full of shrines and camps at
  their own small spacing, which is what real hinterlands look like.
- **Density follows the civilisation gradient** as the plan asked: tier 3–4
  fill in danger ≤3 is pulled toward anchors and routes; danger ≥4 records
  are rewarded for distance from routes; mountains take 6 places/km² against
  13–19 elsewhere. Only 11 records sit more than 1 km from a route.
- **Route-visibility sweep** (static two-visible check, 450 m radius,
  destination+landmark layers): 6 % of route samples see nothing, 48 % see
  four or more. The "crowded" figure is a property of the radius on flat
  marsh more than of the plot; Part 4's QA should judge it against real
  canopy occlusion (the sweep uses the smoothed heightfield only) before
  thinning anything.
- **Not done here, deliberately**: re-pointing `reachedVia` at the nearest
  plotted node (Part 4 QA, now that positions exist); `visibleFrom` claims;
  the World Studio plotted-map layer (Part 4's owner medium — the interim
  picture is a PIL render in `output/macro-plot/plot.png`, regenerate from
  the report); and per-record pinning (`macro-plot-overrides.json` is read
  but no override exists yet).

## Part 3b — minor routes (owner question, 2026-09-03)

The owner asked where minor roads and paths fit: the studio showed only the
handful of major roads. The plan had a gap — Phase 4 built the anchor-to-
anchor road/lane graph and Part 6 blueprints lay each settlement's own
streets, but nothing between them, and that middle layer (village track,
shrine footpath, reed boardwalk) is most of what a Morrowind player walks.
**Decision:** it is a derived layer of the macro plot, compiled by
`worldgen.compile_minor_routes` the moment positions exist and re-derived on
every re-plot: least-cost paths (same cost logic as the road compiler, on the
published rasters) from every plotted settlement and every road-discovered
place to the nearest road or landing, in three batches (M3+ settlements,
then M1–M2, then places) so small paths chain onto bigger ones; classed
track / footpath / boardwalk / causeway from the ground crossed. Hidden
places (lairs, camps, rumour/document/none discovery) get no path — that is
their design. Places whose cheapest land path exceeds 2.6 km are listed as
unconnected (boat-, guide- or root-served) rather than forced. First run:
186 paths, 65.6 km (46 tracks, 112 footpaths, 28 boardwalks), 46 places
already on a road, 2 unconnected. Data
`apps/world-studio/public/province/routes-minor.json` (same px frame as
`routes.json`), digest `world/sources/sites/minor-routes.md`. **Consumers to
wire later:** Part 6's settlement compiler (streets join the arriving
track), vegetation clearing (a track is a thinned corridor), the navmesh
bake (Module 72, preferred-road cost), the road-mesh/decal compiler
(Phase 14 streaming), and Part 4's route-visibility sweep (major routes
only today). **Part 3c is now done (2026-09-04, owner ask "display all
waterways on the map including the minor ones"):**
`worldgen.compile_minor_waterways` derives the minor WATER network the same
way, on the Phase 4 boat cost surface with land impassable, from every
water-bound place (boat/ferry/lighter/pilot station, landing, crossing,
water-village, any place with underwater access or a boat travel-service
edge) to the nearest major lane, navigable river corridor or already-solved
station; classed channel / river / crossing. First run: 139 channels,
49.4 km (80 channels, 44 rivers, 15 ferry crossings), 52 places already on
a lane, 14 unconnected. Data
`apps/world-studio/public/province/waterways-minor.json` (same shape and px
frame as `routes-minor.json`), digest in the same
`world/sources/sites/minor-routes.md`. `--registry` attaches a `geometryId`
to route-registry entries whose endpoints resolve to a channelled place and
flips them `solved: true` (6 on the first run); `route_registry --check`
accepts `geometryId` as "solved by minor geometry".

## Part 4 step 1 — agent QA of the plot (2026-09-03)

Cold review by a fresh agent: [`phase11-plot-review.md`](phase11-plot-review.md)
(eight findings, five owner decisions, eleven mechanical fixes). Mechanical
fixes applied to `macro_plot.py` the same day and the province re-plotted
(all 527 live records; determinism test green):

- **Named constraints are hard gates.** "Within sight of X" now resolves X
  (literal id, or a same-zone record name in the prose, or
  `relations.visibleFrom`) and requires a real line of sight within 1.5 km;
  "inside / part of / off the bank of X" requires ≤250 m; a record *named
  after* a settlement it depends on (mazzatun-hist, archon-harbour-hist,
  rootworm-station-helstrom, gideon-rootworm-terminus) sits within 450 m of
  it. Records that name another are plotted after it, whatever their tier;
  mutual pairs (Wolk Market ↔ Ten-Maur-Wolk, Glenbridge ↔ its sermon
  xanmeer) go first-by-id then gated. Result: every named sightline on the
  map is true (table in `macro-plot.md`); Wolk Market and Ten-Maur-Wolk are
  131 m apart, Castle Giovesse 429 m from Gideon with line of sight.
- **Density gradient is real now**: spacing is multiplied by up to ×1.8 with
  distance from the nearest city and +0.4 in danger ≥4; the hinterland pull
  applies to all tier ≥2 fill at weight 0.6. Median nearest-neighbour
  distance now rises 134 m (≤400 m from a city) → 157 → 204 → 264 m
  (1.2–2 km), i.e. ~4× sparser by area, from 1.33× before.
- **Region wish is a requirement** for settlement / works / transit classes
  (a preference for lairs, ruins, lone sites), and the last thing the
  homeless batch relaxes (stage order: score bar → neighbouring zone within
  350 m → spacing ×0.75 → ×0.5 → region). Two records needed the last stage.
- **D5 never within 200 m of a route** (unless its own constraint puts it on
  one); remote weight 0.35 → 0.6.
- **Submerged means depth**: ≥0.8 m of published water within ~15 m (0.4 m
  in the relaxed stages), not "near a shoreline".
- **Same type twice along one road**: ≥900 m when both sit within 300 m of a
  route.
- The report now names every record placed from the homeless batch, lists
  every named-constraint check, and lists the **dangling relations** (edges
  to deferred/cut/unknown ids) for the catalogue pass below.

**Left for the owner (touchpoint ②, ranked by the reviewer):** (1) should
the province be emptier still — cut/defer 60–100 places or cluster harder;
(2) should the Dunmer and Imperial minorities cluster into enclaves;
(3) are boat lanes a second view of the same places or a different journey;
(4) named sightlines are now hard — confirm that trade (ground quality vs
story); (5) the 272 deferred records: 134 live relations point at them.
**Left for the catalogue pass (Part 4 step 1b, not blocking ②):** re-point
`reachedVia` at the nearest plotted node; prune or promote the dangling
relation targets; the `sitingPrefs` wording edits the review lists (finding
9); re-measure the route stats against the minor-route network.

## Part 4 step 2 — owner feedback round (2026-09-03)

**Owner rulings on the five ranked decisions:**

1. *Emptier province?* — decide after the consistency fixes; cutting can happen
   at any later stage. **Plotting is not set in stone**: places may be cut or
   moved at meso/micro when they don't work on the ground.
2. *Minority enclaves* — lore says enclave, and the plot already is one
   ([research](../../lore/minority-enclaves-lore.md)): 22/24 Imperial records
   sit within 1.7 km of Gideon, 5/6 Dunmer at Thorn/Stormhold. Two Gideon
   estate records to pull back toward Gideon; four scattered outliers keep
   their stated personal reasons.
3. *Boat lanes* — a **real route network**, like the roads: named lanes and
   channels with stable ids (`world/sources/routes/registry.json`), places
   along them that make sense as a water-connected network, and a
   Morrowind-style pay-and-go **boat station network** (`travelStation` on
   records). No scripted moving boats; static moored boats where they make
   sense; a boat or floating settlement may relocate between set positions by
   date/season. The waterways should feel like a core part of the province's
   identity and of many places' identities.
4. *Named sightlines hard* — keep, with judgment: if a sightline pushes a
   place onto much worse ground, change the sightline record or swap the
   place instead.
5. *272 deferred targets* — **prune the links, keep them in reserve**:
   `relationsReserved` on the record (validator forbids live edges to non-live
   targets).

**Owner feedback items and what was done** (all this date unless noted):

| item | done |
|---|---|
| Text review of all place prose | region text-review agents (0043 process) after the semantic repair — see the wrap note below |
| Islands | [research](../../world-terrain/offshore-islands-feasibility.md): use the 59 existing offshore landmasses (three canon-named) now; 2–4 authored lagoon islets feasible in the Part 6 window; no barrier chains or big offshore island (no shelf, 2.9 km to the world edge) |
| Tropical vanilla assets; farmhouse in three regions; Imperial fort mod for Gideon | [audit](../../phase11/phase11-vibe-sheet-asset-audit.md): Tropical Skyrim is a texture replacer, applied as an overlay to farmhouse/docks/bridges kits; `vanilla-farmhouse` was in 163 records across all eight regions (not intentional) — region pass rebalances; **Morrowind Imperial Keep Set (SSE 133090)** + **Hlaalu Architecture (SSE 157997)** sourced as `imperial-keep` / `hlaalu-domestic` kits for Gideon; `bmv-fort` stays Blackrose's |
| Opening hours | [research](../../quests-and-cast/opening-hours-and-start-area.md): ring principles A/B/C around Alten Corimont, enforced in the plot as a gate (`OPENING_*`); the start barge/camp records, a first trivial dungeon and a vantage are added by the pirate-freeholds region pass |
| Location semantics (Trunk Span, Chasecreek) | `worldgen.audit_place_semantics` → `world/sources/sites/semantic-audit.md` (832 findings over 399 places; both owner cases caught); region passes resolve each as move / rewrite / swap / cut |
| Collections near cities; distance to city | plot now has **city rings** (edge ≤350 m: wards/docks/works/shrines only; hinterland ≤1.2 km: no hostile or D4 lairs, farms/works/villages rewarded), a **hard danger gate** (lived-in classes ±1 band, others ±2), **hostile clustering** (≤3 unrelated in 800 m), **purpose repetition** along a road, and a **swap-improvement pass** after the greedy solve (the anti-greedy step); the report lists each city's hinterland purpose coverage and ring mix |
| Major cities may shift | `worldgen.anchor_nudge` scans every tolerance circle: **Soulrest** (pin was half in the sea) and **Lilmoth** nudged 234 / 153 m onto firm ground; Stormhold, Thorn and Gideon have no flatter ground in their circles (steep everywhere — a Part 6 terracing job, not an anchor job); Archon/Helstrom/AC gain nothing. Rebuild chain re-run (society → refine → chunks → web → water → landcover) |
| Minor roads painted + vegetation cleared | **DONE in Phase 11** (owner ask 2026-09-04). `worldgen/routes_raster.py` rasterises both networks: tracks paint TRACK (2.5 m), footpaths PATH (1.2 m), boardwalks nothing; the same module stamps the scatter's clearance corridors (trunk-clear 14/8/4/3 m for road/track/footpath/boardwalk, groundcover thinned to 25%). Consumed by `refine_province`, `rebake_landcover` and `compile_scatter`; removed from the polish backlog |
| Hostile places; conditional hostility | `hostility` block (baseline stance + typed flips in the quests-85 vocabulary, incl. new `placeCleared` / `placeStanceIs`); region passes raise hostile-baseline places toward the research target |
| What you find there | `contents` block (creature / NPC / loot slots, `registerRef: null` until Phase 13) |
| Point to the player | `playerPurpose` block (16 purposes, impact band, one-sentence hook) + typed `rewardProfile.kinds`; used by the plot (repetition, rings, reports) |
| Falling mage easter egg | added by the hist-heartland region pass as a lone curiosity far from any road (cast roster §58) |
| Dungeons | [research](../../placement-settlements/place-purpose-hostility-and-dungeon-balance.md): 197 of 527 strictly dungeon-like (37 %) vs Morrowind ~60–74 %; target **240–280** by converting low-value repetitive places and adding underwater entrances (≤25 % wet-majority interiors); `interior` block records kind/family/size/wet fraction/entrances |
| Underwater set dressing | homed: POI families in world 60, assets in 90 §76; the gap is submerged vegetation/groundcover — a submerged depth band added to module 65's tiers (Phase 15 deliverable) |

**Outcome (end of round, 2026-09-03):** 566 live / 247 deferred / 1 cut
(was 527 / 272 / 1; the penal south grew 21 → 44 and the start freehold
17 → 31 because both were thin for a major city; dunmer-north and the
fringe shed repetitive fill). Every live record's four v2 blocks reviewed
by its region agent, then all prose reviewed by a separate text-review
agent per region (0043 process). Enterable interiors 223 (39 %, was 37 %;
35 wet-majority, 33 underwater entrances); hostile-baseline 85 (was 68),
225 typed stance flips; 93 travel stations forming connected coast, lake,
river and interior graphs; 49 registry routes (10 roads, 6 lanes solved;
the rest named-but-unsolved tracks/channels for Part 3c/6). Semantic
audit 832 → 519 findings (high 54 → 21; the remainder are position-
dependent lows and the pinned capital). Plot: 566/566, swap pass moves
~140 sites, every city hinterland covers all five core purposes, no
rest-cadence gaps. Region budgets in `test_catalogue.py` re-based; count
bands re-derived (`worldgen.rederive_count_bands`). **Open:** a faction
registry does not exist yet — region agents introduced ~40 `faction.*`
ids in `hostility.owner`; the build-out's faction system must register
them (game-buildout-register). Vibe sheets re-rendered
(`tooling/asset-pipeline/pipeline/vibe_sheet.py`, now committed).

**Round 2 (touchpoint ③ feedback, 2026-09-04).** Owner rulings: match or
exceed Morrowind's share of hostile/clearable places and carry *fewer*
settlement/civic places than Morrowind (Black Marsh is wild, not a unified
state) — the research doc's earlier reading of "don't overdo it" as a cap was
wrong and is corrected; kits combine only pieces authored to combine (rule in
CLAUDE.md; the vibe-sheet composites were removed); decisions must be
asset-aware (CLAUDE.md rule; creature registry carries `assetAvailability`);
"but" is allowed and the AI-tell research is folded into the text rules;
speech registers are race + upbringing + region + faction, not one voice per
region. Delivered: minor routes painted and cleared (`routes_raster.py`);
Part 3c minor boat channels (145 paths); studio filters/popup/routes layer;
world registries (decision 0044); the quest co-design pass (point 2 of the
loop: 74/74 provisions placed, 18 proposed quests, 15 siting edits,
`docs/quests/25`); the hostility pass then the structural rebalance
(clearable-or-hostile 43 → 56 %, settlement+civic 29 → 22 %, 28 records
converted, 19 deferred, 557 live); two more text passes. Then the **deliverability round**
(owner: all place content must be buildable; engineering standard 12 added):
[audit](../../placement-settlements/place-asset-deliverability-audit.md) over 237 types and
818 records → 96 records repaired in place by seven region agents, one type
redefined (bubble spire → fused-root tower, retexture only), `causeway`
re-specified as pile-borne, `kothringi-lilmothiit-site` redefined as reused
architecture + dressing; kits `dungeon-root-v1` (124), `settlement-root-v1`
(140), `works-v1` (85) packaged from vault pieces (no downloads); alias
targets now validated; `vault_inventory.py` reports every unpackaged
authored set (733) and rigged creature (43). Open: the audit's
position-dependent findings (527, high 26) for the next repair round; the
"house on the stone quay" composition gap; the four faction id merge
candidates in factions.json; the still-unsourceable forms (kiln, saltern,
sluice, winding gear, hull-on-stocks, carved grave-stakes) stay written
out of the prose until a set is found.

**Schema**: places files are `schemaVersion: 2` (migration
`worldgen.migrate_catalogue_v2`; new blocks required at `derived`); route
registry `worldgen.route_registry` with ids stamped on `routes.json` /
`waterways.json` by `compile_society`.

### Quest ↔ place co-design pass (2026-09-04) — point 2 of the loop

The owner asked when the two-way quest/place approach starts; the answer was
"now", per the loop's own point 2 (*after the macro plot*), and it ran. A quest
agent read the 566 plotted records against every provision in quests
[20](../../../quests/20-world-provisions.md)/[30](../../../quests/30-main-quest.md)/[40](../../../quests/40-factions.md)/[50](../../../quests/50-side-quests.md)
and reconciled both directions. **Provisions → places:** the 51 provision ids
the quest tables declare, plus the 23 canon-supplied places and systems of
20 §12b, now all name the catalogue record(s) that satisfy them — 149
`quest.provision.*` ids written across 186 records, with `tierOwnership` on 244.
Two provisions had a place before the pass. Four gaps needed a new record
(`pirate-freeholds.upriver-hist-village` — the start region had no Hist at all,
and MQ01's whole stake is a tree going quiet; `dunmer-north.the-standing-bid`,
MQ07's floating auction; `dunmer-north.the-quiet-landing`, MQ08's cult
safehouse; `hist-heartland.the-cut-circle`, MQ18's sermon house) and eight were
closed by promoting deferred records — worst among them
`saxhleel-coast.archon-lighthouse`, a **tier-0** provision (MQ14) whose only
candidate was sitting in the reserve. Live records 566 → 578, every region
inside budget, no offsetting deferrals taken because fullness is still an open
owner question. **Places → quests:** eighteen PROPOSED rows added to
[55-quest-index.md](../../../quests/55-quest-index.md) §47e from what the province now
offers and the plan does not use — weighted at the two standing shape gaps
(eleven are `WONDER`, `HAUNTING`, `SUCCESSION` or `RITE`), each naming its
anchor places by id, none authored. **Move a dot:** fifteen `sitingPrefs` edits
made for quest value (a sightline between the true light and the false one; the
survey line laid on the omitted corridor; the boss put behind the Lost City
rather than beside it). The join, the rules and the reverse view live in the new
[docs/quests/25-quest-place-map.md](../../../quests/25-quest-place-map.md); the
`questHooks` shape gained `tags` and `opportunity` so the places→quests
direction is not thrown away. **Open:** the twelve new live records are
unplotted — `python3 -m worldgen.macro_plot` and the studio export must be
re-run by the lead, which is also what applies the fifteen siting edits.

## Owner Q&A (grows from Parts 2, 4 and 5)

**Queued for the next owner touchpoint (batched, not blocking):**

1. **Permissions policy conflict — RESOLVED without an owner call
   (2026-09-02):** Darkwater Den's licence forbids its meshes in any
   *public* work and we deploy publicly to Pages; unlike the porting
   clause (owner-approved), that isn't covered by the private-use
   rationale. Since every asset it offered is covered by other pools, the
   `darkwater` pool was **withdrawn unused** (registry mapping removed,
   README credit converted to a provenance note). The module 90 §73
   no-permission-bureaucracy policy stands for everything else.
2. **Raft eyeball** (still open) — but the owner supplied leads
   (2026-09-02): classic Skyrim mod **89948** "and others like it" for
   rafts; for mud huts consider SSE **63329** alongside Mud Mother Grove
   (146557, already sourced). Sourcing pass dispatched.
   **Round 2 leads (owner, 2026-09-02, with a steer that the research so
   far was not thorough enough):** many boat mods exist (e.g. SSE
   **110882**; classic videos/4100); **Argonian Exports** (Steam Workshop
   189297755) may cover various gaps; classic **86156** "northern Argonian
   settlement"; and the r/skyrimmods thread "Best mods for Argonians"
   (reddit.com/r/skyrimmods/comments/1fsawo1) is to be read and its links
   critically considered, not skimmed.
   **Round 3 leads (owner, 2026-09-02):** SSE **36149** (more rowboats);
   SSE **35933** *The Blackest Reaches* (Argonia monster-hunt quest mod —
   check for settlement/environment pieces now; ALSO recorded in module 90
   §74's creature candidate table as a Phase 13 creature/boss lead).
   **Round 4 leads (owner, 2026-09-02) — underwater:** SSE **70917**
   (underwater-quest material), SSE **17267** (underwater treasure — may
   or may not ship new assets), SSE **26913** (underwater generally).
   Underwater POIs throughout appropriate regions are an acceptance
   criterion (00-core) — evaluate for wreck/reef/sunken-structure/treasure
   assets for the catalogue's drowned/underwater families, and note any
   quest-design ideas for the quest plan even where no assets are taken.
   Plus SSE **174995** — mesh fixes for Depths of Skyrim: if Depths is
   sourced, take the fixed meshes (and credit both mods).
   **Round 5 (owner, 2026-09-02):** second reddit thread
   (reddit.com/r/skyrimmods/comments/17bhvze "Looking for Argonian based
   mods") — long list, go through and consider each, but **selectivity
   directive: don't go crazy with too many mods; take only what is
   genuinely useful**. Weapons/equipment finds there are NOT Phase 11 —
   record them in module 90's candidate tables for the later equipment
   passes (10b/13/15) instead of sourcing now.
   Also (owner): if Tropical Skyrim overhauls most vanilla assets, check
   the vault for **tropicalised vanilla static boats** — may be usable.
3. **Gideon anchor.** Its approved position sits on steep ground (14 %
   buildable in 400 m) — expect a nudge proposal within `toleranceUV` at
   Part 6.
4. **"No porting to other games" clauses — RULED, approved (owner,
   2026-09-02):** we may use these mods. Rationale: this is a standalone
   Skyrim overhaul/conversion mod, credited as such, for private personal
   use — not a new game. Unblocks the Ayleid exterior kit and the canoe
   mesh among others; credit every source as usual.
5. **Provenance check**: BM&V bundles a `swamp house.nif` (47 placements);
   a same-named Nexus mod was ripped from a commercial game. If they are
   the same asset it is unusable — flagged in both inventory artefacts.

6. **Player stronghold — A/B, for touchpoint ①.** Two catalogue records are
   flagged `strongholdCandidate: true` and both stay flagged until the owner
   picks. **A — The Meeruth Station** (`place.hist-heartland.xal-meeruth-station`,
   interior): an abandoned Imperial river station on the Helstrom approach —
   stone quay, walled yard, magazine; deep in Hist country, far from every
   service, and both the interior tribes and the Veiled Reed would rather it
   stayed nobody's. **B — Rockpoint** (`place.pirate-freeholds.rockpoint`,
   the northern freeholds): the canon-named landing that lost its trade war
   with Alten Corimont — standing warehouse shell, defensible bank, a river
   bar that will not take a laden hull, and a smugglers' town twenty minutes
   downriver. A is remote, sacred-adjacent and hard to supply; B is
   well-connected, commercially entangled and cheap to reach. Whichever loses
   stays in the catalogue as an ordinary place, so the choice is reversible
   until Part 7.

**Re-review corrections worth knowing (2026-09-02, commit `d959986`):**
the vault's Xanmeer Tileset terrace kit IS stepped-pyramid massing (stack
decreasing terraces; round-1 "no massing" was wrong — the true gap is
ornamental frontage); rafts/canoes remain fully open pending Q2's eyeball
(both new boat mods are keeled Nord hulls per the re-sweep); the vault has
NO Skyrim DLC (Hearthfire's modular homestead kit is the real loss);
Nexus has no true mud-hut kit or raft/canoe pack at all — the mud culture
will be kitbashed permanently, plan for it. Next sourcing priorities:
Ships and Boats of Tamriel (SSE 41653, flat-bottomed hulls) and Skyfall's
Sleeping Hist Tree Overhaul (SSE 116792, mesh variants for the ten hero
Hist + cairns-as-grave-markers).

### Part 5 decision + round 5 — touchpoint ③ third list, exemplars from the vegetated areas (2026-09-04)

**Text rulings (owner's third list).** The faults named (a tag-line turn on
the reader, a portentous closer, a pithy compressed predicate, a clumsy
"X and Y" pair, repetition for effect, *exactly one / only one / none of
it*, a sentence ending on a preposition) are one class: **the sentence is
doing more than stating its fact.** Recorded as style guide §2.8 with the
owner's nine examples and seven rules; five rows added to the banned table
(quests 60 §45e.1); the reviewer's two new tests (the trying-too-hard test,
the wiki test) in review-process §3. **Place records are now written in
reference register** (the voice of a UESP place page; the owner's steer,
adopted): third person, concrete, no address to the reader, no closer.
Dialogue keeps its speaker voice under the same bans. **No sentence or
clause ends on a preposition**, on any surface. The linter gained four hard
rules (`exactly-n`, `only-one`, `final-preposition`, `turn-on-reader`) and
three soft counts (`none-of`, `zinger-tail`, `repeat-noun`) with province
ceilings; 425 hard hits appeared province-wide and were cleared by nine
reviewer agents (one per region + quests/text catalogue), who read every
live record in full, not only the hits. **A reusable `text-review` skill**
(`.claude/skills/text-review/SKILL.md`) is now how any agent reviews new
text, and CLAUDE.md makes a separate-agent review mandatory before commit.

**Part 5 decision — the exemplar set, re-picked from the vegetated
chunks (owner ruling: exemplars must sit where Phase 10 already placed
vegetation, so one area carries every system; five places, agent picks).**
Only Lilmoth and Blackrose lie inside the 49 vegetated chunks, so the
round-4 recommendation (Alten Corimont) was withdrawn. Chosen:

| # | place | why it is in the set | vegetation exemplar area |
|---|---|---|---|
| city | **Lilmoth** `place.mercantile-coast.lilmoth` | M5 rebuilt stilt city over drowned Imperial villas; stilt + docks + boats, the most mature kits; the mangrove wall on its approach (chunk 7,14) | coastal lagoon / mangrove |
| 1 | **Nine-Trunks** `place.hist-heartland.nine-trunks` | Hist village M3, the commonest family (27); the ring of nine trunks is a composition problem to solve on geometry | fringe marsh (Blackrose-basin side) |
| 2 | **Mazzatun** `place.dunmer-north.mazzatun` | canon stone village on a ridge end in upland hills: the slope ladder and terracing on a stone kit, plus a bound Hist sibling | upland hills (the dry proof) |
| 3 | **The Standing Charge** `place.naga-kur-deeps.wamasu-pond-adult` | D5 beast lair in rootland deep marsh, the largest family (38); a creature-owned outdoor place with a delve | rootland deep marsh |
| 4 | **The Licensed Stage** `place.hist-heartland.sap-tapping-licensed` | the smallest type (M1 works) in tropical jungle, where clearance and the performance budget are decided | tropical jungle |

Held back: Keel-Sakka Landing (same chunk as Lilmoth and the same kit;
folds into the city's Round C walk), Blackrose (the alternative city; the
interior-swamp area is therefore not in the set, which Part 8's first
rollout packet should cover), the underwater exemplar (Phase 9 builds its
own on the swim slice, world 95 Phase 9).

**Part 6 schema changes (kept in one pair of hands).** District
`cultureKit` is now a **kit set** (`blueprint.KIT_SETS`: argonian-stilt /
-mud / -root / -stone, imperial, dunmer-hlaalu, neutral-works,
neutral-underwater; the legacy two ids stay valid) — one packaged kit set
per district, so "kits only combine pieces designed to combine" is a
validator rule, and the set's culture carries the two-culture rule. Parcels
may name an exact `assetRef`, chosen on the kit manifest's measured
`sizeM`, and the compiler honours it over the family pick (geometry, never
labels). A `siting` block records the dossier and the 2–3 exact candidates
with one chosen. Conventions for what sits next to a blueprint:
`world/sources/blueprints/README.md`.

**Round 5 delivery record.** Text: 677 hard hits appeared under the new
rules (425 phrase-level + 252 second-person once place records were held to
the reference register) and were cleared by twelve reviewer agents reading
every live record in full; province-wide the linter now holds 0 hard hits
over 11.6k texts / 166k words, all density ceilings met. Reviewers added
eleven rows to the banned table (design voice in premises and opportunity
fields, the verbless epigram, accidental verb repetition, the wry comma
label, the field-to-field echo, the one-word label with a full stop, the
"total absence of" closer, the concealed-arrival formula, the quest-shape
tail) and the linter gained the matching soft counts. The owner's example
system line (`essential-npc-killed`) is now the reviewer's plain version by
the owner's own note; the test that pinned the old wording is gone.
Fact-level doubts the reviewers raised (a gendered keeper at
Three-Ways-Over-Water, Rockpark's "sixteen" vs "five" centuries, Soulrest's
three vs four powers, a plague-village hook on The Old Quarters, LF23
"skooma" vs sap) are queued for the next region pass, not resolved here.

**Part 6 delivery record.** Five dossiers, fifteen candidate sitings, five
designs, five blueprints validating and compiling with 0 errors (Lilmoth 42
placements, Mazzatun 29, Nine-Trunks 14, Licensed Stage 7, Standing Charge
3), five maps. Four of the five plotted points could not carry the place
as recorded (no standing water for the pond; a 47° hillside under
Mazzatun; 4.3 m of relief across the Nine-Trunks ring; no navigable water
for the licence stage) and were re-sited 69–149 m on measurement — the
macro plot places by landform class, the meso pass by geometry, which is
what Part 6 is for. Compiler fixes on the way: door reachability indexed
the terrain grid transposed (every door on dry ground failed) and read the
5.5 m slope raster (a terrace lip read as 40°; now a 2 m local gradient);
parcels carry `yawDeg`; a district is one kit set; every placed object has
a `<kind>.<slug>.<name>` id and the id registry accepts a source that
*references* a catalogue id (`references: ["place"]`). Sourcing gaps shown,
not faked: a stand-alone Hist trunk column; an Argonian underwater shrine
focal object. Catalogue changes the designs need (positions, plot facts, a
`pool` and a `rock-shelf` terrain request, asset plans naming kits that
cannot serve the place, empty socket lists) are queued at the end of each
design record for after the owner confirms the sitings. Round A packet:
[phase11-part6-round-a.md](phase11-part6-round-a.md).

### Plot rule — the committed plot is the seed of the solve (2026-09-07)

The owner-authorised terrain edits (channels carved to their water profile,
deep basins filled; 155k cells, 0.55 m median) moved 342 of 579 records in a
from-scratch solve, because the siting scorer is globally sensitive to its
input rasters. `macro_plot` now seeds from the committed plot: a record keeps
its committed cell unless that cell is no longer valid (water depth at the dot,
a danger/region raster that moved under it, a sightline the new terrain
blocks), and the run reports every re-siting. A province-wide re-plot stays the
owner's deliberate step, behind `--resolve-all`. See playbook §1 "The seed
rule".

### Review 2026-09-07 — every round claim checked against the code (Fable planned, four Opus audits, four Opus fix batches)

#### Interiors, done at the root (2026-09-07)

The owner ruled that every exterior designed to have an interior must be
matched to that interior, and must have a derived entrance. The old approach
guessed from filename prefixes. Skyrim plugins hold the answer: an exterior
door reference carries a teleport to a door inside an interior cell, and that
cell's contents are the interior. `worldgen.mine_door_links`
now reads that link out of all **50 plugins** in the vault (vanilla, Black
Marsh & Valenwood, HTBM, Mud Mother Grove, Xalfek, Darkwater Den, Marsh Rest,
the Xanmeer and Ayleid resource packs and the rest) and writes
`world/sources/placement/exterior-interior-links.json`: **330 exterior shells**
linked to **458 interior cells**, each with the door's offset in the shell's own
frame (the derived entrance), the cell's full piece list and per-plugin
provenance and hash. Mining it exposed a real reader bug: `Plugin.interior_cells`
dropped the last interior cell of every plugin whose cell block precedes its
worldspaces, which is why the small Argonian home mods looked interior-less.

The variety that the owner did not accept as 'two' is real: HTBM alone authors
**20 distinct Argonian/Kothringi interiors** (17 hut rooms, a great house, a
Kothringi great house and two xanmeer complexes); Black Marsh & Valenwood add
**43** more across its three plugins. Three interior kits now come from that
evidence rather than from prose: `htbm-hut-int` (15 pieces), `mudmother-hut-int`
(64) and the new `bmv-treehouse-int` (16). The interiors index takes the link
first: `interior: tileset` from the cell's own pieces, plus an `esp-door`
doorway at the mined offset (radial where the mod turned the door to face each
lane). The filename table survives only as a fallback that warns. Two HARD
rules follow: a manifest-linked shell may never be authored with no interior or
on an unbuilt kit, and `worldgen.asset_breadth` reports how much of the linked
pool each culture and each blueprint actually uses, with the floor left to
Part 8.

The owner asked for an audit of what the rounds *claimed* against what the
repo *does*, plus a plan for the gaps. Four read-only audits (blueprint
chain, studio UI, routes/terrain/network, process gates) ran against the
Assemblies, Doors, Promise-ledger, Round A feedback and Round A follow-up
records and the owner's own ask list. The open batches are in
[phase11-gap-plan.md](phase11-gap-plan.md).

**Claim ledger** (V = verified as written; P = partly true; F = false as
written).

| Claim | Result | What the audit measured |
|---|---|---|
| Five blueprints validate, compile 0 errors, every promise met | V | 0 errors each; ledgers 8/8, 8/8, 3/3, 46/46, 2/2. `blueprint --check` did not exist as a flag (now does) |
| "49 of 49 buildings with an interior have a derived doorway and a linked kit that exists" | P | 49 are kit index rows, not buildings; 58 of 58 placed doors carry a `doorwayRef`; every parcel without a door declares `interior: none`. **Three interior links pointed at NIFs no kit had built** (mud hut, two bamboo huts: 50 doors' worth) — built this session. The front-face criterion's "0.00 or 1.00" evidence was false: 31 of the 49 failed the gate and were reinstated by door promotion |
| Doors only on derived doorways, `door-on-way` HARD, `--orient` | V | `blueprint.py` 1051–1058, 562–647; `solve_yaw` idempotent |
| 14 composites from mined templates, footprints re-measured, Lilmoth on them | V | offsets spot-checked against `kit-assemblies-mined.json`; 43 of 61 Lilmoth parcels reference composites |
| "Seven" integration checks, real geometry | V (nine) | shapely, each with paired fail/pass tests. Owner problems a–f fixed in the data; **(g) canal to sea could not be caught** (only "in water" was tested) and **(e) door into a neighbour passed on luck** (no sightline test) — both are checks now |
| Six-paragraph `why` on everything | P | 100 % coverage, but districts/docks carry five by design; 35 fields under 40 chars and 14 texts repeated over 76 paragraphs — rewritten and text-reviewed this session; a WARN now reports both |
| `approaches[]` + 16-item checklist; `scaleGrounding` | P | present and required; the "≥2 for M3+" rule was dead code (now enforced); `npcsPlanned` 70 vs 11 authored occupants was silent (now a WARN); `lilmoth.md` was stale against its JSON (corrected) |
| Fences as ways; every district parcelled | V | Lilmoth 8 districts, 0 orphans |
| `street_router` A*, straight only where the culture surveys | P | genuine A*; but 10 of Lilmoth's 21 ways are declared `straight`, including 8 Argonian boardwalks (gap plan B8) |
| `services[]` on 149 records, 19-word vocabulary, drift test | V | consistency gate, not a correctness gate |
| Lanes end at the quay "at 0.0 m", "were 93 m short"; owner saw lanes going inland | P | lanes end 5.3 m from the quay (1.85 m from the terminal, the two-extent bug, plan B6); pre-fix distance was 295 m, not 93; what the owner saw was the **road** tail — the export dropped `networkTerminals` and the view drew whole province polylines through the box (both fixed) |
| Parcels are real hulls, not squares | P | parcels yes (2 of 115 axis-aligned, both real); **all 24 district and combat-space boundaries are hand-drawn boxes** (plan B3) |
| Route grading + structures: 55→35→0 survivors, 162 structures | V numbers, F guarantee | the chain does cut the heightmap and it shipped; but the "no rim over 30°" guarantee was false (fills to 70 m, 21,688 rim cells made steeper) — grader fixed this session, rasters not yet rebuilt (plan B2); "survivors 0" is near-tautological (structures exempt their own windows) |
| `apply_sitings` moves dot, paths, waterways, exports | P | four moves, not five (Lilmoth is an anchor); 115 m and 108 m, not 120 and 117; `export_blueprints` was not in the chain (added) |
| Clark–Evans R ≈ 1.8, "more even than random" | P | numbers reproduce; the null in these thin masks is 1.07–1.36, so the excess is ~1.4; the `SEPARATION_M` floor guaranteed R > 1 (plan B5). **`SEPARATION_M` no longer exists** — it was deleted when the Thomas prior landed, and since 2026-09-09 the only hard spacing is the typed footprint sum |
| Module 97 §G rows CLOSED as claimed | V | no fabricated row; but no Python test runs in CI (plan B7) |
| Standard 13 fails `npm test` when placement work changes without the playbook | F | it read `git status` only, so it passed vacuously on a clean tree and could never fire in CI — now unions the working tree with the commits since the merge-base and covers the kits/interiors/grading tools |
| Prose linter is an `npm test` gate | F | nothing in `npm test` ran Python — `check.mjs` now runs `lint_prose --strict` (2 s) |
| Fable-plans/Opus-delivers is automatic for fresh agents | F | prose only; `.claude/agents/deliver.md` and `research.md` (Opus, low effort) now exist and CLAUDE.md names them, with the owner's 2026-09-07 addition: root causes, shared causes across a batch, batched fixes are Fable's job |
| Studio: labels only when zoomed, doorways drawn, hatched spans, bp ground, markers from data | V | all present. Owner's two complaints root-caused: every tier 0/1 marker was drawn with no distance cull and `depthTest=false` (~90 names); `bpground` drew depth-test-off and substituted y=0 wherever the fine chunk was not resident, then rebuilt as chunks streamed (the "moving" outlines). Fixed |
| `docs/research` in ten folders; links clean; rendering + wayfinding research sourced | V | 0 dangling links; the rendering doc's 30-item checklist covers every item of the owner's brainstorm with sources |
| Sourcing register, credits | V | no OPEN row; hashes live in the log, not the README (plan B8) |

**Fixed in the review session** (all gates green: 770 game-core, 93 studio,
139 placement + 12 grading + 48 interiors-index tests, repo-standards with
the two new gates, typecheck): studio marker culling/fade/depth and ground
outline depth/no-zero/rebuild; export of `networkTerminals` and clipped
context routes; `apply_sitings` re-exports blueprints; `reroute_majors`
fingerprint by content hash (the mtime one re-baptised its own repair);
two hard-coded vault paths made relative; M3+ two-approach rule; `--check`
and `--id` on the validator; `_water_at`/`check_network_stitch`/registry
loads raise instead of passing; `canal-bound` and `door-sightline` HARD;
why-quality and occupancy WARNs; `compile_settlement --out` honours a dir
and writes the ledger there; `interiorRef` must be a BUILT kit; kits
`htbm-hut-int` (9) and `mudmother-hut-int` (24) built and indexed;
`grade_routes` rim fix (fill cap 6 m, cut before embankment, shoulder
sized from the real relief, infeasible stretches handed to structures,
`--audit-rims`), province-level tests, `scripts/terrain-chain.sh` as the
one place the chain order lives; prose rewrite of 35 short and 76
duplicated why paragraphs with a text-review pass; five design records
recounted against their JSON.

**Recommendations on the open calls** (owner decides; the reasoning is
short on purpose):

1. *Plot evenness re-solve* — yes, but **after** Round B on Lilmoth and
   before Part 8 rollout: nothing in Round B reads the plot, every future
   meso dossier does, and the fix is a clustering prior rather than "remove
   the lattice" (plan B5).
2. *Gate tower and Ayleid stair block as masses* — accept. Neither is a
   promise; a guard post that must be entered uses the keep tower pieces
   that carry a baked door leaf.
3. *Argonian records promise a shrine, not a temple* — confirm. The Hist
   court is the sacred ground (lore dossier); the only check to keep is
   that Imperial- or Dunmer-founded places still promise their chapel or
   temple under their own culture.
4. *Hostile-or-clearable floor at 55.5 % vs 55 %* — make the 55 % a soft
   ceiling (WARN) with a hard floor at 50 %, so one justified cut does not
   break the build while the intent (touchpoint ①) holds.
5. *Combat spaces in a safe city* — intentional (97 D9): each of Lilmoth's
   four is tied to a quest or a hostility flip. Keep.
6. *Lilmoth* — (1) rename the gate for the road it faces (the Blackrose
   gate) rather than spend a 300 m spur; (2) keep the drowned quarter at
   1–15 m under your own walkway — the expeditionary dive belongs to a
   wreck place, not the capital; (3) the two stilt halls take the interior to
   which the mod's own door links point (owner 2026-09-07: no holding
   positions; see 'Interiors, done at the root' below); (4)
   **climbing free on the piles and house sides** — module 00-core's
   acceptance rule says large logical surfaces are climbable by default, so
   quest gates must never assume the stair is the only way up.
7. *Nine-Trunks* — accept the houses grown into the trunks, canvas outside
   the gate for delegations, 22.6 m as the village default, and the 149 m
   move.
8. *Mazzatun* — the building site of rising courses (the finished pyramid
   swallows the shelf); keep the Hist below with the conduits climbing;
   pens behind the rise (a reveal); the haul road as a switchback.
9. *The Standing Charge* — 2.5 m (a swimmable fight: the swimming pillar
   needs its first fight); charged water as heavy damage over time, not
   lethal; the loud outcome (detour abandoned, travel times drop — legible
   fixed world state); the offering-makers right and the hunter wrong.
10. *The Licensed Stage* — the 54 m hero Hist (the licence is meant to be
    read from the water, so the camp is a landmark, not a hide); the mud
    hut; readable from the boat; accept the 190 m² clearing as the first
    canopy data point.
11. *Round B massing* — the previous round gated it on a Round A approval;
    the pipeline does not depend on one, only the final judgement of a place
    does. It is batch B1, deferred in this session only because it lives in
    the studio scene files the water pass is editing.

**Owner-eye review of the five blueprints (2026-09-07, standing in for the owner):** [phase11-round-a-owner-eye-review.md](phase11-round-a-owner-eye-review.md) — what each map showed, the walk-throughs, the fixes, and the ledger rows above dated the same day.

### Review 2026-09-07, second pass — the owner's questions answered at the root (Fable decided, five Opus batches)

**Owner rulings.** One canonical answer per building for where its door is;
a derived front and back for pieces without a door, generalising to every
plotted place, not settlements only; no black yaw stub; enterable buildings
earn their interior (a purpose spectrum, not flavour); a defect found is
never "out of scope"; there is more than one road-spanning gate in the
mods we hold; Pusbottom's count follows the lore grounding; the remaining
principle questions (props vs buildings, kit purity, C2/C4, C10, `abuts`,
D7, C3, the Mazzatun back way) are the implementation lead's to decide.

**What landed** (rules in module 97 with enforcement, rows in the Taste
ledger, lessons in module 96):

- *One entrance per piece.* `interiors_index.finalise_entrance` ranks the
  evidence (plugin door link > kit assembly door part > door piece > baked
  leaf > measured opening > open front) and writes one `entrance` with a
  `provenance[]` audit trail; radial only where placements show the door
  turned. 50 pieces carry an entrance (15 from the plugins). `doorwayRef` is
  gone; the studio draws one red door tick and names the evidence on click.
- *Front and back.* `piece_front.py`: the front is the side the piece's own
  authors repeatedly left open (co-placement evidence, 31 pieces), else the
  detailed face (triangle-density asymmetry, 419), else symmetric (631).
  Validator: a piece with a front looks at its nearest way or approach
  within 60° (WARN; HARD where it has an entrance); gates, walls and towers
  face away from what the boundary polygon encloses, and a gate a way runs
  through has that way's outer end on its front (HARD). The approach rule
  is a WARN on curtain walls because a wall flanks the road through its own
  gate (documented in `piece-front-derivation.md`). Lilmoth's gate arch
  turned 58.7 → 342.6°, its south stub 58.7 → 71.9°; Mazzatun's two gates
  turned.
- *Player purposes.* `player_purpose.py`: twenty kinds in three tiers; every
  door carries `playerPurpose[]` with a medium-or-higher entry (HARD),
  distribution WARNs per place; 56 enterables authored, Pusbottom kept at 15
  huts as the criminal economy (fence, safehouse, Owing brokerage, stash,
  divers' cache, dice barge, bunks). Research:
  `research/placement-settlements/player-purpose-spectrum.md`.
- *Six tool defects fixed* (C5 on hull centroids, stacked-piece overlap,
  C6 over the built hull and settlements only, D2 canopy along the ray,
  `scaleGrounding` by kind, the linter by paragraph) and *eight decisions
  as rules*: parcel `kind` building/structure/prop (props exempt from
  spacing, density and the use mix; counted by dressing); works props and a
  neutral dressing pool admitted to every kit set (the one-piece districts
  are gone); the Hist keeps the high ground and commerce sits at the first
  junction inside the threshold on the way to it; a ring of dwellings is an
  edge, not a fence; `abuts` is a kit snap, `worksWith` a trade contact with
  0.5 m clear; the Morrowind ratio rules structure counts and the
  register's 150–400 band is total placed objects; a gate sets the width
  through it; Mazzatun's back way is a climb, no cut.
- *Gates sourced.* `enclosure-v1` (57 pieces, six never-mixed families):
  nine real gates measured by ray aperture — the BM&V newcastle curtain gate
  (5.52 m) and arch (8.96 m) pass the 4.3 m spine; Redoran, HTBM ancient,
  Ayleid and Argonian arches take a track or footpath; the stockade gate is
  modelled shut. Lilmoth's Imperial arch is 3.20 m, so the spine narrows
  through it (C3). Xanmeer ships no gate: a standing gap, never faked.

**Decisions for the owner that remain**, after this pass: none of the
above; see the closing list in the next session's brief.

### Assemblies round — the queued list, delivered (2026-09-05, Fable planned, Opus delivered)

The six items queued at the end of Round A feedback, minus Round B massing,
which stays gated on the owner approving a place. Nothing here needed a
taste steer; every rule is a mechanism.

**(1) Buildings as assemblies.** Fourteen composites authored in seven kit
configs from the mined templates, each citing its template ids and counts,
each inside its kit's `snapLogic` (`assemblies` paragraph added per kit):
the HTBM bamboo huts with their door (stilt), the mud hut with its frame and
door (mud), farmhouse 01/02 with their doors and 3- and 5-piece capped
stone-wall runs (imperial), 2- and 3-stage scaffold towers (works), 2- and
3-piece quay runs (docks), two pre-stacked Ayleid block masses (ruin) and
the phitt marsh house with overhang and windows (hlaalu-domestic, a BM&V
family already in the pool, filed there as the Dunmer/fringe domestic tier).
Nothing on the evidence doc's keep-separate list was composited; the one
extra never-alone candidate (`kioskbarrierei01`, 93) was rejected as a
railing run whose length is a siting decision. Single pieces stay in the
kits for ruins. Kits rebuilt, footprints and interiors re-measured.

**(2) Doorways derived, doors only on them.** `interiors_index` joins the
mined `doorwaysFromAssemblies`: geometry first, mined doors as the doorway
where the rays found none (`doorwaySource: assembly`, count carried, radial
doors as a ring), a composite inheriting its anchor's doors. Coverage 9 → 22
of 75 enclosed pieces. Validator HARD rule: a door sits on a derived doorway
(fixed: within ±45° of the side; radial: threshold on the ring ±0.5 m) or
not at all; a piece with an inside and no doorway carries no door; it is
reported as a WARN and recorded as a sourcing gap rather than given an
invented entrance. `doorwayRef` is derived by `blueprint_footprints --doors`. Doorways are
exported and drawn on the outline in the studio (gold assembly, blue-green
geometry, dashed radial). Clicking a parcel lists them. All five blueprints re-authored: Lilmoth's 32 huts on the door
composites, each turned so the shipped door serves its way; Nine-Trunks'
naheesh house on the mud composite; the Licensed Stage's tent swapped for a
hut with a doorway. Six doors removed and recorded as gaps (register rows G4–G7:
Ayleid stair block, the Imperial guard tower, two BM&V stilt houses, two
Bosmer kiosks — no door part in any source placement and no measurable
opening; the kiosks may simply want `interior: none`, the owner's call).

**(3) Steep routes.** New kit `route-structures-v1` (20 pieces, five
culture families, all from credited pools; the mwkeep ledge system rejected
on measured geometry). `author_route_structures` derives the over-cap
windows from the grader; `compile_route_structures` lays measured pieces
(landings where the ground outruns the piece's rise; flight cap 35°, ramp
deck 12°). 162 structures, 2,151 pieces, 36 ways (lip-step 46, stair 46,
stepped ascent 37, deck 27, bridge 6). Grader exempts the spans like bridges;
survivors 35 → 0, residual 0 m everywhere. Terrain chain rebuilt end to end,
byte-stable on a second run. Studio routes layer hatches the spans with a
hover label; 3D pieces wait for Round B.

**(4) Lilmoth's lanes.** `world/sources/routes/lane-terminals.json` (general
mechanism, one entry) makes `compile_society` end a city's lanes at its
declared berth (asserted boatable); the three lanes now join the lighter quay
at 0.0 m (the anchor pixel was 295 m off on the published grid; the "93 m"
was the stitch pass's measure to the boundary). The survey keeps
`waterways-natural.json` for siting, so the move did not re-plot the province
(the same natural/published split that the roads use, 0025). Water terminals are
checked as "lands at the lane's end onto a landing kind", not "continues the
bearing" — three lanes converge on one berth. `province_network` loads the
169 minor poling channels as addressable terminals. Root-cause fix on the
way: `compile_society` no longer clobbers `reroute_majors`' repaired
`routes.json` (natural-hash marker).

**(5) Module 97 §G macro gaps, all five CLOSED** (mechanisms in the table).
Live numbers: G1 all 22 M4/M5 records pass; G4 0 of 171 same-type pairs
fail; G6 settlement+civic 21.2 % (ceiling 22), hostile-or-clearable 55.5 %
against the HARD 55 % floor, about three records of headroom, so any cut on the
hostile side breaks it; G5 six navigable records pinned with reasons
(four at 0.0 m depth, two just under the keeled 3.0 m). **G3 is a real
finding for the owner:** Clark–Evans R is 1.44–2.28 per zone (median 1.78);
the target is < 1 and hand-placed worlds measure about 0.5. The plot is more
even than random: this is the lattice spread against which A5 warns. It reads
as procedural. Closing it is a re-solve that moves records rather than a
report. It is queued as an owner question.

**Not delivered:** Round B massing (gated on a Round A approval). The
outdoor dressing pass (G18) and `connectors.json` (G19) remain OPEN and are
the next meso-level items.

### Doors round — owner ruling: 100 % of buildings with an interior have a derived doorway and a linked interior (2026-09-05, late)

**Rulings.** (1) Every building designed to have an interior has a derived
door/entrance and a linked interior kit; the door teleports the player into
that interior, as in Morrowind and Skyrim. (2) No door mesh is placed: the
door is part of the building object (a composite with its door part) or an
opening measured on the shell; the blueprint derives and plots the doorway
on the footprint so the building can be oriented and a reviewer sees where
the player enters. (3) Orientation is planned around the door: a building
is sited and turned so its doorway faces the way we want.

**Delivery.** The 53 doorless "enclosed" pieces split into two root
causes. First, the ray probe counted hollow props as rooms, because game
meshes are shells: a new front-face criterion (≥ 0.6 of ring hits show the
wall's front to the eye; measured populations 0.00 vs 1.00, no overlap)
demoted 39 masses — foundations, plazas, pools, columns, statue bases, the
Ayleid stair block, tower tops and bases, the Imperial guard tower (no
opening, no door anywhere) and the BM&V phitt house. A closed shell is
promoted back only when something says it has a door. Second, real
buildings had entrances that the probe could not read: open fronts wider than
5 m (the stables, the tent, the stilt house veranda, the bamboo huts) are
now a doorway of kind `open-front`; baked door leaves (the keeps, the towers,
the Hlaalu tower modules, farmhouse02) are found as a planar patch proud of
the wall (validated against farmhouse02's 13 mined placements, 10° apart);
the kiosk takes its own access piece, fitted into its ring gaps to 0.11 m
(`kiosk-with-access` composites) and the stilt house its door
(`stilthouse-with-door`); the probe retries on a 1 m lattice when the plan
centroid lands on a veranda. Result: **49 of 49 buildings have a doorway**
(leaf 15, open-front 13, opening 11, assembly 6, door-piece 4). Every
one links to a kit that exists: the `shell` class is empty, new family rules
map the mud, hut, stilt and ship shells to a tileset; the two tilesets
that the index had been naming without a kit — `vanilla-farmhouse-int` (76
pieces, five authored grammars kept apart) and `vanilla-imperial-int` (65,
the Imperial fort room-and-corridor set; Solitude rejected as Nordic) — are
built, measured and registered. Sourcing rows G4–G7 CLOSED with no download.
Validator: `interiorRef` must be an existing kit; a building with an
interior must carry a door (HARD again); `door-on-way` HARD at 60°;
`blueprint_footprints --orient` turns a parcel so its chosen doorway faces
its way and reports old → new yaw. Blueprints re-authored on the new index
(the doors removed earlier restored on real doorways).

### Promise ledger — owner finding: the macro layer's promises were not checked against the blueprint (2026-09-05, late)

**Finding.** The owner could not find in Lilmoth the shops and services the
plan gave it. The only promise the compiler checked was `sockets` →
`questSockets`; the record said `service-hub` and "services" as a reward
kind, but nothing typed *which* services, so nothing could be checked.

**Rulings and mechanism** (module 97 **E9**, §G22): what a record promises
the player — services, named people, travel, quest provisions, sockets,
reward kinds, the entrance — is realised in the blueprint as named,
enterable objects; a promise nothing realises fails the compile from M3
up (WARN below). The promise is typed: `services[]` on every live settlement
or civic record, a closed vocabulary of nineteen, derived deterministically
by `worldgen.derive_services` from magnitude × culture × player purpose ×
travel station × NPC roles, calibrated on Morrowind's Balmora (UESP) as our
M4 and on the settlement register for what an Argonian rebuilt city, a Dunmer
stronghold or a hamlet does and does not have; 149 records carry it; the
test suite fails on drift, on a hub below its band, on a hamlet with a
service quarter. The delivery is checked by `blueprint_promises` (called
from `compile_settlement`, ledger written beside the compiled settlement and
read into the design record): an enterable service needs a parcel with
`service`, a door on a derived doorway and a linked interior kit; a named
NPC needs an occupant with `worksAt`/`livesAt`; a travel destination a
service at a dock; a provision the objects that docs/quests/20 names for it; a
socket a `questSocket` (private ids carry `socketRef`). A service the lore
says the culture lacks is removed from the promise, never faked.

**First ledger.** Lilmoth 28 of 47 met — unmet: ten services (apothecary,
boatwright, council, guild-hall, lodging, smith, tavern, temple, trader),
three named NPCs without a workplace, four provisions, faction-access, the
Oliis ferry destination; Mazzatun 1 of 8, Nine-Trunks 1 of 8. Filled in the
same session (record below); playbook step 1 now says the ledger IS the list
of layout requirements.

**Filled (2026-09-06).** All five blueprints compile with 0 errors and
every ledger row is met. Lilmoth gained seven service buildings on the
district kit sets with doorways and interiors (gate lodging on the farmhouse
composite; trader, apothecary and tavern on the spine; guild hall on the
council bench; smith and boatwright at the quay), its council hall and
licence house typed, named occupants given workplaces, four provisions as
sockets, a ferry service to the Oliis stage; Mazzatun and Nine-Trunks a
store each, lodging and a shrine typed, sockets referenced. One promise was
removed rather than built: Argonian records no longer promise a `temple`
(rule R3; the Hist court is the sacred ground), which also changed
Stormhold, Thorn, Helstrom and Archon — an owner confirmation is asked.

### Round A feedback — the owner's first look at the studio view (2026-09-05)

**Rulings and what they became.** (1) *Whys on click*: every district, parcel,
landmark and dock carries a plain-English `why` block (what · why in the
place · why this spot · why with its neighbours · what it gives the player ·
how it uses the ground), shown first in the studio panel; blueprint prose is
linted and text-reviewed like place prose. (2) *Layers integrate*: six
compile-time checks (`blueprint_integration`) — a way touches only a building
it ends at, no way drawn twice, no overlapping hulls, a gate spans its road, a
door within 4 m of a way, a canal lies in water — plus `stacksOn` for a piece
on a deck and `abuts` for designed abutments. (3) *Streets are routed*, not
drawn: ways are `via` waypoints with a why; `street_router` derives the line
over slope/water/buildings (A*), straight only where the culture surveys.
(4) *Doors and interiors from the kits*: `pipeline/interiors_index.py`
measures which pieces enclose a room and where their doorways are; a parcel
with an interior must have a door on a real doorway side, with the interior
kit named. (5) *Designed from the walking player's eye*: `approaches[]`
(first-seen landmark, sequence, wayfinding) with a 16-item checklist in each
design record; research in `docs/research/placement-settlements/openworld-approach-and-wayfinding.md`.
(6) *Full detail and honest scale*: every district parcelled; fences and
walls drawn as ways; `scaleGrounding` derives the size from the settlement
register and module 92 (Lilmoth 53 buildings, 190–230 people, 70 named NPCs).
(7) *The map is the studio map*: the blueprint view reuses the main map with
neighbouring places and routes as context; `?bpground=1` paints the outlines
on the ground in walk mode (temporary until Round B); city markers follow the
exported data. (8) *Roads walkable*: a route-grading stage in the terrain
chain plus gradient-aware routing (`routes.grade_factor`, `reroute_majors`) —
55 → 35 ways over cap; the 35 need authored geometry (14 one-piece lips, 11
bridge decks, 9 stepped hill ascents, 1 terrace approach — listed in
`world/sources/sites/route-grading.md`; Part 7 work). (9) *The workflow
keeps itself*: engineering standard 13 fails `npm test` when placement work
changes without the playbook or this record; gaps are filled the same
session (G3 licence board sourced: `bmv:advertising_board`). (10) **Module 97,
the placement principles**: one internally consistent set (A macro → F
culture grammars), each rule with evidence tags and its enforcement; twenty
gaps in §G, nine closed the same day as validator/compile checks; fifteen
decisions listed for the owner's sense check. Evidence: measured settlement
form from Skyrim + BM&V + Valenwood + HTBM (`settlement-form-evidence.md`)
and online research (`settlement-design-principles-sources.md`).

**Design outcomes.** Lilmoth redrawn on re-surveyed ground (the old "north
road" did not exist on the published network; the gate now stands on the
Blackrose road; drowned quarter measured 1–15 m); Nine-Trunks as nine sourced
trunk columns with eight mud huts in the gaps, doors inward; Mazzatun's
courses along the risers with the tribe housed underground behind the
stair-throat (a recorded deviation from the use mix); the Standing Charge's
lane moved onto the only poleable water (a creek south-east, not the north);
the Licensed Stage's board placed at the landing. All five compile clean
after the audit against module 97 (`phase11-round-a-audit.md`).

**Next round (queued for the next session; owner asks 2026-09-05, late).**
(1) **Assemblies**: buildings are multi-piece — a shell plus its door piece,
platform, stairs, railings; wall and fence segments in chains; scaffold base
plus top. Mine the source authors' co-placement templates
(`worldgen.mine_assemblies` → `world/sources/placement/kit-assemblies-mined.json`,
evidence in `docs/research/placement-settlements/kit-assemblies-evidence.md`),
author them as composite kit assets (`compose.parts`, per each kit's
`snapLogic`), rebuild the kits, and re-derive footprints and doorways; parcels
then reference the composite. (2) **Doors where the piece has them**: the
doorway is derived (door part offset in the assembly, or the measured opening)
and drawn on the outline; a door may only sit on a derived doorway (the
interiors index rule already exists, its coverage does not — 7 of 72 enclosed
pieces have measured doorways); orientation and siting reason from it.
(3) The 35 steep route survivors need authored geometry (stairs, bridge
decks), listed in `world/sources/sites/route-grading.md`. (4) Module 97 §G
open gaps (macro-level and the outdoor dressing pass). (5) Round B massing on
the first approved place against the Round B rendering checklist. (6) Two
network defects found by the stitch pass: Lilmoth's three boat lanes end at
the plotted dot, 93 m short of the lighter quay (a Phase 4 lane endpoint;
move the lane ends to the quay terminal), and `province_network` does not
load `waterways-minor.json`, so a poling lane cannot yet be a terminal. Model
policy: Fable plans and briefs, Opus 5 at low effort delivers.

### Round A follow-up — the owner's list on the Part 6 packet (2026-09-05)

**Rulings.** (1) A place moved after the plot moves its dot, its paths and
its waterways too, now and always: `worldgen.apply_sitings` (incremental —
the four sited records moved in place, plot facts re-measured, neighbours
within 120 m reported, then minor routes, waterways, hostility measure and
studio exports re-run). A full re-solve with the pins inside the greedy
solver moved 106 other records, some by kilometres, so pins are applied
*after* the solve (`macro_plot.pin_overrides`) and the committed plot stays
byte-reproducible. Major-city anchors keep the owner's dot. (2) Blueprints
show the **actual footprint** of each piece (convex hull of the lowest 1.5 m
of the kit mesh, `pipeline/measure_footprints.py` → `<kit>.footprints.json`)
and every building's **orientation is authored with a reason**: parcels are
`centreUV` + `assetRef` + `yawDeg` + `orientationWhy` (+ optional uniform
`scale` for natural pieces), the footprint polygon is DERIVED and the
validator rejects a hand-edited or unexplained one. Doors must sit on the
edge they claim. (3) Review happens in an **interactive view**: World Studio
`?bp=1&blueprint=<slug>` (zoom, pan, hover, click for the why, layers,
labels only when zoomed; export with `worldgen.export_blueprints`). Static
PNGs remain a by-product. (4) **Sourcing gaps are jobs**: both Part 6 gaps
were filled from the vault the same day (the Tropical Skyrim
`anvilgianttrunk` column at ~0.45 scale for trunk rings; HTBM xanmeer
totems for the underwater shrine), and a sourcing-gap register with a
status column now lives in `docs/research/placement-settlements/settlement-kit-sourcing-log.md`.
(5) The workflow itself is recorded in **module 96, the placement
playbook** (loop, write-back rule, lessons per round, automation-readiness
checklist); process steers go there, taste steers stay in the ledger below.
(6) Text: the construction the owner named ("ground the surrounding tribes
leave alone") is a **zero relative clause**; banned on every surface with
the soft-idiom class ("leave alone", "put up with"), style guide §2.8 rules
8–9, linter `zero-relative` (precise heuristic) + `soft-idiom`; three agents
cleared the 127 hits and ~80 more found by reading.

**Delivery.** All five blueprints re-authored against the new parcel
schema and compiling clean (Lilmoth 42 placements, 37 of 39 buildings off the
compass axes, each with a reason; Nine-Trunks redrafted as nine sourced trunk
columns at 0.45 scale with eight mud huts in the gaps and the gate in the
ninth; Mazzatun's courses along the risers, five pieces dropped because their
measured hulls sit metres from their pivots; the Licensed Stage's scaffold
moved to stilts once its real Δ read 2.27 m). A third gap surfaced and is
registered OPEN (G3, a nailed notice/licence board — every toll post and
price list needs one). Blueprint prose is now linted like place prose and
went through a separate text-review agent.

**Root cause found on the way.** Kit GLB node names were truncated at
Blender's 63-character limit, so 234 of 839 kit pieces shared a node name
with another and could not be measured individually; fixed with short unique
node names in `build_kit.py`, all thirteen kits rebuilt.

### Part 4 step 2, round 4 — touchpoint ③ feedback, second list (2026-09-04)

**Rulings.** (1) Over-use is a *body-of-text* problem: *the only / the one /
nobody / no one / anyone / everyone / nothing / everything / anything /
always* are counted province-wide by the linter (`generaliser` class,
ceiling 4 per 1,000 words for the whole run and per scope, max 2 per record,
"ask anyone" banned outright) over places, quest rows and the text catalogue;
the fix is to tie each beat to the place (a role, a name, a number, a
direction, the goods) and to vary the fix. Result: 13.5 → ≈1 per 1,000
words province-wide. Set-level convergence is now mechanical too
(`duplicate-field` hard, `stock-phrase` soft: the same 7-word run on ≥6
records). (2) **A place whose identity is a role in the network sits where the
role exists or is cut** — never moved somewhere it makes no sense (the
western gate, "The Last Post", now sits on the Blackwood Road's last cut;
a reserve-grade lair that had taken the road end was sent inland). Two records
cut this way (`dunmer-north.the-pass-station`,
`naga-kur-deeps.bone-carriers-camp-deeps`), their quests re-anchored.
(3) Minor roads are paths: clearance corridors widened (track 10/7 m, footpath
6/3.5 m) and the herb layer trodden to 8 %. (4) Hostility: fewer fights on
routes, more off them — the travel measure now walks roads, lanes and cart
tracks only (a footpath exists because of the place it reaches); crowded
route-side fights listed and thinned (conversions to neutral/guarded where
the identity is the road, typed moves off-route otherwise); seven new
off-route D3/D4 hostile places authored into measured gaps and four promoted
from the reserve; soft ceilings raised ~8 %. (5) Thorn keeps the Hlaalu kit
(its `assetPlan` said Telvanni; corrected). (6) The quest total (715) is the
larger province, not creep: Morrowind's ~20 quests/km² on our 37 km² of land
is 550–740; the old 450–550 took the bottom of the band. Targets corrected in
quests 00 and the research doc.

**Tool changes.** `sitingPrefs.nearPoint.maxM` is widened ×2 in the homeless
batch so a too-tight typed point degrades to "near", never to "nowhere".
Off-route gaps are measured at 350 m from any fight and 320 m from the main
network. A text agent ran `git checkout` on a region file mid-round and lost
an uncommitted structural pass; it was re-applied from the pass's own report,
and the briefs now forbid checkout/stash/reset outright.

**Part 5 proposal** written: [phase11-part5-exemplar-proposal.md]
(phase11-part5-exemplar-proposal.md) — Alten Corimont
(recommended) or Helstrom as the city, plus Nine Bends, Keel-Sakka Landing,
The Charged Pond, The Standing Corner and Fort Swampmoth. Owner picks.

### Part 4 step 2, round 3 — touchpoint ③ feedback (2026-09-04)

The owner's third feedback list, and what was done. Committed in four parts
(0e7f0cc studio/tooling/docs; ef7dc99 vault; 4042d95 wave 1; the wave-2 text
commit). Detail for future agents:

**Rulings recorded this round.** (1) *Frequency, not share*: the player should
meet hostility at least as often as in Morrowind everywhere, with the danger
band setting the difficulty of what is met, and the frequency varying by place
(less near cities, more on the road and in the wilds). Measured by
`worldgen.hostility_frequency`: by travel we already exceed Morrowind (a fight
every ~100–140 m of route in D3–D5 against ~350 m); by area D3–D4 sit under
Morrowind's ~15 hostile places/km² (10.0 and 8.4). The fix was targeted at the
report's gap points (land > 450 m from any fight) — six records — not padding;
roaming creatures and encounter sockets (Phase 13) add to every band on top of
this floor. The remaining area shortfall is a Phase 13 question, and the place
ceiling (596) is the reason not to close it with places. (2) *Geometry, never
labels* for placement (Parts 6–8 rule above; CLAUDE.md). (3) Underwater set
dressing is **built** in Phase 9's swim slice (world 95 / 65). (4) Text bans
extended (quests 60 §45e.1) and the flat and-pair diagnosed (style guide
§2.6); rewrites are seeded from real Morrowind text (§2.7); a mechanical
linter is now the floor under review and an `npm test` gate.

**Studio.** Quest grouping chips (main / each faction / other lines / minor /
any / none) from `questLinks` resolved against the quest registry; a plain
"quests" section replaces the opaque tier-ownership line; travel destinations
click through; an `interiorScope` line says how many interiors a settlement
really has; road/lane/track/channel clicks work (the places SVG had been
swallowing them); the painted route rasters are hidden under the places layer
(the "duplicated roads"); the minor waterways bundle's `channels` key is read;
the walk-mode minimap carries places, roads, lanes, tracks and channels and the
same minimap now sits in fly mode. Minor roads paint two texels wide and are
exempt from the control-map blur that had erased them.

**Plot.** Typed siting: `sitingPrefs.boundTo {place, maxM}`, `sightlineTo`,
`nearPoint {x, z, maxM}` — the fifteen move-a-dot asks of the co-design pass
had been prose the plotter never read (the boss ground sat 1.1 km from the
Lost City; now 61 m, reached through it). "On the road" is enforced
(220 m strict / 380 m relaxed). References that fell into the homeless batch
are waited for. `terrainRequests` lets a record ask Part 6 for the ground its
identity needs (a sinkhole for the Black Eye) instead of rewriting the place.

**Found.** The round-2 rebalance had re-deferred six quest-required records,
including the Archon lighthouse (MQ14, tier 0), which had in fact never been
promoted; all promoted, and `worldgen.quests --check` now fails on any
provision held only by deferred records.

**Quests as data.** `world/sources/quests/` (lines + per-packet files, one
`local-<region>.json` per region) is the source; `registries/quests.json` and
`docs/quests/index/*.md` are generated; `--sync` writes `tierOwnership` back
onto places. Wave 1 authored **525 skeleton rows** (715 total) so every live
settlement sits at the floor of its Morrowind band (M5 35, M4 10, M3 3, M2 1);
PP13 struck (absorbed by LD47), the rest kept as concepts. The demand ladder
sums to 587–1224 against the 450–550 province target: read the bands as
ceilings and the total as the floor.

**Vault.** Three orphan boat mods registered and credited; `docks-v1`,
`watercraft-v1`, `xanmeer-interior-v1` packaged from vault pieces; the
still-unsourceable `hull-on-stocks` closed; the rigged-actor scan bug fixed
(HTBM's 30+ skeletons were invisible). No House Dres set exists in the vault
(Tamriel Rebuilt's is Morrowind-format and needs their permission) — Thorn
keeps `hlaalu-domestic` and the lore gap is recorded for an owner steer.

**Open for the owner.** The opening-hours ring (The Roll, Gang Ground at D1 on
band-3 ground) needs the danger raster carved at Part 6, not a retier; the
naga-kur-deeps culture raster covers ~3 km² for 67 records; the Thorn Dres
question above; `harmed-hist-tapped` made clearable but kept `guarded` (MR04
ground).

### Part 4 step 2, round 2 — the hostile/settlement mix rebalance (2026-09-04)

The owner's corrected target (research doc § Target, § 8b) is that at least
55–65 % of places should be hostile and clearable, as in Skyrim and Morrowind,
and that the province should hold no *more* settlement and civic fabric than
Morrowind does. The catalogue was at 43 % dungeon-or-hostile and 29 %
settlement-plus-civic. It is now **55.7 %** and **21.7 %**, with hostile
baselines on **59 %** of non-settlement records, at **557 live records** (from
576). No id was created or destroyed. 145 records had their stance rebalanced by
rule against contents they already carried; 28 low-value settlement and civic
records were converted into overrun, drowned, burnt or raider-held versions of
themselves, keeping their names and getting fully rewritten prose in their
region's register; 14 more dangerous places got an interior and a stance; 8
honest interiors were added without changing a stance; 19 pure-density
settlement and civic records were deferred with their edges parked in
`relationsReserved`. Rest cadence improved (the one D3+ delve without a rest in
range is now zero), every city keeps its core purposes and edge ring, and every
region stays inside its hard floor. Housekeeping from the text reviewers landed
in the same pass: 33 "Canon:" and "canon says" openers rewritten as plain
in-world fact (the citations were already in `sources`), four factual conflicts
fixed, the pirate freehold smithy renamed "The Chimney" in the sailor's-shorthand
register, and the Xi-Tsei siting rationale moved out of `why.founding` into a new
`sitingNote` field. Two tool bugs were root-caused rather than patched around:
`macro_plot`'s hostile-clustering rule was a fixed count calibrated for the old
mix and is now a share rule, and `compile_minor_routes` now refuses to start a
footpath at a land cell further than `SNAP_M` from a water-sited record. Count
bands re-derived; `npm test`, `npm run typecheck` and the worldgen suite green.

### Batch reconciliation round (2026-09-07)

Four concurrent batches — entrance/front derivation, typed player purposes,
tool defects, `enclosure-v1` — were reconciled into one green tree. What came
out of it, as lessons rather than a changelog:

- **The committed plot is not stable under a water rebuild.** The Phase P water
  rescue filled 298 pools and re-carved the channels, and 28 plotted records now
  fail their own siting gate: twelve dry places stand in 1.1–4.6 m of standing
  water, six "submerged" places sit in under the 0.8 m the gate wants, three
  binds and two sightlines broke. They are pinned in `macro_plot.RESITE_PINS`
  with a reason each and kept on their committed dot, because moving them
  mid-water-pass moves them twice and strands the blueprints, routes and quests
  built on the plot. **They are a backlog for the owner-approved re-plot, not a
  closed item** — each needs a decision to move the dot or to re-write the
  record's identity to match the water it now stands in.
- **A derived rule may not overwrite an authored one silently.** The front pass
  turned Mazzatun's two gates off square to the roads they span, which the
  network stitch then rejected; the prose still described the old bearing. A
  piece that carries BOTH a derived front and a hard geometric contract (a gate
  stands across its road) must be held to the contract first.
- **`playerPurpose[].note` is a design-voice record, like `why.playerPurpose`.**
  The prose linter now scopes it, and exempts it from the canon-marker rule on
  the same grounds: nobody in the game reads it, so it may name the player.
- **A kit is not the place for a piece whose door nobody has mined.**
  `enclosure-v1` shipped the newcastle guardhouse and its loose door; the door
  is authored at its own origin in the middle of the guardhouse's plan and no
  cell in the placement mine places the pair, so the composite would have been a
  guess. Both pieces are out of the kit and the gap is recorded in the sourcing
  log. `enclosure-v1` is now named per culture in module 97 Part F and admitted
  to the `imperial`, `dunmer-hlaalu` and `neutral-works` kit sets.
- **A brief's premise is checked against the record.** The batch brief called
  Mazzatun "a Dunmer-run stone works"; it is Xit-Xaht, an Argonian tribe. The
  Redoran gate is still the right piece, because the only Argonian enclosure
  piece in the vault clears 1.72 m — a footpath, not the cart ways these gates
  carry — and because the record already says the Xit-Xaht raid their Dunmer
  neighbours. The reason written into the blueprint is that one, not the
  brief's.

Mazzatun's compile went from 7 errors to 0 (gates squared and re-placed, the
works store moved off a 1.3 m slot between two pens, the two stairs declared
`worksWith`). Lilmoth's design record was reconciled to its JSON (seven
districts, 61 parcels, 17 sockets, the whole yaw column, the C7 deviation
closed). `npm test`, `npm run typecheck`, the worldgen suite (453) and the
asset-pipeline suite (111) are green; `lint_prose --strict` exits 0.

