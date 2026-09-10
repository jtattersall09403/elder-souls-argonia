# 0055 — A collar overlaps the neck rather than meeting it

**Date:** 2026-09-10
**Status:** accepted
**Scope:** `tooling/asset-pipeline/pipeline/blender/neck_seam.py`, `build_armour.py`

## The problem

The owner reported a white ring at the base of every enemy's neck. It is not a
material: those pixels are the scene's clear colour, seen through a real hole
between the head's neck ring and the cuirass collar. The character build stitches
each head onto its own body's neck, but nothing had ever reconciled a *cuirass*
with that ring. Measured on the shipped GLBs, the gap ran from 9.6 mm (iron) to
71.6 mm (glass).

Enemies showed it and the player did not because enemies wear iron and the player
wears steel, whose high fur collar happens to cover the gap. It was never
enemy-specific logic.

## Why a flush seam is not available

Skyrim morphs a body between its `_0` and `_1` meshes by the wearer's `NAM7`
weight, and each build's head is stitched to *its own* blended body. Measured
across the ten shipped builds the neck ring is therefore a range, not a value:
radius 0.522–0.573 and height 11.166–11.187 source units. One armour GLB is worn
by all of them.

So a collar snapped flush onto any single neck meets that build and misses the
other nine, and a rim that misses by a millimetre shows the backdrop just as well
as one that misses by fifty. Skyrim's own answer is to weight-morph the armour to
the wearer too; our pipeline builds one GLB per piece and does not do that yet.

## The decision

The collar is not butted against the neck, it is **overlapped into** it. The
reference is the **weight-zero** body — the narrowest neck any build can have —
and its polyline is **lifted by 0.15 of the neck radius** before the collar is
snapped onto it.

The rim then ends inside the neck of every build, narrower than the narrowest and
above the highest, with skin in front of it from every viewing angle. There is no
line of sight to the backdrop for any race. Overlap is what Skyrim's own armour
does; a flush seam is only achievable per wearer.

Skin weights are copied across the snapped boundary from the body edge each
vertex landed on. Matching positions alone closes the bind pose only — the neck
blends between Neck and Spine2, so a rim carrying different weights parts again
on the first idle breath.

Measured on the shipped GLBs after the change, against every race's head:

| Cuirass | inside the narrowest neck | above the highest neck ring |
| --- | ---: | ---: |
| iron | 2.81 mm | 5.33 mm |
| steel | 5.14 mm | 18.62 mm |
| studded | 1.66 mm | 11.88 mm |
| daedric | 3.17 mm | 14.46 mm |
| dwarven | 2.47 mm | 5.23 mm |
| ebony | 2.81 mm | 5.33 mm |
| glass | 1.80 mm | 13.19 mm |
| orcish | 4.63 mm | 6.00 mm |

## Finding the collar

A vanilla cuirass has *hundreds* of open boundary components — trim strips,
straps, plates, glow cards. "Near the neck" cannot pick the collar out of that,
and picking wrong drags authored art onto the neck.

A collar is identified by the one thing only a collar does: it encircles the
neck. It must be a real ring, concentric with the neck axis, at the neck's height
and girth, and cover a full turn with no angular gap over 90°. Geometry only, no
names — per the owner's 2026-09-04 ruling. Where a mesh has several concentric
rings, only the innermost is moved; the outer ones are the piece's own layers.

Elven is a **closed-neck design**: no boundary encircles the neck at all, so
there is nothing to stitch. That is recorded with its near-miss measurements
rather than asserted away, and it is the one cuirass still worth a visual check.

## Follow-ups

- Weight-morphing armour between its own `_0`/`_1` NIFs per build would make the
  seam flush instead of overlapped, and would remove the constant above.
- `build_character.py` still carries its own copy of `mesh_boundary`,
  `closest_point_on_segments` and `vertex_weights`. Folding it onto
  `neck_seam.py` is mechanical and was deliberately left out of this change so
  the character roster did not move underneath it.
