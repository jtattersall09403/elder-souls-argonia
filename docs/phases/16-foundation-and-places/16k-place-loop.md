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

## Starting state (2026-09-25 13:43 UTC, from `tooling/.reports/plan/place-audit.md` §4; the closing agent of each slice replaces this section)

- HEAD ee5d853c (watchdog); e56a4a4f infra lane (CPU watchdog,
  `job_guard.sh`, `ES_JOBS` cap, path-scoped preflight, `sleep` guard,
  `lane_resume.py`); 259b200a check-in 3 runtime fixes (camera aims along
  a direction, runs seat as one rigid chain, decal bias, deck/floor
  treatments); dc4056f9 workbench rounds 3–4 (yard B authored in the
  workbench, compiled with 0 errors, published); 310a2bf2 miner golden
  red cleared.
- Dirty: ` M tooling/repo-standards/baseline-singletons.json`, left on
  purpose by the infra lane.
- Check-in 3 fix round in flight: runtime lane done except the deck
  `contactsM` source (no record holds leg or stair contact geometry;
  `tooling/.reports/16h/runtime-fixes.md`); wall-run joints, camera swing
  and hut-leaf causes in `tooling/.reports/16h/checkin3-diagnosis.md`.
- Miner: 2 of 3 tests fixed; `test_the_record_single_use_is_the_derived_set`
  red (814 vs 825); the full mounts/sink/abuts runs are blocked on the
  miners' batch mode and disk (`tooling/.reports/miner/relaunch-2026-09-25.md`).
- Combat r7: `preflight --paths` ran; placement red `0o666 == 0o644` at
  `worldgen/test_export_settlement_bundle.py:1091` (codespace umask, an
  environment defect).
- Known reds: `settlementCollision.test.ts:142` (141 vs 152); standard 6
  `vault_inventory.py:559/563`; `test_mine_abuts` single-use;
  `test_proving_ground` stilt door leaf 6.256 m; `test_interiors_index`
  (KotM mud hut); `test_weapon_records` ×2 FileNotFound; the file-mode test.
- Unfinished lane 7f2405fa `[deliver] KotM + stilt window kit work`, idle
  ~21 h, cut on a `sleep` poll; it overlaps items 28 and 33: dismiss or
  relaunch it before new work.
- Contradiction to settle in slice 1: PROGRESS.md "road-wear ground
  paint cut" against 16h:319/:521 "paths are part 2's ground paint, at
  the front". The cut is road wear on the legs; settlement path paint
  stays (item G1 below).

## Read (fresh agent: this is your whole map)

