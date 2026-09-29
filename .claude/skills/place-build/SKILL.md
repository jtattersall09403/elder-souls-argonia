---
name: place-build
description: Design and build one real place (settlement, camp, shrine, works, dungeon entrance) on the frozen world, from its catalogue record to an owner-accepted place — orient on the lessons and the grounding index, write the site dossier and the design brief, author the whole layout as one file, apply it in the workbench, read the plan and the renders, export, compile, publish only this place, hand over the walk packet, run the fix round, close the slice with its lessons. Use for every "deliver 16k slice N" and "continue 16k slice N after owner walk", and whenever a place's layout is authored or re-authored.
---

# Place build

> **Written against** (decision 0086 rule 4; `routing-audit` checks these):
> decisions 0097, 0098, 0099, 0100 (this skill's architecture), 0101,
> 0102 (a place carries its own ground; no unfinished hand-off), 0103
> (tier A interiors ship in 16k; every promise a placed socket), 0105
> (rulings: [references/rulings.md](references/rulings.md), 0106), 0081
> decisions 3–4; the 16k brief
> (`docs/phases/16-foundation-and-places/16k-place-loop.md`) § The loop,
> § The checklist, § Owner check-ins; world 97 (binding rules) and 96 §2
> (history); decision 0041 § Taste ledger. If a cited record has moved,
> this skill is stale: report it, do not follow it blind.

This skill holds the procedure; its `references/` hold the grounding:

| File | What it is | Read |
|---|---|---|
| [references/lessons.md](references/lessons.md) | the lessons store's index (sections in `lessons/`, per-type index; 0106): every lesson still in force, each with its gate | step 0, only the rows the site packet lists for this type; a section file when a job needs it |
| [references/design-index.md](references/design-index.md) | one line per binding source or prior: the rule id and when it applies | step 0, the rows for this type, culture and step |
| [references/reader-checklist.md](references/reader-checklist.md) | what the Sonnet image reader is told to look for | steps 3–4, pasted into the reader's prompt |
| [references/types/](references/types/) | one design sheet per place type on the 16k list | step 0, this place's type |
| [references/doors-interiors-sockets.md](references/doors-interiors-sockets.md) | door records, shells chosen for their interiors, the fit rule, the tier A export, the interior runtime contract, the socket kinds and gates, the approach checklist | steps 1, 2 and 5 |
| [references/round-recipe.md](references/round-recipe.md) | the timetable of one round: what fans out, what the builder does itself, what is never done in a round | steps 2–4 and 7, before the first edit |
| [references/creative-register.md](references/creative-register.md) | one row per built place: the creative calls made above its promises, so the next place makes different ones | step 1 § Creative register; appended at step 8 |
| [references/rollout-packet-template.md](references/rollout-packet-template.md) | the spec the Phase 15 packet template meets (16j item 8) | at the loop's exit only |
| [references/rulings.md](references/rulings.md) | every place ruling (R1–R55), one row each with its gate and source; the ONLY home of a ruling (0106) | step 0; read this table, never the lane reports (R39) |
| [references/builder-practice.md](references/builder-practice.md) | how the builder works: recommend and do, fan out, scan before editing, one batch per round, per-place files, proven-type fast path | once per slice, before step 0 |
| [references/brief-sections.md](references/brief-sections.md) | what § Interiors, § Containers and items, § Creative register, § Sockets, § Quests and § Seams must say | step 1 |
| [references/fix-round-brief-template.md](references/fix-round-brief-template.md) | the planner's fix-round brief: needs, never sites; sourcing candidates cite their record row | step 7 (planner) |

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

## How the builder works

[references/builder-practice.md](references/builder-practice.md) holds the
binding practice (owner 2026-09-27): tool gaps go to a tooling sub-lane and
never ride in a place round; everything that can run beside the edit is
fanned out; **`wb.py scan` before any building is sited or re-sited** (the
`scanFreshRule` check fails a building op no fresh scan covers, 0105 R31);
one round is one batch and one apply; a fresh agent per round; builders
write only per-place files and file REQUEST rows for shared ones; a proven
type takes the template fast path; six builders at once.
## 0. Orient (unattended)

The stage clock (16k § Build cost is measured as data): each `--start`
below ends the stage before it. Runs are keyed by place and walk (0105
R32): the first build's orient opens walk 0; a fix round's orient names the
owner walk whose reply it works (`--walk N`, step 7), and an orient that
would join an earlier walk's run is refused.

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage orient --start

1. Read the site packet (the lessons rows for this type come in it), the
   type sheet, the rows of `references/design-index.md` for this type,
   culture and step, and `references/rulings.md` (never the lane reports).
   A stale or contradicting lesson row is fixed now (a REQUEST row editing
   it), never worked round.
2. Read the register digest (one line per built place: type, culture,
   shells, signature assemblies; never every `design.md`), so this place
   keeps 0098's province-wide rule (one signature at most 3 times in the
   province, never twice within 2 km) and is not the same signature as a
   place of its type within its region (97 A6, :130–134). The signature is
   CLAIMED at step 1 by a locked row in
   `world/sources/placement/signature-claims.json`; the batch gate recounts.
