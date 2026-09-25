# 0100 — One place skill; a place is authored as a whole layout and iterated on renders; lessons live in the skill; an accepted place is frozen

**Date:** 2026-09-25. **Status:** accepted (owner steers 2026-09-25 at the
start of 16k slice 1a; planner architecture). Extends
[0099](0099-places-are-built-in-a-loop-until-the-skill-is-proven.md)
(the loop), [0097](0097-placement-is-authored-in-a-workbench-and-the-pose-record-is-the-output.md)
(the pose record is the output) and
[0098](0098-variety-is-measured-per-settlement-not-by-a-template-cap.md)
(per-settlement bars). Supersedes 0099 decision 5's "2D then 3D" phasing
and world 97 C12's compile-placed dressing. Evidence:
`tooling/.reports/16k/orient-grounding-audit.md`,
`orient-skill-audit.md`, `orient-plan-context.md` (2026-09-25).

## What the owner asked

Before the first real place is designed: find everything the designer
should ground its decisions in (lore, settlement research, Skyrim and
game-design research, the owner's rulings) and package it efficiently
into the skill the agent uses; make the agent decide a whole layout at
once, look, tweak and look again, rather than think–place–think one
piece at a time; decide whether a 2D pass is worth having; make the skill
self-improve so fresh agents never re-learn the same fixes; and make sure
nothing becomes a circular dependency or unfreezes a place the owner has
already accepted.

## Evidence (from the three audits)

- About 80 sources (~25k lines: world 97 rules, the owner Taste ledger in
  0041, 0098 bars, the 96 lessons table, culture and Hist placement
  research, lore dossiers, the promise ledger, three check-in records)
  should ground a place design; the `placement-workbench` skill points at
  about ten of them and `settlement-build` at none.
- The workbench takes one piece per command: yard B needed 90 mutating
  calls and 32 Blender renders (40–50 s each) for 18 placements. `check`
  and `compile` already judge the whole scene in one call; the scene log
  already records every edit as a replayable line, but nothing replays
  it.
- No skill has a lessons section. Engineering standard 13 routes every
  placement lesson to world 96 or 0041, which the designer never reads,
  and it does not watch `tooling/placement-workbench/` or `.claude/skills/`.
  The check-in 3 causes and the owner's landing-stage ruling exist only in
  the gitignored `tooling/.reports/16h/checkin3-diagnosis.md`.
- Dressing has three rules that disagree: 97 C12 and the compile (3–6
  pieces, placed by the compile), 0098 (≥15 within 12 m, ≥5 clutter), and
  0097 decision 5 (authored per building).
- Nothing protects a finished place: the exporter publishes every place
  and refuses on any place's error; the workbench records no ground or kit
  provenance; a later gate or kit change can silently alter an accepted
  place. 0099 decision 7 protects only the yard.

## Decisions

1. **One place skill, `place-build`, holds the procedure and the
   grounding; `placement-workbench` is its tool manual.** `place-build`
   is what "deliver 16k slice N" invokes. It contains: the procedure
   (below); `references/design-index.md`, a pointer index to every binding
   source with the one line the designer needs from each (rule id,
   file:line, when it applies), never a copy; `references/lessons.md`,
   the operative lessons store (decision 3); `references/reader-checklist.md`,
   what the image reader is told to look for; and `references/types/<n>-<type>.md`,
   one design sheet per place type on the 16k list. `settlement-build` is
   retired: its still-valid rules move into `place-build` and its
   compile/publish steps become the skill's build step; the file becomes
   a five-line pointer for one release, then is deleted. The kit skills
   (`kit-build`, `modular-runs`, `composite-author`, `kit-mining`) are
   unchanged and are called from the build step when a kit is missing.
2. **A place is authored as one whole layout, then iterated on renders.**
   The designer writes two things before touching the workbench: a
   **design brief** (`world/sources/blueprints/<place>.design.md`; the
   causal answer for every building, enclosure, path, light, water-edge
   and dressing group, each with its kit piece and its lore or rule
   pointer) and a **layout file** (`world/sources/blueprints/<place>.layout.json`,
   `schemaVersion` 1: the ordered workbench operations, place / snap /
   mount / attach / group place / path / bind / note, for the whole
   place). `wb.py apply <layout>` rebuilds the scene from a fresh window
   in one process, runs `check` and `compile`, and writes one summary.
   The scene file is derived state, never load-bearing; a tweak is an
   edit to the layout file and one more `apply`. Iteration is a **render
   round**: one Blender launch producing the top view, one front per
   building and two isos, read by one Sonnet reader against the reader
   checklist; findings become layout edits; at most four rounds before the
   walk packet, residuals listed in the packet. Export writes the pose
   record (0097) plus the provenance of the ground and kits it was
   authored on.
3. **The 2D sketch is the first read of the same layout, not a phase.**
   The first `apply` is followed by the 2.5 s plan render
   (`render_blueprint.py`, extended only for what a 3D top view cannot
   show: pad deltas, door facing, clearance, sockets) and a reader pass
   BEFORE any Blender render; the designer fixes footprint, spacing, path
   and door-facing errors there, where a round costs seconds. Nothing in
   the plan is final until the 3D rounds pass. No separate 2D blueprint
   authoring exists; 16h item 19 is delivered as this plan render.
4. **Lessons live in the skill and every fix is a lesson.**
   `references/lessons.md` is a table: id, the rule as an imperative, the
   defect and its cause (evidence pointer), the gate or `check` rule that
   now enforces it (or `prose only` with the slice that will mechanise
   it), the source (owner walk, reader round, compile refusal). The
   designer reads it in step 0 and the reader checklist is regenerated
   from its visual rows. Three writers feed it: the owner's fix round
   (0099 decision 2: every "wrong" becomes a rule, a gate and a lesson
   row), the designer's own slice close (every finding that cost more
   than one render round, every compile refusal, in a mandatory "lessons
   this slice" step; zero rows needs a stated reason), and the fresh-agent
   review of the skill at each slice start (a stale or contradicting row
   is fixed, never worked around). World 96 §2 keeps the history and
   points here; engineering standard 13 watches
   `tooling/placement-workbench/**` and `.claude/skills/place-build/**`
   and accepts `lessons.md`, world 97 or 0041 as the record that moved.
   Rows are merged, never duplicated: a new row that restates an old one
   edits the old one. The type sheets are written by the slice that first
   builds the type and edited by every later slice of that type, as named
   steps of the 16k loop, so no owner memory is needed.
5. **Dressing is authored, to 0098's numbers, and the compile realises
   it.** 0098 sets the bars; the designer places dressing in the layout as
   groups (yard sets per building kind, defined in the type sheet, placed
   with `group place`); the compile never invents dressing near a
   building. World 97 C12's compile-placed ring is retired (16h item 23).
6. **An accepted place is frozen; dependencies point one way.**
   `world/sources/placement/accepted-places.json` (`schemaVersion` 1) is
   the receipt: place id, the owner's "looks right" date, the hash of the
   compiled settlement record and of the place's own patches, and the
   ground and kit provenance from the export. A gate fails the build when
   an accepted place's compiled record would change and the receipt has
   no `reopened` entry (owner date and reason). Gates added after a
   place's acceptance run on it in report mode only: they list, they do
   not fail, and their findings queue to the polish backlog. Publishing is
   per place (`--places`), so one place's build never recompiles or
   blocks another. Direction of dependency: frozen world (terrain, water,
   roads, vegetation) → kits → the place skill → place records and their
   typed per-place patches → later phases fill the sockets the record
   declares (interiors, occupants, ambience, navmesh). Lessons flow only
   into the skill and its gates, never into the frozen layers or into an
   accepted place. Anything that would move a frozen layer or an accepted
   place is a world-level call for the owner, batched into the next walk
   packet.
7. **The sourcing and register reads that grounding needs are steps, not
   hopes.** Step 0 of the skill writes the place's site dossier (97 B1: no
   design before a dossier) from the catalogue record, the macro plot,
   the quest provisions, the lore dossiers the design index names and the
   register of places already built; a record defect found there
   (services promised without rows, a kit the place's culture does not
   use, a danger band off its ground) is fixed as a rule gap with a test,
   before design, never designed around.

