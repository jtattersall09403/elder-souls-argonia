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

