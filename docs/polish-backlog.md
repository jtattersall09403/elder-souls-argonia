# Polish backlog (Phase P — plan §86)

Rolling list for the general polish pass (module 95, "Phase P"). Add items
freely (owner or agents); one line each, with source and a concrete "done"
test. Remove items when shipped. This file is the single place deferred
cosmetic/feel work lives — do not park polish items in decision docs.

| Item | Source | Done when |
|---|---|---|
| **Water: full re-review of all water systems** (rivers, waterfalls, shore/sea lapping, marsh wetness, underwater, perf) — owner closed 8b as good-enough, explicitly **not perfect**; re-review and polish as a set at Phase P | 8b close (owner 2026-08-28) | owner walks a river source→sea + a beach + a marsh and signs off, remaining niggles fixed |
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
| Combat `10b`: shield parry — with a shield equipped, parrying still uses the weapon parry. Owner taste ruling at 10b kickoff: DS-style small-shield parry (a clip-sourcing job) vs keep weapon-only. Block-vs-parry already matters mechanically (guard stability + poise, 76 §120/§121.3) | owner question 2026-08-30 (decision 0038) | ruling recorded; if kept, shield parry works in the studio |

## Combat (added 2026-08-31, from the parallel combat pass — decision 0040)

- **A bow downloads a sword's moveset.** `BOW_ANIMATIONS` borrows the
  one-handed set for the clumsy bash a bow makes when swung, so the `bow`
  animation pack has to depend on `oneHanded` (and through it `criticals`) —
  about 3 MB an archer fetches for a fallback swing. The fix is to let a weapon
  declare that it has no melee and have the combat FSM refuse the input, the
  way it already refuses a guard with a bow raised, rather than borrowing
  clips. Touches the non-optional melee fields of `WeaponAnimationProfile`.
- **Contact windows need re-measuring.** `scripts/measure-contact-windows.mjs`
  had been reading a GLB path that stopped existing at the Phase 7 package
  extraction, so it has not run since; it is fixed and pack-aware now, but its
  output no longer agrees with the calibrated one-handed windows it originally
  produced. Both sets — one-handed and the two new two-handed movesets, which
  currently inherit the one-handed contact *fractions* — want measuring against
  the production rig in one focused pass. Do not retune the calibrated
  one-handed feel on the tool's word until the disagreement is explained.
- **Two-handed heavy chains are unaffordable.** `heavy` into `heavy2` costs
  about 130 stamina against a 100 bar, so `GREATSWORD_HEAVY_2` and
  `GREATAXE_HEAVY_2` are built, wired and unreachable (recorded as animation
  exclusions). Either the chain should be affordable or the second heavy should
  not be chain-only — an owner/10c call, not a quiet stamina retune.
- **Poise numbers are provisional** (module 76 §121.3 says so explicitly).
  `poisePerArmourRating` is the one most likely to move; the debug panel's
  Poise switch and the HUD bar exist to make the comparison cheap.
