# Which way round does a piece go? Deriving a "front"

Owner ruling 2026-09-07. Written for the agent who has to plant a gate arch, a
wall stub, a tower, a deck or a shrine and finds nothing in the data telling it
which way the piece faces.

## The definition (owner steer 2026-09-07)

**A piece's front is the side its authors repeatedly left OPEN**: free of other
statics, with somewhere to walk. Its back is the side they set against terrain,
water or another mesh. That is a property of the PIECE, read off how its own
author planted it — which is why it generalises. "Faces the road" or "faces away
from the settlement centre" only means anything in a settlement; a lair, a
shrine, a ruined arch, a camp, a dungeon mouth and a dock all have a side you
come at them from, and that is the same side the author left clear.

An enclosure edge — a gate, a wall, a tower — is a special case of the same
thing: what the piece is set against is the thing it encloses, so its open side
is the OUTSIDE, and "outside" means away from whatever the boundary polygon
encloses (any boundary, not a settlement centre).

## The short answer

**Skyrim ships no "front" metadata, and neither does any of our source
material.** A static's NIF carries a local axis and a pivot, nothing more. The
Creation Kit's render window shows a rotation about Z and leaves the meaning of
that rotation entirely to the author. There is no `frontDeg`, no "outside" flag,
no marker node that says "the road comes in here".

What authors actually rely on is two things, and both of them are recoverable:

1. **The Gamebryo/NetImmerse axis convention.** The engine's local frame is
   Z-up, right-handed; by Bethesda's own asset convention the intended front of
   a static (a door, a shopfront, a wall face) is modelled looking down one
   horizontal axis, and the piece is exported with the root node's transform
   applied so that axis means something. It is a convention, not a contract:
   pools from different authors break it constantly, and a piece whose root
   transform was never applied comes in rotated arbitrarily
   ([NifSkope/CK guidance][ck]). We therefore never trust the raw axis alone.
2. **How the author placed the piece themselves.** This is the reliable
   signal, and it is the one we already have mined: every exterior placement in
   the source plugins is a piece at a position with a rotation, next to other
   pieces. If the same wall piece is planted a hundred times with the
   settlement on one side, that side is the inside — whatever its local axis
   says.

So the derivation is: **read the author's placements, not the author's axis.**

## What we derive, and from what

`tooling/asset-pipeline/pipeline/piece_front.py`, ranked, written into the
interiors index as `front: {deg, evidence, outside, why}` for any piece with no
`entrance` (a piece with a door needs no front — the door is the front).

### (a) co-placement — how the authors planted it

Source: `world/sources/placement/kit-assemblies-mined.json`, the mined
co-placement record of the source plugins' own worldspaces (vanilla Tamriel,
BM&V Black Marsh and Valenwood, HTBM). Its `groups` give a piece and everything
the authors repeatedly stood around it, as offsets and yaws in a known frame;
its `templates` give the same for repeated pairs.

For each placement we take the bearing from the piece to the centroid of the
statics stood around it, expressed in the **piece's own frame** (rotating out
the part's own yaw). Those are the blocked sides. The modal bearing plus 180° is
the side left open — the front — and on an enclosure edge that open side is also
the outside face: for a wall, the field side; for a gate, the side the road
comes in from.

Thresholds: 45° bins, at least 3 placements behind the answer, and at least 40%
of the evidence in the winning bin. Self-chains — a wall piece next to a copy
of itself — are dropped, because they say how a piece tiles, not which face was
outward.

**Known limit.** The mine stores aggregate co-placements, not per-instance world
coordinates, and it records statics only — no navmesh, no terrain height, no
water plane. So "the open side" is measured against *other meshes* rather than
against free navigable ground. That is the largest part of the signal (a hut
backed into a rock face is nearly always also backed by rubble and trees), but
it is a proxy. If a future mining pass ever stores per-instance positions with
their cell's navmesh and water height, this rank should be re-derived against
real open ground — the interface (`load_coplacements` returning weighted
bearings in the piece's own frame) will not have to change.

### (b) asymmetry — the face the modeller detailed

Crenellation, arch mouldings, door reveals, carved panels and decals all cost
triangles; a back face is usually a flat quad. So we bin the piece's triangles
by the bearing of their centroid from the plan centroid (30° bands) and take
**triangles per square metre of surface** in each band. The densest band is the
show face, and on a defensive piece the show face is the outside.

Density, not raw count, because a long piece would otherwise win on its long
side every time. And on a **slab** piece — anything longer than 1.3:1 in plan —
the search is confined to bands off the long axis, because the busiest triangles
on a ruined wall are its broken END, which is not a face anybody was meant to
look at. That constraint is what makes the Morrowind Imperial wall stubs answer
with a broad face instead of their rubble.

Threshold: at least 24 triangles in the band, and at least 1.35x the median
band's density.

**Known limit.** Asymmetry says which face is *detailed*, and assumes detailed
means outward. That holds for defensive and monumental architecture (the point
of a curtain wall is to be seen from outside) and is weaker for domestic pieces
— which mostly have doors, so they never reach this rank. Where the answer is
wrong it is wrong by 180°, and a reviewer sees it immediately as a gate facing
into the market.

### (c) nothing

A symmetric piece — a plain block, a round platform, a tower with four identical
faces — gets `front: null`, and the validator lets any yaw stand. That is the
right answer, not a gap.

## What the validator does with it

`worldgen.blueprint._front_failures`, for **every** blueprint, not only
settlements. Two contracts:

1. **The approach.** A piece with a derived front must look at the line the
   player arrives on — the nearest way, which is what an `approaches[]` row
   names in its `fromRouteId` — within 60°. **HARD** for an enclosure edge
   (`use` gate, wall or tower); **WARN** for every other piece, because a front
   says how the piece is usually planted and a particular plot may have its own
   reason.
2. **The enclosure.** A gate, a wall or a tower faces away from what the
   blueprint's boundary polygon encloses, within 60°; and a gate's front must be
   the side the way it `spans` comes in from. Always **HARD**: an inside-out
   gate is broken, not a choice.

Pieces with `front: null` are exempt — symmetric, anything goes. `outside: false`
is reserved for a future evidence kind that means "this is the way in" rather
than "this is the outer face"; nothing produces it today, and the rule reads the
flag rather than assuming.

## Sources

- [Skyrim static mesh import/export and root-node transforms (Nexus tutorial)][ck]
- [Bethsoft tutorial: static collections (GECK wiki)](https://geckwiki.com/index.php/Bethsoft_Tutorial_Static_Collections)
- Our own mined evidence: `world/sources/placement/kit-assemblies-mined.json`
  (`worldgen.mine_assemblies`), and the placement surveys in
  `world/sources/placement/`.

[ck]: https://www.nexusmods.com/skyrim/mods/21065
