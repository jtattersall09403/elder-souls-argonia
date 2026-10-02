# Hooks: what refuses what (decision 0106)

The harness blocks an agent from editing its own settings, so the owner
pastes these lines into `.claude/settings.json` (committed, so every
checkout and every subagent gets them). Each hook reads the tool call's JSON
on stdin and refuses with exit 2 and the rule's text.

| Hook | Refuses | Rule |
|---|---|---|
| `tooling/repo-standards/shell_guard.py` (Bash) | planner exploration; `sleep` anywhere; foreground waits for every agent (`tail -f`/`-F`/`--pid`, `until` loops, loops whose body is `true`, `:` or an `echo waiting`; owner 2026-09-30); any agent writing git's copy over the tree (`checkout --`, `restore`, `stash`, `reset --hard`, `show REV:path >` outside /tmp; owner 2026-09-30); poll loopholes for every agent (`while pgrep`, pgrep in a loop or before `sleep`/`wait`, `python -c` with `time.sleep(`, while-loops whose body sleeps, pgreps or waits, a command starting `date;`/`date &&` before a look); a heredoc whose redirect or python body writes a git-tracked file (heredocs into /tmp and new files stay allowed; the target is resolved after every `cd` before the heredoc); a nudge (not a refusal) to an Opus agent at its third single look-up command in a row, state per agent under /tmp/es-shell-guard | 0079, 0118 |
| `tooling/repo-standards/agent_guard.py` (every tool; subagents only) | an Opus agent (deliver, place-builder, lead, research) past 220 turns (a runaway backstop), counted as distinct assistant message ids in its own transcript, for every tool but a Write/Edit under `tooling/.reports/` and SubagentHandback; a nudge at 150 turns to finish the step, write the hand-off note and return (the normal path); a lead's Edit/Write outside `tooling/.reports/` and its `wb.py`, `pytest`, `npm test`/build/publish/compile/export/preflight/look, `job_guard.sh` and Blender commands; ~50 ms on a 23 MB transcript; allows on any error or a missing transcript | 0118 |
| `tooling/repo-standards/agent_cap.py` (Agent, Task; SubagentStart; SubagentStop) | a subagent spawn the machine cannot carry: unreclaimable memory (anon+shmem+kernel) + a 1.5 GiB per-agent reserve at or over the memwatch ceiling (3/4 of memory.max or MemTotal), 1-min load at or over nproc × 3 together with unreclaimable memory above half the ceiling or a job waiting for a job_guard slot (load alone never refuses), every job_guard heavy slot held by a job in its first 60 s, or 24 live+pending (`RUNAWAY_CAP`, a runaway backstop, not a budget); the refusal prints the numbers and the action, every decision goes to /tmp/es-agent-cap/admissions.log; ~30 ms; `--status` prints counts and numbers (owner 2026-10-01); a lane wave (a second launch within 60 s) while `week_usage.py` puts the week above 85 % of the weekly limit, unless the brief's `Budget:` is under 30 min: a nudge naming the share while `weekly_limit.json` holds no owner % reading in the current week, a refusal once it does | 0106 d18, 0118 |
| `tooling/repo-standards/review_gate.py` (Bash) | a batch's first preflight until the headless code review ran; code files only (`.py .ts .tsx .mjs .js` under packages/ apps/ tooling/); one exhaustive review per batch over the batch's code diff (commits since the last reviewed HEAD, else since the merge-base with main, plus the working tree) whatever `--paths` names, stamp keyed to HEAD plus a hash of the whole working-tree diff (never the pathspec), findings under `tooling/.reports/review/`; after an ok review the batch stays open across the round's commits until the planner runs `review_gate.py --close` when the walk packet is posted; a re-run inside the open batch fires no reviewer; every fire appends a row (time, batchId, head, status, findings, paths) to `tooling/.reports/review/reviews.jsonl`, which `workflow_drift.py` counts (`--close` empties the stamps, never the log) | 0079 §8, 0106, 0118 |
| `tooling/repo-standards/hooks/preflight_guard.py` (Bash) | `npm run preflight` with no `--paths` and no `--runner`; a docs-, report- or rulings-only batch; the same pathspec again on the same HEAD with the same files; a full miner run without `--rule-change` | 0106 |
| `tooling/repo-standards/hooks/preflight_guard.py` (Agent, Task, Workflow) | a call launching a `deliver` lane whose prompt or script has no `Budget: <N> min` line | 0106 |