3. Pull the record and its promises:

        python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage dossier-and-brief --start
        python3 -m worldgen.blueprint_promises --id <place-id> --write   # (worldgen)
        python3 -m worldgen.site_dossier --id <slug> --x <positionM x> --z <positionM z> --radius 400   # (worldgen)

   `blueprint_promises --write` generates the **promise ledger**
   `world/sources/placement/promises/<place-id>.json` (0104 decision 3): one
   row per promise (service, NPC role, travel operator, quest provision,
   catalogue socket bucket, D0 safe interior), each with a stable `promise.`
   id, its source record and field, and its text. **It is the checklist you
   start from, work through and end on**: every row is filled by a placed
   thing carrying `fills: [that id]` (0104 decision 4) or carries an
   `unfilled` block with one of 0102's four reasons; the compile fails
   otherwise (0104 decision 5). The catalogue record is the row in
   `world/sources/catalogue/places-<zone>.json`; the plot is
   `world/sources/sites/macro-plot.json`; the quest provisions are the
   place's rows in `docs/quests/20-world-provisions.md` and
   `docs/quests/25-quest-place-map.md`; the lore is the dossiers the design
   index names for the culture and type.
   **Read the prose too, sceptically.** The record's `why`, `vibe` and
   description carry intent the typed fields do not; build to it. Where it
   contradicts the dossier, the typed fields or an asset fact, the typed
   field and the ground win and the prose is corrected (lessons L02, L06).
   No line of prose claims a world behaviour the runtime lacks (0105 R5:
   a flood, a tide, a rising ford, a collapse); a claim with no system
   behind it is rewritten to what the player can see.
   **Two-way (0104 decision 6):** a promise the world cannot keep (an item
   class no asset shows, a service the ground or culture forbids, an
   interior no plugin furnishes) is neither left hanging nor faked: file a
   REQUEST row changing the source record to the nearest thing the world
   can keep, design on the corrected record, list the prose for the batch's
   one `text-review`, and log it in the brief's § Record corrections. A
   change to a quest's premise or a place's purpose is an owner call.
3b. **The place in its world (seams).** Read the route records that touch
   it (`world/sources/routes/`: the trunk or leg it sits on, every minor
   route ending at it, the ferry crossing and its berths in
   `travel-services.json`), the painted road polygon and width, and the
   neighbours within 500 m (the site packet). Decide **on the road** (the
   painted road is the spine: buildings face it, nothing but ways,
   crossings and verge signs touch it) or **off the road** (the internal
   ways join the minor route at its terminal). Every internal way reaches a
   real `networkTerminals[]` entry; the `check` rules catch the rest
   (`roadSurfaceRule`, `berthReachRule`, `signRule`, `pathReachRule`).
4. Write `<place>.design.md` § Site: the record's `why`, `vibe`,
   `services`, `sockets`, `occupants`, `travelStation`, `questHooks`; the
   dossier's heights, water and slope facts (cited by file); the quest
   provisions; the lore read, one line each with its dossier path; the
   places already built nearby and what this one must not repeat.
5. **Record defects are rule gaps, fixed outside the slice.** A service
   promised with no row, a kit the culture does not use, a danger band off
   its ground, an `assetPlan` naming a retired piece: file it to the
   tooling sub-lane with the failing record named (the lane writes the
   validator test and fixes every record it catches; 0100 decision 7). The
   correction for this place is a REQUEST row; design proceeds on it.

Ends when: § Site is written, every record defect is filed with its
failing record named, and no stale lessons row is left unfixed.

## 1. Design brief

Write `<place>.design.md` § Brief before touching the workbench. One row
per building, enclosure, path, light, water edge and dressing group:

