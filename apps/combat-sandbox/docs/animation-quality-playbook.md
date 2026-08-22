# High-quality animation implementation playbook

Read this before adding, replacing, or retiming an animation. It condenses the
failure modes that made the Skyrim integration expensive and is organized for a
good first implementation, not as a history of previous attempts. Exact current
clip selections and timings remain in
[`assets/animation-source-audit.md`](assets/animation-source-audit.md); runtime
mechanics remain in
[`architecture/animation-contract.md`](architecture/animation-contract.md).

## Definition of done

An animation is integrated only when all of these agree:

1. **Meaning:** the motion reads as the intended gameplay action with the
   equipped weapon, from the production camera.
2. **Ownership:** the correct actor and command own every anticipation,
   contact, outcome, and recovery phase.
3. **Time:** the useful source interval, gameplay window, hit/contact event,
   blends, hit-stop, and recovery form one continuous action.
4. **Space:** controller travel, authored vertical motion, actor alignment,
   weapon contact, and the support plane agree.
5. **Continuity:** source curves, loop seams, command transitions, sockets, and
   controller facing contain no visible hitch, pop, sink, or jitter.
6. **Evidence:** automated production-path checks are green and the project
   owner has approved the generated visual evidence.

A semantic name in telemetry is not evidence that the correct body motion is
playing. A clean standalone clip is not evidence that its production transition
or contact works. Passing probes are not evidence that motion looks good.

## The fastest reliable workflow

### 1. Write the visual contract before touching code

In a few sentences define:

- what a fresh viewer should think happened;
- attacker/defender/victim roles;
- anticipation, visible contact, release, outcome, and recovery beats;
- whether the action should remain standing, become airborne, touch the floor,
  recover, or stay dead;
- intended controller travel and facing; and
- required entry and exit states, including interrupt/follow-up branches.

For paired actions, draw one shared timeline with both actors. Keep contact,
physical release, damage/outcome transfer, and animation completion as separate
events unless the source proves they coincide. This prevents the characteristic
failures where a victim stands or guards before impact, reacts late, switches
roles, restarts a reaction, or gets up after a lethal result.

### 2. Diagnose which layer owns the problem

| Visible symptom | Inspect first | Correct fix location |
| --- | --- | --- |
| Wrong gesture or action meaning | Full source clip with weapon; FOMOD/OAR conditions | Select a better source in the pipeline config |
| Correct semantic, wrong actor motion | Paired track groups and rendered weapon/body trajectories | `pairedTrackPrefix`/track import and role contract |
| Clip cuts off or compresses unnaturally | Selected source span versus gameplay lock | Manifest source interval/playback rate, not casual gameplay retuning |
| Pause, rewind, or wrong recovery | Command serials and action ownership at contact/outcome | Combat animation-command sequencing |
| Pop at entry/exit | Exact occurrence boundary and both source poses | Per-clip or per-command cross-fade |
| Jitter inside an otherwise continuous clip | Native and exported per-bone curves at the exact frame | Declarative, validated curve conditioning only if the source key is proven bad |
| Hitch once per locomotion cycle | Exported input start/end and duplicate loop endpoint | Zero-based loop timeline in the asset build |
| Whole actor jerks while limb curves are smooth | Controller position/yaw and animation speed matching | Movement/controller integration |
| Feet or body cross the floor | Final deformed mesh, COM vertical channel, support mode | Pipeline vertical-root policy/support envelope/phases |
| Feet hover; body looks anchored and the feet rise to it | Whether the clip's authored vertical COM survived the build | Preserve vertical root motion; only the controller-owned jump strips it |
| Gait stutters when speed changes | Clip's authored ground speed against the actor's real speed | Cadence-match playback (`authoredGroundSpeed`), not the controller |
| A clip's arms barely move while the legs do | Per-bone rotation range in the source | Source selection: a combat-carriage clip holds the arms on purpose |
| Actor floats or is pinned during jump/fall | Support phase at that source time | Declare `airborne`; do not globally ground the clip |
| Blade visibly connects but gameplay misses | Rendered weapon sensor and physics-step ordering | Keep active window through the following simulation callback |
| Weapon points/grips incorrectly | Animated socket basis with the real weapon | Weapon-definition socket transform, never per-action patches |
| Correct scene mistaken because of UI | Target anchor, depth/occlusion, and actor motion | Camera/UI marker presentation; do not swap animation roles |

Do not compensate in a different layer. In particular, do not alter damage,
stamina, i-frames, or action locks merely to hide an animation problem; do not
move a rendered model independently of its controller to fake paired alignment;
and do not add runtime procedural posing to repair a bad source curve.

