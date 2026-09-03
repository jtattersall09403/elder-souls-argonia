# Polish backlog (Phase P — plan §86)

Rolling list for the general polish pass (module 95, "Phase P"). Add items
freely (owner or agents); one line each, with source and a concrete "done"
test. Remove items when shipped. This file is the single place deferred
cosmetic/feel work lives — do not park polish items in decision docs.

| Item | Source | Done when |
|---|---|---|
| **Water: full re-review of all water systems** (rivers, waterfalls, shore/sea lapping, marsh wetness, underwater, perf) — owner closed 8b as good-enough, explicitly **not perfect**; re-review and polish as a set at Phase P | 8b close (owner 2026-08-28) | owner walks a river source→sea + a beach + a marsh and signs off, remaining niggles fixed |
| **Minor routes painted and cleared** — the Part 3b tracks/footpaths/boardwalks (`routes-minor.json`) and any named `route.track.*` must be rasterised into the land cover (`refine_province.rasterize_roads` reads only the major roads today) and treated as thinned corridors by the vegetation scatter; boat lanes/channels likewise clear emergent reeds. **Must-do before Phase 15 rollout, not optional polish** | Phase 11 owner feedback 2026-09-03 (0041 Part 4 step 2) | walking a footpath in the deployed build shows a worn surface with no trunks in the way; a canoe channel is reed-free |
| Water: hero-pool interactive sim patches (jeantimex) at select POIs | 8b deferred (0025) | a hero pool ripples/reflects at full sim quality |
| Water: FFT open-sea tier (abyssal-ocean) for Topal Bay horizon | 8b deferred (0025) | open-sea swell quality on high tier, no perf regression |
| Water: projected bed caustics | 8b deferred (0025) | moving caustics on shallow beds in sun |
| Water: waterfall mist particles / sourced Skyrim FX meshes at major falls | 8b round 7 | falls carry mist + base splash FX beyond shader treatment |
| Water: any residual "barcode" foam artefacts after round-7 fix | 8b round 7 | none visible in a province sweep |
| Water: walk-mode SSR cost reduction + further DPR/rtScale tuning | 8b perf rounds | steady frame rate on owner's machine in dense water areas |
| Region raster reclassification (map tooltip coarse regions vs 8b water truth) | 8b round 5 §9 | tooltip region shapes match rendered water |
| **Weather/atmosphere: owner-reserved leftovers from the 8c close** — the owner closed 8c good-enough (2026-08-30) and will record the specific items here themselves | 8c close | owner has replaced this row with concrete items (or struck it) |
| Weather: mountaintop cap cloud (whiteout regime 3) — DISABLED 2026-08-30 (owner: hard square edges seen from ground level, a belt-mask raster-resolution artefact). Re-enable via `WHITEOUT_ENABLED` in `world-weather/express.ts` after rebuilding it properly (higher-res/softened mask sampling or a real cloud body) | owner request 2026-08-30 | cap cloud back on with no square edges from any camera |
| Weather: volumetric clouds high tier (takram three-clouds spike behind a flag — research doc §2.1 caveats: ECEF frame, postprocessing pipeline vs our envelope-pinned dome) | 8c deferred (0032) | storm anvils/cumulus read volumetric on the high tier, base tier unchanged |
| Weather: god rays / light shafts through canopy | 8c deferred (0032 §9) — needs Phase 10 canopy geometry first | sun shafts under the jungle roof at low sun |
| Weather: screen-space crepuscular god rays at cloud/mountain edges (GPU Gems 3 ch.13 radial blur; concrete recipe + template links in research doc §8.4) | 8c round 1 feedback, owner allowed deferral | visible rays past cloud edges/ridgelines at low sun, both canvases, no perf regression |
| Weather: rain-occlusion top-down depth map (Lagarde) + ground splash sprites | 8c deferred (0032 §6) — needs placed canopy/buildings to occlude under | drops vanish under real cover; splashes at hit points |
| Weather: screen-space lens droplets during squalls (third-person, tasteful) | 8c deferred | brief droplets on the camera in driving rain |
| Weather: thunder audio (distance-delayed crack + rumble tail) | 8c → module 57 (Phase 12b owns all audio) | flash→delayed thunder at 3 s/km |
| Physics mass-unit scale cleanup (ecctrl capsule ~0.25 units vs real-mass props) | 8b round 6 §5 | one consistent mass scale; Phase 9 boats depend on it |
| ~~Combat `10b`: shield parry uses the weapon parry~~ — **done 2026-08-31.** A shield now parries with its own shield-bash clips (Rim Parry's SHD set), on its own catch window, selected by `activeGuardAnimations`. Remaining owner taste question, if any: whether a *small* shield should parry differently from a tower shield | owner question 2026-08-30 (decision 0038) | shipped; row kept only until the owner has seen it |

## Combat (added 2026-08-31, from the parallel combat pass — decision 0040)

- **A bow downloads a sword's moveset.** `BOW_ANIMATIONS` borrows the
  one-handed set for the clumsy bash a bow makes when swung, so the `bow`
  animation pack has to depend on `oneHanded` (and through it `criticals`) —
  about 3 MB an archer fetches for a fallback swing. The fix is to let a weapon
  declare that it has no melee and have the combat FSM refuse the input, the
  way it already refuses a guard with a bow raised, rather than borrowing
  clips. Touches the non-optional melee fields of `WeaponAnimationProfile`.
- **Visual scenarios that open with an input pressed inside one sampling
  interval fail intermittently.** Several scenes press their first cue 0.05-0.15 s
  in, which is fewer than the three rendered samples the animation-path check
  demands of a run, so their opening idle is a coin flip under machine load
  (`light-chain`, `guard-defense`, `roll` and `greatsword-locomotion` were all
  seen flipping in round 4; the first three were widened one at a time). The
  proper fix is a harness-level lead-in — a fixed offset applied to every cue
  and every scenario duration — rather than nudging scenes as they are noticed.
  Done when a full suite run passes twice in a row on a loaded machine with no
  per-scene timing tweaks left in the file for this reason.
- **`heavy-chain` ground-correction overshoot.** The grounding solve moves the
  actor at 2.03 m/s against a 2.0 limit. Pre-existing rather than introduced by
  round 4 — it measures 2.096 on the commit that round branched from, and the
  HEAVY_2 re-measure improved it — so it wants its own look rather than being
  folded into an unrelated pass. Done when the gate passes without raising the
  threshold.
- **Arrows fired steeply upward are still slightly tumbly.** The flight model
  weathercocks and damps, and the owner judged round 4's behaviour "a bit tumbly
  but fine for now" and explicitly asked to revisit it in polish. Done when a
  shaft fired near-vertical arcs over point-first and settles without visible
  wobble on the way down.
- **Per-weapon riposte clips: which family plays which execution.** The owner
  wants a *stab* for the one-handed sword and dagger and a *swing* for the
  battleaxe. Round 5 fixed the audition tool and did the whole measurement pass;
  the answers are known and recorded here so the next attempt starts from
  evidence rather than repeating it. **The change itself was built and then
  reverted**, because it could not be made green — see below.

  What the clips actually contain (all six executions auditioned and every
  contact phase classified by tip-travel direction, `MEASURE_SHAPE=1`):
  - **The only reaching stab in the one-handed executions is Rim's dagger
    clip**, `1Execution/(2130000019)dagger`, strike at source 2.432 s. It works
    at sword blade length as well as dagger, reaching a torso out to 1.00 m.
    The spear and dual-wield executions contain no reaching thrust at all.
  - **The 2HW execution contains no chop that lands.** Its only two phases that
    bring the head within reach of a torso are forward drives (52% and 47% of
    travel along the attacker's facing); its one genuine overhead never comes
    closer than 0.72 m at any separation, because it is the wind-up.

  **The battleaxe half is now shipped.** The owner accepted a swing-specific
  contact rule, so `riposteWeaponContact` takes a `contactStyle` and a battleaxe
  ripostes with its own opening swing. The victim of a paired critical is also
  pinned in place now, which was a real bug: the arriving attacker's capsule
  shoved it, so every paired critical landed further out than its measured
  separation.

  **The sword and dagger stab is not shipped, and one thing blocks it.** It was
  built twice and reached green on all three of its own scenarios both times
  (`riposte`, `riposte-lethal`, `riposte-queued`). Every number it needs is in
  the commit history: Rim's dagger execution, trim source 2.165–3.298, strike at
  2.432, separation 0.8 m, entry blend 0.24 s (the blade sweeps while the pair
  is still closing), exit cross-fade 0.36 s. What stops it is that swapping the
  one-handed execution regresses **`greatsword-riposte`** to 0.48 m against a
  0.25 m limit, and the cause is genuinely not understood:
  - the greatsword's profile and attack-spec numbers were verified numerically
    identical to the passing state, after decoupling the two-handed timing so it
    inherits nothing from the one-handed execution;
  - its own animation pack is **byte-identical**, and so are the victim clips,
    the hurtbox fit and the rig data in the manifest. Only the `criticals` pack
    file differs, and only because one clip was swapped inside it;
  - the runtime pair measures ~0.25 m further apart than `executionAnchor` asks
    for, and stepping the separation in moves the result by roughly half the
    step — as if something still pushes the actors apart even with the victim
    pinned;
  - it is not the victim's pose: measuring the execution against `GUARD_BREAK`
    and against `RIPOSTED_HIT1` both give 0.234 m at 0.9 m.

  **Next step**: record the actual centre-to-centre distance at the damage frame
  in the scenario telemetry and compare it to `startingSeparation`. That one
  number says whether the anchor is being reached, and it is the only thing
  still missing. Done when the sword and dagger riposte read as thrusts with
  every criticals scenario green.

- **The remaining ten per-weapon executions.** The greatsword and battleaxe now
  have their own; Rim Parry ships thirteen (dagger, mace, spear, four shield
  variants, unarmed, dual and the one-handed one we already had). The blocker is
  gone — `measure-contact-windows.mjs --critical` is validated against the
  hand-audited one-handed execution and its header documents the four-step
  procedure — so each additional family is now roughly an hour, gated on that
  family having a moveset at all. Not urgent: nothing else has a moveset yet.
- **Per-weapon backstabs are assembled, not authored.** Vanilla has exactly one
  back-facing paired killmove (the 1hm one we use); its per-weapon killmoves are
  front-facing finishers, and the "backstabs for all weapon types" mods re-point
  existing killmoves through an ESP rather than shipping new animation. Round 4
  therefore assembles them: a thrusting class plays its own execution, a
  swinging class plays its own opening light attack, and both use a shared
  from-behind victim reaction (`movesets/criticals.ts`). Revisit only if a
  genuine per-weapon back-facing paired source turns up.
- **Contact windows for the one-handed set.** The measuring tool is fixed and
  now reproduces the calibrated LIGHT_1/LIGHT_2 windows to within a frame, and
  the two-handed set has been re-measured off it. LIGHT_3, HEAVY and HEAVY_2 on
  the one-handed set still differ from what it measures; those are
  owner-calibrated feel and were left alone. Worth one deliberate comparison
  playtest rather than a silent retune.
- **Two-handed heavy chains are unaffordable.** `heavy` into `heavy2` costs
  about 130 stamina against a 100 bar, so `GREATSWORD_HEAVY_2` and
  `GREATAXE_HEAVY_2` are built, wired and unreachable (recorded as animation
  exclusions). Either the chain should be affordable or the second heavy should
  not be chain-only — an owner/10c call, not a quiet stamina retune.
- **Poise numbers are provisional** (module 76 §121.3 says so explicitly).
  `poisePerArmourRating` is the one most likely to move; the debug panel's
  Poise switch and the HUD bar exist to make the comparison cheap.
- **Pivoting attack clips slide their feet, and only new clips fix it**
  (2026-09-03, round 5, 0040 §23). Foot-anchored motion can only apply travel
  the capsule can follow; a clip whose swing *spins the body* (one-handed
  HEAVY, greatsword HEAVY_2) carries metres of measured lateral displacement,
  and applying it slides the attacker off its target (proved by
  offense-outcomes / enemy-heavy-attack whiffing). The cure is sourcing
  non-pivoting variants of those specific swings — a mod-scene sourcing job,
  never a runtime rule or new art.
- **Locked-on strafe/back-walk still scrub slightly at full stick** (round 5).
  Cadence now follows real speed but the strafe clips are authored ~0.8 m/s
  against a 3.0 m/s locked walk and the band caps at 1.8×. Options: widen
  `CADENCE_MULTIPLIER_BAND` for locked locomotion, slow the locked walk (feel
  change — owner call), or source faster strafe clips.
