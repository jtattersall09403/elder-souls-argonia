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
| [references/lessons.md](references/lessons.md) | every lesson still in force, each with the gate that enforces it | step 0, in full |
| [references/design-index.md](references/design-index.md) | one line per binding source or prior: the rule id and when it applies | step 0, the rows for this type, culture and step |
| [references/reader-checklist.md](references/reader-checklist.md) | what the Sonnet image reader is told to look for | steps 3–4, pasted into the reader's prompt |
| [references/types/](references/types/) | one design sheet per place type on the 16k list | step 0, this place's type |
| [references/doors-interiors-sockets.md](references/doors-interiors-sockets.md) | door records, shells chosen for their interiors, the fit rule, the tier A export, the interior runtime contract, the socket kinds and gates, the approach checklist | steps 1, 2 and 5 |
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

## 0. Orient (unattended)

1. Read `references/lessons.md` in full, the type sheet, and the rows of
   `references/design-index.md` for this type, culture and step. A stale or
   contradicting lesson row is fixed now (edit the row), never worked round.
2. Read the register of built places: every row of
   `world/sources/placement/accepted-places.json` and every
   `world/sources/blueprints/*.design.md` (type, culture, shells,
   signature assemblies), so this place repeats none of them (0098
   province-wide rows; 97 A6 spacing, :130–134).
3. Pull the record and its promises:

        python3 -m worldgen.blueprint_promises --id <place-id>        # (worldgen)
        python3 -m worldgen.site_dossier --id <slug> --x <positionM x> --z <positionM z> --radius 400   # (worldgen)

   `blueprint_promises` prints the promise ledger: **every service, NPC
   role, travel destination, provision and socket in it is a thing the
   layout must build** (96 step 1). The catalogue record is the row in
   `world/sources/catalogue/places-<zone>.json`; the plot is
   `world/sources/sites/macro-plot.json`; the quest provisions are the
   place's rows in `docs/quests/20-world-provisions.md` and
   `docs/quests/25-quest-place-map.md`; the lore is the dossiers the
   design index names for the culture and type.
4. Write `<place>.design.md` § Site: the record's `why`, `vibe`,
   `services`, `sockets`, `occupants`, `travelStation`, `questHooks`; the
   dossier's heights, water and slope facts (cited by file); the quest
   provisions; the lore read, one line each with its dossier path; the
   places already built nearby and what this one must not repeat.
5. **Record defects are rule gaps.** A service promised with no row behind
   it, a kit the place's culture does not use, a danger band off its
   ground, an `assetPlan` naming a retired piece: add the test that would
   have caught it (the record's own validator, e.g.
   `worldgen/audit_place_semantics.py` or `test_catalogue.py`), watch it
   fail on this record, then fix the record and every other record it
   catches. Only then design (0100 decision 7).

Ends when: § Site is written, every record defect has a failing-then-green
test, and the lessons read raised no stale row left unfixed.

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
- Dressing is authored as named **yard sets** per building kind, defined
  in the type sheet and placed with `group place` (0100 decision 5).
- The bars: read this place's tier object and type object from
  `world/sources/placement/breadth-bars.json` (16k § 1b: shells,
  top-shell share, pieces within 12 m, dressing assets min and max share,
  ground, light and enclosure kinds min, and the distance bars between
  places of one type or purpose) and 0098 § 1's table. Write each bar with
  the number the brief plans to reach. A bar the culture's pool cannot
  reach is a sourcing gap (0098 § 1, reachability).
- § Approach: the 16 questions of
  `docs/research/placement-settlements/openworld-approach-and-wayfinding.md`
  §5, each answered yes or no with its field; each "no" is a layout edit
  or a rule before the walk (`references/doors-interiors-sockets.md` §6).
- § Interiors (0103 decisions 1–2; `references/doors-interiors-sockets.md`
  §2): one row per door: building, shell, tier (A with its chosen cell,
  or `reserved` with the pool named, or `none` for a building nobody
  enters), and why. A lived-in building takes a shell a plugin links to
  a furnished cell; the shell is chosen for its interior as well as its
  exterior. The cell is the fit rule's pick, written by
  `blueprint_interiors.py --claim` in step 2; the brief states the
  expected pick so a different one is noticed.
