# Elder Scrolls Asset Pipeline

Regenerates a **game-ready character GLB** from locally-owned Skyrim source data
(NIF meshes, HKX animations, BSA-packed textures) using headless Wine + Blender
4.4.3 + PyNifly. Output drops straight into the `ecctrl-souls-combat` sandbox.

Bethesda source data and generated GLBs are **local only** — never committed
(see `.gitignore`).

## Build

```bash
python3 -m pipeline.build    --character dunmer-combat   # -> output/character-dunmer-combat.glb
python3 -m pipeline.validate --character dunmer-combat   # structural GLB check
```

The build is data-driven. Adding a character is *configuration*, not code:

| Config | Concept |
| --- | --- |
| `pipeline/config/characters/*.json` | binds race + body + rig + animation manifest |
| `pipeline/config/races/*.json` | data root, head morph, material overrides |
| `pipeline/config/bodies/*.json` | shared humanoid mesh set |
| `pipeline/config/rigs/*.json` | skeleton, sockets, import settings |
| `pipeline/config/animations/*.json` | semantic animation manifest (→ vanilla HKX) |
| `pipeline/config/toolchain.json` | Wine/Blender/BSA locations |

So a new humanoid race (Nord, Redguard, …) is a new `races/<id>.json` + curated
texture tree, reusing the same body, rig and animation manifest.

## How it works

1. `pipeline/models.py` resolves the config tree into a flat `BuildPlan`.
2. `pipeline/build.py` (host): assembles a deterministic data-root (curated race
   tree + every NIF-referenced texture filled from `Skyrim - Textures.bsa`),
   extracts the manifest's HKX from `Skyrim - Animations.bsa`, translates paths
   to Wine's `Z:` drive, and launches Blender.
3. `pipeline/blender/build_character.py` (in Blender): skeleton → meshes → baked
   DarkElfRace morph → materials → animations **renamed to their semantic game
   names** → root motion stripped → GLB.
4. `pipeline/validate.py` asserts the structural contract on the emitted GLB.
5. `output/*.animations.json` is the runtime manifest the game consumes (rig
   sockets, per-animation looping/playbackRate/root-motion policy, provenance).

`pipeline/bsa.py` is a self-contained BSA v104 reader (handles the embedded-name
flag that breaks the community extractor on `Skyrim - Textures.bsa`).

The proven interactive path this productionises is preserved under
`prototypes/pynifly/` — see its README for the toolchain specifics.
