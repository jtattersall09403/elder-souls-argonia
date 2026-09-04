# The Licensed Stage — meso design record

`place.hist-heartland.sap-tapping-licensed` · Phase 11 Part 6 · exemplar of the
**smallest** place type (a works camp, M1) and of the **tropical jungle**
vegetation class. Dossier: `world/sources/sites/dossiers/licensed-stage.json`.
Blueprint: `place.hist-heartland.sap-tapping-licensed.json`. Map:
`tooling/world-generation/output/blueprint-maps/place.hist-heartland.sap-tapping-licensed.png`.

## The neighbourhood

The plotted point (3550.6, 4301.8 m) sits 42.4 m up on rock/upland firm ground
in tropical jungle at danger band 4, 717 m from the Helstrom–Blackrose road and
7.9 m above the local water table, with the nearest shore 64 m off and the
nearest channel 192 m to the south-west. Canopy closure is 1.00, the compiled
scatter runs 462 plants/ha over 25 species, and the median open-space radius is
6.7 m — the player sees nothing here until roughly thirty metres.

The record's own cue is decisive: the licence is **hung to be readable from the
water**. The plotted point has no water a boat can use, so the siting moved to
the channel system to its north-west, inside the 250 m envelope.

## Candidates

| | position (m) | slope | above water table | flood | shore | channel depth | canopy | road |
|---|---|---|---|---|---|---|---|---|
| **A — north bank (chosen)** | 3490.6, 4391.8 | 1.12° | 3.09 m | band 0 | 16.3 m | **0.90 m** at 16 m, bearing 330 | 0.92 | 615 m |
| C — east shelf | 3580.6, 4361.8 | 2.75° | 3.98 m | band 0 | 10.3 m | 0.40 m at 10 m | 0.99 | 712 m |
| D — west flat | 3460.6, 4376.8 | 0.90° | 0.32 m | band 0 | 10.3 m | 0.40 m at 14 m | 0.77 | 601 m |

**A won.** It is the only one of the three whose water will carry a loaded
canoe: 0.9 m at the bank and 1.4 m at the landing point, against 0.4 m — a
wading margin — at both rivals. A licence read from the water needs a boat to
read it from. A is 3.1 m above the water table in flood band 0, so the season's
graded stock never stands in wet-season water; its height delta is 3.9 m across
a 20 m box but only 1.6 m across the eighteen metres the pieces occupy, and the
compiler measures every parcel individually. Canopy closure 0.92 keeps the camp
hidden from the land side, and the terrace is bounded by channel to the
north-west, reed margin to the west and unbroken jungle east and north, which
leaves exactly one walkable approach — the track from the south-east, as the
catalogue's cue requires.

C was rejected on water depth alone, despite being the most concealed and the
closest to the plot (67 m). D was rejected because 0.32 m above the water table
puts the stock in the wet season's way, and because at canopy 0.77 on an open
bank the camp is legible from both directions rather than from one track.

## The design

**The Hist is the site.** `htbm:…/trees/histtree` stands at (3496.6, 4390.0):
measured bounds 64.0 × 45.3 m across the crown, 53.6 m tall, 17 073 triangles —
the largest Hist mesh in the vault, and the only one that reads as the "great
tree" the type recipe describes. `histroots03` (9.56 × 2.54 m, 4.71 m high),
from the same author's set, lays the root flare between the trunk and the stage.

**The stage** stands on the trunk's channel face at (3489.8, 4383.0), 9.8 m off
the trunk centre and 8.2 m from the shore, so the licence nailed to its rail is
square to the water. It is the stockade-scaffold family used in the vanilla
logic the works-v1 kit config records: `stockadescaffoldbase3sided01`
(3.70 × 3.85 m, deck at 2.73 m) under `stockadescaffoldtop3sided01`
(3.54 × 3.74 m) at a matched three-sided count, with the fourth face open to
the trunk where the tap lines run, and `stockadescaffoldstairs01`
(3.59 × 3.46 m, 3.45 m rise) climbing from the landward side. Measured Δ across
the stage footprint is 1.65 m, which is a graded pad on the slope ladder.

**The rest is three objects.** `horsetrough01` (1.84 × 0.69 m) and a picket
make the mule line at (3492.0, 4390.0); `handcart01` (1.33 × 2.21 m) is the
season's graded stock, standing where it can go either to the track or to the
water; and one dwelling — `argoniantent01` (8.20 × 7.00 m, 5.96 m high) at
(3504.0, 4394.0), behind the trunk on the flattest pad in the camp (Δ 0.43 m,
a plinth) with its one door facing west into the yard.

**The water.** `argonianbridge` (12.24 × 3.37 m) runs from the bank over the
reed margin onto the landing at (3480.0, 4376.0), where the water measures
1.4 m and a canoe lies. It is piled to the bed, not to the surface.

