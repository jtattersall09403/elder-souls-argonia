---
name: kit-mining
description: Change or re-run the three kit miners (designed sink, mounts, abuts) as one protocol — expectations written first, golden fixture, fresh seed batch and its bar, the ONE full run under memwatch, the sink completion and the manifest refresh, and how to read the evidence fields. Use when a miner rule changes, a mined class or pair looks wrong, a plugin or kit joins the pool, or a record is INTERIM or disagrees with the manifests.
---

> **Written against** (decision 0086 rule 4; `routing-audit` checks these):
> decisions 0085 (kit truth is mined; §1 amended: real mesh contact, support
> from below wins) and 0086; docs/research/phase16/16h-ledger.md rows **M5/M6**
> to **M16** ("Round 6–13 miner") and **Yard round K7 B**, **K8 abuts sample**,
> **K9 A miner**, **K10 A/B miner**. Rules live in the docstrings of
> `worldgen/mine_mounts.py`, `mine_designed_sink.py`, `mine_abuts.py` and in
> `fixtures/mount-golden.json` `_`; this file is the procedure only. If a
> cited row or record has moved, this skill is stale: report it. Umbrella:
> `place-build` (§5 calls this skill when a kit is missing). Refresh and gates: `kit-build` §4–5. Runs: `modular-runs`.

`W=tooling/world-generation` (run `python3 -m worldgen.*` from it);
`MW=../repo-standards/memwatch.sh`; records under `world/sources/placement/`.
Plugins live in the vault; a mod folder missing there is fetched with
`bash tooling/bootstrap/vault-pull.sh mod-sources/<folder>` (see tooling/bootstrap/README.md).

| Miner | Record | Sample tool | Tests |
|---|---|---|---|
| sink | `kit-designed-sink.json` | none (full run or `--complete-only`) | `test_mine_designed_sink.py` |
| mounts | `kit-mounts-mined.json` | `run_mount_batches.py` | `test_mine_mounts.py` |
| abuts | `kit-assemblies-mined.json` `abuts` | `mine_abuts --only … --out /tmp/…` | `test_mine_abuts.py` |

## 1. Read the record before touching code

1. Mounts anchor row (`anchors[asset]`): `anchorClass`; `refClasses` (per-ref
   vote); `n`, `share` (`is_ambiguous`: n < 3 or share < 0.6, `mine_mounts.py:1367`);
   `evidence` absent = the vote, `policy` = the policy row took it (`votedClass`
   keeps the vote, why in `placement-policies.json` `assetPolicyEvidence`),
   `sink-waterline`; `waterline.evidence` `column` (cell water minus pivot)
   or `policy` (the policy row's `fallbackWaterlineM`: water-zero 0.0, stilt
   0.12, pad 0.18, dug-in 0.35; never `fallbackSinkM`, M18);
   `terrainOverNeighbour` (M19: refs whose lowest point touches the LAND
   while set into a neighbour, voted ground); `buriedGround`, `droppedNoLand`, `otherFileRefsNotVoting`,
   `restsOnOnly`, `hangingFrom` (M9–M16). Pairs: `kind` `band` (outM/upM,
   along range) or `points` (offsets, n), `offsetM` in the parent's unit frame.
2. Sink row: `evidence` prefix (`placement_metadata.SINK_EVIDENCE_PREFIXES`,
   `pipeline/placement_metadata.py:40`), the tell (`GROUND_LINE_TELLS`), p50/IQR.
3. Abuts row: `joint` (`run`/`double`), `relScale`, `count`, `offsetSpreadM`;
   `endFaces`, `terminates`, `singleUse`, `placedNoPairs` (K10).
4. Unplaced (n 0) means no plugin places it: no rule can mine it (K6 blocked,
   K10 ruling B). A missing plugin is a sourcing job (K8 register), not a rule.
5. Trace the ref-level geometry (pivot vs LAND, cell water, mesh z range,
   contact faces) before calling anything a miner defect: K6's hut-scale
   diagnosis and M7's water band were both wrong until measured (K7 A, M9).

## 2. A rule change is a planner call

6. Write the observation with its geometry into the ledger and stop; the
   planner rules (every M-row since M12 is "planner rulings"). Code only a
   ruling. Each ruling gets a unit test that fails on the old rule (M16:
   "side before top (fails on the round-15 rule)"; K10 spread test).

## 3. Golden sample (expectations first)

7. Mounts: expectations live in `fixtures/mount-golden.json` `golden.ids`
   (`id`, `expected`, `parent`, `why`); a new ruling's expected answers are
   set in the fixture BEFORE the run (M11). Run golden alone:
   `cd $W && $MW python3 -m worldgen.run_mount_batches --out /tmp/<lane>/golden.json`
   (40 refs/asset, per-asset seed; M16 25/25 in ~175 s, peak ~3.5–5.6 GiB).
