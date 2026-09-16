# 0070 — Vegetation and dressing read the record; clearance is a patch; the water is never recompiled

**Status:** accepted (owner 2026-09-16, delivered with 16f). **Supersedes:** the
Phase 10/11 scatter's own water and settlement reads; the 0047 addendum's
TypeScript bed-boulder rule (moved to Python); decision 0041's "the compiler
owns vegetation clearing" mechanism (the rule stays, the mechanism is a patch).

## Decisions

1. **The land-cover bake and the scatter read the signed water record**
   (0066): kinds, ids, seasons, widths and bands through `ShippedWater`;
   only depths, distances and slopes are measured. Both allowlist rows are
   gone and `landcover.py` is under the record-reads gate. The bake writes a
   provenance raster (`ground-paint-provenance.png`, the deciding water kind
   per texel) and a gate joins every water-painted texel back to the record.
2. **Channel membership is a hard gate.** No woody layer stands inside a
   channel-kind reach or its wetted bank margin (0.3 × the reach's width,
   2–10 m); waterline and drowned layers keep their own kind gates on
   backwater reaches and marsh bodies; aquatic layers are gated by water
   kind, season and signed depth, never by land region class.
3. **Vegetation clearance is a typed patch** (`vegetation-clearance` in
   `world/sources/flora/vegetation-patches.json`) applied to the published
   bundles by `apply_vegetation_patches` with a receipt; the runtime ring
   evaluates the same list. The scatter reads no settlement or minor-track
   data. 16g emits patches for tracks, 16h for settlements. An instance is
   `(chunk, species, ordinal)` in the published bundle after patches.
4. **Rocks are placed by Bethesda's mined rules**, per species, never by a
   class default: sink, tilt, yaw, scale, slope band, water relation,
   clumping and clearance from `vanilla-tamriel-placement.json`
   (`docs/research/vegetation/rock-placement-rules.md`); the flora kit
   carries the vanilla rock families Skyrim places most, including the
   wet-rock family that alone stands in water; the mesh side records
   whether a rock is closed underneath or open-backed.
5. **Dressing zones** (`world/sources/flora/dressing-zones.json`) are the
   authored-overlay record: a polygon, a named overlay of layers and a lore
   `why`; the first is the Rockpark boulder field on the Gideon–Soulrest
   coast. Phase 15 packets and Phase 12 exteriors reuse the mechanism.
6. **The water is never recompiled by a routine run.** `compile_water` is
   skipped like the six rungs above the gate; only `--refreeze` reaches it
   (0057 §1; owner 2026-09-16: nothing earlier is rebuilt). Stages whose
   outputs the owner accepted but whose stamps were missing at their
   chain positions are recorded with `chain_stages adopt`, never re-run.
7. **The chain has a contract pass** (`chain_contracts.py`, `--check-contracts`,
   run before every stage): every below-gate stage declares its reads; shape,
   required fields, `schemaVersion` and hash bindings are checked against the
   current files and every mismatch prints as one list.
8. **Water dressing is a sidecar, never a water output.** The insects'
   habitat and the colour constituents (algae, dark) are rasters written by
   `compile_water_dressing` from the record and the scatter output, named by
   `water-dressing.json`; `water-meta.json` and every compile output keep
   their hashes. The tint rule is the dossier
   `world/sources/lore/topics/water-colour.md`; no body is made black.
9. **Ground cover has floors per region and land cover** and bed cover under
   water is the ring's job (Skyrim's underwater grasses are painted-ground
   grass records); the jungle's density is the owner's constant.
10. **The seasonal foliage response is a polish-backlog row**, renderer-only.

## Why

The 16c round-1 mistake (re-deriving the sea) had the same shape in the
vegetation code: the bake guessed water from a height threshold and the
scatter took the sea from a region raster, so beach paint stood on inland
marsh and 952 trees stood in channels. Reading the record once, then
patching the bundles for what the world adds later, is the only way the
scatter can be run once on a frozen world and never again.

## Consequences

- 16g emits vegetation-clearance patches for the minor tracks it solves;
  16h for settlements; neither re-runs `compile_scatter`.
- Phase 13's fauna read the habitat raster; Phase 10c's alchemy and Phase
  13's harvestables address plants by the published ordinal.
- Any change to a rock rule is a change to the mined figure's use, with a
  test; a number typed from memory fails `test_rock_rules.py`.
