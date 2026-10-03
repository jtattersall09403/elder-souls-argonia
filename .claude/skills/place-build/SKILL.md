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
> (history); decision 0041 § Taste ledger; `docs/world/20-province-design.md`
> §16, `docs/world/50-hydrology-climate.md`, `docs/world/55-light-sky-time.md`,
> `world/sources/climate/weather-states.json` and
> `world/sources/lore/topics/material-culture.md` (steps 1a and 4b),
> `world/sources/assets/README.md`, `world/sources/assets/vault-inventory.md`
> and `apps/world-studio/public/province/blueprints.json` (step 1a § Palette), the `kit-build` and `visual-look` skills and
> `tooling/visual-look/look-lists.md` (step 1c). If a cited record has moved,
> this skill is stale: report it, do not follow it blind.

This skill holds the procedure; its `references/` hold the grounding:

| File | What it is | Read |
|---|---|---|
| [references/design-intent.md](references/design-intent.md) | § Intent and § Walk-through: mood levers, the region-derived palette, decision 0102 direction | step 1a |
| [references/feel-check.md](references/feel-check.md) | eye-height shots, the reader brief, the exit rule | step 4b |
| [references/type-feel.md](references/type-feel.md) | the feel method per type × region, with worked examples | step 1a |
| [references/lessons/](references/lessons/README.md) | the lessons store, one file per section (README: row format and what each file holds; 0106): every lesson still in force, each with its gate | step 0, only the rows the site packet lists for this type; a section file when a job needs it |
| [references/design-index.md](references/design-index.md) | one line per binding source or prior: the rule id and when it applies | step 0, the rows for this type, culture and step |
| [references/dressing.md](references/dressing.md) | the facing table, idle-socket placement, signs by use and pool, and the dressing each place still lacks with its kit | steps 1-2, the dressing groups |
| [references/reader-checklist.md](references/reader-checklist.md) | what the `image-reader` agent is told to look for | steps 3–4, pasted into the reader's prompt |
| [references/types/](references/types/) | one design sheet per place type on the 16k list | step 0, this place's type |
| [references/doors-interiors-sockets.md](references/doors-interiors-sockets.md) | door records, shells chosen for their interiors, the fit rule, the tier A export, the interior runtime contract, the socket kinds and gates, the approach checklist | steps 1, 2 and 5 |
| [references/round-recipe.md](references/round-recipe.md) | the timetable of one round: what fans out, what the builder does itself, what is never done in a round | steps 2–4 and 7, before the first edit |
| [references/creative-register.md](references/creative-register.md) | one row per built place: the creative calls made above its promises, so the next place makes different ones | step 1 § Creative register; appended at step 8 |
| [references/rollout-packet-template.md](references/rollout-packet-template.md) | the spec the Phase 15 packet template meets (16j item 8) | at the loop's exit only |
| [references/rulings.md](references/rulings.md) | every place ruling, one row each with its gate and source; the ONLY home of a ruling (0106) | step 0; read this table, never the lane reports (R39) |
| [references/builder-practice.md](references/builder-practice.md) | how the builder works: recommend and do, fan out, scan before editing, one batch per round, per-place files, proven-type fast path | once per slice, before step 0 |
| [references/brief-sections.md](references/brief-sections.md) | what § Interiors, § Containers and items, § Creative register, § Sockets, § Quests and § Seams must say | step 1 |
| [references/fix-round-brief-template.md](references/fix-round-brief-template.md) | the planner's fix-round brief: needs, never sites; sourcing candidates cite their record row | step 7 (planner) |
| [references/promise-ledger.md](references/promise-ledger.md) | the promise ledger's rows, where each source lives, reading the prose, the two-way rule | step 0 item 3 |
| [references/publish-gates-and-readback.md](references/publish-gates-and-readback.md) | what `place_gates` runs, the per-batch gates, the R74/R81 read-back against the published bundle | step 5, step 7 item 4 |
| [references/walk-packet.md](references/walk-packet.md) | each walk-packet section in full and the two-run post procedure | step 6 |
| [references/palette-and-breadth.md](references/palette-and-breadth.md) | the palette from the whole pool, siblings, internal variety, the kit lane, the ledger | step 1a |
| [references/reader-brief.md](references/reader-brief.md) | the one image-reader brief template: context, checklist, open question last, exit rule | steps 3-4, every reader brief |
| [references/kit-review.md](references/kit-review.md) | the review of a kit lane's results: measured gates, the six-view look, the kit checklist, a finding changes the kit skill | step 1c, step 4 |
| [references/asset-breadth-ledger.md](references/asset-breadth-ledger.md) | one row per closed place: palette and assets used against available | step 8 |

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
the owner, batched into the next walk packet (the decision-rights table in
[references/builder-practice.md](references/builder-practice.md) lists every other call).

