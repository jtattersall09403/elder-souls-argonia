---
name: settlement-build
description: Take a place from a macro-plot record to buildings standing in the running World Studio — blueprint, compile, publish, prove. Use when authoring or re-authoring any settlement blueprint, when a settlement compile is red, when the settlement bundle needs republishing, or when rolling out a region packet of places beyond the five exemplars.
---

> **Still waits for 16i.** The 16h building blocks this path relies on (kit truth, composites, modular runs, the yard
> compile at 0 errors) are covered by the four sub-skills below; the yard is not yet re-exported or walked (16h part 1
> step c). The place path (steps 1–7) was written on the Phase 11 exemplars; 16i rewrites it to v2 on its six
> exemplar places. Until then use it for the yard and for fixture compiles, not for a new place.

# Settlement build

> **Written against** (decision 0086 rule 4; `routing-audit` checks these):
> decisions 0052, 0083, 0086; the 16h brief
> (`docs/phases/16-foundation-and-places/16h-settlement-runtime-and-kit-qa.md`)
> § Part 1 state, "Owner rule: every future check lists every item with its
> coordinates", § Yard coordinates and § Owner check-ins (the check-in 2
> yard packet). If a cited record has moved, this
> skill is stale: report it, do not follow it blind.

## Sub-skills (0086: this skill is the umbrella)

Hand the kit work to the skill for the job; do not redo it here.

| When | Skill |
|---|---|
| A kit config, composite, collider or registry row changed; a published kit is stale or red; a miner record landed | `kit-build` |
| A sink, mount or abuts miner rule changes, a mined class looks wrong, a plugin or kit joins the pool | `kit-mining` |
| Adding or auditing a composite (`compose.parts`); a door stands off its doorway | `composite-author` |
| A parcel lays a chain of abutting pieces (wall, fence, dock, boardwalk, bridge); a compile reports `openModularEnds` or `singleUsePieces` | `modular-runs` |

This skill keeps the place path (blueprint to proof) and the owner-walk
packet (step 8).

This is the repeatable path the five exemplars were used to develop
(Phase 11 B1; owner ruling 2026-09-09, `docs/research/archive/phase11-rounds/phase11-gap-plan.md`
§ "What follows gap closure"). Run it per place, in order. Every step either
passes or fails loudly: **a produced record is not delivery until the next real
consumer has accepted it, and the running scene has proved it.** Nothing here
is optional because the previous place happened to pass it.

All commands run from `tooling/world-generation` unless stated.

## 0. Before you start

- The province rasters must be **still**. `git status --short apps/world-studio/public/province/`
  must be clean, or you know who is running the chain and you wait. Every water
  and terrain gate below reads those files; compiling against a chain in flight
  produces failures that are not yours and passes that are not real.
- Read `docs/world/00-core.md` and the module the place's culture belongs to.
- The place must already exist in the catalogue with a plotted anchor
  (`worldgen.macro_plot`). A blueprint for an unplotted place has no ground.

## 1. Author the blueprint

`world/sources/blueprints/place.<region>.<slug>.json`, with the `.md` design
record beside it. Copy the nearest exemplar of the same culture as the shape,
never as content:

| Culture | Exemplar |
|---|---|
| Argonian stilt, city | `place.mercantile-coast.lilmoth.json` |
| Argonian stilt, village | `place.hist-heartland.nine-trunks.json` |
| Xit-Xaht / Xanmeer | `place.dunmer-north.mazzatun.json` |
| Licensed camp / works | `place.hist-heartland.sap-tapping-licensed.json` |
| Non-built hazard site | `place.naga-kur-deeps.wamasu-pond-adult.json` |

Rules that cost the most time when missed:

- Every parcel names a real kit asset. Check `tooling/asset-pipeline/output/kits/*.kit.json`.
  A piece nobody made is a **sourcing job** (CLAUDE.md), never a composition.
- Only combine pieces authored to combine: `*.connectors.json` holds the
  measured joins, and every `abuts` is held to 0.15 m / 5°.
- `groundFit` per parcel must match the asset's measured policy in its kit
  manifest, or sit on the reviewed exception shelf in
  `export_settlement_bundle.COMPATIBLE_ASSET_GROUND_FITS`.
- A fence or wall standing in water needs an explicit `waterOk` with its depth,
  and the lore reason it is driven into the shallows (97 C10).
- Prose names a thing only if a typed field references it (`prose_links`,
  engineering standard 12).
