# 0079 — Cheap hands, expensive head: agent cost controls

**Date:** 2026-09-19 · **Status:** accepted (owner asked for a cost cut
without a quality cut; measured, proposed, approved the same day).

> **Partly superseded by [0106](0106-how-we-work-fix-at-source-one-preflight-per-batch-scoped-for-real.md)** (2026-09-28): rule 8's review of non-code diffs and its 20 min fix window.

## The measurement

`python3 tooling/repo-standards/session_tokens.py --last 25` on the
transcripts of the 25 sessions before this record:

| Billed class | M tokens |
|---|---|
| cached input re-read | 2,770 |
| new input written | 63 |
| output | 11 |

The bill is the planner re-reading its own growing conversation every turn:
cost per session ≈ turns × length. Of what the planner carried, shell output
was 68% (39% work commands, 28% looking around), code reads 21%, docs 6%,
images 3% (billed flat at ~1,600 tokens each, so file size misleads). The
work commands were 2,400 medium calls (~400 tokens each), not a few dumps:
the lever is the **number of planner turns**, not output size.

## The rules

1. **Fable never types exploratory or long-output commands.** Looking around
   (list, search, read a range, git history, measure a number) goes to the
   `find` agent (Haiku, read-only, `omitClaudeMd`). Whole jobs (compile,
   publish, test, preflight, chain stages) go to the `run` agent (Sonnet,
   low). Both return a few lines of evidence; the output never enters the
   planner's context. `deliver` and `research` (Opus 5.5, medium since
   2026-09-23, see the addendum below) keep their roles
   from the model policy in CLAUDE.md; nothing about who decides changed.
   **Enforced** (owner, same day, after a resumed session typed 25 shell
   commands in 53 turns): a `PreToolUse` hook in the committed
   `.claude/settings.json` (`tooling/repo-standards/shell_guard.py`) refuses
   cat/head/tail/grep/sed -n/find/tree, `git log|diff|show|grep|blame`,
   inline python and `sleep` from the planner session with a message naming
   the agent to use; subagents (hook input carries `agent_id`) are exempt,
   as are `git status`, `wc`, builds and tests. Two more nudges before the
   guard: CLAUDE.md states that Claude Code's auto-mode notice ("prefer
   cat/sed/grep") does not apply to the planner (that notice was pulling
   sessions toward exactly these commands); a `UserPromptSubmit` hook
   injects a one-line reminder with every owner message. Session-start hook
   output is not shown in the chat, so the planner quotes the token report
   line in its first update.
2. **One chunk or round per session.** Start fresh from PROGRESS.md; a
   session twice as long costs about four times as much.
3. **rtk filters shell output on this machine.** Installed from the signed
   v0.49.0 release (hash in README § Credits), wired by `rtk init -g` as a
   Claude Code hook in the owner's global settings (environment, never
   committed). It keeps failing lines and offers `rtk recall <id>` for the
   full text; smoke-tested on a failing pytest, `git status` and
   `typecheck`. Removed by deleting the hook. Not a proxy: it never sees the
   API connection or credentials. Proxies on the API connection (squeezr,
   tamp, ClaudeSlim) and cross-provider routers were ruled out for that
   reason; symbol-navigation servers (Serena, Repomix, Atlas) were ruled
   out because our exploration is shell and docs, not symbol lookup.
4. **Low effort by default for every model, Fable included** (owner
   2026-09-19), set in `modelSettings`, except Opus 5.5 at medium (addendum
   2026-09-23); a session that needs deeper
   reasoning raises it for that session only (`/effort high`).
   `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` so the built-in Explore/Plan/
   general-purpose agents never inherit Fable.
5. **CLAUDE.md carries the rule, the record carries the history.** Every
   subagent loads CLAUDE.md; its golden rules were rewritten to one
   operative statement each, with the dated owner history left in the
   decisions they cite. No rule was dropped or weakened.
7. **A periodic review, not a standing monitor** (owner, same day). The
   `cost-review` skill (`/cost-review` in a fresh session, about weekly)
   runs the report over three windows (planner + subagent tokens, cost
   units by Anthropic's price ratios, turns, explore calls, sleeps, guard
   refusals, agent calls by type), checks each control still fires, names
   the top sources and the sessions that broke the pattern, recommends at
   most five changes ranked by saving ÷ risk, then appends to
   `docs/research/agent-ops/cost-reviews.md`. It researches outside the
   repo only on a trigger (a new cost category or a broken control).
   The first run of the report found 1,210 sleep turns in the older
   sessions and Opus subagent spend comparable to the planner's own.