### 3. Audition source material cheaply and in batches

- Interpret FOMOD encoding and branches, OAR priorities, equipment predicates,
  and paired track groups. A filename is only a lead, not a semantic guarantee.
- Preserve the native HKX duration; some valid Skyrim files are 60 fps.
- Put every plausible candidate into one audition GLB rather than rebuilding
  once per file:

  ```bash
  cd ../elder-scrolls-asset-pipeline
  python3 -m pipeline.audition --output-stem ACTION-candidates \
    --candidate CANDIDATE_A=/absolute/path/a.hkx \
    --candidate CANDIDATE_B=/absolute/path/b.hkx
  ```

- Render candidates on the canonical production rig with the real weapon for
  their complete duration, not only as sparse pose contact sheets. Use the
  pipeline's `render_action_preview.py`; use `render_paired_preview.py` only
  when actors truly share an authored paired clock.
- Give the project owner one labeled batch comparison, its exact absolute
  output paths, and the selection questions. The owner screens semantic read,
  weapon grip, start/end poses, floor behavior, unwanted extra attacks, actor
  role, and recovery before a candidate is integrated. Agents do not ingest
  these visuals unless explicitly asked.

Asset previews are a shortlist tool. Batch them so the owner makes one informed
selection instead of reviewing a long rebuild loop. They deliberately do not
approve runtime timing, contacts, transitions, controller travel, camera
presentation, or UI.

### 4. Put data in the correct source of truth

- Game code emits semantic states only. Source HKX paths and import treatments
  belong in the sibling pipeline's
  `pipeline/config/animations/humanoid-1h-combat.json`.
- Use `playbackStartTime`/`playbackEndTime` for an audited useful source interval,
  `playbackRate` for presentation speed, and entry/outgoing cross-fades for
  transitions. Do not falsify `sourceDuration` or hard-code source filenames in
  scene code.
- Prefer the complete source motion. Trim only when the remainder is a
  different semantic action, such as extra execution hits or a lethal clip's
  get-up tail.
- Fit presentation to the existing gameplay window when gameplay is already
  correct. A useful starting calculation is `playbackRate = selected source
  span / target visual duration`; then account for the exported leading held
  frame and hit-stop, and ensure a clean end pose is actually rendered before
  the action unlocks.
- Preserve native vertical COM motion only after confirming the rig axis.
  Planar travel remains controller-owned in the current architecture.
- Stationary loops may need `preserveRootMotion` because stripping a net-zero
  sway can freeze the torso while the legs continue and create foot sliding.
- Declare `supportMode` and half-open `supportPhases` from visible behavior:
  ordinary upward-only penetration protection, true `airborne` intervals, and
  exact `floor-contact` only where the body should be supported.
- Increase `supportSampleRate` for fast nonlinear motion such as a tuck roll;
  30 Hz keys can miss between-keyframe mesh penetration.
- Keep source-curve repairs narrow and declarative. Record exact bone/time,
  prove the key leaves and returns to nearby poses, remove whole quaternion keys
  rather than individual components, add an exported continuity assertion, and
  retain provenance. Never apply broad smoothing because a video looks jerky.

The generated runtime manifest and GLB are a matched pair. Never hand-edit the
generated game manifest. After changing production pipeline data, always build,
validate, install both outputs, and verify their hash contract before testing:

```bash
cd ../elder-scrolls-asset-pipeline
python3 -m pipeline.build --character dunmer-combat
python3 -m pipeline.validate --character dunmer-combat
cp output/character-dunmer-combat.glb ../ecctrl-souls-combat/public/
cp output/character-dunmer-combat.animations.json \
  ../ecctrl-souls-combat/src/game/anim/
cd ../ecctrl-souls-combat
npm run assets
```

### 5. Integrate the production state path, not a demo animation player

- Drive the action through real input/enemy intent, combat FSM, animation
  command, physics, actor renderer, weapon socket, and production camera.
- Locomotion and jump clips are self-timed; combat actions use rebased external
  action clocks. Assigning the wrong clock can begin a clip at its last frame.
- A command change must rebase its source clock even when gameplay remains in
  one larger action. A same-semantic ownership transfer may intentionally keep
  one command serial so a reaction continues without rewinding.
- Paired actors must use stable controller anchors, source-derived separation
  and facing, and a shared choreography timeline. Recompute separation after a
  rig scale change. Verify roles from poses and blade trajectory, never from the
  reticle or semantic labels alone.
- Keep contact, release, outcome, and completion distinct in weapon-profile
  data. Nonlethal and lethal branches commonly diverge only at outcome.
