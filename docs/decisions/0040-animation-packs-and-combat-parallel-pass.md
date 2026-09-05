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

## 5. Per-weapon executions, and how the audit was automated

The rule throughout: **a measuring tool is trusted exactly as far as it
reproduces a known answer.** The known answer here is the one-handed riposte,
audited by hand frame by frame against rendered geometry and shipped with the
owner's approval.

The first `--critical` implementation did not reproduce it, so its output was
refused and the two-handed clips were pulled from the build rather than wired on
a guess. Three separate modelling errors were then found and fixed:

1. It **approximated both bodies** — a straight line from the weapon socket
   against a guessed torso cylinder. It now uses the volumes the game actually
   collides: the weapon capsule the runtime builds from the item manifest's
   measured extents, against the victim's own skeleton-fitted hurtbox posed in
   the clip the critical holds them in.
2. It **took the first contact**, and a packaged execution brushes its victim in
   passing before it strikes — the hand audit had rejected one such moment by
   name. Brush and strike are now separated by depth and duration.
3. It **measured penetration of the whole hurtbox**, which a shoulder graze
   satisfies. Switching to the *visual gate's own measure* (grip-to-tip against
   the victim's spine and pelvis) is what reconciled it: the greatsword's real
   strike is at source 2.98 s, and the graze it had been selecting is at 1.45 s.

It now reproduces every audited number to within one source frame, and that is
`critical-known-answer.test.mjs`.

