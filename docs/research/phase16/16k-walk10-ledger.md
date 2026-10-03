# 16k walk 10 ledger (2026-10-02 to 2026-10-03)

What the round delivered, lane by lane, and what is open. Lane reports are in `tooling/.reports/16k/walk10/` (`perf-lead.md`,
`webgpu-lead.md`, `audit-lead.md`, `vol-lead.md`, `audit-round3.md`). The round closed on the owner's wrap-up override of 2026-10-03: no further measuring.

## 1. Main-studio performance (classic WebGL, perf10)

Bar: the M2 at 60 fps. Pod (RTX 3070) reads are converted at r = 1.38 (pod fps / 37 at Riverwalk night rain, pre-fix build). Pod bars: settled fps at
least 83, 1 % low at least 69, complete scene under 10 s.

- Result: 49 of 50 spots pass the fps bars; the table is in [performance-lane.md](../../phases/lanes/performance-lane.md) § Acceptance. The one failure,
  the Greenspring walk (1 % low 60.6), was fixed in `adef4d99`; the part-way re-read gave 146.1.
- Load: the complete scene takes 15-18 s on every cold row against the 10 s bar. The owner accepted it.
- The fixes, in one paragraph: per-frame shader re-derivation (the precip, overlay and bloom layers saw zero lights, so every lit material relinked twice a
  frame), the Rapier per-step body snapshot, fixture sprites relinking, the per-frame patch walk, the camera-pivot test against the terrain heightfield
  (4 ms a frame), the 3 s apron rebuild and 2 s settlement retry hitches, the first uniform-buffer bind per program, empty instanced draws, per-piece material
  clones, and the water sky bake, ripple fade and shore fade. Settled fps rose 1.8-2.6x in the first four batches. Evidence per fix: decision 0108 § 7d and § 7f.
- Decision 0120 stage 2: kits are fetched per piece (parts), spawn ring first. The early program warm (`454df8ba`) bakes `kits/program-classes.json`
  (22 classes) and warms the 16 settlement classes at layer mount. It landed after the acceptance read and is unmeasured.
- Open (backlog and lane doc): the env-map and vertex-alpha kit rebuild (patch ready), vegetation and shadow-depth warm, the water owner-mask and
  flowing-switch seams, `rwp22c` 1 % low 53.3.

## 2. The walks audit (nine places, three rounds of agent walks)

- Built and audited: Claywater, Greenspring, Riverwalk, the Broke Column, Jungle Root Hollow, the Tag House, Bog Iron Workings, Gang Ground, the Border
  road crossings (bundles committed in `368812b5`). Promises 9/9 built with 0 red; record coherence 9/9 green; place gates green. Round 3 walked Greenspring
  in full; the other places were not walked after the pods were deleted on the override.
- Defect classes and the rule that now prevents each (table: `audit10-c7/selfimprove.md`): sign arms and posts in the road bed (reader checklist row 41,
  `dressing.md:54`); deck ends, run joints and ferry decks (`landingRule`, modular-runs); rock skirts and slabs (`dug-in`, `rockSeatRule`); interior light axis
  and wall-piece fronts (`doors-interiors-sockets.md`); unbuilt promises (`promise_gate`); hearths and fire pad clearance (`padClearRule`); white proxy
  boxes (kit-build no-shader drop); stairs, climb runs and joints (`walkwayRule`); camera aim (walk judge H8, H9); closed spring rings; ground dressing;
  pods without public SSH and per-pod calibration (gpu-lane README).
- Open: the Greenspring mound huts and three interiors read near black (render and volumetrics lanes); the plank crossing reads as loose planks (owner walk);
  four unrelated reds in the placement select set (`test_export_blueprints::test_committed_export_is_current`, two `test_proving_ground` decal tests,
  `test_prose_links` zero debt); `tunnels.mjs close` without `--local` closes other lanes' tunnels.

## 3. WebGPU (branch `webgpu`, served at `/webgpu/`)

- Renders day and night on a real GPU. The WebGL2 fallback switch works in the published build (`?renderer=webgl`; the F3 perf line ends "webgpu" or "webgl2").
- Measured at the same poses on an RTX 3070 (native, branch fallback, dev classic WebGL):

| pose | backend | fps | 1 % low | GPU ms | CPU ms |
|---|---|---|---|---|---|
| A-day | native | 78.7 | 12.2 | 9.68 | 13.2 |
| A-day | fallback | 85 / 86.6 | 38.5 / 38.6 | 9.8 / 9.25 | 12.0 / 11.7 |
| A-day | dev | 203 / 202 | 127 / 111 | 1.67 / 1.61 | 4.9 / 4.9 |
| A-day, vol off | native | 65.1 | 23.9 | 4.36 | 15.6 |
| A-night | native | 94.5 / 92.2 | 21.5 / 16.6 | 5.61 | 10.6 / 10.8 |
| A-night | fallback | 105 / 106 | 61 / 46 | 7.5 / 7.2 | 9.6 |
| A-night | dev | 217 / 250 | 133 / 136 | 1.36 / 1.09 | 4.6 / 4.0 |
| canopy-08 | native | 42.7 / 43.3 | 4.3 / 4.2 | 23.0 | 23.8 |
| canopy-08 | fallback | 60 / 56 | 28 / 25 | 15.6 / 16.2 | 16.9 / 18.1 |
| canopy-08 | dev | 152 | 43.7 | 1.72 | 6.6 |

