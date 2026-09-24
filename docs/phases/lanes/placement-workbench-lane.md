# Placement workbench lane (decision 0087; Opus lead)

An agent places kit pieces the way a person does in Blender or the
Creation Kit: in a 3D scene, placing, snapping, settling on the frozen
ground, measuring every contact, rendering and looking, iterating, then
exporting the poses as the blueprint record. The compile realises that
record unchanged and the existing gates verify it. The mined records
(`kit-designed-sink.json`, `kit-mounts-mined.json`, the abuts section of
`kit-assemblies-mined.json`) are evidence the agent queries, never rules
that place (owner 2026-09-24).

## Folders

- **Owns:** `tooling/placement-workbench/**`, this brief and its row in
  [README.md](README.md), `docs/research/placement-workbench/**`; after the
  16h commit lands: `.claude/skills/placement-workbench/`, one decision
  record, the second yard fixture under `world/sources/blueprints/` and
  `world/sources/sites/`, one root `package.json` script, the lane's row in
  `docs/PROGRESS.md` (index-blob).
- **Never touches:** the combat-sandbox, stats-lab and sound lanes'
  folders; any other file under the 16h pathspec.

## Rounds

1. **The workbench**: a CLI over a scene file; pieces from the raw kit
   builds with their manifests; the frozen ground for a km window; place,
   snap, settle, measure, render, describe, export.
2. **The skill**: the procedure an agent follows to build a place in it.
3. **The proof**: a second yard (`place.fixture.proving-ground-b`) built
   only with the workbench, the skill and Sonnet views.
4. **The write-up**: the decision record, this lane's state, the
   original-vs-workbench comparison for the owner.

| Round | State | Commit | Record | Proof |
|---|---|---|---|---|
| 1 | delivered 2026-09-24 | (this commit) | [tooling README](../../../tooling/placement-workbench/README.md) | 14 tests on answers written first (one expectation amended: `-with-door` composites bake their door leaf, so a doorway is closed mesh); place/settle 0.7 s, snap 1.3-1.8 s, measure 1.3 s, render 10-14 s |

## Findings for other owners (measured in round 1)

- **Mounted children are seated mirrored at runtime.** On the published yard
  the huntsman sign's plugin pose (its mined pair on the post, post yaw 180)
  is 1.28 m from where the runtime draws it, turned 180 deg; the sconce is
  drawn on the other face of its wall, turned 180 deg. Two causes that
  cancel only for pieces symmetric about the parent's plane:
  `compile_settlement.mount_children` maps the mined north offset to
  runtime +z (south), and `anchoring.ts mountedTransform` applies the
  child's absolute yaw after the parent's rotation. Owner: 16h.
- **A run's pieces are seated on the whole run's footprint.**
  `export_settlement_bundle` gives every piece of a `pieces` parcel the
  parcel's union footprint as its `footprintM`, so the runtime seats each
  wall piece on the mean ground of the whole run. Owner: 16h.
