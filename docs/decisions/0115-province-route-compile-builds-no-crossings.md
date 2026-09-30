# 0115 — The province route compile builds no crossings

Date: 2026-09-30. Status: accepted. Supersedes the province-wide span
placement in [0051](0051-route-span-systems.md) (its calls on anchoring,
additive geometry and no embankments stay the rules for any span a place
builds).

## Context

Owner walk 6 (2026-09-30) found a leftover bridge at 4.71 km E, 1.80 km S
and asked for every bridge, crossing and span piece from the earlier
province-wide attempt to go. `worldgen.compile_route_structures` had laid
`route-spans-v1` decks (family `root-timber`) wherever a graded way met a
gap; none of them had been designed as a place, and 16k builds crossings per
place.

## The calls

1. **The province route record carries no water or gap crossing.**
   `world/sources/routes/route-structures.json` and the published
   `route-structures.json` hold only the ground-hugging kinds the grader
   needs (`stair`, `lip-step`, `stepped-ascent`). The span half of
   `compile_route_structures` and `validate_spans` is deleted, with its tests;
   the route bundles that carried only spans are deleted.
2. **A crossing is built by the place that needs it**, with the modular-runs
   skill (§ F: walkable joints, turns only on a piece made to turn) and the
   walkwayRule in `wb.py check`. A crossing between places is a 16k slice of
   its own, never a chain stage.
3. **`route-spans-v1` stays a kit** (its pieces are what a place draws from),
   and 16k item 32 still replaces its Nordic pieces before any place uses them.
