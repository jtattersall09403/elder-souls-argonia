# stats-sim (retired 2026-09-24)

The workstream S balance harness was ported into
[`packages/game-core/src/stats`](../../packages/game-core/src/stats/README.md)
by the stats-lab lane (decisions 0088 and 0089). The game tables are in
`data/`, the harness is in `sim/`, and its 19 invariants run as standing tests
in `npm test`. The owner's bench is [`apps/stats-lab`](../../apps/stats-lab/README.md).

The port was proved against this tool at commit **`7e93d7de`**, the last
commit that touched its code or tables. At that commit the port reproduces
`node tooling/stats-sim/run.mjs --json --matrix` bit-exact (12,924 numbers).
The expected output is `packages/game-core/src/stats/__fixtures__/sim-output.json.gz`,
and the tables are kept verbatim in `__fixtures__/sim-data/`. To run the old
tool: `git show 7e93d7de:tooling/stats-sim/run.mjs`, or check out that commit
into a scratch worktree.

The tuning history, findings 1–34, is
[docs/research/archive/workstream-s/stats-sim-findings.md](../../docs/research/archive/workstream-s/stats-sim-findings.md).