| Thing | Purpose (who, what trade, which promise) | Kit piece (measured with `wb.py - describe`) | Rule or lore pointer |
|---|---|---|---|

- Every promise-ledger line appears as a row or as a written reason it is
  not built here.
- Pieces are chosen on measured size and the mined evidence, never on a
  label (lessons L04, L05). **A candidate cites its record row** (0105
  R34): the setting class (`settingClass` on the manifest row), the sink
  row and the mounts pair it relies on; one with no row is marked
  UNVERIFIED and is checked before it is placed. A survey by filename is
  a lead, never a fact. A piece nobody made is a sourcing job (CLAUDE.md),
  shown as a gap.
- **Setting class** (R1, R9, R14–R17, R23): the piece's own plugin
  licenses its setting and social scale; the place's class is its recipe's
  `settingClass`. Gate `setting.class`.
- **Lights** (R3, R7, R38): no point in the place, neighbours' fixtures
  included, sees more than 16 fixtures within 200 m (gate
  `lights.density`); plan the lit entrances first. Argonian hanging
  lanterns hang where you judge they look good, at the mod's height,
  verified by the reader pass.
- **Sinks** (R12, R36): a tree, piece of architecture or piece 3 m or
  taller whose sink row is the mesh-sill fallback is listed by gate
  `sink.fallback` and holds the place red: choose a measured piece, or file
  its row to the sink miner.
- Dressing is authored as named **yard sets** per building kind, defined
  in the type sheet and placed with `group place` (0100 decision 5).
- The bars: this place's tier and type objects in
  `world/sources/placement/breadth-bars.json` (16k § 1b) and 0098 § 1's
  table, each written with the number the brief plans to reach; the
  per-dwelling count is R6's. A bar the culture's pool cannot reach is a
  sourcing gap (0098 § 1).
- **§ Variety** (R4, R37): one row per building: the shell and interior
  cell chosen, and every pool member rejected with its reason (used within
  2 km, used 3 times province-wide, no link, fails the fit rule). Read the
  register digest and `interiorCellClaims` in
  `world/sources/placement/signature-claims.json` first. A cell already
  used in the region is legal only when every cell the fit rule accepts for
  the parcel is used there; the gate computes that from the claim table.
  Hold the cells once claimed (step 2 item 4):
  `python3 -m worldgen.place_gates --id <place-id> --claim-cells` (worldgen).
  Gate `interiors.variety`.
- § Approach: the 16 questions of
  `docs/research/placement-settlements/openworld-approach-and-wayfinding.md`
  §5, each answered yes or no with its field; each "no" is a layout edit or
  a rule before the walk (`references/doors-interiors-sockets.md` §6).
- § Interiors, § Containers and items, § Creative register, § Sockets,
  § Quests, § Seams: what each says is in
  [references/brief-sections.md](references/brief-sections.md). The rules
  in short: one Interiors row per door, `reserved` only for a tier B or C
  interior (R2, R10); a shell with a load doorway gets its author's
  interior from assets we hold (never Creation Club, HearthFires,
  Dawnguard, Dragonborn or the SE resource pack), else a doorless piece is
  walked into; containers and visible items are placed as meshes now;
  three creative calls unlike the register's rows; every roster slot has a
  work and a home socket.

Ends when: every row has all four columns, every bar a planned number,
every door an Interiors row, every promise a fulfilment or an `unfilled`
reason, every § Seams way a real terminal, and every sourcing candidate a
record row or an UNVERIFIED mark.

## 2. The layout file, then apply

1. The blueprint skeleton `world/sources/blueprints/<place-id>.json`: the
   fields export does not write (districts, `approaches[]`,
   `networkTerminals[]`, `why` blocks, services; a door with no interior
   is `none`, lesson L21). Interior claims are never written by hand.
2. The layout `world/sources/blueprints/<place>.layout.json`
   (`schemaVersion` 1; schema in `tooling/placement-workbench/README.md`
   § apply): the ordered operations for the **whole place** (`window`,
   `place`, `snap`, `mount`, `attach`, `group place`, `path`, `bind`,
   `socket` per § Sockets row, `pool` for a spring or basin, `note`), every
   building and dressing group of the brief in it before the first apply. Yard sets come from
   `world/sources/placement/yard-sets/<type>.json` (0101); a new set is a
   REQUEST row, never only a `group save` in the layout.
