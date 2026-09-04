# The style guide (binding)

> Read before writing any player-visible text. Speaker registers — the layered
> race + upbringing + region + faction model — are in
> [culture-registers.md](culture-registers.md); review in
> [review-process.md](review-process.md). Router: [README](README.md).

Every "Morrowind does X" below is evidenced by a quoted line and its UESP page
name. Where we deliberately *depart* from Morrowind, it says so and why.

---

## 1. House rules

### 1.1 Spelling — **British** (owner ruling 2026-09-03)

Morrowind's own text is **American**: across ~50 UESP dialogue and book pages,
*armor* 75 / *armour* 0, *honor* 30 / *honour* 0, *learned* 12 / *learnt* 0,
*reorganized* not *-ised* (**Lore:A Short History of Morrowind**). UESP even
marks a British spelling in game text as an error —
`{{sic|defence|defense|description=British spelling}}` in **Lore:Brief History
of the Empire v 1**. The one survivor is *judgement*, which appears with the -e-
("I am ready to give you my judgement." — **Morrowind:Nibani Maesa**).

We nonetheless write **British English**, because Morrowind's American spelling
is an artefact of who published it, not a flavour anyone perceives as
Morrowind-ness — no player remembers the game as American-spelled — and because
every doc in this repo is already British. *Armour, colour, defence, realise,
grey, practise* (verb) / *practice* (noun), *-t* past forms where natural
(*learnt*, *spelt*).

**Confirmed by the owner 2026-09-03** (decision 0043 §Open). It remains
also the cheapest to reverse: the text catalogue is one keyed table.

### 1.2 Punctuation

| Thing | Rule | Note |
|---|---|---|
| Em dash | do not use | Do not use em dashes, they are a classic AI signifier|
| Ellipsis | `…` (single character), sparingly | Morrowind uses `...` and even `....` for a trailing pause ("Let me think.... Yes." — **Morrowind:Gothren**). Keep the *use* — hesitation, evasion, a Telvanni thinking — and drop the four-dot form. **Never for mood** (quests 60 §45e.1). |
| Emphasis | **ALL CAPS on one word**, rarely | Morrowind's consistent convention across every register: "That's ALL that's free" (**Morrowind:Arrille**), "do NOT deliver them" (**Morrowind:Odral Helvi**), "he is VERY upset" (**Morrowind:Crassius Curio**). No italics in dialogue. Once per scene at most. |
| Quoted titles and speech inside a line | **single quotes** | "get Caius a copy of 'Progress of Truth'" (**Morrowind:Mehra Milo**). |
| Stage/system cues | `[square brackets]` | "[Chuckle.] Sorry." (**Morrowind:Aryon**); "[This path to your destiny is blocked.]" (**Morrowind:Caius Cosades**). Also editorial gloss in books: "[represented by the Heirographa -- the 'priestly writings']" (**Lore:Progress of Truth**). |
| Exclamation marks | one per scene, must be earned | Divayth Fyr may have four in a row; nobody else gets one. |
| Semicolons | books yes, dialogue almost never | The clearest single dialogue/prose divider Morrowind has. |
| Oxford comma | leave it out unless it is needed to clear up confusion | British English convention |
| Constructions with a comma followed by 'and' | Avoid. Phrase differently. | British English convention. e.g. don't write constructions like e.g. "this name is important, and nobody will tell you why", or "the answer is wrong, and it changes the picture in an interesting way" |

### 1.3 Capitalisation of in-world terms

Follow Morrowind's split exactly — it is what makes lore feel *lived in* rather
than *announced*.

- **Capitalised** — institutions, offices, prophecies, unique places and
  hyphenated coinages: House Redoran, Great House, the Tribunal, the Temple,
  the Empire, Imperial Legion, the Blades, Camonna Tong, Sixth House,
  Ashlanders, Clanfriend, Hortator, Nerevarine, Red Mountain, Ghostfence,
  Seven Graces, House of Troubles, Curse-of-Flesh.
- **lowercase** — creatures, materials, goods, foodstuffs, generic
  architecture, diseases: guar, netch, scrib, silt strider, ebony, moon sugar,
  skooma, drakes, yurt, foyada, canton, corprus, blight.
- **Native titles lowercase when generic, capitalised with a name**: "their
  ashkhan" but "Ashkhan Ulath-Pal" (**Morrowind:Nibani Maesa** has both).

