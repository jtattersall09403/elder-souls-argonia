# The Standing Charge — meso design record

`place.naga-kur-deeps.wamasu-pond-adult` · beast lair · wamasu pond, adult ·
danger D5 · region naga-kur-deeps · Phase 11 Part 6, Round A draft.

Blueprint: `place.naga-kur-deeps.wamasu-pond-adult.json` ·
dossier: `world/sources/sites/dossiers/standing-charge.{json,md}` ·
map: `tooling/world-generation/output/blueprint-maps/place.naga-kur-deeps.wamasu-pond-adult.png`.

This is the exemplar for the province's largest place family (38 beast lairs)
and for fixed high danger in the deepest region class. It is a creature-owned
outdoor place: no dwellings, no doors, two structures in total.

## The plotted neighbourhood

Dossier centre 2404.5, 4433.4 m (uv 0.3261, 0.60126): elevation 10.15 m,
slope 3.4 deg, rootland deep marsh, danger band 5, buildable 34.42 ha of the
disc, canopy closure 0.82, 8039 compiled plants at 160/ha, nearest road 332 m
east, effort score 0.34. Crucially, the plotted point carries **no standing
water**: it sits 3.0 m above the water table with a shore 33 m away and a
measured water depth of 0.00 m. A wamasu pond has to be sited on real water,
so the meso pass moved it.

The place already owns a compiled poling lane,
`waterway.naga-kur-deeps.wamasu-pond-adult` (channel, 0.186 km, running
from 2499.9, 4555.7 to 2620.5, 4659.8). That lane is the detour the record
describes; every candidate below is measured against it.

## Candidate sitings

| | `candidate.wamasu-pond-adult.pan` (chosen) | `candidate.wamasu-pond-adult.plot` | `candidate.wamasu-pond-adult.lane-head` |
|---|---|---|---|
| positionM | 2466.0, 4403.0 | 2404.5, 4433.4 | 2602.0, 4652.0 |
| standing water | yes, isolated | none | yes, but sea-connected |
| water area | 962 m² (32 px) | — | flood-fills to the ocean |
| extent | 38 x 38 m | — | estuary arm |
| depth (measured) | 0.30 m max, 0.03 m mean | 0.00 m | 1.60 m |
| water level | 9.24 m | 7.15 m table, 3.0 m below ground | 0.00 m |
| bank slope | p50 1.2 deg, p90 3.6 deg | 3.4 deg | 0.3 deg |
| to the poling lane | 156 m | 155 m | 8 m |
| to the nearest road | 278 m | 335 m | 198 m |
| flood band | 0 | 2 | 3 |
| canopy closure | 0.63 | 0.82 | 0.91 |
| region class | lake & standing water | rootland deep marsh | rootland deep marsh |

**`candidate.wamasu-pond-adult.pan` wins.** It is the sole closed body of standing water within 300 m
of the plot; a flood fill from either of the other water bodies within 600 m
runs out to the ocean, which makes them tidal channels rather than a held
pond. The record's whole premise is still, avoided water that one animal can
own. Only an isolated pan delivers that. It also sits 69 m from the
plotted position, so the macro plot is barely disturbed; it keeps the lane
at the same 156 m, so the detour still runs past for its whole length; its rim
slopes of 1–4 deg give buildable bank without grading; and its canopy closure
of 0.63 against 0.82 leaves a genuine hole in the canopy for the standing dead
trees and for a lightning silhouette to be read from below.

`candidate.wamasu-pond-adult.lane-head` was the tempting one, with real depth beside the lane. A
pond that sits *on* the through route is a blockage rather than
a hazard around which traffic is drawn. Its water is also the estuary at flood band 3.

**The pond is too shallow as found (0.30 m).** That is a terrain request, not
a reason to re-site: see "catalogue record should change" below.

## The design

Three districts, two parcels, twelve landmarks, no doors.

