---
name: routing-audit
description: Walk a chunk's or phase's read list as a fresh agent would, check its Starting state against the tree, and report contradictions, stale claims and blank-slate assumptions BEFORE building. Run at the start of every `deliver NNx`, at every phase start, and over the whole routed set at a phase close.
---

> **Written against** (decision 0086 rule 4; step 5 checks the other
> skills' headers and this one): decision 0066 (downstream stages read the
> signed record, never re-solve it); decision 0086 rule 4 (step 5);
> standard 15 (`docs/standards/engineering.md` §15); the 2026-09-13
> docs-currency audits (Starting state per brief, reconcile before write).
> If a cited record has moved, this skill is stale: report it, do not
> follow it blind.

# Routing audit

**Why.** On 2026-09-13 three read-only audits found the same disease across
the docs: a router row pointing at a description of a retired system, a
deleted script still recommended, the same list counted three ways, phase
names kept alive after the phase was absorbed, and briefs that read as if
the codebase were a blank slate. Standard 15 catches the mechanical part
(links, retired words, research index). This skill is the judgement part.

**Two modes, and the cheap one is the default.**

- **Pre-build check** (the delivering agent, first step of any `deliver NNx`
  or phase start; ten minutes, no write-up): run steps 3 and 5 only — `ls`,
  `git log -3` and the named gates against every claim in the brief's
  Starting state and Read list. Report mismatches in a short list to the
  owner before building; fix the brief's Starting state (replace it, never
  append; keep it under twenty lines). Do not reconstruct the belief set;
  that costs context the build needs.
- **Phase-close audit** (a fresh agent: Opus `research` for non-water
  topics, Fable for anything water; also whenever a brief's Starting state
  is older than the last chain run): all six steps over the whole set the
  phase's briefs route to.

**Steps.**

1. **Walk the route literally.** CLAUDE.md "Where are we up to" →
   PROGRESS.md → the phase plan → the brief → world/00-core → the router
   rows the task touches → everything the brief's Read list names → what
   those name as binding. Write the path down with rough sizes. If it is
   over ~60k tokens, say which items carry nothing for this task.
2. **Reconstruct the belief set.** A numbered list of every rule, number,
   target, prohibition and "keep" instruction the routed set would make a
   fresh agent hold, each with file:section.
3. **Check the Starting state against the tree.** For every claim in the
   brief's Starting state and Read list: `ls` the paths, `git log -3` the
   files, run the gates it names. List what exists, what is broken, what is
   red, what the brief assumes exists but does not, what it tells you to
   build that already exists in some form.
4. **Find contradictions.** Two routed passages that disagree on a rule, a
   number, a path or a phase name; superseded decisions cited as live;
   retired vocabulary; duplicated guidance that has drifted. For each: the
   passages (file:section, one-line quotes), which wins by the repo's
   precedence (dates, supersession banners, decisions over modules,
   CLAUDE.md over all), what an agent would do wrong.
5. **Check skill citations** (decision 0086 rule 4; both modes). For every
   skill under `.claude/skills/`, read its "Written against" header and
   check each ledger row and decision record it cites: the row or record
   exists at the named path and section, and still says what the skill
   relies on (`git log -1` the cited file against the skill's; a newer
   commit means read the cited section again). A row renamed or moved, a
   record superseded or amended, or a skill with no citation header is a **stale claim**: report it as
   skill · citation · what changed (file:section, one-line quote). Do not
   rewrite the skill in the audit; route it to the agent that owns the
   job the skill covers.
6. **Report, then fix or route.** Findings ranked by how badly they would
   mislead, with a per-file "rewrites needed" list naming the winning
   passage. If you are the delivering agent: fix the docs first (same
   commit discipline as any change), rewrite your own Starting state, and
   only then build. If you are the closing agent: rewrite the **next**
   brief's Starting state from your ledger. Anything about water goes to a
   Fable agent.

**Output shape.** Routing path · belief set · Starting state (verified) ·
contradictions ranked · stale pointers · stale skill citations · rewrites
needed. Terse, evidence first, under ten minutes to read.