**Our terms, ruled by the same test.** Capitalised: the Hist (and *a Hist*, *the
Hist* — capital as a species-proper), Sithis, the An-Xileel, the Veiled Reed,
the Root of Accord, the Owing, Shadowscales, Nisswo, Chukka-Sei, the Scalded
Throne, Duskfall, the Eye of Argonia. Lowercase: sap, hist-sap resin, xanmeer
(a building type — capitalised only in a specific ruin's name), rootworm,
lukiul, ojel, jel (the language is **Jel**, capitalised; the loanwords are not),
naheesh, wattle, trodh, deep-stick.

Rule of thumb: **if a hundred of them exist, it is lowercase.**

### 1.4 Numbers, dates, currency

- Spell out one to ten in prose; numerals above, and always for coin, distance,
  counts of things the player must track.
- Currency: **"drakes" colloquially in a mouth, "gold" mechanically in system
  text** — Morrowind's own split ("Here's 200 drakes." — **Morrowind:Caius
  Cosades**).
- Dates in-world use the canon calendar (lore: topics/sky-moons-calendar.md);
  system text does not print dates at all.

### 1.5 Names

Argonian name forms and their politics are **quests/35-cast.md §54** — the five
forms, the ≤⅓ Verb-the-Noun cap, the no-repeated-imagery rule. Do not restate
them; obey them. Canon shape, for reference:

- **Jel**: two hyphenated elements — Im-Kilaya, Haj-Ei, Am-Ali, Deem-Ra
  (**Lore:Argonian Names**).
- **Tamrielic**: a hyphenated verb phrase, often a literal translation of the
  Jel — "an Argonian named 'Haj-Ei' may take on the Tamrielic name 'Hides His
  Eyes'" (**Lore:Argonian Names**). Also: "most Argonians do not, as a rule,
  have family names."
- **Khajiit**: apostrophised prefixes — Ra'Virr, M'Aiq — or epithet-first
  (Sugar-Lips Habasi).
- **Imperial**: Latinate — Larrius Varro, Crassius Curio, Processus Vitellius.
- **Dunmer**: two- or three-syllable given + house name — Bolvyn Venim, Divayth
  Fyr, Odral Helvi.

**Place names** follow the per-region naming register in
[world/sources/catalogue/README.md](../../world/sources/catalogue/README.md).
A character's speech and their region's place names must sound like the same
world: do not write a "Bundle Racks" pirate speaking in the Hist heartland's
definite-article abstractions.

### 1.6 What we never do

- **No phonetic accent spelling.** No dropped h's, no "ye olde", no
  apostrophised dialect. Morrowind marks every race and class by *syntax and
  address terms only* — the sole systematic grammatical marker in the whole game
  is Khajiit illeism. This is the single most important negative rule here.
- **No modern idiom in a mouth that could not hold it** — "okay", "issue"
  (meaning problem), "reach out", "impact" as a verb, "process" as a noun.
- **No em-dash-and-gravitas syntax.** See §2.

---

## 2. The voice

The owner's directive (quests 60 §45e): **TES prose is plainer than people
remember.** Short declaratives. Concrete nouns. Archaism carried by *vocabulary
and idiom*, not by twisted syntax. When a line feels portentous, cut it in half;
what remains is usually the line.

The **banned-constructions table lives in [quests/60
§45e.1](../quests/60-writing-and-lore.md)** — it is the enforcement surface and
it grows. Read it. Do not copy it here.

### 2.1 The five things Morrowind's dialogue actually does

1. **The NPC simply knows.** Informational replies are confident, unattributed
   and complete. No hedging frame, no "well, I suppose you could say".
   > "We're spies. We're the Emperor's hidden eyes and ears in the provinces. We
   > watch the Emperor's enemies. We look for opportunities. We make reports."
   > — **Morrowind:Caius Cosades**

2. **One paragraph, one topic, one hook.** Every answer is self-contained and
   names at least one new proper noun the player can chase.
   > "Moonmoth Fort is the Imperial Legion garrison southeast of Balmora… Radd
   > Hard-Heart is the Knight in charge." — **Morrowind:Caius Cosades**

   This is the mechanism behind our newcomer-topic obligation (quests 60 §45d):
   the topic system *is* the teaching instrument. Answer, then hand over the
   next word.

