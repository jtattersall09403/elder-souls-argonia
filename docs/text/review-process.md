# Text review process

> Part of the text-quality workstream ([README](README.md), decision
> [0043](../decisions/0043-text-quality-workstream.md)). The rules being
> reviewed against are [style-guide.md](style-guide.md).

The premise (quests 60 §45e, owner 2026-09-01): **a writer cannot catch its own
register.** Model-written prose reaches for gravitas and produces constructions
nobody writes, and the writing agent is the last agent that will notice. So
review is a *separate agent*, always.

**How to run one:** invoke the `text-review` skill
(`.claude/skills/text-review/SKILL.md`) in a fresh agent and point it at the
files or region. It runs the linter, applies §3 and writes the edits.

## 1. Where text lives — the precondition

Every player-visible string is registered in **`packages/text-catalogue`** with
a stable `text.<area>.<name>` ID, a `surface` and (for dialogue) a `speaker`
(engineering standard 4). Never a literal in a component, a JSON data file or a
world-generation output.

This is not bookkeeping. It is what makes review *mechanical*: a reviewer reads
one table, filtered by `surface`, instead of grepping the codebase. A string
that is not in the catalogue is a string nobody reviews. Debug and developer UI
is exempt (not player-facing) and is not retrofitted.

**Write the `note` field.** It is the reviewer's brief: who is speaking, to
whom, what the line is *for*. A line without a note gets reviewed against
nothing but grammar.

## 2. When a review runs

| Trigger | Scope | Who |
|---|---|---|
| **Any change that adds or edits player-visible text** | just the added/changed entries | a review agent spawned by the writing agent, before it commits |
| **Phase wrap** (any phase that shipped text) | every entry added during the phase, read together | a dedicated review agent, batched |
| **A new culture register or a new C1/C2 voice sheet** | the first ~20 lines written in it | as above — the first lines set the register for everything after |

Per-change review is cheap because the diff is small. The **batch review at
phase wrap is the one that finds the real problem**, which is almost never a
bad line — it is *convergence*: forty NPCs from six cultures who have quietly
grown the same voice. That is only visible when the lines are read side by side,
so the batch pass is not optional and cannot be replaced by more per-change
passes.

## 3. What the reviewer checks

In order — stop-the-line failures first.

0. **The linter first.** `python3 -m worldgen.lint_prose` (catalogue) or
   `--no-catalogue --md <file>`; fix every hard hit before reading anything,
   and use the soft-candidate list (`and-closer`, `and-for-but`, `the-only`,
   `will-not-say`, `none-of`, `zinger-tail`) as the reading order for step 2. A review that starts with
   the eye repeats what the regex already knows.
1. **AI voice — phrases.** The banned-constructions table (style guide §2 and
   quests 60 §45e.1). Tricolons in system text, "the very", stranded
   prepositions reaching for weight, trailing ellipses for mood, "It is said
   that…", telling the player their feelings, negative parallelism, colon
   reveals, register vocabulary (*delve, tapestry, testament*). **The reviewer
   adds new rows on sight** — the table is meant to grow.
2. **AI voice — shape (qualitative).** Style guide §2.5. These are judged by
   eye, on a sample, with five tests (research:
   [ai-writing-tells.md](../research/text-and-voice/ai-writing-tells.md) §5):
   - **Read the paragraph aloud.** Trailer voiceover = fail.
   - **The Morrowind test.** Would a Morrowind book or NPC end on that line?
     Morrowind ends on facts and shrugs, not epigrams.
   - **The flourish count.** Per 10 records, count paragraph-final flourishes
     (a closer that is a judgement, not a fact). More than ~2 in 10 is a
     phase-level convergence finding, not a line edit.
   - **The and/but test** (style guide §2.4, owner 2026-09-04). For every *and*
     joining two clauses, ask whether the second contradicts, undercuts or
     surprises the first. If so it should be **but** — or be cut. Report which,
     per instance; "would read more naturally with *but*" is a finding, not a
     preference.
   - **Delete-the-last-clause.** Cut the paragraph's final clause. If it reads
     better, it was a flourish. Fastest of the five; catches antithesis pairs,
     colon reveals and self-gloss at once.

   - **The trying-too-hard test** (style guide §2.8, owner 2026-09-04). For
     every sentence ask "what is this sentence doing besides stating its
     fact?" Landing a line, turning on the reader, repeating a word for
     effect, compressing two facts into one clever one: each is a finding
     with a plain two-sentence rewrite. Then read the record's **last
     sentence alone**: if it could be a tag-line, replace it with a fact.
   - **The relative-pronoun test** (owner 2026-09-05). Wherever a noun is
     followed directly by another subject and a verb ("ground the tribes
     leave alone"), a *that / which / who / where* is missing: write it, or
     turn the clause round. Also swap soft idiom ("leave alone") for the
     concrete verb.
   - **The wiki test** (place records only). Could the paragraph be pasted
     into a UESP page about the place without an editor flagging tone?

   Also check for uniform sentence length, no flat sentences anywhere, every
   record built to the same fact-image-closer shape, and grandeur with no
   number, name or object in it.
3. **House rules.** British spelling, punctuation, capitalisation of in-world
   terms, honorifics, numbers, name forms (style guide §1).
4. **Register match — four layers.** Does the line sound like *this race, this
   upbringing, this region and this faction*, and like this character
   ([culture-registers.md](culture-registers.md) §0 and the voice sheet, quests
   60 §46b)? Check the layers separately: a common failure is a line that gets
   the region right and the race wrong — an Imperial or Khajiit resident given
   Argonian Jel qualifiers because the region is in the marsh. A line that
   would work equally well in another mouth has failed.
5. **Convergence** (batch pass). Read the phase's dialogue with the speaker IDs
   hidden and sort it **twice**: once by race, once by region. If either sort
   fails, the phase has one voice — and the usual one voice is the
   province-majority Argonian one.
6. **Newcomer comprehension.** No line assumes Elder Scrolls knowledge the
   quest has not taught (quests 60 §45d). Every load-bearing proper noun the
   line uses has a topic.
7. **Duplication of substance.** Two NPCs delivering the same exposition — the
   catalogue's duplicate-text test catches identical strings, not the same
   paragraph rewritten twice. That is a human-judgement check.
8. **Catalogue hygiene.** ID shape and area sensible, `surface` correct
   (`system` text is the one most often mis-filed as `ui` and thereby escapes
   the strictest register), speaker set, note written.

## 4. What the reviewer produces

**The specific edit, not a critique.** For each finding: the entry ID, the
offending text, the proposed replacement, and one clause of why. A review that
says "this feels a bit portentous" has done nothing.

Rulings the reviewer must *not* make alone: cutting content, changing what a
character knows or believes, or changing a lore fact. Those go back to the
writer or the owner. The reviewer owns *how it sounds*, not *what it says*.

Findings that reveal a rule gap → add the rule to the style guide (or a row to
the banned-constructions table) in the same change. The rulebook is meant to
absorb what review learns; otherwise every phase re-finds the same faults.

## 5. Escalation

- **A whole layer is wrong** (a race row, a region row, a faction row) → not a
  review fix. Raise it to the owner with two or three sample lines; the rows in
  [culture-registers.md](culture-registers.md) are load-bearing and changing one
  retunes everything written against it.
- **A rule and a good line conflict** → the line probably wins; record the
  exception in the style guide as an explicit carve-out rather than quietly
  breaking the rule. Silent exceptions are how a rulebook dies.