8. **Who runs which step (0079 applied to the loop).** The planner
   (Fable) does the deciding steps: it reads the dossier and the register
   and writes the design brief (every building, its purpose, its kit piece
   and its reason; the enclosure, paths, lights, water edge and dressing
   groups), judges the reader's findings between render rounds when a
   finding needs a design change, groups the owner's defects by cause in
   the fix round and writes the lessons. A `deliver` agent (Opus) does
   the realising steps under that brief: the site dossier's data reads,
   the layout file, `apply`, the plan and render rounds where a finding
   is a placement fix, export, patches, compile, publish, gates and the
   walk packet. A finding the deliver agent cannot fix without changing
   the brief is handed back, never decided. The skill names the step
   owner on every step.

## Consequences

- 16k slice 1b delivers, before Claywater is designed: `place-build`
  with its references seeded (the 16i item 0 lesson reconciliation is the
  seeding of `lessons.md` from 96 §2 and the check-in 1–3 records);
  `wb.py apply`, the multi-shot render and the plan render; `--places`
  publishing; the acceptance receipt and its gate; the standard 13
  extension; `breadth-bars.json`; the docs reconciled to the loop
  (Phase 16 README rewritten as one consistent document).
- The type sheet for type 1 is written in slice 1c from Claywater's
  build; every later sheet by the slice that first builds its type.
- Highwater is not slice 2: it is 296 m from Claywater in the same zone
  with the same ferry purpose (97 :134). Slice 2 is chosen at slice 1's
  close by the contrast rule.
- World 96 §3's exit bar, 97 C12 and E5, and the stale 16i/16j pointers
  across the docs are brought in line in the same slice.
