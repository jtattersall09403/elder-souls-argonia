# 16h audit: catalogue-wide steps hidden under exemplar-first briefs (2026-09-23)

Read-only `research` audit of every step from 16h part 2 through 16i, 16j and Phase 15 that iterates over a catalogue, ranked by cost × likelihood of iteration, with an exemplar-first shape for each. Its recommendations were applied to the 16h/16i/16j briefs, `15-rollout/README.md`, the `settlement-build` skill and the polish backlog on 2026-09-23.

Owner rule (CLAUDE.md golden rule "Prove on a sample, validate on a fresh batch, scale once", owner 2026-09-23): iterate on a small named sample with the answers written first, test on a fresh batch, and run the whole catalogue once.

The worst risk is not in any brief's wording. Four place-level tools and the render stamps are catalogue-wide by construction, so every "local" step from 16h part 2 onward quietly runs over every place, every patch or every template in a kit. Phase 15 then makes that grow with each packet: packet N re-derives and re-exports every place from packets 1 to N.

**Reconciliation.** The rule is written in two places only: CLAUDE.md:62 and the 16h brief's resume step 8 (16h-settlement-runtime-and-kit-qa.md:313-321, "16i and 16j inherit the rule for every catalogue-wide job"). It is missing from these five, each of which drives catalogue runs: 16i-exemplars-end-to-end.md, 16j-rollout-skill-and-trial-packet.md, docs/phases/15-rollout/README.md, .claude/skills/settlement-build/SKILL.md, and the kit-qa skill (item 20, not yet written). Nothing I found contradicts it. The one live defect is SKILL.md:148, which tells the rollout to re-run `compile_scatter` per place. That contradicts 16h item 14 (line 695, "compile_scatter is never re-run for a settlement") and the 16i gotcha at lines 527-528. Edit these four live docs: the 16h brief § Delivery plan Part 2, the 16i § Delivery plan, the 16j § Delivery plan, and the packet template (16j item 8). The kit-qa skill takes it as its own step when 16h item 20 writes it. No new file is needed.

## Tree counts (measured)