**`district.wamasu-pond-adult.bank` — the pond bank** (kit set `argonian-mud`, 66 x 66 m). The south and
south-east shelf is the offering bank, flat at 0.8–2.2 deg and 9.18–9.24 m,
level with the water. Reading outward from the water: the offering platform,
then a totem, then the bone chime, then three grave-cairns stepped up the bank
to the 10 m line. One lantern, maintained; nothing else on the bank is.

**`district.wamasu-pond-adult.stand` — the knoll** (kit set `neutral-works`, 28 x 18 m). A rise
north-west of the pond at 11.61 m, 2.4 m above the water and 22 m back
from it, slope 2.8 deg. The hunter's abandoned stand is on it. From the deck the
whole pan is in view; that is the point of the piece and the reason the
evidence socket is up there.

**`district.wamasu-pond-adult.detour` — the pole line** (kit set `argonian-stilt`, 36 x 148 m). A
corridor from the pond's east landing at 2490, 4430 to the lane head at 2500,
4556, following `route.wamasu-pond-adult.detour` through 2498/4462, 2500/4494 and 2502/4528. Poles
only, repeated at 12 m, each kept root skirt uncleared: the signature feature
is that the poles have stood long enough to root, so the roots are authored
kept vegetation rather than dressing.

**The cave mouth and the delve.** Landmark `landmark.wamasu-pond-adult.cave-mouth` at 2446, 4402 — the
west waterline, exactly at water level 9.24 m, bank slope 6.3 deg. It is
entered from the water, which is what the record's `underwaterAccess:
surface-swim` and `entrance: cave-mouth` already promise. The interior is a
**Phase 12 claim, not built here**: flooded-cave delve, size band S1, wet
fraction 0.4, one entrance, no exterior shell. There is no door record, because
there is no building.

**The fight ground.** `combat.wamasu-pond-adult.pond` is 46 x 44 m over the pan and its rim,
clearance class open; it is also the hard-clear polygon: nothing but the
three kept dead trees stands inside it. The wamasu build is a large rigged
actor (below) with a body of roughly 5 m; the space gives it room to turn,
charge and be circled. The shallow water means the fight is fought *in*
the pond rather than around it. `combat.wamasu-pond-adult.bank-shelf` (30 x 18 m, class broken) is
the deliberate opposite: the cairn steps and offerings are bad ground for fighting
and good ground for a retreat.

**Approach and reveal.** A visitor meets the pole line first, on the water,
and follows it; the pond is screened by the bank rise until roughly 40 m out,
at which point the dead crowns and the cairn line come over the rim together.
The dossier's concealment figure for the neighbourhood is 0.67, so this is not
a place seen from far off — it is a place the poles announce.

## Orientation and footprints

Both parcels are authored as centre, piece, bearing and reason; the `footprint`
polygon in the blueprint is derived from the piece's measured ground hull
by `worldgen.blueprint_footprints --apply` and is never typed by hand. Bearings are
degrees clockwise from north.

| Parcel | centreUV | Piece | yawDeg | Why that bearing | Derived footprint |
|---|---|---|---|---|---|
| `parcel.wamasu-pond-adult.hunters-stand` | 0.331464, 0.592800 | `stockadescaffoldbase3sided01` | 146 | The open, unrailed face looks straight down the 146 deg line from the knoll to the centre of the pan, which leaves the three railed sides and the ramp on the landward flank | 12-vertex hull, 3.70 x 3.84 m, 9.04 m² |
| `parcel.wamasu-pond-adult.offering-platform` | 0.335254, 0.600257 | `argonianplatform` | 345 | Square to the south waterline, so the deck's long axis runs out toward the water and the offerings laid on it face the pan, as the bank's practice requires | 16-vertex hull, 2.79 x 2.68 m, 7.27 m²; the pivot sits at the landward end, so the deck reaches into the shallows |

The offering platform's hull is asymmetric about its pivot (local x from -0.12 m
to 2.67 m), which is why its bearing decides where the deck lies and not merely
how it is turned.

Four landmarks carry a bearing of their own, each with the reason recorded
in its `notes`: the cave mouth at 93 deg (due east along the waterline, the one
line a swimmer can enter it on being that line), the totem at 337 deg (face
to the water, standing behind the platform), the bone chime at 317 deg (frame
broadside across the bank walk, so the empty drum ring is read against the
water) and the bank lantern at 334 deg (hood to the bank, light thrown over the
water rather than up the cairn steps). The dead trees and the three cairns carry
no bearing, because none of them has a front. The two detour poles are round
in plan and are repeated by the compiler along `route.wamasu-pond-adult.detour`,
whose own bearing runs 166 deg at the landing and 184 deg at the lane head, so
the line follows the lane without any authored facing.

## Asset picks (measured, `sizeM` x/y/height in metres)

| Role | Asset | sizeM | Why |
|---|---|---|---|
| Hunter's stand footing | `vanilla:clutter/stockade/stockadescaffoldbase3sided01` | 3.70 x 3.84 x 2.73 | 3 railed faces, open toward the water; measured ground hull 9.04 m², 12 vertices |
| Stand deck | `vanilla:clutter/stockade/stockadescaffoldtop3sided01` | 3.54 x 3.77 x 0.96 | matching side count, per the kit's own snap rule |
| Stand access | `vanilla:clutter/stockade/stockadescaffoldramp01` | 3.52 x 3.87 x 3.27 | landward side |
| Stand prop | `vanilla:clutter/stockade/stockadescaffoldbasesupport01` | 1.92 x 2.95 x 2.72 | under the deck overhang |
| Offering platform | `mudmother:gv_meshes/argoniannest/argonianplatform` | 2.79 x 2.68 x 0.34 | a low authored Argonian deck at the waterline; measured ground hull 7.27 m², 16 vertices, pivot at the landward end |
| Totem | `mudmother:gv_meshes/argoniannest/argoniantotem01` | 0.75 x 0.49 x 1.95 | |
| Bone chime | `mudmother:gv_meshes/argoniannest/argonianbonechime01` | 2.18 x 0.38 x 1.41 | the "drum frame with no drum in it" |
| Cairns (3) | `rockcairn01` / `03` / `04` (`histtree:` set) | 2.49 x 2.51 x 2.65 · 1.75 x 2.60 x 2.56 · 1.39 x 1.88 x 2.56 | stepped up the bank, largest lowest |
| Lantern | `mudmother:gv_meshes/argoniannest/argonianlanterns02` | 0.66 x 0.64 x 2.71 | the one maintained light |
| Detour poles | `htbm:.../kothringi/tamu_woodpole01` | 0.23 x 0.22 x 1.92 | repeated every 12 m along the detour route `route.wamasu-pond-adult.detour` |
| Dead trees (3) | `bmv:landscape/trees/cypress1`, `cypress3`, `treewillow03a` | 20.2 x 22.7 x 32.0 · 24.8 x 22.2 x 26.5 · 11.6 x 10.2 x 17.2 | the tallest species in the local scatter, stripped by the material pass |

The stand is the vanilla stockade-scaffold snap chain and only that chain,
which is the one family in `works-v1` its author gave snap logic: footing,
matching deck, ramp, support. No set is blended across districts.

**Ground fit.** The stand is `plinth`: terrain delta across its 3.70 x 3.84 m
footprint at 2.8 deg is roughly 0.19 m, inside the 0.15–0.6 m band. The
offering platform is `direct` at 0.8 deg. No parcel here needs grading and
none approaches the 2.0 m never-grade line.

**Budget** (declared; the compiler agrees): 420 instances, 14 unique
materials, 24 MB textures, 120 colliders. The compile reports 3 placements,
1250 triangles, 0 errors. This is a small place and its budget should stay
small — the cost here is the creature and the water volume, not the props.

## What Phases 13 and 9 must deliver

- **The animal (Phase 13).** The adult wamasu is the armoured daedroth build
  on the vanilla werewolfbeast rig — the same decision 0030 took for the Xal-Krona
  boss (`docs/research/creature-asset-availability.md`). The rig exists in the
  vault; **there is no sourcing gap**. Mihail's dedicated Wamasu mod stays
  deferred, needing a skeleton conversion spike and a replacement for audio
  credited to CDPR. One resident actor, single, triggered on approach.
- **The water (Phase 9).** The pond's electrification is a water-volume hazard,
  not a mesh and not a particle prop: a damage volume bound to the pond body,
  live while the animal is alive and dead when the place is cleared. It is the
  reason the fight is interesting and the reason the pond floor cache is gated.
  The blueprint records the requirement in `assetConstraints`; it fakes nothing.
- **The delve (Phase 12).** Flooded-cave interior, S1, wet fraction 0.4, one
  entrance at `landmark.wamasu-pond-adult.cave-mouth`, no exterior shell.

## Lore grounding

- **Lore:Wamasu** — a large lightning-powered reptile whose bones stay charged
  for years and which electrifies the water around it; hide and organs are
  traded across Tamriel. Both the fight hazard and the free reward on the bank
  come straight from this.
- **Lore:Haynekhtnamet** — the legendary Shadowfen wamasu to whom locals made
  offerings, hoping to hold back the seasonal flooding. That precedent, not
  invention, is what licenses an offering bank facing the water rather than a
  hunting camp.
- `world/sources/lore/topics/fauna-hazards.md` (the fauna dossier, which
  records both of the above and flags water electrification as a first-class
  hazard for our swimming).

## Catalogue record should change (not edited from here)

1. **`positionM` → [2466.0, 4403.0]** (`position.u` 0.334441, `position.v`
   0.597138). A 69 m move onto real standing water. `plotFacts` follow:
   `regionClass` becomes "lake & standing water" (already in the record's
   permitted `sitingPrefs.regionClasses`), `distanceToRouteM` 278,
   `distanceToWaterM` 0, `landform` reads as a pan rather than shallow marsh.
2. **Add a `terrainRequests` entry**: `{kind: "pool", radiusM: 30, note: "the
   pan must hold 2.5 m of standing water over a floor to which a diver can descend,
   or an adult wamasu has nothing to hold and the pond-floor cache has nowhere
   to lie"}`. The found depth is 0.30 m; the meso compiler carves the basin
   and the blueprint is authored against the deepened result.
3. Optionally note in `vibe.approach` that the pole line is followed *on the
   water*, since the compiled detour is a poling lane and not a footpath.

## Open questions for the owner

1. **How deep should the pond be?** Deepening to 2.5 m makes it a swimmable
   fight with a dive to the cache and a proper flooded cave. Leaving it
   at knee depth makes it a wading fight in which the animal's whole
   body stays visible and retreat is open. Deep is more frightening and more Morrowind-ish;
   shallow is the clearer, fairer duel. The blueprint currently assumes deep.
2. **Should the pond be lethal or merely dangerous while the animal lives?**
   The lore says the water is cursed "to deadly convulsions", which argues
   for water that will kill an under-levelled player outright and turn the fight
   into a bank fight with a swim as the risk. The gentler reading is heavy
   damage over time, so a strong swimmer can still take the cache mid-fight.
   This sets how every one of the 38 beast lairs handles environmental danger.
3. **How much does killing it change the world?** The record says clearing it
   reopens the direct poling line and ends the offerings. That can be a quiet
   variant (the lantern goes out, the poles are left) or a loud one (the detour
   is abandoned on the map and travel times drop for the whole zone). The loud
   version is better payoff and more work for the route compiler.
4. **Whose side is the place on?** As drafted, the offering-makers are right:
   the bank is tended and the hunter who built the stand failed. The record
   also allows the reverse reading, in which the offerings are a superstition
   and the stand is simply old. The first offers a moral choice
   in LN05; the second keeps the lair as a clean hunt.
