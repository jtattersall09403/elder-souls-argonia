# Hooks: what refuses what (decision 0106)

The harness blocks an agent from editing its own settings, so the owner
pastes these lines into `.claude/settings.json` (committed, so every
checkout and every subagent gets them). Each hook reads the tool call's JSON
on stdin and refuses with exit 2 and the rule's text.

| Hook | Refuses | Rule |
|---|---|---|
| `tooling/repo-standards/shell_guard.py` (Bash) | planner exploration; `sleep` anywhere; foreground waits for every agent (`tail -f`/`-F`/`--pid`, `until` loops, loops whose body is `true`, `:` or an `echo waiting`; owner 2026-09-30); any agent writing git's copy over the tree (`checkout --`, `restore`, `stash`, `reset --hard`, `show REV:path >` outside /tmp; owner 2026-09-30) | 0079 |
| `tooling/repo-standards/agent_cap.py` (Agent, Task; SubagentStart; SubagentStop) | a subagent spawn the machine cannot carry: unreclaimable memory (anon+shmem+kernel) + a 1.5 GiB per-agent reserve at or over the memwatch ceiling (3/4 of memory.max or MemTotal), 1-min load at or over nproc × 3 together with unreclaimable memory above half the ceiling or a job waiting for a job_guard slot (load alone never refuses), every job_guard heavy slot held by a job in its first 60 s, or 24 live+pending (`RUNAWAY_CAP`, a runaway backstop, not a budget); the refusal prints the numbers and the action, every decision goes to /tmp/es-agent-cap/admissions.log; ~30 ms; `--status` prints counts and numbers (owner 2026-10-01) | 0106 d18 |
| `tooling/repo-standards/review_gate.py` (Bash) | a batch's first preflight until the headless code review ran; code files only (`.py .ts .tsx .mjs .js` under packages/ apps/ tooling/); one exhaustive review per batch over the batch's code diff (commits since the last reviewed HEAD, else since the merge-base with main, plus the working tree) whatever `--paths` names, stamp keyed to HEAD plus a hash of the whole working-tree diff (never the pathspec), findings under `tooling/.reports/review/`; after an ok review the batch stays open across the round's commits until the planner runs `review_gate.py --close` when the walk packet is posted | 0079 §8, 0106 |
| `tooling/repo-standards/hooks/preflight_guard.py` (Bash) | `npm run preflight` with no `--paths` and no `--runner`; a docs-, report- or rulings-only batch; the same pathspec again on the same HEAD with the same files; a full miner run without `--rule-change` | 0106 |
| `tooling/repo-standards/hooks/preflight_guard.py` (Agent, Task, Workflow) | a call launching a `deliver` lane whose prompt or script has no `Budget: <N> min` line | 0106 |

Isolation: `job_guard.sh` runs every heavy job in its own memory-capped scope, so a crash kills only that job, never the session or VS Code; `cpu_watchdog` throttles and kills unguarded runaways. The cost review re-measures `AGENT_RESERVE_MIB` (a 1.5 GiB placeholder) from the agents' tool trees.

`preflight.mjs` refuses the same unscoped run on its own, fails a scoped run
over 60 s, and blocks on a test red on HEAD, so the rules hold even before
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

## The close of a round

Review items go back to ONE lane (a lead or deliver that owns the batch's
code), never judged by the planner reading code. Crash, memory and
infrastructure fixes found at the close go to a side lane, off the close's
critical path. The planner runs `review_gate.py --close` when the packet is
posted.

## Weekly drift check

`python3 tooling/repo-standards/workflow_drift.py --days 7` prints the five
drift measures with their red thresholds (the `cost-review` skill § 2b). To
run it every Monday at 07:00 on this machine, add one crontab line
(`crontab -e`):

    0 7 * * 1 cd /workspaces/elder-souls-argonia && python3 tooling/repo-standards/workflow_drift.py --days 7 >> tooling/.reports/workflow-drift.log 2>&1

or, inside a Claude session, `/loop 7d /cost-review`.
