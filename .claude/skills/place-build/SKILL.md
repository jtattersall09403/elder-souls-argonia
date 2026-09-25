---
name: place-build
description: Design and build one real place (settlement, camp, shrine, works, dungeon entrance) on the frozen world, from its catalogue record to an owner-accepted place — orient on the lessons and the grounding index, write the site dossier and the design brief, author the whole layout as one file, apply it in the workbench, read the plan and the renders, export, compile, publish only this place, hand over the walk packet, run the fix round, close the slice with its lessons. Use for every "deliver 16k slice N" and "continue 16k slice N after owner walk", and whenever a place's layout is authored or re-authored.
---

# Place build

> **Written against** (decision 0086 rule 4; `routing-audit` checks these):
> decisions 0097, 0098, 0099, 0100 (this skill's architecture), 0081
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
| `world/sources/blueprints/<place>.json` | step 2 (skeleton), `wb.py export` (poses and provenance) | the blueprint the compile realises |
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
  §5, each answered yes or no with its field.

Ends when: every row has all four columns and every bar a planned number.

## 2. The layout file, then apply

1. The blueprint skeleton `world/sources/blueprints/<place>.json`: the
   fields export does not write (districts, `approaches[]`,
   `networkTerminals[]`, `why` blocks, services and sockets, each door's
   interior claim: tier A verbatim, else `reserved`, or `none` for a
   shell with no interior; lesson L21).
2. The layout `world/sources/blueprints/<place>.layout.json`
   (`schemaVersion` 1; the schema is in `tooling/placement-workbench/README.md`
   § apply): the ordered operations for the **whole place** — `window`,
   `place`, `snap`, `mount`, `attach`, `group place` (dressing yard sets),
   `path`, `bind`, `note`. Every building and every dressing group from the
   brief is in it before the first apply.
3. Apply:

        python3 tooling/placement-workbench/wb.py <scene> apply world/sources/blueprints/<place>.layout.json

   It rebuilds the scene from a fresh window in one process, runs `check`
   and `compile`, and writes one summary. The scene file is derived state;
   a tweak is an edit to the layout and one more `apply`.

Ends when: `apply` reports 0 compile errors and `check` passes its bars
(placement-workbench § 5), or every remaining finding is listed with the
layout edit that will fix it.

## 3. The plan read (seconds per round)

    python3 -m worldgen.render_blueprint --layout ../../world/sources/blueprints/<place>.layout.json --out output/plan   # (worldgen)

`--layout` renders the blueprint the last `apply` derived from that layout
(it refuses when the layout changed since) and implies `--plan`.

Hand the PNG to one Sonnet reader (read-only `general-purpose` agent)
with the **Plan** rows of `references/reader-checklist.md` and the brief's
expectations written first. Fix footprint, spacing, path and door-facing
findings in the layout file; `apply`; render again. No Blender render
until the plan read is clean (0100 decision 3).

Ends when: every Plan row is YES, or a NO is listed with why it stands.

## 4. Render rounds (at most four)

    python3 tooling/placement-workbench/wb.py <scene> render --shots auto

One Blender launch: the top view, one front per building, two isos. One
Sonnet reader per round, given the Top, Front and Iso rows of
`references/reader-checklist.md`; UNSURE or a black image means a closer
or lit re-render of that shot, never a guess. Findings become layout
edits, then `apply`, then the next round. Memory: `anon` in
`/sys/fs/cgroup/memory.stat` under 7 GiB before a render.

Ends when: a round has no NO, or four rounds ran (residual NOs go in the packet).

## 5. Export, patches, compile, publish, gates

    python3 tooling/placement-workbench/wb.py <scene> export world/sources/blueprints/<place>.json --write
    python3 -m worldgen.compile_settlement --blueprint ../../world/sources/blueprints/<place>.json --out output/settlements   # (worldgen)
    python3 -m worldgen.export_settlement_bundle --copy-assets --places <place-id>   # (worldgen)

- Export writes the poses (0097) and the ground and kit provenance.
- Patches are the place's own typed ones only (0081 decision 3: pad,
  `vegetation-clearance`, dressing-add); `compile_scatter` is never re-run
  for a place (lesson L35). Terrain-chain stages go to whoever holds the
  chain lock.
- Publish is per place (`--places`, 16k § 1b); a whole-catalogue compile
  runs only after a fresh sample batch passes.
- Gates, all green before the walk:
  - the yard regression gates: `worldgen/test_proving_ground.py` and
    `tooling/placement-workbench/tests/test_proving_ground_b.py`
    (0099 decision 7; a slice that breaks one is not ready to walk);
  - the 0098 table and the breadth bars on this place (`wb.py signature`
    and the breadth-bar gate);
  - every 16k checklist row marked Gate that this place touches;
  - `npm run docs:check`, then `npm run preflight -- --paths <this
    place's files and the skill>`.

Ends when: 0 compile errors, every gate green, the place published.

## 6. The walk packet (16k § Owner check-ins)

    python3 tooling/placement-workbench/wb.py - walktable <place-id>

- One row per placed item, the full list every time (never "the rest as
  before"): item, E / S (studio km, read from this run's compiled output),
  piece, fit, `$ES_TUNNEL_URL/?view=character&x=<E>&z=<S>&t=12`; one row
  for the anchor.
- Under it, one plain-English check per line, "what changed since the
  last walk", the residual reader NOs from step 4, any world-level calls,
  and a request for the low/medium/high frame-rate readings at the anchor.
- How to reply: one message; per row the item name and "right" or
  "wrong: what you see"; skip a row not reached and say so; "looks right"
  when the place is done.
- End with the stay-or-switch line (decision 0083).

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

## Not automated yet

- Kit choice per use and culture is a judgement: the gates check a choice
  is legal, not good. The type sheets' yard sets and piece lists are
  where that judgement becomes reusable.
- `waterOk` and `fixedBerthReason` need a lore reason written by hand.
- Type 8 and the opening-scene places are built with the owner (0062 § 9).
