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
| `shell_guard.py` | decision 0079 — PreToolUse hook (`.claude/settings.json`): the planner session may not type exploratory commands (subagents exempt); no session, subagents included, may type `sleep` (owner 2026-09-25) nor write git's copy of a file over the shared tree (`checkout --`, `restore`, `stash`, `reset --hard`, `show REV:path >` outside /tmp; 2026-09-30); every agent: poll loopholes and heredocs that write a tracked file refused, an Opus agent nudged at its third single look-up in a row (decision 0118) |
| `agent_guard.py` | decision 0118 — PreToolUse hook on every tool (settings line in docs/standards/hooks.md): a lead refused edits and build/test/publish commands |
| `week_usage.py`, `weekly_limit.json` | decision 0118 — this week's cost units since the weekly reset against the calibrated limit, incremental cache under /tmp; read by `agent_cap.py` (wave pacing) and `session_tokens.py --brief` |
| `cpu_watchdog.sh`, `cpu_watchdog.py`, `jobs.mjs`, `preflight_select.mjs` | owner rulings 2026-09-25 — the CPU watchdog daemon (also kills any python/blender/node OUTSIDE a job_guard slot past 20 GiB anon: SIGTERM, SIGKILL 10 s later, logged to `tooling/.reports/job-guard/mem-watchdog.log`; never claude, the tunnel or the studio dev server; a job it pauses gets a `cpu_watchdog: PAUSED` line on its own stderr and a `resumed` line after, so a pause never reads as a hang), the `ES_JOBS` parallelism cap and preflight's path-to-gate map; tooling/bootstrap/README.md § Resource guard |
| `agent_cap.py` | decision 0106 d18 — PreToolUse/SubagentStart/SubagentStop hook: admits a subagent spawn on measured memory (unreclaimable + 1.5 GiB reserve under the memwatch ceiling) and CPU (load under nproc × 3 unless memory is above half the ceiling or a job waits for a slot, job_guard slots not all starting), 24 live+pending runaway backstop; refuses a lane wave above 85 % of the weekly limit unless its Budget is under 30 min (0118); logs every decision to `/tmp/es-agent-cap/admissions.log`; `--status`; ~30 ms |
| `test.sh` | this workspace's `npm test`: re-runs itself under `job_guard.sh` (off CI, unless already guarded; a `job_guard.sh` inside a guarded job runs inline in the outer slot), so the watchdog never pauses it; every part runs even after a red; ~30 s |
| `preflight_heads.mjs` | speed lane 2 S4 (2026-09-27) — a failing pytest test is re-run once per HEAD sha on a clean clone of HEAD (ignored artefacts linked in) and labelled NEW or PRE-EXISTING (first-seen sha, owner = the lane that last changed the test's target); cache `tooling/.reports/preflight/head-<sha>.json`. Test selection inside a pytest gate under `--paths` is `tooling/world-generation/scripts/select_tests.py` (S3) |
| `review_gate.py` | decision 0079 §8 — PreToolUse hook: the first `preflight` on an unreviewed diff runs a headless Opus code review and returns its findings; `--run` reviews on demand; the stamp is keyed to the batch (HEAD plus a hash of the whole working-tree diff, untracked non-ignored files included), never the pathspec: a scoped preflight fires the gate but the review reads the whole batch's code diff (`git diff <base>`: base = the last reviewed HEAD, `reviewedHead` in the stamp file, else the merge-base with main; `--base <rev>` overrides), so lanes that committed by pathspec are reviewed too, and any later preflight or `--run` at the same HEAD passes (`--run --force` reviews again; walk 5 process review); the reviewer's report shape (items only, shared causes named once) is in the prompt in `review_gate.py`; the stamp's read-modify-write holds an flock (lock at `worldgen.atomic_write.write_lock_path`) and replaces the file by rename, so parallel preflights keep every stamp (16k S9); `world/sources/blueprints/*.design.md` is left out of the diff, tracked or new (text-review owns that prose; method review r3 finding D) |
| `hooks/preflight_guard.py`, `workflow_drift.py` | decision 0106 — PreToolUse hook: refuses an unscoped, docs-only or repeated preflight, a full miner run without `--rule-change`, and a deliver lane with no `Budget:` line (lines to paste: `docs/standards/hooks.md`); the weekly drift measures with red thresholds (cost-review § 2b). `job_guard.sh --budget <min>` kills a job at its budget after a checkpoint line; `--mem <GiB>` (default 24) runs the job in its own `systemd-run --user --scope` with that MemoryMax (prlimit where no user systemd), so an OOM kills that job alone, never the session; admission counts the live slots' measured memory against 26 GiB (parallel jobs wanted, never serialised); every job logs cmdline, pid, cap, start, child pid, own/scope peak, OOM kills and exit to `tooling/.reports/job-guard/<lane>-<pid>.log`, and a job killed at its cap prints `killed: memory cap N GiB exceeded, peak P, cmd ...` on stderr (2026-09-30 OOM round) |
| `build_ledger.py` | 16k § Build cost is measured as data (owner 2026-09-27) — one row per place-build event in `docs/phases/16-foundation-and-places/build-ledger.jsonl` (`append --from-rounds <rounds.jsonl>`: the place from the rows' own `placeId`, `--place` only for older rows; `--from-gates <place-gates.json>` from `place_gates`, `--from-close <close.json>` from `close_place`; `stage --place <id> --stage <name> --start|--end`, emitted by the place-build skill at each non-round stage: a per-place clock file `tooling/.reports/16k/<place>/stage-clock.json`, each `--start` ends the open stage and appends its `stage` row; flocked, the same input never twice): a run id (`<place>#<n>`: one build pass on one path, the path fixed when the run starts; a walk's fix round starts its own with `--start-run --path fix-round`; a close row ends the run), type, path (new-type / template / fix-round), the SKILL.md and workbench git shas, wall minutes per stage, turns and CPU minutes (null until measured), rounds, defects (null until the walk). A run's minutes: its stage minutes plus the rounds and gates rows outside the stage windows; a run holding a `hand` row counts the hand `total` alone. `--report` prints the row count per source, every run against its target (over/under), the trend per path and per skill sha, and lists each run over its path's `TARGET_MIN` (40 / 17 / 10 min) |
| `memwatch.sh`, `own_memory.py`, `tool_timings.py` | nothing — `memwatch.sh [--ceiling-gib N] <cmd>` runs a job under a MACHINE-wide memory ceiling (default 3/4 of the machine's limit, cgroup memory.max else MemTotal, ≈22 GiB on the 30 GiB EC2 box, where the cgroup it reads is the root one and so holds every lane; kills before the kernel takes the session down), samples the JOB's own process tree (RssAnon + RssShmem, `own_memory.py`, every 0.5 s), ends with `own peak X GiB · machine peak Y GiB, exit N`, and appends one line per run (tool, args, wall s, machine GiB at start and at peak, `ownPeakGiB`, exit) to `output/tool-timings.jsonl` (gitignored); per-job targets read the own peak (preflight's summary prints it per gate). `python3 tooling/repo-standards/tool_timings.py [--days N] [--top K] [--exclude PREFIX]` ranks tools by total (default leaves out `npm.`, preflight's gate wrappers) and by worst run (complete), shows the own peak and the machine delta (`machineDeltaGiB`, peak minus start, every concurrent lane included) and marks `TARGET` any worst run over 60 s or own peak over 2 GiB, the tooling lane's list of profile candidates (16h ledger §6 steps C–D). `ES_TIMINGS=1` also logs `worldgen.site_fields`' import time as `import.site_fields` (wall time only: its start and peak GiB are 0 by design). The pytest files here run in `npm test`, before `check.mjs`, so both results always show |
| `owner_inbox.py`, `install_hooks.sh`, `hooks/` | nothing — the owner's phone inbox (§ Owner inbox) and the tracked git hooks: `install_hooks.sh` (SessionStart hook) links `hooks/pre-push` (background R2 backup, tooling/bootstrap/README.md § Backups) and `hooks/post-commit` (inbox post when a commit touches docs/PROGRESS.md) into `.git/hooks` and adds the nightly backup crontab line |
| `check_site_refs.mjs` | **standard 16** (decision 0052 addendum 2026-09-28) — preflight gate `site-refs` and part of this workspace's `npm test` (so CI runs it): the composer's kit reach and dangling-reference gate (`tooling/pages-site/kit-reach.mjs`) over the sources, no build, <1 s |
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

## Owner inbox

The owner follows the work on their phone through one pinned GitHub issue,
"Owner inbox: what is waiting on you" (label `owner-inbox`): every comment is
one update and the newest is the current state. GitHub's app or email tells
them when a comment lands.

- `python3 tooling/repo-standards/owner_inbox.py --post <file.md> [--title <text>]`
  posts a check-in or walk packet as a comment headed `## <title> — <UTC time>`.
  Every owner check-in is posted this way (CLAUDE.md, "Get playtest/visual
  feedback"; the place-build skill's walk-packet step).
  `--attach <png...> [--walk <name>] [--branch main]` copies each picture to
  `tooling/.reports/16k/<walk>/pictures/`, `git add -f`s it and links it on
  the branch (default `main`); the post is refused (exit 2) while any linked
  image is not committed on that branch: commit, push, run it again.
- `--from-progress [--if-changed]` posts the story built from the repo: the
  commit subjects on `dev` since the last comment (at most 25, oldest first,
  auto-backup manifest commits left out), `docs/PROGRESS.md` § Waiting on user
  with its links made absolute, and where to look (`$ES_TUNNEL_URL` when set,
  the PROGRESS link). Each story carries `<!-- waiting-hash: ... -->`;
  `--if-changed` skips the post when the last comment has the same hash.
- `--list` prints each comment's id, UTC date and title (a folded one reads
  `[collapsed]` with its heading); `--collapse ID [--reason <text>]` folds a
  superseded comment (a long walk packet) behind a one-line summary, idempotent.
- The post-commit hook runs `--from-progress --if-changed` in the background
  whenever a commit touches `docs/PROGRESS.md`.
- The issue and its label are created on first use and the issue is pinned.
  With `gh` missing or offline the script says so in one line and exits 0.
- Tests: `test_owner_inbox.py` (fake `gh` on PATH).