| Catalogue | Count | Source |
|---|---|---|
| Raw kits / published kit.json / kits with an interiors file | 25 / 21 / 23 | tooling/asset-pipeline/output/kits, apps/world-studio/public/kits, world/sources/placement/kit-interiors |
| Assets in the raw kit manifests (the miners' set) | 1,551 (1,383) | kit.json assets; ledger §3 lane A |
| Mined templates | 377 | ledger §3 R2 |
| Sheets on disk (templates-flat / mounts) | 2,657 / 1,992 files | output/sheets/16h |
| Catalogue places (plotted / derived) | 827 (567 / 260) | world/sources/catalogue/places-*.json |
| Owner-guided / dungeon-kind places / place types | 12 / 327 / 242 | same files |
| Blueprints (5 fixtures + the yard) | 6 | world/sources/blueprints |
| Route structures (stair / deck / lip-step / bridge) | 55 (31 / 17 / 5 / 2) | route-structures.json; `ferryCrossings` is empty |
| Water crossings; travel stations / services | 34; 39 / 24 | water-crossings.json, travel-services.json |
| Vegetation patches / terrain patches / route-grade patches | 183 / 166 / 118 | flora/vegetation-patches.json, terrain/*.json |
| Plugin link pools; furnished chambers | 50; 1,825 | exterior-interior-links.json; phases/README.md:455 |
| Bundle doors / placements (still schema 1) | 58 / 4,958 | public/province/settlements.json |

## Ranked steps (cost × likelihood of iteration)

| # | Step (file:line) | Iterates over | Sample named? | Cost today (ledger) | Exemplar-first shape |
|---|---|---|---|---|---|
| 1 | Check-in 1 "wrong" turned into a rule, then "re-render the changed sheets once" (16h:933-934, 969-971) | 1,383 assets to re-mine; every template of a rebuilt kit | "changed" is left undefined | Mine: sink 32.2 s, mounts unmeasured. Kit build ~78 s serial. Templates 3.6 s each, 377 in 28 min. Sonnet sample: 14 sheets in 87 s | The owner's flagged sheets plus about 10 neighbours, answers written first (the flags *are* the answers); fresh batch of 25; then one re-mine and a re-render of the diff set |
| 2 | Phase 15 per packet: `rederive_blueprints`, export, `apply_vegetation_patches`, ground control (15-rollout/README.md:23-33; phases/README.md:927+) | Every blueprint and patch in the province, every packet | No; the tools have no place selector | Compile 4.4–6.9 s per place; rederive runs 2 subprocesses per place (unmeasured); patches 11.9 s for 183 | Scope every per-packet stage to the packet's place ids (see note 2) |
| 3 | 16h item 12: built-in stair "recorded per asset in the manifest with the tell" (16h:662-665) | 1,551 assets and 46 manifests | No | Like sink: ~32 s a run; the manifest writer once clobbered 64 sinks (ledger §3 round 5) | 15-asset golden set of stilts and decks with and without stairs, tell written first; fresh 15; one run; manifest diff limited to the new field |
| 4 | 16i item 4: fit rule plus the furniture-mix use-class classifier (16i:320-330) | The cell pool (571 link records / 1,825 chambers) | No | Unmeasured | 12 cells of known class (inn, shop, shrine, dwelling), labels written first; fresh 12; then the six places' doors only |
| 5 | 16h item 11: door bound to doorway, plus a reachability rule (16h:643-658); 47 of 58 doors sit more than 0.5 m from a doorway (ledger §3 D) | The interiors index (23 kits), 58 doors | No | Index unmeasured | The 11 good and 47 bad doors are the named sample; re-index only the kits whose shells changed (`--kit`) |
| 6 | 16i item 5: `esp_index` light and lighting-template decode, and the interior exporter (16i:350-360) | Every plugin cell | No | Unmeasured | 6 claimed cells plus 6 others, with light counts and colours read from the plugin first; fresh 6; no full plugin re-index |
| 7 | Sonnet sheet loops: 16h part 2 step 2 (16h:956-959, no loop cap); 16i step 3 (16i:561-564); kit-qa "on every assembly" per place lane (16i:295-297, 552-559; 16j:135) | Every plan sheet; every template a place uses | Part 1 had a two-loop cap (16h:920); part 2 has none | About 6 s per sheet at 3 readers | Tune on 3 sheets with verdicts written first, then a fresh 3, then all; cap at two loops; one shared kit-qa output directory so the six lanes do not render the same template six times |
| 8 | 16h item 15: lift `compile_scatter`'s emission into a shared function (16h:704-707) | 725,609 instances | No | Chain from `compile_scatter` 57–70 s (16f ledger:349, 429) | 3 named chunks byte-identical, then a fresh 3, then one full run; never a full run per edit |
| 9 | 16h item 21: one chain run from the freeze gate plus probe-blueprints (16h:769-773) | All blueprints (rederive), scatter if stale, the browser probe per place | "One run" | Probe is a browser run (slow); chain ~1–2 min | Acceptable as the final full run, provided the earlier steps were proved small |
| 10 | Catalogue filters: sixth exemplar from 327 dungeon-kind (16i:264-275); 16j packet candidates (16j:115-122); roadmap types (16j:174-178) | 327 / 827 places; 242 types | Criteria yes, sample no | Seconds | Write the verdicts for the 5 exemplars and 3 known misfits first, then run |
| 11 | 16h items 10, 17 and 19: route exemplars, dressing vocabulary, plan renderer (16h:621-630, 730-733, 744-751) | 4 structures + 1 ferry; 6 places | Yes | — | Already exemplar-shaped; no change |

## Per-step notes

1. **Stamps invalidate on mtime.** `assembly_stamp` keys on each kit GLB's `st_mtime_ns` and size (render_assembly.py:856-864). Any kit rebuild, even one that writes a byte-identical GLB, marks every template of that kit as changed. So "re-render the changed sheets" after a manifest-only rule means the whole kit, for example 635 kit-sheet PNGs over ten kits (ledger R3). `mine_designed_sink` has no `--assets` selector (mine_designed_sink.py:406-412; only `--kits-dir`, `--complete-only`), so a golden sample of it cannot run without a code change. `mine_mounts` has one (`--assets`, :971).
2. **Tools with no place selector:**
   - `rederive_blueprints` globs `place.*.json` and launches 2 subprocesses per blueprint (rederive_blueprints.py:39-51).
   - `build_bundle` reads every blueprint and every compiled settlement (export_settlement_bundle.py:862, 893).
   - `apply_vegetation_patches` takes only a patch-file path (:464-466).
   - `settlement_ground_control` takes the whole bundle (:369).

   16h item 13's `chain-footprint` scoping (16h:681-682) exists for pads only. The "nothing above rederive_blueprints re-runs" line (16h:973; 16i:527-528; 16j:248; 15-rollout/README.md:33) bounds the top of the chain, not its width.
3. **Stair tell (item 12).** Lane H's brief (16h:943-945) names the files but no sample. This is the same shape as the anchor-class miner, which took six rounds (ledger §3 rounds 1–6).
4. **Fit rule.** "Pick a furnished cell … within 0.6–1.5×" plus a use class derived from furniture (16i:320-327) is a classifier over the whole pool. The test at 16i:328-329 checks each claim, not the classifier.
5. **Doors.** The doorway evidence comes from `interiors_index.py` (`--kit` defaults to all 23, :1735). This is the "index re-run over all 23 kits to verify one rule change" pattern from part 1. The "ids are stable across two compiles" test (16h:658) is 2 × 6 compiles at ~5 s each, which is fine.
6. **Interior runtime.** Extending the decoder invites a verification re-index of every plugin cell. The acceptance ("reference count in the cell equals placements … minus gaps", 16i:352-354) is per cell and can stay on the sample.
7. **Sonnet loops.** Part 1 capped loops at two (16h:920); part 2 step 2 and 16i step 3 have no cap. In 16j part 1 (16j:132-137), each place lane runs kit-qa on every assembly, which duplicates templates across lanes unless they share stamps and an output directory.
8. **Emission lift (item 15).** The natural proof, "compile_scatter output byte-identical", is a hidden full run. It is cheap (~1 min) but tends to be repeated per edit. The chunk-sample test at 16h:713-714 already exists as a shape.
9. **settlement-build SKILL.md.** SKILL.md:148 still runs `compile_scatter` (province-wide) per place. SKILL.md:108 exports every place. Both are v1, but the v1 banner (:6) warns only about exemplar work, and 16j and Phase 15 inherit whatever v2 copies.

## Recommendations

- **16h Delivery plan, Part 2 step 0:** "A check-in-1 rule is proved on the owner's flagged sheets plus ~10 named neighbours with answers written first, then a fresh 25, then one re-mine and one re-render of the diff set." Evidence: note 1.
- **Render stamps (render_assembly.py:856):** key on the GLB content hash, not mtime, so a no-op kit rebuild re-renders nothing. Queue it as a backlog row. Evidence: stamp key above.
- **`mine_designed_sink`:** add `--assets` like `mine_mounts`, and have the manifest writer touch only the named fields. Evidence: :406-412; the ledger round 5 regression.
- **16h item 12:** name a 15-asset stair-tell golden file (`fixtures/stair-golden.json`) and a fresh batch before the full manifest write.
- **16h item 11:** the 58 replayed doors are the sample; interiors re-index is `--kit` for changed shells only.
- **16h item 15 and step 2:** prove the lifted emission on 3 named chunks, then a fresh 3, then one full scatter run; cap the part 2 Sonnet loop at two.
- **16i item 4:** a 12-cell labelled use-class sample plus a fresh 12 before any claim is written.
- **16i item 5:** decode lights on 6 claimed cells plus 6 others; no full plugin re-index as verification.
- **16i and 16j lanes:** one shared kit-qa output directory with stamps; tune the Sonnet protocol on 3 sheets before each sweep.
- **Place-scoped tooling before Phase 15:** give `rederive_blueprints`, export, `apply_vegetation_patches` and `settlement_ground_control` a `--places` / changed-set selector, with a full run only at freeze. The 16j packet template states this. Evidence: note 2.
- **16i/16j Delivery plans, 15-rollout/README.md, and the future kit-qa skill:** each carries one line citing CLAUDE.md:62. SKILL.md:148 loses `compile_scatter` now rather than waiting for v2.
- **Tools with no recorded timing:** `interiors_index`, a full `mine_mounts`, `rederive_blueprints` per place and export are unmeasured in ledger §6 and `tool-timings.jsonl` (18 runs, none of these). Run each once under memwatch so the costs above become numbers.