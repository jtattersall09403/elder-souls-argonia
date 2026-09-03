# Text review process

> Part of the text-quality workstream ([README](README.md), decision
> [0043](../decisions/0043-text-quality-workstream.md)). The rules being
> reviewed against are [style-guide.md](style-guide.md).

The premise (quests 60 §45e, owner 2026-09-01): **a writer cannot catch its own
register.** Model-written prose reaches for gravitas and produces constructions
nobody writes, and the writing agent is the last agent that will notice. So
review is a *separate agent*, always.

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

1. **AI voice.** The banned-constructions table (style guide §2 and quests 60
   §45e.1). Tricolons in system text, "the very", stranded prepositions
   reaching for weight, trailing ellipses for mood, "It is said that…",
   telling the player their feelings. **The reviewer adds new rows on sight** —
   the table is meant to grow.
2. **House rules.** British spelling, punctuation, capitalisation of in-world
   terms, honorifics, numbers, name forms (style guide §1).
3. **Register match.** Does the line sound like *this culture and this
   character*, per style guide §4 and the character's voice sheet (quests 60
   §46b)? A line that would work equally well in another mouth has failed.
4. **Convergence** (batch pass). Read the phase's dialogue with the speaker IDs
   hidden. If you cannot sort the lines by culture, the phase has one voice.
5. **Newcomer comprehension.** No line assumes Elder Scrolls knowledge the
   quest has not taught (quests 60 §45d). Every load-bearing proper noun the
   line uses has a topic.
6. **Duplication of substance.** Two NPCs delivering the same exposition — the
   catalogue's duplicate-text test catches identical strings, not the same
   paragraph rewritten twice. That is a human-judgement check.
7. **Catalogue hygiene.** ID shape and area sensible, `surface` correct
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

- **A whole culture's register is wrong** → not a review fix. Raise it to the
  owner with two or three sample lines; the culture rows in style guide §4 are
  load-bearing and changing one retunes everything written in it.
- **A rule and a good line conflict** → the line probably wins; record the
  exception in the style guide as an explicit carve-out rather than quietly
  breaking the rule. Silent exceptions are how a rulebook dies.