- § Sockets (0103 decisions 5–6; `references/doors-interiors-sockets.md`
  §5): one row per authored socket: kind, host (the placement it sits on
  or in, or the cell), data (roster slot and schedule, activity, item
  class and value band, container class and fill rule or loot table,
  danger band and zone), why. Every roster slot gets a work and a home
  socket; every promised service an `npc` socket at its parcel. Sockets
  that yard sets and interior cells yield automatically are not rows.

Ends when: every row has all four columns, every bar a planned number,
every door an Interiors row and every promise-ledger occupant, item,
container and ambience line a Sockets row or an automatic source.

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
   added there, never only as a `group save` in the layout.
3. Apply:

        python3 tooling/placement-workbench/wb.py <scene> apply world/sources/blueprints/<place>.layout.json

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
claim or a `reserved` state naming its pool.

## 3. The plan read (seconds per round)

    python3 -m worldgen.render_blueprint --layout ../../world/sources/blueprints/<place>.layout.json --out output/plan   # (worldgen)

`--layout` renders the blueprint the last `apply` derived from that layout
(it refuses when the layout changed since) and implies `--plan`.

Hand the PNG to one Sonnet reader (read-only `general-purpose` agent)
with the **Plan** rows of `references/reader-checklist.md` and the brief's
expectations written first. Fix footprint, spacing, path and door-facing
findings in the layout file; `apply`; render again. No Blender render
until the plan read is clean (0100 decision 3).

Ends when: every Plan row is YES.

## 4. Render rounds (at most four; 0102 decision 4)

    python3 tooling/placement-workbench/wb.py <scene> render --shots auto

One Blender launch: the top view, one front per building, two isos, and a
shot of every `unmined` mount (0102 decision 5). One Sonnet reader per
round, given the Top, Front and Iso rows of
`references/reader-checklist.md`; UNSURE or a black image means a closer
or lit re-render of that shot, never a guess. Memory: `anon` in
`/sys/fs/cgroup/memory.stat` under 7 GiB before a render.

**A round is one batch.** Gather every reader NO and every `check`
failure, edit the layout ONCE for all of them, run one `apply`, one plan
render (step 3), then at most one Blender round. Nothing is fixed one item
at a time. A round never touches a kit build or the frozen world. A
finding that comes back after it was fixed escalates to the planner (no
third fix of the same thing). A small mount not in the mined pairs (child
plan side under 0.6 m, height under 1.0 m) carries `"unmined": "reader-approved rN"` in its
layout op, naming the round whose shot approved it.

Ends when: a round has zero NOs and `check` has zero failures. Four rounds
without that is an escalation to the planner, never a packet.

## 5. Export, patches, compile, publish, gates

    python3 tooling/placement-workbench/wb.py <scene> export world/sources/blueprints/<place-id>.json --write
    python3 -m worldgen.compile_settlement --blueprint ../../world/sources/blueprints/<place-id>.json --out output/settlements   # (worldgen)
    python3 -m worldgen.export_interior_bundle --blueprint ../../world/sources/blueprints/<place-id>.json   # (worldgen)
    python3 -m worldgen.export_settlement_bundle --copy-assets --places <place-id>   # (worldgen)

- Export writes the poses (0097) and the ground and kit provenance.
- Patches are the place's own typed ones only (0081 decision 3: pad,
  `vegetation-clearance`, dressing-add); they travel in the place's bundle
  and the studio applies them as a runtime overlay when it loads the
  terrain chunk or vegetation cell they touch (0102 decision 1).
  `compile_scatter` is never re-run for a place (lesson L35), and no chain
  stage, refreeze or province publish runs for one.
- Publish is per place (`--places`, 16k § 1b); a whole-catalogue compile
  runs only after a fresh sample batch passes.
- Gates, all green before the walk:
  - the yard regression gates: `worldgen/test_proving_ground.py` and
    `tooling/placement-workbench/tests/test_proving_ground_b.py`
    (0099 decision 7; a slice that breaks one is not ready to walk);
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
  - `npm run docs:check`, then `npm run preflight -- --paths <this
    place's files and the skill>`.

