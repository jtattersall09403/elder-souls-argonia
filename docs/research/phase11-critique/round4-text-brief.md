# Round 4 text brief — kill the lazy generalisation (2026-09-04)

Wave B of round 4, after [round4-region-brief.md](round4-region-brief.md)
has landed on the region. One reviewer per region file; also the region's
quest rows. Owner finding: across the whole body of text — places, quest
index, anywhere we wrote game text — *the only*, *the one*, *nobody / no
one*, *anyone / everyone*, *nothing / everything*, *always / never* are
massively overused, and they are lazy: "everyone changes here" (who?
travellers from Archon to Morrowind change boats here); "ask anyone about X"
(ask the ferry-holder; ask at the Reed office; ask around the fish market);
"the only place the pilgrim road can cross" (where the pilgrim road crosses);
"everything going inland is unloaded" (goods going inland are unloaded). The
generalisation is what makes places read the same. **Tie each beat to the
place**: a role, a named NPC from `docs/quests/36-cast-roster.md` or the
record's `occupants`/`contents`, a number, a direction, the actual goods, the
actual neighbour. And **vary the fix** — if every "the only" becomes "where",
"where" is the new tic.

Read first, and only: `docs/text/style-guide.md` §1, §2.4–2.7;
`docs/quests/60-writing-and-lore.md` §45e.1 (banned table);
`docs/text/review-process.md` §3; your region's rows in
`docs/text/culture-registers.md`.

## Method

1. `cd tooling/world-generation && python3 -m worldgen.lint_prose --region <region> --report - --json /tmp/lint-<region>.json`.
   Fix every hard hit (`generaliser-heavy` = more than two generalisers in one
   record; `ask-anyone`; anything else). Then read every `generaliser` soft
   hit and rewrite most of them: the target is a region density **≤ 4 per
   1,000 words** (the report prints it; you start at 8–13) and **no record
   with more than two**. Keep the ones that are a plain fact ("nothing grows
   on the salt flat" can stay if it is true and the record has no other).
2. Same pass over your region's quest rows: `world/sources/quests/local-<region>.json`
   titles and premises (`python3 -m worldgen.lint_prose --no-catalogue --quests --report -`
   shows all packets; only edit your region's file), and every
   `questHooks.opportunity` on your region's places.
3. Keep every other rule from round 3 (no comma-and, no flat and-pair, no
   *and* for *but*, no `the only` twice, hook ≠ siteAdvantages) — the strict
   run must stay at zero hard hits: `python3 -m worldgen.lint_prose --region <region> --strict --report -`.
4. Facts do not change; localise with what the record and the cast roster
   already say. If you need a name that does not exist, use a role.
5. `python3 -m worldgen.catalogue --check` must print OK.

## Report (≤12 lines)

Region generaliser density before → after; records touched; five
before→after examples showing five *different* kinds of fix; quest rows
touched; anything you could not localise without inventing a fact.
