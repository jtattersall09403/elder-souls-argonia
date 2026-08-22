# Elder Scrolls Asset Pipeline

Regenerates a **game-ready character GLB** from locally-owned Skyrim source data
(NIF meshes, HKX animations, BSA-packed textures) using headless Wine + Blender
4.4.3 + PyNifly. Output drops straight into `apps/combat-sandbox`.

Source archives and bulky intermediates live in a local **asset vault outside
this repo**. Set `ELDER_SOULS_ASSET_ROOT` to a directory containing
`skyrim-source/`, `build/` and `output/` (currently the old
`../../../elder-scrolls-asset-pipeline` checkout — see docs/decisions/0001).
Without the variable, paths resolve inside this directory, which holds only
tracked manifests.

Bethesda/mod source data and this pipeline's `build/`/`output/` products remain
local and ignored. Under the project owner's explicit permission for personal
GitHub Pages use, the game repo versions only the installed runtime character
and weapon GLBs copied into its `public/`; it does not version source archives,
extracted assets, audition builds, or rendered evidence.

## Build

```bash
python3 -m pipeline.build    --character dunmer-combat   # -> output/character-dunmer-combat.glb
python3 -m pipeline.validate --character dunmer-combat   # structural GLB check
```

Animation changes are not complete at GLB export. Before selecting, trimming,
retiming, or conditioning a clip, follow the production integration playbook at
`../ecctrl-souls-combat/docs/animation-quality-playbook.md`; it records the
source, timing, paired-role, ground-support, transition, and validation failure
modes already solved for this character.

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
   names** → per-clip root-motion policy and visible-surface support sampling →
   GLB.
4. `pipeline/validate.py` asserts the structural contract on the emitted GLB,
   including zero-based loop timelines whose exported spans match the runtime
   manifest; one-shot source timestamps remain unchanged.
5. `output/*.animations.json` is the runtime manifest the game consumes (rig
   sockets, per-animation timing/blending/root-motion/support policy, baked
   surface envelopes, and provenance).

### Animation timing and ground support

Animation config owns source time and presentation independently of gameplay:
`playbackStartTime`/`playbackEndTime` select the source interval,
`playbackRate` controls its speed, `crossFadeDuration` controls the incoming
blend (default `0.12` seconds), and optional `crossFadeOutDuration` owns an
unusually distant clip's exit. This lets the game keep a responsive action lock
while an interruptible visual recovery finishes, instead of crushing a complete
authored motion into the lock window.

For a verified source-key defect, `curveConditioning` declares the edit and the
rendered result it must produce. `removeQuaternionKeys` names an exact rig
`bone` and `sourceTime` on the **imported** HKX clock, i.e. the whole frame an
audit of the source clip reports; conditioning runs before native retiming, so
a change to the clip's measured duration cannot silently move the target. The
Blender build requires one matching key on all four quaternion components, and
removals are interior-only so they cannot alter the span retiming is fitted to.

`exportedContinuity` is mandatory alongside a removal and is checked by
`pipeline.validate` on the shipped GLB. It names the same bone, a
`startTime`/`endTime` window on the **exported** clip clock, and a
`maxAngularStepDegrees` ceiling. A removal cannot be proven by absence: the
glTF exporter samples pose bones at the scene frame rate, so every interior
instant still owns a key whether or not a source key was removed. What
conditioning changes is the value the runtime slerps through, so the validator
measures the worst rendered angular step in the window instead. A surviving
outlier still shows its excursion and its return; a repaired window steps
evenly between the retained neighbours. Declaring a window that holds fewer
than two exported keys fails rather than passing vacuously.

Keep this narrowly evidenced and clip-local; it is not a general
animation-smoothing control. Derive both the removals and the ceiling from a
dump of the actual curve rather than from a convenient number — `ROLL`'s
left-hand spike measured 65/23/83 degrees between poses only 13.6 degrees
apart, and steps evenly at ~5 degrees once conditioned.

Skyrim humanoid COM height is local translation axis 2 (native Z). Use
`preserveVerticalRootMotion` for the standard rig or explicit
`preserveRootMotionAxes` for another verified rig; planar travel remains owned
by the controller. `scaleReference` fixes runtime scale to a declared neutral
pose, so manifest order cannot change character height.

Every final skinned body mesh is sampled at 30 Hz during the offline build. The
manifest stores the resulting `supportEnvelope.surfaceMinY`, four stable marker
identities, each marker's nearby visible-surface clearance, a bone-local 3D
heel/toe candidate, and the exported action's real sample-time origin for O(1)
runtime interpolation—there is no runtime full-mesh bounds pass. During a
crossfade, runtime transforms both clips' distinct candidates through the
actual blended bone and retains the lower visible point; interpolating the
points would be wrong when the lowest shoe vertex changes between clips.
`supportMode` defaults
to upward-only `penetration`; use `airborne` for intentional airtime and
`floor-contact` only where a collapse/get-up must remain on the support plane.
`supportPhases` can override the default over half-open source-time intervals,
which preserves the authored hop/fall before a declared floor-contact phase.

Curated race trees may symlink shared owned meshes/textures. The builder rebases
legacy absolute links at the `skyrim-source/` boundary, so moving both sibling
repositories together does not break an otherwise complete local source tree.

## Local animation overrides and audition

`pipeline/config/animations/*.json` can map a source key to a local HKX with
`localOverrides`. Keep downloaded archives and extracted HKX in gitignored
`skyrim-source/` storage and record exact provenance in the semantic entry. The
only downstream binary install exception is a permission-authorized runtime GLB
required by the Pages deployment; keep all other source/build material local.

After building, `pipeline/blender/render_action_preview.py` samples an entire
semantic action and optionally mounts the weapon with the runtime socket
quaternion. Use it for GIF/video validation of motion and attachment; still
poses alone are insufficient for rolls, landings, attacks, or paired actions.
For a coordinated critical, `pipeline/blender/render_paired_preview.py` imports
two actors, runs their semantic actions on the same clock, and reproduces the
runtime separation/facing profile.

For mod archives with several plausible HKX files, build an isolated,
gitignored comparison GLB without modifying the production manifest:

```bash
python3 -m pipeline.audition --output-stem dodge-candidates \
  --candidate ROLL_A=/absolute/path/to/a.hkx \
  --candidate ROLL_B=/absolute/path/to/b.hkx
```

`pipeline/bsa.py` is a self-contained BSA v104 reader (handles the embedded-name
flag that breaks the community extractor on `Skyrim - Textures.bsa`).

See [`docs/mod-animation-ingestion.md`](docs/mod-animation-ingestion.md) for the
safe Nexus workflow, ignored source layout, FOMOD/OAR interpretation, exact
current file IDs, and paired-HKX track splitting.

The proven interactive path this productionises is preserved under
`prototypes/pynifly/` — see its README for the toolchain specifics.
