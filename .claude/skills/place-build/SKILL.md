---
name: place-build
description: Design and build one real place (settlement, camp, shrine, works, dungeon entrance) on the frozen world, from its catalogue record to an owner-accepted place — orient on the lessons and the grounding index, write the site dossier and the design brief, author the whole layout as one file, apply it in the workbench, read the plan and the renders, export, compile, publish only this place, hand over the walk packet, run the fix round, close the slice with its lessons. Use for every "deliver 16k slice N" and "continue 16k slice N after owner walk", and whenever a place's layout is authored or re-authored.
---

# Place build

> **Written against** (decision 0086 rule 4; `routing-audit` checks these):
> decisions 0097, 0098, 0099, 0100 (this skill's architecture), 0101,
> 0102 (a place carries its own ground; no unfinished hand-off), 0103
> (tier A interiors ship in 16k; every promise a placed socket), 0081
> decisions 3–4; the 16k brief
> (`docs/phases/16-foundation-and-places/16k-place-loop.md`) § The loop,
> § The checklist, § Owner check-ins; world 97 (binding rules) and 96 §2
> (history); decision 0041 § Taste ledger. If a cited record has moved,
> this skill is stale: report it, do not follow it blind.

This skill holds the procedure; its `references/` hold the grounding:

| File | What it is | Read |
|---|---|---|
| [references/lessons.md](references/lessons.md) | every lesson still in force, each with the gate that enforces it | step 0, the rows for this type as the site packet lists them; edited in the fix round |
| [references/design-index.md](references/design-index.md) | one line per binding source or prior: the rule id and when it applies | step 0, the rows for this type, culture and step |
| [references/reader-checklist.md](references/reader-checklist.md) | what the Sonnet image reader is told to look for | steps 3–4, pasted into the reader's prompt |
| [references/types/](references/types/) | one design sheet per place type on the 16k list | step 0, this place's type |
| [references/doors-interiors-sockets.md](references/doors-interiors-sockets.md) | door records, shells chosen for their interiors, the fit rule, the tier A export, the interior runtime contract, the socket kinds and gates, the approach checklist | steps 1, 2 and 5 |
| [references/round-recipe.md](references/round-recipe.md) | the timetable of one round: what fans out, what the builder does itself, what is never done in a round | steps 2–4 and 7, before the first edit |
| [references/creative-register.md](references/creative-register.md) | one row per built place: the creative calls made above its promises, so the next place makes different ones | step 1 § Creative register; appended at step 8 |
| [references/rollout-packet-template.md](references/rollout-packet-template.md) | the spec the Phase 15 packet template meets (16j item 8) | at the loop's exit only |

**Tools.** `placement-workbench` is the tool manual (every `wb.py`
command, its bars and its costs). Kit gaps go to `kit-build`,
`modular-runs`, `composite-author` or `kit-mining`; prose goes to
`text-review` in a separate agent. Commands run from the repo root unless
marked `(worldgen)`, which means from `tooling/world-generation`.

**Dependency direction** (0100 decision 6). Frozen world (terrain, water,
roads, vegetation) → kits → this skill → the place's records and its own
typed patches → later phases fill the sockets the record declares.
Lessons flow into this skill and its gates only. Anything that would move
a frozen layer or an accepted place (listed in
`world/sources/placement/accepted-places.json`) is a world-level call for
the owner, batched into the next walk packet.

**A place's files.**

| File | Written by | Holds |
|---|---|---|
| `world/sources/sites/dossiers/<slug>.{json,md}` | step 0 (`site_dossier`) | the measured ground (97 B1) |
| `world/sources/blueprints/<place>.design.md` | steps 0–1 | § Site, § Brief, § Approach, § Lessons this slice |
| `world/sources/blueprints/<place>.layout.json` | step 2 | the ordered workbench operations for the whole place |
| `world/sources/blueprints/<place-id>.json` | step 2 (skeleton), `wb.py export` (poses and provenance) | the blueprint the compile realises (`schemaVersion` 2: a parcel's `services` is a list, one building may host several; the schema-1 `service` string still reads); named by the full place id because every loader reads `blueprint_files.blueprint_paths` (`place.*.json` minus `*.layout.json`; `<place>` above is the slug) |
| `apps/world-studio/public/province/interiors/<cellId>.json` | step 5 (`export_interior_bundle`) | one tier A cell, copied verbatim (0103 decision 3) |
| `references/types/<n>-<type>.md` | step 8 | the type sheet |

## How the builder works (owner 2026-09-27, after the walk-2 round took five rounds)

- **Recommend and do.** A rule, gate, tool or record fix the builder
  finds it needs, and that sits under an existing decision (0097–0104,
  0081), is filed to the tooling sub-lane (below) with its fail-first
  test and its lessons row, never written inside a round; it is
  reported, never asked. The
  builder stops for a ruling only on an owner-level call (a place moved
  or cut, a quest premise changed, a new type, a world-level rule) or
  when a check cannot be met with any asset we hold after a completed
  search.
- **Fan out inside the lane.** Kit rebuilds, bundle exports, pose and
  yard scans, plugin mines and every render read run as parallel
  sub-agents (`run` for jobs, `find` for look-ups, a Sonnet reader per
  image) while the builder edits; nothing that can run beside the edit
  runs after it. Interior kits are the exception: every interior kit a
  batch needs is built in one pre-pass before its builders start, and a
  builder never builds one.
- **Scan before editing.** Step 2 starts with `wb.py scan` (the site
  feasibility scan: for every building's candidate poses, pad legality
  with batter, road-paint overlap, water depth along a landing bearing,
  the pieces' designed sinks and porch or stair reach), so a pose that
  cannot pass is never authored. A defect the scan could have shown is a
  scan gap, fixed first.
- **One round, one batch, one apply.** Every finding of a round is one
  layout edit and one `wb round` (apply + check + walktable + shots);
  `check --only <uids>` judges the named pieces' rows, pairs and
  per-piece rules; the graph rules (`walkRule`, `pathReachRule`,
  `berthReachRule`) rerun in `wb round`.
- **A fresh agent per round.** A round ends with the WIP layout, the
  check list and the brief on disk (`wb round --report-dir
  tooling/.reports/16k/<place>/round-N/`: `summary.json`, `rounds.jsonl`,
  the scan output, the fix list and `waiting-on.json`, the tooling tasks
  the round waits on; `references/round-recipe.md`); the next round
  starts a fresh agent from that folder, never a context that has grown
  past one round.
- **Tool work never rides in a place round** (method review 2026-09-27
  finding 6: four hour-long rounds went on writing rules). A rule, gate
  or tool gap found in a round is filed as a tooling task and built by a
  `deliver` sub-agent in parallel; the place round continues on the
  rules that exist and takes the new rule at its next round. During
  the Phase 15 rollout builders never edit tools at all: one tooling
  lane owns every gap. The round ceiling (four) counts apply rounds too.
- **The builder writes the brief** from slice 2 on (0100 decision 8 as
  amended 2026-09-27: the planner writes the brief only for owner-guided
  types 8 and 9); the planner reads the brief with the packet.
- **Reads are digests, never every brief.** Step 0 reads a generated
  site packet (`site_packet.py`: the record, promises, dossier facts,
  route seams, neighbours within 2 km for the 0098 rules and within
  500 m for the seams, the type sheet, the lessons rows for this type)
  and the register digest (one line per built
  place, generated from the briefs), never every `design.md` or every
  register row. Anything the builder must know is in the packet or is a
  packet gap.
- **A proven type is cheap.** Once a type has passed two walks
  (`type-recipes.json` `proven: true`), a place of that type takes the
  fast path: site packet → the type's layout template
  (`layout_template.py`, 16k S10: emits the layout from the packet and
  the type sheet's yard sets; hand edits only where the packet's seams
  demand) → one `wb round --no-shots` to zero check failures → gates by
  `place_gates` (one command, about a minute: the 0102 rules, the
  promise and socket gates, the interior bundle gate, the 0098 bars) →
  publish. The chain runs as a `Workflow` of `run` agents; the Opus
  builder is woken only for the brief's deltas and for failures the
  chain leaves. No plan read, no render round (the type sheet may ask
  for a sampled one in N places), no per-place preflight, review,
  text-review or deploy: those run once per batch of places (per walk
  packet in 16k, per region packet in Phase 15), which is the owner's
  standing ruling for the deploy (16k step 3) applied to the batch.
- **Six at once.** Builders run as parallel lanes on disjoint places;
  the box takes about six (the Workflow cap binds before CPU). What
  serialises them is a defect: a whole-file writer without a lock, a
  shared output folder, a pool sized to the machine instead of its
  job-guard slot, a watchdog that freezes an admitted job, a review
  stamp written without a lock (16k S9). Each place publishes its own
  bundle file (`settlements/<place-id>.json` plus `settlements/index.json`;
  the runtime reads the index and the bundles within range, 16k S8) so
  publishes never contend, and commits its own files with
  `commit_place.py --place <id>` (16k S12), which stages the place's
  per-place files only, from its manifest, so lanes never race on git.
- **Builders write only per-place files** (method review r3, 2026-09-27).
  A per-place file is one of the table above, the place's promise
  ledger, its bundle and its `tooling/.reports/16k/<place>/` folder. A
  change to a shared file (a zone catalogue `places-<zone>.json`,
  `world/sources/quests/*`, `yard-sets/<type>.json`, a kit's
  `*.interiors.json`, `references/lessons.md`, `reader-checklist.md`,
  the type sheet, the registers, `type-recipes.json`,
  `accepted-places.json`) is a REQUEST row appended to
  `tooling/.reports/16k/<place>/requests.jsonl` (file, the change, the
  reason, the place); one integrator lane applies a batch's requests
  under a lock, once per batch. A builder that edits a shared file
  directly has broken the batch's commits.
- **Text-review reads the delta.** A brief built from a type's template
  is reviewed only on its delta lines (the lines the generated brief
  marks as changed from the type sheet); the template's own rows were
  reviewed once in the type sheet.
- **Same-type places walk together.** Once a type's first place is
  accepted, its next two places (the two "in a row" of 16k § Slices 2
  on) are built together, in different regions, and go to the owner in
  ONE walk packet (16k § Owner check-ins).

## 0. Orient (unattended)

The stage clock (16k § Build cost is measured as data; rounds and gates
record themselves): each `--start` below ends the stage before it, and a
fix round's first start adds `--start-run --path fix-round` (step 7).

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage orient --start

1. Read the site packet (the lessons rows for this type come in it),
   the type sheet, and the rows of `references/design-index.md` for this
   type, culture and step. A stale or contradicting lesson row is fixed
   now (a REQUEST row editing it), never worked round.
2. Read the register digest (one line per built place: type, culture,
   shells, signature assemblies; never every `design.md`), so this place
   keeps 0098's province-wide rule (one signature at most 3 times in the
   province, never twice within 2 km) and is not the same signature as
   a place of its type within its region (97 A6 spacing, :130–134). The
   signature is CLAIMED at the brief step (step 1) by a locked row in
   `world/sources/placement/signature-claims.json` (16k § New rows and speed items), so two
   parallel builders cannot both take the third use; the batch gate
   recounts.
3. Pull the record and its promises:

        python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage dossier-and-brief --start
        python3 -m worldgen.blueprint_promises --id <place-id> --write   # (worldgen)
        python3 -m worldgen.site_dossier --id <slug> --x <positionM x> --z <positionM z> --radius 400   # (worldgen)

   `blueprint_promises --write` generates the **promise ledger record**
   `world/sources/placement/promises/<place-id>.json` (0104 decision 3):
   one row per promise (service, NPC role, travel operator, quest
   provision, catalogue socket bucket, D0 safe interior), each with a
   stable `promise.` id, its source record and field, and its text.
   **The ledger is the checklist you start from, work through and end
   on**: every row is filled by a placed thing (a socket, a door or a
   parcel carrying `fills: [that id]`, 0104 decision 4) or carries an
   `unfilled` block with one of 0102's four reasons; the compile fails
   otherwise (0104 decision 5). The catalogue record is the row in
   `world/sources/catalogue/places-<zone>.json`; the plot is
   `world/sources/sites/macro-plot.json`; the quest provisions are the
   place's rows in `docs/quests/20-world-provisions.md` and
   `docs/quests/25-quest-place-map.md`; the lore is the dossiers the
   design index names for the culture and type.
   **Read the prose too, sceptically.** The record's `why`, `vibe` and
   description carry intent the typed fields do not (who faces whom, what
   the place is for); build to it. But the prose was written before the
   ground and the assets were known and makes mistakes: where it
   contradicts the dossier, the typed fields or an asset fact, the typed
   field and the ground win, and the prose is corrected (lesson L02, L06).
   **Prose never claims a world behaviour the runtime lacks** (0105 R5):
   a seasonal flood, a tide, a rising ford, a collapse, a crowd. Before any
   line of design, dossier, catalogue or text-catalogue prose is written,
   check the behaviour against the record and the runtime (is there a
   system that makes the water rise?); a claim with none is rewritten to
   what the player can see, keeping the visual (Claywater's ferryman
   "poles across when the ford floods" over water that never rises).
   **Two-way (0104 decision 6):** a promise the world cannot keep (a
   quest asks for an item class no asset shows, a service the ground or
   the culture forbids, an interior no plugin furnishes) is not left
   hanging and not faked: you file a REQUEST row that changes the source
   record (the quest provision in `world/sources/quests/`, the catalogue
   field) to the nearest thing the world can keep, design on the
   corrected record, list the prose for the batch's one `text-review`,
   regenerate the ledger once the integrator applies it, and log the
   change in the brief's § Record corrections with the reason. Use judgement: the quest's intent survives, its object
   changes. A change that alters a quest's premise or a place's purpose
   is an owner call in the packet, not yours.
3b. **The place in its world (seams).** A place is never an island: read
   the route records that touch it (`world/sources/routes/`: the trunk or
   leg it sits on, every minor route ending at it, the ferry crossing and
   its berths in `travel-services.json`), the painted road polygon and
   width from the routes record, and the neighbours within 500 m along
   each route (the site packet). Decide and write in § Seams:
   **on the road** (the painted, frozen road is the spine the layout is
   built around: buildings face it, nothing but ways, crossings and verge
   signs touch its surface) or **off the road** (an authored minor route
   already reaches the place: the layout's internal ways join that route
   at its terminal, and the approach reads along it). Every internal way
   connects to a `networkTerminals[]` entry that is a real route end; a
   way that ends in the open, a berth with no landing from dry ground, a
   door with no path, a signpost whose arms do not point along the road
   to real places, are seam defects the `check` rules catch
   (`roadSurfaceRule`, `berthReachRule`, `signRule`, `pathReachRule`).
4. Write `<place>.design.md` § Site: the record's `why`, `vibe`,
   `services`, `sockets`, `occupants`, `travelStation`, `questHooks`; the
   dossier's heights, water and slope facts (cited by file); the quest
   provisions; the lore read, one line each with its dossier path; the
   places already built nearby and what this one must not repeat.
5. **Record defects are rule gaps, fixed outside the slice.** A service
   promised with no row behind it, a kit the place's culture does not
   use, a danger band off its ground, an `assetPlan` naming a retired
   piece: file it to the tooling sub-lane with the failing record named
   (the lane writes the validator test that fails on it, e.g. in
   `worldgen/audit_place_semantics.py` or `test_catalogue.py`, and fixes
   every other record it catches; 0100 decision 7). No validator test is
   written inside the slice. The record correction for this place is a
   REQUEST row, and design proceeds on the corrected record.

Ends when: § Site is written, every record defect is filed with its
failing record named, and the lessons read raised no stale row left
unfixed (a stale row is a REQUEST row).

## 1. Design brief

Write `<place>.design.md` § Brief before touching the workbench. One row
per building, enclosure, path, light, water edge and dressing group:

| Thing | Purpose (who, what trade, which promise) | Kit piece (measured with `wb.py - describe`) | Rule or lore pointer |
|---|---|---|---|

- Every promise-ledger line from step 0 appears as a row or as a written
  reason it is not built here.
- Pieces are chosen on measured size and the mined evidence, never on a
  label (lessons L04, L05). A piece nobody made is a sourcing job
  (CLAUDE.md), shown as a gap.
- **Setting class** (0105 R1): a piece is placed only in the setting its
  own plugin places it in: interior or exterior, and keep-or-castle,
  town, village, camp or ruin, read from the manifest row's
  `settingClass` (the plugin's placement cells and worldspaces), never
  from the name. A candle sconce is an interior piece, so an exterior
  door gets a wall or eave lantern, else a candle lantern on a barrel by
  the door; a keep's stone stable never stands in a hamlet. The place's
  class is its recipe's (`place_gates.place_setting_class`). Gate
  `setting.class`.
- **Lights** (0105 R3, R7): every fixture within 200 m of the player
  emits (the 16 nearest); no point in the place may see more than 16
  fixtures within 200 m (gate `lights.density`), so plan the fixture
  count with the lit entrances first. Argonian hanging lanterns hang
  wherever you judge they look good (branches, arches, eaves, posts), at
  the mod's own hanging height, verified by the reader pass.
- Dressing is authored as named **yard sets** per building kind, defined
  in the type sheet and placed with `group place` (0100 decision 5).
- The bars: read this place's tier object and type object from
  `world/sources/placement/breadth-bars.json` (16k § 1b: shells,
  top-shell share, pieces within 12 m, dressing assets min and max share,
  ground, light and enclosure kinds min, and the distance bars between
  places of one type or purpose) and 0098 § 1's table. Write each bar with
  the number the brief plans to reach. A bar the culture's pool cannot
  reach is a sourcing gap (0098 § 1, reachability).
- § Variety (0105 R4; owner 2026-09-28: "the skill must explicitly use
  and create variety"): one row per building: the shell and the interior
  cell chosen, and every pool member rejected with its reason (used
  within 2 km, used 3 times province-wide, no link). Read the register
  digest and `interiorCellClaims` in
  `world/sources/placement/signature-claims.json` first; an interior cell
  already used in this region (this place included) is chosen only when
  every cell linked to the shell is used, and the claim's `why` then says
  the linked set is exhausted; a cell is used at most 3 times in the
  province. Hold the cells once the claims are written (step 2 item 4):
  `python3 -m worldgen.place_gates --id <place-id> --claim-cells`
  (worldgen). Gate `interiors.variety`.
- § Approach: the 16 questions of
  `docs/research/placement-settlements/openworld-approach-and-wayfinding.md`
  §5, each answered yes or no with its field; each "no" is a layout edit
  or a rule before the walk (`references/doors-interiors-sockets.md` §6).
- § Interiors (0103 decisions 1–2; `references/doors-interiors-sockets.md`
  §2): one row per door: building, shell, tier (A with its chosen cell,
  or `reserved` with the pool named, or `none` for a building nobody
  enters), and why. **`reserved` is legal only for a tier B or C
  interior** (0105 R2: a dungeon, a unique large interior). A dwelling,
  shop, stable house or workplace door is never reserved: re-shell to a
  shell with a linked furnished cell, or, for a doorless hut, dress the
  inside as exterior placements (no door record; the hut is walked
  into). Standard houses, stables and workplaces are never Phase 12's. **Asset-aware, always** (owner 2026-09-27; CLAUDE.md
  golden rule): a shell whose doorway was designed to load into an
  interior is used only with the interior its author designed for it
  (vanilla or mod, in the vault or sourced from Nexus in this slice);
  the cell and every piece in it must come from assets we hold or can
  get: vanilla Skyrim (Tropical Skyrim's version first where one exists,
  else the vanilla mesh checked for fit in a tropical marsh) or a mod
  in the pool. **Creation Club, HearthFires, Dawnguard, Dragonborn and
  the SE resource pack are not ours and never will be**: a cell needing
  one of them does not fit, and a shell whose only interiors need them
  is swapped for a shell that has a usable one. "Nobody lives there" is
  no reason for a store, barn or workshop to lack its room: if the
  shell has a load doorway, it gets its designed interior (with its
  sockets); if it has none (an open-sided barn, a lean-to), it has no
  door record and is walked into. A shell with a load doorway and no
  interior anywhere is not used. The owner is never asked to buy an
  archive.
  The cell is the fit rule's pick, written by
  `blueprint_interiors.py --claim` in step 2; the brief states the
  expected pick so a different one is noticed. Doors are typed
  (0104 decision 4): `load` (a cell transition) or `swing` (opens in
  place, no cell: a barn door, a gate, a room divider), and a swing door
  is a `door` record too, so the runtime animates it and its collider.
- § Containers and items (owner 2026-09-27). Containers are **placed as
  meshes now** (barrel, chest, sack, crate, urn, basket, strongbox from
  the kits), each with its `container` socket and fill rule; Phase 13
  fills them. Visible dressing items that carry an `item` socket (a tool
  on a bench, a bottle on a table, a fish on a rack, a book on a shelf)
  are placed as meshes now from the kits, because they are part of how
  the place looks. Loot in the inventory sense (weapons, potions, coin,
  a named quest object) is an `item` socket with its class and value
  band, and Phase 13 places the mesh when the item catalogue defines
  it; a quest object whose class has no asset anywhere is a step-0
  record correction, never a promise left open.
- § Creative register. How many containers, items, yard pieces and idle
  spots a place gets, and where, is the builder's call above the
  promises (the promises are the floor, never the ceiling), sized to the
  place's occupants and trade. So that fresh agents do not make the same
  "creative" calls every time, read the rows of
  `references/creative-register.md` for this type and region (one row
  per built place: its signature dressing ideas, container mix, idle
  spots, lights, the small stories told by clutter) and make at least
  three calls this place within 0098's rules that are not the same
  signature as any of those rows; `close_place.py` appends this place's
  row at the slice close.
- § Sockets (0103 decisions 5–6; `references/doors-interiors-sockets.md`
  §5): one row per authored socket: kind, host (the placement it sits on
  or in, or the cell), data (roster slot and schedule, activity, item
  class and value band, container class and fill rule or loot table,
  danger band and zone), why. Every roster slot gets a work and a home
  socket; every promised service an `npc` socket at its parcel. Sockets
  that yard sets and interior cells yield automatically are not rows.

- § Quests (restored 16j item 2; quests 90 §65b). The place's local
  quests, to brief level only (premise, cast, choice, size, the
  provisions each needs), drafted from `docs/quests/25-quest-place-map.md`
  and the record's `questHooks`; each provision is a promise row (0104)
  and gets its socket or door; a brief that needs a placement the world
  cannot give is negotiated here (a substitute, or the 0104 decision 6
  record correction). The D0 safe interior the settlement owes (quests
  20 §12) is a promise filled by a door's `fills`; its cell's
  `acousticProfile` and `lightingProfile` slots stay typed and empty.
  Prose goes through one `text-review` per batch, over the batch's
  briefs and record corrections.
- § Seams (step 0.3b): on-road or off-road, the route ids and terminals
  every internal way joins, the berths and the landing that reaches
  each from dry ground, the sign arms and what they point to.

Ends when: every row has all four columns, every bar a planned number,
every door an Interiors row, every promise row a fulfilment or an
`unfilled` reason, and every § Seams way a real terminal.

## 2. The layout file, then apply

1. The blueprint skeleton `world/sources/blueprints/<place-id>.json`: the
   fields export does not write (districts, `approaches[]`,
   `networkTerminals[]`, `why` blocks, services; a door with no interior
   is `none`, lesson L21). The interior claims are not written here by
   hand (item 4).
2. The layout `world/sources/blueprints/<place>.layout.json`
   (`schemaVersion` 1; the schema is in `tooling/placement-workbench/README.md`
   § apply): the ordered operations for the **whole place** — `window`,
   `place`, `snap`, `mount`, `attach`, `group place` (dressing yard sets),
   `path`, `bind`, `socket` (one per § Sockets row, 0103 decision 6),
   `note`. Every building and every dressing group from the
   brief is in it before the first apply. Yard sets come from the tracked
   `world/sources/placement/yard-sets/<type>.json` (0101); a new set is
   added there (a REQUEST row, it is a shared file), never only as a
   `group save` in the layout.
3. Apply:

        python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage survey-and-scans --start
        python3 tooling/placement-workbench/wb.py <scene> scan <place>.scan.json --out tooling/.reports/16k/<place>/round-N/scan.json   # site feasibility first
        python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage layout-to-compile --start
        python3 tooling/placement-workbench/wb.py round <scene> world/sources/blueprints/<place>.layout.json --no-shots --report-dir tooling/.reports/16k/<place>/round-N/

   It rebuilds the scene from a fresh window in one process, runs `check`
   and `compile`, and writes one summary. The scene file is derived state;
   a tweak is an edit to the layout and one more `apply`.

4. The interior claims (0103 decision 2):

        python3 -m worldgen.blueprint_interiors --claim ../../world/sources/blueprints/<place-id>.json   # (worldgen)

   It writes each door's `interiorClaim` (tier A, cell, plugin, `why`)
   from the shell's linked set by the fit rule; compare with § Interiors
   and fix the brief or the shell, never the claim.

Ends when: `apply` reports 0 compile errors, `check` has ZERO
failures (placement-workbench § 5) and every lived-in door has a tier A
claim (or, for a tier B or C interior only, a `reserved` state naming
its pool; 0105 R2), and `place_gates --claim-cells` holds its cells.

## 3. The plan read (only when the compile gates are red, or the type is unproven and its sheet asks)

    python3 -m worldgen.render_blueprint --layout ../../world/sources/blueprints/<place>.layout.json --out output/plan   # (worldgen)

`--layout` renders the blueprint the last `apply` derived from that layout
(it refuses when the layout changed since) and implies `--plan`.

Renders carry no text (0105 R8): a scale bar and a north arrow only;
`--labels` adds piece ids, bearings and captions for a human debugging a
render, never for the readers or the owner.

Hand the PNG to one Sonnet reader (read-only `general-purpose` agent)
with the **Plan** rows of `references/reader-checklist.md` and the brief's
expectations written first. Fix footprint, spacing, path and door-facing
findings in the layout file; `apply`; render again. When the plan read
runs, no Blender render until it is clean (0100 decision 3 as amended
2026-09-27).

Ends when: every Plan row is YES.

## 4. Render rounds (at most four; 0102 decision 4)

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage readers --start
    python3 tooling/placement-workbench/wb.py round <scene> world/sources/blueprints/<place>.layout.json

One Blender launch: the top view, one front per building, two isos, and a
shot of every `unmined` mount (0102 decision 5). The readers run as one
`Workflow`, one Sonnet reader per image, one merged NO list, one wake
(`references/round-recipe.md` step 3); each reader gets only the
`reader`-tagged rows of `references/reader-checklist.md` for its view
(a row tagged with a `check` or compile rule is measured, never read);
UNSURE or a black image means a closer or lit re-render of that shot in
the next round's launch, never a guess. Memory: the job guard's slot
governs memory.

**A round is one batch.** Gather every reader NO and every `check`
failure, edit the layout ONCE for all of them, run one `apply`, the plan
render only when step 3 applies, then at most one Blender round. Nothing is fixed one item
at a time. A round never touches a kit build or the frozen world. A
finding that comes back after it was fixed escalates to the planner (no
third fix of the same thing). A small mount not in the mined pairs (child
plan side under 0.6 m, height under 1.0 m) carries `"unmined": "reader-approved rN"` in its
layout op, naming the round whose shot approved it.

Ends when: a round has zero NOs and `check` has zero failures. Four rounds
without that is an escalation to the planner, never a packet.

## 5. Export, patches, compile, publish, gates

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage publish --start
    python3 tooling/placement-workbench/wb.py <scene> export world/sources/blueprints/<place-id>.json --write
    python3 -m worldgen.compile_settlement --blueprint ../../world/sources/blueprints/<place-id>.json --out output/settlements   # (worldgen)
    python3 -m worldgen.export_interior_bundle --blueprint ../../world/sources/blueprints/<place-id>.json   # (worldgen)
    python3 -m worldgen.export_settlement_bundle --copy-assets --places <place-id>   # (worldgen)
    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage publish --end

- Export writes the poses (0097) and the ground and kit provenance.
- Patches are the place's own typed ones only (0081 decision 3: pad,
  `vegetation-clearance`, dressing-add); they travel in the place's bundle
  and the studio applies them as a runtime overlay when it loads the
  terrain chunk or vegetation cell they touch (0102 decision 1).
  `compile_scatter` is never re-run for a place (lesson L35), and no chain
  stage, refreeze or province publish runs for one.
- Publish is per place (`--places`, 16k § 1b); a whole-catalogue compile
  runs only after a fresh sample batch passes.
- Gates, all green before the walk (per place, by `place_gates`, 16k
  S14):
  - the 0098 table and the breadth bars on this place (`wb.py signature`
    and the breadth-bar gate);
  - every 16k checklist row marked Gate that this place touches;
  - the 0102 `wb.py check` rules, zero failures: `walkRule` (a route from
    the road terminal to every door threshold and yard opening within the
    controller's step and slope limits; exported as the navmesh socket's
    walkable ways), `floorEdgeRule` (no building underside above its fit
    band's gap over the padded ground without a retaining run or fill
    under it), `pathReachRule` (a path ends within 1.0 m of every threshold
    and opening, its last leg within 45 degrees of the door's facing),
    `propSeatRule` (every dressing contact gap inside its policy row's
    band; yard-set members within the set's spacing), plus `beachedRule`;
  - the lit-entrance compile rule (97 C16, 0102 decision 7): a door with
    neither a window glow facing within 90 degrees of its bearing nor a
    `light`-layer placement within 2 m of its threshold fails the compile;
  - the socket gates (`compile_settlement`, 0103 decision 6): every roster
    slot has work and home sockets; every container placement has a fill
    rule; every promised service has an `npc` socket at its parcel; every
    item class is in `world/sources/vocab/socket-vocabulary.json`; every
    `npc`, `idle` and `container` socket is reachable by `walkRule` (its
    `socket:<id>` route; a ring dressing container is exempt while the
    workbench scene does not hold the ring);
  - the interior bundle gate (0103 decision 3): every tier A cell exports
    with placements plus listed drops equal to the cell's reference count
    (the exporter's acceptance, `test_export_interior_bundle.py`), every interior kit it needs is
    published through `kit-build`, and every reserved door names its pool;
  - the 0105 gates: `setting.class` (R1; NOT_MEASURED rows pass with a
    warning until the manifests carry `settingClass`), `lights.density`
    (R3), `interiors.variety` (R4), and the breadth bar's per-dwelling
    count as R6 counts it (every placement within 12 m of the
    dwelling's footprint except shells, pads, ground treatments and
    modular-run pieces);
- Per BATCH, never per place (in 16k a batch is one walk packet's
  places; in Phase 15 a region packet): the yard regression gates
  (`worldgen/test_proving_ground.py` and
  `tooling/placement-workbench/tests/test_proving_ground_b.py`, 0099
  decision 7; a place's data never touches the yard fixtures, so only
  tool code or shared data can break them, and the tooling lane's
  preflight runs them too), the integrator's REQUEST rows, the one
  `text-review`, `npm run docs:check`, then `npm run preflight -- --paths
  <the batch's files>`, the review and the deploy.

Ends when: 0 compile errors, every per-place gate green, the place
published; the batch gates run when the batch's last place gets here.

## 6. The walk packet (16k § Owner check-ins)

**The packet is short and assumes the owner knows nothing about the
place** (owner 2026-09-27). No per-item tables: the owner walks the
place and reports what looks wrong; they never tick rows. Every
in-world thing is introduced the first time it is named ("the family
hut: the small Argonian mud hut west of the landing"). Plain English,
at most ~20 lines per place plus pictures, so a packet of 4–6 places
is one owner session; a packet holding several places repeats sections
2–5 per place, one anchor link each, in road order. Sections, in order:

1. **What this place is** (three sentences: where, who, why it exists).
2. **Start here:** one deployed-studio link at the anchor
   (`https://<pages-url>/?view=character&x=<E>&z=<S>&t=12`); the
   deploy ran green before posting (16k step 3). Then one link per
   building to enter (door, and the `&interior=<cellId>` form), and the
   `&sockets=1` link; the studio's Sockets checkbox does the same.
3. **What changed since the last walk** (one line per cause fixed,
   plain English).
4. **The numbers, one line:** `check` rules 0 failures, reader 0 NOs,
   promises filled N of N (unfilled with reason listed), colliders,
   lights, interiors shipped. Never a per-item table; the full
   `walktable` goes to `tooling/.reports/16k/<place>-walk-N/` for the
   agent, not the issue. Its links use the deployed Pages URL, never
   `$ES_TUNNEL_URL` (16k S18; until then `wb.py walktable` reads
   `ES_TUNNEL_URL`, so rewrite the host before the table is used).
5. **Please look at** (at most eight lines): only look-and-feel
   judgements no tool can make, each a sentence.
6. **§ Gaps** only for 0102 decision 3's four reasons, each naming its
   reason; **§ Owner calls** only for world-level choices. Never an
   archive purchase, a sourcing question or unfinished work.
7. Pictures (0102 decision 11): the plan render and up to four Blender
   shots, copied to `tooling/.reports/16k/<place>-walk-N/` and committed
   (`git add -f -- <png>`), embedded by `--attach`.
8. How to reply: "walk it and tell me what looks wrong, in one message;
   'looks right' when done." Then the stay-or-switch line (0083).

Post: `python3 tooling/repo-standards/owner_inbox.py --post <packet.md>
--title '<Place> walk N' --attach <plan.png> <shot.png>...` after the
deploy is green (the images are blob links on `main`). Old packets with
per-item tables are collapsed with `owner_inbox.py --collapse <comment-id>`
so the issue stays readable.

## 7. The fix round (`continue 16k slice N after owner walk`)

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage orient --start --start-run --path fix-round

1. Group every "wrong" in the reply by cause across the whole reply.
2. Per cause: a REQUEST row for `references/lessons.md` (an edit of the
   existing row if one covers it); a rule, gate or `check` rule the cause needs (world
   97 §C, the type sheet or this skill) goes to the tooling sub-lane,
   which shows it **failing first on the defect**; the place round takes
   it at its next round and never writes it. If the row is visual, a
   REQUEST row adds or edits its line in `reader-checklist.md`, tagged
   `reader` or `rule:<name>`.
3. **Edit the place; never rebuild it** (owner 2026-09-27). A walked
   place is mostly right; the round changes only what the causes name.
   The layout file is edited in place: every op keeps its `uid`, ops
   are added, changed or removed surgically, the design brief's rows are
   edited the same way, and `apply` re-derives the scene, `check` and
   `compile` from the edited file (that is what `apply` is for: the
   layout is the source, the scene is derived). The round's record is
   the layout diff (`git diff -- <place>.layout.json`), listed in the
   brief's § Rounds with one line per cause. Re-authoring the layout
   from scratch, re-running the site dossier or the promise ledger from
   nothing, or re-choosing shells the owner did not fault, is forbidden
   without a planner ruling naming the cause that needs it. The inner
   loop of steps 2–4 then runs to zero `check` failures and zero reader
   NOs on the edited layout; a reader NO on something the owner called
   right is reported to the planner, not fixed.
4. The layout is edited by `uid`, then `place_gates`, then the place
   joins the next **batch** deploy (16k step 3; in 16k a batch is one
   walk packet, which may hold several places; in Phase 15 a region
   packet) and its walk packet. Never a preflight and deploy per place.

Ends when: every "wrong" is a lessons row with its gate or its tooling
task; the packet is out.

## 8. Slice close (on the owner's "looks right")

`close_place.py --place <id>` (16k S11) does the mechanics: the receipt
(item 3), the `type-recipes.json` row (item 4), the register digest row,
the creative-register row (item 5) and the Starting state stub (item 7),
each a shared-file change the integrator lane applies with the batch's
REQUEST rows. The builder writes the lessons, the type sheet and the
judgements, the shared ones as REQUEST rows.

1. **Lessons this slice** (mandatory): a `<place>.design.md` § Lessons
   this slice, and a row in `references/lessons.md` for every finding that
   cost more than one render round and every compile refusal. Zero rows
   needs a written reason.
2. The type sheet `references/types/<n>-<type>.md`: written by the first
   slice of the type, edited by every later one (yard sets, pieces that
   worked, known failure modes). The first slice close of a type also
   writes the type's layout template generator (`layout_template.py`,
   16k S10) from this place's layout (Claywater writes type 1's) and
   names it in the type sheet.
3. The acceptance receipt: a row in
   `world/sources/placement/accepted-places.json` (place id, the owner's
   date, the hashes of the compiled record and of the place's patches, the
   export's provenance). From now on later gates run on this place in
   report mode only.
   The slice close copies every report-mode row for an accepted place in
   `tooling/world-generation/output/accepted-report.json` into
   `docs/phases/P-polish/backlog.md` as a row (place, gate, finding).
   Nothing writes them there automatically (0100 decision 6).
4. **The type register and the readiness check** (restored 16i item 13,
   16j items 3 and 7): write this place's entry in
   `world/sources/catalogue/type-recipes.json` (type, grammar proved,
   shells and yard sets used); tick world 96 §3 box 1 for the type; list
   in the brief's § Hand decisions every decision this slice needed a
   planner or owner for (the measure of "unattended"), each with the
   skill step or record field that now makes it; and for a non-city
   place, the agent-as-reviewer check: a fresh Sonnet agent reads the
   renders and the check numbers and gives a verdict before the owner's
   final walk, compared with the owner's in § Lessons.
5. Append the place's row to `references/creative-register.md`.
6. Choose the next slice by the contrast rule: a type not yet passing, in
   a contrasting region, not the same type within 300 m or the same
   purpose within 500 m along one road (97 A6, :130–134), **and rotate
   the shells**: a house shell used by a built place is not the next
   place's main shell while the culture's pool (`references/types/`
   shell lists, 0098 bars) holds an unused one with a usable interior.
   Two or three slices of different types run at once while walks are
   pending (16k § The loop step 6), so the next slice may start before
   this one closes; the exception is a type's two in-a-row places after
   its first acceptance, built together and walked in one packet.
7. Replace the 16k brief's Starting state with the next slice's; add the
   slice's row to the ledger.

## Never

- Fix a place record instead of the rule that let the defect through.
- Design before § Site is written and its record defects are tested.
- Place one piece per turn: the whole layout goes in the file, then `apply`.
- Rebuild, recompile or republish an accepted place without a `reopened`
  entry in its receipt (owner date and reason).
- Start a second vocabulary for promises or sockets: the record's typed
  fields (`services`, `sockets`, `questHooks`, quests 85 conditions) are
  the only one.
- Hand-edit a pose or a derived field in the blueprint JSON (L38, L39).
- Invent dressing in the compile, or at a building's foot in code.
- Rerun the chain, refreeze or republish the province for a place (0102
  decision 1).
- Hand over a packet with a check failure or a reader NO (0102 decision 3).

## Not automated yet

- Kit choice per use and culture is a judgement: the gates check a choice
  is legal, not good. The type sheets' yard sets and piece lists are
  where that judgement becomes reusable.
- `waterOk` and `fixedBerthReason` need a lore reason written by hand.
- Type 8 and the opening-scene places are built with the owner (0062 § 9).