8. Abuts: write `/tmp/<lane>/expected.txt` (pairs, offsets, faces, counts)
   first, then `cd $W && $MW python3 -m worldgen.mine_abuts --set <id> --plugin
   <path> --world <ws> … --only <dir>/ --cache /tmp/<lane>/refs --out
   /tmp/<lane>/sample.json` (set args as in `mine_assemblies` Usage; the
   record's `sets` names them; KotM via `mine_assemblies.PLUGIN_POOLS`). K8:
   6 s. Never `--write` on a sample.
9. Sink: no sample mode. Write the named assets' expected p50/tell in
   `/tmp/<lane>/sink_expected.txt` first (M13 wrote them after: flagged).
10. Bar: golden 25/25 and every existing test green except the known reds
    the ledger names. Below it: fix and re-run golden only.

## 4. Fresh seed batch (never seen)

11. Seed: never a used one (fixture `heldOut[].seed`: 20260923 … 20260939,
    and 20260941 in M19; e.g. 20260943). Draw: `kit_assets()` minus golden ids, `golden.left` and
    every earlier held-out id, `random.Random(seed).sample(sorted(ids), 25)`
    (fixture `drawnFrom`).
12. Expectations from names, category, kit and the record's placement counts
    only, into `/tmp/<lane>/batchN_expected.json`
    `{"seed": n, "ids": [[id, class, why], …]}` BEFORE the run.
13. Run fresh plus earlier batches in one contact run:
    `cd $W && $MW python3 -m worldgen.run_mount_batches --fresh
    /tmp/<lane>/batchN_expected.json --held <seeds> --out /tmp/<lane>/batch_out.json`
    (M16: golden + batches 5, 6, 7 in 217 s, 5.42 GiB).
    Abuts fresh = other families or sets than the sample (K9: newcastle,
    stonewalls, troncons, stockade).
14. Batch bar: every miss is either an expectation error discounted with its
    geometric evidence written on the result in the fixture (`discounted`,
    fixture `_`), or it is real. One real miss = protocol stop (step 6); the
    rule change after it needs ANOTHER fresh seed (brief § Open a (2)).
15. Expectation errors (count them, never tune to them): never placed (n 0 →
    ground unplaced, M13 batch 2); the mesh stands mostly under water (M16
    `dockstrent02`); water first on a sink waterline (M14 masts); it stands on
    a non-kit piece (M16 kiosk); an asset alone expected to pair (K7 A unit
    frames). Real: a class the geometry contradicts (M13 `rockcliff07`
    buried refs dropped; M14 `commoncounter01` hanging from its own top load).
16. Record each batch in `heldOut[]` (`batch`, `seed`, `date`, `round`,
    `drawnFrom`, `expectationsWritten`, `runs[]` with `mechanism`, `pass`,
    `of`, `secs`, `misses`, `results`).

## 5. The ONE full run (only after a batch passes with no code change)

Scheduling (16k hand-off ruling 5; 0099 decision 8): inside a slice, mine
per kit on demand (`mine_abuts --set <id>` or `--only`; `mine_mounts --assets
<ids>`, which prints and writes nothing). The full-pool run is
an overnight job at the lowest priority, launched only when nothing else is
queued, and always through the guard,
`JG='bash ../repo-standards/job_guard.sh miner --'` (it runs the command
under memwatch; run from `$W`).

17. Headroom: `awk '/^(anon|shmem) /{s+=$2}END{print s/2^30}'
    /sys/fs/cgroup/memory.stat`; memwatch ceilings are cgroup-wide (ledger §6
    B); one heavy job per lane; no other lane's kit build or full run beside it.
18. Mounts: `cd $W && $JG python3 -m worldgen.mine_mounts --quiet` (default
    `--jobs 5`; workers start from a forkserver, `mine_mounts.py:1153`: a fork
    copied 1.5 GB into each, 10 GiB, killed twice, M10). M16: 806 s, 7.22 GiB.
    Needs the mesh cache: `--dump-meshes` first when `meshesMissing` > 0.
19. Sink (rule change in the sink): `cd $W && $JG python3 -m
    worldgen.mine_designed_sink` (M10/M11: ~900 s, 6.3–6.9 GiB).
    Always after mounts or a kit rebuild: `--complete-only` (swap, base,
    mesh-sill rows; seconds). Report p50 changes (count, median, max).
20. Abuts: the sample command over every set, no `--only`, plus `--write`
    (K9 278 s / 5.34 GiB; K10 251 s / 4.50 GiB).
21. Stale if skipped: an INTERIM record is not a record (M7–M13); a full run
    before the batch is scored is invalid (M13).

## 6. Refresh and gates

22. `kit-build` §4 (`placement_metadata --refresh-built-manifests`, M16: 46
    rewritten, 44 changed); abuts and templates need no refresh, their
    consumers read the record (`modular-runs`, `composite-author`).
23. `cd $W && python3 -m worldgen.check_requirements && python3 -m pytest -q
    worldgen/test_mine_mounts.py worldgen/test_mine_designed_sink.py
    worldgen/test_mine_abuts.py worldgen/test_check_requirements.py`, then
    `kit-build` §5. `test_the_record_holds_the_golden_set` replays golden on
    the written record; the two manifest-vs-record tests stay red until step 22.
24. Stale if skipped: published manifests disagree with the record (M13:
    277 assets), sheets (ledger §4) and compiles read the old classes.

## 7. Report

Ledger row: rulings coded (file:line), golden/batch scores with seeds and
misses, full-run wall/peak, class and pair deltas, refresh counts, test counts.
