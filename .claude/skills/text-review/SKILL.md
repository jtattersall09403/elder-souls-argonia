---
name: text-review
description: Review and rewrite player-visible or world-record prose (place catalogue records, quest rows, text-catalogue strings, dialogue, docs) against the binding style guide and the AI-tell bans. Run it in a SEPARATE agent from the one that wrote the text, before commit. Use whenever text was added or edited, or the owner reports text that "sounds like AI".
---

# Text review

You are the reviewer, not the writer. A writer cannot hear its own register
(docs/text/review-process.md). Your output is **edits applied to the files**,
plus a short report; never a critique without the replacement.

## 1. Read (once, in this order)

1. `docs/text/style-guide.md` §1.2 (punctuation), §2.4–2.8 (the voice rules:
   *but*, flat and-pair, seed from Morrowind, **trying too hard**, the
   reference register for place records).
2. `docs/quests/60-writing-and-lore.md` §45e.1 — the banned-constructions
   table. Add a row when you find a new tell.
3. `docs/text/review-process.md` §3 — the checklist and the reading tests.

Do not read anything else unless a finding needs it (culture registers for a
dialogue line's speaker; a lore dossier when a fact looks wrong).

## 2. Run the linter first

From `tooling/world-generation`:

```
python3 -m worldgen.lint_prose --region <zone> --json /tmp/lint-<zone>.json   # one catalogue region
python3 -m worldgen.lint_prose --no-catalogue --md <file.md>                    # a markdown file
python3 -m worldgen.lint_prose --strict                                          # whole body (places, quests, strings, blueprints), the npm-test gate
```

Fix every **hard** hit. Use the soft candidates (`and-closer`, `and-for-but`,
`the-only`, `will-not-say`, `none-of`, `zinger-tail`, `generaliser`) as the
reading order for step 3.

## 3. Read every record, not just the hits

The linter catches phrases. The fault the owner keeps finding is the
**shape**: a sentence written to land. For each sentence ask *"what is this
doing besides stating its fact?"* Any answer is a finding. Then read the
record's last sentence alone: if it could be a tag-line, replace it with a
fact. Style guide §2.8 has nine worked examples with the plain rewrite.

The fixes, in order of preference: split into two plain sentences; cut the
flourish clause; replace the device with a number, a name, an object or a
direction. Never add a new device to replace an old one. Place-record fields
(`why.*`, `vibe.*`, `playerPurpose.hook`, quest premises) and blueprint prose
(`causalModel`, every `orientationWhy`, `notes`, siting reasons) are **reference
register** (a wiki page about the place): third person, no address to the
reader, no closer, one marsh metaphor at most. Dialogue keeps its speaker's
voice (§2.1, culture registers) but obeys every ban and the preposition rule.

House grammar that applies to every surface: British spelling; no em dashes;
no Oxford comma; no comma-and; **no sentence or clause ending on a
preposition** (recast: "the river through which he escaped").

## 4. Do not

- Change facts, lore, what a character knows, or the typed fields (kits,
  danger tiers, sockets, relations, positions). If a fact looks wrong, note it
  in the report for the writer or the owner.
- Trade one tell for another (a colon-reveal for an and-pair; "this one" for
  "the only" in every record). Vary the fix across the set.
- Flatten dialogue into wiki voice.

## 5. Finish

1. Re-run the linter on your scope: zero hard hits, no density breach.
2. From the repo root, `npm test` must stay green (the linter is a gate).
3. Report: counts (records read, records edited, hard hits before/after), the
   three worst before/after pairs, any new banned-table row you added, and any
   fact-level doubts. Commit only the files in your scope, by pathspec.
