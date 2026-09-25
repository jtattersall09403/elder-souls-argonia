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
- Check-in 3 fix round: runtime lane done except the deck `contactsM`
  source (no record holds leg or stair contact geometry); kit/yard lane
  done 2026-09-25 (decal flag, one composite yaw convention, the stilt-house
  leaf doorway, settlement clearance patches with door aprons, both yards
  republished; the cave entrance and the landing-stage rule are deferred to
  § Carried backlog). Causes, owner rulings and the check-in 1–3 defect →
  gate table: 16h brief § Part 1 state, "Owner check-in 3".
- Miner: 2 of 3 tests fixed; `test_the_record_single_use_is_the_derived_set`
  red (814 vs 825); the full mounts/sink/abuts runs are blocked on the
  miners' batch mode and disk (`tooling/.reports/miner/relaunch-2026-09-25.md`).
- Combat r7: `preflight --paths` ran; placement red `0o666 == 0o644` at
  `worldgen/test_export_settlement_bundle.py:1091` (codespace umask, an
  environment defect).
- Known reds: `settlementCollision.test.ts:142` (141 vs 152); standard 6
  `vault_inventory.py:559/563`; `test_mine_abuts` single-use;
  `test_proving_ground` yard B wall-run float (0.35 m; § Carried backlog);
  `test_interiors_index` (KotM mud huts; § Carried backlog);
  `test_weapon_records` ×2 FileNotFound; the file-mode test.
- Unfinished lane 7f2405fa `[deliver] KotM + stilt window kit work`, idle
  ~21 h, cut on a `sleep` poll; it overlaps items 28 and 33: dismiss or
  relaunch it before new work.
