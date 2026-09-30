# 0114 — The plugin data is the interior manifest

Owner walk 6 (2026-09-30): round single-storey Argonian huts at Greenspring
opened into two- and three-storey rectangular timber houses; a Claywater pod
had an upstairs its dome has no room for; the Riverwalk swamp house, an open
house, offered "enter" into an unrelated hut cell. Owner, via the planner:
"the plugin data IS the manifest". Supersedes the culture-pool rule of R52 /
0103 decision 1 (as corrected 2026-09-28) and R56/R57's pool fit set.

## Decision

1. **Only a plugin's own load door binds a shell to a cell.** A door claims a
   cell only from `world/sources/placement/exterior-interior-links.json`: the
   cells a plugin's exterior load door on that shell model teleports to (a
   composite takes its base shell's). Repeats across doors are allowed; a
   passing cell no other building of the place holds is preferred. There is
   no culture pool and no area-ratio, aspect or label matching across
   unrelated cells (`culture_pool_rows`, `culture_shells`,
   `CULTURE_INTERIOR_KITS`, `shell_scale` and the claim's footprint band are
   deleted).
2. **Among the linked cells, the cell fits the shell's volume.** The cell's
   floors above its entry door (floor levels more than the 2.4 m storey gap
   over the paired exterior door) may not outnumber the floors the shell
   shows above its own door (`storeyLevelsM` over the entrance height). A
   cellar below the entry is free. Then the door pairing, the bundle's
   acceptance gate and the no-stand-in classes, as before. The use class
   ranks passing cells; it no longer refuses one.
3. **No link = hollow shell.** A shell no plugin gives a load door has no
   interior and no enter prompt: claim tier `none`, `doorType: "hollow"`. If
   its index record says `interior: "promised"`, the claim is `reserved` to
   pool `phase-12` with the `promiseReason` in its `why` and the existing
   `interiorRef` kept, so the Phase 12 promise and the services it carries
   survive; the door is still `hollow`. The door record stays: routes,
   `fills` and macro evidence point at it. The runtime drops `hollow` doors
   from the load path (`loadDoorsOf`), so no prompt shows.
4. **No passing linked cell = reserved, loud.** `--claim` names each such
   door and every linked cell's first failure, and exits 3. The rule is never
   widened and a cell is never hand-picked past it.

## Consequences

- Coverage was checked first (2026-09-30): BM&V's `hutexterior` (11 refs)
  and `swamp house` (47 refs) in Black Marsh.esm have no XTEL door within
  12 m in any mined plugin (Black Marsh.esm, Black Marsh North.esp,
  Valenwood.esp). This is not a miner coverage gap, so no re-mine.
- The KotM pod (`smpodext02`) links four Keeba cells. Three have a loft 3 m
  over the entry door and fail rule 2. KeebaHouseTreeminder fits the volume
  but fails the acceptance gate: two architecture pieces are held nowhere we
  may use (a Creation Club root cluster, `norvinefloor01nocol`). Until those
  are sourced, pods are reserved and show the closed line.
- `interiors.variety` judges reuse against the linked set only.
- Rulings: R52, R56 and R57 are superseded by R83.
