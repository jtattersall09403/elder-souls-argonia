# The Standing Charge — meso design record

`place.naga-kur-deeps.wamasu-pond-adult` · beast lair · wamasu pond, adult · danger D5 · region naga-kur-deeps · Phase 11 Part 7, Round A (v2 schema).

Blueprint: `place.naga-kur-deeps.wamasu-pond-adult.json` · dossier: `world/sources/sites/dossiers/standing-charge.{json,md}` · map: `tooling/world-generation/output/blueprint-maps/place.naga-kur-deeps.wamasu-pond-adult.png`.

This is the exemplar for the province's largest place family (38 beast lairs) and for fixed high danger in the deepest region class. It is a creature-owned outdoor place: no dwellings, no doors, two structures in total. The section "Lair rules" at the end is the part that the other 37 lairs inherit.

## The plotted neighbourhood

Dossier centre 2404.5, 4433.4 m (uv 0.3261, 0.60126): elevation 10.15 m, slope 3.4 deg, rootland deep marsh, danger band 5, canopy closure 0.82, 8039 compiled plants at 160/ha (cypress1 42 %, cypress3 6 %), nearest road 332 m east. The plotted point carries no standing water: it sits 3.0 m above the water table with a shore 33 m away. A wamasu pond has to be sited on real water, so the Part 6 pass moved it 69 m to the pan.

## Candidate sitings

| | `candidate.wamasu-pond-adult.pan` (chosen) | `candidate.wamasu-pond-adult.plot` | `candidate.wamasu-pond-adult.lane-head` |
|---|---|---|---|
| positionM | 2466.0, 4403.0 | 2404.5, 4433.4 | 2602.0, 4652.0 |
| standing water | yes, isolated | none | yes, but sea-connected |
| water area | 962 m² | — | flood-fills to the ocean |
| depth (measured) | 0.30 m max | 0.00 m | 1.60 m |
| water level | 9.24 m | 7.15 m table, 3.0 m below ground | 0.00 m |
| bank slope | p50 1.2 deg, p90 3.6 deg | 3.4 deg | 0.3 deg |
| flood band | 0 | 2 | 3 |
| canopy closure | 0.63 | 0.82 | 0.91 |

**`candidate.wamasu-pond-adult.pan` wins.** It is the sole closed body of standing water within 300 m of the plot; the other water within 600 m flood-fills to the ocean, which makes it tidal creek rather than a held pond. The record's premise is still, avoided water that one animal can own, so the isolated pan is the site. Its rim slopes of 1–4 deg give level bank without grading; its canopy closure of 0.63 against 0.82–0.95 around it leaves a hole in the canopy against which the dead trees are read.

**The pond is too shallow as found (0.30 m).** That is a terrain request, not a reason to re-site: see "catalogue record should change" below.

## What the ground says (the Round A correction)

The Part 6 draft drew a "poling detour" from the pond's east shore to the head of the place's compiled lane. The survey's water raster shows that corridor to be dry ground for its whole 130 m: the pan sits perched at 9.24 m with no water link to anything. The nearest water that a boat can use is a creek 150 m to the south-east and 8–10 m below, running north from the estuary into a dead end at 2560, 4556 m, one to two boat-widths across under a canopy of 0.93. The v2 blueprint follows that ground:

- the pole-marked lane is `canal.wamasu-pond-adult.pole-lane`, a `channel` routed over the creek (192 m, 100 % over published water), ending at a piled landing `dock.wamasu-pond-adult.lane-landing` at the creek head;
- `route.wamasu-pond-adult.bank-path` (footpath, 1.5 m) climbs from the landing to the offering platform: 182 m, 8 m of climb, two bends;
- `route.wamasu-pond-adult.stand-path` (footpath, 1.0 m) runs from the offering shelf round the south and west banks, past the cave mouth, up the west slope to the foot of the stand's ramp: 101 m;
- the offering shelf's landward edge is `fence.wamasu-pond-adult.offering-line` (14 m of `argonianfence01`), so the offering ground has an edge from inside as well as outside.

The catalogue's `vibe.approach` ("the pole line marks what is out there long before it becomes visible") survives intact; what changed is where the water is.

## The design

Three districts, two parcels, fifteen landmarks, one dock, four ways, no doors.

**`district.wamasu-pond-adult.bank` — the pond** (kit set `argonian-mud`, 70 x 70 m). The pan and its bank ring. On the south shelf, level with the water for 20 m back: the offering platform at the waterline, the totem behind it facing the water, the lantern beside it, the bone chime closing the shelf on the east, the stake line closing it on the south. Three grave-cairns step up the east bank from the shelf to the tree line. Three dead trees stand on the rim: a scaled 40 m cypress on the north rim, a 26.5 m cypress at the north-east waterline, a 17 m willow leaning over the west shallows. The cave mouth opens in the 6-deg west bank at water level.

