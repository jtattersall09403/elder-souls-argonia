# Lilmoth — meso design record (Phase 11 Part 6)

`place.mercantile-coast.lilmoth` · major city, rebuilt-stilt-city, M5, D1,
mercantile coast · blueprint `place.mercantile-coast.lilmoth.json` · dossier
`world/sources/sites/dossiers/lilmoth.{json,md}` (re-run at the plotted position,
radius 600 m) · map
`tooling/world-generation/output/blueprint-maps/place.mercantile-coast.lilmoth.png`

This is the exemplar **city**. The owner steers every city, so this record is
written as a set of choices with their numbers, not as a finished settlement.
Every named or socketed building and every landmark is parcelled; **Pusbottom is
the one fully parcelled district** so the owner can judge grain; the other five
districts carry boundaries and a density target in `notes`.

## 1. The ground, and the three candidates

The approved anchor is 3610.8, 6384.7 m (uv 0.4897, 0.8659) with a tolerance of
0.04 uv = 296 m. The dossier reports the disc as 38% buildable (43.2 ha), relief
67.9 m, and the anchor point itself at 15.72 m, 14.28 m above the local water
table, 86 m from the nearest shore and 228 m from open sea. The city is on a
promontory with water to the east and to the south, which matches canon's
"southern point of Murkmire, on the river estuary that leads into Oliis Bay".

A city anchor does not move, so the candidates are about **where the districts
and the dock line sit around it**. Each was measured along a ray out of the
crest at 3640, 6350 m (21.9 m, slope 5.5°).

| | `candidate.lilmoth.east-face` (chosen) | `candidate.lilmoth.se-embayment` | `candidate.lilmoth.south-lagoon` |
|---|---|---|---|
| positionM | 3660.0, 6372.0 | 3700.0, 6470.0 | 3604.0, 6520.0 |
| distance from the anchor | 55 m | 123 m | 136 m |
| buildable tiers between crest and water | **four** (21.9 → 7.4 → 1.4 → water) | one (18.6 m falls to the waterline over 280 m, no step) | two, both under 4 m |
| slope at the mid bench | **2.5°** at 3720, 6350 | no bench | 5.4° at 3600, 6470 |
| width of the shallow lightering shelf | **≈120 m** (3800–3880, h 1.5 → −1.2 m) | ≈40 m | the whole lagoon |
| water depth 100 m off the quay line | **1.0 m** | 3.8 m | 0.4 m |
| depth at the anchorage the lighters serve | **6.6 m plateau, 3960–4040 m out** | 15.5 m at 150 m out | none reachable |
| deepest water available to a diver | **6.6 m at 3960, 6350** | 25.5 m | 0.6 m |
| flood band at the quay line | 1–3, wet-season inundated | 0 | 3 |
| route tie-in | the north road comes down the crest to the gate at 3648, 6296 | would need a new 300 m spur | would need a 400 m spur through mangrove |
| approach and reveal | off the rise, the drowned quarter is underfoot before the water is noticed | the water is visible the whole way; no reveal | the city is never above the player |

**`candidate.lilmoth.east-face` won on three separate grounds.**

*Geometry.* It is the only candidate that gives four buildable tiers in one
400 m run — crest 21.9 m, a 22.5° bluff, a 7.4 m bench at 2.5° slope, a tidal
flat at 1.3–1.5 m, then the drowned ground. The record's silhouette asks for "a
stepped mass of platform-decks and stilt-towers rising in three tiers"; this
section produces those tiers from the terrain rather than from grading.

*Canon.* Lore:Lilmoth states large ships cannot dock and anchor out while goods
are lightered in. That is a statement about water depth, and only the east face
has the geometry for it: a 120 m shallow shelf no hull can cross, and a 6.6 m
plateau 350–440 m out where a hull can lie. `candidate.lilmoth.se-embayment` was rejected
precisely because its water is *too good* — 3.8 m within 50 m of the shore would
let a hull berth alongside and would quietly delete the city's living.

*The signature.* The record's signature is stilt work climbing over drowned
Imperial villas. `candidate.lilmoth.south-lagoon` cannot drown anything: 0.4–0.6 m of water
behind the spit at 3600, 6590 is a puddle, not a dive.

## 2. High-level design

Six districts, each drawing on exactly one kit set.

