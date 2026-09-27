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
| `preflight_heads.mjs` | speed lane 2 S4 (2026-09-27) — a failing pytest test is re-run once per HEAD sha on a clean clone of HEAD (ignored artefacts linked in) and labelled NEW or PRE-EXISTING (first-seen sha, owner = the lane that last changed the test's target); cache `tooling/.reports/preflight/head-<sha>.json`. Test selection inside a pytest gate under `--paths` is `tooling/world-generation/scripts/select_tests.py` (S3) |
| `review_gate.py` | decision 0079 §8 — PreToolUse hook: the first `preflight` on an unreviewed diff runs a headless Opus code review and returns its findings; `--run` reviews on demand; `--paths <pathspec...>` (on `npm run preflight --` or `--run`) reviews and size-limits only those files' diff, with a stamp keyed by the pathspec so one lane's review never satisfies another's or the whole tree's (decision 0087 §3); the reviewer's report shape (items only, shared causes named once) is in the prompt in `review_gate.py` |
| `memwatch.sh`, `own_memory.py`, `tool_timings.py` | nothing — `memwatch.sh [--ceiling-gib N] <cmd>` runs a job under a MACHINE-wide memory ceiling (default 3/4 of the machine's limit, cgroup memory.max else MemTotal, ≈22 GiB on the 30 GiB EC2 box, where the cgroup it reads is the root one and so holds every lane; kills before the kernel takes the session down), samples the JOB's own process tree (RssAnon + RssShmem, `own_memory.py`, every 0.5 s), ends with `own peak X GiB · machine peak Y GiB, exit N`, and appends one line per run (tool, args, wall s, machine GiB at start and at peak, `ownPeakGiB`, exit) to `output/tool-timings.jsonl` (gitignored); per-job targets read the own peak (preflight's summary prints it per gate). `python3 tooling/repo-standards/tool_timings.py [--days N] [--top K] [--exclude PREFIX]` ranks tools by total (default leaves out `npm.`, preflight's gate wrappers) and by worst run (complete), shows the own peak and the machine delta (`machineDeltaGiB`, peak minus start, every concurrent lane included) and marks `TARGET` any worst run over 60 s or own peak over 2 GiB, the tooling lane's list of profile candidates (16h ledger §6 steps C–D). `ES_TIMINGS=1` also logs `worldgen.site_fields`' import time as `import.site_fields` (wall time only: its start and peak GiB are 0 by design). The pytest files here run in `npm test`, before `check.mjs`, so both results always show |
| `owner_inbox.py`, `install_hooks.sh`, `hooks/` | nothing — the owner's phone inbox (§ Owner inbox) and the tracked git hooks: `install_hooks.sh` (SessionStart hook) links `hooks/pre-push` (background R2 backup, tooling/bootstrap/README.md § Backups) and `hooks/post-commit` (inbox post when a commit touches docs/PROGRESS.md) into `.git/hooks` and adds the nightly backup crontab line |
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