- **Stilt and quay datum** (owner check-in 2, 2026-09-24): a stilt or quay
  piece is seated by its DECK at the designed clearance above its support
  surface (the water surface where water covers the legs, else the ground
  under them); the clearance is the median deck height the makers' plugin
  references show, recorded as `deckClearanceM` on the piece's `assetPlacement`
  row in `pipeline/config/placement-policies.json` (0.35 m default where no
  plugin places it); the legs bury. A stilt piece on land is never water class.
  Measured per plugin reference as (deck top x scale + ref z) minus the mean
  support under a 3 x 3 plan grid, divided by the ref's scale (ledger row
  "Check-in 2 fixes: yard"); then `placement_metadata --refresh-built-manifests --kit <kit>`.
- **Dug-in pieces** (cave mouths, bank doors; owner check-in 2): the threshold
  is FLUSH with the approach, so the designed sink is the measured sill (the
  walkable floor band at the opening, an `assetPlacement` `designedSinkM` row
  when the mesh tell took the skirt below it; doorcaveb -1.36 m, not the
  -1.83 m mesh bottom), and the flanks are EMBEDDED: a typed terrain patch
  (0059 kinds) raises the ground round them, or the kit's rock pieces close
  them where a plugin co-places them (`kit-assemblies-mined.json` templates on
  the piece). Neither available: record the blocker, never leave hollow ends.
- **Buildings with and without an inside**: a door is a transition (0081) and
  exists only where the building has an interior. A hollow shell with none
  (no plugin load door into a cell) is authored `interior: {kind: "none"}`,
  carries no door, and any door leaf its composite holds is a static part
  (`blueprint.validate_blueprint` then asks for no door). The yard's other
  parcels are also authored `none` (a fixture has no playerPurpose) yet carry
  doors: open planner call, ledger "Check-in 2 fixes: yard".

## 2. Derive everything derivable — never hand-draw it

    python3 -m worldgen.rederive_terminals --apply \
      ../../world/sources/blueprints/place.<region>.<slug>.json
    python3 -m worldgen.street_router --apply \
      ../../world/sources/blueprints/place.<region>.<slug>.json
    python3 -m worldgen.blueprint_footprints --apply \
      ../../world/sources/blueprints/place.<region>.<slug>.json
    python3 -m worldgen.blueprint_footprints --areas --doors \
      ../../world/sources/blueprints/place.<region>.<slug>.json

Parcel footprints, district polygons, combat-space boundaries, door positions
and way/canal geometry are all **derived and validator-enforced**. A
hand-edited one is rejected as drift. If the validator says "boundary is not
the derived polygon", the fix is to re-derive, not to edit the number.

Two things that cost an hour when missed (2026-09-09):

- **Run them in that order and re-run until both `--check`s are green.** The
  four passes feed each other — turning a gate moves the footprint, which
  re-routes the way that ends at it, which moves the district hull. One pass
  is not a fixed point. `--areas` and `--doors` imply `--apply` for the
  things *they* derive, not for footprints, so the bare `--apply` is a
  separate call.
- **`rederive_terminals` is the one that reads the PROVINCE network.** The
  others only re-read the blueprint and the ground, so after any route
  re-solve it is the pass that moves `approaches[].viaUV`,
  `networkTerminals[].entryUV` and a gate parcel's `yawDeg` back onto the road
  that actually exists. Every `network-stitch` failure about metres off a
  route, or a gate off square, starts here.

## 3. Validate

    python3 -m worldgen.blueprint --check

Fix findings at their source. A finding about the terrain is a terrain request
(`terrainRequests[]`, typed) — not a nudged coordinate.

## 4. Compile

    python3 -m worldgen.compile_settlement \
      --blueprint ../../world/sources/blueprints/place.<region>.<slug>.json \
      --out output/settlements

Reads the shipped rasters. Writes `<id>.settlement.json` and the promise
ledger beside it. **Zero errors is the bar.** Warnings are read, not waved:
a 97 B4/G8 open-water share outside its culture's band means the massing sits
in the wrong relationship to its water.

## 5. Publish the runtime bundle

    python3 -m worldgen.export_settlement_bundle --copy-assets

It exports every place today; once 16j item 7b lands, run it with
`--places` for the places you changed (full export only at freeze;
docs/research/phase16/16h-catalogue-wide-steps-audit.md).