**The limitation that remains, and why it is fine.** The measurement is from a
standing start; a real execution lunges, and how much of the gap that closes is
a property of the clip (0.15 m on the one-handed, 0.04 m on the greatsword's).
So the tool proposes and the visual scenario disposes — the scenario measures
the real thing, including "the blade arrived 0.267 s before your damage frame",
which is how the battleaxe's trim was placed. Both numbers in that loop are
measured. The procedure is four steps in the tool's own header.

**Why this is two numbers per family rather than a second profile.** Every
execution is trimmed to put contact 0.400 s in — where the audited one has it —
so `damageProgress` and the victim's entire timeline carry across untouched. The
pipeline absorbs the per-clip difference so gameplay does not have to.

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

## 8. The head is hidden in first person, not shrunk (owner suggestion)

Raised as a safety measure and taken as one. The head bone used to be scaled to
a thousandth; it is now the head *meshes* that are hidden. Two reasons the
change is worth more than it looks: scaling a bone distorts the collar, which
shares weights with it, and it hides only what that bone happens to skin.

`actors/headMeshes` identifies them by **skinning** — a mesh weighted entirely
to the head bone and its descendants — rather than by name or by biped slot.
Both alternatives are unusable here: names are per race, and the roster's biped
slots are demonstrably not clean for this, with several races filing `EyesMale`
and `MouthHuman` under slot 32, the *torso* slot. A slot-driven rule would leave
eyes hovering in mid-air when the head went, and take them off when a cuirass
went on.

The payoff is the owner's point: with nothing rendered there at all, "inside the
head" stops being a state that can exist, so the aim camera no longer has to
defend against it and can sit on the eye. `AIM_EYE_AHEAD_METERS` is now 0.05 —
enough only to clear the collar and shoulders, which are still there.

---

# Round 3 (2026-09-01) — crouch volume, foot-driven motion, weapon-aware AI

Four owner goals. Two of them changed a principle rather than a number, so they
are recorded here; the rest is in the commits.

## 9. Motion comes from the feet

The owner's diagnosis was exact: an attack's movement and its animation were two
independent descriptions of the same thing, and nothing kept them agreeing. The
rule adopted is theirs — while a foot is on the ground it does not slide, so any
motion of that foot relative to the actor's root is motion the body made.

**Measured at build time.** The pipeline already sampled both soles for every
clip (`authoredGroundSpeed` comes from it), so the integration happens there and
each clip carries a `groundTrack`. This is the load-bearing choice: it makes the
expensive part deterministic and testable, and it means the runtime does no
per-frame bone reading. It also produced the evidence — IDLE moves the body 1 mm
in nine seconds, a battleaxe's overhead 3.6 cm, against a sword light whose
authored lunge was closing 0.6 m.

**The blind spot, and why it is a cap rather than a fix.** One anchor point
cannot distinguish a pivot from a translation: a planted foot swinging round a
turn traces the same arc either way, and Skyrim's one-handed heavy turns the
body through most of a circle, reading as 1.8 m of sideways travel. Removing the
rotation needs a reliable body-facing axis and the rig has none — a Blender
bone's local axis runs *along* the bone, so the pelvis points up the spine, and
the line between the feet swings through every stride. Both were tried and both
made every clip worse.

So the artefact is confined instead: only the forward component is applied (an
attack is aimed, and the artefact is entirely lateral), and the speed is capped
by the lunge it replaces. The change is therefore strictly one-directional — it
can move an actor less than today, never more — which is what makes it safe to
default on while the owner judges it. The switch is in the debug panel.

Locomotion is deliberately excluded. The track under-reads a run (during a
stride's airborne phase neither foot is planted), and locomotion is the one case
where the player is steering the speed and the animation should follow it.

## 10. Weapon-aware enemy AI

Every distance the AI reasoned with was a sword's, written when a sword was all
anyone held. The split adopted is Skyrim's: a **Combat Style** carries
disposition per actor, and the engine reads reach and speed off the equipped
weapon for the geometry. So `ai/weaponTactics` derives engage/crowded/disengage
ranges, aggression and circling from the weapon; the archetype keeps the
creature. Nothing is authored per weapon.

A bow gets a *different intent set*, not the same one retuned, because an
archer's problem is the inverse of a swordsman's — it already has its range and
its job is keeping it. It has no guard or parry branch at all, and it aims by
solving elevation against the same drag model the arrow will fly under, because
a flat shot at twenty-five metres falls metres short.

The one judgement worth flagging: the fallback tactics are the sword's, so an
actor whose weapon has not been resolved scores exactly as before. That is
asserted, not assumed.

## 11. What vanilla's killmoves actually contain (correction)

Round 2 said vanilla has "exactly one back-facing paired killmove". Wrong: there
are **two** one-handed ones — `paired_1hmkillmovebackstab` and the throat-slit
`paired_1hmsneakkillbacka` — plus a knife decapitation. The defensible statement
is narrower: every back-facing *paired* clip is one-handed, and the per-weapon
killmoves that exist (three 2hw, three 2hm) are frontal finishers.

Two-handed backstabs are therefore assembled the way the executions are — the
weapon's own execution clip against a sourced from-behind victim stagger —
rather than declared impossible.

# Round 4 (2026-09-01) — hitbox timing, and things that had two owners

The owner's round-3 playtest produced a long, precise list. Most of it is
ordinary work recorded in the code and the commits; recorded here are the five
findings that change how something should be reasoned about, plus the one item
not delivered.

## 12. A hitbox window is a fraction of a clip, so the clip must play at the
## same rate the window was scaled by

The reports read as five separate weapon bugs: a dagger cutting during its
wind-up, a mace's second heavy cutting during its recovery, a two-handed
opening swing that only connected after it had finished. Two causes.

**The class speed factor was applied to gameplay and not to the animation.**
`WeaponClassProfile.speedScale` scales an attack's wind-up, active and
recovery; the contact window inside those seconds is a fraction *of the clip*;
and the clip kept playing at its authored rate. So the hitbox drifted off the
visible blade by the whole of that factor — 28% early on a dagger, 12% late on
a mace, and in the same direction and proportion for every class in the
arsenal. `AttackSpec.timeScale` now carries the factor and the animation
command plays the clip at it.

The general rule, and the reason this is worth a section: **anything measured
as a fraction of a clip is only valid while the clip and the action share a
clock.** `equipment/attackTiming.test.ts` holds that for every class.

**The measuring tool selected the longest contact phase, not the fastest.** A
Skyrim attack clip is strike-then-settle, and on a two-handed clip the settle
is comfortably the longer of the two: a greatsword's opening swing strikes for
0.14 s at 38 m/s and then trails across the front for 0.31 s at 20. Selecting
by length measured the settle. Peak tip speed is the right discriminator — the
damaging part of a swing is the part carrying the momentum — and it agrees with
the owner-calibrated one-handed windows, which is the tool's standing
correctness check. Every window the owner had already approved is unchanged;
the four broken two-handed windows and the one-handed second heavy all moved
earlier.

## 13. A parry is two clips on one clock, and has to be measured that way

The shield, greatsword and battleaxe parries all caught during the wind-up and
were inert during the parry itself. Each family's window was measured inside
its *intro* clip, but the intro is only the raise: `SHIELD_PARRY` is 0.133 s,
`GREATSWORD_PARRY` 0.233 s. The window opened at 0.067 s and closed before the
clip that does the actual parrying had begun. The one-handed sword was fine by
luck — its raise is short enough that the window spilled into the bash.

`measure-contact-windows.mjs --parry` measures the guard's leading point across
the clip *pair*. Its phase list is the output and the `->` line is a
suggestion: unlike a swing, a parry has two fast phases that look alike to a
speed test — raising the guard into presentation, and sweeping it across — and
only the second is a catch. The battleaxe needed a third reading again: its
sweep crosses from fully-forward to behind the chest in a tenth of a second, so
the window opens at full extension (0.2 s, exactly where its raise ends) to
give the axe a window in *space* as well as in time.

## 14. An axe has no point, so a class declares how it finishes people

Vanilla has two back-facing paired criticals and both are one-handed thrusts,
so every other weapon's backstab is assembled. It was assembled from a thrust
regardless of what was in hand — a war axe burying a blade it does not have,
a battleaxe performing a greatsword's lunge.

`WeaponClassProfile.criticalStyle` splits this. A **thrust** class uses its
authored execution; a **swing** class plays its own opening light attack from
behind. The swing critical is not a bespoke killmove and does not pretend to
be: it is the motion that weapon actually makes, and the critical reads through
the victim's reaction and the damage. Its contact is the light attack's own
measured window, so it needs no new hand-audited numbers — only the pair
separation was measured (1.10 m, both families).

This also exposed a related defect: the two-handed backstab swapped in the
execution clip but kept the timing of the one-handed *paired* clip it replaced,
running a 1.13 s performance over a 3.17 s action. `attackTiming.test.ts` now
requires every critical's `damageProgress` to fall inside its own spec's active
window.

## 15. Three bugs were two systems writing one value

Worth recording as a class, because all three read as unrelated reports.

- **`Object3D.visible` had no owner.** Mounting armour sets the visibility of
  every body mesh; a first-person camera hides the head; and the head *is* a
  body mesh in the race roster (slots 30 and 43). Which won was decided by
  React effect ordering. A mesh is now visible iff nobody is hiding it
  (`actors/meshVisibility`).
- **A body mesh spans several biped slots.** Bethesda's body is torso,
  forearms and calves in one object (32/34/38); boots cover feet and calves
  (37/38). "Hide any mesh sharing a slot" therefore deleted the whole body when
  an actor put boots on — which is the archer with no body *and* the paper doll
  that emptied when a cuirass came off, one bug reported twice. Coverage is now
  by the mesh's primary (lowest) slot, or total coverage.
- **The off-hand node's basis is a fact about the node, not about shields.**
  The half turn shields need was written up as a shield correction; a bow hangs
  off the same node and was held with its string facing the target.
  `OFF_HAND_NODE_HALF_TURN` is now one constant both use.

## 16. State the AI can choose has to exist

The archer drew and held forever and never moved. `ai/enemyAi` emits `shoot`
and `withdraw`; the sandbox FSM had a handler for neither, and since an archer
picks one of those two almost every decision, nothing ever set its joystick —
feet moving in the animation, body stationary. Both were also pinned at zero
turn rate. Nothing was subtly wrong; the states were simply not implemented.

The sword-and-board enemy's "parries constantly, never blocks" was the same
shape of gap one level up: `loadoutTactics` read the main hand and discarded
the off hand, so a shield warden scored guarding exactly as a two-handed
fighter does. `WeaponTactics.guarding` is taken from whatever is actually
between the fighter and the blow, and is normalised *within* the weapon and
shield stability bands rather than across them, because the gap between those
bands is a difference of kind.

## 17. Full-screen UI is sized by the visual viewport, not by any CSS unit

Fourth attempt at the phone layout. `vh`, then `dvh`/`dvw`, then 100% of the
game shell — all reported cut off, and the third shows why: the shell is 100%
of `body`, which is the *layout* viewport, and on a phone that extends under
the address bar (bottom cut off outside full screen) and, with
`viewport-fit=cover`, under the display cutout (right cut off *in* full screen).
Every CSS unit on offer describes the browser; none describes the screen.
`hud/visualViewport` publishes `window.visualViewport` as four custom
properties, so any screen that must fit is four lines of CSS.

## Not delivered this round

**Per-weapon riposte clips.** The owner wants a thrust for the one-handed sword
and the dagger and a swing for the battleaxe. Rim ships an authored execution
for every weapon type and all of them are extracted in the vault, but
`pipeline.audition` — the tool for viewing candidates before committing to one
— fails because it wants a `dunmer-combat` character data-root that no current
build target produces. Choosing a clip without seeing it would have been a
guess. Recorded in the polish backlog with the fix-the-audition-target
prerequisite.

**`heavy-chain`'s ground-correction gate** fails at 2.03 against a limit of 2.
It is pre-existing rather than introduced here — it measures 2.096 on the
commit this round branched from — and this round's HEAVY_2 re-measure improved
it. Left alone rather than folded into an unrelated round.

# Round 5 (2026-09-03) — the owner's round-4 playtest list

## 18. A critical's choreography belongs to the ATTACKER's weapon

The two-handed axe/hammer backstab "never happened" because the victim's half
of every critical was resolved from **the victim's own weapon** — a sword-armed
enemy played the sword's 3.17 s paired backstab whatever the player swung, so a
battleaxe's ~1 s swing never reached the sword pair's outcome moment: no
reaction, no recovery, and the abandon path then dressed the victim in the
*player's* combat idle (a sword enemy standing in GREATAXE_IDLE). The attacker's
pair and attack are now pinned on the victim runtime for the duration
(`criticalByPair`/`criticalByAttack`), proven by the new `greataxe-backstab`
scenario. A sandbox-only **"Show backstab zones"** debug switch draws each
enemy's initiation sector from the same exported constants the rule tests
(`BACKSTAB_MIN/MAX_DISTANCE`, `BACKSTAB_FACING_DOT`) — green when a press
would backstab.

## 19. A swing has one outcome

A blade that reached the torso a frame before it reached the parry volume both
dealt its damage *and* then announced a successful parry. Both directions now
gate the parry on the swing not having already hit (`!attackHit`).

## 20. Arrows strike hurtboxes, and only hurtboxes

Three archer defects, one cause each: (a) the self-exclusion compared the
*capsule* name while strikes resolve against *hurtbox* names, so every shot
could die in the archer's own hurtbox on the spawn frame and count as a hit on
itself; (b) weapon/parry sensor volumes could take arrows out of the air, which
froze shafts "in" the archer's own bow; (c) `handleArrowHit` simply had no
player branch — the player could never be hit. Arrows now strike only
`*-hurtbox` sensors, the shooter is excluded by hurtbox name, and the player
takes arrow damage through the same guard/armour/poise/i-frame rules as melee.

## 21. First person is a near plane, not a rig

The aimed camera was on the eye and the head was hidden, but the view was still
a wall of meat: the aim lean bows the shoulders into the eye point, and
hair/crest meshes are partly neck-weighted so the strict head-mesh hide cannot
claim them. The fix is the standard hybrid answer — while fully aimed the near
clip rises to 0.34 m and the eye sits 0.28 m forward and 0.14 m toward the
string-hand side, so the skull's neighbourhood is clipped away while the bow
arm stays. **A Skyrim first-person rig was investigated and rejected**: it is a
second, separately-authored animation set for every weapon action — a
permanent doubling of the sourcing burden for one view.

## 22. A modal swallows its buttons until they are released

Closing the inventory with pad B fired a *backstep*: dodge triggers on release,
and the release edge arrived after the game resumed. `clearHeld` cannot fix a
gamepad (the pad re-reports the button every poll), so the input controller now
suppresses any action held while a modal is up until the device physically
releases it (`InputController.suppressHeld`, unit-tested).

## 23. Locked strafes follow real speed; the spinning-attack slide is a clip
## problem, established by measurement

Locked-on strafe/back-walk dropped their flat 1.4× playback for the same
cadence-follows-speed rule as every other stride; residual scrub remains at
full stick because the strafe clips are authored at ~0.8 m/s against a 3.0 m/s
locked walk and the cadence band caps at 1.8× — if that still reads badly the
choices are a wider band or a slower locked walk, which is the owner's call
(speed is calibrated feel).

The greatsword-second-heavy foot slide was attacked head on and the honest
answer is recorded rather than a fudge shipped. The measured ground track's
lateral component *was* applied (it is the real displacement that keeps a
planted sole world-fixed when a clip's turn is baked into its bones and the
capsule cannot rotate) — and the probe suite immediately showed why it had
been excluded: a pivoting clip carries metres of it (one-handed HEAVY −1.8 m,
greatsword heavy-2 +3.1 m), and applying it slides the attacker sideways off
its target — `offense-outcomes` and `enemy-heavy-attack` whiffed outright. On
a spinning clip, honest feet and a tracking attack are irreconcilable: the
fix is a *different source clip* (a non-pivoting heavy), which is a sourcing
job in the polish backlog, not a runtime rule.

Also recorded this round: the inventory UI is a working draft, not a finalised
exemplar (owner 2026-09-03) — noted on the HUD & UI row of
[game-buildout-register.md](../game-buildout-register.md).

# Round 6 (2026-09-04) — the owner's round-5 playtest list

## 24. Every arrow flew tail first, and an arrow now flies a plain arc

The arrow meshes were measured rather than assumed: on every shaft in the set
the flat broadhead vertices cluster at the high-Z end and the three vanes at
z = −0.75, and both the projectile and the nocked shaft turned the model a
half turn on the assumption that the point was at the *other* end. So every
arrow — the player's as well as the archer's — left the string feathers
first, which under the aerodynamic model of §20 also meant the restoring
torque was fighting the shaft round through 180° on every shot: the "tumble".
Owner ruling: no drag, no torque, no damping — an arrow is a rigid body under
gravity whose rotation is locked and whose attitude is set from its velocity
every physics step (`flightAttitude`), head leading, tail tracing the arc. The
archer's elevation solver is now the closed-form vacuum solution, so it aims
under the same physics the arrow flies.

## 25. An archer shoots where its bow points, from the string

Arrows left the archer from a point near its eye along the *bearing to the
player*, whatever the body was facing. Now an enemy archer carries a nocked
shaft on the string through its draw (the same `NockedArrow` the player has),
the upper body leans to the solved elevation (`aimPitchRef`, previously player
only), the loose waits at full draw — up to 1.2 s — for the turn to bring the
facing within 3.4° of the target, and the shot leaves from the nock along the
facing. The player's shot leaves from the nock too, not from the eye. The bow
*string* still does not move: see the sourcing job in the polish backlog —
vanilla bows are skinned to their own seven-bone skeleton with authored draw
clips, and the pipeline flattens them.

## 26. The two-handed 10 cm slide was the idle's own origin

The greatsword and battleaxe *idle* clips carry a constant planar root
offset of 7.6 × 14.9 cm (the one-handed guard 7.5 × 18 cm, the crouch idle
5 cm); every attack clip has its planar root motion consumed to zero. So on
entering a swing the mesh slid across the offset and slid back on the way out
— the reported diagonal foot slide, seen on the two-handers because their idle
offset is fifty times the sword idle's 0.3 cm. The pipeline now recentres the
planar root chain of every stationary loop that preserves its root motion
(`recentreRootMotion`; sway kept, constant removed; all ten preserved clips).
All seven packs change bytes for it, deliberately. The guard clips carried an
18 × 8 cm offset of their own; against the honestly placed guard the sword's
light attack registers at 1.2 m and not at 1.54 or 1.74 m (all three
measured), so the three scenes in which the player's light attack reaches a
guarding or parrying enemy now start at 1.2 m (`GUARD_CONTACT_*`). Why the
old offset let the same swing register at 1.74 m is not understood and is
noted in the polish backlog.

## 27. Every main-hand weapon was held back to front

Owner report: the war axe leads with its poll, the scimitar's edge faces the
wielder. Confirmed on the rig rather than by eye: the war axe's bit (+X in the
built mesh, the wider side of the head) points at −0.96 against the hand's
wrist-to-knuckle direction, i.e. into the wrist; a blow leads with the
knuckles. A half turn about the long axis (`MAIN_HAND_NODE_HALF_TURN`) is now
the default held rotation on the `Weapon` node, the same fact §14 recorded
about the `Shield` node. Symmetrical weapons are unaffected, which is why it
went unnoticed; hit and parry capsules are Z-symmetric in the object's frame
and unaffected.

## 28. Honest feet, all of it: the pivot is applied and the scenes restaged

Owner ruling on §23: the body pivots round its planted foot even where that
carries it metres — the player positions for the swing they committed to; an
attack does not track its target. The whole measured track (forward and
lateral, uncapped) now drives both player and enemy swings. The lateral sign
was verified by reproducing the pipeline's track from the shipped GLB:
STRAFE_LEFT integrates to +0.98 m in the GLB's +X, so +X is the actor's left,
and the one-handed HEAVY carries the body 1.79 m to its right and 0.35 m back
(manifest: −1.815, +0.320). Its blade sweeps 1.1–2.1 m to the right of the
start, at head height, so a *locked-on* one-handed heavy can never land: the
`offense-outcomes` scene now throws it unlocked at an enemy off the right
shoulder and follows with the lights locked on. An enemy decides feet-or-
lunge **once, when the swing starts**: switching to the feet as the lunge
closed the range let HEAVY_2's authored 0.58 m back-step walk the enemy out
of the reach it had just bought, and the lunge now stops at the threshold
instead of driving the capsules into contact. Enemy AI does not yet plan for
the track's displacement (backlog).

## 29. Locked-on speed follows the clip

Round 5 scaled the strafe clips' cadence to a fixed 3.0 m/s locked walk. The
owner wants it the other way round, as the crouch already is: the speed is
the clip's authored ground speed (WALK 0.89, WALK_BACK 0.69, strafes ~0.8 m/s),
so the planted foot is the anchor by construction. Behind the "Locked-on
speed follows the strafe clips" switch (default on) because it is a large feel
change the owner should be able to compare in one session.

## 30. The stabbing riposte ships behind a switch

`RIPOSTE_STAB` (Rim's dagger execution, source 2.165–3.298 s, strike 2.432 s,
the round-5 audition's numbers) is in the criticals pack and swapped in for
every weapon whose riposte is the authored `RIPOSTE` thrust (sword, dagger)
by `withStabRiposte` when the "Stabbing riposte" switch is on (default on).
The round-5 mystery — `greatsword-riposte` regressing to 0.48 m when the
criticals pack changed — did **not** reproduce: `greatsword-riposte` passes
against the new pack, and `riposte-stab` passes its own scene.

## 31. The body turns with the camera while aiming

With `lockForward` off the controller only turns the body when there is
movement input, so an archer standing still could swing the crosshair round
while the bow kept pointing where it was — the reported "bow arm does not
follow the camera". Aiming now locks the facing to the camera yaw every step
and movement becomes strafing about the aim.

## 32. A first-person bow rig is a sourcing job, and a bounded one

§21 rejected a Skyrim first-person rig as "a second animation set for every
weapon". The owner is right that it would be for bows only. What vanilla
ships (listed from the BSAs this round): 702 first-person clips including the
complete bow set (`_1stperson/animations/bow_*.hkx`, `bowdrawn_*.hkx`), the
first-person skeleton (`_1stperson/skeleton.nif`), and first-person body and
hand meshes per race. Recorded in the polish backlog with paths and a build
outline; not attempted this round.

# Round 7 (2026-09-05) — the owner's round-6 list

## 33. A parry catches by timing

Owner ruling on §28's open question: the Souls rule. While the catch part of
the parry clip is active, a blade that reaches the defender's *body* is
parried, not only one that reaches the catch volume. Both directions. The
round-6 `enemy-parry` failure was exactly the geometric rule's blind spot —
with the honest 8 cm side-step the sword met the torso and never the raised
blade — and the scene passes again without any restaging.

## 34. The dagger stabs; the sword keeps its lunge

`RIPOSTE_STAB` is now wired into the dagger *class* in the arsenal
(`withStabRiposte` on `classId === "dagger"`); the one-handed sword keeps the
authored CQC02 lunge. The round-6 comparison switch is gone. `riposte-stab`
runs on the iron dagger.

## 35. A held item's volume is re-measured when the item changes

The dagger's swing volume "looked sword length" because `HeldObjectHitbox`
measured its object once and the weapon mount object survives an inventory
swap: a dagger inherited the sword's capsule. The measurement is keyed by the
item id now, and an empty measurement (meshes not yet streamed) is retried
rather than remembered.

## 36. Foot-anchored locomotion, for real

Round 6 matched the locked-on *speed* to the strafe clips but still scaled the
clip. The owner wants the feet to be the anchor everywhere: locked-on strides
and the crouch now play at rate 1 and the body's velocity is the clip's own
planted-foot track (`footAnchoredLoopVelocity`, wrap-aware), applied in the
actor's frame; the controller gets no joystick for them and the facing is
driven directly (a crouch faces the way it goes and always plays the forward
sneak stride; only a locked-on crouch strafes). Behind the same switch as
round 6's speed rule. `enemy-approach` starts beyond the run threshold
because a 0.7 m/s back-walk cannot open the gap; `crouch-locomotion` locks on
for its reverse and strafes.

## 37. Archers aimed a head above the head

`aimEnemyBow` solved for `target.y + 0.9` where `target` is the capsule
*centre*, i.e. ~1.9 m: a standing player was missed by design. Aimed at the
chest (+0.25). A validation scene looses with no spread (deterministic by
contract), and `archer-shot` proves three hits from 8 m after a quarter turn.

## 38. A standing archer does not turn on the controller's torque

The round-6 lock-forward fix did nothing measurable: `bow-aim-turn` swung the
camera 2.2 rad and the body 0 (the controller's turning torque does not move a
standing, joystick-less body). The aim now pins the body rotation to the
camera yaw every frame, exactly as the lock-on does. The scene's `facing`
check guards it, and the same telemetry (`playerYaw`, `cameraYaw`, `enemyYaw`,
`enemyBearingToPlayer`) guards the archer's turn.

## 39. Bows are rigged: the string and limbs draw

`pipeline.build_bow_rigs` builds every arsenal bow *skinned* to the vanilla
seven-bone bow skeleton (`meshes/weapons/bow/character assets/skeleton.hkx`)
with the bow's own `bow_drawlight/drawheavy/idledrawn/release` clips baked
in, one GLB per bow under `bow-rigs/`, in the skeleton's units with a
measured runtime `scale` (taken from the exported GLB's own rest bounds — the
exporter's unit handling for a skinned mesh is not the static build's). At
runtime `OffHandItem` mounts the rig when the profile has one, scrubs the draw
clip by the archer's draw fraction from the measured pull *onset* (the vanilla
draws hold rest for ~1 s first) and plays the release once per loose. Player
and archer alike. Static bow GLBs remain for anything without a draw.

## 40. The first-person bow rig is in, behind a switch

`pipeline.build_first_person` builds Skyrim's own first-person rig for bows:
`skeletonfirst.hkx`, `1stpersonmalebody_1` + `1stpersonmalehands_1`, and
fourteen `_1stperson/bow_*` / `bowdrawn_*` clips, as
`rig-skyrim-first-person.bow.glb` (same units as the body rig — forearm
1.6047 in both — so `CHARACTER_SCALE` applies). `FirstPersonBow` puts the
rig's root at the body's feet, turns it to the view yaw, pitches it about its
own `Camera1st` bone and hands the camera that bone's position; the rigged
bow mounts on its `Shield` node and the nocked arrow on `Weapon`, so the shot
leaves from the first-person string. The third-person body is hidden while
it is up. "First-person bow rig (Skyrim arms)" in the debug panel is the
whole revert. Skin is the vanilla texture (untinted) for now; race tinting of
the arms is a follow-up.

## 41. The interface owns its clicks

Mouse buttons that land on `[data-ui-capture]` chrome (the debug and help
panels) never reach the combat input, so ticking a switch no longer swings.