**The track** enters from the south-east at 1.2 m wide and dies at the foot of
the stairs. There is no second path.

**Clearance is minimal.** Hard clearing covers three small boxes — the stage pad,
the tent pad and the mule line, about 190 m² in total. A single thinned polygon
of roughly 0.06 ha covers the rest of the camp; everything outside it stays at
the region's own density. The Hist, the reed margin and two shade trees are
listed as kept. In the densest vegetation class in the province, this exemplar
deliberately clears the least ground that the pieces themselves need.

**MR04** ("Sap for Sale") anchors on four sockets: `socket.sap-tapping-licensed.licence` (evidence — the
countersigned licence on the stage rail), `socket.sap-tapping-licensed.tapper` (npc), `socket.sap-tapping-licensed.graded-stock`
(container, the cart) and `socket.sap-tapping-licensed.night-landing` (scene, at the water's edge, where
a landing can be watched from cover). The catalogue's socket lists are empty, so
the blueprint's `provision` block carries the need until the quest agents fill
them.

**One variant**, `variant.sap-tapping-licensed.licence-revoked`, matches the catalogue's hostility flip on
`flag.hist-heartland.sap-licence-revoked`: the stage and the stock change, the
landing goes unwatched.

## Lore

- `world/sources/lore/topics/hist-and-sap.md` — a Hist's sap is its soul; sap is
  a controlled substance whose legitimate, criminal and atrocious uses are all
  canon; smuggling it is the province's most lore-appropriate crime
  (Lore:Hist Sap).
- `world/sources/lore/topics/hist-placement.md` §75 — a tribal Hist has a
  **tree-minder**; tapping is licensed against the tree, not against the crew.
  Enslaved/tapped trees (Haj Uxith, the Blackwood Company's Leyawiin tree) are
  the counter-example this place is defined against, which is why it is kept
  correct.
- Type recipe `world/sources/catalogue/type-recipes.json#sap-tapping-camp` —
  population 2–5, elevated member on the stage, a mule line, a covert extraction
  route, and a track worn from one direction only.

## Open questions for the owner

1. **How big should the tree be?** The chosen Hist is 64 m across and 53.6 m
   tall — a landmark visible above the canopy, which makes the camp findable
   from a long way off and slightly undercuts its "unseen until thirty metres"
   concealment. The alternative in the vault is 27 m across and 22 m tall, which
   keeps the camp genuinely hidden but reads as a large tree rather than as a
   Hist. Which matters more here: the tree as a landmark, or the camp as a
   discovery?
2. **Tent or hut for the one dwelling?** The camp uses a woven Argonian tent,
   which reads as seasonal — correct for a licence that runs one season. The
   same kit holds a round mud hut (5.93 × 6.47 m), which reads as permanent and
   would say that this crew comes back every year. The tent is the lighter, more
   honest read; the hut gives the place more weight.
3. **Should the licence be readable, or only findable?** As drafted, a player
   passing in a boat can see that something official is nailed up but must land
   and climb the stage to read the counter-signature. The alternative is to make
   the whole thing legible from the water, which hands the player the quest hook
   without a landing. The first rewards curiosity; the second guarantees nobody
   misses MR04.
4. **How much jungle should come down?** This is the first performance data
   point for a settlement inside closed canopy, and the draft clears about
   190 m² hard plus a small thinned ring. Clearing more would raise the frame
   rate and make the camp read as a proper clearing; clearing less keeps the
   claustrophobia that is the whole character of this region. The Round C walk
   will give a frame-rate number against this draft — is the current, very
   tight, clearance the right starting point?

## Catalogue record should change (not edited from here)

- `sitingPrefs.nearPoint` is (4269, 4176) with `maxM: 400`, but the plotted
  position is 729 m from it and this siting is 807 m. The preference is stale
  and should be moved to the channel system it actually sits on, or dropped.
- `plotFacts.distanceToWaterM` (61.3 m) and `positionM` should be refreshed to
  the chosen siting: (3490.6, 4391.8), 16.3 m to shore.
- `assetPlan` lists `passerelles-walkway` and `settlement-root`. Neither can
  serve this place: the smallest dwelling in `settlement-root-v1` measures
  24.6 × 24.6 m and 55.6 m tall, and its walkway system is a canopy-city
  vocabulary that a three-person camp has no use for. The delivered plan is
  `works-v1` (stage, mule line, stock), `settlement-mud-v1` (tent, plank walk,
  dressing) and the HTBM Hist as the landmark; the record's `assetPlan` should
  be corrected to match.
- `sockets` is empty while `questHooks.provisions` names
  `quest.provision.mr04-anchor`. The four sockets above should be written back
  once the quest agents have finished with the file.
