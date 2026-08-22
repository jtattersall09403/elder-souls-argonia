# Archery ballistics: the model and what calibrates it

Bows in this project are **measured, not balanced**. There is no damage table, no
rarity multiplier and no range falloff curve. A draw stores energy, the bow gives
a share of it to the arrow, the arrow loses speed to drag, and whatever energy
arrives is what hurts.

Implementation: [`src/game/combat/ballistics.ts`](../../src/game/combat/ballistics.ts)
(pure functions, no renderer). Calibration tests: `ballistics.test.ts` — those
tests pin the model to the real-world numbers below, so read them before changing
any of this.

## The chain

```
stored energy   = peak draw force × power stroke × ∫ draw curve
efficiency      = peak efficiency × m / (m + virtual mass)
arrow energy    = stored × efficiency
launch speed    = sqrt(2 × arrow energy / m)
drag            = ½ ρ Cd A v²            (per tick, in flight)
impact damage   = ½ m v² × penetration × DAMAGE_PER_JOULE
```

**Power stroke, not draw length.** The limbs only do work over `draw length −
brace height`. Using the full 0.76 m draw of a warbow instead of its ~0.60 m
power stroke overstates stored energy by about a quarter, and is the usual reason
a naive model comes out 30% too fast.

**The draw curve is where `0.5 × F × L` comes from.** A straight-limb selfbow is
close to linear, and ∫₀¹ x dx = ½ — the familiar formula is the area of a
triangle. A recurve's limbs are pre-loaded at brace, so its curve rises faster
(modelled as x^0.75) and it stores ~14% more at the same peak weight. Adding a
compound bow later is one entry in `DRAW_CURVES`.

**Partial draws need no rule.** Stored energy at draw fraction `f` is `f²` of
full, so a half-drawn warbow gives away three quarters of its energy and lands a
quarter of the damage. The game never has to say "partial draws are weaker".

**Virtual mass is why arrows differ.** The limbs and string have to be
accelerated too, so the arrow receives `m / (m + m_virtual)` of what was stored.
A light arrow leaves faster and arrives with *less*; a heavy one is slower and
hits far harder. This is what chronographs measure, and it is why no archer
shoots the lightest shaft they own.

## Calibration anchors

| Anchor | Source figure | Model |
| --- | --- | --- |
| 150 lbf (667 N) warbow, 96 g shaft | ~53 m/s, ~135 J | 52.8 m/s, 136 J |
| Same shot, best angle, drag included | ~250 m | 250 m |
| Same shot in vacuum | 285 m | model stays below it |
| Best launch angle with drag | below 45° | ~41° |

The warbow's `virtualMassKg` (39.1 g) is *set* by that first anchor: it is the
limb mass that makes a 0.95-efficiency bow deliver 67.5% of 200 J to a 96 g
arrow. Everything else follows.

## Archetypes

Draw weights and arrow masses from the historical bands; cadence is nock + draw +
follow-through, excluding however long the archer chooses to aim.

| Class | Peak draw | Power stroke | Curve | Cycle | Arrow band |
| --- | --- | --- | --- | --- | --- |
| Hunting bow | 289 N (65 lbf) | 0.52 m | recurve | 3.2 s | 40–55 g |
| Longbow | 467 N (105 lbf) | 0.58 m | linear | 4.8 s | 60–80 g |
| War bow | 667 N (150 lbf) | 0.60 m | linear | 6.5 s | 80–100 g |

What that produces, with iron heads, at full draw:

| Bow | Shaft | Mass | Launch | Energy | Best range | Damage, unarmoured |
| --- | --- | --- | --- | --- | --- | --- |
| Hunting | flight | 46 g | 48.9 m/s | 54 J | 206 m | 23 |
| Hunting | war | 97 g | 36.8 m/s | 66 J | 130 m | 28 |
| Longbow | war | 97 g | 44.8 m/s | 98 J | 187 m | 41 |
| War bow | flight | 46 g | 67.0 m/s | 102 J | 341 m | 43 |
| War bow | war | 97 g | 52.8 m/s | 136 J | 250 m | 58 |
| War bow | hunting | 63 g | 61.1 m/s | 117 J | 304 m | 85 |

## Heads and armour

Impact resolves as: obliquity first (a glancing hit sheds `cos θ` of its energy),
then the head against the armour's joule threshold, then what is left becomes
damage.

- **Bodkin** — narrow spike, 1.35× against armour, 0.85× wound. Built for mail.
- **Broadhead** — 0.6× against armour, 1.45× wound. Ruinous to anything not
  wearing metal, wasted on anything that is.
- **Blunt** — 0.15× / 0.5×. For birds and for prisoners.

`headHardness` (from the material) multiplies armour piercing, which is a real
distinction: soft iron bodkins were recorded bending against good mail where
hardened points went through.

An arrow that fails to defeat armour still delivers 12% of its energy as blunt
trauma. A 136 J impact is not harmless because it did not open a hole.

## The one arbitrary constant

`DAMAGE_PER_JOULE = 0.5` is a **unit conversion**, not a balance knob: it maps
joules onto the 100-point health scale the melee sandbox was tuned in. A
full-draw warbow shaft arriving square on an unarmoured target lands ~58, a
little over two sword strokes. Change it only to re-scale the whole health
economy, never to make one bow feel better.

## Player stats

The stat system does not exist yet. `RangedModifiers` in `ballistics.ts` is the
agreed seam: draw speed, draw strength (which *caps* attainable draw), sway,
stamina cost and a final damage multiplier. Building stats later means filling
that object in, not hunting for where a multiplier should have gone.