8. **The code review runs itself before preflight** (owner, same day).
   *Extended by [0087](0087-opus-decides-when-delegated-no-lane-cap-review-by-pathspec.md) §3: `--paths <pathspec>` reviews one commit's files, with its own stamp.*
   `tooling/repo-standards/review_gate.py` is a `PreToolUse` hook on any
   `preflight` command: no change → allow; stamp matches the diff → allow;
   stamp younger than 20 min → allow (the fix cycle); otherwise it runs
   `claude -p` on Opus (owner 2026-09-19: Opus has weekly headroom and
   review is judgement; tested on Sonnet first; Opus 5.5 at medium effort
   since 2026-09-23, passed as `--model` and `--effort` so it does not
   depend on the machine's settings) with read-only
   tools over the uncommitted diff
   (JSON and lockfiles excluded, small new source files included, 250 KB
   cap), writes `.claude/review-findings.md` and a stamp (both gitignored),
   then either lets preflight run (no findings) or refuses it with the
   findings as the message. `--run` reviews the uncommitted diff on demand;
   `--range` reviews a committed range. The orchestrator never has to remember the
   review; its first preflight attempt *is* the review. The gate fires for
   subagents too; the `preflight` agent is the standard caller and reports
   review + gates in a fixed compact shape (owner 2026-09-22). A review that
   cannot run stamps, allows and says so, so a broken reviewer never blocks
   work. Fable judges: CONFIRMED items are acted on or rejected with the
   ruling named; PLAUSIBLE items are questions. Tested 2026-09-19: two
   planted bugs both CONFIRMED with correct failure scenarios; a real
   PLAUSIBLE item raised on the live diff (an import of an untracked
   generated file). The built-in `/code-review` skill was not used because
   a headless session cannot ask permission for `git diff`; the hook
   computes the diff and pipes it to the reviewer.
9. **The reviewer reports symptoms; Fable finds causes** (owner, same
   day: Opus reviews had proposed short-sighted fixes that ignored records
   and downstream systems). The reviewer prompt forbids suggested fixes,
   requires the decisions index and the active phase brief to be checked
   before any design-shaped item, then names the records checked; CLAUDE.md
   makes the planner batch CONFIRMED items and fix the shared cause once.
   Fable's expensive reasoning is spent only on defects that survived
   verification, never on finding them.
10. **Context is found by crawling, never by keyword search** (owner, same
   day), as a golden rule and a session-start step (scan the decisions
   index titles, read the records that touch the task, fan out with `find`
   agents over folder names, filenames and READMEs). Measured before the
   rule: across 25 sessions, 42 of 79 decision records were ever opened and
   the ten most-opened were all records the sessions themselves were
   writing; the older, binding ones were reached only when a router row
   named them.
6. **Measure, don't hope.** A `SessionStart` hook in the committed
   `.claude/settings.json` prints one line at every session start: the last
   ten sessions' average cached input, turns and shell share against the
   baseline above (111M, 280 turns, 68%). Those numbers should fall; if
   they climb back, the agent says so in its first update.

## Addendum 2026-09-21 (second cost review, owner rulings)

The review (`docs/research/agent-ops/cost-reviews.md` § 2026-09-21) found
the 0079 controls firing (5 planner shell calls per session, 0 sleeps,
find/run in use) and the bill now plain turns × context, with three
turn-wasters left. The owner ruled the same day:

11. **No acknowledgement-only turns.** Every subagent wakes the planner
    twice (hand-back message, then completion notice) and the whole
    conversation is re-read on each wake, so a "still waiting" reply costs
    a full turn and saves nothing. Measured: 14 of 96 planner turns in one
    lane session, ~15% of its bill. The "Update on progress" golden rule
    now says updates ride on turns that do work; a non-actionable wake gets
    no reply; small look-ups are folded into one brief; a fan-out of two or more agents (owner 2026-09-23; was three)
    with nothing between them runs as one `Workflow` (the
    owner's opt-in is the CLAUDE.md line itself).
12. **The prose linter covers what will be player-facing, and nothing
    else.** Player-facing means it will appear in the game or in any of our
    apps, the studio's review panels included (owner, same day, correcting
    a narrower reading that had dropped world records): every world record
    under `world/sources/` and every string in `packages/text-catalogue`,
    hand-written or generated. Docs are agent context and are not linted.
    The linter walks both roots in full with no field list, so a new kind
    of player text (dialogue, item text) is linted the moment it exists;
    the only exemptions are machine data and lore dossiers, each with a
    written reason in `lint_prose.py`; a tripwire fails on prose data
    anywhere else under `packages/` or `apps/`. A `PostToolUse` hook runs
    the linter on every file saved under the roots and returns the hits to
    the editing agent in the same turn, so text is right first time rather
    than at the gate. Place names and quest titles are generated into the
    catalogue (`text.place.<id>.name`, `text.quest.<id>.title`) with a
    freshness gate, closing the standard-2 hole. The docs-currency checks
    are unchanged. When the gate is red anyway, the `run` agent fixes the
    named lines and reruns; the planner sees the count.
13. **Subagent reports are written for re-reading, not capped.** A hard
    length cap was rejected (some reports must be long). Each agent
    definition now carries a specific report shape: outcome first, each
    fact once, only what the caller must decide on, evidence as file:line
    or a number, no code block over five lines (raw output to a file), no
    narration, hedges or suggestions, and no re-reading or re-running while
    working. Target: the 18% of carried planner context that reports had
    become once shell output was gone.

14. **The session itself is a cost.** When continuing costs more than a
    fresh start, a hook prices it per step and the planner offers the
    choice at each owner check-in; switches happen at natural breaks
    (decision 0083).

## Addendum 2026-09-23 (Opus 5.5)

15. **Every Opus route uses Opus 5.5 at medium effort** (owner, on its
    release). The `deliver` and `research` agents pin
    `claude-opus-5-5[1m]` with `effort: medium` in their frontmatter; the
    review gate passes the same model and effort; the owner's global
    `modelSettings` carries `claude-opus-5-5: medium`. Every other model
    stays at low effort (rule 4). Roles are unchanged: Opus still never
    diagnoses, designs or decides.
    *Amended by [0087](0087-opus-decides-when-delegated-no-lane-cap-review-by-pathspec.md) §1: Opus decides what a brief delegates to it.*
16. **Opus recommends; Fable decides** (owner 2026-09-23). Opus 5.5 is
    capable enough that a brief can be slightly less directive, and the
    `deliver` and `research` agents now end every report with a
    `Recommendations` section: what the rules as written did not give,
    what the evidence points at, what they would do. The planner reads
    it as input and takes or rejects each item in the next brief; the
    decision and its record stay Fable's.

## Addendum 2026-09-26: rule 17, exploration is comprehensive and funnelled; rules 18-19

17. Any explore, audit, sourcing or "what exists for X" task covers the full
    breadth that could bear on it (docs folders and READMEs, the decisions
    index, research, phases, standards, skills, `world/sources/`, code folder
    READMEs, the vault and mod pool by listing) before it reports. Breadth
    comes from parallel cheap agents, not a bigger context: one `find` agent
    per area (a Workflow for two or more), each owning named folders and
    walking all of them, each returning at most 25 lines (full notes to
    `tooling/.reports/`). A partial walk names what it skipped. Text in
    CLAUDE.md's golden rules. Agent files: `.claude/agents/find.md` gains a
    Coverage section (walk every owned folder, a closing
    `Covered: … · Skipped: …` line, a "does not exist" answer names the
    folders listed); `.claude/agents/research.md` gains the same line and the
    one-agent-per-area split. The UserPromptSubmit line in
    `.claude/settings.json` reminds the planner every turn.
18. **2026-09-26: an agent may stage its own new files.** A pathspec commit
    of a new file needs it staged, which the agents' "never `git add`" rule
    forbade. `git add -- <path>` is allowed only for files you created in this
    brief, immediately before the pathspec commit that includes them; never
    `git add -A`, `.` or a directory. Text in `.claude/agents/deliver.md` and
    `run.md`.
19. **2026-09-26 (owner): Opus 5.5 `deliver` agents hold creative control
    over headless Blender work** (shot choice beyond `--shots auto`, cameras,
    lighting, render-script improvements) in place builds and all future
    builds; Fable's brief fixes the layout and the bars, Opus decides how to
    look at it. Standing note in `.claude/agents/deliver.md`.
    **Widened 2026-09-28 (owner, walk 4):** the same agents place with
    Blender directly when the workbench lacks a command (`wb.py bpy
    <scene> <script>` loads the whole scene for their script: ray casts,
    bounds, contacts), and add the missing command in the same lane.
    "Needs a new placing tool" is never a hand-off line (0106 decision 15).

## Addendum 2026-09-30: the Sonnet 5.5 delivery tier (owner)

20. **Tiers** (owner 2026-09-30): Fable 5.1 plans and orchestrates; `lead` is Opus 5.5 medium; `deliver` is Opus 5.5 low and the main delivery type; `deliver-small` is Sonnet 5.5 (`claude-sonnet-5-5`) at medium; `find` stays Haiku; `run` and `preflight` are Sonnet 5.5 low. Goal: no weekly usage spent on a turn or task a cheaper agent can do.
21. **Routing to `deliver-small`**: the planner, a lead or a `deliver` agent hands it a job of one or a few named files with the mechanism, values and check given and nothing left to decide: a mechanical edit or refactor, a unit test beside a fix, a data or config change, a doc rewrite from a given spec, a scripted measurement. Budget 20 min or less. A decision, a diagnosis, a search for "where", sourcing or place work keeps the job on `deliver` (or `place-builder`); `deliver-small` returns rather than grows. Evidence and sources: [docs/research/agents/sonnet-5-5-task-fit.md](../research/agents/sonnet-5-5-task-fit.md).
22. **Measured**: `tooling/repo-standards/session_tokens.py` prints subagent cost units per agent type (`units <type>`, from each subagent's `meta.json` `agentType`), so a cost review sees whether each tier is used.

## Not done here

`rtk init -g` and the two config edits touch the owner's own Claude Code
settings, which Claude Code rightly refuses to let an agent self-modify;
the owner runs them (three lines, given in the handoff).
