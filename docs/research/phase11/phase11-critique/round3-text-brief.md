# Round 3 text brief — the third pass, with the linter and Morrowind seeds (2026-09-04)

Wave 2 of round 3 (after [round3-region-brief.md](round3-region-brief.md) has
landed on the region). One reviewer per region file; you are not the writer
of the structural pass. Owner findings from the second pass that this pass
must close: the comma-and join is "still very prevalent"; "has never once" is
a tell; "the only" / "the one thing" and "never / nobody ever" are massively
overused; *and* still stands where *but* is natural ("a millennium older than
the Imperial work below and visibly better"); and the **flat and-pair** ("set
the route each year and will not explain it") is used far too much.

Read first, and only: `docs/text/style-guide.md` §1, §2.4–2.7 (2.6 is the
diagnosis of the and-pair; 2.7 the seeding procedure); the banned table in
`docs/quests/60-writing-and-lore.md` §45e.1; `docs/text/review-process.md` §3;
your region's rows in `docs/text/culture-registers.md`; the region's naming
register in `world/sources/catalogue/README.md`.

## Method

1. `cd tooling/world-generation && python3 -m worldgen.lint_prose --region <region>`.
   Fix every **hard** hit first (the report lists record, field, rule, excerpt).
   Then read every **soft** candidate (`and-closer`, `and-for-but`, `the-only`,
   `will-not-say`, `never`) and decide by the style-guide tests; most and-pairs
   go, most *and*-for-*but* become *but* or two sentences.
2. **Seed from Morrowind** (style guide §2.7): for each place TYPE you rewrite
   (cave, tomb-analogue, stronghold, camp, fort, ruin, mine, wreck, village,
   shrine…), pull one short Morrowind text for the nearest analogue from the
   vault extract (`../elder-scrolls-asset-pipeline/skyrim-source/mod-sources/lore/uesp_morrowind_blackmarsh_extract.jsonl.xz`, a sibling of this repo
   — `xzcat | grep -i` on the page title is fine here, it is a text corpus)
   or the UESP API (`en.uesp.net/w/api.php`, project user-agent). Read it,
   then write ours. Keep a seed table in your report (type → page → two
   lines), ≤12 rows.
3. Then the qualitative pass over every live record in the region (all
   prose fields of the text-review brief: `why.*`, `vibe.*`, `hook`,
   `occupants[]`, `contents.*.note/provenance`, `localStateVariants`,
   `questHooks.opportunity`), with the five tests of review-process §3 and
   the frequency rule: at most one flat and-pair per record, never in the
   hook; *the only* at most once per record and only as a plain fact.
4. Facts do not change. If a sentence's fact contradicts the record's typed
   fields (stance, interior, contents, plotFacts), list it for the lead —
   unless it is a plain prose slip, in which case fix the prose to the field.
5. `python3 -m worldgen.lint_prose --region <region> --strict` must exit 0;
   `python3 -m worldgen.catalogue --check` must print OK.

## Report (≤15 lines)

Records touched / fields rewritten by class (comma-and, and-pair, and-for-but,
the-only/never, other tells, register); three before→after examples; the seed
table; fact conflicts left for the lead; new tells worth a banned-table row.
