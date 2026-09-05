# What readers notice as "AI-written" — tells, and the plain fix

Commissioned by the owner 2026-09-04 after two observations on the Phase 11
place catalogue: (a) our prose almost never uses **but**, and (b) paragraphs
kept ending on balanced antithesis — *"this is the one thing everyone knows and
nobody will talk about."* Both read as machine voice.

This doc is the evidence. The **rules** derived from it are binding elsewhere:
banned rows in [quests/60 §45e.1](../../quests/60-writing-and-lore.md), the voice
rules in [text/style-guide.md §2.4](../../text/style-guide.md), the reviewer's
checks in [text/review-process.md §3](../../text/review-process.md).

Sources are at the bottom. Caveat carried from nearly every source: **no single
tell proves anything.** These are legitimate English constructions. What marks
machine prose is *density and uniformity* — the same three moves in every
paragraph. Banning words mechanically produces its own stilted register, so
every row below is a "check", not a lint.

## 1. Lexical tells

| Tell | Example | Fix |
|---|---|---|
| Register vocabulary: *delve, tapestry, testament, realm, intricate, interplay, underscore, pivotal, showcase, meticulous, landscape, foster, harness, navigate* | "a testament to the intricate tapestry of the marsh" | name the thing. Pew measured *delve/testament/interplay* at ~2× post-2022 web frequency |
| *nestled, whispers, echoes, weathered, timeless, ancient* as scene-setting default | "a village nestled where the river whispers" | one concrete noun: "a village on the sandbar" |
| Hedged adverbs: *quietly, faintly, genuinely, slightly, subtly, almost* | "genuinely dangerous", "quietly resented" | plain adjective, or the fact |
| *the very*, *at its core*, *in a world where*, *Here's the thing*, *It's worth noting* | throat-clearing before content | delete; start at the content |
| Grand abstract nouns doing work concrete ones should: *presence, essence, significance, legacy* | "the fort's enduring presence" | what the fort does, to whom |

## 2. Syntactic tells

| Tell | Example | Fix |
|---|---|---|
| **Negative parallelism** — "it's not X, it's Y" / "not just X but Y" | "It isn't a shrine, it's a warning." | say the true half only. Pew: ~3× post-2022 |
| **Sentence-final antithesis pair** — "…everyone knows and nobody will talk about" | balanced clause bolted to a finished sentence | cut the second half |
| **and-that-should-be-but** — contrast welded with *and* because the model avoids *but* | "The bridge is new and no one uses it." | "The bridge is new, but no one uses it." **but is allowed and usually better** |
| Rule of three / tricolon where the third term is filler | "the lost, the drowned, the forgotten" | one noun; keep three only if all three carry facts |
| Colon-reveal sentences | "The garrison has one purpose: fear." | make it a sentence |
| Question immediately answered | "Who guards it? No one." | state it |
| Em dash pairs at high density, and two stock phrases welded by one dash | "worn — but sound —" | comma, or full stop |
| Uniform sentence length across a paragraph | every sentence 12–18 words | vary hard; let one be four words |

## 3. Structural tells

| Tell | Example | Fix |
|---|---|---|
| **Every paragraph ends on a resonant line** | the flourish closer, record after record | most records should end on a plain fact |
| Over-signposting and self-gloss | "…, which is the point" | already banned (§45e.1); the same instinct produces "and that is why it matters" |
| Everything explained; no loose ends | each image immediately interpreted | leave the image unglossed |
| No flat sentences anywhere | every clause is doing work | write deliberately dull sentences; they carry the interesting ones |
| One-sentence paragraph for punch | dropped final line | fold it into the paragraph above |
| Symmetry across a set — every record same shape (fact, image, closer) | 40 places, one template | vary the shape between records, not just the words |

## 4. Qualitative tells (a vibe — needs judgement, not grep)

- **Too tidy.** Nothing is left ragged; no contradiction survives.
- **Too balanced.** Every claim gets its counterweight in the same sentence.
- **Aphoristic closers.** The prose keeps producing epigrams it hasn't earned.
- **Grandeur without specifics.** Weight of tone, no numbers, names or objects.
  The strongest single discriminator in the sources: vagueness, not vocabulary.
- **Emotional labelling.** The text names the feeling instead of the cause.
- **Bland politeness.** No bluntness, no one being unfair, nothing unresolved.

Counter-model — what human prose does, per the same sources and per Morrowind:
uneven rhythm; flat sentences; *but*; concrete nouns; specific numbers and
objects; occasional bluntness; thoughts that stop rather than land.

## 5. How a reviewer checks the qualitative ones

Five cheap tests. Run them on a sample, not on every record.

1. **Read the paragraph aloud.** If it sounds like a trailer voiceover, it fails.
2. **The Morrowind test.** Would a book or an NPC in Morrowind end on that line?
   Morrowind ends on facts and shrugs, not epigrams.
3. **Flourish count.** Per 10 records, count paragraph-final flourishes (any
   closer that is a judgement rather than a fact). More than ~2 in 10 is a
   phase-level convergence finding, not a line edit.
4. **The and/but test.** Search every *and* joining two clauses. If the second
   clause contradicts, undercuts or surprises the first, it should be *but* —
   or the clause should be cut. Report which, per instance.
5. **The delete-the-last-clause test.** Cut the final clause of the paragraph.
   If it reads better, it was a flourish. This is the fastest of the five and
   catches the antithesis pairs, the colon-reveals and the self-gloss at once.

## Sources

- Pew Research via Slashdot, *Is ChatGPT Changing How You're Writing?* — em dashes ~2×, *delve/testament/interplay* ~2×, negative parallelism ~3×: https://slashdot.org/story/26/08/27/2315218/is-chatgpt-changing-how-youre-writing
- Charlie Guo, *The Field Guide to AI Slop*: https://www.ignorance.ai/p/the-field-guide-to-ai-slop
- a16z crypto, *The habits of AI writing — and what to do about them*: https://a16zcrypto.substack.com/p/the-habits-of-ai-writing-and-what
- *How to spot when writing is AI: 6 elements of a robot's style* (Hunting the Muse): https://huntingthemuse.net/library/how-to-tell-if-writing-is-ai
- *What Makes a Story "Look" Like AI Wrote It?*: https://livinghappy.substack.com/p/what-makes-a-story-look-like-ai-wrote
- *Spotting machine-made prose* (Carly): https://carly.substack.com/p/spotting-machine-made-prose
- REM Web Solutions, *Think You Can Spot AI Writing? Here's How Our Editors Do It*: https://www.remwebsolutions.com/blog/identifying-ai-writing
- Faithe J Day, *Move Over Em-Dash, There's a New AI Tell in Town*: https://medium.com/ai-ai-oh/move-over-em-dash-theres-a-new-ai-tell-in-town-c1f53af79515
- AgentPlix, *Stop Claude From Using Its Annoying Verbal Tics* (Claude-specific: "It's not that X, it's that Y", opening affirmations, "it's worth noting", process narration): https://agentplix.com/posts/how-to-stop-claude-from-writing-it-s-not-its/
- Ruben, *Delve* and *Detection* (on the limits of word-banning): https://ruben.substack.com/p/delve , https://ruben.substack.com/p/detection
- TechRadar, *Here's how I write to make sure nobody thinks I'm an AI*: https://www.techradar.com/ai-platforms-assistants/heres-how-i-write-to-make-sure-nobody-thinks-im-an-ai
