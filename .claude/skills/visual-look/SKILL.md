---
name: visual-look
description: Close-up visual check of a published kit piece, composite or placed place region — a six-view contact sheet with runtime materials and runtime flames (npm run look, ~2 s, no GPU, no studio), a Sonnet judge driven by the look list, and the self-improvement rule that turns every new defect into a look-list row and a skill lesson. Use after publishing or changing a kit piece, before a render round on a place, and whenever a fixture, flame, tent, door or walkway might look wrong.
---

# visual-look

Get it right first time by LOOKING, cheaply, before the owner does.

## 1. Make the sheet

    npm run look -- piece <kit> <assetId> [--class C[,C]] [--out DIR]
    npm run look -- composite <kit> <assetId>          # a composite is a kit asset too
    npm run look -- place <scene> <x> <z> [--radius M] # workbench scene region (wb.py render, Blender)
    npm run look -- seam <placeId> <placement-id-suffix> [--bearing DEG]  # a building's base, ~5 s

`seam` draws the published building at its bundle pose on its own padded
ground with the place's published ground paint (the compile's trampled ring
and contact shade, docs/research/rendering/building-ground-seam.md), from 6 m
at 1.2 m eye, 480x270, with the paint (`_live`) and without (`_bare`). Run it
on a building after a publish that moved it or changed its footprint.

Heavy batches run under `tooling/repo-standards/job_guard.sh <lane> -- npm run look -- …`
(target: 20 s, 2 GiB; measured ~2 s, 0.6 GiB per piece). Per piece it writes
`<kit>__<asset>.png` (front, 3/4, side, top-down, eye height 1.7 m, and a
night tile for a fire fixture or a low grazing front for anything else;
grid at the pivot plane, bounds in green, flame anchors as white dots) and
`<…>.json` with the measured facts (bounds, anchors, presets). The flames
are the runtime FlameSystem at the anchors `flameAnchors.ts` gives the
manifest row; the geometry and textures are the published GLB through the
KTX2 + meshopt loader.

The sheet shows the flame at the piece's origin; it cannot show whether the
studio draws it in a cell or a place. That question has its own check,
`node tooling/visual-look/flames.mjs interior <cellId> <xKm> <zKm>` (or
`place <placeId> --t 22`, at the built bundle's centre) on the built site, and only its PASS line means
"flames verified" (place-build `references/fire.md` § 3 step 4).

## 2. Judge it (Sonnet)

The tool prints a ready-to-paste judge brief: image paths, the measured
facts, and the questions of the subject's class from
[look-lists.md](../../../tooling/visual-look/look-lists.md). Launch one
`general-purpose` agent with `model: sonnet` and paste it (several briefs
may go to one agent). Numbers from the facts line beat the eye.

## 3. Fix, then teach (the self-improvement rule)

When the judge (or the owner) flags a defect:
1. Fix it at source (the kit config, the miner, the anchor rule, the preset,
   the layout), never with a per-instance nudge; re-run the look and the judge.
2. If no look-list row asked about it, append one to `look-lists.md`: the
   class, a short id, one concrete question, one measurable pass bar.
3. Write the lesson into the skill that owns the mistake (kit-build,
   place-build, placement-workbench, modular-runs, composite-author) as one
   rule line, so the agent that would make it next reads it first.
A fix without step 2 or 3 is unfinished (CLAUDE.md: change the agent, not
just the check).
