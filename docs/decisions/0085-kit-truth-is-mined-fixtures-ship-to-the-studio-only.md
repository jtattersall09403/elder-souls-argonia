# 0085 — Kit truth is mined from placement evidence; composites are built, never expanded; fixtures ship to the studio and only the game target refuses them; sheets are judged flat

**Date:** 2026-09-23. **Status:** accepted (planner, 16h part 1, from the
round 1–3 lane evidence in the [16h ledger](../research/phase16/16h-ledger.md)
and the owner's 2026-09-23 rulings on the proving ground). Realises 0081
part 1; extends 0065/0066 (read the record, never re-solve it) to kit
pieces; the additive `dressing-add` patch design is 16h part 2's record.

## What was decided

1. **Anchor class and designed sink are placement evidence, decided once
   in the miner.** `mine_designed_sink.py` and `mine_mounts.py` read the
   plugins that placed each piece (exterior AND interior cells; parents
   at any scale, the child's offset divided by the parent's scale) and
   write `world/sources/placement/kit-designed-sink.json` and
   `kit-mounts-mined.json`. `anchorClass` (`ground` / `water` / `deck` /
   `wall` / `hanging`) is read from **real mesh-to-mesh contact** (owner
   2026-09-23): the plugin gives every placed object's exact position,
   rotation and scale, and the meshes give their surfaces, so whether a
   sconce's back touches a wall's face is a geometry check, not a rule.
   Where the child's surface touches something (<= 0.03 m) decides the
   class, and **support from below wins**: contact on its underside
   (terrain, a floor, a deck) means it stands there (deck on a kit piece,
   else ground) whatever else it touches; only a child with nothing under
   it is wall (contact behind or beside) or hanging (contact on its top:
   an arm, a crown, a ceiling). Other contacts of a standing thing (a
   chair's back on a wall) are recorded as `abuts`, never as an anchor. The class per asset
   is the majority over its placements (n >= 3, or "thin" when fewer all
   agree); the parents in contact are its pairs with exact offsets.
   Bounding boxes are only the candidate filter: rounds 1–5 used them as
   the evidence and classed chairs, waterfall FX, bridges and water lilies
   as walls. `deck` means "stands on a
   raised surface": seated on a containing kit parent's top face, else
   on terrain; only `wall` and `hanging` need a mined pair (a `band`
   along a face, or a `points` set). Policy rows in
   `placement-policies.json` are the fallback when no evidence exists.
   The exporter reads `designedSinkM` and fails closed without one;
   `buryM`/`slopeBuryPerM` are gone.
2. **Composites are baked by the kit build (`compose.parts`); the compile
   never expands a `composite:` ref.** Expanding would ship the geometry
   twice. Brief item 7 was amended.
3. **`originOffsetM[0..1]` are footprint-corner offsets, not a runtime
   translation**; the rotation sign fix alone gave 0 corner mismatches on
   4,958 pieces.
4. **`reseat` is an override kind** (`plot_remedies.py`/`apply_sitings.py`):
   a committed record moves to a named point without a re-plot and without
   any stage applying a meso move to it. Blackrose's centre sits on the
   island in `body.1284-3448` (2341.1, 6422.9) by it; the wet villages
   put their entrance on the bank the same way.
5. **Fixtures ship to the studio, local and deployed alike; only the
   game target refuses them.** The proving ground (`fixture: true`,
   `world/sources/sites/proving-ground.json`, blueprint
   `place.fixture.proving-ground.json`) and the five 2026-09-09 blueprints
   replayed on the frozen ground under `--fixture-replay` (their HARD
   design-rule failures recorded as `fixtureWaived` in the receipt, never
   silent; sites carry `fixtureReplay: true`) are published with
   `--fixtures-ok`. Nobody judges the replayed layouts (16i re-authors
   them); they are the numeric sample for the replay tests (floats
   > 0.3 m == 0, sills within 0.15 m). Owner 2026-09-23: every building
   in the yard stands on cells under 2° slope so the sink alone seats it;
   `padTestCorner`, `clearingTestArea` and `rockTestPoint` are recorded
   empty for part 2.
6. **Mount exemplars follow vanilla's own pairings.** Skyrim hangs lights
   on walls (`impwallsconcecandle01` on Imperial walls, n=337) and signs
   on posts (`signwrpost01`, pictorial Whiterun signs); it never hangs a
   lantern on a post. The yard shows a sconce on `impfreewall01` and the
   pictorial huntsman sign on its post, all five vanilla assets added to
   `settlement-imperial-v1`. The "mudmother lanterns hang on parents not
   in our kits" claim was a miner defect (scaled parent dropped), not a
   sourcing gap.
7. **Sheets are judged flat.** Kit sheets, templates and mount pairs are
   rendered `--flat` (kit truth, not terrain) in one Blender session per
   kit: straight-on orthographic elevations with a labelled metre scale,
   the ground line a bright cut line, mount children magenta on a 40 %
   parent. A Sonnet UNSURE on legibility means re-render, never judge.
   A "wrong" from the owner becomes a rule in world 97 §C and a
   `blueprint_integration` check, never a per-piece fix.

## Why

Round 1 derived kit truth from geometry and labels and got 35 mount pairs
that were all snap co-placements and 0 real hangs; the plugins already
record where every piece stood. Reading that record once (0066) is
cheaper than any rule and is what 16i and 16j build every place from.

## Consequences

- 16i places use `kit-designed-sink.json` and `kit-mounts-mined.json` as
  given; a piece with no evidence gets a policy row with a written reason.
- The shipped clearance receipt stays stale until the next scatter run
  (backlog row). A compile's own peak was 1.02 GiB and is 0.22 GiB on the
  survey cache (ledger §6).
- Numbers for this record: ledger §3 (rounds 1–3) and §4.

## Amendments 2026-09-23 (night)

- **§5.** The five replays are retired to
  `world/sources/blueprints/retired/` (deleted 2026-09-25, 0099 addendum). The yard is the only fixture.
  `--fixture-replay` is unused; the fix round retires the code path.
- **§1 addenda.**
  - Refs whose base lives in a master are mined.
  - The last LAND override wins, and cells merge across the pool.
  - A ref with no contact in a water column is water. Contact from below
    on submerged ground is water. Contacts decide before the column.
  - The defining file's refs vote.
  - The sink excludes static-supported refs.
  - Stilt and quay fits are seated by their deck (owner 2026-09-23).
  - Dug-in fits anchor on the lowest sample (world 97 C11a).

## Addendum 2026-09-25 ([0099](0099-places-are-built-in-a-loop-until-the-skill-is-proven.md), 0100)

The 16i and 16j references above are history: 16i and 16j were superseded by
the 16k place loop. Places built in its slices use the mined records as
decision 5 says; the replayed layouts are not re-authored (the exemplars were
dropped, 0099 addendum).
