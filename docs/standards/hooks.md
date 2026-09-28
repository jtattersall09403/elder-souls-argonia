# Hooks: what refuses what (decision 0106)

The harness blocks an agent from editing its own settings, so the owner
pastes these lines into `.claude/settings.json` (committed, so every
checkout and every subagent gets them). Each hook reads the tool call's JSON
on stdin and refuses with exit 2 and the rule's text.

| Hook | Refuses | Rule |
|---|---|---|
| `tooling/repo-standards/shell_guard.py` (Bash) | planner exploration; `sleep` anywhere | 0079 |
| `tooling/repo-standards/review_gate.py` (Bash) | a batch's first preflight until the headless code review ran; code files only (`.py .ts .tsx .mjs .js` under packages/ apps/ tooling/); one exhaustive review per batch, findings under `tooling/.reports/review/`, valid while HEAD stays the commit it reviewed | 0079 §8, 0106 |
| `tooling/repo-standards/hooks/preflight_guard.py` (Bash) | `npm run preflight` with no `--paths` and no `--runner`; a docs-, report- or rulings-only batch; the same pathspec again on the same HEAD with the same files; a full miner run without `--rule-change` | 0106 |
| `tooling/repo-standards/hooks/preflight_guard.py` (Agent, Task, Workflow) | a call launching a `deliver` lane whose prompt or script has no `Budget: <N> min` line | 0106 |

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
a review.

## Weekly drift check

`python3 tooling/repo-standards/workflow_drift.py --days 7` prints the five
drift measures with their red thresholds (the `cost-review` skill § 2b). To
run it every Monday at 07:00 on this machine, add one crontab line
(`crontab -e`):

    0 7 * * 1 cd /workspaces/elder-souls-argonia && python3 tooling/repo-standards/workflow_drift.py --days 7 >> tooling/.reports/workflow-drift.log 2>&1

or, inside a Claude session, `/loop 7d /cost-review`.
