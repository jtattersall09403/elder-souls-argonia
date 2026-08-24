# Characters and races

A character is **two downloads**: a *rig* and a *race body*.

| Asset | Contains | Size | Shared? |
| --- | --- | --- | --- |
| `rig-skyrim-humanoid.glb` | skeleton (99 bones + 5 tail) and all 40 semantic clips | ~6 MB | one, for everyone |
| `races/<id>.glb` | that race's meshes and textures, no animations | ~0.8 MB | one per race |

Shipping them together would duplicate the whole animation set for every race.
Ten races that way is over a hundred megabytes; this way it is about fourteen.

Nothing has to be re-bound to join them. Both halves are built from the same
skeleton, so the clips' bone names resolve against whichever race model is
mounted and `useAnimations(rig.animations, raceRoot)` binds by name. If you ever
build a race against a different skeleton, this stops working silently — which
is why `fetch-assets` checks both halves against the hashes their manifests
record.

Armour is a **third** download, mounted the same way. See
[items-and-inventory.md](items-and-inventory.md#wearing-armour); what matters
here is that a race body records which biped slots each of its meshes occupies
(`meshBipedSlots`), because that is what a worn piece hides.

## What a race is

`packages/game-core/src/actors/races.ts` reads the generated roster. A race is a body:
meshes, textures and a skin tone. It is not a stat block, a moveset or a
loadout, and no combat, animation or inventory code knows which one is loaded.

Skin and hair colour are a **tint applied at runtime**, not baked art. Every
humanoid race uses the same body, hands and feet meshes and the same diffuse,
and differs by head morph, head normal, eye texture, hairstyle and two colours —
so ten races cost one body's worth of download. `Appearance` in
`actors/appearance.ts` is the whole of it, and it is deliberately not a race
type: a character creator moving a slider is the same call.

Runtime rather than baked for two reasons. A slider has to move a colour without
rebuilding an asset — and a tint node between a texture and base colour is not a
shape the glTF exporter can write, so a baked one is silently dropped and every
race ships pure white. That is exactly what happened here.

**Hair is not part of the body.** It is skinned to the head bone, so anything
measuring the character from its skin will take a braid for a skull. The
pipeline excludes it from both the height that sets `recommendedScale` and the
fitted hurtbox: otherwise adding a hairstyle shrinks every actor in the game to
keep the *hair* at 1.85 m, and a sword can hit someone by hitting their fringe.

Skin colour is a **tint**, not a texture. Every humanoid race in Skyrim uses the
same body, hands and feet meshes and the same diffuse, and differs by head
morph, head normal, eye texture and a tint — so the pipeline does the same. That
is why there is no curated per-race texture tree: adding a race is one
`races/<id>.json` plus one line in the roster.

Beast races substitute rather than tint: Khajiit and Argonians carry their own
head, eyes, mouth and body textures, and Argonians their own clawed hands.

## Tails

Skyrim ships **no beast body skeleton**. Khajiit and Argonians animate on the
same 99-bone rig as everyone else; `skeletonbeast.nif` differs from
`skeleton.nif` only by five tail bones, and tails are driven by a *parallel*
auxbone clip set under `meshes/auxbones/tail/animations/` whose files share
their names with the body clips.

The pipeline grafts those five bones onto the rig (`rig.auxiliaryBones`) and
merges the paired tail clip into each semantic action, so a tail is just more
bones in the same GLB animated by the same clips — the runtime needs no tail
code at all. Three details matter:

- **The attach point is the parent bone's head.** The tail skeleton's own
  coordinates are relative to it, so the chain lands in character space with no
  hand-measured offset.
- **A tail clip is matched by filename**, because Bethesda authors the pair
  together. `tailSource` overrides that for a clip whose body source was
  replaced or has no same-named partner; `null` opts out.
- **The pair shares a clock, not a key count.** Tails are keyed more sparsely,
  so the merge maps the tail onto the body's frame range rather than demanding
  equal lengths. Requiring equal frames rejected two thirds of the real pairs.

33 of 40 clips animate the tail. The seven that do not are the paired mod
choreography (parry, riposte, backstab, criticals, death), which has no auxbone
partner at all; putting an unrelated tail clip on those would be invention
rather than a pairing.

## Adding a race

1. `pipeline/config/races/<id>.json` — label, description, body profile, head
   morph shape key, `skinTint`, and any `textureSubstitutions`.
2. Add the id to `pipeline/config/characters/skyrim-playable.json`.
3. `python3 -m pipeline.build_races --only <id>` (the reference race is built
   too; it owns the rig and the manifest).
4. Copy `output/races/*.glb` into `public/races/`, `output/races.json` into
   `packages/game-core/src/actors/generated/`, and run `npm run assets`.

## The reference race

Support envelopes and the fitted hurtbox are measured from posed, skinned
geometry, so one race has to provide it. Every playable race shares the body,
hands and feet meshes that determine the lowest visible surface, so one set is
correct for all of them. `referenceRace` in the roster says which; change it
only if that stops being true.
