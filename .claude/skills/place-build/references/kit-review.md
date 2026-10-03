# Kit review (after any kit lane, before placing)

The builder does not assume the kit lane got a new asset right: hollow
backs, pieces that do not snap and pieces used outside their designed
context have shipped (owner 2026-10-03). The lane's hand-off is in
[palette-and-breadth.md](palette-and-breadth.md) § The kit lane; this file
is the review of what comes back.

## When

After every kit lane the slice launched, before any piece from it is
placed; again on the first placed instances in the workbench render round
(SKILL step 4).

## How much

The first use in the game of an asset family (an authored set or a building
family; check [asset-breadth-ledger.md](asset-breadth-ledger.md) and
`apps/world-studio/public/province/blueprints.json` for prior use) gets the
full review below. A family already proven in two published places gets the
measured step only.

## Measured (any red stops placement)

Read the gate results from the kit lane's report, as the
[kit-build skill](../../kit-build/SKILL.md) § 5 Gates defines them:
colliders, designed sinks, abuts, the download budget, and the look facts
(`noMaterialMeshes` and the rest). Do not re-derive them; a missing line in
the report is a red.

## Visual

For each new piece run `npm run look -- piece <kit> <assetId>` under
`job_guard.sh` ([visual-look skill](../../visual-look/SKILL.md) §§ 1-2).
One `image-reader` takes the batch's sheets with the judge brief the tool
prints (built from [look-lists.md](../../../../tooling/visual-look/look-lists.md):
`tex-missing`, `no-material`, `zfight`, `bounds`, `scale`, `dark-body` and
the class rows such as `underside`, `front-edge`, `run-joins`) plus the
questions that file does not ask. Add these to the brief:

- Closed backs and undersides: no hollow or missing face from any of the six
  views (`surf-backface` asks it only for the interior-surface class).
- Where pieces abut (use the mined abuts pair), the seam has no gap and no
  overlap.
- The piece is shown only in its designed context: its setting class
  (`kit-setting-class.json`) and its mined assembly
  (`kit-assemblies-mined.json`); say what the piece is for.
- Open question: does this piece look wrong in any view, and why?

## In the workbench

The first render round of the place frames the new pieces (a `front` or
`iso` shot on them). The reader gets the same checklist for those
instances: snapping and contact (`wb.py check`, reader checklist rows),
and that each stands in its designed context.

## On a finding

Fix it now at source through the kit lane, and change the owning skill
(`kit-build`, `kit-mining` or `composite-author`: a look-list row, a gate or
a rule line) so the class cannot recur; write a lesson row with that skill's
file:line, following [visual-look §3](../../visual-look/SKILL.md) (Fix, then
teach). A fix without the skill change is unfinished.