**A place's files and entity tables**: [docs/world/98-data-model.md](../../../docs/world/98-data-model.md)
§ A place's files, read at step 0.

## How the builder works

A place is designed from what it must feel like to the player, then built
from pieces, then checked against that feel: intent and walk-through first
(1a), the brief's rows serve them (1), gates prove the build is correct
(5), the feel check proves it is the place the record describes (4b). Read
the record as a story about people in a particular region and climate,
never as a parts list.

[references/builder-practice.md](references/builder-practice.md) holds the
binding practice (owner 2026-09-27): tooling sub-lane, fan-out, **`wb.py
scan` before any building is sited** (`scanFreshRule`, R31), one batch per
round, a fresh agent per round, per-place files, the proven-type fast path,
and **a first-of-type place launched as three briefs, never one**.

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
   `world/sources/placement/promises/<place-id>.json` (0104 decision 3):
   **the checklist you start from, work through and end on**: every claim
   of the record, a `thing-<noun>` row per physical noun its prose names.
   Each row is filled by the placed thing that shows it (`fills`), or
   `unfilled` with a 0102 reason; prose rows are confirmed on placement
   ids at step 5b; `worldgen.promise_gate` fails a filler not in the
   published bundle. Rules: [references/promise-ledger.md](references/promise-ledger.md).
3b. **The place in its world (seams).** Read its routes, ferry berths,
   road polygon and 500 m neighbours; decide **on the road** or **off the
   road**; every internal way reaches a real `networkTerminals[]` entry
   ([references/brief-sections.md](references/brief-sections.md) § Seams).
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

## 1a. Design intent and the walk-through (before any row)

Read the place record's region and setting fields, the region's climate
profile and weather frequencies, the palette derived from the place's
region records ([references/design-intent.md](references/design-intent.md) item 4), and the
type's row in [references/type-feel.md](references/type-feel.md). Write
`<place>.design.md` § Intent and § Walk-through by answering
[references/design-intent.md](references/design-intent.md). The record's
`why`, `vibe` and hooks are the intent, read as story beats. Nothing is
placed before both sections exist. A decision only the owner can make goes
to the decision-rights table in [references/builder-practice.md](references/builder-practice.md).

§ Palette: choose from the whole pool, consistent with region-and-culture siblings yet distinct, further from the same type elsewhere; a chosen asset not yet in a kit starts a kit lane in this slice ([references/palette-and-breadth.md](references/palette-and-breadth.md)).

### 1c. Kit review (after any kit lane, before placing)

Never assume the kit lane got an asset right: [references/kit-review.md](references/kit-review.md)
(full review on a family's first use, gates only once proven in two places;
measured AND visual; a finding changes the owning kit skill).

## 1. Design brief

Write `<place>.design.md` § Brief before touching the workbench. One row
per building, enclosure, path, light, water edge and dressing group:

| Thing | Purpose (who, what trade, which promise, which § Intent line or walk-through stage) | Kit piece (measured with `wb.py - describe`) | Rule or lore pointer |
|---|---|---|---|

A row that serves no intent line or stage is cut.

- Every promise-ledger line appears as a row or as a written reason it is
  not built here.
- The row rules, each with its gate ([references/brief-sections.md](references/brief-sections.md)
  § The row rules): a candidate cites its record row (R34) or is
  UNVERIFIED; setting class (`setting.class`); lights (`lights.density`);
  sinks (`sink.fallback`); yard sets and dressing facing (R94–R96); the
  breadth bars with planned numbers; § Variety with the claimed cells
  (`interiors.variety`); § Approach inside § Walk-through.
