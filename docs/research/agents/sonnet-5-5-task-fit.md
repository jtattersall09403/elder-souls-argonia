# Sonnet 5.5: task fit and routing (2026-09-30)

Owner ruling 2026-09-30 adds a Sonnet 5.5 delivery tier (`deliver-small`). This file records what the model is good for and the routing rule that follows; the binding rule lives in decision 0079 (addendum 2026-09-30).

## Facts (released 2026-09-28)

- Model id `claude-sonnet-5-5`; 1M context, 128k output.
- Price $2 / $10 per M input/output tokens (cache read $0.20); Opus 5.5 is $4 / $20, Haiku 4.5 $1 / $5. Anthropic reports up to 30% less cost per task than Sonnet 5 and >30% faster output.
- Anthropic's tables: Terminal-Bench 4.0 70.6% (Opus 5.5 66.4%); CursorBench 4.0 55.5% (57.8%); OSWorld 2.1 80.1% (81.8%); HLE with tools 64.5% (67.7%); FrontierCode 1.1 52.1% at xhigh (Opus 54.4%). About 98% of Opus's scores on average.
- Vals Index #2 of 66 (69.22% vs Opus 69.69%); #1 on Vibe Code Bench and Code Migration.

## Where it falls short of Opus 5.5

- Open-ended work needing sustained judgement; hard multi-disciplinary reasoning.
- Factual recall without tools (AA-Omniscience 32 vs 46): more confident wrong answers.
- Very long-context reconstruction and long-horizon tasks.
- Guidance: if a task would need Sonnet at max effort, use Opus instead.

## Effort

Well-specified multi-step tasks: medium; latency-bound chores: low. `deliver-small` runs at **medium** (low saves little on a job this size and costs retries); `run`/`preflight` stay low (they execute, not edit).

## Routing rule for this repo

| Task class | Agent |
|---|---|
| Look-up, read, search, git history, one measurement | `find` (Haiku) |
| Run a whole job and report pass/fail | `run` / `preflight` (Sonnet 5.5, low) |
| Fully specified edit to one file or a few named files: mechanical refactor/rename, a unit test beside a fix, a data-file or config change with the values given, a doc rewrite from a given spec, a scripted measurement to write and run | `deliver-small` (Sonnet 5.5, medium, budget ≤ 20 min) |
| Implementation across several files where delivery choices remain, diagnosis inside a brief, sourcing | `deliver` (Opus 5.5, low) |
| Place authoring, layout, Blender and geometry judgement | `place-builder` (Opus 5.5, medium) |
| A lane of a round | `lead` (Opus 5.5, medium) |
| Audit, sourcing, mining, UESP | `research` (Opus 5.5) |
| Scope, architecture, root cause, briefs, judging results | Fable 5.1 planner |

The test for `deliver-small`: could the brief be handed to a careful junior with no further question? If any decision, diagnosis or search for "where" remains, it is a `deliver` job. `deliver-small` returns rather than grows when the job turns out bigger.

Measure it: `tooling/repo-standards/session_tokens.py` prints cost units per agent type (`units <type>` rows), so the next cost review sees whether the tier is used.

## Sources

- [MarkTechPost, 2026-09-28: Anthropic releases Claude Sonnet 5.5](https://www.marktechpost.com/2026/09/28/anthropic-releases-claude-sonnet-5-5-70-6-on-terminal-bench-4-0-at-the-same-2-10-price/)
- [Unite.AI: Sonnet 5.5 at unchanged pricing](https://www.unite.ai/anthropic-releases-claude-sonnet-5-5-at-unchanged-sonnet-5-pricing/)
- [Vals.ai model page](https://www.vals.ai/models/anthropic_claude-sonnet-5-5)
- [Kingy.ai: specs, benchmarks, cost per task](https://kingy.ai/blog/claude-sonnet-5-5-specs-benchmarks-pricing/)
- [Developers Digest release guide](https://www.developersdigest.tech/blog/claude-sonnet-5-5-release-guide-2026)
