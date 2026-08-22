# Skyrim animation source audit

Audited 2026-08-21 against the owned local Skyrim Animation BSA and the current
pipeline output. Original archives/HKXs, pipeline GLBs, and rendered evidence
remain local and gitignored; the installed runtime character/weapon GLBs are
the deliberate GitHub Pages deployment exception.

## Selected mappings

| Semantic action | Current source | Result |
| --- | --- | --- |
| `SPRINT` | `meshes/actors/character/animations/mt_sprintforwardsword.hkx` | Selected. Dedicated 0.60 s sword sprint; replaces the sped-up run. |
| `GUARD_ENTER` / `GUARD` / `GUARD_HIT_A/B` | vanilla `1hm_blockanticipate`, `1hm_blockidle`, `1hm_blockhita/b` | Selected and driven as a weapon-profile sequence. |
| `PARRY` / `PARRY_FOLLOW_THROUGH` | vanilla `1hm_blockbashintro`, `1hm_blockbash` | Selected as one two-stage action. |
| `HEAL` | vanilla `idledrinkpotion` | Selected; complete motion fitted to the unchanged 1.55 s heal window at 3.65594×. Sword is temporarily sheathed because the clip drinks with the weapon hand. |
| `HIT` / `HIT_HEAVY` | vanilla `1hm_staggerbacksmall/large` | Selected; complete motions fitted to the unchanged 0.62 s reactions at 2.52694× / 3.97855×. |
| `RECOIL` | vanilla `1hm_recoiltimed` | Selected; complete motion fitted to the unchanged 0.42 s block recoil at 2.69833×. |
| `JUMP_START` / `JUMP_IDLE` | vanilla `mt_jump` source 0–0.5667 s → `mt_jumpfast` source 0.5667–0.8333 s | Selected after production-rig seam comparison. `JUMP_START` keeps its 0.18 s entry and uses a 0.03 s outgoing handoff; `JUMP_IDLE` plays the continuation at 1.3333×, filling the observed 0.20 s airborne interval before clamping on an airborne pose for longer falls. The audited seam differs by at most 1.01° and replaces the arm-jittering `mt_jumpfall` handoff. |
| `ROLL` | Dynamic Dodge 1.5, DMCO base `6000/MCO_DodgeForward2.hkx` | Retained after a 15-candidate, weapon-mounted FOMOD/OAR review: it is the semantically correct one-handed full tuck and clean upright recovery; `6006/MCO_DodgeForward1.hkx` rendered pixel-identically, weapon branches had the wrong grips, and vanilla/TK/TUD alternatives had weaker roll or recovery semantics. The 0.8667 s authored motion plays at 1.35422× in 0.64 s; with the exported leading held frame, the clean endpoint is reached at about 0.665 s and renders for at least 0.055 s inside the unchanged 0.72 s gameplay lock. Its visible-surface support envelope is sampled at 120 Hz to catch between-keyframe tuck penetration. |
| `BACKSTEP` | vanilla `meshes/actors/character/animations/1hm_walkbackward.hkx` | Selected after full-frame, weapon-mounted review as a guarded two-step retreat without the former hop, deep landing, or second rise. The complete 1.7667 s source cycle plays at 3.3975×, exactly filling the 0.52 s gameplay lock; native COM Z is preserved and entry/exit blends are both 0.08 s. Dynamic Dodge `6000/MCO_DodgeBackward1.hkx` and TK `70110/TKDodge/StepDodgeBack.hkx` rendered as the same floaty hop, while `6000/MCO_DodgeBackward2.hkx` and `70110/DodgeBack.hkx` were somersaults. |
| `RIPOSTE` / `RIPOSTED_HIT1` | Rim Parry Stand Alone v1.1, `(2130000018)1hmzl/1.hkx` + `(6141037)sword hit1/modernstaggerlock/1.hkx` | The 4.1 s attacker source is an irreducible three-hit execution, so runtime selects source 0.1667–1.3 s for its opening CQC02 lunge with 0.18 s entry and 0.24 s exit blends. Production-rendered blade/torso geometry fixes contact at attacker source 0.5667 s and visible withdrawal at 0.70 s. The victim holds `GUARD_BREAK` at source 0.55 s until contact, then starts `RIPOSTED_HIT1` at source 0.1333 s through a 0.08 s blend and plays continuously through its untrimmed 2.0 s recovery; no withdrawal restart or intervening guard/idle is permitted. This exact candidate won the paired normal-speed and dense-frame audition; the other `sword hit` variants and knockdown source produced incoherent contact or recovery. |
| `BACKSTAB` / `BACKSTABBED` | Backstab v1, `paired_1hmsneakkillbacka.hkx` | Selected. One paired HKX is split into ordinary attacker and `2_` victim 99-track actions. Authored separation is 0.861 m at the generated rig's 0.15356 runtime scale; contact is 1.50 s and physical alignment releases at 2.20 s. Both roles begin at source zero through a 0.24 s entry blend. A surviving victim remains in the same `BACKSTABBED` command through the complete authored wounded recovery; at the separate 2.90 s outcome point only a lethal victim blends into `CRITICAL_DEATH` at source zero over 0.35 s. The attacker always retains its full 3.1667 s action. |
| `CRITICAL_KNOCKDOWN` | Rim `(6254014)Knockdown/modernstaggerlock/1.HKX` | Retained in the generated asset as rejected legacy audition material, but explicitly excluded from production runtime semantics: its unrelated opening and stand-up do not form coherent paired critical choreography. |
| `CRITICAL_DEATH` | Rim `(6254014)Knockdown/modernstaggerlock/1.HKX`, source prefix through 1.9 s | Selected lethal fall. Riposte enters at source 0.5667 s on contact through a 0.10 s blend; backstab enters at source zero at its 2.90 s outcome point through a 0.35 s blend. The render is fully supine at 1.9 s, before recovery begins near 2.0 s, so lethal victims remain down. |
| `GUARD_BREAK` | vanilla `1hm_staggerbacklarge` | Selected. A standing, guard-open recoil whose complete 2.4667 s motion is fitted to the established 1.75 s posture window at 1.40954×. The #94840 largest-stagger candidate was rejected because its prolonged one-knee collapse reads as knockdown/submission rather than a Souls-style guard break. |
| `DEATH` | Rim `(6254014)Knockdown/modernstaggerlock/1.HKX`, source 0–1.9 s | Selected for ordinary lethal outcomes as well as `CRITICAL_DEATH`. It supplies a complete impact → backward fall → stable prone pose; source 0.82–0.95 remains airborne, 0.95–1.10 uses upward-only penetration prevention, and 1.10–1.90 is exact floor contact. The old vanilla `deathanimationa` only read as a stagger and never reached a credible grounded death. |
| stationary/moving/sprint landing | velocity-selected vanilla `mt_jumpland` | Selected with controller velocity retained: 0.58 s stationary, 0.42 s moving, 0.36 s sprint, and 0.46 s hard-impact recovery. A 0.18 s entry blend plus baked visible-surface contact keeps takeoff/airtime free while both landing edges remain support-safe. |
| `JUMP_LAND_LEFT/RIGHT` | vanilla `mt_jumplandleft/right` | Audition-only. Both contain quarter-turns and are not runtime-selected. |
| sword attachment | `Weapon` held / `WeaponSword` sheathed | Selected. Socket-local XYZW quaternions live in `STRAIGHT_SWORD.visual`; verified through eight animated actions. |