3. Scan every building's site, then apply:

        python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage survey-and-scans --start
        python3 tooling/placement-workbench/wb.py <scene> scan <place>.scan.json --out tooling/.reports/16k/<place-id>/round-N/scan.json
        python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage layout-to-compile --start
        python3 tooling/placement-workbench/wb.py round <scene> world/sources/blueprints/<place>.layout.json --no-shots

   `round` rebuilds the scene from a fresh window in one process, runs
   `check` and `compile`, and writes one summary. The scene is derived
   state; a tweak is a layout edit and one more `apply`. A building op
   whose pose no scan newer than HEAD covers fails `scanFreshRule` (R31).
4. The interior claims (0103 decision 2):

        python3 -m worldgen.blueprint_interiors --claim ../../world/sources/blueprints/<place-id>.json   # (worldgen)

   It writes each door's `interiorClaim` from the shell's linked set by the
   fit rule; compare with § Interiors and fix the brief or the shell, never
   the claim.

Ends when: `apply` reports 0 compile errors, `check` has ZERO failures
(placement-workbench § 5), every lived-in door has a tier A claim (or, for
a tier B or C interior only, `reserved` naming its pool; R2), and
`place_gates --claim-cells` holds its cells.

## 3. The plan read (only when the compile gates are red, or the type is unproven and its sheet asks)

    python3 -m worldgen.render_blueprint --layout ../../world/sources/blueprints/<place>.layout.json --out output/plan   # (worldgen)

`--layout` renders what the last `apply` derived (refused when the layout
changed since) and implies `--plan`. Renders carry no text (R8);
`--labels` is for a human debugging a render only. Hand the PNG to one
Sonnet reader with the **Plan** rows of `references/reader-checklist.md`
and the brief's expectations written first; fix footprint, spacing, path
and door-facing findings in the layout; `apply`; render again. No Blender
render until the plan read is clean (0100 decision 3 as amended).

Ends when: every Plan row is YES.

## 4. Render rounds (at most four; 0102 decision 4)

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage readers --start
    python3 tooling/placement-workbench/wb.py round <scene> world/sources/blueprints/<place>.layout.json

One Blender launch: the top view, one front per building, two isos, and a
shot of every `unmined` mount (0102 decision 5). The readers run as one
`Workflow`, one Sonnet reader per image or contact sheet, one merged NO
list (`references/round-recipe.md` step 3); each gets only the
`reader`-tagged rows of `references/reader-checklist.md` for its view:
readers judge only what `check` cannot measure. A NO, an UNSURE, a black
image or a `check` number near its bar is settled on the geometry at the
next launch (round-recipe 3a: `--focus --span` close-up, `cutaway --cut`
section, `@night`, or a `wb.py bpy` contact/ray script), never guessed.
A fix round renders the published place (round-recipe 3b).

**A round is one batch.** Every reader NO and every `check` failure, one
layout edit, one `apply`, then at most one Blender round; nothing is fixed
one item at a time, and a round never touches a kit build or the frozen
world. A finding back after it was fixed escalates to the planner. A small
mount not in the mined pairs (child plan side under 0.6 m, height under
1.0 m) carries `"unmined": "reader-approved rN"` naming the approving round.

Ends when: a round has zero NOs and `check` has zero failures. Four rounds
without that is an escalation to the planner, never a packet.

## 5. Export, patches, compile, publish, gates

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage publish --start
    python3 tooling/placement-workbench/wb.py <scene> export world/sources/blueprints/<place-id>.json --write
    python3 -m worldgen.compile_settlement --blueprint ../../world/sources/blueprints/<place-id>.json --out output/settlements   # (worldgen)
    python3 -m worldgen.export_interior_bundle --blueprint ../../world/sources/blueprints/<place-id>.json   # (worldgen)
    python3 -m worldgen.export_settlement_bundle --copy-assets --places <place-id>   # (worldgen)
    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage publish --end
    python3 -m worldgen.place_gates --id <place-id>   # (worldgen)

- Export writes the poses (0097) and the ground and kit provenance.
- Patches are the place's own typed ones only (0081 decision 3: pad,
  `vegetation-clearance`, dressing-add); they travel in its bundle and the
  studio overlays them at load (0102 decision 1). `compile_scatter` is
  never re-run for a place (L35); no chain stage, refreeze or province
  publish runs for one. Publish is per place (`--places`).