Isolation: `job_guard.sh` runs every heavy job in its own memory-capped scope, so a crash kills only that job, never the session or VS Code; `cpu_watchdog` throttles and kills unguarded runaways. The cost review re-measures `AGENT_RESERVE_MIB` (a 1.5 GiB placeholder) from the agents' tool trees.

Weekly pace: `week_usage.py` sums this repo's cost units (session_tokens
weights, every transcript including subagents and Workflow agents) since the
weekly reset (`weekly_limit.json`: Friday 05:00 UTC, the harness's "resets
Oct 2, 5am (UTC)") against a limit derived from the owner's latest "% used"
reading this week (`readings`: units from the reset to the reading's time /
its percent), which also turns the pace gate from nudge to refuse; with no
reading this week it uses `limitUnits` (825, the week the limit was hit) and
only nudges. **Owner: paste the % from the Anthropic usage page and the time
you read it** as a `readings` row (`{"at": "2026-10-03T09:00Z",
"percentUsed": 23}`). The derived limit is cached in /tmp/es-week-limit.json
per reading. It reads only what
each transcript appended since its cache (/tmp/es-week-usage.json): ~4.5 s
cold, ~0.2 s warm. It sees this repo only, so the share is a floor. The
SessionStart token line prints it.

`preflight.mjs` refuses the same unscoped run on its own, fails a scoped run
over 60 s, blocks on a test red on HEAD, and inside an open review batch
re-runs only the gates red last time plus gates the last run did not run
(`--all-gates` runs everything; the batch id is the stamp's `batchId`; each
`runs.jsonl` row records `batchId` and `failed`), so the rules hold even before
the hook lines are pasted.

## Lines to paste

In `.claude/settings.json` › `hooks` › `PreToolUse`, the `Bash` entry gains
the guard after the review gate, and one new entry covers the lane tools:

```json
{
  "matcher": "Bash",
  "hooks": [
    { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR\"/tooling/repo-standards/shell_guard.py" },
    { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR\"/tooling/repo-standards/hooks/preflight_guard.py", "timeout": 20 },
    { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR\"/tooling/repo-standards/review_gate.py", "timeout": 600 }
  ]
},
{
  "matcher": "Agent|Task|Workflow",
  "hooks": [
    { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR\"/tooling/repo-standards/hooks/preflight_guard.py", "timeout": 20 }
  ]
}
```

The guard runs before the review gate so a refused preflight never starts
a review. The agent cap needs three more entries (the Agent entry above gains
it as a second hook):

```json
"PreToolUse": [{ "matcher": "Agent|Task", "hooks": [{ "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR\"/tooling/repo-standards/agent_cap.py", "timeout": 10 }] }],
"SubagentStart": [{ "hooks": [{ "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR\"/tooling/repo-standards/agent_cap.py", "timeout": 10 }] }],
"SubagentStop": [{ "hooks": [{ "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR\"/tooling/repo-standards/agent_cap.py", "timeout": 10 }] }]
```

The agent guard (decision 0118) needs one more `PreToolUse` entry, on every
tool (until it is pasted, the lead rule is an agent-file rule only):

```json
{ "matcher": "*", "hooks": [{ "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR\"/tooling/repo-standards/agent_guard.py", "timeout": 10 }] }
```

## The close of a round

Review items go back to ONE lane (a lead or deliver that owns the batch's
code), never judged by the planner reading code. Crash, memory and
infrastructure fixes found at the close go to a side lane, off the close's
critical path. The planner runs `review_gate.py --close` when the packet is
posted.

## Weekly drift check

`python3 tooling/repo-standards/workflow_drift.py --days 7` prints the
drift measures with their red thresholds (the `cost-review` skill § 2b). To
run it every Monday at 07:00 on this machine, add one crontab line
(`crontab -e`):

    0 7 * * 1 cd /workspaces/elder-souls-argonia && python3 tooling/repo-standards/workflow_drift.py --days 7 >> tooling/.reports/workflow-drift.log 2>&1

or, inside a Claude session, `/loop 7d /cost-review`.
