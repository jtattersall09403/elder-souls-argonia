# 0054 — Sex is an axis, not a second set of races

Date: 2026-09-10. Supersedes the male-only roster shape assumed by
[0040](0040-animation-packs-and-combat-parallel-pass.md) and by
`apps/combat-sandbox/docs/architecture/characters-and-races.md`.

## The decision

There are **ten races and two sexes**, not twenty races. The pipeline, the
runtime roster and the picker all carry `race` and `sex` as separate fields.
What gets *built* is their product — a **character build**, id `<race>-<sex>` —
because that is the granularity at which a GLB exists.

```
race   nord | imperial | breton | redguard | altmer | bosmer | dunmer |
       orsimer | khajiit | argonian          (lore-level; label, description)
sex    male | female
build  nord-female, argonian-male, ...       (20; one GLB each)
body   male | male-argonian | male-khajiit |
       female | female-argonian | female-khajiit   (the mesh set)
```

## Why not `nord-female` as a race id

The rejected shape was twenty entries in `RACE_IDS`. It reads the same in a
picker and is less work today, and it is wrong for the thing we have already
committed to build: a Skyrim-style character creator (PROGRESS phase 10b;
[FaceGen pipeline](../research/combat-and-systems/skyrim-facegen-runtime-pipeline.md)
§"Character-generation boundary"). That creator's inputs are *race*, *sex*,
race-and-sex-valid head parts, morph sliders and tint layers. A flattened id
forces every one of those to re-derive the two axes by splitting a string, and
it makes "Nord" — which owns the lore, the birthsign table, the stat bonuses and
the dialogue `raceIs` condition — into something that does not exist as a
record. Stats (workstream S, module 76) attach to the race; `heightScale`
attaches to the pair. That is exactly the split below.

## What lives where

| Field | Level | Source |
| --- | --- | --- |
| `label`, `description`, lore | race | authored |
| stat/skill bonuses (10c) | race | workstream S |
| `heightScale` | **race × sex** | Skyrim `RACE` record `DATA` male/female height |
| `body` (mesh set) | sex, plus beast override | `config/bodies/<id>.json` |
| `asset`, `revision`, `meshBipedSlots` | build | pipeline output |
| `appearance` (QNAM/HCLF tints, tinted mesh names) | build | the donor NPC |
| `faceGen` donor | build | a real `Skyrim.esm` NPC of that race and sex |

`heightScale` is per pair because Skyrim's own `RACE` record stores two heights;
a Nord woman is not a Nord man scaled by the male multiplier. Reading both from
the record, rather than transcribing one, is why `pipeline/npc_records.py`
exists.

## The generated roster contract

`tooling/asset-pipeline/output/races.json` →
`packages/game-core/src/actors/generated/races.json`:

```jsonc
{
  "schemaVersion": 2,
  "roster": "skyrim-playable",
  "rig": { "asset": "...", "sha256": "..." },
  "sexes": ["male", "female"],
  "races": {                      // 10 — lore level, no assets
    "nord": { "id": "nord", "label": "Nord", "description": "..." }
  },
  "builds": {                     // 20 — one GLB each
    "nord-female": {
      "id": "nord-female", "race": "nord", "sex": "female",
      "asset": "races/nord-female.glb", "sha256": "...",
      "body": "female", "heightScale": 1.0,
      "meshBipedSlots": { ... }, "appearance": { ... },
      "faceGen": { "plugin": "Skyrim.esm", "formId": "...", "editorId": "..." }
    }
  },
  "referenceBuilds": { "male": "dunmer-male", "female": "dunmer-female" }
}
```

`schemaVersion` is required by engineering standard 3. The old top-level
`races` map carrying assets is version 1 and is not read.

## Two reference builds, not one

The old roster had one `referenceRace`, on the stated ground that *"every
playable race shares the same body, hands and feet meshes, so the lowest visible
surface is identical for all of them"*. Female bodies break that premise:
`femalebody_1.nif`, `femalehands_1.nif` and `femalefeet_1.nif` are different
meshes. So the support envelope and the fitted hurtbox — both measured from
posed, skinned geometry — are measured **once per sex**, and the roster names a
reference build per sex.

The rig GLB and its 40 clips are still emitted once, by the male reference: the
skeleton is shared and the clips are sex-agnostic.

Whether the runtime needs *two* envelope/hurtbox sets or can keep one is
settled by measurement, not assertion — see the evidence note in
[the FaceGen pipeline research](../research/combat-and-systems/skyrim-facegen-runtime-pipeline.md).
Measured (2026-09-10): the **support envelope is shared**, the **fitted hurtbox
is per sex** and the manifest carries it as `hurtbox.<sex>.segments`, keyed
exactly like `referenceBuilds` above.

## Donor NPCs are selected from the plugin, not transcribed

Every appearance's `skinTint` (QNAM), `hairTint` (HCLF via CLFM `CNAM`/128),
`bodyWeight` (NAM7) and head parts (PNAM) are read out of `Skyrim.esm` by
`pipeline/npc_records.py`. The male roster's values were hand-transcribed; they
are now re-derived and checked against what shipped. A donor is eligible only
if it is of the right race, the right sex, and its generated FaceGen NIF and
FaceTint actually exist in the archives — the same rule that made the male
defaults ordinary authored NPCs rather than char-gen presets.

## No new art

Every female mesh and texture this needs is vanilla and present in the vault:
the `female*` body/hands/feet/head/eyes set, `femaleheadargonian`,
`femaleheadkhajiit`, `femaletail{argonian,khajiit}`, and the
`argonianfemale/` and `khajiitfemale/` texture trees. Khajiit women use the
shared female hands — there is no `femalehandskhajiit`, which matches the male
side. No sourcing job, no gap.
