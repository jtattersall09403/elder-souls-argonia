# Round 4 region brief — network-role consistency and the hostility rebalance (2026-09-04)

Touchpoint ③ feedback, round 4 (decision 0041 § Part 4 step 2). One agent per
region file. Wave A (this brief) is structure; wave B
([round4-text-brief.md](round4-text-brief.md)) is text. Never both on one
region at once. Read first, and only: CLAUDE.md golden rules; the docstring
of `tooling/world-generation/worldgen/catalogue.py` (typed siting
`boundTo / sightlineTo / nearPoint`, `terrainRequests`, status ladder);
`world/sources/sites/semantic-audit.md` (your region's rows);
`world/sources/sites/hostility-frequency.md` (the rebalance lists);
your region's rows in `docs/quests/25-quest-place-map.md` §20c.

Scope: `world/sources/catalogue/places-<region>.json` only (live records; you
may promote reserve records and you may CUT). Ids are permanent: a cut record
keeps its id with `status: "cut"`. Edit through `worldgen.catalogue.dump_json`.

## 1. Network-role claims — fix or cut, never strand

Owner example: "The Last Post" is *the province's western gate* — and it sat
in a random bit of mountain off the west road because a reserve-grade lair had
taken the road end. The rule from now: **a place whose identity is a role in
the network must sit where that role exists, or it is cut.** Read every live
record whose name, `why.*`, `hook` or `sitingPrefs` claims such a role:

- a gate, border post, customs point, toll, "where the province ends";
- a compass role ("western", "the north road", "the southern approach");
- "the last / first X before / after Y", a terminus, a head of navigation,
  a junction, a crossing of a named road or lane, "between X and Y",
  "halfway to", "a day out from", "within sight of";
- a station on a named boat lane or rootworm line.

For each, check the map facts (`positionM`, `plotFacts.distanceToRouteM`, the
routes in `apps/world-studio/public/province/routes.json` / `waterways.json`
/ the minor bundles, neighbours' positions) and decide:

1. **The role exists on the ground → bind it there** with typed siting
   (`nearPoint` on the road/lane point, `boundTo` the neighbour, an
   "on the road" hard constraint). If another record holds that spot and does
   not need it, take it: raise this record's `importanceTier` by one if it is
   lower than the squatter's and give the squatter a preference that sends it
   elsewhere (its own prose usually says where it belongs).
2. **The role exists nowhere sensible → cut.** Do not rewrite a gate into a
   hut. Record the reason in a `sitingNote` on the cut record.
3. A role that is decoration, not identity → rewrite the clause.

Then work every remaining **high** and **med** audit finding for the region
the same way (the round-3 options still apply: make ground, move, rewrite,
swap, cut). The owner prefers a cut to a place that "un-fixably makes no
sense".

## 2. Hostility rebalance — fewer on the road, more off it

`hostility-frequency.md` now lists **crowded route-side fights** and
**off-route gaps**. Rules: (a) for the crowded records in your region, move
about a third to half of them off-route — set `sitingPrefs.nearPoint` on an
off-route gap inside your zone (`maxM` 400) and drop any "on the road"
constraint, or, where the place's identity is the road (a toll, a ford
ambush), leave it and instead convert a *neighbouring* low-value hostile
record to a neutral/friendly reserve one; (b) fill the off-route gaps inside
your zone with promoted reserve records or converted low-value live ones —
hostile baseline or a dungeon-like interior, a creature slot that names what
bites (asset-available per `world/sources/registries/creatures.json`), danger
tier within one band of the ground; (c) never add hostile records inside a
crowded neighbourhood; (d) stay inside the region's soft ceiling in
`test_catalogue.py` (raised ~8 % today) and above its hard floor; (e) all
other rules stand (city rings, rest cadence, hard danger gate, asset-aware).

## Gates and report

From `tooling/world-generation`: `python3 -m worldgen.catalogue --check`,
`python3 -m worldgen.registries --check`, `python3 -m worldgen.quests --check`
(a cut record that a quest anchors must be re-anchored: edit the quest row in
`world/sources/quests/*.json` to another live place in the same region and say
so), `python3 -m pytest -q worldgen/test_catalogue.py`. No plot, no exports,
no `--sync`, no commit. Report (≤15 lines): role claims checked / bound / cut
(id + one-line reason each); audit findings resolved by class; crowded records
moved or converted; gaps filled; anything unresolved.
