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

## Delivered, 2026-09-11

70 GLBs (35 pieces × 2 sexes), `armour.items.json` at `schemaVersion: 2` with
per-sex `assets`, `sha256` and `coversBipedSlots`, and `bodyWeight` published on
every roster build. `armourMounting.ts` was indeed untouched.

Two things the plan above did not anticipate, both found by building it:

- **Coverage is per sex, not per piece.** The male steel cuirass takes the
  forearms (biped slot 38) and the female one does not. Publishing one figure
  for both would hide a body mesh nothing replaces, so `coversBipedSlots` is a
  map and `armourCoverage(piece, sex)` reads it.
- **Only one of the nine cuirasses can be gated by comparison with a body's
  neck ring.** Iron, studded and ebony embed the neck-bearing body part and copy
  its loop bit-for-bit, which the build now proves to 0.000002 units. The other
  six close the neck with their own raised opening, and a neck *tapers*: such a
  ring is legitimately wider and higher than the body's neck ring, so comparing
  the two condemns the whole set. The first gate written here did exactly that
  and refused eight correct pieces.

So `validate_neck_rings` asserts only what the build cannot make true by
construction, three ways, each the signature of a defect that has shipped:

1. a ring that is a bit-for-bit copy of *a* reference neck must be a copy of the
   **wearer's own** — the male iron cuirass on a female wearer lands on `male_1`
   to 1e-6 and is refused;
2. the two sexes must not produce the **same** ring — one path in both slots;
3. a declared weight pair must **move** — a morph target that measures the same
   at both ends is a piece stuck at maximum weight, which is the original bug.

It is silent about an authored opening, and says so, because no comparison with
a body's neck ring says anything true about one. The verdict for those is a line
of sight against a real wearer's skin, head included, measured on the shipped
GLBs by `scripts/measure-neck-seam.py` — which now reads each wearer's
`bodyWeight` out of the roster and blends the piece to it before measuring
anything, because there is no longer any such thing as "the cuirass".

The gate was watched going red before it was trusted: `armour.json`'s female
iron cuirass was pointed at the male mesh and the build rebuilt, which is the
exact defect that shipped. It refused, naming `male_1`. `pipeline/test_build_armour.py`
holds that case and five others with the measured numbers.

### Measured on the shipped GLBs

Three builds per sex, each blended to its own `bodyWeight`, verdict by ray cast
outwards from every rim vertex:

| | male | female |
| --- | --- | --- |
| iron | CLOSED, rim **on** the neck, 0.00 mm | CLOSED, rim **on** the neck, 0.00 mm |
| studded | no ring encircles the neck | CLOSED, rim **on** the neck, 0.00 mm |
| ebony | OPEN −10.7 → −4.5 mm | CLOSED, rim **on** the neck, 0.00 mm |
| steel | OPEN −5.1 / CLOSED +5.5 / OPEN −3.5 mm | OPEN −119.9 / CLOSED +2.3 / CLOSED +3.0 mm |
| glass | CLOSED +3.2 → +12.0 mm | no ring encircles the neck |
| dwarven | no ring encircles the neck | OPEN −6.1 / −4.4 / CLOSED +1.0 mm |
| elven | OPEN −18.2 → −11.6 mm | OPEN −5.7 / −9.9 / −4.3 mm |
| daedric | no ring encircles the neck | no ring encircles the neck |
| orcish | no ring encircles the neck | no ring encircles the neck |

The full table, per build, is `docs/evidence/races/armour-neck-check.measured.json`.
The remaining negatives are all authored-opening cases and are queued in
[`docs/polish-backlog.md`](../polish-backlog.md) with their causes; the evidence
sheet shows no magenta on any of the eighteen cards.