- Attach weapons using the measured hand/hip socket transforms in the weapon
  definition. Time equip/unequip socket changes to the animated hand contact.
- Treat the navigation capsule and combat hurtbox separately; enlarging the
  movement capsule to make attacks connect changes locomotion and grounding.

### 6. Validate in increasing-cost order

Run cheap rejection gates before generating any video:

```bash
cd ../elder-scrolls-asset-pipeline
python3 -m pipeline.validate --character dunmer-combat

cd ../ecctrl-souls-combat
npm test
npm run typecheck
npm run visual:check -- affected-scenario
```

Only once that is green and the implementation has settled, record the affected
group once for the owner:

```bash
npm run visual:record -- affected-group
```

Never re-render while source choice, timing, or probes are still moving, and do
not record the full 28-scene suite unless the owner asks. Use
`VISUAL_RUN_ID=before`/`after` when you need a comparison pair.

Then stop and hand the owner the absolute path to `review.html` plus the
specific question you want answered. The owner makes the visual judgment and
writes it in `review.md`. See
[`validation/animation-recordings.md`](validation/animation-recordings.md).

## Production evidence to add with a new animation

Do not make a one-off viewer. Extend `src/game/validation/` with the smallest
focused scenario that reaches the action through production behavior, and add:

- complete expected action and rendered-animation runs for both actors;
- the scenario's name in a `visualScenarioGroups.json` group;
- contact/event assertions where the action affects gameplay;
- actor-role, weapon-to-body, controller-facing, and floor/support probes where
  applicable;
- motion limits only when derived from a known bad and known good result; and
- automatic semantic coverage, or an explicit documented exclusion for
  audition-only clips.

A probe should detect a specific known class of defect, not encode a subjective
idea of style or merely make the current numbers pass.

## High-value invariants learned from this integration

- **Source meaning beats filename.** A “dodge back” may be a floaty hop or
  somersault; the best Souls-like backstep here was a retimed guarded walk-back.
- **View every source endpoint.** Execution files can contain several attacks;
  death files can contain a get-up; an attractive opening does not approve the
  tail.
- **Paired files need structural inspection.** One HKX may contain both actors;
  there may be no separate victim file. Track-prefix assignment can be reversed
  while telemetry still appears correct.
- **Visible contact is authoritative.** Package annotations and nominal hit
  frames can disagree with the rendered blade/torso geometry.
- **Reactions need continuous ownership.** Restarting or releasing the victim
  around withdrawal causes the stand/guard/pause defects that ruin a riposte.
- **Grounding is a skinned-surface problem.** Foot-bone origins, root height,
  and capsule position cannot prove that toes, knees, head, or a prone body stay
  above the floor.
- **Vertical COM is pose, not travel.** Strip planar root motion because the
  controller owns travel; never strip the vertical channel with it. A crouch,
  lunge or stagger is authored by lowering the COM, so removing it pins the
  torso at rest height and lifts the feet off the floor for the whole clip. The
  symptom is "the body is anchored in space and the feet come up to it", and it
  is invisible in any clip that happens to keep its COM near neutral — which is
  why idle looked fine while the guard entry floated 0.26 m.
- **Upward-only support protection cannot fix a hover.** Penetration mode only
  ever pushes an actor up. If a clip's lowest visible surface is already above
  the plane, nothing corrects it; measure `surfaceMinY` per clip and expect its
  minimum to sit at or just below zero for anything grounded.
- **A stride is authored for one ground speed.** Measure it (median planar
  velocity of a planted sole) and scale playback by the ratio. A controller that
  steps between two speeds without cadence matching reads as a stutter, not as
  foot-slide.
- **A filename that says "combat" says the arms are held.** Vanilla `1hm_*`
  locomotion damps arm swing on purpose; `mt_sprintforwardsword` is the plain
  sprint with only the sword arm damped. Compare per-bone rotation ranges
  between candidates before assuming an animation is broken.
- **Socket convention belongs to the rig, not the item.** Weapon assets keep
  their native attach-node axes; the armature keeps the importer's bone
  convention. Resolve that once per skeleton. A per-item quaternion tuned by eye
  hides the offset and silently invalidates every contact time measured against
  it.
- **Contact windows are measurable.** Track the blade through the clip and take
  the interval where it is both sweeping and inside the reach zone; cross-check
  it against a capsule-reachability test. Fractions of the clip picked by feel
  leave the sensor live through the wind-up and the follow-through.
- **Hurtboxes can be fitted, not authored.** Let each bone claim the skin it
  moves, fold short bones into their parent, and fit a capsule per surviving
  body part. Claim by *any* meaningful weight, not by dominant weight alone:
  limb bones share their skin with twist partners and end up owning almost
  nothing. Anatomical bone length must come from the farthest child, because
  twist bones start at their parent's head and averaging collapses the span.
