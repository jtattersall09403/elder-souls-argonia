# repo-standards

The mechanical half of [docs/standards/engineering.md](../../docs/standards/engineering.md)
(decision 0042 §8). Zero dependencies; runs as part of root `npm test`.

```
npm test -w @elder-souls/repo-standards
```

| File | Enforces |
|---|---|
| `check.mjs` | all of the below |
| `allowlist-determinism.json` | **standard 6** — scopes for world-building code + reasoned exemptions |
| `baseline-singletons.json` | **standard 8** — existing module-level singletons in `packages/`; may shrink, never grow |
| `id-registry.json` | **standard 2** — stable-ID sources, shape, global uniqueness, retired IDs (goes live at Phase 11) |
| `data-registry.json` | **standard 7** — runtime data paths that must carry `schemaVersion`; unversioned debt prints as a note every run |
| `session_tokens.py` | nothing — three-window token report, planner + subagents, with the 0079 control signals (decision 0079); `--brief` is printed by the SessionStart hook in `.claude/settings.json`; the `cost-review` skill reads it |
| `shell_guard.py` | decision 0079 — PreToolUse hook (`.claude/settings.json`): the planner session may not type exploratory commands (subagents exempt); no session, subagents included, may type `sleep` (owner 2026-09-25) |
| `cpu_watchdog.sh`, `cpu_watchdog.py`, `jobs.mjs`, `preflight_select.mjs` | owner rulings 2026-09-25 — the CPU watchdog daemon, the `ES_JOBS` parallelism cap and preflight's path-to-gate map; tooling/bootstrap/README.md § Resource guard |
| `review_gate.py` | decision 0079 §8 — PreToolUse hook: the first `preflight` on an unreviewed diff runs a headless Opus code review and returns its findings; `--run` reviews on demand; `--paths <pathspec...>` (on `npm run preflight --` or `--run`) reviews and size-limits only those files' diff, with a stamp keyed by the pathspec so one lane's review never satisfies another's or the whole tree's (decision 0087 §3); the reviewer's report shape (items only, shared causes named once) is in the prompt in `review_gate.py` |
| `memwatch.sh`, `tool_timings.py` | nothing — `memwatch.sh [--ceiling-gib N] <cmd>` runs a job under a cgroup memory ceiling (default 9 GiB; kills before the 12 GiB cgroup takes the session down) and appends one line per run (tool, args, wall s, cgroup GiB at start and at peak, exit) to `output/tool-timings.jsonl` (gitignored); `python3 tooling/repo-standards/tool_timings.py [--days N] [--top K] [--exclude PREFIX]` ranks tools by total (default leaves out `npm.`, preflight's gate wrappers) and by worst run (complete) and marks `TARGET` any worst run over 60 s or peak-minus-start over 2 GiB, the tooling lane's list of profile candidates (16h ledger §6 steps C–D). `ES_TIMINGS=1` also logs `worldgen.site_fields`' import time as `import.site_fields` (wall time only: its start and peak GiB are 0 by design). The pytest files here run in `npm test`, before `check.mjs`, so both results always show |
| — | **standard 10** — every asset pool in `world/sources/assets/registry-summary.json` is credited in the root README |

Two habits this exists to enforce:

- **`npm run docs:check` runs only the prose and docs-currency gates** (`check.mjs --docs`, seconds): run it as soon as prose is written, before preflight.
- **Notes are debt, not decoration.** A note names an unversioned bundle or a
  baselined singleton that has been removed. Clear them when you are in the file
  anyway.
- **If a check is wrong, fix the check.** Adding an exemption without a reason
  in the allowlist is how a ratchet stops ratcheting.

The remaining standards (3, 5, 9, 11 and the condition vocabulary) are phase
hooks and conventions, not greppable properties — they are verified at the
kickoffs named in the standards doc.

**Standard 2 registry options.** `idShape: "flat"` for vocabulary registries (`<domain>.<slug>`); `references: ["place"]` for a source whose top-level id names an object another source declares (a blueprint details a catalogue place) — those domains are shape-checked but exempt from uniqueness in that source.
