# 0040 — Animation packs, and the parallel combat pass

**Date** 2026-08-31 · **Status** delivered, awaiting owner playtest ·
**Supersedes** nothing · **Feeds** Phase 10b, and 10c for the poise numbers

A combat workstream run alongside Phase 10, on the owner's list of sandbox
defects and gaps. Most of it is ordinary work recorded in the code; this file
holds the three decisions that are not obvious from reading it.

## 1. The rig is several GLBs, one per weapon family

**Decision (owner, asked and answered at kickoff):** split the character rig
into downloadable *animation packs* rather than growing the single GLB.

The rig was one 7.7 MB file carrying all 51 clips, so every clip added taxed
every player whether or not they ever held that weapon. Sourcing three missing
movesets would have taken it to ~13.5 MB. The owner's instruction was explicit:
take the long-term solution, and make adding future movesets (spears, and
whatever arrives from mods) cheap.

**Shape.** The pipeline emits one GLB per pack from one build: `core` (whatever
a body can do without knowing what it holds — locomotion, crouch, jump, dodge,
reactions, death), `criticals` (the paired riposte/backstab, shared by every
melee weapon), and one per family. Every pack repeats the skeleton — about a
hundred nodes, negligible — and carries only its own clips, because a glTF
animation channel addresses nodes by index and a pack has to be a valid
document alone. Packs declare what they depend on; `resolveAnimationPacks`
takes the closure. An actor is handed `loadoutAnimationPacks(loadout)` and
loads exactly that.

| Loadout | Downloads |
| --- | --- |
| Sword and shield | 8.5 MB |
| Greatsword | 7.8 MB |
| Warhammer | 8.8 MB |
| Bow | 9.2 MB (see the open item below) |
| Studio character mode (explores, does not fight) | 4.5 MB |

Against 7.7 MB previously for 51 clips, for 90 clips now — and a fourth weapon
family costs a player who does not carry one nothing at all.

**Adding a family** is: clips into `pipeline/config/animations/*.json` with a
`pack`, a pack entry saying who needs it and what it borrows, a
`MovesetDefinition` in `equipment/movesets/`, and the class table pointing at
it. No change to loading, binding, the actor or the combat FSM.

**Two things that bit, recorded so they do not again.**

- A mixer asked for an action it does not have does not error — it leaves the
  previous action playing. The first build shipped without the `requires`
  links, so every one-handed critical silently rendered the sword idle, and the
  only thing that noticed was a blade-to-torso geometry probe three layers
  away. `equipment/animationPacks.test.ts` now proves statically that every
  weapon and shield in the arsenal can play every clip its profile references.
- The build is byte-for-byte deterministic. That is worth knowing: it is what
  let the split be proved non-regressive (a rebuild of the unchanged config
  reproduced the previous rig exactly, and all 51 original clips kept identical
  durations, ground speeds, root-motion deltas, support envelopes and blends).

**Open item.** A bow pulls in the one-handed pack, because its profile borrows
that moveset for the clumsy bash it makes when swung. An archer should not
download a sword's moveset for a fallback swing; the fix is to let a weapon
declare that it has no melee and have combat refuse it, rather than borrowing.
In the polish backlog.

## 2. Poise replaces flinch-on-every-hit, and is switchable while it is judged

Module 76 §121.3 is implemented on DS1's model — hidden pool, class-level poise
damage, instant refill on a timer, one system for the player and every NPC.
`PoiseModifiers` is the seam the stat system fills at 10c; nothing will need
retro-fitting.

This is a real change to how combat answers, and §121.3 says the numbers are
provisional until calibration with a controller in hand. Two consequences were
handled deliberately rather than absorbed:

- **The numbers.** With the constant first chosen, the sandbox's *starting*
  steel kit came to 69 poise against a 20-point sword light — a new character
  shrugging off four consecutive hits, which is a poise build, not a default.
  Recalibrated to about 47: a sword needs three hits, a greatsword two, a
  warhammer one. Still provisional, and the single number most likely to move.
- **The evidence.** Under poise an armoured actor no longer flinches at a
  single light hit, so five scenarios staged to render `HIT` stopped doing so.
  They review *reaction clips*, not poise, so they now declare that they
  isolate the pre-poise rule (`VisualScenario.player.poise`) and keep their
  calibrated staging. Poise has its own scene, `poise-break`: three light
  attacks land, the first two are absorbed without a flinch, the third breaks
  through.

The debug panel has a Poise switch and the HUD a poise bar, so the pool can be
judged against what it replaced in one sitting with everything else identical.

## 3. Contact windows are not currently measurable, and were not guessed

`scripts/measure-contact-windows.mjs` — the tool that decides when a blade is
actually cutting — had been reading a GLB path that stopped existing at the
Phase 7 package extraction, so it has not run since. It is fixed and
pack-aware, and its output no longer agrees with the calibrated one-handed
windows it originally produced.

