# Building-to-ground seam

The owner (16k walk 9): the join between buildings and the ground is stark.
A wall drawn straight onto a uniformly lit, uniformly textured terrain reads
as pasted on: no contact shadow, no wear, a hard bright edge.

## How games hide it

| Technique | What it does | Cost | Ours |
|---|---|---|---|
| Landscape paint round the footprint | the terrain texture changes to trampled earth, mud or gravel round a building (Skyrim's landscape texture painting round every farm and hut; Morrowind's dirt patches) | zero at runtime: it is the terrain's own texture | YES, the `seam-ring` paint entry |
| Contact darkening (an AO blob or decal) | a soft dark band on the ground at the base, the ambient occlusion a wall throws on the ground beside it | zero if baked; a decal costs one blended draw | YES, the `shade` paint entry, baked into the place's one paint surface |
| Skirting and foundation pieces | the mesh itself carries a plinth, rubble or a sill that dips below the ground line, so the cut is hidden | none: authored geometry | already ours: the kits' designed sink (`designedSinkM`) and the pad's retaining walls (decision 0101) |
| Grass clearance | ground cover stops short of the wall instead of growing through it | none | already ours (decision 0101 pads, `grow_clearance`); the ring is also bare ground |
| Screen-space contact shadows / SSAO | the renderer darkens creases | 1.5 ms desktop; no on the phone ([cheap-sky-and-post-effects](cheap-sky-and-post-effects-for-target-devices.md) row on contact shadows) | NO: the baked shade gives the same band for nothing |

## What we built (16k walk 9)

- `export_settlement_bundle.seam_paint` adds, at publish, two `groundPaint`
  entries to every building (a placement whose id ends `.building` with a
  footprint of 4 m² or more): a `seam-ring` of `track_mud` 1.5 m past the
  walls (or past the pad, so a retaining wall's foot is worn too), alpha 0.6
  feathered over 1.2 m; and a `shade` entry 1.0 m past the walls, strength
  0.7 at the wall falling as t² (the falloff of occlusion in a corner). Both
  leave the floor unpainted (`holeM`, the footprint inset 0.4 m) and are cut
  off wet ground; a stilt building gets the shade only, with no hole (its
  deck shades the ground under it). No author work: publishing a place
  writes them.
- The shade rides its own channel of the place's ONE paint surface
  (`groundPaint.ts` `PaintSurface.shade`, a vertex attribute); the paint
  material folds it into the same over-blend as a multiply
  (`groundPaintMaterial.ts`). No texture, no extra draw. Download: about
  2 to 4 KB gzip per place (Claywater +2.0, Greenspring +3.7, Riverwalk
  +0.9 KB).
- Look at it without the studio: `npm run look -- seam <placeId>
  <placement-id-suffix> [--bearing DEG]` (about 5 s, one frame each with
  and without the paint).
