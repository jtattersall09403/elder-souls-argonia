---
name: cost-review
description: Periodic cost review of our Claude Code usage (decision 0079). Runs the token report over three time windows, checks every cost control is still firing, names where the spend now comes from and which sessions broke the pattern, and recommends the next safe reductions. Run in a FRESH session with "/cost-review" whenever the owner asks or about weekly; research GitHub only on a trigger, never routinely.
---

> **Written against** (decision 0086 rule 4; `routing-audit` checks these):
> decision 0079 (cost controls, rules 1–16); the previous review's last
> section in `docs/research/agent-ops/cost-reviews.md`. If a cited record
> has moved, this skill is stale: report it, do not follow it blind.

You are reviewing cost, not doing project work. Keep this session short
(aim: under 15 turns). The script does the counting; you do the judgement.
Never edit settings, hooks or agents in this review: recommend, the owner
approves, and the change is made with its own commit. Read
[docs/decisions/0079](../../../docs/decisions/0079-cheap-hands-expensive-head-agent-cost-controls.md)
first (short) and, if it exists, the previous review at
`docs/research/agent-ops/cost-reviews.md` (read only its last section).

## 1. Measure

Hand BOTH commands to one `run` agent and ask for the full output back
verbatim (it is short):

```
python3 tooling/repo-standards/session_tokens.py --sessions 5
python3 tooling/repo-standards/session_tokens.py --days 1 --sessions 3
```

The 7-day windows show the trend; the 1-day windows show whether the last
day's sessions behave. "cost units" is the number to compare across
windows (planner + subagents, weighted by Anthropic's price ratios).

## 2. Check the controls (each is a yes/no with the number that proves it)

- **Sessions are short**: turns per session falling towards ~150 or less.
- **The planner is not exploring**: planner shell calls per session and
  "of which explore" falling towards single figures; `bash-explore` share
  of carried context falling from the 0079 baseline (68% shell).
- **No sleeps**: sleeps (total) in the latest window is 0; every sleep is a
  wasted turn that re-sent the whole conversation.
- **The guard is live**: guard refusals > 0 in the latest window if any
  session tried; 0 refusals AND high explore counts means the hook is not
  firing (check `.claude/settings.json` exists on this checkout).
- **Cheap agents are used**: agent calls by type include `find` and `run`;
  `general-purpose` / `(default)` calls near 0 (they inherit the planner's
  model unless `CLAUDE_CODE_SUBAGENT_MODEL` is set).
- **Subagent spend is proportionate**: `sub opus` and `sub fable` M per
  session; if opus subagents cost more than the planner, look at whether
  briefs are sending Opus work that `run`/`find` (Sonnet/Haiku) could do.
- **Hook lines are printed**: the SessionStart report line appears at
  session start (it is in the transcript even if not in the chat).

## 3. Where the spend is now

From the latest window: the three largest sources by cost units and, for the
costliest sessions listed, what pattern made them expensive (turns, explore
calls, sleeps, subagent volume). The costliest-sessions line usually
explains the pattern by itself; only when it does not, read that session's
transcript via a `find` agent asked a narrow question (e.g. "list this session's 20 longest
Bash commands and whether each was exploratory"); never open a transcript
yourself.

## 4. Recommend

At most five recommendations, each with: the number it targets, the expected
saving (from the report, not a guess), the risk to quality, and what the
change is (one line). Order by saving ÷ risk. Say plainly if nothing needs
changing. Do not recommend proxies on the API connection or third-party
code that touches credentials (0079 rules them out).

**Research trigger** (the only time you look outside the repo): a new cost
category that no control addresses, or a control that has stopped working
for a reason the harness owns. Then check `docs/research/agent-ops/` first,
search once, and add findings to `cost-reviews.md`, not a new file.

## 5. Record

Append one dated section to `docs/research/agent-ops/cost-reviews.md`
(create it with a two-line README-style header if absent): the three-window
table's key rows, the control checks as a checklist, the recommendations,
and what the owner decided (leave "owner: pending" for them to fill).
Commit that one file by pathspec. Tell the owner, in plain English, the
trend in one sentence, then the recommendations as bullets.
