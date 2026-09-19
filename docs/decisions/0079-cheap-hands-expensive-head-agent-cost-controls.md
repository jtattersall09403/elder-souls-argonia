# 0079 — Cheap hands, expensive head: agent cost controls

**Date:** 2026-09-19 · **Status:** accepted (owner asked for a cost cut
without a quality cut; measured, proposed, approved the same day).

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
   planner's context. `deliver` and `research` (Opus, low) keep their roles
   from the model policy in CLAUDE.md; nothing about who decides changed.
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
4. **Effort matches the policy in config.** Opus 5 at low effort by default
   (`modelSettings`), `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` so the built-in
   Explore/Plan/general-purpose agents never inherit Fable.
5. **CLAUDE.md carries the rule, the record carries the history.** Every
   subagent loads CLAUDE.md; its golden rules were rewritten to one
   operative statement each, with the dated owner history left in the
   decisions they cite. No rule was dropped or weakened.
6. **Measure, don't hope.** Re-run the script after a week of sessions; the
   cached-input total per session and the shell share are the numbers that
   should fall.

## Not done here

`rtk init -g` and the two config edits touch the owner's own Claude Code
settings, which the harness rightly refuses to let an agent self-modify;
the owner runs them (three lines, given in the handoff).
