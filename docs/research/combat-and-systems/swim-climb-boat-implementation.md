# Swimming, climbing and boats — implementation research for Phase 9 (2026-08-28)

Known-good patterns and reference material for implementing the traversal modes of
[module 60 §43–46](../../world/60-water-traversal.md): swimming (surface + submerged),
BotW-style climbing, and boats. **Inspiration, not prescription** — the implementing
agent decides architecture. Design intent lives in module 60; sourced-clip candidates
in [module 90 §74.3](../../world/90-asset-strategy.md); this doc covers *mechanics*.

**What we already have (don't rebuild):** `WorldWaterQuery.sample()` returns surface
height (waves included), normal, flow velocity, depth and immersion at any (x,z), with
the wave function CPU/GPU-mirrored via a shared `waveTimeS` accumulator
(`packages/game-core/src/water/waterWorld.ts`, `waves.ts`). That is exactly the
"duplicate the wave math on the CPU, one shared time source" pattern the industry
recommends for buoyancy/visual sync (see §1.4) — buoyancy and swimming consume this
query; nothing should re-derive water height. The renderer already has an underwater
blit pass (`apps/world-studio/src/water/`), so swim-camera work extends an existing
transition rather than starting one.

## 1. Buoyancy in Rapier

### 1.1 The canonical reference: Kerner's boat model

Jacques Kerner (Avalanche, Just Cause 3) wrote the definitive games-buoyancy series:
[Part 1](https://www.gamedeveloper.com/programming/water-interaction-model-for-boats-in-video-games)
(hydrostatics) and [Part 2](https://www.gamedeveloper.com/programming/water-interaction-model-for-boats-in-video-games-part-2)
(hydrodynamics). Verified content, summarized:

- **Surfacic, triangle-based**: don't compute displaced volume; sum hydrostatic pressure
  over submerged hull triangles (`ρ·g·depth·area·normal` per triangle). Sphere-packing a
  hull "quickly turns into a nightmare".
- **Waterline cutting**: classify each hull triangle by vertices-under-water (0/1/2/3),
  cut partially submerged ones into sub-triangles. Max submerged triangle count is 2×
  hull triangles — preallocate. Budget: <1ms per boat.
- **Force application point matters**: applying at the centroid leaves residual torque
  ("boat tips on one side at rest"); Part 1's Appendix A gives the center-of-pressure fix.
- **Part 2's three dynamic forces**, each per-triangle with its own tuning coefficient:
  viscous resistance (ITTC-1957 friction), pressure drag (a deliberate "gross
  simplification" that still produces planing), and slamming (computed as
  the force that would stop penetration in one frame, blended by intensity — explicitly
  to avoid stiff-spring timestep explosions).
- **A local "water patch"** (small heightmap grid around the boat) amortizes water-height
  queries — our raster samplers are cheap, but the idea transfers if sampling ever shows
  up in profiles.

### 1.2 The cheap tier: probe points

For everything that isn't a hero boat, the shipped-game standard is 4–8 fixed probe
points: each probe samples water height at its world position, applies an upward force
proportional to immersion (clamped at the probe's nominal volume) at that point, plus
per-probe damping. A classic worked description is the
[Bullet forum boat-buoyancy thread](https://pybullet.org/Bullet/phpBB3/viewtopic.php?t=5234)
(4 floats: bow/stern/port/starboard, volumes tuned to counteract gravity);
[Vertex Fragment's "Buoyancy for Dummies"](https://www.vertexfragment.com/ramblings/buoyancy-for-dummies/)
and [Habrador's Unity boat tutorial](https://www.habrador.com/tutorials/unity-boat-tutorial/3-buoyancy/)
cover the same spectrum (single-point spring-damper for crates/props → triangle cutting
for boats). Inferred recommendation: probe points are almost certainly enough for our
canoes/skiffs/rafts on calm marsh water; Kerner's triangle model is the upgrade path if
a sailboat on Topal Bay swell reads wrong. Both are just "sample `WorldWaterQuery`,
apply force at point" — the tiers can share one component.

### 1.3 Rapier specifics (verified against [rapier.rs JS user guide](https://rapier.rs/docs/user_guides/javascript/rigid_bodies))

- `RigidBody.addForceAtPoint(force, point, wakeUp)` and
  `applyImpulseAtPoint(impulse, point, wakeUp)` exist — exactly the per-probe primitive.
- **Forces persist across steps**: `addForce`/`addForceAtPoint` accumulate until
  `resetForces(wakeUp)`/`resetTorques(wakeUp)`. A per-frame buoyancy loop must reset
  first or forces compound — a classic Rapier footgun.
- **Sleeping**: bodies sleep after moving slowly for a while; forces alone do *not* wake
  them — pass `wakeUp = true`. Conversely, a boat at rest under balanced buoyancy may
  never sleep if probes keep nudging it; consider deadbanding tiny corrections, or let
  a moored/idle boat be switched kinematic (see §2.4).
- `setLinearDamping` / `setAngularDamping` are per-body — the cheapest "water drag";
  raise them with immersion. `setGravityScale(0)` while fully controlled (swimmer) is
  legitimate. `enableCcd(true)` only for fast movers; probe forces don't need it.
- Fixed-timestep note: Kerner used Euler + fixed dt; Rapier is fixed-dt by design.
  Buoyancy must run in the physics step (R3F: `useBeforePhysicsStep` in
  @react-three/rapier), not in the render frame — Unity guidance says the same
  (FixedUpdate) ([Habrador](https://www.habrador.com/tutorials/unity-boat-tutorial/3-buoyancy/)).

### 1.4 Physics/visual wave sync

The industry-standard answer to "boat clips through rendered waves" is to run the same
wave function on CPU and GPU from one time source —
[Crest's collision docs](https://crest.readthedocs.io/en/stable/user/collision-shape-and-buoyancy-physics.html),
UE4's [Physical Water Surface](https://nerivec.github.io/old-ue4-wiki/pages/physical-water-surface.html)
(desyncs traced to mismatched time values), and a
[Godot Gerstner buoyancy example](https://www.seacreaturegame.com/blog/gerstner-waves-with-buoyancy-godot)
that reads wave params straight off the material. **We already do this** (decision 0025).
One verified pitfall applies to us: Gerstner-style waves displace *horizontally* too, so
height-at-(x,z) is not height-of-the-displaced-surface-above-(x,z); fixes are fixed-point
iteration or ignoring the error when amplitudes are small
([GameDev.net thread](https://gamedev.net/forums/topic/689445-finding-height-of-gerstner-wave-at-coordinates/)).
Our `surfaceWaveAt` returns dx/dz — check whether `WaterWorld.sample` compensates before
trusting it for hull probes in high-exposure water (marsh amplitudes likely make it moot).

## 2. Boat control feel

### 2.1 Reference games

- **Valheim** ([wiki](https://valheim.fandom.com/wiki/Boats)): wind-driven sailing with
  strong up/downwind asymmetry, auto-turning sails, ram damage scaling with impact speed
  (checked every 0.5s), and unapologetically gamey shortcuts — releasing the rudder and
  jumping off stops the boat dead. Lesson: players accept (want) non-physical
  convenience at the mount/dismount boundary.
- **Sea of Thieves**: the deep-dive is the SIGGRAPH 2018 talk
  ["The Technical Art of Sea of Thieves"](https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf)
  — mostly rendering (FFT water, scattering, GPU rope/fluid), useful for Topal Bay
  ambitions more than control feel.
- **TotK rafts/boats** (guides: [Game8](https://game8.co/games/Zelda-Tears-of-the-Kingdom/archives/413701),
  [Gamerant](https://gamerant.com/zelda-tears-of-the-kingdom-boats-and-rafts-crafting-guide/)):
  craft behaviour *emerges* from per-part buoyancy + thrusters — fewer logs = less
  stable, asymmetric fans spin you, sails couple to wind while fans don't, and steering
  needs a dedicated device (steering stick) or weight-shift. Strong inspiration for our
  probe-buoyancy model: stability and handling fall out of probe layout and thrust
  placement rather than bespoke code per boat class.
- **Rowing/paddling input** ([PreviewLabs VR rowing](https://previewlabs.com/rowing-physics/),
  stroke-timing games, [kayak technique refs](https://paddling.com/learn/using-a-kayak-rudder)):
  proven patterns are (a) discrete impulse-per-stroke, optionally with a timing window,
  and (b) held-input continuous thrust with stroke-cadence animation on top. Two feel
  findings worth stealing: **anisotropic drag** (~50% higher lateral than forward drag
  made a VR boat finally feel "in water"), and **turn authority coupled to forward
  speed** (real stern-rudder steering only works with way on, and costs speed —
  a natural, defensible handling model). Real rudders exist mainly to hold a course
  against wind/current, not to turn — supports letting flow/current weathercock the
  boat and making the player counter it.

### 2.2 Current/flow coupling (inferred — no direct source found)

Our `flowVelocity` gives a per-position water velocity. The standard treatment: drag
acts on *relative* velocity (`v_boat − v_water`), so a boat in a 2 m/s river drifts to
2 m/s with no input, and upstream travel fights full drag. Applying flow sampled at
bow and stern separately yields free weathercocking torque in bends. This is
straightforwardly derivable physics, but no shipped-game writeup of river-flow boat
coupling was found — treat as a prototyping question.

### 2.3 Waves vs the mean plane

Options seen in the wild: simulate against full displaced surface (probes sample waves
— what Crest/Kerner do), or simulate on still water and add visual-only bob (the Skyrim
modding approach — [Animated Ships Bobbing and Motion](https://www.nexusmods.com/skyrimspecialedition/mods/187453)
is literally animation, per module 90 §74.3). Since our query already returns the waved
surface, probes-on-waves costs nothing extra; if choppy water makes aiming/boarding
miserable, sampling `stillSurfaceAt` + reduced wave gain is a one-line retreat
(inferred).

### 2.4 Mounting, docking, camera

Valheim/SoT board via proximity interact + snap-to-seat (no physics climb-aboard);
module 90 §74.3 expects seated poses + procedural oar/tiller for us, which matches.
While mounted, the proven pattern is: player controller goes kinematic/disabled and is
parented to a seat socket; the boat becomes the "character" the input drives (the ecctrl
roadmap's own vehicle modes imply the same controller-swap shape,
[ecctrl readme](https://github.com/pmndrs/ecctrl)). Camera: orbit target follows the
boat but with heavier smoothing/lag than on foot so wave motion doesn't pump the camera
(inferred — standard damping practice). No ready-made three.js/Rapier boat demo exists
to copy — searches found only fragments ([react-three-rapier](https://github.com/pmndrs/react-three-rapier)
primitives, [jeantimex/threejs-water](https://github.com/jeantimex/threejs-water) for
bounded pools) — expect to build the boat body from the §1 patterns directly.

## 3. Swimming character controllers

### 3.1 State machine and thresholds

Consistent pattern across sources ([Catlike Coding Swimming](https://catlikecoding.com/unity/tutorials/movement/swimming/),
[MoCap Online swim-animation guide](https://mocaponline.com/blogs/mocap-news/swimming-animation-games-guide),
[Opsive swim pack docs](https://opsive.com/support/documentation/character-controller-swimming-pack/swim/)):

- **Submergence drives the state**, not a trigger volume alone: wade while shallow, swim
  above a configurable submergence threshold (Catlike Coding defaults to ~0.5 of body
  height). Our `WaterSample.immersion` is exactly this scalar.
- **Grounded machinery must yield**: ground snapping fights buoyancy (verified Catlike
  Coding gotcha — "buoyancy appears to fail near the bottom because SnapToGround
  counteracts it"); disable snap, step-offset and foot IK in swim states.
- **Surface vs underwater is a head-depth blend**: trace/sample from head height to the
  surface; blend surface-swim ↔ underwater-swim animation states on that distance.
- **Physics**: scale gravity down or off (Opsive exposes "percent of gravity retained
  in water" + a buoyancy amount; UE's swim mode has a Buoyancy scalar defaulting to
  neutral — [Versluis UE swim guide](https://www.versluis.com/2020/10/swiming-in-ue4/)),
  add drag, clamp vertical speed. With ecctrl's floating-capsule design the cleanest cut
  is likely `setGravityScale(0)` + direct velocity control in the swim mode (inferred).
- **Capsule reorientation**: surface/underwater swim wants a horizontal capsule (Opsive
  ships a dedicated capsule repositioner). With a heightfield bed and generous depths we
  may get away with keeping the capsule vertical and only tilting the *visual* rig —
  worth prototyping before committing to rotated-collider complexity (inferred).
- **ecctrl has no swim support** — it's a roadmap item
  ([readme](https://github.com/pmndrs/ecctrl); nearest issue is
  [#111 flying/climbing](https://github.com/pmndrs/ecctrl/issues/111)). Swim, climb and
  boat are therefore *our* modes behind `PlayerMovementController`, with ecctrl active
  only in grounded mode — which the adapter boundary already anticipates (module 60 §43).

### 3.2 Feel references

- **Skyrim (the baseline players expect)**: surface swim + dive, breath meter with
  drowning damage, no underwater combat, Argonian waterbreathing as a racial
  ([UESP Waterbreathing](https://en.uesp.net/wiki/Skyrim:Waterbreathing_(effect)),
  [Fandom Swimming](https://elderscrolls.fandom.com/wiki/Swimming)). Morrowind *did*
  allow underwater combat — and our design (module 60 §44) needs underwater play to be
  first-class, so Skyrim is the floor, not the target.
- **Subnautica (the underwater-feel target)**: dedicated ascend/descend buttons
  (Space/C) are repeatedly cited as the model for 3D water movement; devs explicitly
  chose feel over realism (fast swim speeds; visible stroke animation "so you feel like
  you're swimming rather than floating") and made spaces readable from any approach
  angle since a third axis removes designer control of paths
  ([dev interviews](https://mein-mmo.de/en/exclusive-why-we-hate-underwater-levels-but-love-subnautica-2-heres-what-6-of-the-game-designers-say,1570132/),
  [forum answer on the swim animation](https://forums.unknownworlds.com/discussion/136051/underwater-swimming-animation)).
  Camera-relative pitch swimming (look where you want to go, hold forward) plus explicit
  vertical keys is the consensus hybrid.
- **Breath/stamina UI**: Skyrim draws a breath bar only while submerged; module 76 §103
  already binds breath capacity to athletics for non-Argonians and exempts Argonians —
  the capability profile in module 60 §43 carries it. Waterline camera transitions are
  a solved per-pixel problem (mask, not a boolean flip —
  [GameDev.net thread](https://gamedev.net/forums/topic/595916-water-rendering-seamless-overunder-transitions/),
  [Unity HDRP water-line docs](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.1/manual/water-underwater-view.html));
  our 8b underwater pass already switches on camera immersion — verify it behaves at
  wave-cut partial submersion rather than rebuilding.

## 4. BotW-style climbing

### 4.1 Design source

The GDC 2017 talk ([Change and Constant — GDC Vault](https://www.gdcvault.com/play/1024562/Change-and-Constant-Breaking-Conventions),
[free recording](https://archive.org/details/gdc-2017-breaking-conventions-with-the-legend-of-zelda-breath-of-the-wild))
is design rationale, not implementation: climb-everything as the core of "active" play,
the triangle rule shaping terrain into climb-or-go-around choices. Mechanics numbers
from community wikis (verified against multiple sources): stamina drains linearly while
climbing, jumps cost a chunk; ladders are free and work at zero stamina
([Zelda Wiki Climbing](https://zelda.fandom.com/wiki/Climbing)); rain makes Link slip
after ~4 moves (players exploit "climb 4, jump" to still net progress); Climbing Gear
gives +20/25/30% climb speed for 1/2/3 pieces; TotK added a slip-resistance effect
because rain-blocking was the most disliked mechanic
([Slip Resistance](https://www.zeldadungeon.net/wiki/Slip_Resistance)). Our
`wetGripMultiplier` (module 60 §46) should learn from that reception: degrade, don't
deny (inferred).

### 4.2 The best implementation writeup

[Vitor Cantão's UE recreation](https://www.vitorcantao.com/post/climbing-system/) is the
most complete public breakdown and maps almost 1:1 onto Rapier primitives:

- **Detection by capsule shape-sweep**, not a single ray — sweeps forward of the chest
  each frame, collecting *all* hits; position = centroid of hit points, normal =
  normalized sum, with small secondary sphere-casts toward each hit to fix bad normals
  from overlapping geometry. Handles corners/bumps where single rays flicker.
- **Attach rule**: horizontal angle between facing and wall normal within ~25°;
  ceilings rejected by normal-vs-up dot; an eye-height ray confirms a real surface.
- **Stick**: interpolate character rotation toward −normal; spring toward a fixed
  standoff (~45cm) from the surface each frame rather than colliding with it.
- **Input projection**: forward input → up along the wall via
  `cross(surfaceNormal, −right)`; right input likewise — i.e. build a tangent basis
  from the live normal, don't hardcode world-up.
- **Top-out**: auto-trigger when moving up fast enough, the eye ray finds no wall, and
  the ground above is walkable; play a root-motion mantle clip after a capsule-sweep
  check that the destination is clear. Climb-down-to-floor is the symmetric check.
- **Climb dash** (BotW's ×-jump): a time→speed curve, direction projected onto the
  surface plane so momentum survives corners.
- IK on top: per-limb traces to the surface feeding full-body IK so hands/feet contact
  irregular rock. [Catlike Coding Climbing](https://catlikecoding.com/unity/tutorials/movement/climbing/)
  covers the same ground in a physics-first style, including inner/outer corners,
  moving walls, and marking surfaces unclimbable via masks.

### 4.3 Rapier mapping (verified against [scene queries docs](https://rapier.rs/docs/user_guides/javascript/scene_queries))

`world.castShape(...)` returns witness points and normals (the sweep);
`castRayAndGetNormal` gives per-ray surface normals (eye/limb probes);
`projectPoint` gives closest-point-on-collider (surface snap); all take
filter groups/predicates — a `climbable` collision group implements
`ClimbSurfaceProfile.climbable` directly. Our terrain is a heightfield with faces up to
~85°: heightfield normals are well-defined per triangle, so the same probe code covers
terrain and placed rock meshes; true overhangs only come from placed assets, so the
"reject ceilings" rule is safe on terrain and only needs care on props (inferred from
our worldgen constraints). The climb *mode* is best run kinematic
(`setNextKinematicTranslation`) or gravity-scale-0 dynamic — sources use both;
kinematic avoids fighting the solver on 85° slopes (inferred).

## 5. IK / procedural layering over sourced clips (survey only)

Per module 90 §74.3 the clips are the art (EVG ladder loop as the climb cycle,
SkyParkour one-shots for mantles, seated poses + procedural oar for rowing); code steers
them. State of the three.js IK ecosystem
([Web Game Dev survey](https://www.webgamedev.com/assets/inverse-kinematics)):

- **CCDIKSolver** ([docs](https://threejs.org/docs/pages/CCDIKSolver.html)) — the
  maintained official addon; works on any SkinnedMesh; fine for two-bone limb chains.
- **THREE.IK (jsantell)** — FABRIK, [effectively dormant](https://github.com/jsantell/THREE.IK);
  don't build on it. [upf-gti/IK-threejs](https://github.com/upf-gti/IK-threejs) offers
  CCD+FABRIK; **closed-chain-ik-js** handles loops (two hands on one oar — our rowing
  case); **Ossos** is the newer character-animation toolkit.
- The most convincing published results are custom analytic two-bone leg/arm IK +
  physics raycasts, blended with the playing clip
  ([three.js + Rapier leg-IK showcase](https://discourse.threejs.org/t/procedural-leg-ik-in-three-js-rapier/91203),
  [foot placement thread](https://discourse.threejs.org/t/placing-animated-character-feet-onto-the-ground/10851))
  — which is what our sandbox foot-planting already does; climbing hands and oar hands
  are the same family (limb-target from a surface probe or oar socket, blend weight from
  state). UE's climbing IK (Cantão) confirms the trace-per-limb → additive-offset shape.

## Verified vs inferred

**Verified** (fetched/primary): Kerner parts 1+2 content; Rapier force/impulse-at-point,
force persistence + `resetForces`, sleeping/wake semantics, damping, gravity scale, CCD,
kinematic modes; Rapier shape-cast/ray-normal/project-point APIs; Cantão climbing
implementation details; Catlike Coding swim/climb gotchas; ecctrl's lack of swim/climb;
BotW stamina/rain/gear numbers (community wikis, cross-checked); Skyrim swim baseline;
CPU/GPU wave-sync practice and the horizontal-displacement pitfall.

**Inferred** (our synthesis — validate in prototype): probe-buoyancy sufficing for small
craft on marsh water; relative-velocity flow coupling and bow/stern flow torque; boat
camera damping; vertical-capsule + visual-tilt swimming; kinematic climb mode; "degrade
don't deny" wet grip; ceiling-reject safety on our heightfield.

## Open questions

1. Does `WaterWorld.sample` need horizontal-displacement compensation for hull probes in
   high-exposure water, or are marsh/river amplitudes small enough to ignore (§1.4)?
2. Impulse-per-stroke vs held-thrust rowing: which reads better with the sourced seated
   poses + procedural oar, given no timing-minigame appetite has been expressed?
3. Where exactly does the wade→swim handoff sit for ecctrl (immersion ~0.5?), and does
   ecctrl tolerate being suspended/resumed cleanly, or does grounded mode need a
   re-entry snap?
4. Rotated swim capsule vs vertical capsule + visual tilt — does the vertical capsule
   break shallow-clearance underwater tunnels (§44 POIs need real 3D swim spaces)?
5. Climb mode: kinematic body vs gravity-scale-0 dynamic — which coexists better with
   moving platforms/boats we may later want climbable?
6. Do we mirror BotW's slip-on-wet (periodic loss) or a pure stamina-drain multiplier?
   Owner feel call after prototype; TotK's walk-back suggests player patience is thin.
7. Boat sleeping: deadband probe forces so idle boats sleep, or switch moored boats
   kinematic? Affects village-full-of-canoes performance.
8. Can the EVG ladder loop really carry lateral/diagonal wall movement (it's authored
   vertical), or does lateral climb need a strafe-blend the micro-lab must audition?