| District | Kit set | Ground | What it is |
|---|---|---|---|
| `district.lilmoth.hist-court` | `argonian-stilt` | crest, 21–22 m | The third Hist, walled and open; two minder lodges on opposite sides of it; the memorial ground. Target 4 buildings/ha. |
| `district.lilmoth.council-crown` | `argonian-stilt` | bench, 13–19 m | Council floor, tariff bell, register, strongroom, upper walkway market. Target 10 buildings/ha, decks outnumbering shells. |
| `district.lilmoth.north-gate` | `imperial` | 10–18 m | The surviving Imperial curtain, its gate and its squat tower. Target: no infill at all. |
| `district.lilmoth.pusbottom` | `argonian-stilt` | bench, 1–14 m | **The fully parcelled sample district.** 16 parcels over 0.81 ha = 20 buildings/ha. |
| `district.lilmoth.lighter-quay` | `argonian-stilt` | tidal flat, −0.2 to 2.6 m | Quay deck, divers' yard, salvage bench, lighter shed, quay lamp. Target 8 buildings/ha, every one piled to the bed. |
| `district.lilmoth.drowned-quarter` | `neutral-underwater` | −0.9 to −9.6 m | Old Imperial Lilmoth. Target: sparse, 6–10 structures reading as a street plan seen from above. |

**Layout intent.** One walkway spine, `boardwalk.lilmoth.tier-spine`, runs from the Hist court
over the crown, down the bluff through Pusbottom and out onto the quay: 3640,
6330 → 3620, 6384 → 3742, 6362 → 3798, 6366. Everything else hangs off it. The
tiers are a *fall*, not a plan: a player entering by the north road walks down
the whole city and ends standing over the drowned quarter, which is the record's
own approach line. Cargo runs the other way, up.

**The dock line.** `dock.lilmoth.lighter-quay` at 3812, 6366 sits where the flat gives out
(−0.2 to 0.4 m), `dock.lilmoth.diving-stair` at 3800, 6398, and `dock.lilmoth.roadstead-tender` at
3946, 6390 out on the 6.6 m plateau. `canal.lilmoth.lighter-channel` is the dredged 14 m run
between them. The three together *are* the lightering economy as geometry.

**Gates and approach.** The north road descends to the Imperial gate at 3644,
6296 and passes under the surviving tower. This is the only land entrance;
everything else arrives by water.

**What is kept.** The Hist is never cleared and the settlement bends around it.
Also kept: the court shade at 3656, 6356, the mangrove wall on the seaward
approach at 3812, 6432, and the reed fringe at 3778, 6412 — the mangrove is the
record's own approach feature and must survive the clearance pass.

**Sockets.** All thirteen of the record's sockets are placed and, except the Hist
court scene (which belongs to the tree, not to a building), each is bound to a
parcel: council floor and council-hall station and the council-standing mark on
`parcel.lilmoth.council-hall`; the tariff roll and the pre-rebuild plan in `parcel.lilmoth.record-room`;
the slaughter list in `parcel.lilmoth.pus-slaughter-house`; the drowned dive and its mark on
`parcel.lilmoth.drowned-villa-hall`; the lighter quay on `parcel.lilmoth.quay-deck`; the north gate on
`parcel.lilmoth.gate-tower`; the diving stair on `parcel.lilmoth.divers-yard`; the upper walkway market on
`parcel.lilmoth.upper-market-deck`.

## 3. Asset picks, on measured geometry

Sizes are `sizeM` [x, y, height] from the built kit manifests.