**`district.wamasu-pond-adult.stand` — the knoll** (kit set `neutral-works`, 36 x 32 m). The rise north-west of the pond at 11.7 m, 22 m back from the water. The hunter's stand footing (`stockadescaffoldbase3sided01`, yaw 146, the open face to the pond) and its ramp (`stockadescaffoldramp01`, landmark, yaw 326, on the landward face). From the deck the whole pan is in view; that is the point of the piece and the reason the evidence socket is up there.

**`district.wamasu-pond-adult.landing` — the pole lane** (kit set `argonian-stilt`). The creek and its landing. Four poles are authored, at the mouth, the two bends and the head, each in sight of the next; the poles between them are a compiler rule along the channel that does not yet exist (recorded in `assetConstraints`, see open questions).

**The fight ground.** `combat.wamasu-pond-adult.pond` (54 x 40 m, open) is the pan and its rim and is also the hard-clear polygon: nothing but the three kept dead trees stands inside it. The wamasu build is a large rigged actor with a body of roughly 5 m; the space gives it room to turn, charge and be circled. `combat.wamasu-pond-adult.bank-shelf` (40 x 22 m, broken) is the deliberate opposite: the cairn steps, the chime and the offerings are bad ground for a charge and good ground for a retreat.

**The cave mouth and the delve.** `landmark.wamasu-pond-adult.cave-mouth` at 2446, 4402 m, the west waterline at 9.24 m, bearing 93 deg into the pan. Entered from the water, as the record's `underwaterAccess: surface-swim` and `entrance: cave-mouth` promise. The interior is a Phase 12 claim, not built here: flooded-cave delve, S1, wet fraction 0.4, one entrance, no exterior shell. No door record, because there is no building.

## Approach and wayfinding

### `approach.wamasu-pond-adult.pole-lane` — by boat, up the creek

A poler on the estuary sees the mouth pole (`landmark.wamasu-pond-adult.pole-mouth`, 1.9 m, rooted into the bed) where the creek leaves the estuary. That is the first-seen object; it is a pole rather than a beacon for a measured reason: the creek runs under a canopy of 0.91–0.95, the pond lies 8–10 m above it behind the slope, so no object at the pond can be seen from water level 190 m away through that cover. The pole line is a breadcrumb cue, which the wayfinding literature rates at roughly 80 % reliability against 35 % for a sightline.

Up the creek the poles lead: mouth to lower bend (60 m), lower bend to upper bend (55 m), upper bend to head (75 m), each pole in sight of the last. Above the upper bend the creek narrows to a boat's width and the canopy closes to 0.93; the head pole says that the water's end is a landing, not a dead end. The dock is the threshold: from here the way is on foot.