- Settled (PROGRESS.md:77): the owner's "road-wear ground paint cut" is
  road wear on the legs; settlement path paint stays (16h:326/:530 "paths
  are part 2's ground paint, at the front"; item G1 below).

## Read (fresh agent: this is your whole map)

- [0099](../../decisions/0099-places-are-built-in-a-loop-until-the-skill-is-proven.md) and [0100](../../decisions/0100-one-place-skill-whole-layout-authoring-lessons-store-and-the-acceptance-freeze.md) in full; [0098](../../decisions/0098-variety-is-measured-per-settlement-not-by-a-template-cap.md) § Decisions; [0097](../../decisions/0097-placement-is-authored-in-a-workbench-and-the-pose-record-is-the-output.md); [0081](../../decisions/0081-building-blocks-then-exemplars-then-rollout-and-doors-are-transitions.md) decisions 3–6 (doors, patches).
- `tooling/.reports/plan/place-audit.md` (the checklist's source) and
  `tooling/.reports/audit/time-audit-2026-09-25.md` § (e).
- Skills: `place-build` (the procedure, `references/lessons.md` and the design index; replaces `settlement-build`), `placement-workbench` (its tool manual), `kit-build`,
  `modular-runs`, `composite-author`, `text-review`.
- [world 97](../../world/97-placement-principles.md) Parts A, C7 and F;
  [quests 20](../../quests/20-world-provisions.md) for the slice's place.
- The carried item's own text in [16h](16h-settlement-runtime-and-kit-qa.md)
  § Deliver part 2, [16i](16i-exemplars-end-to-end.md) § Deliver or
  [16j](16j-rollout-skill-and-trial-packet.md) § Deliver, only when the
  slice takes that item.

## The loop (every slice)

1. **Design as one whole layout (unattended; `place-build` skill, 0100
   decisions 2–3, 7).** Step 0: read `references/lessons.md`, then the
   register (the 16g catalogue record, its promises and quest provisions,
   the macro plot, every place already built in the loop: type, culture,
   shells, signature assemblies), so the new place repeats none of them
   (0098's one-assembly bars, 97:130–134 spacing); write the site dossier
   (97 B1) and fix any record defect found there as a rule gap with a
   test, before design. Then write the **design brief**
   (`world/sources/blueprints/<place>.design.md`: the causal answer for
   every building, enclosure, path, light, water edge and dressing group,
   each with its kit piece and its lore or rule pointer) and the **layout
   file** (`<place>.layout.json`, the ordered workbench operations for the
   whole place). `wb.py apply <layout>` rebuilds the scene, runs `check`
   and `compile` and writes one summary. **The plan is read first:** the
   2.5 s plan render (`render_blueprint.py`, item 19) and a reader pass
   before any Blender render; footprint, spacing, path and door-facing
   errors are fixed there. Then **render rounds**: one Blender launch
   (top view, one front per building, two isos) read by one Sonnet
   reader against the reader checklist; findings become layout edits and
   one more `apply`; **at most four rounds** before the walk packet,
   residuals listed in it. Export the pose record with its ground and kit
   provenance.
2. **Build and gate (unattended).** Local patches (pad, clearance,
   dressing-add), compile, publish the place only (`--places` scope, item
   7b), the automatic gates: every essential checklist row below, the
   0098 bars, the yard regression gates, `preflight --paths`.
3. **Walk packet** (Owner check-ins below) → the owner walks.
4. **One fix round** (`continue 16k slice N after owner walk`): group the
   owner's defects by cause across the whole reply; each cause becomes a
   rule (97 §C or the skill), a test or gate shown failing first on the
   defect, and a skill edit; each cause is also a row in
   `place-build/references/lessons.md` (0100 decision 4: rule, defect and
   cause, the gate that now enforces it, source), merged into an existing
   row where it restates one; one preflight, one republish, the next walk
   packet.
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
6. **While the owner walks,** the agent does the work the walk cannot
   change: the next slice's register reads, research and sourcing,
   speed items (S below), template studies. Never an idle wait.

## The checklist ("good enough" for a place)

The audit's table with its coverage (2026-09-25). **Gate column signed
by the owner 2026-09-25** (hand-off ruling 3): every visual row is a gate
before rollout. The four system rows (occupants, navmesh, interiors,
ambience) gate on the **socket as data**, not the system: the place
records its NPC and idle sockets, its interior promises and its ambience
zone (the 16g promise vocabulary and quest sockets, verified and
extended, never a second vocabulary), and the later phase fills them. No
idle-occupant pass runs in the loop. A gate row is an automatic check in
step 2 from the slice that first builds it.

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
| Signage, banners, totems, shrines | mount sheets; totems 97:757 | yes |
| Gardens, crops, kept trees | kept trees item 14; crops: new R4 (Argonian crops are a sourcing gap) | yes |
| Water edge (docks, reeds, boats pulled up, moorings, wheels) | items 10, 16; boats pulled up and moorings: new R5 | yes where the place touches water |
| Wear (moss, mud, puddles, wet ground) | 0098 condition axis; new R6 | yes |
| Idle occupants (people and animals) | sockets only: NPC and idle sockets from the 16g roster and promises; people, animals and movement AI are 10b/13's | socket |
| Ambience and footstep surfaces | 0095 rule 5; studio wiring (backlog row); the ambience zone as data | socket |
| Seen from a distance (lit at range, skyline) | item 5; new R7 | yes |
| Interiors (tier A verbatim, else reserved) | 16i items 4–5; Phase 12 | socket (interior promise per door); tier A cells shipped |
| Navmesh | Phase 10b | socket (walkable ways and door links as data) |
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
<agent-id>` as each brief, same agent type): the kit/yard lane, the miner
full run (ONCE over the whole pool on the `/tmp` cache volume, owner and
planner 2026-09-25; no batch mode) and the combat round-7 close.
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
pass unattended with no defect from the walk.

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
  template (at the loop's exit, with the template decision per type);
  9 Phase 16 closes (the ledger, the decision, the "chunk Phase 9" job
  queued, the PROGRESS rows, the routing audit), at the loop's exit.
- **New rows:** G1 settlement path and worn-ground paint; R1 retaining
  walls; R2 enclosure; R3 cook fire and forge glow; R4 crops and fish
  parks; R5 boats pulled up and moorings; R6 wet and worn ground; R7
  lit at range and skyline.
- **Speed (S):** S1 make `test:placement` (3.5 min) and `test:pipeline`
  (2.8 min) scoped to the paths touched; S2 cache kit builds by input
  hash; S3 the miners' batch mode (sample runs by default); S4 review
  once per logical change including docs, then the fixed hunks only;
  S5 the fixed-cost audit of preflight (5.0–9.5 min per run).

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
- An accepted place is frozen (0100 decision 6): a change to its compiled
  record fails the build without a `reopened` entry (owner date and
  reason); gates added later run on it in report mode only.
- Publish the place only (`--places`); a whole-catalogue compile or
  re-mine runs only after a fresh sample batch passes.
- The yard runs as regression gates in every slice; a slice that breaks
  a yard gate is not ready to walk.
- Waiting is the hand-back or `run_in_background`; if a builder is slow,
  the speed item is the fix.
- Claywater Station's `culture` is imperial, but its record is two
  communities: the Imperial well and the Argonian landing on one road.
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

**When it ends.** When every kind of place on your list has come out
right twice in a row without your help, the recipe is trusted and the
rest of the province is built with it later, with simple kinds such as
camps made from varied templates.