- [0099](../../decisions/0099-places-are-built-in-a-loop-until-the-skill-is-proven.md) in full; [0098](../../decisions/0098-variety-is-measured-per-settlement-not-by-a-template-cap.md) § Decisions; [0097](../../decisions/0097-placement-is-authored-in-a-workbench-and-the-pose-record-is-the-output.md); [0081](../../decisions/0081-building-blocks-then-exemplars-then-rollout-and-doors-are-transitions.md) decisions 3–6 (doors, patches).
- `tooling/.reports/plan/place-audit.md` (the checklist's source) and
  `tooling/.reports/audit/time-audit-2026-09-25.md` § (e).
- Skills: `placement-workbench`, `settlement-build`, `kit-build`,
  `modular-runs`, `composite-author`, `text-review`.
- [world 97](../../world/97-placement-principles.md) Parts A, C7 and F;
  [quests 20](../../quests/20-world-provisions.md) for the slice's place.
- The carried item's own text in [16h](16h-settlement-runtime-and-kit-qa.md)
  § Deliver part 2, [16i](16i-exemplars-end-to-end.md) § Deliver or
  [16j](16j-rollout-skill-and-trial-packet.md) § Deliver, only when the
  slice takes that item.

## The loop (every slice)

1. **Before the build (unattended).** Read the register: the 16g
   catalogue record, its promises and quest provisions, the macro plot,
   and every place already built in the loop (type, culture, shells,
   signature assemblies), so the new place repeats none of them (0098's
   one-assembly bars, 97:130–134 spacing). Write the design: a 2D
   blueprint plan (`render_blueprint.py`, extended per item 19), read by
   a Sonnet image reader against written expectations; then the 3D layout
   in the workbench (`wb.py`: place, snap, settle, `check` before every
   render, `compile` as the inner loop, export the pose record).
2. **Build and gate (unattended).** Local patches (pad, clearance,
   dressing-add), compile, publish the place only (`--places` scope, item
   7b), the automatic gates: every essential checklist row below, the
   0098 bars, the yard regression gates, `preflight --paths`.
3. **Walk packet** (Owner check-ins below) → the owner walks.
4. **One fix round** (`continue 16k slice N after owner walk`): group the
   owner's defects by cause across the whole reply; each cause becomes a
   rule (97 §C or the skill), a test or gate shown failing first on the
   defect, and a skill edit; one preflight, one republish, the next
   walk packet.
5. **Repeat 3–4** until the owner says it looks right. Then the slice's
   ledger row, the next slice's Starting state, and the next slice: a
   fresh place of a different type in a contrasting region.
6. **While the owner walks,** the agent does the work the walk cannot
   change: the next slice's register reads, research and sourcing,
   speed items (S below), template studies. Never an idle wait.

## The checklist ("good enough" for a place)

The audit's table with its coverage (2026-09-25). **Gate** marks the
rows proposed as essential before rollout; the owner signs this column
with the type list. A gate row is an automatic check in step 2 from the
slice that first builds it.

| Row | Covered by (carried item) | Gate |
|---|---|---|
| Seated, joined (runs as one rigid chain) | 16h items 1–4, 7; 259b200a | yes |
| Doors as transitions (reserved or claimed) | 0081; items 11, 18; 16i items 4–5 | yes |
| Windows glowing at night | item 28 (done) | yes |
| Paths and worn ground to every door | G1 ground paint; widths 97:341, :852 | yes |
| Ground-to-wall blend | item 25 | yes |
| Pads, retaining walls, steps | items 12, 13; retaining walls: new rule R1 | yes |
| Enclosure (fences, walls as a placed rule) | new rule R2 (97 Part F column) | yes |
| Yard dressing vocabulary | items 15, 17, 23, 26 | yes |
| Lights by time of day (sconces, lanterns) | item 22 | yes |
| Fire and smoke (chimney, cook fire, forge glow) | chimney smoke in dressing-v1; cook fire and forge: new R3 | yes |
| Signage, banners, totems, shrines | mount sheets; totems 97:757 | no |
| Gardens, crops, kept trees | kept trees item 14; crops: new R4 (Argonian crops are a sourcing gap) | no |
| Water edge (docks, reeds, boats pulled up, moorings, wheels) | items 10, 16; boats pulled up and moorings: new R5 | yes where the place touches water |
| Wear (moss, mud, puddles, wet ground) | 0098 condition axis; new R6 | no |
| Idle occupants (people and animals) | new O1 (thin pass; movement AI stays 10b/13) | yes |
| Ambience and footstep surfaces | 0095 rule 5; studio wiring (backlog row) | no |
| Seen from a distance (lit at range, skyline) | item 5; new R7 | yes |
| Interiors (tier A verbatim, else reserved) | 16i items 4–5; Phase 12 | tier A only |
| Navmesh | Phase 10b | no |
| Map marker, discovery | catalogue `discovery`; Phase 13 | no |

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
<agent-id>` as each brief, same agent type): the kit/yard lane, the miner
full run (after its batch mode lands, item M7 of the 16h miner list) and
the combat round-7 close. Dismiss or relaunch 7f2405fa. Turn every
check-in 1–3 yard defect into an automatic gate on proving grounds A and
B (0099 decision 7); the yard is not walked again. 16h part 1 closes on
green gates and the ledger row.

**1b. Set the bars.** Before the place is designed: the breadth bars as
numbers the skill reads, from `building-asset-breadth.md` §3,
`building-depth-and-variety.md` §5 and 0098 (Fable writes the numbers
and their record); the within-place variety number (yard, ground,
lights, enclosure kinds) beside 0098; building-depth §5 brought in line
with 0098; the checklist's Gate column signed by the owner.

**1c. The first real place: Chasepoint**
(`place.mercantile-coast.chasepoint`). A road-station village (M2,
`simple`, footprint 65 m): an Imperial way-station the wreck-salvage
families squat, reed-roofed, its yard stacked with ships' timber. It sits
25 m off the Gideon–Soulrest leg (`route.road.gideon-soulrest`, a 16e
city leg), in fringe marsh (the yard's terrain class), 3.6 km from the
yard; its `dependsOn` are a ruined plantation and a wrecker beach, no
city; its asset plan is vanilla farmhouse, wattle fences, signage,
market tents and clutter (Imperial pools we hold). Watch: its centre is
355 m from Soulrest's (radius 230 m), so its east edge is ~60 m from the
city footprint; nothing in it may lean on Soulrest's unbuilt edge.

Alternatives:
- **Highwater** (`place.imperial-fringe.highwater-hamlet`): an Argonian
  flood-high hamlet (M2, `simple`) 35 m off the Gideon–Blackwood trunk,
  firm lowland, 1.2 km from the nearest town; depends on the Drowning
  Gate ferry, which 16h already stood up.
- **Claywater Station** (`place.imperial-fringe.claywater-station`): an
  Imperial road-station village (M2, `simple`) 20 m off the
  Gideon–Blackwood trunk, firm lowland, no dependencies; two villages
  facing each other across the road (danger band 4).

### Slices 2 on

One fresh place per slice, of a type not yet passing, in a region that
contrasts with the last. A type passes after two fresh places in a row
pass unattended with no defect from the walk.

### The type list (for the owner to sign)

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
| 8 | Town or city district (Imperial town, the Blackrose city pass, Lilmoth) | owner-guided (0062 §9); built with the owner, not unattended; exits the loop by owner acceptance |

### Carried backlog (numbers as in the superseded briefs)

Taken by the slice whose place first needs them; each keeps its brief's
text and test.
- **16h part 2:** 10 renderable kinds; 11 doors as records; 12 stairs,
  decks, honest navigation; 13 pads as patches; 14 clearance by tier;
  15 dressing-add patch; 16 patch proof (now proved on the slice's
  place and the yard); 17 dressing vocabulary; 18 bundle format; 19 plan
  renderer (build it on `render_blueprint.py`); 20 `kit-qa` skill; 21
  chain, gates, docs; 22 man-made lighting (sconces); 23 host-aware ring
  dressing; 24 interior camera; 25 base height-blend (seam) shader;
  26 dressing mine; 27 kit additions; 29 composite-author skill; 31
  building checks as gates; 32 replace the Nordic route pieces; 33 the
  kit plan; 34 owner sourcing list; 35 KotM registry origins; 36–38
  tropical texture overlays. (28 and 30 are done.)
- **16h part 1 open items:** 0c terrain patch for dug-in pieces (cave
  flanks); 0d runtime wet-stilt datum; 0f cutaway view; 2 truth-table
  fix path; 4 mined relative yaw sign; 5 mount sheets pass 2; the deck
  `contactsM` source; miner items 1–7.
- **16i:** 0 lesson reconciliation; 1 dungeon-kind exemplar (now type
  5); 4 interior claims per door; 5 the interior runtime (door
  transition, load contract, interior lighting, tier A cells); 9 the
  approach checklist; 12 skill v2 (now the place skill, rewritten each
  fix round); 13 the type register. The Blackrose city pass (16g call 2;
  Blackrose spreads from its island over the lake and shore) and
  Lilmoth's second round belong to type 8.
- **16j:** 2 the co-design quest pass per slice; 6 gaps closed in the
  skill; 7 automation readiness (world 96 §3) per type; 7b `--places`
  selectors (needed from slice 1); 8 the Phase 15 roadmap and packet
  template (at the loop's exit, with the template decision per type).
- **New rows:** G1 settlement path and worn-ground paint; R1 retaining
  walls; R2 enclosure; R3 cook fire and forge glow; R4 crops and fish
  parks; R5 boats pulled up and moorings; R6 wet and worn ground; R7
  lit at range and skyline; O1 idle occupants from the 16g NPC roster
  and the fauna list (standing, sitting, working poses from vanilla
  idles).
- **Speed (S):** S1 make `test:placement` (3.5 min) and `test:pipeline`
  (2.8 min) scoped to the paths touched; S2 cache kit builds by input
  hash; S3 the miners' batch mode (sample runs by default); S4 review
  once per logical change including docs, then the fixed hunks only;
  S5 the fixed-cost audit of preflight (5.0–9.5 min per run).

## Acceptance (the exit bar)

- Every type on the signed list has two fresh places in a row that
  passed unattended with no defect from the owner's walk (type 8 by owner
  acceptance).
- Every Gate row of the checklist is an automatic check that was shown
  failing first on a real defect.
- The breadth bars and the within-place variety number exist as data
  the skill reads; every loop place meets its tier's 0098 bars.
- The template decision recorded per minor type; the Phase 15 roadmap
  and packet template written; `docs/phases/15-rollout/README.md`
  rewritten for the proven skill set.

## Owner check-ins

- **Once, before slice 1's place is designed:** sign the type list, the
  exit bar and the checklist's Gate column; confirm Chasepoint or pick
  an alternative.
- **Every walk.** The packet lists every thing in the place with a
  studio link (`$ES_TUNNEL_URL/?view=character&x=..&z=..&t=..`) and one
  check per line, plus "what changed since the last walk".
  **How to reply.** One message. For each row, give the item name and
  "right" or "wrong: what you see". Skip a row you could not reach and
  say so. A "wrong" becomes a fix to a rule or a record, never a nudge
  to one piece. End with "looks right" when the place is done.
- **World-level calls** (a place moved or cut, a new type, a city
  choice) are asked as they arise, batched into the next walk packet.

## Gotchas

- A fix to a place record is a failure of the loop: fix the rule, the
  gate or the skill, then rebuild the place from them.
- Publish the place only (`--places`); a whole-catalogue compile or
  re-mine runs only after a fresh sample batch passes.
- The yard runs as regression gates in every slice; a slice that breaks
  a yard gate is not ready to walk.
- Waiting is the hand-back or `run_in_background`; if a builder is slow,
  the speed item is the fix.
- Chasepoint's `culture` is argonian while its shells are Imperial: the
  grammar is a squatted way-station, read against 97 Part F, not a
  village of either culture alone.
- Player-visible text (catalogue prose, `why` lines, door messages) goes
  through `text-review` in a separate agent before commit.

## The story, in plain English (for the owner)

**Where we are.** The land, water, roads and plants are finished. The
test yard showed us how building pieces go wrong and has been fixed
three times. What we do not yet have is a real village you can walk
into.

**What changes.** Instead of three more planning stages, we build one
real place at a time. The agent designs it on its own, first as a flat
drawing that a helper checks, then in 3D in the workbench, having read
about every other place so this one is not a copy. It builds it and runs
the automatic checks. Then you walk it and say what is wrong in one
message. Every problem becomes a rule and an automatic check, so it
cannot come back, and the recipe improves. You walk again, and we repeat
until you say it looks right. Only then do we build the next place, of a
different kind somewhere else.

**The first place** is Chasepoint, an old Imperial road station on the
road into Soulrest that salvage families took over, with a reed
roof on a stone building and ship's timber piled in its yard.

**When it ends.** When every kind of place on your list has come out
right twice in a row without your help, the recipe is trusted and the
rest of the province is built with it later, with simple kinds such as
camps made from varied templates.
