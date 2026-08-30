# Part XI — Asset strategy and candidate sources (§71–80)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

## 71. Asset strategy under the no-new-art constraint

**Binding, owner-restated 2026-08-25: we never make art.** No new 3D models, no
new textures, **no new animations**, ever. Every visual and every clip comes
from vanilla Skyrim or from a mod, chosen on availability and quality. This is
not a temporary constraint to be worked around when something is missing — a
missing asset is a *sourcing* task, never a modelling or hand-animation task.

**When you find a gap, in this order:**

1. **Check what we already have.** Look in the asset vault
   (`ELDER_SOULS_ASSET_ROOT`, see decision 0001) and the ingested sets in
   `tooling/asset-pipeline`, plus this module's candidate tables — a source may
   already be downloaded. (Read directory and file names; don't keyword-search
   asset archives — CLAUDE.md.)
2. **Research the mod scene** for the best available source, weighing quality,
   completeness and how cleanly it converts.

   **Preference order (owner directive 2026-08-26): mod assets over vanilla for
   anything that reads as Argonian, marsh, tropical or Black Marsh-specific.**
   Skyrim's own assets were designed for a cold Nordic province and a different
   culture; mod sources built *for this setting* are closer to what we need and
   were made for our use case. In order:

   1. **[Black Marsh & Valenwood](https://www.moddb.com/mods/black-marsh-valenwood)
      — the Black Marsh half** (§74.1b) and the **Argonian Xanmeer Tileset**
      (§74.2). These are the house style; reach for them first.
   2. Other Argonia-appropriate mod sources — the candidate tables in §75–§79
      and quests [70-assets §52](../quests/70-assets.md) (A-codes).
   3. **Vanilla Skyrim/Creation** — still the right answer for *culturally
      neutral* things (generic containers, tools, rope, rubble, furniture the
      player will not read as Nordic) and for anything skeleton- or
      animation-adjacent where vanilla compatibility is the point. Zero
      sourcing cost, guaranteed pipeline fit — use it where it is genuinely
      neutral, not where it is merely available.

   A vanilla asset chosen for an Argonian-reading role should carry a one-line
   note saying why no mod source served — that note is the trigger for a later
   upgrade pass.
3. **Download it.** The owner has a **Nexus Mods premium account with an API
   key on the VM** (`apikey:` header against `api.nexusmods.com`; premium can
   generate `download_link.json`). Never echo the key. Ask the owner for the
   variable/path if it isn't visible in your shell.
4. **Record it** — source link, credits entry (root README § Credits) and file hash
   in the source registry, per §73 — *before* the asset is relied upon.

**Take assets, not mod code.** Skyrim mods that add mechanics are Papyrus/SKSE
plugins we cannot run. What we want from them is the **content**: meshes,
textures and HKX animation clips, converted through the asset pipeline. A mod's
gameplay code is at most a design reference (§74.1b applies the same rule to
mod worlds).

The project can build a large world through:

- vanilla Skyrim meshes, textures, animations and sounds processed through the existing asset pipeline;
- mod assets from the permitted source pool;
- modular composition and instancing;
- material variants derived from existing source material;
- generated terrain and water meshes;
- shader effects, particles and procedural placement;
- kit-based interior and settlement assembly.

No workflow should depend on future bespoke modelling or texture painting.

For this personal total-conversion-style project, the asset-management rule should be simple: **retain a source link and the credits that need to appear in the final credits list**. Avoid creating a legal/permissions bureaucracy inside the codebase.

## 72. Asset registry

```ts
interface AssetRecord {
  assetId: AssetId;
  sourceProject: string;
  sourcePage: string;
  sourceVersion?: string;
  sourceArchiveHash?: string;
  sourceFilePaths?: string[];
  creditRefs: string[];
  category: AssetCategory;
  cultureTags: CultureId[];
  biomeTags: BiomeId[];
  dimensions: Vec3;
  collisionProfile: CollisionProfileId;
  physicalMaterials: MaterialAssignment[];
  climbProfile?: ClimbSurfaceProfileId;
  lodSet?: LodSetId;
  snapPoints: SnapPoint[];
  sockets: AssetSocket[];
  generatorTags: AssetTag[];
}
```

The registry exists to make generation, physics, performance and credits reliable. It is not intended to become a heavyweight compliance ledger.

**Built at Phase 10 (2026-08-30):** `world/sources/assets/` — 27,929 tagged
rows across all four pools (BM&V 12,001 / vanilla 14,974 / Tropical Skyrim 869
/ Xanmeer 85), with category, culture and biome tags, LOD-billboard siblings,
plugin dimensions and how often a shipped world actually placed each mesh.
**Query it, never read it** (`python3 -m worldgen.asset_registry query
--category tree --biome swamp --used`); the pool table and row shape are in
that directory's README. `--used` is the fastest way to separate "exists in
the archive" from "an art team chose it for a swamp". Rows carry the cheap
facts only: collision, snap points, sockets and LOD chains are added per asset
by `pipeline/build_kit.py` when a kit actually places it — the
catalogue-wide, kit-compile-deep rule.

## 73. Source and credits process

Keep this deliberately lightweight:

1. record the mod/source project name and URL;
2. record the author/project names that should be credited;
3. optionally record archive version/hash where it helps reproducibility;
4. record which semantic asset IDs came from that source;
5. **add the credit line to root [README.md](../../README.md) § Credits and
   third-party sources in the same change that ships the asset** — a
   pipeline/audit doc recording provenance (e.g.
   `apps/combat-sandbox/docs/assets/`, `tooling/asset-pipeline/docs/`) is
   necessary but not sufficient; the README is the single list a credits
   review checks, so a source that's provenance-documented but not there is a
   gap, not a formality skipped.

All mods listed in this document are assumed available for this personal project. There should be no per-asset permission gate, permission-evidence workflow or agent-time spent repeatedly re-checking usage terms unless a genuinely new source is introduced later.

## 74. Available foundations

### 74.1 Vanilla Skyrim and DLC/Creation content

High-value source families:

| Source family | Direct world uses |
|---|---|
| Hjaalmarch/Morthal | marsh ground, reeds, dead trees, fog, wetland clutter, poor-road composition |
| Riften and Ratway | docks, pilings, timber waterfronts, canals, sewers, rough urban interiors |
| Fishing content | nets, fish, traps, rods, boats, dock clutter and catches |
| Caves and mines | natural caverns, mine supports, smuggler dens, roots and underground routes |
| Imperial and Nordic forts | frontier forts, prisons, checkpoints and ruined colonial infrastructure |
| Farms and estates | plantations, storehouses, fences, mills and fringe agriculture |
| Ships and shipwrecks | coastal wrecks, river obstructions, salvage and pirate sites |
| Solstheim/Dragonborn | fungi, giant roots, Telvanni organic forms, ash/Dunmer border culture |
| Blackreach | glowing fungi, subterranean water, deep-cavern lighting and scale |
| Dawnguard/Falmer cave material | selected underground infrastructure and organic clutter |
| Ruins and tombs | later cultural reuse, crypts and generic structural components |

### 74.1a Tropical Skyrim — A Climate Overhaul (Nexus classic 33017) — preferred source

Owner-directed preferred source (2026-08-28, found during the 8b water
rounds): [Tropical Skyrim](https://www.nexusmods.com/skyrim/mods/33017)
(Soolie, classic Skyrim) — a **full tropical replacer of the vanilla
texture set under vanilla filenames** plus purpose-made tropical assets. In
the vault at `mod-sources/tropical-skyrim-33017/` (main + both updates,
SHA256SUMS recorded; main archive uses deflate64 — extract with Info-ZIP
`unzip`, not python/bsdtar). Already in use: landscape ground textures
(`Beach`, `CoastOceanFloor01`, `Tropical/RiverGravel`, tropicalised
riverbottom/rivermud/mossy-rocks/mountain slabs → `build_ground_materials`
"ts" source). Still unmined and highly promising for later phases: tropical
**trees/palms/jungle flora**, grasses, **creature retextures** (Phase 13),
and architecture/clutter — sweep this archive FIRST when filling tropical
gaps before hunting new mods.

### 74.1b Black Marsh & Valenwood (ModDB) — VERY HIGH priority source

[Black Marsh & Valenwood](https://www.moddb.com/mods/black-marsh-valenwood)
(Skyrim SE new-land mod): an art-directed large Black Marsh environment
starting at Lilmoth — **the closest existing asset base to our game**.

**Binding principle (owner, 2026-08-23): we are building OUR OWN world.**
Never lift-and-shift their authored Black Marsh (their worldspace, layout,
places) as ours — our world comes from our own canonical maps, hydrology and
causal generation. BM&V is (a) an asset pool (textures, meshes) and (b) a
*reference to learn from*: how an art team dressed a Lilmoth-adjacent swamp,
what they painted where (readable via `worldgen.esp_landtex`), how they
composed settlements. Every agent using this source should reflect on which
side of that line their use falls; bring genuinely borderline cases (e.g.
reusing a whole composed location) to the owner.
Two archives, both in the vault since 2026-08-23: Part1 (meshes + plugins,
1.3 GB, catalogued — `manifest-data1.txt`) and part2 (7.6 GB, all textures,
mined — `manifest.txt`). Part1 highlights: **12.8k NIF meshes** (2.4k
architecture, 2.4k landscape incl. ~700 swamp/tropical tree meshes, 1.3k
clutter, dungeons, creature packs) for Phases 10–12, and the **worldspace
plugins** (`plugins/Black Marsh.esm`, `Black Marsh North.esp`,
`Valenwood.esp`) — the mod's authored heightmaps, landscape-texture painting
and object placements, readable with our `worldgen/esp.py`; mine their LTEX
painting and Lilmoth-area composition as references when building
settlements and refining the ground palette. Local copy: `tooling/asset-pipeline/black-marsh-mod-source/`
— **gitignored, never commit** (huge); `manifest.txt` lists all 24.6k
textures, ground candidates extracted under `extracted-ground/`.

Mining results: the ground look lives in `textures/TEXTUREPACK/landscape/`
(a full vanilla-named 512px repaint — dark/mossy/moody, the mod's
art-directed swamp character; roads/cliffs at 1024). `textures/Terrain/*`
are auto-generated LOD tiles (ignore). 16 winners are in the **`bmv-v1`
ground-material set** (mossy cobble road, roots-in-mudbank slopes, dark
river mud/edge/bottom, rooty forest floors, dark tidal sand, limestone
terraces, mossy grasses) — A/B-comparable with `aendemika-v1` in the studio.
Also catalogued for later phases: large grass/reed billboard families
(EGrass pack, V_reeds, bittercoastgrass01 — Phase 13 groundcover), tree
textures, and Part1's meshes (Phase 10+). NOTE: ModDB is Cloudflare-gated
for this VM; archives arrive via the owner's resumable uploader.

### 74.2 Argonian Xanmeer Tileset

[Argonian Xanmeer Tileset — Modder's Resource](https://www.nexusmods.com/skyrimspecialedition/mods/181193) contains 85 modular meshes covering structural and damaged Xanmeer components.[^A1] The kit is available for this project.

Direct uses:

- Xanmeer exterior shells;
- corridors and chambers;
- roofs, floors, stairs and monumental transitions;
- broken and collapsed variants;
- hydraulic and flooded complexes;
- ruin fragments for exterior dressing;
- modular dungeon families.

Record the source page and required author credits in the normal credits list; no separate permission-evidence subsystem is needed.

### 74.3 Character animation — what we have, what's missing, where to get it

The shared rig currently carries **51 clips** (walk/run/sprint/strafe, jump and
landings, one-handed and bow combat, guard, parry, riposte, rolls, criticals,
hits, deaths, equip/unequip, heal), sourced from vanilla Skyrim plus permitted
mod HKX. Animation gaps are filled the same way as any other asset (§71) — by
sourcing, never by authoring.

Known gaps and researched candidate sources (2026-08-25; verify current state
and quality before ingesting):

| Gap | Vanilla? | Candidate mod sources |
|---|---|---|
| Swimming (surface + submerged) | **Yes** — vanilla swim locomotion exists; use it unless a mod is substantially better | [Stronger Swimming Animations SE](https://www.nexusmods.com/skyrimspecialedition/mods/32625) (surface/underwater sets, freestyle + breaststroke), [Random Swimming Animations](https://www.nexusmods.com/skyrimspecialedition/mods/92951), sprint-swim sets |
| Climbing / ledge traversal | **No** — vanilla Skyrim has no climbing animation | **Two sourceable clip pools exist** (researched 2026-08-25). **(a) [EVG Animated Traversal](https://www.nexusmods.com/skyrimspecialedition/mods/63232)**: discrete mantle/vault/squeeze events **plus continuous ladder-climb loops** (rung-over-rung, with per-race-height variants) — a ladder loop is motion-wise a wall-climb loop, making it the **primary candidate for BotW climbing**: retarget the loop and let our IK steer hands/feet onto actual holds. **(b) The mod-authored [SkyParkour v3 clip set (JellyFishInLoop)](https://www.nexusmods.com/skyrimspecialedition/mods/132292)**: root-motion one-shots — ClimbLow/Medium/High/Highest, steps, grabs, midair ledge grab, water exit — for tiered mantles and chained ascent; its [modder-resources article](https://www.nexusmods.com/skyrimspecialedition/articles/10726) documents the clip/annotation format. Cautionary proof that clips are the scarce part: [Simply Climb V2](https://www.nexusmods.com/skyrimspecialedition/mods/170550) implements the exact BotW hold-to-climb *mechanic* with **no animations at all — the character visibly floats**. The micro-lab auditions both pools (playbook batch process) before the province sees a climbable wall. SkyClimb/SkyParkour SKSE *code* stays design-reference only; their clips are fair game |
| Boat rowing / boarding | **No** player rowing clips | [Boats – Operational Animated Travel](https://www.nexusmods.com/skyrimspecialedition/mods/110882) bundles ride/row behaviour; boat *motion* sets ([Animated Ships Bobbing and Motion](https://www.nexusmods.com/skyrimspecialedition/mods/187453)) carry much of the read. Expect seated poses + procedural oar/tiller drive. **Boat rule (owner 2026-08-25): boats are sourced assets too, never designed by us** — models from the §77 candidate pool, clips per this table; the roster is *selected* so that both exist, favouring craft needing only seated poses + procedural drive (module 60 §45) |
| Wading, sneak, unarmed, spellcasting, NPC idles/work | vanilla has all of these | ingest as the phases that need them arrive |
| **Chassis weapon categories kept by workstream S** (decision 0031: spears, pikes, halberds, quarterstaves; medium armour; unarmed. Cut: whips, crossbows, thrown) | unarmed **yes** (70 vanilla clips incl. the `beasth2h_*` clawed set for Argonians/Khajiit); polearms **no** | **Verified 2026-08-26, permissions checked, not yet downloaded — this is a Phase 10 sourcing job.** Polearms: [Animated Armoury (DAR)](https://www.nexusmods.com/skyrimspecialedition/mods/35978) — rapier/pike/halberd/quarterstaff/claw/katana meshes + loose-`.hkx` player *and* NPC movesets ("just credit NickaNak", conversions allowed); [Animated Heavy Armory](https://www.nexusmods.com/skyrimspecialedition/mods/51100) — shortspear/half-pike/poleaxe/trident (no credit required); [Skyrim Spear Mechanic](https://www.nexusmods.com/skyrimspecialedition/mods/25146) — spear + javelin sets, v3 dropped the FNIS/Nemesis dependency. **Medium armour needs no assets at all** — it is a per-material data tag on meshes we already have (module 76 §121.4); Morrowind-flavour additions would come from the SE/Dragonborn bonemold and chitin sets if that vault extension is ever pulled. **Whips are the reason the category was cut**: Animated Armoury's whips are behaviour/script-injected rather than clean DAR clips. Credit lines go into the root README in the same change as any download (§73) |

**"Procedural" means steering sourced clips, never inventing motion.** The
runtime already does this in principled, calibrated ways — feet planted on
uneven ground, playback speed matched to the clip's authored stride speed, a
bow-draw pose driven directly by its charge fraction. The required reading for
any clip work is the sandbox's
**[animation quality playbook](../../apps/combat-sandbox/docs/animation-quality-playbook.md)**
(audition batches, manifest provenance, support phases, owner visual gates) —
which also *forbids* ad-hoc procedural posing used to patch a bad source clip.
Climbing IK is a new system in the same principled family: the sourced poses
are the art; code chooses where the hands go.

### 74.4 Sound — sourced like everything else

The no-new-art rule extends to audio: **we never record or synthesize source
sounds; we source them** (module 57 §107). The pool (owner, decision 0023):
(1) **vanilla Skyrim's sound library** — the Morthal tundra-marsh region set
(frogs, insect beds, owls), full rain/thunder/water/wind and complete
footstep-material sets; **the Sounds BSA is not yet in the vault — extracting
it is Phase 12b's first sourcing job**; (2) **Skyrim sound mods** (Sounds of
Skyrim, AOS, ISC families and similar) — their *sound assets* enter the
catalogue with a credits entry, the same rule as meshes and clips (§71/§73);
prefer packs that are the author's own work over visible repackages of
commercial libraries, and vanilla where it's good enough; (3) genuinely
tropical gaps (jungle insect choruses, tropical frogs) fill from
**royalty-free/CC0 libraries** (Sonniss GDC bundles, CC0-filtered Freesound).
Credits + hashes per §73 (root README Credits section). Research and candidate
details:
[research/ambient-audio-soundscape-threejs.md](../research/ambient-audio-soundscape-threejs.md).

## 75. High-priority architecture and settlement candidates

All candidates in Sections 75–79 are available for use in this personal project. Preserve their source URLs and author/project credits in the credits list; asset selection can focus on visual usefulness, technical compatibility and reproducible builds.

| Candidate | Useful material |
| --- | --- |
| [Mud Mother Grove — Argonian Mud Hut](https://www.nexusmods.com/skyrimspecialedition/mods/146557) | Argonian mud-hut shell, interior composition, local props and settlement visual language |
| [Marsh-Rest — Argonian Themed Player Home](https://www.nexusmods.com/skyrim/mods/50111) | Argonian dwelling/interior composition, mixed props and waterside home ideas |
| [Xalfek — An Argonian Home](https://www.nexusmods.com/skyrim/mods/55595) | Compact Argonian home and interior arrangement |
| [Darkwater Den](https://www.nexusmods.com/skyrim/mods/52630) | Jungle-swamp cave home, clutter, textures and organic interior composition |
| Roots of the Sleeping Tree and similar organic homes | Root rooms, living-tree circulation, organic architecture and furniture ideas |
| Glimmergrove and bioluminescent cave homes | Glowing plants, cave homes, pools and underground settlement composition |
| Wares of Tamriel and Argonian cultural-prop projects | baskets, ceramics, tools, fishing goods, ritual props and trade clutter |
| Argonian bone/wood weapon resources | spears, fishing weapons, shields, bone tools and hunting equipment |

## 76. Flora, terrain and underwater candidates

### 76.0 Ground/landscape textures (terrain splat palette)

Vetted 2026-08-23 with permissions verified — full shortlist, vanilla keep-list
and ruled-out list in
[docs/research/black-marsh-ground-texture-sources.md](../research/black-marsh-ground-texture-sources.md)
(don't re-research; system design is decision 0011). Top sources: **ambientCG
and Poly Haven CC0 PBR sets** (black mud, puddled shallows, wet clay, mud+leaf
litter, moss), **A Cathedralist's PBR Landscape** (SSE 137333, open
permissions, full PBR marsh/river family), **Cathedral Landscapes** (SSE
21954, share-alike), plus the retained vanilla wet/mossy set (frozenmarsh
grass/dirtslopes, rivermud/riverbottom, reachmoss, hue-shifted
fallforestleaves). Owner rulings 2026-08-23: **Project Rainforest approved**
(use wherever it's the best fit; CC0/open-mod sources first, Rainforest for
gaps); **Vanaheimr – Marsh rejected** (cold-climate set — Black Marsh is
canonically hot tropical swamp, module 50 §33.1).

| Candidate | Useful material |
| --- | --- |
| [Depths of Skyrim — An Underwater Overhaul](https://www.nexusmods.com/skyrim/mods/98331) and SSE versions | underwater grass, seaweed, kelp, coral, fish, treasure, wreck and submerged-POI dressing |
| [Project Rainforest SE](https://www.nexusmods.com/skyrimspecialedition/mods/20636) | tropical vegetation, lily-pad replacements, red earth/rock material ideas, rain and jungle ambience |
| [Hoddminir Plants and Trees](https://www.nexusmods.com/skyrim/mods/38651) | broad plant/tree resource pool, including waterside and temperate species according to selected files |
| [WOODLAND Flora Overhaul](https://www.nexusmods.com/skyrimspecialedition/mods/48926) | trees, shrubs and broad vegetation variation |
| Enhanced Landscapes marsh pines/oaks resources | distinctive wetland tree silhouettes |
| Cathedral, Renthal and EEK flora families | mushrooms, ferns, reeds, shrubs, flowers and tree variants |
| [Cave Roots 4K](https://www.nexusmods.com/skyrimspecialedition/mods/32565) | improved cave and mine root textures |
| [Exist's Caves — PBR Retexture](https://www.nexusmods.com/skyrimspecialedition/mods/131152) | cave PBR textures with a stated CC BY-SA 4.0 licence |
| Vanilla Solstheim and Blackreach flora | roots, fungi and bioluminescent cave dressing |

## 77. Boats, ferries and water-transport candidates

| Candidate | Direct reusable value |
| --- | --- |
| [Sailboats — Script Free Sailing Expanded SSE](https://www.nexusmods.com/skyrimspecialedition/mods/40057) | six small boat classes, rowboats, sailboats, raised/furled sail states, storage and passenger concepts |
| [L.V.X. Magick's — Boats](https://www.nexusmods.com/skyrimspecialedition/mods/36149) | nine boat types, row/sail/Nordic variants, cargo themes, raised/lowered sails, fishing and construction concepts |
| [Skyrim Ferries](https://www.nexusmods.com/skyrimspecialedition/mods/109843) | rowboats, rafts, city ferries, logistics-aware route placement, simple point-to-point ferry interaction |
| [Rowboats of Skyrim](https://www.nexusmods.com/skyrimspecialedition/mods/35341) | rowboat models and rowing/interaction references |
| Nord Boats and Ships / ThatShipGuy resources | longboats, rowboats and larger ships for ports and coast |
| Vanilla Skyrim ships, rowboats, wrecks and fishing assets | base hulls, oars, docks, nets, cargo and wreck dressing |

The boat gameplay code should be original project code built around Rapier and `WorldWaterQuery`. Existing Skyrim scripts provide interaction and design references; permitted meshes and animation states can enter the asset catalogue.

## 78. Creature and fauna candidates

| Candidate | Direct reusable value |
| --- | --- |
| [Wamasu — Mihail Monsters and Animals](https://www.nexusmods.com/skyrimspecialedition/mods/158860) | wamasu model, textures, animations, effects and encounter reference. **Deferred, off the critical path** (boss decision 0030): the Last Warden final boss is now an in-vault Xal-Krona build (vanilla werewolfbeast rig + BM&V armoured-daedroth re-material — quests 70 §52 A06); the wamasu is an optional overworld legendary later. If ever ingested: audio credits CDPR and must be replaced from the §74.4 pool; custom Megalania-derived skeleton needs a conversion spike |
| BM&V vault pool moray eel — `meshes/actors/slaughterfish/morayeel.nif` (`tooling/asset-pipeline/black-marsh-mod-source/`) | moray eel on the vanilla slaughterfish skeleton (animations solved); ripper-eel encounters, slaughterfish as fallback |
| [Guars — Mihail Monsters and Animals](https://www.nexusmods.com/skyrimspecialedition/mods/44491) | guar variants, pack/mount/cargo forms and animations; includes Black Marsh-associated variants |
| [Scuttlers and Bantam Guars](https://www.nexusmods.com/skyrimspecialedition/mods/143604) | small domestic and wild fauna, animations and settlement life |
| [Sea of Spirits](https://www.nexusmods.com/skyrimspecialedition/mods/4781) | sharks, dreugh, whales, narwhals and other aquatic creature assets/behaviours |
| Bloedzuigers / giant-leech projects | large leech body and animation base for deep-marsh hazards |
| Mihail frogs, giant snakes, crocodilian creatures and centipedes | amphibian, reptile and invertebrate variety |
| Insect and dragonfly resources | ambient swarms, disease vectors and food-web detail |
| Vanilla slaughterfish, insects, fish, mudcrabs and chaurus families | baseline aquatic and invertebrate animation/material sources |

Creature assets provide models and animations. Habitat, behaviour, statistics, fixed danger and population rules remain game-owned data.

**The rootworm is never seen on screen** (owner design rule, 2026-08-28) — do
not open a sourcing job for it; no creature asset exists or will exist. Its
presence is staged entirely from effects: animated roots, water
displacement/wake VFX and audio (quests 70 §54).

## 79. Ruin, cave, fort and dungeon candidates

| Candidate | Useful material |
| --- | --- |
| [Creation Club Ayleid Ruin Resources](https://www.nexusmods.com/skyrimspecialedition/mods/83999) | extra pieces for the Update 1.6 Ayleid kit, original and modified structural assets |
| [Balamath — Ayleid Ruin Dungeon](https://www.nexusmods.com/skyrimspecialedition/mods/84000) | example of multi-zone dungeon assembly and non-linear variant using Bethesda's Ayleid kit |
| [Fort Castellum SE](https://www.nexusmods.com/skyrimspecialedition/mods/23438) | ancient Imperial tileset demonstration, fort and dungeon block combinations |
| [The Psychedelic Caves](https://www.nexusmods.com/skyrimspecialedition/mods/150288) | bioluminescent plants, mushrooms, crystals and unusual cave composition |
| Vanilla cave, mine, fort, prison and sewer kits | natural caves, smugglers, colonial infrastructure and flooded interiors |
| Vanilla Ayleid Update 1.6 content where owned | Barsaebic Ayleid structures and dungeon pieces |
| Beyond Skyrim Bruma Ayleid material | high-quality Ayleid architecture and textures |

## 80. Asset acquisition priorities

1. Ingest the Xanmeer kit and record its source/credits entry.
2. Build the vanilla Skyrim semantic catalogue.
3. Ingest one Argonian current-settlement kit.
4. Acquire waterside flora, tree and underwater vegetation sets.
5. Acquire small-boat and ferry assets.
6. Acquire a compact creature foundation: wamasu, guar, small reptiles/amphibians, insects and aquatic fauna.
7. Acquire Ayleid/Nedic/Imperial historical-layer kits.
8. Expand clutter, tools, fishing, ritual and market assets.
9. Add specialised cave and bioluminescent assets.
10. Extract the Skyrim Sounds BSA and assemble the tropical ambience set
    (§74.4, Phase 12b).
11. Fill gaps only after the reference watershed exposes them.

---