- `place_gates` runs every per-place gate in one process (its module
  docstring lists them): the 0102 `check` rules (`walkRule`,
  `floorEdgeRule`, `pathReachRule`, `propSeatRule`, `beachedRule`,
  `ownerOkRule`, `scanFreshRule`), the compile's reader-checklist gates and
  lit-entrance rule (97 C16), the socket and promise gates (0103, 0104),
  the interior bundle gate, the 0098 variety and breadth bars, and the 0105
  gates (`setting.class`, `interiors.reserved`, `interiors.variety`,
  `lights.density`, `sink.fallback`). All green before the walk.
- Per BATCH, never per place (a walk packet's places in 16k, a region
  packet in Phase 15): the yard regression gates
  (`worldgen/test_proving_ground.py`,
  `tooling/placement-workbench/tests/test_proving_ground_b.py`, 0099
  decision 7), the integrator's REQUEST rows, the one `text-review` (0106:
  once per batch, here only), `npm run docs:check`, ONE `npm run preflight
  -- --paths <the batch's files>` (0106; its review reads code only), deploy.

- **Verify against the published result** (R74). Every numeric or
  positional claim bound for a packet or fix-round report ("lowered 1 m",
  "path painted", "lamp inside the lantern") is read back from
  `apps/world-studio/public/province/settlements/<place-id>.json`, never
  from the layout op, the scene or memory of the edit: a pose is
  `placements[].positionM` (y = `[1]`, `yFinal: true`) and `yawDeg`; a
  painted way is `settlement.groundPaint.entries[]` (`polygonM`); a
  socket is `settlement.sockets`; a door is `doors[]`. Compare against
  the previous published value (`git show <walked rev>:<that file>`);
  unchanged where a change was claimed is a defect, found here.

Ends when: 0 compile errors, every per-place gate green, the place
published and every claim read back; the batch gates run when the
batch's last place gets here.

## 6. The walk packet (16k § Owner check-ins)

**The packet is short and assumes the owner knows nothing about the
place** (owner 2026-09-27). No per-item tables; every in-world thing is
introduced the first time it is named; plain English, at most ~20 lines
per place plus pictures; a packet of several places repeats sections 2–5
per place, in road order. Every line is under R5: checked against the
records and the runtime, never written from memory. Sections, in order:

1. **What this place is** (three sentences: where, who, why it exists).
2. **Start here:** one deployed-studio link at the anchor
   (`https://<pages-url>/?view=character&x=<E>&z=<S>&t=12`; the deploy ran
   green first), one link per building to enter (and its
   `&interior=<cellId>` form), and the `&sockets=1` link.
3. **What changed since the last walk:** the lines
   `python3 tooling/placement-workbench/wb.py whatchanged <layout> --base <the walked commit>`
   prints (R35: generated from the layout diff, each piece named by its
   manifest `displayName`), grouped under the cause each fixes. A piece it
   reports unnamed is named from its record before posting, never from
   memory; a line claiming a move or a height carries the published
   before/after value from the § 5 read-back (R74).
4. **The numbers, one line:** `check` 0 failures, reader 0 NOs, promises
   filled N of N, colliders, lights, interiors shipped. The full
   `walktable` goes to `tooling/.reports/16k/<place>-walk-N/`, its links on
   the deployed Pages URL, never `$ES_TUNNEL_URL`.
5. **Please look at** (at most eight lines): only judgements no tool makes.
6. **§ Gaps** only for 0102 decision 3's four reasons; **§ Owner calls**
   only for world-level choices. Never an archive purchase, a sourcing
   question or unfinished work.
7. Pictures (0102 decision 11): the plan render and up to four Blender
   shots in `tooling/.reports/16k/<place>-walk-N/`, committed
   (`git add -f -- <png>`), embedded by `--attach`.
8. How to reply: "walk it and tell me what looks wrong, in one message;
   'looks right' when done." Then the stay-or-switch line (0083).

Post (`owner_inbox.py --attach <png...> --walk <walk>`, commit 6201d27f):
run `python3 tooling/repo-standards/owner_inbox.py --post <packet.md>
--title '<Place> walk N' --attach <plan.png> <shot.png>... --walk <walk>`
once first — it copies the pictures into
`tooling/.reports/16k/<walk>/pictures/` and stages them, then refuses to
post until they are committed; commit and push those files on the branch,
then run the SAME command again to actually post. Collapse old packets
with `owner_inbox.py --collapse`.