This is a projection of compiler output, not a second compiler. It writes
`apps/world-studio/public/province/settlements.json` atomically and copies only
the referenced kit GLBs and manifests into `apps/world-studio/public/kits/`.
It requires **exact equality** between the authored exemplar set and fresh
content-hashed compiles, and refuses on any error: a stale or simply absent
place cannot quietly vanish from the world. If it refuses, go back to step 4 —
do not reach for a flag.

Warnings refuse too, unless they are **explained**. An honest, named,
someone-else-owned debt is registered in
`world/sources/settlements/settlement-warning-known-red.json` by
`(placeId, subjectId, rule)` read from the compiled `floodBandReport`, with an
owner, a reason and where the work is queued — the same pattern as
`terrain-request-known-red.json`. It is a register, not a suppression: every
row is printed by name on every export, and an unregistered warning, a warning
with no structured row behind it, a row that has started passing, or a row
whose place has left the compiled set all fail the export. Never add a row for
a defect that is yours to fix.

Three of its gates are **runtime-fatal** and the export refuses
them by name: the LOD contract, the texture cap and the collider part budget
([decision 0052](../../../docs/decisions/0052-a-published-bundle-obeys-the-runtime-contract.md)).
Each mirrors a check the runtime enforces by throwing or refusing to draw, so
shipping over one buys a blank world, not a defective one. If you hit one, the
answer is the asset or the placement. There is no waiver: `--ship-with-errors`
went in 16h (a pending pad is reported in `pendingPadGrades`, not waived).

It also carries the route structures from
`world/sources/routes/route-structures.json` down the same placed-piece path.

## 6. Clear the vegetation, then repaint the ground

**Both of these, in this order, or the place grows trees through its floors.**

`compile_settlement` emits `clearance: { hardClear[], thinned[], kept[],
affectedChunks[] }`. A settlement clears trees and plants from its footprint
the way real builders do (97 C13), as `vegetation-clearance` patches applied
locally (16h item 14). `compile_scatter` is never re-run for a place: it is
province-wide (16h item 14, the 16i gotcha, docs/research/phase16/16h-catalogue-wide-steps-audit.md).

    python3 -m worldgen.apply_vegetation_patches   # the clearance patches
    python3 -m worldgen.settlement_ground_control

`settlement_ground_control` runs **after** the final water raster and
the clearance patches: it rebuild-compares the bundle, paints coherent PATH
controls under footprints and yards, excludes signed-depth water and preserves
the macro alpha. Both are terrain-chain stages — the session lead holds the
chain lock, so hand these over rather than running them beside a live chain.
Groundcover has its own exclusion mask; a place whose clearance was never
consumed will look right in the kit and wrong in the world.

## 7. Prove it in the running scene

    npx vitest run packages/game-core/src/settlement/     # ~0.6 s
    PHASE11_SETTLEMENT_PROBE=1 node apps/world-studio/scripts/probe-blueprints.mjs

The probe must report **non-zero geometry and zero grounding findings** for
each place. The owner is the visual authority; do not ingest screenshots
yourself.

## 8. The owner-walk packet

Every check handed to the owner carries the **coordinate table of every
item**, listed in full every time: nothing dropped because it passed last
time, nothing summarised as "the rest as before" (owner rule, 16h brief
§ Part 1 state). One row per placed item:

| Item | E / S (studio km) | Piece | Fit | Studio URL |
|---|---|---|---|---|

- Read E / S from the compiled output of this run, never from the blueprint
  or memory.
- The URL is `$ES_TUNNEL_URL?view=character&x=<E>&z=<S>&t=12` (walk mode at
  the item); add one row for the place anchor.
- Write it in plain English for a non-technical reader: one check per bullet
  under the table, what to look at, how to feed back.
- Ask for the low/medium/high frame-rate readings at the anchor.
- End with the stay-or-switch line (decision 0083).

## 9. Prose review

Any player-visible or world-record text you wrote or edited goes through the
`text-review` skill **in a separate agent** before commit.

## What is not automated yet

Recorded honestly so the next agent does not rediscover it:

- **Kit choice per parcel is still a human judgement** — which authored piece
  carries a given use, in a given culture, at a given magnitude. The
  connector and ground-fit gates check that a choice is *legal*, not that it is
  *good*. A per-culture "use → candidate pieces" table derived from the kit
  manifests would close this; it does not exist.
- **`waterOk` and `fixedBerthReason` need a lore reason written by hand.**
- **The owner is hands-on** for the major cities and the early-game places
  where the opening scenes play out; those are guided and gated by the owner
  rather than run through this path unattended.
