# Cost reviews

Appended by the `cost-review` skill (`.claude/skills/cost-review/`), newest last. Numbers come from `tooling/repo-standards/session_tokens.py`; the baseline is in decision 0079.

## 2026-09-19 — first run, day of the 0079 controls landing

Baseline (pre-0079, 25 sessions): 111M cached, 280 turns, shell 68%.

### Three-window table (key rows)

| | last 7 d | previous 7 d | older |
|---|---|---|---|
| sessions | 23 | 16 | 45 |
| turns (avg) | 353 | 463 | 390 |
| planner cached M (avg) | 143 | 178 | 122 |
| cost units M (avg) | 30.5 | 51.8 | 23.2 |
| sub opus tokens M (avg) | 37.2 | 139.2 | 22.3 |
| sub fable tokens M (avg) | 11.3 | 27.5 | 4.9 |
| planner shell calls (avg) | 161.7 | 201.6 | 123.9 |
| of which explore (avg) | 142.3 | 172.8 | 106.4 |
| sleeps (total) | 303 | 715 | 322 |
| guard refusals (total) | 8 | 0 | 0 |
| bash-explore share of carried context | 66.7% | 69.3% | 33.2% |
| agent calls by type | deliver:101, research:43, general-purpose:18, find:14 | deliver:100, general-purpose:92, research:34, (default):11 | general-purpose:143, (default):42, Explore:28, fork:1 |

1-day window (8 sessions today vs 3 yesterday vs 73 older): cost units 21.7M avg today vs 48.3M avs yesterday vs 30.9M older; sleeps 60 total today vs 70 yesterday vs 1210 older; agent calls today include the new `find:14, run:12` (absent from every earlier window).

Costliest sessions, last 7 d: `a8d8bde8` (965 turns, 96.6M units, 429/370 shell/explore, 0 sleeps, deliver:16) and `75f79fdf` (945 turns, 93.8M units, 493/428 shell/explore, deliver:18/research:8) — both ran before the guard existed and each is several "rounds" long, not the one-chunk-per-session pattern the rule requires.

### Control checks

- **Sessions short (turns → ~150):** NOT YET. Last-7d avg 353 turns, actually rose from older (390) through previous-7d (463) before easing; today's 8 sessions average 249 — moving the right way but still well above 150.
- **Planner not exploring:** NOT YET. bash-explore share is 66.7% last 7d, next to baseline's 68%; shell/explore call counts are falling only slightly. The guard (`shell_guard.py`, confirmed present in the committed `.claude/settings.json`) only started firing today (8 refusals, vs 0 in every prior window) — too new to show in the 7-day average.
- **No sleeps:** NOT YET but improving hard. 60 sleeps today vs 1210/window in the older cohort — the historical sleep pile was in old sessions, not new ones; today is not zero.
- **Guard live:** YES. 8 refusals appear only after 0079 landed (today); `.claude/settings.json` has `shell_guard` wired. Working as designed.
- **Cheap agents used:** PARTIAL, very new. `find` and `run` appear for the first time today (find:14, run:12), alongside `deliver:33, research:11`. Every earlier window used `general-purpose`/`(default)` almost exclusively — those are pre-0079 sessions the new roster hadn't reached yet.
- **Subagent spend proportionate:** NO. Previous-7d sub-opus averaged 139.2M tokens/session against a planner cost-units average of 51.8M — Opus subagent spend exceeded the planner's own by more than 2x in that window. Last 7d it's 37.2M opus vs 30.5M cost units — still opus-heavy relative to the planner.
- **Hook lines printed:** not independently verified this run (would need a transcript read); deferred, no evidence of failure.

### Recommendations (ranked by saving ÷ risk)

