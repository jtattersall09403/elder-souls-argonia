# Walk the province — 2026-09-09

The owner-facing handoff for the deployed build. One section per thing that
changed, what to judge, and a studio URL to stand at. Written in plain English
on purpose: it is the owner's document, not an engineering record. The evidence
behind each claim is in the decision it cites.

**Live:** `https://jtattersall09403.github.io/elder-souls-argonia/studio/`

Append coordinates to that URL. Walk: `?view=character&x=3.61&z=6.38&t=12:00`.
Overhead: `?view=fly3d&cam=orbit&x=…&z=…`. Season: add `&wet=1` for the flood or
`&wet=-1` for the dry. Storm: `&w=storm`. Coordinates are kilometres; the
province is 7.37 km square.

## 1. Buildings are standing in the world

The thing Phase 11 existed to produce and had never once produced.
**10,441 placed pieces**: 115 buildings, 9,708 bridge/stair/deck pieces along
the roads, 328 walls and fences, 237 items of outdoor dressing, 47 landmarks,
6 docks, across 18 asset kits.

| Place | Pieces | Walk to |
|---|---:|---|
| Lilmoth | 466 | `?view=character&x=3.61&z=6.38&t=12:00` |
| Mazzatun | 101 | `?view=character&x=1.99&z=1.34&t=12:00` |
| Nine-Trunks | 86 | `?view=character&x=4.97&z=3.76&t=12:00` |
| Sap-Tapping camp | 52 | `?view=character&x=3.44&z=4.48&t=12:00` |
| Wamasu pond | 28 | `?view=character&x=2.47&z=4.40&t=12:00` |

**Judge:** do buildings sit *on* the ground rather than floating or sunk; do
they face sensibly; does a settlement read as a place rather than a scatter.
Approach each from a distance first — the reveal is composed deliberately.

## 2. Settlements clear their own vegetation

The owner's ruling, and it was only half-built: the compiler worked out which
trees a settlement clears and nothing downstream read it.

- **783 plants stood inside building footprints. Now zero.**
- The edge is graded, not a cut-out disc: at the wall 21 % of wild growth
  survives, then 42 %, 65 %, 83 %, full wild by 15 m out.
- Kept planting is protected — the Hist, shade trees, worked reed beds.
- Grass respects it too, which it never did.

**Judge:** walk the edge of any settlement above. A believable fringe, not a
shaved circle, and nothing growing through a floor.

## 3. Vegetation density and variety

The delivered ladder is green for the first time — it is the only check that
measures what actually ships (decision 0048).

- **Tropical jungle is now genuinely the densest canopy** (39 stems/ha). It had
  been 7th of 14.
- Mangrove deliberately out-stems it (59/ha) — a thicket, not a roof.
- The open counterpoint reads open: floodplain 5.4/ha, mountains 5.9/ha.
- **~51 % fewer trees province-wide.** The jungle itself did not move; the
  owner's approved level was held and everything else re-based around it.

| Region | Stand at |
|---|---|
| Tropical jungle | `?view=character&x=4.02&z=4.61&t=12:00` |
| Mangrove forest | `?view=character&x=5.17&z=4.45&t=12:00` |
| Seasonal floodplain (open) | `?view=character&x=3.01&z=2.45&t=12:00` |
| Rootland deep marsh | `?view=character&x=2.84&z=3.02&t=12:00` |
| Border mountains (sparse) | `?view=character&x=0.93&z=0.92&t=12:00` |

**Variety:** every region carries at least two understory species none of its
*measured* neighbours has, so crossing a boundary shows you something new.

## 4. Trees with solid leaves

Leaf cards were fitted as solid wood, because the test was a hand-maintained
list of texture names. A mangrove's collider was 4.4× its real trunk girth.

- Mangrove now 1.27× measured girth; worst jungle tree 10.93 m → **2.08 m**.
- Bamboo, banana and tropical plants are walk-through; they were solid
  silhouettes.
- One 10.6 m aspen that was wrongly non-solid is now solid.

**Judge:** walk into things in the jungle and the mangrove. Brush past foliage,
be stopped by trunks.

## 5. Room for settlements in the plot

The owner's report that the province looked too clustered was correct, and
measurable.

| | before | now |
|---|---:|---:|
| Closest 5 % of places | 35 m | **70 m** |
| Typical spacing | 85 m | **133 m** |
| Pairs closer than 100 m | 294 | **91** |
| Places overlapping a neighbour's ground | 453 | **0** |
| Evenness (1.0 = random scatter) | 0.835 | **1.124** |

Six of eight regions are now evener than random, and the three *settled* regions
stay the clumpiest — villages cluster round a parent, the wilds spread out.
Every place carries a typed footprint measured from its **built ground**, and
two places must clear the sum of their radii.

**Judge:** the 2D map, `?view=map`, region by region.

## 6. Water

Six independent systems were deciding "is there water here" from a map layer
painted ~22 m past the real shoreline. All six now measure depth, through one
reader that will not answer without being told which season (decision 0049).

- Roads were carved **under the waterline in 10,641 places**. Now zero.
- **876 of 3,071 boat-lane stretches** were too shallow for a canoe. Dredged,
  down to 9.
- The Soulrest–Lilmoth shipping lane ran **576 m over a headland** the map
  called "tidal" and the depth puts 5.3 m above the sea. Re-routed.
- Two mechanisms were **flattening rivers to ankle depth under bridges**.
  Deleted on the owner's ruling; 57 real crossings are now visible.

| Site | Stand at |
|---|---|
| Marsh season (then `&wet=1`, `&wet=-1`) | `?view=character&x=1.50&z=5.28&t=09:00` |
| Lowland river | `?view=character&x=1.85&z=4.89&t=12:00` |
| Gorge waterfall | `?view=character&x=2.53&z=0.32&t=12:00` |
| Sea, calm then `&w=storm` | `?view=fly3d&cam=orbit&x=6.16&z=5.07&t=12:00` |
| Beach | `?view=character&x=6.12&z=1.638&t=12:00` |

## 7. Roads on natural ground — the owner's trial

**This build has no road shaping at all.** Roads take the ground as it lies,
with built pieces wherever it is too steep. Zero terrain moved, against
1,581,230 height samples normally — 9.7 % of the province, up to 28.3 m.

For contrast, what shaping buys when it is on: over-limit road falls from
14,854 m (8.9 % of the network) to 4,360 m (2.6 %), and steps steeper than 30°
from 1,015 to 190.

**Judge:** does a road still read as a road? Is "in poor repair" characterful,
or just broken? Stand on the Blackrose road at
`?view=character&x=2.03&z=6.26&t=12:00`, and at Alten Corimont, the opening
port, `?view=character&x=3.83&z=1.14&t=12:00`.

## Known, named, not hidden

- **Lilmoth's harbour channel is dry** — 0.0 m where it needs 0.6 m, visible
  from the quay. Registered as water-owned.
- **Long spans are a chain of 4.2 m slabs with no piers.** The proper viaduct
  kit (`route-spans-v1`) is packaged and being wired in. Judge placement, not
  the object.
- **57 water crossings need ferries** — the owner has ruled these are ferries,
  talk-and-teleport.
- Two placement checks are red behind a dated `continue-on-error` in
  `.github/workflows/deploy-pages.yml`, which names them and says to delete it
  when they pass.
