# Module 97 — Placement principles (BINDING)

> One coherent set of rules for deciding where a place sits and how it is laid
> out, from the province down to the door. Synthesised 2026-09-05 from the
> measured evidence, the source review, the lore dossiers and the owner's
> rulings to date; presented to the owner for a sense check (the closing list).
> [Module 96](96-placement-playbook.md) is the *procedure* that applies these
> rules; decision [0041](../decisions/0041-phase11-settlement-decisions.md)
> holds the round records and the Taste ledger; the research documents hold
> the evidence. This module holds the rules and says what enforces each one.
> When a rule here and a tool disagree, the tool is wrong until the owner
> rules otherwise; when a rule here and the Taste ledger disagree, the ledger
> is newer and this module is corrected in the same change.

**How each rule is written.** A one-line statement; the why; evidence tags;
enforcement. Tags: **E** measured evidence
([settlement-form-evidence](../research/settlement-form-evidence.md),
[shipped-world-placement-rules](../research/shipped-world-placement-rules.md),
[vegetation-composition-rules](../research/vegetation-composition-rules.md));
**S** source review
([settlement-design-principles-sources](../research/settlement-design-principles-sources.md),
[openworld-place-distribution-and-siting](../research/openworld-place-distribution-and-siting.md),
[openworld-approach-and-wayfinding](../research/openworld-approach-and-wayfinding.md),
[marsh-settlement-morphology](../research/marsh-settlement-morphology.md),
[kit-level-design-and-layout-generation](../research/kit-level-design-and-layout-generation.md));
**O** owner ruling with date (0041, CLAUDE.md, module 96); **L** lore
([material-culture](../../world/sources/lore/topics/material-culture.md),
[settlement-register](../../world/sources/lore/extrapolation/settlement-register.md),
[92-demographics](92-demographics.md)); **R** reasoning where evidence is
silent or conflicts. **Enforced by** names the validator rule, compiler check,
router cost, checklist item, reviewer or owner round that catches a breach;
**ENFORCEMENT GAP** means nothing does yet; the gap is then listed in §G
with the smallest mechanism that would close it.

Scales: **A** province → place (the macro plot), **B** place → ground (the
meso siting), **C** ground → layout (the blueprint), **D** the walking player,
**E** integration and honesty, **F** the culture grammars.

---

## Part A — Province → place (macro)