The bank path climbs west from the landing. For its first 120 m the pond is hidden by the slope (terrain line of sight from the path's middle at 2535, 4530 to the water: blocked). At the last bend (2512, 4461) the line opens: the sky hole at 0.63 closure shows first, the two dead cypresses stand against it, then the water and the lantern on the south shelf. The chime is within earshot from this bend. The path ends on the offering platform, the first node.

### `approach.wamasu-pond-adult.knoll` — on foot, down the ridge

A walker crossing the rootland from the north-west comes over a ridge at 16 m (2444, 4300) with canopy closure of 0.43–0.55. From there the north dead tree's bare crown, scaled to 40 m, stands 8 m above the live cypress canopy (32 m) in the sky hole; terrain line of sight from the ridge to the crown is open. It is the one object at the pond that reads over the trees, so it is the first-seen object of this approach.

Descending 100 m to the knoll (16 m to 11.7 m) the live trees hide the water. On the knoll top the stand's ramp faces the walker head-on (bearing 326, toward the ridge), so the means of ascent is in frame before the deck is. From the deck (eye at 4.4 m) the terrain line of sight to the pond is open: pan, cairns, platform, lantern and cave mouth are read at once, which is the survey for which the hunter built the stand. The stand path leaves from the ramp's foot, drops the west slope past the dead willow, whose lean points at the cave mouth, then arrives on the offering shelf at the stake line.

### Checklist (research §5)

| # | Check | Answer |
|---|---|---|
| 1 | Every approach designed, each with a route or a direction | Yes: boat from the creek (`fromRouteId` the channel), walk from the north-west (`fromDirection`) |
| 2 | Each approach names one first-seen object, a real id | Yes: `landmark…pole-mouth`, `landmark…dead-tree-n` |
| 3 | First-seen object taller than the vegetation between it and the viewer, measured | Knoll approach yes: 40 m crown against a 32 m cypress canopy, ridge line of sight open. Lane approach no, by design: under a 0.93 canopy the first-seen object is the first cue on the way; the beacon rule is replaced by the breadcrumb rule (lair rule 2) |
| 4 | Sequence of 3–5 beats with an occlusion | Yes, both: seen, lost behind the slope or the trees, re-found at the last bend or from the deck |
| 5 | Last stretch bends at least twice | Yes: bank path 2 bends over 182 m; stand path 3 bends over 101 m; the channel follows the creek's two bends |
| 6 | From the arrival point the centre node is visible, or a landmark marks the bend | Yes: from the last bend of the bank path the pan and lantern are in line of sight; from the ramp foot the deck is the landmark |
| 7 | Threshold spanned, not passed | No gate: the threshold is the dock (water to foot) and the head pole beside it. A lair has no gate to span; recorded, not fixed |
| 8 | One spine, wider than the rest; no duplicated movement | Yes: bank path 1.5 m, stand path 1.0 m, channel 3.5 m on water; each joins different nodes |
| 9 | Landmark hierarchy: one beacon, mid markers, no rival | Yes: dead-tree-n is the beacon (the other two dead trees are shorter, 26.5 and 17 m); the lantern and the head pole are the mid markers |
| 10 | Socketed structures present their door to a way | No doors exist. The evidence socket's stand is reached by its ramp at the stand path's end; the scene socket's platform is the bank path's end |
| 11 | No way ends at a blank wall; dead ends pay | Yes: channel ends at the landing, bank path at the platform, stand path at the ramp; the stand pays with the survey view and the evidence |
| 12 | Every raised level has its ascent visible from below | Yes: the ramp landmark faces the arriving walker and the path ends at its foot |
| 13 | The edge reads from inside as well as outside | Yes: the water line, the stake line on the shelf's landward side, the hard-clear ring |
| 14 | Building count matches population within 25 %, lore source named | Yes: 2 parcels for `buildingsPlanned` 2; population 1 wamasu from the type recipe (lair rule 1) |
| 15 | Approach cue describable in one clause | Yes: "follow the poles up the creek to the landing, then the path uphill"; "walk toward the bare crown" |
| 16 | Any forced detour pays | Yes: the 180 m climb from the landing pays with the sky-hole reveal at its last bend; the west-bank descent pays with the cave mouth found on the way |

## Orientation and footprints

Both parcels are authored as centre, piece, bearing and reason; `footprint` is derived by `worldgen.blueprint_footprints --apply`. Bearings are degrees clockwise from north.

| Parcel | centreM | Piece | yawDeg | Why | Derived footprint |
|---|---|---|---|---|---|
| `parcel.wamasu-pond-adult.hunters-stand` | 2444.0, 4371.0 | `stockadescaffoldbase3sided01` | 146 | Open unrailed face down the 146 deg line to the centre of the pan; railed sides and ramp on the landward flank | 3.70 x 3.84 m, 9.04 m² |
| `parcel.wamasu-pond-adult.offering-platform` | 2472.0, 4426.0 | `argonianplatform` | 345 | Square to the south waterline; the pivot sits at the landward end so the deck reaches 2.7 m toward the shallows | 2.79 x 2.68 m, 7.27 m² |

Ways are authored as `via` and derived by `worldgen.street_router --apply` (terrain routing for the two footpaths and the channel; the fence is straight).

## Asset picks (measured, `sizeM` x/y/height in metres)

| Role | Asset | sizeM | Why |
|---|---|---|---|
| Stand footing | `vanilla:clutter/stockade/stockadescaffoldbase3sided01` | 3.70 x 3.84 x 2.73 | 3 railed faces, open toward the water |
| Stand ramp (landmark) | `vanilla:clutter/stockade/stockadescaffoldramp01` | 3.52 x 3.87 x 3.27 | the chain's own ramp, on the landward face |
| Stand deck, prop | `stockadescaffoldtop3sided01`, `stockadescaffoldbasesupport01` | 3.54 x 3.77 x 0.96 · 1.92 x 2.95 x 2.72 | the rest of the snap chain; compiler rule, not yet authored |
| Offering platform | `mudmother:gv_meshes/argoniannest/argonianplatform` | 2.79 x 2.68 x 0.34 | a low authored Argonian deck; pivot at the landward end |
| Stake line | `mudmother:gv_meshes/argoniannest/argonianfence01` | 1.58 x 0.29 x 1.70 | the mud kit's fence panel, drawn as a `fences[]` way |
| Totem, chime, lantern | `argoniantotem01`, `argonianbonechime01`, `argonianlanterns02` | 0.75 x 0.49 x 1.95 · 2.18 x 0.38 x 1.41 · 0.66 x 0.64 x 2.71 | the mud kit's ritual pieces |
| Cairns (3) | `rockcairn01` / `03` / `04` (`histtree:` set) | 2.49 x 2.51 x 2.65 · 1.75 x 2.60 x 2.56 · 1.39 x 1.88 x 2.56 | stepped up the bank, largest lowest |
| Poles (4) | `htbm:.../kothringi/tamu_woodpole01` | 0.23 x 0.22 x 1.92 | mouth, two bends, head |
| Dead trees (3) | `bmv:landscape/trees/cypress1` (scale 1.25), `cypress3`, `treewillow03a` | 40.0 · 26.5 · 17.2 m tall | the local scatter's own species, stripped by the material pass; the north one scaled so that it stands above the live canopy |

**Ground fit.** The stand is `plinth`: terrain delta across its footprint at 2.8 deg is roughly 0.19 m. The offering platform is `direct` at 0.8 deg. The dock is piled in the creek head at 1 m elevation.

**Budget** (declared; the compiler agrees): 420 instances, 14 unique materials, 24 MB textures, 120 colliders. Compile: 3 placements, 0 errors.

## Lair rules (what the other 37 beast lairs inherit)

1. **Scale is creature count plus structure count.** `scaleGrounding` for a lair reads the type recipe's `slots.population` for the creature count and its named structures for `buildingsPlanned`; `households` and `npcsPlanned` are 0. The `why` says so in words.
2. **Under a closed canopy the first-seen object is the first cue on the way.** Where the approach runs under closure above about 0.85, `firstSeen` is the first pole, cairn or scarred trunk on the route, not a beacon, and the record says why. Where an approach has a clear line from higher ground, one natural piece is scaled (0.2–5, natural pieces only) so that it stands above the measured canopy; that piece is the beacon.
3. **A lair's water is authored from the raster, not the record.** The channel-class way goes where `open_water` is; a boat approach ends at a dock on the nearest published water and a footpath carries the rest.
4. **The lair is the fight.** One `combatSpaces` entry covers the creature's ground with clearance `open` and is also the hard-clear polygon; a second entry of class `broken` is the retreat ground. Both carry a `why` naming the quest and the hostility flip.
5. **Structures are few and each is a Lynch element.** A stand is a survey point (node), an offering platform is the first node, a stake line is an edge, a pole line is a path. No dwelling, no door, `interior.kind` "none".
6. **The threshold is the change of mode**, not a gate: water to foot at a dock, or the last marker before the creature's ground. Checklist item 7 is answered "no gate" with that reason.

## What Phases 13, 9 and 12 must deliver

- **The animal (Phase 13).** The armoured daedroth build on the vanilla werewolfbeast rig, as decision 0030 took for the Xal-Krona boss (`docs/research/creature-asset-availability.md`). No sourcing gap. One resident actor, triggered on approach.
- **The water (Phase 9).** Electrification is a water-volume hazard bound to the pond body, live while the animal lives, dead when the place is cleared.
- **The delve (Phase 12).** Flooded-cave interior, S1, wet fraction 0.4, one entrance at the cave mouth, no exterior shell.

## Lore grounding

- **Lore:Wamasu** — a large lightning-powered reptile whose bones stay charged for years and which electrifies the water around it.
- **Lore:Haynekhtnamet** — the legendary Shadowfen wamasu to whom locals made offerings, hoping to hold back the flooding; the precedent for an offering bank facing the water rather than a hunting camp.
- `world/sources/lore/topics/fauna-hazards.md`.

## Catalogue record should change (not edited from here)

1. `positionM` → [2466.0, 4403.0] is already applied by the Part 6 siting.
2. Add a `terrainRequests` entry: `{kind: "pool", radiusM: 30, note: "the pan must hold 2.5 m of standing water over a floor to which a diver can descend"}`. The found depth is 0.30 m.
3. `vibe.approach` should say that the pole line is followed on the creek below the pond and that the last 180 m are on foot; `relations.reachedVia` should name the creek landing rather than imply water to the pond.
4. The compiled minor waterway `waterway.naga-kur-deeps.wamasu-pond-adult` runs over ground that the water raster shows dry for two thirds of its length; it should be re-derived onto the creek that the channel follows.

## Open questions for the owner

1. **The lane comes from the south-east, not the north.** The round brief assumed a poling approach from the north; the survey has no water north of the pond. The blueprint follows the water. If a northern water approach is wanted, that is a hydrology change, not a blueprint one.
2. **How deep should the pond be?** 2.5 m makes a swimmable fight with a dive to the cache and a real flooded cave; knee depth makes a wading fight with the animal always visible. The blueprint assumes deep.
3. **Lethal or dangerous water while the animal lives?** This sets how every beast lair handles environmental danger.
4. **Pole densification and the stand's snap chain are compiler rules that do not exist yet** (poles at ~15 m along a channel; deck and support placed from the footing). Until they are written the world shows four poles and a footing with a ramp.
5. **The north dead tree is scaled to 40 m** so that a beacon exists on the overland approach. If a 40 m dead cypress reads wrong at eye level, the alternative is to accept that this lair has no beacon and rely on the cue chain alone.