| Use | Asset | Size (m) | Why this piece |
|---|---|---|---|
| Council floor, the one hall | `composite:stilt/platform-dwelling` | 11.26 × 17.75 × 15.44 | The tallest single Argonian dwelling volume we hold; status by scale, not by imported material. |
| Tariff bell, quay lamp | `bmv:…/passerelles/kiosque/kiosk01` | 8.57 × 8.57 × 20.74 | 20.7 m of vertical: the lamp-tier that reads first from the bay. |
| Open decks (upper market, quay, Pusbottom) | `htbm:…/kothringi/stilthouseplatform` | 11.26 × 17.75 × 11.20 | A platform with no shell — a market is a deck, not a building. |
| Dwellings | `htbm:…/argonian/bamboohut01` and `02` | 8.17 × 8.22 × 5.83 | The only purpose-built Black Marsh dwelling forms in the vault, and they ship their own door mesh. |
| The tall block in Pusbottom | `bmv:architecture/stilthouse/stilthouseext` | 11.26 × 17.75 × 10.75 | Breaks the hut grain once, against the bluff. |
| Third Hist | `histtree:…/ancient sleeping tree` | 24.87 × 27.12 × 24.35, 38k tris | Hero-Hist scale. At 21.5 m ground it clears every tier and is seen from the water. |
| Memorial | `histtree:…/rune circle` | 8.11 × 9.01 × 3.32 | The kit's recorded stand-in for canon grave-stakes. |
| Gate tower | `mwkeep:…/mwimparchguardtower01` | 6.15 × 6.15 × 13.06 | Squat, 13 m, masonry — the record's exact description. |
| Surviving curtain | `mwimparchwall01destroyed01` / `02` | 6.9 × 3.53 × 13.06 | Destroyed variants: what the water and the An-Xileel left, not a repaired wall. |
| Fallen twin tower | `mwimparchguardtower01destroyed01` | 5.92 × 5.92 × 6.66 | Left where it dropped. |
| Drowned hall, sunken shrine | `sirenroot:…/arblockfreehollow` | 7.29 × 7.29 × 4.55 | Hollow, so a diver can swim in and stand up. |
| Drowned floors | `sirenroot:…/aruniquerubblewalkablefl01`, `…fl03` | 5.96 × 7.45 × 1.30, 3.90 × 3.07 × 0.79 | Walkable rubble: a floor to land on. |
| The ridges breaking the water | `sirenroot:…/arblockfreebrokena` | 7.29 × 7.29 × 4.55 | Set in 3.7 m of water so its top shows — the long-range cue. |
| Roadstead mark | `bmv:sheogorad/dagon fel/dockspilings` | 0.74 × 0.75 × 8.24 | An 8.2 m pile cluster: where the hulls lie. |

**Two pieces were ruled out, both on the "kits only combine pieces designed to
combine" rule.**

- `composite:quay/stone-quay-with-stilt-house` (14.72 × 18.63 × 17.68) is welded
  from `MWImpArchDock01` — an Imperial keep stone dock — and an Argonian stilt
  house. It is the owner's own worked example of a composition nobody authored,
  and it blends two cultures inside one mesh, which the two-culture rule forbids
  even before the geometry argument. It is banned in `assetConstraints`.
- `settlement-mud-v1` is banned here outright: Lilmoth is Murkmire reed/stilt
  culture, and material-culture forbids blending the two Argonian building
  cultures in one settlement. Everything Argonian therefore comes from
  `settlement-stilt-v1` and its dock/watercraft companions.

`composite:stilt/platform-dwelling` **is** used: it is a Kothringi stilt platform
carrying an HTBM awning, both from the same author's Black Marsh village set, on
bamboo and wicker textures only. Same set, same culture, authored to fit.

**Dock systems.** `docks-v1` packages four separate authored systems that do not
interlock. The BM&V Dagon Fel jetty system builds the lighter quay run (it has
the straights, junctions, corner, terminations, water stair and pile clusters a
quay needs); HTBM's `tamu_` lashed-plank family — the only Argonian-reading one
— builds the shore boardwalks. The change of system happens at a shore end, per
the kit's own rule, and never mid-run.

## 4. Ground fit, and a compiler bug fixed

Measured Δ over each footprint is recorded in every parcel's `notes`. The city
is on stilts because the ground says so, not because the label does: Δ reaches
6.10 m under the upper market deck, 4.01 m under the tariff bell and 3.28 m
under one Pusbottom hut — all far past the 2.0 m line beyond which the compiler
must never grade. Every Argonian parcel is therefore `stilt`, which is also the
lore-correct answer. The Imperial survivals are not stilted, because Imperial
masonry here *sank*: the gate tower is `dug-in` (Δ 2.70 m), the gate arch and the
fallen tower are `pad` (Δ 1.50 and 0.76 m), the two wall stubs `plinth` (Δ 0.20
and 0.50 m). The drowned quarter is `dug-in` throughout.

While compiling, the door-reachability check failed every door on ground that is
plainly dry. Root cause: `compile_settlement.py` called `survey.grid_px(x, z)`,
which returns `(row, col) = (z index, x index)`, and then indexed
`land[px[1], px[0]]` — the transposed pixel. Every other caller in `worldgen`
unpacks it as `row, col`. Fixed in place; the check now measures the threshold
it was meant to measure. This was a latent bug that would have mis-scored every
settlement compiled from now on.

Compile result: **42 placements, 0 errors, budget OK**, 11 of 11 doors reachable.
The declared budget is the finished city's target (2400 instances, 110 unique
materials, 260 MB textures, 1800 colliders), not this draft's usage. Worth the
owner's attention: 17 unique assets already pull **91 unique materials**, so
materials, not instance count, is the tight constraint on a city.