- **Grounding calibration belongs to the body, not to what it wears.** Support
  envelopes, sole markers and the mesh-penetration allowance are all fitted to
  the bare body. Worn armour has no envelope of its own and legitimately reaches
  past bare skin, so it must be excluded from the actor's measured surface —
  folding it in compares a bare-body calibration against a shod silhouette and
  fails a scene that looks perfectly correct.
- **Do not raise a shod actor to stand on its soles.** A boot reaches a
  centimetre or two below bare skin and its sole visibly clips the floor, and
  every instinct says to lift the actor by that much. Three things go wrong, in
  order: adding it to the root position is cancelled next frame, because the
  solve reads the sole bones back out of the scene graph; raising the plane the
  solve aims at instead folds the lift into `groundCorrection` and trips every
  correction-magnitude limit; and once those are separated properly, *paired*
  animations break, because they align two actors whose boots are not the same
  thickness. Skyrim ships the same small clip. Accept it.
- **Importing a garment mutates the armature.** PyNifly adds a bone for any skin
  partition the rig lacks, and Bethesda ships truncated names (`NPC R Pauldro`).
  Snapshot the rig's bones before the first mesh import and fold strays back
  onto it, or the piece exports skinned to a joint no actor has and cannot be
  worn at all. A validation that checks "is this group a bone?" *after* the
  import can never fire.
- **A charge-up pose should be driven by its charge, not played at it.** Map the
  gameplay fraction (draw, wind-up, channel) onto the clip's *time* and set that
  time directly. The pose then is the state: a draw that stalls for stamina
  stalls on screen and one that slips home slips home, with no code
  synchronising two clocks that will drift.
- **Restarting a clip that is already playing is a visible hitch.** Raising a bow
  already in the hand changes the state, not the pose. Make the restart opt-out,
  and the "unexpected rendered run" the visual contract reports is the symptom
  to look for.
- **A callback that reads the equipped weapon must depend on it.** `useCallback`
  with an incomplete dependency list freezes whatever was in hand on the first
  render, so a bow's idle comes back as the sword's. It is invisible while there
  is only one weapon, and the tell is a stray animation command with an
  unrelated clip name in it.
- **Bethesda's `*arrowflight` NIFs are the projectile *effect*.** They carry a
  motion-trail quad several times the shaft's length. Left in, the length
  normalisation sizes the trail and the arrow comes out a fifth of its proper
  size, in a shape that reads as an arrow at a glance. Drop the effect shapes.
- **Transition defects hide between clips.** Always retain frames on both sides
  of every occurrence-specific boundary, including same-semantic restarts.
- **Jitter has multiple causes.** Separate source-bone spikes, loop timeline
  hitches, cross-fade discontinuities, and controller yaw oscillation before
  changing anything.
- **Quaternion signs can lie to diagnostics.** Compare rotation continuity with
  `abs(dot(q1, q2))`; `q` and `-q` are the same rotation and must not be reported
  as a visible 360° jump.
- **Action sampling must begin from the default rig pose.** Assigning a new
  Blender action does not reset properties it does not key. Reset the armature
  before sampling every action or baked support data becomes manifest-order
  dependent and can disagree with the exported GLB.
- **The production camera can mislead.** UI markers may remain foregrounded or
  follow an upper-body anchor; diagnose actor roles from body and weapon motion.
- **A clean endpoint needs screen time.** Merely reaching it on the final
  simulation tick still looks like a cut.
- **Keep the runtime simple.** Resolve import, timing, root-motion, and support
  metadata in the pipeline; runtime should consume a semantic manifest rather
  than accumulate source-specific exceptions.

## Change checklist

Before handoff, verify:

- [ ] The visual contract and owning layer were identified before editing.
- [ ] Candidate sources were compared in one batch on the canonical armed rig.
- [ ] Native duration, full endpoints, loop boundary, and source curves were checked.
- [ ] Pipeline config contains exact provenance and all source-specific treatment.
- [ ] GLB and generated manifest were rebuilt, validated, copied together, and hash-verified.
- [ ] Gameplay windows were not retuned to conceal presentation defects.
- [ ] Production action/animation paths and meaningful transitions are asserted.
- [ ] `visual:check` is green before anything was recorded.
- [ ] Only the affected group was recorded, and only because the owner will watch it.
- [ ] The project owner received the `review.html` path and a concrete question.
- [ ] A completed owner `PASS` was checked and attested for the unchanged inputs.