- Open causes (diagnosis 23): G1, the volumetric shaft march and the fog-grid inject, about 5.3 ms of the 9.7; G2, the canvas output path and TSL material
  cost, about 2.7 ms native and 4-5 ms scene on the fallback; L1, the signature precompile is thrown away, so building runs 30-35 s after kits arrive.
  Also G3 (canopy, URL parity), L2 and H1 (harness).
- The attribution views (`msaa=0`, `obuf=8`, `tone=0`, `water=0`, `veg=0`) were never captured: the second A-day view hung Chrome twice and the pod SSH was
  then refused.
- Status: a second build until parity, decision [0121](../../decisions/0121-webgpu-stays-a-second-build-until-parity.md). The second `merge_forward`
  of dev conflicts in `WorldSky.tsx`, `SettlementLayer.tsx` and `waterMaterial.ts`; the GLSL changes need porting to their TSL twins first.

## 4. Volumetrics (branch `webgpu-vol`, decision 0112)

- Systems built: one non-repeating advected fog with a monotonic clock and a burn-off envelope, a per-region fog profile, basin and water mist (M1), one fog
  on WebGPU, cell sun and interior light schema 2, window apertures, the volume fire solver, quality bands, the fog-grid inject cut to one shape lookup
  (M2), the canopy shaft march behind a canopy gate (M3), and a harness world-ready gate with invalid-capture columns.
- Interiors load in 6.4-7.6 s (`stagesMs.clear`, builds of 44-176 k triangles) against the 10 s bar, measured at r7.
- Last judged verdicts (r10 half A, before M1-M3): fog FAIL (even haze, no water mist layer); halos and canopy shafts FAIL on invalid captures (the vol-on
  view had no lamps or vegetation loaded); fire errors fixed, not judged on a GPU since r9; interiors not captured.
- The fix wave after r10 (M1, M2, M3, the harness gate, the fire buffer fix) is unit-tested and unmeasured on a GPU. The final merge of `webgpu` into
  `webgpu-vol` is not made (13 conflicted paths).

## 5. Process

- Image-reader agent: every visual read goes through one brief template (`place-build/references/reader-brief.md`: context, checklist, an open step-back
  question last).
- Lane tools: `tooling/gpu-lane` (pod capture, measure, the spots matrix from `places.json`, tunnels, calibration), `merge_forward.py`; `select_tests.py` has
  its own tests.
- Loop protocol: measure, diagnose, one fix wave on disjoint files, re-capture. A one-view smoke checked by an image-reader precedes every full capture;
  leads hand off at the context mark with a pod ledger.
- The place-build skill was rewritten one level up (`tooling/.reports/16k/walk10/place-skill-design-review.md`): design intent before pieces, a walked
  approach, a feel check, a region-derived palette, whole-pool asset breadth, kit review. Follow-ups are backlog rows.
- Method reviews r7-r9 ([r7](method-review-r7.md), [r8](method-review-r8.md), [r9](method-review-r9.md)): each verdict was "not yet as efficient as possible".
  R7: briefs with no size, and relaunches. R8: the fix-measure loop is mostly fix and diagnosis at lead-turn granularity, and causes were found a round late.
  R9: leads idle at high context on long captures, and the harness let invalid or stale captures run; the harness gate and the hand-off rule address both.

## 6. Pod ledger (RunPod, RTX 3070 community, $0.13 an hour)

All pods are deleted; the last `list-pods` showed none.

| lane | pods | cost |
|---|---|---|
| perf10 | `2nektax0vb41u2` | $3.12 billed |
| webgpu10 | `knj4qxcjtw1j1b` | $3.15 billed |
| webgpu10 (walk 9 loss) | `x3lo34wf7lpiai` | about $1.25, idle and unreachable |
| vol10 | `8fk2kv263rkg1d`, 2026-10-02 15:36Z to about 09:50Z | about $2.4 (hours x rate) |
| audit10 | three pods a round over four rounds, failed starts deleted within a minute | about $1.3 (hours x rate) |

Total about $11 (two lines billed, three computed from hours). The monthly credit is $15 (0119).

## 7. Open items and their homes

- [P-polish/backlog.md](../../phases/P-polish/backlog.md): ground colour and wetness per place, the eye-height `wb.py render` token, the asset breadth gate,
  registry biome tags, the env-map and vertex-alpha kit rebuild, `rwp22c` 1 % low.
- [gpu-lane README](../../../tooling/gpu-lane/README.md) § Open harness defects: harness fixes, and the next GPU round's first job, the WebGPU attribution
  capture (0121).
- Owner calls, in `PROGRESS.md` Waiting on user: the one-branch call, the player-fill art call, the cap-cloud belt call.
