# 0060 — Inland sea-level water is not the sea; river profiles are graded, not stepped; a fall lands in a pool (Phase 16b round 2, 2026-09-12)

Owner rulings from the 16b walk of 2026-09-12 plus the defects the QA of
16b round 1 found, each fixed at the root. Amends [0059](0059-terrain-built-once-frozen-base-and-typed-patches.md)
§3 and §7 (superseded below); the rest of 0059 stands.

**Decisions.**

1. **Only the open sea ends a river** (owner: "the inland sea-level water is
   not sea and should not be treated as such in any way"). 0059 §3 made
   every sea-connected cell at or below 0 the routing sink; that cut 15
   rivers short at the first sea-level marsh they met (100 → 85 rivers,
   62 → 46 km, every third-order river gone, 14 "sea mouths" standing in a
   marsh or a lake). Now `hydrology.compute` keeps sea-level water as
   WATER (never land, never a lake) but routes THROUGH it: the sink is the
   open sea (`ocean`, the salinity model's) plus sea-level water that
   cannot reach it through water (a below-sea marsh on the map border);
   every other sea-level cell is a conductor, a shallow routing ramp
   falling toward the open sea along the through-water distance
   (`water_reach`, `routing_sink`, `CONDUCT_*`). The 0059 §3 defect (a
   river routed out of a lagoon over its spill into a lake 0.6 m higher)
   cannot recur: the ramp has no spill. The pass writes `sink`; the
   channel builder and the graph end rivers there, never at `sea`.
2. **The Blackrose lake stands on a sill at 1.6 m** (supersedes 0059 §7).
   The lore dossier has the city "situated in a lake" joined to Topal Bay
   by a navigable river (`world/sources/lore/blackrose.md`), a lake with an
   outlet, not a tidal arm; and a lake cut to 0 and joined to the bay by a
   below-sea channel is sea-connected water; rule 1 routes rivers across such
   water rather than holding it as a lake. `shape_province.LAKE_LEVEL_M`; the S outlet
   is a GRADED feeder (bed falls from the lake level at the rim to −1 m at
   the bay) so the lake spills exactly there and the graph's outlet river
   grades down from it. Fewest knock-ons: one freshwater body with one
   level for the water compile, the salinity model and every place record.
3. **The long profile is graded, never a staircase.** `channels.long_profile`
   takes the level as a downstream running minimum of the valley floor; read
   off a quantised floor that is flat treads with a drop between each, so
   the carve built stairs (half of all neighbouring stations shared one
   level; 4,421 built-bed steps over 0.5 m in 1.83 m). An erosion pass
   (`PROFILE_ERODE_*`) on every free run replaces each tread's upper corner
   with a ramp: `L <- running-min(min(L, gaussian(L)))`, six times at
   σ 5.5 m. It only ever lowers the level (the bankfull cap stays met), never
   a reach end (junction pins stay met), never a pooled, lost, held or fall
   station, never more than `CANYON_MAX_M` under the floor.
4. **A fall lands in a pool the river leaves over a lip.** `plunge_geometry`
   is one law for the carve, the graph's promise and the freeze gate: the
   sheet arcs out from the lip (the waterfall kits are drawn arcing) and
   lands `throwM` past the face (a free arc at 1.5 m/s, cap 10 m), the bowl
   is centred there, radius ≥ 1.3 widths and ≥ half a width + throw + 2 m,
   depth 2 + 0.08 × drop (cap 10 m). The level is HELD flat from the plunge
   to the bowl's far rim + 4 m wherever the bank can hold it (`sol.held`),
   so the water leaves the pool over a lip instead of the fall landing in a
   sloping channel.
5. **The staircase is ramped on the SOURCE, before the mountains** (brief
   item 5, "measure the remaining terrace steps": never reported in round 1).
   Measured: below 40 m the source holds 14 distinct heights 2.86–2.97 m
   apart; 95.9 % of lowland neighbour pairs are identical and 4.1 % are a
   wall over 0.6 m; after the round-1 sculpt the 4.1 % were still there.
   The plateau pass ran LAST, gated by landform slope and the uplift
   envelope: a stepped hillside (2.9 m walls every 10–20 m) reads as a
   15–30 % slope and kept its stairs; under the uplift the treads were no
   longer exactly flat, so the staircase stayed hidden beneath the benches.
   `sculpt.deterrace_plateaus` now runs first on the conditioned source with
   only the coast guard protected (nothing is real yet but the staircase
   itself); the old pass remains as a second sweep. The `DETERRACE_*`
   residual pass (0.34–0.55 m thresholds) never addressed the 2.9 m quantum
   and is unchanged.
6. **The waterline of an exposed sandy coast is wet sand.** `landcover`
   painted `SAND` (vanilla `coastbeach01`, a shingle) 13 m either side of
   the waterline, so a beach read as gravel with sand only under water. The
   band is now `SEABED_SAND` (the shallows' sand); `BEACH_SAND` above it is
   unchanged.

7. **The 16a hydrograph is an approved record the ground must keep**
   (owner 2026-09-12: "the ground tweaks are being done in order to enable
   and protect those river routes and other water features"; nothing
   changes by accident; the version approved is not substantially altered;
   tweaks 16b needs are allowed, listed and approved). Round 1 re-derived
   the graph on whatever ground it had built and the approved record was
   overwritten: a pit rule that filled every hollow under 1 ha above 30 m
   erased ~100 approved mountain ponds and pools (ruling 2 asked only for
   the near-sea-level data holes: `pits.fill_erosion_pits` now fills a
   hollow only when its floor lies under 5 m beneath a rim above 30 m; 12
   of them); the bench pattern breached tarns; the shaping's noise cut the
   marsh sheets into ~1,800 pieces; and the routing sink change re-labelled
   the northern sea-level marsh. Now `world/sources/hydrology/approved-bodies.json`
   (+ `<vault>/approved-bodies-16a.npz`, `approved-routing-16a.npz`,
   regenerated from the 16a commit's own sculpt by
   `python3 -m worldgen.approved_bodies build`) carries the 16a river
   network (`compile_hydrology` takes it as given, never re-routes), every
   16a body with its exact outline and kind (387 carried; 12 data holes
   ruling 2 fills and 5 sheets under 500 m² with no outline are listed as
   not carried) plus the 16a falls. The shape stage (`approved_bodies.restore`)
   lowers the ground inside each outline back to the 16a ground where the
   shaping raised it, raises a breached rim back to the level (≤ 3 m, never
   for a sea-level sheet, never under the authored lake) and re-imposes the
   16a ground in a 30 m window around each fall. The derive matches measured
   bodies and sea-level sheets to outlines (mutual best overlap ≥ 30 %):
   a match keeps the 16a id and KIND (the measured kind is recorded beside
   it); an approved body nothing realises is `stats.approvedBodies.missing`
   and fails the freeze gate unless a named tweak superseded it (the
   authored lake); a body the carve captures or joins to the sea is a listed
   tweak; a body the ground grew that 16a did not have draws faint on the
   map. The river LEVELS are solved once at this freeze and frozen with the
   ground; nothing below the gate re-solves. The owner corrects the network
   by a row in `approved-routing-corrections.json` (first one 2026-09-13:
   `river.1223-143` ran on 300 m through an inlet pocket the 2.5 km ocean
   rule had called sea, to the inlet's real mouth at 6.57 E 0.96 S).

**Measured after the rebuild** (ledger §9): see
[research/phase16/16b-terrain-once-ledger.md](../research/phase16/16b-terrain-once-ledger.md).