## External archive record

Nexus file listings were queried before download. Originals and extracted
assets are preserved under the pipeline's ignored
`skyrim-source/mod-sources/`; no archive or extracted HKX is tracked. The game
repo versions only its installed runtime GLBs under the explicit deployment
authorization described in `rebuilding-the-character.md`.

| Mod | Author / version | Nexus file | Exact downloaded archive |
| --- | --- | --- | --- |
| [Dynamic Dodge Animation #79598](https://www.nexusmods.com/skyrimspecialedition/mods/79598) | lSmoothl, 1.5 | `429066` | `Dynamic Dodge-79598-1-5-1695708046.zip` |
| [Rim Parry and Execution #114366](https://www.nexusmods.com/skyrimspecialedition/mods/114366) | SHADOWPQ, v1.1 | `499427` | `00 Rim Parry Stand Alone - v1.1 Update-114366-v1-1-1715262891.zip` |
| [Backstab animation for sneak killmove SE #74453](https://www.nexusmods.com/skyrimspecialedition/mods/74453) | Ichaflash (original), rhonjhonson (uploader), 1 | `312246` | `Backstab animation for sneak killmove SE-74453-1-1662026614.zip` |
| [NPC Parry Style Stagger animations #94840](https://www.nexusmods.com/skyrimspecialedition/mods/94840) | SHADOWPQ, v1.0 | `406235` | `Largest Stagger for NPC separate stagger version-94840-v1-0-1689101918.zip` |

The pipeline's ignored `SOURCES.json` records archive SHA-256 values and full
selected paths. Its public `docs/mod-animation-ingestion.md` records the safe
Nexus workflow and FOMOD/OAR/paired-HKX interpretation.

Dynamic Dodge's UTF-16 FOMOD was followed through `Roll to cancel attack` →
DMCO 0.9.6. The base priority `6000` branch has no attack-cancel condition;
higher priorities add weapon or `IsAttacking` specialization. The archive is
still the selected `ROLL` provenance; the attack-cancel base `6006` forward
variant rendered pixel-identically to the selected `6000` motion, so changing
files would not improve the roll. No backward branch passed the
backstep review: the DMCO Backward1 and TK StepDodgeBack branches are
render-identical anticipation/hop/deep-land motions, and their Backward2/
TK DodgeBack alternatives are backward somersaults. Production `BACKSTEP`
therefore comes from the base-game BSA rather than Nexus file `429066`.

Rim's OAR config identifies the selected attacker as one-handed sword/no
off-hand weapon or shield. Four plausible victim folders were rendered across
their complete source durations; `(6254014)Knockdown` was the only candidate
that carried the impact through floor contact and its own recovery. Guard
break's auditioned `(2399)` package branch is the right-hand type-1/no-shield
separate-largest-stagger variant; its archive remains preserved for provenance,
but it is not the production `GUARD_BREAK` selection.

The backstab archive does not provide a separate B file. Native HKX inspection
found a `PairedRoot` skeleton with 201 tracks: two complete 99-track actors plus
their group roots. The pipeline imports the same HKX twice: ordinary tracks are
the approved attacker, while the `2_` prefix is stripped for the victim action.
The second group offset is 56.062 Skyrim units,
which becomes 0.861 m after the 0.1 import scale and generated 0.15356 runtime
character scale. Recompute this value from the generated manifest whenever a
rig rebuild changes `recommendedScale`; otherwise the two authored roles no
longer meet at their intended distance.

## Generated visual evidence

The reusable headless renderers are
`elder-scrolls-asset-pipeline/pipeline/blender/render_action_preview.py` and
`render_paired_preview.py`. Local mod candidate and paired GIF/contact-sheet
evidence is under pipeline `output/animated-mod-audition/`,
`output/paired-backstab-authored*`, `output/paired-riposte*`, and
`output/riposte-victim-audition/full-motion/`. Backstep source/rate comparisons
are under `output/backstep-vanilla-search-a/` and
`output/audition-backstep-vanilla-search-a.glb`; these contain derived
mod/Bethesda imagery and remain local. The production-path browser
scenes are documented in
[`../validation/animation-recordings.md`](../validation/animation-recordings.md).