- § Interiors, § Containers and items, § Creative register, § Sockets,
  § Quests, § Seams: what each says is in
  [references/brief-sections.md](references/brief-sections.md). The rules
  in short: one Interiors row per door, `reserved` only for a tier B or C
  interior (R2, R10). **No closed buildings** (0114 rule 3, L50): every
  building is open or a plugin-linked shell; run the shell-choice
  checklist (`references/doors-interiors-sockets.md` §2) per building
  before the layout. Containers and visible items are meshes now; three
  creative calls unlike the register's rows; every roster slot has a work
  and a home socket.

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
2b. **Dry or wet, decided per piece** (R86): standing in water is a
   design decision: a dry piece's spot reads no `waterLevelM` on `wb.py
   <scene> ground --at X Z`; a wet one carries `"wet": true`; a `check` row
   with `waterDepthM` > 0 and `wet` false is moved.
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
   the claim. The plugin's link is the interior (R83). A `hollow` door is
   a closed building (0114 rule 3): `--claim` exits 3 and gate
   `interiors.closed` fails; re-shell. Other exit-3 causes and their
   fixes: [references/doors-interiors-sockets.md](references/doors-interiors-sockets.md) § 2.

Ends when: `apply` reports 0 compile errors, `check` has ZERO failures
(placement-workbench § 5), every lived-in door has a tier A claim (or, for
a tier B or C interior only, `reserved` naming its pool; R2), and
`place_gates --claim-cells` holds its cells.

## 3. The plan read (only when the compile gates are red, or the type is unproven and its sheet asks)

    python3 -m worldgen.render_blueprint --layout ../../world/sources/blueprints/<place>.layout.json --out output/plan   # (worldgen)

`--layout` renders what the last `apply` derived (refused when the layout
changed since) and implies `--plan`. Renders carry no text (R8);
`--labels` is for a human debugging a render only. Hand the PNG to one
`image-reader` agent with the **Plan** rows of `references/reader-checklist.md`
and the brief's expectations written first; fix footprint, spacing, path
and door-facing findings in the layout; `apply`; render again. No Blender
render until the plan read is clean (0100 decision 3 as amended).

Ends when: every Plan row is YES. Every fixture, tent, door or walkway piece new to this place gets a close-up first (`npm run look`, [visual-look](../visual-look/SKILL.md), ~2 s each); a flagged defect is fixed at source and becomes a look-list row.

## 4. Render rounds

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage readers --start
    python3 tooling/placement-workbench/wb.py round <scene> world/sources/blueprints/<place>.layout.json

The first round frames any newly kitted pieces for the kit checklist ([references/kit-review.md](references/kit-review.md)). Every reader brief follows [references/reader-brief.md](references/reader-brief.md), open question last.

Lit pieces: a day and a night close-up per fixture (`front:<uid>/2.5`,
`@night`); presets, contact sheet and anchor check: `references/fire.md`.

Interiors: run `wb.py render-interior <cell>` for every tier-A cell the
place's doors claim (one contact sheet each, ~40 s; `references/doors-interiors-sockets.md`
§ 7); a reader judges it readable, warm, lit by its sources, not flat
(reader row 48). This is the required interior check. Flames are
verified only by `tooling/visual-look/flames.mjs` on the built site, one
PASS per cell and one outdoors at night (`references/fire.md` § 3 step 4;
the render's flame proxy is not that check). Before the renders,
`wb.py audit-interior <cell ...>` (~20 s a cell, under `job_guard.sh`;
reader rows 49-50, R90; `check`'s `coplanar` rule for places) must exit 0
([references/builder-practice.md](references/builder-practice.md) § Interior audit);
a red is fixed at source, never by moving a plugin piece.

The top, front and iso shots judge the layout; the 4b shots judge what the
player sees. One Blender launch: the top view, one front per building, two isos, and a
shot of every `unmined` mount (0102 decision 5). The readers run as one
`Workflow`, one `image-reader` per image or contact sheet, one merged NO
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

### 4b. Feel check

After the first round whose gates are green, and in every later round that
touches the walked path, run [references/feel-check.md](references/feel-check.md):
eye-height shots per walk-through stage, day and night; one `image-reader`
with the blind-read brief; the exit rule. Each miss is a layout row naming
its lever, never a prose change. It counts inside the four-round cap.
The palette is not a subset of any sibling's ([references/palette-and-breadth.md](references/palette-and-breadth.md) § Siblings).

## 5. Export, patches, compile, publish, gates

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage publish --start
    python3 tooling/placement-workbench/wb.py <scene> export world/sources/blueprints/<place-id>.json --write
    python3 -m worldgen.compile_settlement --blueprint ../../world/sources/blueprints/<place-id>.json --out output/settlements   # (worldgen)
    python3 -m worldgen.export_interior_bundle --blueprint ../../world/sources/blueprints/<place-id>.json   # (worldgen)
    python3 -m worldgen.export_settlement_bundle --copy-assets --places <place-id>   # (worldgen)
    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage publish --end
    python3 -m worldgen.place_gates --id <place-id>   # (worldgen)
    # run the derivers after every blueprint or layout change (worldgen), then commit their output with it:
    python3 -m worldgen.export_blueprints && python3 -m worldgen.export_places && python3 -m worldgen.export_purpose_ledger && python3 -m worldgen.npc_roster --apply && python3 -m worldgen.author_type_siting --apply

- Export writes the poses (0097) and the ground and kit provenance.
- Patches are the place's own typed ones only (0081 decision 3: pad,
  `vegetation-clearance`, dressing-add); they travel in its bundle and the
  studio overlays them at load (0102 decision 1). Commit the place's
  `index.json` and `ground-overlays.json` rows with
  `python3 tooling/world-generation/scripts/commit_index_entry.py <place-id> -m "<msg>" [extra paths]`
  (only this place's rows, via a temp index; never a hand-made one). `compile_scatter` is
  never re-run for a place (L35); no chain stage, refreeze or province
  publish runs for one. Publish is per place (`--places`).
- `place_gates` runs every per-place gate in one process (the 0102 `check`
  rules, reader-checklist gates, lit entrances, sockets and promises, the
  interior bundle, variety and breadth bars, the 0105 gates; list in
  [references/publish-gates-and-readback.md](references/publish-gates-and-readback.md)).
  All green before the walk.
- Per BATCH, never per place: the yard regression gates, the REQUEST rows,
  the one `text-review`, `npm run docs:check`, ONE scoped preflight, deploy
  (same reference § Per batch).
- **Verify against the published result** (R74, R81): every numeric or
  positional claim bound for a packet is read back from
  `apps/world-studio/public/province/settlements/<place-id>.json` and
  compared with the walked rev; a height over water against the DRAWN
  water and pose (same reference § Verify).

**5b. Record coherence (0104 decision 6, 0117; owner walks 7, 8 and 9).**
The catalogue record must agree with itself, its world, the scene as
built, its quests, lore and the built place, and its change set must leave
every other place as coherent as it found it. Run
[references/record-coherence.md](references/record-coherence.md) in full
(packet: `worldgen.record_coherence --place <id>`, read its § Scene before
writing a word about where things stand or grow; six readers; ONE
synthesis and change set; `--changed`; `export_places`;
`blueprint_promises --write`; `--receipt`; one `text-review`). Never one
issue at a time. Gates `record.coherence`, `record.regression`,
`record.consistency` and `promises` fail until done.

Ends when: 0 compile errors, every per-place gate green, the place
published and every claim read back; the batch gates run when the
batch's last place gets here.

## 6. The walk packet (16k § Owner check-ins)

**The packet is short and assumes the owner knows nothing about the
place** (owner 2026-09-27): plain English, at most ~20 lines per place
plus pictures, every line checked against the records (R5). Each section's
detail and the post procedure are in
[references/walk-packet.md](references/walk-packet.md), whose section
list is the packet's order: what this place is, start here (deployed
links), what changed (`wb.py whatchanged`, R35), the numbers, please look
at, § Gaps (0102's four reasons only) and § Owner calls, pictures, the
feel-check verdict, how to reply and the stay-or-switch line.

## 7. The fix round (`continue 16k slice N after owner walk`)

    python3 tooling/repo-standards/build_ledger.py stage --place <place-id> --stage orient --start --walk <N>

`N` is the owner walk whose reply this round works (R32); the run is
`<place-id>#walk-N`. The round reads only its round folder's fix list,
`waiting-on.json` and the lessons and rulings rows the fix list names.