3. **Directions are landmark prose**, never coordinates, and are repeated in
   the journal so navigation survives without a marker.
   > "Follow the coast east from Urshilaku camp to the ruined Dunmer stronghold
   > called Valenvaryon, then turn southwest… It is a bad place. Go prepared."
   > — **Morrowind:Sul-Matuul**

4. **Authority is written as procedure, and menace as hospitality.** The two
   most effective registers in the game are both understated. Gothren refuses
   by scheduling; Dagoth Gares threatens by welcoming.
   > "Your story makes sense. Your proofs are persuasive.... But a decision on
   > such a remarkable matter is a grave responsibility, and not to be taken in
   > haste." — **Morrowind:Gothren**
   > "The Sixth House was not dead, but only sleeping. Now it wakes from its
   > long dream…" — **Morrowind:Dagoth Gares**

5. **Vocabulary does the politics.** One word carries an entire relationship:
   Ordinators say *citizen* to the compliant and *outlander* to the suspect
   (**Morrowind:Ordinator**); *n'wah*, glossed in-game as "'foreigner' or
   'slave'" (**Morrowind:Hassour Zainsubani**); *Clanfriend* as a status
   conferred by a sentence. Build our equivalents the same way — *ojel*,
   *lukiul*, *the Owing*, *dryskin* — and **gloss them in a mouth**, as
   Morrowind does, never in a tooltip.

### 2.2 Dry wit is structural, not decorative

Morrowind is much funnier than its reputation, and the jokes are load-bearing —
they characterise the speaker in one clause.

> "You want a little advice? That's free. That's ALL that's free."
> — **Morrowind:Arrille**
> "Deader than a garlic snail." — **Morrowind:Divayth Fyr**
> "I'm just an old man with a skooma problem." — **Morrowind:Caius Cosades**
> "I'd rather make a monkey Hortator." — **Morrowind:Bolvyn Venim**
> (Background) "I am an Ordinator." — **Morrowind:Ordinator**

The Dunmer/Daedric insult idiom is **animal-based and specific**: "one born from
the wrong end of a guar" (**Morrowind:Anhaedra**), "gobbles sugar like scuttle"
(**Morrowind:Caius Cosades**). Ours are marsh-based and canon: "Hist piss!",
"dryskin fools and withered roots" (lore: topics/material-culture.md).

Per quests 35-cast §58 and 60 §46b: comic characters carry real information, and
at least two oddities per region must be genuinely funny.

### 2.3 Books are not dialogue

| | Dialogue | Documents |
|---|---|---|
| Syntax | main clauses, few subordinates | subordination, semicolons, bracketed gloss |
| Attribution | confident, unattributed | **authored and biased** — a Temple text and a Dissident text contradict, and the game never adjudicates |
| Archaism | almost none | *thy*, *anon*, *bade* permitted |
| Range | narrow | very wide — administrative parody to mythopoeia |

