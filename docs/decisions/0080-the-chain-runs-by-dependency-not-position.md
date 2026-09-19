# 0080 — The chain runs by dependency, not by position

**Date:** 2026-09-19 · **Phase:** 16g · **Status:** accepted (owner
2026-09-19, asked for after the 16g run spent fifteen minutes applying
patches whose consumers had to be hand-moved to make them re-run).

The terrain chain used to select stages by position: `--from` and `--through`
named a range of rows in `STAGES` and everything in that range ran. Nothing
knew which stage depended on which artefact, so when 16g's plot stages
rewrote the registry, the minor tracks, the travel services and the
vegetation patches, the only way to make the four consumers rebuild was to
move them physically below the 16g row in the list. A stage order that
encodes a dependency in a list of rows drifts silently the moment a stage
gains a read.

The chain now selects by dependency.

- Every stage that runs writes a receipt,
  `output/chain/receipts/<stage>.json`, holding the sha256 of each artefact
  it declares in `READS` and `WRITES`. A declared input that is not a file is
  recorded as null.
- `python3 -m worldgen.chain_stages --check-stale` is the gate. It compares
  each receipt against the tree now and reports `STALE <stage>: <artefact>
  changed since <ranAt>`, or `MISSING RECEIPT <stage>`, and exits 1 on any.
- After the requested range has run, `terrain-chain.sh` runs the transitive
  set of stages whose reads intersect what the run rewrote, restricted to
  below the freeze gate and to ladder chunks at or before
  `DELIVERED_THROUGH`, in `STAGES` order, printed as `cascade: ...`.
  `--no-cascade` turns it off. `--through` therefore names the last stage a
  run REQUESTS, not the last it executes.

Two reads are exempt, for the same reason the order gate exempts them. A
`stale_ok` read is declared to be of the previous publication with its reason
written down: it is the chain's admitted feedback edge, and following it
cascaded nineteen stages off a single plot stage in testing. A read of a path
the stage also writes is read-modify-write, not a stale read.

The rungs above the gate and the once-compiled water are not judged here.
They are inputs checked by hash by `verify_freeze` (decision 0066), and
`--check-stale` says so in a line of its output.

The mechanism arrived after the stages had already run, so their receipts
were seeded once from the tree with `--seed-receipts` (26 stages, marked
`seeded`); seeding never overwrites a receipt a real run wrote.

One blind spot is queued in the polish backlog rather than fixed here:
`WRITES` names only JSON and directories, so a stage that mutates the
heightfield or a water raster is invisible to both the order gate and the
cascade. `terrain_request_postconditions` reads arrays, which is why it stays
placed by hand below everything it judges.