1. Group every "wrong" in the reply by cause across the whole reply.
2. Per cause: a REQUEST row for `references/lessons/` (an edit of the
   existing row if one covers it); a rule, gate or `check` rule the cause
   needs goes to the tooling sub-lane, which shows it **failing first on
   the defect**; the place round takes it at its next round and never
   writes it. A visual row gets its `reader-checklist.md` line by REQUEST.
3. **Edit the place; never rebuild it** (owner 2026-09-27): ops keep their
   `uid`, re-sites are scanned, a rebuild needs a planner ruling; the inner
   loop runs to zero failures and NOs ([references/builder-practice.md](references/builder-practice.md)).
4. When the round touched the record, a quest or what is built, run
   step 5b's record-coherence protocol once over the place. Then
   `place_gates` and the § 5 read-back of every fix against the
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
   slice, and a `references/lessons/` row for every finding that cost
   more than one render round and every compile refusal; zero rows needs
   a written reason.
2. The type sheet `references/types/<n>-<type>.md`: written by the type's
   first slice (which also writes its `layout_template.py` generator from
   this layout, 16k S10), edited by every later one.
3. The receipt, the type register and readiness check, and the choice of
   the next slice (contrast rule, 97 A6): [references/builder-practice.md](references/builder-practice.md) § Slice close.
4. Append the place's row to [references/asset-breadth-ledger.md](references/asset-breadth-ledger.md).

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
- Rerun the chain, refreeze or republish the province for a place (0102 d1).
- Place a piece before § Intent and § Walk-through exist.
- Deliver a promised made thing (ore, hearth, sign, toll post) with the
  nearest labelled mesh, unrecognisable from the approach.
- Lower a record line to the build without a named 0102 reason.
- Hand over a packet with a check failure, a reader NO or a red gate
  (0102 decision 3).

## Not automated yet

- Kit choice per use and culture: gates check legal, not good; type sheets reuse the judgement.
- `waterOk` and `fixedBerthReason` need a lore reason written by hand.
- Type 8 and the opening-scene places are built with the owner (0062 § 9).