Rather than retune a calibrated, owner-approved feel on the word of a tool that
has demonstrably drifted, the one-handed windows are untouched and the
two-handed movesets inherit their *shape* — the contact fractions of the
matching one-handed swings, which are Bethesda's own re-authoring of the same
motions. Re-measuring both sets against the production rig is a focused job on
its own, in the polish backlog.

## Owner questions carried into the playtest

1. **Poise feel**, with the numbers above — and whether base poise coming from
   Agility (25 at neutral, before any armour) is the right graft, since it is
   what makes even a naked character shrug light hits.
2. **Two-handed heavy chains are unaffordable**: `heavy` into `heavy2` costs
   about 130 stamina against a 100 bar, so `GREATSWORD_HEAVY_2` and
   `GREATAXE_HEAVY_2` are built and wired but unreachable. Recorded as
   animation exclusions rather than fixed by quietly retuning stamina.

---

# Round 2 (2026-08-31) — the owner's feedback on round 1

Fifteen items. What follows is only the parts that are not obvious from the
code; the rest is in the commits.

## 4. What the animation sources actually contain

Three of the owner's items ("are there more granular categories?", "use all the
parry animations", "backstabs per weapon type") turn on the same audit, so it is
recorded once here.

**Vanilla Skyrim has four melee animation families and no more**: `1hm` (sword,
axe, mace *and* dagger share it — there is no dagger set), `2hm` (greatswords),
`2hw` (battleaxes and warhammers share), plus `h2h` and `dw`. Our
one-handed/greatsword/greataxe split already *is* that split. Going finer is not
a decision we are declining; it is not available.

**Rim Parry is where per-weapon motion exists that vanilla lacks** — nine
block-bash sets and thirteen executions (dagger, axe, mace, greatsword, waraxe,
warhammer, spear, four shield variants, unarmed, dual). So the rule this round
applies is: movesets stay at vanilla granularity, parries and executions go as
granular as the mod allows.

**Backstabs are a genuine gap.** Vanilla ships exactly one back-facing paired
killmove, the 1hm one we already use. Its per-weapon killmoves are *frontal*
finishers and would read as nonsense performed from behind, and the Nexus mods
advertising "backstabs for all weapon types" re-point existing killmoves through
an ESP rather than shipping new animation. Recorded rather than faked.

## 5. Why the two-handed executions are built but not shipped

Both were sourced, built and measured, and then backed out. A
`PairedCriticalProfile` needs a contact time, a withdrawal time and a paired
separation *per clip*; getting those for the one-handed riposte took an
exhaustive hand audit against rendered geometry. `measure-contact-windows.mjs`
gained a `--critical` mode to automate exactly that audit, and it does not
reproduce the hand-audited answer — it finds a closer approach, earlier, at a
moment that audit explicitly rejected as the entry blend. Two candidate causes
are that it sweeps a straight line from the weapon socket rather than the built
sword's own geometry, and that the victim capsule it assumes is not the one the
audit used.

The rule applied: **the tool is trusted exactly as far as it reproduces a known
answer.** For sweep windows it does (LIGHT_1 and LIGHT_2 to within a frame), so
its two-handed numbers were taken. For critical contact it does not, so its
numbers were not taken and the clips were removed from the build rather than
shipped on a guess. Fixing it against the known answer makes the other twelve
executions cheap; that is the polish-backlog item.

## 6. The measuring tool's actual bug

Worth naming because it invalidated a documented conclusion. `updateWorld`
composed node world matrices in glTF file order, which does not guarantee a
parent precedes its child — so a child was multiplied by its parent's matrix
from the *previous* call. `poseAt` was therefore not idempotent, and the
armature's 0.1 import scale landed once too often. It measured a 0.92 m sword as
9 cm long, found nothing ever within reach, and produced windows that disagreed
with the calibrated ones. Round 1 read that disagreement as the tool having
"drifted" and declined to act on it, which was the right call on the evidence
available and the wrong conclusion about the cause.

## 7. Parry catch windows are per family

One pair of constants used to decide when *anything* was parrying, so a dagger
and a tower shield caught over the same 0.10–0.29 s of quite different
animations — most of it, on the one-handed clips, in the dead beat between the
raise and the bash. `ParryProfile.active` now carries a measured start (where
that family's clip has the parrying object sweeping in front of the body) and a
per-family duration, which is the only number here anyone should tune: shield
the most forgiving at 0.26 s, one-handed 0.20 s (the calibrated allowance,
re-aligned), two-handers the most committal at 0.16 s.

This lands alongside the parry *volume* changing from a fixed 1.24 m box parked
in front of the chest to the parrying object's own measured volume plus a stated
margin. The two changes push difficulty in opposite directions — longer, tighter
— and the net feel is the main thing to judge on playtest.
