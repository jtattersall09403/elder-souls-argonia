# Part 4 step 2 — catalogue text review brief (2026-09-03)

The owner asked for every piece of prose in the place catalogue to be reviewed
against the house style: it should read like Morrowind's own text (book and
dialogue voice per [docs/text/style-guide.md](../../../text/style-guide.md)),
never like model-written prose. This is the 0043 review process applied to
design text: the reviewer is always a different agent from the writer (the
region repair agents wrote; you review), and the reviewer makes **the edit**,
not a critique.

## Read first (and only)

1. `docs/text/style-guide.md` — §1 house rules, §2 the banned constructions
   (and the table it points to in `docs/quests/60-writing-and-lore.md` §45e.1),
   the Morrowind voice section.
2. Your region's row in `docs/text/culture-registers.md` and its naming
   register row in `world/sources/catalogue/README.md`.
3. `docs/text/review-process.md` §3 (what to check, in order).

## Scope — one region file per reviewer

`world/sources/catalogue/places-<region>.json`, **live records only**
(status ≠ deferred/cut). The prose fields, and nothing else:

- `why.founding / siteAdvantages / occupantsMotive / pressures / wouldChangeIf`
- `vibe.silhouette / palette / materials / signatureFeature / condition / mood / approach / senses`
- `playerPurpose.hook` (this one may become player-visible text — hold it to
  the dialogue/journal standard: one plain sentence a person in the world
  could say)
- `occupants[]` strings, `contents.*[].note` / `loot[].provenance`
- `name` only when it breaks the region's naming register (say so in the
  report; renames are rare and must keep the id)

Never touch ids, classification, status, siting, positions, relations,
hostility/interior/contents structure, or another region's file.

## What to fix (in this order)

1. **AI voice** — the banned constructions: rhetorical tricolons, "the very",
   trailing ellipses for mood, "It is said that…", "a testament to", "nestled",
   "whispers of", "echoes of", "a tapestry of", abstract-noun stacks, telling
   the reader what to feel, sentence-final flourishes, semicolon chains used
   for weight, "not X but Y" antithesis as a tic. Replace with the plain
   Morrowind sentence: concrete noun, a verb, one fact.
2. **House rules** — British spelling; `—` not ` -- `; capitalisation by the
   hundred-of-them test (House Dres / guar); numbers; name forms.
3. **Register** — the region's register (Argonian settlement-root idiom,
   sailor's shorthand, Imperial administrative, Velothi, trade exonyms…). A
   sentence that could sit in any other region's file has failed; give it the
   region's nouns and cadence.
4. **Length and substance** — each `why.*` field is one or two sentences; a
   field that restates another field is cut to what is new; a `hook` that
   repeats `siteAdvantages` is rewritten as what the player gets.
5. **Newcomer comprehension** — no undefined jargon in a hook.

Do not change facts (what a place is, who is there, what it pays) — if a
fact is wrong, leave the sentence and list it in the report for the lead.

## Mechanics

- Edit the JSON through `worldgen.catalogue.dump_json` (from
  `tooling/world-generation`), keep key order, run
  `python3 -m worldgen.catalogue --check` (must print OK) before reporting.
- Work through every live record; do not sample.
- Keep a tally: records touched, fields rewritten, by failure class (AI voice /
  house rules / register / length).
- New banned constructions you notice: list them in the report (one line
  each with an example); the lead adds them to the table (one writer, no
  clobbering).

## Report (≤15 lines)

Live records reviewed / touched; fields rewritten by class; three before→after
examples; any fact problems left for the lead; proposed new banned-construction
rows.