Evidence for the range, which is the point: scholarly (**Lore:A Short History of
Morrowind**), polemical (**Lore:Progress of Truth**), devotional with
parallelism and archaism ("Engrave upon thy eye the image of injustice." —
**Lore:Saryoni's Sermons**), guidebook-and-parable in one (**Lore:The Pilgrim's
Path**), bawdy playscript (**Lore:The Lusty Argonian Maid**), free verse
(**Lore:Words of the Wind**), bureaucratic parody ("…completely free of spooks,
boojums, snarks, spectral goats, revenant toiletries, or cannibal vampire
anchovies" — **Morrowind:Ghost-Free Papers**), and outright surrealism
("the Barons of Move Like This" — **Lore:36 Lessons of Vivec**).

**Rules for us.** Every document has an author with a motive, named or
inferable. Documents may be wrong. At least one document per region should be
mundane (a ledger, a repair list, a complaint) and at least one funny — a
province of nothing but grave scripture is a failure of nerve, and Morrowind
never made it.

Doctrinal formulas are cheap and enormously effective: the Temple's mandatory
parenthetical "(Blessed Be Their Holy Names)" (**Lore:The Anticipations**),
"Three Gods, One True Faith" (**Morrowind:Ordinator**). Give the Nisswo and the
An-Xileel one each and use them consistently.

### 2.4 "But" is allowed, and is often the better word

**Owner ruling 2026-09-04.** Our text almost never used *but*. Model prose
avoids it and joins contrasting clauses with *and*, which is where the
distinctively synthetic beat comes from — *"The bridge is new and no one uses
it."* Write *but*. It is plain English and Morrowind is full of it: *"Your
proofs are persuasive.... But a decision on such a remarkable matter is a grave
responsibility"* (**Morrowind:Gothren**); *"The Sixth House was not dead, but
only sleeping"* (**Morrowind:Dagoth Gares**).

The test, for writers and reviewers alike: **for every *and* joining two
clauses, ask whether the second clause contradicts, undercuts or surprises the
first.** If it does, it is *but* — or the clause should be cut entirely. What
it must never become is the balanced antithesis pair, *"the one thing everyone
knows and nobody will talk about"*: that closer is banned whichever conjunction
it uses (quests 60 §45e.1).

### 2.5 Sounding human, not machine — the qualitative checks

The banned-constructions table catches phrases. These catch the *shape*, and
they are what a reviewer judges by eye. Evidence and worked examples:
[docs/research/ai-writing-tells.md](../research/ai-writing-tells.md).

- **Not every paragraph ends on a resonant line.** Most records should end on a
  plain fact. Aphoristic closers are the loudest structural tell we have.
- **Write flat sentences on purpose.** Prose where every clause is doing work
  reads as machine-made. The dull sentences carry the interesting ones.
- **Uneven rhythm.** Let one sentence be four words and the next twenty-five.
  Uniform sentence length is a fingerprint.
- **Specifics over grandeur.** A number, a name, an object. "The fort's
  enduring presence" is nothing; "forty men, half of them local" is something.
- **Leave things ragged.** An unglossed image, an unresolved contradiction, a
  thought that stops. Too tidy and too balanced are both failures.
- **Vary the shape between records, not just the words.** Forty places built as
  fact-image-closer is one voice however different the nouns are.

The five tests a reviewer runs against these (read aloud; the Morrowind test;
the flourish count; the and/but test; delete-the-last-clause) are in
[review-process.md §3](review-process.md).

### 2.6 The flat and-pair — diagnosis (owner finding 2026-09-04)

The owner's three examples, all from one place's panel:

> Trial-keepers set the route each year **and will not explain it.**
> What makes the route a trial lives in the water **and is never removed.**
> The trial kills someone every few years **and the tribes have decided that is correct.**

The shape: a plain factual clause, *and*, then a second clause that does not
add a fact but delivers the writer's *attitude* to the first — a deadpan shrug,
a wry turn, a quiet horror. Grammatically it is coordination; rhetorically it is
a punchline. Morrowind does this perhaps once a book (*"The Sixth House was not
dead, but only sleeping"* is the nearest, and it uses *but*). Model prose does it
once a sentence, because it is the cheapest way to make a flat fact feel
written. Three in one record is not wit, it is a voice, and every place gets it.

What it is not: two real facts joined by *and* ("The ferry runs at dawn and the
toll is two drakes"). That is fine. The test is **does the second clause
contain a new noun?** If it contains only a verb of refusal, absence or
judgement (*will not explain, is never removed, have decided that is correct,
nobody tends, has not been renewed*), it is the flat and-pair.

The fix is one of three, chosen by what the sentence is for:

1. **Cut the second clause.** "Trial-keepers set the route each year." The
   refusal to explain was the writer's flourish; the reader assumes it.
2. **Make it a sentence of its own with a person in it.** "The keepers set the
   route each year. Ask one why and she will tell you to swim it."
3. **Turn it into a fact.** "The trial kills someone every few years. The last
   was a Bright-Throat boy, in the dry season two years ago."

Frequency rule: at most **one** flat and-pair per record, and never in the
`hook`. The linter counts them as `and-closer` (a heuristic, so it over-reports;
that is deliberate — read every hit).

### 2.8 Trying too hard — the punchiness class (owner ruling 2026-09-04)

The owner's third list named one fault under many guises, and it is the
general class the rows in §2.4–2.6 are instances of: **the writing tries to
land a line.** It reaches for a zinger, a portentous closer, a deadpan turn,
a clever repetition, a pithy compound. One of these in a whole region might
be wit. At the density model prose produces them, every place sounds like a
trailer, and a player who reads hundreds of these panels in an evening
recognises the machine in the first ten. The owner's examples, all live at
the time:

| Written | Fault | Plain rewrite |
|---|---|---|
| "Goods off the road are weighed, counted and written down here. So are you." | the tag-line turn on the reader | "Goods off the road are weighed, counted and written down here. Travellers are entered in the same book." |
| "Four villages downstream have set their year by a machine no living engineer can read." | the portentous closer; a fact dressed as a verdict | "Four villages downstream set their planting by the machine's cycle. The engineers who built it left no account of how it works." |
| "The pace-count is a song people learn before they go in." | the epigram; the record ends on an image instead of a fact | "Guides count paces through the throat aloud. The count is taught as a chant so it is not lost in the dark." |
| "Porters, transfer clerks and hauliers whose entire livelihood is that the falls exist." | the pithy predicate ("is that the falls exist") | "Porters, transfer clerks and hauliers, who depend on the falls for their livelihoods." |
| "Rectavius is still sealed below and the seal is two centuries older than the Nisswo tending it." | the clumsy and-pair; two facts squeezed into one clever sentence | "Rectavius is still sealed below. The seal is two centuries older than the Nisswo who tends it." |
| "The tree named in interior recitation as the tree that stood at the first rain after the Duskfall." | deliberate repetition for effect | "Named in interior recitation as the tree that stood at the first rain after the Duskfall." |
| "The north-eastern river is navigable to exactly one point." | *exactly one*: precision as emphasis | "The north-eastern river is navigable to this point." |
| "Four channel mouths open off the same bay; only one carries water at the top of the tide." | *only one*: uniqueness as emphasis | "Four channel mouths open off the same bay. This one carries water at the top of the tide." |
| "The pilots who know the run sell the knowledge; none of it is written down." | *none of it*: the absolute-negative tag | "The pilots who know the run sell the knowledge." |

The diagnosis in one line: **the sentence is doing more than stating its
fact.** The rules that follow from it:

1. **Let the text breathe.** Two plain sentences beat one clever one. Do not
   compress two facts into a single pithy line for effect; write the second
   sentence. Length is not the problem, compression for impact is.
2. **No sentence turns on the reader** ("So are you." "You will be next.").
   No sentence is written to be quoted.
3. **A record ends on a fact**, ideally a dull one. If the last sentence
   could be a film tag-line, delete it or replace it with the next fact.
4. **Precision-as-emphasis is banned as a beat**: *exactly one, exactly four,
   only one, one and only, none of it, none of them, not one*. State the
   number plainly if the number matters ("four expeditions"; "this channel")
   and otherwise leave it out. The linter counts these with the generaliser
   class and fails on *exactly N* and *only one* outright.
5. **No repetition for effect.** A noun repeated inside one sentence
   ("the tree named … as the tree that …"), anaphora across sentences, or the
   same word closing consecutive sentences, is a device. Say it once.
6. **No sentence or clause ends on a preposition.** "the river Red Bramman
   escaped through" becomes "the river through which Red Bramman escaped";
   "dry enough to stack on" becomes "dry enough for stacking". This is a
   house grammar rule applied to every surface including dialogue (an
   Argonian and a Nord both manage it). The linter fails on it. Phrasal-verb
   particles (*came down, went out, set off*) are not prepositions and are
   not caught.
7. **Metaphor budget: one per record, and it must be a marsh thing** someone
   in the place could have said. No abstract metaphors (a machine "setting the
   year", a count that "is a song").

**Register for place records (owner steer 2026-09-04, adopted).** The
catalogue's prose fields (`why.*`, `vibe.*`, `playerPurpose.hook`, quest-row
premises, siting notes) are written in **reference register**: the voice of a
UESP place page. Third person, present tense for the current state and past
for history, concrete nouns, numbers where they are known, no rhetorical
device, no address to the reader, no closer. The test is whether the
paragraph could be pasted into a wiki article about the place without an
editor flagging tone. This is deliberately flatter than the dialogue voice in
§2.1–2.2, which keeps its wit and its speakers; the two must not bleed into
each other. `vibe.mood` and `vibe.condition` are labels, not lines: one or
two plain words, or a plain fact.

The **reviewer's test for the class** is in [review-process.md
§3](review-process.md): read the record's last sentence alone, and read every
sentence asking "what is this sentence doing besides stating its fact?" Any
answer other than "nothing" is a finding.

### 2.7 Seed from real Morrowind text (owner proposal 2026-09-04)

Before writing or rewriting a place, find the nearest Morrowind analogue and read
its actual text first — a cave, tomb, stronghold, Ashlander camp, Velothi tower,
Imperial fort, Dwemer ruin, egg mine, shipwreck, a town's local rumours. Use the
vault extract (`../elder-scrolls-asset-pipeline/skyrim-source/mod-sources/lore/uesp_morrowind_blackmarsh_extract.jsonl.xz`, next to this repo)
or the UESP API; the page's own "Description" paragraph and one or two dialogue
topics are enough. Then write ours. The point is not to copy a sentence; it is
that the model's register drifts toward its own defaults over a long file, and
two paragraphs of the real thing pull it back. The region text passes of
2026-09-04 did this per place *type*, keeping a short seed table
(type → UESP page → the two lines used) in the region's report so the next
writer can reuse it.

---

## 3. The six surfaces

`TextSurface` in `packages/text-catalogue` determines which rules apply. Getting
the surface right is not bookkeeping — it selects the register.

### `dialogue`
§2 above, plus the character's voice sheet (quests 60 §46b) and the speaker's
four register layers ([culture-registers.md](culture-registers.md) §0). Contractions are normal.
Fixed slots keep Morrowind's shapes:
- **greeting** — trade or office, stated: "Nine-Toes is my name, Hunter is my
  trade." (**Morrowind:Nine-Toes**). Terse self-identification.
- **advice** — imperative and practical, aimed at a newcomer
  (**Morrowind:Arrille**).
- **rumour** — *the only systematically unreliable register in the game*.
  First-person, hedged, colloquial: "Well, I don't know if anyone else has seen
  him, but I saw some crazy guy…" (**Morrowind:Ashumanu Eraishah**). Rumours
  may be wrong, and some must be.

### `document`
§2.3.

### `journal`
**First person, past tense for events, "I'm to…" / "I must…" / "Now I'll…" for
the outstanding objective.** Full names and place names spelled out **every
entry** — the journal is the quest log *and* the search index. Directions
restated in landmark prose. Failure states get their own flat entry with the
consequence attached.

> "The Spymaster has sent me to talk to Hasphat Antabolis at the Balmora
> Fighters Guild. I'm to ask him what he knows about the Nerevarine secret cult
> … and return to report to the Spymaster." — **Morrowind:Antabolis Informant**
> "I have slain an Urshilaku Ashlander. This will make my mission to speak with
> Sul-Matuul and Nibani Maesa more difficult." — **Morrowind:Meet Sul-Matuul**

Deliberate redundancy: entries re-summarise the chain rather than incrementing.
Keep that — a player returning after a month reads one entry, not eight.

### `system`
**The place AI voice hides best**, because no character anchors the register.
Rules, absolute:
- State the **cause**, never the feeling. "You are carrying too much to move." —
  not "you feel weighed down".
- **Shortest form that is actionable.** "You have died." Two words.
- **No tricolons. No imagery** — with rare, deliberate exceptions carrying a
  recorded note (`text.system.rest-saved` is the one).
- Name the alternative when there is one: "You need a bed to rest here. Wait, or
  pay for a room."
- Where Morrowind's own phrasing exists and works, **use it and do not improve
  it** ("You cannot rest with enemies nearby.").

### `descriptive`
Item, place and creature descriptions. Concrete, material, one fact the player
could not see. No adjective stacking, no atmosphere. If it is a marsh thing,
someone made it out of something — say what.

### `ui`
Plain modern English. Buttons and labels are not in character; a menu that
speaks Dunmeris is a menu nobody can use. This is the one surface where our
voice rules deliberately stop.

---

## 4. Before you commit

0. **Run the linter** — `python3 -m worldgen.lint_prose --strict` over the
   catalogue, or `--no-catalogue --md <your file>` for a doc. Zero hard hits is
   the floor; the density table is what to read next.


1. Every string is in `packages/text-catalogue`, keyed, with `surface`,
   `speaker` and a `note` saying who is talking to whom and why.
2. Read your lines back with the speaker hidden. If they could belong to a
   different **race** or a different **region**, they belong to none
   ([culture-registers.md](culture-registers.md) §0 — voice = race +
   upbringing + region + faction).
3. Run the review pass ([review-process.md](review-process.md)) — a *different*
   agent, via the `text-review` skill (`.claude/skills/text-review/SKILL.md`).
   A writer will not catch its own register.
