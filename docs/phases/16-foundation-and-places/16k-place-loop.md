# 16k — The place loop: one real place at a time, walked until right, until the place skill is proven per type

**Goal.** Build real places, one at a time, with a place skill that runs
unattended on the frozen world, and let the owner's walks turn every
defect into a rule, a gate and a skill improvement, until each place type
on the owner's signed list passes unattended twice in a row. Replaces
16h part 2, 16i and 16j (decision
[0099](../../decisions/0099-places-are-built-in-a-loop-until-the-skill-is-proven.md));
their items are this loop's backlog, under their original numbers.

**Invocation.** `deliver 16k slice N` builds slice N to its walk packet;
`continue 16k slice N after owner walk` runs the one fix round from the
owner's reply and republishes for the next walk. A slice spans as many
walks as it needs; it closes only on the owner's "looks right".

## Starting state (2026-09-28 late, slices 1c and 2 with the owner: Claywater walk 5 and Greenspring walk 3 in one packet; the closing agent of each slice replaces this section)

- **Both places pass every place gate** (`place_gates` 23/23 each, with
  the walk-4 rules added: burial, landing, hanging, sign, fixture seat,
  archway, all on the scene AND the compiled record) and are published
  with `--places` and deployed. Packet 5 is
  `tooling/.reports/16k/walk4/packet-5.md` (issue #1).
- **Walk-4 root causes, all fixed at source this round** (reports in
  `tooling/.reports/16k/walk4/deliver-*.md`, orient reports beside them):
  - *Fire:* the kit exporter dropped every NIF flame (particles and
    AddOn nodes). `build_kit` now mines `flames[]`/`glows[]` per piece
    (`nif_blocks.py`), publishes the flame atlases with the palette baked,
    and `lighting.ts` draws flipbook sprites with flicker; glow discs are
    sprites; additive cards draw unlit; every outdoor fixture emits one
    warm orange (`FIXTURE_LIGHT_RGB`). Kit output format 3; all 26 kits
    rebuilt (site 709 MB with parts, warn 750).
  - *Interiors:* the grey screen was `scene.background` as a Color making
    three clear the frame on every water pass (fixed in
    `interiorEnvironment.ts` and, for the whole class, in
    `WaterPipeline.tsx`); leaving a hut landed above Greenspring because
    the return followed a shared cell claim (now: the door entered by,
    `doorTransition.ts`); "Loading…" line during the fade; the navigation
    toast is `?dev=1` only; cells load per-asset parts
    (`kits/<kit>/parts/`, scoped to the 10 kits cells name; KeebaHouseFisher
    108.9 MB → 6.9 MB, cell open 22.7 s → 3.4 s headless).
  - *Swing doors* ship now (`swingDoors.ts`, exporter keeps DOOR refs with
    no teleport; 7 in 3 of the 95 Argonian cells; none in the owner's 8).
  - *Compile re-seat:* the compile re-derived heights (stable 3.48 m
    under, deck 3.01 m over); it now takes the workbench seat (`yFinal`)
    for every piece, mount and run (R69).
  - *Workbench:* `wb.py bpy` (an agent's own script over the loaded
    scene, 6.6 s Claywater), `mount --hang` (branch hang by ray, R53
    built), the six check rules above, `pool` op; mounted children keep
    their own scale (brazier flames); the interiors measurer keeps only
    ray-confirmed doorways (mudhut01's true opening found; kotm door01
    does not fit it, so its huts take the hut-with-entrance composite or
    the Black Marsh hut).
  - *Ground:* clearance cut per instance against pads, ways and floors
    (Claywater 8,801 → 2,416 m²); paths painted by the `groundPaint`
    overlay (13 and 16 entries); the Greenspring spring is a `pool`
    (terrain cut + local water surface at load, `localSurfaces.ts`,
    `PoolDiscs.ts`).
  - *Sockets:* no socket visible or interactable without `?sockets=1`;
    socket height from the walkable surface; the poler's work socket is
    the raft's (R72).
- **Rulings:** R63–R73 in `rulings.md`; the type-2 breadth bar is shells
  ≥ 3, top share ≤ 0.50 (`breadth-bars.json`, owner question in the
  packet); the collider ceiling is 500 for 5+ dwellings (0052 note).
- **Ways of working (owner 2026-09-28):** CLAUDE.md "get it right first
  time" rule; a batch is a fix round; one exhaustive review per batch
  (findings under `tooling/.reports/review/`); a budget stop is
  diagnosed, never a gap; 0106 decisions 11–16.
- **Open, owned by the planner next session:** the owner's reply to
  packet 5; the reader prompt asks for screen-left/right + camera bearing
  on any direction claim (a reader misread the sign this round); collider
  parts per convex piece (rec: one hull per piece); the claim table
  rebuild (`batch_prepass --places …`, 7 min saved per chain run); the
  door-link miner should divide offsets by shell scale; the 12 hlaalu and
  imperial-keep leaf-entrance shells re-measured; `kit_parts --all`
  after every cell publish; the `.claude/settings.json` duplicate Bash
  hooks (owner pastes).
- **Next:** "continue 16k slices 1c and 2 after owner walk" (walk 5 / walk 3),
  or on acceptance "deliver 16k slice 3 by the contrast rule".

## Read (fresh agent: this is your whole map)

- [0099](../../decisions/0099-places-are-built-in-a-loop-until-the-skill-is-proven.md), [0100](../../decisions/0100-one-place-skill-whole-layout-authoring-lessons-store-and-the-acceptance-freeze.md) and [0104](../../decisions/0104-the-world-is-one-normalised-record-set-promises-are-fulfilled-by-placed-interactables.md) (promises as records, the interactable table, door types, the builder's two-way authority) in full; [0098](../../decisions/0098-variety-is-measured-per-settlement-not-by-a-template-cap.md) § Decisions; [0097](../../decisions/0097-placement-is-authored-in-a-workbench-and-the-pose-record-is-the-output.md); [0081](../../decisions/0081-building-blocks-then-exemplars-then-rollout-and-doors-are-transitions.md) decisions 3–6 (doors, patches).
- `tooling/.reports/plan/place-audit.md` (the checklist's source) and
  `tooling/.reports/audit/time-audit-2026-09-25.md` § (e).
- Skills: `place-build` (the procedure, `references/lessons.md` and the design index; replaces the retired settlement skill), `placement-workbench` (its tool manual), `kit-build`,
  `modular-runs`, `composite-author`, `text-review`.
- [world 97](../../world/97-placement-principles.md) Parts A, C7 and F;
  [quests 20](../../quests/20-world-provisions.md) for the slice's place.
- § Carried backlog below, only the items the slice takes (the single
  copy of the retired briefs' live items), and
  [0102](../../decisions/0102-a-place-carries-its-own-ground-and-hands-over-nothing-it-can-check-itself.md)
  and [0103](../../decisions/0103-tier-a-interiors-ship-in-16k-and-every-promise-is-a-placed-socket.md)
  in full.

## The loop (every slice)

1. **Design as one whole layout (unattended; `place-build` skill, 0100
   decisions 2–3, 7).** Step 0: read the site packet (the 16g catalogue
   record, its promises and quest provisions, the macro plot, the
   lessons rows for this type, neighbours within 2 km) and the register
   digest (one line per built place: type, culture, shells, signature
   assemblies), never every `design.md`, so the new place keeps 0098's
   rules and is not the same signature within its region and type
   (97:130–134 spacing); write the site dossier
   (97 B1) and fix any record defect found there as a rule gap with a
   test, before design. Then write the **design brief**
   (`world/sources/blueprints/<place>.design.md`: the causal answer for
   every building, enclosure, path, light, water edge and dressing group,
   each with its kit piece and its lore or rule pointer; § Interiors: the
   tier per door with its chosen cell and why, shells chosen for their
   interiors, 0103 decisions 1–2; § Sockets: one row per socket, 0103
   decisions 5–6) and the **layout
   file** (`<place>.layout.json`, the ordered workbench operations for the
   whole place, `socket` ops included). `wb.py apply <layout>` rebuilds
   the scene, runs `check` and `compile` and writes one summary;
   `blueprint_interiors.py --claim` writes each door's tier A claim. **The
   plan read** (the 2.5 s plan render, `render_blueprint.py`, item 19,
   and a reader pass before any Blender render) runs only when the
   compile gates are red, or the type is unproven and its type sheet
   asks. Then **render rounds** (0102 decision 4): one Blender launch
   (top view, one front per building, two isos) read by one `Workflow`
   of Sonnet readers, one per image, returning one NO list; each round
   gathers every reader NO and every `check` failure into ONE layout
   edit, one `apply`, the plan render only when it applies, and at most
   one Blender round; **at most four
   rounds**; a finding that returns after its fix escalates to the
   planner. The inner loop ends at zero `check` failures and zero reader
   NOs; there are no residuals. Export the pose record with its ground
   and kit provenance.
2. **Build and gate (unattended).** The tier A interior bundles
   (`export_interior_bundle.py`, 0103 decision 3); local patches (pad,
   clearance, dressing-add; they travel in the place's bundle as a runtime overlay,
   and no chain stage, refreeze or province publish runs for a place,
   0102 decision 1), compile, publish the place only (`--places` scope,
   item 7b), the automatic gates: every essential checklist row below, the
   0102 `check` rules and the lit-entrance compile rule (97 C16), the
   socket gates and the interior bundle gate (0103), the 0098
   bars, all per place by `place_gates` (S14); the yard regression
   gates, the integrator's shared-file REQUEST rows, docs:check,
   preflight, review, text-review and deploy run once per batch (in 16k
   a batch is one walk packet's places).
3. **Walk packet** (Owner check-ins below) → the owner walks **the
   deployed studio** (owner 2026-09-27): before posting, merge `dev` into
   `main`, push, and confirm the Pages action is green; the packet's links
   use the deployed URL, never `$ES_TUNNEL_URL`. The packet
   gives the measured numbers in one line (no per-item table) and asks
   only look and feel; it
   lists the interiors to enter (door, cell, `?interior=<cellId>` URL)
   and the `?sockets=1` overlay; a
   `§ Gaps` row carries one of 0102 decision 3's four reasons; the plan
   render and up to four shots are embedded (`owner_inbox.py --attach`).
4. **One fix round** (`continue 16k slice N after owner walk`): group the
   owner's defects by cause across the whole reply; a cause that needs a
   rule (97 §C or the skill), a test or a gate goes to the tooling
   sub-lane, which shows it failing first on the defect (never written
   inside a round); each cause is also a row in
   `place-build/references/lessons.md` (0100 decision 4: rule, defect and
   cause, the gate that now enforces it, source), merged into an existing
   row where it restates one. The edited place runs the step-1 inner loop to
   zero `check` failures and zero reader NOs (0102 decisions 3–4); a
   finding the owner raises that a tool could have measured becomes a
   `check` rule first. The layout is edited by `uid`, then
   `place_gates`, then the next **batch** deploy (a batch is one walk
   packet, which may hold several places; in Phase 15 a region packet)
   and the walk packet; never a preflight and deploy per place.
5. **Repeat 3–4** until the owner says it looks right. Then close the
   slice: the acceptance receipt in
   `world/sources/placement/accepted-places.json` (0100 decision 6: the
   owner's date, the compiled-record and patch hashes, the ground and kit
   provenance; from then on the place is frozen); the **lessons this
   slice** step (every finding that cost more than one render round and
   every compile refusal becomes a lessons row; zero rows needs a stated
   reason); the **type sheet** `place-build/references/types/<n>-<type>.md`
   written by the first slice of a type and edited by every later one; the
   slice's ledger row, the next slice's Starting state, and the next slice:
   a fresh place of a different type in a contrasting region.
6. **While the owner walks,** two or three slices of different types
   run at once (each at its own step; a walk packet may carry several
   places; a type's two in-a-row places after its first acceptance are
   built together, in different regions, and walked in one packet), beside research and sourcing, speed items (S below) and
   template studies. Never an idle wait.

## The checklist ("good enough" for a place)

The audit's table with its coverage (2026-09-25). **Gate column signed
by the owner 2026-09-25** (hand-off ruling 3): every visual row is a gate
before rollout. Interiors gate on the cells themselves (0103 decision 7):
every tier A cell shipped and enterable; a door is reserved (its pool
named) only for a tier B or C interior, never a house, shop, stable house
or workplace ([0105](../../decisions/0105-setting-class-reserved-doors-lights-band-planned-variety.md) R2). Occupants, items, containers and ambience gate on the
**socket as data**, not the system: the place's `sockets[]` record
(0103 decisions 5–6; kinds and vocabulary in
`world/sources/vocab/socket-vocabulary.json`, never a second vocabulary)
passes the compile's socket gates, and Phase 13 and 10b fill them. The
navmesh gates on `walkRule` (0102 decision 2), whose walk graph is the
navmesh socket's walkable ways. No idle-occupant pass runs in the loop. A gate row is an automatic check in
step 2 from the slice that first builds it.

| Row | Covered by (carried item) | Gate |
|---|---|---|
| Seated, joined (runs as one rigid chain) | 16h items 1–4, 7; 259b200a | yes |
| Doors as transitions (reserved or claimed) | 0081; items 11, 18; 16i items 4–5 | yes |
| Windows glowing at night | item 28 (done) | yes |
| Paths and worn ground to every door | G1 ground paint, painted by the `groundPaint` overlay (16k walk 4); widths 97:341, :852; `pathReachRule` (0102) | yes |
| Ground-to-wall blend | item 25 | yes |
| Pads, retaining walls, steps | items 12, 13; retaining walls R1 (0101); `floorEdgeRule` (0102) | yes |
| Enclosure (fences, walls as a placed rule) | new rule R2 (97 Part F column) | yes |
| Yard dressing vocabulary | items 15, 17, 23, 26; `propSeatRule` (0102); the per-dwelling count is every placement within 12 m of the footprint except shells, pads, ground treatments and runs (0105 R6) | yes |
| Lights by time of day (sconces, lanterns) | item 22; a lit entrance at every door, 97 C16 (0102 decision 7); **lit 17:30–06:30 by the world clock, every fixture glows; every fixture within 200 m emits, the 16 nearest** (owner 2026-09-28, [0105](../../decisions/0105-setting-class-reserved-doors-lights-band-planned-variety.md) R3; `LIGHTS_ACTIVE_M`, `LIGHTS_CAP`); lanterns outdoors, never interior pieces such as candle sconces (R1) | yes: `lights.density` (no point in the place sees more than 16 fixtures within 200 m), `setting.class` |
| Seams: the place in its world | skill step 0.3b and § Seams: on-road or off-road, ways join real route terminals, a landing from dry ground to every berth, sign arms along the road; `roadSurfaceRule`, `berthReachRule`, `signRule`, `sillRule` (owner 2026-09-27) | yes |
| Promises filled | the promise ledger and `fills` (0104 decisions 3–6); the promise gate | yes |
| Colliders on everything a walker meets | `colliderRule`: every placed asset over 0.3 m in plan and height collides (owner 2026-09-27) | yes |
| Fire and smoke (chimney, cook fire, forge glow) | chimney smoke in dressing-v1; cook fire and forge: new R3 | yes |
| Signage, banners, totems, shrines | mount sheets; totems 97:757 | yes |
| Gardens, crops, kept trees | kept trees item 14; crops: new R4 (Argonian crops are a sourcing gap) | yes |
| Water edge (docks, reeds, boats pulled up, moorings, wheels) | items 10, 16; boats pulled up and moorings: new R5 | yes where the place touches water |
| Wear (moss, mud, puddles, wet ground) | 0098 condition axis; new R6 | yes |
| Idle occupants (people and animals) | `npc` and `idle` sockets from the 16g roster and promises (0103 decision 5); people, animals and movement AI are 10b/13's | yes, on the sockets record: every roster slot has a work and a home socket; every promised service an `npc` socket at its parcel; every `npc` and `idle` socket reachable by `walkRule` |
| Items, containers and loot | `item` and `container` sockets (0103 decisions 5–6); contents are Phase 13's | yes, on the sockets record: every container placement has a fill rule; every item class is in the vocabulary |
| Ambience and footstep surfaces | 0095 rule 5; studio wiring (backlog row); `ambience` sockets | yes, on the sockets record: the ambience zone placed as an `ambience` socket |
| Sockets placed as data | 0103 decisions 5–6: `sockets[]` in the compiled record and the bundle, a § Sockets table in the design brief, `?sockets=1` in the studio | yes: the compile's socket gates green |
| Seen from a distance (lit at range, skyline) | item 5; new R7 | yes |
| Interiors (tier A verbatim; reserved only for tier B/C) | 16i items 4–5 (0103 decisions 1–4); [0105](../../decisions/0105-setting-class-reserved-doors-lights-band-planned-variety.md) R2 and R4; Phase 12 keeps tiers B and C | yes: every tier A cell shipped and enterable (door and `?interior=<cellId>`, bundle count = the cell's references); every reserved door closed with its pool named; `interiors.variety` (no cell twice in a region unless the shell's linked set is exhausted, at most 3 in the province) |
| Walkability and navmesh | `walkRule` (0102): a route from the road terminal to every door threshold and yard opening within the controller's step and slope limits; the runtime navmesh is Phase 10b's | yes, on `walkRule`: its walk graph is the navmesh socket's walkable ways and door links |
| Map marker, discovery | catalogue `discovery`; Phase 13 | yes (the `discovery` record and C-stitch) |

Pools for the new rows (audit §1): enclosure `arch.neutral.fence-and-enclosure`,
KotM scalefence/saxhleelfence, vanilla farm fence (16); boats
`boat.mixed.watercraft`, `boat.argonian.native-craft`; cook fire and forge
`light.neutral.fixtures`, `prop.neutral.works-and-industry`, vanilla
woodfires (15) and blacksmith (8); crops: the vanilla farm dressing set;
wheels and moorings: vanilla lumbermill waterwheels (2), docks (13),
`prop.neutral.fishing-and-water-trade`; wear: condition variants, ground
texture `Ground050`, impwindow moss (×6); distance: `fxambwindowglow01`,
`wrlodwindowglow01`, `fxsmokechimney01/02`.

## Deliver

### Slice 1 — close the yard, then the first real place

**1a. Close 16h part 1.** Resume the check-in 3 fix round's lanes from
their transcripts (`python3 tooling/repo-standards/lane_resume.py --packet
<agent-id>` as each brief, same agent type): the kit/yard lane, the miners
per kit on demand (no full-pool run now: the full-pool run is the overnight
job, lowest priority, launched only when nothing else is queued, through
`job_guard.sh`; 16k hand-off ruling 5, kit-mining §5) and the combat
round-7 close.
Dismiss or relaunch 7f2405fa. Turn every check-in 1–3 yard defect into
an automatic gate on proving grounds A and B (0099 decision 7); the yard is not walked again. 16h part 1 closes on
green gates and the ledger row.

**1b. Set the bars.** Before the place is designed: the breadth bars as
numbers the skill reads, from `building-asset-breadth.md` §3,
`building-depth-and-variety.md` §5 and 0098 (Fable writes the numbers
and their record); the within-place variety number (yard, ground,
lights, enclosure kinds) beside 0098; building-depth §5 brought in line
with 0098; the checklist's Gate column signed by the owner. The record is
`world/sources/placement/breadth-bars.json` (`schemaVersion` 1), authored
in 1b from 0098, 97 Part C7/F, 16h item 17 and `building-asset-breadth.md`
§3: one object per settlement tier and per place type, each giving
shells, top-shell share, pieces within 12 m, dressing assets (min and max
share), ground, light and enclosure kinds (min), and the distance bars
between places of one type or purpose. The skill reads it; no bar lives
in prose only.

**1c. The first real place: Claywater Station**
(`place.imperial-fringe.claywater-station`). An Imperial road-station
village (M2, `simple`) 20 m off the Gideon–Blackwood trunk, firm
lowland; two villages facing each other across the road (danger band
4). Confirmed by the owner 2026-09-25 (hand-off ruling 6). Chosen because
it sits on the trunk, has no city edge within reach and depends on no
unbuilt place: its one `dependsOn` is a route (`route.blackwood-road`).
Record facts the site dossier settles before design (orient-plan-context
§(d)–(e), `tooling/.reports/16k/`): the record's `assetPlan` names
`hlaalu-domestic` (Dunmer) and `fences-wattle`, which lane D corrects to
`settlement-imperial-v1` shells and the farm-fence family (97 Part F
`imperial`); the Argonian half is `settlement-mud-v1` with a stated
founding reason (97 C1: `argonian-stilt` zones exclude imperial-fringe);
D2 on danger band 4 against 97 A7; the ferry service has no
travel-services row.

**Slice 2** is chosen at slice 1's close by the contrast rule (a type
not yet passing, in a contrasting region). Highwater fails it: 296 m
from Claywater, the same zone and the same ferry purpose (97 :134).

### Slices 2 on

One fresh place per slice, of a type not yet passing, in a region that
contrasts with the last. A type passes after two fresh places in a row
pass unattended with no defect from the walk; those two are built
together once the type's first place is accepted and go to the owner in
one packet (§ Owner check-ins).

### The type list (signed by the owner 2026-09-25, hand-off ruling 1)

From the catalogue's active kind counts (419 active records: settlement
88, lair 61, works 49, transit 46, sacred 45, camp 44, lone 40, civic
19, martial 18, ruin 9).

| # | Type | Why it is on the list |
|---|---|---|
| 1 | Road station or hamlet (road-station village, road stage, flood-high hamlet) | the road-side place on every leg; Imperial shells over Argonian life; slice 1 |
| 2 | Hist village (tribal and dry villages, 39) | the most common Argonian settlement; mud and root grammar with a kept Hist tree |
| 3 | Water village (stilt, mangrove-platform, boardwalk; water-village 12, plus refuges on water) | docks, decks, stairs, boats pulled up: the water-edge machinery |
| 4 | Camp or hold (hostile camps 27, civil and expedition camps 17, pirate anchorages) | 44 camps; the first template candidate |
| 5 | Dungeon entrance (beast lairs 35, root systems 13, sinkholes and grottoes) | 101 lair and lone places need an entrance piece and a reserved door |
| 6 | Shrine or sacred site (the dead 17, Hist 10, rite 9, Sithis 8; xanmeer terraces) | 45 places; xanmeer stone, totems and offerings |
| 7 | Works and landing (craft, extraction, illicit, storage; ferry stages and landings) | 49 works and 20 landings; industry props, fire, freight and moorings |
| 8 | Town or city, always a WHOLE city, never a district (Imperial town, Blackrose, Lilmoth) | owner hands-on (0062 §9); built with the owner, not unattended; exits the loop by owner acceptance |
| 9 | Early-game location (owner-guided): candidates `place.pirate-freeholds.opening-work-barge` (M1 works, `vasteiTutorialScene`), `.opening-work-camp` (M2 muster yard), `.corimont-crosstrees` (M1 transit) | the opening scenes of 0062 §9 and quest MQ01; owner hands-on; exits the loop by owner acceptance |
| 10 | Road structure or crossing outside any place (owner confirmed 2026-09-28, 0105 R7) (the Nine-Trunks stair flight, the Xul-Vaat walkway, a bridge, a lip-step, a ferry crossing with both berths and hulls) | added 2026-09-27 restoring 16h items 10, 16 and 19, which the retirement left with no owner: the route structures 16e recorded and the berths of `travel-services.json` reach Phase 15 unproven otherwise; one slice proves the four kinds as one "place" whose record is `world/sources/routes/route-structure-exemplars.json` |

### Carried backlog (numbers as in the retired briefs)

The single full copy of every still-live item of 16h part 2, 16i and
16j (decision 0099; the 16i and 16j briefs are archived in
[phase16-retired-briefs](../../research/archive/phase16-retired-briefs/),
and 16h keeps only part 1's closed record). Taken by the slice whose
place first needs them; each keeps its text and test. Inside the
carried text, "16i" and "16j" name the retired chunk that first owned a
step: that step is now this loop's. Procedure lives in the place-build
skill: doors, interiors and sockets in
`.claude/skills/place-build/references/doors-interiors-sockets.md`, the
Phase 15 packet template in `references/rollout-packet-template.md`.

#### From 16h part 2 (items 28 and 30 are done)

10. **Renderable kinds place geometry** (D6). A declared list, each with
    a hard export error when it owns no placement: ways (painted; laid as
    boardwalk pieces where the culture builds them), canals, approaches,
    docks (`jettyM` long, from the berth record), ferry landings and a hull
    at every berth of its class (`travel-services.json`), the operator
    socket as a stand-in marker, **entrance pieces** for every dungeon-kind
    record with a blueprint (the door of the piece is a door record, item
    11), **underwater-access entrances on the bank** from
    `underwaterAccessDetail`; and 16e's route structures with their
    `walkSurface`. **Exemplar first:** this chunk stands up the
    **route-structure exemplar set**, recorded in
    `world/sources/routes/route-structure-exemplars.json`: one structure of
    each recorded kind (stair, deck, lip-step, bridge), chosen to include
    the Nine-Trunks stair flight and the Xul-Vaat walkway (both on the
    road, outside the village plots), plus the Drowning Gate ferry
    crossing with its two berths and hulls. The berths that belong to the
    six exemplar places are 16i's, with the places. The other structures
    and berths keep their records
    and are placed per packet by 16j and Phase 15 through the same kinds;
    the export lists them as `pending: packet` so nothing is skipped
    silently; the `route-structures` layer (`SHOWN_FROM`) shows what is
    placed. Roads carry their 4E 201 `condition`: a `broken` road's
    structure may be authored collapsed or overgrown where the kit has
    such a piece (16f deliverable 5's condition dressing). The three OPEN
    sourcing rows stay gaps, shown as gaps. Test: each renderable kind
    owns ≥ 1 placement within the exemplar set or a replayed blueprint;
    every exemplar berth has a hull; every placed structure's
    `walkSurface` heights match the record within 0.1 m; every recorded
    structure or berth is either placed or listed `pending: packet`,
    never absent.

11. **Doors as records** (0062 §3, 0081, the build-out register). Every
    enterable shell and every entrance piece gets a stable door id
    `door.<placeId>.<parcelId>.<n>`, one entrance per piece (16i: never
    invent a second), bound to the mesh doorway, with `interiorClaim:
    null`, `interiorStatus: "reserved"` by default, an `arrivalMarker`
    (the exterior point and bearing where the character stands after
    leaving), a `streamingBoundary` slot, plus the reserved-door catalogue
    message reserved in `packages/text-catalogue` (16i writes and reviews
    the text). **The door model is the TES one (0081):** using a door
    moves the character into a separate interior cell and back; an open
    structure with no interior (a deck, a gate arch, a shelter) has no
    door record and is walked through as exterior geometry. **Reachability
    is validated every compile:** the threshold is within 4 m of a way
    (C9) and reachable from it under the step rules of item 12. Test: a
    door 5 m from any way fails; a door with no id fails; ids are stable
    across two compiles; an entrance piece with no door record fails.
    Sample: the 58 replayed doors (47 sit more than 0.5 m from a doorway)
    are the sample; the interiors index re-runs `--kit` for changed shells
    only, never all 23 kits ([audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) step 5).

    Procedure (fields, one entrance per piece, reachability, the reserved message): `place-build/references/doors-interiors-sockets.md` §1.

12. **Stairs, decks and honest navigation** (D8). A real stair or ramp
    piece from a kit per deck link (stockade, Ayleid, dock steps; never an
    invented ramp), referenced by the link; decks and stilt assets that
    ship a built-in stair are read from the kit's geometry (which reach
    the ground by sinking stilts, which expect a piece attached at the
    bottom step: recorded per asset in the manifest with the tell). The
    character gets a step height and slope limit on placed geometry; the
    handoff widget reports what is consumed and says the province navmesh
    is 10b's. Test: collider top within step height of the deck, base
    within step height of the ground, for every deck link; the widget test
    no longer asserts a literal. Sample first ([audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) step 3): a
    15-asset stair-tell golden file (`fixtures/stair-golden.json`, stilts
    and decks with and without stairs, tell written first), then a fresh
    15, before the one full manifest write.

13. **Pads as terrain patches** (D9, C4). Replace
    `grade_settlement_pads.py`'s in-place write with 16e's pattern: an
    author stage writes `world/sources/terrain/settlement-pad-patches.json`
    (a new `settlement-pad` grade kind in `terrain_patches.py`, `KINDS` +
    `GRADE_KINDS`, consuming the shared exclusion-window module
    unchanged), each patch proved on a scratch window with
    `check_invariants`; an apply stage after `apply_route_patches` refuses
    nothing it did not prove; `patch_water --graded` proves no water
    moved. Pads are rare: prefer the asset's designed sink and stilts
    (ruling 9's spirit). A pad re-runs the tile stages for its own tiles
    only (`chain-footprint`); measure and record the seconds per pad. Test:
    the pad receipt reads the shipped raster; a pad inside the 22 m shore
    guard is refused; a pad touches only its own tiles.

    *Status 2026-09-26:* built as `settlement-pad` patches with retaining runs (0101). 0102 decision 1 supersedes the apply stage, the per-pad tile re-run and `patch_water --graded`: a pad travels in the place's bundle as a runtime overlay over the frozen data and `apply_terrain_patches` refuses the kind.

14. **Settlement vegetation clearance as patches, realistic by tier**
    (0070 §3, 16f deliverable 9). A blueprint's `hardClear`, `thinned` and
    `kept` become `vegetation-clearance` patches; the applier clears by
    tier as a settlement would: trees and large plants go from plots,
    ways, pads and a margin; low groundcover survives between buildings and
    dies on hard surfaces (ways, pads, floors); the fringe thins on the
    keep gradient; `kept` names the shade and Hist trees the place was
    built around (C15: the Hist is never cleared). The groundcover ring
    evaluates the same list. `compile_scatter` is never re-run for a
    settlement. Test: a patch's receipt names only its chunks; a patch that
    would clear a Hist tree fails; the receipt carries pre-patch counts;
    the TS/Python parity tests extend to the tiers.

    *Status 2026-09-26:* the clearance travels in the place's bundle as a runtime overlay (0102 decision 1); no chain stage runs for it.
    *Status 2026-09-28 (walk 4):* by tier in the bundle (`vegetationClearance` schemaVersion 2: `hardClear`/`thinned` for trees and large plants, `groundClear` for ground cover; `packages/game-core/src/settlement/README.md`); the blueprint's hull `hardClear` is no longer carried. Claywater's ground-cover clearance fell from 8,801 to 2,416 m2, Greenspring's from 8,865 to 2,694 m2.

15. **Additive dressing as a patch** (new; owner 2026-09-20). A second
    vegetation patch kind, `dressing-add`, that adds placed instances
    locally with no re-run above: either an explicit list
    `[{assetId, positionM, yawDeg?, scale?}]` or a rule
    `{overlay, polygonM, seed}` using the `rock_dressing` overlay builders
    on the polygon only. **Root cause first:** lift `compile_scatter`'s
    instance emission (seat on the shipped ground by `designedSinkM`, the
    0075 `lodCopies` rungs, the bundle encoding) into one function both the
    compiler and the applier call, so a patched instance is
    indistinguishable from a compiled one. Ordinals append after the
    existing instances (an instance stays `(chunk, species, ordinal)`,
    0070); the receipt names chunks and counts added; the runtime reads
    nothing new. Every patch carries `why` and `sources` (a design act is
    lore- and asset-aware). Test: an added instance round-trips through
    the bundle with the same seat and ladder as a compiled neighbour; the
    applier on a chunk with no patch leaves the file byte-identical; a
    patch that adds an instance inside a clearance polygon of a higher tier
    fails. The lifted emission is proved byte-identical on 3 named chunks,
    then a fresh 3, then one full `compile_scatter` run; never a full run
    per edit ([audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) step 8).

16. **Prove the three patch kinds on the proving ground and the route
    exemplar set, small and real.** On the proving ground: one
    `settlement-pad` under the Imperial house, one `vegetation-clearance`
    by tier over the yard with one tree named `kept`, one `dressing-add`
    rock group at the cave entrance piece. On the route exemplars: the
    clearance the Xul-Vaat walkway and the Nine-Trunks stair flight need
    (their `walkSurface` footprint plus the C13 margin); a `dressing-add`
    at the Drowning Gate landings (reeds or rocks by the bank, from the
    region palette, with `why` and `sources`). These are the only patches
    applied to the ground or the bundles in 16h; each is a few tens of
    metres; 16i may re-emit the route ones.

    *Status:* now proved on each slice's place and the yard, not on a separate exemplar set.

17. **Dressing vocabulary** (D11). Per-rule draws with a distinct-asset
    floor; interior-kit assets never placed outside. Test: ≥ 4 distinct
    assets per place, ≤ 40 % share for any one, on the replayed
    blueprints.

18. **The bundle format the build-out asks for.** `schemaVersion` bumped;
    a `variants` overlay slot (`LocalStateVariant`: a keyed set of
    placements shown or hidden by a world-state key, empty by default) read
    by the layer; `interiorStatus`, `interiorClaim`, `arrivalMarker` and
    `streamingBoundary` on every door record; the bundle's `doors` array
    is the list 16i's door transition consumes. Test: a variant that hides
    a placement hides it in the layer; an old-schema bundle is refused
    with the version named.

    Procedure (door fields, `variants`): `place-build/references/doors-interiors-sockets.md` §1; the bundle also carries `sockets[]` (0103 decision 5).

19. **The plan renderer.** A plan renderer to PNG per place (footprints
    with front arrows and door dots, ways, pads with their delta in metres,
    clearance polygons by tier, kept trees, stairs, berths and hulls,
    entrances, additive dressing) and per route structure or ferry
    crossing (the structure on its road line with its `walkSurface`, the
    berths with their hulls). Proven here on the replayed blueprints and
    the exemplar set; 16i's check-in 1 is built from it. Sonnet reads every
    sheet against the C-rules with the protocol.

    *Status:* the place plan is `render_blueprint.py --layout` (place-build step 3); the per-route-structure and ferry sheets are still open.

20. **The `kit-qa` skill.** `.claude/skills/kit-qa/SKILL.md`: render an
    assembly, a kit sheet, a plan sheet or an interior-cell sheet (16i
    adds the interior renderer; leave the slot); the Sonnet prompt
    template; the rule list it checks (97 §C) and the
    `blueprint_integration` checks that back each; how a "wrong" becomes a
    rule, never a per-piece fix; the refusal on `ownerGuided` records for
    unattended runs. Runnable per assembly by a rollout agent without the
    owner.

    *Status 2026-09-27 (planner; owner "use your judgment"):* **closed
    as redundant.** The skill never existed and the loop absorbed its
    parts: the reader prompt and rule list are
    `place-build/references/reader-checklist.md`, the sheet renders are
    `wb.py render --shots` and `render_blueprint.py`, and a "wrong"
    becoming a rule is skill step 7. The one prose-only part, the refusal
    to run unattended on an `ownerGuided` record, becomes a code gate in
    `wb.py apply` and `export_settlement_bundle` this round. Its own step carries the CLAUDE.md rule "Prove on a sample,
    validate on a fresh batch, scale once" for every sweep
    ([audit](../../research/phase16/16h-catalogue-wide-steps-audit.md)).

21. **Chain, gates, docs.** The `[16h]` ladder row lists the stages
    actually delivered (expected: `rederive_blueprints`,
    `author_settlement_pads`, `apply_settlement_pads`,
    `compile_settlement`, `export_settlement_bundle`,
    `settlement_ground_control`, `author_settlement_clearance`,
    `author_dressing_add`; then 16f's `apply_vegetation_patches` cascades),
    `DELIVERED_THROUGH="16h"`, `STAGES` reordered so `--check-contracts`
    prints no `warn: order:`; one chain run from the freeze gate; the
    licensed camp's track overrun fixed while you hold the chain lock.
    Every test above green and shown failing first; audit §7's five gates
    that cannot fail made to fail on their defect first; probe-blueprints
    zero grounding findings on the real formula; `npm test`, typecheck,
    `npm run preflight` green. Docs: the retired settlement skill's banner line (obsolete: 0100 replaced that
    skill with `place-build`); 97 §C and §G carry
    the rules the sheets produced; world 80 §63 edited to the door model
    of 0081; the backlog rows above struck; the ledger
    `docs/research/phase16/16h-ledger.md` (measurements, Sonnet reports,
    departures from this plan); one decision record for the non-obvious
    choices (the additive patch, the door record fields, the sink and
    mount derivations); the 16i brief's Starting state replaced from the
    ledger's ending state; PROGRESS.md.

    *Status 2026-09-26:* 0102 decision 1: no chain run, refreeze or province publish for a place; the ladder and chain lines apply only to stages that stay chain stages.

22. **Man-made lighting** (owner question, check-in 1, 2026-09-23). A
    light emitter property on mount children (sconces, lanterns),
    switched on and off by the calendar: lit from early evening to after
    sunrise. The runtime reads the property; no per-piece code. Huts
    without windows (0 of the BM&V, HTBM and stilt shells carry a window
    shape, /tmp/wf/checkin2/windows.md) are lit by lanterns and braziers
    placed under this item; the night factor is the settlement layer's
    sun-altitude ramp (`settlement/materials.ts` `settlementNightFactor`).

    *Status 2026-09-26:* every door needs a lit entrance (97 C16, 0102 decision 7; `compile_settlement.unlit_entrance_errors`).

23. **Host-aware ring dressing** (planner ruling C, K7, 2026-09-23). The
    97 decision 4 ring (`compile_settlement.dressing_count` by parcel
    `use`) stands props on bare ground round the pivot: the owner's
    "random tables" and "random chairs" at check-in 1. Place them against
    wall faces, on porches and decks, and chairs at tables by mined pairs
    (`kit-assemblies-mined.json` templates and `abuts`), never on a ring.
    Fixtures are exempt already (`blueprint.is_fixture`, K7).

Items 24–27 come from check-in 2 and
[building-depth-and-variety.md](../../research/placement-settlements/building-depth-and-variety.md)
(2026-09-24).

24. **Interior camera** (check-in 2 item 3). Inside a shell, occluders
    between the camera and the player fade at the near plane. Research:
    [follow-camera-collision.md](../../research/combat-and-systems/follow-camera-collision.md)
    (§ Open: a per-instance fade attribute and a `discard` in the
    settlement material patch). The exterior pull-in, the gradual return
    and the player fade landed 2026-09-24 (ledger "Check-in 2 fixes:
    runtime").

    *Status 2026-09-26:* ships with the interior runtime (0103 decision 4; `packages/game-core/src/interior/README.md` § Camera).

25. **Base height-blend shader** (check-in 2 item 1): option 1 of the
    seam research, the seam at a building's foot.
26. **Dressing mine** (research §6 item 5). Evidence only, nothing
    placed by code; sample first per `kit-mining`. From the ~227k
    vanilla and ~131k BM&V non-structural refs the assemblies miner
    skips, those within 12 m of shells, per family: counts and offsets for barrels, firewood, benches, lanterns,
    smoke and gardens. Sets: vanilla, BM&V, HTBM and `kotm`; the first
    KotM sample is the Keeba Hollow compounds and the Seekhat-Yol
    platforms (KotM plan § 2).
27. **Kit additions** (research §6 item 4), from the mined groups:
    imperial farmhouse walkways, porches and steps, farmhouse03–06,
    inn01, smith01; stilt shack window panels; mud BM&V hut windows and
    steps, plus the KotM sets of KotM plan § 3.1 (permission held,
    2026-09-24; meshes and textures extracted 2026-09-24;
    `settlement-mud-v1` KotM pieces blocked on the missing archives, plan
    § 5.1); root Phitt window composites; Dagon Fel into the
    existing `hlaalu-domestic` kit (68 Hlaalu pieces; no new Hlaalu kit);
    the window glow effect meshes in a shared kit. Superseded in order
    and scope by item 33.
29. **Composite-author skill** (research §6 item 2).
    `.claude/skills/composite-author/SKILL.md` §1–2 states the composite
    rule of check-in 2 item 6.
31. **Building checks as gates** (research §2 checks, §6 item 7). Front
    face to a path, window openings clear of neighbours and terrain by
    1 m, the minimum dressing set (door, light, personal clutter, one
    roof detail) and the per-settlement variety table of
    [decision 0098](../../decisions/0098-variety-is-measured-per-settlement-not-by-a-template-cap.md)
    (it replaces the 25 % template cap; the workbench's
    repetition-signature command computes the signature 0098 defines).
    They gate the yard and every 16i plan. The workbench commands behind
    them and the building-assembly skill chapter belong to the
    [placement-workbench lane](../lanes/placement-workbench-lane.md).

Items 32–38 come from
[building-asset-breadth.md](../../research/placement-settlements/building-asset-breadth.md)
(2026-09-24). Item 33 absorbs item 27's kit additions.

32. **Replace the Nordic route pieces.** `route-spans-v1` carries the 9
    `nortmpextplat*` Nordic temple platform pieces and `dragonbridge01`;
    `route-structures-v1` carries `wrcastlestairs01` with its platform.
    All fail 0098 rule 2.1 (Nordic burial and castle silhouettes; breadth
    doc §2 table, Recommendations 3). Replace them with pieces that pass
    (the vanilla imperial-fort bridge and stair pieces are the candidates
    the breadth doc names), rebuild both kits, re-lay the runs that use
    them.
33. **The kit plan** (breadth doc Recommendations 2), in this order:
    1. **Unpack and register King of the Murkmire (KotM) first.**
       `pipeline/bsa.py` unpacks `King of the Murkmire.bsa` to
       `extracted/`; register pool `kotm` in `build_kit.py` `dir_pools`
       and `asset_registry.POOLS`; record authorship per folder
       (`argonia/mudhuts`, `blackwood`, `clutter` the author's own;
       `tesak1243` is mwkeep; `denoffen`, `ayleidruins`, `1mjy`
       third-party); then `mine_assemblies` on `King of the Murkmire.esp`
       for mudhut and blackwood templates, sample first per `kit-mining`.
       **Settled 2026-09-24** (KotM plan, Reconciliation): meshes and
       textures are extracted to the vault's `extracted/meshes` and
       `textures` (3,018 files: 2,292 meshes, 726 textures) and the `kotm` pool is registered (2,096
       rows); 692 meshes name textures held only in the SE resource
       pack, Creation Club or DLC archives (plan § 5.1).
    2. **Mud kit** (`settlement-mud-v1`): KotM mudhuts (30 exterior
       pieces) and its 6 interior shells; BM&V hut window01–03,
       windowbox01, steps01–03; KotM clutter (scalefence, scaletent,
       saxhleelfence, saxhleellantern, townlantern, wallbasket,
       hangingfeathers, tamwindchime, buntingline). Retire the Mud Mother
       hut (`mudhut01`, `mudhut01intnew`, the `mudmother-hut-int` shell)
       in the same change; the pool's other 57 pieces stay. The yard
       rebuild takes the retirement: the yard's mud hut becomes KotM
       `mudhut02`.
    3. **Stilt kit** (`settlement-stilt-v1`): the other 50 shack kit
       pieces; KotM blackwood (thatchhouse ×8, house ×5 with platforms,
       roundhut ×3, walkways 8, plankwall ×5, partitions and windows,
       watchtower, stable, watertower ×2, docks 13) once the lore check
       against material-culture.md:21–24 passes.
    4. **Imperial kit additions** (`settlement-imperial-v1`):
       farmhouse03–06, inn01, smith01, farmlonghouse01, the 6 destroyed
       variants, walkway01–04 and the 28-piece walkway kit, the 14
       remaining terraces, ivy ×3, farmwell01; the Solitude farm set
       (sfarmhouse ×3, porch ×3, steps, shed, silo, windmill, lighthouse,
       lumbermill); cyrfarmhouse01–03, smallhouseext, Jet's farmhouse kit
       (235), the BM&V `imp/` exterior 6, the BM&V chimney kit 13,
       wrshutter ×4, imperial tents 2.
    5. **A new Imperial town kit** (`settlement-imperial-town-v1`): the
       Riften timber houses 17, decks 10 and Riften docks 18 for the
       Imperial waterside quarter (Lilmoth, Gideon ports); the Solitude
       named houses 13 as one-off landmark shells (owner question (b)
       below).
    6. **A new fort kit** (`fort-imperial-v1`): vanilla impext 75, tower
       19, stable kit 9, and the Reimperialized impwindow moss ×6: the
       second fort language beside mwkeep.
    7. **Dagon Fel into `hlaalu-domestic`**: shack01–05, housetall ×2,
       awnings, chimneys, window01–02 and doorframe, for Thorn only.
    8. **A shared dressing kit** (`dressing-v1`): fxsmokechimney01/02,
       fxsmokelargeclose01, whfxwindowglow01–04, fxambwindowglow01,
       lampposts, and the vanilla farmhouse dressing set
       (building-depth-and-variety.md §6 item 7).

    Every family passes 0098 rule 2 first. Credits go in root README
    § Credits in the same change.
34. **Owner sourcing list** (breadth doc §4; ask the owner, download
    nothing until permission is recorded):
    - FYX 3D Shack Kit Walls / Roofs (Yuril), SSE 67123 / 67488: real 3D
      boards on the shack kit the stilt kit uses; terms not stated.
    - Keep and Middle Class Houses (kiko), SSE 137960: 7 town houses, 6
      chimneys, a keep; "free to use", credit optional; lore fit to check.
    - Cyrodiil Farmhouse Tileset (Beyond Skyrim), LE 48582: adds the inn
      and windmill to the 3 cyrfarmhouses we hold.
    - Stroti's Stilt House, optional split file, LE 61824: hut and
      platform apart, so the stilt house stands on our own decks.

    Owner questions carried with it: (b) Solitude's named houses and
    Riften's timber houses as Imperial-quarter shells; (c) the FYX
    author's and kiko's permission.
35. **KotM registry origins** (KotM plan § 4.2–4.3).
    `world/sources/assets/registry-kotm.jsonl` records no third-party
    origin and classes 1,111 of its 2,096 rows `misc` (4 `tree` rows for
    246 `argonia/trees` paths). Add `origin` per path prefix from the
    plan's § 4.3 folder-to-origin table, rerun the taxonomy on a
    25-asset sample first, and credit each origin shipped in root README
    § Credits in the same change as its first kit.
36. **Tropical Skyrim v1.1 in the kits.** The vault's `extracted/` took
    the v1.1 update on 2026-09-24 (sourcing log, Tropical row): the
    plugin and the two trunk meshes under
    `meshes/landscape/trees/tropical/` (`anvil_palm_trunk.nif`,
    `anvilgianttrunk.nif`); v1.0 copies sit beside them as `*.v1_0`.
    No kit config, composite or placement record reads those two
    meshes: every reference is to the root-folder copies
    `tropical:landscape/trees/anvil_palm_trunk` and `.../anvilgianttrunk`
    (`meshes/landscape/trees/`, unchanged by the update), in
    `flora-province-v1.json`:185/230, `settlement-root-v1.json`:448/451,
    `probe-gapfill.json`:7–8, `probe-tall-tropical.json`:38/41,
    `placement-policies.json`:200 and `test_build_kit.py`:165/172; the
    only rows naming the updated files are `registry-tropical.jsonl`:22–23.
    No kit rebuild follows from the meshes. The plugin changed
    (1,987,282 → 1,992,588 B; the update readme: "Fixed objects that
    still had snow on them", "The large trees now have proper
    collision"); its readers are `asset_registry.py`:118,
    `mine_groundcover` and `mine_micro_siting`. Whether their records are
    re-mined from v1.1 is the planner's call; the bootstrap snapshot
    (`tooling/bootstrap/snapshot-manifest.json`:971–999) no longer
    matches the vault folder.
37. **Project Rainforest as a second texture overlay.** Add
    `mod-sources/project-rainforest-20636/extracted` to
    `build_kit.vanilla_texture_roots` (build_kit.py:232–250) behind
    Tropical Skyrim and ahead of the vanilla BSA, so a texture Tropical
    leaves unchanged resolves to Project Rainforest's repaint where one
    exists. What it adds (breadth doc §2): Windhelm street and ground
    maps (6 diffuse: whstreetstone01, whroughground*, whdirtbrick…),
    caves 12 diffuse, dungeon root 5, Whiterun 2. Its nordic, imperial,
    dwemer, mines and Riften-dungeon files (192) are vanilla copies and
    change nothing. The per-file classification is
    `docs/research/archive/building-depth-2026-09/diffuse-classes.tsv`
    (pool `PR`). `test_tropical_default.py` gains the second root's
    order; the README.md:157 credit scope widens from "tropical ground
    textures" to "tropical ground textures and the Windhelm street and
    ground and cave repaints" in the same change. Licence: "Patches,
    bugfixes, updates, add-ons, third-party retextures, and the like are
    allowed freely ... as long as due credit is given."
38. **SCO Tropical and New Windhelm tropical repaints** (owner
    2026-09-25: permission held; download and use). Download SCO
    Tropical Edition v2 (Tamikonelf and AceeQ, skyrim 69382) and New
    Windhelm summer and tropical edition v2 (tamikoneolf, skyrim 63649,
    built on Osmodius's Windhelm Texture Pack, skyrim 54322) with the
    Nexus API into `mod-sources/` with hashes, a sourcing-log row, a
    mod-register entry and the README.md credit in the same change. They
    cover Markarth, Windhelm, Winterhold, High Hrothgar, the Imperial
    forts and the caves (69382) and all of Windhelm (63649). They add
    texture overlays in `build_kit.vanilla_texture_roots` the way item 37
    adds Project Rainforest. Under decision 0098 §2 these families still
    fail the silhouette rule (rule 1), so the repaints matter for pieces
    that pass it: Markarth or Windhelm stone used as an alias target, and
    fort walls. Re-derive the breadth doc §2 verdict table after the
    overlay.

Planner rulings (2026-09-24):
- The variety rule is decision 0098's per-settlement table; it replaces
  the 25 % template cap and the earlier ruling that the cap counts
  assemblies.
- A piece may sit where its mod never placed it when it is fitted on
  measured geometry in the workbench and passes a visual check.

#### 16h part 1 open items (text in [16h](16h-settlement-runtime-and-kit-qa.md) § Part 1 state › Open, in order, unless given here)

- 0c terrain patch for dug-in pieces (cave
  flanks); 0d runtime wet-stilt datum; 0f cutaway view; 2 truth-table
  fix path; 5 mount sheets pass 2; the deck `contactsM` source; miner
  items 1–7; and, deferred by the owner on 2026-09-25 (hand-off ruling 5):
  - **Vanilla rock cave entrance** (for the dungeon-entrance slice, type 5).
    The yard's `doorcaveb` is a philscaves interior tileset piece that no
    plugin places outdoors. Vanilla builds a cave mouth from
    `landscape/rocks/rockcaveentrance01.nif` plus an invisible
    `autoloadmarker01` load door: 91 AutoLoadDoor01 refs stand within 12 m of
    a cave static in Skyrim.esm. Take the marker's median pose relative to the
    rock (mine it on a 25-ref sample first, the mine_mounts way), record it as
    the composite's door with `interior: promised`, and keep the flanks as a
    ground raise. Diagnosis: 16h brief § Part 1 state, check-in 3 row C3-6
    (vault paths and door counts).
  - **Landing stage reaches dry ground** (for the first water-village or
    works-and-landing slice, type 3 or 7). Owner rule, 2026-09-25: never pick
    a step piece by drop alone. (1) The landward tip, and the whole foot of
    the closing piece, stand over ground at least 0.2 m above the local water
    surface. (2) Extend the run with 7.1 m straight sections, or shift it
    along its axis if that needs fewer pieces. (3) Close it with the smallest
    catalogued drop piece whose drop is at least deck minus dry ground,
    sunk by the recorded remainder. (4) Gate: tip over dry ground, the foot on
    dry ground within 0.05 m, no open run end. Author it in
    `anchor_quay_run` and in the modular-runs skill. Diagnosis: 16h brief
    § Part 1 state, row C3-7 (the yard's quay-run-2: the bank never reaches
    the 18.60 m deck within 40 m).
  - **Yard B wall run floats at its low end** (found 2026-09-25 by the
    A/B gates): with the run seated as one rigid chain (259b200a) on
    yard B's 5-piece slope, pieces 4 and 5 stand 0.35 m and 0.32 m over
    their lowest ground (`test_no_published_yard_piece_floats_or_misplaces_its_sill[B]`
    red). The compile's datum is the run's highest ground; the pad grade
    under the run is not in the heightfield (`pendingPadGrades`). Closes
    with item 13 (pads as patches) or a planner ruling on per-run bury.
  - **KotM mud huts' interiors** (`test_interiors_index` red on six
    `kotm:argonia/mudhuts/*` shells). The King of the Murkmire plugin
    links only `smpodext02` (five Keeba house cells: KeebaHouseElder,
    -Crafter, -Fisher, -SnailMinder, -Treeminder); `lizardhouse`,
    `mudhut01` and `smpodext01` stand in its world with no load door of
    their own, and `manorext` and `shed` are not placed at all. The tracked
    `exterior-interior-links.json` predates the kotm pool (its 50 mined
    plugins do not include it), so the link rule never saw KotM. Needs: a
    re-mine of the door links with the kotm pool, a `promised` interior
    state for a linked shell whose interior cells have no built kit, and a
    planner ruling on the five unlinked shells (no doorway may be invented).
  - **The published vegetation release lacks the track clearance.** On
    2026-09-25 `apply_vegetation_patches` over the release bundles (which
    matched `rasters-manifest.json`) removed 26 969 instances over 157
    chunks for the 184 `patch.clearance.track.*` patches, while the receipt
    reads 0 removed. The next province publish must run the apply stage
    first; the 24 `patch.clearance.settlement.*` patches ride with it.

#### From 16i (the exemplar chunk, retired)

0. **Reconcile the first round's lessons and the interior research.**
   DONE 2026-09-25 as the seeding of `place-build/references/lessons.md`
   (16k slice 1b); the interior half's ruling (a kit's `matched` mesh is
   not tier A; `tileset` shells are Phase 12's; one entrance per piece)
   is `place-build/references/doors-interiors-sockets.md` §2.

1. **The dungeon-kind place (now the type-5 slice's place).** Choose one
   dungeon-kind record (`interior.kind` in delve, dungeon, warren,
   complex) by these criteria, all measured: not `ownerGuided`; its
   family maps to a realisation recipe backed by a kit that exists (0062
   §2, world 70 §47's recipe table); an entrance piece exists in a kit
   for its `entrance` type; it satisfies the contrast rule (a type not yet
   passing, in a contrasting region); its promises (world 70 §48) are
   complete. Prefer a root cavern or flooded cave mouth where the owner's
   own example applies (rocks around a cave entrance as `dressing-add`).
   Record the choice and the two runners-up with the numbers in the
   slice's design brief; the owner may swap at the walk. Write its entry
   in `type-recipes.json` so later packets can count it. Its cave door is
   `reserved`: its inside is Phase 12's first exemplar, a modular root
   cavern (0062 §5). The vanilla rock cave entrance row above
   (16h part 1 deferred items) is its entrance piece.

4. **Interior claims, one per door, as records** (0103 decisions 1–2).
   The procedure (shells chosen for their interiors, the deterministic
   fit rule over the shell's linked set, `blueprint_interiors.py --claim`,
   matched meshes stay `reserved` with `interiorShell`, the D0 safe
   interior, the empty `acousticProfile` / `lightingProfile` slots) is
   `place-build/references/doors-interiors-sockets.md` §2. 0103 decision 1
   supersedes 16i's borrowing of a fitted cell for an unlinked shell, and
   [0105](../../decisions/0105-setting-class-reserved-doors-lights-band-planned-variety.md) R2 narrows `reserved` to tier B and C interiors: a house, shop,
   stable house or workplace on an unlinked shell is re-shelled, or, for a
   doorless hut, dressed inside as exterior placements and walked into. What stays
   here as work: the use-class classifier is proved on a 12-cell labelled
   sample (inn, shop, shrine, dwelling; labels written first), then a
   fresh 12, before any claim is written
   ([16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md)
   step 4). First Argonian tier A candidates: the 18 King of the Murkmire
   hut cells behind its hut shells (Keeba Hollow 5, Root-Whisper 6,
   Seekhat-Yol 7; KotM plan § 3.2); copy furniture and clutter only, drop
   actors, quest items, notes and books (books and notes become item
   sockets with `contentPending`, 0103 decision 3). The claims show as one
   table per place on the plan render's margin: door, claim, evidence,
   cell, size ratio.

5. **The interior runtime** (0062 §3, 0081, 0103 decisions 3–4). The
   contract (door transition, one bundle per cell streamed on approach,
   interior lighting from the plugin's light records, the interior camera,
   the `?interior=<cellId>` studio view, the reserved door and its
   message) is `place-build/references/doors-interiors-sockets.md` §3–4;
   the code is `packages/game-core/src/interior/` behind injected hosts
   and `worldgen/export_interior_bundle.py`. Tests: a door with a tier A
   claim opens into a bundle whose count matches the cell (placements plus
   listed drops equal the cell's reference count); a reserved door does
   not transition and the message key resolves; leaving returns the
   character within 0.5 m of the `arrivalMarker`; an interior bundle with
   an unlisted gap fails export. The light decode is checked on 6 claimed
   cells plus 6 others against counts and colours read from the plugin
   first; no full plugin re-index as verification
   ([16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md)
   step 6). Measure the lighting cost per cell and record it. An interior
   renderer for the reader (plan view and one eye-level view from the
   arrival marker, light sources marked) joins `render --shots`. Interior
   navmesh bakes wait for 10b and the record says so.

9. **Approach, reveal, wayfinding on the ground.** The 16-question
   checklist per approach per place; procedure in
   `place-build/references/doors-interiors-sockets.md` §6 and SKILL
   step 1 § Approach.

12. **The place skill, rewritten each fix round** (was "skill v2"). The
    `place-build` skill holds the steps the places actually needed, in
    order, with the tools they ran; the interior claim as a step; per
    field, the record that supplies it (graph id, `water-meta` id, route
    line, `designedSinkM`, plugin link); every sentence no longer true is
    deleted. Its "Not automated yet" section lists honestly what still
    needed a hand (kit choice per parcel, `waterOk` reasons) so the
    unattended passes can measure the gap.

13. **The type register.** `world/sources/catalogue/type-recipes.json`
    records which type each loop place is and which grammar it proved
    (Imperial-fringe, Hist-centred, …); world 96 §3's box 1 is ticked per
    type with the place named; a recipe that needed a hand decision is a
    gap closed in the recipe, so the next agent does not meet it again.

- **Type 8 carries the city work:** the Blackrose city pass (16g call 2;
  Blackrose spreads from its island over the lake and shore) and
  Lilmoth's second round (0062 §9: cities are owner-guided, expect two
  rounds). Lilmoth takes King of the Murkmire's 8.5 m street spacing and
  dock density only; `lilmoth.md` § Lilmoth in 4E 201 (owner decision Q4)
  rejects KotM's Imperial-industrial Lilmoth.

#### From 16j (the unattended-packet chunk, retired)

2. **The co-design quest pass, per slice** (quests 90 §65b). The place's
   settlement set, routes and sockets are already the 16g record; the
   quest-brief pass drafts the place's local quests to brief level only
   (premise, cast, choice, size, provision list) and may request
   placements; reconcile: place what the briefs request or negotiate
   substitutes, register sockets and ids (0103's `sockets[]`); declare
   the place's density against plan ruling 11's budget. Prose through
   `text-review`.

6. **Close the gaps in the skills, not in the places.** Every hand
   decision a slice needed is a skill step (written into `place-build`,
   with the rule that makes it), a record field (added to the schema and
   back-filled for every loop place) or an owner call (batched into the
   next walk packet with the options). Re-run the changed steps on the
   place to show the skill now makes the decision.

7. **Automation readiness** (world 96 §3) per type, with evidence: the
   two places named, the rules named, the clean compile from the
   blueprint alone, the recipe's siting grammar, the sourcing register
   clean. The agent-as-reviewer experiment (0041): a fresh agent reads the
   renders and the probes of one non-city place and gives a verdict
   before the owner walks; the two verdicts are compared in the slice's
   lessons.

7b. **Place-scoped tooling.** `rederive_blueprints`,
    `export_settlement_bundle`, `apply_vegetation_patches` and
    `settlement_ground_control` each gain a `--places` / changed-set
    selector, so a place re-derives, exports, patches and paints only its
    own ids; the full run happens only at freeze. Test: a run with
    `--places` on one place leaves every other place's output
    byte-identical. *Status 2026-09-26:* `export_settlement_bundle
    --places` exists (slice 1b); a place's pads and clearance travel in
    its bundle (0102 decision 1), so the others matter only at freeze.

8. **The hand-off to Phase 15** (at the loop's exit).
   `docs/phases/15-rollout/roadmap.md`: every remaining packet in order
   with rough scope, region, place count, the types each needs, the route
   structures and berths each owes, major cities and the opening-scene
   places flagged owner-guided, for owner sign-off;
   `docs/phases/15-rollout/packet-template.md` written to the spec in
   `place-build/references/rollout-packet-template.md`, with the template
   decision per minor type; `15-rollout/README.md` reconciled with it.

9. **Phase 16 closes** (at the loop's exit). The ledger; one decision
   record (the types passed, the gaps closed, the readiness verdict per
   type); the "chunk Phase 9" job queued as the next owner instruction in
   PROGRESS.md (0062 §10: the 9a/9b/9c briefs are written by that job);
   PROGRESS row 16 `done` with evidence and row 15 `todo` with the roadmap
   linked; the Phase 16 README §4 table completed; `docs:check`,
   preflight, commit by pathspec; the `routing-audit` skill over the whole
   Phase 16 routed set.

#### New rows and speed items

- **New rows:** G1 settlement path and worn-ground paint; R1 retaining
  walls; R2 enclosure; R3 cook fire and forge glow; R4 crops and fish
  parks; R5 boats pulled up and moorings; R6 wet and worn ground; R7
  lit at range and skyline.
- **Speed (S), re-based on the 2026-09-27 deep dive**
  (`tooling/.reports/16k/walk2/speed-deep-dive.md`: lanes split 48 %
  tool waits / 52 % model turns; the place lane is turn-bound; our own
  6-core pin plus the watchdog pausing single pytest workers is the
  contention; placement is 101 s alone, pipeline 78 s at `-n 4`). In
  priority order, "speed lane 2": S1 **batch the loop**: a `wb round`
  wrapper runs apply + check + walktable + shots in one call, `check
  --only <uids>` judges the named pieces' rows, pairs and per-piece
  rules; the graph rules rerun in `wb round`, and `wb.py scan`
  (site feasibility per candidate pose: pad legality with batter,
  road-paint overlap, water depth on a bearing, designed sinks, porch
  and stair reach) runs before any edit; the skill rules are one layout
  diff per batch of findings, recommend-and-do, fan-out inside the
  lane, a fresh agent per round (SKILL § How the builder works; the
  walk-2 round took five rounds of ~1 h, mostly waits for rulings and
  serial sub-jobs) (12–18 min per place, more on the first place of a
  type); S2 the watchdog never pauses a lone test worker, pause
  threshold 95 %, heavy jobs on cores 1–7 (3–6 min per loaded
  preflight); S3 `--paths` selects the tests a change touches, not the
  whole 3,233-test placement suite (3–5 min); S4 preflight labels a red
  already present on HEAD as pre-existing, with one owner lane (2–5 min
  per lane); S5 pipeline suite at `-n auto` with the Blender test marked
  slow, street routes cached on disk by input hash (A* is 66 % of a
  compile), shared workbench fixtures, a parsed-plugin cache in the
  interior exporter, `family_of` memoised, `build_kit` input-hash skip
  (1–2 min each); S6 the miners' batch mode; S7 review once per logical
  change. The old S1–S5 figures were contention, not tool cost.
- **Speed, method review round 2** (`tooling/.reports/16k/walk2/method-review-r2.md`):
  - S8 (speed lane 3, rollout blocker): the runtime reads
    `settlements/index.json` and the per-place bundles within range, one
    game-core loader the four whole-file readers subscribe to
    (settlements.json is 1.96 MB for 3 places; ~775 MB composed site at
    580 places, over the 750 MB warn).
  - S9: a lock on the review stamp's read-modify-write
    (`review_gate.py` `write_stamp`), so parallel preflights keep their
    stamps.
  - S10: `layout_template.py` per type, written at the first slice close
    of the type from that place's layout (Claywater writes type 1's) and
    named in the type sheet.
  - S11: `close_place.py` does the slice close mechanics (receipt,
    type-recipes row, register digest, creative-register row, Starting
    state stub).
  - S12: `commit_place.py --place <id>` stages a place's per-place files
    only, from its manifest, so parallel lanes never race on git; shared
    files change only through the REQUEST rows below.
- **Speed, method review round 3** (`tooling/.reports/16k/walk2/method-review-r3.md`):
  - S13: `site_packet.py` (the step-0 site packet) and the register
    digest (one line per built place, generated from the briefs).
  - S14: `place_gates`, one command per place: the 0102 rules, the
    promise, socket and interior gates, the 0098 bars; the yard
    regression gates run per batch, not per place.
  - S15: the edit-by-uid CLI for layout ops (in the workbench lane now).
  - S16: the batch pre-pass: the batch's interior kits built, a shell →
    cell claim table per culture pool so `blueprint_interiors --claim`
    is a lookup (it took 111.5 s), and the kits' size list checked
    against the site budget (interior kits weigh 3.9–8.1 MB each and are
    missing from S8's 775 MB estimate).
  - S17: `wb round --report-dir tooling/.reports/16k/<place>/round-N/`
    writes `summary.json`, `rounds.jsonl`, the scan output and
    `waiting-on.json` (the tooling tasks the round waits on).
  - S18: `wb.py walktable` links use the deployed Pages URL, never
    `ES_TUNNEL_URL` (wb.py:1238).
  - Also queued: `workbench/parallel.py` sizes its pool from the job
    guard's core share (`ES_JOB_CORES`), not only `WB_WORKERS`; the
    review gate's EXCLUDE_SPECS gains `world/sources/blueprints/*.design.md`
    (the 250 KB diff cap refuses a batch at ~11 briefs; `text-review`
    owns that prose); the 0098 signature is CLAIMED under a lock at the
    brief step (a row in `world/sources/placement/signature-claims.json`)
    so parallel builders cannot race, and the batch gate recounts; the
    C7 cache is keyed by content and its npz written atomically; one
    integrator lane applies each batch's REQUEST rows
    (`tooling/.reports/16k/<place>/requests.jsonl`) under a lock.
- Method review rounds 1–3 (2026-09-27, `method-review*.md`) exited on
  measurement: round 4 is the timing of place 2 of type 1 through
  S8–S18; a read-only round only reopens if that timing exceeds the
  17-minute proven-type target.
- **Speed and tool rows from walk 2 and slice 2** (2026-09-27, the close-out lane; S19 from the Claywater residual, S20-S25 from Greenspring, S26 on):
  - S19 (from Claywater walk-2 residual, planner ruling 2026-09-27): a deck seat in the workbench, `wb.py settle --on <walkable deck>`, that stands a piece on a piled deck's top by support from below (0085), with a fail-first test; `mine_mounts` makes no pair for a deck-standing reference (mine_mounts.py:1517-1519), none of fishrack01's 58 vanilla references stands on a dockstrent deck, and the Claywater fish rack stands on the ground beside the landing until this exists.
  - S20 (Greenspring rec 2): `wb scan` dressing mode: seat every dressing piece by search on the padded ground (slope and delta, overlap, path paint, a 3.5 m door apron); prior art `tooling/.reports/16k/place.hist-heartland.greenspring/seat_dressing.py` (31 of 43 pieces failed the first apply on a 5-8 deg slope; the search seated all but 3 in 3 s).
  - S21 (Greenspring rec 3): `wb scan` judges overlapping pads (the padded slope falls back to the frozen grid under an overlap; scan passed b-lodge while check read 8.0 deg).
  - S22 (Greenspring rec 5): claim_signature's COUNTED_USES (tooling/world-generation/worldgen/claim_signature.py:43) buckets uses as blueprint.USE_BUCKET does (a `shrine`-use spring house counted as no building).
  - S23 (Greenspring rec 6): claim_signature and place_gates take the scene the layout was applied to (`wb apply --scene NAME` left both on a missing default scene).
  - S24 (Greenspring rec 7): 0098 counts shells by base mesh, not composite id (a second composite of the same pod would pass as a new shell; the Argonian pool's 3 tier A cells all stand on smpodext02).
  - S25 (Greenspring): the mounts miner groups scaled placements by placement scale as the sink miner does since 62466305 (mine_mounts.py:849 skips them; hutexterior reads `unplaced`, n 0, though Black Marsh places it 11 times at scale 1.30).
  - S26 (Claywater residual, composite-author job): a KotM `mudhut02` + KotM stairs composite as the source plugin places it, so the upper-storey door (sill 4.72-4.82 m above the walk surface at all 20 scanned poses) is reached by its own stair; then the 0098 top-shell exception in Claywater's `variety.exceptions[]` can go and KeebaHouseElder becomes a usable tier A cell for type 1 and type 2 places.
  - S27 (build ledger, over target): Greenspring, run `place.hist-heartland.greenspring#1`, new type, 64 min wall against the 40 min target (orient and dossier 12, survey and scans 15, layout to compile 22, rounds 7, readers 6, gates 2; hand row, 2026-09-27). The layout-to-compile (22) and survey (15) stages are over their share; S20 (dressing seated by search: 31 of 43 pieces failed the first apply) and S21 (overlapping pads found only at check) are the tool tasks that cut them. The next run is timed by the stage events (`build_ledger.py stage`, SKILL steps 0-6), never a hand row.
  - S28 (breadth bars, 2026-09-27 close-out): three of the seven breadth bars still have no gate (`place_gates.NOT_MEASURED`): `clutterPiecesMin` needs a personal-clutter marker (a `clutter-personal` layer on yard-set members, or a rule that clutter on the dwelling's own parcel within N m of its door counts); `groundKindsMin` needs a surface-material record on the compiled place (only route kinds exist); `enclosureKindsMin` needs a record of which parcels or pieces are an enclosure kind. Each is a planner ruling, then a gate with a fail-first test (`tooling/.reports/16k/walk2/closeout-D.md`).
  - S29 (incremental mining, owner 2026-09-28, first speed-up item): a piece joining the pool is mined for its own sink, mounts and abuts rows and pairs only (seconds); a full run is only for a rule change (0106). Walk 3: one stable cost an 83 min abuts run and an 18 min mounts run.
  - S30 (the placement preflight gate is not scoped, owner 2026-09-28): it ran 224-292 s per run on walk 3, three times per commit, re-running tests already red on HEAD. Select placement tests by the paths touched (the same selection `npm test` has), skip known-red-on-HEAD tests with a label, target under 30 s scoped.

## Build cost is measured as data (owner 2026-09-27)

Three paths, each with a target: **new type** (the first place of a type,
no template: ~40 min wall), **template** (a later place of a proven
type: ~17 min), **fix round** (after a walk: ~10 min). Every place-build
run appends one row to `docs/phases/16-foundation-and-places/build-ledger.jsonl`,
written by the tools (`wb round`, `place_gates`, `close_place.py`), never
by hand: place id, type, path, the skill and tool versions (the git shas
of `place-build/SKILL.md` and `tooling/placement-workbench`), wall minutes
per stage from `rounds.jsonl`, Opus and cheap-agent turns, CPU minutes,
rounds, and, filled at the walk, the owner's defect count. `build_ledger.py
--report` prints the trend per path and per skill version and lists every
run over its target; a run over target files a tooling task (S-list row)
the same day. Method reviews (`tooling/.reports/16k/walk2/method-review*.md`,
rounds 1–3 on 2026-09-27, ~3,500 s per place saved, exited on
measurement) are indexed in `docs/research/phase16/method-reviews.md`
(round, date, savings, exit reason); a read-only review round reopens
only when the ledger shows a run over target. Each slice's Starting state
quotes the last ledger rows, so a new session sees the numbers. Phase 15
inherits the ledger and the targets per region packet.

## Acceptance (the exit bar, signed by the owner 2026-09-25, hand-off ruling 2)

- Every type on the signed list has two fresh places in a row that
  passed unattended with no defect from the owner's walk (types 8 and 9
  by owner acceptance).
- Every Gate row of the checklist is an automatic check that was shown
  failing first on a real defect.
- The breadth bars and the within-place variety number exist as data
  the skill reads; every loop place meets its tier's 0098 bars.
- The template decision recorded per minor type; the Phase 15 roadmap
  and packet template written; `docs/phases/15-rollout/README.md`
  rewritten for the proven skill set.

## Owner check-ins

- **Once, before slice 1's place is designed:** signed 2026-09-25 (the
  type list with type 9, the exit bar, the Gate column; Claywater Station
  confirmed).
- **Every walk** (owner 2026-09-27; the packet form is `place-build`
  SKILL step 6): short, plain English, no per-item tables, every
  in-world thing introduced, deployed-studio links only (the anchor,
  each interior, the sockets view), "what changed since the last walk",
  one line of numbers, at most eight look-and-feel checks; at most ~20
  lines per place, so one packet holds 4–6 places, one anchor link each
  in road order, and the owner walks them in one session.
- **A type's in-a-row pair** (method review r3): once a type's first
  place is accepted, its next two places go to the owner in ONE packet.
  **How to reply.** Walk it and say what looks wrong, in one message;
  "looks right" when the place is done. A "wrong" becomes a fix to a
  rule or a record, never a nudge to one piece.
- **World-level calls** (a place moved or cut, a new type, a city
  choice) are asked as they arise, batched into the next walk packet.
  Queued: none (the 97 A7 call was closed 2026-09-26, 0102 decision 9).
- **Phase 15 walk sampling** (owner 2026-09-28, [0105](../../decisions/0105-setting-class-reserved-doors-lights-band-planned-variety.md) R7): the owner
  walks every major city, the opening-scene places, and one or two of
  each place type.
- **What the owner is never asked** (0102 decisions 2–3): anything a
  `check` rule measures (can you walk in, does a floor hang over a drop,
  is the craft beached, does the path reach the door, does a prop stand
  on the ground), and unfinished work listed as a gap.

## Gotchas

- A fix to a place record is a failure of the loop: fix the rule, the
  gate or the skill, then edit the place (SKILL step 7: every op keeps
  its `uid`; never a rebuild).
- An accepted place is frozen (0100 decision 6): a change to its compiled
  record fails the build without a `reopened` entry (owner date and
  reason); gates added later run on it in report mode only.
- Publish the place only (`--places`); a whole-catalogue compile or
  re-mine runs only after a fresh sample batch passes.
- The yard runs as regression gates once per batch (a place's data never
  touches the yard fixtures); a batch that breaks a yard gate is not
  ready to walk.
- Waiting is the hand-back or `run_in_background`; if a builder is slow,
  the speed item is the fix.
- Claywater Station's `culture` is imperial with `secondaryCultures`
  [argonian] (its kits are checked against
  `world/sources/placement/culture-kits.json`): the record is two
  communities, the Imperial well and the Argonian landing on one road.
  Read the grammar against 97 Part F as two halves facing each other,
  not a village of either culture alone: `settlement-imperial-v1` with
  the farm-fence family on one side, `settlement-mud-v1` with its
  founding reason on the other (never `argonian-stilt` off its zones).
- Player-visible text (catalogue prose, `why` lines, door messages) goes
  through `text-review` in a separate agent before commit.

## The story, in plain English (for the owner)

**Where we are.** The land, water, roads and plants are finished. The
test yard showed us how building pieces go wrong and has been fixed
three times. What we do not yet have is a real village you can walk
into.

**What changes.** Instead of three more planning stages, we build one
real place at a time. The agent designs it on its own, having read
about every other place so this one is not a copy: it writes down the
whole layout at once, checks a flat plan of it in seconds, then looks at
3D pictures and adjusts, at most four times. It builds it and runs
the automatic checks. Then you walk it and say what is wrong in one
message. Every problem becomes a rule and an automatic check, so it
cannot come back, and the recipe improves. You walk again, and we repeat
until you say it looks right. Only then do we build the next place, of a
different kind somewhere else.

**The first place** is Claywater Station, a road-station village on the
main road between Gideon and Blackwood, where an Imperial well and an
Argonian boat landing serve the same travellers. It needs no other place
built first and sits well clear of any city. A place you have accepted
is then locked, so later work cannot change it without asking you.

**Going indoors, and what each place promises.** Most buildings you
can walk into get their inside now, not years later. The mods we use
already made furnished rooms for many of their buildings, so we choose
buildings that come with a room and copy that room exactly: the
furniture, the clutter, the lamps and their light. You press the action
key at the door, the screen fades, and you are inside; the door inside
takes you back to the same doorstep. The few doors with no ready-made
room stay shut with a short message, and say which set of buildings
they wait for. Everything a place will later need (who lives where and
where they sleep, work and sit, what is in each barrel and chest, where
danger or a sound belongs) is placed now as a labelled marker with its
details written down, so the later stages that add people, loot and
sound only fill them in. You can switch the markers on in the studio to
see them.

**When it ends.** When every kind of place on your list has come out
right twice in a row without your help, the recipe is trusted and the
rest of the province is built with it later, with simple kinds such as
camps made from varied templates.