Ends when: 0 compile errors, every gate green, the place published.

## 6. The walk packet (16k § Owner check-ins)

    python3 tooling/placement-workbench/wb.py - walktable <place-id>

- One row per placed item, the full list every time (never "the rest as
  before"): item, E / S (studio km, read from this run's compiled output),
  piece, fit, `$ES_TUNNEL_URL/?view=character&x=<E>&z=<S>&t=12`; one row
  for the anchor.
- **Interiors to enter:** one row per tier A door: building, door id,
  cell, the door's studio link and
  `$ES_TUNNEL_URL/?view=character&interior=<cellId>`; one check per row
  (go in, look round, come back out onto the same doorstep). Reserved
  doors are listed with their pool, not as gaps.
- **Sockets:** the link with `&sockets=1` added, to see every socket as a
  labelled marker; the counts per kind in one line.
- The measured numbers per item, never a question the tools can answer
  (0102 decision 2): the walk route (length, steepest slope, highest
  step) to every door and opening; the floor-edge gap per building; the
  beached craft's numbers; each prop's seat gap. Under them, one
  plain-English look-and-feel check per line, "what changed since the
  last walk", any world-level calls, and a request for the
  low/medium/high frame-rate readings at the anchor.
- No "Known gaps" section. A `§ Gaps` section may hold only rows for one
  of 0102 decision 3's four reasons, each row naming its reason: (a) a
  system a later phase owns, its socket in the data; (b) a judgement that
  needs the GPU studio; (c) an asset that exists nowhere after a completed
  sourcing search, with its register row; (d) a world-level call reserved
  for the owner. Anything else is work the slice finishes first.
- Pictures (0102 decision 11): the plan render and up to four Blender
  shots, copied to `tooling/.reports/16k/<place>-walk-N/` and committed
  (the folder is gitignored: `git add -f -- <png>`), then embedded by
  `--attach`.
- How to reply: one message; per row the item name and "right" or
  "wrong: what you see"; skip a row not reached and say so; "looks right"
  when the place is done.
- End with the stay-or-switch line (decision 0083).
- Post the packet: `python3 tooling/repo-standards/owner_inbox.py --post <packet.md> --title '<Place> walk packet' --attach <plan.png> <shot.png>...` (the owner reads it on their phone; each image becomes a blob link on the current branch, so commit the PNGs first; a link loads once `dev` holds them on GitHub).

## 7. The fix round (`continue 16k slice N after owner walk`)

1. Group every "wrong" in the reply by cause across the whole reply.
2. Per cause: a rule (world 97 §C, the type sheet or this skill), a gate
   or `check` rule **shown failing first on the defect**, and a row in
   `references/lessons.md` (edit the existing row if one covers it). If
   the row is visual, add or edit its line in `reader-checklist.md`.
3. Rebuild the place from the corrected rules: edit the layout, `apply`,
   step 5. One preflight, one republish, the next walk packet.

Ends when: every "wrong" is a lessons row with its gate; the packet is out.

## 8. Slice close (on the owner's "looks right")

1. **Lessons this slice** (mandatory): a `<place>.design.md` § Lessons
   this slice, and a row in `references/lessons.md` for every finding that
   cost more than one render round and every compile refusal. Zero rows
   needs a written reason.
2. The type sheet `references/types/<n>-<type>.md`: written by the first
   slice of the type, edited by every later one (yard sets, pieces that
   worked, known failure modes).
3. The acceptance receipt: a row in
   `world/sources/placement/accepted-places.json` (place id, the owner's
   date, the hashes of the compiled record and of the place's patches, the
   export's provenance). From now on later gates run on this place in
   report mode only.
   The slice close copies every report-mode row for an accepted place in
   `tooling/world-generation/output/accepted-report.json` into
   `docs/phases/P-polish/backlog.md` as a row (place, gate, finding).
   Nothing writes them there automatically (0100 decision 6).
4. Choose the next slice by the contrast rule: a type not yet passing, in
   a contrasting region, not the same type within 300 m or the same
   purpose within 500 m along one road (97 A6, :130–134).
5. Replace the 16k brief's Starting state with the next slice's; add the
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
