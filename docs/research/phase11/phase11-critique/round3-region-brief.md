# Round 3 region brief — structure, quests, then text (2026-09-04)

Touchpoint ③ feedback, round 3 (decision 0041 § Part 4 step 2). One agent per
region file, two waves. **Wave 1 (this brief)** fixes structure and authors
the region's quest skeleton. **Wave 2** ([round3-text-brief.md](round3-text-brief.md))
rewrites prose. Never run both on one region at once.

Read first, and only: CLAUDE.md golden rules (skip the session-start plan
read; you are scoped); `world/sources/catalogue/README.md`; the docstring of
`tooling/world-generation/worldgen/catalogue.py` (schema v2, `terrainRequests`,
typed `sitingPrefs.boundTo / sightlineTo / nearPoint`);
`world/sources/quests/README.md` (the quest data model);
`docs/quests/index/README.md` (shape taxonomy, novelty rule);
`docs/quests/index/coverage.md` (your region's demand ladder);
`docs/quests/index/local-<region>.md` and `proposed.md` (what exists);
your region's rows in `docs/quests/25-quest-place-map.md` §20c.

## Scope

`world/sources/catalogue/places-<region>.json` (live records; you may promote
deferred ones) and `world/sources/quests/local-<region>.json`. Nothing else
except the reports named below. Ids are permanent; never rename or delete one.
Edit JSON only through `worldgen.catalogue.dump_json` and keep key order.

## 1. Consistency findings — judgment, not just rewriting

`world/sources/sites/semantic-audit.md` lists every contradiction between what
a record CLAIMS and what the ground and route graph DO (regenerate with
`python3 -m worldgen.audit_place_semantics` if you move anything). Work every
**high** and **med** finding in your region. Owner examples: a station whose
`siteAdvantages` says "the one stretch of road wide enough for a gate" while it
sits 400 m from any road; "The Black Eye", a sinkhole on plain ground because
no sinkhole site was left. For each, pick the most sensible resolution:

- **Make the ground** — add `terrainRequests: [{kind, radiusM, note}]`; Part 6
  carves it. Right when the identity IS the landform and the spot is otherwise
  good (the Black Eye: `sinkhole`, radius ~40 m).
- **Move** — typed siting: `sitingPrefs.boundTo {place, maxM}`,
  `sightlineTo [ids]`, `nearPoint {x, z, maxM}` (metres), or an `on the road`
  hard constraint the plot reads. Never hand-write a position.
- **Rewrite** — when the claim was decoration, not identity.
- **Swap / cut** — a deferred reserve record fits the ground better, or the
  record is fill.

Record each decision in one line in your report. Re-run
`python3 -m worldgen.macro_plot` only if the lead tells you to; siting edits
take effect at the lead's re-plot.

## 2. Hostility frequency — fill the gaps, not the province

`world/sources/sites/hostility-frequency.md` measures fights per km² and per
km of route by danger band. The province already exceeds Morrowind's *travel*
frequency (a fight every 100–150 m of route against ~350 m); by *area* D3–D4
are short. The fix is targeted: the report's **gap points** (land > 450 m
from any hostile place) are the only places to add. For each gap point inside
your zone: promote a deferred hostile/clearable record (restore its
`relationsReserved` edges whose targets are live) or convert a low-value live
record, give it `sitingPrefs.nearPoint {x, z, maxM: 400}`, a hostile baseline
or a dungeon-like interior, a `contents.creatures` slot that names what bites
(asset-available per `world/sources/registries/creatures.json`), and a danger
tier matching the band. Stay inside the region's hard floor/soft ceiling in
`test_catalogue.py`. Roaming encounters are Phase 13 — do not pad.

## 3. The region's quest skeleton (the two-way loop, now)

The owner has authorised building the full skeleton now. Targets are in
`docs/quests/index/coverage.md`: per settlement by magnitude (M5 35–60,
M4 10–20, M3 3–8, M2 1–3, M1 0–2), the province total 450–550 mature.
Author rows in `world/sources/quests/local-<region>.json` to bring every
settlement in your region to the **bottom of its band** at least, status
`skeleton`: id, code (`L<RR>nn` per the README), title, line `quest.line.local`
(or a faction line if the quest is that line's regional work), shapes (primary
+ ≤2 secondary; obey the ≤20 % per-shape budget and the novelty rule against
the whole index), settlement, `anchorPlaces` (catalogue ids in your region;
other regions only for a final beat), a one-clause premise, costTier
(≈40 % S), milestone 2 unless it is obviously Milestone-1 opening-hours
content. Ground every premise in the record's own `why`/`hostility`/`contents`
and the lore dossiers; a place that gets a quest should usually gain a
`questHooks.opportunity` line if it has none. Proposed PP rows anchored in your
region: keep (status `concept`, rewritten to the prose rules) or strike with
a one-line reason. Also list, in the report, up to five places that would be
*better* quest anchors if moved, with the typed siting you suggest.

Prose rules for every title/premise/opportunity you write: British spelling;
no comma followed by *and*; no "never once", "the one thing", "nobody ever",
"the only" as a flourish; no flat and-pair closers (style guide §2.6). Run
`python3 -m worldgen.lint_prose --region <region>` and
`--no-catalogue --md docs/quests/index/local-<region>.md` (after
`python3 -m worldgen.export_quest_index`) — zero hard hits.

## Mechanics and gates

From `tooling/world-generation`: `python3 -m worldgen.catalogue --check`,
`python3 -m worldgen.quests --check`, `python3 -m worldgen.registries --check`,
`python3 -m pytest -q worldgen/test_catalogue.py worldgen/test_quests.py`.
Do not run `--sync`, the plot, or exports — the lead runs the chain once.
Commit nothing.

## Report (≤20 lines)

Findings resolved by class (made ground / moved / rewritten / swapped / cut);
gap points filled (record → point); quest rows added per settlement vs band;
PP rows kept/struck; the five move suggestions; anything you could not
resolve, with the record id.