**A1. Every place records a site reason and a situation reason; its size
follows the situation.** Site is the ground it stands on (a dry point, a
crossing, a shelf); situation is its position in the network (on a road, at a
confluence, at the head of navigation). A hamlet on a superb site stays a
hamlet if nothing passes it. *S* (site vs situation, geographyfieldwork); *O*
00-core rule 1 (causal reason); *L* settlement-register §1 (scale
in structures, calibrated to the lore's relative sizes). **Enforced by** the
catalogue's required `why` block and `sitingPrefs` (site), `relations` and
`travelStation` (situation), `worldgen.audit_place_semantics`; the magnitude
ladder in `test_catalogue.py`. The size-follows-situation clause is a reviewer
check (owner rounds) — see G1.

**A2. Site types map onto our landforms; in a marsh the dry point is the
settlement.** Bridging point → the narrows and fords (`crossing` transit
types); confluence → route junctions and river-mouth ports; dry point →
`flood-high`, `raised hammock`, `ridge-end`; defensive spur or meander →
`ridge-end`, `cliff-bench`; gap town → `saddle`. The spring-line type has no
marsh analogue: water is nowhere scarce, so firm ground takes its role, and
everything not on the dry point is field, fishery or grave. *S* (site
typology; fen-island economy); *E* (Black Marsh buildings a median 3.9 m
from standing water, one in five below the water line). **Enforced
by** `macro_plot` landform scoring (`landformClasses` ranked per type recipe; a
wrong landform scores −0.4, no landform 0.15–0.4).

**A3. Prefer ground where two or three site reasons coincide.** Real towns sit
where a dry point is also a crossing that is also the lowest navigable reach;
a place with one reason reads as arbitrary. *S*; *R*. **Enforced
by** `macro_plot.score_pair` summing landform + route + water + parent + hinterland
terms (a multi-reason site outscores a one-reason site); the meso candidate
table (B2) records each reason per candidate.

**A4. Frequency of interest is at least Morrowind's: one thing every 230–330 m
of travel, in three separate tiers.** Beacon (visible >1 km, ~0.1–0.3/km²),
destination (a place one enters, ~1–2/km², bound to the Morrowind-derived
budget), snack (10–60 s of interest, ~10–15/km², compiled
from `dressing`-scope types). A single density number is a design error because the
tiers have different pitches. *S* (BotW/Skyrim/Vvardenfell converge on a
60–100 s constant); *O* 2026-09-03 (Morrowind density, 527 → ~560 live); *O*
2026-09-04 (hostility met at least as often as in Morrowind; frequency, not
share). **Enforced by** per-zone budgets in `test_catalogue.py` (soft
ceilings, hard floors); `worldgen.hostility_frequency` (travel measure: a
fight every 100–140 m of route in D3–D5); `macro_plot` layers (`landmark` /
`destination` / `fine-tempo` route bands). The snack tier's compile is Phase
15 — G2.

**A5. Density is a causal gradient, not a spread: thick on hinterlands,
roads, rivers, coasts and resources; thin and meaningful in the deep wilds.**
Cluster centres by minimum separation, members within a cluster clumped; even
spacing alone reads procedural. *E* (hand placement is clustered, Clark–Evans
R ≈ 0.5); *S*; *O* 2026-09-02. **Enforced by** `macro_plot` hinterland term
(0.6 within 1.2 km of a city), city rings, the roadside lattice (110 m step,
35/90 m offsets) and `SEPARATION_M`; the coverage report
`world/sources/sites/macro-plot.md`. Within-cluster clumping is approximated
by the lattice, not modelled — G3.

**A6. Spacing and repetition are bounded by magnitude and by sight.** Minimum
centre separation M5 800 m · M4 450 · M3 300 · M2 220 · M1 150; the same type
never twice within 300 m (700 m for landmarks) and never twice in sight; no
template above ~25 % of its family in a region; two instances of one template
within 2 km differ on ≥3 axes; the same purpose not twice within 500 m
along one road. *S* (anti-sameyness); *O* 0041 Part 3; *E* (the scour: median site
sees 18 % of its 1.2 km surroundings, so marsh "in sight" is short).
**Enforced by** `macro_plot` constants (`SEPARATION_M`, `SAME_TYPE_MIN_M`,
`PURPOSE_REPEAT_*`) and its quota report. The ≥3-axes rule is reported, not
gated — G4.

**A7. Danger is fixed by place and region and shapes what may sit where.**
Lived-in classes sit within ±1 band of their ground, others ±2; D5 never
within 200 m of a road unless its identity is the road; a city's edge (≤350 m)
holds only wards, docks, works, shrines, gates; its hinterland (≤1.2 km) holds
no hostile place and no D4+ lair; unrelated hostile places do not exceed a 70
% share of any 800 m neighbourhood; fights sit off routes more than on them.
*O* 00-core rule 2; *O* 2026-09-03/04 (rings, frequency by place). **Enforced
by** `macro_plot` danger gate, `ring_fit`, `HOSTILE_CLUSTER_*`,
`D5_MIN_ROUTE_M`; `hostility_frequency` gap report.

**A8. A place whose identity is a network role sits where the role exists or
is cut.** "On the road" means ≤220 m from a route (380 relaxed); a gate sits
on the last cut of its road; a port sits on navigable water; a ferry stage
sits on both banks' reach. Boat lanes are a real network with stations, not
decoration. *O* 2026-09-04 (round 4 rule 2; boat lanes ruling 2026-09-03); *S*
(lowest bridging point = the port site, at most one per river). **Enforced
by** `macro_plot` `on_route` gate, `sightlineTo`/`boundTo` hard constraints,
`SATELLITE_MAX_M`; the route registry and `travelStation` graph checks;
`compile_minor_routes` refusing a footpath start far from a water-sited
record. Navigable depth is checked at meso (B5), not here — G5.

**A9. Water first: the waterline, not the road, is the marsh's organising
line.** Water-bound classes score water relation; settlements in wet region
classes face water; the road network is secondary and may be flood-damaged,
bridged or ferried, but it always links the eight majors. *E* (BM median 3.9 m
to water vs Skyrim 51 m; only 6 % of BM buildings within 10 m of a road); *O*
00-core rule 3 and acceptance rules. **Enforced by** `macro_plot`
`water`/`navigable`/`submerged` terms; `compile_society` road connectivity;
minor waterways compile.

**A10. The province carries at least Morrowind's share of hostile, clearable
places (≥55 %) and fewer settlement and civic records (≤22 %).** Black Marsh
is wild, not a unified state. *O* 2026-09-04 (correcting the research doc's
earlier cap); *S* (Morrowind 55–65 % clearable, ~8–14 % settlements).
**Enforced by** the round-2 rebalance record (55.7 % / 21.7 %); the shares are
reported by `hostility_frequency`, not gated — G6.

**A11. Minorities are enclaves with a stated exception.** Imperial records
cluster on Gideon, Dunmer on Thorn and Stormhold; an outlier carries its
personal reason in `why`. *L* 92 §82 (community priors; Helstrom 97 %
Argonian); *O* 2026-09-03. **Enforced by** `macro_plot` culture-zone gate
(hard; ≤350 m spill when relaxed).

**A12. The plot is provisional; the meso pass may move a place 60–150 m
on measurement and must write the move back.** Four of five Part 6 exemplars
could not stand on their dot. *O* 2026-09-05 (write-back rule). **Enforced
by** `worldgen.apply_sitings` (sole writer of `macro-plot-overrides.json`;
pins applied after the solve; dependants re-run).

---

## Part B — Place → ground (meso)

**B1. No design before a dossier.** The site dossier over the plotted
neighbourhood is cited in the design record and in `siting.dossier`. *O*
module 96 step 2. **Enforced by** the blueprint validator when `siting` is
present (≥2 candidates, one chosen). `siting` is REQUIRED on any blueprint of a catalogue record (G7 closed).

**B2. Two or three exact candidates are measured; the winner is chosen in this
order of grounds.** (1) The identity's physical requirement — the water depth
a lighter port needs, the standing water a pond lair needs, the ridge end a
stone village needs; a candidate that would quietly delete the place's living
is rejected however good its ground. (2) Buildable tiers within the footprint
ring (height over the ring, slope at each bench). (3) Route tie-in without a
new spur. (4) Approach and reveal (Part D). (5) Neighbours' sightlines and the
write-back cost. Losers are recorded with the ground on which they lost. *O*
2026-09-04 (geometry, never labels); Lilmoth record §1 (the east face won
on depth, tiers and reveal). **Enforced by** the validator
(`candidates[].rejectedBecause`); the design record; owner Round A.

**B3. The slope ladder: the building is fixed and the ground meets it,
within limits.** Δ across the footprint: <0.15 m place direct · 0.15–0.6 plinth ·
0.6–2.0 graded pad from the **maximum** height, falloff ring 2.5× the
footprint, rim ≤30°, residual tilt 0.7°, base buried 0.25 m · ≥2.0 m never
graded: stilt, dug-in or re-site. Verticals (plinths, piles, retaining walls)
are geometry, not terrain. *S* (CK practice; Houdini flatten; DynDOLOD
failures); *O* 0041 § Slopes. **Enforced by** `compile_settlement`
(`FIT_MIN`/`FIT_MAX`, `BURY_M`, `PAD_FALLOFF_RATIO`, `PAD_RESIDUAL_TILT_DEG`;
the compiler relaxes only *down* the ladder).

**B4. The flood line decides the section: civic and sacred on the ground that
stays dry, dwellings on the levee or the bench, works and quays in the flood
band; in stilt districts 15–30 % of buildings stand over water.** Floors sit
above the highest seasonal water; piles reach the bed, not the surface. A
graded pad of 1–2 m is legitimate only as a *mound* under a mud village
on flat saltmarsh (the terp form), because there the pad *is* the vernacular;
everywhere else Δ ≥ 2 m means stilts or re-siting. *S* (Denevan bluff model;
Tonlé Sap temple on the one dry spot; terps 1–2 m for a farm, raised
over time); *E* (18.3 % of BM buildings stand over water; 5 % in Skyrim); *L*
material-culture (Murkmire platforms ascend over water; Imperial houses on the
same soil sank). **Enforced by** `docks[].piledToBed` (schema), `groundFit`,
`compile_settlement` door-on-land test. The highest-water check and the
over-water share are not measured — G8.

**B5. Water depth at a dock is measured, per hull class, 100 m off the quay
line.** A canoe or raft landing needs ≥0.6 m; a small-draft boat station ≥1.2
m; a keeled hull berth ≥3 m — and a place whose living depends on hulls *not*
berthing (Lilmoth's lighters) needs the shallow shelf recorded as a feature.
*L* (small-draft doctrine; Lilmoth's ships anchor out); Lilmoth record §1.
**Enforced by** the design record's candidate table only — G9.

**B6. The approach is designed at meso, before geometry.** The chosen
candidate must offer a first-seen object taller than the vegetation on the
sightline and a final 200–400 m that bends at least twice; features that make
the approach (a mangrove wall, a reed fringe) are marked `kept`. *S* (chained
reveal; local contrast); *O* 2026-09-05 (judged from the ground). **Enforced
by** `approaches[]` required (≥1; ≥2 for M3+) and the 16-item checklist in the
design record (manual). Sightline heights are computed over bare terrain and reported against the palette canopy (G10 part-closed).

**B7. A place whose identity needs ground the plot lacks asks for it rather
than pretending.** `terrainRequests` (a sinkhole, a pool, a rock shelf) is a
Part 6 carving job with a why, not a rewrite of the place into something the
ground happens to allow; the prose does not claim ground that is absent. *O*
2026-09-04; engineering standard 12. **Enforced by** the catalogue field and
the design record's "catalogue should change" list; the carve is a compile job
— G11.

**B8. A move is written back; a move over 150 m is reviewed against its
neighbours and its role.** *O* 2026-09-05. **Enforced by** `apply_sitings`
(incremental move, neighbours within `NEIGHBOUR_WARN_M` reported, minor
routes/waterways/hostility/exports re-run).

---

## Part C — Ground → layout (micro)

**C1. A district is one plan unit and one kit set; seams between districts
stay visible; cultures layer and never blend.** Imperial ashlar below,
Argonian work above, stacked; the two Argonian coastal kits do not share a
settlement without a stated founding reason; the interior root kit admits no
reed, no stilt over open water, no wattle. *S* (Conzen plan units; Venice
parish cells vs Amsterdam regulated plots — mixing two water grammars in one
town reads as incoherence); *E* (vanilla mixes kits in 29 % of settlements,
the mod sets in 61–76 % — we follow vanilla); *L* material-culture "three
kits, never blend"; *O* CLAUDE.md kits rule. **Enforced
by** `blueprint.KIT_SETS` (one set per district, validator), `assetConstraints`
bans, the interiors index culture check.

**C2. The plan unit is chosen by culture (the grammars are tabulated in Part
F).** Argonian stilt: one boardwalk spine along the shelf, decks as nodes,
dwellings hung off it, deliberately non-gridded, the Hist on the one high
spot, markets as decks. Argonian mud: a compact cluster on the dry point or
mound, huts facing an open common with the Hist, the clay oven the only
masonry, fields and fish-parks outside, causeway access. Argonian root: the
trees are the plan; passerelle runs follow the kit's own length/rise grammar;
vertical; nothing over open water. Imperial: planted, surveyed straight, a
rectangular market at the T of the through roads, plots with their frontage
on the street, visibly subsiding where it meets marsh soil. Dunmer Hlaalu: status
climbs uphill from the water edge, manors up, plantation grids below, walled
compounds off organic lanes. Works: the layout alone says the trade; fouling
trades downstream and downwind. *S* (Kampong Ayer, Ganvié, Malay kampung,
terps, bastides, Balmora, medieval edge ordinances); *L* material-culture,
settlement-register. **Enforced by** district `kind` + `cultureKit`; `routing`
on ways (Imperial `straight`, Argonian `terrain`); reviewer against Part F;
owner rounds (cities always).

**C3. One spine, at most three secondary ways per district, back lanes and
alleys behind them; four tiers at most; the spine is measurably wider.** The widths
are road/spine 4.3 m (the measured road-piece median in both Skyrim and BM&V),
track 2.5 m, footpath 1.2 m, boardwalk and pier at the kit piece's width; no
passage narrower than two character widths (~1.3 m). Two ways of equal width
between the same two nodes are one path drawn twice. *E* (road piece width p50
4.34 m); *S* (high street → cross street → back lane → alley; width reads
as rank; 128-unit character, two-widths minimum). **Enforced
by** `blueprint_integration` `way-overlap`; `street_router` `NEIGHBOUR_PENALTY`;
the painted route rasters (track 2.5 m, path 1.2 m). The width classes are reported and the 1.3 m
passage is checked (G12 closed).

**C4. The centre is a shape on the spine, not a plaza: for Argonians the Hist
court (a tree with cleared ground the settlement bends round); for Imperials
the rectangular market at the first junction inside the gate; for Dunmer a
riverside or terrace forecourt.** Commerce sits at the first node inside the
threshold, on the most integrated line, because configuration draws movement
before attractors do; the Argonian market is a deck between gate and Hist,
never at the Hist. *S* (market shape = plan; space syntax natural movement;
Bethesda "market at the first junction inside the gate"); *L* (each village
has its Hist; tree-minder arbitrates). **Enforced by** checklist items 6 and
9; `clearance.kept` for the tree; reviewer — G13 for a mechanical "first node
is a market/deck" check.

**C5. Nearest-neighbour spacing is a legibility constant: p50 13–16 m
between building centres in every culture and size, p10 not under 8 m; attachments
(`stacksOn`, a way that `endsAt`) are the only designed contacts.** Culture is
expressed in density, edge and orientation, not in spacing. *E* (p50 12.2–16.2
m across four sets and four size classes; p10 8.0–12.8). **Enforced
by** `blueprint_integration` `parcel-overlap` and `parcel-gap` (the 8 m floor,
with the parcel flag `abuts` + `abutsWhy` as the designed-contact exception;
G14 closed).

**C6. Density falls as the place grows: hamlets 15–33 buildings/ha, villages
7–16/ha, towns and cities 4–11/ha; growth buys radius, not tightness.** Radii:
M2 ~20–35 m, M3 ~50–75 m, M4 ~75–120 m, M5 100–225 m. *E* (density and radius
by size class); *L* settlement-register (M3 12–35 structures, M4 40–120, M5
150–400; prefer many M3s to few M4s). **Enforced by** `scaleGrounding` (parcel
count within ±25 % of `buildingsPlanned`); the density band is reported
by the compile warnings (G15 closed, warn-grade).

**C7. The building mix follows the magnitude ladder and lore, not the mined
family shares.** Every M3+ has its Hist or substitute, an egg-tending place
(uxith), the office-holders' lodges and a defensible approach; M4 adds one
specialism and an outsider presence; M5 adds districts, a market, guild or
office buildings and a foreign quarter. Rough shares by `use`: dwellings 60–70
%, work 15–25 %, civic and sacred 5–10 %, storage 5–10 % (hamlets run
storage-heavy: sheds and racks). *E* (the mined family mix is 46–85 %
unclassified and is therefore not adopted); *L* settlement-register §1,
material-culture offices. **Enforced by** the catalogue's socket list and
`scaleGrounding.why`; reviewer; the `use` histogram is reported at compile (G16 closed, warn-grade).

**C8. Every building is oriented with a reason, in this order of grounds: door
to a way; long axis along the contour where Δ would otherwise climb the
ladder; front to the water for stilt and quay pieces; front to the common or
the Hist; a climate or ritual reason only where lore supports it.** Not
compass-aligned by default; within a district no more than a tenth of parcels
share a yaw within 5°, because a uniform yaw reads as copy-paste. *E* (yaw
against the contour is indistinguishable from uniform in all four sets, so no
shipped contour convention exists to copy; the sources under-randomise yaw);
*S* (Malay long-axis rule is culture-mediated, not climatic in practice —
noted, not adopted); *O* 2026-09-05 (`yawDeg` + `orientationWhy` required;
axis-aligned squares are not a layout). **Enforced by** the validator
(`yawDeg`, `orientationWhy` required; footprint derived). Yaw diversity is checked per district, with `routing: "straight"` as the
grid-culture exception (G17 closed).

**C9. Every door opens onto a way, within 4 m of its centreline; every socket,
service or named building presents that door to the way a player walks.** The
measured convention (53–57 % of entrances on the road side) is too weak for a
marker-free game, so ours is total. *E*; *S* (Morrowind's diegetic direction);
*O* 2026-09-05. **Enforced by** `blueprint_integration` `door-to-way`; door
`facingDeg` against the footprint edge (±100°) and the measured doorway
(±45°); checklist item 10.

**C10. Enclosure is cultural and rare: Argonian places have none but pens and
totem lines — the water, the reed edge and the clearance ring are their edge;
Imperial places wall the gate and fence yards and fields; Dunmer compounds
wall themselves.** *E* (enclosure pieces within 15 m: p50 0 in every set, p90
2 in Skyrim, 0 in the marsh sets — partly by absence of pieces); *L* (Helstrom
defended by marsh and grove, not works; totems everywhere). **Enforced
by** `fences[]` kinds and the reviewer; checklist item 13 (the edge reads
from inside as well as outside).

**C11. Kit purity is per district and a piece is chosen on its measured
geometry; a piece whose hull is not attributable to its pivot is dropped.**
*O* 2026-09-04/05; module 96 lessons. **Enforced by** `assetRef` +
`<kit>.footprints.json`, `nodeAmbiguous` flags, the pivot-offset drop.

**C12. Outdoor dressing is authored per use, above Bethesda's median and below
its long tail; it varies.** Within 10 m of a lived-in dwelling 3–6 pieces
(racks, canoes, mats, jars, totems, chimes at the threshold); a works site
6–12 (the layout and the props *are* the trade, since no machinery props
exist); a ruin or abandoned place 1–3 plus decay; a camp 4–8 around the fire
with the loot cached away from it. Repeated detail is noticed before repeated
architecture, so the vocabulary rotates within a district. *E* (Skyrim p50 2,
p90 19 within 10 m; the mod sets 0 — an unfinished world, not a target); *S*
(GDC 2013 detail-repetition finding; five-slot recipe); *L* material-culture
prop brief. **Enforced by** nothing yet — the outdoor dressing pass does not
exist (G18).

**C13. Vegetation meets buildings as a graded field, not a line.** Hard
clearance is the footprint union dilated by a jittered offset; a thinned ring
of 5–15 m; per-channel falloff radii differ (ground material 8 m, vegetation
15 m, terrain 25 m); deliberate plantings are kept inside the clearing (the
Hist, a shade tree, a reed bed at the piles); a farm's field has a hard edge,
a camp's a soft one; attachment species are not free-standing. *E*
(waterline is the densest band; composition rules C1–C5); *S*; *O* 0041 §
Slopes. **Enforced by** the `clearance` block (`hardClear`/`thinned`/`kept`)
consumed by `compile_scatter`; route corridor clearance in `routes_raster`.

**C14. Verticality carries its own ascent: every raised deck has its stair,
ramp or ladder visible from the node below; ramps run ≤30°; a passerelle run
is a sum of the kit's own lengths and rises.** *S* (Bethesda 30–45°
for animation, 60° AI ceiling); kit `snapLogic` (settlement-root
`passl<len>h<rise>`, `stockadescaffold` base/top side counts). **Enforced
by** `compile_settlement` door slope ≤30° on a 2 m gradient; checklist item 12; the
snap grammar is prose in the kit config — G19.

**C15. The Hist is not cleared, built over or moved; the settlement bends
around it; its minders face it.** *L* (each xanmeer housed its tribe's Hist;
the tree-minder office; Lilmoth's third Hist); *O* Round B steer list (Hist
prominence). **Enforced by** `clearance.kept` kind `hist-tree`; reviewer.

---

## Part D — The walking player

**D1. Every M3+ place has at least two designed approaches; each names one
first-seen object, a sequence of three to five beats with at least one
occlusion, plus a final stretch that bends twice.** *S* (weenie; chained
reveal; S-curve); *O* 2026-09-05. **Enforced by** the validator
(`approaches[]` count, `firstSeen` a real id); the checklist items 1–5
(manual).

**D2. The first-seen object is taller than the canopy on its sightline, and
in the marsh it is lit.** Under a closed canopy at dusk light is the only cue
with range; a 9 m beacon under 14 m trees does not exist. One beacon, one or
two mid-place markers at decision points, no rival to the beacon. *S*
(signposting ladder: light ~40 %, sound ~15 %; local contrast); *E* (the
scour: nothing 12 m tall reads at 1.4 km). **Enforced by** checklist items 3
and 9; the type recipes' cue slot (tall / close / lit / audible). The compiler
now runs a bare-terrain line of sight from the approach's first waypoint and
reports the piece's height against the region palette's canopy (G10
part-closed; the ray itself carries no canopy).

**D3. The threshold is spanned, not passed.** A gate, arch or bridge stands
across its way. *S* (Totten; Bethesda gates); *O* 2026-09-05. **Enforced
by** `blueprint_integration` `gate-spans`.

**D4. Wayfinding runs gate → first node → spine → seat; the seat differs
by culture.** Imperial and Dunmer places put authority high and enter it last
(the measured Nordic convention: tallest building at elevation rank 0.67);
Argonian places do not (rank 0.25 — the Hist stands where it grew and the
beacon is often a rim feature, offset 0.65 of the radius from the centre).
From the arrival point the first node is visible or a landmark stands at the
bend that hides it. *E* (elevation rank; centre offset); *S* (Bethesda
conventions; Balmora; Ald'ruhn). **Enforced by** checklist items 6 and 9;
reviewer.

**D5. The door one wants is visible from the way one walks.** *O*; *S*.
**Enforced by** `door-to-way` and checklist item 10.

**D6. A dead end pays or is cut.** A way's `endsAt` names a parcel, dock or
landmark; what it reaches is recorded as a player purpose. *S*. **Enforced
by** `endsAt` (schema) and checklist item 11 — the "pays" half is a reviewer
judgement.

**D7. Scale does not lie.** Building count within ±25 % of the lore-derived
plan; the record names the lore source for the population. *O* 2026-09-05;
*L*. **Enforced by** `scaleGrounding` validator.

**D8. Metrics are sized against the character: 1.83 m tall, passages ≥ two
widths (~1.3 m), walking ways ≤30°, no player-climbed slope over 45°, 60° the
AI ceiling.** *S* (GDC 2013). **Enforced by** `compile_settlement` door slope;
`street_router` `K_SLOPE`/`K_CROSS` (a steep line costs more than a detour).
Passage width is G12.

**D9. Every M3+ place has at least one combat space with its clearance class
and a why, even where it is safe.** A hostility flip, a night attack or a
quest will use it; critical animations need the room. *O* 00-core acceptance
(combat spaces and critical-animation clearance validated); module 75.
**Enforced by** the `combatSpaces[]` schema; it is in the validator's
REQUIRED list, each space carrying a boundary, a clearance class and a why
(G20 closed).

**D10. From any point on a road or shore, one to three destination- or
beacon-tier objects are visible; none is a dead world and four is a chore
list.** *S* (BotW gravity, two-visible rule). **Enforced by** `macro_plot`'s
route-visibility sweep (report only).

**D11. Effort is paid where it ends: a climb at the summit, a swim at the
island, a forced detour with a view or a find.** *S* (denial and reward).
**Enforced by** checklist item 16; `playerPurpose` on the record.

---

## Part E — Integration and honesty

**E1. Layers integrate or the compile fails.** The six checks: a way touches a
parcel only where it `endsAt` it; two ways of one class do not run twice;
parcels do not overlap; a gate spans its way; every door is within 4 m of a
way; a canal lies in water and a road fords at most 12 m. *O* 2026-09-05.
**Enforced by** `blueprint_integration` inside `compile_settlement`.

**E2. Geometry, never labels.** Footprints are the measured ground hull;
`points` are routed over the real heights; a description is a search key. *O*
2026-09-04. **Enforced by** `blueprint_footprints --apply` and `street_router
--apply` with drift checks in the validator.

**E3. Kits only combine pieces designed to combine; each kit's own combination
grammar is data the compiler obeys.** Dock systems (vanilla, Dagon Fel, HTBM
lashed-plank) are not chained across systems; `jets` pieces only finish a run
begun elsewhere; passerelle arcs chain only at one radius; scaffold decks
match their base's side count. *O* CLAUDE.md 2026-09-04. **Enforced
by** `KIT_SETS` (set level) and `assetConstraints` bans; the piece-level
`snapLogic` is prose — G19.

**E4. A sourcing gap is a job with an owner and a status, filled in the
session it is found; it is shown as a gap, not faked.** *O* 2026-09-05.
**Enforced by** the register
in [settlement-kit-sourcing-log](../research/settlement-kit-sourcing-log.md);
engineering standard 13 (playbook moves with the work).

**E5. Everything with an interior has a door; what is inside is derived
from the kit, not claimed.** *O* 2026-09-05. **Enforced by** the interiors index
(`interiors_index.py`) and the validator's door rules; standard 12.

**E6. Everything placed has a stable id and a plain-English why in the
reference register, reviewed by a separate agent.** *O* standards 2 and 12;
style guide §2.8; 0043. **Enforced by** the id registry, `why` blocks
(`MIN_WHY_CHARS`), the prose linter (npm test) and the `text-review` skill.

**E7. Derived data is not hand-edited; the exemplar is a regression fixture;
every compile is deterministic and carries provenance.** *O* standard 6;
module 40 §31. **Enforced by** drift checks, `GenerationProvenance`,
byte-stable outputs.

**E8. The budget is declared and the report is checked against it.** *O* 0041
perf contract. **Enforced by** `compile_settlement` budget report vs `budget`.

---

## Part F — Culture grammars

One row per kit set. "Never appears" is a validator or reviewer ban.

| Kit set | Where (zones) | Plan unit | Centre | Spacing p50 / density | Orientation rule | Enclosure | Water relation | Materials | Never appears |
|---|---|---|---|---|---|---|---|---|---|
| `argonian-stilt` | Murkmire, deltas, coasts: `mercantile-coast`, `saxhleel-coast`, `pirate-freeholds` (Argonian quarters) | boardwalk spine along the shelf; decks as nodes; dwellings hung off; non-gridded | Hist on the highest dry spot; market a deck between gate and Hist | 14–16 m; M3 8–16/ha, M5 4–10/ha | door to the boardwalk; front to water on the quay line; long axis along the shelf | none; totem lines, the reed edge | 15–30 % of buildings over water; floors above highest water; piles to bed | reed weave, timber piles, bark; canoes and rafts, no keels | wattle-and-daub; stone in new work; fences; keeled hulls as native craft |
| `argonian-mud` | Shadowfen and the north: `dunmer-north` Argonian villages, `hist-heartland` north edge | compact cluster on the dry point or a ≤2 m mound; huts face the common | open common with the Hist; the clay oven the one masonry | 12–14 m; M2 15–30/ha, M3 10–16/ha | front to the common; long axis along the contour on a slope | pens only; a causeway is the edge | on the dry point; fields and fish-parks flood; causeway access | wattle-and-daub over log skeleton, thatch, mud | stilt platforms over open water; reed-woven walls; stone |
| `argonian-root` | the interior: `hist-heartland`, `naga-kur-deeps` (deeps variant) | trained around trunks; passerelle runs on the kit's length/rise grammar; vertical | the grove; the tree-minder's hall a bigger version of a house | governed by trunk spacing (~15–25 m); M3 6–12/ha | door to the passerelle; front to its training trunk | none; the grove is the defence | never over open water; boardwalks cross wet ground | living root and limb, lashing, sap resin, bark shingle; deeps: cane, bog-oak, hide, bone, undressed xanmeer block | reed weave; wattle panels; stilt decks over water; quarried stone; nails |
| `argonian-stone` | xanmeer sites province-wide | stepped terraces on a 3.64 m grid; stone bridges between masses | the summit chamber (the tribe's Hist once) | n/a (monument) | grid on 90°; axis to the cardinal or to the water it managed | the terrace itself | causeways and weirs as relict works | ashlar, vakka stone | any *new* Argonian building in stone; occupation except as reuse (Naga-Kur heterodoxy, tribes as warning-keepers) |
| `imperial` | `imperial-fringe` (Gideon), `imperial-penal-south` (Blackrose), enclaves | planted grid; straight surveyed streets; plots with street frontage; fringe belt | rectangular market at the T of through roads, first junction inside the gate; keep on the high point, entered last | 12–15 m; M4 6–12/ha, M5 4–10/ha | front to the street; grid axis | walls and gate at the threshold; fenced yards and fields | on the bank or the bluff; visibly subsiding where it meets marsh soil (the lore's sinking Imperial houses) | ashlar, tile, timber frame; the keep set | organic lanes; stilts; reed |
| `dunmer-hlaalu` | `dunmer-north` (Thorn, Stormhold quarters) | organic lanes; walled compounds; status climbs uphill from the water | a riverside or terrace forecourt; manors up, entered last | 11–14 m; M4 8–14/ha | front to the lane; compound wall to the lane | compound walls | river edge through the middle (the Balmora edge); saltrice grids below | Hlaalu domestic set (no Dres set exists — recorded gap) | Telvanni forms; Argonian kits inside the compound wall |
| `neutral-works` | any zone, works types | freestanding props; layout says the trade | the working floor | by trade | to the resource (the bank, the pan, the cut) | scaffold rails only | downstream and downwind of dwellings; sluices in compiler-cut channels | vanilla props; `stockadescaffold` grammar | machinery props (none exist); a kiln, saltern or winding gear as a mesh |
| `neutral-underwater` | drowned quarters, wrecks, reefs | sparse; reads as a plan from above | the hollow a diver can enter | 6–10 structures per drowned district | to the old street plan | none | −1 to −10 m; ridges breaking the surface as the cue | Sirenroot blocks, HTBM totems, pile clusters | new Argonian building; anything not piled or ruined |

---

## G — Enforcement gaps and the smallest mechanism that closes each

Status is CLOSED (a check now enforces it, HARD = fails the compile, WARN =
reported under `warnings` and in the validator's second return value) or OPEN
(nothing enforces it yet). Every closing check names its principle id in its
message, so a failure sends the reader to one rule above.

| # | Rule | Gap | Smallest mechanism | Status |
|---|---|---|---|---|
| G1 | A1 | size-follows-situation not checked | `audit_place_semantics` rule: magnitude ≥ M4 requires ≥2 network relations or a `travelStation`  | OPEN (catalogue level) |
| G2 | A4 | snack tier not compiled | Phase 15: `compile_dressing` from `recordScope: dressing` types with per-region quotas  | OPEN (Phase 15) |
| G3 | A5 | within-cluster clumping approximated by a lattice | measure Clark–Evans R on the plot per zone and report it (target < 1)  | OPEN (macro plot) |
| G4 | A6 | ≥3-axes-differ reported, not gated | make the quota report a `test_catalogue.py` soft ceiling  | OPEN (catalogue level) |
| G5 | A8 | navigable depth for water roles checked only at meso | `macro_plot` `navigable` hint becomes a hard gate at `depth_m` ≥ the type's hull class  | OPEN (macro plot) |
| G6 | A10 | hostile/settlement shares reported only | two soft ceilings in `test_catalogue.py` (settlement+civic ≤ 22 %, hostile-or-clearable ≥ 55 %)  | OPEN (catalogue level) |
| G7 | B1 | `siting` optional | add `siting` to the validator's REQUIRED list for every blueprint of a plotted record  | **CLOSED** — `blueprint.validate_blueprint` requires `siting` on any blueprint of a catalogue record (HARD; the Part 0 fixture, compiled `--skip-catalogue`, details no record and is exempt) |
| G8 | B4 | highest seasonal water and over-water share not measured | compiler reads the flood-band raster at each footprint; reports the over-water share per district against the culture band  | OPEN (needs a flood-band raster read) |
| G9 | B5 | dock depth by hull class | `docks[].hullClass` + compiler sample of depth 100 m off the dock at the water raster  | OPEN (needs `docks[].hullClass` + a depth sample) |
| G10 | B6/D2 | first-seen height vs canopy not computed | compiler line-of-sight from each approach's start to `firstSeen` using the dossier heights + palette canopy height along the ray  | **PART-CLOSED** — `compile_settlement._first_seen_warnings` runs bare-terrain line of sight from the approach's first waypoint to the `firstSeen` piece and reports the piece's height against the region palette's measured canopy (WARN). Canopy is not in the survey, so the ray itself is bare-terrain only |
| G11 | B7 | `terrainRequests` not carved | Part 6 carve job in the chunk rebuild; validator warns while a request is unfulfilled  | OPEN (Part 6 carve job) |
| G12 | C3/D8 | spine width and 1.3 m passage not checked | integration: spine `widthM` > every other way in the blueprint; min gap between neighbouring footprints along a way ≥ 1.3 m  | **CLOSED** — `blueprint_integration` `passage` (a way between two hulls needs 1.3 m of clear gap, HARD) + width classes in `_placement_warnings` (road 4.3 m, track 2.5, path 1.2, and no rank inversion, WARN) |
| G13 | C4 | first-node-is-commerce not checked | checklist item; later an integration rule that the first `endsAt` on the spine after the `spans` parcel is a market/deck/hall `use`  | OPEN (reviewer checklist) |
| G14 | C5 | 8 m nearest-neighbour floor | integration `parcel-gap` (centre distance ≥ 8 m unless `stacksOn`)  | **CLOSED** — `blueprint_integration` `parcel-gap` (8 m between centres, HARD), with the designed-contact exceptions `stacksOn`, `spans`, enclosure `use`, and the new parcel flag `abuts` + `abutsWhy` |
| G15 | C6 | density band by magnitude | compiler report: parcels/ha of `boundary` vs the magnitude band; warning outside it  | **CLOSED (WARN)** — `blueprint._placement_warnings` 97 C6: buildings per hectare of the boundary against the size class's band, with the number |
| G16 | C7 | `use` mix | compiler report of the `use` histogram per blueprint  | **CLOSED (WARN)** — `blueprint._placement_warnings` 97 C7: the `use` histogram against the band, once ≥8 parcels are classified |
| G17 | C8 | yaw diversity | validator: ≤10 % of a district's parcels within 5° of one yaw  | **CLOSED** — `blueprint.validate_blueprint` 97 C8 (HARD): at most max(2, 10 %) of a district's parcels within ±5° of one bearing, from 8 parcels up, unless the district declares `routing: "straight"` |
| G18 | C12 | no outdoor dressing pass | `compile_settlement` dressing rule per `use` with count bands and a rotating vocabulary; report counts  | OPEN (no outdoor dressing pass) |
| G19 | C14/E3 | kit `snapLogic` is prose | per-kit connector table (`connectors.json`: entry/exit faces, lengths, rises, radii, side counts) checked when two pieces touch  | OPEN (needs `connectors.json`) |
| G20 | D9 | `combatSpaces` not required | add to REQUIRED for magnitude ≥ M3  | **CLOSED** — `combatSpaces` is in `REQUIRED`; each needs a boundary, a `clearanceClass` and a why (HARD) |

---

## Decisions for the owner's sense check

Each is a place where evidence conflicted or two options were viable. The
choice is provisional until the owner rules; a ruling goes to the 0041 Taste
ledger and this module is corrected in the same change.

1. **Orientation to the contour.** Measured: no shipped world follows the
   contour (yaw indistinguishable from uniform). Options: copy the measured
   indifference, or orient every building with a stated reason. *Chosen:*
   reasons in ranked order (door to way → contour → water → common), because
   the owner has already rejected axis-aligned squares and a marker-free game
   needs doors on ways. Contour is second, not first.
2. **One spacing constant, not one per culture.** Measured p50 is 13–16 m in
   every set and size class. *Chosen:* culture is expressed in density,
   edge, orientation and materials; spacing is held near-constant with a hard
   8 m floor. The alternative (tight Imperial rows, loose Argonian) has no
   evidence behind it.
3. **Kit mixing.** Mods mix kits in 61–76 % of settlements; vanilla in 29 %.
   *Chosen:* vanilla's discipline — one set per district, cultures layered
   district by district — because the mod figure reflects an unfinished world and the
   lore says cultures stack, never blend.
4. **Outdoor dressing density.** Bethesda p50 2 per building within 10 m
   (p90 19); the mods 0. *Chosen:* 3–6 for dwellings, 6–12 for works — above
   the median because first person notices detail, below the tail because
   repeated detail is the first thing noticed. No pass exists yet (G18).
5. **Authority on the high point.** Nordic (0.67) yes; marsh (0.25) no.
   *Chosen:* Imperial and Dunmer seats high and entered last; Argonian
   places keep the Hist where it grew and let the beacon be a rim feature.
   The alternative (every culture crowns its hill) would erase the measured
   difference between the cultures.
6. **Floodplain vs bluff.** Ribeirinho levee houses vs Denevan's bluff
   model. *Chosen:* the section rule B4 — sacred and civic on the dry ground,
   dwellings on the levee or bench, works in the flood band — and 15–30 % of stilt-district
   buildings over water (measured 18 %). The pure-bluff
   reading would put nothing on the water, against the lore.
7. **Mounds.** Terps are earth, not stilts; our ladder forbids grading
   ≥2 m. *Chosen:* a 1–2 m graded pad is permitted only as a mound under a
   mud village on flat saltmarsh; elsewhere stilts or re-site.
8. **Argonian enclosure: none.** Measured near-zero is partly an artefact
   of missing fence pieces. *Chosen:* none anyway, because the lore defends
   Helstrom with marsh and grove and marks edges with totems; Imperial and
   Dunmer places fence and wall.
9. **Climate orientation.** The Malay long-axis rule is attractive and
   unsupported by the dossiers (in the measured cases culture beat climate).
   *Chosen:* allowed as an `orientationWhy`, not required.
10. **Doors on ways: 100 %, not the measured 55 %.** Because direction is
    diegetic and a door facing the swamp is unfindable without a marker.
11. **Widths.** Spine 4.3 m (the measured road piece), track 2.5 m, footpath
    1.2 m, passage ≥1.3 m. The alternative of culture-specific widths has no
    evidence; culture shows in the surface and the piece, not the width.
12. **Where commerce sits in an Argonian place.** Bethesda puts the market at
    the first junction inside the gate; Argonians have no market building.
    *Chosen:* a deck on the spine between gate and Hist, never at the Hist.
13. **Space syntax as a metric: not adopted.** Its own authors moved
    correlations from −13 % to +54 % by changing representation. *Chosen:*
    the line-of-sight and first-node tests of the checklist instead.
14. **"In sight" distances.** 300 m for the same type, 700 m for landmarks,
    from the scour's short marsh sightlines rather than Skyrim's horizons.
15. **Hamlets denser than cities.** Counter-intuitive and measured in every
    set (15–33/ha vs 4–11/ha). *Chosen:* adopt it; a city that packs like a
    hamlet reads as a model village.
