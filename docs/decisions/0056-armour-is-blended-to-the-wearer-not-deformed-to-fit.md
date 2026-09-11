# 0056 — Armour is blended to the wearer, not deformed to fit

Date: 2026-09-11. **Supersedes [0055](0055-a-collar-overlaps-the-neck-rather-than-meeting-it.md)**,
whose fix was a workaround for this one's root cause and which is open again on
every female build.

## What 0055 got wrong

0055 closed a visible hole between the head and the cuirass collar by finding
each cuirass's neck ring geometrically and snapping it onto the body's
weight-zero neck polyline, lifted by 0.15 of the neck radius. Its stated premise
was that the neck ring is *a range* across builds — because bodies are blended
between `_0` and `_1` by the wearer's `NAM7` weight — while one cuirass is worn
by all of them, so no single flush fit exists.

The premise was right. The conclusion did not follow. **A cuirass is not one
mesh for all wearers.** Skyrim ships `_0`/`_1` weight pairs for armour exactly
as it does for bodies, and the engine averages them by the same actor weight.
It also ships separate male and female meshes. We were loading one mesh — the
male, maximum-weight one — for everybody.

Measured from `Skyrim - Meshes.bsa`: a vanilla cuirass **embeds the
neck-bearing body part inside itself** (`MaleUnderwearBodyArmor` /
`FemaleUnderwearBodyArmor`), and its neck loop is a bit-for-bit copy of the
matching body's.

| pair | max per-vertex difference over the 26-vertex neck loop |
| --- | --- |
| `iron/male/cuirassheavy_0` vs `malebody_0` | 0.000000000 |
| `iron/male/cuirassheavy_1` vs `malebody_1` | 0.000000000 |
| `iron/f/cuirassheavy_0` vs `femalebody_0` | 0.000000000 |
| `iron/f/cuirassheavy_1` vs `femalebody_1` | 0.000000000 |

So the seam is **exact by construction** once the piece is blended to the
wearer's weight and taken from the wearer's sex. There is nothing to snap and
nothing to tolerate.

What 0055 actually moved was not a collar. Diffing the iron cuirass before and
after, the ring it pinched was `MaleUnderwearBodyArmor` — Bethesda's neck skin —
pulled from r=0.5615 (exactly `malebody_1`'s neck) to r=0.4648. The metal,
`_Cuirass_1` at r=0.8954, never moved and was never the problem. **We deformed
authored art to compensate for loading the wrong version of it**, which is the
thing the 2026-09-04 owner ruling on assembling only what authors designed to
fit exists to prevent.

## And it is open again

Neck-ring radius on the shipped race GLBs: male builds 0.4831–0.5291, female
builds **0.3448–0.3862**. The snapped collars measure 0.4540–0.4726 — wider
than *every* female neck. Residual hole on a female character: **9.7 mm** at
best (orcish), **18.3 mm** at worst (studded). The bug that started this was
9.6 mm on iron. Only the player is exposed today, because every enemy archetype
is `DEFAULT_SEX`.

0055's gate could not catch it, and said so in its own words: *"girth needs no
separate check — `maxDistanceAfter` says the collar lies on the reference neck
polyline, so at every angle it is exactly the narrowest neck's girth."* True of
the narrowest **male** neck. A gate derived from the same reference as the fix.
Fourth instance of that pattern after 0052 and the two water gates.

## The decision

**One GLB per piece per sex, carrying `_1` geometry with `_0` as a glTF morph
target; the runtime sets `morphTargetInfluences = 1 − weight`.** That is
Skyrim's own model, three.js supports it natively, and it makes the seam
mathematically exact rather than tolerance-bounded.

- `armour.json` declares a per-sex base path **without** the `_0`/`_1` suffix.
  It must be declared, never inferred: Bethesda uses four different naming
  conventions (`iron/male` + `iron/f`; `studded/male` + `studded/female`;
  `elven/m` + `elven/f`; `steel/` root + `steel/f`; and bare suffixes for
  dwarven `...f_1`, orcish `cuirassm_1`/`cuirassf_1`, daedric
  `daedriccuirass_1`/`daedrictorsof_1`).
- `armour.items.json` gains `schemaVersion` (it has none — standard 3) and
  per-item `assets: { male, female }`.
- `races.json` must start exporting `bodyWeight`; the pipeline knows it and
  does not publish it, so the runtime cannot currently know what to blend to.
- `armourMounting.ts` needs **no** change: it already takes an
  already-resolved scene, so mounting is sex-agnostic.

## What `neck_seam.py` keeps

Not the mutation. `NECK_LIFT`, `raise_polyline` and `find_collar_rings`'
snapping path are retired. What survives:

- `mesh_boundary`, `closest_point_on_segments`, `vertex_weights` — genuinely
  shared with `build_character.py`, which still carries duplicate copies
  (0055's own open follow-up).
- A **verification** gate in place of the mutation: assert the armour's neck
  ring is not wider than the reference body's, for **both** sexes, and fail the
  build. That is the durable value, and it is the check that would have caught
  this.

## Six pieces are the wrong mesh entirely

Found while measuring, and shipped today: `armour.json` configures the
**female** meshes for orcish cuirass, gauntlets and boots and for daedric torso
and gloves, and the **male Argonian** helmet (`helmetma_1`) for the orcish
human helmet. Confirmed in the shipped GLBs — `orcish-cuirass.glb` contains
`FemaleUnderwearBody01`, `daedric-cuirass.glb` contains `TorsoLowFemale:0`.
`sex_of()` (`build_armour.py:78`) could not notice, because it tests for
`/female/`, which matches only the studded set.

## Elven

0055 called it a "closed-neck design" with no boundary encircling the neck.
That conclusion holds but its stated reason was wrong. `elven/m/cuirass_1` does
have a 12-vertex on-axis ring at neck height and girth; it was rejected by the
concentricity test because its centre sits **0.845 units (≈121 mm) forward** of
the neck axis. It is the throat opening of a raised gorget, not a neck ring.
Under this decision the question is moot — elven has no embedded skin, so its
own authored opening is the seam, and the authored fit is good.