## 5. Lore grounding

- Stilt-and-platform fabric, ninety per cent Argonian, over sunken Imperial
  villas; Imperial walls on most of the circuit and Argonian walls facing the
  Oliis estuary; large ships cannot dock and must lighter their cargo ashore;
  Pusbottom
  as the criminal quarter; the city's own Hist despite no native tribe; the
  sunken shrine to Xhon-Mehl the Fisher — all `world/sources/lore/lilmoth.md`,
  from UESP Lore:Lilmoth.
- Rebuilt but not restored, smaller and lower, over its own mass grave, with the
  Old Imperial quarter left drowned and Pusbottom repopulated — the owner's
  binding decision of 2026-08-24, recorded in the same dossier.
- The third Hist, grown from the second's root, walled and open, with a rotating
  minder's post and a second tender always present: `world/sources/lore/topics/
  hist-placement.md` §4. Both lodges are parcelled, on opposite sides of the
  tree, because the rule is meant to be legible as architecture.
- "Dry land is infrastructure — what did they spend their scarce dry ground on?"
  (`docs/research/marsh-settlement-morphology.md` §1.6). Here: the tree, the
  dead, the gate and the council. Nobody lives on the crest.

## 6. Open questions for the owner

1. **How far does the drowned quarter go down?** Right now the divable ruins sit
   in 1–10 m of water and the deepest reachable point is the 6.6 m roadstead. A
   drowned *city* could instead run out to 15–25 m in the south-east embayment,
   which would make the dive a real expedition with air pressure and darkness as
   gates. The cost is that the deep water is 400 m offshore, so the dive stops
   being something you fall into off your own walkway and becomes a boat trip.
   Shallow-and-underfoot, or deep-and-expeditionary?
2. **Should the north gate stay Imperial, or be half-swallowed?** The blueprint
   keeps a legible Imperial gate: a standing 13 m tower, a gate arch, two ruined
   curtain stubs and one fallen tower. The alternative is to bury most of it —
   one tower and rubble, with the Argonian city grown across the line of the old
   wall. The first reads as a city that inherited a wall; the second as a city
   that outgrew one. Both are canon-compatible; they give very different first
   impressions to a player arriving by road.
3. **How dense should Pusbottom be?** The sample district is 16 buildings on
   0.81 ha, about 20 per hectare — roughly four times the density the pipeline
   mined from comparable Morrowind villages, and deliberately so, since this is a
   slum in the province's densest city. It will feel tight and maze-like, with
   no line of sight longer than about 20 m. Dial it up towards a genuine warren,
   leave it, or open it out so the tiers read from inside the district?
4. **Where should the player be allowed to climb?** The tiers are 6–14 m apart
   vertically and the kit's walkway system has authored stairs and ramps. We can
   either route all vertical movement through those (a legible, gated city where
   the walkways are the puzzle) or let the climbing system take the piles and
   house sides freely (a city that rewards route invention but where locked
   districts are hard to enforce). This is the decision that most changes how
   Lilmoth plays, and it is hard to reverse once the quest gates are authored.

## 7. Catalogue record should change (not edited from here)

- `underwaterAccess` is `"none"`, but the record's own sockets include
  `scene.lilmoth.drowned-quarter-dive` and `station.lilmoth.diving-stair`, its
  `traversalModes` include `swim` and `dive`, and three quests (TG10, LQ08, LM10)
  turn on getting under the floorboards. It should say the drowned quarter is
  divable.
- `relations.visibleFrom` is empty, but the dossier reports Blackrose visible
  1.3 km west and Soulrest 3.1 km west from this ground. Both are worth
  recording, since a sightline is a wayfinding asset.
- `assetPlan` lists `bmv-stilthouse` and `vanilla-shackkit` but not the HTBM
  Black Marsh village set, which is where the actual dwellings, the platform and
  the Argonian-reading boardwalk come from. The plan should name it.

## 8. Sourcing gap

No kit we hold carries a focal object for an **Argonian underwater shrine**. The
sunken shrine to Xhon-Mehl the Fisher is placed at 3924, 6386 in a SIRENROOT
hollow ruin block, which gives a swimmable, standable cell but no shrine. The
mud kit's `sithisshrine` exists but belongs to the other Argonian culture and is
banned here. This is a sourcing job, not a modelling one, and it is shown as a
gap rather than faked: the parcel's `notes` records it.