1. **Let the guard's first full week speak before changing anything.** Target: bash-explore share (66.7% → toward 0%) and shell-call counts. Expected saving: large — the two costliest sessions this window (a8d8bde8, 75f79fdf, together ~190M cached tokens) predate the guard; 0079 already names the fix. Risk: none — no change, just re-measure next week. Change: none.
2. **Split multi-round sessions.** Target: turns/session (353 avg, two sessions at 945-965 turns). Expected saving: a session at ~150 turns instead of ~950 is roughly a 6x cost cut per 0079's own math (cost ≈ turns × length). Risk: low — this is already rule 2 in 0079; it just needs the owner/agents to actually stop and restart between chunks. Change: reinforce in CLAUDE.md/PROGRESS.md handoff language (no code change).
3. **Route more research/audit work to `research`/`find` instead of `deliver`/`general-purpose`.** Target: agent-calls-by-type mix; `deliver` (101 last 7d) still outnumbers `find`+`run` combined (14, only appearing today). Expected saving: proportional to how much of that `deliver` work was actually read-only diagnosis mislabelled as delivery — unquantified this run, worth checking next review once `find`/`run` have a full week of data. Risk: low, this is already the intended routing; watch for regression. Change: none this round — re-check next week.
4. **Investigate why previous-7d sub-opus averaged 139.2M tokens/session** (2.7x the planner's own cost units that window). Expected saving: unclear without a transcript — flagged as the "opus subagents costing more than the planner" trigger in the skill's own checklist. Risk: needs a `find` agent on the specific costly sessions before recommending anything concrete. Change: none yet — queue as next review's first job if the ratio hasn't corrected itself.
5. **Nothing to change on sleeps or the guard mechanism itself.** Sleeps are already concentrated in old sessions (1210 in "older" vs 60 today) and the guard is firing as designed since today. Risk/change: none.

Owner: pending

## 2026-09-21 — second run, two days after the controls landed

Owner questions this run: the docs prose linter's cost at session end; whether agents can prune their own context; "waiting for agent N" turns; whether to tell the planner to minimise turns.

### Three-window table (key rows)

| | last 7 d | previous 7 d | older | last 1 d | previous 1 d |
|---|---|---|---|---|---|
| sessions | 26 | 16 | 49 | 7 | 5 |
| turns (avg) | 297 | 479 | 387 | 178 | 240 |
| planner cached M (avg) | 106 | 192 | 123 | 34 | 59 |
| cost units M (avg) | 26.8 | 48.3 | 25.1 | 18.8 | 21.0 |
| sub opus tokens M (avg) | 42.2 | 107.4 | 31.6 | 46.6 | 55.0 |
| sub haiku / sonnet M (avg) | 3.4 / 1.6 | 0 / 0.6 | 0 / 0.5 | 10.9 / 4.1 | 2.7 / 1.8 |
| planner shell calls / explore (avg) | 114 / 101 | 209 / 180 | 128 / 110 | 5.1 / 5.0 | 82 / 71 |
| sleeps (total) | 193 | 673 | 474 | 0 | 27 |
| guard refusals (total) | 14 | 0 | 0 | 3 | 11 |
| agent calls by type | deliver:133, find:73, run:67, research:48 | deliver:103, research:42, general-purpose:23 | general-purpose:212, (default):45 | find:61, run:50, deliver:41, research:14 | deliver:26, run:17, find:12 |
| carried context: bash-explore / read-doc / Agent | 60% / 9% / 3% | 70% / 16% / 3% | 38% / 22% / 1% | 0.5% / 40% / 18% | 77% / 16% / 3% |

Costliest sessions, last 1 d: `0a412744` (364 turns, 106M cached, 53.4M units, deliver:18, find:9, run:8; the vegetation lane running rounds 1 and 2 in one session at the owner's request), `b4af9a7f` (332 turns, 56M cached, 41.7M units, find:24, deliver:19, run:9, zero shell), `b0caff78` (194 turns, 38.5M cached, 12.4M units, run:12, find:8).

### Control checks (last 1 d unless stated)

- **Sessions short (→ ~150):** NEARLY. 178 avg (7-day 297, previous 7-day 479). The two 330–360-turn sessions were multi-round by the owner's choice.
- **Planner not exploring:** YES. 5 shell calls per session, bash-explore 0.5% of carried context (77% the day before).
- **No sleeps:** YES. 0.
- **Guard live:** YES. 3 refusals; 14 over the week.
- **Cheap agents used:** YES. find:61, run:50; no general-purpose or default calls.
- **Subagent spend proportionate:** NO. Opus subagents 46.6M tokens per session against planner cost units of 18.8M. `deliver` is the intended implementer so most of this is expected; `research` (Opus, 14 calls) is the part to watch: a read-only audit with a narrow question is `find` work.
- **Hook lines printed:** YES (session-start line quoted at the top of this session).
- **New carry pattern:** with shell gone, the planner's context is now 40% doc reads and 18% subagent reports. No control caps report length.

### Where the spend is now

1. Planner cached re-reads (34M/session): turns × context. Context near the end of the last three sessions was 180–190k tokens, so every late turn costs ~19k input-equivalent whatever it does.
2. Opus subagents (46.6M tokens/session): deliver and research.
3. Everything else is small (Haiku 10.9M, Sonnet 4.1M).

### The owner's four questions, measured

**1. Docs prose linter.** The linter is ~2 s (`check.mjs:429`) and lints `docs/**/*.md` as a ratchet against a baseline (only new hits fail) plus the player-visible sets (catalogue prose, quest rows, text catalogue, blueprints). It runs inside `npm test`, so inside the deploy gate. Its cost is not runtime but the fix cycle: each red run at ~190k context costs the planner several turns to read hits, edit and rerun. In the only recent session that reached the gate (`4157f1e4`) the four gate runs spanned turn indices 262–779; docs-lint fix turns cannot be separated from code-review fixes in the transcript, so the saving is bounded, not measured: roughly 5–10 planner turns per session that reaches the gate, ~1–2M cached tokens, 3–5% of such a session. Docs prose is agent context, not player text, but the AI-tell bans keep docs cheap and clear for the next agent, so dropping the check loses something. The cheaper shape: keep the docs ratchet, never let the planner do the fix cycle.

**2. Can an agent prune part of its own context?** No. Claude Code gives the model no way to edit or drop earlier messages; the only compression is `/compact` (whole-conversation summary, manual or automatic near the window limit), which costs one large uncached turn and loses detail. A rule asking the planner to judge when to purge would itself cost turns. The economics favour leaving stale text in place: a cached re-read is a tenth the price of writing it, so 20k tokens of doc read early costs ~2k input-equivalent per later turn. The lever is the one 0079 already pulls: keep large text out of the planner's context in the first place. The 40% read-doc share says some sessions still read docs whole; the 18% Agent share says subagent reports land long.

**3. Waiting turns.** In the three most recent transcripts (excluding this one): 14 of 96 planner turns in `7ecb8df9` and 8 of 236 in `4157f1e4` were pure "still waiting on the agents" replies with no tool call, at 180–190k context each. In the first that is ~2.5M cached tokens, ~15% of that session's planner bill. Mechanism (owner's observation, confirmed in this session): each subagent wakes the planner **twice**, once with its hand-back message and again with the completion notification, and the planner replies to both. Three agents launched together produced six wakes, four of which did nothing. The whole conversation is re-read on every wake, so a shorter reply saves nothing; only fewer wakes do, and the double wake is harness behaviour the planner cannot suppress. What it can do: (a) never spend a turn whose only content is an acknowledgement or a status line; (b) brief agents so each report is actionable alone and act on it when it lands; (c) put several small look-ups in one brief rather than one agent each; (d) for a fan-out of three or more agents with nothing to do between them, use one `Workflow` script, which notifies once. The Workflow tool requires explicit owner opt-in per its own rules. The CLAUDE.md golden rule "frequent, short progress updates" is part of the cause: it reads as a licence to spend a turn on an update.

**4. "Minimise turns" as an instruction.** A blanket rule would be counter-productive: the planner would batch into giant turns, do shell work itself to avoid a delegation round-trip, and skip required check-ins. Name the specific wasteful turn types instead: acknowledgement-only turns, independent tool calls issued one per turn, and gate fix cycles run by the planner.

### Recommendations (ranked by saving ÷ risk)

1. **No acknowledgement-only turns.** Targets the waiting turns (8–14 per agent-heavy session, up to ~15% of the planner bill). Risk: none to quality. Change: reword the "Update on progress" golden rule to "updates ride on turns that do work; a subagent hand-back or notification with nothing actionable gets no reply", and add "fold several small look-ups into one brief".
2. **Fix cycles for mechanical gates go to `run`, not the planner.** Targets late-session fix turns (5–10 at ~190k). Saving ~1–2M cached tokens per session that reaches the gate (3–5%). Risk: low; the linter names line and phrase, and `run` already edits per brief. Change: one line in the CLAUDE.md gate rule: "docs:check and prose-lint reds are fixed by the `run` agent, rerun until green; the planner sees the count".
3. **Docs prose ratchet becomes warn-only in the deploy gate; player-visible prose stays hard.** Targets the same turns when (2) is not followed. Risk: docs drift toward AI-tell prose; mitigated by the ratchet still printing and `npm run docs:check` staying red for the author. Change: `check.mjs` treats `--docs-gate` hits as warnings unless `--strict-docs`.
4. **Cap subagent report length in the four agent definitions.** Targets the 18% Agent share (~6M of 34M cached per session); saving up to ~3M if reports halve. Risk: hidden evidence; mitigate with "file:line and numbers, ≤30 lines; longer evidence to a file the planner can ask `find` about". Change: one line in each `.claude/agents/*.md`.
5. **Workflow for fan-outs, on trial.** Targets the double wake per agent. Risk: authoring turns and over-spawning; only for ≥3 independent agents with nothing between them. Change: owner opts in with a CLAUDE.md line; measure waiting turns next review.

Owner: pending