## 7. The fix round (`continue 16k slice N after owner walk`)

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage orient --start --walk <N>

`N` is the owner walk whose reply this round works (R32); the run is
`<place-id>#walk-N`. The round reads only its round folder's fix list,
`waiting-on.json` and the lessons and rulings rows the fix list names.

1. Group every "wrong" in the reply by cause across the whole reply.
2. Per cause: a REQUEST row for `references/lessons.md` (an edit of the
   existing row if one covers it); a rule, gate or `check` rule the cause
   needs goes to the tooling sub-lane, which shows it **failing first on
   the defect**; the place round takes it at its next round and never
   writes it. A visual row gets its `reader-checklist.md` line by REQUEST.
3. **Edit the place; never rebuild it** (owner 2026-09-27). Every op keeps
   its `uid`; ops are added, changed or removed surgically, the brief's
   rows likewise, and `apply` re-derives the scene. A building to re-site
   is scanned first (R31): the planner's brief names the need, the scan the
   site. Re-authoring the layout, re-running the dossier or the ledger from
   nothing, or re-choosing shells the owner did not fault needs a planner
   ruling naming the cause. The inner loop of steps 2–4 runs to zero
   `check` failures and zero reader NOs; a reader NO on something the
   owner called right goes to the planner, not fixed.
4. Then `place_gates` and the § 5 read-back of every fix against the
   published bundle (R74; a fix not visible there is not done), then the
   place joins the next **batch** deploy and its walk packet, whose
   § What changed is `wb.py whatchanged` (R35).
   Never a preflight and deploy per place.

Ends when: every "wrong" is a lessons row with its gate or its tooling
task; the packet is out.

## 8. Slice close (on the owner's "looks right")

`close_place.py --place <id>` (16k S11) does the mechanics: the acceptance
receipt, the `type-recipes.json` row, the register digest row, the
creative-register row and the Starting state stub, each a shared-file
change the integrator applies with the batch's REQUEST rows. The builder
writes the lessons, the type sheet and the judgements:

1. **Lessons this slice** (mandatory): `<place>.design.md` § Lessons this
   slice, and a `references/lessons.md` row for every finding that cost
   more than one render round and every compile refusal; zero rows needs
   a written reason.
2. The type sheet `references/types/<n>-<type>.md`: written by the type's
   first slice (which also writes its `layout_template.py` generator from
   this layout, 16k S10), edited by every later one.
3. The receipt in `world/sources/placement/accepted-places.json` (place,
   owner's date, hashes of the compiled record and patches, provenance);
   later gates run on the place in report mode only, and the slice close
   copies its report-mode rows from
   `tooling/world-generation/output/accepted-report.json` into
   `docs/phases/P-polish/backlog.md` (0100 decision 6).
4. The type register and readiness check (16i item 13, 16j items 3 and 7):
   the place's `type-recipes.json` entry; world 96 §3 box 1 for the type;
   the brief's § Hand decisions (every decision that needed a planner or
   owner, each with the step or field that now makes it); for a non-city
   place, a fresh Sonnet agent's verdict on the renders and numbers before
   the owner's final walk, compared in § Lessons.
5. Choose the next slice by the contrast rule: a type not yet passing, a
   contrasting region, not the same type within 300 m or purpose within
   500 m along one road (97 A6), and rotate the shells while the culture's
   pool holds an unused one with a usable interior. Two or three slices of
   different types may run at once while walks are pending. Replace the
   16k brief's Starting state with the next slice's.

## Never

- Fix a place record instead of the rule that let the defect through.
- Design before § Site is written and its record defects are tested.
- Place one piece per turn, or site a building without a scan (R31).
- Rebuild, recompile or republish an accepted place without a `reopened`
  entry in its receipt (owner date and reason).
- Start a second vocabulary for promises or sockets (the record's typed
  fields and quests 85 conditions are the only one).
- Hand-edit a pose or a derived field in the blueprint JSON (L38, L39).
- Invent dressing in the compile, or at a building's foot in code.
- Rerun the chain, refreeze or republish the province for a place (0102
  decision 1).
- Hand over a packet with a check failure, a reader NO or a red gate
  (0102 decision 3).

## Not automated yet

- Kit choice per use and culture is a judgement: the gates check a choice
  is legal, not good; the type sheets make the judgement reusable.
- `waterOk` and `fixedBerthReason` need a lore reason written by hand.
- Type 8 and the opening-scene places are built with the owner (0062 § 9).
