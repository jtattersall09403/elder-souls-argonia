# Creature, item and NPC asset availability

**What this answers:** for every creature, item and NPC the world names, what
asset actually delivers it on screen. No new art and **no new animations** —
a creature needs a rigged mesh that ships its own animation set, or must sit on
a vanilla Skyrim skeleton whose clips we already have.

Machine-readable form: `assetAvailability` on every entry in
`world/sources/registries/{creatures,items,npcs}.json`. This doc is the
reasoning and the sourcing shortlist; the registries are the source of truth.

## Status vocabulary

| status | meaning |
|---|---|
| `vanilla` | vanilla Skyrim/DLC actor; rig and clips already ours |
| `sourced` | mesh is already in the vault (mostly the Black Marsh & Valenwood pool, `tooling/asset-pipeline/black-marsh-mod-source/Data*.rar`); extraction and kit build still to do, but no download and no licence question |
| `sourceable` | no vault asset; a named Nexus mod would supply a rigged mesh with animations. Not downloaded, licence not yet checked |
| `none` | nothing can deliver it as an actor. Either staged as an effect/hazard, or the world must stop naming it |

## Where the bodies come from

The Black Marsh & Valenwood pool is the reason most of the bestiary is green.
It carries a full non-Skyrim creature roster built on vanilla skeletons or
shipping its own: `guars/`, `snakes/`, `cliffracer/`, `dreugh/`, `gehenoth/`,
`gant/`, `snail/`, `daedroth/`, `sharks/`, `angelshark/`, `raven/`,
`Chaurus Hunter/Giant Wasp/`, `cow/Glyptodon`, `giant/character assets/treant.nif`,
and inside `slaughterfish/` a crocodile, a moray eel, a bloodsucker fish and a
river naga. These are directory findings, not guesses; see the manifests in
`tooling/asset-pipeline/black-marsh-mod-source/`.

Three of those matter disproportionately:

- **`slaughterfish/character assets/mihailcrocodile.nif`** — crocodiles and
  sea-drakes, on the vanilla swim rig. The single most-used marsh predator.
- **`giant/character assets/treant.nif` + `treantskeleton.nif`** — the
  miregaunt. A walking tree of plant matter and old stonework, with its own
  skeleton. This was the creature most likely to be undeliverable and is not.
- **`snail/slug.nif` + `slugskeleton.nif`** — the voriplasm. A limbless crawler
  re-materialled to green slime is the honest read of a moving pool that eats
  what it flows over.

## The bestiary (31 registry entries)

| status | count | entries |
|---|---|---|
| `vanilla` | 5 | bog-blight (draugr), mouth-plover, osheeja-gar, wisp, wispmother |
| `sourced` | 21 | crocodile, fellrunner, giant-leech, giant-wasp, guar, hackwing, haj-mota, haynekhtnamet, hoarvor, jassa-red-slug, kaj-thux, lamia, lizard-steed, marsh-giant, medusa, miregaunt, sea-drake, swamp-leviathan, voriplasm, wamasu, xal-krona |
| `sourceable` | 1 | death-hopper |
| `none` | 4 | feather-serpent, fleshfly, kotu-gava, rootworm |

Substitutions worth knowing, because they change what the creature *reads* as:

- **hackwing → cliff racer.** A large hostile flyer that swoops and returns is
  the hackwing's whole behaviour. Re-material for the saw beak.
- **haj mota → glyptodon** (walking, on the cow rig) and **stone crab** (the
  smaller shallows form).
- **wamasu → armoured daedroth on the vanilla werewolfbeast rig**, the build
  decision 0030 already chose for the Xal-Krona boss. Mihail's dedicated Wamasu
  stays deferred: its skeleton needs a conversion spike and its audio credits
  CDPR.
- **marsh giant → treant body on the vanilla giant skeleton**, with ancient
  spriggan materials for the plant read (it is a spriggan cousin in lore).
- **lamia and medusa → the same river naga body**, differently materialled.

## Sourcing shortlist (nothing downloaded; check licence first)

| Need | Candidate | Nexus id | Note |
|---|---|---|---|
| Death hopper (giant frog) | Mihail Monsters and Animals, amphibian/frog pack | id to confirm from Mihail's SSE author page | Only genuine gap in the bestiary. Fallback is a rescaled chaurus, which reads as a crawler, not a hopper |
| Guar variety beyond the vault set | Guars, Mihail | SSE 44491 | Already in module 90 §78 |
| Small settlement fauna | Scuttlers and Bantam Guars | SSE 143604 | Ambient life, not danger |
| Deep-water fauna | Sea of Spirits | SSE 4781 | Sharks, dreugh, whales |
| Wamasu, if ever un-deferred | Wamasu, Mihail | SSE 158860 | Skeleton conversion spike + CDPR audio must be replaced |
| Monster/boss pool to evaluate | The Blackest Reaches | SSE 35933 | Owner lead; Phase 13 evaluation |

## What is impossible, and what we do instead

- **Insect swarms (kotu gava, fleshfly).** No rig delivers a cloud of
  sand-grain insects at any useful count, and a swarm of individually rigged
  actors is a performance decision we would regret. Staged as a particle cloud
  plus a damage volume: a hazard you cross or go round, like weather. Two
  catalogue slots now say so in their notes.
- **The feather serpent.** A feathered flying serpent needs a rig and flight
  clips nobody has. The one catalogue slot naming it is re-pointed to the
  kaj-thux great-serpent build, and the recitation still calls it a feather
  serpent, which is how a legend should behave.
- **The rootworm.** Undeliverable by owner rule, not by asset gap: it is never
  seen on screen (module 90 §78). Roots, water displacement and audio only.
- **Stinging reef life.** Not an actor; a contact hazard on the reef geometry.

## Items and NPCs

Every item registry entry is a prop or a material, so no rig is involved:
14 are vanilla clutter re-materialled (ore, gems, bone, scrolls, bottles,
stakes), 3 come from vault pools (Xanmeer tileset vakka-stone fittings, BM&V
relic and charm props), and the **vossa-satl** is the one `sourceable` item,
covered by the Argonian equipment candidates in module 90 §75.1 with a vanilla
instrument fallback.

Both NPC registry entries are `vanilla`: Argonians on the vanilla playable-race
body with the vanilla humanoid animation sets. Every race the world uses is
vanilla; NPC asset work is equipment, materials and face variation only.
